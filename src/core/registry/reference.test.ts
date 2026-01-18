/**
 * Tests for reference parser - workflow reference string parsing.
 *
 * This module tests all parsing functionality in reference.ts including:
 * - Simple name parsing
 * - Scoped package parsing (@scope/name)
 * - Version range parsing (name@version)
 * - Named export parsing (name:export)
 * - Source prefix parsing (source:name)
 * - Full reference parsing (source:@scope/name@version:export)
 * - Error handling for invalid references
 * - formatReference for round-trip conversion
 * - normalizeReference for input normalization
 */

import { describe, expect, it } from "bun:test";
import {
	formatReference,
	normalizeReference,
	parseReference,
} from "./reference.js";
import { RESOLUTION_ERROR_CODES } from "./types.js";

// ============================================================================
// parseReference Tests
// ============================================================================

describe("parseReference", () => {
	// ============================================================================
	// Simple Name Parsing
	// ============================================================================

	describe("simple name parsing", () => {
		it("should parse a simple package name", () => {
			const result = parseReference("planning");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toEqual({ name: "planning" });
			}
		});

		it("should parse a package name with hyphens", () => {
			const result = parseReference("my-workflow");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toEqual({ name: "my-workflow" });
			}
		});

		it("should parse a package name with numbers", () => {
			const result = parseReference("workflow123");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toEqual({ name: "workflow123" });
			}
		});

		it("should parse a package name with dots", () => {
			const result = parseReference("my.workflow");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toEqual({ name: "my.workflow" });
			}
		});

		it("should parse a package name with underscores", () => {
			const result = parseReference("my_workflow");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toEqual({ name: "my_workflow" });
			}
		});

		it("should parse a package name with tildes", () => {
			const result = parseReference("my~workflow");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toEqual({ name: "my~workflow" });
			}
		});

		it("should trim whitespace from input", () => {
			const result = parseReference("  planning  ");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toEqual({ name: "planning" });
			}
		});
	});

	// ============================================================================
	// Scoped Package Parsing
	// ============================================================================

	describe("scoped package parsing", () => {
		it("should parse a scoped package name", () => {
			const result = parseReference("@myorg/planning");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toEqual({ name: "@myorg/planning" });
			}
		});

		it("should parse a scoped package with hyphens in scope", () => {
			const result = parseReference("@my-org/planning");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toEqual({ name: "@my-org/planning" });
			}
		});

		it("should parse a scoped package with hyphens in name", () => {
			const result = parseReference("@myorg/my-workflow");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toEqual({ name: "@myorg/my-workflow" });
			}
		});

		it("should parse a scoped package with numbers", () => {
			const result = parseReference("@org123/workflow456");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toEqual({ name: "@org123/workflow456" });
			}
		});

		it("should fail for scoped package missing slash", () => {
			const result = parseReference("@myorg");

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.code).toBe(
					RESOLUTION_ERROR_CODES.INVALID_REFERENCE,
				);
				expect(result.error.message).toContain("@scope/name");
			}
		});

		it("should fail for scoped package with empty name after slash", () => {
			const result = parseReference("@myorg/");

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.code).toBe(
					RESOLUTION_ERROR_CODES.INVALID_REFERENCE,
				);
				expect(result.error.message).toContain(
					"Missing package name after scope",
				);
			}
		});

		it("should not confuse scoped package with source prefix", () => {
			// @scope/name should NOT be treated as source:name
			const result = parseReference("@scope/package");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value.name).toBe("@scope/package");
				expect(result.value.source).toBeUndefined();
			}
		});
	});

	// ============================================================================
	// Version Parsing
	// ============================================================================

	describe("version parsing", () => {
		it("should parse exact version", () => {
			const result = parseReference("planning@1.2.3");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toEqual({ name: "planning", version: "1.2.3" });
			}
		});

		it("should parse caret version range", () => {
			const result = parseReference("planning@^1.0.0");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toEqual({ name: "planning", version: "^1.0.0" });
			}
		});

		it("should parse tilde version range", () => {
			const result = parseReference("planning@~1.0.0");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toEqual({ name: "planning", version: "~1.0.0" });
			}
		});

		it("should parse version range with comparators", () => {
			const result = parseReference("planning@>=1.0.0");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toEqual({ name: "planning", version: ">=1.0.0" });
			}
		});

		it("should parse complex version range", () => {
			const result = parseReference("planning@>=1.0.0 <2.0.0");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toEqual({
					name: "planning",
					version: ">=1.0.0 <2.0.0",
				});
			}
		});

		it("should parse wildcard version", () => {
			const result = parseReference("planning@*");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toEqual({ name: "planning", version: "*" });
			}
		});

		it("should parse partial version", () => {
			const result = parseReference("planning@1.0");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toEqual({ name: "planning", version: "1.0" });
			}
		});

		it("should parse version with prerelease tag", () => {
			const result = parseReference("planning@1.0.0-beta.1");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toEqual({
					name: "planning",
					version: "1.0.0-beta.1",
				});
			}
		});

		it("should parse version with build metadata", () => {
			const result = parseReference("planning@1.0.0+build.123");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toEqual({
					name: "planning",
					version: "1.0.0+build.123",
				});
			}
		});

		it("should parse scoped package with version", () => {
			const result = parseReference("@myorg/planning@^1.0.0");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toEqual({
					name: "@myorg/planning",
					version: "^1.0.0",
				});
			}
		});

		it("should fail for empty version after @", () => {
			const result = parseReference("planning@");

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.code).toBe(
					RESOLUTION_ERROR_CODES.INVALID_REFERENCE,
				);
				expect(result.error.message).toContain("Empty version");
			}
		});
	});

	// ============================================================================
	// Export Name Parsing
	// ============================================================================

	describe("export name parsing", () => {
		it("should parse named export", () => {
			const result = parseReference("tools:refactor");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toEqual({ name: "tools", export: "refactor" });
			}
		});

		it("should parse named export with underscores", () => {
			const result = parseReference("tools:my_refactor");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toEqual({ name: "tools", export: "my_refactor" });
			}
		});

		it("should parse named export with dollar sign", () => {
			const result = parseReference("tools:$internal");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toEqual({ name: "tools", export: "$internal" });
			}
		});

		it("should parse named export starting with underscore", () => {
			const result = parseReference("tools:_private");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toEqual({ name: "tools", export: "_private" });
			}
		});

		it("should parse named export with numbers", () => {
			const result = parseReference("tools:refactor123");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toEqual({ name: "tools", export: "refactor123" });
			}
		});

		it("should parse named export with hyphens", () => {
			const result = parseReference("tools:my-refactor");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toEqual({ name: "tools", export: "my-refactor" });
			}
		});

		it("should parse scoped package with export", () => {
			const result = parseReference("@myorg/tools:refactor");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toEqual({
					name: "@myorg/tools",
					export: "refactor",
				});
			}
		});

		it("should fail for empty export after colon", () => {
			const result = parseReference("tools:");

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.code).toBe(
					RESOLUTION_ERROR_CODES.INVALID_REFERENCE,
				);
				expect(result.error.message).toContain("Empty export name");
			}
		});

		it("should fail for export starting with number", () => {
			const result = parseReference("tools:123export");

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.code).toBe(
					RESOLUTION_ERROR_CODES.INVALID_REFERENCE,
				);
				expect(result.error.message).toContain("Invalid export name");
			}
		});
	});

	// ============================================================================
	// Source Prefix Parsing
	// ============================================================================

	describe("source prefix parsing", () => {
		it("should parse global source prefix", () => {
			const result = parseReference("global:planning");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toEqual({
					name: "planning",
					source: "global",
				});
			}
		});

		it("should parse project source prefix", () => {
			const result = parseReference("project:planning");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toEqual({
					name: "planning",
					source: "project",
				});
			}
		});

		it("should parse global prefix with scoped package", () => {
			const result = parseReference("global:@myorg/planning");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toEqual({
					name: "@myorg/planning",
					source: "global",
				});
			}
		});

		it("should not treat unknown prefix as source", () => {
			// "unknown:planning" should be parsed as package "unknown" with export "planning"
			const result = parseReference("unknown:planning");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				// Unknown prefix is treated as package:export
				expect(result.value.name).toBe("unknown");
				expect(result.value.export).toBe("planning");
				expect(result.value.source).toBeUndefined();
			}
		});

		it("should fail when package name is missing after source prefix", () => {
			const result = parseReference("global:");

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.code).toBe(
					RESOLUTION_ERROR_CODES.INVALID_REFERENCE,
				);
				expect(result.error.message).toContain("Missing package name");
			}
		});
	});

	// ============================================================================
	// Combined Parsing (Version + Export)
	// ============================================================================

	describe("combined version and export parsing", () => {
		it("should parse version and export", () => {
			const result = parseReference("planning@^1.0.0:initialize");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toEqual({
					name: "planning",
					version: "^1.0.0",
					export: "initialize",
				});
			}
		});

		it("should parse scoped package with version and export", () => {
			const result = parseReference("@myorg/deploy@~2.0.0:rollback");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toEqual({
					name: "@myorg/deploy",
					version: "~2.0.0",
					export: "rollback",
				});
			}
		});
	});

	// ============================================================================
	// Full Reference Parsing (Source + Name + Version + Export)
	// ============================================================================

	describe("full reference parsing", () => {
		it("should parse full reference with all components", () => {
			const result = parseReference("global:@myorg/deploy@~2.0.0:rollback");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toEqual({
					name: "@myorg/deploy",
					version: "~2.0.0",
					export: "rollback",
					source: "global",
				});
			}
		});

		it("should parse project source with all components", () => {
			const result = parseReference("project:planning@^1.0.0:initialize");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toEqual({
					name: "planning",
					version: "^1.0.0",
					export: "initialize",
					source: "project",
				});
			}
		});

		it("should parse source prefix with version only", () => {
			const result = parseReference("global:planning@^1.0.0");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toEqual({
					name: "planning",
					version: "^1.0.0",
					source: "global",
				});
			}
		});

		it("should parse source prefix with export only", () => {
			const result = parseReference("global:tools:refactor");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toEqual({
					name: "tools",
					export: "refactor",
					source: "global",
				});
			}
		});
	});

	// ============================================================================
	// Error Handling - Invalid Input
	// ============================================================================

	describe("error handling - invalid input", () => {
		it("should fail for empty string", () => {
			const result = parseReference("");

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.code).toBe(
					RESOLUTION_ERROR_CODES.INVALID_REFERENCE,
				);
				expect(result.error.message).toContain("empty");
			}
		});

		it("should fail for whitespace-only string", () => {
			const result = parseReference("   ");

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.code).toBe(
					RESOLUTION_ERROR_CODES.INVALID_REFERENCE,
				);
				expect(result.error.message).toContain("empty or whitespace");
			}
		});

		it("should fail for null-like input", () => {
			// @ts-expect-error - Testing invalid input
			const result = parseReference(null);

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.code).toBe(
					RESOLUTION_ERROR_CODES.INVALID_REFERENCE,
				);
			}
		});

		it("should fail for undefined-like input", () => {
			// @ts-expect-error - Testing invalid input
			const result = parseReference(undefined);

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.code).toBe(
					RESOLUTION_ERROR_CODES.INVALID_REFERENCE,
				);
			}
		});

		it("should fail for non-string input", () => {
			// @ts-expect-error - Testing invalid input
			const result = parseReference(123);

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.code).toBe(
					RESOLUTION_ERROR_CODES.INVALID_REFERENCE,
				);
			}
		});
	});

	// ============================================================================
	// Error Handling - Invalid Package Names
	// ============================================================================

	describe("error handling - invalid package names", () => {
		it("should fail for package name starting with dot", () => {
			const result = parseReference(".hidden-package");

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.code).toBe(
					RESOLUTION_ERROR_CODES.INVALID_REFERENCE,
				);
				expect(result.error.message).toContain("Invalid package name");
			}
		});

		it("should fail for package name with invalid characters", () => {
			const result = parseReference("package!name");

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.code).toBe(
					RESOLUTION_ERROR_CODES.INVALID_REFERENCE,
				);
				expect(result.error.message).toContain("Invalid package name");
			}
		});

		it("should fail for package name with spaces", () => {
			const result = parseReference("package name");

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.code).toBe(
					RESOLUTION_ERROR_CODES.INVALID_REFERENCE,
				);
			}
		});
	});

	// ============================================================================
	// Error Messages Include Suggestions
	// ============================================================================

	describe("error messages include suggestions", () => {
		it("should include format suggestion in error", () => {
			const result = parseReference("");

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.suggestions).toBeDefined();
				expect(result.error.suggestions?.length).toBeGreaterThan(0);
				expect(
					result.error.suggestions?.some((s) =>
						s.includes("[source:]name[@version][:export]"),
					),
				).toBe(true);
			}
		});

		it("should include examples in suggestions", () => {
			const result = parseReference("");

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.suggestions).toBeDefined();
				expect(
					result.error.suggestions?.some((s) => s.includes("planning")),
				).toBe(true);
			}
		});
	});

	// ============================================================================
	// Edge Cases
	// ============================================================================

	describe("edge cases", () => {
		it("should handle single character package name", () => {
			const result = parseReference("a");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toEqual({ name: "a" });
			}
		});

		it("should handle numeric package name", () => {
			// Valid npm package names can start with numbers
			const result = parseReference("123package");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toEqual({ name: "123package" });
			}
		});

		it("should handle multiple @ signs correctly (scoped + version)", () => {
			const result = parseReference("@scope/name@1.0.0");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value.name).toBe("@scope/name");
				expect(result.value.version).toBe("1.0.0");
			}
		});

		it("should handle package with all optional components as undefined", () => {
			const result = parseReference("simple");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value.name).toBe("simple");
				expect(result.value.version).toBeUndefined();
				expect(result.value.export).toBeUndefined();
				expect(result.value.source).toBeUndefined();
			}
		});
	});
});

// ============================================================================
// formatReference Tests
// ============================================================================

describe("formatReference", () => {
	describe("basic formatting", () => {
		it("should format simple name", () => {
			const result = formatReference({ name: "planning" });
			expect(result).toBe("planning");
		});

		it("should format name with version", () => {
			const result = formatReference({ name: "planning", version: "^1.0.0" });
			expect(result).toBe("planning@^1.0.0");
		});

		it("should format name with export", () => {
			const result = formatReference({ name: "tools", export: "refactor" });
			expect(result).toBe("tools:refactor");
		});

		it("should format name with source", () => {
			const result = formatReference({ name: "planning", source: "global" });
			expect(result).toBe("global:planning");
		});
	});

	describe("combined formatting", () => {
		it("should format name with version and export", () => {
			const result = formatReference({
				name: "planning",
				version: "^1.0.0",
				export: "initialize",
			});
			expect(result).toBe("planning@^1.0.0:initialize");
		});

		it("should format full reference", () => {
			const result = formatReference({
				name: "@myorg/deploy",
				version: "~2.0.0",
				export: "rollback",
				source: "global",
			});
			expect(result).toBe("global:@myorg/deploy@~2.0.0:rollback");
		});

		it("should format source with version only", () => {
			const result = formatReference({
				name: "planning",
				version: "^1.0.0",
				source: "global",
			});
			expect(result).toBe("global:planning@^1.0.0");
		});

		it("should format source with export only", () => {
			const result = formatReference({
				name: "tools",
				export: "refactor",
				source: "global",
			});
			expect(result).toBe("global:tools:refactor");
		});
	});

	describe("round-trip conversion", () => {
		it("should round-trip simple name", () => {
			const original = "planning";
			const parsed = parseReference(original);
			expect(parsed._tag).toBe("ok");
			if (parsed._tag === "ok") {
				const formatted = formatReference(parsed.value);
				expect(formatted).toBe(original);
			}
		});

		it("should round-trip name with version", () => {
			const original = "planning@^1.0.0";
			const parsed = parseReference(original);
			expect(parsed._tag).toBe("ok");
			if (parsed._tag === "ok") {
				const formatted = formatReference(parsed.value);
				expect(formatted).toBe(original);
			}
		});

		it("should round-trip full reference", () => {
			const original = "global:@myorg/deploy@~2.0.0:rollback";
			const parsed = parseReference(original);
			expect(parsed._tag).toBe("ok");
			if (parsed._tag === "ok") {
				const formatted = formatReference(parsed.value);
				expect(formatted).toBe(original);
			}
		});

		it("should round-trip scoped package", () => {
			const original = "@myorg/planning";
			const parsed = parseReference(original);
			expect(parsed._tag).toBe("ok");
			if (parsed._tag === "ok") {
				const formatted = formatReference(parsed.value);
				expect(formatted).toBe(original);
			}
		});
	});
});

// ============================================================================
// normalizeReference Tests
// ============================================================================

describe("normalizeReference", () => {
	// ============================================================================
	// String Input
	// ============================================================================

	describe("string input", () => {
		it("should normalize simple string reference", () => {
			const result = normalizeReference("planning");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toEqual({ name: "planning" });
			}
		});

		it("should normalize complex string reference", () => {
			const result = normalizeReference("global:@myorg/deploy@~2.0.0:rollback");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toEqual({
					name: "@myorg/deploy",
					version: "~2.0.0",
					export: "rollback",
					source: "global",
				});
			}
		});

		it("should fail for invalid string reference", () => {
			const result = normalizeReference("");

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.code).toBe(
					RESOLUTION_ERROR_CODES.INVALID_REFERENCE,
				);
			}
		});
	});

	// ============================================================================
	// Object Input
	// ============================================================================

	describe("object input", () => {
		it("should normalize valid WorkflowReference object", () => {
			const input = { name: "planning" };
			const result = normalizeReference(input);

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toEqual({ name: "planning" });
			}
		});

		it("should normalize object with all fields", () => {
			const input = {
				name: "@myorg/deploy",
				version: "~2.0.0",
				export: "rollback",
				source: "global",
			};
			const result = normalizeReference(input);

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toEqual(input);
			}
		});

		it("should fail for object without name", () => {
			// @ts-expect-error - Testing invalid input
			const result = normalizeReference({ version: "1.0.0" });

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.code).toBe(
					RESOLUTION_ERROR_CODES.INVALID_REFERENCE,
				);
				expect(result.error.message).toContain("non-empty name");
			}
		});

		it("should fail for object with empty name", () => {
			const result = normalizeReference({ name: "" });

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.code).toBe(
					RESOLUTION_ERROR_CODES.INVALID_REFERENCE,
				);
				expect(result.error.message).toContain("non-empty name");
			}
		});

		it("should fail for object with invalid package name", () => {
			const result = normalizeReference({ name: ".invalid" });

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.code).toBe(
					RESOLUTION_ERROR_CODES.INVALID_REFERENCE,
				);
				expect(result.error.message).toContain("Invalid package name");
			}
		});

		it("should fail for object with non-string version", () => {
			// @ts-expect-error - Testing invalid input
			const result = normalizeReference({ name: "planning", version: 123 });

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.code).toBe(
					RESOLUTION_ERROR_CODES.INVALID_REFERENCE,
				);
				expect(result.error.message).toContain("Version must be a string");
			}
		});

		it("should fail for object with non-string export", () => {
			// @ts-expect-error - Testing invalid input
			const result = normalizeReference({ name: "planning", export: 123 });

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.code).toBe(
					RESOLUTION_ERROR_CODES.INVALID_REFERENCE,
				);
				expect(result.error.message).toContain("Export must be a string");
			}
		});

		it("should fail for object with invalid export name", () => {
			const result = normalizeReference({
				name: "planning",
				export: "123invalid",
			});

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.code).toBe(
					RESOLUTION_ERROR_CODES.INVALID_REFERENCE,
				);
				expect(result.error.message).toContain("Invalid export name");
			}
		});

		it("should fail for object with non-string source", () => {
			// @ts-expect-error - Testing invalid input
			const result = normalizeReference({ name: "planning", source: 123 });

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.code).toBe(
					RESOLUTION_ERROR_CODES.INVALID_REFERENCE,
				);
				expect(result.error.message).toContain("Source must be a string");
			}
		});
	});

	// ============================================================================
	// Invalid Input Types
	// ============================================================================

	describe("invalid input types", () => {
		it("should fail for null input", () => {
			// @ts-expect-error - Testing invalid input
			const result = normalizeReference(null);

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.code).toBe(
					RESOLUTION_ERROR_CODES.INVALID_REFERENCE,
				);
			}
		});

		it("should fail for undefined input", () => {
			// @ts-expect-error - Testing invalid input
			const result = normalizeReference(undefined);

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.code).toBe(
					RESOLUTION_ERROR_CODES.INVALID_REFERENCE,
				);
			}
		});

		it("should fail for number input", () => {
			// @ts-expect-error - Testing invalid input
			const result = normalizeReference(123);

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.code).toBe(
					RESOLUTION_ERROR_CODES.INVALID_REFERENCE,
				);
			}
		});

		it("should fail for array input", () => {
			// @ts-expect-error - Testing invalid input
			const result = normalizeReference(["planning"]);

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.code).toBe(
					RESOLUTION_ERROR_CODES.INVALID_REFERENCE,
				);
			}
		});
	});

	// ============================================================================
	// Clean Copy Behavior
	// ============================================================================

	describe("clean copy behavior", () => {
		it("should return a clean copy without extra properties", () => {
			const input = {
				name: "planning",
				version: "1.0.0",
				extraProp: "should-be-removed",
			};
			const result = normalizeReference(input);

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toEqual({ name: "planning", version: "1.0.0" });
				expect("extraProp" in result.value).toBe(false);
			}
		});

		it("should not include undefined optional fields in result", () => {
			const input = { name: "planning" };
			const result = normalizeReference(input);

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(Object.keys(result.value)).toEqual(["name"]);
			}
		});
	});
});
