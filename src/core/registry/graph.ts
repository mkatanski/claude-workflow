/**
 * Dependency graph builder for workflow registry.
 *
 * This module provides functionality to build dependency graphs with:
 * - Transitive dependency resolution
 * - Cycle detection using DFS with three-state coloring
 * - Topological sort for correct load order
 * - Version conflict detection
 *
 * @example
 * ```typescript
 * import { createDependencyGraphBuilder } from "./graph.ts";
 * import { createResolver } from "./resolver.ts";
 *
 * const resolver = createResolver();
 * const graphBuilder = createDependencyGraphBuilder(resolver);
 *
 * // Build dependency graph for a workflow
 * const result = await graphBuilder.buildGraph("my-workflow@^1.0.0");
 * if (isOk(result)) {
 *   const graph = result.value;
 *   console.log("Load order:", graph.loadOrder);
 *   console.log("Dependencies:", graph.dependencies.size);
 * } else {
 *   console.error("Error:", result.error.message);
 * }
 * ```
 */

import type { Result } from "../utils/result/result.ts";
import type { ResolutionCache } from "./cache.ts";
import { normalizeReference } from "./reference.ts";
import type { WorkflowResolver } from "./resolver.ts";
import type {
	DependencyEdge,
	DependencyGraph,
	DependencyGraphResult,
	ResolutionContext,
	ResolutionError,
	ResolvedWorkflow,
	VersionConflict,
	WorkflowReference,
} from "./types.ts";
import { RESOLUTION_ERROR_CODES } from "./types.ts";
import { satisfies } from "./version.ts";

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Options for building dependency graphs.
 */
export interface GraphBuilderOptions {
	/**
	 * Resolution cache for performance optimization.
	 *
	 * If provided, built graphs will be cached.
	 */
	cache?: ResolutionCache;

	/**
	 * Maximum depth for transitive dependency resolution.
	 *
	 * Prevents infinite recursion in case of errors.
	 * @default 100
	 */
	maxDepth?: number;
}

/**
 * Internal state for graph building.
 */
interface GraphBuildState {
	/** Map of resolved workflows by name */
	resolved: Map<string, ResolvedWorkflow>;

	/** Edges in the dependency graph */
	edges: DependencyEdge[];

	/** Version requirements by workflow name: Map<name, Map<requiredBy, versionRange>> */
	versionRequirements: Map<string, Map<string, string>>;

	/** Current resolution context */
	context?: ResolutionContext;
}

/**
 * Result of cycle detection.
 */
interface CycleDetectionResult {
	/** Whether a cycle was detected */
	hasCycle: boolean;

	/** The path forming the cycle (if detected) */
	cyclePath?: string[];
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default maximum depth for dependency resolution.
 */
const DEFAULT_MAX_DEPTH = 100;

// ============================================================================
// DependencyGraphBuilder Class
// ============================================================================

/**
 * Builder for workflow dependency graphs.
 *
 * Resolves all transitive dependencies, detects cycles, and provides
 * a topologically sorted load order for workflow execution.
 *
 * @example
 * ```typescript
 * const builder = new DependencyGraphBuilder(resolver);
 *
 * // Build a dependency graph
 * const result = await builder.buildGraph("my-workflow@^1.0.0");
 *
 * if (result._tag === "ok") {
 *   for (const name of result.value.loadOrder) {
 *     console.log(`Load: ${name}`);
 *   }
 * }
 * ```
 */
export class DependencyGraphBuilder {
	private readonly resolver: WorkflowResolver;
	private readonly cache: ResolutionCache | undefined;
	private readonly maxDepth: number;

	/**
	 * Create a new DependencyGraphBuilder.
	 *
	 * @param resolver - Workflow resolver for resolving dependencies
	 * @param options - Builder configuration options
	 */
	constructor(resolver: WorkflowResolver, options: GraphBuilderOptions = {}) {
		this.resolver = resolver;
		this.cache = options.cache;
		this.maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
	}

	// ============================================================================
	// Public Methods
	// ============================================================================

	/**
	 * Build a complete dependency graph for a workflow.
	 *
	 * Resolves all transitive dependencies, detects cycles, checks for
	 * version conflicts, and returns a topologically sorted load order.
	 *
	 * @param reference - The root workflow reference (string or object)
	 * @param context - Optional resolution context
	 * @returns Result with dependency graph or error
	 *
	 * @example
	 * ```typescript
	 * const result = await builder.buildGraph("my-workflow@^1.0.0");
	 * if (result._tag === "ok") {
	 *   console.log("Root:", result.value.root.version);
	 *   console.log("Dependencies:", result.value.dependencies.size);
	 *   console.log("Load order:", result.value.loadOrder.join(" -> "));
	 * } else {
	 *   console.error("Failed:", result.error.message);
	 *   if (result.error.cyclePath) {
	 *     console.error("Cycle:", result.error.cyclePath.join(" -> "));
	 *   }
	 * }
	 * ```
	 */
	async buildGraph(
		reference: string | WorkflowReference,
		context?: ResolutionContext,
	): Promise<DependencyGraphResult> {
		// Check cache first
		if (this.cache && !context?.noCache) {
			const cached = this.cache.getGraph(reference, {
				cwd: context?.cwd,
				includePrerelease: context?.includePrerelease,
			});
			if (cached) {
				return { _tag: "ok", value: cached };
			}
		}

		// Normalize reference
		const normalizedResult = normalizeReference(reference);
		if (normalizedResult._tag === "err") {
			return normalizedResult;
		}
		const ref = normalizedResult.value;

		// Resolve root workflow
		const rootResult = await this.resolver.resolve(ref, context);
		if (rootResult._tag === "err") {
			return rootResult;
		}
		const root = rootResult.value;

		// Initialize state for graph building
		const state: GraphBuildState = {
			resolved: new Map([[root.metadata.name, root]]),
			edges: [],
			versionRequirements: new Map(),
			context,
		};

		// Recursively resolve all dependencies
		const resolutionResult = await this.resolveDependencies(
			root,
			state,
			0,
			new Set([root.metadata.name]),
		);
		if (resolutionResult._tag === "err") {
			return resolutionResult;
		}

		// Detect cycles
		const cycleResult = this.detectCycles(state);
		if (cycleResult.hasCycle && cycleResult.cyclePath) {
			return this.createCycleError(ref, cycleResult.cyclePath);
		}

		// Check for version conflicts
		const conflictResult = this.detectVersionConflicts(state);
		if (conflictResult.length > 0) {
			return this.createConflictError(ref, conflictResult);
		}

		// Compute topological sort for load order
		const loadOrder = this.topologicalSort(state);

		// Build final dependency graph
		const dependencies = new Map<string, ResolvedWorkflow>();
		for (const [name, resolved] of state.resolved) {
			if (name !== root.metadata.name) {
				dependencies.set(name, resolved);
			}
		}

		const graph: DependencyGraph = {
			root,
			dependencies,
			edges: state.edges,
			loadOrder,
		};

		// Cache the result
		if (this.cache && !context?.noCache) {
			this.cache.setGraph(reference, graph, {
				context: {
					cwd: context?.cwd,
					includePrerelease: context?.includePrerelease,
				},
			});
		}

		return { _tag: "ok", value: graph };
	}

	/**
	 * Check if a workflow has any dependencies.
	 *
	 * @param reference - The workflow reference to check
	 * @param context - Optional resolution context
	 * @returns True if the workflow has dependencies
	 */
	async hasDependencies(
		reference: string | WorkflowReference,
		context?: ResolutionContext,
	): Promise<boolean> {
		const resolveResult = await this.resolver.resolve(reference, context);
		if (resolveResult._tag === "err") {
			return false;
		}

		const deps = resolveResult.value.metadata.dependencies;
		return deps !== undefined && Object.keys(deps).length > 0;
	}

	/**
	 * Get the direct dependencies of a workflow (not transitive).
	 *
	 * @param reference - The workflow reference
	 * @param context - Optional resolution context
	 * @returns Result with array of resolved direct dependencies
	 */
	async getDirectDependencies(
		reference: string | WorkflowReference,
		context?: ResolutionContext,
	): Promise<Result<ResolvedWorkflow[], ResolutionError>> {
		const resolveResult = await this.resolver.resolve(reference, context);
		if (resolveResult._tag === "err") {
			return resolveResult;
		}

		const metadata = resolveResult.value.metadata;
		if (!metadata.dependencies) {
			return { _tag: "ok", value: [] };
		}

		const dependencies: ResolvedWorkflow[] = [];
		const errors: ResolutionError[] = [];

		for (const [name, versionRange] of Object.entries(metadata.dependencies)) {
			const depResult = await this.resolver.resolve(
				{ name, version: versionRange },
				context,
			);
			if (depResult._tag === "err") {
				errors.push(depResult.error);
			} else {
				dependencies.push(depResult.value);
			}
		}

		// If there are errors, return the first one
		// In a future enhancement, we could aggregate all missing deps
		if (errors.length > 0) {
			return { _tag: "err", error: errors[0] };
		}

		return { _tag: "ok", value: dependencies };
	}

	// ============================================================================
	// Private Resolution Methods
	// ============================================================================

	/**
	 * Recursively resolve all dependencies for a workflow.
	 *
	 * @param workflow - The workflow to resolve dependencies for
	 * @param state - Current graph building state
	 * @param depth - Current recursion depth
	 * @param visited - Set of workflows currently being visited (for cycle detection)
	 * @returns Result indicating success or error
	 */
	private async resolveDependencies(
		workflow: ResolvedWorkflow,
		state: GraphBuildState,
		depth: number,
		visited: Set<string>,
	): Promise<Result<void, ResolutionError>> {
		// Check depth limit
		if (depth > this.maxDepth) {
			const error: ResolutionError = {
				code: RESOLUTION_ERROR_CODES.CIRCULAR_DEPENDENCY,
				message: `Maximum dependency depth (${this.maxDepth}) exceeded. This may indicate circular dependencies.`,
				reference: workflow.reference,
				suggestions: [
					"Check for circular dependencies in your workflow packages",
					"Simplify your dependency tree",
				],
			};
			return { _tag: "err", error };
		}

		const deps = workflow.metadata.dependencies;
		if (!deps) {
			return { _tag: "ok", value: undefined };
		}

		// Process each dependency
		for (const [depName, versionRange] of Object.entries(deps)) {
			// Record version requirement
			if (!state.versionRequirements.has(depName)) {
				state.versionRequirements.set(depName, new Map());
			}
			const reqMap = state.versionRequirements.get(depName);
			if (reqMap) {
				reqMap.set(workflow.metadata.name, versionRange);
			}

			// Add edge
			state.edges.push({
				from: workflow.metadata.name,
				to: depName,
				versionRange,
			});

			// Check for cycle during resolution (visited set)
			if (visited.has(depName)) {
				// This is a cycle - will be detected properly by detectCycles()
				continue;
			}

			// Check if already resolved
			const existing = state.resolved.get(depName);
			if (existing) {
				// Already resolved - no need to recurse again
				continue;
			}

			// Resolve the dependency
			const depResult = await this.resolver.resolve(
				{ name: depName, version: versionRange },
				state.context,
			);
			if (depResult._tag === "err") {
				return depResult;
			}

			const resolvedDep = depResult.value;
			state.resolved.set(depName, resolvedDep);

			// Recursively resolve transitive dependencies
			const newVisited = new Set(visited);
			newVisited.add(depName);

			const transitiveResult = await this.resolveDependencies(
				resolvedDep,
				state,
				depth + 1,
				newVisited,
			);
			if (transitiveResult._tag === "err") {
				return transitiveResult;
			}
		}

		return { _tag: "ok", value: undefined };
	}

	// ============================================================================
	// Cycle Detection
	// ============================================================================

	/**
	 * Detect cycles in the dependency graph using DFS with three-state coloring.
	 *
	 * Uses the standard algorithm:
	 * - WHITE (0): Node not visited
	 * - GRAY (1): Node being processed (in current DFS path)
	 * - BLACK (2): Node fully processed
	 *
	 * A cycle is detected when we encounter a GRAY node during DFS.
	 *
	 * @param state - Current graph building state
	 * @returns Cycle detection result with path if cycle found
	 */
	private detectCycles(state: GraphBuildState): CycleDetectionResult {
		// Build adjacency list from edges
		const adjacencyList = new Map<string, string[]>();
		for (const resolved of state.resolved.keys()) {
			adjacencyList.set(resolved, []);
		}
		for (const edge of state.edges) {
			const neighbors = adjacencyList.get(edge.from);
			if (neighbors) {
				neighbors.push(edge.to);
			}
		}

		// Three-state coloring
		const WHITE = 0;
		const GRAY = 1;
		const BLACK = 2;

		const color = new Map<string, number>();
		for (const name of state.resolved.keys()) {
			color.set(name, WHITE);
		}

		/**
		 * DFS helper that returns cycle path if found.
		 */
		const dfs = (node: string, path: string[]): string[] | null => {
			const nodeColor = color.get(node);

			// If node is GRAY, we found a cycle
			if (nodeColor === GRAY) {
				const cycleStart = path.indexOf(node);
				return [...path.slice(cycleStart), node];
			}

			// If node is BLACK, skip (already fully processed)
			if (nodeColor === BLACK) {
				return null;
			}

			// Mark as GRAY (being processed)
			color.set(node, GRAY);
			path.push(node);

			// Visit neighbors
			const neighbors = adjacencyList.get(node) ?? [];
			for (const neighbor of neighbors) {
				// Only visit if node exists in the graph
				if (state.resolved.has(neighbor)) {
					const cyclePath = dfs(neighbor, path);
					if (cyclePath) {
						return cyclePath;
					}
				}
			}

			// Mark as BLACK (fully processed)
			color.set(node, BLACK);
			path.pop();

			return null;
		};

		// Run DFS from each unvisited node
		for (const name of state.resolved.keys()) {
			if (color.get(name) === WHITE) {
				const cyclePath = dfs(name, []);
				if (cyclePath) {
					return { hasCycle: true, cyclePath };
				}
			}
		}

		return { hasCycle: false };
	}

	// ============================================================================
	// Version Conflict Detection
	// ============================================================================

	/**
	 * Detect version conflicts in the resolved dependencies.
	 *
	 * A conflict occurs when a resolved version doesn't satisfy
	 * one of the version requirements.
	 *
	 * @param state - Current graph building state
	 * @returns Array of version conflicts
	 */
	private detectVersionConflicts(state: GraphBuildState): VersionConflict[] {
		const conflicts: VersionConflict[] = [];

		for (const [depName, requirements] of state.versionRequirements) {
			const resolved = state.resolved.get(depName);
			if (!resolved) {
				continue;
			}

			const resolvedVersion = resolved.version;

			for (const [requiredBy, versionRange] of requirements) {
				if (!satisfies(resolvedVersion, versionRange)) {
					conflicts.push({
						workflow: requiredBy,
						required: versionRange,
						resolved: resolvedVersion,
					});
				}
			}
		}

		return conflicts;
	}

	// ============================================================================
	// Topological Sort
	// ============================================================================

	/**
	 * Compute topological sort of the dependency graph.
	 *
	 * Returns workflows in the order they should be loaded,
	 * with dependencies before dependents.
	 *
	 * Uses Kahn's algorithm for topological sorting.
	 *
	 * @param state - Current graph building state
	 * @returns Array of workflow names in load order
	 */
	private topologicalSort(state: GraphBuildState): string[] {
		// Build adjacency list and in-degree count
		const inDegree = new Map<string, number>();
		const adjacencyList = new Map<string, string[]>();

		// Initialize
		for (const name of state.resolved.keys()) {
			inDegree.set(name, 0);
			adjacencyList.set(name, []);
		}

		// Build graph (edges go from dependents to dependencies)
		for (const edge of state.edges) {
			// edge.from depends on edge.to
			// In load order, edge.to should come before edge.from
			const neighbors = adjacencyList.get(edge.to);
			if (neighbors && state.resolved.has(edge.from)) {
				neighbors.push(edge.from);
				inDegree.set(edge.from, (inDegree.get(edge.from) ?? 0) + 1);
			}
		}

		// Kahn's algorithm
		const queue: string[] = [];
		const result: string[] = [];

		// Start with nodes that have no dependencies
		for (const [name, degree] of inDegree) {
			if (degree === 0) {
				queue.push(name);
			}
		}

		// Sort queue for deterministic output
		queue.sort();

		while (queue.length > 0) {
			const node = queue.shift();
			if (node === undefined) break;
			result.push(node);

			// Reduce in-degree of neighbors
			const neighbors = adjacencyList.get(node) ?? [];
			for (const neighbor of neighbors) {
				const newDegree = (inDegree.get(neighbor) ?? 0) - 1;
				inDegree.set(neighbor, newDegree);
				if (newDegree === 0) {
					queue.push(neighbor);
				}
			}

			// Sort to maintain determinism
			queue.sort();
		}

		return result;
	}

	// ============================================================================
	// Error Creation
	// ============================================================================

	/**
	 * Create a circular dependency error.
	 *
	 * @param reference - The original reference that was being resolved
	 * @param cyclePath - The path forming the cycle
	 * @returns Error result
	 */
	private createCycleError(
		reference: WorkflowReference,
		cyclePath: string[],
	): DependencyGraphResult {
		const error: ResolutionError = {
			code: RESOLUTION_ERROR_CODES.CIRCULAR_DEPENDENCY,
			message: `Circular dependency detected: ${cyclePath.join(" -> ")}`,
			reference,
			cyclePath,
			suggestions: [
				"Review the dependency chain to find where the cycle occurs",
				"Consider extracting shared code into a separate package",
				"Check if any dependency can be made optional or dev-only",
			],
		};
		return { _tag: "err", error };
	}

	/**
	 * Create a version conflict error.
	 *
	 * @param reference - The original reference that was being resolved
	 * @param conflicts - The detected version conflicts
	 * @returns Error result
	 */
	private createConflictError(
		reference: WorkflowReference,
		conflicts: VersionConflict[],
	): DependencyGraphResult {
		const conflictMessages = conflicts.map(
			(c) =>
				`"${c.workflow}" requires "${c.required}" but "${c.resolved}" was resolved`,
		);

		const error: ResolutionError = {
			code: RESOLUTION_ERROR_CODES.VERSION_CONFLICT,
			message: `Version conflicts detected:\n${conflictMessages.join("\n")}`,
			reference,
			conflicts,
			suggestions: [
				"Update version ranges to be compatible",
				"Use more flexible version ranges (e.g., ^1.0.0 instead of exact versions)",
				"Consider if the conflicting packages can be updated",
			],
		};
		return { _tag: "err", error };
	}
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new DependencyGraphBuilder instance.
 *
 * @param resolver - Workflow resolver for resolving dependencies
 * @param options - Builder configuration options
 * @returns A new DependencyGraphBuilder
 *
 * @example
 * ```typescript
 * import { createResolver } from "./resolver.ts";
 * import { createDependencyGraphBuilder } from "./graph.ts";
 *
 * const resolver = createResolver();
 * const graphBuilder = createDependencyGraphBuilder(resolver);
 *
 * // Build a graph
 * const result = await graphBuilder.buildGraph("my-workflow@^1.0.0");
 * ```
 */
export function createDependencyGraphBuilder(
	resolver: WorkflowResolver,
	options?: GraphBuilderOptions,
): DependencyGraphBuilder {
	return new DependencyGraphBuilder(resolver, options);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a dependency graph has any external dependencies.
 *
 * @param graph - The dependency graph to check
 * @returns True if the graph has any dependencies besides the root
 *
 * @example
 * ```typescript
 * if (hasExternalDependencies(graph)) {
 *   console.log("This workflow has dependencies");
 * }
 * ```
 */
export function hasExternalDependencies(graph: DependencyGraph): boolean {
	return graph.dependencies.size > 0;
}

/**
 * Get all dependency names from a graph (not including root).
 *
 * @param graph - The dependency graph
 * @returns Array of dependency names
 *
 * @example
 * ```typescript
 * const deps = getDependencyNames(graph);
 * console.log("Dependencies:", deps.join(", "));
 * ```
 */
export function getDependencyNames(graph: DependencyGraph): string[] {
	return Array.from(graph.dependencies.keys());
}

/**
 * Get the depth of a dependency in the graph.
 *
 * The depth is the minimum number of edges from the root to reach
 * the dependency.
 *
 * @param graph - The dependency graph
 * @param name - The dependency name to find depth for
 * @returns The depth (0 for root, -1 if not found)
 *
 * @example
 * ```typescript
 * const depth = getDependencyDepth(graph, "utils");
 * console.log(`"utils" is at depth ${depth}`);
 * ```
 */
export function getDependencyDepth(
	graph: DependencyGraph,
	name: string,
): number {
	if (name === graph.root.metadata.name) {
		return 0;
	}

	if (!graph.dependencies.has(name)) {
		return -1;
	}

	// BFS to find shortest path from root
	const visited = new Set<string>();
	const queue: { node: string; depth: number }[] = [
		{ node: graph.root.metadata.name, depth: 0 },
	];

	// Build adjacency list from edges
	const adjacencyList = new Map<string, string[]>();
	for (const edge of graph.edges) {
		if (!adjacencyList.has(edge.from)) {
			adjacencyList.set(edge.from, []);
		}
		const adjList = adjacencyList.get(edge.from);
		if (adjList) {
			adjList.push(edge.to);
		}
	}

	while (queue.length > 0) {
		const item = queue.shift();
		if (!item) break;
		const { node, depth } = item;

		if (visited.has(node)) {
			continue;
		}
		visited.add(node);

		if (node === name) {
			return depth;
		}

		const neighbors = adjacencyList.get(node) ?? [];
		for (const neighbor of neighbors) {
			if (!visited.has(neighbor)) {
				queue.push({ node: neighbor, depth: depth + 1 });
			}
		}
	}

	return -1;
}

/**
 * Format a dependency graph as a human-readable tree string.
 *
 * @param graph - The dependency graph to format
 * @returns Formatted string representation
 *
 * @example
 * ```typescript
 * console.log(formatDependencyTree(graph));
 * // my-workflow@1.0.0
 * // ├── utils@2.0.0
 * // │   └── common@1.0.0
 * // └── helpers@1.5.0
 * ```
 */
export function formatDependencyTree(graph: DependencyGraph): string {
	const lines: string[] = [];

	// Build adjacency list
	const adjacencyList = new Map<string, string[]>();
	for (const edge of graph.edges) {
		if (!adjacencyList.has(edge.from)) {
			adjacencyList.set(edge.from, []);
		}
		const adjList = adjacencyList.get(edge.from);
		if (adjList) {
			adjList.push(edge.to);
		}
	}

	/**
	 * Recursive helper to build tree string.
	 */
	const buildTree = (
		node: string,
		prefix: string,
		isLast: boolean,
		visited: Set<string>,
	): void => {
		const resolved =
			node === graph.root.metadata.name
				? graph.root
				: graph.dependencies.get(node);

		if (!resolved) {
			return;
		}

		const version = resolved.version;
		const connector = prefix.length === 0 ? "" : isLast ? "└── " : "├── ";
		lines.push(`${prefix}${connector}${node}@${version}`);

		// Check for cycle
		if (visited.has(node)) {
			const childPrefix = prefix + (isLast ? "    " : "│   ");
			lines.push(`${childPrefix}(circular reference)`);
			return;
		}

		const newVisited = new Set(visited);
		newVisited.add(node);

		const children = adjacencyList.get(node) ?? [];
		const childPrefix =
			prefix + (prefix.length === 0 ? "" : isLast ? "    " : "│   ");

		for (let i = 0; i < children.length; i++) {
			const child = children[i];
			const isChildLast = i === children.length - 1;
			buildTree(child, childPrefix, isChildLast, newVisited);
		}
	};

	buildTree(graph.root.metadata.name, "", true, new Set());

	return lines.join("\n");
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a value is a valid DependencyGraph.
 *
 * @param value - Value to check
 * @returns True if value matches DependencyGraph structure
 *
 * @example
 * ```typescript
 * if (isDependencyGraph(result)) {
 *   console.log("Load order:", result.loadOrder);
 * }
 * ```
 */
export function isDependencyGraph(value: unknown): value is DependencyGraph {
	if (!value || typeof value !== "object") {
		return false;
	}

	const obj = value as Record<string, unknown>;

	return (
		"root" in obj &&
		obj.root !== null &&
		typeof obj.root === "object" &&
		"dependencies" in obj &&
		obj.dependencies instanceof Map &&
		"edges" in obj &&
		Array.isArray(obj.edges) &&
		"loadOrder" in obj &&
		Array.isArray(obj.loadOrder)
	);
}

/**
 * Type guard to check if a value is a valid DependencyEdge.
 *
 * @param value - Value to check
 * @returns True if value matches DependencyEdge structure
 */
export function isDependencyEdge(value: unknown): value is DependencyEdge {
	if (!value || typeof value !== "object") {
		return false;
	}

	const obj = value as Record<string, unknown>;

	return (
		typeof obj.from === "string" &&
		typeof obj.to === "string" &&
		typeof obj.versionRange === "string"
	);
}
