/**
 * Tests for DependencyGraphBuilder - cycle detection, topological sort, and version conflict detection.
 *
 * This module tests all graph functionality in graph.ts including:
 * - Cycle detection using DFS with three-state coloring
 * - Topological sort for correct load order
 * - Version conflict detection
 * - Transitive dependency resolution
 * - Graph builder utilities
 * - Type guards
 */

import { describe, expect, it } from "bun:test";
import type { Result } from "../utils/result/result.ts";
import {
	createDependencyGraphBuilder,
	DependencyGraphBuilder,
	formatDependencyTree,
	getDependencyDepth,
	getDependencyNames,
	hasExternalDependencies,
	isDependencyEdge,
	isDependencyGraph,
} from "./graph.ts";
import type { WorkflowResolver } from "./resolver.ts";
import type {
	DependencyEdge,
	DependencyGraph,
	ResolutionError,
	ResolvedWorkflow,
	WorkflowReference,
} from "./types.ts";
import { RESOLUTION_ERROR_CODES } from "./types.ts";

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Creates a mock ResolvedWorkflow.
 */
function createMockResolvedWorkflow(
	name: string,
	version: string,
	dependencies?: Record<string, string>,
): ResolvedWorkflow {
	return {
		reference: { name },
		path: `/mock/path/${name}@${version}`,
		version,
		source: "project",
		exportName: "default",
		metadata: {
			name,
			version,
			main: "./index.ts",
			dependencies,
		},
	};
}

/**
 * Creates a mock WorkflowResolver.
 *
 * The resolver uses a map of workflows to return results for resolution.
 */
function createMockResolver(
	workflows: Map<string, ResolvedWorkflow>,
): WorkflowResolver {
	return {
		async resolve(
			reference: string | WorkflowReference,
		): Promise<Result<ResolvedWorkflow, ResolutionError>> {
			const name =
				typeof reference === "string"
					? reference.split("@")[0].split(":")[0]
					: reference.name;

			const workflow = workflows.get(name);
			if (workflow) {
				return { _tag: "ok", value: workflow };
			}

			return {
				_tag: "err",
				error: {
					code: RESOLUTION_ERROR_CODES.WORKFLOW_NOT_FOUND,
					message: `Workflow "${name}" not found`,
					reference: typeof reference === "string" ? { name } : reference,
				},
			};
		},
		async exists(): Promise<boolean> {
			return true;
		},
		async getVersions() {
			return [];
		},
		async list() {
			return [];
		},
		getPaths() {
			return {
				projectWorkflows: "/mock/project",
				projectInstalled: "/mock/installed",
				globalWorkflows: "/mock/global",
				projectRoot: "/mock",
			};
		},
		async refresh() {},
	};
}

// ============================================================================
// DependencyGraphBuilder Tests
// ============================================================================

describe("DependencyGraphBuilder", () => {
	// ============================================================================
	// Basic Graph Building Tests
	// ============================================================================

	describe("buildGraph - basic", () => {
		it("should build graph for workflow without dependencies", async () => {
			const workflows = new Map<string, ResolvedWorkflow>();
			workflows.set("root", createMockResolvedWorkflow("root", "1.0.0"));

			const resolver = createMockResolver(workflows);
			const builder = new DependencyGraphBuilder(resolver);

			const result = await builder.buildGraph("root");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value.root.metadata.name).toBe("root");
				expect(result.value.dependencies.size).toBe(0);
				expect(result.value.edges.length).toBe(0);
				expect(result.value.loadOrder).toContain("root");
			}
		});

		it("should build graph with single dependency", async () => {
			const workflows = new Map<string, ResolvedWorkflow>();
			workflows.set(
				"root",
				createMockResolvedWorkflow("root", "1.0.0", {
					"dep-a": "^1.0.0",
				}),
			);
			workflows.set("dep-a", createMockResolvedWorkflow("dep-a", "1.0.0"));

			const resolver = createMockResolver(workflows);
			const builder = new DependencyGraphBuilder(resolver);

			const result = await builder.buildGraph("root");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value.dependencies.size).toBe(1);
				expect(result.value.dependencies.has("dep-a")).toBe(true);
				expect(result.value.edges.length).toBe(1);
				expect(result.value.edges[0]).toEqual({
					from: "root",
					to: "dep-a",
					versionRange: "^1.0.0",
				});
			}
		});

		it("should build graph with multiple dependencies", async () => {
			const workflows = new Map<string, ResolvedWorkflow>();
			workflows.set(
				"root",
				createMockResolvedWorkflow("root", "1.0.0", {
					"dep-a": "^1.0.0",
					"dep-b": "^2.0.0",
				}),
			);
			workflows.set("dep-a", createMockResolvedWorkflow("dep-a", "1.0.0"));
			workflows.set("dep-b", createMockResolvedWorkflow("dep-b", "2.0.0"));

			const resolver = createMockResolver(workflows);
			const builder = new DependencyGraphBuilder(resolver);

			const result = await builder.buildGraph("root");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value.dependencies.size).toBe(2);
				expect(result.value.dependencies.has("dep-a")).toBe(true);
				expect(result.value.dependencies.has("dep-b")).toBe(true);
				expect(result.value.edges.length).toBe(2);
			}
		});

		it("should resolve transitive dependencies", async () => {
			const workflows = new Map<string, ResolvedWorkflow>();
			workflows.set(
				"root",
				createMockResolvedWorkflow("root", "1.0.0", {
					"dep-a": "^1.0.0",
				}),
			);
			workflows.set(
				"dep-a",
				createMockResolvedWorkflow("dep-a", "1.0.0", {
					"dep-b": "^1.0.0",
				}),
			);
			workflows.set("dep-b", createMockResolvedWorkflow("dep-b", "1.0.0"));

			const resolver = createMockResolver(workflows);
			const builder = new DependencyGraphBuilder(resolver);

			const result = await builder.buildGraph("root");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value.dependencies.size).toBe(2);
				expect(result.value.dependencies.has("dep-a")).toBe(true);
				expect(result.value.dependencies.has("dep-b")).toBe(true);
				expect(result.value.edges.length).toBe(2);
			}
		});

		it("should handle diamond dependencies", async () => {
			// root -> dep-a -> common
			// root -> dep-b -> common
			const workflows = new Map<string, ResolvedWorkflow>();
			workflows.set(
				"root",
				createMockResolvedWorkflow("root", "1.0.0", {
					"dep-a": "^1.0.0",
					"dep-b": "^1.0.0",
				}),
			);
			workflows.set(
				"dep-a",
				createMockResolvedWorkflow("dep-a", "1.0.0", {
					common: "^1.0.0",
				}),
			);
			workflows.set(
				"dep-b",
				createMockResolvedWorkflow("dep-b", "1.0.0", {
					common: "^1.0.0",
				}),
			);
			workflows.set("common", createMockResolvedWorkflow("common", "1.0.0"));

			const resolver = createMockResolver(workflows);
			const builder = new DependencyGraphBuilder(resolver);

			const result = await builder.buildGraph("root");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				// Should have 3 dependencies: dep-a, dep-b, common (only once)
				expect(result.value.dependencies.size).toBe(3);
				expect(result.value.dependencies.has("common")).toBe(true);
				// Load order should have common before dep-a and dep-b
				const loadOrder = result.value.loadOrder;
				const commonIndex = loadOrder.indexOf("common");
				const depAIndex = loadOrder.indexOf("dep-a");
				const depBIndex = loadOrder.indexOf("dep-b");
				expect(commonIndex).toBeLessThan(depAIndex);
				expect(commonIndex).toBeLessThan(depBIndex);
			}
		});
	});

	// ============================================================================
	// Cycle Detection Tests
	// ============================================================================

	describe("cycle detection", () => {
		it("should detect simple two-node cycle (A -> B -> A)", async () => {
			const workflows = new Map<string, ResolvedWorkflow>();
			workflows.set(
				"workflow-a",
				createMockResolvedWorkflow("workflow-a", "1.0.0", {
					"workflow-b": "^1.0.0",
				}),
			);
			workflows.set(
				"workflow-b",
				createMockResolvedWorkflow("workflow-b", "1.0.0", {
					"workflow-a": "^1.0.0",
				}),
			);

			const resolver = createMockResolver(workflows);
			const builder = new DependencyGraphBuilder(resolver);

			const result = await builder.buildGraph("workflow-a");

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.code).toBe(
					RESOLUTION_ERROR_CODES.CIRCULAR_DEPENDENCY,
				);
				expect(result.error.cyclePath).toBeDefined();
				expect(result.error.cyclePath?.length).toBeGreaterThanOrEqual(2);
				expect(result.error.message).toContain("Circular dependency detected");
			}
		});

		it("should detect three-node cycle (A -> B -> C -> A)", async () => {
			const workflows = new Map<string, ResolvedWorkflow>();
			workflows.set(
				"a",
				createMockResolvedWorkflow("a", "1.0.0", {
					b: "^1.0.0",
				}),
			);
			workflows.set(
				"b",
				createMockResolvedWorkflow("b", "1.0.0", {
					c: "^1.0.0",
				}),
			);
			workflows.set(
				"c",
				createMockResolvedWorkflow("c", "1.0.0", {
					a: "^1.0.0",
				}),
			);

			const resolver = createMockResolver(workflows);
			const builder = new DependencyGraphBuilder(resolver);

			const result = await builder.buildGraph("a");

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.code).toBe(
					RESOLUTION_ERROR_CODES.CIRCULAR_DEPENDENCY,
				);
				expect(result.error.cyclePath).toBeDefined();
				expect(result.error.cyclePath).toContain("a");
				expect(result.error.cyclePath).toContain("b");
				expect(result.error.cyclePath).toContain("c");
			}
		});

		it("should detect self-referential dependency (A -> A)", async () => {
			const workflows = new Map<string, ResolvedWorkflow>();
			workflows.set(
				"self-ref",
				createMockResolvedWorkflow("self-ref", "1.0.0", {
					"self-ref": "^1.0.0",
				}),
			);

			const resolver = createMockResolver(workflows);
			const builder = new DependencyGraphBuilder(resolver);

			const result = await builder.buildGraph("self-ref");

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.code).toBe(
					RESOLUTION_ERROR_CODES.CIRCULAR_DEPENDENCY,
				);
				expect(result.error.cyclePath).toBeDefined();
			}
		});

		it("should detect cycle in deep transitive dependencies", async () => {
			// root -> a -> b -> c -> d -> b (cycle: b -> c -> d -> b)
			const workflows = new Map<string, ResolvedWorkflow>();
			workflows.set(
				"root",
				createMockResolvedWorkflow("root", "1.0.0", {
					a: "^1.0.0",
				}),
			);
			workflows.set(
				"a",
				createMockResolvedWorkflow("a", "1.0.0", {
					b: "^1.0.0",
				}),
			);
			workflows.set(
				"b",
				createMockResolvedWorkflow("b", "1.0.0", {
					c: "^1.0.0",
				}),
			);
			workflows.set(
				"c",
				createMockResolvedWorkflow("c", "1.0.0", {
					d: "^1.0.0",
				}),
			);
			workflows.set(
				"d",
				createMockResolvedWorkflow("d", "1.0.0", {
					b: "^1.0.0", // Creates cycle
				}),
			);

			const resolver = createMockResolver(workflows);
			const builder = new DependencyGraphBuilder(resolver);

			const result = await builder.buildGraph("root");

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.code).toBe(
					RESOLUTION_ERROR_CODES.CIRCULAR_DEPENDENCY,
				);
				expect(result.error.cyclePath).toBeDefined();
				expect(result.error.suggestions).toBeDefined();
			}
		});

		it("should not report false positive for non-cyclic graph", async () => {
			// Complex graph without cycles
			// root -> a -> c
			// root -> b -> c
			// (shared dependency, not a cycle)
			const workflows = new Map<string, ResolvedWorkflow>();
			workflows.set(
				"root",
				createMockResolvedWorkflow("root", "1.0.0", {
					a: "^1.0.0",
					b: "^1.0.0",
				}),
			);
			workflows.set(
				"a",
				createMockResolvedWorkflow("a", "1.0.0", {
					c: "^1.0.0",
				}),
			);
			workflows.set(
				"b",
				createMockResolvedWorkflow("b", "1.0.0", {
					c: "^1.0.0",
				}),
			);
			workflows.set("c", createMockResolvedWorkflow("c", "1.0.0"));

			const resolver = createMockResolver(workflows);
			const builder = new DependencyGraphBuilder(resolver);

			const result = await builder.buildGraph("root");

			expect(result._tag).toBe("ok");
		});

		it("should include suggestions in cycle error", async () => {
			const workflows = new Map<string, ResolvedWorkflow>();
			workflows.set(
				"cycle-a",
				createMockResolvedWorkflow("cycle-a", "1.0.0", {
					"cycle-b": "^1.0.0",
				}),
			);
			workflows.set(
				"cycle-b",
				createMockResolvedWorkflow("cycle-b", "1.0.0", {
					"cycle-a": "^1.0.0",
				}),
			);

			const resolver = createMockResolver(workflows);
			const builder = new DependencyGraphBuilder(resolver);

			const result = await builder.buildGraph("cycle-a");

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.suggestions).toBeDefined();
				expect(result.error.suggestions?.length).toBeGreaterThan(0);
			}
		});
	});

	// ============================================================================
	// Topological Sort Tests
	// ============================================================================

	describe("topological sort", () => {
		it("should return correct load order for linear dependencies", async () => {
			// root -> a -> b -> c
			const workflows = new Map<string, ResolvedWorkflow>();
			workflows.set(
				"root",
				createMockResolvedWorkflow("root", "1.0.0", {
					a: "^1.0.0",
				}),
			);
			workflows.set(
				"a",
				createMockResolvedWorkflow("a", "1.0.0", {
					b: "^1.0.0",
				}),
			);
			workflows.set(
				"b",
				createMockResolvedWorkflow("b", "1.0.0", {
					c: "^1.0.0",
				}),
			);
			workflows.set("c", createMockResolvedWorkflow("c", "1.0.0"));

			const resolver = createMockResolver(workflows);
			const builder = new DependencyGraphBuilder(resolver);

			const result = await builder.buildGraph("root");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				const loadOrder = result.value.loadOrder;
				// c should come before b, b before a, a before root
				expect(loadOrder.indexOf("c")).toBeLessThan(loadOrder.indexOf("b"));
				expect(loadOrder.indexOf("b")).toBeLessThan(loadOrder.indexOf("a"));
				expect(loadOrder.indexOf("a")).toBeLessThan(loadOrder.indexOf("root"));
			}
		});

		it("should return correct load order for parallel dependencies", async () => {
			// root -> a, b, c (no dependencies between a, b, c)
			const workflows = new Map<string, ResolvedWorkflow>();
			workflows.set(
				"root",
				createMockResolvedWorkflow("root", "1.0.0", {
					a: "^1.0.0",
					b: "^1.0.0",
					c: "^1.0.0",
				}),
			);
			workflows.set("a", createMockResolvedWorkflow("a", "1.0.0"));
			workflows.set("b", createMockResolvedWorkflow("b", "1.0.0"));
			workflows.set("c", createMockResolvedWorkflow("c", "1.0.0"));

			const resolver = createMockResolver(workflows);
			const builder = new DependencyGraphBuilder(resolver);

			const result = await builder.buildGraph("root");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				const loadOrder = result.value.loadOrder;
				// root should be last
				expect(loadOrder.indexOf("root")).toBe(loadOrder.length - 1);
				// a, b, c should all come before root
				expect(loadOrder.indexOf("a")).toBeLessThan(loadOrder.indexOf("root"));
				expect(loadOrder.indexOf("b")).toBeLessThan(loadOrder.indexOf("root"));
				expect(loadOrder.indexOf("c")).toBeLessThan(loadOrder.indexOf("root"));
			}
		});

		it("should return correct load order for diamond dependency", async () => {
			// root -> a -> common
			// root -> b -> common
			const workflows = new Map<string, ResolvedWorkflow>();
			workflows.set(
				"root",
				createMockResolvedWorkflow("root", "1.0.0", {
					a: "^1.0.0",
					b: "^1.0.0",
				}),
			);
			workflows.set(
				"a",
				createMockResolvedWorkflow("a", "1.0.0", {
					common: "^1.0.0",
				}),
			);
			workflows.set(
				"b",
				createMockResolvedWorkflow("b", "1.0.0", {
					common: "^1.0.0",
				}),
			);
			workflows.set("common", createMockResolvedWorkflow("common", "1.0.0"));

			const resolver = createMockResolver(workflows);
			const builder = new DependencyGraphBuilder(resolver);

			const result = await builder.buildGraph("root");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				const loadOrder = result.value.loadOrder;
				// common must come before both a and b
				expect(loadOrder.indexOf("common")).toBeLessThan(
					loadOrder.indexOf("a"),
				);
				expect(loadOrder.indexOf("common")).toBeLessThan(
					loadOrder.indexOf("b"),
				);
				// root must be last
				expect(loadOrder.indexOf("root")).toBe(loadOrder.length - 1);
			}
		});

		it("should produce deterministic load order", async () => {
			// Same graph should produce same order every time
			const workflows = new Map<string, ResolvedWorkflow>();
			workflows.set(
				"root",
				createMockResolvedWorkflow("root", "1.0.0", {
					x: "^1.0.0",
					y: "^1.0.0",
					z: "^1.0.0",
				}),
			);
			workflows.set("x", createMockResolvedWorkflow("x", "1.0.0"));
			workflows.set("y", createMockResolvedWorkflow("y", "1.0.0"));
			workflows.set("z", createMockResolvedWorkflow("z", "1.0.0"));

			const resolver = createMockResolver(workflows);
			const builder = new DependencyGraphBuilder(resolver);

			const result1 = await builder.buildGraph("root");
			const result2 = await builder.buildGraph("root");

			expect(result1._tag).toBe("ok");
			expect(result2._tag).toBe("ok");
			if (result1._tag === "ok" && result2._tag === "ok") {
				expect(result1.value.loadOrder).toEqual(result2.value.loadOrder);
			}
		});

		it("should include all nodes in load order", async () => {
			const workflows = new Map<string, ResolvedWorkflow>();
			workflows.set(
				"root",
				createMockResolvedWorkflow("root", "1.0.0", {
					a: "^1.0.0",
					b: "^1.0.0",
				}),
			);
			workflows.set(
				"a",
				createMockResolvedWorkflow("a", "1.0.0", {
					c: "^1.0.0",
				}),
			);
			workflows.set("b", createMockResolvedWorkflow("b", "1.0.0"));
			workflows.set("c", createMockResolvedWorkflow("c", "1.0.0"));

			const resolver = createMockResolver(workflows);
			const builder = new DependencyGraphBuilder(resolver);

			const result = await builder.buildGraph("root");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value.loadOrder.length).toBe(4);
				expect(result.value.loadOrder).toContain("root");
				expect(result.value.loadOrder).toContain("a");
				expect(result.value.loadOrder).toContain("b");
				expect(result.value.loadOrder).toContain("c");
			}
		});
	});

	// ============================================================================
	// Version Conflict Detection Tests
	// ============================================================================

	describe("version conflict detection", () => {
		it("should detect version conflict when resolved version doesn't satisfy requirement", async () => {
			// root requires a@^1.0.0 and b@^1.0.0
			// b requires a@^2.0.0 (conflict with root's requirement)
			// But resolver resolves a to 1.0.0
			const workflows = new Map<string, ResolvedWorkflow>();
			workflows.set(
				"root",
				createMockResolvedWorkflow("root", "1.0.0", {
					a: "^1.0.0",
					b: "^1.0.0",
				}),
			);
			workflows.set("a", createMockResolvedWorkflow("a", "1.0.0")); // Resolved to 1.0.0
			workflows.set(
				"b",
				createMockResolvedWorkflow("b", "1.0.0", {
					a: "^2.0.0", // But b requires ^2.0.0 which 1.0.0 doesn't satisfy
				}),
			);

			const resolver = createMockResolver(workflows);
			const builder = new DependencyGraphBuilder(resolver);

			const result = await builder.buildGraph("root");

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.code).toBe(RESOLUTION_ERROR_CODES.VERSION_CONFLICT);
				expect(result.error.conflicts).toBeDefined();
				expect(result.error.conflicts?.length).toBeGreaterThan(0);
			}
		});

		it("should include conflict details in error", async () => {
			const workflows = new Map<string, ResolvedWorkflow>();
			workflows.set(
				"root",
				createMockResolvedWorkflow("root", "1.0.0", {
					shared: "^1.0.0",
					other: "^1.0.0",
				}),
			);
			workflows.set("shared", createMockResolvedWorkflow("shared", "1.0.0"));
			workflows.set(
				"other",
				createMockResolvedWorkflow("other", "1.0.0", {
					shared: "^2.0.0", // Conflict: requires 2.x but 1.0.0 is resolved
				}),
			);

			const resolver = createMockResolver(workflows);
			const builder = new DependencyGraphBuilder(resolver);

			const result = await builder.buildGraph("root");

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.conflicts).toBeDefined();
				const conflict = result.error.conflicts?.[0];
				expect(conflict?.workflow).toBe("other");
				expect(conflict?.required).toBe("^2.0.0");
				expect(conflict?.resolved).toBe("1.0.0");
			}
		});

		it("should include suggestions in conflict error", async () => {
			const workflows = new Map<string, ResolvedWorkflow>();
			workflows.set(
				"root",
				createMockResolvedWorkflow("root", "1.0.0", {
					dep: "^1.0.0",
					other: "^1.0.0",
				}),
			);
			workflows.set("dep", createMockResolvedWorkflow("dep", "1.0.0"));
			workflows.set(
				"other",
				createMockResolvedWorkflow("other", "1.0.0", {
					dep: "^3.0.0",
				}),
			);

			const resolver = createMockResolver(workflows);
			const builder = new DependencyGraphBuilder(resolver);

			const result = await builder.buildGraph("root");

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.suggestions).toBeDefined();
				expect(result.error.suggestions?.length).toBeGreaterThan(0);
			}
		});

		it("should not report conflict when versions are compatible", async () => {
			// All require ^1.0.0, resolved to 1.5.0 which satisfies all
			const workflows = new Map<string, ResolvedWorkflow>();
			workflows.set(
				"root",
				createMockResolvedWorkflow("root", "1.0.0", {
					shared: "^1.0.0",
					a: "^1.0.0",
					b: "^1.0.0",
				}),
			);
			workflows.set("shared", createMockResolvedWorkflow("shared", "1.5.0"));
			workflows.set(
				"a",
				createMockResolvedWorkflow("a", "1.0.0", {
					shared: "^1.0.0",
				}),
			);
			workflows.set(
				"b",
				createMockResolvedWorkflow("b", "1.0.0", {
					shared: "^1.0.0",
				}),
			);

			const resolver = createMockResolver(workflows);
			const builder = new DependencyGraphBuilder(resolver);

			const result = await builder.buildGraph("root");

			expect(result._tag).toBe("ok");
		});

		it("should report all conflicts in a single error", async () => {
			// Multiple conflicts
			const workflows = new Map<string, ResolvedWorkflow>();
			workflows.set(
				"root",
				createMockResolvedWorkflow("root", "1.0.0", {
					shared: "^1.0.0",
					a: "^1.0.0",
					b: "^1.0.0",
				}),
			);
			workflows.set("shared", createMockResolvedWorkflow("shared", "1.0.0"));
			workflows.set(
				"a",
				createMockResolvedWorkflow("a", "1.0.0", {
					shared: "^2.0.0", // Conflict 1
				}),
			);
			workflows.set(
				"b",
				createMockResolvedWorkflow("b", "1.0.0", {
					shared: "^3.0.0", // Conflict 2
				}),
			);

			const resolver = createMockResolver(workflows);
			const builder = new DependencyGraphBuilder(resolver);

			const result = await builder.buildGraph("root");

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.conflicts).toBeDefined();
				expect(result.error.conflicts?.length).toBe(2);
			}
		});
	});

	// ============================================================================
	// Error Handling Tests
	// ============================================================================

	describe("error handling", () => {
		it("should return error when root workflow not found", async () => {
			const workflows = new Map<string, ResolvedWorkflow>();
			const resolver = createMockResolver(workflows);
			const builder = new DependencyGraphBuilder(resolver);

			const result = await builder.buildGraph("nonexistent");

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.code).toBe(
					RESOLUTION_ERROR_CODES.WORKFLOW_NOT_FOUND,
				);
			}
		});

		it("should return error when dependency not found", async () => {
			const workflows = new Map<string, ResolvedWorkflow>();
			workflows.set(
				"root",
				createMockResolvedWorkflow("root", "1.0.0", {
					"missing-dep": "^1.0.0",
				}),
			);

			const resolver = createMockResolver(workflows);
			const builder = new DependencyGraphBuilder(resolver);

			const result = await builder.buildGraph("root");

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.code).toBe(
					RESOLUTION_ERROR_CODES.WORKFLOW_NOT_FOUND,
				);
				expect(result.error.message).toContain("missing-dep");
			}
		});

		it("should return error when max depth exceeded", async () => {
			// Create a deep chain that exceeds max depth
			const workflows = new Map<string, ResolvedWorkflow>();
			const maxDepth = 5;

			for (let i = 0; i <= maxDepth + 2; i++) {
				const name = `dep-${i}`;
				const nextName = `dep-${i + 1}`;
				workflows.set(
					name,
					createMockResolvedWorkflow(
						name,
						"1.0.0",
						i <= maxDepth ? { [nextName]: "^1.0.0" } : undefined,
					),
				);
			}

			const resolver = createMockResolver(workflows);
			const builder = new DependencyGraphBuilder(resolver, { maxDepth });

			const result = await builder.buildGraph("dep-0");

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.code).toBe(
					RESOLUTION_ERROR_CODES.CIRCULAR_DEPENDENCY,
				);
				expect(result.error.message).toContain("Maximum dependency depth");
			}
		});

		it("should handle invalid reference", async () => {
			const workflows = new Map<string, ResolvedWorkflow>();
			workflows.set("test", createMockResolvedWorkflow("test", "1.0.0"));

			const resolver = createMockResolver(workflows);
			const builder = new DependencyGraphBuilder(resolver);

			const result = await builder.buildGraph("");

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.code).toBe(
					RESOLUTION_ERROR_CODES.INVALID_REFERENCE,
				);
			}
		});
	});

	// ============================================================================
	// hasDependencies Tests
	// ============================================================================

	describe("hasDependencies()", () => {
		it("should return true when workflow has dependencies", async () => {
			const workflows = new Map<string, ResolvedWorkflow>();
			workflows.set(
				"with-deps",
				createMockResolvedWorkflow("with-deps", "1.0.0", {
					dep: "^1.0.0",
				}),
			);
			workflows.set("dep", createMockResolvedWorkflow("dep", "1.0.0"));

			const resolver = createMockResolver(workflows);
			const builder = new DependencyGraphBuilder(resolver);

			const hasDeps = await builder.hasDependencies("with-deps");

			expect(hasDeps).toBe(true);
		});

		it("should return false when workflow has no dependencies", async () => {
			const workflows = new Map<string, ResolvedWorkflow>();
			workflows.set("no-deps", createMockResolvedWorkflow("no-deps", "1.0.0"));

			const resolver = createMockResolver(workflows);
			const builder = new DependencyGraphBuilder(resolver);

			const hasDeps = await builder.hasDependencies("no-deps");

			expect(hasDeps).toBe(false);
		});

		it("should return false when workflow not found", async () => {
			const workflows = new Map<string, ResolvedWorkflow>();
			const resolver = createMockResolver(workflows);
			const builder = new DependencyGraphBuilder(resolver);

			const hasDeps = await builder.hasDependencies("nonexistent");

			expect(hasDeps).toBe(false);
		});
	});

	// ============================================================================
	// getDirectDependencies Tests
	// ============================================================================

	describe("getDirectDependencies()", () => {
		it("should return direct dependencies only", async () => {
			const workflows = new Map<string, ResolvedWorkflow>();
			workflows.set(
				"root",
				createMockResolvedWorkflow("root", "1.0.0", {
					direct: "^1.0.0",
				}),
			);
			workflows.set(
				"direct",
				createMockResolvedWorkflow("direct", "1.0.0", {
					transitive: "^1.0.0",
				}),
			);
			workflows.set(
				"transitive",
				createMockResolvedWorkflow("transitive", "1.0.0"),
			);

			const resolver = createMockResolver(workflows);
			const builder = new DependencyGraphBuilder(resolver);

			const result = await builder.getDirectDependencies("root");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value.length).toBe(1);
				expect(result.value[0].metadata.name).toBe("direct");
			}
		});

		it("should return empty array when no dependencies", async () => {
			const workflows = new Map<string, ResolvedWorkflow>();
			workflows.set("no-deps", createMockResolvedWorkflow("no-deps", "1.0.0"));

			const resolver = createMockResolver(workflows);
			const builder = new DependencyGraphBuilder(resolver);

			const result = await builder.getDirectDependencies("no-deps");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toEqual([]);
			}
		});

		it("should return error when dependency not found", async () => {
			const workflows = new Map<string, ResolvedWorkflow>();
			workflows.set(
				"root",
				createMockResolvedWorkflow("root", "1.0.0", {
					missing: "^1.0.0",
				}),
			);

			const resolver = createMockResolver(workflows);
			const builder = new DependencyGraphBuilder(resolver);

			const result = await builder.getDirectDependencies("root");

			expect(result._tag).toBe("err");
		});
	});
});

// ============================================================================
// createDependencyGraphBuilder Factory Tests
// ============================================================================

describe("createDependencyGraphBuilder", () => {
	it("should create a DependencyGraphBuilder instance", () => {
		const workflows = new Map<string, ResolvedWorkflow>();
		const resolver = createMockResolver(workflows);

		const builder = createDependencyGraphBuilder(resolver);

		expect(builder).toBeInstanceOf(DependencyGraphBuilder);
	});

	it("should create builder with custom options", () => {
		const workflows = new Map<string, ResolvedWorkflow>();
		const resolver = createMockResolver(workflows);

		const builder = createDependencyGraphBuilder(resolver, { maxDepth: 50 });

		expect(builder).toBeInstanceOf(DependencyGraphBuilder);
	});
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe("utility functions", () => {
	describe("hasExternalDependencies", () => {
		it("should return true when graph has dependencies", () => {
			const graph: DependencyGraph = {
				root: createMockResolvedWorkflow("root", "1.0.0"),
				dependencies: new Map([
					["dep", createMockResolvedWorkflow("dep", "1.0.0")],
				]),
				edges: [],
				loadOrder: ["dep", "root"],
			};

			expect(hasExternalDependencies(graph)).toBe(true);
		});

		it("should return false when graph has no dependencies", () => {
			const graph: DependencyGraph = {
				root: createMockResolvedWorkflow("root", "1.0.0"),
				dependencies: new Map(),
				edges: [],
				loadOrder: ["root"],
			};

			expect(hasExternalDependencies(graph)).toBe(false);
		});
	});

	describe("getDependencyNames", () => {
		it("should return all dependency names", () => {
			const graph: DependencyGraph = {
				root: createMockResolvedWorkflow("root", "1.0.0"),
				dependencies: new Map([
					["dep-a", createMockResolvedWorkflow("dep-a", "1.0.0")],
					["dep-b", createMockResolvedWorkflow("dep-b", "1.0.0")],
				]),
				edges: [],
				loadOrder: ["dep-a", "dep-b", "root"],
			};

			const names = getDependencyNames(graph);

			expect(names.length).toBe(2);
			expect(names).toContain("dep-a");
			expect(names).toContain("dep-b");
		});

		it("should return empty array for graph without dependencies", () => {
			const graph: DependencyGraph = {
				root: createMockResolvedWorkflow("root", "1.0.0"),
				dependencies: new Map(),
				edges: [],
				loadOrder: ["root"],
			};

			const names = getDependencyNames(graph);

			expect(names).toEqual([]);
		});
	});

	describe("getDependencyDepth", () => {
		it("should return 0 for root", () => {
			const graph: DependencyGraph = {
				root: createMockResolvedWorkflow("root", "1.0.0"),
				dependencies: new Map(),
				edges: [],
				loadOrder: ["root"],
			};

			expect(getDependencyDepth(graph, "root")).toBe(0);
		});

		it("should return correct depth for direct dependency", () => {
			const graph: DependencyGraph = {
				root: createMockResolvedWorkflow("root", "1.0.0"),
				dependencies: new Map([
					["dep", createMockResolvedWorkflow("dep", "1.0.0")],
				]),
				edges: [{ from: "root", to: "dep", versionRange: "^1.0.0" }],
				loadOrder: ["dep", "root"],
			};

			expect(getDependencyDepth(graph, "dep")).toBe(1);
		});

		it("should return correct depth for transitive dependency", () => {
			const graph: DependencyGraph = {
				root: createMockResolvedWorkflow("root", "1.0.0"),
				dependencies: new Map([
					["level1", createMockResolvedWorkflow("level1", "1.0.0")],
					["level2", createMockResolvedWorkflow("level2", "1.0.0")],
				]),
				edges: [
					{ from: "root", to: "level1", versionRange: "^1.0.0" },
					{ from: "level1", to: "level2", versionRange: "^1.0.0" },
				],
				loadOrder: ["level2", "level1", "root"],
			};

			expect(getDependencyDepth(graph, "level2")).toBe(2);
		});

		it("should return -1 for non-existent dependency", () => {
			const graph: DependencyGraph = {
				root: createMockResolvedWorkflow("root", "1.0.0"),
				dependencies: new Map(),
				edges: [],
				loadOrder: ["root"],
			};

			expect(getDependencyDepth(graph, "nonexistent")).toBe(-1);
		});
	});

	describe("formatDependencyTree", () => {
		it("should format simple graph", () => {
			const graph: DependencyGraph = {
				root: createMockResolvedWorkflow("root", "1.0.0"),
				dependencies: new Map([
					["dep", createMockResolvedWorkflow("dep", "1.0.0")],
				]),
				edges: [{ from: "root", to: "dep", versionRange: "^1.0.0" }],
				loadOrder: ["dep", "root"],
			};

			const tree = formatDependencyTree(graph);

			expect(tree).toContain("root@1.0.0");
			expect(tree).toContain("dep@1.0.0");
		});

		it("should format graph with no dependencies", () => {
			const graph: DependencyGraph = {
				root: createMockResolvedWorkflow("root", "1.0.0"),
				dependencies: new Map(),
				edges: [],
				loadOrder: ["root"],
			};

			const tree = formatDependencyTree(graph);

			expect(tree).toContain("root@1.0.0");
		});
	});
});

// ============================================================================
// Type Guard Tests
// ============================================================================

describe("type guards", () => {
	describe("isDependencyGraph", () => {
		it("should return true for valid DependencyGraph", () => {
			const graph: DependencyGraph = {
				root: createMockResolvedWorkflow("root", "1.0.0"),
				dependencies: new Map(),
				edges: [],
				loadOrder: ["root"],
			};

			expect(isDependencyGraph(graph)).toBe(true);
		});

		it("should return false for null", () => {
			expect(isDependencyGraph(null)).toBe(false);
		});

		it("should return false for undefined", () => {
			expect(isDependencyGraph(undefined)).toBe(false);
		});

		it("should return false for non-object", () => {
			expect(isDependencyGraph("not an object")).toBe(false);
			expect(isDependencyGraph(123)).toBe(false);
		});

		it("should return false for object missing required fields", () => {
			expect(isDependencyGraph({})).toBe(false);
			expect(isDependencyGraph({ root: {} })).toBe(false);
			expect(isDependencyGraph({ root: {}, dependencies: [] })).toBe(false);
		});
	});

	describe("isDependencyEdge", () => {
		it("should return true for valid DependencyEdge", () => {
			const edge: DependencyEdge = {
				from: "a",
				to: "b",
				versionRange: "^1.0.0",
			};

			expect(isDependencyEdge(edge)).toBe(true);
		});

		it("should return false for null", () => {
			expect(isDependencyEdge(null)).toBe(false);
		});

		it("should return false for object with wrong types", () => {
			expect(
				isDependencyEdge({ from: 1, to: "b", versionRange: "^1.0.0" }),
			).toBe(false);
			expect(
				isDependencyEdge({ from: "a", to: 2, versionRange: "^1.0.0" }),
			).toBe(false);
			expect(isDependencyEdge({ from: "a", to: "b", versionRange: 123 })).toBe(
				false,
			);
		});

		it("should return false for object missing fields", () => {
			expect(isDependencyEdge({ from: "a", to: "b" })).toBe(false);
			expect(isDependencyEdge({ from: "a", versionRange: "^1.0.0" })).toBe(
				false,
			);
		});
	});
});
