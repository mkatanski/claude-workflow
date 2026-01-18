/**
 * Tests for Debug Renderer
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { DebugRenderer, type DebugCommand } from "./debug";
import { createEmitter } from "../emitter";
import type {
	DebugBreakpointHitEvent,
	DebugStepBeforeEvent,
	DebugStepAfterEvent,
	DebugVariableInspectEvent,
	DebugExecutionPauseEvent,
	DebugExecutionResumeEvent,
} from "../types";
import { Writable } from "stream";

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Mock output stream for capturing output
 */
class MockOutputStream extends Writable {
	private chunks: string[] = [];

	_write(
		chunk: Buffer | string,
		_encoding: string,
		callback: () => void,
	): void {
		this.chunks.push(chunk.toString());
		callback();
	}

	getOutput(): string {
		return this.chunks.join("");
	}

	getLines(): string[] {
		return this.getOutput()
			.split("\n")
			.filter((line) => line.length > 0);
	}

	clear(): void {
		this.chunks = [];
	}
}

/**
 * Create a test debug event
 */
function createDebugEvent<T extends string>(
	type: T,
	payload: Record<string, unknown>,
): any {
	return {
		id: `evt-${Date.now()}`,
		type,
		timestamp: new Date().toISOString(),
		workflowId: "test-workflow",
		payload,
	};
}

// ============================================================================
// Tests
// ============================================================================

describe("DebugRenderer", () => {
	let output: MockOutputStream;
	let renderer: DebugRenderer;

	beforeEach(() => {
		output = new MockOutputStream();
		renderer = new DebugRenderer({
			interactive: false, // Disable interactive mode for testing
			output: output as any,
			showVariables: true,
			showCallStack: true,
		});
	});

	afterEach(() => {
		renderer.dispose();
	});

	describe("Basic Configuration", () => {
		it("should create a debug renderer with default config", () => {
			const r = new DebugRenderer();
			expect(r.name).toBe("debug");
			expect(r.getConfig()).toBeDefined();
			r.dispose();
		});

		it("should create a debug renderer with custom config", () => {
			const r = new DebugRenderer({
				verbose: true,
				showVariables: false,
				showCallStack: false,
				interactive: false,
			});
			expect(r.getConfig().verbose).toBe(true);
			r.dispose();
		});

		it("should update config", () => {
			renderer.setConfig({ verbose: true });
			expect(renderer.getConfig().verbose).toBe(true);
		});
	});

	describe("Event Rendering", () => {
		it("should render breakpoint hit event", () => {
			const event: DebugBreakpointHitEvent = createDebugEvent(
				"debug:breakpoint:hit",
				{
					breakpointId: "bp-1",
					nodeName: "testNode",
					hitCount: 1,
					variables: { x: 42, y: "test" },
				},
			);

			renderer.render(event);
			const lines = output.getLines();

			expect(lines.some((l) => l.includes("BREAKPOINT HIT"))).toBe(true);
			expect(lines.some((l) => l.includes("bp-1"))).toBe(true);
			expect(lines.some((l) => l.includes("testNode"))).toBe(true);
			expect(lines.some((l) => l.includes("x:"))).toBe(true);
		});

		it("should render breakpoint hit with condition", () => {
			const event: DebugBreakpointHitEvent = createDebugEvent(
				"debug:breakpoint:hit",
				{
					breakpointId: "bp-2",
					nodeName: "testNode",
					condition: "x > 10",
					hitCount: 3,
					variables: { x: 15 },
				},
			);

			renderer.render(event);
			const output_text = output.getOutput();

			expect(output_text).toContain("Condition: x > 10");
			expect(output_text).toContain("Hit count: 3");
		});

		it("should render step before event", () => {
			const event: DebugStepBeforeEvent = createDebugEvent(
				"debug:step:before",
				{
					nodeName: "testNode",
					stepType: "step-over",
					variables: { a: 1, b: 2 },
				},
			);

			renderer.render(event);
			const output_text = output.getOutput();

			expect(output_text).toContain("Step step-over");
			expect(output_text).toContain("testNode");
		});

		it("should render step after event", () => {
			const event: DebugStepAfterEvent = createDebugEvent("debug:step:after", {
				nodeName: "testNode",
				stepType: "step-in",
				duration: 150,
				variableChanges: { result: 42 },
			});

			renderer.render(event);
			const output_text = output.getOutput();

			expect(output_text).toContain("Step step-in completed");
			expect(output_text).toContain("testNode");
			expect(output_text).toContain("result:");
		});

		it("should render variable inspect event", () => {
			const event: DebugVariableInspectEvent = createDebugEvent(
				"debug:variable:inspect",
				{
					nodeName: "testNode",
					variableName: "myVar",
					value: { nested: { key: "value" } },
					scope: "workflow",
					path: "state.myVar",
				},
			);

			renderer.render(event);
			const output_text = output.getOutput();

			expect(output_text).toContain("Variable: myVar");
			expect(output_text).toContain("Scope: workflow");
			expect(output_text).toContain("Path: state.myVar");
		});

		it("should render execution pause event", () => {
			const event: DebugExecutionPauseEvent = createDebugEvent(
				"debug:execution:pause",
				{
					nodeName: "testNode",
					reason: "breakpoint",
					variables: { x: 10 },
					callStack: ["main", "testNode", "innerNode"],
				},
			);

			renderer.render(event);
			const output_text = output.getOutput();

			expect(output_text).toContain("EXECUTION PAUSED");
			expect(output_text).toContain("breakpoint");
			expect(output_text).toContain("Call Stack");
			expect(output_text).toContain("main");
		});

		it("should render execution resume event", () => {
			const event: DebugExecutionResumeEvent = createDebugEvent(
				"debug:execution:resume",
				{
					nodeName: "testNode",
					resumeMode: "continue",
					duration: 5000,
				},
			);

			renderer.render(event);
			const output_text = output.getOutput();

			expect(output_text).toContain("Resumed");
			expect(output_text).toContain("continue");
			expect(output_text).toContain("testNode");
		});
	});

	describe("Variable Formatting", () => {
		it("should format null and undefined", () => {
			const event: DebugVariableInspectEvent = createDebugEvent(
				"debug:variable:inspect",
				{
					nodeName: "test",
					variableName: "nullVar",
					value: null,
					scope: "local",
				},
			);

			renderer.render(event);
			expect(output.getOutput()).toContain("null");
		});

		it("should format strings", () => {
			const event: DebugVariableInspectEvent = createDebugEvent(
				"debug:variable:inspect",
				{
					nodeName: "test",
					variableName: "strVar",
					value: "hello world",
					scope: "local",
				},
			);

			renderer.render(event);
			expect(output.getOutput()).toContain('"hello world"');
		});

		it("should format numbers and booleans", () => {
			const event: DebugVariableInspectEvent = createDebugEvent(
				"debug:variable:inspect",
				{
					nodeName: "test",
					variableName: "numVar",
					value: 42,
					scope: "local",
				},
			);

			renderer.render(event);
			expect(output.getOutput()).toContain("42");
		});

		it("should format arrays", () => {
			const event: DebugVariableInspectEvent = createDebugEvent(
				"debug:variable:inspect",
				{
					nodeName: "test",
					variableName: "arrVar",
					value: [1, 2, 3],
					scope: "local",
				},
			);

			renderer.render(event);
			const text = output.getOutput();
			expect(text).toContain("[");
			expect(text).toContain("]");
		});

		it("should format large arrays", () => {
			const event: DebugVariableInspectEvent = createDebugEvent(
				"debug:variable:inspect",
				{
					nodeName: "test",
					variableName: "largeArr",
					value: new Array(10).fill(0),
					scope: "local",
				},
			);

			renderer.render(event);
			expect(output.getOutput()).toContain("Array(10)");
		});

		it("should format objects", () => {
			const event: DebugVariableInspectEvent = createDebugEvent(
				"debug:variable:inspect",
				{
					nodeName: "test",
					variableName: "objVar",
					value: { a: 1, b: 2 },
					scope: "local",
				},
			);

			renderer.render(event);
			const text = output.getOutput();
			expect(text).toContain("a:");
			expect(text).toContain("b:");
		});

		it("should format large objects", () => {
			const event: DebugVariableInspectEvent = createDebugEvent(
				"debug:variable:inspect",
				{
					nodeName: "test",
					variableName: "largeObj",
					value: { a: 1, b: 2, c: 3, d: 4, e: 5 },
					scope: "local",
				},
			);

			renderer.render(event);
			expect(output.getOutput()).toContain("Object with 5 properties");
		});

		it("should format functions", () => {
			const event: DebugVariableInspectEvent = createDebugEvent(
				"debug:variable:inspect",
				{
					nodeName: "test",
					variableName: "funcVar",
					value: () => {},
					scope: "local",
				},
			);

			renderer.render(event);
			expect(output.getOutput()).toContain("[Function]");
		});
	});

	describe("Configuration Options", () => {
		it("should hide variables when showVariables is false", () => {
			const r = new DebugRenderer({
				interactive: false,
				output: output as any,
				showVariables: false,
			});

			const event: DebugBreakpointHitEvent = createDebugEvent(
				"debug:breakpoint:hit",
				{
					breakpointId: "bp-1",
					nodeName: "testNode",
					hitCount: 1,
					variables: { x: 42, y: "test" },
				},
			);

			output.clear();
			r.render(event);
			const text = output.getOutput();

			// Should not show variable details
			expect(text).not.toContain("x:");
			expect(text).not.toContain("42");

			r.dispose();
		});

		it("should hide call stack when showCallStack is false", () => {
			const r = new DebugRenderer({
				interactive: false,
				output: output as any,
				showCallStack: false,
			});

			const event: DebugExecutionPauseEvent = createDebugEvent(
				"debug:execution:pause",
				{
					nodeName: "testNode",
					reason: "step",
					variables: {},
					callStack: ["main", "testNode"],
				},
			);

			output.clear();
			r.render(event);

			expect(output.getOutput()).not.toContain("Call Stack");

			r.dispose();
		});
	});

	describe("Command Handling", () => {
		it("should set command handler", () => {
			let capturedCommand: DebugCommand | undefined;

			renderer.setCommandHandler((cmd) => {
				capturedCommand = cmd;
			});

			// Simulate command (in non-interactive mode, this would be called manually)
			const handler = (
				renderer as unknown as { commandHandler: (cmd: string) => void }
			).commandHandler;
			handler("continue");

			expect(capturedCommand).toBe("continue");
		});

		it("should track paused state", () => {
			expect(renderer.isPausedState()).toBe(false);

			const event: DebugExecutionPauseEvent = createDebugEvent(
				"debug:execution:pause",
				{
					nodeName: "testNode",
					reason: "breakpoint",
					variables: {},
				},
			);

			renderer.render(event);
			expect(renderer.isPausedState()).toBe(true);

			const resumeEvent: DebugExecutionResumeEvent = createDebugEvent(
				"debug:execution:resume",
				{
					nodeName: "testNode",
					resumeMode: "continue",
					duration: 100,
				},
			);

			renderer.render(resumeEvent);
			expect(renderer.isPausedState()).toBe(false);
		});
	});

	describe("Emitter Integration", () => {
		it("should connect to emitter and receive debug events", () => {
			const emitter = createEmitter({ asyncByDefault: false });
			const subscription = renderer.connect(emitter);

			emitter.emit("debug:breakpoint:hit", {
				breakpointId: "bp-1",
				nodeName: "testNode",
				hitCount: 1,
				variables: { x: 10 },
			});

			expect(output.getOutput()).toContain("BREAKPOINT HIT");

			subscription.unsubscribe();
		});

		it("should filter non-debug events", () => {
			const emitter = createEmitter({ asyncByDefault: false });
			renderer.connect(emitter);

			emitter.emit("workflow:start", {
				workflowName: "test-workflow",
				initialVariables: {},
			});

			// Should not render non-debug events
			expect(output.getOutput()).toBe("");
		});
	});

	describe("Disposal", () => {
		it("should dispose properly", () => {
			const r = new DebugRenderer({ interactive: false });
			expect(r.isDisposed()).toBe(false);

			r.dispose();
			expect(r.isDisposed()).toBe(true);
		});

		it("should clean up readline on dispose", () => {
			const r = new DebugRenderer({ interactive: false });

			r.dispose();

			expect(r.getReadlineInterface()).toBeUndefined();
		});
	});

	describe("Edge Cases", () => {
		it("should handle empty variables", () => {
			const event: DebugBreakpointHitEvent = createDebugEvent(
				"debug:breakpoint:hit",
				{
					breakpointId: "bp-1",
					nodeName: "testNode",
					hitCount: 1,
					variables: {},
				},
			);

			renderer.render(event);
			const text = output.getOutput();

			expect(text).toContain("BREAKPOINT HIT");
			// Should still render even with no variables
		});

		it("should handle pause without call stack", () => {
			const event: DebugExecutionPauseEvent = createDebugEvent(
				"debug:execution:pause",
				{
					nodeName: "testNode",
					reason: "step",
					variables: { x: 1 },
				},
			);

			renderer.render(event);
			expect(output.getOutput()).toContain("EXECUTION PAUSED");
		});

		it("should handle unknown event types", () => {
			const event = createDebugEvent("unknown:event", {});

			// Should not throw
			renderer.render(event as any);
		});

		it("should format empty objects and arrays", () => {
			const event: DebugVariableInspectEvent = createDebugEvent(
				"debug:variable:inspect",
				{
					nodeName: "test",
					variableName: "empty",
					value: {},
					scope: "local",
				},
			);

			renderer.render(event);
			expect(output.getOutput()).toContain("{}");

			output.clear();

			const event2: DebugVariableInspectEvent = createDebugEvent(
				"debug:variable:inspect",
				{
					nodeName: "test",
					variableName: "emptyArr",
					value: [],
					scope: "local",
				},
			);

			renderer.render(event2);
			expect(output.getOutput()).toContain("[]");
		});
	});
});
