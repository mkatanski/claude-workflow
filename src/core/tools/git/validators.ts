/**
 * Git validators and safety checks.
 *
 * Provides validation utilities for branch names, ref formats,
 * protected branch checks, and other safety validations.
 */

import type { GitError } from "./types.ts";
import { createGitError } from "./types.ts";

// =============================================================================
// Protected Branches
// =============================================================================

/**
 * Default list of protected branch names.
 * These branches require force flag for deletion.
 */
export const PROTECTED_BRANCHES = [
	"main",
	"master",
	"develop",
	"development",
	"production",
	"staging",
	"release",
] as const;

/**
 * Type for protected branch names.
 */
export type ProtectedBranchName = (typeof PROTECTED_BRANCHES)[number];

/**
 * Check if a branch name is in the protected list.
 *
 * @param name - Branch name to check
 * @param additionalProtected - Additional protected branch patterns
 * @returns True if the branch is protected
 *
 * @example
 * ```typescript
 * isProtectedBranch("main");           // true
 * isProtectedBranch("feature/foo");    // false
 * isProtectedBranch("prod", ["prod"]); // true
 * ```
 */
export function isProtectedBranch(
	name: string,
	additionalProtected?: readonly string[],
): boolean {
	const protectedList: readonly string[] = additionalProtected
		? [...PROTECTED_BRANCHES, ...additionalProtected]
		: PROTECTED_BRANCHES;

	const normalizedName = name.toLowerCase();

	for (const protected_ of protectedList) {
		if (normalizedName === protected_.toLowerCase()) {
			return true;
		}
	}

	return false;
}

// =============================================================================
// Branch Name Validation
// =============================================================================

/**
 * Git branch name validation rules (from git-check-ref-format).
 *
 * A branch name:
 * - Cannot be empty
 * - Cannot start with a dot (.)
 * - Cannot end with a dot (.)
 * - Cannot contain double dots (..)
 * - Cannot contain tilde (~)
 * - Cannot contain caret (^)
 * - Cannot contain colon (:)
 * - Cannot contain space or control characters
 * - Cannot contain question mark (?)
 * - Cannot contain asterisk (*)
 * - Cannot contain open bracket ([)
 * - Cannot contain backslash (\)
 * - Cannot end with .lock
 * - Cannot contain @{
 * - Cannot be the single character @
 * - Cannot start with hyphen (-)
 * - Cannot contain consecutive slashes (//)
 * - Cannot end with a slash (/)
 */

/**
 * Invalid patterns for branch names.
 */
const INVALID_BRANCH_PATTERNS: readonly RegExp[] = [
	/^\./, // Starts with dot
	/\.$/, // Ends with dot
	/\.\./, // Contains double dots
	/~/, // Contains tilde
	/\^/, // Contains caret
	/:/, // Contains colon
	/[\x00-\x1f\x7f]/, // Contains control characters
	/\s/, // Contains whitespace
	/\?/, // Contains question mark
	/\*/, // Contains asterisk
	/\[/, // Contains open bracket
	/\\/, // Contains backslash
	/\.lock$/, // Ends with .lock
	/@\{/, // Contains @{
	/^@$/, // Is exactly @
	/^-/, // Starts with hyphen
	/\/\//, // Contains consecutive slashes
	/\/$/, // Ends with slash
	/^\//, // Starts with slash
];

/**
 * Validation result for branch names.
 */
export interface BranchNameValidation {
	/** Whether the name is valid */
	valid: boolean;
	/** Error message if invalid */
	error?: string;
}

/**
 * Validate a branch name according to Git conventions.
 *
 * @param name - Branch name to validate
 * @returns Validation result with error message if invalid
 *
 * @example
 * ```typescript
 * validateBranchName("feature/my-feature");  // { valid: true }
 * validateBranchName("..invalid");           // { valid: false, error: "..." }
 * validateBranchName("my feature");          // { valid: false, error: "..." }
 * ```
 */
export function validateBranchName(name: string): BranchNameValidation {
	// Empty check
	if (!name || name.length === 0) {
		return { valid: false, error: "Branch name cannot be empty" };
	}

	// Check for invalid patterns
	for (const pattern of INVALID_BRANCH_PATTERNS) {
		if (pattern.test(name)) {
			return {
				valid: false,
				error: getPatternErrorMessage(pattern, name),
			};
		}
	}

	// All checks passed
	return { valid: true };
}

/**
 * Get human-readable error message for invalid pattern.
 */
function getPatternErrorMessage(pattern: RegExp, name: string): string {
	const patternStr = pattern.toString();

	if (patternStr.includes("^\\.")) {
		return `Branch name cannot start with a dot: "${name}"`;
	}
	if (patternStr.includes("\\.$")) {
		return `Branch name cannot end with a dot: "${name}"`;
	}
	if (patternStr.includes("\\.\\.\\.")) {
		return `Branch name cannot contain consecutive dots: "${name}"`;
	}
	if (patternStr.includes("~")) {
		return `Branch name cannot contain tilde (~): "${name}"`;
	}
	if (patternStr.includes("\\^")) {
		return `Branch name cannot contain caret (^): "${name}"`;
	}
	if (patternStr.includes(":")) {
		return `Branch name cannot contain colon (:): "${name}"`;
	}
	if (patternStr.includes("\\x00")) {
		return `Branch name cannot contain control characters: "${name}"`;
	}
	if (patternStr.includes("\\s")) {
		return `Branch name cannot contain whitespace: "${name}"`;
	}
	if (patternStr.includes("\\?")) {
		return `Branch name cannot contain question mark (?): "${name}"`;
	}
	if (patternStr.includes("\\*")) {
		return `Branch name cannot contain asterisk (*): "${name}"`;
	}
	if (patternStr.includes("\\[")) {
		return `Branch name cannot contain open bracket ([): "${name}"`;
	}
	if (patternStr.includes("\\\\")) {
		return `Branch name cannot contain backslash (\\): "${name}"`;
	}
	if (patternStr.includes("\\.lock$")) {
		return `Branch name cannot end with ".lock": "${name}"`;
	}
	if (patternStr.includes("@\\{")) {
		return `Branch name cannot contain "@{": "${name}"`;
	}
	if (patternStr.includes("^@$")) {
		return `Branch name cannot be "@": "${name}"`;
	}
	if (patternStr.includes("^-")) {
		return `Branch name cannot start with hyphen (-): "${name}"`;
	}
	if (patternStr.includes("\\/\\/")) {
		return `Branch name cannot contain consecutive slashes (//): "${name}"`;
	}
	if (patternStr.includes("\\/$")) {
		return `Branch name cannot end with slash (/): "${name}"`;
	}
	if (patternStr.includes("^\\/")) {
		return `Branch name cannot start with slash (/): "${name}"`;
	}

	return `Invalid branch name: "${name}"`;
}

/**
 * Create a GitError for invalid branch name.
 *
 * @param name - Invalid branch name
 * @param reason - Reason for invalidity
 * @returns GitError of type InvalidBranchName
 */
export function createInvalidBranchNameError(
	name: string,
	reason?: string,
): GitError {
	const message = reason ?? `Invalid branch name: "${name}"`;
	return createGitError("InvalidBranchName", message);
}

/**
 * Create a GitError for protected branch.
 *
 * @param name - Protected branch name
 * @param operation - Operation that was attempted
 * @returns GitError of type ProtectedBranch
 */
export function createProtectedBranchError(
	name: string,
	operation: string = "delete",
): GitError {
	return createGitError(
		"ProtectedBranch",
		`Cannot ${operation} protected branch "${name}" without force flag`,
	);
}

// =============================================================================
// Ref Format Validation
// =============================================================================

/**
 * Invalid patterns for ref names.
 * Similar to branch names but allows refs/heads/, refs/tags/, etc.
 */
const INVALID_REF_PATTERNS: readonly RegExp[] = [
	/^\./, // Starts with dot
	/\.$/, // Ends with dot
	/\.\./, // Contains double dots
	/~/, // Contains tilde
	/\^/, // Contains caret (as part of name, not refspec)
	/[\x00-\x1f\x7f]/, // Contains control characters
	/\s/, // Contains whitespace
	/\?/, // Contains question mark
	/\*/, // Contains asterisk
	/\[/, // Contains open bracket
	/\\/, // Contains backslash
	/\.lock$/, // Ends with .lock
	/@\{/, // Contains @{
	/\/\//, // Contains consecutive slashes
	/\/$/, // Ends with slash
];

/**
 * Validation result for ref formats.
 */
export interface RefFormatValidation {
	/** Whether the ref is valid */
	valid: boolean;
	/** Error message if invalid */
	error?: string;
}

/**
 * Validate a Git ref format.
 *
 * @param ref - Ref string to validate (commit hash, branch, tag, etc.)
 * @returns Validation result
 *
 * @example
 * ```typescript
 * validateRefFormat("HEAD");                    // { valid: true }
 * validateRefFormat("refs/heads/main");         // { valid: true }
 * validateRefFormat("abc1234");                 // { valid: true }
 * validateRefFormat("my..ref");                 // { valid: false }
 * ```
 */
export function validateRefFormat(ref: string): RefFormatValidation {
	// Empty check
	if (!ref || ref.length === 0) {
		return { valid: false, error: "Ref cannot be empty" };
	}

	// HEAD is always valid
	if (ref === "HEAD") {
		return { valid: true };
	}

	// Commit hashes (hex strings) are valid
	if (/^[0-9a-fA-F]{4,40}$/.test(ref)) {
		return { valid: true };
	}

	// @ is valid (refers to HEAD)
	if (ref === "@") {
		return { valid: true };
	}

	// Check for refspec notation (e.g., branch^, branch~2)
	// These are valid for reading but we strip them for validation
	const cleanRef = ref.replace(/[\^~].*$/, "").replace(/:.*$/, "");

	if (cleanRef.length === 0) {
		return { valid: true }; // Just a modifier like ^, ~1
	}

	// Check for invalid patterns
	for (const pattern of INVALID_REF_PATTERNS) {
		if (pattern.test(cleanRef)) {
			return {
				valid: false,
				error: `Invalid ref format: "${ref}"`,
			};
		}
	}

	return { valid: true };
}

// =============================================================================
// Path Validation
// =============================================================================

/**
 * Validate that a path is safe for worktree operations.
 *
 * @param path - Path to validate
 * @returns Validation result
 */
export function validateWorktreePath(path: string): {
	valid: boolean;
	error?: string;
} {
	if (!path || path.length === 0) {
		return { valid: false, error: "Path cannot be empty" };
	}

	// Check for path traversal attempts
	if (path.includes("..")) {
		return { valid: false, error: "Path cannot contain '..' traversal" };
	}

	// Check for null bytes
	if (path.includes("\x00")) {
		return { valid: false, error: "Path cannot contain null bytes" };
	}

	return { valid: true };
}

// =============================================================================
// Commit Message Validation
// =============================================================================

/**
 * Validate a commit message.
 *
 * @param message - Commit message to validate
 * @returns Validation result
 */
export function validateCommitMessage(message: string): {
	valid: boolean;
	error?: string;
} {
	if (!message || message.trim().length === 0) {
		return { valid: false, error: "Commit message cannot be empty" };
	}

	return { valid: true };
}

// =============================================================================
// Safety Helpers
// =============================================================================

/**
 * Check if an operation would be destructive.
 *
 * @param operation - Operation name
 * @returns True if the operation is destructive
 */
export function isDestructiveOperation(operation: string): boolean {
	const destructiveOps = [
		"deleteBranch",
		"reset",
		"stashPop",
		"worktreeRemove",
	];
	return destructiveOps.includes(operation);
}

/**
 * Create a warning message for destructive operations.
 *
 * @param operation - Operation name
 * @param target - Target of the operation
 * @returns Warning message
 */
export function createDestructiveWarning(
	operation: string,
	target: string,
): string {
	const warnings: Record<string, string> = {
		deleteBranch: `Deleting branch "${target}" cannot be undone without reflog`,
		reset: `Reset operation may discard uncommitted changes`,
		stashPop: `Stash will be removed after applying`,
		worktreeRemove: `Worktree "${target}" will be removed from disk`,
	};

	return warnings[operation] ?? `Operation "${operation}" is destructive`;
}

/**
 * Sanitize user input for use in Git commands.
 * Prevents command injection.
 *
 * @param input - User input to sanitize
 * @returns Sanitized input safe for command execution
 */
export function sanitizeForCommand(input: string): string {
	// Remove null bytes
	let sanitized = input.replace(/\x00/g, "");

	// Remove or escape shell metacharacters
	// Note: When using Bun.spawn with array arguments, this is less critical
	// but we still sanitize for safety
	sanitized = sanitized.replace(/[`$(){}|;&<>!]/g, "");

	return sanitized;
}
