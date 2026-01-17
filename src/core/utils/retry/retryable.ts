/**
 * RetryableOperation - Configurable retry logic for workflow operations.
 *
 * Provides automatic retry with backoff, condition-based completion,
 * and event emission for observability.
 */

import type { WorkflowEmitter } from "../../events/emitter.js";
import type { EventHelpers } from "../../events/helpers.js";
import { createEventHelpers, createTimer } from "../../events/helpers.js";
import { ResultBox } from "../result/result.js";
import { type BackoffStrategy, calculateDelay, sleep } from "./backoff.js";

/**
 * Configuration for retry behavior.
 */
export interface RetryConfig {
	/** Maximum number of attempts (including first attempt) */
	maxAttempts: number;
	/** Backoff strategy between retries */
	backoff?: BackoffStrategy;
	/** Base delay in milliseconds */
	baseDelayMs?: number;
	/** Maximum delay cap in milliseconds */
	maxDelayMs?: number;
	/** Whether to emit events */
	emitEvents?: boolean;
}

/**
 * Default retry configuration.
 */
export const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
	maxAttempts: 3,
	backoff: "exponential",
	baseDelayMs: 1000,
	maxDelayMs: 30000,
	emitEvents: true,
};

/**
 * RetryableOperation - Encapsulates retry logic for workflow operations.
 *
 * @example
 * ```typescript
 * const retry = new RetryableOperation("fetchData", {
 *   maxAttempts: 3,
 *   backoff: "exponential",
 *   baseDelayMs: 1000,
 * }, emitter);
 *
 * const result = await retry.execute(() => fetch("/api/data"));
 * if (result.isOk()) {
 *   console.log(result.unwrap());
 * } else {
 *   console.error("All retries exhausted:", result.unwrapErr());
 * }
 * ```
 */
export class RetryableOperation<T> {
	private readonly name: string;
	private readonly config: Required<RetryConfig>;
	private readonly eventHelpers: EventHelpers | undefined;
	private currentAttempt = 0;
	private lastError: Error | undefined;

	constructor(name: string, config: RetryConfig, emitter?: WorkflowEmitter) {
		this.name = name;
		this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
		this.eventHelpers =
			emitter && this.config.emitEvents
				? createEventHelpers(emitter)
				: undefined;
	}

	/**
	 * Execute an operation with retry logic.
	 *
	 * @param operation - The async operation to execute
	 * @returns ResultBox with the operation result or final error
	 */
	async execute(operation: () => Promise<T>): Promise<ResultBox<T, Error>> {
		const timer = createTimer();

		this.eventHelpers?.retryStart({
			operationName: this.name,
			maxAttempts: this.config.maxAttempts,
			backoffStrategy: this.config.backoff,
		});

		while (this.currentAttempt < this.config.maxAttempts) {
			const attempt = this.currentAttempt;
			this.currentAttempt++;

			try {
				const result = await operation();

				this.eventHelpers?.retrySuccess({
					operationName: this.name,
					attempt: attempt + 1,
					totalAttempts: this.currentAttempt,
					totalDuration: timer.elapsed(),
				});

				return ResultBox.ok(result);
			} catch (error) {
				this.lastError =
					error instanceof Error ? error : new Error(String(error));

				const delay = calculateDelay(
					this.config.backoff,
					attempt,
					this.config.baseDelayMs,
					this.config.maxDelayMs,
				);

				this.eventHelpers?.retryAttempt({
					operationName: this.name,
					attempt: attempt + 1,
					maxAttempts: this.config.maxAttempts,
					delayMs: delay,
					error: this.lastError.message,
				});

				if (this.currentAttempt < this.config.maxAttempts && delay > 0) {
					await sleep(delay);
				}
			}
		}

		this.eventHelpers?.retryExhausted({
			operationName: this.name,
			totalAttempts: this.currentAttempt,
			totalDuration: timer.elapsed(),
			lastError: this.lastError?.message,
		});

		return ResultBox.err(
			this.lastError ?? new Error("Retry exhausted without error"),
		);
	}

	/**
	 * Execute an operation with retry logic until a condition is met.
	 *
	 * @param operation - The async operation to execute
	 * @param condition - Condition that must return true for success
	 * @returns ResultBox with the operation result or final error
	 */
	async executeUntil(
		operation: () => Promise<T>,
		condition: (result: T) => boolean,
	): Promise<ResultBox<T, Error>> {
		const timer = createTimer();

		this.eventHelpers?.retryStart({
			operationName: this.name,
			maxAttempts: this.config.maxAttempts,
			backoffStrategy: this.config.backoff,
		});

		while (this.currentAttempt < this.config.maxAttempts) {
			const attempt = this.currentAttempt;
			this.currentAttempt++;

			try {
				const result = await operation();

				if (condition(result)) {
					this.eventHelpers?.retrySuccess({
						operationName: this.name,
						attempt: attempt + 1,
						totalAttempts: this.currentAttempt,
						totalDuration: timer.elapsed(),
					});

					return ResultBox.ok(result);
				}

				// Condition not met - treat as retry
				const delay = calculateDelay(
					this.config.backoff,
					attempt,
					this.config.baseDelayMs,
					this.config.maxDelayMs,
				);

				this.eventHelpers?.retryAttempt({
					operationName: this.name,
					attempt: attempt + 1,
					maxAttempts: this.config.maxAttempts,
					delayMs: delay,
					error: "Condition not met",
				});

				if (this.currentAttempt < this.config.maxAttempts && delay > 0) {
					await sleep(delay);
				}
			} catch (error) {
				this.lastError =
					error instanceof Error ? error : new Error(String(error));

				const delay = calculateDelay(
					this.config.backoff,
					attempt,
					this.config.baseDelayMs,
					this.config.maxDelayMs,
				);

				this.eventHelpers?.retryAttempt({
					operationName: this.name,
					attempt: attempt + 1,
					maxAttempts: this.config.maxAttempts,
					delayMs: delay,
					error: this.lastError.message,
				});

				if (this.currentAttempt < this.config.maxAttempts && delay > 0) {
					await sleep(delay);
				}
			}
		}

		this.eventHelpers?.retryExhausted({
			operationName: this.name,
			totalAttempts: this.currentAttempt,
			totalDuration: timer.elapsed(),
			lastError: this.lastError?.message ?? "Condition never met",
		});

		return ResultBox.err(this.lastError ?? new Error("Condition never met"));
	}

	/**
	 * Check if all retries have been exhausted.
	 */
	isExhausted(): boolean {
		return this.currentAttempt >= this.config.maxAttempts;
	}

	/**
	 * Get the number of remaining attempts.
	 */
	remainingAttempts(): number {
		return Math.max(0, this.config.maxAttempts - this.currentAttempt);
	}

	/**
	 * Get the current attempt number (1-indexed).
	 */
	currentAttemptNumber(): number {
		return this.currentAttempt;
	}

	/**
	 * Get the last error that occurred.
	 */
	getLastError(): Error | undefined {
		return this.lastError;
	}

	/**
	 * Reset the retry state for reuse.
	 */
	reset(): void {
		this.currentAttempt = 0;
		this.lastError = undefined;
	}
}

/**
 * Create a new RetryableOperation.
 * Convenience function for fluent usage.
 *
 * @param name - Operation name for logging/events
 * @param config - Retry configuration
 * @param emitter - Optional event emitter
 */
export function createRetry<T>(
	name: string,
	config: RetryConfig,
	emitter?: WorkflowEmitter,
): RetryableOperation<T> {
	return new RetryableOperation<T>(name, config, emitter);
}

/**
 * Execute an operation with retry logic.
 * Convenience function for one-shot retries.
 *
 * @param name - Operation name
 * @param operation - The operation to execute
 * @param config - Retry configuration
 * @param emitter - Optional event emitter
 */
export async function withRetry<T>(
	name: string,
	operation: () => Promise<T>,
	config: RetryConfig,
	emitter?: WorkflowEmitter,
): Promise<ResultBox<T, Error>> {
	const retry = new RetryableOperation<T>(name, config, emitter);
	return retry.execute(operation);
}
