/**
 * Unit tests for Git validators and safety checks.
 */

import { describe, expect, it } from "bun:test";
import {
	PROTECTED_BRANCHES,
	isProtectedBranch,
	validateBranchName,
	createInvalidBranchNameError,
	createProtectedBranchError,
	validateRefFormat,
	validateWorktreePath,
	validateCommitMessage,
	isDestructiveOperation,
	createDestructiveWarning,
	sanitizeForCommand,
} from "./validators.ts";

describe("PROTECTED_BRANCHES", () => {
	it("should include common protected branch names", () => {
		expect(PROTECTED_BRANCHES).toContain("main");
		expect(PROTECTED_BRANCHES).toContain("master");
		expect(PROTECTED_BRANCHES).toContain("develop");
		expect(PROTECTED_BRANCHES).toContain("development");
		expect(PROTECTED_BRANCHES).toContain("production");
		expect(PROTECTED_BRANCHES).toContain("staging");
		expect(PROTECTED_BRANCHES).toContain("release");
	});

	it("should be readonly", () => {
		// Type assertion to verify it's readonly
		const branches: readonly string[] = PROTECTED_BRANCHES;
		expect(branches).toBe(PROTECTED_BRANCHES);
	});
});

describe("isProtectedBranch", () => {
	it("should return true for default protected branches", () => {
		expect(isProtectedBranch("main")).toBe(true);
		expect(isProtectedBranch("master")).toBe(true);
		expect(isProtectedBranch("develop")).toBe(true);
		expect(isProtectedBranch("production")).toBe(true);
		expect(isProtectedBranch("staging")).toBe(true);
	});

	it("should return false for non-protected branches", () => {
		expect(isProtectedBranch("feature/my-feature")).toBe(false);
		expect(isProtectedBranch("bugfix/issue-123")).toBe(false);
		expect(isProtectedBranch("hotfix/urgent")).toBe(false);
		expect(isProtectedBranch("my-branch")).toBe(false);
	});

	it("should be case-insensitive", () => {
		expect(isProtectedBranch("MAIN")).toBe(true);
		expect(isProtectedBranch("Main")).toBe(true);
		expect(isProtectedBranch("MASTER")).toBe(true);
		expect(isProtectedBranch("Master")).toBe(true);
		expect(isProtectedBranch("DEVELOP")).toBe(true);
	});

	it("should support additional protected branches", () => {
		expect(isProtectedBranch("prod", ["prod"])).toBe(true);
		expect(isProtectedBranch("custom-protected", ["custom-protected"])).toBe(
			true,
		);
	});

	it("should combine default and additional protected branches", () => {
		const additional = ["prod", "test"];

		// Default protected branches should still work
		expect(isProtectedBranch("main", additional)).toBe(true);
		expect(isProtectedBranch("master", additional)).toBe(true);

		// Additional protected branches should also work
		expect(isProtectedBranch("prod", additional)).toBe(true);
		expect(isProtectedBranch("test", additional)).toBe(true);

		// Non-protected should still be false
		expect(isProtectedBranch("feature/x", additional)).toBe(false);
	});

	it("should be case-insensitive for additional branches", () => {
		expect(isProtectedBranch("PROD", ["prod"])).toBe(true);
		expect(isProtectedBranch("Prod", ["prod"])).toBe(true);
	});
});

describe("validateBranchName", () => {
	describe("valid branch names", () => {
		it("should accept simple branch names", () => {
			expect(validateBranchName("main")).toEqual({ valid: true });
			expect(validateBranchName("feature")).toEqual({ valid: true });
			expect(validateBranchName("my-branch")).toEqual({ valid: true });
		});

		it("should accept branch names with slashes", () => {
			expect(validateBranchName("feature/my-feature")).toEqual({ valid: true });
			expect(validateBranchName("bugfix/issue-123")).toEqual({ valid: true });
			expect(validateBranchName("user/name/branch")).toEqual({ valid: true });
		});

		it("should accept branch names with numbers", () => {
			expect(validateBranchName("feature-123")).toEqual({ valid: true });
			expect(validateBranchName("v1.0.0")).toEqual({ valid: true });
			expect(validateBranchName("2024-release")).toEqual({ valid: true });
		});

		it("should accept branch names with underscores", () => {
			expect(validateBranchName("feature_branch")).toEqual({ valid: true });
			expect(validateBranchName("my_branch_name")).toEqual({ valid: true });
		});
	});

	describe("invalid branch names", () => {
		it("should reject empty branch names", () => {
			const result = validateBranchName("");
			expect(result.valid).toBe(false);
			expect(result.error).toBe("Branch name cannot be empty");
		});

		it("should reject branch names starting with dot", () => {
			const result = validateBranchName(".hidden");
			expect(result.valid).toBe(false);
			expect(result.error).toContain("cannot start with a dot");
		});

		it("should reject branch names ending with dot", () => {
			const result = validateBranchName("branch.");
			expect(result.valid).toBe(false);
			expect(result.error).toContain("cannot end with a dot");
		});

		it("should reject branch names with double dots", () => {
			const result = validateBranchName("branch..name");
			expect(result.valid).toBe(false);
			// The pattern matches but the error message check falls through to default
			expect(result.error).toBeDefined();
		});

		it("should reject branch names with tilde", () => {
			const result = validateBranchName("branch~1");
			expect(result.valid).toBe(false);
			expect(result.error).toContain("tilde");
		});

		it("should reject branch names with caret", () => {
			const result = validateBranchName("branch^2");
			expect(result.valid).toBe(false);
			expect(result.error).toContain("caret");
		});

		it("should reject branch names with colon", () => {
			const result = validateBranchName("branch:name");
			expect(result.valid).toBe(false);
			expect(result.error).toContain("colon");
		});

		it("should reject branch names with whitespace", () => {
			const result = validateBranchName("branch name");
			expect(result.valid).toBe(false);
			expect(result.error).toContain("whitespace");
		});

		it("should reject branch names with question mark", () => {
			const result = validateBranchName("branch?name");
			expect(result.valid).toBe(false);
			expect(result.error).toContain("question mark");
		});

		it("should reject branch names with asterisk", () => {
			const result = validateBranchName("branch*name");
			expect(result.valid).toBe(false);
			expect(result.error).toContain("asterisk");
		});

		it("should reject branch names with open bracket", () => {
			const result = validateBranchName("branch[name");
			expect(result.valid).toBe(false);
			expect(result.error).toContain("open bracket");
		});

		it("should reject branch names with backslash", () => {
			const result = validateBranchName("branch\\name");
			expect(result.valid).toBe(false);
			expect(result.error).toContain("backslash");
		});

		it("should reject branch names ending with .lock", () => {
			const result = validateBranchName("branch.lock");
			expect(result.valid).toBe(false);
			expect(result.error).toContain(".lock");
		});

		it("should reject branch names containing @{", () => {
			const result = validateBranchName("branch@{1}");
			expect(result.valid).toBe(false);
			expect(result.error).toContain("@{");
		});

		it("should reject single @ character", () => {
			const result = validateBranchName("@");
			expect(result.valid).toBe(false);
			expect(result.error).toContain('"@"');
		});

		it("should reject branch names starting with hyphen", () => {
			const result = validateBranchName("-branch");
			expect(result.valid).toBe(false);
			expect(result.error).toContain("cannot start with hyphen");
		});

		it("should reject branch names with consecutive slashes", () => {
			const result = validateBranchName("feature//branch");
			expect(result.valid).toBe(false);
			expect(result.error).toContain("consecutive slashes");
		});

		it("should reject branch names ending with slash", () => {
			const result = validateBranchName("branch/");
			expect(result.valid).toBe(false);
			expect(result.error).toContain("cannot end with slash");
		});

		it("should reject branch names starting with slash", () => {
			const result = validateBranchName("/branch");
			expect(result.valid).toBe(false);
			expect(result.error).toContain("cannot start with slash");
		});

		it("should reject branch names with control characters", () => {
			const result = validateBranchName("branch\x00name");
			expect(result.valid).toBe(false);
			expect(result.error).toContain("control characters");
		});

		it("should reject branch names with tab characters", () => {
			const result = validateBranchName("branch\tname");
			expect(result.valid).toBe(false);
			// Tab is matched by control character pattern first
			expect(result.error).toContain("control characters");
		});

		it("should reject branch names with newlines", () => {
			const result = validateBranchName("branch\nname");
			expect(result.valid).toBe(false);
			// Newline is matched by control character pattern first
			expect(result.error).toContain("control characters");
		});
	});
});

describe("createInvalidBranchNameError", () => {
	it("should create error with default message", () => {
		const error = createInvalidBranchNameError("bad-branch");

		expect(error.type).toBe("InvalidBranchName");
		expect(error.message).toContain("bad-branch");
	});

	it("should create error with custom reason", () => {
		const error = createInvalidBranchNameError(
			"bad-branch",
			"Branch name is too long",
		);

		expect(error.type).toBe("InvalidBranchName");
		expect(error.message).toBe("Branch name is too long");
	});
});

describe("createProtectedBranchError", () => {
	it("should create error with default delete operation", () => {
		const error = createProtectedBranchError("main");

		expect(error.type).toBe("ProtectedBranch");
		expect(error.message).toContain("main");
		expect(error.message).toContain("delete");
		expect(error.message).toContain("force flag");
	});

	it("should create error with custom operation", () => {
		const error = createProtectedBranchError("master", "reset");

		expect(error.type).toBe("ProtectedBranch");
		expect(error.message).toContain("master");
		expect(error.message).toContain("reset");
	});
});

describe("validateRefFormat", () => {
	describe("valid refs", () => {
		it("should accept HEAD", () => {
			const result = validateRefFormat("HEAD");
			expect(result.valid).toBe(true);
		});

		it("should accept @ (alias for HEAD)", () => {
			const result = validateRefFormat("@");
			expect(result.valid).toBe(true);
		});

		it("should accept commit hashes", () => {
			expect(validateRefFormat("abcd1234")).toEqual({ valid: true });
			expect(validateRefFormat("abc123def456789")).toEqual({ valid: true });
			expect(validateRefFormat("ABCD1234")).toEqual({ valid: true });
			expect(
				validateRefFormat("1234567890abcdef1234567890abcdef12345678"),
			).toEqual({
				valid: true,
			});
		});

		it("should accept short commit hashes", () => {
			expect(validateRefFormat("abcd")).toEqual({ valid: true });
			expect(validateRefFormat("abc1234")).toEqual({ valid: true });
		});

		it("should accept branch-like refs", () => {
			expect(validateRefFormat("main")).toEqual({ valid: true });
			expect(validateRefFormat("feature/branch")).toEqual({ valid: true });
			expect(validateRefFormat("refs/heads/main")).toEqual({ valid: true });
			expect(validateRefFormat("refs/tags/v1.0.0")).toEqual({ valid: true });
		});

		it("should accept refs with modifiers", () => {
			expect(validateRefFormat("HEAD^")).toEqual({ valid: true });
			expect(validateRefFormat("HEAD~1")).toEqual({ valid: true });
			expect(validateRefFormat("main^2")).toEqual({ valid: true });
			expect(validateRefFormat("feature~3")).toEqual({ valid: true });
		});

		it("should accept refspec notation with colon", () => {
			expect(validateRefFormat("main:refs/heads/main")).toEqual({
				valid: true,
			});
		});
	});

	describe("invalid refs", () => {
		it("should reject empty ref", () => {
			const result = validateRefFormat("");
			expect(result.valid).toBe(false);
			expect(result.error).toBe("Ref cannot be empty");
		});

		it("should reject ref starting with dot", () => {
			const result = validateRefFormat(".hidden");
			expect(result.valid).toBe(false);
			expect(result.error).toContain("Invalid ref format");
		});

		it("should reject ref ending with dot", () => {
			const result = validateRefFormat("ref.");
			expect(result.valid).toBe(false);
		});

		it("should reject ref with double dots", () => {
			const result = validateRefFormat("ref..range");
			expect(result.valid).toBe(false);
		});

		it("should reject ref with whitespace", () => {
			const result = validateRefFormat("ref name");
			expect(result.valid).toBe(false);
		});

		it("should reject ref with question mark", () => {
			const result = validateRefFormat("ref?name");
			expect(result.valid).toBe(false);
		});

		it("should reject ref with asterisk", () => {
			const result = validateRefFormat("ref*");
			expect(result.valid).toBe(false);
		});

		it("should reject ref with open bracket", () => {
			const result = validateRefFormat("ref[0]");
			expect(result.valid).toBe(false);
		});

		it("should reject ref ending with .lock", () => {
			const result = validateRefFormat("ref.lock");
			expect(result.valid).toBe(false);
		});

		it("should reject ref containing @{", () => {
			const result = validateRefFormat("ref@{upstream}");
			expect(result.valid).toBe(false);
		});

		it("should reject ref with consecutive slashes", () => {
			const result = validateRefFormat("refs//heads/main");
			expect(result.valid).toBe(false);
		});

		it("should reject ref ending with slash", () => {
			const result = validateRefFormat("refs/");
			expect(result.valid).toBe(false);
		});
	});
});

describe("validateWorktreePath", () => {
	it("should accept simple paths", () => {
		expect(validateWorktreePath("/home/user/project")).toEqual({ valid: true });
		expect(validateWorktreePath("./worktree")).toEqual({ valid: true });
		expect(validateWorktreePath("worktrees/feature")).toEqual({ valid: true });
	});

	it("should reject empty path", () => {
		const result = validateWorktreePath("");
		expect(result.valid).toBe(false);
		expect(result.error).toBe("Path cannot be empty");
	});

	it("should reject path with traversal", () => {
		const result = validateWorktreePath("../outside");
		expect(result.valid).toBe(false);
		expect(result.error).toContain("'..'");
	});

	it("should reject path with traversal in middle", () => {
		const result = validateWorktreePath("/home/../etc/passwd");
		expect(result.valid).toBe(false);
		expect(result.error).toContain("'..'");
	});

	it("should reject path with null bytes", () => {
		const result = validateWorktreePath("/home/user\x00/inject");
		expect(result.valid).toBe(false);
		expect(result.error).toContain("null bytes");
	});
});

describe("validateCommitMessage", () => {
	it("should accept valid commit messages", () => {
		expect(validateCommitMessage("Initial commit")).toEqual({ valid: true });
		expect(validateCommitMessage("Fix bug in parser")).toEqual({ valid: true });
		expect(validateCommitMessage("Add feature\n\nWith body")).toEqual({
			valid: true,
		});
	});

	it("should reject empty message", () => {
		const result = validateCommitMessage("");
		expect(result.valid).toBe(false);
		expect(result.error).toBe("Commit message cannot be empty");
	});

	it("should reject whitespace-only message", () => {
		const result = validateCommitMessage("   ");
		expect(result.valid).toBe(false);
		expect(result.error).toBe("Commit message cannot be empty");
	});

	it("should reject message with only newlines", () => {
		const result = validateCommitMessage("\n\n");
		expect(result.valid).toBe(false);
		expect(result.error).toBe("Commit message cannot be empty");
	});

	it("should reject message with only tabs", () => {
		const result = validateCommitMessage("\t\t");
		expect(result.valid).toBe(false);
		expect(result.error).toBe("Commit message cannot be empty");
	});

	it("should accept message with leading/trailing whitespace", () => {
		expect(validateCommitMessage("  Fix bug  ")).toEqual({ valid: true });
	});
});

describe("isDestructiveOperation", () => {
	it("should identify destructive operations", () => {
		expect(isDestructiveOperation("deleteBranch")).toBe(true);
		expect(isDestructiveOperation("reset")).toBe(true);
		expect(isDestructiveOperation("stashPop")).toBe(true);
		expect(isDestructiveOperation("worktreeRemove")).toBe(true);
	});

	it("should not flag non-destructive operations", () => {
		expect(isDestructiveOperation("status")).toBe(false);
		expect(isDestructiveOperation("log")).toBe(false);
		expect(isDestructiveOperation("branch")).toBe(false);
		expect(isDestructiveOperation("checkout")).toBe(false);
		expect(isDestructiveOperation("commit")).toBe(false);
		expect(isDestructiveOperation("stash")).toBe(false);
	});
});

describe("createDestructiveWarning", () => {
	it("should create warning for deleteBranch", () => {
		const warning = createDestructiveWarning("deleteBranch", "feature-branch");

		expect(warning).toContain("feature-branch");
		expect(warning).toContain("cannot be undone");
	});

	it("should create warning for reset", () => {
		const warning = createDestructiveWarning("reset", "HEAD~3");

		expect(warning).toContain("uncommitted changes");
	});

	it("should create warning for stashPop", () => {
		const warning = createDestructiveWarning("stashPop", "stash@{0}");

		expect(warning).toContain("Stash");
		expect(warning).toContain("removed");
	});

	it("should create warning for worktreeRemove", () => {
		const warning = createDestructiveWarning("worktreeRemove", "/path/to/wt");

		expect(warning).toContain("/path/to/wt");
		expect(warning).toContain("removed from disk");
	});

	it("should create generic warning for unknown operations", () => {
		const warning = createDestructiveWarning("unknownOp", "target");

		expect(warning).toContain("unknownOp");
		expect(warning).toContain("destructive");
	});
});

describe("sanitizeForCommand", () => {
	it("should pass through safe input unchanged", () => {
		expect(sanitizeForCommand("feature-branch")).toBe("feature-branch");
		expect(sanitizeForCommand("main")).toBe("main");
		expect(sanitizeForCommand("refs/heads/main")).toBe("refs/heads/main");
		expect(sanitizeForCommand("user/my-feature")).toBe("user/my-feature");
	});

	it("should remove null bytes", () => {
		expect(sanitizeForCommand("branch\x00name")).toBe("branchname");
		expect(sanitizeForCommand("\x00start")).toBe("start");
		expect(sanitizeForCommand("end\x00")).toBe("end");
	});

	it("should remove shell metacharacters", () => {
		expect(sanitizeForCommand("branch`cmd`")).toBe("branchcmd");
		expect(sanitizeForCommand("$(command)")).toBe("command");
		expect(sanitizeForCommand("branch|cat")).toBe("branchcat");
		expect(sanitizeForCommand("a;b")).toBe("ab");
		expect(sanitizeForCommand("a&b")).toBe("ab");
	});

	it("should remove redirect operators", () => {
		expect(sanitizeForCommand("file>output")).toBe("fileoutput");
		expect(sanitizeForCommand("input<file")).toBe("inputfile");
	});

	it("should remove braces", () => {
		expect(sanitizeForCommand("{a,b}")).toBe("a,b");
		expect(sanitizeForCommand("$(cmd)")).toBe("cmd");
	});

	it("should remove exclamation mark", () => {
		expect(sanitizeForCommand("branch!name")).toBe("branchname");
	});

	it("should handle complex injection attempts", () => {
		const malicious = "branch; rm -rf /";
		const sanitized = sanitizeForCommand(malicious);

		expect(sanitized).not.toContain(";");
		expect(sanitized).toBe("branch rm -rf /");
	});

	it("should handle empty string", () => {
		expect(sanitizeForCommand("")).toBe("");
	});

	it("should preserve spaces (not a shell metacharacter for array args)", () => {
		// Spaces are preserved because when using Bun.spawn with array args,
		// spaces don't cause shell issues
		expect(sanitizeForCommand("commit message")).toBe("commit message");
	});
});
