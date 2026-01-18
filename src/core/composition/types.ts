/**
 * Workflow Composition Types
 *
 * This module defines types for workflow composition - the ability to call
 * other workflows from within a workflow node. These types support:
 * - Workflow invocation with options
 * - Result handling with success/error states
 * - Validation error reporting
 * - Metadata about resolved workflows
 */

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error codes for workflow composition failures.
 *
 * Each code represents a specific failure mode:
 * - WORKFLOW_NOT_FOUND: The referenced workflow does not exist
 * - VERSION_NOT_FOUND: The specified version constraint cannot be satisfied
 * - EXPORT_NOT_FOUND: The named export does not exist in the workflow
 * - DEPENDENCY_MISSING: A required dependency is not installed
 * - INPUT_VALIDATION: Input data failed schema validation
 * - OUTPUT_VALIDATION: Output data failed schema validation
 * - EXECUTION_FAILED: The workflow execution threw an error
 * - TIMEOUT: The workflow execution exceeded the timeout
 * - CIRCULAR_CALL: A circular workflow call was detected
 */
export type WorkflowCallErrorCode =
	| "WORKFLOW_NOT_FOUND"
	| "VERSION_NOT_FOUND"
	| "EXPORT_NOT_FOUND"
	| "DEPENDENCY_MISSING"
	| "INPUT_VALIDATION"
	| "OUTPUT_VALIDATION"
	| "EXECUTION_FAILED"
	| "TIMEOUT"
	| "CIRCULAR_CALL";

/**
 * Validation error for a specific field.
 *
 * Used to report field-level validation failures for both
 * input and output schema validation.
 */
export interface ValidationError {
	/** Dot-notation path to the invalid field (e.g., "user.email") */
	path: string;
	/** Human-readable error message */
	message: string;
}

/**
 * Error details for workflow composition failures.
 *
 * Contains structured information about what went wrong,
 * enabling parent workflows to make informed decisions
 * about error handling.
 */
export interface WorkflowCallError {
	/** Error code identifying the failure type */
	code: WorkflowCallErrorCode;
	/** Human-readable error message */
	message: string;
	/** Stack trace if available (for EXECUTION_FAILED) */
	stack?: string;
	/** Field-level validation errors (for INPUT_VALIDATION/OUTPUT_VALIDATION) */
	validationErrors?: ValidationError[];
	/** Available versions (for VERSION_NOT_FOUND) */
	availableVersions?: string[];
	/** Available exports (for EXPORT_NOT_FOUND) */
	availableExports?: string[];
}

// ============================================================================
// Metadata Types
// ============================================================================

/**
 * Source location where the workflow was resolved from.
 *
 * - project: Workflow defined in the current project's .cw/workflows/
 * - project-installed: Workflow installed as a dependency in the project
 * - global: Workflow installed globally
 */
export type WorkflowSource = "project" | "project-installed" | "global";

/**
 * Metadata about the resolved workflow.
 *
 * Provides information about which workflow was actually executed,
 * useful for debugging and logging.
 */
export interface WorkflowCallMetadata {
	/** Resolved workflow name */
	name: string;
	/** Resolved workflow version */
	version: string;
	/** Where the workflow was loaded from */
	source: WorkflowSource;
	/** Named export that was used (default: "default") */
	export?: string;
}

// ============================================================================
// Options and Result Types
// ============================================================================

/**
 * Options for calling a sub-workflow.
 *
 * @template TInput - Type of the input data
 *
 * @example
 * ```typescript
 * // Basic call with input
 * const options: WorkflowCallOptions<{ path: string }> = {
 *   input: { path: './src' },
 *   timeout: 30000,
 *   label: 'analyze-code',
 * };
 * ```
 */
export interface WorkflowCallOptions<TInput = unknown> {
	/** Input data to pass to the workflow */
	input?: TInput;
	/** Timeout in milliseconds (default: no timeout) */
	timeout?: number;
	/** Override working directory for the sub-workflow */
	cwd?: string;
	/** Human-readable label for events and debugging */
	label?: string;
}

/**
 * Result of a workflow composition call.
 *
 * Uses a Result-style pattern where success/failure is explicit
 * rather than using exceptions. This allows parent workflows to
 * make informed decisions about error handling.
 *
 * @template TOutput - Type of the output data
 *
 * @example
 * ```typescript
 * // Successful result
 * const result: WorkflowCallResult<AnalysisOutput> = {
 *   success: true,
 *   output: { findings: [], score: 95 },
 *   duration: 1234,
 *   metadata: { name: 'analyzer', version: '1.0.0', source: 'project' },
 * };
 *
 * // Failed result
 * const result: WorkflowCallResult<AnalysisOutput> = {
 *   success: false,
 *   error: {
 *     code: 'INPUT_VALIDATION',
 *     message: 'Invalid input',
 *     validationErrors: [{ path: 'path', message: 'Required field missing' }],
 *   },
 *   duration: 5,
 *   metadata: { name: 'analyzer', version: '1.0.0', source: 'project' },
 * };
 * ```
 */
export interface WorkflowCallResult<TOutput = unknown> {
	/** Whether the workflow completed successfully */
	success: boolean;
	/** Output data from the workflow (only present on success) */
	output?: TOutput;
	/** Error details (only present on failure) */
	error?: WorkflowCallError;
	/** Execution duration in milliseconds */
	duration: number;
	/** Metadata about the resolved workflow */
	metadata: WorkflowCallMetadata;
}

// ============================================================================
// Workflow Reference Types
// ============================================================================

/**
 * Parsed workflow reference.
 *
 * A workflow reference can include:
 * - Just a name: "my-workflow"
 * - Name with version: "my-workflow@^1.0.0"
 * - Name with export: "my-workflow:analyzeCode"
 * - All three: "my-workflow@^1.0.0:analyzeCode"
 */
export interface ParsedWorkflowReference {
	/** Workflow name */
	name: string;
	/** Version constraint (semver range) */
	version?: string;
	/** Named export to use */
	export?: string;
}

// ============================================================================
// Call Stack Types (for circular detection)
// ============================================================================

/**
 * Entry in the workflow call stack.
 *
 * Used for tracking the chain of workflow calls to detect
 * circular dependencies.
 */
export interface CallStackEntry {
	/** Workflow name */
	name: string;
	/** Workflow version */
	version: string;
	/** Node name that initiated the call */
	nodeName: string;
	/** Timestamp when the call started */
	startedAt: number;
}

/**
 * Call stack for tracking nested workflow calls.
 *
 * Maintains an ordered list of workflow calls to detect
 * circular dependencies and provide debugging context.
 */
export interface CallStack {
	/** Stack of workflow calls (most recent last) */
	entries: CallStackEntry[];
	/** Maximum allowed call depth */
	maxDepth: number;
}

// ============================================================================
// Executor Context Types
// ============================================================================

/**
 * Context passed to sub-workflow execution.
 *
 * Contains information needed to execute a sub-workflow
 * with proper isolation and context propagation.
 */
export interface SubWorkflowContext {
	/** Parent workflow name */
	parentWorkflow: string;
	/** Parent node name that initiated the call */
	parentNode: string;
	/** Project root path (inherited from parent) */
	projectPath: string;
	/** Working directory (can be overridden) */
	cwd: string;
	/** Current call stack for circular detection */
	callStack: CallStack;
	/** Correlation ID for event tracking */
	correlationId: string;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a result is successful.
 *
 * @param result - The workflow call result to check
 * @returns True if the result represents a successful execution
 */
export function isSuccessResult<TOutput>(
	result: WorkflowCallResult<TOutput>,
): result is WorkflowCallResult<TOutput> & { success: true; output: TOutput } {
	return result.success === true && result.output !== undefined;
}

/**
 * Check if a result is an error.
 *
 * @param result - The workflow call result to check
 * @returns True if the result represents a failed execution
 */
export function isErrorResult<TOutput>(
	result: WorkflowCallResult<TOutput>,
): result is WorkflowCallResult<TOutput> & {
	success: false;
	error: WorkflowCallError;
} {
	return result.success === false && result.error !== undefined;
}

/**
 * Check if an error is a validation error.
 *
 * @param error - The workflow call error to check
 * @returns True if the error is a validation error with field details
 */
export function isValidationError(
	error: WorkflowCallError,
): error is WorkflowCallError & { validationErrors: ValidationError[] } {
	return (
		(error.code === "INPUT_VALIDATION" || error.code === "OUTPUT_VALIDATION") &&
		Array.isArray(error.validationErrors) &&
		error.validationErrors.length > 0
	);
}

/**
 * Check if an error is a timeout error.
 *
 * @param error - The workflow call error to check
 * @returns True if the error is due to timeout
 */
export function isTimeoutError(error: WorkflowCallError): boolean {
	return error.code === "TIMEOUT";
}

/**
 * Check if an error is a circular call error.
 *
 * @param error - The workflow call error to check
 * @returns True if the error is due to circular workflow calls
 */
export function isCircularCallError(error: WorkflowCallError): boolean {
	return error.code === "CIRCULAR_CALL";
}
