/**
 * Git tool module.
 *
 * Re-exports all public types, validators, parsers, and the GitTool class
 * for Git repository operations in workflow automation.
 */

// Types and interfaces
export {
	type GitErrorType,
	type GitError,
	createGitError,
	type GitResult,
	type GitConfig,
	type GitFileStatus,
	type GitStatus,
	type GitRemote,
	type GitBranch,
	type CreateBranchOptions,
	type SwitchBranchOptions,
	type DeleteBranchOptions,
	type ListBranchesOptions,
	type GitCommit,
	type CommitOptions,
	type AddOptions,
	type ResetOptions,
	type GitDiffFile,
	type GitDiff,
	type DiffOptions,
	type LogOptions,
	type GitWorktree,
	type WorktreeAddOptions,
	type WorktreeRemoveOptions,
	type WorktreeAddResult,
	type GitStashEntry,
	type StashOptions,
	type StashPopOptions,
	type GitOperations,
} from "./types.ts";

// Validators
export {
	PROTECTED_BRANCHES,
	type ProtectedBranchName,
	isProtectedBranch,
	type BranchNameValidation,
	validateBranchName,
	createInvalidBranchNameError,
	createProtectedBranchError,
	type RefFormatValidation,
	validateRefFormat,
	validateWorktreePath,
	validateCommitMessage,
	isDestructiveOperation,
	createDestructiveWarning,
	sanitizeForCommand,
} from "./validators.ts";

// Parsers
export {
	parseStatusPorcelain,
	LOG_FORMAT,
	parseLogOutput,
	BRANCH_FORMAT,
	parseBranchList,
	parseDiffNumstat,
	parseDiffNameOnly,
	parseDiffNameStatus,
	parseWorktreeList,
	STASH_FORMAT,
	parseStashList,
	parseRemotes,
	GIT_ERROR_PATTERNS,
	detectGitError,
} from "./parsers.ts";

// Main tool class
export { GitTool } from "./GitTool.ts";
