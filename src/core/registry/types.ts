/**
 * Types for workflow registry and resolution.
 *
 * This module defines the structure for:
 * - Workflow reference parsing and resolution
 * - Resolution errors with contextual suggestions
 * - Dependency graphs for workflow composition
 * - Registry listing and filtering
 *
 * The registry service resolves workflow references (e.g., `planning@^1.0.0`)
 * to their physical locations, enabling versioned dependencies with semver support.
 */

import type { WorkflowPackageJson } from "../packages/types.ts";
import type { Result } from "../utils/result/result.ts";

// ============================================================================
// Resolution Source Types
// ============================================================================

/**
 * Source locations for workflow resolution.
 *
 * - `project`: Local workflows in `.cw/workflows/`
 * - `project-installed`: Installed workflows in `.cw/workflows/.installed/`
 * - `global`: Global workflows in `~/.cw/workflows/`
 */
export type ResolutionSource = "project" | "project-installed" | "global";

/**
 * Source prefix that can be specified in a workflow reference.
 *
 * When specified, bypasses the normal resolution order and resolves
 * directly from the specified source.
 *
 * - `project`: Resolve only from project-local workflows
 * - `global`: Resolve only from global workflows
 * - Custom string prefixes may be supported in the future
 */
export type SourcePrefix = "project" | "global" | string;

// ============================================================================
// Workflow Reference Types
// ============================================================================

/**
 * Parsed workflow reference.
 *
 * Represents a workflow reference string that has been parsed into its
 * constituent parts. Reference strings follow the format:
 * `[source:]name[@version][:export]`
 *
 * @example
 * ```typescript
 * // Simple name
 * const ref: WorkflowReference = { name: "planning" };
 *
 * // With version
 * const ref: WorkflowReference = { name: "planning", version: "^1.0.0" };
 *
 * // With export
 * const ref: WorkflowReference = { name: "tools", export: "refactor" };
 *
 * // Full reference
 * const ref: WorkflowReference = {
 *   name: "@myorg/deploy",
 *   version: "~2.0.0",
 *   export: "rollback",
 *   source: "global"
 * };
 * ```
 */
export interface WorkflowReference {
	/**
	 * Package name following npm naming conventions.
	 *
	 * Supports scoped packages (e.g., "@org/package-name").
	 */
	name: string;

	/**
	 * Semver version range (optional).
	 *
	 * Examples: "1.2.3", "^1.0.0", "~1.0.0", ">=1.0.0 <2.0.0"
	 * If omitted, resolves to the latest available version.
	 */
	version?: string;

	/**
	 * Named export within the package (optional).
	 *
	 * If omitted, uses the "default" export.
	 */
	export?: string;

	/**
	 * Source prefix to restrict resolution (optional).
	 *
	 * If specified, bypasses normal resolution order and resolves
	 * directly from the specified source.
	 */
	source?: SourcePrefix;
}

// ============================================================================
// Resolved Workflow Types
// ============================================================================

/**
 * Successfully resolved workflow with location and metadata.
 *
 * Contains all information needed to load and execute a workflow
 * after resolution.
 *
 * @example
 * ```typescript
 * const resolved: ResolvedWorkflow = {
 *   reference: { name: "planning", version: "^1.0.0" },
 *   path: "/home/user/.cw/workflows/planning@1.2.3",
 *   version: "1.2.3",
 *   source: "global",
 *   exportName: "default",
 *   metadata: {
 *     name: "planning",
 *     version: "1.2.3",
 *     main: "./index.ts"
 *   }
 * };
 * ```
 */
export interface ResolvedWorkflow {
	/** Original reference that was resolved */
	reference: WorkflowReference;

	/** Absolute path to the workflow package directory */
	path: string;

	/** Resolved semver version (exact, not range) */
	version: string;

	/** Source location where the workflow was found */
	source: ResolutionSource;

	/** Export name to use ("default" if not specified in reference) */
	exportName: string;

	/** Package metadata from package.json */
	metadata: WorkflowPackageJson;
}

// ============================================================================
// Resolution Error Types
// ============================================================================

/**
 * Error codes for resolution failures.
 *
 * Used to categorize and identify specific resolution errors.
 */
export type ResolutionErrorCode =
	| "WORKFLOW_NOT_FOUND" // No workflow found matching the reference
	| "VERSION_NOT_FOUND" // No version satisfies the requested range
	| "EXPORT_NOT_FOUND" // Named export does not exist in package
	| "CIRCULAR_DEPENDENCY" // Circular dependency detected in dependency graph
	| "VERSION_CONFLICT" // Incompatible version requirements
	| "INVALID_REFERENCE" // Reference string is malformed
	| "PACKAGE_INVALID"; // Package exists but failed validation

/**
 * Resolution error with context and suggestions.
 *
 * Provides detailed information about why resolution failed,
 * including available alternatives and suggestions for fixing.
 *
 * @example
 * ```typescript
 * const error: ResolutionError = {
 *   code: "VERSION_NOT_FOUND",
 *   message: 'No version of "planning" satisfies "^3.0.0"',
 *   reference: { name: "planning", version: "^3.0.0" },
 *   availableVersions: ["1.0.0", "1.2.0", "2.0.0"],
 *   suggestions: [
 *     'Try "planning@^2.0.0" for the latest major version',
 *     'Run "cw install planning@^3.0.0" to install newer versions'
 *   ]
 * };
 * ```
 */
export interface ResolutionError {
	/** Error code identifying the type of resolution failure */
	code: ResolutionErrorCode;

	/** Human-readable error message */
	message: string;

	/** Reference that failed to resolve */
	reference: WorkflowReference;

	/**
	 * Available versions for VERSION_NOT_FOUND errors.
	 *
	 * Lists all installed versions that could be selected
	 * with a different version range.
	 */
	availableVersions?: string[];

	/**
	 * Available exports for EXPORT_NOT_FOUND errors.
	 *
	 * Lists all exports in the package that could be used.
	 */
	availableExports?: string[];

	/**
	 * Suggestions for resolving the error.
	 *
	 * Human-readable suggestions for how to fix the error,
	 * such as alternative version ranges or installation commands.
	 */
	suggestions?: string[];

	/**
	 * Cycle path for CIRCULAR_DEPENDENCY errors.
	 *
	 * Lists the workflow names in the dependency cycle.
	 * For example: ["A", "B", "C", "A"]
	 */
	cyclePath?: string[];

	/**
	 * Conflicting requirements for VERSION_CONFLICT errors.
	 *
	 * Maps workflow names to their conflicting version requirements.
	 */
	conflicts?: VersionConflict[];
}

/**
 * Represents a version conflict between dependencies.
 *
 * Captures when multiple workflows require incompatible versions
 * of the same dependency.
 */
export interface VersionConflict {
	/** Name of the workflow with conflicting requirements */
	workflow: string;

	/** Required version range */
	required: string;

	/** Resolved version that doesn't satisfy the requirement */
	resolved: string;
}

// ============================================================================
// Dependency Graph Types
// ============================================================================

/**
 * Edge in the dependency graph.
 *
 * Represents a dependency relationship between two workflows.
 */
export interface DependencyEdge {
	/** Workflow that has the dependency */
	from: string;

	/** Workflow that is depended upon */
	to: string;

	/** Version range required by the dependent */
	versionRange: string;
}

/**
 * Complete dependency graph for a workflow.
 *
 * Contains all resolved dependencies, their relationships,
 * and the correct load order for execution.
 *
 * @example
 * ```typescript
 * const graph: DependencyGraph = {
 *   root: resolvedWorkflow,
 *   dependencies: new Map([
 *     ["utils", resolvedUtils],
 *     ["common", resolvedCommon]
 *   ]),
 *   edges: [
 *     { from: "root", to: "utils", versionRange: "^1.0.0" },
 *     { from: "utils", to: "common", versionRange: "^2.0.0" }
 *   ],
 *   loadOrder: ["common", "utils", "root"]
 * };
 * ```
 */
export interface DependencyGraph {
	/** The root workflow that was resolved */
	root: ResolvedWorkflow;

	/** Map of dependency names to their resolved workflows */
	dependencies: Map<string, ResolvedWorkflow>;

	/** Edges representing dependency relationships */
	edges: DependencyEdge[];

	/**
	 * Topologically sorted load order.
	 *
	 * Dependencies should be loaded in this order to ensure
	 * all prerequisites are available before dependent workflows.
	 */
	loadOrder: string[];
}

// ============================================================================
// Registry Listing Types
// ============================================================================

/**
 * Entry in the workflow listing.
 *
 * Represents a workflow that is available for resolution.
 */
export interface WorkflowListEntry {
	/** Package name */
	name: string;

	/** Available versions (sorted descending) */
	versions: string[];

	/** Latest version */
	latestVersion: string;

	/** Source location */
	source: ResolutionSource;

	/** Available exports */
	exports: string[];

	/** Package description (if available) */
	description?: string;

	/** Package keywords (if available) */
	keywords?: string[];
}

/**
 * Options for listing workflows.
 */
export interface ListOptions {
	/**
	 * Filter by source scope.
	 *
	 * - `"project"`: Only project-local and installed workflows
	 * - `"global"`: Only global workflows
	 * - `"all"`: All available workflows (default)
	 */
	scope?: "project" | "global" | "all";

	/**
	 * Filter by keyword.
	 *
	 * Matches against package keywords.
	 */
	keyword?: string;

	/**
	 * Filter by name pattern.
	 *
	 * Supports glob patterns (e.g., "@myorg/*").
	 */
	pattern?: string;
}

/**
 * Information about an installed version.
 */
export interface InstalledVersion {
	/** Semver version string */
	version: string;

	/** Source location */
	source: ResolutionSource;

	/** Absolute path to the package */
	path: string;
}

// ============================================================================
// Resolution Context Types
// ============================================================================

/**
 * Context for resolution operations.
 *
 * Allows customizing resolution behavior for specific operations.
 */
export interface ResolutionContext {
	/**
	 * Working directory for project-relative resolution.
	 *
	 * If not specified, uses the current working directory.
	 */
	cwd?: string;

	/**
	 * Skip cache and perform fresh resolution.
	 */
	noCache?: boolean;

	/**
	 * Include pre-release versions in resolution.
	 */
	includePrerelease?: boolean;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a value is a valid WorkflowReference.
 *
 * Validates that the value is an object with a required `name` field
 * and optional `version`, `export`, and `source` fields of correct types.
 *
 * @param value - Value to check
 * @returns True if value matches the WorkflowReference structure
 *
 * @example
 * ```typescript
 * const input = parseInput();
 * if (isWorkflowReference(input)) {
 *   console.log(input.name); // TypeScript knows input is WorkflowReference
 * }
 * ```
 */
export function isWorkflowReference(
	value: unknown,
): value is WorkflowReference {
	if (!value || typeof value !== "object") {
		return false;
	}

	const obj = value as Record<string, unknown>;

	// Required: name must be a string
	if (typeof obj.name !== "string") {
		return false;
	}

	// Optional: version must be a string if present
	if (obj.version !== undefined && typeof obj.version !== "string") {
		return false;
	}

	// Optional: export must be a string if present
	if (obj.export !== undefined && typeof obj.export !== "string") {
		return false;
	}

	// Optional: source must be a string if present
	if (obj.source !== undefined && typeof obj.source !== "string") {
		return false;
	}

	return true;
}

/**
 * Type guard to check if a value is a valid ResolutionError.
 *
 * Validates the error structure including required code, message, and reference.
 *
 * @param value - Value to check
 * @returns True if value matches the ResolutionError structure
 */
export function isResolutionError(value: unknown): value is ResolutionError {
	if (!value || typeof value !== "object") {
		return false;
	}

	const obj = value as Record<string, unknown>;

	return (
		typeof obj.code === "string" &&
		typeof obj.message === "string" &&
		isWorkflowReference(obj.reference)
	);
}

// ============================================================================
// Error Code Constants
// ============================================================================

/**
 * Constants for resolution error codes.
 *
 * Provides type-safe access to error codes for creating resolution errors.
 * Use these constants instead of string literals for better autocomplete
 * and refactoring support.
 *
 * @example
 * ```typescript
 * import { RESOLUTION_ERROR_CODES } from "./types.ts";
 *
 * const error: ResolutionError = {
 *   code: RESOLUTION_ERROR_CODES.WORKFLOW_NOT_FOUND,
 *   message: 'Workflow "planning" not found',
 *   reference: { name: "planning" }
 * };
 * ```
 */
export const RESOLUTION_ERROR_CODES = {
	/** No workflow found matching the reference */
	WORKFLOW_NOT_FOUND: "WORKFLOW_NOT_FOUND",
	/** No version satisfies the requested range */
	VERSION_NOT_FOUND: "VERSION_NOT_FOUND",
	/** Named export does not exist in package */
	EXPORT_NOT_FOUND: "EXPORT_NOT_FOUND",
	/** Circular dependency detected in dependency graph */
	CIRCULAR_DEPENDENCY: "CIRCULAR_DEPENDENCY",
	/** Incompatible version requirements */
	VERSION_CONFLICT: "VERSION_CONFLICT",
	/** Reference string is malformed */
	INVALID_REFERENCE: "INVALID_REFERENCE",
	/** Package exists but failed validation */
	PACKAGE_INVALID: "PACKAGE_INVALID",
} as const satisfies Record<string, ResolutionErrorCode>;

// ============================================================================
// Result Type Aliases
// ============================================================================

/**
 * Result type for single workflow resolution.
 */
export type ResolveResult = Result<ResolvedWorkflow, ResolutionError>;

/**
 * Result type for dependency graph resolution.
 */
export type DependencyGraphResult = Result<DependencyGraph, ResolutionError>;
