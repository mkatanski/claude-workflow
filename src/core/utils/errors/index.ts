/**
 * Error handling utilities for workflow operations.
 *
 * Provides comprehensive error classes with contextual information
 * for debugging, recovery suggestions, and observability.
 *
 * @example
 * ```typescript
 * import {
 *   WorkflowError,
 *   ValidationError,
 *   ExecutionError,
 *   createNodeErrorContext,
 *   enrichErrorContext
 * } from "@/core/utils/errors";
 *
 * // Create a validation error with context
 * throw new ValidationError("Invalid input", {
 *   field: "email",
 *   expected: "valid email address",
 *   received: "not-an-email",
 *   context: createNodeErrorContext("userWorkflow", "validateInput")
 * });
 *
 * // Create an execution error with enriched context
 * const context = createNodeErrorContext("dataWorkflow", "processData");
 * const enrichedContext = enrichErrorContext(context, "err-123", "corr-456");
 * throw new ExecutionError("Processing failed", {
 *   step: "transformation",
 *   context: enrichedContext
 * });
 *
 * // Check error type
 * try {
 *   // ... workflow execution
 * } catch (error) {
 *   if (isValidationError(error)) {
 *     console.log(`Validation failed for field: ${error.field}`);
 *   } else if (isExecutionError(error)) {
 *     console.log(`Execution failed at step: ${error.step}`);
 *   }
 * }
 * ```
 *
 * @module
 */

export {
	CircuitBreakerError,
	ConfigurationError,
	ExecutionError,
	isCircuitBreakerError,
	isConfigurationError,
	isExecutionError,
	isRetryError,
	isTimeoutError,
	isToolError,
	isValidationError,
	isWorkflowError,
	RetryError,
	TimeoutError,
	ToolError,
	toWorkflowError,
	ValidationError,
	WorkflowError,
} from "./errorClasses.js";
export {
	createNodeErrorContext,
	createToolErrorContext,
	createWorkflowErrorContext,
	enrichErrorContext,
	type ErrorContext,
	type ErrorContextWithCorrelation,
	formatErrorContext,
	mergeErrorContexts,
	serializeErrorContext,
} from "./errorContext.js";
export {
	combineStackTraces,
	DEFAULT_STACK_FORMAT_OPTIONS,
	extractTopFrame,
	formatErrorStack,
	formatFrameLocation,
	formatStackTrace,
	type ParsedStackTrace,
	parseStackTrace,
	type StackFrame,
	type StackTraceFormatOptions,
} from "./stackTraceFormatter.js";
