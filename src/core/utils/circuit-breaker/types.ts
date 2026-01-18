/**
 * Circuit Breaker Pattern - Types and Configuration
 *
 * Provides type definitions for circuit breaker implementation
 * to prevent cascading failures with external services.
 */

/**
 * Circuit breaker state.
 *
 * - closed: Normal operation, requests pass through
 * - open: Circuit is open, requests fail immediately
 * - half-open: Testing if service recovered, limited requests allowed
 */
export type CircuitBreakerState = "closed" | "open" | "half-open";

/**
 * Configuration for circuit breaker behavior.
 */
export interface CircuitBreakerConfig {
	/** Number of failures before opening the circuit */
	failureThreshold?: number;
	/** Number of successful calls to close circuit from half-open state */
	successThreshold?: number;
	/** Time in milliseconds to wait before attempting recovery (half-open) */
	resetTimeoutMs?: number;
	/** Time window in milliseconds for counting failures */
	timeWindowMs?: number;
	/** Timeout in milliseconds for individual operations */
	operationTimeoutMs?: number;
	/** Whether to emit events */
	emitEvents?: boolean;
}

/**
 * Default circuit breaker configuration.
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: Required<CircuitBreakerConfig> = {
	failureThreshold: 5,
	successThreshold: 2,
	resetTimeoutMs: 60000,
	timeWindowMs: 60000,
	operationTimeoutMs: 30000,
	emitEvents: true,
};

/**
 * Metrics for circuit breaker operation.
 */
export interface CircuitBreakerMetrics {
	/** Current state of the circuit */
	state: CircuitBreakerState;
	/** Total number of successful calls */
	successCount: number;
	/** Total number of failed calls */
	failureCount: number;
	/** Number of consecutive failures */
	consecutiveFailures: number;
	/** Number of consecutive successes in half-open state */
	consecutiveSuccesses: number;
	/** Timestamp when circuit was last opened */
	lastOpenedAt?: number;
	/** Timestamp when circuit transitioned to half-open */
	lastHalfOpenAt?: number;
	/** Timestamp when circuit was last closed */
	lastClosedAt?: number;
	/** Total number of rejected calls (while open) */
	rejectedCount: number;
}
