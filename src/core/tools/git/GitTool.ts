/**
 * Git tool implementation using simple-git.
 *
 * Provides Git repository operations for workflow automation.
 * Uses simple-git library for proper async handling and better TypeScript support.
 */

import { existsSync, realpathSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { type SimpleGit, type StatusResult, simpleGit } from "simple-git";
import type { StepConfig } from "../../../types/index.ts";
import { LoopSignal } from "../../../types/index.ts";
import type { ExecutionContext } from "../../context/execution.ts";
import type { TmuxManager } from "../../tmux/manager.ts";
import type { ToolResult } from "../types.ts";
import { BaseTool } from "../types.ts";
import type {
	AddOptions,
	CommitOptions,
	CreateBranchOptions,
	DeleteBranchOptions,
	DiffOptions,
	DiffPatchOptions,
	DiffPatchResult,
	GitBranch,
	GitCommit,
	GitConfig,
	GitDiff,
	GitDiffFile,
	GitError,
	GitFileStatus,
	GitOperations,
	GitRemote,
	GitResult,
	GitStashEntry,
	GitStatus,
	GitWorktree,
	ListBranchesOptions,
	LogOptions,
	ResetOptions,
	StashOptions,
	StashPopOptions,
	SwitchBranchOptions,
	WorktreeAddOptions,
	WorktreeAddResult,
	WorktreeRemoveOptions,
} from "./types.ts";
import { createGitError, type GitErrorType } from "./types.ts";

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a simple-git instance for the given working directory.
 */
function createGit(cwd?: string, config?: GitConfig): SimpleGit {
	const baseDir = cwd ?? config?.cwd ?? process.cwd();
	const git = simpleGit(baseDir);

	// Configure environment variables for author info
	if (config?.authorName || config?.authorEmail) {
		const env: Record<string, string> = {};
		if (config.authorName) {
			env.GIT_AUTHOR_NAME = config.authorName;
			env.GIT_COMMITTER_NAME = config.authorName;
		}
		if (config.authorEmail) {
			env.GIT_AUTHOR_EMAIL = config.authorEmail;
			env.GIT_COMMITTER_EMAIL = config.authorEmail;
		}
		git.env(env);
	}

	return git;
}

/**
 * Detect Git error type from error message.
 */
function detectGitErrorType(message: string): GitErrorType {
	const lowerMessage = message.toLowerCase();

	if (lowerMessage.includes("not a git repository")) {
		return "NotARepository";
	}
	if (lowerMessage.includes("already exists")) {
		if (lowerMessage.includes("branch")) {
			return "BranchExists";
		}
		return "WorktreeExists";
	}
	if (lowerMessage.includes("branch") && lowerMessage.includes("not found")) {
		return "BranchNotFound";
	}
	if (
		lowerMessage.includes("merge conflict") ||
		lowerMessage.includes("automatic merge failed")
	) {
		return "MergeConflict";
	}
	if (
		lowerMessage.includes("uncommitted changes") ||
		lowerMessage.includes("would be overwritten") ||
		lowerMessage.includes("please commit your changes")
	) {
		return "DirtyWorkingTree";
	}
	if (
		lowerMessage.includes("is not a working tree") ||
		lowerMessage.includes("is not registered")
	) {
		return "WorktreeNotFound";
	}
	if (
		lowerMessage.includes("no stash") ||
		(lowerMessage.includes("stash@{") && lowerMessage.includes("not found"))
	) {
		return "StashNotFound";
	}
	if (lowerMessage.includes("invalid branch name")) {
		return "InvalidBranchName";
	}

	return "CommandFailed";
}

/**
 * Convert simple-git error to GitError.
 */
function toGitError(error: unknown, command?: string): GitError {
	const message = error instanceof Error ? error.message : String(error);
	const errorType = detectGitErrorType(message);
	return createGitError(errorType, message, command);
}

/**
 * Parse status result from simple-git to our GitStatus format.
 */
function parseSimpleGitStatus(status: StatusResult): GitStatus {
	const staged: GitFileStatus[] = [];
	const unstaged: GitFileStatus[] = [];

	// Process staged files
	for (const file of status.staged) {
		const fileStatus = status.files.find((f) => f.path === file);
		staged.push({
			path: file,
			index: fileStatus?.index ?? "A",
			workingTree: ".",
		});
	}

	// Process modified (unstaged) files
	for (const file of status.modified) {
		if (!status.staged.includes(file)) {
			unstaged.push({
				path: file,
				index: ".",
				workingTree: "M",
			});
		}
	}

	// Process deleted files
	for (const file of status.deleted) {
		if (!status.staged.includes(file)) {
			unstaged.push({
				path: file,
				index: ".",
				workingTree: "D",
			});
		}
	}

	return {
		branch: status.current ?? "HEAD",
		upstream: status.tracking ?? undefined,
		ahead: status.ahead,
		behind: status.behind,
		staged,
		unstaged,
		untracked: status.not_added,
		isClean: status.isClean(),
	};
}

/**
 * Parse worktree list output from git worktree list --porcelain.
 */
function parseWorktreeListOutput(output: string): GitWorktree[] {
	if (!output.trim()) {
		return [];
	}

	const worktrees: GitWorktree[] = [];
	const blocks = output.split(/\n\n+/).filter((block) => block.trim());

	for (const block of blocks) {
		const lines = block.split("\n").filter((line) => line.trim());

		let path = "";
		let head = "";
		let branch: string | undefined;
		let main = false;
		let bare = false;
		let detached = false;
		let locked = false;
		let lockReason: string | undefined;
		let prunable = false;

		for (const line of lines) {
			if (line.startsWith("worktree ")) {
				path = line.substring("worktree ".length);
				main = worktrees.length === 0;
			} else if (line.startsWith("HEAD ")) {
				head = line.substring("HEAD ".length);
			} else if (line.startsWith("branch ")) {
				const refPath = line.substring("branch ".length);
				if (refPath.startsWith("refs/heads/")) {
					branch = refPath.substring("refs/heads/".length);
				} else {
					branch = refPath;
				}
			} else if (line === "detached") {
				detached = true;
			} else if (line === "bare") {
				bare = true;
			} else if (line.startsWith("locked")) {
				locked = true;
				const reason = line.substring("locked".length).trim();
				if (reason) {
					lockReason = reason;
				}
			} else if (line.startsWith("prunable")) {
				prunable = true;
			}
		}

		if (path && head) {
			worktrees.push({
				path,
				head,
				branch,
				main,
				bare,
				detached,
				locked,
				lockReason,
				prunable,
			});
		}
	}

	return worktrees;
}

/**
 * Parse stash list output.
 */
function parseStashListOutput(output: string): GitStashEntry[] {
	if (!output.trim()) {
		return [];
	}

	const entries: GitStashEntry[] = [];
	const lines = output.split("\n").filter((line) => line.trim());

	for (const line of lines) {
		// Format: stash@{0}: WIP on branch: message
		const match = line.match(/^(stash@\{(\d+)\}):\s*(.*)$/);
		if (match) {
			const [, ref, indexStr, fullMessage] = match;
			const index = parseInt(indexStr, 10);

			// Extract branch from message
			let branch = "unknown";
			const branchMatch = fullMessage.match(/^(?:WIP )?[Oo]n ([^:]+):/);
			if (branchMatch) {
				branch = branchMatch[1];
			}

			entries.push({
				index,
				ref,
				branch,
				message: fullMessage,
				date: new Date(), // simple-git doesn't provide date in basic list
			});
		}
	}

	return entries;
}

// =============================================================================
// GitTool Class
// =============================================================================

/**
 * Git tool for workflow automation using simple-git.
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
 */
export class GitTool extends BaseTool implements GitOperations {
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
	 */
	validateStep(step: StepConfig): void {
		if (step.tool !== "git") {
			throw new Error(`Invalid tool type: expected "git", got "${step.tool}"`);
		}
	}

	/**
	 * Execute a Git operation from step configuration.
	 */
	async execute(
		step: StepConfig,
		context: ExecutionContext,
		_tmuxManager: TmuxManager,
	): Promise<ToolResult> {
		const cwd = context.interpolateOptional(step.cwd) ?? context.projectPath;
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
	// Result Helpers
	// =============================================================================

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
	 */
	async status(config?: GitConfig): Promise<GitResult<GitStatus>> {
		try {
			const git = createGit(config?.cwd, config);
			const status = await git.status();
			return this.ok(parseSimpleGitStatus(status));
		} catch (error) {
			return this.err(toGitError(error, "git status"));
		}
	}

	/**
	 * Check if the current directory is inside a Git repository.
	 */
	async isRepo(config?: GitConfig): Promise<GitResult<boolean>> {
		try {
			const git = createGit(config?.cwd, config);
			const isRepo = await git.checkIsRepo();
			return this.ok(isRepo);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (message.toLowerCase().includes("not a git repository")) {
				return this.ok(false);
			}
			return this.err(toGitError(error, "git rev-parse --is-inside-work-tree"));
		}
	}

	/**
	 * Get the current branch name.
	 */
	async getBranch(config?: GitConfig): Promise<GitResult<string>> {
		try {
			const git = createGit(config?.cwd, config);
			const branch = await git.revparse(["--abbrev-ref", "HEAD"]);
			return this.ok(branch.trim());
		} catch (error) {
			return this.err(toGitError(error, "git rev-parse --abbrev-ref HEAD"));
		}
	}

	/**
	 * Get list of configured remote repositories.
	 */
	async getRemotes(config?: GitConfig): Promise<GitResult<GitRemote[]>> {
		try {
			const git = createGit(config?.cwd, config);
			const remotes = await git.getRemotes(true);
			return this.ok(
				remotes.map((r) => ({
					name: r.name,
					fetchUrl: r.refs.fetch ?? "",
					pushUrl: r.refs.push ?? r.refs.fetch ?? "",
				})),
			);
		} catch (error) {
			return this.err(toGitError(error, "git remote -v"));
		}
	}

	// =============================================================================
	// Branch Operations
	// =============================================================================

	/**
	 * Create a new branch.
	 */
	async createBranch(
		options: CreateBranchOptions,
		config?: GitConfig,
	): Promise<GitResult<void>> {
		const { name, from, checkout } = options;

		if (!name || !name.trim()) {
			return this.err(
				createGitError(
					"InvalidBranchName",
					"Branch name is required",
					"git branch",
				),
			);
		}

		try {
			const git = createGit(config?.cwd, config);

			if (checkout) {
				if (from) {
					await git.checkoutBranch(name, from);
				} else {
					await git.checkoutLocalBranch(name);
				}
			} else {
				const args = ["branch", name];
				if (from) {
					args.push(from);
				}
				await git.raw(args);
			}

			return this.ok(undefined);
		} catch (error) {
			return this.err(toGitError(error, `git branch ${name}`));
		}
	}

	/**
	 * Switch to a branch.
	 */
	async switchBranch(
		options: SwitchBranchOptions,
		config?: GitConfig,
	): Promise<GitResult<void>> {
		const { name, create, force } = options;

		if (!name || !name.trim()) {
			return this.err(
				createGitError(
					"InvalidBranchName",
					"Branch name is required",
					"git switch",
				),
			);
		}

		try {
			const git = createGit(config?.cwd, config);

			if (create) {
				await git.checkoutLocalBranch(name);
			} else {
				const checkoutOptions: string[] = [];
				if (force) {
					checkoutOptions.push("-f");
				}
				await git.checkout(name, checkoutOptions);
			}

			return this.ok(undefined);
		} catch (error) {
			return this.err(toGitError(error, `git checkout ${name}`));
		}
	}

	/**
	 * Delete a branch.
	 */
	async deleteBranch(
		options: DeleteBranchOptions,
		config?: GitConfig,
	): Promise<GitResult<void>> {
		const { name, force } = options;

		if (!name || !name.trim()) {
			return this.err(
				createGitError(
					"InvalidBranchName",
					"Branch name is required",
					"git branch",
				),
			);
		}

		try {
			const git = createGit(config?.cwd, config);
			await git.deleteLocalBranch(name, force);
			return this.ok(undefined);
		} catch (error) {
			return this.err(
				toGitError(error, `git branch -${force ? "D" : "d"} ${name}`),
			);
		}
	}

	/**
	 * List branches.
	 */
	async listBranches(
		options?: ListBranchesOptions,
		config?: GitConfig,
	): Promise<GitResult<GitBranch[]>> {
		const { remote, all, pattern } = options ?? {};

		try {
			const git = createGit(config?.cwd, config);

			// Build branch command args
			const args: string[] = ["branch", "-v", "--no-abbrev"];

			if (all) {
				args.push("-a");
			} else if (remote) {
				args.push("-r");
			}

			if (pattern) {
				args.push("--list", pattern);
			}

			const output = await git.raw(args);
			const branches: GitBranch[] = [];

			for (const line of output.split("\n").filter((l) => l.trim())) {
				const current = line.startsWith("*");
				const trimmedLine = line.replace(/^\*?\s*/, "");

				// Parse: branch_name commit_hash commit_message
				const parts = trimmedLine.match(/^(\S+)\s+([a-f0-9]+)\s*(.*)$/);
				if (parts) {
					const [, branchName, commit, message] = parts;
					branches.push({
						name: branchName,
						current,
						commit,
						message: message || undefined,
					});
				}
			}

			return this.ok(branches);
		} catch (error) {
			return this.err(toGitError(error, "git branch"));
		}
	}

	// =============================================================================
	// Commit Operations
	// =============================================================================

	/**
	 * Create a commit.
	 */
	async commit(
		options: CommitOptions,
		config?: GitConfig,
	): Promise<GitResult<string>> {
		const { message, allowEmpty, amend, author, email } = options;

		if (!message || !message.trim()) {
			return this.err(
				createGitError(
					"CommandFailed",
					"Commit message is required",
					"git commit",
				),
			);
		}

		try {
			const git = createGit(config?.cwd, config);

			let finalMessage = message;
			if (config?.messagePrefix) {
				finalMessage = `${config.messagePrefix}${message}`;
			}

			// Build commit command args
			const args: string[] = ["commit", "-m", finalMessage];

			if (allowEmpty) {
				args.push("--allow-empty");
			}

			if (amend) {
				args.push("--amend");
			}

			if (author || email) {
				const authorName = author ?? config?.authorName ?? "";
				const authorEmail = email ?? config?.authorEmail ?? "";
				if (authorName && authorEmail) {
					args.push("--author", `${authorName} <${authorEmail}>`);
				}
			}

			await git.raw(args);

			// Get the commit hash
			const hash = await git.revparse(["HEAD"]);
			return this.ok(hash.trim());
		} catch (error) {
			return this.err(toGitError(error, "git commit"));
		}
	}

	/**
	 * Stage files for commit.
	 */
	async add(options: AddOptions, config?: GitConfig): Promise<GitResult<void>> {
		const { paths, all, force } = options;

		try {
			const git = createGit(config?.cwd, config);

			if (all) {
				await git.add("-A");
			} else if (paths && paths.length > 0) {
				if (force) {
					await git.raw(["add", "-f", "--", ...paths]);
				} else {
					await git.add(paths);
				}
			} else {
				await git.add(".");
			}

			return this.ok(undefined);
		} catch (error) {
			return this.err(toGitError(error, "git add"));
		}
	}

	/**
	 * Unstage files or reset the repository.
	 */
	async reset(
		options?: ResetOptions,
		config?: GitConfig,
	): Promise<GitResult<void>> {
		const { paths, mode, target } = options ?? {};

		try {
			const git = createGit(config?.cwd, config);

			const args: string[] = ["reset"];

			if (mode) {
				args.push(`--${mode}`);
			}

			if (target) {
				args.push(target);
			}

			if (paths && paths.length > 0) {
				args.push("--", ...paths);
			}

			await git.raw(args);
			return this.ok(undefined);
		} catch (error) {
			return this.err(toGitError(error, "git reset"));
		}
	}

	// =============================================================================
	// Diff Operations
	// =============================================================================

	/**
	 * Get a diff of changes.
	 */
	async diff(
		options?: DiffOptions,
		config?: GitConfig,
	): Promise<GitResult<GitDiff>> {
		const { staged, ref, refTo, nameOnly, stat, paths } = options ?? {};

		try {
			const git = createGit(config?.cwd, config);

			const diffOptions: string[] = [];

			if (nameOnly) {
				diffOptions.push("--name-only");
			} else {
				diffOptions.push("--numstat");
			}

			if (staged) {
				diffOptions.push("--cached");
			}

			if (ref) {
				if (refTo) {
					diffOptions.push(`${ref}...${refTo}`);
				} else {
					diffOptions.push(ref);
				}
			}

			if (paths && paths.length > 0) {
				diffOptions.push("--", ...paths);
			}

			const output = await git.diff(diffOptions);

			if (nameOnly) {
				const filePaths = output
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
			const files: GitDiffFile[] = [];
			let totalAdditions = 0;
			let totalDeletions = 0;

			for (const line of output.split("\n").filter((l) => l.trim())) {
				const parts = line.split("\t");
				if (parts.length >= 3) {
					const [addStr, delStr, ...pathParts] = parts;
					let path = pathParts.join("\t");
					let originalPath: string | undefined;
					let type: GitDiffFile["type"] = "modified";

					const binary = addStr === "-" && delStr === "-";
					const additions = binary ? 0 : parseInt(addStr, 10);
					const deletions = binary ? 0 : parseInt(delStr, 10);

					// Handle renames
					if (path.includes(" => ")) {
						const renameParts = path.split(" => ");
						if (renameParts.length === 2) {
							if (renameParts[0].includes("{")) {
								const match = path.match(/^(.*)?\{(.*) => (.*)\}(.*)$/);
								if (match) {
									const [, prefix, oldPart, newPart, suffix] = match;
									originalPath = (prefix || "") + oldPart + (suffix || "");
									path = (prefix || "") + newPart + (suffix || "");
								}
							} else {
								originalPath = renameParts[0];
								path = renameParts[1];
							}
							type = "renamed";
						}
					}

					if (type === "modified") {
						if (additions > 0 && deletions === 0) {
							type = "added";
						} else if (additions === 0 && deletions > 0) {
							type = "deleted";
						}
					}

					totalAdditions += additions;
					totalDeletions += deletions;

					files.push({
						path,
						type,
						originalPath,
						additions,
						deletions,
						binary,
					});
				}
			}

			const diff: GitDiff = {
				files,
				totalAdditions,
				totalDeletions,
			};

			if (stat) {
				const statOptions = [
					...diffOptions.filter((o) => o !== "--numstat"),
					"--stat",
				];
				const statOutput = await git.diff(statOptions);
				diff.raw = statOutput;
			}

			return this.ok(diff);
		} catch (error) {
			return this.err(toGitError(error, "git diff"));
		}
	}

	/**
	 * Get raw patch diff from a base branch to HEAD.
	 */
	async diffPatch(
		options: DiffPatchOptions,
		config?: GitConfig,
	): Promise<GitResult<DiffPatchResult>> {
		const { baseBranch, commitLimit, paths } = options;

		try {
			const git = createGit(config?.cwd, config);

			// Find merge base
			const mergeBase = await git.raw(["merge-base", baseBranch, "HEAD"]);
			const mergeBaseHash = mergeBase.trim();

			// Determine diff range
			let diffRange = mergeBaseHash;

			if (commitLimit && commitLimit > 0) {
				try {
					const nCommitsBack = await git.revparse([`HEAD~${commitLimit - 1}`]);
					const nCommitsBackHash = nCommitsBack.trim();

					// Check which is older
					try {
						await git.raw([
							"merge-base",
							"--is-ancestor",
							mergeBaseHash,
							nCommitsBackHash,
						]);
						diffRange = nCommitsBackHash;
					} catch {
						// mergeBase is not ancestor, keep using it
					}
				} catch {
					// Not enough commits, use merge base
				}
			}

			// Get patch
			const patchArgs: string[] = [diffRange, "HEAD"];
			if (paths && paths.length > 0) {
				patchArgs.push("--", ...paths);
			}

			const patch = await git.diff(patchArgs);

			// Get stats
			const statArgs: string[] = ["--stat", diffRange, "HEAD"];
			if (paths && paths.length > 0) {
				statArgs.push("--", ...paths);
			}

			const statOutput = await git.diff(statArgs);

			// Parse stats
			let filesChanged = 0;
			let additions = 0;
			let deletions = 0;

			if (statOutput) {
				const statLines = statOutput.trim().split("\n");
				const summaryLine = statLines[statLines.length - 1];

				const filesMatch = summaryLine.match(/(\d+)\s+files?\s+changed/);
				const addMatch = summaryLine.match(/(\d+)\s+insertions?\(\+\)/);
				const delMatch = summaryLine.match(/(\d+)\s+deletions?\(-\)/);

				if (filesMatch) filesChanged = parseInt(filesMatch[1], 10);
				if (addMatch) additions = parseInt(addMatch[1], 10);
				if (delMatch) deletions = parseInt(delMatch[1], 10);
			}

			return this.ok({
				patch,
				filesChanged,
				additions,
				deletions,
				hasChanges: patch.length > 0,
			});
		} catch (error) {
			return this.err(toGitError(error, "git diff"));
		}
	}

	// =============================================================================
	// Log Operations
	// =============================================================================

	/**
	 * Get commit log history.
	 */
	async log(
		options?: LogOptions,
		config?: GitConfig,
	): Promise<GitResult<GitCommit[]>> {
		const { limit, from, to, author, grep, since, until, paths } =
			options ?? {};

		try {
			const git = createGit(config?.cwd, config);

			const logOptions: Record<string, string | number | boolean | undefined> =
				{};

			const maxCount = limit ?? 50;
			logOptions.maxCount = maxCount;

			if (from && to) {
				logOptions.from = from;
				logOptions.to = to;
			} else if (from) {
				logOptions.from = from;
			} else if (to) {
				logOptions.to = to;
			}

			if (author) {
				logOptions["--author"] = author;
			}

			if (grep) {
				logOptions["--grep"] = grep;
			}

			if (since) {
				const sinceStr = since instanceof Date ? since.toISOString() : since;
				logOptions["--since"] = sinceStr;
			}

			if (until) {
				const untilStr = until instanceof Date ? until.toISOString() : until;
				logOptions["--until"] = untilStr;
			}

			if (paths && paths.length > 0) {
				logOptions.file = paths.join(" ");
			}

			const log = await git.log(logOptions);

			const commits: GitCommit[] = log.all.map((entry) => ({
				hash: entry.hash,
				shortHash: entry.hash.substring(0, 7),
				author: entry.author_name,
				email: entry.author_email,
				date: new Date(entry.date),
				subject: entry.message,
				body: entry.body || undefined,
			}));

			return this.ok(commits);
		} catch (error) {
			return this.err(toGitError(error, "git log"));
		}
	}

	// =============================================================================
	// Worktree Operations
	// =============================================================================

	/**
	 * Add a new worktree.
	 */
	async worktreeAdd(
		options: WorktreeAddOptions,
		config?: GitConfig,
	): Promise<WorktreeAddResult> {
		const { path: worktreePath, branch, newBranch, force, detach } = options;
		const cwd = config?.cwd ?? process.cwd();

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

		try {
			const git = createGit(config?.cwd, config);

			// Get git repository root and normalize paths
			const gitRootOutput = await git.revparse(["--show-toplevel"]);
			const normalizedCwd = realpathSync(cwd);
			const gitRoot = realpathSync(gitRootOutput.trim());

			// Compute absolute path
			const resolvedPath = resolve(cwd, worktreePath);
			const parentDir = dirname(resolvedPath);
			const worktreeName = resolvedPath.slice(parentDir.length + 1);

			// Ensure parent exists before trying to normalize
			let normalizedParent: string;
			try {
				normalizedParent = realpathSync(parentDir);
			} catch {
				// Parent doesn't exist, use resolved path as-is
				normalizedParent = parentDir;
			}
			const absolutePath = resolve(normalizedParent, worktreeName);

			// Compute relative paths
			const relativePath = relative(normalizedCwd, absolutePath);
			const relativeToGitRoot = relative(gitRoot, absolutePath);

			// Build worktree add command
			const args: string[] = ["worktree", "add"];

			if (force) {
				args.push("--force");
			}

			if (detach) {
				args.push("--detach");
			}

			if (newBranch) {
				args.push("-b", newBranch);
			}

			args.push(worktreePath);

			if (branch && !newBranch) {
				args.push(branch);
			}

			await git.raw(args);

			// Wait for worktree to be fully created
			const maxRetries = 20;
			const retryDelayMs = 50;

			for (let i = 0; i < maxRetries; i++) {
				// Check if the worktree directory and .git file exist
				const worktreeExists = existsSync(absolutePath);
				const gitFileExists = existsSync(resolve(absolutePath, ".git"));

				if (worktreeExists && gitFileExists) {
					return {
						absolutePath,
						relativePath,
						relativeToGitRoot,
						result: this.ok(undefined),
					};
				}

				// Wait before retrying
				await new Promise((r) => setTimeout(r, retryDelayMs));
			}

			return {
				absolutePath,
				relativePath,
				relativeToGitRoot,
				result: this.err(
					createGitError(
						"CommandFailed",
						`Worktree created but directory not ready after ${maxRetries * retryDelayMs}ms: ${absolutePath}`,
						`git ${args.join(" ")}`,
					),
				),
			};
		} catch (error) {
			const resolvedPath = resolve(cwd, worktreePath);
			return {
				absolutePath: resolvedPath,
				relativePath: relative(cwd, resolvedPath),
				relativeToGitRoot: "",
				result: this.err(toGitError(error, "git worktree add")),
			};
		}
	}

	/**
	 * Remove a worktree.
	 */
	async worktreeRemove(
		options: WorktreeRemoveOptions,
		config?: GitConfig,
	): Promise<GitResult<void>> {
		const { path, force } = options;

		if (!path || !path.trim()) {
			return this.err(
				createGitError(
					"CommandFailed",
					"Worktree path is required",
					"git worktree remove",
				),
			);
		}

		try {
			const git = createGit(config?.cwd, config);

			const args: string[] = ["worktree", "remove"];

			if (force) {
				args.push("--force");
			}

			args.push(path);

			await git.raw(args);
			return this.ok(undefined);
		} catch (error) {
			return this.err(toGitError(error, `git worktree remove ${path}`));
		}
	}

	/**
	 * List all worktrees.
	 */
	async worktreeList(config?: GitConfig): Promise<GitResult<GitWorktree[]>> {
		try {
			const git = createGit(config?.cwd, config);
			const output = await git.raw(["worktree", "list", "--porcelain"]);
			return this.ok(parseWorktreeListOutput(output));
		} catch (error) {
			return this.err(toGitError(error, "git worktree list"));
		}
	}

	// =============================================================================
	// Stash Operations
	// =============================================================================

	/**
	 * Create a stash.
	 */
	async stash(
		options?: StashOptions,
		config?: GitConfig,
	): Promise<GitResult<void>> {
		const { message, includeUntracked, includeIgnored, keepIndex } =
			options ?? {};

		try {
			const git = createGit(config?.cwd, config);

			const args: string[] = ["push"];

			if (message) {
				args.push("-m", message);
			}

			if (includeUntracked) {
				args.push("--include-untracked");
			}

			if (includeIgnored) {
				args.push("--all");
			}

			if (keepIndex) {
				args.push("--keep-index");
			}

			await git.stash(args);
			return this.ok(undefined);
		} catch (error) {
			return this.err(toGitError(error, "git stash push"));
		}
	}

	/**
	 * Pop a stash (apply and remove).
	 */
	async stashPop(
		options?: StashPopOptions,
		config?: GitConfig,
	): Promise<GitResult<void>> {
		const { index, restoreIndex } = options ?? {};

		try {
			const git = createGit(config?.cwd, config);

			const args: string[] = ["pop"];

			if (restoreIndex) {
				args.push("--index");
			}

			if (index !== undefined) {
				args.push(`stash@{${index}}`);
			}

			await git.stash(args);
			return this.ok(undefined);
		} catch (error) {
			return this.err(toGitError(error, "git stash pop"));
		}
	}

	/**
	 * List all stashes.
	 */
	async stashList(config?: GitConfig): Promise<GitResult<GitStashEntry[]>> {
		try {
			const git = createGit(config?.cwd, config);
			const result = await git.stash(["list"]);
			return this.ok(parseStashListOutput(result));
		} catch (error) {
			return this.err(toGitError(error, "git stash list"));
		}
	}
}
