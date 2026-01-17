/**
 * Helper functions for working with Result types.
 *
 * These provide shorthand for common operations without
 * needing to use the ResultBox class directly.
 */

import { isErr, isOk, type Result, ResultBox } from "./result.js";

/**
 * Create a successful Result.
 */
export function ok<T>(value: T): ResultBox<T, never> {
	return ResultBox.ok(value);
}

/**
 * Create an error Result.
 */
export function err<E>(error: E): ResultBox<never, E> {
	return ResultBox.err(error);
}

/**
 * Tool result interface matching workflow tool outputs.
 */
export interface ToolResult {
	success: boolean;
	output: string;
	error?: string;
	data?: unknown;
}

/**
 * Create a ResultBox from a workflow tool result.
 *
 * @example
 * ```typescript
 * const result = await tools.bash("cat config.json");
 * const config = fromToolResult(result, JSON.parse);
 * if (config.isOk()) {
 *   console.log(config.unwrap());
 * }
 * ```
 */
export function fromToolResult<T = string>(
	toolResult: ToolResult,
	parser?: (output: string) => T,
): ResultBox<T, string> {
	return ResultBox.fromToolResult(toolResult, parser);
}

/**
 * Create a ResultBox from a tool result that has typed data.
 * Uses the data field if available, otherwise parses output.
 *
 * @example
 * ```typescript
 * const result = await tools.claudeSdk<Config>(prompt, { outputType: "schema" });
 * const config = fromTypedToolResult<Config>(result);
 * ```
 */
export function fromTypedToolResult<T>(
	toolResult: ToolResult & { data?: T },
): ResultBox<T, string> {
	if (!toolResult.success) {
		return ResultBox.err(toolResult.error ?? "Unknown error");
	}

	if (toolResult.data !== undefined) {
		return ResultBox.ok(toolResult.data as T);
	}

	// Fall back to parsing output as JSON
	try {
		return ResultBox.ok(JSON.parse(toolResult.output) as T);
	} catch {
		return ResultBox.err("Failed to parse output as JSON");
	}
}

/**
 * Try to execute a function, wrapping any thrown errors.
 *
 * @example
 * ```typescript
 * const result = trySync(() => JSON.parse(data));
 * ```
 */
export function trySync<T>(fn: () => T): ResultBox<T, Error> {
	try {
		return ResultBox.ok(fn());
	} catch (e) {
		return ResultBox.err(e instanceof Error ? e : new Error(String(e)));
	}
}

/**
 * Try to execute an async function, wrapping any thrown errors.
 *
 * @example
 * ```typescript
 * const result = await tryAsync(() => fetchData());
 * ```
 */
export async function tryAsync<T>(
	fn: () => Promise<T>,
): Promise<ResultBox<T, Error>> {
	return ResultBox.fromPromise(fn());
}

/**
 * Check if a value is defined (not null or undefined).
 */
export function fromNullable<T>(
	value: T | null | undefined,
	errorMessage: string,
): ResultBox<T, string> {
	return ResultBox.fromNullable(value, errorMessage);
}

/**
 * Combine multiple ResultBoxes, returning all values or the first error.
 */
export function all<T, E>(results: ResultBox<T, E>[]): ResultBox<T[], E> {
	return ResultBox.all(results);
}

/**
 * Return the first successful result, or the last error.
 */
export function first<T, E>(
	results: ResultBox<T, E>[],
): ResultBox<T, E> | ResultBox<never, string> {
	if (results.length === 0) {
		return err("No results provided");
	}

	let lastError: E | undefined;
	for (const result of results) {
		if (result.isOk()) {
			return result;
		}
		lastError = result.unwrapErr();
	}

	// lastError is guaranteed to be defined since we checked results.length > 0 above
	// and we loop through all results setting lastError each time
	return err(lastError as E);
}

/**
 * Filter an array, keeping only Ok values.
 */
export function filterOk<T, E>(results: ResultBox<T, E>[]): T[] {
	return results.filter((r) => r.isOk()).map((r) => r.unwrap());
}

/**
 * Partition results into Ok and Err arrays.
 */
export function partition<T, E>(
	results: ResultBox<T, E>[],
): { ok: T[]; err: E[] } {
	const okValues: T[] = [];
	const errValues: E[] = [];

	for (const result of results) {
		if (result.isOk()) {
			okValues.push(result.unwrap());
		} else {
			errValues.push(result.unwrapErr());
		}
	}

	return { ok: okValues, err: errValues };
}

// Re-export guards for convenience
export { isOk, isErr, type Result };
