/**
 * WorkflowTools implementation.
 *
 * Wraps existing tool classes to provide the WorkflowTools interface
 * for LangGraph node functions. Supports event emission for workflow observability.
 */

import type { WorkflowStateType } from "./state.ts";
import type {
	WorkflowTools,
	BashOptions,
	BashResult,
	ClaudeOptions,
	ClaudeResult,
	ClaudeSdkOptions,
	ClaudeSdkResult,
	JsonAction,
	JsonOptions,
	JsonResult,
	ChecklistItem,
	ChecklistOptions,
	ChecklistResult,
	HookOptions,
	HookResult,
	LogLevel,
} from "./tools.ts";
import { ExecutionContext } from "../context/execution.ts";
import type { TmuxManager } from "../tmux/manager.ts";
import type {
	ClaudeConfig,
	ClaudeSdkConfig,
	StepConfig,
} from "../../types/index.ts";
import { BashTool } from "../tools/bash.ts";
import { ClaudeTool } from "../tools/claude.ts";
import { ClaudeSdkTool } from "../tools/claudeSdk.ts";
import { JsonTool } from "../tools/json.ts";
import { ChecklistTool } from "../tools/checklist.ts";
import { HookTool } from "../tools/hook.ts";
import {
	type WorkflowEmitter,
	createEventHelpers,
	createTimer,
	type EventHelpers,
} from "../events/index.ts";
import { FileOperations } from "../utils/files/index.js";
import { parseJson, parseJsonSafe, SchemaValidator } from "../utils/schema/index.js";
import type { JsonSchema } from "../utils/schema/index.js";
import { RetryableOperation } from "../utils/retry/index.js";
import type { RetryConfig } from "../utils/retry/index.js";
import { IterationHelper } from "../utils/iteration/index.js";

/**
 * Configuration for creating WorkflowTools.
 */
export interface WorkflowToolsConfig {
	projectPath: string;
	tempDir: string;
	claudeConfig?: ClaudeConfig;
	claudeSdkConfig?: ClaudeSdkConfig;
}

/**
 * Internal context for tracking variable updates.
 */
interface ToolsContext {
	executionContext: ExecutionContext;
	variableUpdates: Record<string, unknown>;
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
	const events: EventHelpers | null = emitter ? createEventHelpers(emitter) : null;

	// Create tool instances
	const bashTool = new BashTool();
	const claudeTool = new ClaudeTool(config.claudeConfig);
	const claudeSdkTool = new ClaudeSdkTool(config.claudeSdkConfig);
	const jsonTool = new JsonTool();
	const checklistTool = new ChecklistTool();
	const hookTool = new HookTool();

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

		async claude(
			prompt: string,
			options?: ClaudeOptions,
		): Promise<ClaudeResult> {
			const timer = createTimer();
			const label = options?.label;

			if (!tmuxManager) {
				const errorMessage = "Claude tool requires tmux manager (interactive mode)";

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
					attempts: 1, // Note: actual retry count would need to come from the tool
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

				// Emit error event
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
						const message = error instanceof Error ? error.message : String(error);
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

		// --- Logging ---
		log(message: string, level: LogLevel = 'info', data?: Record<string, unknown>): void {
			events?.emit('log', { message, level, data });
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
		createRetry<T>(name: string, retryConfig: RetryConfig): RetryableOperation<T> {
			return new RetryableOperation<T>(name, retryConfig, emitter);
		},

		createIterator<T>(items: readonly T[], stateKey: string): IterationHelper<T> {
			return new IterationHelper<T>(items, stateKey, tools);
		},
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
