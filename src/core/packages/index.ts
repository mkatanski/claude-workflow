/**
 * Workflow package management module.
 *
 * This module provides components for defining, validating, and loading
 * workflow packages. Packages enable folder-based workflows with configuration,
 * multiple exports, input/output schemas, versioning, and dependencies.
 */

// Package loader
export { createPackageLoader, WorkflowPackageLoader } from "./loader.ts";
export type { WorkflowPackageJsonFromSchema } from "./schemas.ts";
// Zod validation schemas
// Schema validation functions
export {
	AuthorObjectSchema,
	AuthorSchema,
	ClaudeOrchestratorConfigSchema,
	DependenciesSchema,
	isValidPackageName,
	isValidSemver,
	isValidSemverRange,
	MainPathSchema,
	PackageNameSchema,
	RepositoryObjectSchema,
	RepositorySchema,
	RequiredToolSchema,
	SemverRangeSchema,
	SemverSchema,
	safeParsePackageJson,
	validatePackageJson,
	WorkflowExportMetadataSchema,
	WorkflowPackageJsonSchema,
	WorkflowsSchema,
} from "./schemas.ts";
// Type definitions
export type {
	ClaudeOrchestratorConfig,
	LoadedWorkflowPackage,
	PackageValidationError,
	PackageValidationErrorCode,
	PackageValidationResult,
	PackageValidationWarning,
	PackageValidationWarningCode,
	WorkflowExportMetadata,
	WorkflowFactory,
	WorkflowPackageAuthor,
	WorkflowPackageJson,
	WorkflowPackageLoader as WorkflowPackageLoaderInterface,
	WorkflowPackageRepository,
} from "./types.ts";
// Type guards and constants
export {
	isWorkflowFactory,
	isWorkflowPackageJson,
	PACKAGE_ERROR_CODES,
	PACKAGE_WARNING_CODES,
} from "./types.ts";
// Package validator
export { createPackageValidator, PackageValidator } from "./validator.ts";
