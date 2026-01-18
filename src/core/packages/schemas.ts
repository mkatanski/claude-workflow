/**
 * Zod schemas for workflow package.json validation.
 *
 * This module provides Zod schemas for validating package.json files
 * in workflow packages, including name, version, and dependency validation.
 */

import { z } from "zod";
import { ResultBox } from "../utils/result/result.js";
import type {
	PackageValidationError,
	PackageValidationErrorCode,
} from "./types.js";

// ============================================================================
// Regex Patterns
// ============================================================================

/**
 * Regex pattern for npm package names.
 *
 * Supports:
 * - Regular names: my-package, my_package, my.package
 * - Scoped names: @org/my-package
 *
 * Rules:
 * - Lowercase letters, numbers, hyphens, underscores, periods
 * - Cannot start with a period or underscore
 * - Scoped packages start with @ followed by scope/name
 */
const NPM_PACKAGE_NAME_PATTERN =
	/^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

/**
 * Regex pattern for semantic versioning.
 *
 * Supports:
 * - Basic version: 1.0.0
 * - Pre-release: 1.0.0-alpha, 1.0.0-beta.1
 * - Build metadata: 1.0.0+build.123
 * - Combined: 1.0.0-alpha.1+build.456
 */
const SEMVER_PATTERN =
	/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

/**
 * Regex pattern for semver ranges.
 *
 * Supports:
 * - Exact: 1.0.0
 * - Caret: ^1.0.0
 * - Tilde: ~1.0.0
 * - Range operators: >=1.0.0, <2.0.0, >=1.0.0 <2.0.0
 * - X-ranges: 1.x, 1.0.x, *
 * - Hyphen ranges: 1.0.0 - 2.0.0
 */
const SEMVER_RANGE_PATTERN =
	/^(\*|[~^]?(0|[1-9]\d*)\.(x|(0|[1-9]\d*))\.(x|(0|[1-9]\d*))?(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?|([<>=]+\s*(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?\s*)+|(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)\s*-\s*(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*))$/;

// ============================================================================
// Base Field Schemas
// ============================================================================

/**
 * Schema for npm package name field.
 *
 * Validates that the name follows npm naming conventions:
 * - Lowercase
 * - Can contain hyphens, underscores, periods
 * - Supports scoped packages (@org/name)
 *
 * @example
 * ```typescript
 * PackageNameSchema.parse("my-package"); // Valid
 * PackageNameSchema.parse("@myorg/my-package"); // Valid
 * PackageNameSchema.parse("Invalid"); // Throws: must be lowercase
 * ```
 */
export const PackageNameSchema = z
	.string()
	.min(1, "Package name cannot be empty")
	.max(214, "Package name cannot exceed 214 characters")
	.regex(NPM_PACKAGE_NAME_PATTERN, {
		message:
			"Package name must be lowercase and follow npm naming conventions (letters, numbers, hyphens, underscores, periods). Scoped packages use @org/name format.",
	});

/**
 * Schema for semantic version field.
 *
 * Validates that the version follows semver format:
 * - MAJOR.MINOR.PATCH
 * - Optional pre-release suffix (-alpha, -beta.1)
 * - Optional build metadata (+build.123)
 *
 * @example
 * ```typescript
 * SemverSchema.parse("1.0.0"); // Valid
 * SemverSchema.parse("2.1.0-beta.1"); // Valid
 * SemverSchema.parse("1.0"); // Throws: must be semver format
 * ```
 */
export const SemverSchema = z.string().regex(SEMVER_PATTERN, {
	message:
		'Version must follow semver format (MAJOR.MINOR.PATCH). Examples: "1.0.0", "2.1.0-beta.1"',
});

/**
 * Schema for semver range in dependencies.
 *
 * Validates that the dependency version is a valid semver range:
 * - Exact version: 1.0.0
 * - Caret range: ^1.0.0
 * - Tilde range: ~1.0.0
 * - Comparison: >=1.0.0
 *
 * @example
 * ```typescript
 * SemverRangeSchema.parse("^1.0.0"); // Valid
 * SemverRangeSchema.parse(">=2.0.0 <3.0.0"); // Valid
 * SemverRangeSchema.parse("invalid"); // Throws: must be valid semver range
 * ```
 */
export const SemverRangeSchema = z.string().regex(SEMVER_RANGE_PATTERN, {
	message:
		'Dependency version must be a valid semver range. Examples: "^1.0.0", "~2.1.0", ">=1.0.0"',
});

/**
 * Schema for main entry file path.
 *
 * Validates that the main field is a valid relative path.
 * Should start with ./ or be a relative path without leading slash.
 *
 * @example
 * ```typescript
 * MainPathSchema.parse("./src/index.ts"); // Valid
 * MainPathSchema.parse("index.ts"); // Valid
 * MainPathSchema.parse("/absolute/path"); // Throws: must be relative
 * ```
 */
export const MainPathSchema = z
	.string()
	.min(1, "Main entry path cannot be empty")
	.refine((path) => !path.startsWith("/"), {
		message: "Main entry path must be relative, not absolute",
	});

// ============================================================================
// Author and Repository Schemas
// ============================================================================

/**
 * Schema for author as an object with name, email, and url.
 */
export const AuthorObjectSchema = z.object({
	/** Author name (required) */
	name: z.string().min(1, "Author name cannot be empty"),
	/** Author email address */
	email: z.string().email("Author email must be valid").optional(),
	/** Author website URL */
	url: z.string().url("Author URL must be valid").optional(),
});

/**
 * Schema for author field (string or object).
 *
 * @example
 * ```typescript
 * AuthorSchema.parse("John Doe"); // Valid
 * AuthorSchema.parse({ name: "John Doe", email: "john@example.com" }); // Valid
 * ```
 */
export const AuthorSchema = z.union([
	z.string().min(1, "Author cannot be empty"),
	AuthorObjectSchema,
]);

/**
 * Schema for repository as an object with type and url.
 */
export const RepositoryObjectSchema = z.object({
	/** Repository type (e.g., "git", "svn") */
	type: z.string().min(1, "Repository type cannot be empty"),
	/** Repository URL */
	url: z.string().min(1, "Repository URL cannot be empty"),
});

/**
 * Schema for repository field (string or object).
 *
 * @example
 * ```typescript
 * RepositorySchema.parse("https://github.com/org/repo"); // Valid
 * RepositorySchema.parse({ type: "git", url: "https://github.com/org/repo.git" }); // Valid
 * ```
 */
export const RepositorySchema = z.union([
	z.string().url("Repository must be a valid URL"),
	RepositoryObjectSchema,
]);

// ============================================================================
// Workflow Metadata Schemas
// ============================================================================

/**
 * Schema for workflow export metadata.
 *
 * Defines metadata for a single workflow export within a package.
 */
export const WorkflowExportMetadataSchema = z.object({
	/** Human-readable description of the workflow */
	description: z.string().min(1, "Workflow description cannot be empty"),
	/** Tags for categorization and discovery */
	tags: z.array(z.string()).optional(),
});

/**
 * Schema for workflows metadata record.
 *
 * Maps export names to their metadata.
 */
export const WorkflowsSchema = z.record(
	z.string(),
	WorkflowExportMetadataSchema,
);

// ============================================================================
// Dependencies Schema
// ============================================================================

/**
 * Schema for dependencies record.
 *
 * Maps package names to semver ranges.
 *
 * @example
 * ```typescript
 * DependenciesSchema.parse({
 *   "@myorg/other-workflow": "^1.0.0",
 *   "shared-utils": "~2.1.0"
 * }); // Valid
 * ```
 */
export const DependenciesSchema = z.record(
	PackageNameSchema,
	SemverRangeSchema,
);

// ============================================================================
// Claude Orchestrator Config Schema
// ============================================================================

/**
 * Schema for external tool requirements.
 */
export const RequiredToolSchema = z.enum(["tmux", "git", "docker"]);

/**
 * Schema for Claude Orchestrator-specific configuration.
 *
 * @example
 * ```typescript
 * ClaudeOrchestratorConfigSchema.parse({
 *   minVersion: "0.5.0",
 *   requires: ["git", "docker"]
 * }); // Valid
 * ```
 */
export const ClaudeOrchestratorConfigSchema = z.object({
	/** Minimum claude-orchestrator version required */
	minVersion: SemverSchema.optional(),
	/** External tools required by the workflows */
	requires: z.array(RequiredToolSchema).optional(),
});

// ============================================================================
// Main Package.json Schema
// ============================================================================

/**
 * Schema for workflow package.json files.
 *
 * Validates the complete structure of a workflow package configuration,
 * including required fields (name, version, main) and optional metadata.
 *
 * @example
 * ```typescript
 * const packageJson = WorkflowPackageJsonSchema.parse({
 *   name: "@myorg/deploy-workflow",
 *   version: "1.0.0",
 *   main: "./src/workflow.ts",
 *   description: "Automated deployment workflow",
 *   keywords: ["deploy", "ci-cd"],
 *   dependencies: {
 *     "@myorg/notify-workflow": "^2.0.0"
 *   }
 * });
 * ```
 */
export const WorkflowPackageJsonSchema = z.object({
	/**
	 * Package name following npm naming conventions.
	 * Supports scoped packages (@org/package-name).
	 */
	name: PackageNameSchema,

	/**
	 * Package version in semver format.
	 */
	version: SemverSchema,

	/**
	 * Relative path to the main entry file.
	 */
	main: MainPathSchema,

	/** Human-readable package description */
	description: z.string().optional(),

	/** Package author information */
	author: AuthorSchema.optional(),

	/** Source repository information */
	repository: RepositorySchema.optional(),

	/** Keywords for package discovery and categorization */
	keywords: z.array(z.string()).optional(),

	/** SPDX license identifier */
	license: z.string().optional(),

	/**
	 * Metadata for workflows exported by this package.
	 * Keys are export names ("default" for default export).
	 */
	workflows: WorkflowsSchema.optional(),

	/**
	 * Dependencies on other workflow packages.
	 * Keys are package names, values are semver ranges.
	 */
	dependencies: DependenciesSchema.optional(),

	/** Claude Orchestrator-specific configuration */
	"claude-orchestrator": ClaudeOrchestratorConfigSchema.optional(),
});

/**
 * TypeScript type inferred from the Zod schema.
 *
 * This type is equivalent to WorkflowPackageJson from types.ts,
 * but is derived from the Zod schema for consistency.
 */
export type WorkflowPackageJsonFromSchema = z.infer<
	typeof WorkflowPackageJsonSchema
>;

// ============================================================================
// Validation Helper Functions
// ============================================================================

/**
 * Check if a string is a valid semantic version.
 *
 * Validates against the full semver specification:
 * - MAJOR.MINOR.PATCH format (required)
 * - Pre-release suffix (optional): -alpha, -beta.1, -rc.2
 * - Build metadata (optional): +build.123
 *
 * @param version - The version string to validate
 * @returns True if the version follows semver format
 *
 * @example
 * ```typescript
 * isValidSemver("1.0.0");           // true
 * isValidSemver("2.1.0-beta.1");    // true
 * isValidSemver("1.0.0+build.123"); // true
 * isValidSemver("1.0");             // false - missing patch
 * isValidSemver("v1.0.0");          // false - no 'v' prefix allowed
 * ```
 */
export function isValidSemver(version: string): boolean {
	return SEMVER_PATTERN.test(version);
}

/**
 * Check if a string is a valid semver range for dependencies.
 *
 * Validates common semver range formats:
 * - Exact version: 1.0.0
 * - Caret range: ^1.0.0
 * - Tilde range: ~1.0.0
 * - Comparison operators: >=1.0.0, <2.0.0
 * - X-ranges: 1.x, 1.0.x, *
 * - Hyphen ranges: 1.0.0 - 2.0.0
 *
 * @param range - The version range string to validate
 * @returns True if the range is a valid semver range
 *
 * @example
 * ```typescript
 * isValidSemverRange("^1.0.0");          // true
 * isValidSemverRange("~2.1.0");          // true
 * isValidSemverRange(">=1.0.0 <2.0.0");  // true
 * isValidSemverRange("*");               // true
 * isValidSemverRange("invalid");         // false
 * ```
 */
export function isValidSemverRange(range: string): boolean {
	return SEMVER_RANGE_PATTERN.test(range);
}

/**
 * Check if a string is a valid npm package name.
 *
 * Validates against npm naming conventions:
 * - Lowercase letters, numbers, hyphens, underscores, periods
 * - Cannot start with a period or underscore
 * - Supports scoped packages: @org/package-name
 * - Maximum 214 characters
 *
 * @param name - The package name to validate
 * @returns True if the name follows npm naming conventions
 *
 * @example
 * ```typescript
 * isValidPackageName("my-package");        // true
 * isValidPackageName("@myorg/my-package"); // true
 * isValidPackageName("MyPackage");         // false - must be lowercase
 * isValidPackageName("_private");          // false - cannot start with _
 * ```
 */
export function isValidPackageName(name: string): boolean {
	if (name.length === 0 || name.length > 214) {
		return false;
	}
	return NPM_PACKAGE_NAME_PATTERN.test(name);
}

// ============================================================================
// Package.json Validation Function
// ============================================================================

/**
 * Map Zod error codes to PackageValidationErrorCode.
 *
 * @param zodCode - The Zod issue code
 * @param path - The field path from the Zod error
 * @returns The appropriate PackageValidationErrorCode
 */
function mapZodErrorCode(
	zodCode: z.ZodIssueCode,
	path: (string | number)[],
): PackageValidationErrorCode {
	const fieldName = path[0]?.toString() ?? "";

	// Check for specific field errors
	if (fieldName === "name") {
		return "INVALID_NAME";
	}
	if (fieldName === "version") {
		return "INVALID_VERSION";
	}
	if (fieldName === "main") {
		return "INVALID_MAIN_PATH";
	}
	if (fieldName === "dependencies") {
		return "INVALID_DEPENDENCY";
	}

	// Map by Zod error type
	switch (zodCode) {
		case z.ZodIssueCode.invalid_type:
			if (path.length === 0) {
				return "INVALID_JSON";
			}
			return "MISSING_REQUIRED_FIELD";
		case z.ZodIssueCode.invalid_string:
			return "INVALID_NAME";
		default:
			return "MISSING_REQUIRED_FIELD";
	}
}

/**
 * Convert a Zod issue to a PackageValidationError.
 *
 * @param issue - The Zod validation issue
 * @returns A PackageValidationError with appropriate code and message
 */
function zodIssueToValidationError(issue: z.ZodIssue): PackageValidationError {
	const path = issue.path.join(".");
	const code = mapZodErrorCode(issue.code, issue.path);
	const fieldName = issue.path[0]?.toString();

	return {
		code,
		message: issue.message,
		field: fieldName,
		path: path || undefined,
	};
}

/**
 * Validate package.json data against the WorkflowPackageJsonSchema.
 *
 * Parses and validates the data using Zod, converting any validation
 * errors to PackageValidationError format with appropriate error codes.
 *
 * @param data - The data to validate (typically parsed JSON)
 * @returns ResultBox with validated data or array of validation errors
 *
 * @example
 * ```typescript
 * const data = JSON.parse(content);
 * const result = validatePackageJson(data);
 *
 * if (result.isOk()) {
 *   const packageJson = result.unwrap();
 *   console.log(packageJson.name);    // Validated package name
 *   console.log(packageJson.version); // Validated semver version
 * } else {
 *   const errors = result.unwrapErr();
 *   for (const error of errors) {
 *     console.error(`${error.code}: ${error.message} (field: ${error.field})`);
 *   }
 * }
 * ```
 *
 * @example
 * ```typescript
 * // With safe parsing from JSON string
 * const parseResult = safeParsePackageJson('{"name": "invalid"}');
 * if (parseResult.isErr()) {
 *   // Handle parse or validation errors
 * }
 * ```
 */
export function validatePackageJson(
	data: unknown,
): ResultBox<WorkflowPackageJsonFromSchema, PackageValidationError[]> {
	const result = WorkflowPackageJsonSchema.safeParse(data);

	if (result.success) {
		return ResultBox.ok(result.data);
	}

	// Convert Zod errors to PackageValidationError format
	const errors: PackageValidationError[] = result.error.issues.map(
		zodIssueToValidationError,
	);

	return ResultBox.err(errors);
}

/**
 * Parse a JSON string and validate it as a package.json.
 *
 * Combines JSON parsing and schema validation in a single operation.
 * Returns appropriate error codes for both parse and validation failures.
 *
 * @param jsonString - The JSON string to parse and validate
 * @returns ResultBox with validated data or array of validation errors
 *
 * @example
 * ```typescript
 * const result = safeParsePackageJson(fileContent);
 *
 * if (result.isOk()) {
 *   const packageJson = result.unwrap();
 *   // Use validated package.json
 * } else {
 *   const errors = result.unwrapErr();
 *   // First error might be INVALID_JSON if parsing failed
 * }
 * ```
 */
export function safeParsePackageJson(
	jsonString: string,
): ResultBox<WorkflowPackageJsonFromSchema, PackageValidationError[]> {
	let parsed: unknown;

	try {
		parsed = JSON.parse(jsonString);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Invalid JSON syntax";
		const parseError: PackageValidationError = {
			code: "INVALID_JSON",
			message: `Failed to parse package.json: ${message}`,
		};
		return ResultBox.err([parseError]);
	}

	return validatePackageJson(parsed);
}
