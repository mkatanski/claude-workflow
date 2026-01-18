/**
 * Tests for circular call detection module.
 */

import { describe, expect, it } from "bun:test";
import {
	checkCircular,
	createCallStack,
	createCallStackEntry,
	createCircularCallError,
	createMaxDepthError,
	DEFAULT_MAX_DEPTH,
	formatCallStack,
	getCallDepth,
	getCallPath,
	getParentEntry,
	getRootEntry,
	isAtMaxDepth,
	popCall,
	pushCall,
} from "./circular.js";
import type { CallStackEntry } from "./types.js";

// ============================================================================
// Test Helpers
// ============================================================================

function makeEntry(
	name: string,
	version = "1.0.0",
	nodeName = "test-node",
): CallStackEntry {
	return createCallStackEntry(name, version, nodeName, 1000);
}

// ============================================================================
// createCallStack Tests
// ============================================================================

describe("createCallStack", () => {
	it("creates an empty call stack with default max depth", () => {
		const stack = createCallStack();

		expect(stack.entries).toEqual([]);
		expect(stack.maxDepth).toBe(DEFAULT_MAX_DEPTH);
	});

	it("creates a call stack with custom max depth", () => {
		const stack = createCallStack({ maxDepth: 5 });

		expect(stack.entries).toEqual([]);
		expect(stack.maxDepth).toBe(5);
	});

	it("creates a call stack with initial entries", () => {
		const entries = [makeEntry("workflow-a"), makeEntry("workflow-b")];
		const stack = createCallStack({ initialEntries: entries });

		expect(stack.entries).toHaveLength(2);
		expect(stack.entries[0].name).toBe("workflow-a");
		expect(stack.entries[1].name).toBe("workflow-b");
	});

	it("creates a copy of initial entries (not reference)", () => {
		const entries = [makeEntry("workflow-a")];
		const stack = createCallStack({ initialEntries: entries });

		// Mutating original entries should not affect stack
		entries.push(makeEntry("workflow-b"));

		expect(stack.entries).toHaveLength(1);
	});
});

// ============================================================================
// createCallStackEntry Tests
// ============================================================================

describe("createCallStackEntry", () => {
	it("creates an entry with all required fields", () => {
		const entry = createCallStackEntry(
			"my-workflow",
			"1.0.0",
			"process-node",
			12345,
		);

		expect(entry.name).toBe("my-workflow");
		expect(entry.version).toBe("1.0.0");
		expect(entry.nodeName).toBe("process-node");
		expect(entry.startedAt).toBe(12345);
	});

	it("uses Date.now() as default startedAt", () => {
		const before = Date.now();
		const entry = createCallStackEntry("my-workflow", "1.0.0", "process-node");
		const after = Date.now();

		expect(entry.startedAt).toBeGreaterThanOrEqual(before);
		expect(entry.startedAt).toBeLessThanOrEqual(after);
	});
});

// ============================================================================
// pushCall Tests
// ============================================================================

describe("pushCall", () => {
	it("adds an entry to an empty stack", () => {
		const stack = createCallStack();
		const entry = makeEntry("workflow-a");

		const newStack = pushCall(stack, entry);

		expect(newStack.entries).toHaveLength(1);
		expect(newStack.entries[0].name).toBe("workflow-a");
	});

	it("adds an entry to a non-empty stack", () => {
		const stack = createCallStack({
			initialEntries: [makeEntry("workflow-a")],
		});
		const entry = makeEntry("workflow-b");

		const newStack = pushCall(stack, entry);

		expect(newStack.entries).toHaveLength(2);
		expect(newStack.entries[0].name).toBe("workflow-a");
		expect(newStack.entries[1].name).toBe("workflow-b");
	});

	it("does not mutate the original stack (immutable)", () => {
		const stack = createCallStack();
		const entry = makeEntry("workflow-a");

		const newStack = pushCall(stack, entry);

		expect(stack.entries).toHaveLength(0);
		expect(newStack.entries).toHaveLength(1);
	});

	it("preserves maxDepth", () => {
		const stack = createCallStack({ maxDepth: 5 });
		const entry = makeEntry("workflow-a");

		const newStack = pushCall(stack, entry);

		expect(newStack.maxDepth).toBe(5);
	});
});

// ============================================================================
// popCall Tests
// ============================================================================

describe("popCall", () => {
	it("removes the last entry from the stack", () => {
		const stack = createCallStack({
			initialEntries: [makeEntry("workflow-a"), makeEntry("workflow-b")],
		});

		const newStack = popCall(stack);

		expect(newStack.entries).toHaveLength(1);
		expect(newStack.entries[0].name).toBe("workflow-a");
	});

	it("returns an empty stack when popping from single-entry stack", () => {
		const stack = createCallStack({
			initialEntries: [makeEntry("workflow-a")],
		});

		const newStack = popCall(stack);

		expect(newStack.entries).toHaveLength(0);
	});

	it("returns an empty stack when popping from empty stack", () => {
		const stack = createCallStack();

		const newStack = popCall(stack);

		expect(newStack.entries).toHaveLength(0);
	});

	it("does not mutate the original stack (immutable)", () => {
		const stack = createCallStack({
			initialEntries: [makeEntry("workflow-a"), makeEntry("workflow-b")],
		});

		const newStack = popCall(stack);

		expect(stack.entries).toHaveLength(2);
		expect(newStack.entries).toHaveLength(1);
	});

	it("preserves maxDepth", () => {
		const stack = createCallStack({
			maxDepth: 5,
			initialEntries: [makeEntry("workflow-a")],
		});

		const newStack = popCall(stack);

		expect(newStack.maxDepth).toBe(5);
	});
});

// ============================================================================
// checkCircular Tests
// ============================================================================

describe("checkCircular", () => {
	describe("direct circular calls (A calls A)", () => {
		it("detects direct circular call", () => {
			const stack = createCallStack({
				initialEntries: [makeEntry("workflow-a", "1.0.0")],
			});

			const result = checkCircular(stack, "workflow-a", "1.0.0");

			expect(result.isCircular).toBe(true);
			expect(result.path).toEqual(["workflow-a@1.0.0", "workflow-a@1.0.0"]);
		});

		it("detects circular call regardless of version", () => {
			const stack = createCallStack({
				initialEntries: [makeEntry("workflow-a", "1.0.0")],
			});

			const result = checkCircular(stack, "workflow-a", "2.0.0");

			expect(result.isCircular).toBe(true);
			expect(result.path).toEqual(["workflow-a@1.0.0", "workflow-a@2.0.0"]);
		});
	});

	describe("indirect circular calls (A calls B calls A)", () => {
		it("detects indirect circular call", () => {
			const stack = createCallStack({
				initialEntries: [
					makeEntry("workflow-a", "1.0.0"),
					makeEntry("workflow-b", "1.0.0"),
				],
			});

			const result = checkCircular(stack, "workflow-a", "1.0.0");

			expect(result.isCircular).toBe(true);
			expect(result.path).toEqual([
				"workflow-a@1.0.0",
				"workflow-b@1.0.0",
				"workflow-a@1.0.0",
			]);
		});

		it("detects deeply nested circular call (A -> B -> C -> A)", () => {
			const stack = createCallStack({
				initialEntries: [
					makeEntry("workflow-a", "1.0.0"),
					makeEntry("workflow-b", "1.0.0"),
					makeEntry("workflow-c", "1.0.0"),
				],
			});

			const result = checkCircular(stack, "workflow-a", "1.0.0");

			expect(result.isCircular).toBe(true);
			expect(result.path).toEqual([
				"workflow-a@1.0.0",
				"workflow-b@1.0.0",
				"workflow-c@1.0.0",
				"workflow-a@1.0.0",
			]);
		});

		it("detects circular call to middle of chain (A -> B -> C -> B)", () => {
			const stack = createCallStack({
				initialEntries: [
					makeEntry("workflow-a", "1.0.0"),
					makeEntry("workflow-b", "1.0.0"),
					makeEntry("workflow-c", "1.0.0"),
				],
			});

			const result = checkCircular(stack, "workflow-b", "1.0.0");

			expect(result.isCircular).toBe(true);
			expect(result.path).toEqual([
				"workflow-b@1.0.0",
				"workflow-c@1.0.0",
				"workflow-b@1.0.0",
			]);
		});
	});

	describe("non-circular calls", () => {
		it("allows calling a new workflow", () => {
			const stack = createCallStack({
				initialEntries: [makeEntry("workflow-a")],
			});

			const result = checkCircular(stack, "workflow-b", "1.0.0");

			expect(result.isCircular).toBe(false);
			expect(result.path).toBeUndefined();
		});

		it("allows first call on empty stack", () => {
			const stack = createCallStack();

			const result = checkCircular(stack, "workflow-a", "1.0.0");

			expect(result.isCircular).toBe(false);
		});

		it("allows calling different workflows in sequence", () => {
			const stack = createCallStack({
				initialEntries: [
					makeEntry("workflow-a"),
					makeEntry("workflow-b"),
					makeEntry("workflow-c"),
				],
			});

			const result = checkCircular(stack, "workflow-d", "1.0.0");

			expect(result.isCircular).toBe(false);
		});
	});

	describe("depth tracking", () => {
		it("reports correct depth for new call", () => {
			const stack = createCallStack({
				initialEntries: [makeEntry("workflow-a"), makeEntry("workflow-b")],
			});

			const result = checkCircular(stack, "workflow-c", "1.0.0");

			expect(result.depth).toBe(3);
		});

		it("detects when call would exceed max depth", () => {
			const stack = createCallStack({
				maxDepth: 2,
				initialEntries: [makeEntry("workflow-a"), makeEntry("workflow-b")],
			});

			const result = checkCircular(stack, "workflow-c", "1.0.0");

			expect(result.exceedsMaxDepth).toBe(true);
			expect(result.depth).toBe(3);
		});

		it("reports exceedsMaxDepth false when within limits", () => {
			const stack = createCallStack({
				maxDepth: 5,
				initialEntries: [makeEntry("workflow-a")],
			});

			const result = checkCircular(stack, "workflow-b", "1.0.0");

			expect(result.exceedsMaxDepth).toBe(false);
		});
	});

	describe("version handling", () => {
		it("handles missing version in check", () => {
			const stack = createCallStack({
				initialEntries: [makeEntry("workflow-a", "1.0.0")],
			});

			// Call without version
			const result = checkCircular(stack, "workflow-a");

			expect(result.isCircular).toBe(true);
			expect(result.path).toEqual(["workflow-a@1.0.0", "workflow-a"]);
		});
	});
});

// ============================================================================
// isAtMaxDepth Tests
// ============================================================================

describe("isAtMaxDepth", () => {
	it("returns false when below max depth", () => {
		const stack = createCallStack({ maxDepth: 3 });

		expect(isAtMaxDepth(stack)).toBe(false);
	});

	it("returns false when one below max depth", () => {
		const stack = createCallStack({
			maxDepth: 3,
			initialEntries: [makeEntry("a"), makeEntry("b")],
		});

		expect(isAtMaxDepth(stack)).toBe(false);
	});

	it("returns true when at max depth", () => {
		const stack = createCallStack({
			maxDepth: 3,
			initialEntries: [makeEntry("a"), makeEntry("b"), makeEntry("c")],
		});

		expect(isAtMaxDepth(stack)).toBe(true);
	});

	it("returns true when above max depth", () => {
		const stack = createCallStack({
			maxDepth: 2,
			initialEntries: [makeEntry("a"), makeEntry("b"), makeEntry("c")],
		});

		expect(isAtMaxDepth(stack)).toBe(true);
	});
});

// ============================================================================
// getCallDepth Tests
// ============================================================================

describe("getCallDepth", () => {
	it("returns 0 for empty stack", () => {
		const stack = createCallStack();

		expect(getCallDepth(stack)).toBe(0);
	});

	it("returns correct depth for non-empty stack", () => {
		const stack = createCallStack({
			initialEntries: [makeEntry("a"), makeEntry("b"), makeEntry("c")],
		});

		expect(getCallDepth(stack)).toBe(3);
	});
});

// ============================================================================
// getParentEntry Tests
// ============================================================================

describe("getParentEntry", () => {
	it("returns undefined for empty stack", () => {
		const stack = createCallStack();

		expect(getParentEntry(stack)).toBeUndefined();
	});

	it("returns the last entry (parent of current)", () => {
		const stack = createCallStack({
			initialEntries: [
				makeEntry("root", "1.0.0"),
				makeEntry("parent", "2.0.0"),
				makeEntry("current", "3.0.0"),
			],
		});

		const parent = getParentEntry(stack);

		expect(parent?.name).toBe("current");
		expect(parent?.version).toBe("3.0.0");
	});

	it("returns the only entry for single-entry stack", () => {
		const stack = createCallStack({
			initialEntries: [makeEntry("only", "1.0.0")],
		});

		const parent = getParentEntry(stack);

		expect(parent?.name).toBe("only");
	});
});

// ============================================================================
// getRootEntry Tests
// ============================================================================

describe("getRootEntry", () => {
	it("returns undefined for empty stack", () => {
		const stack = createCallStack();

		expect(getRootEntry(stack)).toBeUndefined();
	});

	it("returns the first entry (root)", () => {
		const stack = createCallStack({
			initialEntries: [
				makeEntry("root", "1.0.0"),
				makeEntry("middle", "2.0.0"),
				makeEntry("current", "3.0.0"),
			],
		});

		const root = getRootEntry(stack);

		expect(root?.name).toBe("root");
		expect(root?.version).toBe("1.0.0");
	});

	it("returns the only entry for single-entry stack", () => {
		const stack = createCallStack({
			initialEntries: [makeEntry("only", "1.0.0")],
		});

		const root = getRootEntry(stack);

		expect(root?.name).toBe("only");
	});
});

// ============================================================================
// getCallPath Tests
// ============================================================================

describe("getCallPath", () => {
	it("returns empty array for empty stack", () => {
		const stack = createCallStack();

		const path = getCallPath(stack);

		expect(path).toEqual([]);
	});

	it("returns copy of entries", () => {
		const entries = [makeEntry("a"), makeEntry("b")];
		const stack = createCallStack({ initialEntries: entries });

		const path = getCallPath(stack);

		expect(path).toHaveLength(2);
		expect(path[0].name).toBe("a");
		expect(path[1].name).toBe("b");
	});

	it("returns a copy (not reference) to prevent mutation", () => {
		const stack = createCallStack({
			initialEntries: [makeEntry("a")],
		});

		const path = getCallPath(stack);
		path.push(makeEntry("b"));

		// Original stack should not be affected
		expect(stack.entries).toHaveLength(1);
	});
});

// ============================================================================
// formatCallStack Tests
// ============================================================================

describe("formatCallStack", () => {
	it("returns '(empty)' for empty stack", () => {
		const stack = createCallStack();

		expect(formatCallStack(stack)).toBe("(empty)");
	});

	it("formats single entry", () => {
		const stack = createCallStack({
			initialEntries: [makeEntry("workflow-a", "1.0.0")],
		});

		expect(formatCallStack(stack)).toBe("workflow-a@1.0.0");
	});

	it("formats multiple entries with default separator", () => {
		const stack = createCallStack({
			initialEntries: [
				makeEntry("workflow-a", "1.0.0"),
				makeEntry("workflow-b", "2.0.0"),
				makeEntry("workflow-c", "3.0.0"),
			],
		});

		expect(formatCallStack(stack)).toBe(
			"workflow-a@1.0.0 -> workflow-b@2.0.0 -> workflow-c@3.0.0",
		);
	});

	it("formats with custom separator", () => {
		const stack = createCallStack({
			initialEntries: [
				makeEntry("workflow-a", "1.0.0"),
				makeEntry("workflow-b", "2.0.0"),
			],
		});

		expect(formatCallStack(stack, " | ")).toBe(
			"workflow-a@1.0.0 | workflow-b@2.0.0",
		);
	});
});

// ============================================================================
// createCircularCallError Tests
// ============================================================================

describe("createCircularCallError", () => {
	it("creates error with correct code", () => {
		const stack = createCallStack({
			initialEntries: [makeEntry("workflow-a", "1.0.0")],
		});

		const error = createCircularCallError(stack, "workflow-a", "1.0.0");

		expect(error.code).toBe("CIRCULAR_CALL");
	});

	it("includes workflow name in message", () => {
		const stack = createCallStack({
			initialEntries: [makeEntry("workflow-a", "1.0.0")],
		});

		const error = createCircularCallError(stack, "workflow-a", "1.0.0");

		expect(error.message).toContain("workflow-a");
	});

	it("includes circular path in message", () => {
		const stack = createCallStack({
			initialEntries: [
				makeEntry("workflow-a", "1.0.0"),
				makeEntry("workflow-b", "1.0.0"),
			],
		});

		const error = createCircularCallError(stack, "workflow-a", "2.0.0");

		expect(error.message).toContain("workflow-a@1.0.0");
		expect(error.message).toContain("workflow-b@1.0.0");
		expect(error.message).toContain("workflow-a@2.0.0");
	});
});

// ============================================================================
// createMaxDepthError Tests
// ============================================================================

describe("createMaxDepthError", () => {
	it("creates error with CIRCULAR_CALL code", () => {
		const stack = createCallStack({ maxDepth: 3 });

		const error = createMaxDepthError(stack, "workflow-x");

		expect(error.code).toBe("CIRCULAR_CALL");
	});

	it("includes max depth in message", () => {
		const stack = createCallStack({ maxDepth: 5 });

		const error = createMaxDepthError(stack, "workflow-x");

		expect(error.message).toContain("5");
	});

	it("includes workflow name in message", () => {
		const stack = createCallStack({ maxDepth: 3 });

		const error = createMaxDepthError(stack, "my-workflow");

		expect(error.message).toContain("my-workflow");
	});

	it("includes current call path in message", () => {
		const stack = createCallStack({
			maxDepth: 3,
			initialEntries: [
				makeEntry("workflow-a", "1.0.0"),
				makeEntry("workflow-b", "2.0.0"),
			],
		});

		const error = createMaxDepthError(stack, "workflow-c");

		expect(error.message).toContain("workflow-a@1.0.0");
		expect(error.message).toContain("workflow-b@2.0.0");
	});
});

// ============================================================================
// Integration Tests
// ============================================================================

describe("integration scenarios", () => {
	describe("workflow execution simulation", () => {
		it("simulates successful nested workflow execution", () => {
			let stack = createCallStack();

			// Root workflow starts
			const check1 = checkCircular(stack, "root-workflow", "1.0.0");
			expect(check1.isCircular).toBe(false);
			stack = pushCall(stack, makeEntry("root-workflow", "1.0.0", "start"));

			// Root calls child
			const check2 = checkCircular(stack, "child-workflow", "1.0.0");
			expect(check2.isCircular).toBe(false);
			stack = pushCall(stack, makeEntry("child-workflow", "1.0.0", "process"));

			// Child calls grandchild
			const check3 = checkCircular(stack, "grandchild-workflow", "1.0.0");
			expect(check3.isCircular).toBe(false);
			stack = pushCall(
				stack,
				makeEntry("grandchild-workflow", "1.0.0", "analyze"),
			);

			expect(getCallDepth(stack)).toBe(3);
			expect(formatCallStack(stack)).toBe(
				"root-workflow@1.0.0 -> child-workflow@1.0.0 -> grandchild-workflow@1.0.0",
			);

			// Grandchild completes
			stack = popCall(stack);
			expect(getCallDepth(stack)).toBe(2);

			// Child completes
			stack = popCall(stack);
			expect(getCallDepth(stack)).toBe(1);

			// Root completes
			stack = popCall(stack);
			expect(getCallDepth(stack)).toBe(0);
		});

		it("simulates circular call prevention", () => {
			let stack = createCallStack();

			// A starts
			stack = pushCall(stack, makeEntry("workflow-a", "1.0.0", "init"));

			// A calls B
			stack = pushCall(stack, makeEntry("workflow-b", "1.0.0", "process"));

			// B tries to call A - should be detected as circular
			const check = checkCircular(stack, "workflow-a", "1.0.0");
			expect(check.isCircular).toBe(true);

			// Instead B calls C
			const checkC = checkCircular(stack, "workflow-c", "1.0.0");
			expect(checkC.isCircular).toBe(false);
		});

		it("simulates depth limit enforcement", () => {
			let stack = createCallStack({ maxDepth: 3 });

			// Push 3 calls (at max depth)
			stack = pushCall(stack, makeEntry("level-1", "1.0.0", "n1"));
			stack = pushCall(stack, makeEntry("level-2", "1.0.0", "n2"));
			stack = pushCall(stack, makeEntry("level-3", "1.0.0", "n3"));

			expect(isAtMaxDepth(stack)).toBe(true);

			// Check if next call would exceed
			const check = checkCircular(stack, "level-4", "1.0.0");
			expect(check.exceedsMaxDepth).toBe(true);

			// Create appropriate error
			const error = createMaxDepthError(stack, "level-4");
			expect(error.code).toBe("CIRCULAR_CALL");
			expect(error.message).toContain("3");
		});
	});

	describe("edge cases", () => {
		it("handles workflow with same name but different case (case-sensitive)", () => {
			const stack = createCallStack({
				initialEntries: [makeEntry("MyWorkflow", "1.0.0")],
			});

			// Different case should not be detected as circular
			const result = checkCircular(stack, "myworkflow", "1.0.0");

			expect(result.isCircular).toBe(false);
		});

		it("handles scoped package names", () => {
			const stack = createCallStack({
				initialEntries: [makeEntry("@myorg/workflow-a", "1.0.0")],
			});

			// Same scoped package should be circular
			const result1 = checkCircular(stack, "@myorg/workflow-a", "1.0.0");
			expect(result1.isCircular).toBe(true);

			// Different scope should not be circular
			const result2 = checkCircular(stack, "@other/workflow-a", "1.0.0");
			expect(result2.isCircular).toBe(false);
		});

		it("handles empty workflow name", () => {
			const stack = createCallStack();

			const result = checkCircular(stack, "", "1.0.0");

			expect(result.isCircular).toBe(false);
		});
	});
});
