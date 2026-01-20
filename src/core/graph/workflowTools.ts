/**
 * WorkflowTools implementation.
 *
 * Wraps existing tool classes to provide the WorkflowTools interface
 * for LangGraph node functions. Supports event emission for workflow observability.
 */

import type {
	ClaudeConfig,
	ClaudeSdkConfig,
	StepConfig,
} from "../../types/index.ts";
import { ExecutionContext } from "../context/execution.ts";
import {
	createEventHelpers,
	createTimer,
	type EventHelpers,
	type WorkflowEmitter,
} from "../events/index.ts";
import {
	type ExecuteParallelBashOptions,
	type ExecuteParallelClaudeOptions,
	type ExecuteParallelWorkflowsOptions,
	executeParallelBash,
	executeParallelClaude,
	executeParallelWorkflows,
	DEFAULT_WORKFLOW_CONCURRENCY,
} from "../parallel/index.ts";
import type { TmuxManager } from "../tmux/manager.ts";
import { BashTool } from "../tools/bash.ts";
import { ChecklistTool } from "../tools/checklist.ts";
import { ClaudeTool } from "../tools/claude.ts";
import { ClaudeAgentTool } from "../tools/claudeAgent.ts";
import type {
	ClaudeAgentConfig,
	SubagentDefinition,
} from "../tools/claudeAgent.types.ts";
import { resolveModel } from "../tools/claudeAgent.types.ts";
import { ClaudeSdkTool } from "../tools/claudeSdk.ts";
import type {
	AddOptions,
	CommitOptions,
	CreateBranchOptions,
	DeleteBranchOptions,
	DiffOptions,
	GitBranch,
	GitCommit,
	GitConfig,
	GitDiff,
	GitOperations,
	GitRemote,
	GitResult,
	GitStashEntry,
	GitStatus,
	GitWorktree,
	ListBranchesOptions,
	LogOptions,
	ResetOptions,
	StashOptions,
	StashPopOptions,
	SwitchBranchOptions,
	WorktreeAddOptions,
	WorktreeRemoveOptions,
	WorktreeAddResult,
} from "../tools/git/index.ts";
import { GitTool } from "../tools/git/index.ts";
import { HookTool } from "../tools/hook.ts";
import { JsonTool } from "../tools/json.ts";
import { FileOperations } from "../utils/files/index.js";
import { IterationHelper } from "../utils/iteration/index.js";
import type { RetryConfig } from "../utils/retry/index.js";
import { RetryableOperation } from "../utils/retry/index.js";
import type { JsonSchema } from "../utils/schema/index.js";
import {
	parseJson,
	parseJsonSafe,
	SchemaValidator,
} from "../utils/schema/index.js";
import type { WorkflowStateType } from "./state.ts";
import type {
	CallStack,
	WorkflowCallOptions,
	WorkflowCallResult,
} from "../composition/types.js";
import { parseWorkflowReference } from "../composition/reference.js";
import {
	createCallStack,
	checkCircular,
	createCircularCallError,
	createMaxDepthError,
	getCallDepth,
} from "../composition/circular.js";
import {
	SubWorkflowExecutor,
	createExecutorContext,
} from "../composition/executor.js";
import type { LangGraphWorkflowDefinition } from "./types.js";
import type { WorkflowRegistry } from "../registry/index.js";
import type {
	AgentSessionOptions,
	AgentSessionResult,
	BashCommandResult,
	BashOptions,
	BashResult,
	ChecklistItem,
	ChecklistOptions,
	ChecklistResult,
	ClaudeOptions,
	ClaudeResult,
	ClaudeSdkOptions,
	ClaudeSdkResult,
	ClaudeSessionResult,
	HookOptions,
	HookResult,
	JsonAction,
	JsonOptions,
	JsonResult,
	LogLevel,
	ParallelBashConfig,
	ParallelBashOptions,
	ParallelBashResult,
	ParallelClaudeConfig,
	ParallelClaudeOptions,
	ParallelClaudeResult,
	ParallelWorkflowConfig,
	ParallelWorkflowsOptions,
	ParallelWorkflowsResult,
	ParallelWorkflowResult,
	PlanningAgentSessionOptions,
	PlanningAgentSessionResult,
	PlanInfo,
	WorkflowTools,
} from "./tools.ts";
import * as fs from "node:fs";
import * as path from "node:path";
import { getMergedAgentDefinitions } from "../agents/agentRegistry.js";
import { buildPlanModeSystemPrompt } from "../agents/planModePrompts.js";
import { createPlanFromOutput, savePlan } from "../agents/planStorage.js";
import type { PlanModeConfig } from "../agents/types.js";
import { READ_ONLY_TOOLS } from "../agents/types.js";

/**
 * Configuration for creating WorkflowTools.
 */
export interface WorkflowToolsConfig {
	projectPath: string;
	tempDir: string;
	claudeConfig?: ClaudeConfig;
	claudeSdkConfig?: ClaudeSdkConfig;
	claudeAgentConfig?: ClaudeAgentConfig;
	/**
	 * Name of the current workflow (used for composition tracking).
	 * When not provided, defaults to "unknown".
	 */
	workflowName?: string;
	/**
	 * Name of the current node (updated before each node execution).
	 * When not provided, defaults to "unknown".
	 */
	currentNodeName?: string;
	/**
	 * Current call stack for tracking nested workflow calls.
	 * When not provided, a new empty call stack is created.
	 */
	callStack?: CallStack;
	/**
	 * Optional workflow registry for resolving workflow references.
	 * When not provided, workflow composition will return WORKFLOW_NOT_FOUND errors.
	 */
	registry?: WorkflowRegistry;
	/**
	 * Optional workflow loader function for resolving workflow definitions.
	 * This is used as an alternative to the registry for loading workflow definitions.
	 * Takes a resolved path and returns the workflow definition.
	 */
	workflowLoader?: (
		path: string,
	) => Promise<LangGraphWorkflowDefinition | undefined>;
}

/**
 * Internal context for tracking variable updates.
 */
interface ToolsContext {
	executionContext: ExecutionContext;
	variableUpdates: Record<string, unknown>;
}

/**
 * Extract critical file paths from a plan content.
 * Looks for markdown file references like `path/to/file.ts` or code blocks.
 * @internal Exported for testing
 */
export function extractCriticalFiles(planContent: string): string[] {
	const files = new Set<string>();

	// Match backtick-wrapped paths like `path/to/file.ts`
	const backtickPattern = /`([^`]+\.[a-zA-Z]{1,10})`/g;

	// Use matchAll to find all matches
	for (const m of planContent.matchAll(backtickPattern)) {
		const potentialPath = m[1];
		// Filter out things that look like file paths
		if (
			potentialPath.includes("/") ||
			potentialPath.includes("\\") ||
			/^\w+\.\w+$/.test(potentialPath)
		) {
			// Skip common non-file patterns
			if (
				!potentialPath.startsWith("http") &&
				!potentialPath.includes(" ") &&
				!potentialPath.startsWith("npm ") &&
				!potentialPath.startsWith("yarn ") &&
				!potentialPath.startsWith("pnpm ")
			) {
				files.add(potentialPath);
			}
		}
	}

	// Also look for "Files to Create/Modify" or similar section headers
	// and extract list items that look like file paths
	const listItemPattern = /^[-*]\s+[`']?([^\s`']+\.[a-zA-Z]{1,10})[`']?/gm;
	for (const m of planContent.matchAll(listItemPattern)) {
		const potentialPath = m[1];
		if (!potentialPath.startsWith("http") && !potentialPath.includes(" ")) {
			files.add(potentialPath);
		}
	}

	return Array.from(files);
}

/**
 * Create a WorkflowTools instance for a node function.
 *
 * @param state - Current workflow state
 * @param config - Tool configuration
 * @param tmuxManager - Optional tmux manager for interactive tools
 * @param emitter - Optional event emitter for workflow observability
 * @returns WorkflowTools instance and a function to get variable updates
 */
export function createWorkflowTools(
	state: WorkflowStateType,
	config: WorkflowToolsConfig,
	tmuxManager?: TmuxManager,
	emitter?: WorkflowEmitter,
): { tools: WorkflowTools; getVariableUpdates: () => Record<string, unknown> } {
	// Create execution context with current state variables
	const executionContext = new ExecutionContext(config.projectPath);
	executionContext.update(state.variables);
	executionContext.set("_temp_dir", config.tempDir);

	// Track variable updates made during this node execution
	const variableUpdates: Record<string, unknown> = {};

	const toolsContext: ToolsContext = {
		executionContext,
		variableUpdates,
	};

	// Lazy-initialized utilities
	let filesInstance: FileOperations | undefined;

	// Create event helpers if emitter is provided
	const events: EventHelpers | null = emitter
		? createEventHelpers(emitter)
		: null;

	// Create tool instances
	const bashTool = new BashTool();
	const claudeTool = new ClaudeTool(config.claudeConfig);
	const claudeSdkTool = new ClaudeSdkTool(config.claudeSdkConfig);
	const claudeAgentTool = new ClaudeAgentTool(config.claudeAgentConfig);
	const jsonTool = new JsonTool();
	const checklistTool = new ChecklistTool();
	const hookTool = new HookTool();
	const gitTool = new GitTool();

	// Create placeholder TmuxManager if not provided
	// This is used for non-tmux tools that still need the parameter
	const tmux = tmuxManager ?? createPlaceholderTmuxManager();

	const tools: WorkflowTools = {
		// --- Variable access ---
		getVar<T>(name: string, defaultValue?: T): T | undefined {
			return toolsContext.executionContext.get<T>(name, defaultValue);
		},

		setVar(name: string, value: unknown): void {
			toolsContext.executionContext.set(name, value);
			toolsContext.variableUpdates[name] = value;
		},

		interpolate(template: string): string {
			return toolsContext.executionContext.interpolate(template);
		},

		// --- Tool execution ---
		async bash(command: string, options?: BashOptions): Promise<BashResult> {
			const timer = createTimer();
			const label = options?.label;

			// Emit start event
			events?.bashStart({
				command,
				label,
				cwd: options?.cwd,
				visible: options?.visible ?? false,
			});

			const stepConfig: StepConfig = {
				name: "bash",
				tool: "bash",
				command,
				cwd: options?.cwd,
				visible: options?.visible,
				stripOutput: options?.stripOutput,
				env: options?.env,
			};

			try {
				const result = await bashTool.execute(
					stepConfig,
					toolsContext.executionContext,
					tmux,
				);

				// Emit complete event
				events?.bashComplete({
					command,
					label,
					success: result.success,
					output: result.output,
					duration: timer.elapsed(),
				});

				return {
					success: result.success,
					output: result.output ?? "",
					error: result.error,
				};
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);

				// Emit error event
				events?.bashError({
					command,
					label,
					error: message,
				});

				return {
					success: false,
					output: "",
					error: message,
				};
			}
		},

		async parallelBash(
			commands: ParallelBashConfig[],
			options?: ParallelBashOptions,
		): Promise<ParallelBashResult> {
			const timer = createTimer();
			const maxConcurrency = options?.maxConcurrency ?? 5;
			const continueOnError = options?.continueOnError ?? true;

			// Emit start event with properly typed payload
			events?.parallelBashStart({
				commands: commands.map((cmd, index) => ({
					id: cmd.id ?? `cmd_${index}`,
					command: cmd.command,
					label: cmd.label,
					cwd: cmd.cwd,
					timeout: cmd.timeout,
					env: cmd.env,
				})),
				maxConcurrency,
				continueOnError,
				totalTimeout: options?.totalTimeout,
			});

			try {
				// Build execution options with callbacks for event emission
				const executeOptions: ExecuteParallelBashOptions = {
					...options,
					defaultCwd: config.projectPath,
					onProgress: (progress) => {
						// Calculate running and queued
						const running = progress.activeCommandIds.length;
						const queued =
							commands.length - progress.completedCommands - running;

						// Emit progress event
						events?.parallelBashProgress({
							completed: progress.completedCommands,
							total: progress.totalCommands,
							running,
							queued,
							succeeded: progress.completedCommands - progress.failedCommands,
							failed: progress.failedCommands,
						});
					},
					onCommandComplete: (cmdResult) => {
						// Determine if timed out
						const timedOut =
							!cmdResult.success &&
							cmdResult.error?.includes("timed out") === true;

						// Emit command complete event
						events?.parallelBashCommandComplete({
							id: cmdResult.id,
							command: cmdResult.command,
							label: cmdResult.label,
							success: cmdResult.success,
							stdout: cmdResult.stdout,
							stderr: cmdResult.stderr,
							exitCode: cmdResult.exitCode ?? -1,
							duration: cmdResult.duration,
							queueWaitTime: cmdResult.queueWaitTime,
							truncated: cmdResult.truncated,
							timedOut,
						});
					},
				};

				// Execute parallel commands
				const internalResult = await executeParallelBash(
					commands,
					executeOptions,
				);

				// Transform internal result to match WorkflowTools interface
				const transformedResults: BashCommandResult[] =
					internalResult.commands.map((cmd) => ({
						id: cmd.id,
						command: cmd.command,
						success: cmd.success,
						stdout: cmd.stdout,
						stderr: cmd.stderr,
						exitCode: cmd.exitCode ?? -1,
						duration: cmd.duration,
						queueWaitTime: cmd.queueWaitTime,
						truncated: cmd.truncated,
						error: cmd.error,
						label: cmd.label,
					}));

				// Create result with helper methods matching the interface
				const result: ParallelBashResult = {
					success: internalResult.success,
					results: transformedResults,
					summary: internalResult.summary,
					duration: internalResult.totalDuration,
					getCommand(id: string): BashCommandResult | undefined {
						return transformedResults.find((r) => r.id === id);
					},
					getSuccessfulOutputs(): string[] {
						return transformedResults
							.filter((r) => r.success)
							.map((r) => r.stdout);
					},
					getErrors(): Array<{
						id: string;
						command: string;
						error: string;
						stderr: string;
					}> {
						return transformedResults
							.filter((r) => !r.success)
							.map((r) => ({
								id: r.id,
								command: r.command,
								error: r.error ?? "",
								stderr: r.stderr,
							}));
					},
				};

				// Emit complete event
				events?.parallelBashComplete({
					success: result.success,
					total: result.summary.total,
					succeeded: result.summary.succeeded,
					failed: result.summary.failed,
					timedOut: result.summary.timedOut,
					duration: timer.elapsed(),
					aborted: false,
				});

				return result;
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				const elapsedDuration = timer.elapsed();

				// Create empty error result with helper methods
				const errorResult: ParallelBashResult = {
					success: false,
					results: [],
					summary: {
						total: commands.length,
						succeeded: 0,
						failed: commands.length,
						timedOut: 0,
					},
					duration: elapsedDuration,
					getCommand(): BashCommandResult | undefined {
						return undefined;
					},
					getSuccessfulOutputs(): string[] {
						return [];
					},
					getErrors(): Array<{
						id: string;
						command: string;
						error: string;
						stderr: string;
					}> {
						return commands.map((cmd, index) => ({
							id: cmd.id ?? `cmd_${index}`,
							command: cmd.command,
							error: message,
							stderr: "",
						}));
					},
				};

				// Emit complete event with failure
				events?.parallelBashComplete({
					success: false,
					total: commands.length,
					succeeded: 0,
					failed: commands.length,
					timedOut: 0,
					duration: elapsedDuration,
					aborted: true,
				});

				return errorResult;
			}
		},

		async claude(
			prompt: string,
			options?: ClaudeOptions,
		): Promise<ClaudeResult> {
			const timer = createTimer();
			const label = options?.label;

			if (!tmuxManager) {
				const errorMessage =
					"Claude tool requires tmux manager (interactive mode)";

				events?.claudeError({
					prompt,
					label,
					error: errorMessage,
				});

				return {
					success: false,
					output: "",
					error: errorMessage,
				};
			}

			// Emit start event
			events?.claudeStart({
				prompt,
				label,
				paneId: tmuxManager.currentPane ?? undefined,
			});

			const stepConfig: StepConfig = {
				name: "claude",
				tool: "claude",
				prompt,
				model: options?.model,
			};

			try {
				const result = await claudeTool.execute(
					stepConfig,
					toolsContext.executionContext,
					tmuxManager,
				);

				// Emit complete event
				events?.claudeComplete({
					prompt,
					label,
					success: result.success,
					output: result.output,
					duration: timer.elapsed(),
					paneId: tmuxManager.currentPane ?? undefined,
				});

				return {
					success: result.success,
					output: result.output ?? "",
					error: result.error,
				};
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);

				// Emit error event
				events?.claudeError({
					prompt,
					label,
					error: message,
					paneId: tmuxManager.currentPane ?? undefined,
				});

				return {
					success: false,
					output: "",
					error: message,
				};
			}
		},

		async claudeSdk<T = unknown>(
			prompt: string,
			options?: ClaudeSdkOptions,
		): Promise<ClaudeSdkResult<T>> {
			const timer = createTimer();
			const label = options?.label;
			const model = options?.model ?? "sonnet";
			const outputType = options?.outputType ?? "schema";

			// Emit start event
			events?.claudeSdkStart({
				prompt,
				label,
				model,
				outputType,
			});

			const stepConfig: StepConfig = {
				name: "claude_sdk",
				tool: "claude_sdk",
				prompt,
				outputType: options?.outputType,
				schema: options?.schema,
				systemPrompt: options?.systemPrompt,
				model: options?.model,
				maxRetries: options?.maxRetries,
			};

			try {
				const result = await claudeSdkTool.execute(
					stepConfig,
					toolsContext.executionContext,
					tmux,
				);

				// Parse data from output if successful
				let data: T | undefined;
				if (result.success && result.output) {
					try {
						data = JSON.parse(result.output) as T;
					} catch {
						// Output might not be JSON, that's fine
						data = result.output as unknown as T;
					}
				}

				// Emit complete event
				events?.claudeSdkComplete({
					prompt,
					label,
					success: result.success,
					result: data,
					duration: timer.elapsed(),
					attempts: result.attempts ?? 1,
				});

				return {
					success: result.success,
					output: result.output ?? "",
					data,
					error: result.error,
					gotoStep: result.gotoStep,
				};
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);

				// Emit error event (unexpected exception - attempts unknown)
				events?.claudeSdkError({
					prompt,
					label,
					error: message,
					attempts: 1,
				});

				return {
					success: false,
					output: "",
					data: undefined,
					error: message,
				};
			}
		},

		json(action: JsonAction, options?: JsonOptions): JsonResult {
			const label = options?.label;

			// Emit start event
			events?.jsonStart(action, label);

			const stepConfig: StepConfig = {
				name: "json",
				tool: "json",
				action,
				input: options?.input,
				query: options?.query,
				path: options?.path,
				newValue: options?.value,
			};

			// JsonTool.execute is actually synchronous despite the async signature
			// We need to wrap it properly
			const executeSync = (): JsonResult => {
				// Create a temporary execution that blocks
				let syncResult: JsonResult = {
					success: false,
					output: "",
					error: "Execution failed",
				};

				// Execute synchronously by waiting for the promise
				jsonTool
					.execute(stepConfig, toolsContext.executionContext, tmux)
					.then((result) => {
						syncResult = {
							success: result.success,
							output: result.output ?? "",
							error: result.error,
						};

						// Emit complete event
						events?.jsonComplete(action, result.success, result.output, label);
					})
					.catch((error) => {
						const message =
							error instanceof Error ? error.message : String(error);
						syncResult = {
							success: false,
							output: "",
							error: message,
						};

						// Emit complete event with failure
						events?.jsonComplete(action, false, undefined, label);
					});

				// Since JsonTool doesn't actually do async operations,
				// the promise resolves synchronously
				return syncResult;
			};

			return executeSync();
		},

		async checklist(
			items: ChecklistItem[],
			options?: ChecklistOptions,
		): Promise<ChecklistResult> {
			const timer = createTimer();
			const label = options?.label;

			// Emit start event
			events?.checklistStart({
				label,
				itemCount: items.length,
			});

			const stepConfig: StepConfig = {
				name: "checklist",
				tool: "checklist",
				items: items.map((item) => ({
					...item,
				})),
				onFail: options?.onFail,
			};

			try {
				const result = await checklistTool.execute(
					stepConfig,
					toolsContext.executionContext,
					tmux,
				);

				// Parse output for statistics
				const passedMatch = result.output?.match(/(\d+)\/(\d+) checks passed/);
				const passedCount = passedMatch ? parseInt(passedMatch[1], 10) : 0;
				const totalCount = passedMatch
					? parseInt(passedMatch[2], 10)
					: items.length;
				const hasErrors = result.output?.includes("Errors:") ?? false;
				const hasWarnings = result.output?.includes("Warnings:") ?? false;

				// Emit complete event
				events?.checklistComplete({
					label,
					passed: passedCount,
					failed: totalCount - passedCount,
					total: totalCount,
					success: result.success,
					duration: timer.elapsed(),
				});

				return {
					success: result.success,
					output: result.output ?? "",
					passedCount,
					totalCount,
					hasErrors,
					hasWarnings,
				};
			} catch (_error) {
				// Emit complete event with failure
				events?.checklistComplete({
					label,
					passed: 0,
					failed: items.length,
					total: items.length,
					success: false,
					duration: timer.elapsed(),
				});

				return {
					success: false,
					output: "",
					passedCount: 0,
					totalCount: items.length,
					hasErrors: true,
					hasWarnings: false,
				};
			}
		},

		async hook(name: string, options?: HookOptions): Promise<HookResult> {
			const timer = createTimer();
			const label = options?.label;

			// Emit start event
			events?.hookStart({
				hookName: name,
				label,
			});

			const stepConfig: StepConfig = {
				name: "hook",
				tool: "hook",
				hookName: name,
			};

			try {
				const result = await hookTool.execute(
					stepConfig,
					toolsContext.executionContext,
					tmux,
				);

				// Emit complete event
				events?.hookComplete({
					hookName: name,
					label,
					success: result.success,
					result: result.output,
					duration: timer.elapsed(),
					hookExists: result.success || !result.error?.includes("not found"),
				});

				return {
					success: result.success,
					output: result.output ?? "",
					error: result.error,
				};
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);

				// Emit complete event with failure
				events?.hookComplete({
					hookName: name,
					label,
					success: false,
					duration: timer.elapsed(),
					hookExists: !message.includes("not found"),
				});

				return {
					success: false,
					output: "",
					error: message,
				};
			}
		},

		async agentSession(
			prompt: string,
			options?: AgentSessionOptions,
		): Promise<AgentSessionResult> {
			const timer = createTimer();
			const label = options?.label;

			// Normalize plan mode configuration
			const planModeConfig: PlanModeConfig | undefined = options?.planMode
				? typeof options.planMode === "boolean"
					? {
							enabled: true,
							autoApprove: true,
							sessionId: crypto.randomUUID(),
						}
					: options.planMode
				: undefined;

			const isPlanMode = planModeConfig?.enabled === true;

			// Determine tools - restrict to read-only in plan mode
			const effectiveTools = isPlanMode
				? READ_ONLY_TOOLS
				: Array.isArray(options?.tools)
					? options.tools
					: undefined;

			// Determine disallowed tools - block EnterPlanMode when plan mode is enabled
			// This prevents the SDK's built-in plan mode from interfering with our custom plan mode
			const effectiveDisallowedTools = isPlanMode
				? [
						...(options?.disallowedTools ?? []),
						"EnterPlanMode" as const,
					].filter(
						(tool, index, arr) => arr.indexOf(tool) === index, // Remove duplicates
					)
				: options?.disallowedTools;

			// Build system prompt - inject plan mode reminder if enabled
			const effectiveSystemPrompt = isPlanMode
				? buildPlanModeSystemPrompt(options?.systemPrompt)
				: options?.systemPrompt;

			// Merge built-in agents with custom agents
			const mergedAgents = getMergedAgentDefinitions(options?.agentConfig);
			const effectiveAgents = {
				...mergedAgents,
				...options?.agents,
			};

			const model = resolveModel(options?.model ?? "sonnet");

			// Determine tools list for event payload
			const toolsList =
				effectiveTools ??
				(options?.tools &&
				!Array.isArray(options.tools) &&
				options.tools.type === "preset"
					? [options.tools.preset]
					: undefined);

			// Emit start event
			events?.agentSessionStart({
				prompt,
				label,
				model,
				tools: toolsList,
				workingDirectory: options?.workingDirectory,
				hasSubagents: Object.keys(effectiveAgents).length > 0,
				isResume: !!options?.resume,
				resumeSessionId: options?.resume,
			});

			try {
				// Execute the agent session with streaming callback
				const result = await claudeAgentTool.executeSession(prompt, {
					model: options?.model,
					tools: effectiveTools,
					disallowedTools: effectiveDisallowedTools,
					systemPrompt: effectiveSystemPrompt,
					permissionMode: isPlanMode
						? "bypassPermissions"
						: options?.permissionMode,
					workingDirectory: options?.workingDirectory ?? config.projectPath,
					agents: effectiveAgents,
					maxBudgetUsd: options?.maxBudgetUsd,
					resume: options?.resume,
					label,
					// Stream message events in real-time
					onMessage: (message) => {
						events?.agentSessionMessage({
							label,
							messageType: message.type,
							subtype: message.subtype,
							content: message.content,
							toolName: message.toolName,
							sessionId: message.sessionId,
							agentName: message.agentName,
							raw: message.raw,
							// Enhanced fields
							usage: message.usage,
							stopReason: message.stopReason,
							fileInfo: message.fileInfo,
						});
					},
				});

				// Handle plan mode post-processing
				if (isPlanMode && result.success && planModeConfig) {
					const plan = createPlanFromOutput(
						planModeConfig.sessionId,
						result.output,
						planModeConfig.autoApprove,
					);

					const saveResult = savePlan(plan);
					const planPath = saveResult.isOk() ? saveResult.unwrap() : undefined;

					// Emit plan created event
					if (planPath) {
						events?.emit("plan:created", {
							sessionId: planModeConfig.sessionId,
							planPath,
							criticalFileCount: plan.criticalFiles.length,
							status: plan.status,
						});

						if (plan.status === "approved") {
							events?.emit("plan:approved", {
								sessionId: planModeConfig.sessionId,
								planPath,
								autoApproved: planModeConfig.autoApprove,
							});
						}
					}

					// Emit complete event with enhanced data
					events?.agentSessionComplete({
						label,
						success: true,
						output: result.output,
						sessionId: result.sessionId,
						messageCount: result.messages.length,
						duration: timer.elapsed(),
						numTurns: result.numTurns,
						durationApiMs: result.durationApiMs,
						costUsd: result.costUsd,
						totalUsage: result.totalUsage,
						modelUsage: result.modelUsage,
						permissionDenials: result.permissionDenials,
					});

					return {
						success: result.success,
						output: result.output,
						messages: result.messages,
						sessionId: result.sessionId,
						duration: timer.elapsed(),
						error: result.error,
						errorType: result.errorType,
						plan,
						planPath,
					};
				}

				if (result.success) {
					// Emit complete event with enhanced data
					events?.agentSessionComplete({
						label,
						success: true,
						output: result.output,
						sessionId: result.sessionId,
						messageCount: result.messages.length,
						duration: timer.elapsed(),
						// Enhanced fields from result
						numTurns: result.numTurns,
						durationApiMs: result.durationApiMs,
						costUsd: result.costUsd,
						totalUsage: result.totalUsage,
						modelUsage: result.modelUsage,
						permissionDenials: result.permissionDenials,
					});
				} else {
					// Emit error event
					events?.agentSessionError({
						label,
						error: result.error ?? "Agent session failed",
						errorType: result.errorType,
						sessionId: result.sessionId,
					});
				}

				return {
					success: result.success,
					output: result.output,
					messages: result.messages,
					sessionId: result.sessionId,
					duration: timer.elapsed(),
					error: result.error,
					errorType: result.errorType,
				};
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);

				// Emit error event
				events?.agentSessionError({
					label,
					error: message,
					errorType: "UNKNOWN",
				});

				return {
					success: false,
					output: "",
					messages: [],
					duration: timer.elapsed(),
					error: message,
					errorType: "UNKNOWN",
				};
			}
		},

		async planningAgentSession(
			prompt: string,
			options: PlanningAgentSessionOptions,
		): Promise<PlanningAgentSessionResult> {
			const totalTimer = createTimer();
			const label = options.label;
			const planningModel = resolveModel(options.planningModel ?? "opus");
			const implementationModel = resolveModel(
				options.implementationModel ?? "sonnet",
			);

			// Determine if we should skip planning (planPath provided)
			const skipPlanning = !!options.planPath;

			let planInfo: PlanInfo;
			let planningSessionId: string | undefined;

			// ================================================================
			// PLANNING PHASE
			// ================================================================

			if (skipPlanning && options.planPath) {
				// Load existing plan from file
				try {
					const planContent = fs.readFileSync(options.planPath, "utf-8");
					planInfo = {
						content: planContent,
						path: options.planPath,
						criticalFiles: extractCriticalFiles(planContent),
					};
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					return {
						success: false,
						output: "",
						error: `Failed to load plan from ${options.planPath}: ${message}`,
						duration: totalTimer.elapsed(),
						plan: {
							content: "",
							path: options.planPath,
							criticalFiles: [],
						},
					};
				}
			} else {
				// Run planning phase
				const planningTimer = createTimer();

				// Emit planning phase start event
				events?.planningPhaseStart({
					prompt,
					model: planningModel,
					label: label ? `${label}-planning` : "planning",
					workingDirectory: options.workingDirectory,
				});

				// Build planning system prompt
				const planningSystemPrompt = buildPlanModeSystemPrompt(
					`You are a planning agent. Create a comprehensive implementation plan for the given task.

Your plan MUST include:
1. **Summary**: Brief description of what needs to be implemented
2. **Files to Create/Modify**: List specific files with planned changes
3. **Implementation Steps**: Ordered steps to implement the feature
4. **Dependencies**: Any new dependencies needed
5. **Test Strategy**: How to test the implementation
6. **Risks**: Potential issues or blockers

Output your plan in markdown format. Be thorough but concise.`,
				);

				// Execute planning session with read-only tools
				const planningResult = await claudeAgentTool.executeSession(prompt, {
					model: options.planningModel ?? "opus",
					tools: READ_ONLY_TOOLS,
					disallowedTools: ["EnterPlanMode"],
					systemPrompt: planningSystemPrompt,
					permissionMode: "bypassPermissions",
					workingDirectory: options.workingDirectory,
					agents: getMergedAgentDefinitions(options.agentConfig),
					maxBudgetUsd: options.maxBudgetUsd,
				});

				planningSessionId = planningResult.sessionId;

				// Emit planning phase complete event
				const planningSuccess = planningResult.success;
				const planningDuration = planningTimer.elapsed();

				if (!planningSuccess) {
					events?.planningPhaseComplete({
						planPath: "",
						criticalFiles: [],
						duration: planningDuration,
						sessionId: planningSessionId,
						success: false,
						error: planningResult.error ?? "Planning phase failed",
					});

					return {
						success: false,
						output: "",
						error: planningResult.error ?? "Planning phase failed",
						duration: totalTimer.elapsed(),
						plan: {
							content: planningResult.output,
							path: "",
							sessionId: planningSessionId,
							criticalFiles: [],
						},
					};
				}

				// Save plan to temp directory
				const planFileName = `plan-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.md`;
				const planPath = path.join(config.tempDir, "plans", planFileName);

				// Ensure plans directory exists
				const plansDir = path.dirname(planPath);
				if (!fs.existsSync(plansDir)) {
					fs.mkdirSync(plansDir, { recursive: true });
				}

				// Write plan to file
				fs.writeFileSync(planPath, planningResult.output, "utf-8");

				// Extract critical files from plan
				const criticalFiles = extractCriticalFiles(planningResult.output);

				planInfo = {
					content: planningResult.output,
					path: planPath,
					sessionId: planningSessionId,
					criticalFiles,
				};

				events?.planningPhaseComplete({
					planPath,
					criticalFiles,
					duration: planningDuration,
					sessionId: planningSessionId,
					success: true,
				});
			}

			// ================================================================
			// PLAN ONLY - Return early if planOnly is true
			// ================================================================

			if (options.planOnly) {
				return {
					success: true,
					output: planInfo.content,
					duration: totalTimer.elapsed(),
					plan: planInfo,
				};
			}

			// ================================================================
			// IMPLEMENTATION PHASE
			// ================================================================

			const implementationTimer = createTimer();

			// Emit implementation phase start event
			events?.implementationPhaseStart({
				planPath: planInfo.path,
				model: implementationModel,
				label: label ? `${label}-implementation` : "implementation",
				workingDirectory: options.workingDirectory,
				isResume: !!options.resumeImplementation,
				resumeSessionId: options.resumeImplementation,
			});

			// Build implementation system prompt with ReadPlan tool description
			const implementationSystemPrompt = `You are implementing a plan that was created during the planning phase.

## Important: Reading the Plan

You have access to a special tool called "ReadPlan" that allows you to read the implementation plan.
Use this tool whenever you need to:
- Review the next steps to implement
- Check the overall plan structure
- Reference specific implementation details
- Verify you're following the plan correctly

**Always read the plan first before starting implementation, and re-read it whenever you need to remember what to do next.**

## Your Task

Follow the implementation plan carefully and implement each step. The plan is available via the ReadPlan tool.

Work methodically through the plan:
1. Read the plan first to understand the full scope
2. Implement each step in order
3. Re-read the plan if you're unsure about next steps
4. Test your implementation as you go`;

			// Create a custom tool definition for ReadPlan
			// This will be passed to the agent as a subagent that can read the plan
			const readPlanAgentDefinition: SubagentDefinition = {
				description:
					"Read the implementation plan. Use this tool whenever you need to review the plan, check next steps, or verify implementation details. You should read the plan at the start and re-read it whenever needed.",
				prompt: `Return the following implementation plan:\n\n${planInfo.content}`,
				tools: [],
				model: "haiku",
			};

			// Build implementation prompt
			const implementationPrompt = `Implement the following task according to the plan.

## Original Task
${prompt}

## Instructions
1. Use the ReadPlan tool to read and understand the implementation plan
2. Follow the plan step by step
3. Re-read the plan whenever you need to verify next steps
4. Test your implementation as specified in the plan`;

			// Execute implementation session
			const implementationResult = await claudeAgentTool.executeSession(
				implementationPrompt,
				{
					model: options.implementationModel ?? "sonnet",
					disallowedTools: ["EnterPlanMode"],
					systemPrompt: implementationSystemPrompt,
					permissionMode: options.permissionMode ?? "acceptEdits",
					workingDirectory: options.workingDirectory,
					agents: {
						...getMergedAgentDefinitions(options.agentConfig),
						ReadPlan: readPlanAgentDefinition,
					},
					maxBudgetUsd: options.maxBudgetUsd,
					resume: options.resumeImplementation,
				},
			);

			const implementationDuration = implementationTimer.elapsed();

			// Emit implementation phase complete event
			events?.implementationPhaseComplete({
				sessionId: implementationResult.sessionId,
				duration: implementationDuration,
				success: implementationResult.success,
				error: implementationResult.error,
				output: implementationResult.output,
			});

			return {
				success: implementationResult.success,
				output: implementationResult.output,
				error: implementationResult.error,
				duration: totalTimer.elapsed(),
				plan: planInfo,
				implementation: {
					sessionId: implementationResult.sessionId,
				},
			};
		},

		async parallelClaude(
			sessions: ParallelClaudeConfig[],
			options?: ParallelClaudeOptions,
		): Promise<ParallelClaudeResult> {
			const timer = createTimer();
			const maxConcurrency = options?.maxConcurrency ?? 3;
			const continueOnError = options?.continueOnError ?? true;

			// Emit start event with properly typed payload
			events?.parallelClaudeStart({
				sessions: sessions.map((session, index) => ({
					id: session.id ?? `session_${index}`,
					prompt: session.prompt,
					model: session.model,
					label: session.label,
					timeout: session.timeout,
					maxBudgetUsd: session.maxBudgetUsd,
				})),
				maxConcurrency,
				continueOnError,
				totalTimeout: options?.totalTimeout,
				maxTotalBudgetUsd: options?.maxTotalBudgetUsd,
				label: options?.label,
			});

			try {
				// Build execution options with callbacks for event emission
				const executeOptions: ExecuteParallelClaudeOptions = {
					...options,
					defaultWorkingDirectory: config.projectPath,
					onProgress: (progress) => {
						// Calculate running and queued
						const running = progress.activeSessionIds.length;
						const queued =
							sessions.length - progress.completedSessions - running;

						// Emit progress event
						events?.parallelClaudeProgress({
							completed: progress.completedSessions,
							total: progress.totalSessions,
							running,
							queued,
							succeeded: progress.completedSessions - progress.failedSessions,
							failed: progress.failedSessions,
							tokensUsed: progress.tokensUsed,
							elapsedMs: progress.elapsedMs,
						});
					},
					onSessionComplete: (sessionResult) => {
						// Find the original session config for the prompt
						const originalSession = sessions.find(
							(s, index) =>
								s.id === sessionResult.id ||
								`session_${index}` === sessionResult.id,
						);

						// Emit session complete event
						events?.parallelClaudeSessionComplete({
							id: sessionResult.id,
							prompt: originalSession?.prompt ?? "",
							label: sessionResult.label,
							success: sessionResult.success,
							output: sessionResult.output,
							error: sessionResult.error,
							tokens: {
								input: sessionResult.tokens.input,
								output: sessionResult.tokens.output,
								total: sessionResult.tokens.total,
							},
							duration: sessionResult.duration,
							queueWaitTime: sessionResult.queueWaitTime,
							model: sessionResult.model,
							sessionId: sessionResult.sessionId,
						});
					},
				};

				// Execute parallel Claude sessions
				const internalResult = await executeParallelClaude(
					sessions,
					executeOptions,
				);

				// Transform internal result to match WorkflowTools interface
				const transformedSessions: ClaudeSessionResult[] =
					internalResult.sessions.map((session) => ({
						id: session.id,
						success: session.success,
						output: session.output,
						messages: [...session.messages],
						error: session.error,
						tokens: {
							input: session.tokens.input,
							output: session.tokens.output,
							total: session.tokens.total,
						},
						duration: session.duration,
						queueWaitTime: session.queueWaitTime,
						model: session.model,
						sessionId: session.sessionId,
						label: session.label,
					}));

				// Create result with helper methods matching the interface
				const result: ParallelClaudeResult = {
					success: internalResult.success,
					totalDuration: internalResult.totalDuration,
					sessions: transformedSessions,
					summary: {
						total: internalResult.summary.total,
						succeeded: internalResult.summary.succeeded,
						failed: internalResult.summary.failed,
						totalTokens: {
							input: internalResult.summary.totalTokens.input,
							output: internalResult.summary.totalTokens.output,
							total: internalResult.summary.totalTokens.total,
						},
						estimatedCostUsd: internalResult.summary.estimatedCostUsd,
					},
					getSession(id: string): ClaudeSessionResult | undefined {
						return transformedSessions.find((s) => s.id === id);
					},
					getSuccessfulOutputs(): Array<{ id: string; output: string }> {
						return transformedSessions
							.filter((s) => s.success && s.output !== undefined)
							.map((s) => ({ id: s.id, output: s.output as string }));
					},
					getErrors(): Array<{ id: string; error: string }> {
						return transformedSessions
							.filter((s) => !s.success && s.error !== undefined)
							.map((s) => ({ id: s.id, error: s.error as string }));
					},
				};

				// Emit complete event
				events?.parallelClaudeComplete({
					success: result.success,
					total: result.summary.total,
					succeeded: result.summary.succeeded,
					failed: result.summary.failed,
					totalTokens: result.summary.totalTokens.total,
					estimatedCostUsd: result.summary.estimatedCostUsd,
					duration: timer.elapsed(),
					aborted: false,
					label: options?.label,
				});

				return result;
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				const elapsedDuration = timer.elapsed();

				// Create empty error result with helper methods
				const errorResult: ParallelClaudeResult = {
					success: false,
					totalDuration: elapsedDuration,
					sessions: [],
					summary: {
						total: sessions.length,
						succeeded: 0,
						failed: sessions.length,
						totalTokens: { input: 0, output: 0, total: 0 },
						estimatedCostUsd: 0,
					},
					getSession(): ClaudeSessionResult | undefined {
						return undefined;
					},
					getSuccessfulOutputs(): Array<{ id: string; output: string }> {
						return [];
					},
					getErrors(): Array<{ id: string; error: string }> {
						return sessions.map((session, index) => ({
							id: session.id ?? `session_${index}`,
							error: message,
						}));
					},
				};

				// Emit complete event with failure
				events?.parallelClaudeComplete({
					success: false,
					total: sessions.length,
					succeeded: 0,
					failed: sessions.length,
					totalTokens: 0,
					estimatedCostUsd: 0,
					duration: elapsedDuration,
					aborted: true,
					label: options?.label,
				});

				return errorResult;
			}
		},

		async parallelWorkflows(
			workflows: ParallelWorkflowConfig[],
			options?: ParallelWorkflowsOptions,
		): Promise<ParallelWorkflowsResult> {
			const timer = createTimer();
			const maxConcurrency =
				options?.maxConcurrency ?? DEFAULT_WORKFLOW_CONCURRENCY;

			// Generate workflow IDs for those that don't have them
			const workflowIds = workflows.map(
				(wf, index) => wf.id ?? `workflow_${index}`,
			);

			// Emit start event
			events?.parallelWorkflowsStart({
				totalWorkflows: workflows.length,
				maxConcurrency,
				workflowIds,
				label: options?.label,
			});

			try {
				// Build execution options with callbacks for event emission
				const executeOptions: ExecuteParallelWorkflowsOptions = {
					...options,
					onProgress: (progress) => {
						// Emit progress event
						events?.parallelWorkflowsProgress({
							totalWorkflows: progress.totalWorkflows,
							completedWorkflows: progress.completedWorkflows,
							failedWorkflows: progress.failedWorkflows,
							activeWorkflowIds: progress.activeWorkflowIds,
							queuedWorkflowIds: progress.queuedWorkflowIds,
							percentComplete: progress.percentComplete,
							elapsedMs: progress.elapsedMs,
						});
					},
					onWorkflowStart: (info) => {
						// Emit workflow start event
						events?.parallelWorkflowStart({
							id: info.id,
							reference: info.reference,
							queuePosition: info.queuePosition,
							label: info.label,
						});
					},
					onWorkflowComplete: (workflowResult) => {
						// Emit workflow complete event
						events?.parallelWorkflowComplete({
							id: workflowResult.id,
							reference: workflowResult.reference,
							success: workflowResult.success,
							duration: workflowResult.duration,
							label: workflowResult.label,
						});
					},
				};

				// Create the workflow executor function that uses tools.workflow()
				const workflowExecutor = async (
					reference: string,
					execOptions: {
						input?: Record<string, unknown>;
						timeout?: number;
						label?: string;
					},
				) => {
					const result = await tools.workflow(reference, {
						input: execOptions.input,
						timeout: execOptions.timeout,
						label: execOptions.label,
					});

					return {
						success: result.success,
						output: result.output,
						error: result.error,
						duration: result.duration,
						metadata: {
							name: result.metadata.name,
							version: result.metadata.version,
							source: result.metadata.source,
						},
					};
				};

				// Execute parallel workflows
				const internalResult = await executeParallelWorkflows(
					workflows,
					workflowExecutor,
					executeOptions,
				);

				// Transform internal result to match WorkflowTools interface
				const transformedWorkflows: ParallelWorkflowResult[] =
					internalResult.workflows.map((wf) => ({
						id: wf.id,
						reference: wf.reference,
						success: wf.success,
						output: wf.output,
						error: wf.error,
						duration: wf.duration,
						queueWaitTime: wf.queueWaitTime,
						metadata: {
							name: wf.metadata.name,
							version: wf.metadata.version,
							source: wf.metadata.source,
						},
						label: wf.label,
					}));

				// Create result with helper methods matching the interface
				const result: ParallelWorkflowsResult = {
					success: internalResult.success,
					totalDuration: internalResult.totalDuration,
					workflows: transformedWorkflows,
					summary: {
						total: internalResult.summary.total,
						succeeded: internalResult.summary.succeeded,
						failed: internalResult.summary.failed,
						timedOut: internalResult.summary.timedOut,
					},
					getWorkflow(id: string): ParallelWorkflowResult | undefined {
						return transformedWorkflows.find((w) => w.id === id);
					},
					getSuccessfulOutputs(): Array<{ id: string; output: unknown }> {
						return transformedWorkflows
							.filter((w) => w.success && w.output !== undefined)
							.map((w) => ({ id: w.id, output: w.output }));
					},
					getErrors(): Array<{
						id: string;
						error: import("../composition/types.js").WorkflowCallError;
					}> {
						return transformedWorkflows
							.filter((w) => !w.success && w.error !== undefined)
							.map((w) => ({
								id: w.id,
								error:
									w.error as import("../composition/types.js").WorkflowCallError,
							}));
					},
					isSuccessful(id: string): boolean {
						const workflow = transformedWorkflows.find((w) => w.id === id);
						return workflow?.success ?? false;
					},
				};

				// Emit complete event
				events?.parallelWorkflowsComplete({
					success: result.success,
					totalDuration: timer.elapsed(),
					succeeded: result.summary.succeeded,
					failed: result.summary.failed,
					timedOut: result.summary.timedOut,
					label: options?.label,
				});

				return result;
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				const elapsedDuration = timer.elapsed();

				// Create empty error result with helper methods
				const errorResult: ParallelWorkflowsResult = {
					success: false,
					totalDuration: elapsedDuration,
					workflows: [],
					summary: {
						total: workflows.length,
						succeeded: 0,
						failed: workflows.length,
						timedOut: 0,
					},
					getWorkflow(): ParallelWorkflowResult | undefined {
						return undefined;
					},
					getSuccessfulOutputs(): Array<{ id: string; output: unknown }> {
						return [];
					},
					getErrors(): Array<{
						id: string;
						error: import("../composition/types.js").WorkflowCallError;
					}> {
						return workflows.map((wf, index) => ({
							id: wf.id ?? `workflow_${index}`,
							error: {
								code: "EXECUTION_FAILED" as const,
								message,
							},
						}));
					},
					isSuccessful(): boolean {
						return false;
					},
				};

				// Emit complete event with failure
				events?.parallelWorkflowsComplete({
					success: false,
					totalDuration: elapsedDuration,
					succeeded: 0,
					failed: workflows.length,
					timedOut: 0,
					label: options?.label,
				});

				return errorResult;
			}
		},

		// --- Workflow composition ---
		async workflow<TInput = unknown, TOutput = unknown>(
			reference: string,
			options?: WorkflowCallOptions<TInput>,
		): Promise<WorkflowCallResult<TOutput>> {
			const timer = createTimer();

			// Get workflow context
			const parentWorkflow = config.workflowName ?? "unknown";
			const parentNode = config.currentNodeName ?? "unknown";
			const callStack = config.callStack ?? createCallStack();
			const depth = getCallDepth(callStack) + 1;

			// Step 1: Parse the workflow reference
			const parseResult = parseWorkflowReference(reference);

			if (!parseResult.success) {
				const error = parseResult.error;

				// Emit error event
				events?.workflowCallError({
					calledWorkflowName: reference,
					callerWorkflowName: parentWorkflow,
					callerNodeName: parentNode,
					error: error.message,
					depth,
				});

				return {
					success: false,
					error,
					duration: timer.elapsed(),
					metadata: {
						name: reference,
						version: "0.0.0",
						source: "project",
					},
				};
			}

			const parsedRef = parseResult.value;
			const workflowName = parsedRef.name;
			const workflowVersion = parsedRef.version ?? "0.0.0";

			// Step 2: Check for circular calls before proceeding
			const circularCheck = checkCircular(
				callStack,
				workflowName,
				workflowVersion,
			);

			if (circularCheck.isCircular) {
				const error = createCircularCallError(
					callStack,
					workflowName,
					workflowVersion,
				);

				events?.workflowCallError({
					calledWorkflowName: workflowName,
					callerWorkflowName: parentWorkflow,
					callerNodeName: parentNode,
					error: error.message,
					depth,
				});

				return {
					success: false,
					error,
					duration: timer.elapsed(),
					metadata: {
						name: workflowName,
						version: workflowVersion,
						source: "project",
					},
				};
			}

			if (circularCheck.exceedsMaxDepth) {
				const error = createMaxDepthError(callStack, workflowName);

				events?.workflowCallError({
					calledWorkflowName: workflowName,
					callerWorkflowName: parentWorkflow,
					callerNodeName: parentNode,
					error: error.message,
					depth,
				});

				return {
					success: false,
					error,
					duration: timer.elapsed(),
					metadata: {
						name: workflowName,
						version: workflowVersion,
						source: "project",
					},
				};
			}

			// Step 3: Resolve the workflow definition
			// Note: We don't emit start event here - the SubWorkflowExecutor will emit
			// its own start event when execution begins. We only emit events for errors
			// that happen before we can start execution (circular calls, resolution failures).
			let workflowDefinition: LangGraphWorkflowDefinition | undefined;
			let resolvedVersion = workflowVersion;
			let resolvedSource: "project" | "project-installed" | "global" =
				"project";

			// Try to resolve using registry if available
			if (config.registry) {
				const resolveResult = await config.registry.resolve(reference);

				if (resolveResult._tag === "ok") {
					const resolved = resolveResult.value;
					resolvedVersion = resolved.metadata.version;
					resolvedSource = resolved.source as
						| "project"
						| "project-installed"
						| "global";

					// Try to load the workflow definition
					if (config.workflowLoader) {
						workflowDefinition = await config.workflowLoader(resolved.path);
					}
				} else {
					// Registry resolution failed
					const error = resolveResult.error;
					const errorMessage = error.message;

					events?.workflowCallError({
						calledWorkflowName: workflowName,
						callerWorkflowName: parentWorkflow,
						callerNodeName: parentNode,
						error: errorMessage,
						depth,
					});

					return {
						success: false,
						error: {
							code:
								error.code === "VERSION_NOT_FOUND"
									? "VERSION_NOT_FOUND"
									: error.code === "WORKFLOW_NOT_FOUND"
										? "WORKFLOW_NOT_FOUND"
										: "WORKFLOW_NOT_FOUND",
							message: errorMessage,
							availableVersions: error.availableVersions,
						},
						duration: timer.elapsed(),
						metadata: {
							name: workflowName,
							version: resolvedVersion,
							source: resolvedSource,
						},
					};
				}
			}

			// If no definition found and no registry, return WORKFLOW_NOT_FOUND
			if (!workflowDefinition) {
				const errorMessage = config.registry
					? `Workflow "${workflowName}" could not be loaded. The workflow was resolved but the definition could not be loaded.`
					: `Workflow "${workflowName}" not found. No workflow registry is configured. ` +
						`To use workflow composition, ensure the workflow registry is available.`;

				events?.workflowCallError({
					calledWorkflowName: workflowName,
					callerWorkflowName: parentWorkflow,
					callerNodeName: parentNode,
					error: errorMessage,
					depth,
				});

				return {
					success: false,
					error: {
						code: "WORKFLOW_NOT_FOUND",
						message: errorMessage,
					},
					duration: timer.elapsed(),
					metadata: {
						name: workflowName,
						version: resolvedVersion,
						source: resolvedSource,
					},
				};
			}

			// Step 4: Execute the sub-workflow using SubWorkflowExecutor
			const executor = new SubWorkflowExecutor({
				projectPath: options?.cwd ?? config.projectPath,
				tempDir: config.tempDir,
				claudeConfig: config.claudeConfig,
				claudeSdkConfig: config.claudeSdkConfig,
				emitter: emitter,
			});

			// Create executor context with updated call stack
			const executorContext = createExecutorContext(
				parentWorkflow,
				parentNode,
				callStack,
				options?.cwd,
			);

			// Execute the sub-workflow
			// Note: The executor handles all event emission (start, complete, error)
			// for the actual execution. We only emit error events for pre-execution
			// failures (like registry resolution errors) above.
			const result = await executor.execute<TInput, TOutput>(
				workflowDefinition,
				options ?? {},
				executorContext,
			);

			return {
				...result,
				duration: timer.elapsed(),
				metadata: {
					name: workflowName,
					version: resolvedVersion,
					source: resolvedSource,
					export: parsedRef.export,
				},
			};
		},

		// --- Logging ---
		log(
			message: string,
			level: LogLevel = "info",
			data?: Record<string, unknown>,
		): void {
			events?.emit("log", { message, level, data });
		},

		emit(name: string, data: Record<string, unknown>): void {
			events?.custom(name, data);
		},

		// --- Context properties ---
		get projectPath(): string {
			return config.projectPath;
		},

		get tempDir(): string {
			return config.tempDir;
		},

		// --- Utilities ---
		get files(): FileOperations {
			// Lazy initialization - create on first access
			if (!filesInstance) {
				filesInstance = new FileOperations(config.projectPath, config.tempDir);
			}
			return filesInstance;
		},

		schema: {
			parseJson<T>(json: string) {
				return parseJson<T>(json);
			},
			parseJsonSafe<T>(json: string, defaultValue: T): T {
				return parseJsonSafe(json, defaultValue);
			},
			createValidator<T>(schema: JsonSchema): SchemaValidator<T> {
				return new SchemaValidator<T>(schema);
			},
		},

		// --- Utility factories ---
		createRetry<T>(
			name: string,
			retryConfig: RetryConfig,
		): RetryableOperation<T> {
			return new RetryableOperation<T>(name, retryConfig, emitter);
		},

		createIterator<T>(
			items: readonly T[],
			stateKey: string,
		): IterationHelper<T> {
			return new IterationHelper<T>(items, stateKey, tools);
		},

		// --- Git operations ---
		git: createGitOperationsWrapper(gitTool, config.projectPath, events),
	};

	return {
		tools,
		getVariableUpdates: () => variableUpdates,
	};
}

/**
 * Create a placeholder TmuxManager for non-interactive tools.
 * This satisfies the type requirements but throws if actually used.
 */
function createPlaceholderTmuxManager(): TmuxManager {
	const throwError = (): never => {
		throw new Error("TmuxManager not available in non-interactive mode");
	};

	return {
		get currentPane() {
			return null;
		},
		launchClaudePane: throwError,
		launchBashPane: throwError,
		closePane: throwError,
		sendKeys: throwError,
		getPaneContentHash: throwError,
		capturePaneContent: throwError,
	} as unknown as TmuxManager;
}

/**
 * Create a wrapper around GitTool that implements GitOperations with event emission.
 *
 * @param gitTool - The GitTool instance
 * @param projectPath - Default working directory for operations
 * @param events - Optional event helpers for emitting events
 * @returns GitOperations implementation with event emission
 */
function createGitOperationsWrapper(
	gitTool: GitTool,
	projectPath: string,
	events: EventHelpers | null,
): GitOperations {
	/**
	 * Merge user config with default project path.
	 */
	const mergeConfig = (userConfig?: GitConfig): GitConfig => ({
		cwd: projectPath,
		...userConfig,
	});

	/**
	 * Emit a git error event.
	 */
	const emitGitError = (
		operation: string,
		errorType: string,
		message: string,
		command?: string,
		label?: string,
	): void => {
		events?.emit("tool:git:error", {
			operation,
			errorType,
			message,
			command,
			label,
		});
	};

	return {
		// --- Status Operations ---

		async status(config?: GitConfig): Promise<GitResult<GitStatus>> {
			const timer = createTimer();
			const mergedConfig = mergeConfig(config);
			const result = await gitTool.status(mergedConfig);

			if (result._tag === "ok") {
				events?.emit("tool:git:status", {
					branch: result.value.branch,
					staged: result.value.staged.length,
					unstaged: result.value.unstaged.length,
					untracked: result.value.untracked.length,
					label: config?.label,
					duration: timer.elapsed(),
				});
			} else {
				emitGitError(
					"status",
					result.error.type,
					result.error.message,
					result.error.command,
					config?.label,
				);
			}

			return result;
		},

		async isRepo(config?: GitConfig): Promise<GitResult<boolean>> {
			return gitTool.isRepo(mergeConfig(config));
		},

		async getBranch(config?: GitConfig): Promise<GitResult<string>> {
			return gitTool.getBranch(mergeConfig(config));
		},

		async getRemotes(config?: GitConfig): Promise<GitResult<GitRemote[]>> {
			return gitTool.getRemotes(mergeConfig(config));
		},

		// --- Branch Operations ---

		async createBranch(
			options: CreateBranchOptions,
			config?: GitConfig,
		): Promise<GitResult<void>> {
			const timer = createTimer();
			const mergedConfig = mergeConfig(config);

			// Get current branch before operation for event context
			const currentBranchResult = await gitTool.getBranch(mergedConfig);
			const fromBranch =
				currentBranchResult._tag === "ok"
					? currentBranchResult.value
					: "unknown";

			const result = await gitTool.createBranch(options, mergedConfig);

			if (result._tag === "ok") {
				events?.emit("tool:git:branch:create", {
					name: options.name,
					from: options.from ?? fromBranch,
					checkout: options.checkout ?? false,
					label: options.label,
					duration: timer.elapsed(),
				});
			} else {
				emitGitError(
					"createBranch",
					result.error.type,
					result.error.message,
					result.error.command,
					options.label,
				);
			}

			return result;
		},

		async switchBranch(
			options: SwitchBranchOptions,
			config?: GitConfig,
		): Promise<GitResult<void>> {
			const timer = createTimer();
			const mergedConfig = mergeConfig(config);

			// Get current branch before switch
			const currentBranchResult = await gitTool.getBranch(mergedConfig);
			const fromBranch =
				currentBranchResult._tag === "ok"
					? currentBranchResult.value
					: "unknown";

			const result = await gitTool.switchBranch(options, mergedConfig);

			if (result._tag === "ok") {
				events?.emit("tool:git:branch:switch", {
					from: fromBranch,
					to: options.name,
					label: options.label,
					duration: timer.elapsed(),
				});
			} else {
				emitGitError(
					"switchBranch",
					result.error.type,
					result.error.message,
					result.error.command,
					options.label,
				);
			}

			return result;
		},

		async deleteBranch(
			options: DeleteBranchOptions,
			config?: GitConfig,
		): Promise<GitResult<void>> {
			const timer = createTimer();
			const result = await gitTool.deleteBranch(options, mergeConfig(config));

			if (result._tag === "ok") {
				events?.emit("tool:git:branch:delete", {
					name: options.name,
					force: options.force ?? false,
					label: options.label,
					duration: timer.elapsed(),
				});
			} else {
				emitGitError(
					"deleteBranch",
					result.error.type,
					result.error.message,
					result.error.command,
					options.label,
				);
			}

			return result;
		},

		async listBranches(
			options?: ListBranchesOptions,
			config?: GitConfig,
		): Promise<GitResult<GitBranch[]>> {
			return gitTool.listBranches(options, mergeConfig(config));
		},

		// --- Commit Operations ---

		async commit(
			options: CommitOptions,
			config?: GitConfig,
		): Promise<GitResult<string>> {
			const timer = createTimer();
			const mergedConfig = mergeConfig(config);

			// Get status to count files before commit
			const statusResult = await gitTool.status(mergedConfig);
			const filesCount =
				statusResult._tag === "ok" ? statusResult.value.staged.length : 0;

			const result = await gitTool.commit(options, mergedConfig);

			if (result._tag === "ok") {
				const hash = result.value;
				events?.emit("tool:git:commit", {
					hash,
					shortHash: hash.substring(0, 7),
					message: options.message,
					filesCount,
					amend: options.amend ?? false,
					label: options.label,
					duration: timer.elapsed(),
				});
			} else {
				emitGitError(
					"commit",
					result.error.type,
					result.error.message,
					result.error.command,
					options.label,
				);
			}

			return result;
		},

		async add(
			options: AddOptions,
			config?: GitConfig,
		): Promise<GitResult<void>> {
			return gitTool.add(options, mergeConfig(config));
		},

		async reset(
			options?: ResetOptions,
			config?: GitConfig,
		): Promise<GitResult<void>> {
			return gitTool.reset(options, mergeConfig(config));
		},

		// --- Diff Operations ---

		async diff(
			options?: DiffOptions,
			config?: GitConfig,
		): Promise<GitResult<GitDiff>> {
			return gitTool.diff(options, mergeConfig(config));
		},

		// --- Log Operations ---

		async log(
			options?: LogOptions,
			config?: GitConfig,
		): Promise<GitResult<GitCommit[]>> {
			return gitTool.log(options, mergeConfig(config));
		},

		// --- Worktree Operations ---

		async worktreeAdd(
			options: WorktreeAddOptions,
			config?: GitConfig,
		): Promise<WorktreeAddResult> {
			const timer = createTimer();
			const worktreeResult = await gitTool.worktreeAdd(
				options,
				mergeConfig(config),
			);

			if (worktreeResult.result._tag === "ok") {
				events?.emit("tool:git:worktree:add", {
					path: options.path,
					absolutePath: worktreeResult.absolutePath,
					branch: options.branch ?? options.newBranch ?? "HEAD",
					created: true,
					label: options.label,
					duration: timer.elapsed(),
				});
			} else {
				emitGitError(
					"worktreeAdd",
					worktreeResult.result.error.type,
					worktreeResult.result.error.message,
					worktreeResult.result.error.command,
					options.label,
				);
			}

			return worktreeResult;
		},

		async worktreeRemove(
			options: WorktreeRemoveOptions,
			config?: GitConfig,
		): Promise<GitResult<void>> {
			const timer = createTimer();
			const result = await gitTool.worktreeRemove(options, mergeConfig(config));

			if (result._tag === "ok") {
				events?.emit("tool:git:worktree:remove", {
					path: options.path,
					force: options.force ?? false,
					label: options.label,
					duration: timer.elapsed(),
				});
			} else {
				emitGitError(
					"worktreeRemove",
					result.error.type,
					result.error.message,
					result.error.command,
					options.label,
				);
			}

			return result;
		},

		async worktreeList(config?: GitConfig): Promise<GitResult<GitWorktree[]>> {
			return gitTool.worktreeList(mergeConfig(config));
		},

		// --- Stash Operations ---

		async stash(
			options?: StashOptions,
			config?: GitConfig,
		): Promise<GitResult<void>> {
			const timer = createTimer();
			const result = await gitTool.stash(options, mergeConfig(config));

			if (result._tag === "ok") {
				events?.emit("tool:git:stash", {
					action: "push" as const,
					message: options?.message,
					label: options?.label,
					duration: timer.elapsed(),
				});
			} else {
				emitGitError(
					"stash",
					result.error.type,
					result.error.message,
					result.error.command,
					options?.label,
				);
			}

			return result;
		},

		async stashPop(
			options?: StashPopOptions,
			config?: GitConfig,
		): Promise<GitResult<void>> {
			const timer = createTimer();
			const result = await gitTool.stashPop(options, mergeConfig(config));

			if (result._tag === "ok") {
				events?.emit("tool:git:stash", {
					action: "pop" as const,
					index: options?.index,
					label: options?.label,
					duration: timer.elapsed(),
				});
			} else {
				emitGitError(
					"stashPop",
					result.error.type,
					result.error.message,
					result.error.command,
					options?.label,
				);
			}

			return result;
		},

		async stashList(config?: GitConfig): Promise<GitResult<GitStashEntry[]>> {
			return gitTool.stashList(mergeConfig(config));
		},
	};
}
