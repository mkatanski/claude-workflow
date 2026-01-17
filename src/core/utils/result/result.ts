/**
 * Result type system for workflow operations.
 *
 * Provides a type-safe way to handle success and error cases
 * without throwing exceptions.
 */

/**
 * Represents a successful result.
 */
export interface Ok<T> {
	readonly _tag: "ok";
	readonly value: T;
}

/**
 * Represents an error result.
 */
export interface Err<E> {
	readonly _tag: "err";
	readonly error: E;
}

/**
 * Union type representing either success or error.
 */
export type Result<T, E> = Ok<T> | Err<E>;

/**
 * Type guard for Ok results.
 */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
	return result._tag === "ok";
}

/**
 * Type guard for Err results.
 */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
	return result._tag === "err";
}

/**
 * ResultBox - A monadic wrapper for Result<T, E> that provides
 * chainable operations for working with success/error values.
 *
 * @example
 * ```typescript
 * const result = ResultBox.fromToolResult(bashResult)
 *   .map(output => output.trim())
 *   .flatMap(trimmed => parseJson(trimmed))
 *   .mapError(err => `Parse failed: ${err}`);
 *
 * if (result.isOk()) {
 *   console.log(result.unwrap());
 * } else {
 *   console.error(result.unwrapErr());
 * }
 * ```
 */
export class ResultBox<T, E = Error> {
	private readonly result: Result<T, E>;

	private constructor(result: Result<T, E>) {
		this.result = result;
	}

	// --- Constructors ---

	/**
	 * Create a successful ResultBox.
	 */
	static ok<T>(value: T): ResultBox<T, never> {
		return new ResultBox<T, never>({ _tag: "ok", value });
	}

	/**
	 * Create an error ResultBox.
	 */
	static err<E>(error: E): ResultBox<never, E> {
		return new ResultBox<never, E>({ _tag: "err", error });
	}

	/**
	 * Create a ResultBox from a tool result (bash, claude, etc.).
	 *
	 * @param toolResult - Result from a workflow tool
	 * @param parser - Optional parser for the output
	 */
	static fromToolResult<T>(
		toolResult: { success: boolean; output: string; error?: string },
		parser?: (output: string) => T,
	): ResultBox<T, string> {
		if (!toolResult.success) {
			return ResultBox.err(toolResult.error ?? "Unknown error");
		}

		if (parser) {
			try {
				return ResultBox.ok(parser(toolResult.output));
			} catch (e) {
				return ResultBox.err(e instanceof Error ? e.message : "Parse error");
			}
		}

		return ResultBox.ok(toolResult.output as unknown as T);
	}

	/**
	 * Create a ResultBox from a Promise.
	 * Catches rejections and converts them to Err.
	 */
	static async fromPromise<T>(
		promise: Promise<T>,
	): Promise<ResultBox<T, Error>> {
		try {
			const value = await promise;
			return ResultBox.ok(value);
		} catch (e) {
			return ResultBox.err(e instanceof Error ? e : new Error(String(e)));
		}
	}

	/**
	 * Create a ResultBox from a nullable value.
	 * Returns Err if value is null or undefined.
	 */
	static fromNullable<T, E>(
		value: T | null | undefined,
		error: E,
	): ResultBox<T, E> {
		if (value === null || value === undefined) {
			return ResultBox.err(error);
		}
		return ResultBox.ok(value);
	}

	/**
	 * Combine multiple ResultBoxes into one.
	 * Returns Err with the first error encountered, or Ok with all values.
	 */
	static all<T, E>(results: ResultBox<T, E>[]): ResultBox<T[], E> {
		const values: T[] = [];
		for (const result of results) {
			if (result.isErr()) {
				return ResultBox.err(result.unwrapErr());
			}
			values.push(result.unwrap());
		}
		return ResultBox.ok(values);
	}

	// --- Guards ---

	/**
	 * Check if this is a successful result.
	 */
	isOk(): boolean {
		return this.result._tag === "ok";
	}

	/**
	 * Check if this is an error result.
	 */
	isErr(): boolean {
		return this.result._tag === "err";
	}

	// --- Combinators ---

	/**
	 * Transform the success value.
	 */
	map<U>(fn: (value: T) => U): ResultBox<U, E> {
		if (this.result._tag === "ok") {
			return ResultBox.ok(fn(this.result.value));
		}
		return ResultBox.err(this.result.error);
	}

	/**
	 * Transform the success value with a function that returns a ResultBox.
	 */
	flatMap<U>(fn: (value: T) => ResultBox<U, E>): ResultBox<U, E> {
		if (this.result._tag === "ok") {
			return fn(this.result.value);
		}
		return ResultBox.err(this.result.error);
	}

	/**
	 * Transform the error value.
	 */
	mapError<F>(fn: (error: E) => F): ResultBox<T, F> {
		if (this.result._tag === "err") {
			return ResultBox.err(fn(this.result.error));
		}
		return ResultBox.ok(this.result.value);
	}

	/**
	 * Recover from an error by providing a fallback value.
	 */
	recover(fn: (error: E) => T): ResultBox<T, never> {
		if (this.result._tag === "err") {
			return ResultBox.ok(fn(this.result.error));
		}
		return ResultBox.ok(this.result.value);
	}

	/**
	 * Recover from an error by trying another operation.
	 */
	orElse<F>(fn: (error: E) => ResultBox<T, F>): ResultBox<T, F> {
		if (this.result._tag === "err") {
			return fn(this.result.error);
		}
		return ResultBox.ok(this.result.value);
	}

	/**
	 * Execute a side effect if this is Ok.
	 */
	tap(fn: (value: T) => void): this {
		if (this.result._tag === "ok") {
			fn(this.result.value);
		}
		return this;
	}

	/**
	 * Execute a side effect if this is Err.
	 */
	tapError(fn: (error: E) => void): this {
		if (this.result._tag === "err") {
			fn(this.result.error);
		}
		return this;
	}

	// --- Extractors ---

	/**
	 * Unwrap the success value, throwing if this is an error.
	 */
	unwrap(): T {
		if (this.result._tag === "ok") {
			return this.result.value;
		}
		throw new Error(`Cannot unwrap Err: ${String(this.result.error)}`);
	}

	/**
	 * Unwrap the error value, throwing if this is a success.
	 */
	unwrapErr(): E {
		if (this.result._tag === "err") {
			return this.result.error;
		}
		throw new Error("Cannot unwrapErr Ok");
	}

	/**
	 * Unwrap the success value, returning a default if this is an error.
	 */
	unwrapOr(defaultValue: T): T {
		if (this.result._tag === "ok") {
			return this.result.value;
		}
		return defaultValue;
	}

	/**
	 * Unwrap the success value, computing a default if this is an error.
	 */
	unwrapOrElse(fn: (error: E) => T): T {
		if (this.result._tag === "ok") {
			return this.result.value;
		}
		return fn(this.result.error);
	}

	// --- Conversion ---

	/**
	 * Pattern match on the result.
	 */
	match<U>(handlers: { ok: (value: T) => U; err: (error: E) => U }): U {
		if (this.result._tag === "ok") {
			return handlers.ok(this.result.value);
		}
		return handlers.err(this.result.error);
	}

	/**
	 * Convert to the underlying Result type.
	 */
	toResult(): Result<T, E> {
		return this.result;
	}

	/**
	 * Convert to a nullable value (null if error).
	 */
	toNullable(): T | null {
		if (this.result._tag === "ok") {
			return this.result.value;
		}
		return null;
	}

	/**
	 * Convert to undefined (undefined if error).
	 */
	toUndefined(): T | undefined {
		if (this.result._tag === "ok") {
			return this.result.value;
		}
		return undefined;
	}
}
