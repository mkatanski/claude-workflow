/**
 * WorkflowTools interface for LangGraph node functions.
 *
 * This interface provides a clean API for node functions to interact
 * with workflow tools without needing to know about the underlying
 * tool implementations.
 */

import type {
	BuiltInTool,
	ModelSpec,
	PermissionMode,
	SubagentDefinition,
	ToolsConfig,
} from "../tools/claudeAgent.types.js";
import type { AgentMessage, AgentSessionResult } from "../tools/claudeAgent.js";

// Re-export types that are used by consumers of tools.ts
export type { AgentMessage, AgentSessionResult } from "../tools/claudeAgent.js";
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
	GitError,
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
} from "../tools/git/types.js";
import type {
	WorkflowCallOptions,
	WorkflowCallResult,
} from "../composition/types.js";
import type { FileOperations } from "../utils/files/index.js";
import type { IterationHelper } from "../utils/iteration/index.js";
import type { RetryableOperation, RetryConfig } from "../utils/retry/index.js";
import type { JsonSchema, SchemaValidator } from "../utils/schema/index.js";

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
 * Token usage tracking for Claude sessions.
 */
export interface TokenUsage {
	/** Number of input tokens */
	input: number;
	/** Number of output tokens */
	output: number;
	/** Total tokens (input + output) */
	total: number;
}

/**
 * Configuration for a single session in parallel Claude execution.
 */
export interface ParallelClaudeConfig {
	/** The prompt to send to the Claude session */
	prompt: string;
	/** Unique identifier for the session (auto-generated if not provided) */
	id?: string;
	/** Model to use (alias or full ID) */
	model?: "sonnet" | "opus" | "haiku" | string;
	/** Tools to allow for this session */
	tools?: BuiltInTool[];
	/** System prompt for this session */
	systemPrompt?: string;
	/** Working directory for file operations */
	workingDirectory?: string;
	/** Timeout in milliseconds for this session */
	timeout?: number;
	/** Maximum budget in USD for this session */
	maxBudgetUsd?: number;
	/** Human-readable label for event display */
	label?: string;
}

/**
 * Options for parallel Claude execution.
 */
export interface ParallelClaudeOptions {
	/** Maximum number of concurrent sessions (default: 3, range: 1-5) */
	maxConcurrency?: number;
	/** Whether to continue executing remaining sessions when one fails (default: true) */
	continueOnError?: boolean;
	/** Maximum total timeout for all sessions in milliseconds */
	totalTimeout?: number;
	/** Maximum total budget in USD for all sessions */
	maxTotalBudgetUsd?: number;
	/** Human-readable label for event display */
	label?: string;
}

/**
 * Result for a single session in parallel Claude execution.
 */
export interface ClaudeSessionResult {
	/** Unique identifier for the session */
	id: string;
	/** Whether the session completed successfully */
	success: boolean;
	/** Final output text from the session */
	output?: string;
	/** All messages from the session */
	messages: AgentMessage[];
	/** Error message if session failed */
	error?: string;
	/** Token usage for this session */
	tokens: TokenUsage;
	/** Execution duration in milliseconds */
	duration: number;
	/** Time spent waiting in queue before execution in milliseconds */
	queueWaitTime: number;
	/** Model used for this session */
	model: string;
	/** Session ID for resume capability */
	sessionId?: string;
	/** Human-readable label (if provided) */
	label?: string;
}

/**
 * Summary statistics for parallel Claude execution.
 */
export interface ParallelClaudeSummary {
	/** Total number of sessions */
	total: number;
	/** Number of successful sessions */
	succeeded: number;
	/** Number of failed sessions */
	failed: number;
	/** Aggregated token usage across all sessions */
	totalTokens: TokenUsage;
	/** Estimated cost in USD based on model and token counts */
	estimatedCostUsd: number;
}

/**
 * Result of parallel Claude execution.
 */
export interface ParallelClaudeResult {
	/** Whether all sessions succeeded */
	success: boolean;
	/** Total execution duration in milliseconds */
	totalDuration: number;
	/** Individual results for each session */
	sessions: ClaudeSessionResult[];
	/** Summary statistics */
	summary: ParallelClaudeSummary;
	/** Get result for a specific session by ID */
	getSession(id: string): ClaudeSessionResult | undefined;
	/** Get outputs from all successful sessions */
	getSuccessfulOutputs(): Array<{ id: string; output: string }>;
	/** Get error details from all failed sessions */
	getErrors(): Array<{ id: string; error: string }>;
}

/**
 * Configuration for a single workflow in parallel execution.
 */
export interface ParallelWorkflowConfig {
	/** Workflow reference (name, name@version, or name:export) */
	name: string;
	/** Unique identifier for this workflow in results (auto-generated if not provided) */
	id?: string;
	/** Input data for the workflow */
	input?: Record<string, unknown>;
	/** Timeout for this specific workflow in milliseconds */
	timeout?: number;
	/** Human-readable label for events */
	label?: string;
}

/**
 * Options for parallel workflow execution.
 */
export interface ParallelWorkflowsOptions {
	/** Maximum concurrent workflows (1-10, default: 5) */
	maxConcurrency?: number;
	/** Continue executing when individual workflows fail (default: true) */
	continueOnError?: boolean;
	/** Total timeout for entire parallel operation in milliseconds */
	totalTimeout?: number;
	/** Human-readable label for the parallel operation */
	label?: string;
}

/**
 * Summary statistics for parallel workflow execution.
 */
export interface ParallelWorkflowsSummary {
	/** Total number of workflows */
	total: number;
	/** Number of successful workflows */
	succeeded: number;
	/** Number of failed workflows */
	failed: number;
	/** Number of workflows that timed out */
	timedOut: number;
}

/**
 * Result from a single workflow in parallel execution.
 */
export interface ParallelWorkflowResult {
	/** Unique identifier for the workflow */
	id: string;
	/** The workflow reference that was executed */
	reference: string;
	/** Whether the workflow completed successfully */
	success: boolean;
	/** Output data from the workflow (only present on success) */
	output?: unknown;
	/** Error details (only present on failure) */
	error?: import("../composition/types.js").WorkflowCallError;
	/** Execution duration in milliseconds */
	duration: number;
	/** Time spent waiting in queue before execution in milliseconds */
	queueWaitTime: number;
	/** Metadata about the resolved workflow */
	metadata: {
		/** Resolved workflow name */
		name: string;
		/** Resolved workflow version */
		version: string;
		/** Where the workflow was loaded from */
		source: string;
	};
	/** Human-readable label (if provided) */
	label?: string;
}

/**
 * Aggregated result from parallel workflow execution.
 */
export interface ParallelWorkflowsResult {
	/** Whether all workflows succeeded */
	success: boolean;
	/** Total execution duration in milliseconds */
	totalDuration: number;
	/** Individual results for each workflow */
	workflows: ParallelWorkflowResult[];
	/** Summary statistics */
	summary: ParallelWorkflowsSummary;
	/** Get result for a specific workflow by ID */
	getWorkflow(id: string): ParallelWorkflowResult | undefined;
	/** Get outputs from all successful workflows */
	getSuccessfulOutputs(): Array<{ id: string; output: unknown }>;
	/** Get error details from all failed workflows */
	getErrors(): Array<{
		id: string;
		error: import("../composition/types.js").WorkflowCallError;
	}>;
	/** Check if a specific workflow succeeded */
	isSuccessful(id: string): boolean;
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

	/**
	 * Enable planning mode for read-only exploration and plan generation.
	 * When enabled:
	 * - Tools are restricted to read-only operations (Read, Glob, Grep, WebFetch, WebSearch)
	 * - System prompt is augmented with plan mode instructions
	 * - Output is parsed for critical files and implementation steps
	 * - Plan is saved to temp storage and returned in the result
	 *
	 * Can be a boolean (uses default config) or a PlanModeConfig object.
	 */
	planMode?: boolean | import("../agents/types.js").PlanModeConfig;

	/**
	 * Agent configuration for customizing built-in agents.
	 * Allows excluding built-in agents, overriding their properties,
	 * or adding custom agents that work alongside built-in ones.
	 */
	agentConfig?: import("../agents/types.js").AgentConfigOptions;
}

/**
 * Options for planning agent session execution.
 * This function combines planning and implementation into a single workflow.
 */
export interface PlanningAgentSessionOptions {
	/** Model to use for planning phase (default: "opus") */
	planningModel?: ModelSpec;

	/** Model to use for implementation phase (default: "sonnet") */
	implementationModel?: ModelSpec;

	/**
	 * Path to an existing plan file.
	 * If provided, skips the planning phase and uses this plan for implementation.
	 */
	planPath?: string;

	/** Session ID to resume implementation from a previous session */
	resumeImplementation?: string;

	/** Permission mode for implementation phase */
	permissionMode?: PermissionMode;

	/** Working directory for file operations */
	workingDirectory: string;

	/** Human-readable label for event display */
	label?: string;

	/** Maximum budget in USD for the entire session */
	maxBudgetUsd?: number;

	/**
	 * Stop after planning phase without implementing.
	 * Returns the plan in the result without executing implementation.
	 */
	planOnly?: boolean;

	/**
	 * Agent configuration for customizing built-in agents.
	 */
	agentConfig?: import("../agents/types.js").AgentConfigOptions;
}

/**
 * Plan information returned from planning agent session.
 */
export interface PlanInfo {
	/** The plan content (markdown format) */
	content: string;
	/** Path where the plan was saved */
	path: string;
	/** Session ID of the planning session */
	sessionId?: string;
	/** List of critical files identified in the plan */
	criticalFiles: string[];
}

/**
 * Implementation information returned from planning agent session.
 */
export interface ImplementationInfo {
	/** Session ID of the implementation session */
	sessionId?: string;
}

/**
 * Result of a planning agent session execution.
 * Extends AgentSessionResult with plan and implementation metadata.
 */
export interface PlanningAgentSessionResult {
	/** Whether the entire session (planning + implementation) completed successfully */
	success: boolean;
	/** Final output text from the implementation (or planning if planOnly) */
	output: string;
	/** Error message if session failed */
	error?: string;
	/** Total duration of the session in milliseconds */
	duration: number;

	/** Plan information from the planning phase */
	plan: PlanInfo;

	/** Implementation information (undefined if planOnly was true) */
	implementation?: ImplementationInfo;
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
	 * Execute a planning agent session that combines planning and implementation.
	 *
	 * This high-level function:
	 * 1. Executes a planning phase with opus model (read-only tools)
	 * 2. Saves the plan to a temp file
	 * 3. Executes an implementation phase with sonnet model (full tools)
	 * 4. Returns the combined result
	 *
	 * @param prompt - The prompt describing what to implement
	 * @param options - Planning agent session configuration options
	 * @returns Promise resolving to the planning session result
	 *
	 * @example
	 * ```typescript
	 * // Full planning + implementation workflow
	 * const result = await tools.planningAgentSession(
	 *   "Implement user authentication with JWT",
	 *   { workingDirectory: "/path/to/project" }
	 * );
	 *
	 * // Planning only (no implementation)
	 * const planResult = await tools.planningAgentSession(
	 *   "Design the database schema",
	 *   { workingDirectory: "/path/to/project", planOnly: true }
	 * );
	 *
	 * // Resume from existing plan
	 * const resumeResult = await tools.planningAgentSession(
	 *   "Continue implementation",
	 *   { workingDirectory: "/path/to/project", planPath: "/tmp/plan.md" }
	 * );
	 * ```
	 */
	planningAgentSession(
		prompt: string,
		options: PlanningAgentSessionOptions,
	): Promise<PlanningAgentSessionResult>;

	/**
	 * Execute multiple Claude Agent SDK sessions concurrently.
	 *
	 * Sessions execute in parallel with configurable concurrency limits.
	 * Uses Promise.allSettled semantics by default - individual session
	 * failures don't abort other sessions unless continueOnError is false.
	 *
	 * @param sessions - Array of session configurations to execute
	 * @param options - Parallel execution options
	 * @returns Promise resolving to results with summary, token tracking, and helper methods
	 *
	 * @example
	 * ```typescript
	 * // Execute multiple analysis tasks in parallel
	 * const result = await tools.parallelClaude([
	 *   { prompt: 'Analyze security vulnerabilities', id: 'security', workingDirectory: './src' },
	 *   { prompt: 'Review code quality', id: 'quality', model: 'sonnet' },
	 *   { prompt: 'Generate documentation', id: 'docs', systemPrompt: 'You are a technical writer' },
	 * ], { maxConcurrency: 3 });
	 *
	 * // Check overall success
	 * if (result.success) {
	 *   console.log('All sessions succeeded');
	 * }
	 *
	 * // Get specific session result
	 * const securityResult = result.getSession('security');
	 *
	 * // Get all successful outputs
	 * const outputs = result.getSuccessfulOutputs();
	 *
	 * // Get error details
	 * const errors = result.getErrors();
	 *
	 * // Access token usage summary
	 * console.log(`Total tokens: ${result.summary.totalTokens.total}`);
	 * console.log(`Estimated cost: $${result.summary.estimatedCostUsd.toFixed(4)}`);
	 * ```
	 */
	parallelClaude(
		sessions: ParallelClaudeConfig[],
		options?: ParallelClaudeOptions,
	): Promise<ParallelClaudeResult>;

	/**
	 * Execute multiple workflows concurrently.
	 *
	 * Workflows execute in parallel with configurable concurrency limits.
	 * Uses Promise.allSettled semantics by default - individual workflow
	 * failures don't abort other workflows unless continueOnError is false.
	 *
	 * @param workflows - Array of workflow configurations to execute
	 * @param options - Parallel execution options
	 * @returns Promise resolving to results with summary and helper methods
	 *
	 * @example
	 * ```typescript
	 * // Execute multiple workflows in parallel
	 * const result = await tools.parallelWorkflows([
	 *   { name: 'lint', id: 'lint-check', input: { path: './src' } },
	 *   { name: 'test', id: 'unit-tests', timeout: 60000 },
	 *   { name: 'build', id: 'build-app', label: 'Build Application' },
	 * ], { maxConcurrency: 3 });
	 *
	 * // Check overall success
	 * if (result.success) {
	 *   console.log('All workflows succeeded');
	 * }
	 *
	 * // Get specific workflow result
	 * const lintResult = result.getWorkflow('lint-check');
	 *
	 * // Get all successful outputs
	 * const outputs = result.getSuccessfulOutputs();
	 *
	 * // Get error details
	 * const errors = result.getErrors();
	 *
	 * // Check if specific workflow succeeded
	 * if (result.isSuccessful('unit-tests')) {
	 *   console.log('Tests passed');
	 * }
	 *
	 * // Access summary statistics
	 * console.log(`Completed: ${result.summary.succeeded}/${result.summary.total}`);
	 * ```
	 */
	parallelWorkflows(
		workflows: ParallelWorkflowConfig[],
		options?: ParallelWorkflowsOptions,
	): Promise<ParallelWorkflowsResult>;

	/**
	 * Execute a sub-workflow by reference.
	 *
	 * Enables workflow composition by calling other workflows from within
	 * a workflow node. Sub-workflows execute with isolated state and
	 * inherit context from the parent workflow.
	 *
	 * Reference formats:
	 * - `name` - Call the default export of a workflow by name
	 * - `name@version` - Call a specific version (semver range supported)
	 * - `name:export` - Call a named export from the workflow
	 * - `name@version:export` - Combine version and export
	 *
	 * @param reference - Workflow reference string
	 * @param options - Call options including input, timeout, and cwd
	 * @returns Promise resolving to result with output or error (never throws)
	 *
	 * @example
	 * ```typescript
	 * // Basic workflow call
	 * const result = await tools.workflow('analyze-code', {
	 *   input: { path: './src' },
	 *   timeout: 30000,
	 *   label: 'analyze',
	 * });
	 *
	 * if (result.success) {
	 *   console.log('Analysis complete:', result.output);
	 * } else {
	 *   console.error('Analysis failed:', result.error?.message);
	 * }
	 *
	 * // With version constraint
	 * const result = await tools.workflow('lint@^2.0.0', {
	 *   input: { files: ['*.ts'] },
	 * });
	 *
	 * // With named export
	 * const result = await tools.workflow('utils:formatCode', {
	 *   input: { code: sourceCode },
	 * });
	 * ```
	 */
	workflow<TInput = unknown, TOutput = unknown>(
		reference: string,
		options?: WorkflowCallOptions<TInput>,
	): Promise<WorkflowCallResult<TOutput>>;

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

// =============================================================================
// Workflow Composition Type Re-exports
// =============================================================================

/**
 * Re-export workflow composition types for use by workflow nodes.
 * These types are needed when working with tools.workflow().
 */
export type {
	WorkflowCallOptions,
	WorkflowCallResult,
} from "../composition/types.js";
export type {
	WorkflowCallError,
	WorkflowCallErrorCode,
	WorkflowCallMetadata,
	WorkflowSource,
	ValidationError,
} from "../composition/types.js";

// =============================================================================
// Agent Type Re-exports
// =============================================================================

/**
 * Re-export agent types for use by workflow nodes.
 * These types are needed when working with tools.agentSession() plan mode.
 */
export type {
	AgentConfigOptions,
	BuiltInAgentName,
	PlanFile,
	PlanModeConfig,
	PlanModeResult,
	PlanStatus,
} from "../agents/types.js";
