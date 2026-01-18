/**
 * Circular call detection for workflow composition.
 *
 * This module provides utilities for tracking the workflow call stack
 * and detecting circular dependencies to prevent infinite recursion.
 *
 * The call stack tracks which workflows are currently executing, allowing
 * detection of:
 * - Direct circular calls (A calls A)
 * - Indirect circular calls (A calls B calls A)
 * - Call depth limits to prevent stack overflow
 *
 * @example
 * ```typescript
 * import { createCallStack, checkCircular, pushCall, popCall } from "./circular.js";
 *
 * // Create a new call stack
 * const stack = createCallStack({ maxDepth: 10 });
 *
 * // Check if calling a workflow would be circular
 * const result = checkCircular(stack, "my-workflow", "1.0.0");
 * if (result.isCircular) {
 *   console.error("Circular call detected:", result.path);
 * }
 *
 * // Track a new workflow call
 * const newStack = pushCall(stack, {
 *   name: "my-workflow",
 *   version: "1.0.0",
 *   nodeName: "process-data",
 *   startedAt: Date.now(),
 * });
 *
 * // Remove workflow call when complete
 * const finalStack = popCall(newStack);
 * ```
 */

import type { CallStack, CallStackEntry, WorkflowCallError } from "./types.js";

// ============================================================================
// Constants
// ============================================================================

/**
 * Default maximum call depth.
 *
 * This limits how deep workflow composition can nest to prevent
 * stack overflow and runaway recursion.
 */
export const DEFAULT_MAX_DEPTH = 10;

// ============================================================================
// Result Types
// ============================================================================

/**
 * Result of checking for circular calls.
 */
export interface CircularCheckResult {
	/** Whether a circular call was detected */
	isCircular: boolean;
	/** Path of workflow calls that form the circle (if circular) */
	path?: string[];
	/** Whether the call would exceed max depth */
	exceedsMaxDepth: boolean;
	/** Current depth if call is made */
	depth: number;
}

/**
 * Options for creating a new call stack.
 */
export interface CreateCallStackOptions {
	/** Maximum allowed call depth (default: DEFAULT_MAX_DEPTH) */
	maxDepth?: number;
	/** Initial entries for the stack (default: empty) */
	initialEntries?: CallStackEntry[];
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Create a new call stack for tracking workflow calls.
 *
 * @param options - Options for the call stack
 * @returns A new empty call stack
 *
 * @example
 * ```typescript
 * // Default stack with max depth of 10
 * const stack = createCallStack();
 *
 * // Custom max depth
 * const deepStack = createCallStack({ maxDepth: 20 });
 *
 * // With initial entries (for testing or resuming)
 * const prefilledStack = createCallStack({
 *   initialEntries: [
 *     { name: "parent", version: "1.0.0", nodeName: "start", startedAt: Date.now() },
 *   ],
 * });
 * ```
 */
export function createCallStack(
	options: CreateCallStackOptions = {},
): CallStack {
	const { maxDepth = DEFAULT_MAX_DEPTH, initialEntries = [] } = options;

	return {
		entries: [...initialEntries],
		maxDepth,
	};
}

/**
 * Check if calling a workflow would create a circular dependency.
 *
 * A call is circular if the workflow being called is already in the
 * current call stack (regardless of version).
 *
 * @param stack - Current call stack
 * @param workflowName - Name of the workflow to call
 * @param workflowVersion - Version of the workflow (optional, for path display)
 * @returns Result indicating if the call would be circular
 *
 * @example
 * ```typescript
 * const stack = createCallStack();
 * const stackWithA = pushCall(stack, {
 *   name: "workflow-a",
 *   version: "1.0.0",
 *   nodeName: "init",
 *   startedAt: Date.now(),
 * });
 *
 * // Check if calling workflow-a would be circular
 * const result = checkCircular(stackWithA, "workflow-a", "1.0.0");
 * // result.isCircular === true
 * // result.path === ["workflow-a@1.0.0", "workflow-a@1.0.0"]
 *
 * // Check if calling workflow-b would be circular
 * const result2 = checkCircular(stackWithA, "workflow-b", "1.0.0");
 * // result2.isCircular === false
 * ```
 */
export function checkCircular(
	stack: CallStack,
	workflowName: string,
	workflowVersion?: string,
): CircularCheckResult {
	const depth = stack.entries.length + 1;
	const exceedsMaxDepth = depth > stack.maxDepth;

	// Check if the workflow is already in the stack
	const existingIndex = stack.entries.findIndex(
		(entry) => entry.name === workflowName,
	);

	if (existingIndex === -1) {
		return {
			isCircular: false,
			exceedsMaxDepth,
			depth,
		};
	}

	// Build the circular path starting from the first occurrence
	const circularPath: string[] = [];
	for (let i = existingIndex; i < stack.entries.length; i++) {
		const entry = stack.entries[i];
		circularPath.push(formatStackEntry(entry));
	}

	// Add the current (attempted) call
	circularPath.push(formatCallRef(workflowName, workflowVersion));

	return {
		isCircular: true,
		path: circularPath,
		exceedsMaxDepth,
		depth,
	};
}

/**
 * Push a new workflow call onto the stack.
 *
 * Creates a new stack with the entry added (immutable operation).
 *
 * @param stack - Current call stack
 * @param entry - The call stack entry to add
 * @returns New call stack with the entry added
 *
 * @example
 * ```typescript
 * const stack = createCallStack();
 * const newStack = pushCall(stack, {
 *   name: "my-workflow",
 *   version: "1.0.0",
 *   nodeName: "process",
 *   startedAt: Date.now(),
 * });
 *
 * console.log(stack.entries.length); // 0 (unchanged)
 * console.log(newStack.entries.length); // 1
 * ```
 */
export function pushCall(stack: CallStack, entry: CallStackEntry): CallStack {
	return {
		entries: [...stack.entries, entry],
		maxDepth: stack.maxDepth,
	};
}

/**
 * Pop the most recent workflow call from the stack.
 *
 * Creates a new stack with the last entry removed (immutable operation).
 * If the stack is empty, returns a copy of the empty stack.
 *
 * @param stack - Current call stack
 * @returns New call stack with the last entry removed
 *
 * @example
 * ```typescript
 * const stack = createCallStack();
 * const stackWithCall = pushCall(stack, {
 *   name: "my-workflow",
 *   version: "1.0.0",
 *   nodeName: "process",
 *   startedAt: Date.now(),
 * });
 *
 * const afterPop = popCall(stackWithCall);
 * console.log(afterPop.entries.length); // 0
 * ```
 */
export function popCall(stack: CallStack): CallStack {
	if (stack.entries.length === 0) {
		return {
			entries: [],
			maxDepth: stack.maxDepth,
		};
	}

	return {
		entries: stack.entries.slice(0, -1),
		maxDepth: stack.maxDepth,
	};
}

/**
 * Create a call stack entry.
 *
 * Helper function to create properly typed entries with defaults.
 *
 * @param name - Workflow name
 * @param version - Workflow version
 * @param nodeName - Node that initiated the call
 * @param startedAt - Timestamp when the call started (default: Date.now())
 * @returns A CallStackEntry object
 *
 * @example
 * ```typescript
 * const entry = createCallStackEntry("my-workflow", "1.0.0", "analyze-step");
 * const stack = pushCall(createCallStack(), entry);
 * ```
 */
export function createCallStackEntry(
	name: string,
	version: string,
	nodeName: string,
	startedAt: number = Date.now(),
): CallStackEntry {
	return {
		name,
		version,
		nodeName,
		startedAt,
	};
}

/**
 * Check if the current call stack depth is at or exceeds the max depth.
 *
 * @param stack - Current call stack
 * @returns True if another call would exceed max depth
 *
 * @example
 * ```typescript
 * const stack = createCallStack({ maxDepth: 2 });
 * console.log(isAtMaxDepth(stack)); // false
 *
 * const stack1 = pushCall(stack, entry1);
 * console.log(isAtMaxDepth(stack1)); // false
 *
 * const stack2 = pushCall(stack1, entry2);
 * console.log(isAtMaxDepth(stack2)); // true (at max depth)
 * ```
 */
export function isAtMaxDepth(stack: CallStack): boolean {
	return stack.entries.length >= stack.maxDepth;
}

/**
 * Get the current call depth.
 *
 * @param stack - Current call stack
 * @returns Number of entries in the stack
 */
export function getCallDepth(stack: CallStack): number {
	return stack.entries.length;
}

/**
 * Get the parent workflow entry (caller of the current workflow).
 *
 * @param stack - Current call stack
 * @returns The parent entry or undefined if at root
 *
 * @example
 * ```typescript
 * const stack = createCallStack();
 * const parent = getParentEntry(stack);
 * console.log(parent); // undefined
 *
 * const stackWithParent = pushCall(stack, { name: "parent", ... });
 * const parentEntry = getParentEntry(stackWithParent);
 * console.log(parentEntry?.name); // "parent"
 * ```
 */
export function getParentEntry(stack: CallStack): CallStackEntry | undefined {
	if (stack.entries.length === 0) {
		return undefined;
	}
	return stack.entries[stack.entries.length - 1];
}

/**
 * Get the root workflow entry (first workflow in the chain).
 *
 * @param stack - Current call stack
 * @returns The root entry or undefined if stack is empty
 */
export function getRootEntry(stack: CallStack): CallStackEntry | undefined {
	if (stack.entries.length === 0) {
		return undefined;
	}
	return stack.entries[0];
}

/**
 * Get all entries in the call stack.
 *
 * Returns a copy of the entries array to prevent mutation.
 *
 * @param stack - Current call stack
 * @returns Array of call stack entries (copy)
 */
export function getCallPath(stack: CallStack): CallStackEntry[] {
	return [...stack.entries];
}

/**
 * Format the call stack as a human-readable string.
 *
 * Useful for debugging and error messages.
 *
 * @param stack - Current call stack
 * @param separator - String to join entries (default: " -> ")
 * @returns Formatted call path string
 *
 * @example
 * ```typescript
 * const stack = createCallStack();
 * let current = pushCall(stack, { name: "workflow-a", version: "1.0.0", ... });
 * current = pushCall(current, { name: "workflow-b", version: "2.0.0", ... });
 *
 * console.log(formatCallStack(current));
 * // "workflow-a@1.0.0 -> workflow-b@2.0.0"
 *
 * console.log(formatCallStack(current, " | "));
 * // "workflow-a@1.0.0 | workflow-b@2.0.0"
 * ```
 */
export function formatCallStack(stack: CallStack, separator = " -> "): string {
	if (stack.entries.length === 0) {
		return "(empty)";
	}

	return stack.entries.map(formatStackEntry).join(separator);
}

/**
 * Create a CIRCULAR_CALL error with full details.
 *
 * @param stack - Current call stack
 * @param attemptedWorkflow - Name of the workflow that would cause the cycle
 * @param attemptedVersion - Version of the workflow (optional)
 * @returns WorkflowCallError with circular call details
 *
 * @example
 * ```typescript
 * const check = checkCircular(stack, "workflow-a", "1.0.0");
 * if (check.isCircular) {
 *   const error = createCircularCallError(stack, "workflow-a", "1.0.0");
 *   // Use error in result
 * }
 * ```
 */
export function createCircularCallError(
	stack: CallStack,
	attemptedWorkflow: string,
	attemptedVersion?: string,
): WorkflowCallError {
	const check = checkCircular(stack, attemptedWorkflow, attemptedVersion);
	const path = check.path ?? [];

	const pathStr = path.join(" -> ");
	const message = `Circular workflow call detected: ${pathStr}. Workflow "${attemptedWorkflow}" is already executing in the current call chain.`;

	return {
		code: "CIRCULAR_CALL",
		message,
	};
}

/**
 * Create a max depth exceeded error.
 *
 * @param stack - Current call stack
 * @param attemptedWorkflow - Name of the workflow that would exceed depth
 * @returns WorkflowCallError with depth exceeded details
 *
 * @example
 * ```typescript
 * if (isAtMaxDepth(stack)) {
 *   const error = createMaxDepthError(stack, "my-workflow");
 *   // Use error in result
 * }
 * ```
 */
export function createMaxDepthError(
	stack: CallStack,
	attemptedWorkflow: string,
): WorkflowCallError {
	const currentPath = formatCallStack(stack);

	return {
		code: "CIRCULAR_CALL",
		message: `Maximum workflow call depth (${stack.maxDepth}) exceeded when attempting to call "${attemptedWorkflow}". Current call path: ${currentPath}. Consider increasing maxDepth or simplifying the workflow composition.`,
	};
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Format a stack entry as a string reference.
 */
function formatStackEntry(entry: CallStackEntry): string {
	return `${entry.name}@${entry.version}`;
}

/**
 * Format a workflow name and optional version as a string reference.
 */
function formatCallRef(name: string, version?: string): string {
	if (version) {
		return `${name}@${version}`;
	}
	return name;
}
