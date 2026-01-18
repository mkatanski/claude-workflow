/**
 * Tests for WorkflowResolver - resolution order, source prefixes, and version matching.
 *
 * This module tests all resolution functionality in resolver.ts including:
 * - Three-tier resolution order (project-local → project-installed → global)
 * - Source prefix bypassing (project:, global:)
 * - Version matching (exact, caret, tilde, latest)
 * - Export validation
 * - Configuration overrides
 * - Caching integration
 * - Listing functionality
 * - Error handling with suggestions
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createResolutionCache } from "./cache.js";
import type { LoadedConfig, RegistryConfig, ResolvedPaths } from "./config.js";
import type { WorkflowResolver } from "./resolver.js";
import { createResolver, createResolverWithConfig } from "./resolver.js";
import type { WorkflowReference } from "./types.js";
import { RESOLUTION_ERROR_CODES } from "./types.js";

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Creates a temporary directory for tests.
 */
async function createTempDir(): Promise<string> {
	return await fs.mkdtemp(path.join(os.tmpdir(), "resolver-test-"));
}

/**
 * Creates a valid package.json content for a workflow.
 */
function createPackageJson(
	overrides: Record<string, unknown> = {},
): Record<string, unknown> {
	return {
		name: "test-workflow",
		version: "1.0.0",
		main: "./index.ts",
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
	await fs.mkdir(dir, { recursive: true });
	await fs.writeFile(
		path.join(dir, "package.json"),
		JSON.stringify(content, null, 2),
	);
}

/**
 * Creates a workflow package in a directory.
 */
async function createWorkflowPackage(
	basePath: string,
	name: string,
	version: string,
	options: {
		versioned?: boolean;
		workflows?: Record<string, string>;
		keywords?: string[];
		description?: string;
	} = {},
): Promise<string> {
	const dirName = options.versioned ? `${name}@${version}` : name;
	const packageDir = path.join(basePath, dirName);

	const packageJson = createPackageJson({
		name,
		version,
		description: options.description,
		keywords: options.keywords,
		workflows: options.workflows,
	});

	await writePackageJson(packageDir, packageJson);

	// Create a minimal entry file
	await fs.writeFile(
		path.join(packageDir, "index.ts"),
		'export default () => ({ name: "test", build: () => {} });',
	);

	return packageDir;
}

/**
 * Creates a mock LoadedConfig for testing.
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
// WorkflowResolver Tests
// ============================================================================

describe("WorkflowResolver", () => {
	let tempDir: string;
	let mockConfig: LoadedConfig;
	let resolver: WorkflowResolver;

	beforeEach(async () => {
		tempDir = await createTempDir();
		mockConfig = createMockConfig(tempDir);

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
	// Resolution Order Tests
	// ============================================================================

	describe("resolution order", () => {
		describe("three-tier precedence", () => {
			it("should resolve from project-local first when available", async () => {
				// Create workflow in all three locations
				await createWorkflowPackage(
					mockConfig.resolvedPaths.projectWorkflows,
					"test-workflow",
					"1.0.0",
				);
				await createWorkflowPackage(
					mockConfig.resolvedPaths.projectInstalled,
					"test-workflow",
					"2.0.0",
					{ versioned: true },
				);
				await createWorkflowPackage(
					mockConfig.resolvedPaths.globalWorkflows,
					"test-workflow",
					"3.0.0",
					{ versioned: true },
				);

				const result = await resolver.resolve("test-workflow");

				expect(result._tag).toBe("ok");
				if (result._tag === "ok") {
					expect(result.value.source).toBe("project");
					expect(result.value.version).toBe("1.0.0");
				}
			});

			it("should resolve from project-installed when project-local not available", async () => {
				// Create workflow in installed and global only
				await createWorkflowPackage(
					mockConfig.resolvedPaths.projectInstalled,
					"test-workflow",
					"2.0.0",
					{ versioned: true },
				);
				await createWorkflowPackage(
					mockConfig.resolvedPaths.globalWorkflows,
					"test-workflow",
					"3.0.0",
					{ versioned: true },
				);

				const result = await resolver.resolve("test-workflow");

				expect(result._tag).toBe("ok");
				if (result._tag === "ok") {
					expect(result.value.source).toBe("project-installed");
					expect(result.value.version).toBe("2.0.0");
				}
			});

			it("should resolve from global when project locations not available", async () => {
				// Create workflow in global only
				await createWorkflowPackage(
					mockConfig.resolvedPaths.globalWorkflows,
					"test-workflow",
					"3.0.0",
					{ versioned: true },
				);

				const result = await resolver.resolve("test-workflow");

				expect(result._tag).toBe("ok");
				if (result._tag === "ok") {
					expect(result.value.source).toBe("global");
					expect(result.value.version).toBe("3.0.0");
				}
			});

			it("should return error when workflow not found in any location", async () => {
				const result = await resolver.resolve("nonexistent-workflow");

				expect(result._tag).toBe("err");
				if (result._tag === "err") {
					expect(result.error.code).toBe(
						RESOLUTION_ERROR_CODES.WORKFLOW_NOT_FOUND,
					);
					expect(result.error.message).toContain("nonexistent-workflow");
					expect(result.error.suggestions).toBeDefined();
				}
			});
		});

		describe("version-based tier selection", () => {
			it("should select project-installed over global when version matches", async () => {
				// Both have matching versions, but installed should win
				await createWorkflowPackage(
					mockConfig.resolvedPaths.projectInstalled,
					"versioned-workflow",
					"1.5.0",
					{ versioned: true },
				);
				await createWorkflowPackage(
					mockConfig.resolvedPaths.globalWorkflows,
					"versioned-workflow",
					"1.5.0",
					{ versioned: true },
				);

				const result = await resolver.resolve("versioned-workflow@^1.0.0");

				expect(result._tag).toBe("ok");
				if (result._tag === "ok") {
					expect(result.value.source).toBe("project-installed");
					expect(result.value.version).toBe("1.5.0");
				}
			});

			it("should fallback to global when project-installed version doesn't match", async () => {
				// Project-installed has non-matching version
				await createWorkflowPackage(
					mockConfig.resolvedPaths.projectInstalled,
					"versioned-workflow",
					"0.9.0",
					{ versioned: true },
				);
				await createWorkflowPackage(
					mockConfig.resolvedPaths.globalWorkflows,
					"versioned-workflow",
					"1.5.0",
					{ versioned: true },
				);

				const result = await resolver.resolve("versioned-workflow@^1.0.0");

				expect(result._tag).toBe("ok");
				if (result._tag === "ok") {
					expect(result.value.source).toBe("global");
					expect(result.value.version).toBe("1.5.0");
				}
			});
		});
	});

	// ============================================================================
	// Source Prefix Tests
	// ============================================================================

	describe("source prefixes", () => {
		describe("project: prefix", () => {
			it("should resolve only from project sources with project: prefix", async () => {
				// Create in both project-local and global
				await createWorkflowPackage(
					mockConfig.resolvedPaths.projectWorkflows,
					"my-workflow",
					"1.0.0",
				);
				await createWorkflowPackage(
					mockConfig.resolvedPaths.globalWorkflows,
					"my-workflow",
					"2.0.0",
					{ versioned: true },
				);

				const result = await resolver.resolve("project:my-workflow");

				expect(result._tag).toBe("ok");
				if (result._tag === "ok") {
					expect(result.value.source).toBe("project");
					expect(result.value.version).toBe("1.0.0");
				}
			});

			it("should resolve from project-installed with project: prefix", async () => {
				// Only in project-installed
				await createWorkflowPackage(
					mockConfig.resolvedPaths.projectInstalled,
					"installed-only",
					"1.0.0",
					{ versioned: true },
				);
				await createWorkflowPackage(
					mockConfig.resolvedPaths.globalWorkflows,
					"installed-only",
					"2.0.0",
					{ versioned: true },
				);

				const result = await resolver.resolve("project:installed-only");

				expect(result._tag).toBe("ok");
				if (result._tag === "ok") {
					expect(result.value.source).toBe("project-installed");
					expect(result.value.version).toBe("1.0.0");
				}
			});

			it("should return error if workflow not in project with project: prefix", async () => {
				// Only in global
				await createWorkflowPackage(
					mockConfig.resolvedPaths.globalWorkflows,
					"global-only",
					"1.0.0",
					{ versioned: true },
				);

				const result = await resolver.resolve("project:global-only");

				expect(result._tag).toBe("err");
				if (result._tag === "err") {
					expect(result.error.code).toBe(
						RESOLUTION_ERROR_CODES.WORKFLOW_NOT_FOUND,
					);
				}
			});
		});

		describe("global: prefix", () => {
			it("should resolve only from global with global: prefix", async () => {
				// Create in both project-local and global
				await createWorkflowPackage(
					mockConfig.resolvedPaths.projectWorkflows,
					"my-workflow",
					"1.0.0",
				);
				await createWorkflowPackage(
					mockConfig.resolvedPaths.globalWorkflows,
					"my-workflow",
					"2.0.0",
					{ versioned: true },
				);

				const result = await resolver.resolve("global:my-workflow");

				expect(result._tag).toBe("ok");
				if (result._tag === "ok") {
					expect(result.value.source).toBe("global");
					expect(result.value.version).toBe("2.0.0");
				}
			});

			it("should return error if workflow not in global with global: prefix", async () => {
				// Only in project
				await createWorkflowPackage(
					mockConfig.resolvedPaths.projectWorkflows,
					"project-only",
					"1.0.0",
				);

				const result = await resolver.resolve("global:project-only");

				expect(result._tag).toBe("err");
				if (result._tag === "err") {
					expect(result.error.code).toBe(
						RESOLUTION_ERROR_CODES.WORKFLOW_NOT_FOUND,
					);
				}
			});
		});

		describe("combined prefix and version", () => {
			it("should resolve with source prefix and version", async () => {
				// Multiple versions in global
				await createWorkflowPackage(
					mockConfig.resolvedPaths.globalWorkflows,
					"multi-version",
					"1.0.0",
					{ versioned: true },
				);
				await createWorkflowPackage(
					mockConfig.resolvedPaths.globalWorkflows,
					"multi-version",
					"2.0.0",
					{ versioned: true },
				);

				const result = await resolver.resolve("global:multi-version@^1.0.0");

				expect(result._tag).toBe("ok");
				if (result._tag === "ok") {
					expect(result.value.source).toBe("global");
					expect(result.value.version).toBe("1.0.0");
				}
			});

			it("should resolve with source prefix, version, and export", async () => {
				await createWorkflowPackage(
					mockConfig.resolvedPaths.globalWorkflows,
					"tools",
					"1.0.0",
					{
						versioned: true,
						workflows: { refactor: "./refactor.ts" },
					},
				);

				const result = await resolver.resolve("global:tools@^1.0.0:refactor");

				expect(result._tag).toBe("ok");
				if (result._tag === "ok") {
					expect(result.value.source).toBe("global");
					expect(result.value.version).toBe("1.0.0");
					expect(result.value.exportName).toBe("refactor");
				}
			});
		});
	});

	// ============================================================================
	// Version Matching Tests
	// ============================================================================

	describe("version matching", () => {
		beforeEach(async () => {
			// Create multiple versions in project-installed
			await createWorkflowPackage(
				mockConfig.resolvedPaths.projectInstalled,
				"versioned",
				"1.0.0",
				{ versioned: true },
			);
			await createWorkflowPackage(
				mockConfig.resolvedPaths.projectInstalled,
				"versioned",
				"1.5.0",
				{ versioned: true },
			);
			await createWorkflowPackage(
				mockConfig.resolvedPaths.projectInstalled,
				"versioned",
				"2.0.0",
				{ versioned: true },
			);
			await createWorkflowPackage(
				mockConfig.resolvedPaths.projectInstalled,
				"versioned",
				"2.1.0",
				{ versioned: true },
			);
		});

		describe("exact version", () => {
			it("should resolve exact version", async () => {
				const result = await resolver.resolve("versioned@1.5.0");

				expect(result._tag).toBe("ok");
				if (result._tag === "ok") {
					expect(result.value.version).toBe("1.5.0");
				}
			});

			it("should return error for non-existent exact version", async () => {
				const result = await resolver.resolve("versioned@3.0.0");

				expect(result._tag).toBe("err");
				if (result._tag === "err") {
					expect(result.error.code).toBe(
						RESOLUTION_ERROR_CODES.VERSION_NOT_FOUND,
					);
					expect(result.error.availableVersions).toBeDefined();
					expect(result.error.availableVersions).toContain("2.1.0");
				}
			});
		});

		describe("caret range (^)", () => {
			it("should resolve highest compatible version with caret", async () => {
				const result = await resolver.resolve("versioned@^1.0.0");

				expect(result._tag).toBe("ok");
				if (result._tag === "ok") {
					expect(result.value.version).toBe("1.5.0");
				}
			});

			it("should resolve highest 2.x version with ^2.0.0", async () => {
				const result = await resolver.resolve("versioned@^2.0.0");

				expect(result._tag).toBe("ok");
				if (result._tag === "ok") {
					expect(result.value.version).toBe("2.1.0");
				}
			});

			it("should return error when no version satisfies caret range", async () => {
				const result = await resolver.resolve("versioned@^3.0.0");

				expect(result._tag).toBe("err");
				if (result._tag === "err") {
					expect(result.error.code).toBe(
						RESOLUTION_ERROR_CODES.VERSION_NOT_FOUND,
					);
					expect(result.error.suggestions).toBeDefined();
					expect(
						result.error.suggestions?.some((s) =>
							s.includes("Available versions"),
						),
					).toBe(true);
				}
			});
		});

		describe("tilde range (~)", () => {
			it("should resolve highest patch version with tilde", async () => {
				const result = await resolver.resolve("versioned@~2.0.0");

				expect(result._tag).toBe("ok");
				if (result._tag === "ok") {
					// ~2.0.0 should match 2.0.x only
					expect(result.value.version).toBe("2.0.0");
				}
			});
		});

		describe("latest (no version)", () => {
			it("should resolve to latest version when no version specified", async () => {
				const result = await resolver.resolve("versioned");

				expect(result._tag).toBe("ok");
				if (result._tag === "ok") {
					expect(result.value.version).toBe("2.1.0");
				}
			});
		});

		describe("wildcard (*)", () => {
			it("should resolve to latest version with wildcard", async () => {
				const result = await resolver.resolve("versioned@*");

				expect(result._tag).toBe("ok");
				if (result._tag === "ok") {
					expect(result.value.version).toBe("2.1.0");
				}
			});
		});

		describe("range comparators", () => {
			it("should resolve with >= comparator", async () => {
				const result = await resolver.resolve("versioned@>=1.5.0");

				expect(result._tag).toBe("ok");
				if (result._tag === "ok") {
					expect(result.value.version).toBe("2.1.0");
				}
			});

			it("should resolve with < comparator", async () => {
				const result = await resolver.resolve("versioned@<2.0.0");

				expect(result._tag).toBe("ok");
				if (result._tag === "ok") {
					expect(result.value.version).toBe("1.5.0");
				}
			});
		});

		describe("prerelease versions", () => {
			beforeEach(async () => {
				await createWorkflowPackage(
					mockConfig.resolvedPaths.projectInstalled,
					"prerelease",
					"1.0.0-alpha.1",
					{ versioned: true },
				);
				await createWorkflowPackage(
					mockConfig.resolvedPaths.projectInstalled,
					"prerelease",
					"1.0.0-beta.1",
					{ versioned: true },
				);
				await createWorkflowPackage(
					mockConfig.resolvedPaths.projectInstalled,
					"prerelease",
					"1.0.0",
					{ versioned: true },
				);
			});

			it("should prefer stable versions by default", async () => {
				const result = await resolver.resolve("prerelease");

				expect(result._tag).toBe("ok");
				if (result._tag === "ok") {
					expect(result.value.version).toBe("1.0.0");
				}
			});

			it("should include prereleases with context flag", async () => {
				const result = await resolver.resolve("prerelease", {
					includePrerelease: true,
				});

				expect(result._tag).toBe("ok");
				if (result._tag === "ok") {
					// With includePrerelease, should still prefer stable
					expect(result.value.version).toBe("1.0.0");
				}
			});
		});
	});

	// ============================================================================
	// Export Validation Tests
	// ============================================================================

	describe("export validation", () => {
		beforeEach(async () => {
			await createWorkflowPackage(
				mockConfig.resolvedPaths.projectWorkflows,
				"multi-export",
				"1.0.0",
				{
					workflows: {
						planning: "./planning.ts",
						refactor: "./refactor.ts",
					},
				},
			);
		});

		it("should resolve default export", async () => {
			const result = await resolver.resolve("multi-export");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value.exportName).toBe("default");
			}
		});

		it("should resolve named export", async () => {
			const result = await resolver.resolve("multi-export:planning");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value.exportName).toBe("planning");
			}
		});

		it("should return error for non-existent export", async () => {
			const result = await resolver.resolve("multi-export:nonexistent");

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.code).toBe(RESOLUTION_ERROR_CODES.EXPORT_NOT_FOUND);
				expect(result.error.availableExports).toBeDefined();
				expect(result.error.availableExports).toContain("planning");
				expect(result.error.availableExports).toContain("refactor");
				expect(result.error.availableExports).toContain("default");
			}
		});

		it("should include available exports in error suggestions", async () => {
			const result = await resolver.resolve("multi-export:bad-export");

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.suggestions).toBeDefined();
				expect(
					result.error.suggestions?.some((s) =>
						s.includes("Available exports"),
					),
				).toBe(true);
			}
		});
	});

	// ============================================================================
	// Configuration Override Tests
	// ============================================================================

	describe("configuration overrides", () => {
		it("should apply source override from config", async () => {
			// Create in both locations
			await createWorkflowPackage(
				mockConfig.resolvedPaths.projectWorkflows,
				"overridden-workflow",
				"1.0.0",
			);
			await createWorkflowPackage(
				mockConfig.resolvedPaths.globalWorkflows,
				"overridden-workflow",
				"2.0.0",
				{ versioned: true },
			);

			// Create resolver with source override
			const configWithOverride = createMockConfig(tempDir, {
				resolution: {
					overrides: {
						"overridden-workflow": { source: "global" },
					},
				},
			});
			const resolverWithOverride = createResolver({
				config: configWithOverride,
				cwd: tempDir,
			});

			const result = await resolverWithOverride.resolve("overridden-workflow");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value.source).toBe("global");
				expect(result.value.version).toBe("2.0.0");
			}
		});

		it("should apply version override from config", async () => {
			// Create multiple versions
			await createWorkflowPackage(
				mockConfig.resolvedPaths.projectInstalled,
				"pinned-workflow",
				"1.0.0",
				{ versioned: true },
			);
			await createWorkflowPackage(
				mockConfig.resolvedPaths.projectInstalled,
				"pinned-workflow",
				"2.0.0",
				{ versioned: true },
			);

			// Create resolver with version override
			const configWithOverride = createMockConfig(tempDir, {
				resolution: {
					overrides: {
						"pinned-workflow": { version: "1.0.0" },
					},
				},
			});
			const resolverWithOverride = createResolver({
				config: configWithOverride,
				cwd: tempDir,
			});

			// Resolve without version - should use pinned version
			const result = await resolverWithOverride.resolve("pinned-workflow");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value.version).toBe("1.0.0");
			}
		});

		it("should not apply override when reference has explicit source", async () => {
			await createWorkflowPackage(
				mockConfig.resolvedPaths.projectWorkflows,
				"explicit-source",
				"1.0.0",
			);
			await createWorkflowPackage(
				mockConfig.resolvedPaths.globalWorkflows,
				"explicit-source",
				"2.0.0",
				{ versioned: true },
			);

			// Create resolver with override to global
			const configWithOverride = createMockConfig(tempDir, {
				resolution: {
					overrides: {
						"explicit-source": { source: "global" },
					},
				},
			});
			const resolverWithOverride = createResolver({
				config: configWithOverride,
				cwd: tempDir,
			});

			// Explicit project: prefix should take precedence over config
			const result = await resolverWithOverride.resolve(
				"project:explicit-source",
			);

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value.source).toBe("project");
				expect(result.value.version).toBe("1.0.0");
			}
		});
	});

	// ============================================================================
	// Scoped Package Tests
	// ============================================================================

	describe("scoped packages", () => {
		it("should resolve scoped package from project-local", async () => {
			// Create scoped package directory structure
			const scopeDir = path.join(
				mockConfig.resolvedPaths.projectWorkflows,
				"@myorg",
			);
			await fs.mkdir(scopeDir, { recursive: true });
			await createWorkflowPackage(scopeDir, "planning", "1.0.0");

			const result = await resolver.resolve("@myorg/planning");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value.source).toBe("project");
				expect(result.value.reference.name).toBe("@myorg/planning");
			}
		});

		it("should resolve scoped package with version from installed", async () => {
			await createWorkflowPackage(
				mockConfig.resolvedPaths.projectInstalled,
				"@myorg/deploy",
				"2.0.0",
				{ versioned: true },
			);

			const result = await resolver.resolve("@myorg/deploy@^2.0.0");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value.version).toBe("2.0.0");
				expect(result.value.reference.name).toBe("@myorg/deploy");
			}
		});

		it("should resolve scoped package with source prefix", async () => {
			await createWorkflowPackage(
				mockConfig.resolvedPaths.globalWorkflows,
				"@myorg/shared",
				"1.0.0",
				{ versioned: true },
			);

			const result = await resolver.resolve("global:@myorg/shared");

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value.source).toBe("global");
				expect(result.value.reference.name).toBe("@myorg/shared");
			}
		});
	});

	// ============================================================================
	// Caching Tests
	// ============================================================================

	describe("caching", () => {
		it("should use cached result on second resolve", async () => {
			const cache = createResolutionCache({ cleanupInterval: 0 });
			const cachedResolver = createResolver({
				config: mockConfig,
				cache,
				cwd: tempDir,
			});

			await createWorkflowPackage(
				mockConfig.resolvedPaths.projectWorkflows,
				"cached-workflow",
				"1.0.0",
			);

			// First resolve
			const result1 = await cachedResolver.resolve("cached-workflow");
			expect(result1._tag).toBe("ok");

			// Second resolve should hit cache
			const result2 = await cachedResolver.resolve("cached-workflow");
			expect(result2._tag).toBe("ok");

			// Verify cache stats
			const stats = cache.getStats();
			expect(stats.hits).toBeGreaterThanOrEqual(1);

			cache.dispose();
		});

		it("should bypass cache with noCache context", async () => {
			const cache = createResolutionCache({ cleanupInterval: 0 });
			const cachedResolver = createResolver({
				config: mockConfig,
				cache,
				cwd: tempDir,
			});

			await createWorkflowPackage(
				mockConfig.resolvedPaths.projectWorkflows,
				"nocache-workflow",
				"1.0.0",
			);

			// First resolve to populate cache
			await cachedResolver.resolve("nocache-workflow");

			// Reset stats
			cache.resetStats();

			// Resolve with noCache
			const result = await cachedResolver.resolve("nocache-workflow", {
				noCache: true,
			});
			expect(result._tag).toBe("ok");

			// Should not have hit cache
			const stats = cache.getStats();
			expect(stats.hits).toBe(0);

			cache.dispose();
		});

		it("should refresh cache", async () => {
			const cache = createResolutionCache({ cleanupInterval: 0 });
			const cachedResolver = createResolver({
				config: mockConfig,
				cache,
				cwd: tempDir,
			});

			await createWorkflowPackage(
				mockConfig.resolvedPaths.projectWorkflows,
				"refresh-workflow",
				"1.0.0",
			);

			// Populate cache
			await cachedResolver.resolve("refresh-workflow");
			expect(cache.size).toBeGreaterThan(0);

			// Refresh
			await cachedResolver.refresh();
			expect(cache.size).toBe(0);

			cache.dispose();
		});
	});

	// ============================================================================
	// exists() Method Tests
	// ============================================================================

	describe("exists()", () => {
		it("should return true for existing workflow", async () => {
			await createWorkflowPackage(
				mockConfig.resolvedPaths.projectWorkflows,
				"existing-workflow",
				"1.0.0",
			);

			const exists = await resolver.exists("existing-workflow");

			expect(exists).toBe(true);
		});

		it("should return false for non-existing workflow", async () => {
			const exists = await resolver.exists("nonexistent");

			expect(exists).toBe(false);
		});

		it("should return false for version that doesn't satisfy range", async () => {
			await createWorkflowPackage(
				mockConfig.resolvedPaths.projectInstalled,
				"version-check",
				"1.0.0",
				{ versioned: true },
			);

			const exists = await resolver.exists("version-check@^2.0.0");

			expect(exists).toBe(false);
		});
	});

	// ============================================================================
	// getVersions() Method Tests
	// ============================================================================

	describe("getVersions()", () => {
		it("should return all installed versions", async () => {
			await createWorkflowPackage(
				mockConfig.resolvedPaths.projectWorkflows,
				"multi-version",
				"1.0.0",
			);
			await createWorkflowPackage(
				mockConfig.resolvedPaths.projectInstalled,
				"multi-version",
				"1.5.0",
				{ versioned: true },
			);
			await createWorkflowPackage(
				mockConfig.resolvedPaths.globalWorkflows,
				"multi-version",
				"2.0.0",
				{ versioned: true },
			);

			const versions = await resolver.getVersions("multi-version");

			expect(versions.length).toBe(3);
			expect(versions.map((v) => v.version)).toContain("1.0.0");
			expect(versions.map((v) => v.version)).toContain("1.5.0");
			expect(versions.map((v) => v.version)).toContain("2.0.0");
		});

		it("should include source information in version list", async () => {
			await createWorkflowPackage(
				mockConfig.resolvedPaths.projectWorkflows,
				"source-check",
				"1.0.0",
			);
			await createWorkflowPackage(
				mockConfig.resolvedPaths.globalWorkflows,
				"source-check",
				"2.0.0",
				{ versioned: true },
			);

			const versions = await resolver.getVersions("source-check");

			const projectVersion = versions.find((v) => v.version === "1.0.0");
			const globalVersion = versions.find((v) => v.version === "2.0.0");

			expect(projectVersion?.source).toBe("project");
			expect(globalVersion?.source).toBe("global");
		});

		it("should return empty array for non-existing workflow", async () => {
			const versions = await resolver.getVersions("nonexistent");

			expect(versions).toEqual([]);
		});
	});

	// ============================================================================
	// list() Method Tests
	// ============================================================================

	describe("list()", () => {
		beforeEach(async () => {
			await createWorkflowPackage(
				mockConfig.resolvedPaths.projectWorkflows,
				"project-workflow",
				"1.0.0",
				{ description: "Project workflow", keywords: ["project"] },
			);
			await createWorkflowPackage(
				mockConfig.resolvedPaths.projectInstalled,
				"installed-workflow",
				"2.0.0",
				{
					versioned: true,
					description: "Installed workflow",
					keywords: ["installed"],
				},
			);
			await createWorkflowPackage(
				mockConfig.resolvedPaths.globalWorkflows,
				"global-workflow",
				"3.0.0",
				{
					versioned: true,
					description: "Global workflow",
					keywords: ["global"],
				},
			);
		});

		it("should list all workflows by default", async () => {
			const entries = await resolver.list();

			expect(entries.length).toBe(3);
			expect(entries.map((e) => e.name)).toContain("project-workflow");
			expect(entries.map((e) => e.name)).toContain("installed-workflow");
			expect(entries.map((e) => e.name)).toContain("global-workflow");
		});

		it("should filter by project scope", async () => {
			const entries = await resolver.list({ scope: "project" });

			expect(entries.length).toBe(2);
			expect(entries.map((e) => e.name)).toContain("project-workflow");
			expect(entries.map((e) => e.name)).toContain("installed-workflow");
			expect(entries.map((e) => e.name)).not.toContain("global-workflow");
		});

		it("should filter by global scope", async () => {
			const entries = await resolver.list({ scope: "global" });

			expect(entries.length).toBe(1);
			expect(entries.map((e) => e.name)).toContain("global-workflow");
		});

		it("should filter by keyword", async () => {
			const entries = await resolver.list({ keyword: "project" });

			expect(entries.length).toBe(1);
			expect(entries[0].name).toBe("project-workflow");
		});

		it("should filter by name pattern", async () => {
			const entries = await resolver.list({ pattern: "project*" });

			expect(entries.length).toBe(1);
			expect(entries[0].name).toBe("project-workflow");
		});

		it("should include versions and exports in entries", async () => {
			const entries = await resolver.list();

			const projectEntry = entries.find((e) => e.name === "project-workflow");
			expect(projectEntry?.versions).toBeDefined();
			expect(projectEntry?.versions.length).toBeGreaterThan(0);
			expect(projectEntry?.latestVersion).toBe("1.0.0");
			expect(projectEntry?.exports).toContain("default");
		});

		it("should sort entries by name", async () => {
			const entries = await resolver.list();

			const names = entries.map((e) => e.name);
			const sortedNames = [...names].sort();
			expect(names).toEqual(sortedNames);
		});
	});

	// ============================================================================
	// getPaths() Method Tests
	// ============================================================================

	describe("getPaths()", () => {
		it("should return resolved paths", () => {
			const paths = resolver.getPaths();

			expect(paths.projectWorkflows).toBe(
				mockConfig.resolvedPaths.projectWorkflows,
			);
			expect(paths.projectInstalled).toBe(
				mockConfig.resolvedPaths.projectInstalled,
			);
			expect(paths.globalWorkflows).toBe(
				mockConfig.resolvedPaths.globalWorkflows,
			);
			expect(paths.projectRoot).toBe(tempDir);
		});
	});

	// ============================================================================
	// Input Normalization Tests
	// ============================================================================

	describe("input normalization", () => {
		it("should accept WorkflowReference object", async () => {
			await createWorkflowPackage(
				mockConfig.resolvedPaths.projectWorkflows,
				"object-input",
				"1.0.0",
			);

			const ref: WorkflowReference = { name: "object-input" };
			const result = await resolver.resolve(ref);

			expect(result._tag).toBe("ok");
		});

		it("should accept WorkflowReference with all fields", async () => {
			await createWorkflowPackage(
				mockConfig.resolvedPaths.globalWorkflows,
				"full-ref",
				"1.0.0",
				{ versioned: true, workflows: { custom: "./custom.ts" } },
			);

			const ref: WorkflowReference = {
				name: "full-ref",
				version: "^1.0.0",
				export: "custom",
				source: "global",
			};
			const result = await resolver.resolve(ref);

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value.version).toBe("1.0.0");
				expect(result.value.exportName).toBe("custom");
				expect(result.value.source).toBe("global");
			}
		});

		it("should return error for invalid reference", async () => {
			const result = await resolver.resolve("");

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.code).toBe(
					RESOLUTION_ERROR_CODES.INVALID_REFERENCE,
				);
			}
		});
	});

	// ============================================================================
	// Error Handling Tests
	// ============================================================================

	describe("error handling", () => {
		it("should provide suggestions for workflow not found", async () => {
			const result = await resolver.resolve("missing-workflow");

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.code).toBe(
					RESOLUTION_ERROR_CODES.WORKFLOW_NOT_FOUND,
				);
				expect(result.error.suggestions).toBeDefined();
				expect(result.error.suggestions?.length).toBeGreaterThan(0);
				expect(
					result.error.suggestions?.some((s) => s.includes("cw list")),
				).toBe(true);
			}
		});

		it("should provide available versions in version not found error", async () => {
			await createWorkflowPackage(
				mockConfig.resolvedPaths.projectInstalled,
				"version-error",
				"1.0.0",
				{ versioned: true },
			);

			const result = await resolver.resolve("version-error@^2.0.0");

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.code).toBe(
					RESOLUTION_ERROR_CODES.VERSION_NOT_FOUND,
				);
				expect(result.error.availableVersions).toBeDefined();
				expect(result.error.availableVersions).toContain("1.0.0");
				expect(result.error.suggestions?.some((s) => s.includes("1.0.0"))).toBe(
					true,
				);
			}
		});

		it("should provide available exports in export not found error", async () => {
			await createWorkflowPackage(
				mockConfig.resolvedPaths.projectWorkflows,
				"export-error",
				"1.0.0",
				{ workflows: { valid: "./valid.ts" } },
			);

			const result = await resolver.resolve("export-error:invalid");

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.code).toBe(RESOLUTION_ERROR_CODES.EXPORT_NOT_FOUND);
				expect(result.error.availableExports).toBeDefined();
				expect(result.error.availableExports).toContain("valid");
				expect(result.error.availableExports).toContain("default");
			}
		});
	});
});

// ============================================================================
// createResolver Tests
// ============================================================================

describe("createResolver", () => {
	it("should create resolver with default options", () => {
		const resolver = createResolver();

		expect(resolver).toBeDefined();
		expect(typeof resolver.resolve).toBe("function");
		expect(typeof resolver.exists).toBe("function");
		expect(typeof resolver.getVersions).toBe("function");
		expect(typeof resolver.list).toBe("function");
	});

	it("should create resolver with custom cwd", async () => {
		const tempDir = await createTempDir();
		try {
			const resolver = createResolver({ cwd: tempDir });
			const paths = resolver.getPaths();

			expect(paths.projectRoot).toBe(tempDir);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("should create resolver with custom config", async () => {
		const tempDir = await createTempDir();
		try {
			const config = createMockConfig(tempDir);
			const resolver = createResolver({ config, cwd: tempDir });
			const paths = resolver.getPaths();

			expect(paths).toEqual(config.resolvedPaths);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});
});

// ============================================================================
// createResolverWithConfig Tests
// ============================================================================

describe("createResolverWithConfig", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir();
	});

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true });
	});

	it("should create resolver when no config exists", async () => {
		const result = await createResolverWithConfig(tempDir);

		expect(result._tag).toBe("ok");
		if (result._tag === "ok") {
			expect(result.value).toBeDefined();
			expect(typeof result.value.resolve).toBe("function");
		}
	});

	it("should accept optional cache parameter", async () => {
		const cache = createResolutionCache({ cleanupInterval: 0 });
		const result = await createResolverWithConfig(tempDir, cache);

		expect(result._tag).toBe("ok");

		cache.dispose();
	});
});
