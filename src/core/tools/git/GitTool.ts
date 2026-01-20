/**
 * Git tool implementation.
 *
 * Provides Git repository operations for workflow automation.
 * Wraps Git CLI commands with proper error handling, Result types,
 * and event emission for observability.
 */

import type { ExecutionContext } from "../../context/execution.ts";
import type { TmuxManager } from "../../tmux/manager.ts";
import type { StepConfig } from "../../../types/index.ts";
import type { ToolResult } from "../types.ts";
import { BaseTool } from "../types.ts";
import { LoopSignal } from "../../../types/index.ts";
import { resolve, relative, dirname } from "node:path";
import { realpathSync } from "node:fs";
import type {
	GitConfig,
	GitError,
	GitResult,
	GitOperations,
	GitStatus,
	GitRemote,
	GitBranch,
	GitCommit,
	GitDiff,
	GitWorktree,
	GitStashEntry,
	CreateBranchOptions,
	SwitchBranchOptions,
	DeleteBranchOptions,
	ListBranchesOptions,
	CommitOptions,
	AddOptions,
	ResetOptions,
	DiffOptions,
	LogOptions,
	WorktreeAddOptions,
	WorktreeRemoveOptions,
	WorktreeAddResult,
	StashOptions,
	StashPopOptions,
} from "./types.ts";
import { createGitError } from "./types.ts";
import {
	detectGitError,
	parseStatusPorcelain,
	parseRemotes,
	parseBranchList,
	BRANCH_FORMAT,
	parseLogOutput,
	LOG_FORMAT,
	parseDiffNumstat,
	parseWorktreeList,
	parseStashList,
	STASH_FORMAT,
} from "./parsers.ts";

// =============================================================================
// Command Execution Types
// =============================================================================

/**
 * Result of running a Git command.
 */
interface GitCommandResult {
	/** Exit code of the command */
	exitCode: number;
	/** Standard output */
	stdout: string;
	/** Standard error */
	stderr: string;
	/** Whether the command succeeded (exit code 0) */
	success: boolean;
}

// =============================================================================
// GitTool Class
// =============================================================================

/**
 * Git tool for workflow automation.
 *
 * Provides a comprehensive set of Git operations including:
 * - Repository status (status, isRepo, getBranch, getRemotes)
 * - Branch operations (create, switch, delete, list)
 * - Commit operations (commit, add, reset)
 * - Diff and log operations
 * - Worktree operations (add, remove, list)
 * - Stash operations (stash, pop, list)
 *
 * All operations return Result<T, GitError> for proper error handling.
 *
 * @example
 * ```typescript
 * const gitTool = new GitTool();
 *
 * // Check if directory is a git repository
 * const isRepoResult = await gitTool.isRepo({ cwd: "/path/to/project" });
 *
 * // Create a new branch
 * const createResult = await gitTool.createBranch({
 *   name: "feature/my-feature",
 *   checkout: true
 * });
 *
 * // Commit changes
 * const commitResult = await gitTool.commit({
 *   message: "Add new feature"
 * });
 * ```
 */
export class GitTool extends BaseTool implements GitOperations {
	/**
	 * Default timeout for Git commands in milliseconds.
	 */
	private static readonly DEFAULT_TIMEOUT = 60_000; // 1 minute

	/**
	 * Tool identifier.
	 */
	get name(): string {
		return "git";
	}

	// =============================================================================
	// BaseTool Implementation
	// =============================================================================

	/**
	 * Validate step configuration for Git operations.
	 *
	 * @param step - Step configuration to validate
	 * @throws Error if configuration is invalid
	 */
	validateStep(step: StepConfig): void {
		// Git tool validates configuration at operation level
		// This is a minimal validation for the legacy step-based system
		if (step.tool !== "git") {
			throw new Error(`Invalid tool type: expected "git", got "${step.tool}"`);
		}
	}

	/**
	 * Execute a Git operation from step configuration.
	 *
	 * This method is part of the legacy step-based workflow system.
	 * For new workflows, use the GitOperations methods directly.
	 *
	 * @param step - Step configuration
	 * @param context - Execution context
	 * @param _tmuxManager - Tmux manager (unused, Git runs in subprocess)
	 * @returns Tool result
	 */
	async execute(
		step: StepConfig,
		context: ExecutionContext,
		_tmuxManager: TmuxManager,
	): Promise<ToolResult> {
		// Git operations are typically invoked through WorkflowTools.git()
		// This execute method provides compatibility with the legacy step system
		const cwd = context.interpolateOptional(step.cwd) ?? context.projectPath;

		// For legacy compatibility, execute a status check by default
		const result = await this.status({ cwd });

		if (result._tag === "ok") {
			return {
				success: true,
				output: JSON.stringify(result.value, null, 2),
				loopSignal: LoopSignal.NONE,
			};
		}

		return {
			success: false,
			error: result.error.message,
			loopSignal: LoopSignal.NONE,
		};
	}

	// =============================================================================
	// Command Execution Infrastructure
	// =============================================================================

	/**
	 * Run a Git command and return the result.
	 *
	 * @param args - Git command arguments (without "git" prefix)
	 * @param config - Git configuration including cwd
	 * @param timeout - Command timeout in milliseconds
	 * @returns Command execution result
	 */
	protected async runGitCommand(
		args: string[],
		config?: GitConfig,
		timeout: number = GitTool.DEFAULT_TIMEOUT,
	): Promise<GitCommandResult> {
		const cwd = config?.cwd ?? process.cwd();

		// Build environment variables
		const env: Record<string, string> = { ...process.env } as Record<
			string,
			string
		>;

		// Set author information if provided
		if (config?.authorName) {
			env.GIT_AUTHOR_NAME = config.authorName;
			env.GIT_COMMITTER_NAME = config.authorName;
		}
		if (config?.authorEmail) {
			env.GIT_AUTHOR_EMAIL = config.authorEmail;
			env.GIT_COMMITTER_EMAIL = config.authorEmail;
		}

		try {
			const proc = Bun.spawn(["git", ...args], {
				cwd,
				env,
				stdout: "pipe",
				stderr: "pipe",
			});

			// Set up timeout
			const timeoutPromise = new Promise<never>((_, reject) => {
				setTimeout(() => {
					proc.kill();
					reject(new Error(`Git command timed out after ${timeout}ms`));
				}, timeout);
			});

			const [stdout, stderr] = await Promise.race([
				Promise.all([
					new Response(proc.stdout).text(),
					new Response(proc.stderr).text(),
				]),
				timeoutPromise,
			]);

			const exitCode = await proc.exited;

			return {
				exitCode,
				stdout: stdout.trim(),
				stderr: stderr.trim(),
				success: exitCode === 0,
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return {
				exitCode: -1,
				stdout: "",
				stderr: message,
				success: false,
			};
		}
	}

	/**
	 * Run a Git command and return a Result type.
	 *
	 * @param args - Git command arguments
	 * @param config - Git configuration
	 * @param parser - Optional parser for successful output
	 * @returns Result with parsed output or GitError
	 */
	protected async runGitCommandWithResult<T>(
		args: string[],
		config?: GitConfig,
		parser?: (stdout: string) => T,
	): Promise<GitResult<T>> {
		const result = await this.runGitCommand(args, config);

		if (!result.success) {
			const errorType = detectGitError(result.stderr);
			return {
				_tag: "err",
				error: createGitError(
					errorType,
					result.stderr || "Git command failed",
					`git ${args.join(" ")}`,
					result.exitCode,
				),
			};
		}

		if (parser) {
			try {
				return {
					_tag: "ok",
					value: parser(result.stdout),
				};
			} catch (parseError) {
				return {
					_tag: "err",
					error: createGitError(
						"CommandFailed",
						`Failed to parse Git output: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
						`git ${args.join(" ")}`,
					),
				};
			}
		}

		// Return stdout as T (caller must ensure type compatibility)
		return {
			_tag: "ok",
			value: result.stdout as unknown as T,
		};
	}

	/**
	 * Create an Ok result.
	 */
	protected ok<T>(value: T): GitResult<T> {
		return { _tag: "ok", value };
	}

	/**
	 * Create an Err result.
	 */
	protected err<T>(error: GitError): GitResult<T> {
		return { _tag: "err", error };
	}

	// =============================================================================
	// Status Operations
	// =============================================================================

	/**
	 * Get repository status including branch, staging area, and working tree.
	 *
	 * Uses `git status --porcelain=v2 --branch` for reliable parsing.
	 *
	 * @param config - Git configuration
	 * @returns Repository status including branch, staged/unstaged files, and tracking info
	 *
	 * @example
	 * ```typescript
	 * const result = await gitTool.status({ cwd: "/path/to/repo" });
	 * if (result._tag === "ok") {
	 *   console.log(`Branch: ${result.value.branch}`);
	 *   console.log(`Clean: ${result.value.isClean}`);
	 * }
	 * ```
	 */
	async status(config?: GitConfig): Promise<GitResult<GitStatus>> {
		return this.runGitCommandWithResult<GitStatus>(
			["status", "--porcelain=v2", "--branch"],
			config,
			parseStatusPorcelain,
		);
	}

	/**
	 * Check if the current directory is inside a Git repository.
	 *
	 * Uses `git rev-parse --is-inside-work-tree` which returns "true" if inside
	 * a Git working tree.
	 *
	 * @param config - Git configuration
	 * @returns True if inside a Git repository, false otherwise
	 *
	 * @example
	 * ```typescript
	 * const result = await gitTool.isRepo({ cwd: "/path/to/check" });
	 * if (result._tag === "ok" && result.value) {
	 *   console.log("This is a Git repository");
	 * }
	 * ```
	 */
	async isRepo(config?: GitConfig): Promise<GitResult<boolean>> {
		const result = await this.runGitCommand(
			["rev-parse", "--is-inside-work-tree"],
			config,
		);

		// If the command succeeds and outputs "true", it's a repository
		if (result.success && result.stdout.trim() === "true") {
			return this.ok(true);
		}

		// If it fails with "not a git repository", return false (not an error)
		if (result.stderr.toLowerCase().includes("not a git repository")) {
			return this.ok(false);
		}

		// Other failures are actual errors
		if (!result.success) {
			const errorType = detectGitError(result.stderr);
			return this.err(
				createGitError(
					errorType,
					result.stderr || "Failed to check repository status",
					"git rev-parse --is-inside-work-tree",
					result.exitCode,
				),
			);
		}

		return this.ok(false);
	}

	/**
	 * Get the current branch name.
	 *
	 * Uses `git rev-parse --abbrev-ref HEAD` which returns the branch name
	 * or "HEAD" if in detached HEAD state.
	 *
	 * @param config - Git configuration
	 * @returns Current branch name or "HEAD" if detached
	 *
	 * @example
	 * ```typescript
	 * const result = await gitTool.getBranch({ cwd: "/path/to/repo" });
	 * if (result._tag === "ok") {
	 *   console.log(`Current branch: ${result.value}`);
	 * }
	 * ```
	 */
	async getBranch(config?: GitConfig): Promise<GitResult<string>> {
		return this.runGitCommandWithResult<string>(
			["rev-parse", "--abbrev-ref", "HEAD"],
			config,
			(stdout) => stdout.trim(),
		);
	}

	/**
	 * Get list of configured remote repositories.
	 *
	 * Uses `git remote -v` to get both fetch and push URLs for each remote.
	 *
	 * @param config - Git configuration
	 * @returns Array of remote configurations with names and URLs
	 *
	 * @example
	 * ```typescript
	 * const result = await gitTool.getRemotes({ cwd: "/path/to/repo" });
	 * if (result._tag === "ok") {
	 *   for (const remote of result.value) {
	 *     console.log(`${remote.name}: ${remote.fetchUrl}`);
	 *   }
	 * }
	 * ```
	 */
	async getRemotes(config?: GitConfig): Promise<GitResult<GitRemote[]>> {
		return this.runGitCommandWithResult<GitRemote[]>(
			["remote", "-v"],
			config,
			parseRemotes,
		);
	}

	// =============================================================================
	// Branch Operations
	// =============================================================================

	/**
	 * Create a new branch.
	 *
	 * Uses `git branch <name> [<start-point>]` or `git checkout -b` if checkout is requested.
	 *
	 * @param options - Branch creation options
	 * @param config - Git configuration
	 * @returns Success or error
	 *
	 * @example
	 * ```typescript
	 * // Create a branch without checking it out
	 * const result = await gitTool.createBranch({ name: "feature/my-feature" });
	 *
	 * // Create and checkout a branch from a specific commit
	 * const result = await gitTool.createBranch({
	 *   name: "feature/my-feature",
	 *   from: "develop",
	 *   checkout: true
	 * });
	 * ```
	 */
	async createBranch(
		options: CreateBranchOptions,
		config?: GitConfig,
	): Promise<GitResult<void>> {
		const { name, from, checkout } = options;

		// Validate branch name is provided
		if (!name || !name.trim()) {
			return this.err(
				createGitError(
					"InvalidBranchName",
					"Branch name is required",
					"git branch",
				),
			);
		}

		let args: string[];

		if (checkout) {
			// Use checkout -b to create and switch to the branch
			args = ["checkout", "-b", name];
			if (from) {
				args.push(from);
			}
		} else {
			// Use branch to just create the branch
			args = ["branch", name];
			if (from) {
				args.push(from);
			}
		}

		const result = await this.runGitCommand(args, config);

		if (!result.success) {
			const errorType = detectGitError(result.stderr);
			return this.err(
				createGitError(
					errorType,
					result.stderr || `Failed to create branch '${name}'`,
					`git ${args.join(" ")}`,
					result.exitCode,
				),
			);
		}

		return this.ok(undefined);
	}

	/**
	 * Switch to a branch.
	 *
	 * Uses `git switch <name>` or `git switch -c <name>` if create is requested.
	 * Falls back to `git checkout` for broader compatibility.
	 *
	 * @param options - Branch switch options
	 * @param config - Git configuration
	 * @returns Success or error
	 *
	 * @example
	 * ```typescript
	 * // Switch to an existing branch
	 * const result = await gitTool.switchBranch({ name: "develop" });
	 *
	 * // Create and switch to a new branch
	 * const result = await gitTool.switchBranch({
	 *   name: "feature/new-feature",
	 *   create: true
	 * });
	 *
	 * // Force switch (discard local changes)
	 * const result = await gitTool.switchBranch({
	 *   name: "main",
	 *   force: true
	 * });
	 * ```
	 */
	async switchBranch(
		options: SwitchBranchOptions,
		config?: GitConfig,
	): Promise<GitResult<void>> {
		const { name, create, force } = options;

		// Validate branch name is provided
		if (!name || !name.trim()) {
			return this.err(
				createGitError(
					"InvalidBranchName",
					"Branch name is required",
					"git switch",
				),
			);
		}

		// Build the command arguments
		// Use checkout for broader compatibility with older Git versions
		const args: string[] = ["checkout"];

		if (create) {
			args.push("-b");
		}

		if (force) {
			args.push("-f");
		}

		args.push(name);

		const result = await this.runGitCommand(args, config);

		if (!result.success) {
			const errorType = detectGitError(result.stderr);
			return this.err(
				createGitError(
					errorType,
					result.stderr || `Failed to switch to branch '${name}'`,
					`git ${args.join(" ")}`,
					result.exitCode,
				),
			);
		}

		return this.ok(undefined);
	}

	/**
	 * Delete a branch.
	 *
	 * Uses `git branch -d <name>` or `git branch -D <name>` for force delete.
	 *
	 * @param options - Branch deletion options
	 * @param config - Git configuration
	 * @returns Success or error
	 *
	 * @example
	 * ```typescript
	 * // Delete a merged branch
	 * const result = await gitTool.deleteBranch({ name: "feature/completed" });
	 *
	 * // Force delete an unmerged branch
	 * const result = await gitTool.deleteBranch({
	 *   name: "feature/abandoned",
	 *   force: true
	 * });
	 * ```
	 */
	async deleteBranch(
		options: DeleteBranchOptions,
		config?: GitConfig,
	): Promise<GitResult<void>> {
		const { name, force } = options;

		// Validate branch name is provided
		if (!name || !name.trim()) {
			return this.err(
				createGitError(
					"InvalidBranchName",
					"Branch name is required",
					"git branch",
				),
			);
		}

		// Build the command arguments
		// -d for safe delete (only merged branches)
		// -D for force delete (even unmerged branches)
		const args = ["branch", force ? "-D" : "-d", name];

		const result = await this.runGitCommand(args, config);

		if (!result.success) {
			const errorType = detectGitError(result.stderr);
			return this.err(
				createGitError(
					errorType,
					result.stderr || `Failed to delete branch '${name}'`,
					`git ${args.join(" ")}`,
					result.exitCode,
				),
			);
		}

		return this.ok(undefined);
	}

	/**
	 * List branches.
	 *
	 * Uses `git branch --format` with a custom format for reliable parsing.
	 * Supports listing local branches, remote branches, or all branches.
	 *
	 * @param options - Branch listing options
	 * @param config - Git configuration
	 * @returns Array of branch information
	 *
	 * @example
	 * ```typescript
	 * // List local branches
	 * const result = await gitTool.listBranches();
	 *
	 * // List remote branches
	 * const result = await gitTool.listBranches({ remote: true });
	 *
	 * // List all branches
	 * const result = await gitTool.listBranches({ all: true });
	 *
	 * // List branches matching a pattern
	 * const result = await gitTool.listBranches({ pattern: "feature/*" });
	 * ```
	 */
	async listBranches(
		options?: ListBranchesOptions,
		config?: GitConfig,
	): Promise<GitResult<GitBranch[]>> {
		const { remote, all, pattern } = options ?? {};

		// Build the command arguments
		const args = ["branch", `--format=${BRANCH_FORMAT}`];

		if (all) {
			args.push("-a");
		} else if (remote) {
			args.push("-r");
		}

		// Add pattern filter if provided
		if (pattern) {
			args.push("--list", pattern);
		}

		return this.runGitCommandWithResult<GitBranch[]>(
			args,
			config,
			parseBranchList,
		);
	}

	// =============================================================================
	// Commit Operations
	// =============================================================================

	/**
	 * Create a commit.
	 *
	 * Uses `git commit` with the provided message and options.
	 * Returns the commit hash on success.
	 *
	 * @param options - Commit options
	 * @param config - Git configuration
	 * @returns Commit hash on success
	 *
	 * @example
	 * ```typescript
	 * // Create a simple commit
	 * const result = await gitTool.commit({ message: "Add new feature" });
	 *
	 * // Create an empty commit
	 * const result = await gitTool.commit({
	 *   message: "Empty commit for CI trigger",
	 *   allowEmpty: true
	 * });
	 *
	 * // Amend the previous commit
	 * const result = await gitTool.commit({
	 *   message: "Updated commit message",
	 *   amend: true
	 * });
	 * ```
	 */
	async commit(
		options: CommitOptions,
		config?: GitConfig,
	): Promise<GitResult<string>> {
		const { message, allowEmpty, amend, author, email } = options;

		// Validate message is provided
		if (!message || !message.trim()) {
			return this.err(
				createGitError(
					"CommandFailed",
					"Commit message is required",
					"git commit",
				),
			);
		}

		// Build the command arguments
		const args: string[] = ["commit"];

		// Apply message prefix from config if provided
		let finalMessage = message;
		if (config?.messagePrefix) {
			finalMessage = `${config.messagePrefix}${message}`;
		}

		args.push("-m", finalMessage);

		if (allowEmpty) {
			args.push("--allow-empty");
		}

		if (amend) {
			args.push("--amend");
		}

		// Handle author override
		if (author || email) {
			const authorName = author ?? config?.authorName ?? "";
			const authorEmail = email ?? config?.authorEmail ?? "";
			if (authorName && authorEmail) {
				args.push("--author", `${authorName} <${authorEmail}>`);
			}
		}

		const result = await this.runGitCommand(args, config);

		if (!result.success) {
			const errorType = detectGitError(result.stderr);
			return this.err(
				createGitError(
					errorType,
					result.stderr || "Failed to create commit",
					`git ${args.join(" ")}`,
					result.exitCode,
				),
			);
		}

		// Extract commit hash from output
		// After a successful commit, we can get the hash with rev-parse
		const hashResult = await this.runGitCommand(["rev-parse", "HEAD"], config);

		if (!hashResult.success) {
			// Commit succeeded but couldn't get hash - return a partial success message
			return this.ok("commit created");
		}

		return this.ok(hashResult.stdout.trim());
	}

	/**
	 * Stage files for commit.
	 *
	 * Uses `git add` with the provided paths or options.
	 *
	 * @param options - Add options
	 * @param config - Git configuration
	 * @returns Success or error
	 *
	 * @example
	 * ```typescript
	 * // Stage specific files
	 * const result = await gitTool.add({ paths: ["src/index.ts", "README.md"] });
	 *
	 * // Stage all changes
	 * const result = await gitTool.add({ all: true });
	 *
	 * // Force add ignored files
	 * const result = await gitTool.add({ paths: ["build/"], force: true });
	 * ```
	 */
	async add(options: AddOptions, config?: GitConfig): Promise<GitResult<void>> {
		const { paths, all, force } = options;

		// Build the command arguments
		const args: string[] = ["add"];

		if (force) {
			args.push("-f");
		}

		if (all) {
			args.push("-A");
		} else if (paths && paths.length > 0) {
			args.push("--", ...paths);
		} else {
			// Default to staging all changes in current directory
			args.push(".");
		}

		const result = await this.runGitCommand(args, config);

		if (!result.success) {
			const errorType = detectGitError(result.stderr);
			return this.err(
				createGitError(
					errorType,
					result.stderr || "Failed to stage files",
					`git ${args.join(" ")}`,
					result.exitCode,
				),
			);
		}

		return this.ok(undefined);
	}

	/**
	 * Unstage files or reset the repository.
	 *
	 * Uses `git reset` with various modes:
	 * - Without mode/target: Unstages files (mixed reset to HEAD)
	 * - With mode and target: Resets to the specified commit
	 *
	 * @param options - Reset options
	 * @param config - Git configuration
	 * @returns Success or error
	 *
	 * @example
	 * ```typescript
	 * // Unstage all files
	 * const result = await gitTool.reset();
	 *
	 * // Unstage specific files
	 * const result = await gitTool.reset({ paths: ["src/index.ts"] });
	 *
	 * // Soft reset to previous commit (keep changes staged)
	 * const result = await gitTool.reset({ mode: "soft", target: "HEAD~1" });
	 *
	 * // Hard reset to specific commit (discard all changes)
	 * const result = await gitTool.reset({ mode: "hard", target: "origin/main" });
	 * ```
	 */
	async reset(
		options?: ResetOptions,
		config?: GitConfig,
	): Promise<GitResult<void>> {
		const { paths, mode, target } = options ?? {};

		// Build the command arguments
		const args: string[] = ["reset"];

		// Add reset mode if specified
		if (mode) {
			args.push(`--${mode}`);
		}

		// Add target if specified
		if (target) {
			args.push(target);
		}

		// Add paths if specified (must come after -- separator)
		if (paths && paths.length > 0) {
			args.push("--", ...paths);
		}

		const result = await this.runGitCommand(args, config);

		if (!result.success) {
			const errorType = detectGitError(result.stderr);
			return this.err(
				createGitError(
					errorType,
					result.stderr || "Failed to reset",
					`git ${args.join(" ")}`,
					result.exitCode,
				),
			);
		}

		return this.ok(undefined);
	}

	// =============================================================================
	// Diff Operations
	// =============================================================================

	/**
	 * Get a diff of changes.
	 *
	 * Uses `git diff` with various options to compare changes.
	 *
	 * @param options - Diff options
	 * @param config - Git configuration
	 * @returns Diff result with file changes and statistics
	 *
	 * @example
	 * ```typescript
	 * // Show unstaged changes
	 * const result = await gitTool.diff();
	 *
	 * // Show staged changes
	 * const result = await gitTool.diff({ staged: true });
	 *
	 * // Compare to a specific ref
	 * const result = await gitTool.diff({ ref: "HEAD~3" });
	 *
	 * // Compare between two refs
	 * const result = await gitTool.diff({ ref: "main", refTo: "feature-branch" });
	 *
	 * // Show only file names
	 * const result = await gitTool.diff({ nameOnly: true });
	 *
	 * // Filter to specific paths
	 * const result = await gitTool.diff({ paths: ["src/", "tests/"] });
	 * ```
	 */
	async diff(
		options?: DiffOptions,
		config?: GitConfig,
	): Promise<GitResult<GitDiff>> {
		const { staged, ref, refTo, nameOnly, stat, paths } = options ?? {};

		// Build the command arguments
		const args: string[] = ["diff"];

		// Use --numstat for structured output (unless nameOnly is requested)
		if (nameOnly) {
			args.push("--name-only");
		} else {
			args.push("--numstat");
		}

		// Add --cached for staged changes
		if (staged) {
			args.push("--cached");
		}

		// Add ref comparisons
		if (ref) {
			if (refTo) {
				// Compare between two refs: ref..refTo
				args.push(`${ref}...${refTo}`);
			} else {
				// Compare to a specific ref
				args.push(ref);
			}
		}

		// Add path filters (must come after -- separator)
		if (paths && paths.length > 0) {
			args.push("--", ...paths);
		}

		const result = await this.runGitCommand(args, config);

		if (!result.success) {
			const errorType = detectGitError(result.stderr);
			return this.err(
				createGitError(
					errorType,
					result.stderr || "Failed to get diff",
					`git ${args.join(" ")}`,
					result.exitCode,
				),
			);
		}

		// Parse the output based on the format used
		if (nameOnly) {
			// For nameOnly, create a basic diff with just file paths
			const filePaths = result.stdout
				.split("\n")
				.map((line) => line.trim())
				.filter(Boolean);

			return this.ok({
				files: filePaths.map((path) => ({
					path,
					type: "modified" as const,
					additions: 0,
					deletions: 0,
				})),
				totalAdditions: 0,
				totalDeletions: 0,
			});
		}

		// Parse numstat output
		const diff = parseDiffNumstat(result.stdout);

		// If stat was requested, get the raw output as well
		if (stat) {
			const statResult = await this.runGitCommand(
				[
					"diff",
					"--stat",
					...(staged ? ["--cached"] : []),
					...(ref ? [ref] : []),
					...(refTo ? [`...${refTo}`] : []),
					...(paths && paths.length > 0 ? ["--", ...paths] : []),
				],
				config,
			);
			if (statResult.success) {
				diff.raw = statResult.stdout;
			}
		}

		return this.ok(diff);
	}

	// =============================================================================
	// Log Operations
	// =============================================================================

	/**
	 * Get commit log history.
	 *
	 * Uses `git log` with a custom format for reliable parsing.
	 *
	 * @param options - Log options
	 * @param config - Git configuration
	 * @returns Array of commit objects
	 *
	 * @example
	 * ```typescript
	 * // Get last 10 commits (default)
	 * const result = await gitTool.log();
	 *
	 * // Get last 5 commits
	 * const result = await gitTool.log({ limit: 5 });
	 *
	 * // Get commits from a specific branch
	 * const result = await gitTool.log({ from: "feature-branch" });
	 *
	 * // Get commits between two refs
	 * const result = await gitTool.log({ from: "v1.0.0", to: "v2.0.0" });
	 *
	 * // Filter by author
	 * const result = await gitTool.log({ author: "John" });
	 *
	 * // Filter by commit message
	 * const result = await gitTool.log({ grep: "fix:" });
	 *
	 * // Filter by date range
	 * const result = await gitTool.log({
	 *   since: "2024-01-01",
	 *   until: "2024-12-31"
	 * });
	 *
	 * // Filter to specific paths
	 * const result = await gitTool.log({ paths: ["src/"] });
	 * ```
	 */
	async log(
		options?: LogOptions,
		config?: GitConfig,
	): Promise<GitResult<GitCommit[]>> {
		const { limit, from, to, author, grep, since, until, paths } =
			options ?? {};

		// Build the command arguments
		const args: string[] = ["log", `--format=${LOG_FORMAT}`];

		// Add limit (default to 50 if not specified to prevent huge outputs)
		const commitLimit = limit ?? 50;
		args.push(`-n`, `${commitLimit}`);

		// Add ref range
		if (from && to) {
			// Range between two refs
			args.push(`${from}..${to}`);
		} else if (from) {
			// Starting from a specific ref
			args.push(from);
		} else if (to) {
			// Up to a specific ref
			args.push(to);
		}

		// Add author filter
		if (author) {
			args.push(`--author=${author}`);
		}

		// Add message filter (grep)
		if (grep) {
			args.push(`--grep=${grep}`);
		}

		// Add date filters
		if (since) {
			const sinceStr = since instanceof Date ? since.toISOString() : since;
			args.push(`--since=${sinceStr}`);
		}

		if (until) {
			const untilStr = until instanceof Date ? until.toISOString() : until;
			args.push(`--until=${untilStr}`);
		}

		// Add path filters (must come after -- separator)
		if (paths && paths.length > 0) {
			args.push("--", ...paths);
		}

		return this.runGitCommandWithResult<GitCommit[]>(
			args,
			config,
			parseLogOutput,
		);
	}

	// =============================================================================
	// Worktree Operations
	// =============================================================================

	/**
	 * Add a new worktree.
	 *
	 * Uses `git worktree add` to create a new working tree at the specified path.
	 * Returns both absolute and relative paths for easy chaining with other tools.
	 *
	 * @param options - Worktree add options
	 * @param config - Git configuration
	 * @returns WorktreeAddResult with paths and operation result
	 *
	 * @example
	 * ```typescript
	 * // Create a worktree for an existing branch
	 * const { absolutePath, result } = await gitTool.worktreeAdd({
	 *   path: "../my-feature",
	 *   branch: "feature/my-feature"
	 * });
	 * if (result._tag === "ok") {
	 *   // Use absolutePath with agentSession
	 *   await tools.agentSession("Implement feature", { workingDirectory: absolutePath });
	 * }
	 *
	 * // Create a new branch in the worktree
	 * const { absolutePath } = await gitTool.worktreeAdd({
	 *   path: "../new-feature",
	 *   newBranch: "feature/new-feature"
	 * });
	 *
	 * // Create a detached HEAD worktree
	 * const result = await gitTool.worktreeAdd({
	 *   path: "../detached",
	 *   detach: true
	 * });
	 *
	 * // Force creation (remove existing if needed)
	 * const result = await gitTool.worktreeAdd({
	 *   path: "../my-feature",
	 *   branch: "feature/my-feature",
	 *   force: true
	 * });
	 * ```
	 */
	async worktreeAdd(
		options: WorktreeAddOptions,
		config?: GitConfig,
	): Promise<WorktreeAddResult> {
		const { path: worktreePath, branch, newBranch, force, detach } = options;
		const cwd = config?.cwd ?? process.cwd();

		// Validate path is provided
		if (!worktreePath || !worktreePath.trim()) {
			return {
				absolutePath: "",
				relativePath: "",
				relativeToGitRoot: "",
				result: this.err(
					createGitError(
						"CommandFailed",
						"Worktree path is required",
						"git worktree add",
					),
				),
			};
		}

		// Get git repository root and normalize paths to handle symlinks (e.g., /var -> /private/var on macOS)
		const gitRootResult = await this.runGitCommand(
			["rev-parse", "--show-toplevel"],
			config,
		);
		const normalizedCwd = realpathSync(cwd);
		const gitRoot = gitRootResult.success
			? realpathSync(gitRootResult.stdout.trim())
			: normalizedCwd;

		// Compute absolute path, normalizing the parent directory to resolve symlinks consistently
		// (the worktree directory itself doesn't exist yet, so we normalize its parent)
		const resolvedPath = resolve(cwd, worktreePath);
		const parentDir = dirname(resolvedPath);
		const worktreeName = resolvedPath.slice(parentDir.length + 1);
		const normalizedParent = realpathSync(parentDir);
		const absolutePath = resolve(normalizedParent, worktreeName);

		// Compute relative paths
		const relativePath = relative(normalizedCwd, absolutePath);
		const relativeToGitRoot = relative(gitRoot, absolutePath);

		// Build the command arguments
		const args: string[] = ["worktree", "add"];

		// Add force flag if specified
		if (force) {
			args.push("--force");
		}

		// Add detach flag if specified
		if (detach) {
			args.push("--detach");
		}

		// Add new branch creation if specified
		if (newBranch) {
			args.push("-b", newBranch);
		}

		// Add the path
		args.push(worktreePath);

		// Add the branch/commit-ish if specified (and not creating new branch)
		if (branch && !newBranch) {
			args.push(branch);
		}

		const commandResult = await this.runGitCommand(args, config);

		if (!commandResult.success) {
			const errorType = detectGitError(commandResult.stderr);
			return {
				absolutePath,
				relativePath,
				relativeToGitRoot,
				result: this.err(
					createGitError(
						errorType,
						commandResult.stderr ||
							`Failed to add worktree at '${worktreePath}'`,
						`git ${args.join(" ")}`,
						commandResult.exitCode,
					),
				),
			};
		}

		return {
			absolutePath,
			relativePath,
			relativeToGitRoot,
			result: this.ok(undefined),
		};
	}

	/**
	 * Remove a worktree.
	 *
	 * Uses `git worktree remove` to delete a working tree.
	 *
	 * @param options - Worktree remove options
	 * @param config - Git configuration
	 * @returns Success or error
	 *
	 * @example
	 * ```typescript
	 * // Remove a clean worktree
	 * const result = await gitTool.worktreeRemove({
	 *   path: "../my-feature"
	 * });
	 *
	 * // Force remove a worktree with uncommitted changes
	 * const result = await gitTool.worktreeRemove({
	 *   path: "../my-feature",
	 *   force: true
	 * });
	 * ```
	 */
	async worktreeRemove(
		options: WorktreeRemoveOptions,
		config?: GitConfig,
	): Promise<GitResult<void>> {
		const { path, force } = options;

		// Validate path is provided
		if (!path || !path.trim()) {
			return this.err(
				createGitError(
					"CommandFailed",
					"Worktree path is required",
					"git worktree remove",
				),
			);
		}

		// Build the command arguments
		const args: string[] = ["worktree", "remove"];

		// Add force flag if specified
		if (force) {
			args.push("--force");
		}

		// Add the path
		args.push(path);

		const result = await this.runGitCommand(args, config);

		if (!result.success) {
			const errorType = detectGitError(result.stderr);
			return this.err(
				createGitError(
					errorType,
					result.stderr || `Failed to remove worktree at '${path}'`,
					`git ${args.join(" ")}`,
					result.exitCode,
				),
			);
		}

		return this.ok(undefined);
	}

	/**
	 * List all worktrees.
	 *
	 * Uses `git worktree list --porcelain` for reliable parsing.
	 *
	 * @param config - Git configuration
	 * @returns Array of worktree information
	 *
	 * @example
	 * ```typescript
	 * const result = await gitTool.worktreeList();
	 * if (result._tag === "ok") {
	 *   for (const worktree of result.value) {
	 *     console.log(`${worktree.path} -> ${worktree.branch ?? "detached"}`);
	 *   }
	 * }
	 * ```
	 */
	async worktreeList(config?: GitConfig): Promise<GitResult<GitWorktree[]>> {
		return this.runGitCommandWithResult<GitWorktree[]>(
			["worktree", "list", "--porcelain"],
			config,
			parseWorktreeList,
		);
	}

	// =============================================================================
	// Stash Operations
	// =============================================================================

	/**
	 * Create a stash.
	 *
	 * Uses `git stash push` to save working tree and index state.
	 *
	 * @param options - Stash options
	 * @param config - Git configuration
	 * @returns Success or error
	 *
	 * @example
	 * ```typescript
	 * // Create a basic stash
	 * const result = await gitTool.stash();
	 *
	 * // Create a stash with a message
	 * const result = await gitTool.stash({
	 *   message: "WIP: feature implementation"
	 * });
	 *
	 * // Include untracked files
	 * const result = await gitTool.stash({
	 *   includeUntracked: true
	 * });
	 *
	 * // Stash only working tree (keep staged changes)
	 * const result = await gitTool.stash({
	 *   keepIndex: true
	 * });
	 * ```
	 */
	async stash(
		options?: StashOptions,
		config?: GitConfig,
	): Promise<GitResult<void>> {
		const { message, includeUntracked, includeIgnored, keepIndex } =
			options ?? {};

		// Build the command arguments
		const args: string[] = ["stash", "push"];

		// Add message if provided
		if (message) {
			args.push("-m", message);
		}

		// Add untracked files option
		if (includeUntracked) {
			args.push("--include-untracked");
		}

		// Add ignored files option (implies untracked)
		if (includeIgnored) {
			args.push("--all");
		}

		// Keep index option (only stash working tree)
		if (keepIndex) {
			args.push("--keep-index");
		}

		const result = await this.runGitCommand(args, config);

		if (!result.success) {
			const errorType = detectGitError(result.stderr);
			return this.err(
				createGitError(
					errorType,
					result.stderr || "Failed to create stash",
					`git ${args.join(" ")}`,
					result.exitCode,
				),
			);
		}

		return this.ok(undefined);
	}

	/**
	 * Pop a stash (apply and remove).
	 *
	 * Uses `git stash pop` to apply stashed changes and remove from stash list.
	 *
	 * @param options - Stash pop options
	 * @param config - Git configuration
	 * @returns Success or error
	 *
	 * @example
	 * ```typescript
	 * // Pop the most recent stash
	 * const result = await gitTool.stashPop();
	 *
	 * // Pop a specific stash by index
	 * const result = await gitTool.stashPop({ index: 2 });
	 *
	 * // Pop and restore index state
	 * const result = await gitTool.stashPop({
	 *   restoreIndex: true
	 * });
	 * ```
	 */
	async stashPop(
		options?: StashPopOptions,
		config?: GitConfig,
	): Promise<GitResult<void>> {
		const { index, restoreIndex } = options ?? {};

		// Build the command arguments
		const args: string[] = ["stash", "pop"];

		// Add index restoration option
		if (restoreIndex) {
			args.push("--index");
		}

		// Add specific stash index if provided
		if (index !== undefined) {
			args.push(`stash@{${index}}`);
		}

		const result = await this.runGitCommand(args, config);

		if (!result.success) {
			const errorType = detectGitError(result.stderr);
			return this.err(
				createGitError(
					errorType,
					result.stderr || "Failed to pop stash",
					`git ${args.join(" ")}`,
					result.exitCode,
				),
			);
		}

		return this.ok(undefined);
	}

	/**
	 * List all stashes.
	 *
	 * Uses `git stash list` with a custom format for reliable parsing.
	 *
	 * @param config - Git configuration
	 * @returns Array of stash entry information
	 *
	 * @example
	 * ```typescript
	 * const result = await gitTool.stashList();
	 * if (result._tag === "ok") {
	 *   for (const stash of result.value) {
	 *     console.log(`${stash.ref}: ${stash.message}`);
	 *   }
	 * }
	 * ```
	 */
	async stashList(config?: GitConfig): Promise<GitResult<GitStashEntry[]>> {
		return this.runGitCommandWithResult<GitStashEntry[]>(
			["stash", "list", `--format=${STASH_FORMAT}`],
			config,
			parseStashList,
		);
	}
}
