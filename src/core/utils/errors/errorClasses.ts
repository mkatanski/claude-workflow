/**
 * Error class hierarchy for workflow operations.
 *
 * Provides structured error types with contextual information
 * for debugging and recovery.
 */

import type { BackoffStrategy } from "../retry/backoff.js";

/**
 * Error category for retry decisions.
 * - transient: Error may resolve on retry (network issues, temporary failures)
 * - permanent: Error will not resolve on retry (validation errors, not found)
 * - unknown: Category cannot be determined (default)
 */
export type ErrorCategory = "transient" | "permanent" | "unknown";

/**
 * Retry suggestion based on error analysis.
 */
export interface RetrySuggestion {
	/** Whether the error should be retried */
	shouldRetry: boolean;
	/** Suggested maximum number of retry attempts */
	maxAttempts: number;
	/** Suggested backoff strategy */
	backoffStrategy: BackoffStrategy;
	/** Reason for the suggestion */
	reason: string;
	/** Suggested base delay in milliseconds */
	baseDelayMs: number;
}

/**
 * Base class for all workflow errors.
 * Provides context and metadata for debugging.
 */
export class WorkflowError extends Error {
	/** Error type identifier */
	readonly type: string;
	/** Error category for retry decisions */
	readonly category: ErrorCategory;
	/** Original error if this wraps another error */
	readonly cause?: Error;
	/** Additional context metadata */
	readonly context?: Record<string, unknown>;
	/** Timestamp when error occurred */
	readonly timestamp: Date;

	constructor(
		message: string,
		options?: {
			type?: string;
			category?: ErrorCategory;
			cause?: Error;
			context?: Record<string, unknown>;
		},
	) {
		super(message);
		this.name = "WorkflowError";
		this.type = options?.type ?? "WorkflowError";
		this.category = options?.category ?? "unknown";
		this.cause = options?.cause;
		this.context = options?.context;
		this.timestamp = new Date();

		// Maintains proper stack trace for where our error was thrown
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, this.constructor);
		}
	}

	/**
	 * Get a formatted error message with context.
	 */
	toFormattedString(): string {
		const parts = [
			`[${this.type}] ${this.message}`,
			this.context ? `Context: ${JSON.stringify(this.context, null, 2)}` : "",
			this.cause ? `Caused by: ${this.cause.message}` : "",
		].filter(Boolean);

		return parts.join("\n");
	}

	/**
	 * Convert error to a plain object for logging/serialization.
	 */
	toJSON(): Record<string, unknown> {
		return {
			name: this.name,
			type: this.type,
			category: this.category,
			message: this.message,
			context: this.context,
			timestamp: this.timestamp.toISOString(),
			stack: this.stack,
			cause: this.cause
				? {
						message: this.cause.message,
						stack: this.cause.stack,
					}
				: undefined,
		};
	}
}

/**
 * Error for validation failures.
 * Used when input data or configuration fails validation.
 */
export class ValidationError extends WorkflowError {
	/** Field or parameter that failed validation */
	readonly field?: string;
	/** Expected value or type */
	readonly expected?: string;
	/** Actual value received */
	readonly received?: unknown;

	constructor(
		message: string,
		options?: {
			field?: string;
			expected?: string;
			received?: unknown;
			cause?: Error;
			context?: Record<string, unknown>;
		},
	) {
		super(message, {
			type: "ValidationError",
			category: "permanent",
			cause: options?.cause,
			context: {
				...options?.context,
				field: options?.field,
				expected: options?.expected,
				received: options?.received,
			},
		});
		this.name = "ValidationError";
		this.field = options?.field;
		this.expected = options?.expected;
		this.received = options?.received;
	}
}

/**
 * Error for execution failures.
 * Used when a workflow step or operation fails during execution.
 */
export class ExecutionError extends WorkflowError {
	/** Step or operation that failed */
	readonly step?: string;
	/** Exit code if applicable */
	readonly exitCode?: number;

	constructor(
		message: string,
		options?: {
			step?: string;
			exitCode?: number;
			cause?: Error;
			context?: Record<string, unknown>;
		},
	) {
		super(message, {
			type: "ExecutionError",
			category: "unknown",
			cause: options?.cause,
			context: {
				...options?.context,
				step: options?.step,
				exitCode: options?.exitCode,
			},
		});
		this.name = "ExecutionError";
		this.step = options?.step;
		this.exitCode = options?.exitCode;
	}
}

/**
 * Error for timeout situations.
 * Used when an operation exceeds its time limit.
 */
export class TimeoutError extends WorkflowError {
	/** Maximum allowed time in milliseconds */
	readonly timeoutMs: number;
	/** Actual time elapsed before timeout */
	readonly elapsedMs?: number;
	/** Operation that timed out */
	readonly operation?: string;

	constructor(
		message: string,
		options: {
			timeoutMs: number;
			elapsedMs?: number;
			operation?: string;
			cause?: Error;
			context?: Record<string, unknown>;
		},
	) {
		super(message, {
			type: "TimeoutError",
			category: "transient",
			cause: options?.cause,
			context: {
				...options?.context,
				timeoutMs: options.timeoutMs,
				elapsedMs: options?.elapsedMs,
				operation: options?.operation,
			},
		});
		this.name = "TimeoutError";
		this.timeoutMs = options.timeoutMs;
		this.elapsedMs = options?.elapsedMs;
		this.operation = options?.operation;
	}
}

/**
 * Error for configuration issues.
 * Used when workflow configuration is invalid or missing.
 */
export class ConfigurationError extends WorkflowError {
	/** Configuration key that is invalid */
	readonly configKey?: string;

	constructor(
		message: string,
		options?: {
			configKey?: string;
			cause?: Error;
			context?: Record<string, unknown>;
		},
	) {
		super(message, {
			type: "ConfigurationError",
			category: "permanent",
			cause: options?.cause,
			context: {
				...options?.context,
				configKey: options?.configKey,
			},
		});
		this.name = "ConfigurationError";
		this.configKey = options?.configKey;
	}
}

/**
 * Error for tool-specific failures.
 * Used when a workflow tool encounters an error.
 */
export class ToolError extends WorkflowError {
	/** Name of the tool that failed */
	readonly toolName: string;
	/** Tool output if available */
	readonly output?: string;

	constructor(
		message: string,
		options: {
			toolName: string;
			output?: string;
			cause?: Error;
			context?: Record<string, unknown>;
		},
	) {
		super(message, {
			type: "ToolError",
			category: "transient",
			cause: options?.cause,
			context: {
				...options?.context,
				toolName: options.toolName,
				output: options?.output,
			},
		});
		this.name = "ToolError";
		this.toolName = options.toolName;
		this.output = options?.output;
	}
}

/**
 * Error for retry-related failures.
 * Used when all retry attempts have been exhausted.
 */
export class RetryError extends WorkflowError {
	/** Number of attempts made */
	readonly attempts: number;
	/** Maximum attempts allowed */
	readonly maxAttempts: number;
	/** Last error encountered */
	readonly lastError?: Error;

	constructor(
		message: string,
		options: {
			attempts: number;
			maxAttempts: number;
			lastError?: Error;
			context?: Record<string, unknown>;
		},
	) {
		super(message, {
			type: "RetryError",
			category: "permanent",
			cause: options?.lastError,
			context: {
				...options?.context,
				attempts: options.attempts,
				maxAttempts: options.maxAttempts,
			},
		});
		this.name = "RetryError";
		this.attempts = options.attempts;
		this.maxAttempts = options.maxAttempts;
		this.lastError = options?.lastError;
	}
}

/**
 * Error for circuit breaker open state.
 * Used when a circuit breaker prevents execution due to too many failures.
 */
export class CircuitBreakerError extends WorkflowError {
	/** Name of the circuit breaker */
	readonly circuitName: string;
	/** Number of consecutive failures */
	readonly failures: number;
	/** Time when circuit will reset (if applicable) */
	readonly resetTime?: Date;

	constructor(
		message: string,
		options: {
			circuitName: string;
			failures: number;
			resetTime?: Date;
			cause?: Error;
			context?: Record<string, unknown>;
		},
	) {
		super(message, {
			type: "CircuitBreakerError",
			category: "transient",
			cause: options?.cause,
			context: {
				...options?.context,
				circuitName: options.circuitName,
				failures: options.failures,
				resetTime: options?.resetTime?.toISOString(),
			},
		});
		this.name = "CircuitBreakerError";
		this.circuitName = options.circuitName;
		this.failures = options.failures;
		this.resetTime = options?.resetTime;
	}
}

/**
 * Type guard to check if an error is a WorkflowError.
 */
export function isWorkflowError(error: unknown): error is WorkflowError {
	return error instanceof WorkflowError;
}

/**
 * Type guard to check if an error is a ValidationError.
 */
export function isValidationError(error: unknown): error is ValidationError {
	return error instanceof ValidationError;
}

/**
 * Type guard to check if an error is an ExecutionError.
 */
export function isExecutionError(error: unknown): error is ExecutionError {
	return error instanceof ExecutionError;
}

/**
 * Type guard to check if an error is a TimeoutError.
 */
export function isTimeoutError(error: unknown): error is TimeoutError {
	return error instanceof TimeoutError;
}

/**
 * Type guard to check if an error is a ConfigurationError.
 */
export function isConfigurationError(
	error: unknown,
): error is ConfigurationError {
	return error instanceof ConfigurationError;
}

/**
 * Type guard to check if an error is a ToolError.
 */
export function isToolError(error: unknown): error is ToolError {
	return error instanceof ToolError;
}

/**
 * Type guard to check if an error is a RetryError.
 */
export function isRetryError(error: unknown): error is RetryError {
	return error instanceof RetryError;
}

/**
 * Type guard to check if an error is a CircuitBreakerError.
 */
export function isCircuitBreakerError(
	error: unknown,
): error is CircuitBreakerError {
	return error instanceof CircuitBreakerError;
}

/**
 * Convert any error to a WorkflowError.
 * If the error is already a WorkflowError, returns it unchanged.
 * Otherwise, wraps it in a new WorkflowError.
 */
export function toWorkflowError(
	error: unknown,
	context?: Record<string, unknown>,
): WorkflowError {
	if (error instanceof WorkflowError) {
		return error;
	}

	if (error instanceof Error) {
		return new WorkflowError(error.message, {
			cause: error,
			context,
		});
	}

	return new WorkflowError(String(error), { context });
}

/**
 * Generate retry suggestion based on error type and category.
 *
 * Analyzes the error to provide intelligent retry recommendations including
 * whether to retry, how many attempts, and which backoff strategy to use.
 *
 * @param error - The error to analyze
 * @returns Retry suggestion with recommended configuration
 *
 * @example
 * ```typescript
 * const error = new TimeoutError("Request timed out", { timeoutMs: 5000 });
 * const suggestion = getRetrySuggestion(error);
 * if (suggestion.shouldRetry) {
 *   console.log(`Retry ${suggestion.maxAttempts} times with ${suggestion.backoffStrategy} backoff`);
 * }
 * ```
 */
export function getRetrySuggestion(error: unknown): RetrySuggestion {
	// Convert to WorkflowError if needed
	const workflowError = toWorkflowError(error);

	// Permanent errors should not be retried
	if (workflowError.category === "permanent") {
		return {
			shouldRetry: false,
			maxAttempts: 0,
			backoffStrategy: "none",
			baseDelayMs: 0,
			reason: "Error is permanent and will not resolve on retry",
		};
	}

	// Handle specific error types with tailored retry strategies
	if (isTimeoutError(workflowError)) {
		return {
			shouldRetry: true,
			maxAttempts: 3,
			backoffStrategy: "exponential",
			baseDelayMs: 2000,
			reason: "Timeout errors often resolve with exponential backoff",
		};
	}

	if (isCircuitBreakerError(workflowError)) {
		const resetTime = workflowError.resetTime;
		const waitMessage = resetTime
			? `Wait until ${resetTime.toISOString()} for automatic reset`
			: "Wait for the circuit breaker reset timeout before retrying";
		return {
			shouldRetry: false,
			maxAttempts: 0,
			backoffStrategy: "none",
			baseDelayMs: 0,
			reason: `Circuit breaker is open due to ${workflowError.failures} consecutive failures. ${waitMessage}`,
		};
	}

	if (isRetryError(workflowError)) {
		return {
			shouldRetry: false,
			maxAttempts: 0,
			backoffStrategy: "none",
			baseDelayMs: 0,
			reason: "Retry attempts already exhausted",
		};
	}

	if (isValidationError(workflowError)) {
		return {
			shouldRetry: false,
			maxAttempts: 0,
			backoffStrategy: "none",
			baseDelayMs: 0,
			reason: "Validation errors require input correction, not retry",
		};
	}

	if (isConfigurationError(workflowError)) {
		return {
			shouldRetry: false,
			maxAttempts: 0,
			backoffStrategy: "none",
			baseDelayMs: 0,
			reason: "Configuration errors require manual fix, not retry",
		};
	}

	if (isExecutionError(workflowError)) {
		// Execution errors might be transient (e.g., temporary resource issues)
		return {
			shouldRetry: true,
			maxAttempts: 2,
			backoffStrategy: "linear",
			baseDelayMs: 1000,
			reason: "Execution errors may be transient and resolve on retry",
		};
	}

	if (isToolError(workflowError)) {
		return {
			shouldRetry: true,
			maxAttempts: 3,
			backoffStrategy: "exponential",
			baseDelayMs: 1000,
			reason: "Tool errors may be transient (network, rate limits, etc.)",
		};
	}

	// Default handling based on category
	if (workflowError.category === "transient") {
		return {
			shouldRetry: true,
			maxAttempts: 3,
			backoffStrategy: "exponential",
			baseDelayMs: 1000,
			reason: "Transient error may resolve with retry and backoff",
		};
	}

	// Unknown category - conservative retry approach
	return {
		shouldRetry: true,
		maxAttempts: 2,
		backoffStrategy: "linear",
		baseDelayMs: 1000,
		reason: "Error category unknown; attempting conservative retry strategy",
	};
}
