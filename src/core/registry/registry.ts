/**
 * Workflow registry service implementation.
 *
 * This module provides the main WorkflowRegistry service that combines all
 * registry components into a unified facade for:
 * - Resolving workflow references to their physical locations
 * - Building dependency graphs with transitive resolution
 * - Listing available workflows with filtering
 * - Checking workflow existence
 * - Managing installed versions
 *
 * The registry is the primary entry point for workflow resolution and should
 * be used instead of directly accessing the resolver, graph builder, or cache.
 *
 * @example
 * ```typescript
 * import { createWorkflowRegistry } from "./registry.ts";
 * import { isOk } from "../utils/result/result.ts";
 *
 * // Create a registry with default configuration
 * const result = await createWorkflowRegistry();
 * if (isOk(result)) {
 *   const registry = result.value;
 *
 *   // Resolve a workflow reference
 *   const resolved = await registry.resolve("planning@^1.0.0");
 *   if (isOk(resolved)) {
 *     console.log("Found at:", resolved.value.path);
 *   }
 *
 *   // Get dependency graph
 *   const graph = await registry.resolveDependencies("my-workflow");
 *   if (isOk(graph)) {
 *     console.log("Load order:", graph.value.loadOrder.join(" -> "));
 *   }
 *
 *   // List available workflows
 *   const workflows = await registry.list({ scope: "project" });
 *   for (const wf of workflows) {
 *     console.log(`${wf.name}@${wf.latestVersion}`);
 *   }
 * }
 * ```
 */

import type { Result } from "../utils/result/result.ts";
import {
	type CacheOptions,
	type CacheStats,
	createResolutionCache,
	type ResolutionCache,
} from "./cache.ts";
import type { LoadedConfig, RegistryConfig, ResolvedPaths } from "./config.ts";
import { getDefaultConfig, getDefaultPaths, loadConfig } from "./config.ts";
import {
	createDependencyGraphBuilder,
	type DependencyGraphBuilder,
	type GraphBuilderOptions,
} from "./graph.ts";
import {
	createResolver,
	type ResolverOptions,
	type WorkflowResolver,
} from "./resolver.ts";
import type {
	DependencyGraphResult,
	InstalledVersion,
	ListOptions,
	ResolutionContext,
	ResolutionError,
	ResolveResult,
	WorkflowListEntry,
	WorkflowReference,
} from "./types.ts";
import { RESOLUTION_ERROR_CODES } from "./types.ts";

// ============================================================================
// Registry Options
// ============================================================================

/**
 * Options for creating a WorkflowRegistry.
 *
 * @example
 * ```typescript
 * const options: RegistryOptions = {
 *   cwd: "/path/to/project",
 *   cacheOptions: {
 *     defaultTTL: 60000, // 1 minute
 *     maxEntries: 500
 *   },
 *   enableCache: true
 * };
 *
 * const result = await createWorkflowRegistry(options);
 * ```
 */
export interface RegistryOptions {
	/**
	 * Current working directory for project resolution.
	 *
	 * If not specified, uses `process.cwd()`.
	 */
	cwd?: string;

	/**
	 * Pre-loaded configuration to use instead of loading from files.
	 *
	 * If provided, skips loading configuration from `.cw/config.ts` files.
	 */
	config?: LoadedConfig;

	/**
	 * Options for the resolution cache.
	 *
	 * See {@link CacheOptions} for available settings.
	 */
	cacheOptions?: CacheOptions;

	/**
	 * Whether to enable caching.
	 *
	 * When disabled, each resolution performs fresh filesystem lookups.
	 * @default true
	 */
	enableCache?: boolean;

	/**
	 * Maximum depth for dependency resolution.
	 *
	 * Prevents infinite recursion in case of errors.
	 * @default 100
	 */
	maxDependencyDepth?: number;
}

// ============================================================================
// Registry Interface
// ============================================================================

/**
 * Main workflow registry service interface.
 *
 * Provides a unified API for resolving workflows, building dependency graphs,
 * and listing available workflows. This is the primary interface for interacting
 * with the registry system.
 *
 * @example
 * ```typescript
 * // Using the registry
 * const registry: WorkflowRegistry = ...;
 *
 * // Resolve a single workflow
 * const result = await registry.resolve("my-workflow@^1.0.0");
 *
 * // Get all dependencies with load order
 * const graph = await registry.resolveDependencies("my-workflow");
 *
 * // List available workflows
 * const workflows = await registry.list({ scope: "project" });
 *
 * // Check if a workflow exists
 * if (await registry.exists("planning")) {
 *   console.log("Workflow is available");
 * }
 * ```
 */
export interface WorkflowRegistry {
	/**
	 * Resolve a workflow reference to its physical location.
	 *
	 * Follows the resolution order:
	 * 1. Project-local (`.cw/workflows/`)
	 * 2. Project-installed (`.cw/workflows/.installed/`)
	 * 3. Global (`~/.cw/workflows/`)
	 *
	 * Source prefixes (`project:`, `global:`) bypass this order.
	 *
	 * @param reference - Workflow reference string or object
	 * @param context - Optional resolution context
	 * @returns Result containing resolved workflow or error
	 *
	 * @example
	 * ```typescript
	 * // Simple resolution
	 * const result = await registry.resolve("planning");
	 *
	 * // With version range
	 * const result = await registry.resolve("planning@^1.0.0");
	 *
	 * // With export
	 * const result = await registry.resolve("tools:refactor");
	 *
	 * // From specific source
	 * const result = await registry.resolve("global:shared-utils");
	 *
	 * // With context
	 * const result = await registry.resolve("planning", {
	 *   noCache: true,
	 *   includePrerelease: true
	 * });
	 * ```
	 */
	resolve(
		reference: string | WorkflowReference,
		context?: ResolutionContext,
	): Promise<ResolveResult>;

	/**
	 * Build a complete dependency graph for a workflow.
	 *
	 * Resolves all transitive dependencies, detects cycles, checks for
	 * version conflicts, and returns a topologically sorted load order.
	 *
	 * @param reference - Root workflow reference string or object
	 * @param context - Optional resolution context
	 * @returns Result containing dependency graph or error
	 *
	 * @example
	 * ```typescript
	 * const result = await registry.resolveDependencies("my-workflow@^1.0.0");
	 *
	 * if (isOk(result)) {
	 *   const graph = result.value;
	 *   console.log("Root:", graph.root.metadata.name);
	 *   console.log("Dependencies:", graph.dependencies.size);
	 *   console.log("Load order:", graph.loadOrder.join(" -> "));
	 *
	 *   // Check for cycles in error
	 * } else if (result.error.code === "CIRCULAR_DEPENDENCY") {
	 *   console.error("Cycle detected:", result.error.cyclePath?.join(" -> "));
	 * }
	 * ```
	 */
	resolveDependencies(
		reference: string | WorkflowReference,
		context?: ResolutionContext,
	): Promise<DependencyGraphResult>;

	/**
	 * List available workflows with optional filtering.
	 *
	 * @param options - Listing options for filtering results
	 * @returns Array of workflow list entries
	 *
	 * @example
	 * ```typescript
	 * // List all workflows
	 * const all = await registry.list();
	 *
	 * // List project workflows only
	 * const project = await registry.list({ scope: "project" });
	 *
	 * // List global workflows only
	 * const global = await registry.list({ scope: "global" });
	 *
	 * // Filter by keyword
	 * const tagged = await registry.list({ keyword: "deployment" });
	 *
	 * // Filter by name pattern
	 * const scoped = await registry.list({ pattern: "@myorg/*" });
	 * ```
	 */
	list(options?: ListOptions): Promise<WorkflowListEntry[]>;

	/**
	 * Check if a workflow exists and can be resolved.
	 *
	 * @param reference - Workflow reference string or object
	 * @param context - Optional resolution context
	 * @returns True if the workflow exists
	 *
	 * @example
	 * ```typescript
	 * if (await registry.exists("planning")) {
	 *   console.log("Workflow is available");
	 * }
	 *
	 * // Check specific version
	 * if (await registry.exists("planning@^2.0.0")) {
	 *   console.log("Version 2.x is available");
	 * }
	 * ```
	 */
	exists(
		reference: string | WorkflowReference,
		context?: ResolutionContext,
	): Promise<boolean>;

	/**
	 * Get all installed versions of a workflow.
	 *
	 * Returns versions from all sources (project, project-installed, global).
	 *
	 * @param name - Workflow package name
	 * @returns Array of installed version information
	 *
	 * @example
	 * ```typescript
	 * const versions = await registry.getVersions("planning");
	 *
	 * for (const v of versions) {
	 *   console.log(`${v.version} (${v.source}): ${v.path}`);
	 * }
	 * ```
	 */
	getVersions(name: string): Promise<InstalledVersion[]>;

	/**
	 * Refresh the registry by clearing all caches.
	 *
	 * Call this when the filesystem has changed and cached
	 * resolutions may be stale.
	 *
	 * @example
	 * ```typescript
	 * // After installing a new workflow
	 * await installWorkflow("planning@2.0.0");
	 * await registry.refresh();
	 *
	 * // Now resolution will find the new version
	 * const result = await registry.resolve("planning@^2.0.0");
	 * ```
	 */
	refresh(): Promise<void>;

	/**
	 * Get the resolved paths used by the registry.
	 *
	 * @returns Resolved filesystem paths for workflow locations
	 *
	 * @example
	 * ```typescript
	 * const paths = registry.getPaths();
	 * console.log("Project workflows:", paths.projectWorkflows);
	 * console.log("Global workflows:", paths.globalWorkflows);
	 * ```
	 */
	getPaths(): ResolvedPaths;

	/**
	 * Get the registry configuration.
	 *
	 * @returns The merged registry configuration
	 */
	getConfig(): RegistryConfig;

	/**
	 * Get cache statistics.
	 *
	 * Returns null if caching is disabled.
	 *
	 * @returns Cache statistics or null
	 *
	 * @example
	 * ```typescript
	 * const stats = registry.getCacheStats();
	 * if (stats) {
	 *   console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
	 *   console.log(`Size: ${stats.size} entries`);
	 * }
	 * ```
	 */
	getCacheStats(): CacheStats | null;

	/**
	 * Dispose of the registry and release resources.
	 *
	 * Stops cache cleanup timers and clears all cached data.
	 * The registry should not be used after calling dispose.
	 *
	 * @example
	 * ```typescript
	 * // When done using the registry
	 * registry.dispose();
	 * ```
	 */
	dispose(): void;
}

// ============================================================================
// Registry Implementation
// ============================================================================

/**
 * Implementation of the WorkflowRegistry interface.
 *
 * Combines resolver, graph builder, and cache into a unified service.
 */
class WorkflowRegistryImpl implements WorkflowRegistry {
	private readonly resolver: WorkflowResolver;
	private readonly graphBuilder: DependencyGraphBuilder;
	private readonly cache: ResolutionCache | null;
	private readonly loadedConfig: LoadedConfig;

	/**
	 * Create a new WorkflowRegistryImpl.
	 *
	 * @param loadedConfig - Loaded and merged configuration
	 * @param options - Registry options
	 */
	constructor(loadedConfig: LoadedConfig, options: RegistryOptions = {}) {
		this.loadedConfig = loadedConfig;
		const enableCache = options.enableCache !== false;

		// Create cache if enabled
		this.cache = enableCache
			? createResolutionCache(options.cacheOptions)
			: null;

		// Create resolver with configuration and cache
		const resolverOptions: ResolverOptions = {
			config: loadedConfig,
			cache: this.cache ?? undefined,
			cwd: options.cwd,
		};
		this.resolver = createResolver(resolverOptions);

		// Create graph builder with resolver and cache
		const graphBuilderOptions: GraphBuilderOptions = {
			cache: this.cache ?? undefined,
			maxDepth: options.maxDependencyDepth,
		};
		this.graphBuilder = createDependencyGraphBuilder(
			this.resolver,
			graphBuilderOptions,
		);
	}

	// ============================================================================
	// Main Resolution Methods
	// ============================================================================

	/**
	 * Resolve a workflow reference to its physical location.
	 */
	async resolve(
		reference: string | WorkflowReference,
		context?: ResolutionContext,
	): Promise<ResolveResult> {
		return this.resolver.resolve(reference, context);
	}

	/**
	 * Build a complete dependency graph for a workflow.
	 */
	async resolveDependencies(
		reference: string | WorkflowReference,
		context?: ResolutionContext,
	): Promise<DependencyGraphResult> {
		return this.graphBuilder.buildGraph(reference, context);
	}

	// ============================================================================
	// Query Methods
	// ============================================================================

	/**
	 * List available workflows with optional filtering.
	 */
	async list(options?: ListOptions): Promise<WorkflowListEntry[]> {
		return this.resolver.list(options);
	}

	/**
	 * Check if a workflow exists and can be resolved.
	 */
	async exists(
		reference: string | WorkflowReference,
		context?: ResolutionContext,
	): Promise<boolean> {
		return this.resolver.exists(reference, context);
	}

	/**
	 * Get all installed versions of a workflow.
	 */
	async getVersions(name: string): Promise<InstalledVersion[]> {
		return this.resolver.getVersions(name);
	}

	// ============================================================================
	// Cache & Configuration Methods
	// ============================================================================

	/**
	 * Refresh the registry by clearing all caches.
	 */
	async refresh(): Promise<void> {
		if (this.cache) {
			this.cache.refresh();
		}
		await this.resolver.refresh();
	}

	/**
	 * Get the resolved paths used by the registry.
	 */
	getPaths(): ResolvedPaths {
		return this.loadedConfig.resolvedPaths;
	}

	/**
	 * Get the registry configuration.
	 */
	getConfig(): RegistryConfig {
		return this.loadedConfig.config;
	}

	/**
	 * Get cache statistics.
	 */
	getCacheStats(): CacheStats | null {
		return this.cache?.getStats() ?? null;
	}

	/**
	 * Dispose of the registry and release resources.
	 */
	dispose(): void {
		if (this.cache) {
			this.cache.dispose();
		}
	}
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new WorkflowRegistry with automatic configuration loading.
 *
 * Loads configuration from `.cw/config.ts` (project) and `~/.cw/config.ts` (global),
 * then creates a registry with the merged configuration.
 *
 * @param options - Registry options
 * @returns Result containing the registry or configuration error
 *
 * @example
 * ```typescript
 * // Create with default options
 * const result = await createWorkflowRegistry();
 * if (isOk(result)) {
 *   const registry = result.value;
 *   // Use the registry...
 * }
 *
 * // Create with custom options
 * const result = await createWorkflowRegistry({
 *   cwd: "/path/to/project",
 *   cacheOptions: {
 *     defaultTTL: 60000 // 1 minute
 *   }
 * });
 *
 * // Create with caching disabled
 * const result = await createWorkflowRegistry({
 *   enableCache: false
 * });
 * ```
 */
export async function createWorkflowRegistry(
	options: RegistryOptions = {},
): Promise<Result<WorkflowRegistry, ResolutionError>> {
	// Use provided config or load from filesystem
	let loadedConfig: LoadedConfig;

	if (options.config) {
		loadedConfig = options.config;
	} else {
		const configResult = await loadConfig(options.cwd);

		if (configResult._tag === "err") {
			// Convert config error to resolution error
			const error: ResolutionError = {
				code: RESOLUTION_ERROR_CODES.PACKAGE_INVALID,
				message: `Configuration error: ${configResult.error.message}`,
				reference: { name: "<config>" },
				suggestions: configResult.error.suggestions,
			};
			return { _tag: "err", error };
		}

		loadedConfig = configResult.value;
	}

	// Create and return the registry
	const registry = new WorkflowRegistryImpl(loadedConfig, options);
	return { _tag: "ok", value: registry };
}

/**
 * Create a new WorkflowRegistry with default configuration (no config files).
 *
 * This is a synchronous alternative to `createWorkflowRegistry()` that
 * uses default paths and skips loading configuration files.
 *
 * @param options - Registry options
 * @returns A new WorkflowRegistry
 *
 * @example
 * ```typescript
 * // Create registry with defaults (synchronous)
 * const registry = createWorkflowRegistrySync();
 *
 * // Use immediately
 * const result = await registry.resolve("planning");
 * ```
 */
export function createWorkflowRegistrySync(
	options: RegistryOptions = {},
): WorkflowRegistry {
	const cwd = options.cwd ?? process.cwd();

	// Create default loaded config
	const loadedConfig: LoadedConfig = {
		config: getDefaultConfig(),
		resolvedPaths: getDefaultPaths(cwd),
	};

	return new WorkflowRegistryImpl(loadedConfig, options);
}

/**
 * Create a new WorkflowRegistry with a pre-loaded configuration.
 *
 * Use this when you've already loaded the configuration and want
 * to avoid loading it again.
 *
 * @param config - Pre-loaded configuration
 * @param options - Registry options (config field is ignored)
 * @returns A new WorkflowRegistry
 *
 * @example
 * ```typescript
 * // Load config manually
 * const configResult = await loadConfig("/path/to/project");
 * if (isOk(configResult)) {
 *   const registry = createWorkflowRegistryWithConfig(configResult.value);
 *   // Use the registry...
 * }
 * ```
 */
export function createWorkflowRegistryWithConfig(
	config: LoadedConfig,
	options: Omit<RegistryOptions, "config"> = {},
): WorkflowRegistry {
	return new WorkflowRegistryImpl(config, { ...options, config });
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a value is a valid WorkflowRegistry.
 *
 * @param value - Value to check
 * @returns True if value matches WorkflowRegistry interface
 *
 * @example
 * ```typescript
 * if (isWorkflowRegistry(maybeRegistry)) {
 *   const result = await maybeRegistry.resolve("planning");
 * }
 * ```
 */
export function isWorkflowRegistry(value: unknown): value is WorkflowRegistry {
	if (!value || typeof value !== "object") {
		return false;
	}

	const obj = value as Record<string, unknown>;

	return (
		typeof obj.resolve === "function" &&
		typeof obj.resolveDependencies === "function" &&
		typeof obj.list === "function" &&
		typeof obj.exists === "function" &&
		typeof obj.getVersions === "function" &&
		typeof obj.refresh === "function" &&
		typeof obj.getPaths === "function" &&
		typeof obj.getConfig === "function" &&
		typeof obj.dispose === "function"
	);
}

/**
 * Type guard to check if a value is valid RegistryOptions.
 *
 * @param value - Value to check
 * @returns True if value matches RegistryOptions structure
 */
export function isRegistryOptions(value: unknown): value is RegistryOptions {
	if (!value || typeof value !== "object") {
		return false;
	}

	const obj = value as Record<string, unknown>;

	// All properties are optional but must be correct type if present
	if (obj.cwd !== undefined && typeof obj.cwd !== "string") {
		return false;
	}
	if (obj.enableCache !== undefined && typeof obj.enableCache !== "boolean") {
		return false;
	}
	if (
		obj.maxDependencyDepth !== undefined &&
		typeof obj.maxDependencyDepth !== "number"
	) {
		return false;
	}
	if (
		obj.config !== undefined &&
		(typeof obj.config !== "object" || obj.config === null)
	) {
		return false;
	}
	if (
		obj.cacheOptions !== undefined &&
		(typeof obj.cacheOptions !== "object" || obj.cacheOptions === null)
	) {
		return false;
	}

	return true;
}
