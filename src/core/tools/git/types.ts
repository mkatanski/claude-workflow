/**
 * Git tool types and interfaces.
 *
 * Provides type definitions for Git operations, error handling,
 * configuration, and result types.
 */

import type { Result } from "../../utils/result/result.ts";

// =============================================================================
// Error Types
// =============================================================================

/**
 * Git error type discriminator.
 */
export type GitErrorType =
	| "NotARepository"
	| "BranchExists"
	| "BranchNotFound"
	| "MergeConflict"
	| "DirtyWorkingTree"
	| "InvalidBranchName"
	| "ProtectedBranch"
	| "WorktreeExists"
	| "WorktreeNotFound"
	| "StashNotFound"
	| "CommandFailed";

/**
 * Git error with type discrimination.
 */
export interface GitError {
	readonly type: GitErrorType;
	readonly message: string;
	readonly command?: string;
	readonly exitCode?: number;
}

/**
 * Create a GitError.
 */
export function createGitError(
	type: GitErrorType,
	message: string,
	command?: string,
	exitCode?: number,
): GitError {
	return { type, message, command, exitCode };
}

/**
 * Git operation result type alias.
 */
export type GitResult<T> = Result<T, GitError>;

// =============================================================================
// Configuration
// =============================================================================

/**
 * Git tool configuration.
 */
export interface GitConfig {
	/** Working directory for Git operations */
	cwd?: string;
	/** Default author name for commits */
	authorName?: string;
	/** Default author email for commits */
	authorEmail?: string;
	/** Prefix to prepend to commit messages */
	messagePrefix?: string;
	/** Automatically stage all changes before commit */
	autoStage?: boolean;
	/** Human-readable label for event display */
	label?: string;
}

// =============================================================================
// Status Types
// =============================================================================

/**
 * File status in Git working tree.
 */
export interface GitFileStatus {
	/** File path relative to repository root */
	path: string;
	/** Index status (staged) */
	index: string;
	/** Working tree status (unstaged) */
	workingTree: string;
	/** Original path for renamed files */
	originalPath?: string;
}

/**
 * Repository status summary.
 */
export interface GitStatus {
	/** Current branch name */
	branch: string;
	/** Upstream tracking branch */
	upstream?: string;
	/** Number of commits ahead of upstream */
	ahead: number;
	/** Number of commits behind upstream */
	behind: number;
	/** Staged files */
	staged: GitFileStatus[];
	/** Unstaged modified files */
	unstaged: GitFileStatus[];
	/** Untracked files */
	untracked: string[];
	/** Whether the working tree is clean */
	isClean: boolean;
}

/**
 * Remote repository information.
 */
export interface GitRemote {
	/** Remote name */
	name: string;
	/** Fetch URL */
	fetchUrl: string;
	/** Push URL */
	pushUrl: string;
}

// =============================================================================
// Branch Types
// =============================================================================

/**
 * Branch information.
 */
export interface GitBranch {
	/** Branch name */
	name: string;
	/** Whether this is the current branch */
	current: boolean;
	/** Commit hash the branch points to */
	commit: string;
	/** Upstream tracking branch */
	upstream?: string;
	/** Number of commits ahead of upstream */
	ahead?: number;
	/** Number of commits behind upstream */
	behind?: number;
	/** Last commit message */
	message?: string;
}

/**
 * Options for creating a branch.
 */
export interface CreateBranchOptions {
	/** Branch name to create */
	name: string;
	/** Starting point (commit, branch, or tag) */
	from?: string;
	/** Switch to the new branch after creation */
	checkout?: boolean;
	/** Human-readable label for event display */
	label?: string;
}

/**
 * Options for switching branches.
 */
export interface SwitchBranchOptions {
	/** Branch name to switch to */
	name: string;
	/** Create the branch if it doesn't exist */
	create?: boolean;
	/** Force switch (discarding local changes) */
	force?: boolean;
	/** Human-readable label for event display */
	label?: string;
}

/**
 * Options for deleting a branch.
 */
export interface DeleteBranchOptions {
	/** Branch name to delete */
	name: string;
	/** Force delete (even if not merged) */
	force?: boolean;
	/** Human-readable label for event display */
	label?: string;
}

/**
 * Options for listing branches.
 */
export interface ListBranchesOptions {
	/** Include remote branches */
	remote?: boolean;
	/** Include all branches (local and remote) */
	all?: boolean;
	/** Filter pattern (glob) */
	pattern?: string;
	/** Human-readable label for event display */
	label?: string;
}

// =============================================================================
// Commit Types
// =============================================================================

/**
 * Commit information.
 */
export interface GitCommit {
	/** Full commit hash */
	hash: string;
	/** Short commit hash (7 characters) */
	shortHash: string;
	/** Author name */
	author: string;
	/** Author email */
	email: string;
	/** Commit date */
	date: Date;
	/** Commit message subject (first line) */
	subject: string;
	/** Commit message body */
	body?: string;
	/** Parent commit hashes */
	parents?: string[];
}

/**
 * Options for creating a commit.
 */
export interface CommitOptions {
	/** Commit message */
	message: string;
	/** Allow empty commit (no changes) */
	allowEmpty?: boolean;
	/** Amend the previous commit */
	amend?: boolean;
	/** Override author name */
	author?: string;
	/** Override author email */
	email?: string;
	/** Human-readable label for event display */
	label?: string;
}

/**
 * Options for staging files.
 */
export interface AddOptions {
	/** File paths to stage (defaults to all) */
	paths?: string[];
	/** Stage all changes including untracked files */
	all?: boolean;
	/** Force add ignored files */
	force?: boolean;
	/** Human-readable label for event display */
	label?: string;
}

/**
 * Options for unstaging files.
 */
export interface ResetOptions {
	/** File paths to unstage (defaults to all) */
	paths?: string[];
	/** Reset mode */
	mode?: "soft" | "mixed" | "hard";
	/** Target commit for reset */
	target?: string;
	/** Human-readable label for event display */
	label?: string;
}

// =============================================================================
// Diff Types
// =============================================================================

/**
 * Individual file change in a diff.
 */
export interface GitDiffFile {
	/** File path */
	path: string;
	/** Change type */
	type: "added" | "deleted" | "modified" | "renamed" | "copied";
	/** Original path for renamed/copied files */
	originalPath?: string;
	/** Lines added */
	additions: number;
	/** Lines deleted */
	deletions: number;
	/** Binary file flag */
	binary?: boolean;
}

/**
 * Diff result.
 */
export interface GitDiff {
	/** List of changed files */
	files: GitDiffFile[];
	/** Total lines added */
	totalAdditions: number;
	/** Total lines deleted */
	totalDeletions: number;
	/** Raw diff output (when requested) */
	raw?: string;
}

/**
 * Options for diff operations.
 */
export interface DiffOptions {
	/** Show staged changes only */
	staged?: boolean;
	/** Compare to specific ref (commit, branch) */
	ref?: string;
	/** Compare between two refs */
	refTo?: string;
	/** Show only file names */
	nameOnly?: boolean;
	/** Show stat summary */
	stat?: boolean;
	/** Filter to specific paths */
	paths?: string[];
	/** Human-readable label for event display */
	label?: string;
}

// =============================================================================
// Log Types
// =============================================================================

/**
 * Options for log operations.
 */
export interface LogOptions {
	/** Maximum number of commits to return */
	limit?: number;
	/** Start from specific ref */
	from?: string;
	/** End at specific ref */
	to?: string;
	/** Filter by author */
	author?: string;
	/** Filter by commit message (grep) */
	grep?: string;
	/** Only include commits after this date */
	since?: string | Date;
	/** Only include commits before this date */
	until?: string | Date;
	/** Filter to specific paths */
	paths?: string[];
	/** Human-readable label for event display */
	label?: string;
}

// =============================================================================
// Worktree Types
// =============================================================================

/**
 * Worktree information.
 */
export interface GitWorktree {
	/** Worktree path */
	path: string;
	/** Commit hash HEAD points to */
	head: string;
	/** Branch name (if any) */
	branch?: string;
	/** Whether this is the main worktree */
	main: boolean;
	/** Whether the worktree is bare */
	bare: boolean;
	/** Whether HEAD is detached */
	detached: boolean;
	/** Whether the worktree is locked */
	locked: boolean;
	/** Lock reason (if locked) */
	lockReason?: string;
	/** Whether the worktree is prunable */
	prunable: boolean;
}

/**
 * Options for adding a worktree.
 */
export interface WorktreeAddOptions {
	/** Path for the new worktree */
	path: string;
	/** Branch to checkout (or create) */
	branch?: string;
	/** Create new branch from this ref */
	newBranch?: string;
	/** Force creation (remove existing if needed) */
	force?: boolean;
	/** Detach HEAD (no branch) */
	detach?: boolean;
	/** Human-readable label for event display */
	label?: string;
}

/**
 * Options for removing a worktree.
 */
export interface WorktreeRemoveOptions {
	/** Path of the worktree to remove */
	path: string;
	/** Force removal (even with uncommitted changes) */
	force?: boolean;
	/** Human-readable label for event display */
	label?: string;
}

// =============================================================================
// Stash Types
// =============================================================================

/**
 * Stash entry information.
 */
export interface GitStashEntry {
	/** Stash index (0 = most recent) */
	index: number;
	/** Stash reference (e.g., "stash@{0}") */
	ref: string;
	/** Branch the stash was created from */
	branch: string;
	/** Stash message */
	message: string;
	/** Creation date */
	date: Date;
}

/**
 * Options for creating a stash.
 */
export interface StashOptions {
	/** Stash message */
	message?: string;
	/** Include untracked files */
	includeUntracked?: boolean;
	/** Include ignored files */
	includeIgnored?: boolean;
	/** Keep index (only stash working tree) */
	keepIndex?: boolean;
	/** Human-readable label for event display */
	label?: string;
}

/**
 * Options for applying/popping a stash.
 */
export interface StashPopOptions {
	/** Stash index to apply (default: 0) */
	index?: number;
	/** Restore index state */
	restoreIndex?: boolean;
	/** Human-readable label for event display */
	label?: string;
}

// =============================================================================
// Git Operations Interface
// =============================================================================

/**
 * Interface for Git operations.
 * All methods return Result types for proper error handling.
 */
export interface GitOperations {
	// --- Status Operations ---

	/** Get repository status */
	status(config?: GitConfig): Promise<GitResult<GitStatus>>;

	/** Check if directory is a Git repository */
	isRepo(config?: GitConfig): Promise<GitResult<boolean>>;

	/** Get current branch name */
	getBranch(config?: GitConfig): Promise<GitResult<string>>;

	/** Get list of remotes */
	getRemotes(config?: GitConfig): Promise<GitResult<GitRemote[]>>;

	// --- Branch Operations ---

	/** Create a new branch */
	createBranch(
		options: CreateBranchOptions,
		config?: GitConfig,
	): Promise<GitResult<void>>;

	/** Switch to a branch */
	switchBranch(
		options: SwitchBranchOptions,
		config?: GitConfig,
	): Promise<GitResult<void>>;

	/** Delete a branch */
	deleteBranch(
		options: DeleteBranchOptions,
		config?: GitConfig,
	): Promise<GitResult<void>>;

	/** List branches */
	listBranches(
		options?: ListBranchesOptions,
		config?: GitConfig,
	): Promise<GitResult<GitBranch[]>>;

	// --- Commit Operations ---

	/** Create a commit (returns commit hash) */
	commit(
		options: CommitOptions,
		config?: GitConfig,
	): Promise<GitResult<string>>;

	/** Stage files */
	add(options: AddOptions, config?: GitConfig): Promise<GitResult<void>>;

	/** Unstage files or reset */
	reset(options?: ResetOptions, config?: GitConfig): Promise<GitResult<void>>;

	// --- Diff Operations ---

	/** Get diff */
	diff(options?: DiffOptions, config?: GitConfig): Promise<GitResult<GitDiff>>;

	// --- Log Operations ---

	/** Get commit log */
	log(
		options?: LogOptions,
		config?: GitConfig,
	): Promise<GitResult<GitCommit[]>>;

	// --- Worktree Operations ---

	/** Add a worktree */
	worktreeAdd(
		options: WorktreeAddOptions,
		config?: GitConfig,
	): Promise<GitResult<void>>;

	/** Remove a worktree */
	worktreeRemove(
		options: WorktreeRemoveOptions,
		config?: GitConfig,
	): Promise<GitResult<void>>;

	/** List worktrees */
	worktreeList(config?: GitConfig): Promise<GitResult<GitWorktree[]>>;

	// --- Stash Operations ---

	/** Create a stash */
	stash(options?: StashOptions, config?: GitConfig): Promise<GitResult<void>>;

	/** Pop a stash */
	stashPop(
		options?: StashPopOptions,
		config?: GitConfig,
	): Promise<GitResult<void>>;

	/** List stashes */
	stashList(config?: GitConfig): Promise<GitResult<GitStashEntry[]>>;
}
