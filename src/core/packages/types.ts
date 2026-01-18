/**
 * Types for workflow package management.
 *
 * This module defines the structure of workflow packages, including:
 * - Package.json schema for folder-based workflows
 * - Package validation errors and results
 * - Loaded package interfaces
 *
 * Workflow packages enable folder-based workflows with configuration,
 * multiple exports, input/output schemas, versioning, and dependencies.
 */

import type { LangGraphWorkflowDefinition } from "../graph/types.ts";
import type { Result } from "../utils/result/result.ts";

// ============================================================================
// Package Author and Repository Types
// ============================================================================

/**
 * Author information for a workflow package.
 *
 * Can be a simple string (e.g., "John Doe") or an object with details.
 *
 * @example
 * ```typescript
 * // Simple string format
 * const author: WorkflowPackageAuthor = "John Doe";
 *
 * // Object format with details
 * const author: WorkflowPackageAuthor = {
 *   name: "John Doe",
 *   email: "john@example.com",
 *   url: "https://example.com"
 * };
 * ```
 */
export type WorkflowPackageAuthor =
	| string
	| {
			/** Author name (required) */
			name: string;
			/** Author email address */
			email?: string;
			/** Author website URL */
			url?: string;
	  };

/**
 * Repository information for a workflow package.
 *
 * Can be a simple URL string or an object with type and URL.
 *
 * @example
 * ```typescript
 * // Simple URL format
 * const repository: WorkflowPackageRepository = "https://github.com/org/repo";
 *
 * // Object format with type
 * const repository: WorkflowPackageRepository = {
 *   type: "git",
 *   url: "https://github.com/org/repo.git"
 * };
 * ```
 */
export type WorkflowPackageRepository =
	| string
	| {
			/** Repository type (e.g., "git", "svn") */
			type: string;
			/** Repository URL */
			url: string;
	  };

// ============================================================================
// Workflow Metadata
// ============================================================================

/**
 * Metadata for a single workflow export within a package.
 *
 * Packages can export multiple workflows, each with its own metadata.
 */
export interface WorkflowExportMetadata {
	/** Human-readable description of the workflow */
	description: string;

	/** Tags for categorization and discovery */
	tags?: string[];
}

// ============================================================================
// Claude Orchestrator Configuration
// ============================================================================

/**
 * Claude Orchestrator-specific configuration in package.json.
 *
 * Defines requirements and compatibility constraints for the package.
 */
export interface ClaudeOrchestratorConfig {
	/** Minimum claude-orchestrator version required */
	minVersion?: string;

	/** External tools required by the workflows */
	requires?: ("tmux" | "git" | "docker")[];
}

// ============================================================================
// Main Package.json Interface
// ============================================================================

/**
 * Schema for workflow package.json files.
 *
 * This interface defines the structure of package.json for workflow packages,
 * following npm conventions with workflow-specific extensions.
 *
 * @example
 * ```typescript
 * const packageJson: WorkflowPackageJson = {
 *   name: "@myorg/deploy-workflow",
 *   version: "1.0.0",
 *   main: "./src/workflow.ts",
 *   description: "Automated deployment workflow",
 *   keywords: ["deploy", "ci-cd"],
 *   workflows: {
 *     default: { description: "Main deployment workflow" },
 *     rollback: { description: "Rollback deployment", tags: ["recovery"] }
 *   },
 *   dependencies: {
 *     "@myorg/notify-workflow": "^2.0.0"
 *   },
 *   "claude-orchestrator": {
 *     minVersion: "0.5.0",
 *     requires: ["git", "docker"]
 *   }
 * };
 * ```
 */
export interface WorkflowPackageJson {
	/**
	 * Package name following npm naming conventions.
	 *
	 * Supports scoped packages (e.g., "@org/package-name").
	 * Must be lowercase, can contain hyphens and underscores.
	 */
	name: string;

	/**
	 * Package version in semver format.
	 *
	 * Must follow semantic versioning (e.g., "1.0.0", "2.1.0-beta.1").
	 */
	version: string;

	/**
	 * Relative path to the main entry file.
	 *
	 * Points to the TypeScript file that exports workflow factory functions.
	 */
	main: string;

	/** Human-readable package description */
	description?: string;

	/** Package author information */
	author?: WorkflowPackageAuthor;

	/** Source repository information */
	repository?: WorkflowPackageRepository;

	/** Keywords for package discovery and categorization */
	keywords?: string[];

	/** SPDX license identifier */
	license?: string;

	/**
	 * Metadata for workflows exported by this package.
	 *
	 * Keys are export names ("default" for default export).
	 */
	workflows?: Record<string, WorkflowExportMetadata>;

	/**
	 * Dependencies on other workflow packages.
	 *
	 * Keys are package names, values are semver ranges.
	 */
	dependencies?: Record<string, string>;

	/** Claude Orchestrator-specific configuration */
	"claude-orchestrator"?: ClaudeOrchestratorConfig;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a value is a valid WorkflowPackageJson.
 *
 * Validates that the value is an object with required fields (name, version, main)
 * of the correct types. Does not validate field values (e.g., semver format).
 *
 * @param value - Value to check
 * @returns True if value matches the WorkflowPackageJson structure
 *
 * @example
 * ```typescript
 * const data = JSON.parse(content);
 * if (isWorkflowPackageJson(data)) {
 *   console.log(data.name);    // TypeScript knows data is WorkflowPackageJson
 *   console.log(data.version);
 * }
 * ```
 */
export function isWorkflowPackageJson(
	value: unknown,
): value is WorkflowPackageJson {
	if (!value || typeof value !== "object") {
		return false;
	}

	const obj = value as Record<string, unknown>;
	return (
		typeof obj.name === "string" &&
		typeof obj.version === "string" &&
		typeof obj.main === "string"
	);
}

/**
 * Type guard to check if a value is a valid WorkflowFactory.
 *
 * Validates that the value is a function. Note that this only checks
 * that the value is callable; it does not verify the return type.
 *
 * @param value - Value to check
 * @returns True if value is a function (potential WorkflowFactory)
 *
 * @example
 * ```typescript
 * const exported = module.default;
 * if (isWorkflowFactory(exported)) {
 *   const workflow = exported(); // TypeScript knows exported is WorkflowFactory
 * }
 * ```
 */
export function isWorkflowFactory(value: unknown): value is WorkflowFactory {
	return typeof value === "function";
}

// ============================================================================
// Package Validation Types
// ============================================================================

/**
 * Error codes for package validation errors.
 *
 * Used to categorize and identify specific validation failures.
 */
export type PackageValidationErrorCode =
	| "MISSING_REQUIRED_FIELD" // Required field is missing (name, version, main)
	| "INVALID_NAME" // Package name doesn't match npm naming conventions
	| "INVALID_VERSION" // Version doesn't follow semver format
	| "INVALID_MAIN_PATH" // Main entry file path is invalid or doesn't exist
	| "INVALID_JSON" // package.json is not valid JSON
	| "INVALID_DEPENDENCY" // Dependency version range is invalid
	| "CIRCULAR_DEPENDENCY" // Circular dependency detected
	| "MISSING_ENTRY_FILE" // Main entry file does not exist
	| "INVALID_EXPORT" // Workflow export is not a valid factory function
	| "INCOMPATIBLE_VERSION"; // Package requires incompatible orchestrator version

/**
 * Warning codes for package validation warnings.
 *
 * Used to identify non-fatal issues that should be addressed.
 */
export type PackageValidationWarningCode =
	| "MISSING_DESCRIPTION" // Package description is missing
	| "MISSING_LICENSE" // License field is missing
	| "MISSING_AUTHOR" // Author information is missing
	| "MISSING_WORKFLOWS" // Workflows metadata is missing
	| "DEPRECATED_FIELD" // Field is deprecated and should be removed
	| "UNRESOLVED_DEPENDENCY"; // Dependency could not be resolved (but may exist)

/**
 * Validation error for package validation failures.
 *
 * Represents a fatal validation issue that prevents the package from loading.
 *
 * @example
 * ```typescript
 * const error: PackageValidationError = {
 *   code: 'MISSING_REQUIRED_FIELD',
 *   message: 'Required field "name" is missing from package.json',
 *   field: 'name',
 *   path: '/path/to/package'
 * };
 * ```
 */
export interface PackageValidationError {
	/** Error code identifying the type of validation failure */
	code: PackageValidationErrorCode;

	/** Human-readable error message */
	message: string;

	/** Field name that caused the error (if applicable) */
	field?: string;

	/** Path to the package or file (if applicable) */
	path?: string;

	/** Expected value or format (for context) */
	expected?: string;

	/** Actual value that was found */
	actual?: string;
}

/**
 * Validation warning for non-fatal package issues.
 *
 * Represents an issue that should be addressed but doesn't prevent loading.
 *
 * @example
 * ```typescript
 * const warning: PackageValidationWarning = {
 *   code: 'MISSING_DESCRIPTION',
 *   message: 'Package description is missing. Consider adding a description.',
 *   field: 'description',
 *   suggestion: 'Add a "description" field to package.json'
 * };
 * ```
 */
export interface PackageValidationWarning {
	/** Warning code identifying the type of issue */
	code: PackageValidationWarningCode;

	/** Human-readable warning message */
	message: string;

	/** Field name related to the warning (if applicable) */
	field?: string;

	/** Suggestion for how to fix the warning */
	suggestion?: string;
}

/**
 * Result of validating a workflow package.
 *
 * Contains validation status, any errors or warnings found, and
 * the parsed package.json if validation succeeded.
 *
 * @example
 * ```typescript
 * // Successful validation
 * const result: PackageValidationResult = {
 *   valid: true,
 *   errors: [],
 *   warnings: [{ code: 'MISSING_DESCRIPTION', message: '...' }],
 *   packageJson: { name: 'my-workflow', version: '1.0.0', main: './index.ts' }
 * };
 *
 * // Failed validation
 * const result: PackageValidationResult = {
 *   valid: false,
 *   errors: [{ code: 'MISSING_REQUIRED_FIELD', message: '...', field: 'name' }],
 *   warnings: []
 * };
 * ```
 */
export interface PackageValidationResult {
	/** Whether the package passed validation (no errors) */
	valid: boolean;

	/** List of validation errors (empty if valid) */
	errors: PackageValidationError[];

	/** List of validation warnings (may exist even if valid) */
	warnings: PackageValidationWarning[];

	/** Parsed package.json (only present if valid) */
	packageJson?: WorkflowPackageJson;

	/** Path to the package directory */
	packagePath?: string;
}

// ============================================================================
// Workflow Factory Type
// ============================================================================

/**
 * Factory function that creates a workflow definition.
 *
 * Workflow packages export factory functions that return workflow definitions.
 * This type represents any function that produces a LangGraphWorkflowDefinition.
 *
 * @example
 * ```typescript
 * const myWorkflowFactory: WorkflowFactory = () => ({
 *   name: "My Workflow",
 *   build(graph) {
 *     graph.addNode("start", async (state, tools) => {
 *       return { variables: {} };
 *     });
 *   },
 * });
 * ```
 */
export type WorkflowFactory = () => LangGraphWorkflowDefinition;

// ============================================================================
// Loaded Package Interface
// ============================================================================

/**
 * Represents a successfully loaded workflow package.
 *
 * Contains the package metadata, filesystem path, and all exported workflows.
 * Provides methods to retrieve workflows by name and list available exports.
 *
 * @example
 * ```typescript
 * // Loading and using a package
 * const result = await loader.load('./my-package');
 * if (isOk(result)) {
 *   const pkg = result.value;
 *   console.log(pkg.metadata.name);        // "@myorg/my-workflow"
 *   console.log(pkg.listWorkflows());      // ["default", "deploy", "rollback"]
 *
 *   const defaultWorkflow = pkg.getWorkflow();
 *   const deployWorkflow = pkg.getWorkflow("deploy");
 * }
 * ```
 */
export interface LoadedWorkflowPackage {
	/**
	 * Package metadata from package.json.
	 *
	 * Contains name, version, description, and other package information.
	 */
	metadata: WorkflowPackageJson;

	/**
	 * Absolute path to the package root directory.
	 *
	 * For folder-based packages, this is the directory containing package.json.
	 * For single-file workflows, this is the directory containing the .ts file.
	 */
	path: string;

	/**
	 * Map of workflow export names to factory functions.
	 *
	 * Keys are export names ("default" for default export, or named export names).
	 * Values are factory functions that create workflow definitions.
	 */
	workflows: Map<string, WorkflowFactory>;

	/**
	 * Retrieve a workflow factory by export name.
	 *
	 * @param name - Export name to retrieve. If omitted, returns the default export.
	 * @returns The workflow factory, or undefined if not found.
	 *
	 * @example
	 * ```typescript
	 * // Get default export
	 * const defaultFactory = pkg.getWorkflow();
	 *
	 * // Get named export
	 * const deployFactory = pkg.getWorkflow("deploy");
	 * ```
	 */
	getWorkflow(name?: string): WorkflowFactory | undefined;

	/**
	 * List all available workflow export names.
	 *
	 * @returns Array of export names (e.g., ["default", "deploy", "rollback"])
	 *
	 * @example
	 * ```typescript
	 * const exports = pkg.listWorkflows();
	 * // ["default", "deploy", "rollback"]
	 * ```
	 */
	listWorkflows(): string[];
}

// ============================================================================
// Package Loader Interface
// ============================================================================

/**
 * Interface for loading and validating workflow packages.
 *
 * The loader handles both folder-based packages (with package.json) and
 * single-file workflows (for backward compatibility).
 *
 * @example
 * ```typescript
 * const loader: WorkflowPackageLoader = createPackageLoader();
 *
 * // Check if a path is a valid package
 * if (await loader.isPackage('./my-package')) {
 *   // Validate without loading
 *   const validation = await loader.validate('./my-package');
 *   if (validation.valid) {
 *     // Load the package
 *     const result = await loader.load('./my-package');
 *     if (isOk(result)) {
 *       const pkg = result.value;
 *       // Use the loaded package...
 *     }
 *   }
 * }
 * ```
 */
export interface WorkflowPackageLoader {
	/**
	 * Load a workflow package from the filesystem.
	 *
	 * For folder-based packages:
	 * - Reads and validates package.json
	 * - Imports the main entry file
	 * - Extracts all workflow exports
	 *
	 * For single-file workflows (legacy support):
	 * - Imports the .ts file directly
	 * - Treats default export as the workflow
	 *
	 * @param packagePath - Path to the package directory or single workflow file
	 * @returns Result containing the loaded package or validation errors
	 *
	 * @example
	 * ```typescript
	 * // Load a folder-based package
	 * const result = await loader.load('./packages/my-workflow');
	 *
	 * // Load a single-file workflow (legacy)
	 * const result = await loader.load('./workflows/my-workflow.ts');
	 *
	 * if (isOk(result)) {
	 *   const pkg = result.value;
	 *   const factory = pkg.getWorkflow();
	 *   const workflow = factory();
	 * } else {
	 *   console.error('Validation errors:', result.error);
	 * }
	 * ```
	 */
	load(
		packagePath: string,
	): Promise<Result<LoadedWorkflowPackage, PackageValidationError[]>>;

	/**
	 * Validate a package without loading its exports.
	 *
	 * Performs structural validation:
	 * - Checks package.json exists and is valid JSON
	 * - Validates against the package schema
	 * - Verifies main entry file exists
	 * - Checks dependency declarations
	 *
	 * Does NOT import or execute any code.
	 *
	 * @param packagePath - Path to the package directory
	 * @returns Validation result with errors and warnings
	 *
	 * @example
	 * ```typescript
	 * const result = await loader.validate('./my-package');
	 * if (result.valid) {
	 *   console.log('Package is valid');
	 * } else {
	 *   for (const error of result.errors) {
	 *     console.error(`${error.code}: ${error.message}`);
	 *   }
	 * }
	 * ```
	 */
	validate(packagePath: string): Promise<PackageValidationResult>;

	/**
	 * Check if a path represents a valid workflow package or file.
	 *
	 * Quick check without full validation:
	 * - For directories: checks if package.json exists
	 * - For files: checks if it's a .ts file
	 *
	 * @param path - Path to check
	 * @returns True if the path could be a workflow package
	 *
	 * @example
	 * ```typescript
	 * if (await loader.isPackage('./my-package')) {
	 *   // Proceed with loading
	 * } else {
	 *   console.log('Not a valid package location');
	 * }
	 * ```
	 */
	isPackage(path: string): Promise<boolean>;
}

// ============================================================================
// Error Code Constants
// ============================================================================

/**
 * Constants for package validation error codes.
 *
 * Provides type-safe access to error codes for creating validation errors.
 * Use these constants instead of string literals for better autocomplete
 * and refactoring support.
 *
 * @example
 * ```typescript
 * import { PACKAGE_ERROR_CODES } from "./types.ts";
 *
 * const error: PackageValidationError = {
 *   code: PACKAGE_ERROR_CODES.MISSING_REQUIRED_FIELD,
 *   message: 'Required field "name" is missing',
 *   field: 'name'
 * };
 * ```
 */
export const PACKAGE_ERROR_CODES = {
	/** Required field is missing (name, version, main) */
	MISSING_REQUIRED_FIELD: "MISSING_REQUIRED_FIELD",
	/** Package name doesn't match npm naming conventions */
	INVALID_NAME: "INVALID_NAME",
	/** Version doesn't follow semver format */
	INVALID_VERSION: "INVALID_VERSION",
	/** Main entry file path is invalid or doesn't exist */
	INVALID_MAIN_PATH: "INVALID_MAIN_PATH",
	/** package.json is not valid JSON */
	INVALID_JSON: "INVALID_JSON",
	/** Dependency version range is invalid */
	INVALID_DEPENDENCY: "INVALID_DEPENDENCY",
	/** Circular dependency detected */
	CIRCULAR_DEPENDENCY: "CIRCULAR_DEPENDENCY",
	/** Main entry file does not exist */
	MISSING_ENTRY_FILE: "MISSING_ENTRY_FILE",
	/** Workflow export is not a valid factory function */
	INVALID_EXPORT: "INVALID_EXPORT",
	/** Package requires incompatible orchestrator version */
	INCOMPATIBLE_VERSION: "INCOMPATIBLE_VERSION",
} as const satisfies Record<string, PackageValidationErrorCode>;

/**
 * Constants for package validation warning codes.
 *
 * Provides type-safe access to warning codes for creating validation warnings.
 * Use these constants instead of string literals for better autocomplete
 * and refactoring support.
 *
 * @example
 * ```typescript
 * import { PACKAGE_WARNING_CODES } from "./types.ts";
 *
 * const warning: PackageValidationWarning = {
 *   code: PACKAGE_WARNING_CODES.MISSING_DESCRIPTION,
 *   message: 'Package description is missing',
 *   suggestion: 'Add a "description" field to package.json'
 * };
 * ```
 */
export const PACKAGE_WARNING_CODES = {
	/** Package description is missing */
	MISSING_DESCRIPTION: "MISSING_DESCRIPTION",
	/** License field is missing */
	MISSING_LICENSE: "MISSING_LICENSE",
	/** Author information is missing */
	MISSING_AUTHOR: "MISSING_AUTHOR",
	/** Workflows metadata is missing */
	MISSING_WORKFLOWS: "MISSING_WORKFLOWS",
	/** Field is deprecated and should be removed */
	DEPRECATED_FIELD: "DEPRECATED_FIELD",
	/** Dependency could not be resolved (but may exist) */
	UNRESOLVED_DEPENDENCY: "UNRESOLVED_DEPENDENCY",
} as const satisfies Record<string, PackageValidationWarningCode>;
