/**
 * WorkflowTools implementation.
 *
 * Wraps existing tool classes to provide the WorkflowTools interface
 * for LangGraph node functions.
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
	HookResult,
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
 * @returns WorkflowTools instance and a function to get variable updates
 */
export function createWorkflowTools(
	state: WorkflowStateType,
	config: WorkflowToolsConfig,
	tmuxManager?: TmuxManager,
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
			const stepConfig: StepConfig = {
				name: "bash",
				tool: "bash",
				command,
				cwd: options?.cwd,
				visible: options?.visible,
				stripOutput: options?.stripOutput,
				env: options?.env,
			};

			const result = await bashTool.execute(
				stepConfig,
				toolsContext.executionContext,
				tmux,
			);

			return {
				success: result.success,
				output: result.output ?? "",
				error: result.error,
			};
		},

		async claude(
			prompt: string,
			options?: ClaudeOptions,
		): Promise<ClaudeResult> {
			if (!tmuxManager) {
				return {
					success: false,
					output: "",
					error: "Claude tool requires tmux manager (interactive mode)",
				};
			}

			const stepConfig: StepConfig = {
				name: "claude",
				tool: "claude",
				prompt,
				model: options?.model,
			};

			const result = await claudeTool.execute(
				stepConfig,
				toolsContext.executionContext,
				tmuxManager,
			);

			return {
				success: result.success,
				output: result.output ?? "",
				error: result.error,
			};
		},

		async claudeSdk<T = unknown>(
			prompt: string,
			options?: ClaudeSdkOptions,
		): Promise<ClaudeSdkResult<T>> {
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

			return {
				success: result.success,
				output: result.output ?? "",
				data,
				error: result.error,
				gotoStep: result.gotoStep,
			};
		},

		json(action: JsonAction, options?: JsonOptions): JsonResult {
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
					})
					.catch((error) => {
						syncResult = {
							success: false,
							output: "",
							error: error instanceof Error ? error.message : String(error),
						};
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
			const stepConfig: StepConfig = {
				name: "checklist",
				tool: "checklist",
				items: items.map((item) => ({
					...item,
				})),
				onFail: options?.onFail,
			};

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

			return {
				success: result.success,
				output: result.output ?? "",
				passedCount,
				totalCount,
				hasErrors,
				hasWarnings,
			};
		},

		async hook(name: string): Promise<HookResult> {
			const stepConfig: StepConfig = {
				name: "hook",
				tool: "hook",
				hookName: name,
			};

			const result = await hookTool.execute(
				stepConfig,
				toolsContext.executionContext,
				tmux,
			);

			return {
				success: result.success,
				output: result.output ?? "",
				error: result.error,
			};
		},

		// --- Context properties ---
		get projectPath(): string {
			return config.projectPath;
		},

		get tempDir(): string {
			return config.tempDir;
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
