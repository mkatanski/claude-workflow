/**
 * Workflow registry and resolution module.
 *
 * This module provides components for resolving workflow references to their
 * physical locations with support for:
 * - Three-tier resolution precedence (project-local → project-installed → global)
 * - Semver version matching with ranges
 * - Dependency graph building with cycle detection
 * - Resolution caching with configurable TTL
 * - Configuration via `.cw/config.ts` files
 *
 * The main entry point is {@link createWorkflowRegistry} which provides a unified
 * API for all registry operations.
 *
 * @example
 * ```typescript
 * import {
 *   createWorkflowRegistry,
 *   parseReference,
 *   maxSatisfying,
 *   isOk,
 * } from "./registry";
 *
 * // Create a registry
 * const result = await createWorkflowRegistry();
 * if (isOk(result)) {
 *   const registry = result.value;
 *
 *   // Resolve a workflow
 *   const resolved = await registry.resolve("planning@^1.0.0");
 *
 *   // Get dependency graph
 *   const graph = await registry.resolveDependencies("my-workflow");
 *
 *   // List available workflows
 *   const workflows = await registry.list({ scope: "project" });
 * }
 * ```
 */

// ============================================================================
// Type Definitions
// ============================================================================

// Types from cache.ts
export type {
	CacheEntry,
	CacheOptions,
	CacheStats,
	EvictionReason,
} from "./cache.ts";

// Types from config.ts
export type {
	ConfigError,
	ConfigErrorCode,
	ConfigLoader,
	LoadedConfig,
	PathConfig,
	RegistryConfig,
	ResolutionConfig,
	ResolutionOverride,
	ResolvedPaths,
} from "./config.ts";
// Types from graph.ts
export type { GraphBuilderOptions } from "./graph.ts";
// Types from reference.ts
export type { ParseReferenceResult } from "./reference.ts";
// Types from registry.ts
export type {
	RegistryOptions,
	WorkflowRegistry,
} from "./registry.ts";
// Types from resolver.ts
export type {
	ResolverOptions,
	WorkflowResolver,
} from "./resolver.ts";
// Types from types.ts
export type {
	DependencyEdge,
	DependencyGraph,
	DependencyGraphResult,
	InstalledVersion,
	ListOptions,
	ResolutionContext,
	ResolutionError,
	ResolutionErrorCode,
	ResolutionSource,
	ResolvedWorkflow,
	ResolveResult,
	SourcePrefix,
	VersionConflict,
	WorkflowListEntry,
	WorkflowReference,
} from "./types.ts";

// ============================================================================
// Type Guards and Constants
// ============================================================================

// Type guards and constants from cache.ts
export {
	DEFAULT_TTL,
	EVICTION_REASONS,
	isCacheEntry,
	isCacheOptions,
} from "./cache.ts";

// Type guards and constants from config.ts
export {
	CONFIG_ERROR_CODES,
	isRegistryConfig,
	isResolutionOverride,
} from "./config.ts";
// Type guards from graph.ts
export {
	isDependencyEdge,
	isDependencyGraph,
} from "./graph.ts";
// Type guards from registry.ts
export {
	isRegistryOptions,
	isWorkflowRegistry,
} from "./registry.ts";
// Type guards and constants from types.ts
export {
	isResolutionError,
	isWorkflowReference,
	RESOLUTION_ERROR_CODES,
} from "./types.ts";

// ============================================================================
// Reference Parsing
// ============================================================================

// Reference parsing functions
export {
	formatReference,
	normalizeReference,
	parseReference,
} from "./reference.ts";

// ============================================================================
// Version Utilities
// ============================================================================

// Semver version utilities
export {
	compareVersions,
	filterSatisfying,
	filterStableVersions,
	getLatestVersion,
	isEqual,
	isGreaterThan,
	isGreaterThanOrEqual,
	isLessThan,
	isLessThanOrEqual,
	isPrerelease,
	isValidVersion,
	maxSatisfying,
	minSatisfying,
	satisfies,
	sortVersionsAscending,
	sortVersionsDescending,
} from "./version.ts";

// ============================================================================
// Configuration
// ============================================================================

// Configuration loader
// Configuration utilities
export {
	createConfigLoader,
	getDefaultConfig,
	getDefaultPaths,
	getGlobalWorkflowsPath,
	getOverride,
	getProjectRoot,
	hasOverride,
	loadConfig,
	loadGlobalConfig,
	loadProjectConfig,
	mergeConfigs,
	resolvePaths,
	validateConfig,
} from "./config.ts";

// ============================================================================
// Resolution Cache
// ============================================================================

// Resolution cache
// Cache utilities
export {
	createResolutionCache,
	generateCacheKey,
	generateGraphCacheKey,
	getEntryAge,
	getRemainingTTL,
	isExpired,
	ResolutionCache,
} from "./cache.ts";

// ============================================================================
// Workflow Resolver
// ============================================================================

// Resolver factory functions
export {
	createResolver,
	createResolverWithConfig,
} from "./resolver.ts";

// ============================================================================
// Dependency Graph Builder
// ============================================================================

// Graph builder
// Graph utilities
export {
	createDependencyGraphBuilder,
	DependencyGraphBuilder,
	formatDependencyTree,
	getDependencyDepth,
	getDependencyNames,
	hasExternalDependencies,
} from "./graph.ts";

// ============================================================================
// Registry Service (Main Entry Point)
// ============================================================================

// Registry factory functions
export {
	createWorkflowRegistry,
	createWorkflowRegistrySync,
	createWorkflowRegistryWithConfig,
} from "./registry.ts";
