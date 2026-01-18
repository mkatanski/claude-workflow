import { describe, it, expect, beforeEach, mock, spyOn } from "bun:test";
import {
	BreakpointManager,
	createNodeBreakpoint,
	createEventBreakpoint,
	createExceptionBreakpoint,
} from "./breakpoints";
import type { DebugContext } from "./types";

describe("BreakpointManager", () => {
	let manager: BreakpointManager;
	let mockContext: DebugContext;

	beforeEach(() => {
		manager = new BreakpointManager({ debug: false });
		mockContext = {
			workflowName: "test-workflow",
			currentNode: "node1",
			previousNode: undefined,
			nextNode: "node2",
			variables: {
				count: 5,
				name: "test",
				active: true,
			},
			callStack: [],
		};
	});

	describe("Breakpoint Management", () => {
		it("should add a breakpoint", () => {
			const bp = createNodeBreakpoint("node1", "before");
			manager.add(bp);

			expect(manager.get(bp.id)).toEqual(bp);
			expect(manager.getAll()).toHaveLength(1);
		});

		it("should remove a breakpoint", () => {
			const bp = createNodeBreakpoint("node1", "before");
			manager.add(bp);

			const removed = manager.remove(bp.id);
			expect(removed).toBe(true);
			expect(manager.get(bp.id)).toBeUndefined();
			expect(manager.getAll()).toHaveLength(0);
		});

		it("should clear all breakpoints", () => {
			manager.add(createNodeBreakpoint("node1", "before"));
			manager.add(createNodeBreakpoint("node2", "after"));
			manager.add(createEventBreakpoint("tool:bash"));

			expect(manager.getAll()).toHaveLength(3);

			manager.clear();
			expect(manager.getAll()).toHaveLength(0);
		});

		it("should get breakpoints by type", () => {
			manager.add(createNodeBreakpoint("node1", "before"));
			manager.add(createNodeBreakpoint("node2", "after"));
			manager.add(createEventBreakpoint("tool:bash"));
			manager.add(createExceptionBreakpoint("all"));

			const nodeBreakpoints = manager.getByType("node");
			expect(nodeBreakpoints).toHaveLength(2);

			const eventBreakpoints = manager.getByType("event");
			expect(eventBreakpoints).toHaveLength(1);

			const exceptionBreakpoints = manager.getByType("exception");
			expect(exceptionBreakpoints).toHaveLength(1);
		});

		it("should enable/disable breakpoints", () => {
			const bp = createNodeBreakpoint("node1", "before");
			manager.add(bp);

			expect(bp.enabled).toBe(true);

			manager.disable(bp.id);
			expect(manager.get(bp.id)?.enabled).toBe(false);

			manager.enable(bp.id);
			expect(manager.get(bp.id)?.enabled).toBe(true);
		});

		it("should toggle breakpoints", () => {
			const bp = createNodeBreakpoint("node1", "before");
			manager.add(bp);

			expect(bp.enabled).toBe(true);

			const newState1 = manager.toggle(bp.id);
			expect(newState1).toBe(false);
			expect(manager.get(bp.id)?.enabled).toBe(false);

			const newState2 = manager.toggle(bp.id);
			expect(newState2).toBe(true);
			expect(manager.get(bp.id)?.enabled).toBe(true);
		});
	});

	describe("Node Breakpoints", () => {
		it("should trigger on matching node name (before)", () => {
			const bp = createNodeBreakpoint("node1", "before");
			manager.add(bp);

			const hit = manager.checkNodeBreakpoint("node1", "before", mockContext);
			expect(hit).not.toBeNull();
			expect(hit?.breakpoint.id).toBe(bp.id);
			expect(hit?.reason).toContain("Node before: node1");
		});

		it("should trigger on matching node name (after)", () => {
			const bp = createNodeBreakpoint("node1", "after");
			manager.add(bp);

			const hit = manager.checkNodeBreakpoint("node1", "after", mockContext);
			expect(hit).not.toBeNull();
			expect(hit?.breakpoint.id).toBe(bp.id);
			expect(hit?.reason).toContain("Node after: node1");
		});

		it("should not trigger on wrong timing", () => {
			const bp = createNodeBreakpoint("node1", "before");
			manager.add(bp);

			const hit = manager.checkNodeBreakpoint("node1", "after", mockContext);
			expect(hit).toBeNull();
		});

		it("should not trigger on non-matching node name", () => {
			const bp = createNodeBreakpoint("node1", "before");
			manager.add(bp);

			const hit = manager.checkNodeBreakpoint("node2", "before", mockContext);
			expect(hit).toBeNull();
		});

		it("should support wildcard node names", () => {
			const bp = createNodeBreakpoint("node*", "before");
			manager.add(bp);

			const hit1 = manager.checkNodeBreakpoint("node1", "before", mockContext);
			expect(hit1).not.toBeNull();

			const hit2 = manager.checkNodeBreakpoint("node2", "before", mockContext);
			expect(hit2).not.toBeNull();

			const hit3 = manager.checkNodeBreakpoint("other", "before", mockContext);
			expect(hit3).toBeNull();
		});

		it("should not trigger when disabled", () => {
			const bp = createNodeBreakpoint("node1", "before");
			manager.add(bp);
			manager.disable(bp.id);

			const hit = manager.checkNodeBreakpoint("node1", "before", mockContext);
			expect(hit).toBeNull();
		});

		it("should trigger on specific hit count", () => {
			const bp = createNodeBreakpoint("node1", "before", { hitCount: 3 });
			manager.add(bp);

			// First hit - should not trigger
			let hit = manager.checkNodeBreakpoint("node1", "before", mockContext);
			expect(hit).toBeNull();

			// Second hit - should not trigger
			hit = manager.checkNodeBreakpoint("node1", "before", mockContext);
			expect(hit).toBeNull();

			// Third hit - should trigger
			hit = manager.checkNodeBreakpoint("node1", "before", mockContext);
			expect(hit).not.toBeNull();
			expect(hit?.hitCount).toBe(3);

			// Fourth hit - should not trigger
			hit = manager.checkNodeBreakpoint("node1", "before", mockContext);
			expect(hit).toBeNull();
		});

		it("should support conditional breakpoints", () => {
			const bp = createNodeBreakpoint("node1", "before", {
				condition: "variables.count > 3",
			});
			manager.add(bp);

			// Condition is true (count = 5)
			let hit = manager.checkNodeBreakpoint("node1", "before", mockContext);
			expect(hit).not.toBeNull();

			// Change context to make condition false
			mockContext.variables.count = 2;
			hit = manager.checkNodeBreakpoint("node1", "before", mockContext);
			expect(hit).toBeNull();

			// Change context to make condition true again
			mockContext.variables.count = 10;
			hit = manager.checkNodeBreakpoint("node1", "before", mockContext);
			expect(hit).not.toBeNull();
		});

		it("should handle complex conditional expressions", () => {
			const bp = createNodeBreakpoint("node1", "before", {
				condition: 'variables.count > 3 && variables.name === "test"',
			});
			manager.add(bp);

			// Both conditions true
			let hit = manager.checkNodeBreakpoint("node1", "before", mockContext);
			expect(hit).not.toBeNull();

			// First condition false
			mockContext.variables.count = 2;
			hit = manager.checkNodeBreakpoint("node1", "before", mockContext);
			expect(hit).toBeNull();

			// First condition true, second false
			mockContext.variables.count = 5;
			mockContext.variables.name = "other";
			hit = manager.checkNodeBreakpoint("node1", "before", mockContext);
			expect(hit).toBeNull();
		});

		it("should not break on invalid conditions", () => {
			const bp = createNodeBreakpoint("node1", "before", {
				condition: "invalid syntax here )",
			});
			manager.add(bp);

			const hit = manager.checkNodeBreakpoint("node1", "before", mockContext);
			expect(hit).toBeNull();
		});
	});

	describe("Event Breakpoints", () => {
		it("should trigger on matching event type", () => {
			const bp = createEventBreakpoint("tool:bash");
			manager.add(bp);

			const hit = manager.checkEventBreakpoint("tool:bash", mockContext);
			expect(hit).not.toBeNull();
			expect(hit?.breakpoint.id).toBe(bp.id);
			expect(hit?.reason).toContain("Event: tool:bash");
		});

		it("should not trigger on non-matching event type", () => {
			const bp = createEventBreakpoint("tool:bash");
			manager.add(bp);

			const hit = manager.checkEventBreakpoint("tool:other", mockContext);
			expect(hit).toBeNull();
		});

		it("should support wildcard event patterns", () => {
			const bp = createEventBreakpoint("tool:*");
			manager.add(bp);

			const hit1 = manager.checkEventBreakpoint("tool:bash", mockContext);
			expect(hit1).not.toBeNull();

			const hit2 = manager.checkEventBreakpoint("tool:python", mockContext);
			expect(hit2).not.toBeNull();

			const hit3 = manager.checkEventBreakpoint("node:start", mockContext);
			expect(hit3).toBeNull();
		});

		it("should support catch-all wildcard", () => {
			const bp = createEventBreakpoint("*");
			manager.add(bp);

			const hit1 = manager.checkEventBreakpoint("tool:bash", mockContext);
			expect(hit1).not.toBeNull();

			const hit2 = manager.checkEventBreakpoint("node:start", mockContext);
			expect(hit2).not.toBeNull();
		});

		it("should not trigger when disabled", () => {
			const bp = createEventBreakpoint("tool:bash");
			manager.add(bp);
			manager.disable(bp.id);

			const hit = manager.checkEventBreakpoint("tool:bash", mockContext);
			expect(hit).toBeNull();
		});

		it("should support conditional event breakpoints", () => {
			const bp = createEventBreakpoint("tool:bash", {
				condition: "variables.active === true",
			});
			manager.add(bp);

			// Condition is true
			let hit = manager.checkEventBreakpoint("tool:bash", mockContext);
			expect(hit).not.toBeNull();

			// Condition is false
			mockContext.variables.active = false;
			hit = manager.checkEventBreakpoint("tool:bash", mockContext);
			expect(hit).toBeNull();
		});
	});

	describe("Exception Breakpoints", () => {
		it('should trigger on all exceptions when mode is "all"', () => {
			const bp = createExceptionBreakpoint("all");
			manager.add(bp);

			const error = new Error("Test error");

			// Should trigger on caught exceptions
			let hit = manager.checkExceptionBreakpoint(error, false, mockContext);
			expect(hit).not.toBeNull();
			expect(hit?.reason).toContain("Exception: Test error");

			// Should trigger on uncaught exceptions
			hit = manager.checkExceptionBreakpoint(error, true, mockContext);
			expect(hit).not.toBeNull();
		});

		it('should only trigger on uncaught when mode is "uncaught"', () => {
			const bp = createExceptionBreakpoint("uncaught");
			manager.add(bp);

			const error = new Error("Test error");

			// Should not trigger on caught exceptions
			let hit = manager.checkExceptionBreakpoint(error, false, mockContext);
			expect(hit).toBeNull();

			// Should trigger on uncaught exceptions
			hit = manager.checkExceptionBreakpoint(error, true, mockContext);
			expect(hit).not.toBeNull();
		});

		it("should not trigger when disabled", () => {
			const bp = createExceptionBreakpoint("all");
			manager.add(bp);
			manager.disable(bp.id);

			const error = new Error("Test error");
			const hit = manager.checkExceptionBreakpoint(error, false, mockContext);
			expect(hit).toBeNull();
		});

		it("should support conditional exception breakpoints", () => {
			const bp = createExceptionBreakpoint("all", {
				condition: "variables.count > 3",
			});
			manager.add(bp);

			const error = new Error("Test error");

			// Condition is true
			let hit = manager.checkExceptionBreakpoint(error, false, mockContext);
			expect(hit).not.toBeNull();

			// Condition is false
			mockContext.variables.count = 2;
			hit = manager.checkExceptionBreakpoint(error, false, mockContext);
			expect(hit).toBeNull();
		});
	});

	describe("Hit Count Tracking", () => {
		it("should track hit counts", () => {
			const bp = createNodeBreakpoint("node1", "before");
			manager.add(bp);

			// First hit
			let hit = manager.checkNodeBreakpoint("node1", "before", mockContext);
			expect(hit?.hitCount).toBe(1);

			// Second hit
			hit = manager.checkNodeBreakpoint("node1", "before", mockContext);
			expect(hit?.hitCount).toBe(2);

			// Third hit
			hit = manager.checkNodeBreakpoint("node1", "before", mockContext);
			expect(hit?.hitCount).toBe(3);
		});

		it("should reset hit counts", () => {
			const bp = createNodeBreakpoint("node1", "before");
			manager.add(bp);

			// Hit it a few times
			manager.checkNodeBreakpoint("node1", "before", mockContext);
			manager.checkNodeBreakpoint("node1", "before", mockContext);
			let hit = manager.checkNodeBreakpoint("node1", "before", mockContext);
			expect(hit?.hitCount).toBe(3);

			// Reset
			manager.resetHitCounts();

			// Should start from 1 again
			hit = manager.checkNodeBreakpoint("node1", "before", mockContext);
			expect(hit?.hitCount).toBe(1);
		});
	});

	describe("Breakpoint Hit Callback", () => {
		it("should return breakpoint hit when breakpoint matches", () => {
			// Note: BreakpointManager returns the hit; the caller (Debugger) handles callback invocation
			const callback = mock(() => {});
			manager = new BreakpointManager({ onBreakpointHit: callback });

			const bp = createNodeBreakpoint("node1", "before");
			manager.add(bp);

			const hit = manager.checkNodeBreakpoint("node1", "before", mockContext);

			// Should return a hit object
			expect(hit).not.toBeNull();
			expect(hit?.breakpoint).toBe(bp);
			expect(hit?.context).toBe(mockContext);
			expect(hit?.hitCount).toBe(1);
		});

		it("should handle logpoints without blocking", () => {
			const callback = mock(() => {});
			manager = new BreakpointManager({ onBreakpointHit: callback });

			const bp = createNodeBreakpoint("node1", "before", {
				logMessage: "At node {node} with count {count}",
			});
			manager.add(bp);

			const hit = manager.checkNodeBreakpoint("node1", "before", mockContext);

			// Logpoints still return a hit, but caller should handle them differently
			expect(hit).not.toBeNull();
			expect(hit?.breakpoint.logMessage).toBe(
				"At node {node} with count {count}",
			);
		});
	});

	describe("Logpoints", () => {
		it("should log message instead of breaking", () => {
			const consoleSpy = spyOn(console, "log").mockImplementation(() => {});

			const bp = createNodeBreakpoint("node1", "before", {
				logMessage: "At node {node} with count {count}",
			});
			manager.add(bp);

			manager.checkNodeBreakpoint("node1", "before", mockContext);

			expect(consoleSpy).toHaveBeenCalledWith(
				"[Logpoint] At node node1 with count 5",
			);

			consoleSpy.mockRestore();
		});

		it("should handle missing variables in log message", () => {
			const consoleSpy = spyOn(console, "log").mockImplementation(() => {});

			const bp = createNodeBreakpoint("node1", "before", {
				logMessage: "Value: {missing}",
			});
			manager.add(bp);

			manager.checkNodeBreakpoint("node1", "before", mockContext);

			expect(consoleSpy).toHaveBeenCalledWith("[Logpoint] Value: {missing}");

			consoleSpy.mockRestore();
		});
	});

	describe("Lifecycle", () => {
		it("should dispose properly", () => {
			manager.add(createNodeBreakpoint("node1", "before"));
			expect(manager.getAll()).toHaveLength(1);

			manager.dispose();

			expect(manager.isDisposed()).toBe(true);
			// After disposal, methods throw - verified in separate test
		});

		it("should throw error when used after disposal", () => {
			manager.dispose();

			expect(() =>
				manager.add(createNodeBreakpoint("node1", "before")),
			).toThrow("BreakpointManager has been disposed");
		});

		it("should not throw on double dispose", () => {
			manager.dispose();
			expect(() => manager.dispose()).not.toThrow();
		});
	});

	describe("Factory Functions", () => {
		it("should create node breakpoint with defaults", () => {
			const bp = createNodeBreakpoint("node1", "before");

			expect(bp.type).toBe("node");
			expect(bp.nodeName).toBe("node1");
			expect(bp.when).toBe("before");
			expect(bp.enabled).toBe(true);
			expect(bp.id).toBeDefined();
		});

		it("should create node breakpoint with options", () => {
			const bp = createNodeBreakpoint("node1", "after", {
				condition: "x > 5",
				hitCount: 3,
				logMessage: "test",
				enabled: false,
			});

			expect(bp.when).toBe("after");
			expect(bp.condition).toBe("x > 5");
			expect(bp.hitCount).toBe(3);
			expect(bp.logMessage).toBe("test");
			expect(bp.enabled).toBe(false);
		});

		it("should create event breakpoint with defaults", () => {
			const bp = createEventBreakpoint("tool:bash");

			expect(bp.type).toBe("event");
			expect(bp.eventType).toBe("tool:bash");
			expect(bp.enabled).toBe(true);
			expect(bp.id).toBeDefined();
		});

		it("should create exception breakpoint with defaults", () => {
			const bp = createExceptionBreakpoint();

			expect(bp.type).toBe("exception");
			expect(bp.mode).toBe("uncaught");
			expect(bp.enabled).toBe(true);
			expect(bp.id).toBeDefined();
		});

		it("should create exception breakpoint with all mode", () => {
			const bp = createExceptionBreakpoint("all");

			expect(bp.mode).toBe("all");
		});
	});
});
