/**
 * Tests for PackageValidator - structure and dependency validation.
 *
 * This module tests all validation functionality in validator.ts including:
 * - Structure validation (path existence, package.json, main entry file)
 * - Schema validation (using Zod schemas from schemas.ts)
 * - Dependency validation (semver ranges, circular dependency detection)
 * - Combined validation workflow
 * - Utility methods
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { PACKAGE_ERROR_CODES, PACKAGE_WARNING_CODES } from "./types.js";
import { createPackageValidator, PackageValidator } from "./validator.js";

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Creates a temporary directory for tests.
 */
async function createTempDir(): Promise<string> {
	return await fs.mkdtemp(path.join(os.tmpdir(), "validator-test-"));
}

/**
 * Creates a minimal valid package.json content.
 */
function createValidPackageJson(
	overrides: Record<string, unknown> = {},
): Record<string, unknown> {
	return {
		name: "test-package",
		version: "1.0.0",
		main: "./src/index.ts",
		...overrides,
	};
}

/**
 * Writes a package.json file to the specified directory.
 */
async function writePackageJson(
	dir: string,
	content: Record<string, unknown>,
): Promise<void> {
	await fs.writeFile(
		path.join(dir, "package.json"),
		JSON.stringify(content, null, 2),
	);
}

/**
 * Creates a mock TypeScript entry file.
 */
async function writeEntryFile(filePath: string): Promise<void> {
	const dir = path.dirname(filePath);
	await fs.mkdir(dir, { recursive: true });
	await fs.writeFile(
		filePath,
		'export default () => ({ name: "test", build: () => {} });',
	);
}

// ============================================================================
// PackageValidator Tests
// ============================================================================

describe("PackageValidator", () => {
	let tempDir: string;
	let validator: PackageValidator;

	beforeEach(async () => {
		tempDir = await createTempDir();
		validator = new PackageValidator();
	});

	afterEach(async () => {
		// Clean up temp directory
		await fs.rm(tempDir, { recursive: true, force: true });
	});

	// ============================================================================
	// Structure Validation Tests
	// ============================================================================

	describe("validateStructure", () => {
		describe("path validation", () => {
			it("should fail for non-existent path", async () => {
				const result = await validator.validateStructure("/non/existent/path");

				expect(result.valid).toBe(false);
				expect(result.errors.length).toBe(1);
				expect(result.errors[0].code).toBe(
					PACKAGE_ERROR_CODES.MISSING_ENTRY_FILE,
				);
				expect(result.errors[0].message).toContain("does not exist");
			});

			it("should pass for single file (legacy workflow)", async () => {
				const filePath = path.join(tempDir, "workflow.ts");
				await fs.writeFile(filePath, "export default () => ({});");

				const result = await validator.validateStructure(filePath);

				expect(result.valid).toBe(true);
				expect(result.errors.length).toBe(0);
			});
		});

		describe("package.json validation", () => {
			it("should fail when package.json is missing", async () => {
				const result = await validator.validateStructure(tempDir);

				expect(result.valid).toBe(false);
				expect(result.errors.length).toBe(1);
				expect(result.errors[0].code).toBe(PACKAGE_ERROR_CODES.INVALID_JSON);
				expect(result.errors[0].message).toContain("package.json not found");
			});

			it("should fail when package.json is invalid JSON", async () => {
				await fs.writeFile(
					path.join(tempDir, "package.json"),
					"{ invalid json }",
				);

				const result = await validator.validateStructure(tempDir);

				expect(result.valid).toBe(false);
				expect(result.errors[0].code).toBe(PACKAGE_ERROR_CODES.INVALID_JSON);
				expect(result.errors[0].message).toContain("Failed to parse");
			});

			it("should pass when package.json exists and main file exists", async () => {
				const packageJson = createValidPackageJson();
				await writePackageJson(tempDir, packageJson);
				await writeEntryFile(path.join(tempDir, "src", "index.ts"));

				const result = await validator.validateStructure(tempDir);

				expect(result.valid).toBe(true);
				expect(result.errors.length).toBe(0);
			});
		});

		describe("main entry file validation", () => {
			it("should fail when main entry file does not exist", async () => {
				const packageJson = createValidPackageJson({
					main: "./nonexistent.ts",
				});
				await writePackageJson(tempDir, packageJson);

				const result = await validator.validateStructure(tempDir);

				expect(result.valid).toBe(false);
				expect(
					result.errors.some(
						(e) => e.code === PACKAGE_ERROR_CODES.MISSING_ENTRY_FILE,
					),
				).toBe(true);
				expect(result.errors[0].message).toContain("Main entry file not found");
			});

			it("should pass when main entry file exists", async () => {
				const packageJson = createValidPackageJson();
				await writePackageJson(tempDir, packageJson);
				await writeEntryFile(path.join(tempDir, "src", "index.ts"));

				const result = await validator.validateStructure(tempDir);

				expect(result.valid).toBe(true);
			});

			it("should handle main field without ./ prefix", async () => {
				const packageJson = createValidPackageJson({
					main: "src/index.ts",
				});
				await writePackageJson(tempDir, packageJson);
				await writeEntryFile(path.join(tempDir, "src", "index.ts"));

				const result = await validator.validateStructure(tempDir);

				expect(result.valid).toBe(true);
			});
		});
	});

	// ============================================================================
	// Schema Validation Tests
	// ============================================================================

	describe("validateSchema", () => {
		describe("valid package.json", () => {
			it("should pass for minimal valid package.json", () => {
				const packageJson = createValidPackageJson();

				const result = validator.validateSchema(packageJson);

				expect(result.valid).toBe(true);
				expect(result.errors.length).toBe(0);
				expect(result.packageJson).toBeDefined();
				expect(result.packageJson?.name).toBe("test-package");
			});

			it("should pass for fully populated package.json", () => {
				const packageJson = createValidPackageJson({
					description: "A test package",
					author: { name: "Test Author", email: "test@example.com" },
					repository: "https://github.com/test/repo",
					keywords: ["test", "workflow"],
					license: "MIT",
					workflows: {
						default: { description: "Default workflow" },
					},
					dependencies: {
						"other-package": "^1.0.0",
					},
					"claude-orchestrator": {
						minVersion: "0.5.0",
						requires: ["git"],
					},
				});

				const result = validator.validateSchema(packageJson);

				expect(result.valid).toBe(true);
				expect(result.packageJson?.description).toBe("A test package");
			});
		});

		describe("invalid package.json", () => {
			it("should fail for missing required fields", () => {
				const result = validator.validateSchema({});

				expect(result.valid).toBe(false);
				expect(result.errors.length).toBeGreaterThan(0);
			});

			it("should fail for invalid name", () => {
				const packageJson = createValidPackageJson({
					name: "Invalid-Name",
				});

				const result = validator.validateSchema(packageJson);

				expect(result.valid).toBe(false);
				expect(result.errors.some((e) => e.code === "INVALID_NAME")).toBe(true);
			});

			it("should fail for invalid version", () => {
				const packageJson = createValidPackageJson({
					version: "1.0",
				});

				const result = validator.validateSchema(packageJson);

				expect(result.valid).toBe(false);
				expect(result.errors.some((e) => e.code === "INVALID_VERSION")).toBe(
					true,
				);
			});

			it("should fail for absolute main path", () => {
				const packageJson = createValidPackageJson({
					main: "/absolute/path.ts",
				});

				const result = validator.validateSchema(packageJson);

				expect(result.valid).toBe(false);
				expect(result.errors.some((e) => e.code === "INVALID_MAIN_PATH")).toBe(
					true,
				);
			});

			it("should fail for non-object input", () => {
				const result = validator.validateSchema("not an object");

				expect(result.valid).toBe(false);
				expect(result.errors.some((e) => e.code === "INVALID_JSON")).toBe(true);
			});

			it("should fail for null input", () => {
				const result = validator.validateSchema(null);

				expect(result.valid).toBe(false);
			});
		});

		describe("warnings for missing recommended fields", () => {
			it("should warn when description is missing", () => {
				const packageJson = createValidPackageJson();

				const result = validator.validateSchema(packageJson);

				expect(result.valid).toBe(true);
				expect(
					result.warnings.some(
						(w) => w.code === PACKAGE_WARNING_CODES.MISSING_DESCRIPTION,
					),
				).toBe(true);
			});

			it("should warn when license is missing", () => {
				const packageJson = createValidPackageJson();

				const result = validator.validateSchema(packageJson);

				expect(
					result.warnings.some(
						(w) => w.code === PACKAGE_WARNING_CODES.MISSING_LICENSE,
					),
				).toBe(true);
			});

			it("should warn when author is missing", () => {
				const packageJson = createValidPackageJson();

				const result = validator.validateSchema(packageJson);

				expect(
					result.warnings.some(
						(w) => w.code === PACKAGE_WARNING_CODES.MISSING_AUTHOR,
					),
				).toBe(true);
			});

			it("should warn when workflows is missing", () => {
				const packageJson = createValidPackageJson();

				const result = validator.validateSchema(packageJson);

				expect(
					result.warnings.some(
						(w) => w.code === PACKAGE_WARNING_CODES.MISSING_WORKFLOWS,
					),
				).toBe(true);
			});

			it("should not warn when all recommended fields are present", () => {
				const packageJson = createValidPackageJson({
					description: "A test package",
					license: "MIT",
					author: "Test Author",
					workflows: { default: { description: "Test" } },
				});

				const result = validator.validateSchema(packageJson);

				expect(result.valid).toBe(true);
				expect(result.warnings.length).toBe(0);
			});
		});
	});

	// ============================================================================
	// Dependency Validation Tests
	// ============================================================================

	describe("validateDependencies", () => {
		describe("semver validation", () => {
			it("should pass for valid semver ranges", () => {
				const dependencies = {
					"pkg-a": "^1.0.0",
					"pkg-b": "~2.1.0",
					"pkg-c": ">=1.0.0",
					"pkg-d": "*",
				};

				const errors = validator.validateDependencies(dependencies);

				expect(errors.length).toBe(0);
			});

			it("should fail for invalid semver ranges", () => {
				const dependencies = {
					"pkg-a": "invalid",
					"pkg-b": "not-semver",
				};

				const errors = validator.validateDependencies(dependencies);

				expect(errors.length).toBe(2);
				expect(
					errors.every(
						(e) => e.code === PACKAGE_ERROR_CODES.INVALID_DEPENDENCY,
					),
				).toBe(true);
			});

			it("should provide helpful error messages", () => {
				const dependencies = {
					"pkg-a": "invalid",
				};

				const errors = validator.validateDependencies(dependencies);

				expect(errors[0].message).toContain("Invalid version range");
				expect(errors[0].message).toContain("pkg-a");
				expect(errors[0].field).toBe("dependencies.pkg-a");
			});
		});

		describe("self-dependency detection", () => {
			it("should detect self-dependency", () => {
				const dependencies = {
					"my-package": "^1.0.0",
				};

				const errors = validator.validateDependencies(
					dependencies,
					"my-package",
				);

				expect(errors.length).toBe(1);
				expect(errors[0].code).toBe(PACKAGE_ERROR_CODES.CIRCULAR_DEPENDENCY);
				expect(errors[0].message).toContain("cannot depend on itself");
			});
		});

		describe("circular dependency in chain", () => {
			it("should detect circular dependency when package is in chain", () => {
				const dependencies = {
					"pkg-a": "^1.0.0",
				};
				const chain = new Set(["pkg-x", "pkg-y", "my-package"]);

				const errors = validator.validateDependencies(
					dependencies,
					"my-package",
					chain,
				);

				expect(errors.length).toBe(1);
				expect(errors[0].code).toBe(PACKAGE_ERROR_CODES.CIRCULAR_DEPENDENCY);
			});
		});

		it("should handle undefined dependencies", () => {
			const errors = validator.validateDependencies(undefined);

			expect(errors.length).toBe(0);
		});

		it("should handle empty dependencies", () => {
			const errors = validator.validateDependencies({});

			expect(errors.length).toBe(0);
		});
	});

	describe("detectCircularDependencies", () => {
		it("should detect simple circular dependency", () => {
			const graph = new Map([
				["pkg-a", ["pkg-b"]],
				["pkg-b", ["pkg-a"]],
			]);

			const errors = validator.detectCircularDependencies(graph);

			expect(errors.length).toBe(1);
			expect(errors[0].code).toBe(PACKAGE_ERROR_CODES.CIRCULAR_DEPENDENCY);
			expect(errors[0].message).toContain("Circular dependency detected");
		});

		it("should detect longer circular dependency chain", () => {
			const graph = new Map([
				["pkg-a", ["pkg-b"]],
				["pkg-b", ["pkg-c"]],
				["pkg-c", ["pkg-a"]],
			]);

			const errors = validator.detectCircularDependencies(graph);

			expect(errors.length).toBe(1);
			expect(errors[0].message).toContain("pkg-a");
			expect(errors[0].message).toContain("pkg-b");
			expect(errors[0].message).toContain("pkg-c");
		});

		it("should not report error for acyclic graph", () => {
			const graph = new Map([
				["pkg-a", ["pkg-b", "pkg-c"]],
				["pkg-b", ["pkg-c"]],
				["pkg-c", []],
			]);

			const errors = validator.detectCircularDependencies(graph);

			expect(errors.length).toBe(0);
		});

		it("should handle disconnected graph components", () => {
			const graph = new Map([
				["pkg-a", ["pkg-b"]],
				["pkg-b", []],
				["pkg-c", ["pkg-d"]],
				["pkg-d", []],
			]);

			const errors = validator.detectCircularDependencies(graph);

			expect(errors.length).toBe(0);
		});

		it("should handle empty graph", () => {
			const graph = new Map<string, string[]>();

			const errors = validator.detectCircularDependencies(graph);

			expect(errors.length).toBe(0);
		});

		it("should ignore dependencies to unknown packages", () => {
			const graph = new Map([
				["pkg-a", ["external-pkg", "pkg-b"]],
				["pkg-b", []],
			]);

			const errors = validator.detectCircularDependencies(graph);

			expect(errors.length).toBe(0);
		});
	});

	describe("buildDependencyGraph", () => {
		it("should build graph from packages", () => {
			const packages = [
				{
					name: "pkg-a",
					version: "1.0.0",
					main: "./index.ts",
					dependencies: { "pkg-b": "^1.0.0" },
				},
				{
					name: "pkg-b",
					version: "1.0.0",
					main: "./index.ts",
					dependencies: { "pkg-c": "^1.0.0" },
				},
				{ name: "pkg-c", version: "1.0.0", main: "./index.ts" },
			];

			const graph = validator.buildDependencyGraph(packages);

			expect(graph.get("pkg-a")).toEqual(["pkg-b"]);
			expect(graph.get("pkg-b")).toEqual(["pkg-c"]);
			expect(graph.get("pkg-c")).toEqual([]);
		});

		it("should handle packages without dependencies", () => {
			const packages = [
				{ name: "pkg-a", version: "1.0.0", main: "./index.ts" },
			];

			const graph = validator.buildDependencyGraph(packages);

			expect(graph.get("pkg-a")).toEqual([]);
		});

		it("should handle empty packages array", () => {
			const graph = validator.buildDependencyGraph([]);

			expect(graph.size).toBe(0);
		});
	});

	describe("validateDependencyGraph", () => {
		it("should validate individual dependencies and detect cycles", () => {
			const packages = [
				{
					name: "pkg-a",
					version: "1.0.0",
					main: "./index.ts",
					dependencies: { "pkg-b": "^1.0.0" },
				},
				{
					name: "pkg-b",
					version: "1.0.0",
					main: "./index.ts",
					dependencies: { "pkg-a": "^1.0.0" },
				},
			];

			const result = validator.validateDependencyGraph(packages);

			expect(result.valid).toBe(false);
			expect(
				result.errors.some(
					(e) => e.code === PACKAGE_ERROR_CODES.CIRCULAR_DEPENDENCY,
				),
			).toBe(true);
		});

		it("should pass for valid dependency graph", () => {
			const packages = [
				{
					name: "pkg-a",
					version: "1.0.0",
					main: "./index.ts",
					dependencies: { "pkg-b": "^1.0.0" },
				},
				{ name: "pkg-b", version: "1.0.0", main: "./index.ts" },
			];

			const result = validator.validateDependencyGraph(packages);

			expect(result.valid).toBe(true);
			expect(result.errors.length).toBe(0);
		});

		it("should detect invalid semver in dependencies", () => {
			const packages = [
				{
					name: "pkg-a",
					version: "1.0.0",
					main: "./index.ts",
					dependencies: { "pkg-b": "invalid" },
				},
				{ name: "pkg-b", version: "1.0.0", main: "./index.ts" },
			];

			const result = validator.validateDependencyGraph(packages);

			expect(result.valid).toBe(false);
			expect(
				result.errors.some(
					(e) => e.code === PACKAGE_ERROR_CODES.INVALID_DEPENDENCY,
				),
			).toBe(true);
		});
	});

	// ============================================================================
	// Combined Validation Tests
	// ============================================================================

	describe("validate", () => {
		it("should perform full validation successfully", async () => {
			const packageJson = createValidPackageJson({
				description: "A test package",
				license: "MIT",
				author: "Test Author",
				workflows: { default: { description: "Test" } },
			});
			await writePackageJson(tempDir, packageJson);
			await writeEntryFile(path.join(tempDir, "src", "index.ts"));

			const result = await validator.validate(tempDir);

			expect(result.valid).toBe(true);
			expect(result.packageJson).toBeDefined();
			expect(result.packageJson?.name).toBe("test-package");
			expect(result.warnings.length).toBe(0);
		});

		it("should stop at structure validation on error", async () => {
			const result = await validator.validate("/non/existent/path");

			expect(result.valid).toBe(false);
			expect(result.errors[0].code).toBe(
				PACKAGE_ERROR_CODES.MISSING_ENTRY_FILE,
			);
		});

		it("should stop at schema validation on error", async () => {
			const packageJson = createValidPackageJson({
				name: "Invalid-Name",
			});
			await writePackageJson(tempDir, packageJson);
			await writeEntryFile(path.join(tempDir, "src", "index.ts"));

			const result = await validator.validate(tempDir);

			expect(result.valid).toBe(false);
			expect(result.errors.some((e) => e.code === "INVALID_NAME")).toBe(true);
		});

		it("should validate dependencies after schema validation", async () => {
			const packageJson = createValidPackageJson({
				description: "Test",
				license: "MIT",
				author: "Test",
				workflows: { default: { description: "Test" } },
				dependencies: {
					"other-pkg": "invalid-version",
				},
			});
			await writePackageJson(tempDir, packageJson);
			await writeEntryFile(path.join(tempDir, "src", "index.ts"));

			const result = await validator.validate(tempDir);

			expect(result.valid).toBe(false);
			expect(
				result.errors.some(
					(e) => e.code === PACKAGE_ERROR_CODES.INVALID_DEPENDENCY,
				),
			).toBe(true);
		});

		it("should handle legacy single-file workflows", async () => {
			const filePath = path.join(tempDir, "workflow.ts");
			await fs.writeFile(filePath, "export default () => ({});");

			const result = await validator.validate(filePath);

			expect(result.valid).toBe(true);
		});

		it("should collect all warnings during validation", async () => {
			const packageJson = createValidPackageJson();
			await writePackageJson(tempDir, packageJson);
			await writeEntryFile(path.join(tempDir, "src", "index.ts"));

			const result = await validator.validate(tempDir);

			expect(result.valid).toBe(true);
			expect(result.warnings.length).toBeGreaterThan(0);
			expect(
				result.warnings.some(
					(w) => w.code === PACKAGE_WARNING_CODES.MISSING_DESCRIPTION,
				),
			).toBe(true);
		});
	});

	// ============================================================================
	// Utility Method Tests
	// ============================================================================

	describe("isPackage", () => {
		it("should return true for directory with package.json", async () => {
			await writePackageJson(tempDir, createValidPackageJson());

			const result = await validator.isPackage(tempDir);

			expect(result).toBe(true);
		});

		it("should return false for directory without package.json", async () => {
			const result = await validator.isPackage(tempDir);

			expect(result).toBe(false);
		});

		it("should return true for TypeScript file", async () => {
			const filePath = path.join(tempDir, "workflow.ts");
			await fs.writeFile(filePath, "");

			const result = await validator.isPackage(filePath);

			expect(result).toBe(true);
		});

		it("should return false for non-TypeScript file", async () => {
			const filePath = path.join(tempDir, "file.txt");
			await fs.writeFile(filePath, "");

			const result = await validator.isPackage(filePath);

			expect(result).toBe(false);
		});

		it("should return false for non-existent path", async () => {
			const result = await validator.isPackage("/non/existent/path");

			expect(result).toBe(false);
		});
	});

	describe("formatResult", () => {
		it("should format successful validation result", () => {
			const result = {
				valid: true,
				errors: [],
				warnings: [],
				packageJson: { name: "test-pkg", version: "1.0.0", main: "./index.ts" },
			};

			const formatted = validator.formatResult(result);

			expect(formatted).toContain("Package is valid");
			expect(formatted).toContain("test-pkg");
			expect(formatted).toContain("1.0.0");
		});

		it("should format failed validation result with errors", () => {
			const result = {
				valid: false,
				errors: [
					{
						code: PACKAGE_ERROR_CODES.INVALID_NAME as const,
						message: "Invalid package name",
						field: "name",
					},
				],
				warnings: [],
			};

			const formatted = validator.formatResult(result);

			expect(formatted).toContain("validation failed");
			expect(formatted).toContain("Errors:");
			expect(formatted).toContain("INVALID_NAME");
			expect(formatted).toContain("Invalid package name");
			expect(formatted).toContain("Field: name");
		});

		it("should format warnings in result", () => {
			const result = {
				valid: true,
				errors: [],
				warnings: [
					{
						code: PACKAGE_WARNING_CODES.MISSING_DESCRIPTION as const,
						message: "Missing description",
						suggestion: "Add a description field",
					},
				],
				packageJson: { name: "test-pkg", version: "1.0.0", main: "./index.ts" },
			};

			const formatted = validator.formatResult(result);

			expect(formatted).toContain("Warnings:");
			expect(formatted).toContain("MISSING_DESCRIPTION");
			expect(formatted).toContain("Missing description");
			expect(formatted).toContain("Suggestion: Add a description field");
		});

		it("should format result without packageJson", () => {
			const result = {
				valid: false,
				errors: [
					{
						code: PACKAGE_ERROR_CODES.INVALID_JSON as const,
						message: "Invalid JSON",
					},
				],
				warnings: [],
			};

			const formatted = validator.formatResult(result);

			expect(formatted).toContain("validation failed");
			expect(formatted).not.toContain("Name:");
			expect(formatted).not.toContain("Version:");
		});
	});
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe("createPackageValidator", () => {
	it("should create a PackageValidator instance", () => {
		const validator = createPackageValidator();

		expect(validator).toBeInstanceOf(PackageValidator);
	});

	it("should create functional validator", async () => {
		const validator = createPackageValidator();
		const result = validator.validateSchema({
			name: "test-pkg",
			version: "1.0.0",
			main: "./index.ts",
		});

		expect(result.valid).toBe(true);
	});
});
