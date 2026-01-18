/**
 * Workflow Composition Module - Sub-workflow invocation from within workflow nodes
 *
 * This module provides the ability to call other workflows from within a workflow node,
 * enabling complex workflow composition patterns. It supports:
 * - Workflow invocation with options (input, timeout, cwd)
 * - Result handling with explicit success/error states
 * - Validation error reporting for input/output schemas
 * - Call stack tracking for circular dependency detection
 *
 * @example
 * ```typescript
 * import { isSuccessResult, isErrorResult, isValidationError } from './core/composition';
 * import type { WorkflowCallOptions, WorkflowCallResult } from './core/composition';
 *
 * // In a workflow node:
 * const result = await tools.workflow('analyzer@^1.0.0', {
 *   input: { path: './src' },
 *   timeout: 30000,
 *   label: 'analyze-code',
 * });
 *
 * if (isSuccessResult(result)) {
 *   console.log('Analysis complete:', result.output);
 * } else if (isErrorResult(result) && isValidationError(result.error)) {
 *   console.error('Validation failed:', result.error.validationErrors);
 * }
 * ```
 */

// Circular call detection utilities
export {
	type CircularCheckResult,
	type CreateCallStackOptions,
	checkCircular,
	createCallStack,
	createCallStackEntry,
	createCircularCallError,
	createMaxDepthError,
	DEFAULT_MAX_DEPTH,
	formatCallStack,
	getCallDepth,
	getCallPath,
	getParentEntry,
	getRootEntry,
	isAtMaxDepth,
	popCall,
	pushCall,
} from "./circular";
// Executor for sub-workflow execution
export {
	createExecutionError,
	createExecutorContext,
	createSubWorkflowExecutor,
	createTimeoutError,
	DEFAULT_EXECUTION_TIMEOUT,
	type ExecutorContext,
	SubWorkflowExecutor,
	type SubWorkflowExecutorConfig,
} from "./executor";
// Reference parsing utilities
export {
	formatWorkflowReference,
	isValidWorkflowReference,
	normalizeWorkflowReference,
	type ParseWorkflowReferenceResult,
	parseWorkflowReference,
} from "./reference";
// Types
export * from "./types";
// Validation utilities for Zod schema validation
export {
	combineValidationErrors,
	createInputValidationError,
	createOutputValidationError,
	formatValidationErrors,
	formatZodMessage,
	formatZodPath,
	isZodSchema,
	type ValidationOptions,
	type ValidationResult,
	validateInput,
	validateInputExists,
	validateOutput,
	validateWithSchema,
	zodErrorsToValidationErrors,
} from "./validation";
