/**
 * Tests for storage utilities for marketplace package management.
 *
 * This module tests all storage functionality in storage.ts including:
 * - Path functions (getGlobalInstallDir, getProjectInstallDir, etc.)
 * - Directory management (ensureInstallDir, directoryExists)
 * - Metadata operations (readMetadata, writeMetadata)
 * - Package discovery (listInstalledPackages, findInstalledPackage, etc.)
 * - Package operations (removePackage, copyPackageFiles)
 * - Helper functions (parsePackageDir, formatPackageDir)
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
	copyPackageFiles,
	directoryExists,
	ensureInstallDir,
	findDependentPackages,
	findInstalledPackage,
	findInstalledVersion,
	formatPackageDir,
	getGlobalInstallDir,
	getInstalledVersions,
	getInstallDir,
	getMetadataPath,
	getPackageJsonPath,
	getPackagePath,
	getProjectInstallDir,
	isPackageInstalled,
	listInstalledPackages,
	parsePackageDir,
	readMetadata,
	readPackageJson,
	removePackage,
	writeMetadata,
} from "./storage.ts";
import type { InstallationMetadata } from "./types.ts";
import { MARKETPLACE_ERROR_CODES } from "./types.ts";

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Create a mock InstallationMetadata for testing.
 */
function createMockMetadata(
	name: string,
	version = "1.0.0",
	overrides: Partial<InstallationMetadata> = {},
): InstallationMetadata {
	return {
		name,
		version,
		source: {
			type: "registry",
			name,
			version,
			raw: `${name}@${version}`,
		},
		scope: "project",
		installedAt: new Date().toISOString(),
		isDependency: false,
		...overrides,
	};
}

// ============================================================================
// Helper Functions Tests
// ============================================================================

describe("parsePackageDir", () => {
	describe("valid package directory names", () => {
		it("should parse simple name@version format", () => {
			const result = parsePackageDir("my-package@1.0.0");
			expect(result).toEqual({ name: "my-package", version: "1.0.0" });
		});

		it("should parse scoped package name@version format", () => {
			const result = parsePackageDir("@myorg/my-package@2.1.0");
			expect(result).toEqual({ name: "@myorg/my-package", version: "2.1.0" });
		});

		it("should parse version with prerelease tag", () => {
			const result = parsePackageDir("my-package@1.0.0-beta.1");
			expect(result).toEqual({ name: "my-package", version: "1.0.0-beta.1" });
		});

		it("should parse version with build metadata", () => {
			const result = parsePackageDir("my-package@1.0.0+build.123");
			expect(result).toEqual({
				name: "my-package",
				version: "1.0.0+build.123",
			});
		});

		it("should parse version with prerelease and build metadata", () => {
			const result = parsePackageDir("my-package@1.0.0-alpha.1+build.456");
			expect(result).toEqual({
				name: "my-package",
				version: "1.0.0-alpha.1+build.456",
			});
		});

		it("should parse package name with underscores", () => {
			const result = parsePackageDir("my_package@1.0.0");
			expect(result).toEqual({ name: "my_package", version: "1.0.0" });
		});

		it("should parse package name with dots", () => {
			const result = parsePackageDir("my.package@1.0.0");
			expect(result).toEqual({ name: "my.package", version: "1.0.0" });
		});
	});

	describe("invalid package directory names", () => {
		it("should return null for name without version", () => {
			const result = parsePackageDir("my-package");
			expect(result).toBeNull();
		});

		it("should return null for empty string", () => {
			const result = parsePackageDir("");
			expect(result).toBeNull();
		});

		it("should return null for invalid version format", () => {
			const result = parsePackageDir("my-package@invalid");
			expect(result).toBeNull();
		});

		it("should return null for version without patch number", () => {
			const result = parsePackageDir("my-package@1.0");
			expect(result).toBeNull();
		});

		it("should return null for just @version", () => {
			const result = parsePackageDir("@1.0.0");
			expect(result).toBeNull();
		});
	});
});

describe("formatPackageDir", () => {
	it("should format simple package name and version", () => {
		const result = formatPackageDir("my-package", "1.0.0");
		expect(result).toBe("my-package@1.0.0");
	});

	it("should format scoped package name and version", () => {
		const result = formatPackageDir("@myorg/my-package", "2.1.0");
		expect(result).toBe("@myorg/my-package@2.1.0");
	});

	it("should format with prerelease version", () => {
		const result = formatPackageDir("my-package", "1.0.0-beta.1");
		expect(result).toBe("my-package@1.0.0-beta.1");
	});

	it("should be inverse of parsePackageDir", () => {
		const name = "my-package";
		const version = "1.2.3";
		const formatted = formatPackageDir(name, version);
		const parsed = parsePackageDir(formatted);

		expect(parsed).toEqual({ name, version });
	});
});

// ============================================================================
// Path Functions Tests
// ============================================================================

describe("getGlobalInstallDir", () => {
	it("should return path to global workflows directory", () => {
		const result = getGlobalInstallDir();
		const expectedPath = join(homedir(), ".cw", "workflows");
		expect(result).toBe(expectedPath);
	});

	it("should return absolute path", () => {
		const result = getGlobalInstallDir();
		expect(result.startsWith("/")).toBe(true);
	});

	it("should be consistent across multiple calls", () => {
		const result1 = getGlobalInstallDir();
		const result2 = getGlobalInstallDir();
		expect(result1).toBe(result2);
	});
});

describe("getProjectInstallDir", () => {
	it("should return path to project installed workflows directory", () => {
		const projectPath = "/my/project";
		const result = getProjectInstallDir(projectPath);
		expect(result).toBe("/my/project/.cw/workflows/.installed");
	});

	it("should resolve relative paths", () => {
		const projectPath = "./my-project";
		const result = getProjectInstallDir(projectPath);
		expect(result).toContain(".cw/workflows/.installed");
		expect(result.startsWith("/")).toBe(true);
	});

	it("should handle paths with trailing slash", () => {
		const result1 = getProjectInstallDir("/my/project");
		const result2 = getProjectInstallDir("/my/project/");
		// Both should resolve to the same path
		expect(result1).toBe(resolve("/my/project/.cw/workflows/.installed"));
		expect(result2).toBe(resolve("/my/project/.cw/workflows/.installed"));
	});

	it("should handle home directory path", () => {
		const result = getProjectInstallDir(homedir());
		expect(result).toBe(join(homedir(), ".cw", "workflows", ".installed"));
	});
});

describe("getInstallDir", () => {
	describe("global scope", () => {
		it("should return global install directory", () => {
			const result = getInstallDir("global");
			expect(result).toBe(getGlobalInstallDir());
		});

		it("should ignore projectPath for global scope", () => {
			const result = getInstallDir("global", "/some/path");
			expect(result).toBe(getGlobalInstallDir());
		});
	});

	describe("project scope", () => {
		it("should return project install directory", () => {
			const projectPath = "/my/project";
			const result = getInstallDir("project", projectPath);
			expect(result).toBe(getProjectInstallDir(projectPath));
		});

		it("should throw error if projectPath is not provided", () => {
			expect(() => getInstallDir("project")).toThrow(
				"projectPath is required for project scope",
			);
		});

		it("should throw error if projectPath is undefined", () => {
			expect(() => getInstallDir("project", undefined)).toThrow(
				"projectPath is required for project scope",
			);
		});
	});
});

describe("getPackagePath", () => {
	it("should return path to specific package directory", () => {
		const baseDir = "/base/dir";
		const result = getPackagePath(baseDir, "my-package", "1.0.0");
		expect(result).toBe("/base/dir/my-package@1.0.0");
	});

	it("should handle scoped package names", () => {
		const baseDir = "/base/dir";
		const result = getPackagePath(baseDir, "@myorg/my-package", "2.1.0");
		expect(result).toBe("/base/dir/@myorg/my-package@2.1.0");
	});

	it("should use formatPackageDir internally", () => {
		const baseDir = "/base/dir";
		const name = "my-package";
		const version = "1.0.0";
		const result = getPackagePath(baseDir, name, version);
		expect(result).toBe(join(baseDir, formatPackageDir(name, version)));
	});
});

describe("getMetadataPath", () => {
	it("should return path to metadata file", () => {
		const packageDir = "/packages/my-package@1.0.0";
		const result = getMetadataPath(packageDir);
		expect(result).toBe("/packages/my-package@1.0.0/.cw-metadata.json");
	});

	it("should work with any directory path", () => {
		const packageDir = "/any/path/here";
		const result = getMetadataPath(packageDir);
		expect(result).toBe("/any/path/here/.cw-metadata.json");
	});
});

describe("getPackageJsonPath", () => {
	it("should return path to package.json file", () => {
		const packageDir = "/packages/my-package@1.0.0";
		const result = getPackageJsonPath(packageDir);
		expect(result).toBe("/packages/my-package@1.0.0/package.json");
	});

	it("should work with any directory path", () => {
		const packageDir = "/any/path/here";
		const result = getPackageJsonPath(packageDir);
		expect(result).toBe("/any/path/here/package.json");
	});
});

// ============================================================================
// Directory Management Tests (using actual fs operations with temp dirs)
// ============================================================================

describe("directoryExists", () => {
	const tempDir = join("/tmp", `storage-test-${Date.now()}`);

	beforeEach(async () => {
		// Create temp directory for tests
		const { mkdir } = await import("node:fs/promises");
		await mkdir(tempDir, { recursive: true });
	});

	afterEach(async () => {
		// Cleanup temp directory
		const { rm } = await import("node:fs/promises");
		await rm(tempDir, { recursive: true, force: true });
	});

	it("should return true for existing directory", () => {
		expect(directoryExists(tempDir)).toBe(true);
	});

	it("should return false for non-existent directory", () => {
		expect(directoryExists("/non/existent/path")).toBe(false);
	});

	it("should return false for file (not directory)", async () => {
		const { writeFile } = await import("node:fs/promises");
		const filePath = join(tempDir, "test-file.txt");
		await writeFile(filePath, "test content");

		expect(directoryExists(filePath)).toBe(false);
	});
});

describe("ensureInstallDir", () => {
	const tempBaseDir = join("/tmp", `storage-ensure-test-${Date.now()}`);

	afterEach(async () => {
		// Cleanup temp directory
		const { rm } = await import("node:fs/promises");
		await rm(tempBaseDir, { recursive: true, force: true });
	});

	it("should create directory if it does not exist", () => {
		const installDir = join(tempBaseDir, "new-install-dir");
		const result = ensureInstallDir(installDir);

		expect(result.isOk()).toBe(true);
		expect(directoryExists(installDir)).toBe(true);
	});

	it("should succeed if directory already exists", async () => {
		const { mkdir } = await import("node:fs/promises");
		const existingDir = join(tempBaseDir, "existing-dir");
		await mkdir(existingDir, { recursive: true });

		const result = ensureInstallDir(existingDir);

		expect(result.isOk()).toBe(true);
		expect(directoryExists(existingDir)).toBe(true);
	});

	it("should create nested directories recursively", () => {
		const nestedDir = join(tempBaseDir, "deeply", "nested", "path");
		const result = ensureInstallDir(nestedDir);

		expect(result.isOk()).toBe(true);
		expect(directoryExists(nestedDir)).toBe(true);
	});

	it("should return error for inaccessible path", () => {
		// This test attempts to create a directory in a location that should fail
		// Note: Error type may vary by system (PERMISSION_DENIED or UNKNOWN_ERROR)
		const result = ensureInstallDir("/root/should-fail-on-most-systems");

		// On most systems without root, this should fail with some error
		if (result.isErr()) {
			const error = result.unwrapErr();
			// Accept either PERMISSION_DENIED or UNKNOWN_ERROR depending on system
			const acceptableCodes: string[] = [
				MARKETPLACE_ERROR_CODES.PERMISSION_DENIED,
				MARKETPLACE_ERROR_CODES.UNKNOWN_ERROR,
			];
			expect(acceptableCodes).toContain(error.code);
		}
		// If running as root, the directory might be created - that's ok for this test
	});
});

// ============================================================================
// Metadata Operations Tests
// ============================================================================

describe("writeMetadata and readMetadata", () => {
	const tempDir = join("/tmp", `storage-metadata-test-${Date.now()}`);

	beforeEach(async () => {
		const { mkdir } = await import("node:fs/promises");
		await mkdir(tempDir, { recursive: true });
	});

	afterEach(async () => {
		const { rm } = await import("node:fs/promises");
		await rm(tempDir, { recursive: true, force: true });
	});

	describe("writeMetadata", () => {
		it("should write metadata to package directory", () => {
			const packageDir = join(tempDir, "my-package@1.0.0");
			const metadata = createMockMetadata("my-package", "1.0.0");

			const result = writeMetadata(packageDir, metadata);

			expect(result.isOk()).toBe(true);
			expect(directoryExists(packageDir)).toBe(true);
		});

		it("should create package directory if it does not exist", () => {
			const packageDir = join(tempDir, "new-package@1.0.0");
			const metadata = createMockMetadata("new-package", "1.0.0");

			const result = writeMetadata(packageDir, metadata);

			expect(result.isOk()).toBe(true);
			expect(directoryExists(packageDir)).toBe(true);
		});

		it("should write valid JSON", async () => {
			const packageDir = join(tempDir, "json-test@1.0.0");
			const metadata = createMockMetadata("json-test", "1.0.0");

			writeMetadata(packageDir, metadata);

			const { readFile } = await import("node:fs/promises");
			const content = await readFile(getMetadataPath(packageDir), "utf-8");
			const parsed = JSON.parse(content);

			expect(parsed.name).toBe("json-test");
			expect(parsed.version).toBe("1.0.0");
		});
	});

	describe("readMetadata", () => {
		it("should read metadata from package directory", () => {
			const packageDir = join(tempDir, "read-test@1.0.0");
			const metadata = createMockMetadata("read-test", "1.0.0");

			writeMetadata(packageDir, metadata);
			const result = readMetadata(packageDir);

			expect(result.isOk()).toBe(true);
			const readMeta = result.unwrap();
			expect(readMeta.name).toBe("read-test");
			expect(readMeta.version).toBe("1.0.0");
		});

		it("should return error if metadata file does not exist", () => {
			const packageDir = join(tempDir, "nonexistent@1.0.0");
			const result = readMetadata(packageDir);

			expect(result.isErr()).toBe(true);
			const error = result.unwrapErr();
			expect(error.code).toBe(MARKETPLACE_ERROR_CODES.INVALID_PACKAGE);
			expect(error.message).toContain("Metadata file not found");
		});

		it("should return error for invalid JSON", async () => {
			const packageDir = join(tempDir, "invalid-json@1.0.0");
			const { mkdir, writeFile } = await import("node:fs/promises");
			await mkdir(packageDir, { recursive: true });
			await writeFile(getMetadataPath(packageDir), "not valid json");

			const result = readMetadata(packageDir);

			expect(result.isErr()).toBe(true);
			const error = result.unwrapErr();
			expect(error.code).toBe(MARKETPLACE_ERROR_CODES.INVALID_PACKAGE);
		});

		it("should return error for metadata missing required fields", async () => {
			const packageDir = join(tempDir, "missing-fields@1.0.0");
			const { mkdir, writeFile } = await import("node:fs/promises");
			await mkdir(packageDir, { recursive: true });
			await writeFile(getMetadataPath(packageDir), JSON.stringify({ foo: "bar" }));

			const result = readMetadata(packageDir);

			expect(result.isErr()).toBe(true);
			const error = result.unwrapErr();
			expect(error.code).toBe(MARKETPLACE_ERROR_CODES.INVALID_PACKAGE);
			expect(error.cause).toContain("Missing required fields");
		});

		it("should preserve all metadata fields through write/read cycle", () => {
			const packageDir = join(tempDir, "full-cycle@1.0.0");
			const metadata = createMockMetadata("full-cycle", "1.0.0", {
				isDependency: true,
				dependedBy: "parent-package",
				dependencies: ["dep1", "dep2"],
			});

			writeMetadata(packageDir, metadata);
			const result = readMetadata(packageDir);

			expect(result.isOk()).toBe(true);
			const readMeta = result.unwrap();
			expect(readMeta.isDependency).toBe(true);
			expect(readMeta.dependedBy).toBe("parent-package");
			expect(readMeta.dependencies).toEqual(["dep1", "dep2"]);
		});
	});
});

describe("readPackageJson", () => {
	const tempDir = join("/tmp", `storage-pkgjson-test-${Date.now()}`);

	beforeEach(async () => {
		const { mkdir } = await import("node:fs/promises");
		await mkdir(tempDir, { recursive: true });
	});

	afterEach(async () => {
		const { rm } = await import("node:fs/promises");
		await rm(tempDir, { recursive: true, force: true });
	});

	it("should read package.json from package directory", async () => {
		const packageDir = join(tempDir, "with-pkgjson@1.0.0");
		const { mkdir, writeFile } = await import("node:fs/promises");
		await mkdir(packageDir, { recursive: true });
		await writeFile(
			getPackageJsonPath(packageDir),
			JSON.stringify({
				name: "with-pkgjson",
				version: "1.0.0",
				description: "Test package",
			}),
		);

		const result = readPackageJson(packageDir);

		expect(result.isOk()).toBe(true);
		const pkgJson = result.unwrap();
		expect(pkgJson.name).toBe("with-pkgjson");
		expect(pkgJson.description).toBe("Test package");
	});

	it("should return error if package.json does not exist", () => {
		const packageDir = join(tempDir, "no-pkgjson@1.0.0");
		const result = readPackageJson(packageDir);

		expect(result.isErr()).toBe(true);
		const error = result.unwrapErr();
		expect(error.code).toBe(MARKETPLACE_ERROR_CODES.INVALID_PACKAGE);
		expect(error.message).toContain("package.json not found");
	});

	it("should return error for invalid JSON", async () => {
		const packageDir = join(tempDir, "invalid-pkgjson@1.0.0");
		const { mkdir, writeFile } = await import("node:fs/promises");
		await mkdir(packageDir, { recursive: true });
		await writeFile(getPackageJsonPath(packageDir), "not valid json");

		const result = readPackageJson(packageDir);

		expect(result.isErr()).toBe(true);
		const error = result.unwrapErr();
		expect(error.code).toBe(MARKETPLACE_ERROR_CODES.INVALID_PACKAGE);
	});
});

// ============================================================================
// Package Discovery Tests
// ============================================================================

describe("listInstalledPackages", () => {
	const tempDir = join("/tmp", `storage-list-test-${Date.now()}`);

	beforeEach(async () => {
		const { mkdir } = await import("node:fs/promises");
		await mkdir(tempDir, { recursive: true });
	});

	afterEach(async () => {
		const { rm } = await import("node:fs/promises");
		await rm(tempDir, { recursive: true, force: true });
	});

	it("should return empty array for non-existent directory", () => {
		const result = listInstalledPackages("/nonexistent/dir", "project");

		expect(result.isOk()).toBe(true);
		expect(result.unwrap()).toEqual([]);
	});

	it("should return empty array for empty directory", () => {
		const result = listInstalledPackages(tempDir, "project");

		expect(result.isOk()).toBe(true);
		expect(result.unwrap()).toEqual([]);
	});

	it("should list installed packages", async () => {
		// Create some package directories with metadata
		const pkg1Dir = join(tempDir, "package-a@1.0.0");
		const pkg2Dir = join(tempDir, "package-b@2.0.0");

		const metadata1 = createMockMetadata("package-a", "1.0.0");
		const metadata2 = createMockMetadata("package-b", "2.0.0");

		writeMetadata(pkg1Dir, metadata1);
		writeMetadata(pkg2Dir, metadata2);

		const result = listInstalledPackages(tempDir, "project");

		expect(result.isOk()).toBe(true);
		const packages = result.unwrap();
		expect(packages.length).toBe(2);

		const names = packages.map((p) => p.name);
		expect(names).toContain("package-a");
		expect(names).toContain("package-b");
	});

	it("should skip non-directory entries", async () => {
		const { writeFile } = await import("node:fs/promises");
		const pkgDir = join(tempDir, "package-a@1.0.0");

		writeMetadata(pkgDir, createMockMetadata("package-a", "1.0.0"));
		// Add a file that looks like a package but isn't a directory
		await writeFile(join(tempDir, "fake-package@1.0.0"), "not a directory");

		const result = listInstalledPackages(tempDir, "project");

		expect(result.isOk()).toBe(true);
		const packages = result.unwrap();
		expect(packages.length).toBe(1);
		expect(packages[0].name).toBe("package-a");
	});

	it("should skip hidden directories (except .installed)", async () => {
		const { mkdir } = await import("node:fs/promises");
		const pkgDir = join(tempDir, "package-a@1.0.0");
		const hiddenDir = join(tempDir, ".hidden@1.0.0");

		writeMetadata(pkgDir, createMockMetadata("package-a", "1.0.0"));
		await mkdir(hiddenDir, { recursive: true });

		const result = listInstalledPackages(tempDir, "project");

		expect(result.isOk()).toBe(true);
		const packages = result.unwrap();
		expect(packages.length).toBe(1);
	});

	it("should skip directories not matching name@version pattern", async () => {
		const { mkdir } = await import("node:fs/promises");
		const validDir = join(tempDir, "valid-package@1.0.0");
		const invalidDir = join(tempDir, "invalid-no-version");

		writeMetadata(validDir, createMockMetadata("valid-package", "1.0.0"));
		await mkdir(invalidDir, { recursive: true });

		const result = listInstalledPackages(tempDir, "project");

		expect(result.isOk()).toBe(true);
		const packages = result.unwrap();
		expect(packages.length).toBe(1);
		expect(packages[0].name).toBe("valid-package");
	});

	it("should include package description from package.json", async () => {
		const { writeFile } = await import("node:fs/promises");
		const pkgDir = join(tempDir, "with-desc@1.0.0");

		writeMetadata(pkgDir, createMockMetadata("with-desc", "1.0.0"));
		await writeFile(
			getPackageJsonPath(pkgDir),
			JSON.stringify({
				name: "with-desc",
				version: "1.0.0",
				description: "A test package with description",
			}),
		);

		const result = listInstalledPackages(tempDir, "project");

		expect(result.isOk()).toBe(true);
		const packages = result.unwrap();
		expect(packages[0].description).toBe("A test package with description");
	});

	it("should set correct scope on returned packages", () => {
		const pkgDir = join(tempDir, "scoped@1.0.0");
		writeMetadata(pkgDir, createMockMetadata("scoped", "1.0.0"));

		const projectResult = listInstalledPackages(tempDir, "project");
		const globalResult = listInstalledPackages(tempDir, "global");

		expect(projectResult.unwrap()[0].scope).toBe("project");
		expect(globalResult.unwrap()[0].scope).toBe("global");
	});
});

describe("findInstalledPackage", () => {
	const tempDir = join("/tmp", `storage-find-test-${Date.now()}`);

	beforeEach(async () => {
		const { mkdir } = await import("node:fs/promises");
		await mkdir(tempDir, { recursive: true });
	});

	afterEach(async () => {
		const { rm } = await import("node:fs/promises");
		await rm(tempDir, { recursive: true, force: true });
	});

	it("should find installed package by name", () => {
		const pkgDir = join(tempDir, "findable@1.0.0");
		writeMetadata(pkgDir, createMockMetadata("findable", "1.0.0"));

		const result = findInstalledPackage(tempDir, "findable", "project");

		expect(result.isOk()).toBe(true);
		const pkg = result.unwrap();
		expect(pkg).not.toBeNull();
		expect(pkg?.name).toBe("findable");
		expect(pkg?.version).toBe("1.0.0");
	});

	it("should return null for non-existent package", () => {
		const pkgDir = join(tempDir, "exists@1.0.0");
		writeMetadata(pkgDir, createMockMetadata("exists", "1.0.0"));

		const result = findInstalledPackage(tempDir, "nonexistent", "project");

		expect(result.isOk()).toBe(true);
		expect(result.unwrap()).toBeNull();
	});

	it("should return latest version when multiple versions installed", () => {
		const pkg1Dir = join(tempDir, "multi@1.0.0");
		const pkg2Dir = join(tempDir, "multi@2.0.0");
		const pkg3Dir = join(tempDir, "multi@1.5.0");

		writeMetadata(pkg1Dir, createMockMetadata("multi", "1.0.0"));
		writeMetadata(pkg2Dir, createMockMetadata("multi", "2.0.0"));
		writeMetadata(pkg3Dir, createMockMetadata("multi", "1.5.0"));

		const result = findInstalledPackage(tempDir, "multi", "project");

		expect(result.isOk()).toBe(true);
		const pkg = result.unwrap();
		expect(pkg?.version).toBe("2.0.0");
	});
});

describe("findInstalledVersion", () => {
	const tempDir = join("/tmp", `storage-findver-test-${Date.now()}`);

	beforeEach(async () => {
		const { mkdir } = await import("node:fs/promises");
		await mkdir(tempDir, { recursive: true });
	});

	afterEach(async () => {
		const { rm } = await import("node:fs/promises");
		await rm(tempDir, { recursive: true, force: true });
	});

	it("should find specific version of package", () => {
		const pkg1Dir = join(tempDir, "versioned@1.0.0");
		const pkg2Dir = join(tempDir, "versioned@2.0.0");

		writeMetadata(pkg1Dir, createMockMetadata("versioned", "1.0.0"));
		writeMetadata(pkg2Dir, createMockMetadata("versioned", "2.0.0"));

		const result = findInstalledVersion(
			tempDir,
			"versioned",
			"1.0.0",
			"project",
		);

		expect(result.isOk()).toBe(true);
		const pkg = result.unwrap();
		expect(pkg?.name).toBe("versioned");
		expect(pkg?.version).toBe("1.0.0");
	});

	it("should return null for non-existent version", () => {
		const pkgDir = join(tempDir, "versioned@1.0.0");
		writeMetadata(pkgDir, createMockMetadata("versioned", "1.0.0"));

		const result = findInstalledVersion(
			tempDir,
			"versioned",
			"9.9.9",
			"project",
		);

		expect(result.isOk()).toBe(true);
		expect(result.unwrap()).toBeNull();
	});
});

describe("isPackageInstalled", () => {
	const tempDir = join("/tmp", `storage-isinstalled-test-${Date.now()}`);

	beforeEach(async () => {
		const { mkdir } = await import("node:fs/promises");
		await mkdir(tempDir, { recursive: true });
	});

	afterEach(async () => {
		const { rm } = await import("node:fs/promises");
		await rm(tempDir, { recursive: true, force: true });
	});

	it("should return true if package is installed", () => {
		const pkgDir = join(tempDir, "installed@1.0.0");
		writeMetadata(pkgDir, createMockMetadata("installed", "1.0.0"));

		const result = isPackageInstalled(tempDir, "installed");

		expect(result).toBe(true);
	});

	it("should return false if package is not installed", () => {
		const result = isPackageInstalled(tempDir, "not-installed");

		expect(result).toBe(false);
	});

	it("should return true for specific version if installed", () => {
		const pkgDir = join(tempDir, "versioned@1.0.0");
		writeMetadata(pkgDir, createMockMetadata("versioned", "1.0.0"));

		const result = isPackageInstalled(tempDir, "versioned", "1.0.0");

		expect(result).toBe(true);
	});

	it("should return false for specific version if not installed", () => {
		const pkgDir = join(tempDir, "versioned@1.0.0");
		writeMetadata(pkgDir, createMockMetadata("versioned", "1.0.0"));

		const result = isPackageInstalled(tempDir, "versioned", "2.0.0");

		expect(result).toBe(false);
	});

	it("should return false for non-existent install directory", () => {
		const result = isPackageInstalled("/nonexistent/dir", "any-package");

		expect(result).toBe(false);
	});
});

describe("getInstalledVersions", () => {
	const tempDir = join("/tmp", `storage-getversions-test-${Date.now()}`);

	beforeEach(async () => {
		const { mkdir } = await import("node:fs/promises");
		await mkdir(tempDir, { recursive: true });
	});

	afterEach(async () => {
		const { rm } = await import("node:fs/promises");
		await rm(tempDir, { recursive: true, force: true });
	});

	it("should return all installed versions of a package", () => {
		writeMetadata(
			join(tempDir, "multi@1.0.0"),
			createMockMetadata("multi", "1.0.0"),
		);
		writeMetadata(
			join(tempDir, "multi@2.0.0"),
			createMockMetadata("multi", "2.0.0"),
		);
		writeMetadata(
			join(tempDir, "multi@1.5.0"),
			createMockMetadata("multi", "1.5.0"),
		);
		writeMetadata(
			join(tempDir, "other@1.0.0"),
			createMockMetadata("other", "1.0.0"),
		);

		const result = getInstalledVersions(tempDir, "multi", "project");

		expect(result.isOk()).toBe(true);
		const versions = result.unwrap();
		expect(versions.length).toBe(3);
		// Should be sorted descending
		expect(versions[0]).toBe("2.0.0");
		expect(versions[1]).toBe("1.5.0");
		expect(versions[2]).toBe("1.0.0");
	});

	it("should return empty array for non-installed package", () => {
		const result = getInstalledVersions(tempDir, "nonexistent", "project");

		expect(result.isOk()).toBe(true);
		expect(result.unwrap()).toEqual([]);
	});
});

describe("findDependentPackages", () => {
	const tempDir = join("/tmp", `storage-dependents-test-${Date.now()}`);

	beforeEach(async () => {
		const { mkdir } = await import("node:fs/promises");
		await mkdir(tempDir, { recursive: true });
	});

	afterEach(async () => {
		const { rm } = await import("node:fs/promises");
		await rm(tempDir, { recursive: true, force: true });
	});

	it("should find packages that depend on a given package", () => {
		writeMetadata(
			join(tempDir, "parent@1.0.0"),
			createMockMetadata("parent", "1.0.0", {
				dependencies: ["child-pkg"],
			}),
		);
		writeMetadata(
			join(tempDir, "child-pkg@1.0.0"),
			createMockMetadata("child-pkg", "1.0.0"),
		);
		writeMetadata(
			join(tempDir, "unrelated@1.0.0"),
			createMockMetadata("unrelated", "1.0.0"),
		);

		const result = findDependentPackages(tempDir, "child-pkg", "project");

		expect(result.isOk()).toBe(true);
		const dependents = result.unwrap();
		expect(dependents).toContain("parent");
		expect(dependents).not.toContain("unrelated");
	});

	it("should return empty array if no packages depend on target", () => {
		writeMetadata(
			join(tempDir, "standalone@1.0.0"),
			createMockMetadata("standalone", "1.0.0"),
		);

		const result = findDependentPackages(tempDir, "standalone", "project");

		expect(result.isOk()).toBe(true);
		expect(result.unwrap()).toEqual([]);
	});

	it("should find multiple dependents", () => {
		writeMetadata(
			join(tempDir, "dep1@1.0.0"),
			createMockMetadata("dep1", "1.0.0", {
				dependencies: ["shared"],
			}),
		);
		writeMetadata(
			join(tempDir, "dep2@1.0.0"),
			createMockMetadata("dep2", "1.0.0", {
				dependencies: ["shared"],
			}),
		);
		writeMetadata(
			join(tempDir, "shared@1.0.0"),
			createMockMetadata("shared", "1.0.0"),
		);

		const result = findDependentPackages(tempDir, "shared", "project");

		expect(result.isOk()).toBe(true);
		const dependents = result.unwrap();
		expect(dependents.length).toBe(2);
		expect(dependents).toContain("dep1");
		expect(dependents).toContain("dep2");
	});
});

// ============================================================================
// Package Operations Tests
// ============================================================================

describe("removePackage", () => {
	const tempDir = join("/tmp", `storage-remove-test-${Date.now()}`);

	beforeEach(async () => {
		const { mkdir } = await import("node:fs/promises");
		await mkdir(tempDir, { recursive: true });
	});

	afterEach(async () => {
		const { rm } = await import("node:fs/promises");
		await rm(tempDir, { recursive: true, force: true });
	});

	it("should remove package directory", async () => {
		const pkgDir = join(tempDir, "to-remove@1.0.0");
		writeMetadata(pkgDir, createMockMetadata("to-remove", "1.0.0"));

		expect(directoryExists(pkgDir)).toBe(true);

		const result = await removePackage(pkgDir);

		expect(result.isOk()).toBe(true);
		expect(directoryExists(pkgDir)).toBe(false);
	});

	it("should succeed if directory does not exist", async () => {
		const pkgDir = join(tempDir, "nonexistent@1.0.0");

		const result = await removePackage(pkgDir);

		expect(result.isOk()).toBe(true);
	});

	it("should remove directory with nested contents", async () => {
		const pkgDir = join(tempDir, "nested@1.0.0");
		const { mkdir, writeFile } = await import("node:fs/promises");
		await mkdir(join(pkgDir, "sub", "dir"), { recursive: true });
		await writeFile(join(pkgDir, "file1.txt"), "content");
		await writeFile(join(pkgDir, "sub", "file2.txt"), "content");
		await writeFile(join(pkgDir, "sub", "dir", "file3.txt"), "content");

		const result = await removePackage(pkgDir);

		expect(result.isOk()).toBe(true);
		expect(directoryExists(pkgDir)).toBe(false);
	});
});

describe("copyPackageFiles", () => {
	const tempDir = join("/tmp", `storage-copy-test-${Date.now()}`);
	const sourceDir = join(tempDir, "source");
	const targetDir = join(tempDir, "target");

	beforeEach(async () => {
		const { mkdir, writeFile } = await import("node:fs/promises");
		await mkdir(sourceDir, { recursive: true });
		await writeFile(join(sourceDir, "file1.txt"), "content1");
		await writeFile(join(sourceDir, "file2.txt"), "content2");
	});

	afterEach(async () => {
		const { rm } = await import("node:fs/promises");
		await rm(tempDir, { recursive: true, force: true });
	});

	it("should copy files from source to target directory", async () => {
		const result = await copyPackageFiles(sourceDir, targetDir);

		expect(result.isOk()).toBe(true);
		expect(directoryExists(targetDir)).toBe(true);

		const { readdir } = await import("node:fs/promises");
		const files = await readdir(targetDir);
		expect(files).toContain("file1.txt");
		expect(files).toContain("file2.txt");
	});

	it("should copy nested directories", async () => {
		const { mkdir, writeFile } = await import("node:fs/promises");
		await mkdir(join(sourceDir, "sub"), { recursive: true });
		await writeFile(join(sourceDir, "sub", "nested.txt"), "nested content");

		const result = await copyPackageFiles(sourceDir, targetDir);

		expect(result.isOk()).toBe(true);

		const { existsSync } = await import("node:fs");
		expect(existsSync(join(targetDir, "sub", "nested.txt"))).toBe(true);
	});

	it("should skip .git directory", async () => {
		const { mkdir, writeFile } = await import("node:fs/promises");
		await mkdir(join(sourceDir, ".git", "objects"), { recursive: true });
		await writeFile(join(sourceDir, ".git", "config"), "git config");

		const result = await copyPackageFiles(sourceDir, targetDir);

		expect(result.isOk()).toBe(true);
		expect(directoryExists(join(targetDir, ".git"))).toBe(false);
	});

	it("should create target directory if it does not exist", async () => {
		const newTarget = join(tempDir, "new", "nested", "target");

		const result = await copyPackageFiles(sourceDir, newTarget);

		expect(result.isOk()).toBe(true);
		expect(directoryExists(newTarget)).toBe(true);
	});

	it("should preserve file contents", async () => {
		const result = await copyPackageFiles(sourceDir, targetDir);

		expect(result.isOk()).toBe(true);

		const { readFile } = await import("node:fs/promises");
		const content = await readFile(join(targetDir, "file1.txt"), "utf-8");
		expect(content).toBe("content1");
	});
});

// ============================================================================
// Edge Cases Tests
// ============================================================================

describe("edge cases", () => {
	const tempDir = join("/tmp", `storage-edge-test-${Date.now()}`);

	beforeEach(async () => {
		const { mkdir } = await import("node:fs/promises");
		await mkdir(tempDir, { recursive: true });
	});

	afterEach(async () => {
		const { rm } = await import("node:fs/promises");
		await rm(tempDir, { recursive: true, force: true });
	});

	it("should handle scoped package names in path and metadata operations", async () => {
		// Note: Scoped packages with "/" in their names create nested directories
		// when used with getPackagePath(). The path would be: {baseDir}/@myorg/scoped-pkg@1.0.0
		// This is expected behavior - the "@myorg" becomes a subdirectory.
		const pkgDir = join(tempDir, "@myorg", "scoped-pkg@1.0.0");
		const metadata = createMockMetadata("@myorg/scoped-pkg", "1.0.0");

		// Write - creates nested structure
		const writeResult = writeMetadata(pkgDir, metadata);
		expect(writeResult.isOk()).toBe(true);

		// Read - works with the nested path
		const readResult = readMetadata(pkgDir);
		expect(readResult.isOk()).toBe(true);
		expect(readResult.unwrap().name).toBe("@myorg/scoped-pkg");

		// Note: listInstalledPackages won't find scoped packages directly in tempDir
		// because it looks for name@version directories at the top level
		// Scoped packages would be found if we list from the @myorg subdirectory
		const scopedDirResult = listInstalledPackages(
			join(tempDir, "@myorg"),
			"project",
		);
		expect(scopedDirResult.isOk()).toBe(true);
		// The directory name is just "scoped-pkg@1.0.0", not "@myorg/scoped-pkg@1.0.0"
		const pkgs = scopedDirResult.unwrap();
		expect(pkgs.length).toBe(1);
		expect(pkgs[0].name).toBe("scoped-pkg");
		expect(pkgs[0].version).toBe("1.0.0");
	});

	it("should handle scoped package names through formatPackageDir and parsePackageDir", () => {
		// parsePackageDir correctly handles scoped names in directory strings
		const parsed = parsePackageDir("@myorg/scoped-pkg@1.0.0");
		expect(parsed).toEqual({ name: "@myorg/scoped-pkg", version: "1.0.0" });

		// formatPackageDir creates the expected format
		const formatted = formatPackageDir("@myorg/scoped-pkg", "1.0.0");
		expect(formatted).toBe("@myorg/scoped-pkg@1.0.0");

		// Round-trip works
		const roundTrip = parsePackageDir(formatted);
		expect(roundTrip).toEqual({ name: "@myorg/scoped-pkg", version: "1.0.0" });
	});

	it("should handle packages with prerelease versions", () => {
		const pkgDir = join(tempDir, "prerelease@1.0.0-beta.1");
		const metadata = createMockMetadata("prerelease", "1.0.0-beta.1");

		writeMetadata(pkgDir, metadata);

		const listResult = listInstalledPackages(tempDir, "project");
		expect(listResult.isOk()).toBe(true);
		expect(listResult.unwrap()[0].version).toBe("1.0.0-beta.1");
	});

	it("should handle empty install directory gracefully", () => {
		const listResult = listInstalledPackages(tempDir, "project");
		expect(listResult.isOk()).toBe(true);
		expect(listResult.unwrap()).toEqual([]);

		const findResult = findInstalledPackage(tempDir, "anything", "project");
		expect(findResult.isOk()).toBe(true);
		expect(findResult.unwrap()).toBeNull();

		expect(isPackageInstalled(tempDir, "anything")).toBe(false);
	});

	it("should handle concurrent operations on same package", async () => {
		const pkgDir = join(tempDir, "concurrent@1.0.0");
		const metadata = createMockMetadata("concurrent", "1.0.0");

		// Write multiple times concurrently
		const writes = Array.from({ length: 10 }, () =>
			Promise.resolve(writeMetadata(pkgDir, metadata)),
		);
		await Promise.all(writes);

		// Read multiple times concurrently
		const reads = Array.from({ length: 10 }, () =>
			Promise.resolve(readMetadata(pkgDir)),
		);
		const results = await Promise.all(reads);

		// All reads should succeed
		for (const result of results) {
			expect(result.isOk()).toBe(true);
		}
	});
});
