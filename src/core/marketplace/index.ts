/**
 * Marketplace Module - Package management for workflow packages
 *
 * This module provides a comprehensive system for managing workflow packages
 * from git repositories (direct URLs or via central registry). It supports
 * install, uninstall, update, and list operations with automatic dependency
 * resolution, version management, and both project-local and global scopes.
 *
 * @example
 * ```typescript
 * import {
 *   type InstallOptions,
 *   type InstallResult,
 *   MARKETPLACE_ERROR_CODES,
 *   isMarketplaceError
 * } from './core/marketplace';
 *
 * const options: InstallOptions = {
 *   global: false,
 *   noDeps: false,
 *   force: false
 * };
 * ```
 */

// ============================================================================
// CLI Command Options
// ============================================================================

export type {
	InstallOptions,
	UninstallOptions,
	UpdateOptions,
	ListOptions,
} from "./types.ts";

// ============================================================================
// Installation Scope
// ============================================================================

export type { InstallationScope } from "./types.ts";

// ============================================================================
// Registry Types
// ============================================================================

export type {
	RegistryEntry,
	Registry,
	CachedRegistry,
} from "./types.ts";

// ============================================================================
// Source Parsing Types
// ============================================================================

export type {
	InstallSource,
	SourceType,
	ParsedSource,
} from "./types.ts";

// ============================================================================
// Installed Package Types
// ============================================================================

export type {
	InstalledPackage,
	PackageWithUpdate,
	InstallationMetadata,
} from "./types.ts";

// ============================================================================
// Error Types
// ============================================================================

export type {
	MarketplaceErrorCode,
	MarketplaceError,
} from "./types.ts";

// ============================================================================
// Operation Result Types
// ============================================================================

export type {
	InstallResult,
	UninstallResult,
	PendingUpdate,
	UpdateResult,
	ListResult,
} from "./types.ts";

// ============================================================================
// Result Type Aliases
// ============================================================================

export type {
	InstallOperationResult,
	UninstallOperationResult,
	UpdateOperationResult,
	ListOperationResult,
	RegistryLookupResult,
	ParseSourceResult,
} from "./types.ts";

// ============================================================================
// Service Configuration Types
// ============================================================================

export type {
	RegistryServiceConfig,
	GitServiceConfig,
	InstallationServiceConfig,
} from "./types.ts";

// ============================================================================
// Type Guards
// ============================================================================

export {
	isRegistryEntry,
	isRegistry,
	isInstalledPackage,
	isMarketplaceError,
} from "./types.ts";

// ============================================================================
// Constants
// ============================================================================

export { MARKETPLACE_ERROR_CODES } from "./types.ts";

// ============================================================================
// Git Service
// ============================================================================

export { GitService } from "./git.ts";
export type {
	GitResult,
	GitTag,
	CloneOptions,
	CheckoutOptions,
} from "./git.ts";

// ============================================================================
// Registry Service
// ============================================================================

export { RegistryService, createRegistryService } from "./registry.ts";
export type {
	RegistryResult,
	SearchOptions,
	SearchResult,
} from "./registry.ts";

// ============================================================================
// Storage Service
// ============================================================================

export {
	// Path functions
	getGlobalInstallDir,
	getProjectInstallDir,
	getInstallDir,
	getPackagePath,
	getMetadataPath,
	getPackageJsonPath,
	// Directory management
	ensureInstallDir,
	directoryExists,
	// Metadata operations
	readMetadata,
	writeMetadata,
	// Package discovery
	readPackageJson,
	listInstalledPackages,
	findInstalledPackage,
	findInstalledVersion,
	isPackageInstalled,
	// Package operations
	removePackage,
	copyPackageFiles,
	getInstalledVersions,
	findDependentPackages,
	// Helpers
	parsePackageDir,
	formatPackageDir,
} from "./storage.ts";
export type { StorageResult, StorageConfig } from "./storage.ts";

// ============================================================================
// Installation Service
// ============================================================================

export {
	InstallationService,
	createInstallationService,
	extractNameFromGitUrl,
} from "./installer.ts";
export type { InstallerResult } from "./installer.ts";
