/**
 * Unit tests for Git output parsers.
 */

import { describe, expect, it } from "bun:test";
import {
	parseStatusPorcelain,
	parseLogOutput,
	parseBranchList,
	parseDiffNumstat,
	parseDiffNameOnly,
	parseDiffNameStatus,
	parseWorktreeList,
	parseStashList,
	parseRemotes,
	detectGitError,
	LOG_FORMAT,
	BRANCH_FORMAT,
	STASH_FORMAT,
} from "./parsers.ts";

describe("parseStatusPorcelain", () => {
	it("should parse empty output as clean status", () => {
		const result = parseStatusPorcelain("");

		expect(result.branch).toBe("HEAD");
		expect(result.isClean).toBe(true);
		expect(result.staged).toHaveLength(0);
		expect(result.unstaged).toHaveLength(0);
		expect(result.untracked).toHaveLength(0);
	});

	it("should parse branch header", () => {
		const output = "# branch.head main\n# branch.oid abc123";

		const result = parseStatusPorcelain(output);

		expect(result.branch).toBe("main");
		expect(result.isClean).toBe(true);
	});

	it("should parse upstream tracking info", () => {
		const output = `# branch.oid abc123
# branch.head feature-branch
# branch.upstream origin/feature-branch
# branch.ab +3 -2`;

		const result = parseStatusPorcelain(output);

		expect(result.branch).toBe("feature-branch");
		expect(result.upstream).toBe("origin/feature-branch");
		expect(result.ahead).toBe(3);
		expect(result.behind).toBe(2);
	});

	it("should parse untracked files", () => {
		const output = `# branch.head main
? new-file.txt
? another/untracked.js`;

		const result = parseStatusPorcelain(output);

		expect(result.untracked).toHaveLength(2);
		expect(result.untracked).toContain("new-file.txt");
		expect(result.untracked).toContain("another/untracked.js");
		expect(result.isClean).toBe(false);
	});

	it("should parse staged changes", () => {
		const output = `# branch.head main
1 A. N... 000000 100644 100644 0000000 abc1234 staged-file.txt`;

		const result = parseStatusPorcelain(output);

		expect(result.staged).toHaveLength(1);
		expect(result.staged[0].path).toBe("staged-file.txt");
		expect(result.staged[0].index).toBe("A");
		expect(result.unstaged).toHaveLength(0);
		expect(result.isClean).toBe(false);
	});

	it("should parse unstaged changes", () => {
		const output = `# branch.head main
1 .M N... 100644 100644 100644 abc1234 abc1234 modified-file.ts`;

		const result = parseStatusPorcelain(output);

		expect(result.unstaged).toHaveLength(1);
		expect(result.unstaged[0].path).toBe("modified-file.ts");
		expect(result.unstaged[0].workingTree).toBe("M");
		expect(result.staged).toHaveLength(0);
	});

	it("should parse both staged and unstaged changes for same file", () => {
		const output = `# branch.head main
1 MM N... 100644 100644 100644 abc1234 def5678 both-modified.js`;

		const result = parseStatusPorcelain(output);

		expect(result.staged).toHaveLength(1);
		expect(result.staged[0].path).toBe("both-modified.js");
		expect(result.staged[0].index).toBe("M");
		expect(result.unstaged).toHaveLength(1);
		expect(result.unstaged[0].path).toBe("both-modified.js");
		expect(result.unstaged[0].workingTree).toBe("M");
	});

	it("should parse renamed files", () => {
		const output = `# branch.head main
2 R. N... 100644 100644 100644 abc1234 def5678 R100 new-name.ts	old-name.ts`;

		const result = parseStatusPorcelain(output);

		expect(result.staged).toHaveLength(1);
		expect(result.staged[0].index).toBe("R");
		expect(result.staged[0].originalPath).toBe("old-name.ts");
	});

	it("should parse unmerged entries", () => {
		const output = `# branch.head main
u UU N... 100644 100644 100644 100644 abc123 def456 ghi789 conflicted-file.ts`;

		const result = parseStatusPorcelain(output);

		expect(result.staged).toHaveLength(1);
		expect(result.staged[0].path).toBe("conflicted-file.ts");
		expect(result.staged[0].index).toBe("U");
		expect(result.staged[0].workingTree).toBe("U");
	});

	it("should skip ignored files", () => {
		const output = `# branch.head main
! ignored-file.log`;

		const result = parseStatusPorcelain(output);

		expect(result.isClean).toBe(true);
		expect(result.untracked).toHaveLength(0);
	});

	it("should handle complex real-world output", () => {
		const output = `# branch.oid 1234567890abcdef
# branch.head feature/my-feature
# branch.upstream origin/feature/my-feature
# branch.ab +5 -1
1 M. N... 100644 100644 100644 abc1234 def5678 src/index.ts
1 A. N... 000000 100644 100644 0000000 ghi9012 src/new-file.ts
1 .M N... 100644 100644 100644 jkl3456 jkl3456 package.json
? temp.txt
? notes.md`;

		const result = parseStatusPorcelain(output);

		expect(result.branch).toBe("feature/my-feature");
		expect(result.upstream).toBe("origin/feature/my-feature");
		expect(result.ahead).toBe(5);
		expect(result.behind).toBe(1);
		expect(result.staged).toHaveLength(2);
		expect(result.unstaged).toHaveLength(1);
		expect(result.untracked).toHaveLength(2);
		expect(result.isClean).toBe(false);
	});
});

describe("parseLogOutput", () => {
	it("should return empty array for empty output", () => {
		const result = parseLogOutput("");
		expect(result).toHaveLength(0);
	});

	it("should return empty array for whitespace-only output", () => {
		const result = parseLogOutput("   \n\t\n  ");
		expect(result).toHaveLength(0);
	});

	it("should parse single commit", () => {
		const output =
			"abc123def456789\x1Eabc123d\x1EJohn Doe\x1Ejohn@example.com\x1E2024-01-15T10:30:00Z\x1EInitial commit\x1E\x1E\x1D";

		const result = parseLogOutput(output);

		expect(result).toHaveLength(1);
		expect(result[0].hash).toBe("abc123def456789");
		expect(result[0].shortHash).toBe("abc123d");
		expect(result[0].author).toBe("John Doe");
		expect(result[0].email).toBe("john@example.com");
		expect(result[0].subject).toBe("Initial commit");
		expect(result[0].date).toBeInstanceOf(Date);
	});

	it("should parse multiple commits", () => {
		const output = `abc123def456789\x1Eabc123d\x1EJohn Doe\x1Ejohn@example.com\x1E2024-01-15T10:30:00Z\x1ESecond commit\x1E\x1Edef1234\x1D
def1234567890ab\x1Edef1234\x1EJane Doe\x1Ejane@example.com\x1E2024-01-14T09:00:00Z\x1EInitial commit\x1E\x1E\x1D`;

		const result = parseLogOutput(output);

		expect(result).toHaveLength(2);
		expect(result[0].subject).toBe("Second commit");
		expect(result[1].subject).toBe("Initial commit");
	});

	it("should parse commit with body", () => {
		const output =
			"abc123\x1Eabc\x1EAuthor\x1Ea@b.com\x1E2024-01-15T10:30:00Z\x1EFix bug\x1EThis is the body\nwith multiple lines\x1E\x1D";

		const result = parseLogOutput(output);

		expect(result).toHaveLength(1);
		expect(result[0].body).toBe("This is the body\nwith multiple lines");
	});

	it("should parse commit with parents", () => {
		const output =
			"abc123\x1Eabc\x1EAuthor\x1Ea@b.com\x1E2024-01-15T10:30:00Z\x1EMerge commit\x1E\x1Eparent1 parent2\x1D";

		const result = parseLogOutput(output);

		expect(result).toHaveLength(1);
		expect(result[0].parents).toEqual(["parent1", "parent2"]);
	});

	it("should handle commits without body or parents", () => {
		const output =
			"abc123\x1Eabc\x1EAuthor\x1Ea@b.com\x1E2024-01-15T10:30:00Z\x1ESimple commit\x1D";

		const result = parseLogOutput(output);

		expect(result).toHaveLength(1);
		expect(result[0].body).toBeUndefined();
		expect(result[0].parents).toBeUndefined();
	});
});

describe("parseBranchList", () => {
	it("should return empty array for empty output", () => {
		const result = parseBranchList("");
		expect(result).toHaveLength(0);
	});

	it("should parse single branch", () => {
		const output = " \x1Emain\x1Eabc123\x1E\x1E\x1EInitial commit";

		const result = parseBranchList(output);

		expect(result).toHaveLength(1);
		expect(result[0].name).toBe("main");
		expect(result[0].commit).toBe("abc123");
		expect(result[0].current).toBe(false);
		expect(result[0].message).toBe("Initial commit");
	});

	it("should identify current branch", () => {
		const output = `*\x1Emain\x1Eabc123\x1E\x1E\x1ECurrent branch
 \x1Efeature\x1Edef456\x1E\x1E\x1EFeature branch`;

		const result = parseBranchList(output);

		expect(result).toHaveLength(2);
		expect(result[0].current).toBe(true);
		expect(result[0].name).toBe("main");
		expect(result[1].current).toBe(false);
		expect(result[1].name).toBe("feature");
	});

	it("should parse upstream tracking info", () => {
		const output =
			"*\x1Emain\x1Eabc123\x1Eorigin/main\x1Eahead 3, behind 2\x1ECommit message";

		const result = parseBranchList(output);

		expect(result).toHaveLength(1);
		expect(result[0].upstream).toBe("origin/main");
		expect(result[0].ahead).toBe(3);
		expect(result[0].behind).toBe(2);
	});

	it("should parse ahead-only tracking", () => {
		const output =
			" \x1Efeature\x1Eabc123\x1Eorigin/feature\x1Eahead 5\x1ETest";

		const result = parseBranchList(output);

		expect(result[0].ahead).toBe(5);
		expect(result[0].behind).toBeUndefined();
	});

	it("should parse behind-only tracking", () => {
		const output =
			" \x1Efeature\x1Eabc123\x1Eorigin/feature\x1Ebehind 3\x1ETest";

		const result = parseBranchList(output);

		expect(result[0].ahead).toBeUndefined();
		expect(result[0].behind).toBe(3);
	});

	it("should handle branches without upstream", () => {
		const output = " \x1Elocal-only\x1Eabc123\x1E\x1E\x1ELocal branch";

		const result = parseBranchList(output);

		expect(result[0].upstream).toBeUndefined();
		expect(result[0].ahead).toBeUndefined();
		expect(result[0].behind).toBeUndefined();
	});
});

describe("parseDiffNumstat", () => {
	it("should return empty diff for empty output", () => {
		const result = parseDiffNumstat("");

		expect(result.files).toHaveLength(0);
		expect(result.totalAdditions).toBe(0);
		expect(result.totalDeletions).toBe(0);
	});

	it("should parse single file change", () => {
		const output = "10\t5\tsrc/index.ts";

		const result = parseDiffNumstat(output);

		expect(result.files).toHaveLength(1);
		expect(result.files[0].path).toBe("src/index.ts");
		expect(result.files[0].additions).toBe(10);
		expect(result.files[0].deletions).toBe(5);
		expect(result.totalAdditions).toBe(10);
		expect(result.totalDeletions).toBe(5);
	});

	it("should parse multiple file changes", () => {
		const output = `10\t5\tsrc/index.ts
20\t0\tsrc/new-file.ts
0\t15\tsrc/deleted.ts`;

		const result = parseDiffNumstat(output);

		expect(result.files).toHaveLength(3);
		expect(result.totalAdditions).toBe(30);
		expect(result.totalDeletions).toBe(20);
	});

	it("should detect added files (only additions)", () => {
		const output = "50\t0\tsrc/brand-new.ts";

		const result = parseDiffNumstat(output);

		expect(result.files[0].type).toBe("added");
	});

	it("should detect deleted files (only deletions)", () => {
		const output = "0\t30\tsrc/removed.ts";

		const result = parseDiffNumstat(output);

		expect(result.files[0].type).toBe("deleted");
	});

	it("should detect modified files", () => {
		const output = "15\t10\tsrc/modified.ts";

		const result = parseDiffNumstat(output);

		expect(result.files[0].type).toBe("modified");
	});

	it("should handle binary files", () => {
		const output = "-\t-\timage.png";

		const result = parseDiffNumstat(output);

		expect(result.files).toHaveLength(1);
		expect(result.files[0].path).toBe("image.png");
		expect(result.files[0].binary).toBe(true);
		expect(result.files[0].additions).toBe(0);
		expect(result.files[0].deletions).toBe(0);
	});

	it("should handle renamed files with arrow syntax", () => {
		const output = "5\t3\told-name.ts => new-name.ts";

		const result = parseDiffNumstat(output);

		expect(result.files[0].type).toBe("renamed");
		expect(result.files[0].path).toBe("new-name.ts");
		expect(result.files[0].originalPath).toBe("old-name.ts");
	});

	it("should handle renamed files with brace syntax", () => {
		const output = "5\t3\tsrc/{old-dir => new-dir}/file.ts";

		const result = parseDiffNumstat(output);

		expect(result.files[0].type).toBe("renamed");
		expect(result.files[0].path).toBe("src/new-dir/file.ts");
		expect(result.files[0].originalPath).toBe("src/old-dir/file.ts");
	});

	it("should handle files with spaces in path", () => {
		const output = "10\t5\tpath/with spaces/file.ts";

		const result = parseDiffNumstat(output);

		expect(result.files[0].path).toBe("path/with spaces/file.ts");
	});
});

describe("parseDiffNameOnly", () => {
	it("should return empty array for empty output", () => {
		const result = parseDiffNameOnly("");
		expect(result).toHaveLength(0);
	});

	it("should parse single file", () => {
		const output = "src/index.ts";

		const result = parseDiffNameOnly(output);

		expect(result).toHaveLength(1);
		expect(result[0]).toBe("src/index.ts");
	});

	it("should parse multiple files", () => {
		const output = `src/index.ts
src/utils.ts
package.json`;

		const result = parseDiffNameOnly(output);

		expect(result).toHaveLength(3);
		expect(result).toContain("src/index.ts");
		expect(result).toContain("src/utils.ts");
		expect(result).toContain("package.json");
	});

	it("should trim whitespace", () => {
		const output = "  file.ts  \n  another.ts  ";

		const result = parseDiffNameOnly(output);

		expect(result[0]).toBe("file.ts");
		expect(result[1]).toBe("another.ts");
	});

	it("should filter empty lines", () => {
		const output = `file1.ts

file2.ts

`;

		const result = parseDiffNameOnly(output);

		expect(result).toHaveLength(2);
	});
});

describe("parseDiffNameStatus", () => {
	it("should return empty diff for empty output", () => {
		const result = parseDiffNameStatus("");

		expect(result.files).toHaveLength(0);
	});

	it("should parse added files", () => {
		const output = "A\tsrc/new-file.ts";

		const result = parseDiffNameStatus(output);

		expect(result.files).toHaveLength(1);
		expect(result.files[0].type).toBe("added");
		expect(result.files[0].path).toBe("src/new-file.ts");
	});

	it("should parse deleted files", () => {
		const output = "D\tsrc/removed.ts";

		const result = parseDiffNameStatus(output);

		expect(result.files[0].type).toBe("deleted");
	});

	it("should parse modified files", () => {
		const output = "M\tsrc/changed.ts";

		const result = parseDiffNameStatus(output);

		expect(result.files[0].type).toBe("modified");
	});

	it("should parse type-changed files as modified", () => {
		const output = "T\tsrc/type-changed.ts";

		const result = parseDiffNameStatus(output);

		expect(result.files[0].type).toBe("modified");
	});

	it("should parse renamed files", () => {
		const output = "R100\told-name.ts\tnew-name.ts";

		const result = parseDiffNameStatus(output);

		expect(result.files[0].type).toBe("renamed");
		expect(result.files[0].path).toBe("new-name.ts");
		expect(result.files[0].originalPath).toBe("old-name.ts");
	});

	it("should parse copied files", () => {
		const output = "C85\toriginal.ts\tcopy.ts";

		const result = parseDiffNameStatus(output);

		expect(result.files[0].type).toBe("copied");
		expect(result.files[0].path).toBe("copy.ts");
		expect(result.files[0].originalPath).toBe("original.ts");
	});

	it("should parse multiple changes", () => {
		const output = `A\tsrc/new.ts
M\tsrc/modified.ts
D\tsrc/deleted.ts
R100\told.ts\tnew.ts`;

		const result = parseDiffNameStatus(output);

		expect(result.files).toHaveLength(4);
		expect(result.files[0].type).toBe("added");
		expect(result.files[1].type).toBe("modified");
		expect(result.files[2].type).toBe("deleted");
		expect(result.files[3].type).toBe("renamed");
	});

	it("should have zero additions/deletions (name-status does not include stats)", () => {
		const output = "M\tsrc/file.ts";

		const result = parseDiffNameStatus(output);

		expect(result.files[0].additions).toBe(0);
		expect(result.files[0].deletions).toBe(0);
		expect(result.totalAdditions).toBe(0);
		expect(result.totalDeletions).toBe(0);
	});
});

describe("parseWorktreeList", () => {
	it("should return empty array for empty output", () => {
		const result = parseWorktreeList("");
		expect(result).toHaveLength(0);
	});

	it("should parse single main worktree", () => {
		const output = `worktree /home/user/project
HEAD abc123def456
branch refs/heads/main`;

		const result = parseWorktreeList(output);

		expect(result).toHaveLength(1);
		expect(result[0].path).toBe("/home/user/project");
		expect(result[0].head).toBe("abc123def456");
		expect(result[0].branch).toBe("main");
		expect(result[0].main).toBe(true);
		expect(result[0].detached).toBe(false);
	});

	it("should parse multiple worktrees", () => {
		const output = `worktree /home/user/project
HEAD abc123
branch refs/heads/main

worktree /home/user/project-feature
HEAD def456
branch refs/heads/feature`;

		const result = parseWorktreeList(output);

		expect(result).toHaveLength(2);
		expect(result[0].main).toBe(true);
		expect(result[0].branch).toBe("main");
		expect(result[1].main).toBe(false);
		expect(result[1].branch).toBe("feature");
	});

	it("should handle detached HEAD", () => {
		const output = `worktree /home/user/project
HEAD abc123
detached`;

		const result = parseWorktreeList(output);

		expect(result[0].detached).toBe(true);
		expect(result[0].branch).toBeUndefined();
	});

	it("should handle bare worktree", () => {
		const output = `worktree /home/user/project.git
HEAD abc123
bare`;

		const result = parseWorktreeList(output);

		expect(result[0].bare).toBe(true);
	});

	it("should handle locked worktree", () => {
		const output = `worktree /home/user/project
HEAD abc123
branch refs/heads/main
locked work in progress`;

		const result = parseWorktreeList(output);

		expect(result[0].locked).toBe(true);
		expect(result[0].lockReason).toBe("work in progress");
	});

	it("should handle locked worktree without reason", () => {
		const output = `worktree /home/user/project
HEAD abc123
branch refs/heads/main
locked`;

		const result = parseWorktreeList(output);

		expect(result[0].locked).toBe(true);
		expect(result[0].lockReason).toBeUndefined();
	});

	it("should handle prunable worktree", () => {
		const output = `worktree /home/user/old-worktree
HEAD abc123
branch refs/heads/old-branch
prunable`;

		const result = parseWorktreeList(output);

		expect(result[0].prunable).toBe(true);
	});

	it("should handle complex real-world output", () => {
		const output = `worktree /home/user/project
HEAD abc123def
branch refs/heads/main

worktree /home/user/project-feature
HEAD def456789
branch refs/heads/feature/my-feature

worktree /home/user/project-hotfix
HEAD 789abcdef
detached

worktree /home/user/project-locked
HEAD 111222333
branch refs/heads/locked-branch
locked editing critical files`;

		const result = parseWorktreeList(output);

		expect(result).toHaveLength(4);
		expect(result[0].main).toBe(true);
		expect(result[1].branch).toBe("feature/my-feature");
		expect(result[2].detached).toBe(true);
		expect(result[3].locked).toBe(true);
		expect(result[3].lockReason).toBe("editing critical files");
	});
});

describe("parseStashList", () => {
	it("should return empty array for empty output", () => {
		const result = parseStashList("");
		expect(result).toHaveLength(0);
	});

	it("should parse single stash entry", () => {
		const output =
			"stash@{0}\x1EWIP on main: abc123 Initial commit\x1E2024-01-15T10:30:00Z";

		const result = parseStashList(output);

		expect(result).toHaveLength(1);
		expect(result[0].index).toBe(0);
		expect(result[0].ref).toBe("stash@{0}");
		expect(result[0].branch).toBe("main");
		expect(result[0].message).toBe("WIP on main: abc123 Initial commit");
		expect(result[0].date).toBeInstanceOf(Date);
	});

	it("should parse multiple stash entries", () => {
		const output = `stash@{0}\x1EWIP on main: abc123 Latest\x1E2024-01-15T12:00:00Z
stash@{1}\x1EWIP on feature: def456 Earlier\x1E2024-01-15T10:00:00Z
stash@{2}\x1EWIP on main: ghi789 Oldest\x1E2024-01-14T08:00:00Z`;

		const result = parseStashList(output);

		expect(result).toHaveLength(3);
		expect(result[0].index).toBe(0);
		expect(result[1].index).toBe(1);
		expect(result[2].index).toBe(2);
	});

	it("should extract branch from 'On branch' format", () => {
		const output =
			"stash@{0}\x1EOn feature-branch: my stash message\x1E2024-01-15T10:30:00Z";

		const result = parseStashList(output);

		expect(result[0].branch).toBe("feature-branch");
	});

	it("should handle custom stash message", () => {
		const output =
			"stash@{0}\x1EOn main: My custom stash message\x1E2024-01-15T10:30:00Z";

		const result = parseStashList(output);

		expect(result[0].message).toBe("On main: My custom stash message");
		expect(result[0].branch).toBe("main");
	});

	it("should default branch to unknown when not parseable", () => {
		const output =
			"stash@{0}\x1ESome weird message format\x1E2024-01-15T10:30:00Z";

		const result = parseStashList(output);

		expect(result[0].branch).toBe("unknown");
	});
});

describe("parseRemotes", () => {
	it("should return empty array for empty output", () => {
		const result = parseRemotes("");
		expect(result).toHaveLength(0);
	});

	it("should parse single remote with same fetch/push URLs", () => {
		const output = `origin\thttps://github.com/user/repo.git (fetch)
origin\thttps://github.com/user/repo.git (push)`;

		const result = parseRemotes(output);

		expect(result).toHaveLength(1);
		expect(result[0].name).toBe("origin");
		expect(result[0].fetchUrl).toBe("https://github.com/user/repo.git");
		expect(result[0].pushUrl).toBe("https://github.com/user/repo.git");
	});

	it("should parse remote with different fetch/push URLs", () => {
		const output = `origin\thttps://github.com/user/repo.git (fetch)
origin\tgit@github.com:user/repo.git (push)`;

		const result = parseRemotes(output);

		expect(result).toHaveLength(1);
		expect(result[0].fetchUrl).toBe("https://github.com/user/repo.git");
		expect(result[0].pushUrl).toBe("git@github.com:user/repo.git");
	});

	it("should parse multiple remotes", () => {
		const output = `origin\thttps://github.com/user/repo.git (fetch)
origin\thttps://github.com/user/repo.git (push)
upstream\thttps://github.com/upstream/repo.git (fetch)
upstream\thttps://github.com/upstream/repo.git (push)`;

		const result = parseRemotes(output);

		expect(result).toHaveLength(2);
		expect(result[0].name).toBe("origin");
		expect(result[1].name).toBe("upstream");
	});

	it("should handle SSH URLs", () => {
		const output = `origin\tgit@github.com:user/repo.git (fetch)
origin\tgit@github.com:user/repo.git (push)`;

		const result = parseRemotes(output);

		expect(result[0].fetchUrl).toBe("git@github.com:user/repo.git");
		expect(result[0].pushUrl).toBe("git@github.com:user/repo.git");
	});

	it("should handle fetch-only remote", () => {
		const output = "upstream\thttps://github.com/upstream/repo.git (fetch)";

		const result = parseRemotes(output);

		expect(result).toHaveLength(1);
		expect(result[0].fetchUrl).toBe("https://github.com/upstream/repo.git");
		// Push URL should fall back to fetch URL
		expect(result[0].pushUrl).toBe("https://github.com/upstream/repo.git");
	});
});

describe("detectGitError", () => {
	it("should detect NotARepository error", () => {
		const stderr =
			"fatal: not a git repository (or any of the parent directories): .git";

		const result = detectGitError(stderr);

		expect(result).toBe("NotARepository");
	});

	it("should detect BranchExists error", () => {
		const stderr = "fatal: A branch 'feature' already exists.";

		const result = detectGitError(stderr);

		expect(result).toBe("BranchExists");
	});

	it("should detect BranchExists error with 'named' variant", () => {
		// Note: Git may output different formats, pattern checks for "branch 'xxx' already exists"
		const stderr =
			"error: cannot create branch 'feature': branch 'feature' already exists";

		const result = detectGitError(stderr);

		expect(result).toBe("BranchExists");
	});

	it("should detect BranchNotFound error", () => {
		const stderr = "error: branch 'nonexistent' not found.";

		const result = detectGitError(stderr);

		expect(result).toBe("BranchNotFound");
	});

	it("should detect DirtyWorkingTree from 'please commit' message", () => {
		const stderr =
			"error: Your local changes to the following files would be overwritten by checkout:\n\tfile.txt\nPlease commit your changes or stash them before you switch branches.";

		const result = detectGitError(stderr);

		expect(result).toBe("DirtyWorkingTree");
	});

	it("should detect DirtyWorkingTree from 'uncommitted changes' message", () => {
		const stderr = "error: you have uncommitted changes.";

		const result = detectGitError(stderr);

		expect(result).toBe("DirtyWorkingTree");
	});

	it("should detect DirtyWorkingTree from 'would be overwritten' message", () => {
		const stderr = "error: your local changes would be overwritten by merge.";

		const result = detectGitError(stderr);

		expect(result).toBe("DirtyWorkingTree");
	});

	it("should detect MergeConflict error", () => {
		const stderr =
			"error: Automatic merge failed; fix conflicts and then commit the result.";

		const result = detectGitError(stderr);

		expect(result).toBe("MergeConflict");
	});

	it("should detect MergeConflict from 'merge conflict' message", () => {
		const stderr = "CONFLICT (content): Merge conflict in src/index.ts";

		const result = detectGitError(stderr);

		expect(result).toBe("MergeConflict");
	});

	it("should detect WorktreeExists error", () => {
		const stderr = "fatal: '/path/to/worktree' already exists";

		const result = detectGitError(stderr);

		expect(result).toBe("WorktreeExists");
	});

	it("should detect WorktreeNotFound error", () => {
		const stderr = "fatal: '/path/to/worktree' is not a working tree";

		const result = detectGitError(stderr);

		expect(result).toBe("WorktreeNotFound");
	});

	it("should detect WorktreeNotFound from 'not registered' message", () => {
		const stderr = "fatal: '/path/to/worktree' is not registered";

		const result = detectGitError(stderr);

		expect(result).toBe("WorktreeNotFound");
	});

	it("should detect StashNotFound error", () => {
		const stderr = "error: No stash entries found.";

		const result = detectGitError(stderr);

		expect(result).toBe("StashNotFound");
	});

	it("should detect StashNotFound from specific stash reference", () => {
		const stderr = "error: stash@{5}: not found";

		const result = detectGitError(stderr);

		expect(result).toBe("StashNotFound");
	});

	it("should return CommandFailed for unknown errors", () => {
		const stderr = "fatal: some unknown git error occurred";

		const result = detectGitError(stderr);

		expect(result).toBe("CommandFailed");
	});

	it("should return CommandFailed for empty string", () => {
		const result = detectGitError("");

		expect(result).toBe("CommandFailed");
	});
});

describe("Format constants", () => {
	it("LOG_FORMAT should contain expected separators", () => {
		expect(LOG_FORMAT).toContain("%x1E"); // Record separator
		expect(LOG_FORMAT).toContain("%x1D"); // Group separator
		expect(LOG_FORMAT).toContain("%H"); // Full hash
		expect(LOG_FORMAT).toContain("%h"); // Short hash
		expect(LOG_FORMAT).toContain("%an"); // Author name
		expect(LOG_FORMAT).toContain("%ae"); // Author email
		expect(LOG_FORMAT).toContain("%s"); // Subject
	});

	it("BRANCH_FORMAT should contain expected fields", () => {
		expect(BRANCH_FORMAT).toContain("%x1E"); // Record separator
		expect(BRANCH_FORMAT).toContain("%(HEAD)"); // Current branch indicator
		expect(BRANCH_FORMAT).toContain("%(refname:short)"); // Branch name
		expect(BRANCH_FORMAT).toContain("%(objectname:short)"); // Commit hash
		expect(BRANCH_FORMAT).toContain("%(upstream:short)"); // Upstream
	});

	it("STASH_FORMAT should contain expected fields", () => {
		expect(STASH_FORMAT).toContain("%x1E"); // Record separator
		expect(STASH_FORMAT).toContain("%gd"); // Stash ref
		expect(STASH_FORMAT).toContain("%gs"); // Stash subject
		expect(STASH_FORMAT).toContain("%aI"); // ISO date
	});
});
