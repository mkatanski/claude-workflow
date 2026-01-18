/**
 * Types for workflow debugging system.
 *
 * This module defines all types for the debugger infrastructure including:
 * - Breakpoint management (line and conditional breakpoints)
 * - Debug execution state and control
 * - Step execution modes
 * - Variable inspection
 * - Execution checkpoints and replay
 * - Debug Adapter Protocol (DAP) support for VS Code integration
 */

// ============================================================================
// Debugger Configuration
// ============================================================================

/**
 * Configuration options for the debugger.
 */
export interface DebuggerConfig {
	/** Enable step-through debugging */
	enabled: boolean;

	/** Initial breakpoints to set */
	breakpoints?: Breakpoint[];

	/** Auto-break on workflow start */
	breakOnStart?: boolean;

	/** Auto-break on node errors */
	breakOnError?: boolean;

	/** Auto-break on specific events */
	breakOnEvents?: string[];

	/** Path to save execution trace */
	traceOutputPath?: string;

	/** Enable Debug Adapter Protocol server for VS Code */
	enableDapServer?: boolean;

	/** DAP server port (default: 4711) */
	dapServerPort?: number;
}

// ============================================================================
// Breakpoint Types
// ============================================================================

/**
 * Base breakpoint interface.
 */
export interface BaseBreakpoint {
	/** Unique breakpoint identifier */
	id: string;

	/** Whether this breakpoint is enabled */
	enabled: boolean;

	/** Optional condition for conditional breakpoints */
	condition?: string;

	/** Optional hit count (break only on Nth hit) */
	hitCount?: number;

	/** Log message instead of breaking (logpoint) */
	logMessage?: string;
}

/**
 * Node breakpoint - breaks before/after a specific node executes.
 */
export interface NodeBreakpoint extends BaseBreakpoint {
	type: "node";

	/** Node name to break on */
	nodeName: string;

	/** When to break: before or after node execution */
	when: "before" | "after";
}

/**
 * Event breakpoint - breaks when a specific event is emitted.
 */
export interface EventBreakpoint extends BaseBreakpoint {
	type: "event";

	/** Event type to break on (supports wildcards like 'tool:*') */
	eventType: string;
}

/**
 * Exception breakpoint - breaks when errors occur.
 */
export interface ExceptionBreakpoint extends BaseBreakpoint {
	type: "exception";

	/** Break on all exceptions or only uncaught */
	mode: "all" | "uncaught";
}

/**
 * Union of all breakpoint types.
 */
export type Breakpoint = NodeBreakpoint | EventBreakpoint | ExceptionBreakpoint;

/**
 * Breakpoint hit information when a breakpoint is triggered.
 */
export interface BreakpointHit {
	/** The breakpoint that was hit */
	breakpoint: Breakpoint;

	/** Timestamp when breakpoint was hit */
	timestamp: string;

	/** Current execution context */
	context: DebugContext;

	/** Reason for the break */
	reason: string;

	/** Number of times this breakpoint has been hit */
	hitCount: number;
}

// ============================================================================
// Debug Execution State
// ============================================================================

/**
 * Current execution state of the debugger.
 */
export type DebugExecutionState =
	| "running" // Normal execution, no debugging
	| "paused" // Execution paused at breakpoint or step
	| "stepping" // Stepping through execution
	| "stopped" // Execution stopped/terminated
	| "error"; // Debugger encountered an error

/**
 * Step execution modes.
 */
export type StepMode =
	| "continue" // Continue until next breakpoint
	| "step-over" // Execute current node and pause at next
	| "step-into" // Step into node function (for nested workflows)
	| "step-out" // Step out of current node/scope
	| "pause"; // Pause execution

/**
 * Debug execution context - current state during debugging.
 */
export interface DebugContext {
	/** Current workflow name */
	workflowName: string;

	/** Current node being executed (if any) */
	currentNode?: string;

	/** Previous node that was executed */
	previousNode?: string;

	/** Next node to be executed */
	nextNode?: string;

	/** Current workflow variables */
	variables: Record<string, unknown>;

	/** Call stack for nested workflows */
	callStack: StackFrame[];

	/** Current event being processed (if any) */
	currentEvent?: {
		type: string;
		payload: unknown;
	};
}

/**
 * Stack frame for execution call stack.
 */
export interface StackFrame {
	/** Frame identifier */
	id: number;

	/** Workflow or node name */
	name: string;

	/** Source location (node name or file path) */
	source: string;

	/** Variables in this scope */
	variables: Record<string, unknown>;

	/** Parent frame ID (if nested) */
	parentFrameId?: number;
}

// ============================================================================
// Variable Inspection
// ============================================================================

/**
 * Variable scope for inspection.
 */
export type VariableScope = "workflow" | "node" | "local";

/**
 * Variable information for inspection.
 */
export interface VariableInfo {
	/** Variable name */
	name: string;

	/** Variable value */
	value: unknown;

	/** Type of the value */
	type: string;

	/** Scope where variable is defined */
	scope: VariableScope;

	/** Whether the variable is read-only */
	readonly: boolean;

	/** For objects/arrays: child variable count */
	childCount?: number;

	/** For objects/arrays: child variables (lazy-loaded) */
	children?: VariableInfo[];

	/** Variable reference ID for DAP */
	variableReference?: number;
}

/**
 * Request to inspect variables in a scope.
 */
export interface VariableInspectionRequest {
	/** Scope to inspect */
	scope?: VariableScope;

	/** Variable name pattern (supports wildcards) */
	namePattern?: string;

	/** Frame ID for call stack inspection */
	frameId?: number;

	/** Maximum depth for object expansion */
	maxDepth?: number;
}

// ============================================================================
// Execution Checkpoints and Replay
// ============================================================================

/**
 * Execution checkpoint for replay functionality.
 */
export interface ExecutionCheckpoint {
	/** Unique checkpoint identifier */
	id: string;

	/** Timestamp when checkpoint was created */
	timestamp: string;

	/** Workflow name */
	workflowName: string;

	/** Node name where checkpoint was created */
	nodeName: string;

	/** Workflow variables at this point */
	variables: Record<string, unknown>;

	/** Execution sequence number */
	sequenceNumber: number;

	/** Events emitted up to this point */
	events: CheckpointEvent[];

	/** Metadata for the checkpoint */
	metadata?: Record<string, unknown>;
}

/**
 * Event stored in checkpoint for replay.
 */
export interface CheckpointEvent {
	/** Event type */
	type: string;

	/** Event payload */
	payload: unknown;

	/** Timestamp */
	timestamp: string;

	/** Node context */
	nodeName?: string;
}

/**
 * Execution trace - full record of workflow execution.
 */
export interface ExecutionTrace {
	/** Trace identifier */
	id: string;

	/** Workflow name */
	workflowName: string;

	/** Start timestamp */
	startTime: string;

	/** End timestamp (if completed) */
	endTime?: string;

	/** Execution status */
	status: "running" | "completed" | "failed";

	/** Error information (if failed) */
	error?: {
		message: string;
		stack?: string;
		nodeName?: string;
	};

	/** All checkpoints in execution order */
	checkpoints: ExecutionCheckpoint[];

	/** All events in execution order */
	events: CheckpointEvent[];

	/** Initial variables */
	initialVariables: Record<string, unknown>;

	/** Final variables (if completed) */
	finalVariables?: Record<string, unknown>;

	/** Total duration in milliseconds */
	duration?: number;
}

/**
 * Replay options for re-executing from a checkpoint.
 */
export interface ReplayOptions {
	/** Checkpoint ID to replay from */
	fromCheckpoint: string;

	/** Execution trace to replay */
	trace: ExecutionTrace;

	/** Whether to break on each step during replay */
	stepThroughReplay?: boolean;

	/** Override variables at replay start */
	variableOverrides?: Record<string, unknown>;
}

// ============================================================================
// Debug Adapter Protocol (DAP) Types
// ============================================================================

/**
 * Debug Adapter Protocol request types.
 */
export type DapRequestType =
	| "initialize"
	| "launch"
	| "attach"
	| "disconnect"
	| "setBreakpoints"
	| "setExceptionBreakpoints"
	| "continue"
	| "next"
	| "stepIn"
	| "stepOut"
	| "pause"
	| "stackTrace"
	| "scopes"
	| "variables"
	| "evaluate";

/**
 * Debug Adapter Protocol response.
 */
export interface DapResponse<T = unknown> {
	/** Request sequence number */
	request_seq: number;

	/** Whether request succeeded */
	success: boolean;

	/** Response body (if successful) */
	body?: T;

	/** Error message (if failed) */
	message?: string;
}

/**
 * Debug Adapter Protocol event types.
 */
export type DapEventType =
	| "initialized"
	| "stopped"
	| "continued"
	| "exited"
	| "terminated"
	| "output"
	| "breakpoint";

/**
 * Stopped event reason.
 */
export type StoppedReason =
	| "step"
	| "breakpoint"
	| "exception"
	| "pause"
	| "entry"
	| "goto"
	| "function breakpoint"
	| "data breakpoint";

// ============================================================================
// Debugger Interface
// ============================================================================

/**
 * Main debugger interface for controlling execution.
 */
export interface IDebugger {
	/** Current execution state */
	readonly state: DebugExecutionState;

	/** Current debug context */
	readonly context: DebugContext | null;

	/** Start debugging session */
	start(config: DebuggerConfig): Promise<void>;

	/** Stop debugging session */
	stop(): Promise<void>;

	/** Set a breakpoint */
	setBreakpoint(breakpoint: Breakpoint): void;

	/** Remove a breakpoint */
	removeBreakpoint(id: string): void;

	/** Clear all breakpoints */
	clearBreakpoints(): void;

	/** Get all breakpoints */
	getBreakpoints(): Breakpoint[];

	/** Continue execution */
	continue(): void;

	/** Step to next node */
	stepOver(): void;

	/** Step into node (for nested workflows) */
	stepIn(): void;

	/** Step out of current scope */
	stepOut(): void;

	/** Pause execution */
	pause(): void;

	/** Inspect variables */
	inspectVariables(request: VariableInspectionRequest): VariableInfo[];

	/** Create checkpoint */
	createCheckpoint(nodeName: string): ExecutionCheckpoint;

	/** Get execution trace */
	getTrace(): ExecutionTrace;

	/** Replay from checkpoint */
	replay(options: ReplayOptions): Promise<void>;

	/** Called before a node executes (for breakpoint checking) */
	beforeNodeExecution(nodeName: string, context: DebugContext): Promise<void>;

	/** Called after a node executes (for breakpoint checking) */
	afterNodeExecution(nodeName: string, context: DebugContext): Promise<void>;

	/** Called when an event is emitted (for event breakpoints) */
	onEventEmitted(
		eventType: string,
		payload: unknown,
		context: DebugContext,
	): Promise<void>;

	/** Called when an exception occurs (for exception breakpoints) */
	onException(
		error: Error,
		isUncaught: boolean,
		context: DebugContext,
	): Promise<void>;
}

// ============================================================================
// Type Guards
// ============================================================================

export function isNodeBreakpoint(
	breakpoint: Breakpoint,
): breakpoint is NodeBreakpoint {
	return breakpoint.type === "node";
}

export function isEventBreakpoint(
	breakpoint: Breakpoint,
): breakpoint is EventBreakpoint {
	return breakpoint.type === "event";
}

export function isExceptionBreakpoint(
	breakpoint: Breakpoint,
): breakpoint is ExceptionBreakpoint {
	return breakpoint.type === "exception";
}

export function isDebuggerPaused(state: DebugExecutionState): boolean {
	return state === "paused" || state === "stepping";
}

export function isDebuggerActive(state: DebugExecutionState): boolean {
	return state !== "stopped" && state !== "error";
}
