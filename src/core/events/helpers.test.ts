/**
 * Unit tests for event helpers.
 */

import { describe, expect, it, beforeEach } from "bun:test";
import { createEmitter, type WorkflowEmitter } from "./emitter.js";
import {
	createEventHelpers,
	createTimer,
	withEventTiming,
	type EventHelpers,
} from "./helpers.js";
import type { WorkflowEvent } from "./types.js";

describe("createEventHelpers", () => {
	let emitter: WorkflowEmitter;
	let helpers: EventHelpers;
	let emittedEvents: WorkflowEvent[];

	beforeEach(() => {
		// Use sync emission for tests to ensure events are captured immediately
		emitter = createEmitter({ asyncByDefault: false });
		helpers = createEventHelpers(emitter);
		emittedEvents = [];

		// Capture all events using pattern
		emitter.onPattern("*", (event) => {
			emittedEvents.push(event);
		});
	});

	describe("graph events", () => {
		it("should emit graph:compile:start", () => {
			helpers.graphCompileStart({ workflowName: "test-workflow", nodeCount: 3 });

			expect(emittedEvents).toHaveLength(1);
			expect(emittedEvents[0].type).toBe("graph:compile:start");
		});

		it("should emit graph:compile:complete", () => {
			helpers.graphCompileComplete({
				workflowName: "test-workflow",
				nodeCount: 5,
				edgeCount: 4,
				duration: 100,
			});

			expect(emittedEvents[0].type).toBe("graph:compile:complete");
		});

		it("should emit graph:node:registered", () => {
			helpers.graphNodeRegistered({
				nodeName: "process",
				nodeIndex: 0,
			});

			expect(emittedEvents[0].type).toBe("graph:node:registered");
		});

		it("should emit graph:edge:registered", () => {
			helpers.graphEdgeRegistered({
				from: "start",
				to: "process",
				isConditional: false,
			});

			expect(emittedEvents[0].type).toBe("graph:edge:registered");
		});
	});

	describe("workflow events", () => {
		it("should emit workflow:start and set context", () => {
			helpers.workflowStart({
				workflowName: "my-workflow",
				initialVariables: { key: "value" },
			});

			expect(emittedEvents[0].type).toBe("workflow:start");
			expect(emitter.getContext().workflowName).toBe("my-workflow");
		});

		it("should emit workflow:complete", () => {
			helpers.workflowComplete({
				workflowName: "my-workflow",
				finalVariables: { result: "done" },
				duration: 5000,
				success: true,
			});

			expect(emittedEvents[0].type).toBe("workflow:complete");
		});

		it("should emit workflow:error", () => {
			helpers.workflowError({
				workflowName: "my-workflow",
				error: "Something failed",
			});

			expect(emittedEvents[0].type).toBe("workflow:error");
		});

		it("should emit workflow:state:initialized", () => {
			helpers.workflowStateInitialized("my-workflow", { count: 0 });

			expect(emittedEvents[0].type).toBe("workflow:state:initialized");
		});
	});

	describe("node events", () => {
		it("should emit node:start and set context", () => {
			helpers.nodeStart({
				nodeName: "process-data",
				variables: { data: [] },
			});

			expect(emittedEvents[0].type).toBe("node:start");
			expect(emitter.getContext().nodeName).toBe("process-data");
		});

		it("should emit node:complete", () => {
			helpers.nodeComplete({
				nodeName: "process-data",
				variableUpdates: { result: "success" },
				duration: 500,
			});

			expect(emittedEvents[0].type).toBe("node:complete");
		});

		it("should emit node:error", () => {
			helpers.nodeError({
				nodeName: "process-data",
				error: "Processing failed",
			});

			expect(emittedEvents[0].type).toBe("node:error");
		});

		it("should emit node:tools:created", () => {
			helpers.nodeToolsCreated("my-node", ["bash", "claude"]);

			expect(emittedEvents[0].type).toBe("node:tools:created");
		});

		it("should emit node:variables:merged", () => {
			helpers.nodeVariablesMerged("my-node", { merged: true });

			expect(emittedEvents[0].type).toBe("node:variables:merged");
		});
	});

	describe("router events", () => {
		it("should emit router:start", () => {
			helpers.routerStart({
				nodeName: "router-node",
				sourceNode: "start",
			});

			expect(emittedEvents[0].type).toBe("router:start");
		});

		it("should emit router:decision", () => {
			helpers.routerDecision({
				nodeName: "router-node",
				sourceNode: "start",
				decision: "path-a",
				targetNode: "process-a",
				duration: 50,
			});

			expect(emittedEvents[0].type).toBe("router:decision");
		});

		it("should emit router:error", () => {
			helpers.routerError({
				nodeName: "router-node",
				sourceNode: "start",
				error: "No matching route",
			});

			expect(emittedEvents[0].type).toBe("router:error");
		});

		it("should emit edge:traverse", () => {
			helpers.edgeTraverse("start", "process", true, 0, 3);

			expect(emittedEvents[0].type).toBe("edge:traverse");
		});
	});

	describe("tool:bash events", () => {
		it("should emit tool:bash:start and set context", () => {
			helpers.bashStart({
				command: "ls -la",
				visible: true,
			});

			expect(emittedEvents[0].type).toBe("tool:bash:start");
			expect(emitter.getContext().toolName).toBe("bash");
		});

		it("should emit tool:bash:progress", () => {
			helpers.bashProgress("make build", 5000, "building");

			expect(emittedEvents[0].type).toBe("tool:bash:progress");
		});

		it("should emit tool:bash:output", () => {
			helpers.bashOutput("echo hello", "hello\n", false, "test");

			expect(emittedEvents[0].type).toBe("tool:bash:output");
		});

		it("should emit tool:bash:complete", () => {
			helpers.bashComplete({
				command: "ls -la",
				success: true,
				output: "file.txt",
				exitCode: 0,
				duration: 50,
			});

			expect(emittedEvents[0].type).toBe("tool:bash:complete");
		});

		it("should emit tool:bash:error", () => {
			helpers.bashError({
				command: "invalid-cmd",
				error: "command not found",
				exitCode: 127,
			});

			expect(emittedEvents[0].type).toBe("tool:bash:error");
		});
	});

	describe("retry events", () => {
		it("should emit retry:start", () => {
			helpers.retryStart({
				operationName: "api-call",
				maxAttempts: 3,
				backoffStrategy: "exponential",
			});

			expect(emittedEvents[0].type).toBe("retry:start");
		});

		it("should emit retry:attempt", () => {
			helpers.retryAttempt({
				operationName: "api-call",
				attempt: 2,
				maxAttempts: 3,
				delayMs: 2000,
				error: "timeout",
			});

			expect(emittedEvents[0].type).toBe("retry:attempt");
		});

		it("should emit retry:success", () => {
			helpers.retrySuccess({
				operationName: "api-call",
				attempt: 2,
				totalAttempts: 2,
				totalDuration: 3500,
			});

			expect(emittedEvents[0].type).toBe("retry:success");
		});

		it("should emit retry:exhausted", () => {
			helpers.retryExhausted({
				operationName: "api-call",
				totalAttempts: 3,
				totalDuration: 10000,
				lastError: "final failure",
			});

			expect(emittedEvents[0].type).toBe("retry:exhausted");
		});
	});

	describe("circuit breaker events", () => {
		it("should emit circuit:opened", () => {
			helpers.circuitBreakerOpened({
				operationName: "api-service",
				failureCount: 5,
				failureThreshold: 5,
				error: "connection timeout",
			});

			expect(emittedEvents[0].type).toBe("circuit:opened");
		});

		it("should emit circuit:halfopen", () => {
			helpers.circuitBreakerHalfOpen({
				operationName: "api-service",
				timeoutDuration: 30000,
			});

			expect(emittedEvents[0].type).toBe("circuit:halfopen");
		});

		it("should emit circuit:closed", () => {
			helpers.circuitBreakerClosed({
				operationName: "api-service",
				successCount: 3,
			});

			expect(emittedEvents[0].type).toBe("circuit:closed");
		});

		it("should emit circuit:test", () => {
			helpers.circuitBreakerTest({
				operationName: "api-service",
				success: true,
			});

			expect(emittedEvents[0].type).toBe("circuit:test");
		});

		it("should emit circuit:trip", () => {
			helpers.circuitBreakerTrip({
				operationName: "api-service",
				currentFailureCount: 4,
				failureThreshold: 5,
				error: "service unavailable",
			});

			expect(emittedEvents[0].type).toBe("circuit:trip");
		});
	});

	describe("tool:json events", () => {
		it("should emit tool:json:start and set context", () => {
			helpers.jsonStart("parse", "config-file");

			expect(emittedEvents[0].type).toBe("tool:json:start");
			expect(emitter.getContext().toolName).toBe("json");
		});

		it("should emit tool:json:complete", () => {
			helpers.jsonComplete("parse", true, { key: "value" }, "config-file");

			expect(emittedEvents[0].type).toBe("tool:json:complete");
		});
	});

	describe("state events", () => {
		it("should emit state:variable:set", () => {
			helpers.stateVariableSet("count", 5, 0);

			expect(emittedEvents[0].type).toBe("state:variable:set");
		});

		it("should emit state:variable:get", () => {
			helpers.stateVariableGet("count", 5, true);

			expect(emittedEvents[0].type).toBe("state:variable:get");
		});

		it("should emit state:merge", () => {
			helpers.stateMerge({ a: 1, b: 2 }, ["a", "b"]);

			expect(emittedEvents[0].type).toBe("state:merge");
		});
	});

	describe("infrastructure events", () => {
		it("should emit tmux:pane:create and set context", () => {
			helpers.tmuxPaneCreate({
				paneId: "pane-1",
				paneType: "claude",
			});

			expect(emittedEvents[0].type).toBe("tmux:pane:create");
			expect(emitter.getContext().paneId).toBe("pane-1");
		});

		it("should emit tmux:pane:close", () => {
			helpers.tmuxPaneClose({
				paneId: "pane-1",
				paneType: "claude",
			});

			expect(emittedEvents[0].type).toBe("tmux:pane:close");
		});

		it("should emit server:start", () => {
			helpers.serverStart(3000, "localhost");

			expect(emittedEvents[0].type).toBe("server:start");
		});

		it("should emit server:stop", () => {
			helpers.serverStop(3000, 60000);

			expect(emittedEvents[0].type).toBe("server:stop");
		});

		it("should emit cleanup:start", () => {
			helpers.cleanupStart({
				workflowName: "test-workflow",
				resourceCount: 3,
			});

			expect(emittedEvents[0].type).toBe("cleanup:start");
		});

		it("should emit cleanup:complete", () => {
			helpers.cleanupComplete({
				workflowName: "test-workflow",
				closedPanes: 2,
				cleanedFiles: 1,
				duration: 500,
			});

			expect(emittedEvents[0].type).toBe("cleanup:complete");
		});
	});

	describe("custom events", () => {
		it("should emit custom event", () => {
			helpers.custom("my-custom-event", { data: "test" });

			expect(emittedEvents[0].type).toBe("workflow:custom");
		});
	});

	describe("generic emit", () => {
		it("should emit typed event", () => {
			helpers.emit("workflow:start", {
				workflowName: "test",
				initialVariables: {},
			});

			expect(emittedEvents[0].type).toBe("workflow:start");
		});

		it("should emit sync event", () => {
			helpers.emitSync("workflow:start", {
				workflowName: "test",
				initialVariables: {},
			});

			expect(emittedEvents[0].type).toBe("workflow:start");
		});
	});
});

describe("createTimer", () => {
	it("should track elapsed time", async () => {
		const timer = createTimer();

		await Bun.sleep(50);
		const elapsed = timer.elapsed();

		expect(elapsed).toBeGreaterThanOrEqual(40);
		expect(elapsed).toBeLessThan(100);
	});

	it("should reset timer", async () => {
		const timer = createTimer();

		await Bun.sleep(50);
		timer.reset();

		const elapsed = timer.elapsed();
		expect(elapsed).toBeLessThan(20);
	});
});

describe("withEventTiming", () => {
	let emitter: WorkflowEmitter;
	let emittedEvents: WorkflowEvent[];

	beforeEach(() => {
		// Use sync emission for tests to ensure events are captured immediately
		emitter = createEmitter({ asyncByDefault: false });
		emittedEvents = [];
		emitter.onPattern("*", (event) => {
			emittedEvents.push(event);
		});
	});

	it("should emit start and complete events for sync function", async () => {
		const result = await withEventTiming(
			emitter,
			"node:start",
			"node:complete",
			{ nodeName: "test", variables: {} },
			(duration, res) => ({
				nodeName: "test",
				variableUpdates: { result: res },
				duration,
			}),
			() => "success",
		);

		expect(result).toBe("success");
		expect(emittedEvents).toHaveLength(2);
		expect(emittedEvents[0].type).toBe("node:start");
		expect(emittedEvents[1].type).toBe("node:complete");
	});

	it("should emit start and complete events for async function", async () => {
		const result = await withEventTiming(
			emitter,
			"node:start",
			"node:complete",
			{ nodeName: "test", variables: {} },
			(duration, res) => ({
				nodeName: "test",
				variableUpdates: { result: res },
				duration,
			}),
			async () => {
				await Bun.sleep(10);
				return "async-success";
			},
		);

		expect(result).toBe("async-success");
		expect(emittedEvents).toHaveLength(2);
		expect(emittedEvents[0].type).toBe("node:start");
		expect(emittedEvents[1].type).toBe("node:complete");
	});

	it("should not emit complete on error", async () => {
		try {
			await withEventTiming(
				emitter,
				"node:start",
				"node:complete",
				{ nodeName: "test", variables: {} },
				(duration, res) => ({
					nodeName: "test",
					variableUpdates: { result: res },
					duration,
				}),
				() => {
					throw new Error("test error");
				},
			);
		} catch {
			// Expected
		}

		expect(emittedEvents).toHaveLength(1);
		expect(emittedEvents[0].type).toBe("node:start");
	});

	it("should not emit complete on async error", async () => {
		try {
			await withEventTiming(
				emitter,
				"node:start",
				"node:complete",
				{ nodeName: "test", variables: {} },
				(duration, res) => ({
					nodeName: "test",
					variableUpdates: { result: res },
					duration,
				}),
				async () => {
					await Bun.sleep(10);
					throw new Error("async error");
				},
			);
		} catch {
			// Expected
		}

		expect(emittedEvents).toHaveLength(1);
		expect(emittedEvents[0].type).toBe("node:start");
	});
});
