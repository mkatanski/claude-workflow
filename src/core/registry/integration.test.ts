/**
 * Integration tests for filesystem resolution with test fixtures.
 *
 * These tests verify the registry's ability to resolve workflows from
 * the actual filesystem using real test fixtures.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { LoadedConfig, RegistryConfig, ResolvedPaths } from "./config.js";
import { createResolver, type WorkflowResolver } from "./resolver.js";
import { RESOLUTION_ERROR_CODES } from "./types.js";

// ============================================================================
// Test Setup
// ============================================================================

/**
 * Get the path to the __fixtures__ directory.
 */
function getFixturesPath(): string {
	const currentFile = fileURLToPath(import.meta.url);
	const currentDir = path.dirname(currentFile);
	return path.join(currentDir, "__fixtures__");
}

/**
 * Creates a temporary directory for tests.
 */
async function createTempDir(): Promise<string> {
	return await fs.mkdtemp(path.join(os.tmpdir(), "registry-integration-"));
}

/**
 * Copy a directory recursively.
 */
async function copyDir(src: string, dest: string): Promise<void> {
	await fs.mkdir(dest, { recursive: true });
	const entries = await fs.readdir(src, { withFileTypes: true });

	for (const entry of entries) {
		const srcPath = path.join(src, entry.name);
		const destPath = path.join(dest, entry.name);

		if (entry.isDirectory()) {
			await copyDir(srcPath, destPath);
		} else {
			await fs.copyFile(srcPath, destPath);
		}
	}
}

/**
 * Creates a mock LoadedConfig for testing with specific paths.
 */
function createMockConfig(
	tempDir: string,
	overrides: Partial<RegistryConfig> = {},
): LoadedConfig {
	const resolvedPaths: ResolvedPaths = {
		projectWorkflows: path.join(tempDir, ".cw", "workflows"),
		projectInstalled: path.join(tempDir, ".cw", "workflows", ".installed"),
		globalWorkflows: path.join(tempDir, "global", "workflows"),
		projectRoot: tempDir,
	};

	const config: RegistryConfig = {
		resolution: {
			overrides: {},
			...overrides.resolution,
		},
		paths: overrides.paths,
	};

	return {
		config,
		resolvedPaths,
	};
}

// ============================================================================
// Integration Tests for Filesystem Resolution
// ============================================================================

describe("integration: filesystem resolution", () => {
	let tempDir: string;
	let mockConfig: LoadedConfig;
	let resolver: WorkflowResolver;
	let fixturesPath: string;

	beforeEach(async () => {
		tempDir = await createTempDir();
		mockConfig = createMockConfig(tempDir);
		fixturesPath = getFixturesPath();

		// Create the directory structure
		await fs.mkdir(mockConfig.resolvedPaths.projectWorkflows, {
			recursive: true,
		});
		await fs.mkdir(mockConfig.resolvedPaths.projectInstalled, {
			recursive: true,
		});
		await fs.mkdir(mockConfig.resolvedPaths.globalWorkflows, {
			recursive: true,
		});

		resolver = createResolver({ config: mockConfig, cwd: tempDir });
	});

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true });
	});

	// ============================================================================
	// Resolution from Test Fixtures
	// ============================================================================

	describe("resolving workflows from test fixtures", () => {
		beforeEach(async () => {
			// Copy test-workflow fixture to project-local workflows
			const testWorkflowFixture = path.join(fixturesPath, "test-workflow");
			const projectLocalPath = path.join(
				mockConfig.resolvedPaths.projectWorkflows,
				"test-workflow",
			);
			await copyDir(testWorkflowFixture, projectLocalPath);
		});

		it("should resolve test-workflow from project-local", async () => {
			const result = await resolver.resolve("test-workflow");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value.source).toBe("project");
				expect(result.value.version).toBe("1.0.0");
				expect(result.value.exportName).toBe("default");
				expect(result.value.metadata.name).toBe("test-workflow");
				expect(result.value.metadata.description).toContain(
					"integration testing",
				);
			}
		});

		it("should resolve named export from test-workflow", async () => {
			const result = await resolver.resolve("test-workflow:alternate");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value.exportName).toBe("alternate");
				expect(result.value.version).toBe("1.0.0");
			}
		});

		it("should return error for non-existent export", async () => {
			const result = await resolver.resolve("test-workflow:nonexistent");

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.code).toBe(RESOLUTION_ERROR_CODES.EXPORT_NOT_FOUND);
				expect(result.error.availableExports).toContain("default");
				expect(result.error.availableExports).toContain("alternate");
			}
		});

		it("should verify package metadata is loaded correctly", async () => {
			const result = await resolver.resolve("test-workflow");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				const { metadata } = result.value;
				expect(metadata.name).toBe("test-workflow");
				expect(metadata.version).toBe("1.0.0");
				expect(metadata.main).toBe("./index.ts");
				expect(metadata.keywords).toContain("integration");
				expect(metadata.workflows?.default).toBeDefined();
				expect(metadata.workflows?.alternate).toBeDefined();
			}
		});
	});

	// ============================================================================
	// Multi-tier Resolution Integration
	// ============================================================================

	describe("multi-tier resolution with fixtures", () => {
		it("should prefer project-local over project-installed", async () => {
			// Copy to project-local
			const testWorkflowFixture = path.join(fixturesPath, "test-workflow");
			const projectLocalPath = path.join(
				mockConfig.resolvedPaths.projectWorkflows,
				"test-workflow",
			);
			await copyDir(testWorkflowFixture, projectLocalPath);

			// Copy to project-installed with different version
			const installedPath = path.join(
				mockConfig.resolvedPaths.projectInstalled,
				"test-workflow@2.0.0",
			);
			await copyDir(testWorkflowFixture, installedPath);
			// Modify version in installed copy
			const installedPackageJson = path.join(installedPath, "package.json");
			const content = JSON.parse(
				await fs.readFile(installedPackageJson, "utf-8"),
			);
			content.version = "2.0.0";
			await fs.writeFile(
				installedPackageJson,
				JSON.stringify(content, null, 2),
			);

			const result = await resolver.resolve("test-workflow");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value.source).toBe("project");
				expect(result.value.version).toBe("1.0.0");
			}
		});

		it("should fallback to project-installed when project-local not available", async () => {
			// Copy only to project-installed
			const testWorkflowFixture = path.join(fixturesPath, "test-workflow");
			const installedPath = path.join(
				mockConfig.resolvedPaths.projectInstalled,
				"test-workflow@1.0.0",
			);
			await copyDir(testWorkflowFixture, installedPath);

			const result = await resolver.resolve("test-workflow");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value.source).toBe("project-installed");
				expect(result.value.version).toBe("1.0.0");
			}
		});

		it("should fallback to global when project sources not available", async () => {
			// Copy only to global
			const testWorkflowFixture = path.join(fixturesPath, "test-workflow");
			const globalPath = path.join(
				mockConfig.resolvedPaths.globalWorkflows,
				"test-workflow@1.0.0",
			);
			await copyDir(testWorkflowFixture, globalPath);

			const result = await resolver.resolve("test-workflow");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value.source).toBe("global");
				expect(result.value.version).toBe("1.0.0");
			}
		});
	});

	// ============================================================================
	// Version Resolution Integration
	// ============================================================================

	describe("version resolution with fixtures", () => {
		beforeEach(async () => {
			const testWorkflowFixture = path.join(fixturesPath, "test-workflow");

			// Install multiple versions to project-installed
			const versions = ["1.0.0", "1.5.0", "2.0.0"];
			for (const version of versions) {
				const installedPath = path.join(
					mockConfig.resolvedPaths.projectInstalled,
					`test-workflow@${version}`,
				);
				await copyDir(testWorkflowFixture, installedPath);

				// Update version in package.json
				const packageJsonPath = path.join(installedPath, "package.json");
				const content = JSON.parse(await fs.readFile(packageJsonPath, "utf-8"));
				content.version = version;
				await fs.writeFile(packageJsonPath, JSON.stringify(content, null, 2));
			}
		});

		it("should resolve exact version", async () => {
			const result = await resolver.resolve("test-workflow@1.5.0");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value.version).toBe("1.5.0");
			}
		});

		it("should resolve caret range to highest compatible version", async () => {
			const result = await resolver.resolve("test-workflow@^1.0.0");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value.version).toBe("1.5.0");
			}
		});

		it("should resolve to latest when no version specified", async () => {
			const result = await resolver.resolve("test-workflow");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value.version).toBe("2.0.0");
			}
		});

		it("should return error for unsatisfiable version", async () => {
			const result = await resolver.resolve("test-workflow@^3.0.0");

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.code).toBe(
					RESOLUTION_ERROR_CODES.VERSION_NOT_FOUND,
				);
				expect(result.error.availableVersions).toBeDefined();
				expect(result.error.availableVersions).toContain("2.0.0");
				expect(result.error.availableVersions).toContain("1.5.0");
				expect(result.error.availableVersions).toContain("1.0.0");
			}
		});
	});

	// ============================================================================
	// getVersions() Integration
	// ============================================================================

	describe("getVersions() with fixtures", () => {
		beforeEach(async () => {
			const testWorkflowFixture = path.join(fixturesPath, "test-workflow");

			// Add to project-local
			const localPath = path.join(
				mockConfig.resolvedPaths.projectWorkflows,
				"test-workflow",
			);
			await copyDir(testWorkflowFixture, localPath);

			// Add to project-installed with different version
			const installedPath = path.join(
				mockConfig.resolvedPaths.projectInstalled,
				"test-workflow@2.0.0",
			);
			await copyDir(testWorkflowFixture, installedPath);
			const installedPackageJson = path.join(installedPath, "package.json");
			const installedContent = JSON.parse(
				await fs.readFile(installedPackageJson, "utf-8"),
			);
			installedContent.version = "2.0.0";
			await fs.writeFile(
				installedPackageJson,
				JSON.stringify(installedContent, null, 2),
			);

			// Add to global with another version
			const globalPath = path.join(
				mockConfig.resolvedPaths.globalWorkflows,
				"test-workflow@3.0.0",
			);
			await copyDir(testWorkflowFixture, globalPath);
			const globalPackageJson = path.join(globalPath, "package.json");
			const globalContent = JSON.parse(
				await fs.readFile(globalPackageJson, "utf-8"),
			);
			globalContent.version = "3.0.0";
			await fs.writeFile(
				globalPackageJson,
				JSON.stringify(globalContent, null, 2),
			);
		});

		it("should return all versions from all sources", async () => {
			const versions = await resolver.getVersions("test-workflow");

			expect(versions.length).toBe(3);
			expect(versions.map((v) => v.version)).toContain("1.0.0");
			expect(versions.map((v) => v.version)).toContain("2.0.0");
			expect(versions.map((v) => v.version)).toContain("3.0.0");
		});

		it("should include correct source information", async () => {
			const versions = await resolver.getVersions("test-workflow");

			const localVersion = versions.find((v) => v.version === "1.0.0");
			const installedVersion = versions.find((v) => v.version === "2.0.0");
			const globalVersion = versions.find((v) => v.version === "3.0.0");

			expect(localVersion?.source).toBe("project");
			expect(installedVersion?.source).toBe("project-installed");
			expect(globalVersion?.source).toBe("global");
		});
	});

	// ============================================================================
	// list() Integration
	// ============================================================================

	describe("list() with fixtures", () => {
		beforeEach(async () => {
			const testWorkflowFixture = path.join(fixturesPath, "test-workflow");

			// Add to project-local
			const localPath = path.join(
				mockConfig.resolvedPaths.projectWorkflows,
				"test-workflow",
			);
			await copyDir(testWorkflowFixture, localPath);

			// Add a different workflow to global
			const globalPath = path.join(
				mockConfig.resolvedPaths.globalWorkflows,
				"global-workflow@1.0.0",
			);
			await copyDir(testWorkflowFixture, globalPath);
			const globalPackageJson = path.join(globalPath, "package.json");
			const globalContent = JSON.parse(
				await fs.readFile(globalPackageJson, "utf-8"),
			);
			globalContent.name = "global-workflow";
			globalContent.keywords = ["workflow", "global"];
			await fs.writeFile(
				globalPackageJson,
				JSON.stringify(globalContent, null, 2),
			);
		});

		it("should list all workflows when scope is all", async () => {
			const entries = await resolver.list({ scope: "all" });

			expect(entries.length).toBe(2);
			expect(entries.map((e) => e.name)).toContain("test-workflow");
			expect(entries.map((e) => e.name)).toContain("global-workflow");
		});

		it("should filter by project scope", async () => {
			const entries = await resolver.list({ scope: "project" });

			expect(entries.length).toBe(1);
			expect(entries[0].name).toBe("test-workflow");
		});

		it("should filter by global scope", async () => {
			const entries = await resolver.list({ scope: "global" });

			expect(entries.length).toBe(1);
			expect(entries[0].name).toBe("global-workflow");
		});

		it("should filter by keyword", async () => {
			const entries = await resolver.list({ keyword: "integration" });

			expect(entries.length).toBe(1);
			expect(entries[0].name).toBe("test-workflow");
		});

		it("should include exports in list entries", async () => {
			const entries = await resolver.list();

			const testWorkflow = entries.find((e) => e.name === "test-workflow");
			expect(testWorkflow?.exports).toContain("default");
			expect(testWorkflow?.exports).toContain("alternate");
		});
	});

	// ============================================================================
	// exists() Integration
	// ============================================================================

	describe("exists() with fixtures", () => {
		beforeEach(async () => {
			const testWorkflowFixture = path.join(fixturesPath, "test-workflow");
			const projectLocalPath = path.join(
				mockConfig.resolvedPaths.projectWorkflows,
				"test-workflow",
			);
			await copyDir(testWorkflowFixture, projectLocalPath);
		});

		it("should return true for existing workflow", async () => {
			const exists = await resolver.exists("test-workflow");
			expect(exists).toBe(true);
		});

		it("should return false for non-existing workflow", async () => {
			const exists = await resolver.exists("nonexistent-workflow");
			expect(exists).toBe(false);
		});

		it("should return true for existing named export", async () => {
			const exists = await resolver.exists("test-workflow:alternate");
			expect(exists).toBe(true);
		});

		it("should return false for non-existing named export", async () => {
			const exists = await resolver.exists("test-workflow:nonexistent");
			expect(exists).toBe(false);
		});
	});

	// ============================================================================
	// Source Prefix Integration
	// ============================================================================

	describe("source prefixes with fixtures", () => {
		beforeEach(async () => {
			const testWorkflowFixture = path.join(fixturesPath, "test-workflow");

			// Add to project-local
			const localPath = path.join(
				mockConfig.resolvedPaths.projectWorkflows,
				"test-workflow",
			);
			await copyDir(testWorkflowFixture, localPath);

			// Add to global with different version
			const globalPath = path.join(
				mockConfig.resolvedPaths.globalWorkflows,
				"test-workflow@2.0.0",
			);
			await copyDir(testWorkflowFixture, globalPath);
			const globalPackageJson = path.join(globalPath, "package.json");
			const globalContent = JSON.parse(
				await fs.readFile(globalPackageJson, "utf-8"),
			);
			globalContent.version = "2.0.0";
			await fs.writeFile(
				globalPackageJson,
				JSON.stringify(globalContent, null, 2),
			);
		});

		it("should resolve from project with project: prefix", async () => {
			const result = await resolver.resolve("project:test-workflow");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value.source).toBe("project");
				expect(result.value.version).toBe("1.0.0");
			}
		});

		it("should resolve from global with global: prefix", async () => {
			const result = await resolver.resolve("global:test-workflow");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value.source).toBe("global");
				expect(result.value.version).toBe("2.0.0");
			}
		});

		it("should combine source prefix with version", async () => {
			const result = await resolver.resolve("global:test-workflow@^2.0.0");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value.source).toBe("global");
				expect(result.value.version).toBe("2.0.0");
			}
		});

		it("should combine source prefix with export", async () => {
			const result = await resolver.resolve("project:test-workflow:alternate");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value.source).toBe("project");
				expect(result.value.exportName).toBe("alternate");
			}
		});
	});
});
