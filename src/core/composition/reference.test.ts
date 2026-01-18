/**
 * Tests for workflow reference parser.
 *
 * This module tests all parsing functionality in reference.ts including:
 * - Simple name parsing
 * - Scoped package parsing (@scope/name)
 * - Version range parsing (name@version)
 * - Named export parsing (name:export)
 * - Full reference parsing (name@version:export)
 * - Error handling for invalid references
 * - formatWorkflowReference for round-trip conversion
 * - normalizeWorkflowReference for input normalization
 */

import { describe, expect, it } from "bun:test";
import {
	formatWorkflowReference,
	isValidWorkflowReference,
	normalizeWorkflowReference,
	parseWorkflowReference,
} from "./reference.js";

// ============================================================================
// parseWorkflowReference Tests
// ============================================================================

describe("parseWorkflowReference", () => {
	// ============================================================================
	// Simple Name Parsing
	// ============================================================================

	describe("simple name parsing", () => {
		it("should parse a simple package name", () => {
			const result = parseWorkflowReference("planning");

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toEqual({ name: "planning" });
			}
		});

		it("should parse a package name with hyphens", () => {
			const result = parseWorkflowReference("my-workflow");

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toEqual({ name: "my-workflow" });
			}
		});

		it("should parse a package name with numbers", () => {
			const result = parseWorkflowReference("workflow123");

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toEqual({ name: "workflow123" });
			}
		});

		it("should parse a package name with dots", () => {
			const result = parseWorkflowReference("my.workflow");

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toEqual({ name: "my.workflow" });
			}
		});

		it("should parse a package name with underscores", () => {
			const result = parseWorkflowReference("my_workflow");

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toEqual({ name: "my_workflow" });
			}
		});

		it("should parse a package name with tildes", () => {
			const result = parseWorkflowReference("my~workflow");

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toEqual({ name: "my~workflow" });
			}
		});

		it("should trim whitespace from input", () => {
			const result = parseWorkflowReference("  planning  ");

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toEqual({ name: "planning" });
			}
		});
	});

	// ============================================================================
	// Scoped Package Parsing
	// ============================================================================

	describe("scoped package parsing", () => {
		it("should parse a scoped package name", () => {
			const result = parseWorkflowReference("@myorg/planning");

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toEqual({ name: "@myorg/planning" });
			}
		});

		it("should parse a scoped package with hyphens in scope", () => {
			const result = parseWorkflowReference("@my-org/planning");

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toEqual({ name: "@my-org/planning" });
			}
		});

		it("should parse a scoped package with hyphens in name", () => {
			const result = parseWorkflowReference("@myorg/my-workflow");

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toEqual({ name: "@myorg/my-workflow" });
			}
		});

		it("should parse a scoped package with numbers", () => {
			const result = parseWorkflowReference("@org123/workflow456");

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toEqual({ name: "@org123/workflow456" });
			}
		});

		it("should fail for scoped package missing slash", () => {
			const result = parseWorkflowReference("@myorg");

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.code).toBe("WORKFLOW_NOT_FOUND");
				expect(result.error.message).toContain("@scope/name");
			}
		});

		it("should fail for scoped package with empty name after slash", () => {
			const result = parseWorkflowReference("@myorg/");

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.code).toBe("WORKFLOW_NOT_FOUND");
				expect(result.error.message).toContain(
					"Missing package name after scope",
				);
			}
		});
	});

	// ============================================================================
	// Version Parsing
	// ============================================================================

	describe("version parsing", () => {
		it("should parse exact version", () => {
			const result = parseWorkflowReference("planning@1.2.3");

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toEqual({ name: "planning", version: "1.2.3" });
			}
		});

		it("should parse caret version range", () => {
			const result = parseWorkflowReference("planning@^1.0.0");

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toEqual({ name: "planning", version: "^1.0.0" });
			}
		});

		it("should parse tilde version range", () => {
			const result = parseWorkflowReference("planning@~1.0.0");

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toEqual({ name: "planning", version: "~1.0.0" });
			}
		});

		it("should parse version range with comparators", () => {
			const result = parseWorkflowReference("planning@>=1.0.0");

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toEqual({ name: "planning", version: ">=1.0.0" });
			}
		});

		it("should parse complex version range", () => {
			const result = parseWorkflowReference("planning@>=1.0.0 <2.0.0");

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toEqual({
					name: "planning",
					version: ">=1.0.0 <2.0.0",
				});
			}
		});

		it("should parse wildcard version", () => {
			const result = parseWorkflowReference("planning@*");

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toEqual({ name: "planning", version: "*" });
			}
		});

		it("should parse partial version", () => {
			const result = parseWorkflowReference("planning@1.0");

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toEqual({ name: "planning", version: "1.0" });
			}
		});

		it("should parse version with prerelease tag", () => {
			const result = parseWorkflowReference("planning@1.0.0-beta.1");

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toEqual({
					name: "planning",
					version: "1.0.0-beta.1",
				});
			}
		});

		it("should parse version with build metadata", () => {
			const result = parseWorkflowReference("planning@1.0.0+build.123");

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toEqual({
					name: "planning",
					version: "1.0.0+build.123",
				});
			}
		});

		it("should parse scoped package with version", () => {
			const result = parseWorkflowReference("@myorg/planning@^1.0.0");

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toEqual({
					name: "@myorg/planning",
					version: "^1.0.0",
				});
			}
		});

		it("should fail for empty version after @", () => {
			const result = parseWorkflowReference("planning@");

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.code).toBe("WORKFLOW_NOT_FOUND");
				expect(result.error.message).toContain("Empty version");
			}
		});
	});

	// ============================================================================
	// Export Name Parsing
	// ============================================================================

	describe("export name parsing", () => {
		it("should parse named export", () => {
			const result = parseWorkflowReference("tools:refactor");

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toEqual({ name: "tools", export: "refactor" });
			}
		});

		it("should parse named export with underscores", () => {
			const result = parseWorkflowReference("tools:my_refactor");

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toEqual({ name: "tools", export: "my_refactor" });
			}
		});

		it("should parse named export with dollar sign", () => {
			const result = parseWorkflowReference("tools:$internal");

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toEqual({ name: "tools", export: "$internal" });
			}
		});

		it("should parse named export starting with underscore", () => {
			const result = parseWorkflowReference("tools:_private");

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toEqual({ name: "tools", export: "_private" });
			}
		});

		it("should parse named export with numbers", () => {
			const result = parseWorkflowReference("tools:refactor123");

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toEqual({ name: "tools", export: "refactor123" });
			}
		});

		it("should parse named export with hyphens (kebab-case)", () => {
			const result = parseWorkflowReference("tools:my-refactor");

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toEqual({ name: "tools", export: "my-refactor" });
			}
		});

		it("should parse scoped package with export", () => {
			const result = parseWorkflowReference("@myorg/tools:refactor");

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toEqual({
					name: "@myorg/tools",
					export: "refactor",
				});
			}
		});

		it("should fail for empty export after colon", () => {
			const result = parseWorkflowReference("tools:");

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.code).toBe("WORKFLOW_NOT_FOUND");
				expect(result.error.message).toContain("Empty export name");
			}
		});

		it("should fail for export starting with number", () => {
			const result = parseWorkflowReference("tools:123export");

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.code).toBe("WORKFLOW_NOT_FOUND");
				expect(result.error.message).toContain("Invalid export name");
			}
		});
	});

	// ============================================================================
	// Combined Parsing (Version + Export)
	// ============================================================================

	describe("combined version and export parsing", () => {
		it("should parse version and export", () => {
			const result = parseWorkflowReference("planning@^1.0.0:initialize");

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toEqual({
					name: "planning",
					version: "^1.0.0",
					export: "initialize",
				});
			}
		});

		it("should parse scoped package with version and export", () => {
			const result = parseWorkflowReference("@myorg/deploy@~2.0.0:rollback");

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toEqual({
					name: "@myorg/deploy",
					version: "~2.0.0",
					export: "rollback",
				});
			}
		});

		it("should parse complex version with export", () => {
			const result = parseWorkflowReference(
				"planning@>=1.0.0 <2.0.0:initialize",
			);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toEqual({
					name: "planning",
					version: ">=1.0.0 <2.0.0",
					export: "initialize",
				});
			}
		});
	});

	// ============================================================================
	// Error Handling - Invalid Input
	// ============================================================================

	describe("error handling - invalid input", () => {
		it("should fail for empty string", () => {
			const result = parseWorkflowReference("");

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.code).toBe("WORKFLOW_NOT_FOUND");
				expect(result.error.message).toContain("empty");
			}
		});

		it("should fail for whitespace-only string", () => {
			const result = parseWorkflowReference("   ");

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.code).toBe("WORKFLOW_NOT_FOUND");
				expect(result.error.message).toContain("empty or whitespace");
			}
		});

		it("should fail for null-like input", () => {
			// @ts-expect-error - Testing invalid input
			const result = parseWorkflowReference(null);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.code).toBe("WORKFLOW_NOT_FOUND");
			}
		});

		it("should fail for undefined-like input", () => {
			// @ts-expect-error - Testing invalid input
			const result = parseWorkflowReference(undefined);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.code).toBe("WORKFLOW_NOT_FOUND");
			}
		});

		it("should fail for non-string input", () => {
			// @ts-expect-error - Testing invalid input
			const result = parseWorkflowReference(123);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.code).toBe("WORKFLOW_NOT_FOUND");
			}
		});
	});

	// ============================================================================
	// Error Handling - Invalid Package Names
	// ============================================================================

	describe("error handling - invalid package names", () => {
		it("should fail for package name starting with dot", () => {
			const result = parseWorkflowReference(".hidden-package");

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.code).toBe("WORKFLOW_NOT_FOUND");
				expect(result.error.message).toContain("Invalid package name");
			}
		});

		it("should fail for package name with invalid characters", () => {
			const result = parseWorkflowReference("package!name");

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.code).toBe("WORKFLOW_NOT_FOUND");
				expect(result.error.message).toContain("Invalid package name");
			}
		});

		it("should fail for package name with spaces", () => {
			const result = parseWorkflowReference("package name");

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.code).toBe("WORKFLOW_NOT_FOUND");
			}
		});
	});

	// ============================================================================
	// Edge Cases
	// ============================================================================

	describe("edge cases", () => {
		it("should handle single character package name", () => {
			const result = parseWorkflowReference("a");

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toEqual({ name: "a" });
			}
		});

		it("should handle numeric package name", () => {
			// Valid npm package names can start with numbers
			const result = parseWorkflowReference("123package");

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toEqual({ name: "123package" });
			}
		});

		it("should handle multiple @ signs correctly (scoped + version)", () => {
			const result = parseWorkflowReference("@scope/name@1.0.0");

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value.name).toBe("@scope/name");
				expect(result.value.version).toBe("1.0.0");
			}
		});

		it("should handle package with all optional components as undefined", () => {
			const result = parseWorkflowReference("simple");

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value.name).toBe("simple");
				expect(result.value.version).toBeUndefined();
				expect(result.value.export).toBeUndefined();
			}
		});
	});
});

// ============================================================================
// formatWorkflowReference Tests
// ============================================================================

describe("formatWorkflowReference", () => {
	describe("basic formatting", () => {
		it("should format simple name", () => {
			const result = formatWorkflowReference({ name: "planning" });
			expect(result).toBe("planning");
		});

		it("should format name with version", () => {
			const result = formatWorkflowReference({
				name: "planning",
				version: "^1.0.0",
			});
			expect(result).toBe("planning@^1.0.0");
		});

		it("should format name with export", () => {
			const result = formatWorkflowReference({
				name: "tools",
				export: "refactor",
			});
			expect(result).toBe("tools:refactor");
		});

		it("should format scoped package", () => {
			const result = formatWorkflowReference({ name: "@myorg/planning" });
			expect(result).toBe("@myorg/planning");
		});
	});

	describe("combined formatting", () => {
		it("should format name with version and export", () => {
			const result = formatWorkflowReference({
				name: "planning",
				version: "^1.0.0",
				export: "initialize",
			});
			expect(result).toBe("planning@^1.0.0:initialize");
		});

		it("should format scoped package with version and export", () => {
			const result = formatWorkflowReference({
				name: "@myorg/deploy",
				version: "~2.0.0",
				export: "rollback",
			});
			expect(result).toBe("@myorg/deploy@~2.0.0:rollback");
		});

		it("should format scoped package with version only", () => {
			const result = formatWorkflowReference({
				name: "@myorg/planning",
				version: "^1.0.0",
			});
			expect(result).toBe("@myorg/planning@^1.0.0");
		});

		it("should format scoped package with export only", () => {
			const result = formatWorkflowReference({
				name: "@myorg/tools",
				export: "refactor",
			});
			expect(result).toBe("@myorg/tools:refactor");
		});
	});

	describe("round-trip conversion", () => {
		it("should round-trip simple name", () => {
			const original = "planning";
			const parsed = parseWorkflowReference(original);
			expect(parsed.success).toBe(true);
			if (parsed.success) {
				const formatted = formatWorkflowReference(parsed.value);
				expect(formatted).toBe(original);
			}
		});

		it("should round-trip name with version", () => {
			const original = "planning@^1.0.0";
			const parsed = parseWorkflowReference(original);
			expect(parsed.success).toBe(true);
			if (parsed.success) {
				const formatted = formatWorkflowReference(parsed.value);
				expect(formatted).toBe(original);
			}
		});

		it("should round-trip full reference", () => {
			const original = "@myorg/deploy@~2.0.0:rollback";
			const parsed = parseWorkflowReference(original);
			expect(parsed.success).toBe(true);
			if (parsed.success) {
				const formatted = formatWorkflowReference(parsed.value);
				expect(formatted).toBe(original);
			}
		});

		it("should round-trip scoped package", () => {
			const original = "@myorg/planning";
			const parsed = parseWorkflowReference(original);
			expect(parsed.success).toBe(true);
			if (parsed.success) {
				const formatted = formatWorkflowReference(parsed.value);
				expect(formatted).toBe(original);
			}
		});

		it("should round-trip name with export only", () => {
			const original = "tools:refactor";
			const parsed = parseWorkflowReference(original);
			expect(parsed.success).toBe(true);
			if (parsed.success) {
				const formatted = formatWorkflowReference(parsed.value);
				expect(formatted).toBe(original);
			}
		});
	});
});

// ============================================================================
// normalizeWorkflowReference Tests
// ============================================================================

describe("normalizeWorkflowReference", () => {
	// ============================================================================
	// String Input
	// ============================================================================

	describe("string input", () => {
		it("should normalize simple string reference", () => {
			const result = normalizeWorkflowReference("planning");

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toEqual({ name: "planning" });
			}
		});

		it("should normalize complex string reference", () => {
			const result = normalizeWorkflowReference(
				"@myorg/deploy@~2.0.0:rollback",
			);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toEqual({
					name: "@myorg/deploy",
					version: "~2.0.0",
					export: "rollback",
				});
			}
		});

		it("should fail for invalid string reference", () => {
			const result = normalizeWorkflowReference("");

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.code).toBe("WORKFLOW_NOT_FOUND");
			}
		});
	});

	// ============================================================================
	// Object Input
	// ============================================================================

	describe("object input", () => {
		it("should normalize valid ParsedWorkflowReference object", () => {
			const input = { name: "planning" };
			const result = normalizeWorkflowReference(input);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toEqual({ name: "planning" });
			}
		});

		it("should normalize object with all fields", () => {
			const input = {
				name: "@myorg/deploy",
				version: "~2.0.0",
				export: "rollback",
			};
			const result = normalizeWorkflowReference(input);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toEqual(input);
			}
		});

		it("should fail for object without name", () => {
			// @ts-expect-error - Testing invalid input
			const result = normalizeWorkflowReference({ version: "1.0.0" });

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.code).toBe("WORKFLOW_NOT_FOUND");
				expect(result.error.message).toContain("non-empty name");
			}
		});

		it("should fail for object with empty name", () => {
			const result = normalizeWorkflowReference({ name: "" });

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.code).toBe("WORKFLOW_NOT_FOUND");
				expect(result.error.message).toContain("non-empty name");
			}
		});

		it("should fail for object with invalid package name", () => {
			const result = normalizeWorkflowReference({ name: ".invalid" });

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.code).toBe("WORKFLOW_NOT_FOUND");
				expect(result.error.message).toContain("Invalid package name");
			}
		});

		it("should fail for object with non-string version", () => {
			const result = normalizeWorkflowReference({
				name: "planning",
				version: 123 as unknown as string,
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.code).toBe("WORKFLOW_NOT_FOUND");
				expect(result.error.message).toContain("Version must be a string");
			}
		});

		it("should fail for object with non-string export", () => {
			const result = normalizeWorkflowReference({
				name: "planning",
				export: 123 as unknown as string,
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.code).toBe("WORKFLOW_NOT_FOUND");
				expect(result.error.message).toContain("Export must be a string");
			}
		});

		it("should fail for object with invalid export name", () => {
			const result = normalizeWorkflowReference({
				name: "planning",
				export: "123invalid",
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.code).toBe("WORKFLOW_NOT_FOUND");
				expect(result.error.message).toContain("Invalid export name");
			}
		});
	});

	// ============================================================================
	// Invalid Input Types
	// ============================================================================

	describe("invalid input types", () => {
		it("should fail for null input", () => {
			// @ts-expect-error - Testing invalid input
			const result = normalizeWorkflowReference(null);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.code).toBe("WORKFLOW_NOT_FOUND");
			}
		});

		it("should fail for undefined input", () => {
			// @ts-expect-error - Testing invalid input
			const result = normalizeWorkflowReference(undefined);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.code).toBe("WORKFLOW_NOT_FOUND");
			}
		});

		it("should fail for number input", () => {
			// @ts-expect-error - Testing invalid input
			const result = normalizeWorkflowReference(123);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.code).toBe("WORKFLOW_NOT_FOUND");
			}
		});

		it("should fail for array input", () => {
			// @ts-expect-error - Testing invalid input
			const result = normalizeWorkflowReference(["planning"]);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.code).toBe("WORKFLOW_NOT_FOUND");
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
			const result = normalizeWorkflowReference(input);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value).toEqual({ name: "planning", version: "1.0.0" });
				expect("extraProp" in result.value).toBe(false);
			}
		});

		it("should not include undefined optional fields in result", () => {
			const input = { name: "planning" };
			const result = normalizeWorkflowReference(input);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(Object.keys(result.value)).toEqual(["name"]);
			}
		});
	});
});

// ============================================================================
// isValidWorkflowReference Tests
// ============================================================================

describe("isValidWorkflowReference", () => {
	it("should return true for valid simple reference", () => {
		expect(isValidWorkflowReference("planning")).toBe(true);
	});

	it("should return true for valid reference with version", () => {
		expect(isValidWorkflowReference("planning@^1.0.0")).toBe(true);
	});

	it("should return true for valid reference with export", () => {
		expect(isValidWorkflowReference("planning:initialize")).toBe(true);
	});

	it("should return true for valid scoped reference", () => {
		expect(isValidWorkflowReference("@myorg/planning@^1.0.0:initialize")).toBe(
			true,
		);
	});

	it("should return false for empty string", () => {
		expect(isValidWorkflowReference("")).toBe(false);
	});

	it("should return false for invalid package name", () => {
		expect(isValidWorkflowReference(".invalid")).toBe(false);
	});

	it("should return false for reference with empty version", () => {
		expect(isValidWorkflowReference("planning@")).toBe(false);
	});

	it("should return false for reference with empty export", () => {
		expect(isValidWorkflowReference("planning:")).toBe(false);
	});
});
