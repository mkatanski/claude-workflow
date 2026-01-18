/**
 * Circuit Breaker Pattern - Prevents cascading failures with external services.
 *
 * Provides automatic failure detection, circuit opening to fail fast,
 * and controlled recovery testing through state machine transitions.
 *
 * @example
 * ```typescript
 * import { CircuitBreaker, withCircuitBreaker, createCircuitBreaker } from "@/core/utils/circuit-breaker";
 *
 * // Class-based usage
 * const breaker = new CircuitBreaker("api-service", {
 *   failureThreshold: 5,
 *   successThreshold: 2,
 *   resetTimeoutMs: 60000,
 * }, emitter);
 *
 * const result = await breaker.execute(() => fetch("/api/data"));
 *
 * // One-shot usage
 * const result = await withCircuitBreaker(
 *   "api-service",
 *   () => fetch("/api/data"),
 *   { failureThreshold: 5 },
 *   emitter
 * );
 *
 * // Check circuit state
 * if (breaker.isOpen()) {
 *   console.log("Circuit is open, service unavailable");
 * }
 * ```
 *
 * @module
 */

export {
	CircuitBreaker,
	CircuitBreakerOpenError,
	CircuitBreakerTimeoutError,
	createCircuitBreaker,
	withCircuitBreaker,
} from "./circuitBreaker.js";
export {
	type CircuitBreakerConfig,
	type CircuitBreakerMetrics,
	type CircuitBreakerState,
	DEFAULT_CIRCUIT_BREAKER_CONFIG,
} from "./types.js";
