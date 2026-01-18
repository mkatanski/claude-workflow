/**
 * Workflow reference parser for workflow composition.
 *
 * This module parses workflow reference strings into structured
 * ParsedWorkflowReference objects, supporting:
 * - Simple names: `my-workflow`
 * - Version ranges: `my-workflow@^1.0.0`
 * - Named exports: `my-workflow:analyzeCode`
 * - Combined: `my-workflow@^1.0.0:analyzeCode`
 * - Scoped packages: `@myorg/my-workflow`
 * - Scoped with version and export: `@myorg/my-workflow@^1.0.0:analyzeCode`
 *
 * Reference format: `name[@version][:export]`
 *
 * @example
 * ```typescript
 * import { parseWorkflowReference, formatWorkflowReference } from "./reference.js";
 *
 * // Parse a reference string
 * const result = parseWorkflowReference("my-workflow@^1.0.0:analyze");
 * if (result.success) {
 *   console.log(result.value); // { name: "my-workflow", version: "^1.0.0", export: "analyze" }
 * }
 *
 * // Format a reference back to string
 * const str = formatWorkflowReference({ name: "my-workflow", version: "^1.0.0" });
 * // => "my-workflow@^1.0.0"
 * ```
 */

import type { ParsedWorkflowReference, WorkflowCallError } from "./types.js";

// ============================================================================
// Constants
// ============================================================================

/**
 * Pattern for valid npm package name characters.
 *
 * Package names can contain lowercase letters, numbers, hyphens, dots,
 * underscores, and tildes. Scoped packages additionally have `@scope/` prefix.
 */
const PACKAGE_NAME_PATTERN =
	/^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/i;

/**
 * Pattern for valid export names.
 *
 * Export names follow JavaScript identifier rules with some flexibility
 * for hyphens (kebab-case).
 */
const EXPORT_NAME_PATTERN = /^[a-zA-Z_$][a-zA-Z0-9_$-]*$/;

// ============================================================================
// Result Types
// ============================================================================

/**
 * Result of parsing a workflow reference string.
 *
 * Uses a success/failure pattern to avoid exceptions.
 */
export type ParseWorkflowReferenceResult =
	| { success: true; value: ParsedWorkflowReference }
	| { success: false; error: WorkflowCallError };

// ============================================================================
// Parser Implementation
// ============================================================================

/**
 * Parse a workflow reference string into a structured ParsedWorkflowReference.
 *
 * Supports multiple reference formats:
 * - `name` - Simple workflow name
 * - `name@version` - Workflow with version range
 * - `name:export` - Workflow with named export
 * - `name@version:export` - Workflow with version and export
 * - `@scope/name` - Scoped package
 * - `@scope/name@version:export` - Scoped package full reference
 *
 * @param reference - The reference string to parse
 * @returns Result containing parsed reference or error
 *
 * @example
 * ```typescript
 * // Simple name
 * parseWorkflowReference("planning");
 * // => { success: true, value: { name: "planning" } }
 *
 * // With version
 * parseWorkflowReference("planning@^1.0.0");
 * // => { success: true, value: { name: "planning", version: "^1.0.0" } }
 *
 * // Scoped with export
 * parseWorkflowReference("@myorg/tools:refactor");
 * // => { success: true, value: { name: "@myorg/tools", export: "refactor" } }
 *
 * // Full reference
 * parseWorkflowReference("@myorg/deploy@~2.0.0:rollback");
 * // => { success: true, value: { name: "@myorg/deploy", version: "~2.0.0", export: "rollback" } }
 * ```
 */
export function parseWorkflowReference(
	reference: string,
): ParseWorkflowReferenceResult {
	// Validate input
	if (!reference || typeof reference !== "string") {
		return createParseError("Reference string cannot be empty");
	}

	const trimmed = reference.trim();
	if (trimmed.length === 0) {
		return createParseError("Reference string cannot be empty or whitespace");
	}

	// Parse the reference parts
	let remaining = trimmed;
	let name: string;
	let version: string | undefined;
	let exportName: string | undefined;

	// Step 1: Extract the package name (handles scoped packages)
	const nameResult = extractPackageName(remaining);
	if (!nameResult.valid) {
		return createParseError(nameResult.error ?? "Invalid package name");
	}
	name = nameResult.name;
	remaining = nameResult.remaining;

	// Step 2: Extract version if present (starts with @)
	if (remaining.startsWith("@")) {
		const versionResult = extractVersion(remaining);
		if (!versionResult.valid) {
			return createParseError(
				versionResult.error ?? "Invalid version specification",
			);
		}
		version = versionResult.version;
		remaining = versionResult.remaining;
	}

	// Step 3: Extract export if present (starts with :)
	if (remaining.startsWith(":")) {
		const exportResult = extractExport(remaining);
		if (!exportResult.valid) {
			return createParseError(exportResult.error ?? "Invalid export name");
		}
		exportName = exportResult.export;
		remaining = exportResult.remaining;
	}

	// Step 4: Verify nothing remaining
	if (remaining.length > 0) {
		return createParseError(
			`Unexpected characters in reference: "${remaining}"`,
		);
	}

	// Validate the complete package name
	if (!isValidPackageName(name)) {
		return createParseError(
			`Invalid package name "${name}". Package names must follow npm naming conventions.`,
		);
	}

	// Build the result
	const result: ParsedWorkflowReference = { name };

	if (version !== undefined) {
		result.version = version;
	}

	if (exportName !== undefined) {
		result.export = exportName;
	}

	return { success: true, value: result };
}

/**
 * Format a ParsedWorkflowReference back into a reference string.
 *
 * @param ref - The parsed reference to format
 * @returns The formatted reference string
 *
 * @example
 * ```typescript
 * formatWorkflowReference({ name: "planning", version: "^1.0.0" });
 * // => "planning@^1.0.0"
 *
 * formatWorkflowReference({ name: "@myorg/tools", export: "refactor" });
 * // => "@myorg/tools:refactor"
 *
 * formatWorkflowReference({ name: "deploy", version: "~2.0.0", export: "rollback" });
 * // => "deploy@~2.0.0:rollback"
 * ```
 */
export function formatWorkflowReference(ref: ParsedWorkflowReference): string {
	let result = ref.name;

	if (ref.version !== undefined) {
		result += `@${ref.version}`;
	}

	if (ref.export !== undefined) {
		result += `:${ref.export}`;
	}

	return result;
}

/**
 * Normalize a reference input to a ParsedWorkflowReference.
 *
 * Accepts either a string reference or an existing ParsedWorkflowReference object.
 * If a string is provided, it is parsed. If an object is provided, it is
 * validated and a clean copy is returned.
 *
 * @param input - String reference or ParsedWorkflowReference object
 * @returns Result containing normalized reference or error
 *
 * @example
 * ```typescript
 * // From string
 * normalizeWorkflowReference("my-workflow@^1.0.0");
 * // => { success: true, value: { name: "my-workflow", version: "^1.0.0" } }
 *
 * // From object (validates and returns clean copy)
 * normalizeWorkflowReference({ name: "my-workflow", version: "^1.0.0", extra: "ignored" });
 * // => { success: true, value: { name: "my-workflow", version: "^1.0.0" } }
 * ```
 */
export function normalizeWorkflowReference(
	input: string | ParsedWorkflowReference,
): ParseWorkflowReferenceResult {
	if (typeof input === "string") {
		return parseWorkflowReference(input);
	}

	// Validate the object
	if (!input || typeof input !== "object" || Array.isArray(input)) {
		return createParseError(
			"Reference must be a string or ParsedWorkflowReference object",
		);
	}

	if (typeof input.name !== "string" || input.name.length === 0) {
		return createParseError(
			"ParsedWorkflowReference must have a non-empty name property",
		);
	}

	if (!isValidPackageName(input.name)) {
		return createParseError(
			`Invalid package name "${input.name}". Package names must follow npm naming conventions.`,
		);
	}

	// Return a clean copy with only valid properties
	const result: ParsedWorkflowReference = { name: input.name };

	if (input.version !== undefined) {
		if (typeof input.version !== "string") {
			return createParseError("Version must be a string");
		}
		result.version = input.version;
	}

	if (input.export !== undefined) {
		if (typeof input.export !== "string") {
			return createParseError("Export must be a string");
		}
		if (!isValidExportName(input.export)) {
			return createParseError(`Invalid export name "${input.export}"`);
		}
		result.export = input.export;
	}

	return { success: true, value: result };
}

/**
 * Check if a string is a valid workflow reference.
 *
 * @param reference - The string to validate
 * @returns True if the string is a valid workflow reference
 *
 * @example
 * ```typescript
 * isValidWorkflowReference("my-workflow"); // true
 * isValidWorkflowReference("my-workflow@^1.0.0"); // true
 * isValidWorkflowReference(""); // false
 * isValidWorkflowReference("invalid name with spaces"); // false
 * ```
 */
export function isValidWorkflowReference(reference: string): boolean {
	const result = parseWorkflowReference(reference);
	return result.success;
}

// ============================================================================
// Internal Helpers
// ============================================================================

interface PackageNameResult {
	valid: boolean;
	name: string;
	remaining: string;
	error?: string;
}

/**
 * Extract package name from the beginning of a reference string.
 *
 * Handles:
 * - Regular names: `package-name`
 * - Scoped packages: `@scope/package-name`
 *
 * The package name ends at the first `@` (version) or `:` (export).
 */
function extractPackageName(input: string): PackageNameResult {
	if (input.length === 0) {
		return {
			valid: false,
			name: "",
			remaining: "",
			error: "Empty package name",
		};
	}

	let endIndex = input.length;
	let isScoped = false;

	// Check if this is a scoped package
	if (input.startsWith("@")) {
		isScoped = true;

		// Find the slash that separates scope from name
		const slashIndex = input.indexOf("/");
		if (slashIndex === -1) {
			return {
				valid: false,
				name: "",
				remaining: input,
				error: `Invalid scoped package name "${input}". Scoped packages must have the format @scope/name.`,
			};
		}

		// For scoped packages, find @ or : after the scope/name
		// Look for @ that's not at position 0 (that's the scope marker)
		for (let i = slashIndex + 1; i < input.length; i++) {
			if (input[i] === "@" || input[i] === ":") {
				endIndex = i;
				break;
			}
		}
	} else {
		// For regular packages, find @ or :
		for (let i = 0; i < input.length; i++) {
			if (input[i] === "@" || input[i] === ":") {
				endIndex = i;
				break;
			}
		}
	}

	const name = input.substring(0, endIndex);
	const remaining = input.substring(endIndex);

	if (name.length === 0) {
		return {
			valid: false,
			name: "",
			remaining: input,
			error: "Empty package name",
		};
	}

	// For scoped packages, verify there's something after the slash
	if (isScoped) {
		const slashIndex = name.indexOf("/");
		if (slashIndex === name.length - 1) {
			return {
				valid: false,
				name: "",
				remaining: input,
				error: `Invalid scoped package name "${name}". Missing package name after scope.`,
			};
		}
	}

	return { valid: true, name, remaining };
}

interface VersionResult {
	valid: boolean;
	version: string | undefined;
	remaining: string;
	error?: string;
}

/**
 * Extract version from the beginning of a reference string.
 *
 * The input is expected to start with `@`.
 * Version ends at the next `:` (export separator) or end of string.
 */
function extractVersion(input: string): VersionResult {
	if (!input.startsWith("@")) {
		return { valid: true, version: undefined, remaining: input };
	}

	// Find the end of version (at : or end of string)
	let endIndex = input.length;
	for (let i = 1; i < input.length; i++) {
		if (input[i] === ":") {
			endIndex = i;
			break;
		}
	}

	const version = input.substring(1, endIndex); // Skip the @ prefix
	const remaining = input.substring(endIndex);

	if (version.length === 0) {
		return {
			valid: false,
			version: undefined,
			remaining: input,
			error: "Empty version specification after @",
		};
	}

	return { valid: true, version, remaining };
}

interface ExportResult {
	valid: boolean;
	export: string | undefined;
	remaining: string;
	error?: string;
}

/**
 * Extract export name from the beginning of a reference string.
 *
 * The input is expected to start with `:`.
 * Export is everything after the colon.
 */
function extractExport(input: string): ExportResult {
	if (!input.startsWith(":")) {
		return { valid: true, export: undefined, remaining: input };
	}

	const exportName = input.substring(1); // Skip the : prefix

	if (exportName.length === 0) {
		return {
			valid: false,
			export: undefined,
			remaining: input,
			error: "Empty export name after :",
		};
	}

	// Validate export name
	if (!isValidExportName(exportName)) {
		return {
			valid: false,
			export: undefined,
			remaining: input,
			error: `Invalid export name "${exportName}". Export names must be valid JavaScript identifiers.`,
		};
	}

	return { valid: true, export: exportName, remaining: "" };
}

/**
 * Validate a package name follows npm naming conventions.
 */
function isValidPackageName(name: string): boolean {
	if (!name || name.length === 0) {
		return false;
	}

	// Check against npm naming pattern
	return PACKAGE_NAME_PATTERN.test(name);
}

/**
 * Validate an export name.
 */
function isValidExportName(name: string): boolean {
	if (!name || name.length === 0) {
		return false;
	}

	return EXPORT_NAME_PATTERN.test(name);
}

/**
 * Create a parse error result.
 */
function createParseError(message: string): ParseWorkflowReferenceResult {
	return {
		success: false,
		error: {
			code: "WORKFLOW_NOT_FOUND",
			message: `Invalid workflow reference: ${message}`,
		},
	};
}
