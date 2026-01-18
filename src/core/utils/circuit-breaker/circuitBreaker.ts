/**
 * CircuitBreaker - Implements the circuit breaker pattern to prevent cascading failures.
 *
 * Provides automatic failure detection, circuit opening to prevent further failures,
 * and controlled recovery testing through state machine (closed → open → half-open).
 */

import type { WorkflowEmitter } from "../../events/emitter.js";
import { ResultBox } from "../result/result.js";
import {
	type CircuitBreakerConfig,
	type CircuitBreakerMetrics,
	type CircuitBreakerState,
	DEFAULT_CIRCUIT_BREAKER_CONFIG,
} from "./types.js";
import { CircuitBreakerError } from "../errors/errorClasses.js";
import { createEventHelpers } from "../../events/helpers.js";

/**
 * Error thrown when circuit breaker is open.
 */
export class CircuitBreakerOpenError extends CircuitBreakerError {
	constructor(
		public readonly serviceName: string,
		public readonly metrics: CircuitBreakerMetrics,
	) {
		super(
			`Circuit breaker is OPEN for service '${serviceName}'. ` +
				`Consecutive failures: ${metrics.consecutiveFailures}.`,
			{
				circuitName: serviceName,
				failures: metrics.consecutiveFailures,
				resetTime: metrics.lastOpenedAt
					? new Date(metrics.lastOpenedAt)
					: undefined,
			},
		);
		this.name = "CircuitBreakerOpenError";
	}
}

/**
 * Error thrown when operation times out.
 */
export class CircuitBreakerTimeoutError extends CircuitBreakerError {
	constructor(
		public readonly serviceName: string,
		public readonly timeoutMs: number,
	) {
		super(
			`Operation for service '${serviceName}' timed out after ${timeoutMs}ms`,
			{
				circuitName: serviceName,
				failures: 1,
			},
		);
		this.name = "CircuitBreakerTimeoutError";
	}
}

/**
 * CircuitBreaker - Protects external service calls from cascading failures.
 *
 * State machine:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Circuit is open after failures, requests fail fast
 * - HALF_OPEN: Testing recovery, limited requests allowed
 *
 * @example
 * ```typescript
 * const breaker = new CircuitBreaker("api-service", {
 *   failureThreshold: 5,
 *   successThreshold: 2,
 *   resetTimeoutMs: 60000,
 * });
 *
 * const result = await breaker.execute(async () => {
 *   return await fetch("/api/data");
 * });
 *
 * if (result.isOk()) {
 *   console.log("Success:", result.unwrap());
 * } else {
 *   console.error("Failed:", result.unwrapErr());
 * }
 * ```
 */
export class CircuitBreaker {
	private readonly serviceName: string;
	private readonly config: Required<CircuitBreakerConfig>;
	private readonly emitter: WorkflowEmitter | undefined;
	private readonly eventHelpers:
		| ReturnType<typeof createEventHelpers>
		| undefined;

	private state: CircuitBreakerState = "closed";
	private metrics: CircuitBreakerMetrics = {
		state: "closed",
		successCount: 0,
		failureCount: 0,
		consecutiveFailures: 0,
		consecutiveSuccesses: 0,
		rejectedCount: 0,
	};

	// Track failures within time window
	private failureTimestamps: number[] = [];

	constructor(
		serviceName: string,
		config: CircuitBreakerConfig = {},
		emitter?: WorkflowEmitter,
	) {
		this.serviceName = serviceName;
		this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
		this.emitter = this.config.emitEvents ? emitter : undefined;
		if (this.emitter && this.config.emitEvents) {
			this.eventHelpers = createEventHelpers(this.emitter);
		}
		this.metrics.state = this.state;
	}

	/**
	 * Execute an operation with circuit breaker protection.
	 *
	 * @param operation - The async operation to execute
	 * @returns ResultBox with the operation result or circuit breaker error
	 */
	async execute<T>(operation: () => Promise<T>): Promise<ResultBox<T, Error>> {
		// Check if circuit is open
		if (this.state === "open") {
			if (this.shouldAttemptReset()) {
				this.transitionToHalfOpen();
			} else {
				this.metrics.rejectedCount++;
				this.emitRejectedEvent();
				return ResultBox.err(
					new CircuitBreakerOpenError(this.serviceName, this.metrics),
				);
			}
		}

		// Execute operation with timeout
		const result = await this.executeWithTimeout(operation);

		// Handle result based on success/failure
		if (result.isOk()) {
			this.recordSuccess();
		} else {
			this.recordFailure();
		}

		return result;
	}

	/**
	 * Execute an operation with a timeout.
	 *
	 * @param operation - The async operation to execute
	 * @returns ResultBox with result or timeout error
	 */
	private async executeWithTimeout<T>(
		operation: () => Promise<T>,
	): Promise<ResultBox<T, Error>> {
		const timeoutPromise = new Promise<never>((_, reject) => {
			setTimeout(() => {
				reject(
					new CircuitBreakerTimeoutError(
						this.serviceName,
						this.config.operationTimeoutMs,
					),
				);
			}, this.config.operationTimeoutMs);
		});

		try {
			const result = await Promise.race([operation(), timeoutPromise]);
			return ResultBox.ok(result);
		} catch (error) {
			return ResultBox.err(
				error instanceof Error ? error : new Error(String(error)),
			);
		}
	}

	/**
	 * Record a successful operation.
	 */
	private recordSuccess(): void {
		this.metrics.successCount++;
		this.metrics.consecutiveFailures = 0;

		if (this.state === "half-open") {
			this.metrics.consecutiveSuccesses++;

			if (this.metrics.consecutiveSuccesses >= this.config.successThreshold) {
				this.transitionToClosed();
			}
		}

		this.emitTestEvent(true);
	}

	/**
	 * Record a failed operation.
	 */
	private recordFailure(): void {
		const now = Date.now();
		this.metrics.failureCount++;
		this.metrics.consecutiveFailures++;
		this.metrics.consecutiveSuccesses = 0;

		// Track failure timestamp
		this.failureTimestamps.push(now);

		// Clean up old failures outside time window
		this.cleanupOldFailures(now);

		// Check if we should open the circuit
		if (this.state === "closed" || this.state === "half-open") {
			if (this.shouldOpenCircuit()) {
				this.transitionToOpen();
			}
		}

		this.emitTestEvent(false);
	}

	/**
	 * Remove failure timestamps outside the time window.
	 */
	private cleanupOldFailures(now: number): void {
		const cutoff = now - this.config.timeWindowMs;
		this.failureTimestamps = this.failureTimestamps.filter(
			(timestamp) => timestamp > cutoff,
		);
	}

	/**
	 * Check if circuit should be opened based on failure threshold.
	 */
	private shouldOpenCircuit(): boolean {
		// Check if failures exceed threshold within time window
		return this.failureTimestamps.length >= this.config.failureThreshold;
	}

	/**
	 * Check if we should attempt to reset (transition to half-open).
	 */
	private shouldAttemptReset(): boolean {
		if (!this.metrics.lastOpenedAt) {
			return false;
		}

		const now = Date.now();
		const timeSinceOpened = now - this.metrics.lastOpenedAt;
		return timeSinceOpened >= this.config.resetTimeoutMs;
	}

	// ==========================================================================
	// State Transitions
	// ==========================================================================

	/**
	 * Transition to CLOSED state (normal operation).
	 */
	private transitionToClosed(): void {
		const previousState = this.state;
		this.state = "closed";
		this.metrics.state = "closed";
		this.metrics.consecutiveFailures = 0;
		this.metrics.consecutiveSuccesses = 0;
		this.metrics.lastClosedAt = Date.now();
		this.failureTimestamps = [];

		this.emitStateTransition(previousState, "closed");
	}

	/**
	 * Transition to OPEN state (failing fast).
	 */
	private transitionToOpen(): void {
		const previousState = this.state;
		this.state = "open";
		this.metrics.state = "open";
		this.metrics.lastOpenedAt = Date.now();

		this.emitStateTransition(previousState, "open");
	}

	/**
	 * Transition to HALF_OPEN state (testing recovery).
	 */
	private transitionToHalfOpen(): void {
		const previousState = this.state;
		this.state = "half-open";
		this.metrics.state = "half-open";
		this.metrics.consecutiveSuccesses = 0;
		this.metrics.lastHalfOpenAt = Date.now();

		this.emitStateTransition(previousState, "half-open");
	}

	// ==========================================================================
	// Event Emission
	// ==========================================================================

	/**
	 * Emit a state transition event.
	 */
	private emitStateTransition(
		_from: CircuitBreakerState,
		to: CircuitBreakerState,
	): void {
		if (!this.eventHelpers) return;

		// Emit properly typed events based on state transition
		if (to === "open") {
			this.eventHelpers.circuitBreakerOpened({
				operationName: this.serviceName,
				failureCount: this.metrics.failureCount,
				failureThreshold: this.config.failureThreshold,
				error: undefined,
			});
		} else if (to === "half-open") {
			this.eventHelpers.circuitBreakerHalfOpen({
				operationName: this.serviceName,
				timeoutDuration: this.config.resetTimeoutMs,
			});
		} else if (to === "closed") {
			this.eventHelpers.circuitBreakerClosed({
				operationName: this.serviceName,
				successCount: this.metrics.successCount,
			});
		}
	}

	/**
	 * Emit a circuit breaker test event (success/failure during operation).
	 */
	private emitTestEvent(success: boolean, error?: string): void {
		if (!this.eventHelpers) return;

		this.eventHelpers.circuitBreakerTest({
			operationName: this.serviceName,
			success,
			error,
		});
	}

	/**
	 * Emit a circuit breaker rejected event (request rejected due to open circuit).
	 */
	private emitRejectedEvent(): void {
		if (!this.eventHelpers) return;

		this.eventHelpers.circuitBreakerRejected({
			operationName: this.serviceName,
			consecutiveFailures: this.metrics.consecutiveFailures,
			rejectedCount: this.metrics.rejectedCount,
			resetTimeoutMs: this.config.resetTimeoutMs,
		});
	}

	// ==========================================================================
	// Public API
	// ==========================================================================

	/**
	 * Get the current state of the circuit breaker.
	 */
	getState(): CircuitBreakerState {
		return this.state;
	}

	/**
	 * Get current circuit breaker metrics.
	 */
	getMetrics(): CircuitBreakerMetrics {
		return { ...this.metrics };
	}

	/**
	 * Check if the circuit is closed (accepting requests).
	 */
	isClosed(): boolean {
		return this.state === "closed";
	}

	/**
	 * Check if the circuit is open (rejecting requests).
	 */
	isOpen(): boolean {
		return this.state === "open";
	}

	/**
	 * Check if the circuit is half-open (testing recovery).
	 */
	isHalfOpen(): boolean {
		return this.state === "half-open";
	}

	/**
	 * Manually reset the circuit breaker to closed state.
	 * Use with caution - typically circuit should recover automatically.
	 */
	reset(): void {
		this.transitionToClosed();
	}

	/**
	 * Manually force the circuit open.
	 * Useful for maintenance windows or forced degradation.
	 */
	forceOpen(): void {
		this.transitionToOpen();
	}

	/**
	 * Get the service name this circuit breaker protects.
	 */
	getServiceName(): string {
		return this.serviceName;
	}
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new CircuitBreaker instance.
 * Convenience function for fluent usage.
 *
 * @param serviceName - Name of the service being protected
 * @param config - Circuit breaker configuration
 * @param emitter - Optional event emitter
 */
export function createCircuitBreaker(
	serviceName: string,
	config: CircuitBreakerConfig = {},
	emitter?: WorkflowEmitter,
): CircuitBreaker {
	return new CircuitBreaker(serviceName, config, emitter);
}

/**
 * Execute an operation with circuit breaker protection.
 * Convenience function for one-shot circuit breaker usage.
 *
 * @param serviceName - Name of the service
 * @param operation - The operation to execute
 * @param config - Circuit breaker configuration
 * @param emitter - Optional event emitter
 */
export async function withCircuitBreaker<T>(
	serviceName: string,
	operation: () => Promise<T>,
	config: CircuitBreakerConfig = {},
	emitter?: WorkflowEmitter,
): Promise<ResultBox<T, Error>> {
	const breaker = new CircuitBreaker(serviceName, config, emitter);
	return breaker.execute(operation);
}
