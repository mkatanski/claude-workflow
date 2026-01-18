/**
 * Workflow package loader implementation.
 *
 * This module provides the WorkflowPackageLoader class for loading
 * workflow packages from the filesystem. It supports both:
 * - Folder-based packages (with package.json)
 * - Single-file workflows (legacy support)
 *
 * @example
 * ```typescript
 * const loader = createPackageLoader();
 *
 * // Load a folder-based package
 * const result = await loader.load('./packages/my-workflow');
 * if (isOk(result)) {
 *   const pkg = result.value;
 *   const factory = pkg.getWorkflow();
 *   const workflow = factory();
 * }
 *
 * // Load a legacy single-file workflow
 * const legacyResult = await loader.load('./workflows/my-workflow.ts');
 * ```
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { isLangGraphWorkflow } from "../graph/types.ts";
import type { Result } from "../utils/result/result.js";
import type {
	WorkflowPackageLoader as IWorkflowPackageLoader,
	LoadedWorkflowPackage,
	PackageValidationError,
	PackageValidationResult,
	WorkflowFactory,
	WorkflowPackageJson,
} from "./types.js";
import { isWorkflowFactory, PACKAGE_ERROR_CODES } from "./types.js";
import { PackageValidator } from "./validator.js";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a path exists on the filesystem.
 *
 * @param filePath - Path to check
 * @returns True if the path exists
 */
async function pathExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

/**
 * Check if a path is a directory.
 *
 * @param filePath - Path to check
 * @returns True if the path is a directory
 */
async function isDirectory(filePath: string): Promise<boolean> {
	try {
		const stat = await fs.stat(filePath);
		return stat.isDirectory();
	} catch {
		return false;
	}
}

// ============================================================================
// LoadedWorkflowPackage Implementation
// ============================================================================

/**
 * Implementation of the LoadedWorkflowPackage interface.
 *
 * Represents a successfully loaded workflow package with methods
 * to retrieve workflows by name and list available exports.
 */
class LoadedWorkflowPackageImpl implements LoadedWorkflowPackage {
	readonly metadata: WorkflowPackageJson;
	readonly path: string;
	readonly workflows: Map<string, WorkflowFactory>;

	constructor(
		metadata: WorkflowPackageJson,
		packagePath: string,
		workflows: Map<string, WorkflowFactory>,
	) {
		this.metadata = metadata;
		this.path = packagePath;
		this.workflows = workflows;
	}

	/**
	 * Retrieve a workflow factory by export name.
	 *
	 * @param name - Export name to retrieve. If omitted, returns "default".
	 * @returns The workflow factory, or undefined if not found.
	 */
	getWorkflow(name?: string): WorkflowFactory | undefined {
		const exportName = name ?? "default";
		return this.workflows.get(exportName);
	}

	/**
	 * List all available workflow export names.
	 *
	 * @returns Array of export names
	 */
	listWorkflows(): string[] {
		return Array.from(this.workflows.keys());
	}
}

// ============================================================================
// WorkflowPackageLoader Implementation
// ============================================================================

/**
 * Loader for workflow packages.
 *
 * Handles loading and validating workflow packages from the filesystem.
 * Supports both folder-based packages (with package.json) and single-file
 * workflows (legacy support for backward compatibility).
 *
 * @example
 * ```typescript
 * const loader = new WorkflowPackageLoader();
 *
 * // Check if path is a package
 * if (await loader.isPackage('./my-package')) {
 *   // Validate before loading (optional)
 *   const validation = await loader.validate('./my-package');
 *   if (validation.valid) {
 *     // Load the package
 *     const result = await loader.load('./my-package');
 *     if (isOk(result)) {
 *       const pkg = result.value;
 *       // Use the loaded package
 *     }
 *   }
 * }
 * ```
 */
export class WorkflowPackageLoader implements IWorkflowPackageLoader {
	private readonly validator: PackageValidator;

	constructor(validator?: PackageValidator) {
		this.validator = validator ?? new PackageValidator();
	}

	// ============================================================================
	// Main Load Method
	// ============================================================================

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
	 * - Creates synthetic metadata
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
	 * }
	 * ```
	 */
	async load(
		packagePath: string,
	): Promise<Result<LoadedWorkflowPackage, PackageValidationError[]>> {
		const absolutePath = path.resolve(packagePath);

		// Check if path exists
		if (!(await pathExists(absolutePath))) {
			return {
				_tag: "err",
				error: [
					{
						code: PACKAGE_ERROR_CODES.MISSING_ENTRY_FILE,
						message: `Package path does not exist: ${absolutePath}`,
						path: absolutePath,
					},
				],
			};
		}

		// Determine if this is a folder-based package or single file
		if (await isDirectory(absolutePath)) {
			return this.loadFolderPackage(absolutePath);
		}

		// Single-file workflow (legacy support)
		return this.loadSingleFile(absolutePath);
	}

	// ============================================================================
	// Folder-Based Package Loading
	// ============================================================================

	/**
	 * Load a folder-based workflow package.
	 *
	 * @param absolutePath - Absolute path to the package directory
	 * @returns Result containing the loaded package or validation errors
	 */
	private async loadFolderPackage(
		absolutePath: string,
	): Promise<Result<LoadedWorkflowPackage, PackageValidationError[]>> {
		const errors: PackageValidationError[] = [];

		// Validate the package structure and schema
		const validationResult = await this.validator.validate(absolutePath);
		if (!validationResult.valid) {
			return { _tag: "err", error: validationResult.errors };
		}

		const packageJson = validationResult.packageJson;
		if (!packageJson) {
			errors.push({
				code: PACKAGE_ERROR_CODES.INVALID_JSON,
				message: "Package validation succeeded but packageJson is missing",
				path: absolutePath,
			});
			return { _tag: "err", error: errors };
		}

		// Load the main entry file
		const mainPath = path.join(absolutePath, packageJson.main);
		const workflowsResult = await this.loadWorkflowExports(mainPath);

		if (workflowsResult._tag === "err") {
			return workflowsResult;
		}

		// Create the loaded package
		const loadedPackage = new LoadedWorkflowPackageImpl(
			packageJson,
			absolutePath,
			workflowsResult.value,
		);

		return { _tag: "ok", value: loadedPackage };
	}

	// ============================================================================
	// Single-File Workflow Loading (Legacy Support)
	// ============================================================================

	/**
	 * Load a single-file workflow for backward compatibility.
	 *
	 * Creates synthetic metadata based on the file name and treats
	 * the default export as the workflow.
	 *
	 * @param absolutePath - Absolute path to the workflow file
	 * @returns Result containing the loaded package or validation errors
	 */
	private async loadSingleFile(
		absolutePath: string,
	): Promise<Result<LoadedWorkflowPackage, PackageValidationError[]>> {
		// Check if it's a TypeScript file
		if (!absolutePath.endsWith(".ts")) {
			return {
				_tag: "err",
				error: [
					{
						code: PACKAGE_ERROR_CODES.INVALID_MAIN_PATH,
						message: `Expected a TypeScript file or package directory: ${absolutePath}`,
						path: absolutePath,
					},
				],
			};
		}

		// Load the workflow exports
		const workflowsResult = await this.loadWorkflowExports(absolutePath);

		if (workflowsResult._tag === "err") {
			return workflowsResult;
		}

		// Create synthetic metadata based on file name
		const fileName = path.basename(absolutePath, ".ts");
		const dirName = path.dirname(absolutePath);

		const syntheticMetadata: WorkflowPackageJson = {
			name: fileName,
			version: "0.0.0",
			main: path.basename(absolutePath),
		};

		// Create the loaded package
		const loadedPackage = new LoadedWorkflowPackageImpl(
			syntheticMetadata,
			dirName,
			workflowsResult.value,
		);

		return { _tag: "ok", value: loadedPackage };
	}

	// ============================================================================
	// Workflow Export Loading
	// ============================================================================

	/**
	 * Load and validate workflow exports from a module file.
	 *
	 * @param mainFilePath - Absolute path to the main entry file
	 * @returns Result containing a Map of export names to workflow factories
	 */
	private async loadWorkflowExports(
		mainFilePath: string,
	): Promise<Result<Map<string, WorkflowFactory>, PackageValidationError[]>> {
		const errors: PackageValidationError[] = [];
		const workflows = new Map<string, WorkflowFactory>();

		// Import the module dynamically
		let moduleExports: Record<string, unknown>;
		try {
			moduleExports = (await import(mainFilePath)) as Record<string, unknown>;
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			errors.push({
				code: PACKAGE_ERROR_CODES.INVALID_EXPORT,
				message: `Failed to import module: ${message}`,
				path: mainFilePath,
			});
			return { _tag: "err", error: errors };
		}

		// Extract and validate default export
		if (moduleExports.default !== undefined) {
			const validationResult = this.validateAndExtractFactory(
				moduleExports.default,
				"default",
				mainFilePath,
			);
			if (validationResult.factory) {
				workflows.set("default", validationResult.factory);
			} else if (validationResult.error) {
				errors.push(validationResult.error);
			}
		}

		// Extract and validate named exports
		for (const [name, value] of Object.entries(moduleExports)) {
			if (name === "default") {
				continue; // Already processed
			}

			// Only process function exports
			if (typeof value !== "function") {
				continue;
			}

			const validationResult = this.validateAndExtractFactory(
				value,
				name,
				mainFilePath,
			);
			if (validationResult.factory) {
				workflows.set(name, validationResult.factory);
			}
			// Note: We don't add errors for named exports that aren't valid workflows
			// They might be utility functions, which is fine
		}

		// At least one workflow must be found
		if (workflows.size === 0) {
			errors.push({
				code: PACKAGE_ERROR_CODES.INVALID_EXPORT,
				message: `No valid workflow exports found in ${mainFilePath}. Workflows must export factory functions that return objects with "name" (string) and "build" (function) properties.`,
				path: mainFilePath,
			});
			return { _tag: "err", error: errors };
		}

		return { _tag: "ok", value: workflows };
	}

	/**
	 * Validate a potential workflow factory and extract it if valid.
	 *
	 * @param value - The exported value to validate
	 * @param exportName - The name of the export
	 * @param filePath - The file path for error messages
	 * @returns Object with factory if valid, or error if validation failed
	 */
	private validateAndExtractFactory(
		value: unknown,
		exportName: string,
		filePath: string,
	): { factory?: WorkflowFactory; error?: PackageValidationError } {
		// Check if it's a function
		if (!isWorkflowFactory(value)) {
			return {
				error: {
					code: PACKAGE_ERROR_CODES.INVALID_EXPORT,
					message: `Export "${exportName}" is not a function`,
					field: exportName,
					path: filePath,
					expected: "function",
					actual: typeof value,
				},
			};
		}

		// Try to call the factory and validate the result
		try {
			const workflowDefinition = value();

			if (!isLangGraphWorkflow(workflowDefinition)) {
				return {
					error: {
						code: PACKAGE_ERROR_CODES.INVALID_EXPORT,
						message: `Export "${exportName}" factory does not return a valid workflow definition. Expected an object with "name" (string) and "build" (function) properties.`,
						field: exportName,
						path: filePath,
						expected: "{ name: string, build: function }",
						actual: this.describeValue(workflowDefinition),
					},
				};
			}

			return { factory: value as WorkflowFactory };
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			return {
				error: {
					code: PACKAGE_ERROR_CODES.INVALID_EXPORT,
					message: `Export "${exportName}" factory threw an error when called: ${message}`,
					field: exportName,
					path: filePath,
				},
			};
		}
	}

	/**
	 * Describe a value for error messages.
	 *
	 * @param value - The value to describe
	 * @returns Human-readable description of the value's structure
	 */
	private describeValue(value: unknown): string {
		if (value === null) {
			return "null";
		}
		if (value === undefined) {
			return "undefined";
		}
		if (typeof value !== "object") {
			return typeof value;
		}

		const obj = value as Record<string, unknown>;
		const keys = Object.keys(obj);
		if (keys.length === 0) {
			return "{}";
		}

		const keyDescriptions = keys.slice(0, 3).map((key) => {
			const val = obj[key];
			return `${key}: ${typeof val}`;
		});

		if (keys.length > 3) {
			keyDescriptions.push("...");
		}

		return `{ ${keyDescriptions.join(", ")} }`;
	}

	// ============================================================================
	// Validation Method
	// ============================================================================

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
	async validate(packagePath: string): Promise<PackageValidationResult> {
		return this.validator.validate(packagePath);
	}

	// ============================================================================
	// Package Check Method
	// ============================================================================

	/**
	 * Check if a path represents a valid workflow package or file.
	 *
	 * Quick check without full validation:
	 * - For directories: checks if package.json exists
	 * - For files: checks if it's a .ts file
	 *
	 * @param targetPath - Path to check
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
	async isPackage(targetPath: string): Promise<boolean> {
		const absolutePath = path.resolve(targetPath);

		if (!(await pathExists(absolutePath))) {
			return false;
		}

		if (await isDirectory(absolutePath)) {
			// Check for package.json
			const packageJsonPath = path.join(absolutePath, "package.json");
			return pathExists(packageJsonPath);
		}

		// Check if it's a TypeScript file (legacy single-file workflow)
		return absolutePath.endsWith(".ts");
	}
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new WorkflowPackageLoader instance.
 *
 * @param validator - Optional custom PackageValidator to use
 * @returns A new WorkflowPackageLoader
 *
 * @example
 * ```typescript
 * const loader = createPackageLoader();
 *
 * // Or with a custom validator
 * const customValidator = new PackageValidator();
 * const loader = createPackageLoader(customValidator);
 *
 * const result = await loader.load('./my-package');
 * ```
 */
export function createPackageLoader(
	validator?: PackageValidator,
): WorkflowPackageLoader {
	return new WorkflowPackageLoader(validator);
}
