/**
 * Result type system for type-safe error handling.
 *
 * @example
 * ```typescript
 * import { ResultBox, ok, err, fromToolResult } from "@/core/utils/result";
 *
 * // Create results
 * const success = ok(42);
 * const failure = err("Something went wrong");
 *
 * // From tool results
 * const bashResult = await tools.bash("cat config.json");
 * const config = fromToolResult(bashResult, JSON.parse);
 *
 * // Chain operations
 * const result = config
 *   .map(cfg => cfg.setting)
 *   .flatMap(setting => validateSetting(setting))
 *   .mapError(err => `Validation failed: ${err}`);
 *
 * // Extract values
 * const value = result.unwrapOr(defaultValue);
 * ```
 *
 * @module
 */

export {
	all,
	err,
	filterOk,
	first,
	fromNullable,
	fromToolResult,
	fromTypedToolResult,
	ok,
	partition,
	type ToolResult,
	tryAsync,
	trySync,
} from "./helpers.js";
export {
	type Err,
	isErr,
	isOk,
	type Ok,
	type Result,
	ResultBox,
} from "./result.js";
