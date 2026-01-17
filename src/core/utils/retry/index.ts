/**
 * Retry utilities for workflow operations.
 *
 * Provides configurable retry logic with backoff strategies
 * and event emission for observability.
 *
 * @example
 * ```typescript
 * import { RetryableOperation, withRetry, createRetry } from "@/core/utils/retry";
 *
 * // Class-based usage
 * const retry = new RetryableOperation("fetchData", {
 *   maxAttempts: 3,
 *   backoff: "exponential",
 *   baseDelayMs: 1000,
 * }, emitter);
 *
 * const result = await retry.execute(() => fetch("/api/data"));
 *
 * // One-shot usage
 * const result = await withRetry(
 *   "fetchData",
 *   () => fetch("/api/data"),
 *   { maxAttempts: 3 },
 *   emitter
 * );
 *
 * // Execute until condition
 * const result = await retry.executeUntil(
 *   () => checkStatus(),
 *   (status) => status === "ready"
 * );
 * ```
 *
 * @module
 */

export {
	addJitter,
	type BackoffStrategy,
	calculateDelay,
	sleep,
} from "./backoff.js";
export {
	createRetry,
	DEFAULT_RETRY_CONFIG,
	RetryableOperation,
	type RetryConfig,
	withRetry,
} from "./retryable.js";
