/**
 * WorkflowTools interface for LangGraph node functions.
 *
 * This interface provides a clean API for node functions to interact
 * with workflow tools without needing to know about the underlying
 * tool implementations.
 */

import type { FileOperations } from "../utils/files/index.js";
import type { SchemaValidator, JsonSchema } from "../utils/schema/index.js";
import type { RetryableOperation, RetryConfig } from "../utils/retry/index.js";
import type { IterationHelper } from "../utils/iteration/index.js";
import type {
	GitConfig,
	GitOperations,
	GitStatus,
	GitBranch,
	GitCommit,
	GitDiff,
	GitWorktree,
	GitStashEntry,
	GitRemote,
	GitError,
	GitResult,
	CreateBranchOptions,
	SwitchBranchOptions,
	DeleteBranchOptions,
	ListBranchesOptions,
	CommitOptions,
	AddOptions,
	ResetOptions,
	DiffOptions,
	LogOptions,
	WorktreeAddOptions,
	WorktreeRemoveOptions,
	StashOptions,
	StashPopOptions,
} from "../tools/git/types.js";
import type {
	ModelSpec,
	ToolsConfig,
	BuiltInTool,
	PermissionMode,
	SubagentDefinition,
	AgentMessageType,
	AgentMessageSubtype,
	AgentErrorType,
} from "../tools/claudeAgent.types.js";

/**
 * Options for bash command execution.
 */
export interface BashOptions {
	/** Working directory for command execution */
	cwd?: string;
	/** Whether to show output in tmux pane */
	visible?: boolean;
	/** Whether to strip whitespace from output */
	stripOutput?: boolean;
	/** Environment variables to set */
	env?: Record<string, string>;
	/** Human-readable label for event display */
	label?: string;
}

/**
 * Result of bash command execution.
 */
export interface BashResult {
	success: boolean;
	output: string;
	error?: string;
}

/**
 * Configuration for a single command in parallel bash execution.
 */
export interface ParallelBashConfig {
	/** The command to execute */
	command: string;
	/** Unique identifier for the command (auto-generated if not provided) */
	id?: string;
	/** Working directory for command execution */
	cwd?: string;
	/** Timeout in milliseconds for this command (default: 120000ms / 2 minutes) */
	timeout?: number;
	/** Environment variables to set for this command */
	env?: Record<string, string>;
	/** Human-readable label for event display */
	label?: string;
}

/**
 * Options for parallel bash execution.
 */
export interface ParallelBashOptions {
	/** Maximum number of concurrent commands (default: 5, range: 1-10) */
	maxConcurrency?: number;
	/** Whether to continue executing remaining commands when one fails (default: true) */
	continueOnError?: boolean;
	/** Maximum total timeout for all commands in milliseconds */
	totalTimeout?: number;
	/** Maximum output size in bytes before truncation (default: 1MB / 1048576 bytes) */
	maxOutputSize?: number;
	/** Human-readable label for event display */
	label?: string;
}

/**
 * Result for a single command in parallel bash execution.
 */
export interface BashCommandResult {
	/** Unique identifier for the command */
	id: string;
	/** The command that was executed */
	command: string;
	/** Whether the command succeeded (exit code 0) */
	success: boolean;
	/** Standard output from the command */
	stdout: string;
	/** Standard error output from the command */
	stderr: string;
	/** Exit code from the command */
	exitCode: number;
	/** Execution duration in milliseconds */
	duration: number;
	/** Time spent waiting in queue before execution in milliseconds */
	queueWaitTime: number;
	/** Whether the output was truncated due to size limits */
	truncated: boolean;
	/** Error message if command failed */
	error?: string;
	/** Human-readable label (if provided) */
	label?: string;
}

/**
 * Summary statistics for parallel bash execution.
 */
export interface ParallelBashSummary {
	/** Total number of commands */
	total: number;
	/** Number of successful commands */
	succeeded: number;
	/** Number of failed commands */
	failed: number;
	/** Number of commands that timed out */
	timedOut: number;
}

/**
 * Result of parallel bash execution.
 */
export interface ParallelBashResult {
	/** Whether all commands succeeded */
	success: boolean;
	/** Individual results for each command */
	results: BashCommandResult[];
	/** Summary statistics */
	summary: ParallelBashSummary;
	/** Total execution duration in milliseconds */
	duration: number;
	/** Get result for a specific command by ID */
	getCommand(id: string): BashCommandResult | undefined;
	/** Get outputs from all successful commands */
	getSuccessfulOutputs(): string[];
	/** Get error details from all failed commands */
	getErrors(): Array<{
		id: string;
		command: string;
		error: string;
		stderr: string;
	}>;
}

/**
 * Options for Claude Code execution.
 */
export interface ClaudeOptions {
	/** Model override for this specific call */
	model?: string;
	/** Human-readable label for event display */
	label?: string;
}

/**
 * Result of Claude Code execution.
 */
export interface ClaudeResult {
	success: boolean;
	output: string;
	error?: string;
}

/**
 * Output type for Claude SDK structured output.
 */
export type ClaudeSdkOutputType = "boolean" | "enum" | "decision" | "schema";

/**
 * Options for Claude SDK execution.
 */
export interface ClaudeSdkOptions {
	/** Output type for structured response */
	outputType?: ClaudeSdkOutputType;
	/** Schema for structured output (required for enum/schema types) */
	schema?: Record<string, unknown>;
	/** System prompt override */
	systemPrompt?: string;
	/** Model override */
	model?: string;
	/** Maximum retry attempts for validation failures */
	maxRetries?: number;
	/** Human-readable label for event display */
	label?: string;
}

/**
 * Result of Claude SDK execution.
 */
export interface ClaudeSdkResult<T = unknown> {
	success: boolean;
	output: string;
	data?: T;
	error?: string;
	/** For decision output type, the goto step name */
	gotoStep?: string;
}

/**
 * JSON tool action types.
 */
export type JsonAction =
	| "query"
	| "set"
	| "parse"
	| "stringify"
	| "merge"
	| "keys"
	| "values"
	| "length";

/**
 * Options for JSON tool operations.
 */
export interface JsonOptions {
	/** Input data (as JSON string or object) */
	input?: string;
	/** JMESPath query (for query action) */
	query?: string;
	/** Dot-notation path (for set action) */
	path?: string;
	/** New value to set or merge */
	value?: string;
	/** Human-readable label for event display */
	label?: string;
}

/**
 * Result of JSON tool operations.
 */
export interface JsonResult {
	success: boolean;
	output: string;
	error?: string;
}

/**
 * Check item for checklist tool.
 */
export interface ChecklistItem {
	name: string;
	type: "bash" | "regex" | "model";
	severity?: "error" | "warning" | "info";
	// bash type
	command?: string;
	expect?: string | number;
	expectNot?: string;
	expectRegex?: string;
	// regex type
	pattern?: string;
	files?: string;
	exclude?: string;
	// model type
	prompt?: string;
	passPattern?: string;
	contextVars?: string[];
}

/**
 * Options for checklist execution.
 */
export interface ChecklistOptions {
	/** Behavior when checks fail: stop, warn, or continue */
	onFail?: "stop" | "warn" | "continue";
	/** Human-readable label for event display */
	label?: string;
}

/**
 * Result of checklist execution.
 */
export interface ChecklistResult {
	success: boolean;
	output: string;
	passedCount: number;
	totalCount: number;
	hasErrors: boolean;
	hasWarnings: boolean;
}

/**
 * Options for hook execution.
 */
export interface HookOptions {
	/** Human-readable label for event display */
	label?: string;
}

/**
 * Result of hook execution.
 */
export interface HookResult {
	success: boolean;
	output: string;
	error?: string;
}

/**
 * Options for agent session execution.
 */
export interface AgentSessionOptions {
	/** Model to use (alias or full ID) */
	model?: ModelSpec;
	/** Tools to allow */
	tools?: ToolsConfig;
	/** Tools to disallow */
	disallowedTools?: BuiltInTool[];
	/** System prompt to use */
	systemPrompt?: string;
	/** Permission mode for tool execution */
	permissionMode?: PermissionMode;
	/** Working directory for file operations */
	workingDirectory?: string;
	/** Subagent definitions */
	agents?: Record<string, SubagentDefinition>;
	/** Maximum budget in USD */
	maxBudgetUsd?: number;
	/** Session ID to resume */
	resume?: string;
	/** Human-readable label for event display */
	label?: string;
}

/**
 * Message from an agent session conversation.
 */
export interface AgentMessage {
	/** Type of the message */
	type: AgentMessageType;
	/** Text content (for assistant/error messages) */
	content?: string;
	/** Tool name (for tool_call/tool_result) */
	toolName?: string;
	/** Tool input parameters */
	toolInput?: unknown;
	/** Tool execution result */
	toolResult?: unknown;
	/** Error message */
	error?: string;
	/** Session ID for tracking */
	sessionId?: string;
	/** Message subtype for system messages */
	subtype?: AgentMessageSubtype;
	/** Agent name for subagent messages */
	agentName?: string;
}

/**
 * Result of an agent session execution.
 */
export interface AgentSessionResult {
	/** Whether the session completed successfully */
	success: boolean;
	/** Final output text from the session */
	output: string;
	/** All messages from the session */
	messages: AgentMessage[];
	/** Session ID for resume capability */
	sessionId?: string;
	/** Duration of the session in milliseconds */
	duration: number;
	/** Error message if session failed */
	error?: string;
	/** Error type category */
	errorType?: AgentErrorType;
}

/**
 * WorkflowTools interface - the facade for all workflow tools.
 *
 * This interface is passed to node functions, providing a clean API
 * to interact with workflow capabilities without coupling to
 * implementation details.
 */
export interface WorkflowTools {
	// --- Variable access ---

	/**
	 * Get a variable value with optional default.
	 */
	getVar<T>(name: string, defaultValue?: T): T | undefined;

	/**
	 * Set a variable value.
	 */
	setVar(name: string, value: unknown): void;

	/**
	 * Interpolate a template string with variable values.
	 * Supports {var} and {var.field.nested} syntax.
	 */
	interpolate(template: string): string;

	// --- Tool execution ---

	/**
	 * Execute a bash command.
	 */
	bash(command: string, options?: BashOptions): Promise<BashResult>;

	/**
	 * Execute multiple bash commands in parallel.
	 *
	 * Commands execute concurrently with configurable concurrency limits.
	 * Uses Promise.allSettled semantics by default - individual command
	 * failures don't abort other commands unless continueOnError is false.
	 *
	 * @param commands - Array of command configurations to execute
	 * @param options - Parallel execution options
	 * @returns Promise resolving to results with summary and helper methods
	 *
	 * @example
	 * ```typescript
	 * // Execute multiple builds in parallel
	 * const result = await tools.parallelBash([
	 *   { command: 'npm run build', id: 'build', cwd: './frontend' },
	 *   { command: 'npm run build', id: 'api', cwd: './backend' },
	 *   { command: 'npm run lint', id: 'lint' },
	 * ], { maxConcurrency: 3 });
	 *
	 * // Check overall success
	 * if (result.success) {
	 *   console.log('All commands succeeded');
	 * }
	 *
	 * // Get specific command result
	 * const buildResult = result.getCommand('build');
	 *
	 * // Get all successful outputs
	 * const outputs = result.getSuccessfulOutputs();
	 *
	 * // Get error details
	 * const errors = result.getErrors();
	 * ```
	 */
	parallelBash(
		commands: ParallelBashConfig[],
		options?: ParallelBashOptions,
	): Promise<ParallelBashResult>;

	/**
	 * Execute Claude Code with a prompt.
	 */
	claude(prompt: string, options?: ClaudeOptions): Promise<ClaudeResult>;

	/**
	 * Execute Claude SDK for structured output.
	 */
	claudeSdk<T = unknown>(
		prompt: string,
		options?: ClaudeSdkOptions,
	): Promise<ClaudeSdkResult<T>>;

	/**
	 * Execute JSON manipulation operations.
	 */
	json(action: JsonAction, options?: JsonOptions): JsonResult;

	/**
	 * Execute a checklist of validation checks.
	 */
	checklist(
		items: ChecklistItem[],
		options?: ChecklistOptions,
	): Promise<ChecklistResult>;

	/**
	 * Execute a project hook by name.
	 */
	hook(name: string, options?: HookOptions): Promise<HookResult>;

	/**
	 * Execute a multi-turn agent session using Claude Agent SDK.
	 * Supports tool use, subagents, and session resume capability.
	 *
	 * @param prompt - The prompt to send to the agent
	 * @param options - Agent session configuration options
	 * @returns Promise resolving to the session result with messages and sessionId
	 */
	agentSession(
		prompt: string,
		options?: AgentSessionOptions,
	): Promise<AgentSessionResult>;

	/**
	 * Git operations for repository management.
	 *
	 * Provides access to Git operations including:
	 * - Status: status(), isRepo(), getBranch(), getRemotes()
	 * - Branch: createBranch(), switchBranch(), deleteBranch(), listBranches()
	 * - Commit: commit(), add(), reset()
	 * - Diff: diff()
	 * - Log: log()
	 * - Worktree: worktreeAdd(), worktreeRemove(), worktreeList()
	 * - Stash: stash(), stashPop(), stashList()
	 *
	 * All operations return Result<T, GitError> for proper error handling.
	 *
	 * @example
	 * ```typescript
	 * // Get repository status
	 * const statusResult = await tools.git.status();
	 * if (isOk(statusResult)) {
	 *   console.log(`On branch ${statusResult.value.branch}`);
	 * }
	 *
	 * // Create and switch to a new branch
	 * await tools.git.createBranch({ name: 'feature/new', checkout: true });
	 *
	 * // Commit changes
	 * await tools.git.add({ all: true });
	 * const commitResult = await tools.git.commit({ message: 'Add new feature' });
	 * ```
	 */
	readonly git: GitOperations;

	// --- Logging ---

	/**
	 * Log a message at the specified level.
	 * Messages are emitted as events and rendered by the active renderer.
	 *
	 * @param message - Message to log
	 * @param level - Log level (default: 'info')
	 * @param data - Optional structured data to include
	 */
	log(message: string, level?: LogLevel, data?: Record<string, unknown>): void;

	/**
	 * Emit a custom event with arbitrary data.
	 * Useful for workflow-specific events that renderers can handle.
	 *
	 * @param name - Event name (e.g., 'story:complete', 'milestone:summary')
	 * @param data - Event data
	 */
	emit(name: string, data: Record<string, unknown>): void;

	// --- Context properties ---

	/** Project root path */
	readonly projectPath: string;

	/** Temporary directory for workflow files */
	readonly tempDir: string;

	// --- Utilities ---

	/**
	 * File operations service for reading/writing files.
	 * Provides Result-based error handling instead of exceptions.
	 */
	readonly files: FileOperations;

	/**
	 * Schema validator for JSON parsing and validation.
	 */
	readonly schema: {
		/**
		 * Parse JSON string safely.
		 */
		parseJson<T>(
			json: string,
		): import("../utils/result/index.js").ResultBox<T, string>;

		/**
		 * Parse JSON with fallback value.
		 */
		parseJsonSafe<T>(json: string, defaultValue: T): T;

		/**
		 * Create a reusable validator for a schema.
		 */
		createValidator<T>(schema: JsonSchema): SchemaValidator<T>;
	};

	// --- Utility factories ---

	/**
	 * Create a retry operation handler.
	 *
	 * @param name - Operation name for logging/events
	 * @param config - Retry configuration
	 */
	createRetry<T>(name: string, config: RetryConfig): RetryableOperation<T>;

	/**
	 * Create an iteration helper for array processing.
	 *
	 * @param items - Array to iterate
	 * @param stateKey - State key for storing current index
	 */
	createIterator<T>(items: readonly T[], stateKey: string): IterationHelper<T>;
}

/** Log level type */
export type LogLevel = "debug" | "info" | "warn" | "error";

// =============================================================================
// Git Type Re-exports
// =============================================================================

/**
 * Re-export Git types for use by workflow nodes.
 * These types are needed when working with the tools.git operations.
 */
export type {
	// Core types
	GitConfig,
	GitOperations,
	GitError,
	GitResult,
	// Status types
	GitStatus,
	GitRemote,
	// Branch types
	GitBranch,
	CreateBranchOptions,
	SwitchBranchOptions,
	DeleteBranchOptions,
	ListBranchesOptions,
	// Commit types
	GitCommit,
	CommitOptions,
	AddOptions,
	ResetOptions,
	// Diff types
	GitDiff,
	DiffOptions,
	// Log types
	LogOptions,
	// Worktree types
	GitWorktree,
	WorktreeAddOptions,
	WorktreeRemoveOptions,
	// Stash types
	GitStashEntry,
	StashOptions,
	StashPopOptions,
};
