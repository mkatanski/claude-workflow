/**
 * Backoff strategies for retry operations.
 */

/**
 * Backoff strategy type.
 */
export type BackoffStrategy = "none" | "linear" | "exponential";

/**
 * Calculate delay for a given attempt number.
 *
 * @param strategy - The backoff strategy
 * @param attempt - Current attempt number (0-indexed)
 * @param baseDelayMs - Base delay in milliseconds
 * @param maxDelayMs - Maximum delay cap
 * @returns Delay in milliseconds
 */
export function calculateDelay(
	strategy: BackoffStrategy,
	attempt: number,
	baseDelayMs: number,
	maxDelayMs: number,
): number {
	let delay: number;

	switch (strategy) {
		case "none":
			delay = 0;
			break;

		case "linear":
			// Linear: delay = base * attempt
			delay = baseDelayMs * (attempt + 1);
			break;

		case "exponential":
			// Exponential: delay = base * 2^attempt
			delay = baseDelayMs * 2 ** attempt;
			break;

		default:
			delay = 0;
	}

	return Math.min(delay, maxDelayMs);
}

/**
 * Add jitter to a delay to prevent thundering herd.
 *
 * @param delay - The base delay
 * @param jitterFactor - Factor of jitter (0-1), default 0.1
 * @returns Delay with jitter applied
 */
export function addJitter(delay: number, jitterFactor = 0.1): number {
	const jitter = delay * jitterFactor * (Math.random() * 2 - 1);
	return Math.max(0, delay + jitter);
}

/**
 * Sleep for a given number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
