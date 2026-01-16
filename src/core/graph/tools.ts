/**
 * WorkflowTools interface for LangGraph node functions.
 *
 * This interface provides a clean API for node functions to interact
 * with workflow tools without needing to know about the underlying
 * tool implementations.
 */

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
}

/** Log level type */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
