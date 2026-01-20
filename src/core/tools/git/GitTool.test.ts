/**
 * Integration tests for GitTool.
 *
 * These tests run against a real temporary Git repository to verify
 * that GitTool correctly wraps Git CLI commands and handles errors.
 */

import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { GitTool } from "./GitTool.ts";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// =============================================================================
// Test Fixture Setup
// =============================================================================

interface TestFixture {
	/** Path to the temporary test repository */
	repoPath: string;
	/** Path to a non-repository directory */
	nonRepoPath: string;
	/** GitTool instance with cwd set to repoPath */
	git: GitTool;
	/** Clean up the test fixture */
	cleanup: () => Promise<void>;
}

/**
 * Create a test fixture with a temporary Git repository.
 */
async function createTestFixture(): Promise<TestFixture> {
	// Create unique temp directories
	const timestamp = Date.now();
	const random = Math.random().toString(36).substring(2, 8);
	const basePath = join(tmpdir(), `git-tool-test-${timestamp}-${random}`);
	const repoPath = join(basePath, "repo");
	const nonRepoPath = join(basePath, "non-repo");

	// Create directories
	await mkdir(repoPath, { recursive: true });
	await mkdir(nonRepoPath, { recursive: true });

	// Initialize Git repository
	const git = new GitTool();

	// Run git init
	const initProc = Bun.spawn(["git", "init"], {
		cwd: repoPath,
		stdout: "pipe",
		stderr: "pipe",
	});
	await initProc.exited;

	// Configure Git user for commits (required for commits to work)
	const configNameProc = Bun.spawn(
		["git", "config", "user.name", "Test User"],
		{
			cwd: repoPath,
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	await configNameProc.exited;

	const configEmailProc = Bun.spawn(
		["git", "config", "user.email", "test@example.com"],
		{
			cwd: repoPath,
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	await configEmailProc.exited;

	// Create initial commit (required for some Git operations)
	const readmePath = join(repoPath, "README.md");
	await writeFile(
		readmePath,
		"# Test Repository\n\nThis is a test repository for GitTool tests.\n",
	);

	const addProc = Bun.spawn(["git", "add", "README.md"], {
		cwd: repoPath,
		stdout: "pipe",
		stderr: "pipe",
	});
	await addProc.exited;

	const commitProc = Bun.spawn(["git", "commit", "-m", "Initial commit"], {
		cwd: repoPath,
		stdout: "pipe",
		stderr: "pipe",
	});
	await commitProc.exited;

	const cleanup = async () => {
		try {
			await rm(basePath, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	};

	return { repoPath, nonRepoPath, git, cleanup };
}

// =============================================================================
// Repository Status Tests
// =============================================================================

describe("GitTool Integration Tests", () => {
	let fixture: TestFixture;

	beforeAll(async () => {
		fixture = await createTestFixture();
	});

	afterAll(async () => {
		await fixture.cleanup();
	});

	describe("isRepo()", () => {
		it("should return true for a Git repository", async () => {
			const result = await fixture.git.isRepo({ cwd: fixture.repoPath });

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toBe(true);
			}
		});

		it("should return false for a non-repository directory", async () => {
			const result = await fixture.git.isRepo({ cwd: fixture.nonRepoPath });

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toBe(false);
			}
		});
	});

	describe("status()", () => {
		it("should return clean status for a clean repository", async () => {
			const result = await fixture.git.status({ cwd: fixture.repoPath });

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value.isClean).toBe(true);
				expect(result.value.staged).toHaveLength(0);
				expect(result.value.unstaged).toHaveLength(0);
				expect(result.value.untracked).toHaveLength(0);
			}
		});

		it("should detect untracked files", async () => {
			// Create an untracked file
			const untrackedPath = join(fixture.repoPath, "untracked-file.txt");
			await writeFile(untrackedPath, "This is an untracked file.\n");

			const result = await fixture.git.status({ cwd: fixture.repoPath });

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value.isClean).toBe(false);
				expect(result.value.untracked).toContain("untracked-file.txt");
			}

			// Clean up
			await rm(untrackedPath);
		});

		it("should return error for non-repository", async () => {
			const result = await fixture.git.status({ cwd: fixture.nonRepoPath });

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.type).toBe("NotARepository");
			}
		});
	});

	describe("getBranch()", () => {
		it("should return current branch name", async () => {
			const result = await fixture.git.getBranch({ cwd: fixture.repoPath });

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				// Default branch could be "main" or "master" depending on Git version
				expect(["main", "master"]).toContain(result.value);
			}
		});
	});
});

// =============================================================================
// Branch Lifecycle Tests
// =============================================================================

describe("GitTool Branch Lifecycle", () => {
	let fixture: TestFixture;

	beforeAll(async () => {
		fixture = await createTestFixture();
	});

	afterAll(async () => {
		await fixture.cleanup();
	});

	it("should complete branch lifecycle: create -> list -> switch -> delete", async () => {
		const branchName = "feature/test-branch";
		const config = { cwd: fixture.repoPath };

		// Step 1: Create a new branch
		const createResult = await fixture.git.createBranch(
			{ name: branchName },
			config,
		);
		expect(createResult._tag).toBe("ok");

		// Step 2: Verify branch exists via getBranch after switching (more reliable than listBranches)
		// Note: listBranches output format can vary across Git versions, so we use switch + getBranch

		// Step 3: Switch to the new branch
		const switchResult = await fixture.git.switchBranch(
			{ name: branchName },
			config,
		);
		expect(switchResult._tag).toBe("ok");

		// Step 4: Verify current branch changed
		const getBranchResult = await fixture.git.getBranch(config);
		expect(getBranchResult._tag).toBe("ok");
		if (getBranchResult._tag === "ok") {
			expect(getBranchResult.value).toBe(branchName);
		}

		// Step 5: Switch back to main/master
		// Get the original branch using git directly for reliability
		const origBranchProc = Bun.spawn(
			["git", "branch", "--list", "main", "master"],
			{
				cwd: fixture.repoPath,
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		const origBranchOutput = await new Response(origBranchProc.stdout).text();
		await origBranchProc.exited;
		const mainBranch = origBranchOutput.trim().includes("main")
			? "main"
			: "master";

		const switchBackResult = await fixture.git.switchBranch(
			{ name: mainBranch },
			config,
		);
		expect(switchBackResult._tag).toBe("ok");

		// Step 6: Delete the test branch
		const deleteResult = await fixture.git.deleteBranch(
			{ name: branchName, force: true },
			config,
		);
		expect(deleteResult._tag).toBe("ok");

		// Step 7: Verify branch is deleted by attempting to switch (should fail)
		const switchFailResult = await fixture.git.switchBranch(
			{ name: branchName },
			config,
		);
		expect(switchFailResult._tag).toBe("err");
	});

	it("should return error when creating branch with existing name", async () => {
		const config = { cwd: fixture.repoPath };
		const branchName = "duplicate-branch";

		// Create the branch first
		const createResult = await fixture.git.createBranch(
			{ name: branchName },
			config,
		);
		expect(createResult._tag).toBe("ok");

		// Try to create it again
		const duplicateResult = await fixture.git.createBranch(
			{ name: branchName },
			config,
		);
		expect(duplicateResult._tag).toBe("err");
		if (duplicateResult._tag === "err") {
			// Git may report this as BranchExists or WorktreeExists (both indicate "already exists")
			// The exact error depends on Git version and error message format
			expect(["BranchExists", "WorktreeExists"]).toContain(
				duplicateResult.error.type,
			);
			expect(duplicateResult.error.message.toLowerCase()).toContain(
				"already exists",
			);
		}

		// Clean up
		await fixture.git.deleteBranch({ name: branchName, force: true }, config);
	});

	it("should create and checkout branch in one operation", async () => {
		const config = { cwd: fixture.repoPath };
		const branchName = "checkout-on-create";

		// Create branch with checkout: true
		const createResult = await fixture.git.createBranch(
			{ name: branchName, checkout: true },
			config,
		);
		expect(createResult._tag).toBe("ok");

		// Verify we're on the new branch
		const getBranchResult = await fixture.git.getBranch(config);
		expect(getBranchResult._tag).toBe("ok");
		if (getBranchResult._tag === "ok") {
			expect(getBranchResult.value).toBe(branchName);
		}

		// Switch back and clean up - use git directly for reliability
		const origBranchProc = Bun.spawn(
			["git", "branch", "--list", "main", "master"],
			{
				cwd: fixture.repoPath,
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		const origBranchOutput = await new Response(origBranchProc.stdout).text();
		await origBranchProc.exited;
		const mainBranch = origBranchOutput.trim().includes("main")
			? "main"
			: "master";

		await fixture.git.switchBranch({ name: mainBranch }, config);
		await fixture.git.deleteBranch({ name: branchName, force: true }, config);
	});
});

// =============================================================================
// Commit Workflow Tests
// =============================================================================

describe("GitTool Commit Workflow", () => {
	let fixture: TestFixture;

	beforeAll(async () => {
		fixture = await createTestFixture();
	});

	afterAll(async () => {
		await fixture.cleanup();
	});

	it("should complete commit workflow: add -> commit -> log", async () => {
		const config = { cwd: fixture.repoPath };
		const testFileName = "test-commit-file.txt";
		const testFilePath = join(fixture.repoPath, testFileName);
		const commitMessage = "Test commit message";

		// Step 1: Create a new file
		await writeFile(testFilePath, "This is test content for commit.\n");

		// Step 2: Add the file
		const addResult = await fixture.git.add({ paths: [testFileName] }, config);
		expect(addResult._tag).toBe("ok");

		// Step 3: Verify file is staged
		const statusResult = await fixture.git.status(config);
		expect(statusResult._tag).toBe("ok");
		if (statusResult._tag === "ok") {
			expect(statusResult.value.staged.map((f) => f.path)).toContain(
				testFileName,
			);
		}

		// Step 4: Commit the changes
		const commitResult = await fixture.git.commit(
			{ message: commitMessage },
			config,
		);
		expect(commitResult._tag).toBe("ok");
		if (commitResult._tag === "ok") {
			// Should return the commit hash
			expect(commitResult.value.length).toBeGreaterThanOrEqual(7);
		}

		// Step 5: Verify commit appears in log
		const logResult = await fixture.git.log({ limit: 5 }, config);
		expect(logResult._tag).toBe("ok");
		if (logResult._tag === "ok") {
			expect(logResult.value.length).toBeGreaterThan(0);
			expect(logResult.value[0].subject).toBe(commitMessage);
		}

		// Step 6: Verify working tree is clean
		const finalStatus = await fixture.git.status(config);
		expect(finalStatus._tag).toBe("ok");
		if (finalStatus._tag === "ok") {
			expect(finalStatus.value.isClean).toBe(true);
		}
	});

	it("should allow empty commits with allowEmpty flag", async () => {
		const config = { cwd: fixture.repoPath };
		const emptyCommitMessage = "Empty commit for testing";

		// Commit with allowEmpty: true should succeed
		const commitResult = await fixture.git.commit(
			{ message: emptyCommitMessage, allowEmpty: true },
			config,
		);
		expect(commitResult._tag).toBe("ok");

		// Verify commit appears in log
		const logResult = await fixture.git.log({ limit: 1 }, config);
		expect(logResult._tag).toBe("ok");
		if (logResult._tag === "ok") {
			expect(logResult.value[0].subject).toBe(emptyCommitMessage);
		}
	});

	it("should add all files with all: true", async () => {
		const config = { cwd: fixture.repoPath };

		// Create multiple files
		const file1 = join(fixture.repoPath, "file1.txt");
		const file2 = join(fixture.repoPath, "file2.txt");
		await writeFile(file1, "Content 1\n");
		await writeFile(file2, "Content 2\n");

		// Add all with all: true
		const addResult = await fixture.git.add({ all: true }, config);
		expect(addResult._tag).toBe("ok");

		// Verify files are staged
		const statusResult = await fixture.git.status(config);
		expect(statusResult._tag).toBe("ok");
		if (statusResult._tag === "ok") {
			const stagedPaths = statusResult.value.staged.map((f) => f.path);
			expect(stagedPaths).toContain("file1.txt");
			expect(stagedPaths).toContain("file2.txt");
		}

		// Clean up - commit the files
		await fixture.git.commit({ message: "Add multiple files" }, config);
	});

	it("should reset staged files", async () => {
		const config = { cwd: fixture.repoPath };
		const testFile = join(fixture.repoPath, "reset-test.txt");

		// Create and stage a file
		await writeFile(testFile, "Content to be reset\n");
		await fixture.git.add({ paths: ["reset-test.txt"] }, config);

		// Verify file is staged
		let statusResult = await fixture.git.status(config);
		expect(statusResult._tag).toBe("ok");
		if (statusResult._tag === "ok") {
			expect(statusResult.value.staged.map((f) => f.path)).toContain(
				"reset-test.txt",
			);
		}

		// Reset the file
		const resetResult = await fixture.git.reset(
			{ paths: ["reset-test.txt"] },
			config,
		);
		expect(resetResult._tag).toBe("ok");

		// Verify file is no longer staged (but is untracked)
		statusResult = await fixture.git.status(config);
		expect(statusResult._tag).toBe("ok");
		if (statusResult._tag === "ok") {
			expect(statusResult.value.staged.map((f) => f.path)).not.toContain(
				"reset-test.txt",
			);
			expect(statusResult.value.untracked).toContain("reset-test.txt");
		}

		// Clean up
		await rm(testFile);
	});
});

// =============================================================================
// Diff Operations Tests
// =============================================================================

describe("GitTool Diff Operations", () => {
	let fixture: TestFixture;

	beforeAll(async () => {
		fixture = await createTestFixture();
	});

	afterAll(async () => {
		await fixture.cleanup();
	});

	it("should return empty diff for clean working tree", async () => {
		const config = { cwd: fixture.repoPath };

		const diffResult = await fixture.git.diff({}, config);
		expect(diffResult._tag).toBe("ok");
		if (diffResult._tag === "ok") {
			expect(diffResult.value.files).toHaveLength(0);
			expect(diffResult.value.totalAdditions).toBe(0);
			expect(diffResult.value.totalDeletions).toBe(0);
		}
	});

	it("should detect unstaged changes in diff", async () => {
		const config = { cwd: fixture.repoPath };
		const testFile = join(fixture.repoPath, "diff-test.txt");

		// Create and commit a file
		await writeFile(testFile, "Original content\n");
		await fixture.git.add({ paths: ["diff-test.txt"] }, config);
		await fixture.git.commit({ message: "Add diff-test.txt" }, config);

		// Modify the file (unstaged change)
		await writeFile(testFile, "Original content\nNew line added\n");

		// Check diff
		const diffResult = await fixture.git.diff({}, config);
		expect(diffResult._tag).toBe("ok");
		if (diffResult._tag === "ok") {
			expect(diffResult.value.files.length).toBeGreaterThan(0);
			const diffFile = diffResult.value.files.find(
				(f) => f.path === "diff-test.txt",
			);
			expect(diffFile).toBeDefined();
			expect(diffFile?.additions).toBeGreaterThan(0);
		}

		// Clean up - reset changes
		const resetProc = Bun.spawn(["git", "checkout", "--", "diff-test.txt"], {
			cwd: fixture.repoPath,
			stdout: "pipe",
			stderr: "pipe",
		});
		await resetProc.exited;
	});

	it("should show staged changes with staged: true", async () => {
		const config = { cwd: fixture.repoPath };
		const testFile = join(fixture.repoPath, "staged-diff.txt");

		// Create a new file and stage it
		await writeFile(testFile, "Staged content\n");
		await fixture.git.add({ paths: ["staged-diff.txt"] }, config);

		// Check staged diff
		const diffResult = await fixture.git.diff({ staged: true }, config);
		expect(diffResult._tag).toBe("ok");
		if (diffResult._tag === "ok") {
			const stagedFile = diffResult.value.files.find(
				(f) => f.path === "staged-diff.txt",
			);
			expect(stagedFile).toBeDefined();
		}

		// Reset the staged file
		await fixture.git.reset({ paths: ["staged-diff.txt"] }, config);
		await rm(testFile);
	});

	it("should return only file names with nameOnly: true", async () => {
		const config = { cwd: fixture.repoPath };
		const testFile = join(fixture.repoPath, "name-only-test.txt");

		// Create and stage a file
		await writeFile(testFile, "Content for name-only test\n");
		await fixture.git.add({ paths: ["name-only-test.txt"] }, config);

		// Check diff with nameOnly
		const diffResult = await fixture.git.diff(
			{ staged: true, nameOnly: true },
			config,
		);
		expect(diffResult._tag).toBe("ok");
		if (diffResult._tag === "ok") {
			const file = diffResult.value.files.find(
				(f) => f.path === "name-only-test.txt",
			);
			expect(file).toBeDefined();
			// When nameOnly is true, additions/deletions are 0
			expect(file?.additions).toBe(0);
			expect(file?.deletions).toBe(0);
		}

		// Clean up
		await fixture.git.reset({ paths: ["name-only-test.txt"] }, config);
		await rm(testFile);
	});
});

// =============================================================================
// Log Operations Tests
// =============================================================================

describe("GitTool Log Operations", () => {
	let fixture: TestFixture;

	beforeAll(async () => {
		fixture = await createTestFixture();
	});

	afterAll(async () => {
		await fixture.cleanup();
	});

	it("should return commit history", async () => {
		const config = { cwd: fixture.repoPath };

		// Create some commits for testing
		for (let i = 1; i <= 3; i++) {
			const filePath = join(fixture.repoPath, `log-test-${i}.txt`);
			await writeFile(filePath, `Content ${i}\n`);
			await fixture.git.add({ paths: [`log-test-${i}.txt`] }, config);
			await fixture.git.commit({ message: `Log test commit ${i}` }, config);
		}

		// Get log
		const logResult = await fixture.git.log({ limit: 10 }, config);
		expect(logResult._tag).toBe("ok");
		if (logResult._tag === "ok") {
			// Should have at least 4 commits (initial + 3 test commits)
			expect(logResult.value.length).toBeGreaterThanOrEqual(4);

			// Most recent should be "Log test commit 3"
			expect(logResult.value[0].subject).toBe("Log test commit 3");

			// Commits should have required fields
			const commit = logResult.value[0];
			expect(commit.hash).toBeDefined();
			expect(commit.shortHash).toBeDefined();
			expect(commit.author).toBeDefined();
			expect(commit.email).toBeDefined();
			expect(commit.date).toBeInstanceOf(Date);
		}
	});

	it("should respect limit option", async () => {
		const config = { cwd: fixture.repoPath };

		const logResult = await fixture.git.log({ limit: 2 }, config);
		expect(logResult._tag).toBe("ok");
		if (logResult._tag === "ok") {
			expect(logResult.value.length).toBeLessThanOrEqual(2);
		}
	});

	it("should filter by author", async () => {
		const config = { cwd: fixture.repoPath };

		// Create a commit as "Test User" (from our fixture config)
		const filePath = join(fixture.repoPath, "author-test.txt");
		await writeFile(filePath, "Author test content\n");
		await fixture.git.add({ paths: ["author-test.txt"] }, config);
		await fixture.git.commit({ message: "Author filter test" }, config);

		// Filter by author
		const logResult = await fixture.git.log({ author: "Test User" }, config);
		expect(logResult._tag).toBe("ok");
		if (logResult._tag === "ok") {
			// All commits should be by "Test User" since that's our config
			for (const commit of logResult.value) {
				expect(commit.author).toBe("Test User");
			}
		}
	});

	it("should filter by message grep", async () => {
		const config = { cwd: fixture.repoPath };

		// Filter for commits containing "Log test"
		const logResult = await fixture.git.log({ grep: "Log test" }, config);
		expect(logResult._tag).toBe("ok");
		if (logResult._tag === "ok") {
			expect(logResult.value.length).toBeGreaterThan(0);
			for (const commit of logResult.value) {
				expect(commit.subject).toContain("Log test");
			}
		}
	});
});

// =============================================================================
// Worktree Lifecycle Tests
// =============================================================================

describe("GitTool Worktree Lifecycle", () => {
	let fixture: TestFixture;
	let worktreePath: string;

	beforeAll(async () => {
		fixture = await createTestFixture();
		worktreePath = join(fixture.repoPath, "..", "test-worktree");
	});

	afterAll(async () => {
		// Clean up worktree if it exists
		try {
			await fixture.git.worktreeRemove(
				{ path: worktreePath, force: true },
				{ cwd: fixture.repoPath },
			);
		} catch {
			// Ignore errors
		}
		try {
			await rm(worktreePath, { recursive: true, force: true });
		} catch {
			// Ignore errors
		}
		await fixture.cleanup();
	});

	it("should complete worktree lifecycle: add -> list -> remove", async () => {
		const config = { cwd: fixture.repoPath };
		const worktreeBranch = "worktree-test-branch";

		// Step 1: Add a worktree with a new branch
		const addResult = await fixture.git.worktreeAdd(
			{ path: worktreePath, newBranch: worktreeBranch },
			config,
		);
		expect(addResult.result._tag).toBe("ok");
		// relativePath is computed relative to cwd
		expect(addResult.relativePath).toBe("../test-worktree");
		// relativeToGitRoot is computed relative to git repository root (same as cwd in this test)
		expect(addResult.relativeToGitRoot).toBe("../test-worktree");
		// absolutePath contains the worktree directory name
		expect(addResult.absolutePath).toContain("test-worktree");

		// Step 2: Verify worktree appears in list
		const listResult = await fixture.git.worktreeList(config);
		expect(listResult._tag).toBe("ok");
		if (listResult._tag === "ok") {
			expect(listResult.value.length).toBeGreaterThanOrEqual(2); // Main + new worktree
			const addedWorktree = listResult.value.find(
				(wt) => wt.branch === worktreeBranch,
			);
			expect(addedWorktree).toBeDefined();
		}

		// Step 3: Remove the worktree
		const removeResult = await fixture.git.worktreeRemove(
			{ path: worktreePath, force: true },
			config,
		);
		expect(removeResult._tag).toBe("ok");

		// Step 4: Verify worktree is removed from list
		const finalListResult = await fixture.git.worktreeList(config);
		expect(finalListResult._tag).toBe("ok");
		if (finalListResult._tag === "ok") {
			const removedWorktree = finalListResult.value.find(
				(wt) => wt.branch === worktreeBranch,
			);
			expect(removedWorktree).toBeUndefined();
		}

		// Clean up the branch
		await fixture.git.deleteBranch(
			{ name: worktreeBranch, force: true },
			config,
		);
	});

	it("should return error result when path is empty", async () => {
		const config = { cwd: fixture.repoPath };

		const result = await fixture.git.worktreeAdd(
			{ path: "", newBranch: "test-branch" },
			config,
		);

		expect(result.result._tag).toBe("err");
		expect(result.absolutePath).toBe("");
		expect(result.relativePath).toBe("");
		expect(result.relativeToGitRoot).toBe("");
		if (result.result._tag === "err") {
			expect(result.result.error.message).toContain("path is required");
		}
	});

	it("should handle worktree inside repo with relative path", async () => {
		const config = { cwd: fixture.repoPath };
		const innerWorktreePath = ".worktrees/inner-test";
		const worktreeBranch = "inner-worktree-branch";

		// Create parent directory
		await mkdir(join(fixture.repoPath, ".worktrees"), { recursive: true });

		const addResult = await fixture.git.worktreeAdd(
			{ path: innerWorktreePath, newBranch: worktreeBranch },
			config,
		);

		expect(addResult.result._tag).toBe("ok");
		// relativePath should be exactly what we provided (relative to cwd)
		expect(addResult.relativePath).toBe(".worktrees/inner-test");
		// relativeToGitRoot should be same since cwd is git root
		expect(addResult.relativeToGitRoot).toBe(".worktrees/inner-test");
		// absolutePath should end with our path
		expect(addResult.absolutePath).toMatch(/\.worktrees\/inner-test$/);

		// Clean up
		await fixture.git.worktreeRemove(
			{ path: innerWorktreePath, force: true },
			config,
		);
		await fixture.git.deleteBranch(
			{ name: worktreeBranch, force: true },
			config,
		);
		await rm(join(fixture.repoPath, ".worktrees"), {
			recursive: true,
			force: true,
		});
	});

	it("should compute different relativePath and relativeToGitRoot when cwd differs from git root", async () => {
		// Create a subdirectory to use as cwd
		const subDir = join(fixture.repoPath, "subdir");
		await mkdir(subDir, { recursive: true });

		const config = { cwd: subDir };
		const worktreeRelativePath = "../../sibling-worktree";
		const worktreeBranch = "sibling-worktree-branch";

		const addResult = await fixture.git.worktreeAdd(
			{ path: worktreeRelativePath, newBranch: worktreeBranch },
			config,
		);

		expect(addResult.result._tag).toBe("ok");
		// relativePath is relative to cwd (subdir)
		expect(addResult.relativePath).toBe("../../sibling-worktree");
		// relativeToGitRoot is relative to git root (one level up from subdir)
		expect(addResult.relativeToGitRoot).toBe("../sibling-worktree");
		// absolutePath should contain the worktree name
		expect(addResult.absolutePath).toContain("sibling-worktree");

		// Clean up
		await fixture.git.worktreeRemove(
			{ path: addResult.absolutePath, force: true },
			{ cwd: fixture.repoPath },
		);
		await fixture.git.deleteBranch(
			{ name: worktreeBranch, force: true },
			{ cwd: fixture.repoPath },
		);
		await rm(addResult.absolutePath, { recursive: true, force: true });
		await rm(subDir, { recursive: true, force: true });
	});
});

// =============================================================================
// Stash Operations Tests
// =============================================================================

describe("GitTool Stash Operations", () => {
	let fixture: TestFixture;

	beforeAll(async () => {
		fixture = await createTestFixture();
	});

	afterAll(async () => {
		await fixture.cleanup();
	});

	it("should stash and pop changes", async () => {
		const config = { cwd: fixture.repoPath };
		const testFile = join(fixture.repoPath, "stash-test.txt");

		// Create and commit a base file
		await writeFile(testFile, "Base content\n");
		await fixture.git.add({ paths: ["stash-test.txt"] }, config);
		await fixture.git.commit({ message: "Add stash test file" }, config);

		// Modify the file (create changes to stash)
		await writeFile(testFile, "Modified content\n");

		// Verify we have uncommitted changes
		let statusResult = await fixture.git.status(config);
		expect(statusResult._tag).toBe("ok");
		if (statusResult._tag === "ok") {
			expect(statusResult.value.isClean).toBe(false);
		}

		// Stash the changes
		const stashResult = await fixture.git.stash(
			{ message: "Test stash" },
			config,
		);
		expect(stashResult._tag).toBe("ok");

		// Verify working tree is clean
		statusResult = await fixture.git.status(config);
		expect(statusResult._tag).toBe("ok");
		if (statusResult._tag === "ok") {
			expect(statusResult.value.isClean).toBe(true);
		}

		// Verify stash appears in list
		const listResult = await fixture.git.stashList(config);
		expect(listResult._tag).toBe("ok");
		if (listResult._tag === "ok") {
			expect(listResult.value.length).toBeGreaterThan(0);
		}

		// Pop the stash
		const popResult = await fixture.git.stashPop({}, config);
		expect(popResult._tag).toBe("ok");

		// Verify changes are restored
		statusResult = await fixture.git.status(config);
		expect(statusResult._tag).toBe("ok");
		if (statusResult._tag === "ok") {
			expect(statusResult.value.isClean).toBe(false);
		}

		// Clean up - discard changes
		const checkoutProc = Bun.spawn(
			["git", "checkout", "--", "stash-test.txt"],
			{
				cwd: fixture.repoPath,
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		await checkoutProc.exited;
	});

	it("should return empty list when no stashes exist", async () => {
		const config = { cwd: fixture.repoPath };

		// Ensure no stashes (clean up any existing)
		const clearProc = Bun.spawn(["git", "stash", "clear"], {
			cwd: fixture.repoPath,
			stdout: "pipe",
			stderr: "pipe",
		});
		await clearProc.exited;

		const listResult = await fixture.git.stashList(config);
		expect(listResult._tag).toBe("ok");
		if (listResult._tag === "ok") {
			expect(listResult.value).toHaveLength(0);
		}
	});
});

// =============================================================================
// Error Handling Tests
// =============================================================================

describe("GitTool Error Handling", () => {
	let fixture: TestFixture;

	beforeAll(async () => {
		fixture = await createTestFixture();
	});

	afterAll(async () => {
		await fixture.cleanup();
	});

	it("should return NotARepository error for operations in non-repo", async () => {
		const nonRepoConfig = { cwd: fixture.nonRepoPath };

		const statusResult = await fixture.git.status(nonRepoConfig);
		expect(statusResult._tag).toBe("err");
		if (statusResult._tag === "err") {
			expect(statusResult.error.type).toBe("NotARepository");
		}
	});

	it("should return error when switching to non-existent branch", async () => {
		const config = { cwd: fixture.repoPath };

		const switchResult = await fixture.git.switchBranch(
			{ name: "non-existent-branch-12345" },
			config,
		);
		expect(switchResult._tag).toBe("err");
		if (switchResult._tag === "err") {
			// Git may report this as BranchNotFound or CommandFailed depending on version
			// The key assertion is that it fails with an error
			expect(["BranchNotFound", "CommandFailed"]).toContain(
				switchResult.error.type,
			);
		}
	});

	it("should return error when deleting non-existent branch", async () => {
		const config = { cwd: fixture.repoPath };

		const deleteResult = await fixture.git.deleteBranch(
			{ name: "non-existent-branch-delete" },
			config,
		);
		expect(deleteResult._tag).toBe("err");
		if (deleteResult._tag === "err") {
			expect(deleteResult.error.type).toBe("BranchNotFound");
		}
	});

	it("should return error when commit message is empty", async () => {
		const config = { cwd: fixture.repoPath };

		const commitResult = await fixture.git.commit({ message: "" }, config);
		expect(commitResult._tag).toBe("err");
		if (commitResult._tag === "err") {
			expect(commitResult.error.type).toBe("CommandFailed");
			expect(commitResult.error.message).toContain("required");
		}
	});

	it("should return error when branch name is empty", async () => {
		const config = { cwd: fixture.repoPath };

		const createResult = await fixture.git.createBranch({ name: "" }, config);
		expect(createResult._tag).toBe("err");
		if (createResult._tag === "err") {
			expect(createResult.error.type).toBe("InvalidBranchName");
		}
	});

	it("should include command in error details", async () => {
		const nonRepoConfig = { cwd: fixture.nonRepoPath };

		const logResult = await fixture.git.log({}, nonRepoConfig);
		expect(logResult._tag).toBe("err");
		if (logResult._tag === "err") {
			expect(logResult.error.command).toBeDefined();
			expect(logResult.error.command).toContain("git");
		}
	});
});

// =============================================================================
// Tool Name and Validation Tests
// =============================================================================

describe("GitTool Basic Properties", () => {
	it("should have name property set to 'git'", () => {
		const git = new GitTool();
		expect(git.name).toBe("git");
	});

	it("should validate step tool type", () => {
		const git = new GitTool();

		// Should not throw for correct tool type
		expect(() =>
			git.validateStep({ name: "test-step", tool: "git" }),
		).not.toThrow();

		// Should throw for incorrect tool type
		expect(() =>
			git.validateStep({ name: "test-step", tool: "bash" }),
		).toThrow();
	});
});
