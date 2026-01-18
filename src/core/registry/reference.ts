/**
 * Reference string parser for workflow references.
 *
 * This module parses workflow reference strings into structured
 * WorkflowReference objects, supporting:
 * - Simple names: `planning`
 * - Scoped packages: `@myorg/planning`
 * - Version ranges: `planning@^1.0.0`
 * - Named exports: `tools:refactor`
 * - Source prefixes: `global:planning`
 * - Full references: `global:@myorg/deploy@~2.0.0:rollback`
 *
 * Reference format: `[source:]name[@version][:export]`
 */

import type { Result } from "../utils/result/result.ts";
import type {
	ResolutionError,
	SourcePrefix,
	WorkflowReference,
} from "./types.ts";
import { RESOLUTION_ERROR_CODES } from "./types.ts";

// ============================================================================
// Constants
// ============================================================================

/**
 * Known source prefixes that can be specified in references.
 *
 * These bypass the normal resolution order and resolve directly
 * from the specified source.
 */
const KNOWN_SOURCE_PREFIXES: readonly string[] = ["project", "global"];

/**
 * Pattern for valid npm package name characters.
 *
 * Package names can contain lowercase letters, numbers, hyphens, and dots.
 * Scoped packages additionally have `@scope/` prefix.
 */
const PACKAGE_NAME_PATTERN =
	/^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/i;

/**
 * Pattern for valid export names.
 *
 * Export names follow JavaScript identifier rules plus some flexibility.
 */
const EXPORT_NAME_PATTERN = /^[a-zA-Z_$][a-zA-Z0-9_$-]*$/;

// ============================================================================
// Parser Implementation
// ============================================================================

/**
 * Parse result containing parsed reference or error details.
 */
export type ParseReferenceResult = Result<WorkflowReference, ResolutionError>;

/**
 * Parse a workflow reference string into a structured WorkflowReference.
 *
 * Supports multiple reference formats:
 * - `name` - Simple package name
 * - `name@version` - Package with version range
 * - `name:export` - Package with named export
 * - `name@version:export` - Package with version and export
 * - `source:name` - Package from specific source
 * - `source:name@version:export` - Full reference
 * - `@scope/name` - Scoped package
 * - `source:@scope/name@version:export` - Scoped package full reference
 *
 * @param reference - The reference string to parse
 * @returns Result containing parsed WorkflowReference or ResolutionError
 *
 * @example
 * ```typescript
 * // Simple name
 * parseReference("planning");
 * // => { _tag: "ok", value: { name: "planning" } }
 *
 * // With version
 * parseReference("planning@^1.0.0");
 * // => { _tag: "ok", value: { name: "planning", version: "^1.0.0" } }
 *
 * // Scoped with export
 * parseReference("@myorg/tools:refactor");
 * // => { _tag: "ok", value: { name: "@myorg/tools", export: "refactor" } }
 *
 * // Full reference
 * parseReference("global:@myorg/deploy@~2.0.0:rollback");
 * // => { _tag: "ok", value: { name: "@myorg/deploy", version: "~2.0.0", export: "rollback", source: "global" } }
 * ```
 */
export function parseReference(reference: string): ParseReferenceResult {
	// Validate input
	if (!reference || typeof reference !== "string") {
		return createInvalidReferenceError("", "Reference string cannot be empty");
	}

	const trimmed = reference.trim();
	if (trimmed.length === 0) {
		return createInvalidReferenceError(
			reference,
			"Reference string cannot be empty or whitespace",
		);
	}

	// Parse the reference parts
	let remaining = trimmed;
	let source: SourcePrefix | undefined;
	let name: string;
	let version: string | undefined;
	let exportName: string | undefined;

	// Step 1: Extract source prefix if present (e.g., "global:" or "project:")
	// Source prefix is only at the beginning and cannot start with @
	const sourcePrefixResult = extractSourcePrefix(remaining);
	if (sourcePrefixResult.source !== undefined) {
		source = sourcePrefixResult.source;
		remaining = sourcePrefixResult.remaining;
	}

	// Check if we have anything left after source prefix
	if (remaining.length === 0) {
		return createInvalidReferenceError(
			reference,
			`Missing package name after source prefix "${source}:"`,
		);
	}

	// Step 2: Extract the package name (handles scoped packages)
	const nameResult = extractPackageName(remaining);
	if (!nameResult.valid) {
		return createInvalidReferenceError(
			reference,
			nameResult.error ?? "Invalid package name",
		);
	}
	name = nameResult.name;
	remaining = nameResult.remaining;

	// Step 3: Extract version if present (starts with @)
	if (remaining.startsWith("@")) {
		const versionResult = extractVersion(remaining);
		if (!versionResult.valid) {
			return createInvalidReferenceError(
				reference,
				versionResult.error ?? "Invalid version specification",
			);
		}
		version = versionResult.version;
		remaining = versionResult.remaining;
	}

	// Step 4: Extract export if present (starts with :)
	if (remaining.startsWith(":")) {
		const exportResult = extractExport(remaining);
		if (!exportResult.valid) {
			return createInvalidReferenceError(
				reference,
				exportResult.error ?? "Invalid export name",
			);
		}
		exportName = exportResult.export;
		remaining = exportResult.remaining;
	}

	// Step 5: Verify nothing remaining
	if (remaining.length > 0) {
		return createInvalidReferenceError(
			reference,
			`Unexpected characters in reference: "${remaining}"`,
		);
	}

	// Validate the complete package name
	if (!isValidPackageName(name)) {
		return createInvalidReferenceError(
			reference,
			`Invalid package name "${name}". Package names must follow npm naming conventions.`,
		);
	}

	// Build the result
	const result: WorkflowReference = { name };

	if (version !== undefined) {
		result.version = version;
	}

	if (exportName !== undefined) {
		result.export = exportName;
	}

	if (source !== undefined) {
		result.source = source;
	}

	return { _tag: "ok", value: result };
}

/**
 * Format a WorkflowReference back into a reference string.
 *
 * @param ref - The WorkflowReference to format
 * @returns The formatted reference string
 *
 * @example
 * ```typescript
 * formatReference({ name: "planning", version: "^1.0.0" });
 * // => "planning@^1.0.0"
 *
 * formatReference({ name: "@myorg/tools", export: "refactor", source: "global" });
 * // => "global:@myorg/tools:refactor"
 * ```
 */
export function formatReference(ref: WorkflowReference): string {
	let result = "";

	if (ref.source !== undefined) {
		result += `${ref.source}:`;
	}

	result += ref.name;

	if (ref.version !== undefined) {
		result += `@${ref.version}`;
	}

	if (ref.export !== undefined) {
		result += `:${ref.export}`;
	}

	return result;
}

/**
 * Normalize a reference input to a WorkflowReference.
 *
 * Accepts either a string reference or an existing WorkflowReference object.
 * If a string is provided, it is parsed. If an object is provided, it is
 * validated and returned.
 *
 * @param input - String reference or WorkflowReference object
 * @returns Result containing normalized WorkflowReference or error
 */
export function normalizeReference(
	input: string | WorkflowReference,
): ParseReferenceResult {
	if (typeof input === "string") {
		return parseReference(input);
	}

	// Validate the object
	if (!input || typeof input !== "object") {
		return createInvalidReferenceError(
			"",
			"Reference must be a string or WorkflowReference object",
		);
	}

	if (typeof input.name !== "string" || input.name.length === 0) {
		return createInvalidReferenceError(
			"",
			"WorkflowReference must have a non-empty name property",
		);
	}

	if (!isValidPackageName(input.name)) {
		return createInvalidReferenceError(
			formatReference(input),
			`Invalid package name "${input.name}". Package names must follow npm naming conventions.`,
		);
	}

	// Return a clean copy with only valid properties
	const result: WorkflowReference = { name: input.name };

	if (input.version !== undefined) {
		if (typeof input.version !== "string") {
			return createInvalidReferenceError(
				formatReference(input),
				"Version must be a string",
			);
		}
		result.version = input.version;
	}

	if (input.export !== undefined) {
		if (typeof input.export !== "string") {
			return createInvalidReferenceError(
				formatReference(input),
				"Export must be a string",
			);
		}
		if (!isValidExportName(input.export)) {
			return createInvalidReferenceError(
				formatReference(input),
				`Invalid export name "${input.export}"`,
			);
		}
		result.export = input.export;
	}

	if (input.source !== undefined) {
		if (typeof input.source !== "string") {
			return createInvalidReferenceError(
				formatReference(input),
				"Source must be a string",
			);
		}
		result.source = input.source;
	}

	return { _tag: "ok", value: result };
}

// ============================================================================
// Internal Helpers
// ============================================================================

interface SourcePrefixResult {
	source: SourcePrefix | undefined;
	remaining: string;
}

/**
 * Extract source prefix from the beginning of a reference string.
 *
 * Source prefixes are `project:` or `global:` at the start of the string.
 * Note: Scoped packages start with `@`, so `@scope:...` is NOT a source prefix.
 */
function extractSourcePrefix(input: string): SourcePrefixResult {
	// If starts with @, it's a scoped package, not a source prefix
	if (input.startsWith("@")) {
		return { source: undefined, remaining: input };
	}

	// Look for colon
	const colonIndex = input.indexOf(":");
	if (colonIndex === -1) {
		return { source: undefined, remaining: input };
	}

	const potentialPrefix = input.substring(0, colonIndex);

	// Check if this is a known source prefix
	if (KNOWN_SOURCE_PREFIXES.includes(potentialPrefix)) {
		return {
			source: potentialPrefix as SourcePrefix,
			remaining: input.substring(colonIndex + 1),
		};
	}

	// Not a known source prefix - treat the whole thing as the package reference
	// (the colon might be an export separator)
	return { source: undefined, remaining: input };
}

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
 * Create an INVALID_REFERENCE error result.
 */
function createInvalidReferenceError(
	reference: string,
	message: string,
): ParseReferenceResult {
	const error: ResolutionError = {
		code: RESOLUTION_ERROR_CODES.INVALID_REFERENCE,
		message,
		reference: { name: reference || "<empty>" },
		suggestions: [
			"Reference format: [source:]name[@version][:export]",
			'Examples: "planning", "planning@^1.0.0", "tools:refactor", "@myorg/deploy@~2.0.0:rollback"',
		],
	};

	return { _tag: "err", error };
}
