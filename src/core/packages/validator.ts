/**
 * Package validation for workflow packages.
 *
 * This module provides validation logic for workflow packages, including:
 * - Structure validation (package.json exists, main file exists)
 * - Schema validation using Zod schemas
 * - Dependency validation with semver range checking
 *
 * @example
 * ```typescript
 * const validator = new PackageValidator();
 *
 * // Validate a package directory
 * const result = await validator.validate('./my-package');
 * if (result.valid) {
 *   console.log('Package is valid');
 *   console.log(result.packageJson?.name);
 * } else {
 *   for (const error of result.errors) {
 *     console.error(`${error.code}: ${error.message}`);
 *   }
 * }
 * ```
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { isLangGraphWorkflow } from "../graph/types.ts";
import { isValidSemverRange, validatePackageJson } from "./schemas.js";
import type {
	PackageValidationError,
	PackageValidationResult,
	PackageValidationWarning,
	WorkflowPackageJson,
} from "./types.js";
import {
	isWorkflowFactory,
	PACKAGE_ERROR_CODES,
	PACKAGE_WARNING_CODES,
} from "./types.js";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a file or directory exists.
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

/**
 * Read and parse a JSON file.
 *
 * @param filePath - Path to the JSON file
 * @returns Parsed JSON data or null if failed
 */
async function readJsonFile(filePath: string): Promise<{
	data: unknown;
	error?: string;
}> {
	try {
		const content = await fs.readFile(filePath, "utf-8");
		const data = JSON.parse(content) as unknown;
		return { data };
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		return { data: null, error: message };
	}
}

// ============================================================================
// PackageValidator Class
// ============================================================================

/**
 * Validator for workflow packages.
 *
 * Provides comprehensive validation of workflow packages including:
 * - Structure validation (file existence)
 * - Schema validation (package.json format)
 * - Dependency validation (semver ranges)
 * - Warning generation for best practices
 *
 * @example
 * ```typescript
 * const validator = new PackageValidator();
 *
 * // Full validation
 * const result = await validator.validate('./my-package');
 *
 * // Structure-only validation
 * const structureResult = await validator.validateStructure('./my-package');
 *
 * // Schema-only validation
 * const schemaResult = validator.validateSchema(packageJsonData);
 * ```
 */
export class PackageValidator {
	// ============================================================================
	// Structure Validation
	// ============================================================================

	/**
	 * Validate the structure of a package directory.
	 *
	 * Checks that:
	 * - The package path exists and is a directory
	 * - package.json exists in the directory
	 * - The main entry file exists
	 *
	 * Does NOT validate the content of package.json (use validateSchema for that).
	 *
	 * @param packagePath - Path to the package directory
	 * @returns Validation result with structure-related errors
	 *
	 * @example
	 * ```typescript
	 * const result = await validator.validateStructure('./my-package');
	 * if (!result.valid) {
	 *   // Check for missing package.json or main file
	 *   for (const error of result.errors) {
	 *     console.error(error.message);
	 *   }
	 * }
	 * ```
	 */
	async validateStructure(
		packagePath: string,
	): Promise<PackageValidationResult> {
		const errors: PackageValidationError[] = [];
		const warnings: PackageValidationWarning[] = [];
		const absolutePath = path.resolve(packagePath);

		// Check if path exists
		if (!(await pathExists(absolutePath))) {
			errors.push({
				code: PACKAGE_ERROR_CODES.MISSING_ENTRY_FILE,
				message: `Package path does not exist: ${absolutePath}`,
				path: absolutePath,
			});
			return { valid: false, errors, warnings, packagePath: absolutePath };
		}

		// Check if path is a directory
		if (!(await isDirectory(absolutePath))) {
			// For single files, this is a legacy workflow (not a package)
			// We don't error, but also can't validate as a package
			return { valid: true, errors, warnings, packagePath: absolutePath };
		}

		// Check for package.json
		const packageJsonPath = path.join(absolutePath, "package.json");
		if (!(await pathExists(packageJsonPath))) {
			errors.push({
				code: PACKAGE_ERROR_CODES.INVALID_JSON,
				message: `package.json not found in ${absolutePath}. Create a package.json file with name, version, and main fields.`,
				path: packageJsonPath,
			});
			return { valid: false, errors, warnings, packagePath: absolutePath };
		}

		// Read package.json to check main field
		const { data, error: readError } = await readJsonFile(packageJsonPath);
		if (readError || !data) {
			errors.push({
				code: PACKAGE_ERROR_CODES.INVALID_JSON,
				message: `Failed to parse package.json: ${readError ?? "Unknown error"}`,
				path: packageJsonPath,
			});
			return { valid: false, errors, warnings, packagePath: absolutePath };
		}

		// Check if main field exists and file exists
		const packageData = data as Record<string, unknown>;
		if (typeof packageData.main === "string") {
			const mainPath = path.join(absolutePath, packageData.main);
			if (!(await pathExists(mainPath))) {
				errors.push({
					code: PACKAGE_ERROR_CODES.MISSING_ENTRY_FILE,
					message: `Main entry file not found: ${packageData.main}. Ensure the "main" field in package.json points to an existing file.`,
					field: "main",
					path: mainPath,
					expected: "Existing file",
					actual: "File not found",
				});
			}
		}

		return {
			valid: errors.length === 0,
			errors,
			warnings,
			packagePath: absolutePath,
		};
	}

	// ============================================================================
	// Schema Validation
	// ============================================================================

	/**
	 * Validate package.json data against the schema.
	 *
	 * Uses Zod schemas to validate:
	 * - Required fields (name, version, main)
	 * - Field formats (semver, npm naming, relative paths)
	 * - Optional field structures (author, repository, dependencies)
	 *
	 * @param data - The parsed package.json data
	 * @returns Validation result with schema-related errors and warnings
	 *
	 * @example
	 * ```typescript
	 * const packageJson = JSON.parse(fileContent);
	 * const result = validator.validateSchema(packageJson);
	 * if (result.valid) {
	 *   console.log('Package name:', result.packageJson?.name);
	 * }
	 * ```
	 */
	validateSchema(data: unknown): PackageValidationResult {
		const errors: PackageValidationError[] = [];
		const warnings: PackageValidationWarning[] = [];

		// Validate against Zod schema
		const result = validatePackageJson(data);

		if (result.isErr()) {
			// Add all Zod validation errors
			errors.push(...result.unwrapErr());
			return { valid: false, errors, warnings };
		}

		const packageJson = result.unwrap() as WorkflowPackageJson;

		// Generate warnings for missing optional but recommended fields
		this.addRecommendationWarnings(packageJson, warnings);

		return {
			valid: true,
			errors,
			warnings,
			packageJson,
		};
	}

	/**
	 * Add warnings for missing recommended fields.
	 *
	 * @param packageJson - The validated package.json
	 * @param warnings - Array to push warnings to
	 */
	private addRecommendationWarnings(
		packageJson: WorkflowPackageJson,
		warnings: PackageValidationWarning[],
	): void {
		if (!packageJson.description) {
			warnings.push({
				code: PACKAGE_WARNING_CODES.MISSING_DESCRIPTION,
				message:
					"Package description is missing. Adding a description helps users understand what this package does.",
				field: "description",
				suggestion: 'Add a "description" field to package.json',
			});
		}

		if (!packageJson.license) {
			warnings.push({
				code: PACKAGE_WARNING_CODES.MISSING_LICENSE,
				message:
					"License field is missing. Consider specifying a license for your package.",
				field: "license",
				suggestion: 'Add a "license" field (e.g., "MIT", "Apache-2.0")',
			});
		}

		if (!packageJson.author) {
			warnings.push({
				code: PACKAGE_WARNING_CODES.MISSING_AUTHOR,
				message:
					"Author information is missing. Adding author details helps with attribution.",
				field: "author",
				suggestion: 'Add an "author" field with name and optional email/url',
			});
		}

		if (!packageJson.workflows) {
			warnings.push({
				code: PACKAGE_WARNING_CODES.MISSING_WORKFLOWS,
				message:
					"Workflows metadata is missing. Adding workflow descriptions helps with discovery.",
				field: "workflows",
				suggestion: 'Add a "workflows" field documenting exported workflows',
			});
		}
	}

	// ============================================================================
	// Dependency Validation
	// ============================================================================

	/**
	 * Validate package dependencies.
	 *
	 * Checks that:
	 * - All dependency version ranges are valid semver
	 * - No circular dependencies exist (when dependencyChain is provided)
	 *
	 * @param dependencies - The dependencies object from package.json
	 * @param packageName - The name of the current package (for circular detection)
	 * @param dependencyChain - Set of package names in the current dependency chain
	 * @returns Array of validation errors for invalid dependencies
	 *
	 * @example
	 * ```typescript
	 * const errors = validator.validateDependencies(
	 *   { "@myorg/other": "^1.0.0" },
	 *   "my-package",
	 *   new Set()
	 * );
	 * ```
	 */
	validateDependencies(
		dependencies: Record<string, string> | undefined,
		packageName?: string,
		dependencyChain: Set<string> = new Set(),
	): PackageValidationError[] {
		const errors: PackageValidationError[] = [];

		if (!dependencies) {
			return errors;
		}

		// Check for circular dependency with current package
		if (packageName && dependencyChain.has(packageName)) {
			errors.push({
				code: PACKAGE_ERROR_CODES.CIRCULAR_DEPENDENCY,
				message: `Circular dependency detected: ${[...dependencyChain, packageName].join(" -> ")}`,
				field: "dependencies",
			});
			return errors;
		}

		// Validate each dependency
		for (const [depName, versionRange] of Object.entries(dependencies)) {
			// Check semver range validity
			if (!isValidSemverRange(versionRange)) {
				errors.push({
					code: PACKAGE_ERROR_CODES.INVALID_DEPENDENCY,
					message: `Invalid version range for dependency "${depName}": "${versionRange}". Use valid semver range (e.g., "^1.0.0", "~2.1.0").`,
					field: `dependencies.${depName}`,
					expected: "Valid semver range",
					actual: versionRange,
				});
			}

			// Check for self-dependency
			if (packageName && depName === packageName) {
				errors.push({
					code: PACKAGE_ERROR_CODES.CIRCULAR_DEPENDENCY,
					message: `Package "${packageName}" cannot depend on itself`,
					field: `dependencies.${depName}`,
				});
			}
		}

		return errors;
	}

	/**
	 * Detect circular dependencies in a dependency graph.
	 *
	 * Uses depth-first search (DFS) with three-state coloring to detect cycles:
	 * - WHITE (0): Node not visited
	 * - GRAY (1): Node being processed (in current DFS path)
	 * - BLACK (2): Node fully processed
	 *
	 * A cycle is detected when we encounter a GRAY node during DFS.
	 *
	 * @param dependencyGraph - Map of package names to their dependency names
	 * @returns Array of validation errors for each circular dependency detected
	 *
	 * @example
	 * ```typescript
	 * const graph = new Map([
	 *   ["package-a", ["package-b"]],
	 *   ["package-b", ["package-c"]],
	 *   ["package-c", ["package-a"]], // Creates cycle: a -> b -> c -> a
	 * ]);
	 *
	 * const errors = validator.detectCircularDependencies(graph);
	 * // errors[0].message: "Circular dependency detected: package-a -> package-b -> package-c -> package-a"
	 * ```
	 */
	detectCircularDependencies(
		dependencyGraph: Map<string, string[]>,
	): PackageValidationError[] {
		const errors: PackageValidationError[] = [];

		// Three-state coloring for cycle detection
		const WHITE = 0; // Not visited
		const GRAY = 1; // In current DFS path
		const BLACK = 2; // Fully processed

		const color = new Map<string, number>();

		// Initialize all nodes as WHITE
		for (const pkg of dependencyGraph.keys()) {
			color.set(pkg, WHITE);
		}

		/**
		 * DFS helper function that returns a cycle path if found.
		 *
		 * @param node - Current node being visited
		 * @param path - Current DFS path for error reporting
		 * @returns Cycle path if found, null otherwise
		 */
		const dfs = (node: string, path: string[]): string[] | null => {
			const nodeColor = color.get(node);

			// If node is GRAY, we found a cycle
			if (nodeColor === GRAY) {
				// Find where the cycle starts in the path
				const cycleStart = path.indexOf(node);
				return [...path.slice(cycleStart), node];
			}

			// If node is BLACK, skip (already fully processed)
			if (nodeColor === BLACK) {
				return null;
			}

			// Mark node as GRAY (being processed)
			color.set(node, GRAY);
			path.push(node);

			// Visit all dependencies
			const dependencies = dependencyGraph.get(node) ?? [];
			for (const dep of dependencies) {
				// Only visit nodes that are in the graph (known packages)
				if (dependencyGraph.has(dep)) {
					const cyclePath = dfs(dep, path);
					if (cyclePath) {
						return cyclePath;
					}
				}
			}

			// Mark node as BLACK (fully processed)
			color.set(node, BLACK);
			path.pop();

			return null;
		};

		// Run DFS from each unvisited node
		for (const pkg of dependencyGraph.keys()) {
			if (color.get(pkg) === WHITE) {
				const cyclePath = dfs(pkg, []);
				if (cyclePath) {
					errors.push({
						code: PACKAGE_ERROR_CODES.CIRCULAR_DEPENDENCY,
						message: `Circular dependency detected: ${cyclePath.join(" -> ")}`,
						field: "dependencies",
					});

					// Reset colors to find other cycles
					// Mark all nodes in the cycle as BLACK to avoid reporting same cycle
					for (const node of cyclePath) {
						color.set(node, BLACK);
					}
				}
			}
		}

		return errors;
	}

	/**
	 * Build a dependency graph from a collection of packages.
	 *
	 * Creates a Map where keys are package names and values are arrays of
	 * dependency names. This graph can be used with detectCircularDependencies().
	 *
	 * @param packages - Array of package.json data objects to build graph from
	 * @returns Map of package names to their dependency names
	 *
	 * @example
	 * ```typescript
	 * const packages = [
	 *   { name: "pkg-a", version: "1.0.0", main: "./index.ts", dependencies: { "pkg-b": "^1.0.0" } },
	 *   { name: "pkg-b", version: "1.0.0", main: "./index.ts", dependencies: { "pkg-c": "^1.0.0" } },
	 *   { name: "pkg-c", version: "1.0.0", main: "./index.ts" },
	 * ];
	 *
	 * const graph = validator.buildDependencyGraph(packages);
	 * // Map { "pkg-a" => ["pkg-b"], "pkg-b" => ["pkg-c"], "pkg-c" => [] }
	 * ```
	 */
	buildDependencyGraph(packages: WorkflowPackageJson[]): Map<string, string[]> {
		const graph = new Map<string, string[]>();

		for (const pkg of packages) {
			const deps = pkg.dependencies ? Object.keys(pkg.dependencies) : [];
			graph.set(pkg.name, deps);
		}

		return graph;
	}

	/**
	 * Validate dependencies across multiple packages for circular dependencies.
	 *
	 * Combines dependency graph building and circular detection into a single
	 * convenient method for validating a collection of packages (e.g., a monorepo
	 * or a set of packages being installed together).
	 *
	 * @param packages - Array of package.json data objects to validate
	 * @returns Validation result with any circular dependency errors
	 *
	 * @example
	 * ```typescript
	 * const packages = await Promise.all(
	 *   packagePaths.map(path => loadPackageJson(path))
	 * );
	 *
	 * const result = validator.validateDependencyGraph(packages);
	 * if (!result.valid) {
	 *   for (const error of result.errors) {
	 *     console.error(`Circular dependency: ${error.message}`);
	 *   }
	 * }
	 * ```
	 */
	validateDependencyGraph(
		packages: WorkflowPackageJson[],
	): PackageValidationResult {
		const errors: PackageValidationError[] = [];
		const warnings: PackageValidationWarning[] = [];

		// First, validate each package's dependencies individually
		for (const pkg of packages) {
			const depErrors = this.validateDependencies(pkg.dependencies, pkg.name);
			errors.push(...depErrors);
		}

		// Then check for circular dependencies across the graph
		const graph = this.buildDependencyGraph(packages);
		const circularErrors = this.detectCircularDependencies(graph);
		errors.push(...circularErrors);

		return {
			valid: errors.length === 0,
			errors,
			warnings,
		};
	}

	// ============================================================================
	// Export Validation
	// ============================================================================

	/**
	 * Validate workflow exports from a package's main entry file.
	 *
	 * Dynamically imports the main entry file and validates that:
	 * - The file can be imported without errors
	 * - The default export (if present) is a valid workflow factory function
	 * - Named exports (if present) that are functions return valid workflow definitions
	 *
	 * A valid workflow factory function:
	 * - Is a callable function
	 * - Returns an object with a `name` string property
	 * - Returns an object with a `build` function property
	 *
	 * @param mainFilePath - Absolute path to the main entry file
	 * @param expectedExports - Optional array of export names to validate (from workflows metadata)
	 * @returns Validation result with export-related errors
	 *
	 * @example
	 * ```typescript
	 * const result = await validator.validateExports(
	 *   '/path/to/package/src/index.ts',
	 *   ['default', 'deploy', 'rollback']
	 * );
	 * if (!result.valid) {
	 *   for (const error of result.errors) {
	 *     console.error(`Export validation failed: ${error.message}`);
	 *   }
	 * }
	 * ```
	 */
	async validateExports(
		mainFilePath: string,
		expectedExports?: string[],
	): Promise<PackageValidationResult> {
		const errors: PackageValidationError[] = [];
		const warnings: PackageValidationWarning[] = [];

		// Import the module dynamically
		let moduleExports: Record<string, unknown>;
		try {
			moduleExports = (await import(mainFilePath)) as Record<string, unknown>;
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			errors.push({
				code: PACKAGE_ERROR_CODES.INVALID_EXPORT,
				message: `Failed to import main entry file: ${message}`,
				path: mainFilePath,
			});
			return { valid: false, errors, warnings };
		}

		// Determine which exports to validate
		const exportsToValidate =
			expectedExports ?? this.getExportNames(moduleExports);

		// Validate each export
		for (const exportName of exportsToValidate) {
			const exportValue =
				exportName === "default"
					? moduleExports.default
					: moduleExports[exportName];

			if (exportValue === undefined) {
				// Export is expected but not found
				if (expectedExports) {
					errors.push({
						code: PACKAGE_ERROR_CODES.INVALID_EXPORT,
						message: `Expected export "${exportName}" not found in ${mainFilePath}`,
						field: exportName,
						path: mainFilePath,
					});
				}
				continue;
			}

			// Check if the export is a function
			if (!isWorkflowFactory(exportValue)) {
				errors.push({
					code: PACKAGE_ERROR_CODES.INVALID_EXPORT,
					message: `Export "${exportName}" is not a function. Workflow exports must be factory functions that return workflow definitions.`,
					field: exportName,
					path: mainFilePath,
					expected: "function",
					actual: typeof exportValue,
				});
				continue;
			}

			// Try to call the factory function and validate the result
			try {
				const workflowDefinition = exportValue();

				if (!isLangGraphWorkflow(workflowDefinition)) {
					errors.push({
						code: PACKAGE_ERROR_CODES.INVALID_EXPORT,
						message: `Export "${exportName}" factory does not return a valid workflow definition. Expected an object with "name" (string) and "build" (function) properties.`,
						field: exportName,
						path: mainFilePath,
						expected: "{ name: string, build: function }",
						actual: this.describeValue(workflowDefinition),
					});
				}
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Unknown error";
				errors.push({
					code: PACKAGE_ERROR_CODES.INVALID_EXPORT,
					message: `Export "${exportName}" factory threw an error when called: ${message}`,
					field: exportName,
					path: mainFilePath,
				});
			}
		}

		return {
			valid: errors.length === 0,
			errors,
			warnings,
		};
	}

	/**
	 * Get export names from a module, filtering for potential workflow factories.
	 *
	 * @param moduleExports - The module's exports object
	 * @returns Array of export names that could be workflow factories
	 */
	private getExportNames(moduleExports: Record<string, unknown>): string[] {
		const names: string[] = [];

		// Check default export
		if (moduleExports.default !== undefined) {
			names.push("default");
		}

		// Check named exports that are functions
		for (const [name, value] of Object.entries(moduleExports)) {
			if (name !== "default" && typeof value === "function") {
				names.push(name);
			}
		}

		return names;
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
	// Combined Validation
	// ============================================================================

	/**
	 * Perform full validation of a package.
	 *
	 * Combines structure, schema, and dependency validation:
	 * 1. Validates package directory structure
	 * 2. Reads and parses package.json
	 * 3. Validates package.json against schema
	 * 4. Validates dependencies
	 * 5. Generates warnings for best practices
	 *
	 * @param packagePath - Path to the package directory
	 * @returns Complete validation result with all errors and warnings
	 *
	 * @example
	 * ```typescript
	 * const result = await validator.validate('./my-package');
	 *
	 * if (result.valid) {
	 *   console.log('Package is valid!');
	 *   console.log('Name:', result.packageJson?.name);
	 *   console.log('Version:', result.packageJson?.version);
	 *
	 *   // Check for warnings
	 *   if (result.warnings.length > 0) {
	 *     console.log('Warnings:');
	 *     for (const warning of result.warnings) {
	 *       console.log(`  ${warning.code}: ${warning.message}`);
	 *     }
	 *   }
	 * } else {
	 *   console.error('Validation failed:');
	 *   for (const error of result.errors) {
	 *     console.error(`  ${error.code}: ${error.message}`);
	 *   }
	 * }
	 * ```
	 */
	async validate(packagePath: string): Promise<PackageValidationResult> {
		const absolutePath = path.resolve(packagePath);
		const allErrors: PackageValidationError[] = [];
		const allWarnings: PackageValidationWarning[] = [];

		// Step 1: Validate structure
		const structureResult = await this.validateStructure(packagePath);
		allErrors.push(...structureResult.errors);
		allWarnings.push(...structureResult.warnings);

		// If structure validation failed, stop here
		if (!structureResult.valid) {
			return {
				valid: false,
				errors: allErrors,
				warnings: allWarnings,
				packagePath: absolutePath,
			};
		}

		// Check if this is a directory (package) or file (legacy workflow)
		if (!(await isDirectory(absolutePath))) {
			// Legacy single-file workflow - no further validation needed
			return {
				valid: true,
				errors: allErrors,
				warnings: allWarnings,
				packagePath: absolutePath,
			};
		}

		// Step 2: Read and parse package.json
		const packageJsonPath = path.join(absolutePath, "package.json");
		const { data, error: readError } = await readJsonFile(packageJsonPath);

		if (readError || !data) {
			allErrors.push({
				code: PACKAGE_ERROR_CODES.INVALID_JSON,
				message: `Failed to read package.json: ${readError ?? "Unknown error"}`,
				path: packageJsonPath,
			});
			return {
				valid: false,
				errors: allErrors,
				warnings: allWarnings,
				packagePath: absolutePath,
			};
		}

		// Step 3: Validate schema
		const schemaResult = this.validateSchema(data);
		allErrors.push(...schemaResult.errors);
		allWarnings.push(...schemaResult.warnings);

		if (!schemaResult.valid) {
			return {
				valid: false,
				errors: allErrors,
				warnings: allWarnings,
				packagePath: absolutePath,
			};
		}

		const packageJson = schemaResult.packageJson as WorkflowPackageJson;

		// Step 4: Validate dependencies
		const depErrors = this.validateDependencies(
			packageJson.dependencies,
			packageJson.name,
		);
		allErrors.push(...depErrors);

		return {
			valid: allErrors.length === 0,
			errors: allErrors,
			warnings: allWarnings,
			packageJson,
			packagePath: absolutePath,
		};
	}

	// ============================================================================
	// Utility Methods
	// ============================================================================

	/**
	 * Quick check if a path could be a valid package.
	 *
	 * Performs a fast check without full validation:
	 * - For directories: checks if package.json exists
	 * - For files: checks if it's a .ts file
	 *
	 * @param targetPath - Path to check
	 * @returns True if the path could be a valid package or workflow
	 *
	 * @example
	 * ```typescript
	 * if (await validator.isPackage('./my-package')) {
	 *   const result = await validator.validate('./my-package');
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

	/**
	 * Format validation result as a human-readable string.
	 *
	 * @param result - The validation result to format
	 * @returns Formatted string representation
	 *
	 * @example
	 * ```typescript
	 * const result = await validator.validate('./my-package');
	 * console.log(validator.formatResult(result));
	 * ```
	 */
	formatResult(result: PackageValidationResult): string {
		const lines: string[] = [];

		if (result.valid) {
			lines.push("✓ Package is valid");
			if (result.packageJson) {
				lines.push(`  Name: ${result.packageJson.name}`);
				lines.push(`  Version: ${result.packageJson.version}`);
			}
		} else {
			lines.push("✗ Package validation failed");
		}

		if (result.errors.length > 0) {
			lines.push("");
			lines.push("Errors:");
			for (const error of result.errors) {
				lines.push(`  • [${error.code}] ${error.message}`);
				if (error.field) {
					lines.push(`    Field: ${error.field}`);
				}
			}
		}

		if (result.warnings.length > 0) {
			lines.push("");
			lines.push("Warnings:");
			for (const warning of result.warnings) {
				lines.push(`  • [${warning.code}] ${warning.message}`);
				if (warning.suggestion) {
					lines.push(`    Suggestion: ${warning.suggestion}`);
				}
			}
		}

		return lines.join("\n");
	}
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new PackageValidator instance.
 *
 * @returns A new PackageValidator
 *
 * @example
 * ```typescript
 * const validator = createPackageValidator();
 * const result = await validator.validate('./my-package');
 * ```
 */
export function createPackageValidator(): PackageValidator {
	return new PackageValidator();
}
