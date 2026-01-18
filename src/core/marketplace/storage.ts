/**
 * Storage utilities for marketplace package management.
 *
 * Provides functions for reading/writing installed packages metadata
 * and managing installation paths (project-local and global).
 */

import {
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
	readdirSync,
	statSync,
} from "node:fs";
import { rm, mkdir, copyFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { ok, err, type ResultBox } from "../utils/result/index.ts";
import type {
	InstalledPackage,
	InstallationMetadata,
	InstallationScope,
	MarketplaceError,
} from "./types.ts";
import { MARKETPLACE_ERROR_CODES } from "./types.ts";

// ============================================================================
// Types
// ============================================================================

/**
 * Result type for storage operations.
 */
export type StorageResult<T> = ResultBox<T, MarketplaceError>;

/**
 * Configuration for the storage service.
 */
export interface StorageConfig {
	/** Project root path (where .cw directory exists or will be created) */
	projectPath: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Default project installation subdirectory within .cw/workflows/ */
const PROJECT_INSTALL_SUBDIR = ".installed";

/** Default workflows directory name */
const WORKFLOWS_DIR = "workflows";

/** Metadata file name stored in each package directory */
const METADATA_FILE = ".cw-metadata.json";

/** Package manifest file name */
const PACKAGE_JSON = "package.json";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a marketplace error with consistent structure.
 */
function createMarketplaceError(
	code: MarketplaceError["code"],
	message: string,
	pkg?: string,
	cause?: string,
	suggestion?: string,
): MarketplaceError {
	return {
		code,
		message,
		package: pkg,
		cause,
		suggestion,
	};
}

/**
 * Parse a package directory name in name@version format.
 *
 * @param dirName - Directory name to parse
 * @returns Parsed name and version, or null if invalid format
 */
function parsePackageDir(dirName: string): { name: string; version: string } | null {
	// Match name@version pattern
	const match = dirName.match(/^(.+)@(\d+\.\d+\.\d+(?:-[\w.]+)?(?:\+[\w.]+)?)$/);
	if (!match) {
		return null;
	}
	return {
		name: match[1],
		version: match[2],
	};
}

/**
 * Format package name and version into directory name.
 *
 * @param name - Package name
 * @param version - Package version
 * @returns Directory name in name@version format
 */
function formatPackageDir(name: string, version: string): string {
	return `${name}@${version}`;
}

// ============================================================================
// Path Functions
// ============================================================================

/**
 * Get the global workflows directory path.
 *
 * @returns Absolute path to ~/.cw/workflows/
 */
export function getGlobalInstallDir(): string {
	return join(homedir(), ".cw", WORKFLOWS_DIR);
}

/**
 * Get the project workflows installation directory path.
 *
 * @param projectPath - Path to the project root
 * @returns Absolute path to .cw/workflows/.installed/
 */
export function getProjectInstallDir(projectPath: string): string {
	return join(resolve(projectPath), ".cw", WORKFLOWS_DIR, PROJECT_INSTALL_SUBDIR);
}

/**
 * Get the installation directory based on scope.
 *
 * @param scope - Installation scope (project or global)
 * @param projectPath - Path to the project root (required for project scope)
 * @returns Absolute path to the installation directory
 */
export function getInstallDir(
	scope: InstallationScope,
	projectPath?: string,
): string {
	if (scope === "global") {
		return getGlobalInstallDir();
	}
	if (!projectPath) {
		throw new Error("projectPath is required for project scope");
	}
	return getProjectInstallDir(projectPath);
}

/**
 * Get the path for a specific package installation.
 *
 * @param baseDir - Base installation directory
 * @param name - Package name
 * @param version - Package version
 * @returns Absolute path to the package directory
 */
export function getPackagePath(
	baseDir: string,
	name: string,
	version: string,
): string {
	return join(baseDir, formatPackageDir(name, version));
}

/**
 * Get the path to the metadata file for a package.
 *
 * @param packageDir - Package directory path
 * @returns Path to the metadata file
 */
export function getMetadataPath(packageDir: string): string {
	return join(packageDir, METADATA_FILE);
}

/**
 * Get the path to the package.json file for a package.
 *
 * @param packageDir - Package directory path
 * @returns Path to the package.json file
 */
export function getPackageJsonPath(packageDir: string): string {
	return join(packageDir, PACKAGE_JSON);
}

// ============================================================================
// Directory Management
// ============================================================================

/**
 * Ensure the installation directory exists.
 *
 * @param installDir - Installation directory path
 * @returns Result with void on success, or MarketplaceError on failure
 */
export function ensureInstallDir(installDir: string): StorageResult<void> {
	try {
		if (!existsSync(installDir)) {
			mkdirSync(installDir, { recursive: true });
		}
		return ok(undefined);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);

		if (message.includes("EACCES") || message.includes("EPERM")) {
			return err(
				createMarketplaceError(
					MARKETPLACE_ERROR_CODES.PERMISSION_DENIED,
					`Cannot create installation directory: ${installDir}`,
					undefined,
					message,
					"Check that you have write permissions to the target directory",
				),
			);
		}

		return err(
			createMarketplaceError(
				MARKETPLACE_ERROR_CODES.UNKNOWN_ERROR,
				`Failed to create installation directory: ${installDir}`,
				undefined,
				message,
			),
		);
	}
}

/**
 * Check if a directory exists and is accessible.
 *
 * @param dirPath - Directory path to check
 * @returns True if directory exists and is accessible
 */
export function directoryExists(dirPath: string): boolean {
	try {
		return existsSync(dirPath) && statSync(dirPath).isDirectory();
	} catch {
		return false;
	}
}

// ============================================================================
// Metadata Operations
// ============================================================================

/**
 * Read installation metadata from a package directory.
 *
 * @param packageDir - Package directory path
 * @returns Result with metadata or MarketplaceError
 */
export function readMetadata(
	packageDir: string,
): StorageResult<InstallationMetadata> {
	const metadataPath = getMetadataPath(packageDir);

	if (!existsSync(metadataPath)) {
		return err(
			createMarketplaceError(
				MARKETPLACE_ERROR_CODES.INVALID_PACKAGE,
				`Metadata file not found: ${metadataPath}`,
				undefined,
				undefined,
				"The package may be corrupted or was not installed properly",
			),
		);
	}

	try {
		const content = readFileSync(metadataPath, "utf-8");
		const metadata = JSON.parse(content) as InstallationMetadata;

		// Validate required fields
		if (
			typeof metadata.name !== "string" ||
			typeof metadata.version !== "string" ||
			typeof metadata.installedAt !== "string"
		) {
			return err(
				createMarketplaceError(
					MARKETPLACE_ERROR_CODES.INVALID_PACKAGE,
					"Invalid metadata format",
					metadata.name,
					"Missing required fields: name, version, or installedAt",
				),
			);
		}

		return ok(metadata);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return err(
			createMarketplaceError(
				MARKETPLACE_ERROR_CODES.INVALID_PACKAGE,
				`Failed to read metadata: ${message}`,
				undefined,
				message,
			),
		);
	}
}

/**
 * Write installation metadata to a package directory.
 *
 * @param packageDir - Package directory path
 * @param metadata - Metadata to write
 * @returns Result with void on success, or MarketplaceError on failure
 */
export function writeMetadata(
	packageDir: string,
	metadata: InstallationMetadata,
): StorageResult<void> {
	const metadataPath = getMetadataPath(packageDir);

	try {
		// Ensure package directory exists
		if (!existsSync(packageDir)) {
			mkdirSync(packageDir, { recursive: true });
		}

		writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + "\n");
		return ok(undefined);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);

		if (message.includes("EACCES") || message.includes("EPERM")) {
			return err(
				createMarketplaceError(
					MARKETPLACE_ERROR_CODES.PERMISSION_DENIED,
					`Cannot write metadata to: ${metadataPath}`,
					metadata.name,
					message,
				),
			);
		}

		return err(
			createMarketplaceError(
				MARKETPLACE_ERROR_CODES.UNKNOWN_ERROR,
				`Failed to write metadata: ${message}`,
				metadata.name,
				message,
			),
		);
	}
}

// ============================================================================
// Package Discovery
// ============================================================================

/**
 * Read package.json from a package directory.
 *
 * @param packageDir - Package directory path
 * @returns Result with package.json contents or MarketplaceError
 */
export function readPackageJson(
	packageDir: string,
): StorageResult<Record<string, unknown>> {
	const packageJsonPath = getPackageJsonPath(packageDir);

	if (!existsSync(packageJsonPath)) {
		return err(
			createMarketplaceError(
				MARKETPLACE_ERROR_CODES.INVALID_PACKAGE,
				`package.json not found: ${packageJsonPath}`,
				undefined,
				undefined,
				"The package may be missing or corrupted",
			),
		);
	}

	try {
		const content = readFileSync(packageJsonPath, "utf-8");
		const packageJson = JSON.parse(content) as Record<string, unknown>;
		return ok(packageJson);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return err(
			createMarketplaceError(
				MARKETPLACE_ERROR_CODES.INVALID_PACKAGE,
				`Failed to read package.json: ${message}`,
				undefined,
				message,
			),
		);
	}
}

/**
 * List all installed packages in a directory.
 *
 * @param installDir - Installation directory path
 * @param scope - Installation scope for the returned packages
 * @returns Result with array of installed packages or MarketplaceError
 */
export function listInstalledPackages(
	installDir: string,
	scope: InstallationScope,
): StorageResult<InstalledPackage[]> {
	if (!directoryExists(installDir)) {
		// Not an error - just no packages installed
		return ok([]);
	}

	try {
		const entries = readdirSync(installDir, { withFileTypes: true });
		const packages: InstalledPackage[] = [];

		for (const entry of entries) {
			// Skip non-directories and hidden files (except our installed dir)
			if (!entry.isDirectory()) continue;
			if (entry.name.startsWith(".") && entry.name !== PROJECT_INSTALL_SUBDIR) {
				continue;
			}

			// Parse the directory name
			const parsed = parsePackageDir(entry.name);
			if (!parsed) continue;

			const packageDir = join(installDir, entry.name);

			// Try to read metadata for additional info
			const metadataResult = readMetadata(packageDir);
			const metadata = metadataResult.isOk() ? metadataResult.unwrap() : null;

			// Try to read package.json for description
			const packageJsonResult = readPackageJson(packageDir);
			const packageJson = packageJsonResult.isOk()
				? packageJsonResult.unwrap()
				: null;

			const installedPackage: InstalledPackage = {
				name: parsed.name,
				version: parsed.version,
				path: packageDir,
				scope,
				isDependency: metadata?.isDependency ?? false,
				source: metadata?.source,
				installedAt: metadata?.installedAt,
				description:
					(packageJson?.description as string) ?? metadata?.source?.raw,
			};

			packages.push(installedPackage);
		}

		return ok(packages);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);

		if (message.includes("EACCES") || message.includes("EPERM")) {
			return err(
				createMarketplaceError(
					MARKETPLACE_ERROR_CODES.PERMISSION_DENIED,
					`Cannot read installation directory: ${installDir}`,
					undefined,
					message,
				),
			);
		}

		return err(
			createMarketplaceError(
				MARKETPLACE_ERROR_CODES.UNKNOWN_ERROR,
				`Failed to list packages: ${message}`,
				undefined,
				message,
			),
		);
	}
}

/**
 * Find a specific installed package by name.
 *
 * Returns the latest version if multiple versions are installed.
 *
 * @param installDir - Installation directory path
 * @param name - Package name to find
 * @param scope - Installation scope
 * @returns Result with the package or null if not found
 */
export function findInstalledPackage(
	installDir: string,
	name: string,
	scope: InstallationScope,
): StorageResult<InstalledPackage | null> {
	const listResult = listInstalledPackages(installDir, scope);

	if (listResult.isErr()) {
		return err(listResult.unwrapErr());
	}

	const packages = listResult.unwrap();
	const matching = packages.filter((p) => p.name === name);

	if (matching.length === 0) {
		return ok(null);
	}

	// Return the latest version (simple string comparison for semver)
	matching.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
	return ok(matching[0]);
}

/**
 * Find a specific version of an installed package.
 *
 * @param installDir - Installation directory path
 * @param name - Package name
 * @param version - Package version
 * @param scope - Installation scope
 * @returns Result with the package or null if not found
 */
export function findInstalledVersion(
	installDir: string,
	name: string,
	version: string,
	scope: InstallationScope,
): StorageResult<InstalledPackage | null> {
	const packageDir = getPackagePath(installDir, name, version);

	if (!directoryExists(packageDir)) {
		return ok(null);
	}

	// Read metadata for full package info
	const metadataResult = readMetadata(packageDir);
	const metadata = metadataResult.isOk() ? metadataResult.unwrap() : null;

	// Read package.json for description
	const packageJsonResult = readPackageJson(packageDir);
	const packageJson = packageJsonResult.isOk()
		? packageJsonResult.unwrap()
		: null;

	const installedPackage: InstalledPackage = {
		name,
		version,
		path: packageDir,
		scope,
		isDependency: metadata?.isDependency ?? false,
		source: metadata?.source,
		installedAt: metadata?.installedAt,
		description: (packageJson?.description as string) ?? undefined,
	};

	return ok(installedPackage);
}

/**
 * Check if a package is installed.
 *
 * @param installDir - Installation directory path
 * @param name - Package name
 * @param version - Optional specific version to check
 * @returns True if package (and version if specified) is installed
 */
export function isPackageInstalled(
	installDir: string,
	name: string,
	version?: string,
): boolean {
	if (version) {
		const packageDir = getPackagePath(installDir, name, version);
		return directoryExists(packageDir);
	}

	// Check if any version is installed
	if (!directoryExists(installDir)) {
		return false;
	}

	try {
		const entries = readdirSync(installDir);
		for (const entry of entries) {
			const parsed = parsePackageDir(entry);
			if (parsed && parsed.name === name) {
				return true;
			}
		}
		return false;
	} catch {
		return false;
	}
}

// ============================================================================
// Package Operations
// ============================================================================

/**
 * Remove an installed package.
 *
 * @param packageDir - Package directory to remove
 * @returns Result with void on success, or MarketplaceError on failure
 */
export async function removePackage(
	packageDir: string,
): Promise<StorageResult<void>> {
	if (!directoryExists(packageDir)) {
		return ok(undefined);
	}

	try {
		await rm(packageDir, { recursive: true, force: true });
		return ok(undefined);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);

		if (message.includes("EACCES") || message.includes("EPERM")) {
			return err(
				createMarketplaceError(
					MARKETPLACE_ERROR_CODES.PERMISSION_DENIED,
					`Cannot remove package directory: ${packageDir}`,
					undefined,
					message,
					"Check that you have write permissions to the directory",
				),
			);
		}

		return err(
			createMarketplaceError(
				MARKETPLACE_ERROR_CODES.UNKNOWN_ERROR,
				`Failed to remove package: ${message}`,
				undefined,
				message,
			),
		);
	}
}

/**
 * Copy package files from source to installation directory.
 *
 * @param sourceDir - Source directory containing package files
 * @param targetDir - Target installation directory
 * @returns Result with void on success, or MarketplaceError on failure
 */
export async function copyPackageFiles(
	sourceDir: string,
	targetDir: string,
): Promise<StorageResult<void>> {
	try {
		// Ensure target directory exists
		await mkdir(targetDir, { recursive: true });

		// Copy all files recursively
		await copyDirRecursive(sourceDir, targetDir);

		return ok(undefined);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);

		if (message.includes("EACCES") || message.includes("EPERM")) {
			return err(
				createMarketplaceError(
					MARKETPLACE_ERROR_CODES.PERMISSION_DENIED,
					`Cannot copy package files to: ${targetDir}`,
					undefined,
					message,
				),
			);
		}

		return err(
			createMarketplaceError(
				MARKETPLACE_ERROR_CODES.UNKNOWN_ERROR,
				`Failed to copy package files: ${message}`,
				undefined,
				message,
			),
		);
	}
}

/**
 * Recursively copy a directory.
 */
async function copyDirRecursive(src: string, dest: string): Promise<void> {
	const entries = await readdir(src, { withFileTypes: true });

	for (const entry of entries) {
		const srcPath = join(src, entry.name);
		const destPath = join(dest, entry.name);

		if (entry.isDirectory()) {
			// Skip .git directory
			if (entry.name === ".git") continue;

			await mkdir(destPath, { recursive: true });
			await copyDirRecursive(srcPath, destPath);
		} else {
			await copyFile(srcPath, destPath);
		}
	}
}

/**
 * Get all installed versions of a package.
 *
 * @param installDir - Installation directory path
 * @param name - Package name
 * @param scope - Installation scope
 * @returns Result with array of version strings
 */
export function getInstalledVersions(
	installDir: string,
	name: string,
	scope: InstallationScope,
): StorageResult<string[]> {
	const listResult = listInstalledPackages(installDir, scope);

	if (listResult.isErr()) {
		return err(listResult.unwrapErr());
	}

	const packages = listResult.unwrap();
	const versions = packages
		.filter((p) => p.name === name)
		.map((p) => p.version)
		.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));

	return ok(versions);
}

/**
 * Find packages that depend on a given package.
 *
 * @param installDir - Installation directory path
 * @param name - Package name to check dependents for
 * @param scope - Installation scope
 * @returns Result with array of dependent package names
 */
export function findDependentPackages(
	installDir: string,
	name: string,
	scope: InstallationScope,
): StorageResult<string[]> {
	const listResult = listInstalledPackages(installDir, scope);

	if (listResult.isErr()) {
		return err(listResult.unwrapErr());
	}

	const packages = listResult.unwrap();
	const dependents: string[] = [];

	for (const pkg of packages) {
		// Read metadata to check dependencies
		const metadataResult = readMetadata(pkg.path);
		if (metadataResult.isErr()) continue;

		const metadata = metadataResult.unwrap();
		if (metadata.dependencies?.includes(name)) {
			dependents.push(pkg.name);
		}
	}

	return ok(dependents);
}

// ============================================================================
// Exports for Index
// ============================================================================

export { parsePackageDir, formatPackageDir };
