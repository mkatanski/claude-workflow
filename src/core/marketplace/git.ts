/**
 * Git service for marketplace package operations.
 *
 * Provides Git operations for cloning, checking out, and managing
 * workflow packages from git repositories using Bun Shell.
 */

import { $ } from "bun";
import { rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { ok, err, type ResultBox } from "../utils/result/index.ts";
import type {
	GitServiceConfig,
	MarketplaceError,
	MarketplaceErrorCode,
} from "./types.ts";
import { MARKETPLACE_ERROR_CODES } from "./types.ts";

// ============================================================================
// Types
// ============================================================================

/**
 * Result type for git operations.
 */
export type GitResult<T> = ResultBox<T, MarketplaceError>;

/**
 * Tag information parsed from git ls-remote.
 */
export interface GitTag {
	/** Tag name without refs/tags/ prefix */
	name: string;

	/** Commit SHA the tag points to */
	sha: string;

	/** Whether this is a semver-compatible tag */
	isSemver: boolean;

	/** Cleaned version number (without 'v' prefix) */
	version?: string;
}

/**
 * Options for clone operations.
 */
export interface CloneOptions {
	/** Git repository URL */
	url: string;

	/** Target directory for clone */
	targetDir: string;

	/** Whether to use shallow clone (default: true) */
	shallow?: boolean;

	/** Specific branch to clone */
	branch?: string;
}

/**
 * Options for checkout operations.
 */
export interface CheckoutOptions {
	/** Directory containing the repository */
	repoDir: string;

	/** Ref to checkout (tag, branch, or commit) */
	ref: string;
}

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
 * Check if a string looks like a semver version.
 * Supports optional 'v' prefix.
 */
function isSemverLike(tag: string): boolean {
	// Match v1.0.0, 1.0.0, v1.0.0-beta.1, etc.
	const semverPattern = /^v?(\d+)\.(\d+)\.(\d+)(?:-[\w.]+)?(?:\+[\w.]+)?$/;
	return semverPattern.test(tag);
}

/**
 * Clean a version string by removing 'v' prefix.
 */
function cleanVersion(tag: string): string {
	return tag.replace(/^v/, "");
}

/**
 * Compare two semver versions.
 * Returns negative if a < b, positive if a > b, 0 if equal.
 */
function compareSemver(a: string, b: string): number {
	const cleanA = cleanVersion(a);
	const cleanB = cleanVersion(b);

	const partsA = cleanA.split(/[-+]/)[0].split(".").map(Number);
	const partsB = cleanB.split(/[-+]/)[0].split(".").map(Number);

	for (let i = 0; i < 3; i++) {
		const numA = partsA[i] ?? 0;
		const numB = partsB[i] ?? 0;
		if (numA !== numB) {
			return numA - numB;
		}
	}

	// Handle pre-release versions (they come before release)
	const preA = cleanA.includes("-");
	const preB = cleanB.includes("-");
	if (preA && !preB) return -1;
	if (!preA && preB) return 1;

	return 0;
}

/**
 * Parse git ls-remote --tags output.
 */
function parseTagsOutput(output: string): GitTag[] {
	const lines = output.trim().split("\n").filter(Boolean);
	const tags: GitTag[] = [];

	for (const line of lines) {
		// Format: <sha>\trefs/tags/<tagname>
		const parts = line.split("\t");
		if (parts.length !== 2) continue;

		const sha = parts[0].trim();
		const ref = parts[1].trim();

		// Skip ^{} peeled refs (annotated tag dereferencing)
		if (ref.endsWith("^{}")) continue;

		// Extract tag name from refs/tags/
		const name = ref.replace(/^refs\/tags\//, "");

		const semver = isSemverLike(name);
		tags.push({
			name,
			sha,
			isSemver: semver,
			version: semver ? cleanVersion(name) : undefined,
		});
	}

	return tags;
}

// ============================================================================
// GitService Class
// ============================================================================

/**
 * Git service for marketplace operations.
 *
 * Provides methods for cloning repositories, checking out refs,
 * listing tags, and cleaning up temporary directories.
 *
 * @example
 * ```typescript
 * const gitService = new GitService({
 *   tempDir: '/tmp/cw-marketplace',
 *   shallow: true,
 *   timeout: 60000
 * });
 *
 * // Clone a repository
 * const cloneResult = await gitService.clone({
 *   url: 'https://github.com/user/workflow.git',
 *   targetDir: '/tmp/cw-marketplace/workflow'
 * });
 *
 * // List available tags
 * const tagsResult = await gitService.listTags('https://github.com/user/workflow.git');
 *
 * // Get latest semver tag
 * const latestResult = await gitService.getLatestTag('https://github.com/user/workflow.git');
 * ```
 */
export class GitService {
	private readonly config: Required<GitServiceConfig>;

	/**
	 * Create a new GitService instance.
	 *
	 * @param config - Service configuration
	 */
	constructor(config: GitServiceConfig) {
		this.config = {
			tempDir: config.tempDir,
			shallow: config.shallow ?? true,
			timeout: config.timeout ?? 60_000,
		};
	}

	// ==========================================================================
	// Public Methods
	// ==========================================================================

	/**
	 * Clone a git repository.
	 *
	 * Creates a clone of the repository at the specified target directory.
	 * Uses shallow clone by default for performance.
	 *
	 * @param options - Clone options
	 * @returns Result with void on success, or MarketplaceError on failure
	 *
	 * @example
	 * ```typescript
	 * const result = await gitService.clone({
	 *   url: 'https://github.com/user/workflow.git',
	 *   targetDir: '/tmp/workflow',
	 *   shallow: true
	 * });
	 *
	 * if (result.isOk()) {
	 *   console.log('Clone successful');
	 * }
	 * ```
	 */
	async clone(options: CloneOptions): Promise<GitResult<void>> {
		const { url, targetDir, shallow = this.config.shallow, branch } = options;

		// Ensure target directory's parent exists
		const parentDir = join(targetDir, "..");
		try {
			await mkdir(parentDir, { recursive: true });
		} catch {
			// Parent might already exist
		}

		try {
			// Build clone command arguments
			const args: string[] = ["clone"];

			if (shallow) {
				args.push("--depth", "1");
			}

			if (branch) {
				args.push("--branch", branch);
			}

			args.push(url, targetDir);

			// Execute clone command
			const result = await $`git ${args}`.nothrow().quiet();

			if (result.exitCode !== 0) {
				const stderr = result.stderr.toString().trim();

				// Check for common error types
				if (stderr.includes("not found") || stderr.includes("does not exist")) {
					return err(
						createMarketplaceError(
							MARKETPLACE_ERROR_CODES.CLONE_FAILED,
							`Repository not found: ${url}`,
							undefined,
							stderr,
							"Verify the repository URL is correct and accessible",
						),
					);
				}

				if (
					stderr.includes("Authentication failed") ||
					stderr.includes("Permission denied")
				) {
					return err(
						createMarketplaceError(
							MARKETPLACE_ERROR_CODES.PERMISSION_DENIED,
							`Authentication failed for: ${url}`,
							undefined,
							stderr,
							"For private repos, ensure SSH keys are configured or use HTTPS with credentials",
						),
					);
				}

				return err(
					createMarketplaceError(
						MARKETPLACE_ERROR_CODES.CLONE_FAILED,
						`Failed to clone repository: ${url}`,
						undefined,
						stderr,
					),
				);
			}

			return ok(undefined);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);

			// Check if git is not installed
			if (message.includes("not found") || message.includes("ENOENT")) {
				return err(
					createMarketplaceError(
						MARKETPLACE_ERROR_CODES.GIT_NOT_FOUND,
						"Git is not installed or not in PATH",
						undefined,
						message,
						"Install git: https://git-scm.com/downloads",
					),
				);
			}

			return err(
				createMarketplaceError(
					MARKETPLACE_ERROR_CODES.CLONE_FAILED,
					`Clone operation failed: ${message}`,
					undefined,
					message,
				),
			);
		}
	}

	/**
	 * Checkout a specific ref (tag, branch, or commit).
	 *
	 * @param options - Checkout options
	 * @returns Result with void on success, or MarketplaceError on failure
	 *
	 * @example
	 * ```typescript
	 * const result = await gitService.checkout({
	 *   repoDir: '/tmp/workflow',
	 *   ref: 'v1.0.0'
	 * });
	 * ```
	 */
	async checkout(options: CheckoutOptions): Promise<GitResult<void>> {
		const { repoDir, ref } = options;

		try {
			// For shallow clones, we need to fetch the specific ref first
			// We ignore the result since the ref might already exist locally
			// or the fetch might fail for refs that don't exist remotely
			await $`git -C ${repoDir} fetch origin ${ref} --depth=1`
				.nothrow()
				.quiet();

			// Try to checkout the ref
			const checkoutResult = await $`git -C ${repoDir} checkout ${ref}`
				.nothrow()
				.quiet();

			if (checkoutResult.exitCode !== 0) {
				const stderr = checkoutResult.stderr.toString().trim();

				if (
					stderr.includes("did not match any file") ||
					stderr.includes("not a commit")
				) {
					return err(
						createMarketplaceError(
							MARKETPLACE_ERROR_CODES.CHECKOUT_FAILED,
							`Ref not found: ${ref}`,
							undefined,
							stderr,
							"Verify the tag, branch, or commit exists in the repository",
						),
					);
				}

				return err(
					createMarketplaceError(
						MARKETPLACE_ERROR_CODES.CHECKOUT_FAILED,
						`Failed to checkout ref: ${ref}`,
						undefined,
						stderr,
					),
				);
			}

			return ok(undefined);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return err(
				createMarketplaceError(
					MARKETPLACE_ERROR_CODES.CHECKOUT_FAILED,
					`Checkout operation failed: ${message}`,
					undefined,
					message,
				),
			);
		}
	}

	/**
	 * List all tags from a remote repository.
	 *
	 * Uses `git ls-remote --tags` to fetch tags without cloning.
	 *
	 * @param url - Git repository URL
	 * @returns Result with array of GitTag objects, or MarketplaceError on failure
	 *
	 * @example
	 * ```typescript
	 * const result = await gitService.listTags('https://github.com/user/workflow.git');
	 * if (result.isOk()) {
	 *   const tags = result.unwrap();
	 *   const semverTags = tags.filter(t => t.isSemver);
	 * }
	 * ```
	 */
	async listTags(url: string): Promise<GitResult<GitTag[]>> {
		try {
			const result = await $`git ls-remote --tags ${url}`.nothrow().quiet();

			if (result.exitCode !== 0) {
				const stderr = result.stderr.toString().trim();

				if (stderr.includes("not found") || stderr.includes("does not exist")) {
					return err(
						createMarketplaceError(
							MARKETPLACE_ERROR_CODES.CLONE_FAILED,
							`Repository not found: ${url}`,
							undefined,
							stderr,
						),
					);
				}

				if (
					stderr.includes("Authentication failed") ||
					stderr.includes("Permission denied")
				) {
					return err(
						createMarketplaceError(
							MARKETPLACE_ERROR_CODES.PERMISSION_DENIED,
							`Authentication failed for: ${url}`,
							undefined,
							stderr,
						),
					);
				}

				return err(
					createMarketplaceError(
						MARKETPLACE_ERROR_CODES.NETWORK_ERROR,
						`Failed to list tags from: ${url}`,
						undefined,
						stderr,
					),
				);
			}

			const output = result.stdout.toString();
			const tags = parseTagsOutput(output);

			return ok(tags);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);

			if (message.includes("not found") || message.includes("ENOENT")) {
				return err(
					createMarketplaceError(
						MARKETPLACE_ERROR_CODES.GIT_NOT_FOUND,
						"Git is not installed or not in PATH",
						undefined,
						message,
						"Install git: https://git-scm.com/downloads",
					),
				);
			}

			return err(
				createMarketplaceError(
					MARKETPLACE_ERROR_CODES.NETWORK_ERROR,
					`Failed to list tags: ${message}`,
					undefined,
					message,
				),
			);
		}
	}

	/**
	 * Get the latest semver-compatible tag from a remote repository.
	 *
	 * Fetches all tags and returns the highest version according to semver.
	 * Returns null if no semver tags are found.
	 *
	 * @param url - Git repository URL
	 * @returns Result with the latest GitTag or null, or MarketplaceError on failure
	 *
	 * @example
	 * ```typescript
	 * const result = await gitService.getLatestTag('https://github.com/user/workflow.git');
	 * if (result.isOk()) {
	 *   const latest = result.unwrap();
	 *   if (latest) {
	 *     console.log(`Latest version: ${latest.version}`);
	 *   } else {
	 *     console.log('No semver tags found, using HEAD');
	 *   }
	 * }
	 * ```
	 */
	async getLatestTag(url: string): Promise<GitResult<GitTag | null>> {
		const tagsResult = await this.listTags(url);

		if (tagsResult.isErr()) {
			return err(tagsResult.unwrapErr());
		}

		const tags = tagsResult.unwrap();
		const semverTags = tags.filter((t) => t.isSemver);

		if (semverTags.length === 0) {
			return ok(null);
		}

		// Sort by version descending
		semverTags.sort((a, b) => compareSemver(b.name, a.name));

		return ok(semverTags[0]);
	}

	/**
	 * Clean up a directory (used for temp directories after operations).
	 *
	 * Recursively removes the directory and all its contents.
	 * Safe to call even if the directory doesn't exist.
	 *
	 * @param dir - Directory path to remove
	 * @returns Result with void on success, or MarketplaceError on failure
	 *
	 * @example
	 * ```typescript
	 * // Always clean up temp directories in finally blocks
	 * const tempDir = '/tmp/cw-marketplace/workflow';
	 * try {
	 *   // ... operations ...
	 * } finally {
	 *   await gitService.cleanup(tempDir);
	 * }
	 * ```
	 */
	async cleanup(dir: string): Promise<GitResult<void>> {
		try {
			await rm(dir, { recursive: true, force: true });
			return ok(undefined);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);

			// Ignore errors if the directory doesn't exist
			if (message.includes("ENOENT")) {
				return ok(undefined);
			}

			return err(
				createMarketplaceError(
					MARKETPLACE_ERROR_CODES.UNKNOWN_ERROR,
					`Failed to clean up directory: ${dir}`,
					undefined,
					message,
				),
			);
		}
	}

	/**
	 * Get the default branch of a repository.
	 *
	 * Uses `git ls-remote --symref` to determine the default branch.
	 *
	 * @param url - Git repository URL
	 * @returns Result with branch name (e.g., "main", "master"), or MarketplaceError
	 *
	 * @example
	 * ```typescript
	 * const result = await gitService.getDefaultBranch('https://github.com/user/workflow.git');
	 * if (result.isOk()) {
	 *   console.log(`Default branch: ${result.unwrap()}`);
	 * }
	 * ```
	 */
	async getDefaultBranch(url: string): Promise<GitResult<string>> {
		try {
			const result = await $`git ls-remote --symref ${url} HEAD`
				.nothrow()
				.quiet();

			if (result.exitCode !== 0) {
				const stderr = result.stderr.toString().trim();
				return err(
					createMarketplaceError(
						MARKETPLACE_ERROR_CODES.NETWORK_ERROR,
						`Failed to determine default branch for: ${url}`,
						undefined,
						stderr,
					),
				);
			}

			const output = result.stdout.toString();
			// Parse output like: ref: refs/heads/main	HEAD
			const match = output.match(/ref: refs\/heads\/(\S+)/);

			if (match?.[1]) {
				return ok(match[1]);
			}

			// Fallback to common defaults
			return ok("main");
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return err(
				createMarketplaceError(
					MARKETPLACE_ERROR_CODES.NETWORK_ERROR,
					`Failed to determine default branch: ${message}`,
					undefined,
					message,
				),
			);
		}
	}

	/**
	 * Create a unique temp directory for clone operations.
	 *
	 * @param name - Optional name hint for the directory
	 * @returns Absolute path to the temp directory
	 */
	createTempDir(name?: string): string {
		const timestamp = Date.now();
		const random = Math.random().toString(36).substring(2, 8);
		const dirName = name
			? `${name}-${timestamp}-${random}`
			: `${timestamp}-${random}`;
		return join(this.config.tempDir, dirName);
	}
}
