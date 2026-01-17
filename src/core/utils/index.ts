/**
 * Core utilities for building agentic workflows.
 *
 * This module provides generic utilities extracted from workflow implementations
 * to simplify building new workflows:
 *
 * - **result**: Type-safe error handling with Result<T, E> and ResultBox
 * - **state**: Immutable state update helpers and StateBuilder
 * - **files**: File operations with Result-based error handling
 * - **retry**: Configurable retry logic with backoff strategies
 * - **iteration**: Stateful iteration helpers for array processing
 * - **schema**: JSON parsing and validation utilities
 *
 * @example
 * ```typescript
 * import {
 *   // Result utilities
 *   ResultBox, ok, err, fromToolResult,
 *   // State utilities
 *   state, stateError, updateAt,
 *   // File utilities
 *   FileOperations,
 *   // Retry utilities
 *   RetryableOperation, withRetry,
 *   // Iteration utilities
 *   IterationHelper, createIterator,
 *   // Schema utilities
 *   parseJson, parseJsonSafe, validate,
 * } from "@/core/utils";
 * ```
 *
 * @module
 */

// File utilities
export {
	createFileError,
	type FileError,
	type FileErrorCode,
	FileOperations,
	isNotFoundError,
	isPermissionError,
	mapNodeError,
} from "./files/index.js";
// Iteration utilities
export {
	createIterator,
	createIteratorFromState,
	IterationHelper,
} from "./iteration/index.js";
// Result utilities
export {
	all,
	type Err,
	err,
	filterOk,
	first,
	fromNullable,
	fromToolResult,
	fromTypedToolResult,
	isErr,
	isOk,
	type Ok,
	ok,
	partition,
	type Result,
	ResultBox,
	type ToolResult,
	tryAsync,
	trySync,
} from "./result/index.js";

// Retry utilities
export {
	addJitter,
	type BackoffStrategy,
	calculateDelay,
	createRetry,
	DEFAULT_RETRY_CONFIG,
	RetryableOperation,
	type RetryConfig,
	sleep,
	withRetry,
} from "./retry/index.js";
// Schema utilities
export {
	createValidator,
	extractJson,
	formatValidationErrors,
	type JsonSchema,
	parseAndValidate,
	parseJson,
	parseJsonSafe,
	SchemaValidator,
	tryParseJson,
	type ValidationError,
	validate,
	validateSchema,
} from "./schema/index.js";
// State utilities
export {
	append,
	deletePath,
	findAndUpdate,
	findAndUpdateAll,
	getPath,
	hasPath,
	insertAt,
	mergePath,
	moveAt,
	parsePath,
	prepend,
	removeAt,
	replaceAt,
	StateBuilder,
	setPath,
	state,
	stateError,
	stateVars,
	updateAt,
	type WorkflowStateUpdate,
} from "./state/index.js";
