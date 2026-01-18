/**
 * Tests for WorkflowPackageLoader - package loading and multi-export support.
 *
 * This module tests all loading functionality in loader.ts including:
 * - Folder-based package loading with package.json
 * - Single-file workflow loading (legacy support)
 * - Multi-export support (default and named exports)
 * - Error handling for invalid packages
 * - The isPackage utility method
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createPackageLoader, WorkflowPackageLoader } from "./loader.js";
import { PACKAGE_ERROR_CODES } from "./types.js";

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Creates a temporary directory for tests.
 */
async function createTempDir(): Promise<string> {
	return await fs.mkdtemp(path.join(os.tmpdir(), "loader-test-"));
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
 * Creates a valid workflow entry file with a default export.
 */
async function writeValidWorkflowFile(filePath: string): Promise<void> {
	const dir = path.dirname(filePath);
	await fs.mkdir(dir, { recursive: true });
	await fs.writeFile(
		filePath,
		`
export default function createWorkflow() {
	return {
		name: "default-workflow",
		vars: {},
		build: (graph) => {}
	};
}
`,
	);
}

/**
 * Creates a workflow file with multiple named exports.
 */
async function writeMultiExportWorkflowFile(filePath: string): Promise<void> {
	const dir = path.dirname(filePath);
	await fs.mkdir(dir, { recursive: true });
	await fs.writeFile(
		filePath,
		`
export default function createDefaultWorkflow() {
	return {
		name: "default-workflow",
		vars: {},
		build: (graph) => {}
	};
}

export function createDeployWorkflow() {
	return {
		name: "deploy-workflow",
		vars: { target: "production" },
		build: (graph) => {}
	};
}

export function createTestWorkflow() {
	return {
		name: "test-workflow",
		vars: { coverage: true },
		build: (graph) => {}
	};
}

// Utility function - should not be treated as a workflow
export function helperFunction() {
	return "I'm a helper";
}
`,
	);
}

/**
 * Creates an invalid workflow file (no valid exports).
 */
async function writeInvalidWorkflowFile(filePath: string): Promise<void> {
	const dir = path.dirname(filePath);
	await fs.mkdir(dir, { recursive: true });
	await fs.writeFile(
		filePath,
		`
// No valid workflow exports
export const notAFunction = { name: "invalid" };
export function returnsWrong() {
	return "not a workflow";
}
`,
	);
}

/**
 * Creates a workflow file that throws an error when the factory is called.
 */
async function writeThrowingWorkflowFile(filePath: string): Promise<void> {
	const dir = path.dirname(filePath);
	await fs.mkdir(dir, { recursive: true });
	await fs.writeFile(
		filePath,
		`
export default function createWorkflow() {
	throw new Error("Factory initialization failed");
}
`,
	);
}

/**
 * Creates a file with syntax errors.
 */
async function writeSyntaxErrorFile(filePath: string): Promise<void> {
	const dir = path.dirname(filePath);
	await fs.mkdir(dir, { recursive: true });
	await fs.writeFile(
		filePath,
		`
export default function { // Missing function name
	return { name: "broken" };
}
`,
	);
}

// ============================================================================
// WorkflowPackageLoader Tests
// ============================================================================

describe("WorkflowPackageLoader", () => {
	let tempDir: string;
	let loader: WorkflowPackageLoader;

	beforeEach(async () => {
		tempDir = await createTempDir();
		loader = new WorkflowPackageLoader();
	});

	afterEach(async () => {
		// Clean up temp directory
		await fs.rm(tempDir, { recursive: true, force: true });
	});

	// ============================================================================
	// Folder-Based Package Loading Tests
	// ============================================================================

	describe("load - folder-based packages", () => {
		describe("successful loading", () => {
			it("should load a valid folder-based package", async () => {
				const packageJson = createValidPackageJson();
				await writePackageJson(tempDir, packageJson);
				await writeValidWorkflowFile(path.join(tempDir, "src", "index.ts"));

				const result = await loader.load(tempDir);

				expect(result._tag).toBe("ok");
				if (result._tag === "ok") {
					expect(result.value.metadata.name).toBe("test-package");
					expect(result.value.metadata.version).toBe("1.0.0");
					expect(result.value.workflows.size).toBeGreaterThan(0);
				}
			});

			it("should populate the path field with absolute path", async () => {
				const packageJson = createValidPackageJson();
				await writePackageJson(tempDir, packageJson);
				await writeValidWorkflowFile(path.join(tempDir, "src", "index.ts"));

				const result = await loader.load(tempDir);

				expect(result._tag).toBe("ok");
				if (result._tag === "ok") {
					expect(path.isAbsolute(result.value.path)).toBe(true);
					expect(result.value.path).toContain("loader-test-");
				}
			});

			it("should load package with optional metadata fields", async () => {
				const packageJson = createValidPackageJson({
					description: "A test workflow package",
					author: "Test Author",
					license: "MIT",
					keywords: ["test", "workflow"],
				});
				await writePackageJson(tempDir, packageJson);
				await writeValidWorkflowFile(path.join(tempDir, "src", "index.ts"));

				const result = await loader.load(tempDir);

				expect(result._tag).toBe("ok");
				if (result._tag === "ok") {
					expect(result.value.metadata.description).toBe(
						"A test workflow package",
					);
					expect(result.value.metadata.author).toBe("Test Author");
					expect(result.value.metadata.license).toBe("MIT");
				}
			});
		});

		describe("error handling", () => {
			it("should fail for non-existent path", async () => {
				const result = await loader.load("/non/existent/path");

				expect(result._tag).toBe("err");
				if (result._tag === "err") {
					expect(result.error.length).toBeGreaterThan(0);
					expect(result.error[0].code).toBe(
						PACKAGE_ERROR_CODES.MISSING_ENTRY_FILE,
					);
				}
			});

			it("should fail when package.json is missing", async () => {
				// Create a directory without package.json
				const result = await loader.load(tempDir);

				expect(result._tag).toBe("err");
				if (result._tag === "err") {
					expect(result.error[0].code).toBe(PACKAGE_ERROR_CODES.INVALID_JSON);
				}
			});

			it("should fail when main entry file is missing", async () => {
				const packageJson = createValidPackageJson({
					main: "./nonexistent.ts",
				});
				await writePackageJson(tempDir, packageJson);

				const result = await loader.load(tempDir);

				expect(result._tag).toBe("err");
				if (result._tag === "err") {
					expect(
						result.error.some(
							(e) => e.code === PACKAGE_ERROR_CODES.MISSING_ENTRY_FILE,
						),
					).toBe(true);
				}
			});

			it("should fail when package.json has invalid schema", async () => {
				const packageJson = createValidPackageJson({
					name: "Invalid-Name", // Invalid: uppercase
				});
				await writePackageJson(tempDir, packageJson);
				await writeValidWorkflowFile(path.join(tempDir, "src", "index.ts"));

				const result = await loader.load(tempDir);

				expect(result._tag).toBe("err");
			});

			it("should fail when main file has no valid workflow exports", async () => {
				const packageJson = createValidPackageJson();
				await writePackageJson(tempDir, packageJson);
				await writeInvalidWorkflowFile(path.join(tempDir, "src", "index.ts"));

				const result = await loader.load(tempDir);

				expect(result._tag).toBe("err");
				if (result._tag === "err") {
					expect(
						result.error.some(
							(e) => e.code === PACKAGE_ERROR_CODES.INVALID_EXPORT,
						),
					).toBe(true);
				}
			});

			it("should fail when workflow factory throws an error", async () => {
				const packageJson = createValidPackageJson();
				await writePackageJson(tempDir, packageJson);
				await writeThrowingWorkflowFile(path.join(tempDir, "src", "index.ts"));

				const result = await loader.load(tempDir);

				expect(result._tag).toBe("err");
				if (result._tag === "err") {
					expect(
						result.error.some(
							(e) => e.code === PACKAGE_ERROR_CODES.INVALID_EXPORT,
						),
					).toBe(true);
					expect(
						result.error.some((e) =>
							e.message.includes("Factory initialization failed"),
						),
					).toBe(true);
				}
			});

			it("should fail when main file has syntax errors", async () => {
				const packageJson = createValidPackageJson();
				await writePackageJson(tempDir, packageJson);
				await writeSyntaxErrorFile(path.join(tempDir, "src", "index.ts"));

				const result = await loader.load(tempDir);

				expect(result._tag).toBe("err");
				if (result._tag === "err") {
					expect(
						result.error.some(
							(e) => e.code === PACKAGE_ERROR_CODES.INVALID_EXPORT,
						),
					).toBe(true);
					expect(
						result.error.some((e) => e.message.includes("Failed to import")),
					).toBe(true);
				}
			});
		});
	});

	// ============================================================================
	// Single-File Workflow Loading Tests (Legacy Support)
	// ============================================================================

	describe("load - single-file workflows (legacy)", () => {
		describe("successful loading", () => {
			it("should load a single TypeScript workflow file", async () => {
				const workflowPath = path.join(tempDir, "my-workflow.ts");
				await writeValidWorkflowFile(workflowPath);

				const result = await loader.load(workflowPath);

				expect(result._tag).toBe("ok");
				if (result._tag === "ok") {
					// Synthetic metadata should be created
					expect(result.value.metadata.name).toBe("my-workflow");
					expect(result.value.metadata.version).toBe("0.0.0");
					expect(result.value.workflows.has("default")).toBe(true);
				}
			});

			it("should use filename as package name for single-file workflow", async () => {
				const workflowPath = path.join(tempDir, "deploy-pipeline.ts");
				await writeValidWorkflowFile(workflowPath);

				const result = await loader.load(workflowPath);

				expect(result._tag).toBe("ok");
				if (result._tag === "ok") {
					expect(result.value.metadata.name).toBe("deploy-pipeline");
				}
			});

			it("should set path to parent directory for single-file workflow", async () => {
				const workflowPath = path.join(tempDir, "workflow.ts");
				await writeValidWorkflowFile(workflowPath);

				const result = await loader.load(workflowPath);

				expect(result._tag).toBe("ok");
				if (result._tag === "ok") {
					expect(result.value.path).toBe(tempDir);
				}
			});
		});

		describe("error handling", () => {
			it("should fail for non-TypeScript files", async () => {
				const filePath = path.join(tempDir, "workflow.js");
				await fs.writeFile(filePath, "export default () => ({});");

				const result = await loader.load(filePath);

				expect(result._tag).toBe("err");
				if (result._tag === "err") {
					expect(result.error[0].code).toBe(
						PACKAGE_ERROR_CODES.INVALID_MAIN_PATH,
					);
				}
			});

			it("should fail for single-file with no valid exports", async () => {
				const workflowPath = path.join(tempDir, "invalid.ts");
				await writeInvalidWorkflowFile(workflowPath);

				const result = await loader.load(workflowPath);

				expect(result._tag).toBe("err");
				if (result._tag === "err") {
					expect(
						result.error.some(
							(e) => e.code === PACKAGE_ERROR_CODES.INVALID_EXPORT,
						),
					).toBe(true);
				}
			});
		});
	});

	// ============================================================================
	// Multi-Export Support Tests
	// ============================================================================

	describe("load - multi-export support", () => {
		describe("retrieving workflows", () => {
			it("should load all valid workflow exports", async () => {
				const packageJson = createValidPackageJson();
				await writePackageJson(tempDir, packageJson);
				await writeMultiExportWorkflowFile(
					path.join(tempDir, "src", "index.ts"),
				);

				const result = await loader.load(tempDir);

				expect(result._tag).toBe("ok");
				if (result._tag === "ok") {
					const pkg = result.value;
					// Should have default, createDeployWorkflow, and createTestWorkflow
					// helperFunction should be ignored (returns string, not workflow)
					expect(pkg.workflows.size).toBeGreaterThanOrEqual(3);
					expect(pkg.workflows.has("default")).toBe(true);
				}
			});

			it("should retrieve default workflow via getWorkflow()", async () => {
				const packageJson = createValidPackageJson();
				await writePackageJson(tempDir, packageJson);
				await writeMultiExportWorkflowFile(
					path.join(tempDir, "src", "index.ts"),
				);

				const result = await loader.load(tempDir);

				expect(result._tag).toBe("ok");
				if (result._tag === "ok") {
					const pkg = result.value;
					const defaultFactory = pkg.getWorkflow();
					expect(defaultFactory).toBeDefined();
					if (defaultFactory) {
						const workflow = defaultFactory();
						expect(workflow.name).toBe("default-workflow");
					}
				}
			});

			it("should retrieve named workflow via getWorkflow(name)", async () => {
				const packageJson = createValidPackageJson();
				await writePackageJson(tempDir, packageJson);
				await writeMultiExportWorkflowFile(
					path.join(tempDir, "src", "index.ts"),
				);

				const result = await loader.load(tempDir);

				expect(result._tag).toBe("ok");
				if (result._tag === "ok") {
					const pkg = result.value;
					const deployFactory = pkg.getWorkflow("createDeployWorkflow");
					expect(deployFactory).toBeDefined();
					if (deployFactory) {
						const workflow = deployFactory();
						expect(workflow.name).toBe("deploy-workflow");
					}
				}
			});

			it("should return undefined for non-existent workflow name", async () => {
				const packageJson = createValidPackageJson();
				await writePackageJson(tempDir, packageJson);
				await writeValidWorkflowFile(path.join(tempDir, "src", "index.ts"));

				const result = await loader.load(tempDir);

				expect(result._tag).toBe("ok");
				if (result._tag === "ok") {
					const pkg = result.value;
					const nonExistent = pkg.getWorkflow("nonExistentWorkflow");
					expect(nonExistent).toBeUndefined();
				}
			});

			it("should list all available workflows via listWorkflows()", async () => {
				const packageJson = createValidPackageJson();
				await writePackageJson(tempDir, packageJson);
				await writeMultiExportWorkflowFile(
					path.join(tempDir, "src", "index.ts"),
				);

				const result = await loader.load(tempDir);

				expect(result._tag).toBe("ok");
				if (result._tag === "ok") {
					const pkg = result.value;
					const workflows = pkg.listWorkflows();
					expect(Array.isArray(workflows)).toBe(true);
					expect(workflows).toContain("default");
					expect(workflows.length).toBeGreaterThanOrEqual(3);
				}
			});
		});

		describe("workflow factory execution", () => {
			it("should create working workflow definitions from factories", async () => {
				const packageJson = createValidPackageJson();
				await writePackageJson(tempDir, packageJson);
				await writeMultiExportWorkflowFile(
					path.join(tempDir, "src", "index.ts"),
				);

				const result = await loader.load(tempDir);

				expect(result._tag).toBe("ok");
				if (result._tag === "ok") {
					const pkg = result.value;
					const factory = pkg.getWorkflow("createTestWorkflow");
					expect(factory).toBeDefined();
					if (factory) {
						const workflow = factory();
						expect(workflow.name).toBe("test-workflow");
						expect(workflow.vars).toEqual({ coverage: true });
						expect(typeof workflow.build).toBe("function");
					}
				}
			});
		});
	});

	// ============================================================================
	// Validation Method Tests
	// ============================================================================

	describe("validate", () => {
		it("should validate a valid package without loading exports", async () => {
			const packageJson = createValidPackageJson();
			await writePackageJson(tempDir, packageJson);
			await writeValidWorkflowFile(path.join(tempDir, "src", "index.ts"));

			const result = await loader.validate(tempDir);

			expect(result.valid).toBe(true);
			expect(result.packageJson).toBeDefined();
			expect(result.packageJson?.name).toBe("test-package");
		});

		it("should return errors for invalid package", async () => {
			const packageJson = createValidPackageJson({
				version: "invalid",
			});
			await writePackageJson(tempDir, packageJson);

			const result = await loader.validate(tempDir);

			expect(result.valid).toBe(false);
			expect(result.errors.length).toBeGreaterThan(0);
		});

		it("should return warnings for missing recommended fields", async () => {
			const packageJson = createValidPackageJson();
			await writePackageJson(tempDir, packageJson);
			await writeValidWorkflowFile(path.join(tempDir, "src", "index.ts"));

			const result = await loader.validate(tempDir);

			expect(result.valid).toBe(true);
			expect(result.warnings.length).toBeGreaterThan(0);
		});
	});

	// ============================================================================
	// isPackage Method Tests
	// ============================================================================

	describe("isPackage", () => {
		it("should return true for directory with package.json", async () => {
			await writePackageJson(tempDir, createValidPackageJson());

			const result = await loader.isPackage(tempDir);

			expect(result).toBe(true);
		});

		it("should return false for directory without package.json", async () => {
			const result = await loader.isPackage(tempDir);

			expect(result).toBe(false);
		});

		it("should return true for TypeScript file", async () => {
			const filePath = path.join(tempDir, "workflow.ts");
			await fs.writeFile(filePath, "export default () => ({});");

			const result = await loader.isPackage(filePath);

			expect(result).toBe(true);
		});

		it("should return false for non-TypeScript file", async () => {
			const filePath = path.join(tempDir, "readme.md");
			await fs.writeFile(filePath, "# Readme");

			const result = await loader.isPackage(filePath);

			expect(result).toBe(false);
		});

		it("should return false for non-existent path", async () => {
			const result = await loader.isPackage("/non/existent/path");

			expect(result).toBe(false);
		});
	});

	// ============================================================================
	// Edge Cases
	// ============================================================================

	describe("edge cases", () => {
		it("should handle relative paths", async () => {
			// Create package in temp dir
			await writePackageJson(tempDir, createValidPackageJson());
			await writeValidWorkflowFile(path.join(tempDir, "src", "index.ts"));

			// Create a relative path from cwd
			const relativePath = path.relative(process.cwd(), tempDir);

			const result = await loader.load(relativePath);

			expect(result._tag).toBe("ok");
		});

		it("should handle packages with complex main paths", async () => {
			const packageJson = createValidPackageJson({
				main: "./dist/workflows/entry.ts",
			});
			await writePackageJson(tempDir, packageJson);
			await writeValidWorkflowFile(
				path.join(tempDir, "dist", "workflows", "entry.ts"),
			);

			const result = await loader.load(tempDir);

			expect(result._tag).toBe("ok");
		});

		it("should handle scoped package names", async () => {
			const packageJson = createValidPackageJson({
				name: "@myorg/my-workflow",
			});
			await writePackageJson(tempDir, packageJson);
			await writeValidWorkflowFile(path.join(tempDir, "src", "index.ts"));

			const result = await loader.load(tempDir);

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value.metadata.name).toBe("@myorg/my-workflow");
			}
		});

		it("should handle package with dependencies", async () => {
			const packageJson = createValidPackageJson({
				dependencies: {
					"@other/workflow": "^1.0.0",
					"another-workflow": "~2.0.0",
				},
			});
			await writePackageJson(tempDir, packageJson);
			await writeValidWorkflowFile(path.join(tempDir, "src", "index.ts"));

			const result = await loader.load(tempDir);

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value.metadata.dependencies).toBeDefined();
				expect(result.value.metadata.dependencies?.["@other/workflow"]).toBe(
					"^1.0.0",
				);
			}
		});

		it("should handle package with claude-orchestrator config", async () => {
			const packageJson = createValidPackageJson({
				"claude-orchestrator": {
					minVersion: "0.5.0",
					requires: ["git", "docker"],
				},
			});
			await writePackageJson(tempDir, packageJson);
			await writeValidWorkflowFile(path.join(tempDir, "src", "index.ts"));

			const result = await loader.load(tempDir);

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value.metadata["claude-orchestrator"]).toBeDefined();
				expect(result.value.metadata["claude-orchestrator"]?.minVersion).toBe(
					"0.5.0",
				);
				expect(
					result.value.metadata["claude-orchestrator"]?.requires,
				).toContain("git");
			}
		});
	});
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe("createPackageLoader", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir();
	});

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true });
	});

	it("should create a WorkflowPackageLoader instance", () => {
		const loader = createPackageLoader();

		expect(loader).toBeInstanceOf(WorkflowPackageLoader);
	});

	it("should create a functional loader", async () => {
		const loader = createPackageLoader();

		const packageJson = createValidPackageJson();
		await writePackageJson(tempDir, packageJson);
		await writeValidWorkflowFile(path.join(tempDir, "src", "index.ts"));

		const result = await loader.load(tempDir);

		expect(result._tag).toBe("ok");
	});

	it("should allow passing custom validator", async () => {
		const { PackageValidator } = await import("./validator.js");
		const customValidator = new PackageValidator();

		const loader = createPackageLoader(customValidator);

		expect(loader).toBeInstanceOf(WorkflowPackageLoader);
	});
});
