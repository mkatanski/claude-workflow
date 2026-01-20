/**
 * Installation service for marketplace package management.
 *
 * Provides methods for installing, uninstalling, updating, and listing
 * workflow packages from git repositories (direct URLs or via central registry).
 *
 * Features:
 * - Parse install sources (registry names, git URLs, version specifiers)
 * - Install packages with dependency resolution
 * - Uninstall packages with dependent checking
 * - Update packages with semver range support
 * - List installed packages with outdated detection
 */

import { ok, err, type ResultBox } from "../utils/result/index.ts";
import type {
	InstallationServiceConfig,
	ParsedSource,
	SourceType,
	MarketplaceError,
	MarketplaceErrorCode,
	InstallOptions,
	UninstallOptions,
	UpdateOptions,
	ListOptions,
	InstallResult,
	UninstallResult,
	UpdateResult,
	ListResult,
	PendingUpdate,
	InstalledPackage,
	PackageWithUpdate,
	InstallationMetadata,
	InstallationScope,
} from "./types.ts";
import { MARKETPLACE_ERROR_CODES } from "./types.ts";
import { GitService, type GitTag } from "./git.ts";
import { RegistryService } from "./registry.ts";
import {
	getInstallDir,
	getPackagePath,
	ensureInstallDir,
	isPackageInstalled,
	copyPackageFiles,
	writeMetadata,
	readPackageJson,
	removePackage,
	directoryExists,
	findInstalledPackage,
	findDependentPackages,
	listInstalledPackages,
	readMetadata,
} from "./storage.ts";

// ============================================================================
// Types
// ============================================================================

/**
 * Result type for installation operations.
 */
export type InstallerResult<T> = ResultBox<T, MarketplaceError>;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a marketplace error with consistent structure.
 */
function createMarketplaceError(
	code: MarketplaceErrorCode,
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
 * Check if a string looks like a valid semver version or range.
 *
 * Supports:
 * - Exact versions: 1.0.0, 1.2.3-beta.1
 * - Range operators: ^1.0.0, ~1.2.0, >=1.0.0, <2.0.0
 * - Wildcards: 1.x, 1.*, 1.0.x
 */
function isValidVersionSpec(version: string): boolean {
	// Empty string is not valid
	if (!version) {
		return false;
	}

	// Match semver with optional range operators
	const semverPattern =
		/^[~^]?[<>=]*v?(\d+|\*)\.?(\d+|\*)?\.?(\d+|\*)?(?:-[\w.]+)?(?:\+[\w.]+)?$/;

	// Also allow x.x.x format wildcards
	const wildcardPattern = /^(\d+|\*)\.(\d+|\*|x)\.?(\d+|\*|x)?$/;

	return semverPattern.test(version) || wildcardPattern.test(version);
}

/**
 * Check if a string looks like a valid package name.
 *
 * Package names follow npm naming conventions:
 * - Lowercase
 * - Can contain hyphens, underscores, dots
 * - Cannot start with a dot or underscore
 * - No spaces or special characters
 */
function isValidPackageName(name: string): boolean {
	if (!name || name.length === 0) {
		return false;
	}

	// Package names should be alphanumeric with hyphens, underscores, or dots
	// Cannot start with dot, underscore, or hyphen
	const packageNamePattern = /^[a-z0-9][a-z0-9._-]*$/;
	return packageNamePattern.test(name);
}

/**
 * Normalize a git URL to a standard format.
 *
 * Handles various formats:
 * - github.com/user/repo → https://github.com/user/repo.git
 * - https://github.com/user/repo → https://github.com/user/repo.git
 * - git@github.com:user/repo.git → git@github.com:user/repo.git (unchanged)
 *
 * @param url - Raw URL from install source
 * @returns Normalized git URL
 */
function normalizeGitUrl(url: string): string {
	// Already a full URL with protocol
	if (url.startsWith("https://") || url.startsWith("http://")) {
		// Ensure .git suffix
		if (!url.endsWith(".git")) {
			return `${url}.git`;
		}
		return url;
	}

	// SSH URL format (git@host:user/repo)
	if (url.startsWith("git@")) {
		if (!url.endsWith(".git")) {
			return `${url}.git`;
		}
		return url;
	}

	// Shorthand format (github.com/user/repo)
	// Assume HTTPS protocol
	const normalized = `https://${url}`;
	if (!normalized.endsWith(".git")) {
		return `${normalized}.git`;
	}
	return normalized;
}

/**
 * Extract the package name from a git URL.
 *
 * @param url - Git repository URL
 * @returns Package name derived from URL, or undefined if can't be determined
 */
export function extractNameFromGitUrl(url: string): string | undefined {
	// Remove .git suffix if present
	const cleanUrl = url.replace(/\.git$/, "");

	// Extract the last path segment
	const parts = cleanUrl.split("/");
	const lastPart = parts[parts.length - 1];

	// For SSH URLs like git@github.com:user/repo
	if (lastPart && lastPart.includes(":")) {
		const sshParts = lastPart.split(":");
		const repoPath = sshParts[sshParts.length - 1];
		const repoParts = repoPath.split("/");
		return repoParts[repoParts.length - 1];
	}

	return lastPart || undefined;
}

/**
 * Extract dependency names from package.json cwDependencies.
 *
 * @param packageJson - Package.json contents
 * @returns Array of dependency names
 */
function extractDependencyNames(
	packageJson: Record<string, unknown>,
): string[] | undefined {
	const cwDeps = packageJson.cwDependencies as
		| Record<string, string>
		| undefined;

	if (!cwDeps || typeof cwDeps !== "object") {
		return undefined;
	}

	return Object.keys(cwDeps);
}

// ============================================================================
// Internal Types
// ============================================================================

/**
 * Context for tracking installation state during dependency resolution.
 * Used for detecting circular dependencies and rollback.
 */
interface InstallContext {
	/** Packages currently being installed (for cycle detection) */
	installing: Set<string>;
	/** Packages successfully installed (for rollback) */
	installed: InstalledPackage[];
	/** Installation scope */
	scope: InstallationScope;
	/** Whether to skip dependencies */
	noDeps: boolean;
	/** Whether to force reinstall */
	force: boolean;
	/** Project path (for project-scoped installs) */
	projectPath: string;
}

// ============================================================================
// InstallationService Class
// ============================================================================

/**
 * Installation service for marketplace package management.
 *
 * Orchestrates install, uninstall, update, and list operations for
 * workflow packages. Works with GitService for cloning and RegistryService
 * for package lookups.
 *
 * @example
 * ```typescript
 * const installer = new InstallationService({
 *   projectDir: '.cw/workflows/.installed',
 *   globalDir: '~/.cw/workflows',
 *   tempDir: '/tmp/cw-marketplace'
 * });
 *
 * // Parse an install source
 * const source = installer.parseSource('code-review@^1.0.0');
 * if (source.isOk()) {
 *   const parsed = source.unwrap();
 *   console.log(`Type: ${parsed.type}`);
 *   console.log(`Name: ${parsed.name}`);
 *   console.log(`Version: ${parsed.version}`);
 * }
 *
 * // Parse a git URL
 * const gitSource = installer.parseSource('git:github.com/user/workflow#v1.0.0');
 * if (gitSource.isOk()) {
 *   const parsed = gitSource.unwrap();
 *   console.log(`URL: ${parsed.url}`);
 *   console.log(`Ref: ${parsed.ref}`);
 * }
 * ```
 */

export class InstallationService {
	private readonly config: InstallationServiceConfig;
	private readonly gitService: GitService;
	private readonly registryService: RegistryService;

	/**
	 * Create a new InstallationService instance.
	 *
	 * @param config - Service configuration
	 * @param gitService - Optional GitService instance (created if not provided)
	 * @param registryService - Optional RegistryService instance (created if not provided)
	 */
	constructor(
		config: InstallationServiceConfig,
		gitService?: GitService,
		registryService?: RegistryService,
	) {
		this.config = config;
		this.gitService = gitService ?? new GitService({ tempDir: config.tempDir });
		this.registryService = registryService ?? new RegistryService();
	}

	// ==========================================================================
	// Source Parsing
	// ==========================================================================

	/**
	 * Parse an install source string into its components.
	 *
	 * Supports the following formats:
	 * - `"planning"` - Registry lookup, install latest version
	 * - `"planning@1.0.0"` - Registry lookup, specific version
	 * - `"planning@^1.0.0"` - Registry lookup, semver range
	 * - `"git:github.com/user/workflow"` - Direct git URL, latest
	 * - `"git:github.com/user/workflow#v1.0.0"` - Direct git URL with ref
	 * - `"git:git@github.com:user/workflow.git"` - SSH git URL
	 * - `"git:https://github.com/user/workflow.git"` - Full HTTPS URL
	 *
	 * @param source - Install source string
	 * @returns Result with ParsedSource on success, or MarketplaceError on failure
	 *
	 * @example
	 * ```typescript
	 * // Registry source with version
	 * const result = installer.parseSource('code-review@1.2.0');
	 * // Result: { type: 'registry', name: 'code-review', version: '1.2.0', raw: 'code-review@1.2.0' }
	 *
	 * // Git source with ref
	 * const gitResult = installer.parseSource('git:github.com/user/workflow#main');
	 * // Result: { type: 'git', url: 'https://github.com/user/workflow.git', ref: 'main', raw: '...' }
	 * ```
	 */
	parseSource(source: string): InstallerResult<ParsedSource> {
		// Validate input
		if (!source || typeof source !== "string") {
			return err(
				createMarketplaceError(
					MARKETPLACE_ERROR_CODES.INVALID_SOURCE,
					"Install source cannot be empty",
					undefined,
					undefined,
					"Provide a package name (e.g., 'my-workflow') or git URL (e.g., 'git:github.com/user/repo')",
				),
			);
		}

		const trimmedSource = source.trim();
		if (!trimmedSource) {
			return err(
				createMarketplaceError(
					MARKETPLACE_ERROR_CODES.INVALID_SOURCE,
					"Install source cannot be empty",
					undefined,
					undefined,
					"Provide a package name (e.g., 'my-workflow') or git URL (e.g., 'git:github.com/user/repo')",
				),
			);
		}

		// Check if it's a git source
		if (trimmedSource.startsWith("git:")) {
			return this.parseGitSource(trimmedSource);
		}

		// Otherwise, treat as registry source
		return this.parseRegistrySource(trimmedSource);
	}

	/**
	 * Parse a git source string.
	 *
	 * Format: `git:<url>[#<ref>]`
	 *
	 * @param source - Git source string (must start with 'git:')
	 * @returns Result with ParsedSource
	 */
	private parseGitSource(source: string): InstallerResult<ParsedSource> {
		// Remove 'git:' prefix
		const gitPart = source.slice(4);

		if (!gitPart) {
			return err(
				createMarketplaceError(
					MARKETPLACE_ERROR_CODES.INVALID_SOURCE,
					"Git URL cannot be empty after 'git:' prefix",
					undefined,
					undefined,
					"Provide a valid git URL (e.g., 'git:github.com/user/repo')",
				),
			);
		}

		// Check for ref (branch/tag/commit) specified with #
		let url: string;
		let ref: string | undefined;

		const hashIndex = gitPart.indexOf("#");
		if (hashIndex !== -1) {
			url = gitPart.slice(0, hashIndex);
			ref = gitPart.slice(hashIndex + 1);

			// Validate ref is not empty
			if (!ref) {
				return err(
					createMarketplaceError(
						MARKETPLACE_ERROR_CODES.INVALID_SOURCE,
						"Git ref cannot be empty after '#'",
						undefined,
						undefined,
						"Provide a valid ref (e.g., 'git:github.com/user/repo#v1.0.0' or 'git:github.com/user/repo#main')",
					),
				);
			}
		} else {
			url = gitPart;
		}

		// Validate URL is not empty
		if (!url) {
			return err(
				createMarketplaceError(
					MARKETPLACE_ERROR_CODES.INVALID_SOURCE,
					"Git URL cannot be empty",
					undefined,
					undefined,
					"Provide a valid git URL (e.g., 'git:github.com/user/repo')",
				),
			);
		}

		// Normalize the URL
		const normalizedUrl = normalizeGitUrl(url);

		// Try to extract a name from the URL for convenience
		const extractedName = extractNameFromGitUrl(normalizedUrl);

		const parsed: ParsedSource = {
			type: "git" as SourceType,
			url: normalizedUrl,
			ref,
			name: extractedName,
			raw: source,
		};

		return ok(parsed);
	}

	/**
	 * Parse a registry source string.
	 *
	 * Format: `<name>[@<version>]`
	 *
	 * @param source - Registry source string
	 * @returns Result with ParsedSource
	 */
	private parseRegistrySource(source: string): InstallerResult<ParsedSource> {
		// Check for version specifier
		const atIndex = source.lastIndexOf("@");

		let name: string;
		let version: string | undefined;

		if (atIndex > 0) {
			// Has version specifier (@ not at start to avoid @scoped/packages being misinterpreted)
			name = source.slice(0, atIndex);
			version = source.slice(atIndex + 1);

			// Validate version
			if (!version) {
				return err(
					createMarketplaceError(
						MARKETPLACE_ERROR_CODES.INVALID_SOURCE,
						"Version specifier cannot be empty after '@'",
						name,
						undefined,
						"Provide a valid version (e.g., 'my-workflow@1.0.0' or 'my-workflow@^1.0.0')",
					),
				);
			}

			// Check if version looks valid
			if (!isValidVersionSpec(version)) {
				return err(
					createMarketplaceError(
						MARKETPLACE_ERROR_CODES.INVALID_SOURCE,
						`Invalid version specifier: "${version}"`,
						name,
						undefined,
						"Use a valid semver version (e.g., '1.0.0') or range (e.g., '^1.0.0', '~1.2.0')",
					),
				);
			}
		} else {
			// No version specifier - install latest
			name = source;
		}

		// Validate package name
		if (!isValidPackageName(name)) {
			return err(
				createMarketplaceError(
					MARKETPLACE_ERROR_CODES.INVALID_SOURCE,
					`Invalid package name: "${name}"`,
					name,
					undefined,
					"Package names should be lowercase, alphanumeric, and can contain hyphens or underscores",
				),
			);
		}

		const parsed: ParsedSource = {
			type: "registry" as SourceType,
			name,
			version,
			raw: source,
		};

		return ok(parsed);
	}

	// ==========================================================================
	// Install Operation
	// ==========================================================================

	/**
	 * Install one or more workflow packages.
	 *
	 * Resolves packages from registry or git URLs, installs dependencies,
	 * and handles rollback on failure.
	 *
	 * @param sources - Package sources to install (e.g., "my-workflow", "git:github.com/user/repo")
	 * @param options - Installation options
	 * @returns Result with InstallResult containing installed packages and any errors
	 *
	 * @example
	 * ```typescript
	 * // Install from registry
	 * const result = await installer.install(['code-review@1.0.0']);
	 *
	 * // Install from git
	 * const gitResult = await installer.install(['git:github.com/user/workflow']);
	 *
	 * // Install globally with dependencies
	 * const globalResult = await installer.install(['my-workflow'], {
	 *   global: true,
	 *   force: false,
	 *   noDeps: false
	 * });
	 * ```
	 */
	async install(
		sources: string[],
		options: InstallOptions = {},
	): Promise<InstallerResult<InstallResult>> {
		const scope: InstallationScope = options.global ? "global" : "project";
		const projectPath = process.cwd();

		// Create installation context
		const context: InstallContext = {
			installing: new Set<string>(),
			installed: [],
			scope,
			noDeps: options.noDeps ?? false,
			force: options.force ?? false,
			projectPath,
		};

		const errors: MarketplaceError[] = [];

		// Ensure installation directory exists
		const installDir = getInstallDir(scope, projectPath);
		const ensureDirResult = ensureInstallDir(installDir);
		if (ensureDirResult.isErr()) {
			return err(ensureDirResult.unwrapErr());
		}

		try {
			// Process each source
			for (const source of sources) {
				const parseResult = this.parseSource(source);
				if (parseResult.isErr()) {
					errors.push(parseResult.unwrapErr());
					continue;
				}

				const parsed = parseResult.unwrap();
				const installResult = await this.installPackage(parsed, context);

				if (installResult.isErr()) {
					errors.push(installResult.unwrapErr());
					// Continue trying other packages, but we'll rollback later if needed
				}
			}

			// If there were any errors, rollback all installations
			if (errors.length > 0) {
				await this.rollbackInstallations(context.installed);
				return ok({
					success: false,
					installed: [],
					errors,
				});
			}

			return ok({
				success: true,
				installed: context.installed,
				errors: [],
			});
		} catch (error) {
			// Unexpected error - rollback and return
			await this.rollbackInstallations(context.installed);
			const message = error instanceof Error ? error.message : String(error);
			return err(
				createMarketplaceError(
					MARKETPLACE_ERROR_CODES.UNKNOWN_ERROR,
					`Installation failed: ${message}`,
					undefined,
					message,
				),
			);
		}
	}

	/**
	 * Install a single package from a parsed source.
	 *
	 * @param source - Parsed source information
	 * @param context - Installation context for dependency tracking
	 * @returns Result with installed package info
	 */
	private async installPackage(
		source: ParsedSource,
		context: InstallContext,
	): Promise<InstallerResult<InstalledPackage>> {
		// Determine the git URL and version to use
		let gitUrl: string;
		let targetVersion: string | undefined;
		let packageName: string | undefined = source.name;

		if (source.type === "registry") {
			// Look up in registry
			if (!source.name) {
				return err(
					createMarketplaceError(
						MARKETPLACE_ERROR_CODES.INVALID_SOURCE,
						"Package name is required for registry sources",
						undefined,
					),
				);
			}

			const lookupResult = await this.registryService.lookup(source.name);
			if (lookupResult.isErr()) {
				return err(lookupResult.unwrapErr());
			}

			const entry = lookupResult.unwrap();
			gitUrl = entry.repository;
			targetVersion = source.version;
			packageName = source.name;
		} else {
			// Git source
			if (!source.url) {
				return err(
					createMarketplaceError(
						MARKETPLACE_ERROR_CODES.INVALID_SOURCE,
						"Git URL is required for git sources",
						undefined,
					),
				);
			}

			gitUrl = source.url;
			targetVersion = source.ref;
		}

		// Check for circular dependency
		const packageKey = `${packageName ?? gitUrl}`;
		if (context.installing.has(packageKey)) {
			return err(
				createMarketplaceError(
					MARKETPLACE_ERROR_CODES.DEPENDENCY_CYCLE,
					`Circular dependency detected: ${packageKey}`,
					packageKey,
					undefined,
					"Review the dependency chain and remove the circular reference",
				),
			);
		}

		// Mark as installing to detect cycles
		context.installing.add(packageKey);

		try {
			// Resolve version if not specified
			const resolvedVersion = await this.resolveVersion(gitUrl, targetVersion);
			if (resolvedVersion.isErr()) {
				return err(resolvedVersion.unwrapErr());
			}

			const { version, ref } = resolvedVersion.unwrap();

			// Determine final package name (from git URL if not from registry)
			const finalName =
				packageName ?? extractNameFromGitUrl(gitUrl) ?? "unknown";

			// Check if already installed
			const installDir = getInstallDir(context.scope, context.projectPath);
			if (
				isPackageInstalled(installDir, finalName, version) &&
				!context.force
			) {
				return err(
					createMarketplaceError(
						MARKETPLACE_ERROR_CODES.ALREADY_EXISTS,
						`Package ${finalName}@${version} is already installed`,
						finalName,
						undefined,
						"Use --force to reinstall",
					),
				);
			}

			// Clone to temp directory
			const tempDir = this.gitService.createTempDir(finalName);
			const cloneResult = await this.gitService.clone({
				url: gitUrl,
				targetDir: tempDir,
				branch: ref,
			});

			if (cloneResult.isErr()) {
				return err(cloneResult.unwrapErr());
			}

			// Checkout specific ref if needed (for non-branch refs like tags or commits)
			if (ref && !ref.includes("/")) {
				// Might be a tag or commit, try checkout
				const checkoutResult = await this.gitService.checkout({
					repoDir: tempDir,
					ref,
				});
				// Ignore checkout errors if the branch clone already worked
				if (
					checkoutResult.isErr() &&
					!ref.startsWith("v") &&
					!/^\d/.test(ref)
				) {
					// Only fail if it looks like a version tag
					// For branches, the clone should have already checked out
				}
			}

			try {
				// Validate package structure
				const packageJsonResult = readPackageJson(tempDir);
				if (packageJsonResult.isErr()) {
					return err(
						createMarketplaceError(
							MARKETPLACE_ERROR_CODES.INVALID_PACKAGE,
							`Invalid package structure: missing package.json`,
							finalName,
							packageJsonResult.unwrapErr().message,
							"Ensure the repository contains a valid package.json file",
						),
					);
				}

				const packageJson = packageJsonResult.unwrap();

				// Extract actual name and version from package.json if available
				const actualName = (packageJson.name as string) ?? finalName;
				const actualVersion =
					version ?? (packageJson.version as string) ?? "0.0.0";

				// Install dependencies first (if not skipped)
				if (!context.noDeps) {
					const depsResult = await this.installDependencies(
						packageJson,
						context,
					);
					if (depsResult.isErr()) {
						return err(depsResult.unwrapErr());
					}
				}

				// Copy to installation directory
				const packageDir = getPackagePath(
					installDir,
					actualName,
					actualVersion,
				);

				// Remove existing if force reinstall
				if (context.force && directoryExists(packageDir)) {
					await removePackage(packageDir);
				}

				const copyResult = await copyPackageFiles(tempDir, packageDir);
				if (copyResult.isErr()) {
					return err(copyResult.unwrapErr());
				}

				// Write installation metadata
				const metadata: InstallationMetadata = {
					name: actualName,
					version: actualVersion,
					source,
					scope: context.scope,
					installedAt: new Date().toISOString(),
					isDependency: context.installing.size > 1, // First package is not a dependency
					dependencies: extractDependencyNames(packageJson),
				};

				const metadataResult = writeMetadata(packageDir, metadata);
				if (metadataResult.isErr()) {
					// Cleanup on metadata write failure
					await removePackage(packageDir);
					return err(metadataResult.unwrapErr());
				}

				// Create installed package record
				const installedPkg: InstalledPackage = {
					name: actualName,
					version: actualVersion,
					path: packageDir,
					scope: context.scope,
					isDependency: metadata.isDependency,
					source,
					installedAt: metadata.installedAt,
					description: packageJson.description as string | undefined,
				};

				context.installed.push(installedPkg);
				return ok(installedPkg);
			} finally {
				// Always cleanup temp directory
				await this.gitService.cleanup(tempDir);
			}
		} finally {
			// Remove from installing set
			context.installing.delete(packageKey);
		}
	}

	/**
	 * Resolve the version to install from a git repository.
	 *
	 * @param gitUrl - Git repository URL
	 * @param requestedVersion - Requested version (semver or ref)
	 * @returns Resolved version string and git ref
	 */
	private async resolveVersion(
		gitUrl: string,
		requestedVersion?: string,
	): Promise<InstallerResult<{ version: string; ref: string }>> {
		// If no version specified, get latest tag or use default branch
		if (!requestedVersion) {
			const latestTag = await this.gitService.getLatestTag(gitUrl);
			if (latestTag.isErr()) {
				return err(latestTag.unwrapErr());
			}

			const tag = latestTag.unwrap();
			if (tag) {
				return ok({
					version: tag.version ?? tag.name,
					ref: tag.name,
				});
			}

			// No tags - use default branch
			const defaultBranch = await this.gitService.getDefaultBranch(gitUrl);
			if (defaultBranch.isErr()) {
				return err(defaultBranch.unwrapErr());
			}

			return ok({
				version: "0.0.0-HEAD",
				ref: defaultBranch.unwrap(),
			});
		}

		// Check if it's a semver range (starts with ^, ~, or comparison operator)
		if (/^[~^<>=]/.test(requestedVersion)) {
			// Find best matching tag
			const tagsResult = await this.gitService.listTags(gitUrl);
			if (tagsResult.isErr()) {
				return err(tagsResult.unwrapErr());
			}

			const tags = tagsResult.unwrap().filter((t) => t.isSemver);
			const matchingTag = this.findBestMatchingVersion(tags, requestedVersion);

			if (matchingTag) {
				return ok({
					version: matchingTag.version ?? matchingTag.name,
					ref: matchingTag.name,
				});
			}

			return err(
				createMarketplaceError(
					MARKETPLACE_ERROR_CODES.VERSION_NOT_FOUND,
					`No version matching "${requestedVersion}" found`,
					undefined,
					undefined,
					"Check available versions with tag listing",
				),
			);
		}

		// Treat as exact version or ref
		const cleanVersion = requestedVersion.replace(/^v/, "");
		return ok({
			version: cleanVersion,
			ref: requestedVersion.startsWith("v")
				? requestedVersion
				: `v${requestedVersion}`,
		});
	}

	/**
	 * Find the best matching version from available tags.
	 *
	 * @param tags - Available git tags
	 * @param range - Semver range to match
	 * @returns Best matching tag or undefined
	 */
	private findBestMatchingVersion(
		tags: GitTag[],
		range: string,
	): GitTag | undefined {
		// Simple semver range matching
		// For proper semver support, this could use the semver package

		// Extract range operator and version parts
		const rangeMatch = range.match(/^([~^])?(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
		if (!rangeMatch) {
			return undefined;
		}

		const [, operator, majorStr, minorStr, patchStr] = rangeMatch;
		const major = Number.parseInt(majorStr, 10);
		const minor = minorStr ? Number.parseInt(minorStr, 10) : 0;
		const patch = patchStr ? Number.parseInt(patchStr, 10) : 0;

		// Filter and sort tags
		const matchingTags = tags.filter((tag) => {
			if (!tag.version) return false;

			const vMatch = tag.version.match(/^(\d+)\.(\d+)\.(\d+)/);
			if (!vMatch) return false;

			const tagMajor = Number.parseInt(vMatch[1], 10);
			const tagMinor = Number.parseInt(vMatch[2], 10);
			const tagPatch = Number.parseInt(vMatch[3], 10);

			if (operator === "^") {
				// ^1.2.3 allows 1.2.3 to <2.0.0
				if (major === 0) {
					// ^0.x.y is more restrictive
					return tagMajor === major && tagMinor === minor && tagPatch >= patch;
				}
				return (
					tagMajor === major &&
					(tagMinor > minor || (tagMinor === minor && tagPatch >= patch))
				);
			}

			if (operator === "~") {
				// ~1.2.3 allows 1.2.3 to <1.3.0
				return tagMajor === major && tagMinor === minor && tagPatch >= patch;
			}

			// Exact match (or greater than equal for no operator)
			return (
				tagMajor > major ||
				(tagMajor === major && tagMinor > minor) ||
				(tagMajor === major && tagMinor === minor && tagPatch >= patch)
			);
		});

		// Sort descending by version and return highest
		matchingTags.sort((a, b) => {
			const aVersion = a.version ?? "0.0.0";
			const bVersion = b.version ?? "0.0.0";
			return bVersion.localeCompare(aVersion, undefined, { numeric: true });
		});

		return matchingTags[0];
	}

	/**
	 * Install dependencies from package.json.
	 *
	 * @param packageJson - Package.json contents
	 * @param context - Installation context
	 * @returns Result indicating success or failure
	 */
	private async installDependencies(
		packageJson: Record<string, unknown>,
		context: InstallContext,
	): Promise<InstallerResult<void>> {
		const cwDeps = packageJson.cwDependencies as
			| Record<string, string>
			| undefined;

		if (!cwDeps || typeof cwDeps !== "object") {
			return ok(undefined);
		}

		for (const [name, versionSpec] of Object.entries(cwDeps)) {
			// Build dependency source
			const depSource = versionSpec ? `${name}@${versionSpec}` : name;

			const parseResult = this.parseSource(depSource);
			if (parseResult.isErr()) {
				return err(
					createMarketplaceError(
						MARKETPLACE_ERROR_CODES.INVALID_SOURCE,
						`Invalid dependency specification: ${name}@${versionSpec}`,
						name,
						parseResult.unwrapErr().message,
					),
				);
			}

			const depInstallResult = await this.installPackage(
				parseResult.unwrap(),
				context,
			);

			if (depInstallResult.isErr()) {
				// Dependency installation failed
				const depError = depInstallResult.unwrapErr();

				// Skip if already installed (not an error)
				if (depError.code === MARKETPLACE_ERROR_CODES.ALREADY_EXISTS) {
					continue;
				}

				return err(
					createMarketplaceError(
						MARKETPLACE_ERROR_CODES.DEPENDENCY_CONFLICT,
						`Failed to install dependency: ${name}`,
						name,
						depError.message,
					),
				);
			}
		}

		return ok(undefined);
	}

	/**
	 * Rollback installed packages on failure.
	 *
	 * @param installed - Packages that were installed
	 */
	private async rollbackInstallations(
		installed: InstalledPackage[],
	): Promise<void> {
		for (const pkg of installed) {
			try {
				await removePackage(pkg.path);
			} catch {
				// Best effort rollback - log but don't fail
			}
		}
	}

	// ==========================================================================
	// Uninstall Operation
	// ==========================================================================

	/**
	 * Uninstall one or more workflow packages.
	 *
	 * Removes packages from the installation directory, checking for dependent
	 * packages before removal (unless --force is used).
	 *
	 * @param names - Package names to uninstall
	 * @param options - Uninstall options
	 * @returns Result with UninstallResult containing uninstalled packages, warnings, and any errors
	 *
	 * @example
	 * ```typescript
	 * // Uninstall from project
	 * const result = await installer.uninstall(['code-review']);
	 *
	 * // Uninstall from global with force
	 * const globalResult = await installer.uninstall(['my-workflow'], {
	 *   global: true,
	 *   force: true
	 * });
	 * ```
	 */
	async uninstall(
		names: string[],
		options: UninstallOptions = {},
	): Promise<InstallerResult<UninstallResult>> {
		const scope: InstallationScope = options.global ? "global" : "project";
		const projectPath = process.cwd();
		const force = options.force ?? false;

		const uninstalled: string[] = [];
		const warnings: string[] = [];
		const errors: MarketplaceError[] = [];

		// Get installation directory
		const installDir = getInstallDir(scope, projectPath);

		// Check if installation directory exists
		if (!directoryExists(installDir)) {
			return ok({
				success: true,
				uninstalled: [],
				warnings: ["No packages installed"],
				errors: [],
			});
		}

		try {
			// Process each package name
			for (const name of names) {
				const uninstallResult = await this.uninstallPackage(
					name,
					installDir,
					scope,
					force,
				);

				if (uninstallResult.isErr()) {
					errors.push(uninstallResult.unwrapErr());
					continue;
				}

				const result = uninstallResult.unwrap();
				uninstalled.push(...result.uninstalled);
				warnings.push(...result.warnings);
			}

			return ok({
				success: errors.length === 0,
				uninstalled,
				warnings,
				errors,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return err(
				createMarketplaceError(
					MARKETPLACE_ERROR_CODES.UNKNOWN_ERROR,
					`Uninstall failed: ${message}`,
					undefined,
					message,
				),
			);
		}
	}

	/**
	 * Uninstall a single package.
	 *
	 * @param name - Package name to uninstall
	 * @param installDir - Installation directory
	 * @param scope - Installation scope
	 * @param force - Whether to force uninstall despite dependents
	 * @returns Result with uninstalled package info
	 */
	private async uninstallPackage(
		name: string,
		installDir: string,
		scope: InstallationScope,
		force: boolean,
	): Promise<InstallerResult<{ uninstalled: string[]; warnings: string[] }>> {
		const uninstalled: string[] = [];
		const warnings: string[] = [];

		// Find the installed package
		const findResult = findInstalledPackage(installDir, name, scope);
		if (findResult.isErr()) {
			return err(findResult.unwrapErr());
		}

		const pkg = findResult.unwrap();
		if (!pkg) {
			return err(
				createMarketplaceError(
					MARKETPLACE_ERROR_CODES.PACKAGE_NOT_FOUND,
					`Package "${name}" is not installed`,
					name,
					undefined,
					`Use "cw list${scope === "global" ? " --global" : ""}" to see installed packages`,
				),
			);
		}

		// Check for dependent packages
		const dependentsResult = findDependentPackages(installDir, name, scope);
		if (dependentsResult.isErr()) {
			return err(dependentsResult.unwrapErr());
		}

		const dependents = dependentsResult.unwrap();
		if (dependents.length > 0) {
			if (!force) {
				return err(
					createMarketplaceError(
						MARKETPLACE_ERROR_CODES.UNINSTALL_BLOCKED,
						`Cannot uninstall "${name}" - other packages depend on it`,
						name,
						`Dependent packages: ${dependents.join(", ")}`,
						"Use --force to uninstall anyway, or uninstall dependent packages first",
					),
				);
			}

			// Warn about dependents when using force
			warnings.push(
				`Warning: Uninstalling "${name}" despite dependents: ${dependents.join(", ")}`,
			);
		}

		// Remove the package
		const removeResult = await removePackage(pkg.path);
		if (removeResult.isErr()) {
			return err(removeResult.unwrapErr());
		}

		uninstalled.push(`${pkg.name}@${pkg.version}`);

		return ok({ uninstalled, warnings });
	}

	// ==========================================================================
	// Update Operation
	// ==========================================================================

	/**
	 * Update one or more installed packages to newer versions.
	 *
	 * Supports updating specific packages by name, or all packages with --all flag.
	 * Can respect semver ranges from dependent packages.
	 *
	 * @param names - Package names to update (empty array with options.all to update all)
	 * @param options - Update options
	 * @returns Result with UpdateResult containing updated packages, skipped, and any errors
	 *
	 * @example
	 * ```typescript
	 * // Update specific package to latest
	 * const result = await installer.update(['code-review']);
	 *
	 * // Update to specific version
	 * const versionResult = await installer.update(['code-review@2.0.0']);
	 *
	 * // Update all packages
	 * const allResult = await installer.update([], { all: true });
	 *
	 * // Dry run - show what would be updated
	 * const dryResult = await installer.update([], { all: true, dryRun: true });
	 * ```
	 */
	async update(
		names: string[],
		options: UpdateOptions = {},
	): Promise<InstallerResult<UpdateResult>> {
		const scope: InstallationScope = options.global ? "global" : "project";
		const projectPath = process.cwd();
		const dryRun = options.dryRun ?? false;

		const updated: PendingUpdate[] = [];
		const skipped: string[] = [];
		const errors: MarketplaceError[] = [];

		// Get installation directory
		const installDir = getInstallDir(scope, projectPath);

		// Check if installation directory exists
		if (!directoryExists(installDir)) {
			return ok({
				success: true,
				updated: [],
				skipped: [],
				errors: [],
			});
		}

		try {
			// Get packages to update
			let packagesToUpdate: Array<{ name: string; targetVersion?: string }>;

			if (options.all) {
				// Update all installed packages
				const listResult = listInstalledPackages(installDir, scope);
				if (listResult.isErr()) {
					return err(listResult.unwrapErr());
				}

				const installed = listResult.unwrap();
				// Get unique package names (in case of multiple versions)
				const uniqueNames = [...new Set(installed.map((p) => p.name))];
				packagesToUpdate = uniqueNames.map((name) => ({ name }));
			} else if (names.length === 0) {
				// No packages specified and not --all
				return err(
					createMarketplaceError(
						MARKETPLACE_ERROR_CODES.INVALID_SOURCE,
						"No packages specified to update",
						undefined,
						undefined,
						"Specify package names or use --all to update all packages",
					),
				);
			} else {
				// Parse package names and optional target versions
				packagesToUpdate = names.map((name) => {
					const atIndex = name.lastIndexOf("@");
					if (atIndex > 0) {
						return {
							name: name.slice(0, atIndex),
							targetVersion: name.slice(atIndex + 1),
						};
					}
					return { name };
				});
			}

			// Process each package
			for (const { name, targetVersion } of packagesToUpdate) {
				const updateResult = await this.updatePackage(
					name,
					targetVersion,
					installDir,
					scope,
					dryRun,
				);

				if (updateResult.isErr()) {
					errors.push(updateResult.unwrapErr());
					continue;
				}

				const result = updateResult.unwrap();
				if (result.wasUpdated) {
					updated.push({
						name: result.name,
						currentVersion: result.currentVersion,
						newVersion: result.newVersion,
						scope,
					});
				} else {
					skipped.push(`${result.name}@${result.currentVersion}`);
				}
			}

			return ok({
				success: errors.length === 0,
				updated,
				skipped,
				errors,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return err(
				createMarketplaceError(
					MARKETPLACE_ERROR_CODES.UNKNOWN_ERROR,
					`Update failed: ${message}`,
					undefined,
					message,
				),
			);
		}
	}

	/**
	 * Update a single package.
	 *
	 * @param name - Package name to update
	 * @param targetVersion - Optional specific version to update to (semver or exact)
	 * @param installDir - Installation directory
	 * @param scope - Installation scope
	 * @param dryRun - If true, don't actually perform the update
	 * @returns Result with update information
	 */
	private async updatePackage(
		name: string,
		targetVersion: string | undefined,
		installDir: string,
		scope: InstallationScope,
		dryRun: boolean,
	): Promise<
		InstallerResult<{
			name: string;
			currentVersion: string;
			newVersion: string;
			wasUpdated: boolean;
		}>
	> {
		// Find the currently installed package
		const findResult = findInstalledPackage(installDir, name, scope);
		if (findResult.isErr()) {
			return err(findResult.unwrapErr());
		}

		const installed = findResult.unwrap();
		if (!installed) {
			return err(
				createMarketplaceError(
					MARKETPLACE_ERROR_CODES.PACKAGE_NOT_FOUND,
					`Package "${name}" is not installed`,
					name,
					undefined,
					`Use "cw list${scope === "global" ? " --global" : ""}" to see installed packages`,
				),
			);
		}

		// Get the source to determine where to look for updates
		let gitUrl: string;

		if (installed.source?.type === "registry" && installed.source.name) {
			// Look up in registry to get git URL
			const lookupResult = await this.registryService.lookup(
				installed.source.name,
			);
			if (lookupResult.isErr()) {
				return err(lookupResult.unwrapErr());
			}
			gitUrl = lookupResult.unwrap().repository;
		} else if (installed.source?.type === "git" && installed.source.url) {
			// Use the stored git URL
			gitUrl = installed.source.url;
		} else {
			// Try to find metadata with source info
			const metadataResult = readMetadata(installed.path);
			if (metadataResult.isErr()) {
				return err(
					createMarketplaceError(
						MARKETPLACE_ERROR_CODES.INVALID_PACKAGE,
						`Cannot determine source for "${name}"`,
						name,
						undefined,
						"The package may need to be reinstalled",
					),
				);
			}

			const metadata = metadataResult.unwrap();
			if (metadata.source?.type === "registry" && metadata.source.name) {
				const lookupResult = await this.registryService.lookup(
					metadata.source.name,
				);
				if (lookupResult.isErr()) {
					return err(lookupResult.unwrapErr());
				}
				gitUrl = lookupResult.unwrap().repository;
			} else if (metadata.source?.type === "git" && metadata.source.url) {
				gitUrl = metadata.source.url;
			} else {
				return err(
					createMarketplaceError(
						MARKETPLACE_ERROR_CODES.INVALID_PACKAGE,
						`Cannot determine source for "${name}"`,
						name,
						undefined,
						"The package may need to be reinstalled",
					),
				);
			}
		}

		// Determine the version to update to
		let newVersion: string;
		let newRef: string;

		if (targetVersion) {
			// Resolve specific target version
			const resolveResult = await this.resolveVersion(gitUrl, targetVersion);
			if (resolveResult.isErr()) {
				return err(resolveResult.unwrapErr());
			}
			const resolved = resolveResult.unwrap();
			newVersion = resolved.version;
			newRef = resolved.ref;
		} else {
			// Get latest version respecting semver constraints from dependents
			const constraintResult = await this.getVersionConstraints(
				name,
				installDir,
				scope,
			);
			if (constraintResult.isErr()) {
				return err(constraintResult.unwrapErr());
			}

			const constraint = constraintResult.unwrap();

			if (constraint) {
				// Find version matching constraint
				const resolveResult = await this.resolveVersion(gitUrl, constraint);
				if (resolveResult.isErr()) {
					return err(resolveResult.unwrapErr());
				}
				const resolved = resolveResult.unwrap();
				newVersion = resolved.version;
				newRef = resolved.ref;
			} else {
				// No constraints - get latest
				const latestTag = await this.gitService.getLatestTag(gitUrl);
				if (latestTag.isErr()) {
					return err(latestTag.unwrapErr());
				}

				const tag = latestTag.unwrap();
				if (tag) {
					newVersion = tag.version ?? tag.name;
					newRef = tag.name;
				} else {
					// No tags - use default branch
					const defaultBranch = await this.gitService.getDefaultBranch(gitUrl);
					if (defaultBranch.isErr()) {
						return err(defaultBranch.unwrapErr());
					}
					newVersion = "0.0.0-HEAD";
					newRef = defaultBranch.unwrap();
				}
			}
		}

		// Compare versions
		const currentVersion = installed.version;
		if (this.compareVersions(currentVersion, newVersion) >= 0) {
			// Already up-to-date or newer
			return ok({
				name,
				currentVersion,
				newVersion,
				wasUpdated: false,
			});
		}

		// Dry run - return what would be updated
		if (dryRun) {
			return ok({
				name,
				currentVersion,
				newVersion,
				wasUpdated: true, // Would be updated
			});
		}

		// Perform the actual update by installing the new version and removing the old
		// Create a source string for installation
		const installSource =
			installed.source?.type === "registry"
				? `${name}@${newVersion}`
				: `git:${gitUrl}#${newRef}`;

		// Install new version with force to allow if same version exists
		const installResult = await this.install([installSource], {
			global: scope === "global",
			force: true,
			noDeps: false, // Include dependencies
		});

		if (installResult.isErr()) {
			return err(installResult.unwrapErr());
		}

		const installData = installResult.unwrap();
		if (!installData.success || installData.installed.length === 0) {
			const firstError = installData.errors[0];
			return err(
				firstError ??
					createMarketplaceError(
						MARKETPLACE_ERROR_CODES.UNKNOWN_ERROR,
						`Failed to install new version of "${name}"`,
						name,
					),
			);
		}

		// Remove the old version (if different from new)
		if (currentVersion !== newVersion) {
			const oldPackageDir = getPackagePath(installDir, name, currentVersion);
			if (directoryExists(oldPackageDir)) {
				const removeResult = await removePackage(oldPackageDir);
				if (removeResult.isErr()) {
					// Log warning but don't fail the update
					// The new version is installed, old one just wasn't cleaned up
				}
			}
		}

		return ok({
			name,
			currentVersion,
			newVersion,
			wasUpdated: true,
		});
	}

	/**
	 * Get semver constraints for a package from its dependents.
	 *
	 * If other packages depend on this package with specific version ranges,
	 * this returns the most restrictive constraint that satisfies all dependents.
	 *
	 * @param name - Package name
	 * @param installDir - Installation directory
	 * @param scope - Installation scope
	 * @returns The version constraint (e.g., "^1.0.0") or undefined if no constraints
	 */
	private async getVersionConstraints(
		name: string,
		installDir: string,
		scope: InstallationScope,
	): Promise<InstallerResult<string | undefined>> {
		// Find packages that depend on this one
		const dependentsResult = findDependentPackages(installDir, name, scope);
		if (dependentsResult.isErr()) {
			return err(dependentsResult.unwrapErr());
		}

		const dependentNames = dependentsResult.unwrap();
		if (dependentNames.length === 0) {
			return ok(undefined);
		}

		// Collect version constraints from dependent package.json files
		const constraints: string[] = [];

		const packagesResult = listInstalledPackages(installDir, scope);
		if (packagesResult.isErr()) {
			return err(packagesResult.unwrapErr());
		}

		const packages = packagesResult.unwrap();

		for (const depName of dependentNames) {
			const depPkg = packages.find((p) => p.name === depName);
			if (!depPkg) continue;

			const packageJsonResult = readPackageJson(depPkg.path);
			if (packageJsonResult.isErr()) continue;

			const packageJson = packageJsonResult.unwrap();
			const cwDeps = packageJson.cwDependencies as
				| Record<string, string>
				| undefined;

			if (cwDeps && cwDeps[name]) {
				constraints.push(cwDeps[name]);
			}
		}

		if (constraints.length === 0) {
			return ok(undefined);
		}

		// For simplicity, return the first constraint
		// A more sophisticated implementation would compute the intersection
		// of all semver ranges
		return ok(constraints[0]);
	}

	/**
	 * Compare two version strings.
	 *
	 * @param a - First version
	 * @param b - Second version
	 * @returns Negative if a < b, 0 if equal, positive if a > b
	 */
	private compareVersions(a: string, b: string): number {
		// Handle HEAD versions
		if (a.includes("HEAD") && !b.includes("HEAD")) return -1;
		if (!a.includes("HEAD") && b.includes("HEAD")) return 1;
		if (a.includes("HEAD") && b.includes("HEAD")) return 0;

		// Extract version parts
		const aParts = a
			.replace(/^v/, "")
			.split(".")
			.map((p) => {
				const num = Number.parseInt(p, 10);
				return Number.isNaN(num) ? 0 : num;
			});
		const bParts = b
			.replace(/^v/, "")
			.split(".")
			.map((p) => {
				const num = Number.parseInt(p, 10);
				return Number.isNaN(num) ? 0 : num;
			});

		// Compare major, minor, patch
		for (let i = 0; i < 3; i++) {
			const aVal = aParts[i] ?? 0;
			const bVal = bParts[i] ?? 0;
			if (aVal !== bVal) {
				return aVal - bVal;
			}
		}

		return 0;
	}

	// ==========================================================================
	// List Operation
	// ==========================================================================

	/**
	 * List installed workflow packages.
	 *
	 * Lists packages from project, global, or both scopes. Optionally detects
	 * packages with available updates by checking remote git repositories.
	 *
	 * @param options - List options
	 * @returns Result with ListResult containing packages and scope
	 *
	 * @example
	 * ```typescript
	 * // List project packages
	 * const result = await installer.list();
	 *
	 * // List global packages
	 * const globalResult = await installer.list({ global: true });
	 *
	 * // List all packages with outdated detection
	 * const outdatedResult = await installer.list({ all: true, outdated: true });
	 * ```
	 */
	async list(options: ListOptions = {}): Promise<InstallerResult<ListResult>> {
		const projectPath = process.cwd();

		try {
			// Determine which scopes to list
			const scopes: InstallationScope[] = [];
			let resultScope: InstallationScope | "all";

			if (options.all) {
				scopes.push("project", "global");
				resultScope = "all";
			} else if (options.global) {
				scopes.push("global");
				resultScope = "global";
			} else {
				scopes.push("project");
				resultScope = "project";
			}

			// Collect packages from all requested scopes
			const allPackages: InstalledPackage[] = [];

			for (const scope of scopes) {
				const installDir = getInstallDir(scope, projectPath);

				// Skip if directory doesn't exist
				if (!directoryExists(installDir)) {
					continue;
				}

				const listResult = listInstalledPackages(installDir, scope);
				if (listResult.isErr()) {
					return err(listResult.unwrapErr());
				}

				allPackages.push(...listResult.unwrap());
			}

			// If outdated detection is requested, check for updates
			if (options.outdated) {
				const packagesWithUpdates = await this.checkForUpdates(allPackages);

				// Filter to only show packages with updates available
				const outdatedPackages = packagesWithUpdates.filter(
					(pkg) => pkg.updateAvailable,
				);

				return ok({
					packages: outdatedPackages,
					scope: resultScope,
				});
			}

			return ok({
				packages: allPackages,
				scope: resultScope,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return err(
				createMarketplaceError(
					MARKETPLACE_ERROR_CODES.UNKNOWN_ERROR,
					`List failed: ${message}`,
					undefined,
					message,
				),
			);
		}
	}

	/**
	 * Check for available updates for a list of packages.
	 *
	 * @param packages - Packages to check for updates
	 * @returns Packages with update information
	 */
	private async checkForUpdates(
		packages: InstalledPackage[],
	): Promise<PackageWithUpdate[]> {
		const results: PackageWithUpdate[] = [];

		for (const pkg of packages) {
			const updateInfo = await this.checkPackageForUpdate(pkg);
			results.push(updateInfo);
		}

		return results;
	}

	/**
	 * Check a single package for available updates.
	 *
	 * @param pkg - Package to check
	 * @returns Package with update availability info
	 */
	private async checkPackageForUpdate(
		pkg: InstalledPackage,
	): Promise<PackageWithUpdate> {
		// Default to no update available
		const result: PackageWithUpdate = {
			...pkg,
			updateAvailable: false,
		};

		try {
			// Determine git URL for the package
			let gitUrl: string | undefined;

			if (pkg.source?.type === "registry" && pkg.source.name) {
				// Look up in registry to get git URL
				const lookupResult = await this.registryService.lookup(pkg.source.name);
				if (lookupResult.isOk()) {
					gitUrl = lookupResult.unwrap().repository;
				}
			} else if (pkg.source?.type === "git" && pkg.source.url) {
				// Use the stored git URL
				gitUrl = pkg.source.url;
			} else {
				// Try to read metadata for source info
				const metadataResult = readMetadata(pkg.path);
				if (metadataResult.isOk()) {
					const metadata = metadataResult.unwrap();
					if (metadata.source?.type === "registry" && metadata.source.name) {
						const lookupResult = await this.registryService.lookup(
							metadata.source.name,
						);
						if (lookupResult.isOk()) {
							gitUrl = lookupResult.unwrap().repository;
						}
					} else if (metadata.source?.type === "git" && metadata.source.url) {
						gitUrl = metadata.source.url;
					}
				}
			}

			if (!gitUrl) {
				// Cannot determine source, skip update check
				return result;
			}

			// Get latest version from git
			const latestTag = await this.gitService.getLatestTag(gitUrl);
			if (latestTag.isErr()) {
				// Error getting tags, skip
				return result;
			}

			const tag = latestTag.unwrap();
			if (!tag) {
				// No tags available
				return result;
			}

			const latestVersion = tag.version ?? tag.name;

			// Compare versions
			if (this.compareVersions(pkg.version, latestVersion) < 0) {
				result.latestVersion = latestVersion;
				result.updateAvailable = true;
			}

			return result;
		} catch {
			// Any error during update check - return without update info
			return result;
		}
	}

	// ==========================================================================
	// Configuration Access
	// ==========================================================================

	/**
	 * Get the current service configuration.
	 *
	 * @returns Service configuration
	 */
	getConfig(): InstallationServiceConfig {
		return { ...this.config };
	}
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create an InstallationService with default configuration.
 *
 * @param config - Service configuration
 * @returns Configured InstallationService instance
 *
 * @example
 * ```typescript
 * import { createInstallationService, getProjectInstallDir, getGlobalInstallDir } from './marketplace';
 *
 * const installer = createInstallationService({
 *   projectDir: getProjectInstallDir('.'),
 *   globalDir: getGlobalInstallDir(),
 *   tempDir: '/tmp/cw-marketplace'
 * });
 *
 * const source = installer.parseSource('my-workflow@1.0.0');
 * ```
 */
export function createInstallationService(
	config: InstallationServiceConfig,
): InstallationService {
	return new InstallationService(config);
}
