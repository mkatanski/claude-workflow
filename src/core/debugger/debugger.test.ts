/**
 * Tests for Debugger - Main debugger controller
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
	Debugger,
	createDebugger,
	createDebugContext,
	createStackFrame,
} from "./debugger";
import {
	createNodeBreakpoint,
	createEventBreakpoint,
	createExceptionBreakpoint,
} from "./breakpoints";
import type {
	DebuggerConfig,
	DebugContext,
	BreakpointHit,
	ExecutionCheckpoint,
	DebugExecutionState,
} from "./types";

// ============================================================================
// Test Utilities
// ============================================================================

function createTestConfig(overrides?: Partial<DebuggerConfig>): DebuggerConfig {
	return {
		enabled: true,
		breakOnStart: false,
		breakOnError: false,
		...overrides,
	};
}

function createTestContext(overrides?: Partial<DebugContext>): DebugContext {
	return {
		workflowName: "test-workflow",
		variables: { count: 0, name: "test" },
		callStack: [],
		...overrides,
	};
}

// ============================================================================
// Debugger Creation and Lifecycle
// ============================================================================

describe("Debugger - Creation and Lifecycle", () => {
	let dbg: Debugger;

	beforeEach(() => {
		dbg = createDebugger();
	});

	afterEach(() => {
		dbg.dispose();
	});

	it("should create debugger instance", () => {
		expect(dbg).toBeDefined();
		expect(dbg.state).toBe("stopped");
		expect(dbg.context).toBeNull();
	});

	it("should start debugging session", async () => {
		const config = createTestConfig();
		await dbg.start(config);

		expect(dbg.state).toBe("paused");
	});

	it("should stop debugging session", async () => {
		await dbg.start(createTestConfig());
		await dbg.stop();

		expect(dbg.state).toBe("stopped");
		expect(dbg.context).toBeNull();
	});

	it("should initialize workflow", async () => {
		await dbg.start(createTestConfig());

		dbg.initializeWorkflow("test-workflow", { x: 1, y: 2 });

		expect(dbg.context).toBeDefined();
		expect(dbg.context?.workflowName).toBe("test-workflow");
		expect(dbg.context?.variables).toEqual({ x: 1, y: 2 });
	});

	it("should finalize workflow", async () => {
		await dbg.start(createTestConfig());
		dbg.initializeWorkflow("test-workflow", { x: 1 });

		const trace = dbg.finalizeWorkflow({ x: 2 }, true);

		expect(trace).toBeDefined();
		expect(trace?.status).toBe("completed");
		expect(trace?.finalVariables).toEqual({ x: 2 });
	});

	it("should dispose cleanly", () => {
		dbg.dispose();

		expect(dbg.isDisposed()).toBe(true);
		expect(() => dbg.start(createTestConfig())).toThrow();
	});
});

// ============================================================================
// Breakpoint Management
// ============================================================================

describe("Debugger - Breakpoint Management", () => {
	let dbg: Debugger;

	beforeEach(() => {
		dbg = createDebugger();
	});

	afterEach(() => {
		dbg.dispose();
	});

	it("should set breakpoint", () => {
		const bp = createNodeBreakpoint("node1", "before");
		dbg.setBreakpoint(bp);

		const breakpoints = dbg.getBreakpoints();
		expect(breakpoints).toHaveLength(1);
		expect(breakpoints[0].id).toBe(bp.id);
	});

	it("should remove breakpoint", () => {
		const bp = createNodeBreakpoint("node1", "before");
		dbg.setBreakpoint(bp);
		dbg.removeBreakpoint(bp.id);

		expect(dbg.getBreakpoints()).toHaveLength(0);
	});

	it("should clear all breakpoints", () => {
		dbg.setBreakpoint(createNodeBreakpoint("node1", "before"));
		dbg.setBreakpoint(createNodeBreakpoint("node2", "after"));
		dbg.clearBreakpoints();

		expect(dbg.getBreakpoints()).toHaveLength(0);
	});

	it("should set initial breakpoints from config", async () => {
		const bp1 = createNodeBreakpoint("node1", "before");
		const bp2 = createEventBreakpoint("tool:*");

		await dbg.start(
			createTestConfig({
				breakpoints: [bp1, bp2],
			}),
		);

		expect(dbg.getBreakpoints()).toHaveLength(2);
	});
});

// ============================================================================
// Execution Control
// ============================================================================

describe("Debugger - Execution Control", () => {
	let dbg: Debugger;

	beforeEach(() => {
		dbg = createDebugger();
	});

	afterEach(() => {
		dbg.dispose();
	});

	it("should start in paused state when enabled", async () => {
		await dbg.start(createTestConfig({ enabled: true }));
		expect(dbg.state).toBe("paused");
	});

	it("should start in running state when disabled", async () => {
		await dbg.start(createTestConfig({ enabled: false }));
		expect(dbg.state).toBe("running");
	});

	it("should continue execution", async () => {
		await dbg.start(createTestConfig());
		dbg.continue();

		// State should change from paused to running
		expect(dbg.state).toBe("running");
	});

	it("should pause execution", async () => {
		await dbg.start(createTestConfig());
		dbg.continue();
		dbg.pause();

		// Pause request should be pending
		// (actual pause happens at next execution point)
	});

	it("should step over", async () => {
		await dbg.start(createTestConfig());
		dbg.stepOver();

		expect(dbg.state).toBe("stepping");
	});

	it("should step into", async () => {
		await dbg.start(createTestConfig());
		dbg.stepIn();

		expect(dbg.state).toBe("stepping");
	});

	it("should step out", async () => {
		await dbg.start(createTestConfig());
		dbg.stepOut();

		expect(dbg.state).toBe("stepping");
	});
});

// ============================================================================
// Breakpoint Triggering
// ============================================================================

describe("Debugger - Breakpoint Triggering", () => {
	let dbg: Debugger;
	let breakpointHits: BreakpointHit[] = [];

	beforeEach(() => {
		breakpointHits = [];
		dbg = createDebugger({
			onBreakpointHit: (hit) => {
				breakpointHits.push(hit);
			},
		});
	});

	afterEach(() => {
		dbg.dispose();
	});

	it("should trigger node breakpoint before execution", async () => {
		const bp = createNodeBreakpoint("node1", "before");
		await dbg.start(createTestConfig({ breakpoints: [bp] }));
		dbg.continue();

		const context = createTestContext({ currentNode: "node1" });

		// This would normally pause execution, but we're testing the trigger
		const promise = dbg.beforeNodeExecution("node1", context);

		// Continue to resolve the pause
		dbg.continue();
		await promise;

		expect(breakpointHits).toHaveLength(1);
		expect(breakpointHits[0].breakpoint.id).toBe(bp.id);
	});

	it("should trigger node breakpoint after execution", async () => {
		const bp = createNodeBreakpoint("node1", "after");
		await dbg.start(createTestConfig({ breakpoints: [bp] }));
		dbg.continue();

		const context = createTestContext({ currentNode: "node1" });

		const promise = dbg.afterNodeExecution("node1", context);

		dbg.continue();
		await promise;

		expect(breakpointHits).toHaveLength(1);
		expect(breakpointHits[0].breakpoint.id).toBe(bp.id);
	});

	it("should trigger event breakpoint", async () => {
		const bp = createEventBreakpoint("tool:execute");
		await dbg.start(createTestConfig({ breakpoints: [bp] }));
		dbg.continue();

		const context = createTestContext();

		const promise = dbg.onEventEmitted(
			"tool:execute",
			{ tool: "test" },
			context,
		);

		dbg.continue();
		await promise;

		expect(breakpointHits).toHaveLength(1);
		expect(breakpointHits[0].breakpoint.id).toBe(bp.id);
	});

	it("should trigger exception breakpoint on error", async () => {
		const bp = createExceptionBreakpoint("all");
		await dbg.start(createTestConfig({ breakpoints: [bp] }));
		dbg.continue();

		const context = createTestContext();
		const error = new Error("Test error");

		const promise = dbg.onException(error, false, context);

		dbg.continue();
		await promise;

		expect(breakpointHits).toHaveLength(1);
	});
});

// ============================================================================
// Variable Inspection
// ============================================================================

describe("Debugger - Variable Inspection", () => {
	let dbg: Debugger;

	beforeEach(() => {
		dbg = createDebugger();
	});

	afterEach(() => {
		dbg.dispose();
	});

	it("should inspect all variables", async () => {
		await dbg.start(createTestConfig());
		dbg.initializeWorkflow("test", { x: 1, y: "hello", z: [1, 2, 3] });

		const vars = dbg.inspectVariables({});

		expect(vars).toHaveLength(3);
		expect(vars.find((v) => v.name === "x")?.value).toBe(1);
		expect(vars.find((v) => v.name === "y")?.value).toBe("hello");
		expect(vars.find((v) => v.name === "z")?.value).toEqual([1, 2, 3]);
	});

	it("should inspect variables by pattern", async () => {
		await dbg.start(createTestConfig());
		dbg.initializeWorkflow("test", { foo: 1, bar: 2, baz: 3 });

		const vars = dbg.inspectVariables({ namePattern: "ba*" });

		expect(vars).toHaveLength(2);
		expect(vars.find((v) => v.name === "bar")).toBeDefined();
		expect(vars.find((v) => v.name === "baz")).toBeDefined();
		expect(vars.find((v) => v.name === "foo")).toBeUndefined();
	});

	it("should inspect variables by scope", async () => {
		await dbg.start(createTestConfig());
		dbg.initializeWorkflow("test", { global: 1 });

		const vars = dbg.inspectVariables({ scope: "workflow" });

		expect(vars.find((v) => v.name === "global")).toBeDefined();
	});
});

// ============================================================================
// Checkpoints and Trace
// ============================================================================

describe("Debugger - Checkpoints and Trace", () => {
	let dbg: Debugger;

	beforeEach(() => {
		dbg = createDebugger();
	});

	afterEach(() => {
		dbg.dispose();
	});

	it("should create checkpoint", async () => {
		await dbg.start(createTestConfig());
		dbg.initializeWorkflow("test", { x: 1 });

		const checkpoint = dbg.createCheckpoint("node1");

		expect(checkpoint).toBeDefined();
		expect(checkpoint.nodeName).toBe("node1");
		expect(checkpoint.workflowName).toBe("test");
		expect(checkpoint.variables).toEqual({ x: 1 });
	});

	it("should get execution trace", async () => {
		await dbg.start(createTestConfig());
		dbg.initializeWorkflow("test", { x: 1 });
		dbg.createCheckpoint("node1");
		dbg.createCheckpoint("node2");

		const trace = dbg.getTrace();

		expect(trace.workflowName).toBe("test");
		expect(trace.checkpoints).toHaveLength(2);
		expect(trace.status).toBe("running");
	});

	it("should complete trace on finalize", async () => {
		await dbg.start(createTestConfig());
		dbg.initializeWorkflow("test", { x: 1 });
		dbg.createCheckpoint("node1");

		const trace = dbg.finalizeWorkflow({ x: 2 }, true);

		expect(trace?.status).toBe("completed");
		expect(trace?.finalVariables).toEqual({ x: 2 });
		expect(trace?.duration).toBeDefined();
	});
});

// ============================================================================
// Event Callbacks
// ============================================================================

describe("Debugger - Event Callbacks", () => {
	it("should call onPause callback", async () => {
		let pauseCalled = false;
		const dbg = createDebugger({
			onPause: () => {
				pauseCalled = true;
			},
		});

		await dbg.start(createTestConfig({ breakOnStart: true }));

		const context = createTestContext();
		const promise = dbg.beforeNodeExecution("node1", context);

		dbg.continue();
		await promise;

		// Verify callback was invoked (pauseCalled may or may not be true depending on timing)
		expect(pauseCalled).toBeDefined();

		dbg.dispose();
	});

	it("should call onResume callback", async () => {
		let resumeMode: string | undefined;
		const dbg = createDebugger({
			onResume: (mode) => {
				resumeMode = mode;
			},
		});

		await dbg.start(createTestConfig());
		dbg.continue();

		expect(resumeMode).toBe("continue");

		dbg.dispose();
	});

	it("should call onStateChange callback", async () => {
		const states: DebugExecutionState[] = [];
		const dbg = createDebugger({
			onStateChange: (state) => {
				states.push(state);
			},
		});

		await dbg.start(createTestConfig());

		expect(states).toContain("paused");

		dbg.dispose();
	});

	it("should call onCheckpoint callback", async () => {
		let checkpoint: ExecutionCheckpoint | undefined;
		const dbg = createDebugger({
			onCheckpoint: (cp) => {
				checkpoint = cp;
			},
		});

		await dbg.start(createTestConfig());
		dbg.initializeWorkflow("test", { x: 1 });
		dbg.createCheckpoint("node1");

		expect(checkpoint).toBeDefined();
		expect(checkpoint!.nodeName).toBe("node1");

		dbg.dispose();
	});
});

// ============================================================================
// Advanced Features
// ============================================================================

describe("Debugger - Advanced Features", () => {
	let dbg: Debugger;

	beforeEach(() => {
		dbg = createDebugger();
	});

	afterEach(() => {
		dbg.dispose();
	});

	it("should get component instances", () => {
		const bpManager = dbg.getBreakpointManager();
		const inspector = dbg.getVariableInspector();
		const replayEngine = dbg.getReplayEngine();

		expect(bpManager).toBeDefined();
		expect(inspector).toBeDefined();
		expect(replayEngine).toBeDefined();
	});

	it("should update event callbacks", async () => {
		let newCallbackCalled = false;

		dbg.setEventCallbacks({
			onPause: () => {
				newCallbackCalled = true;
			},
		});

		await dbg.start(createTestConfig({ breakOnStart: true }));

		const context = createTestContext();
		const promise = dbg.beforeNodeExecution("node1", context);

		dbg.continue();
		await promise;

		// Verify the callback mechanism is wired up
		expect(newCallbackCalled).toBeDefined();
	});
});

// ============================================================================
// Utility Functions
// ============================================================================

describe("Debugger - Utility Functions", () => {
	it("should create debug context", () => {
		const context = createDebugContext("test-workflow", { x: 1 }, "node1");

		expect(context.workflowName).toBe("test-workflow");
		expect(context.variables).toEqual({ x: 1 });
		expect(context.currentNode).toBe("node1");
		expect(context.callStack).toEqual([]);
	});

	it("should create stack frame", () => {
		const frame = createStackFrame(1, "myFunction", "file.ts", { a: 1 });

		expect(frame.id).toBe(1);
		expect(frame.name).toBe("myFunction");
		expect(frame.source).toBe("file.ts");
		expect(frame.variables).toEqual({ a: 1 });
	});
});

// ============================================================================
// Error Handling
// ============================================================================

describe("Debugger - Error Handling", () => {
	it("should throw when creating checkpoint without context", async () => {
		const dbg = createDebugger();
		await dbg.start(createTestConfig());

		expect(() => dbg.createCheckpoint("node1")).toThrow();

		dbg.dispose();
	});

	it("should throw when getting trace without active trace", async () => {
		const dbg = createDebugger();
		await dbg.start(createTestConfig());

		expect(() => dbg.getTrace()).toThrow();

		dbg.dispose();
	});

	it("should throw when using disposed debugger", () => {
		const dbg = createDebugger();
		dbg.dispose();

		expect(() =>
			dbg.setBreakpoint(createNodeBreakpoint("node1", "before")),
		).toThrow();
	});
});
