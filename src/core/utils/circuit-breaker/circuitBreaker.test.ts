/**
 * Unit tests for CircuitBreaker.
 */

import { describe, expect, it } from "bun:test";
import {
	CircuitBreaker,
	CircuitBreakerOpenError,
	CircuitBreakerTimeoutError,
	createCircuitBreaker,
	withCircuitBreaker,
} from "./circuitBreaker.js";
import { DEFAULT_CIRCUIT_BREAKER_CONFIG } from "./types.js";

describe("CircuitBreaker", () => {
	describe("construction", () => {
		it("should create with default config", () => {
			const breaker = new CircuitBreaker("test-service");

			expect(breaker.getServiceName()).toBe("test-service");
			expect(breaker.getState()).toBe("closed");
			expect(breaker.isClosed()).toBe(true);
		});

		it("should create with custom config", () => {
			const breaker = new CircuitBreaker("test-service", {
				failureThreshold: 10,
				resetTimeoutMs: 30000,
			});

			expect(breaker.getState()).toBe("closed");
		});

		it("should initialize metrics correctly", () => {
			const breaker = new CircuitBreaker("test-service");
			const metrics = breaker.getMetrics();

			expect(metrics.state).toBe("closed");
			expect(metrics.successCount).toBe(0);
			expect(metrics.failureCount).toBe(0);
			expect(metrics.consecutiveFailures).toBe(0);
			expect(metrics.consecutiveSuccesses).toBe(0);
			expect(metrics.rejectedCount).toBe(0);
		});
	});

	describe("execute - success path", () => {
		it("should execute successful operation", async () => {
			const breaker = new CircuitBreaker("test-service");

			const result = await breaker.execute(async () => "success");

			expect(result.isOk()).toBe(true);
			expect(result.unwrap()).toBe("success");
		});

		it("should track success metrics", async () => {
			const breaker = new CircuitBreaker("test-service");

			await breaker.execute(async () => "success");

			const metrics = breaker.getMetrics();
			expect(metrics.successCount).toBe(1);
			expect(metrics.failureCount).toBe(0);
			expect(metrics.consecutiveFailures).toBe(0);
		});

		it("should reset consecutive failures on success", async () => {
			const breaker = new CircuitBreaker("test-service", {
				failureThreshold: 5,
			});

			// Cause some failures
			await breaker.execute(async () => {
				throw new Error("fail");
			});
			await breaker.execute(async () => {
				throw new Error("fail");
			});

			let metrics = breaker.getMetrics();
			expect(metrics.consecutiveFailures).toBe(2);

			// Success should reset
			await breaker.execute(async () => "success");

			metrics = breaker.getMetrics();
			expect(metrics.consecutiveFailures).toBe(0);
		});
	});

	describe("execute - failure path", () => {
		it("should handle operation failure", async () => {
			const breaker = new CircuitBreaker("test-service");

			const result = await breaker.execute(async () => {
				throw new Error("Operation failed");
			});

			expect(result.isErr()).toBe(true);
			expect(result.unwrapErr().message).toBe("Operation failed");
		});

		it("should track failure metrics", async () => {
			const breaker = new CircuitBreaker("test-service");

			await breaker.execute(async () => {
				throw new Error("fail");
			});

			const metrics = breaker.getMetrics();
			expect(metrics.failureCount).toBe(1);
			expect(metrics.consecutiveFailures).toBe(1);
		});

		it("should convert non-Error throws to Error", async () => {
			const breaker = new CircuitBreaker("test-service");

			const result = await breaker.execute(async () => {
				throw "string error";
			});

			expect(result.isErr()).toBe(true);
			expect(result.unwrapErr()).toBeInstanceOf(Error);
		});
	});

	describe("state transitions", () => {
		it("should transition to open after threshold failures", async () => {
			const breaker = new CircuitBreaker("test-service", {
				failureThreshold: 3,
				timeWindowMs: 60000,
			});

			// Cause failures to reach threshold
			for (let i = 0; i < 3; i++) {
				await breaker.execute(async () => {
					throw new Error("fail");
				});
			}

			expect(breaker.getState()).toBe("open");
			expect(breaker.isOpen()).toBe(true);
		});

		it("should reject requests when open", async () => {
			const breaker = new CircuitBreaker("test-service", {
				failureThreshold: 2,
				resetTimeoutMs: 60000, // Long timeout so we don't auto-reset
			});

			// Open the circuit
			await breaker.execute(async () => {
				throw new Error("fail");
			});
			await breaker.execute(async () => {
				throw new Error("fail");
			});

			expect(breaker.isOpen()).toBe(true);

			// Should reject
			const result = await breaker.execute(async () => "should not run");

			expect(result.isErr()).toBe(true);
			expect(result.unwrapErr()).toBeInstanceOf(CircuitBreakerOpenError);

			const metrics = breaker.getMetrics();
			expect(metrics.rejectedCount).toBe(1);
		});

		it("should transition to half-open after reset timeout", async () => {
			const breaker = new CircuitBreaker("test-service", {
				failureThreshold: 2,
				successThreshold: 1, // Set to 1 so one success closes the circuit
				resetTimeoutMs: 10, // Very short timeout
			});

			// Open the circuit
			await breaker.execute(async () => {
				throw new Error("fail");
			});
			await breaker.execute(async () => {
				throw new Error("fail");
			});

			expect(breaker.isOpen()).toBe(true);

			// Wait for reset timeout
			await Bun.sleep(20);

			// Next execution should transition to half-open, then to closed on success
			await breaker.execute(async () => "test");

			// Should be closed now after success in half-open (successThreshold=1)
			expect(breaker.getState()).toBe("closed");
		});

		it("should transition to closed after successes in half-open", async () => {
			const breaker = new CircuitBreaker("test-service", {
				failureThreshold: 2,
				successThreshold: 2,
				resetTimeoutMs: 10,
			});

			// Open the circuit
			await breaker.execute(async () => {
				throw new Error("fail");
			});
			await breaker.execute(async () => {
				throw new Error("fail");
			});

			// Wait and execute successful operations
			await Bun.sleep(20);

			await breaker.execute(async () => "success1");
			// First success puts us in half-open

			await breaker.execute(async () => "success2");
			// Second success should close circuit

			expect(breaker.isClosed()).toBe(true);
		});

		it("should return to open on failure in half-open", async () => {
			const breaker = new CircuitBreaker("test-service", {
				failureThreshold: 2,
				resetTimeoutMs: 10,
			});

			// Open the circuit
			await breaker.execute(async () => {
				throw new Error("fail");
			});
			await breaker.execute(async () => {
				throw new Error("fail");
			});

			// Wait for reset timeout
			await Bun.sleep(20);

			// Fail in half-open
			await breaker.execute(async () => {
				throw new Error("fail again");
			});

			expect(breaker.isOpen()).toBe(true);
		});
	});

	describe("timeout handling", () => {
		it("should timeout slow operations", async () => {
			const breaker = new CircuitBreaker("test-service", {
				operationTimeoutMs: 50,
			});

			const result = await breaker.execute(async () => {
				await Bun.sleep(100);
				return "too slow";
			});

			expect(result.isErr()).toBe(true);
			expect(result.unwrapErr()).toBeInstanceOf(CircuitBreakerTimeoutError);
		});

		it("should allow fast operations", async () => {
			const breaker = new CircuitBreaker("test-service", {
				operationTimeoutMs: 100,
			});

			const result = await breaker.execute(async () => {
				await Bun.sleep(10);
				return "fast enough";
			});

			expect(result.isOk()).toBe(true);
			expect(result.unwrap()).toBe("fast enough");
		});
	});

	describe("time window", () => {
		it("should not open circuit if failures are outside time window", async () => {
			const breaker = new CircuitBreaker("test-service", {
				failureThreshold: 3,
				timeWindowMs: 50, // Very short window
			});

			// First failure
			await breaker.execute(async () => {
				throw new Error("fail 1");
			});

			// Wait for window to expire
			await Bun.sleep(60);

			// More failures
			await breaker.execute(async () => {
				throw new Error("fail 2");
			});
			await breaker.execute(async () => {
				throw new Error("fail 3");
			});

			// Should still be closed because first failure is outside window
			// So we only have 2 failures in the current window
			expect(breaker.isClosed()).toBe(true);
		});
	});

	describe("manual controls", () => {
		it("should allow manual reset", async () => {
			const breaker = new CircuitBreaker("test-service", {
				failureThreshold: 2,
			});

			// Open the circuit
			await breaker.execute(async () => {
				throw new Error("fail");
			});
			await breaker.execute(async () => {
				throw new Error("fail");
			});

			expect(breaker.isOpen()).toBe(true);

			// Manual reset
			breaker.reset();

			expect(breaker.isClosed()).toBe(true);
			expect(breaker.getMetrics().consecutiveFailures).toBe(0);
		});

		it("should allow force open", () => {
			const breaker = new CircuitBreaker("test-service");

			expect(breaker.isClosed()).toBe(true);

			breaker.forceOpen();

			expect(breaker.isOpen()).toBe(true);
		});
	});

	describe("state checks", () => {
		it("should correctly report closed state", () => {
			const breaker = new CircuitBreaker("test-service");

			expect(breaker.isClosed()).toBe(true);
			expect(breaker.isOpen()).toBe(false);
			expect(breaker.isHalfOpen()).toBe(false);
			expect(breaker.getState()).toBe("closed");
		});

		it("should correctly report open state", async () => {
			const breaker = new CircuitBreaker("test-service", {
				failureThreshold: 1,
			});

			await breaker.execute(async () => {
				throw new Error("fail");
			});

			expect(breaker.isClosed()).toBe(false);
			expect(breaker.isOpen()).toBe(true);
			expect(breaker.isHalfOpen()).toBe(false);
			expect(breaker.getState()).toBe("open");
		});
	});

	describe("metrics", () => {
		it("should track all metrics correctly", async () => {
			const breaker = new CircuitBreaker("test-service", {
				failureThreshold: 5,
			});

			// 2 successes
			await breaker.execute(async () => "success");
			await breaker.execute(async () => "success");

			// 3 failures
			await breaker.execute(async () => {
				throw new Error("fail");
			});
			await breaker.execute(async () => {
				throw new Error("fail");
			});
			await breaker.execute(async () => {
				throw new Error("fail");
			});

			const metrics = breaker.getMetrics();

			expect(metrics.successCount).toBe(2);
			expect(metrics.failureCount).toBe(3);
			expect(metrics.consecutiveFailures).toBe(3);
			expect(metrics.consecutiveSuccesses).toBe(0);
		});

		it("should return copy of metrics", () => {
			const breaker = new CircuitBreaker("test-service");
			const metrics1 = breaker.getMetrics();
			const metrics2 = breaker.getMetrics();

			expect(metrics1).not.toBe(metrics2);
			expect(metrics1).toEqual(metrics2);
		});
	});
});

describe("CircuitBreakerOpenError", () => {
	it("should create with service info", () => {
		const metrics = {
			state: "open" as const,
			successCount: 10,
			failureCount: 5,
			consecutiveFailures: 5,
			consecutiveSuccesses: 0,
			rejectedCount: 2,
			lastOpenedAt: Date.now(),
		};

		const error = new CircuitBreakerOpenError("api-service", metrics);

		expect(error.name).toBe("CircuitBreakerOpenError");
		expect(error.serviceName).toBe("api-service");
		expect(error.metrics).toBe(metrics);
		expect(error.message).toContain("api-service");
		expect(error.message).toContain("OPEN");
	});
});

describe("CircuitBreakerTimeoutError", () => {
	it("should create with timeout info", () => {
		const error = new CircuitBreakerTimeoutError("slow-service", 5000);

		expect(error.name).toBe("CircuitBreakerTimeoutError");
		expect(error.serviceName).toBe("slow-service");
		expect(error.timeoutMs).toBe(5000);
		expect(error.message).toContain("slow-service");
		expect(error.message).toContain("5000ms");
	});
});

describe("createCircuitBreaker", () => {
	it("should create circuit breaker instance", () => {
		const breaker = createCircuitBreaker("my-service", {
			failureThreshold: 3,
		});

		expect(breaker).toBeInstanceOf(CircuitBreaker);
		expect(breaker.getServiceName()).toBe("my-service");
	});
});

describe("withCircuitBreaker", () => {
	it("should execute operation with circuit breaker protection", async () => {
		const result = await withCircuitBreaker(
			"one-shot-service",
			async () => "result",
		);

		expect(result.isOk()).toBe(true);
		expect(result.unwrap()).toBe("result");
	});

	it("should handle operation failure", async () => {
		const result = await withCircuitBreaker("one-shot-service", async () => {
			throw new Error("failed");
		});

		expect(result.isErr()).toBe(true);
		expect(result.unwrapErr().message).toBe("failed");
	});

	it("should apply custom config", async () => {
		const result = await withCircuitBreaker(
			"one-shot-service",
			async () => {
				await Bun.sleep(100);
				return "slow";
			},
			{ operationTimeoutMs: 50 },
		);

		expect(result.isErr()).toBe(true);
		expect(result.unwrapErr()).toBeInstanceOf(CircuitBreakerTimeoutError);
	});
});

describe("DEFAULT_CIRCUIT_BREAKER_CONFIG", () => {
	it("should have sensible defaults", () => {
		expect(DEFAULT_CIRCUIT_BREAKER_CONFIG.failureThreshold).toBeGreaterThan(0);
		expect(DEFAULT_CIRCUIT_BREAKER_CONFIG.successThreshold).toBeGreaterThan(0);
		expect(DEFAULT_CIRCUIT_BREAKER_CONFIG.resetTimeoutMs).toBeGreaterThan(0);
		expect(DEFAULT_CIRCUIT_BREAKER_CONFIG.timeWindowMs).toBeGreaterThan(0);
		expect(DEFAULT_CIRCUIT_BREAKER_CONFIG.operationTimeoutMs).toBeGreaterThan(0);
	});
});
