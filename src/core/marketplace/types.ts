/**
 * Types for marketplace package management.
 *
 * This module defines the structure of marketplace operations, including:
 * - CLI command options (install, uninstall, update, list)
 * - Registry types for central package registry
 * - Result types for operation outcomes
 * - Source parsing types for install targets
 *
 * The marketplace enables installing, updating, and managing workflow packages
 * from git repositories (direct URLs or via central registry).
 */

import type { Result } from "../utils/result/result.ts";

// ============================================================================
// Installation Scope
// ============================================================================

/**
 * Installation scope for packages.
 *
 * - "project": Install to `.cw/workflows/.installed/` in the current project
 * - "global": Install to `~/.cw/workflows/`
 */
export type InstallationScope = "project" | "global";

// ============================================================================
// CLI Command Options
// ============================================================================

/**
 * Options for the `cw install` command.
 *
 * @example
 * ```typescript
 * const options: InstallOptions = {
 *   global: false,
 *   noDeps: false,
 *   force: true,
 *   verbose: true
 * };
 * ```
 */
export interface InstallOptions {
	/** Install to global location (~/.cw/workflows/) instead of project */
	global?: boolean;

	/** Skip dependency installation */
	noDeps?: boolean;

	/** Force reinstall even if package already exists */
	force?: boolean;

	/** Enable verbose output */
	verbose?: boolean;
}

/**
 * Options for the `cw uninstall` command.
 *
 * @example
 * ```typescript
 * const options: UninstallOptions = {
 *   global: true,
 *   force: true
 * };
 * ```
 */
export interface UninstallOptions {
	/** Uninstall from global location (~/.cw/workflows/) */
	global?: boolean;

	/** Force uninstall even if other packages depend on this one */
	force?: boolean;

	/** Enable verbose output */
	verbose?: boolean;
}

/**
 * Options for the `cw update` command.
 *
 * @example
 * ```typescript
 * const options: UpdateOptions = {
 *   all: true,
 *   dryRun: true
 * };
 * ```
 */
export interface UpdateOptions {
	/** Update all installed packages */
	all?: boolean;

	/** Update from global location (~/.cw/workflows/) */
	global?: boolean;

	/** Show what would be updated without making changes */
	dryRun?: boolean;

	/** Enable verbose output */
	verbose?: boolean;
}

/**
 * Options for the `cw list` command.
 *
 * @example
 * ```typescript
 * const options: ListOptions = {
 *   global: false,
 *   all: true,
 *   outdated: true,
 *   json: false
 * };
 * ```
 */
export interface ListOptions {
	/** List packages from global location (~/.cw/workflows/) */
	global?: boolean;

	/** List packages from both project and global locations */
	all?: boolean;

	/** Show only packages with available updates */
	outdated?: boolean;

	/** Output in JSON format */
	json?: boolean;

	/** Enable verbose output */
	verbose?: boolean;
}

// ============================================================================
// Registry Types
// ============================================================================

/**
 * Entry for a single package in the central registry.
 *
 * @example
 * ```typescript
 * const entry: RegistryEntry = {
 *   repository: "https://github.com/user/workflow-package.git",
 *   description: "A helpful workflow for code reviews",
 *   author: "John Doe",
 *   keywords: ["code-review", "automation"],
 *   verified: true
 * };
 * ```
 */
export interface RegistryEntry {
	/** Git repository URL for the package */
	repository: string;

	/** Human-readable description of the package */
	description?: string;

	/** Package author name or handle */
	author?: string;

	/** Keywords for discovery and categorization */
	keywords?: string[];

	/** Whether the package has been verified by maintainers */
	verified?: boolean;
}

/**
 * Central package registry structure.
 *
 * Maps package names to their registry entries.
 *
 * @example
 * ```typescript
 * const registry: Registry = {
 *   version: "1.0.0",
 *   updated: "2024-01-18T12:00:00Z",
 *   packages: {
 *     "code-review": {
 *       repository: "https://github.com/user/code-review-workflow.git",
 *       description: "Automated code review workflow"
 *     },
 *     "deploy": {
 *       repository: "https://github.com/org/deploy-workflow.git",
 *       description: "Deployment automation workflow"
 *     }
 *   }
 * };
 * ```
 */
export interface Registry {
	/** Registry format version */
	version: string;

	/** ISO 8601 timestamp of last registry update */
	updated: string;

	/** Map of package names to registry entries */
	packages: Record<string, RegistryEntry>;
}

/**
 * Cached registry data with metadata.
 *
 * Used for local caching of the registry with TTL support.
 */
export interface CachedRegistry {
	/** The registry data */
	registry: Registry;

	/** Timestamp when the cache was created (ms since epoch) */
	cachedAt: number;

	/** Time-to-live in milliseconds */
	ttl: number;
}

// ============================================================================
// Source Parsing Types
// ============================================================================

/**
 * Install source string format.
 *
 * Supported formats:
 * - `"planning"` - lookup in registry, install latest
 * - `"planning@1.0.0"` - install specific version
 * - `"planning@^1.0.0"` - install latest matching range
 * - `"git:github.com/user/workflow"` - install from git
 * - `"git:github.com/user/workflow#v1.0.0"` - install specific ref
 */
export type InstallSource = string;

/**
 * Type of install source.
 */
export type SourceType = "registry" | "git";

/**
 * Parsed install source with extracted components.
 *
 * @example
 * ```typescript
 * // From "planning@^1.0.0"
 * const parsed: ParsedSource = {
 *   type: "registry",
 *   name: "planning",
 *   version: "^1.0.0",
 *   raw: "planning@^1.0.0"
 * };
 *
 * // From "git:github.com/user/workflow#v1.0.0"
 * const parsed: ParsedSource = {
 *   type: "git",
 *   url: "https://github.com/user/workflow.git",
 *   ref: "v1.0.0",
 *   raw: "git:github.com/user/workflow#v1.0.0"
 * };
 * ```
 */
export interface ParsedSource {
	/** Type of source (registry or git) */
	type: SourceType;

	/** Package name (for registry sources) */
	name?: string;

	/** Version or semver range (for registry sources) */
	version?: string;

	/** Git URL (for git sources) */
	url?: string;

	/** Git ref - branch, tag, or commit (for git sources) */
	ref?: string;

	/** Original raw source string */
	raw: string;
}

// ============================================================================
// Installed Package Types
// ============================================================================

/**
 * Represents an installed workflow package.
 *
 * @example
 * ```typescript
 * const pkg: InstalledPackage = {
 *   name: "code-review",
 *   version: "1.2.0",
 *   path: "/project/.cw/workflows/.installed/code-review@1.2.0",
 *   scope: "project",
 *   isDependency: false,
 *   source: {
 *     type: "registry",
 *     name: "code-review",
 *     version: "1.2.0",
 *     raw: "code-review@1.2.0"
 *   },
 *   installedAt: "2024-01-18T12:00:00Z"
 * };
 * ```
 */
export interface InstalledPackage {
	/** Package name */
	name: string;

	/** Installed version */
	version: string;

	/** Absolute path to installed package directory */
	path: string;

	/** Installation scope (project or global) */
	scope: InstallationScope;

	/** Whether this was installed as a dependency */
	isDependency: boolean;

	/** Parsed source information */
	source?: ParsedSource;

	/** ISO 8601 timestamp of installation */
	installedAt?: string;

	/** Description from package.json */
	description?: string;
}

/**
 * Package with update availability information.
 *
 * Used by the list --outdated command.
 */
export interface PackageWithUpdate extends InstalledPackage {
	/** Latest available version */
	latestVersion?: string;

	/** Whether an update is available */
	updateAvailable: boolean;
}

// ============================================================================
// Installation Metadata Types
// ============================================================================

/**
 * Metadata stored for each installed package.
 *
 * Stored alongside the package to track installation details.
 */
export interface InstallationMetadata {
	/** Package name */
	name: string;

	/** Installed version */
	version: string;

	/** Original install source */
	source: ParsedSource;

	/** Installation scope */
	scope: InstallationScope;

	/** ISO 8601 timestamp of installation */
	installedAt: string;

	/** Whether installed as a dependency */
	isDependency: boolean;

	/** Package that depends on this one (if dependency) */
	dependedBy?: string;

	/** Direct dependencies installed with this package */
	dependencies?: string[];
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error codes for marketplace operations.
 */
export type MarketplaceErrorCode =
	| "PACKAGE_NOT_FOUND" // Package not found in registry
	| "VERSION_NOT_FOUND" // Specific version not found
	| "CLONE_FAILED" // Git clone operation failed
	| "CHECKOUT_FAILED" // Git checkout operation failed
	| "INVALID_PACKAGE" // Package structure is invalid
	| "ALREADY_EXISTS" // Package already installed (use --force)
	| "DEPENDENCY_CYCLE" // Circular dependency detected
	| "DEPENDENCY_CONFLICT" // Version conflict between dependencies
	| "NETWORK_ERROR" // Network request failed
	| "PERMISSION_DENIED" // Insufficient permissions
	| "INVALID_SOURCE" // Could not parse install source
	| "UNINSTALL_BLOCKED" // Other packages depend on this one
	| "GIT_NOT_FOUND" // Git binary not found
	| "REGISTRY_ERROR" // Error fetching/parsing registry
	| "ROLLBACK_FAILED" // Failed to rollback partial installation
	| "UNKNOWN_ERROR"; // Unexpected error

/**
 * Error details for marketplace operations.
 *
 * @example
 * ```typescript
 * const error: MarketplaceError = {
 *   code: "PACKAGE_NOT_FOUND",
 *   message: "Package 'my-workflow' not found in registry",
 *   package: "my-workflow",
 *   suggestion: "Check the package name or install from git URL"
 * };
 * ```
 */
export interface MarketplaceError {
	/** Error code identifying the type of failure */
	code: MarketplaceErrorCode;

	/** Human-readable error message */
	message: string;

	/** Package name related to the error (if applicable) */
	package?: string;

	/** Suggestion for how to resolve the error */
	suggestion?: string;

	/** Underlying error message (if wrapped) */
	cause?: string;
}

// ============================================================================
// Operation Result Types
// ============================================================================

/**
 * Result of an install operation.
 *
 * @example
 * ```typescript
 * const result: InstallResult = {
 *   success: true,
 *   installed: [
 *     { name: "code-review", version: "1.2.0", path: "...", scope: "project", isDependency: false },
 *     { name: "utils", version: "0.5.0", path: "...", scope: "project", isDependency: true }
 *   ],
 *   errors: []
 * };
 * ```
 */
export interface InstallResult {
	/** Whether the operation completed successfully */
	success: boolean;

	/** List of successfully installed packages */
	installed: InstalledPackage[];

	/** List of errors that occurred */
	errors: MarketplaceError[];
}

/**
 * Result of an uninstall operation.
 *
 * @example
 * ```typescript
 * const result: UninstallResult = {
 *   success: true,
 *   uninstalled: ["code-review@1.2.0"],
 *   warnings: []
 * };
 * ```
 */
export interface UninstallResult {
	/** Whether the operation completed successfully */
	success: boolean;

	/** List of uninstalled packages (name@version format) */
	uninstalled: string[];

	/** Warnings about the operation (e.g., dependents) */
	warnings: string[];

	/** Errors that occurred */
	errors: MarketplaceError[];
}

/**
 * Information about a pending package update.
 */
export interface PendingUpdate {
	/** Package name */
	name: string;

	/** Currently installed version */
	currentVersion: string;

	/** Version to update to */
	newVersion: string;

	/** Installation scope */
	scope: InstallationScope;
}

/**
 * Result of an update operation.
 *
 * @example
 * ```typescript
 * const result: UpdateResult = {
 *   success: true,
 *   updated: [
 *     { name: "code-review", currentVersion: "1.2.0", newVersion: "1.3.0", scope: "project" }
 *   ],
 *   skipped: [],
 *   errors: []
 * };
 * ```
 */
export interface UpdateResult {
	/** Whether the operation completed successfully */
	success: boolean;

	/** List of updated packages */
	updated: PendingUpdate[];

	/** Packages that were skipped (already up-to-date) */
	skipped: string[];

	/** Errors that occurred */
	errors: MarketplaceError[];
}

/**
 * Result of a list operation.
 *
 * @example
 * ```typescript
 * const result: ListResult = {
 *   packages: [...],
 *   scope: "project"
 * };
 * ```
 */
export interface ListResult {
	/** List of installed packages */
	packages: InstalledPackage[] | PackageWithUpdate[];

	/** Scope of the listing */
	scope: InstallationScope | "all";
}

// ============================================================================
// Service Interfaces
// ============================================================================

/**
 * Configuration for the registry service.
 */
export interface RegistryServiceConfig {
	/** URL of the central registry JSON file */
	registryUrl: string;

	/** Cache time-to-live in milliseconds */
	cacheTtl: number;

	/** Path to local cache file */
	cachePath: string;
}

/**
 * Configuration for the git service.
 */
export interface GitServiceConfig {
	/** Temp directory for cloning operations */
	tempDir: string;

	/** Whether to use shallow clones (default: true) */
	shallow?: boolean;

	/** Clone timeout in milliseconds */
	timeout?: number;
}

/**
 * Configuration for the installation service.
 */
export interface InstallationServiceConfig {
	/** Project installation directory (.cw/workflows/.installed/) */
	projectDir: string;

	/** Global installation directory (~/.cw/workflows/) */
	globalDir: string;

	/** Temp directory for operations */
	tempDir: string;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a value is a valid RegistryEntry.
 *
 * @param value - Value to check
 * @returns True if value matches the RegistryEntry structure
 */
export function isRegistryEntry(value: unknown): value is RegistryEntry {
	if (!value || typeof value !== "object") {
		return false;
	}

	const obj = value as Record<string, unknown>;
	return typeof obj.repository === "string";
}

/**
 * Type guard to check if a value is a valid Registry.
 *
 * @param value - Value to check
 * @returns True if value matches the Registry structure
 */
export function isRegistry(value: unknown): value is Registry {
	if (!value || typeof value !== "object") {
		return false;
	}

	const obj = value as Record<string, unknown>;
	return (
		typeof obj.version === "string" &&
		typeof obj.updated === "string" &&
		typeof obj.packages === "object" &&
		obj.packages !== null
	);
}

/**
 * Type guard to check if a value is a valid InstalledPackage.
 *
 * @param value - Value to check
 * @returns True if value matches the InstalledPackage structure
 */
export function isInstalledPackage(value: unknown): value is InstalledPackage {
	if (!value || typeof value !== "object") {
		return false;
	}

	const obj = value as Record<string, unknown>;
	return (
		typeof obj.name === "string" &&
		typeof obj.version === "string" &&
		typeof obj.path === "string" &&
		(obj.scope === "project" || obj.scope === "global") &&
		typeof obj.isDependency === "boolean"
	);
}

/**
 * Type guard to check if a value is a valid MarketplaceError.
 *
 * @param value - Value to check
 * @returns True if value matches the MarketplaceError structure
 */
export function isMarketplaceError(value: unknown): value is MarketplaceError {
	if (!value || typeof value !== "object") {
		return false;
	}

	const obj = value as Record<string, unknown>;
	return typeof obj.code === "string" && typeof obj.message === "string";
}

// ============================================================================
// Error Code Constants
// ============================================================================

/**
 * Constants for marketplace error codes.
 *
 * Provides type-safe access to error codes for creating marketplace errors.
 *
 * @example
 * ```typescript
 * import { MARKETPLACE_ERROR_CODES } from "./types.ts";
 *
 * const error: MarketplaceError = {
 *   code: MARKETPLACE_ERROR_CODES.PACKAGE_NOT_FOUND,
 *   message: 'Package "my-workflow" not found in registry',
 *   package: "my-workflow"
 * };
 * ```
 */
export const MARKETPLACE_ERROR_CODES = {
	/** Package not found in registry */
	PACKAGE_NOT_FOUND: "PACKAGE_NOT_FOUND",
	/** Specific version not found */
	VERSION_NOT_FOUND: "VERSION_NOT_FOUND",
	/** Git clone operation failed */
	CLONE_FAILED: "CLONE_FAILED",
	/** Git checkout operation failed */
	CHECKOUT_FAILED: "CHECKOUT_FAILED",
	/** Package structure is invalid */
	INVALID_PACKAGE: "INVALID_PACKAGE",
	/** Package already installed (use --force) */
	ALREADY_EXISTS: "ALREADY_EXISTS",
	/** Circular dependency detected */
	DEPENDENCY_CYCLE: "DEPENDENCY_CYCLE",
	/** Version conflict between dependencies */
	DEPENDENCY_CONFLICT: "DEPENDENCY_CONFLICT",
	/** Network request failed */
	NETWORK_ERROR: "NETWORK_ERROR",
	/** Insufficient permissions */
	PERMISSION_DENIED: "PERMISSION_DENIED",
	/** Could not parse install source */
	INVALID_SOURCE: "INVALID_SOURCE",
	/** Other packages depend on this one */
	UNINSTALL_BLOCKED: "UNINSTALL_BLOCKED",
	/** Git binary not found */
	GIT_NOT_FOUND: "GIT_NOT_FOUND",
	/** Error fetching/parsing registry */
	REGISTRY_ERROR: "REGISTRY_ERROR",
	/** Failed to rollback partial installation */
	ROLLBACK_FAILED: "ROLLBACK_FAILED",
	/** Unexpected error */
	UNKNOWN_ERROR: "UNKNOWN_ERROR",
} as const satisfies Record<string, MarketplaceErrorCode>;

// ============================================================================
// Result Type Aliases
// ============================================================================

/**
 * Result type for install operations.
 */
export type InstallOperationResult = Result<InstallResult, MarketplaceError>;

/**
 * Result type for uninstall operations.
 */
export type UninstallOperationResult = Result<
	UninstallResult,
	MarketplaceError
>;

/**
 * Result type for update operations.
 */
export type UpdateOperationResult = Result<UpdateResult, MarketplaceError>;

/**
 * Result type for list operations.
 */
export type ListOperationResult = Result<ListResult, MarketplaceError>;

/**
 * Result type for registry lookups.
 */
export type RegistryLookupResult = Result<RegistryEntry, MarketplaceError>;

/**
 * Result type for source parsing.
 */
export type ParseSourceResult = Result<ParsedSource, MarketplaceError>;
