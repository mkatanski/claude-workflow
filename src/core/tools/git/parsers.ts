/**
 * Git output parsers.
 *
 * Provides parsing functions for various Git CLI output formats
 * including porcelain, log, branch, diff, worktree, and stash outputs.
 */

import type {
	GitStatus,
	GitFileStatus,
	GitBranch,
	GitCommit,
	GitDiff,
	GitDiffFile,
	GitWorktree,
	GitStashEntry,
	GitRemote,
} from "./types.ts";

// =============================================================================
// Status Parsing
// =============================================================================

/**
 * Parse git status --porcelain=v2 --branch output.
 *
 * Porcelain v2 format:
 * - Branch line: # branch.oid <commit>
 * - Branch line: # branch.head <branch>
 * - Branch line: # branch.upstream <upstream>
 * - Branch line: # branch.ab +<ahead> -<behind>
 * - Changed entry: 1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>
 * - Renamed entry: 2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <path><TAB><origPath>
 * - Unmerged entry: u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>
 * - Untracked entry: ? <path>
 * - Ignored entry: ! <path>
 *
 * @param output - Raw output from git status --porcelain=v2 --branch
 * @returns Parsed GitStatus object
 */
export function parseStatusPorcelain(output: string): GitStatus {
	const lines = output.split("\n").filter((line) => line.length > 0);

	let branch = "HEAD";
	let upstream: string | undefined;
	let ahead = 0;
	let behind = 0;
	const staged: GitFileStatus[] = [];
	const unstaged: GitFileStatus[] = [];
	const untracked: string[] = [];

	for (const line of lines) {
		// Branch header lines
		if (line.startsWith("# branch.head ")) {
			branch = line.substring("# branch.head ".length);
			continue;
		}

		if (line.startsWith("# branch.upstream ")) {
			upstream = line.substring("# branch.upstream ".length);
			continue;
		}

		if (line.startsWith("# branch.ab ")) {
			const match = line.match(/# branch\.ab \+(\d+) -(\d+)/);
			if (match) {
				ahead = Number.parseInt(match[1], 10);
				behind = Number.parseInt(match[2], 10);
			}
			continue;
		}

		// Skip other header lines
		if (line.startsWith("#")) {
			continue;
		}

		// Untracked files
		if (line.startsWith("? ")) {
			untracked.push(line.substring(2));
			continue;
		}

		// Ignored files (skip)
		if (line.startsWith("! ")) {
			continue;
		}

		// Changed entry (1 XY ...)
		if (line.startsWith("1 ")) {
			const parts = line.split(" ");
			if (parts.length >= 9) {
				const xy = parts[1];
				const path = parts.slice(8).join(" ");
				const indexStatus = xy[0];
				const workTreeStatus = xy[1];

				if (indexStatus !== ".") {
					staged.push({
						path,
						index: indexStatus,
						workingTree: ".",
					});
				}

				if (workTreeStatus !== ".") {
					unstaged.push({
						path,
						index: ".",
						workingTree: workTreeStatus,
					});
				}
			}
			continue;
		}

		// Renamed/copied entry (2 XY ...)
		if (line.startsWith("2 ")) {
			const tabIndex = line.indexOf("\t");
			if (tabIndex !== -1) {
				const beforeTab = line.substring(0, tabIndex);
				const afterTab = line.substring(tabIndex + 1);
				const parts = beforeTab.split(" ");

				if (parts.length >= 9) {
					const xy = parts[1];
					const path = parts.slice(9).join(" ");
					const originalPath = afterTab;
					const indexStatus = xy[0];
					const workTreeStatus = xy[1];

					if (indexStatus !== ".") {
						staged.push({
							path,
							index: indexStatus,
							workingTree: ".",
							originalPath,
						});
					}

					if (workTreeStatus !== ".") {
						unstaged.push({
							path,
							index: ".",
							workingTree: workTreeStatus,
							originalPath,
						});
					}
				}
			}
			continue;
		}

		// Unmerged entry (u XY ...)
		if (line.startsWith("u ")) {
			const parts = line.split(" ");
			if (parts.length >= 11) {
				const xy = parts[1];
				const path = parts.slice(10).join(" ");

				// Unmerged files are in both staged and unstaged
				staged.push({
					path,
					index: xy[0],
					workingTree: xy[1],
				});
			}
		}
	}

	const isClean =
		staged.length === 0 && unstaged.length === 0 && untracked.length === 0;

	return {
		branch,
		upstream,
		ahead,
		behind,
		staged,
		unstaged,
		untracked,
		isClean,
	};
}

// =============================================================================
// Log Parsing
// =============================================================================

/**
 * Log format used for parsing.
 * Fields separated by record separator (0x1E), commits separated by group separator (0x1D).
 */
export const LOG_FORMAT =
	"%H%x1E%h%x1E%an%x1E%ae%x1E%aI%x1E%s%x1E%b%x1E%P%x1D";

/**
 * Parse git log output with custom format.
 *
 * @param output - Raw output from git log --format=LOG_FORMAT
 * @returns Array of parsed GitCommit objects
 */
export function parseLogOutput(output: string): GitCommit[] {
	if (!output.trim()) {
		return [];
	}

	const commits: GitCommit[] = [];
	const recordSeparator = "\x1E";
	const groupSeparator = "\x1D";

	// Split by group separator and filter empty entries
	const entries = output.split(groupSeparator).filter((entry) => entry.trim());

	for (const entry of entries) {
		const parts = entry.trim().split(recordSeparator);

		if (parts.length >= 6) {
			const [hash, shortHash, author, email, dateStr, subject, body, parents] =
				parts;

			commits.push({
				hash: hash.trim(),
				shortHash: shortHash.trim(),
				author: author.trim(),
				email: email.trim(),
				date: new Date(dateStr.trim()),
				subject: subject.trim(),
				body: body?.trim() || undefined,
				parents: parents?.trim()
					? parents.trim().split(" ").filter(Boolean)
					: undefined,
			});
		}
	}

	return commits;
}

// =============================================================================
// Branch Parsing
// =============================================================================

/**
 * Branch format used for parsing.
 * Fields separated by record separator (0x1E), branches separated by newlines.
 */
export const BRANCH_FORMAT =
	"%(HEAD)%x1E%(refname:short)%x1E%(objectname:short)%x1E%(upstream:short)%x1E%(upstream:track,nobracket)%x1E%(contents:subject)";

/**
 * Parse git branch output with custom format.
 *
 * @param output - Raw output from git branch --format=BRANCH_FORMAT
 * @returns Array of parsed GitBranch objects
 */
export function parseBranchList(output: string): GitBranch[] {
	if (!output.trim()) {
		return [];
	}

	const branches: GitBranch[] = [];
	const recordSeparator = "\x1E";
	const lines = output.split("\n").filter((line) => line.trim());

	for (const line of lines) {
		const parts = line.split(recordSeparator);

		if (parts.length >= 3) {
			const [headMarker, name, commit, upstream, track, message] = parts;

			const current = headMarker.trim() === "*";

			// Parse upstream tracking info (e.g., "ahead 3, behind 2" or "ahead 3" or "behind 2")
			let ahead: number | undefined;
			let behind: number | undefined;

			if (track) {
				const aheadMatch = track.match(/ahead (\d+)/);
				const behindMatch = track.match(/behind (\d+)/);

				if (aheadMatch) {
					ahead = Number.parseInt(aheadMatch[1], 10);
				}
				if (behindMatch) {
					behind = Number.parseInt(behindMatch[1], 10);
				}
			}

			branches.push({
				name: name.trim(),
				current,
				commit: commit.trim(),
				upstream: upstream?.trim() || undefined,
				ahead,
				behind,
				message: message?.trim() || undefined,
			});
		}
	}

	return branches;
}

// =============================================================================
// Diff Parsing
// =============================================================================

/**
 * Parse git diff --numstat output.
 *
 * Format: <additions>\t<deletions>\t<path>
 * For binary files: -\t-\t<path>
 * For renames: <additions>\t<deletions>\t<oldPath> => <newPath>
 *
 * @param output - Raw output from git diff --numstat
 * @returns Parsed GitDiff object
 */
export function parseDiffNumstat(output: string): GitDiff {
	if (!output.trim()) {
		return {
			files: [],
			totalAdditions: 0,
			totalDeletions: 0,
		};
	}

	const files: GitDiffFile[] = [];
	let totalAdditions = 0;
	let totalDeletions = 0;

	const lines = output.split("\n").filter((line) => line.trim());

	for (const line of lines) {
		const parts = line.split("\t");

		if (parts.length >= 3) {
			const [addStr, delStr, ...pathParts] = parts;
			let path = pathParts.join("\t");
			let originalPath: string | undefined;
			let type: GitDiffFile["type"] = "modified";

			// Handle binary files
			const binary = addStr === "-" && delStr === "-";
			const additions = binary ? 0 : Number.parseInt(addStr, 10);
			const deletions = binary ? 0 : Number.parseInt(delStr, 10);

			// Handle renames (path contains " => ")
			if (path.includes(" => ")) {
				const renameParts = path.split(" => ");
				if (renameParts.length === 2) {
					// Handle paths in braces like {old => new}/file
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

			// Determine type based on additions/deletions if not already set
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

	return {
		files,
		totalAdditions,
		totalDeletions,
	};
}

/**
 * Parse git diff --name-only output.
 *
 * @param output - Raw output from git diff --name-only
 * @returns Array of file paths
 */
export function parseDiffNameOnly(output: string): string[] {
	if (!output.trim()) {
		return [];
	}

	return output
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
}

/**
 * Parse git diff --name-status output.
 *
 * Format: <status>\t<path> or <status>\t<oldPath>\t<newPath> for renames
 * Status codes: A=added, D=deleted, M=modified, R=renamed, C=copied, T=type change
 *
 * @param output - Raw output from git diff --name-status
 * @returns Parsed GitDiff object
 */
export function parseDiffNameStatus(output: string): GitDiff {
	if (!output.trim()) {
		return {
			files: [],
			totalAdditions: 0,
			totalDeletions: 0,
		};
	}

	const files: GitDiffFile[] = [];
	const lines = output.split("\n").filter((line) => line.trim());

	for (const line of lines) {
		const parts = line.split("\t");

		if (parts.length >= 2) {
			const statusCode = parts[0];
			let path: string;
			let originalPath: string | undefined;
			let type: GitDiffFile["type"];

			// Handle rename/copy with percentage (e.g., R100, C85)
			const baseStatus = statusCode[0];

			switch (baseStatus) {
				case "A":
					type = "added";
					path = parts[1];
					break;
				case "D":
					type = "deleted";
					path = parts[1];
					break;
				case "M":
				case "T":
					type = "modified";
					path = parts[1];
					break;
				case "R":
					type = "renamed";
					originalPath = parts[1];
					path = parts[2] || parts[1];
					break;
				case "C":
					type = "copied";
					originalPath = parts[1];
					path = parts[2] || parts[1];
					break;
				default:
					type = "modified";
					path = parts[1];
			}

			files.push({
				path,
				type,
				originalPath,
				additions: 0,
				deletions: 0,
			});
		}
	}

	return {
		files,
		totalAdditions: 0,
		totalDeletions: 0,
	};
}

// =============================================================================
// Worktree Parsing
// =============================================================================

/**
 * Parse git worktree list --porcelain output.
 *
 * Porcelain format (blocks separated by blank lines):
 * worktree <path>
 * HEAD <commit>
 * branch refs/heads/<branch>
 * (or "detached" if no branch)
 * bare (if bare)
 * locked <reason> (if locked)
 * prunable <reason> (if prunable)
 *
 * @param output - Raw output from git worktree list --porcelain
 * @returns Array of parsed GitWorktree objects
 */
export function parseWorktreeList(output: string): GitWorktree[] {
	if (!output.trim()) {
		return [];
	}

	const worktrees: GitWorktree[] = [];

	// Split by double newline to get individual worktree blocks
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
				// First worktree is typically the main one
				main = worktrees.length === 0;
			} else if (line.startsWith("HEAD ")) {
				head = line.substring("HEAD ".length);
			} else if (line.startsWith("branch ")) {
				const refPath = line.substring("branch ".length);
				// Extract branch name from refs/heads/<branch>
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

// =============================================================================
// Stash Parsing
// =============================================================================

/**
 * Stash format used for parsing.
 * Fields separated by record separator (0x1E), entries separated by newlines.
 */
export const STASH_FORMAT = "%gd%x1E%gs%x1E%aI";

/**
 * Parse git stash list output with custom format.
 *
 * @param output - Raw output from git stash list --format=STASH_FORMAT
 * @returns Array of parsed GitStashEntry objects
 */
export function parseStashList(output: string): GitStashEntry[] {
	if (!output.trim()) {
		return [];
	}

	const entries: GitStashEntry[] = [];
	const recordSeparator = "\x1E";
	const lines = output.split("\n").filter((line) => line.trim());

	for (const line of lines) {
		const parts = line.split(recordSeparator);

		if (parts.length >= 2) {
			const [ref, message, dateStr] = parts;

			// Extract index from ref (e.g., "stash@{0}" -> 0)
			const indexMatch = ref.match(/stash@\{(\d+)\}/);
			const index = indexMatch ? Number.parseInt(indexMatch[1], 10) : 0;

			// Extract branch from message (format: "WIP on <branch>: <message>" or "On <branch>: <message>")
			let branch = "unknown";
			const branchMatch = message.match(/^(?:WIP )?[Oo]n ([^:]+):/);
			if (branchMatch) {
				branch = branchMatch[1];
			}

			entries.push({
				index,
				ref: ref.trim(),
				branch,
				message: message.trim(),
				date: dateStr ? new Date(dateStr.trim()) : new Date(),
			});
		}
	}

	return entries;
}

// =============================================================================
// Remote Parsing
// =============================================================================

/**
 * Parse git remote -v output.
 *
 * Format: <name>\t<url> (fetch) or <name>\t<url> (push)
 *
 * @param output - Raw output from git remote -v
 * @returns Array of parsed GitRemote objects
 */
export function parseRemotes(output: string): GitRemote[] {
	if (!output.trim()) {
		return [];
	}

	const remoteMap = new Map<
		string,
		{ fetchUrl?: string; pushUrl?: string }
	>();

	const lines = output.split("\n").filter((line) => line.trim());

	for (const line of lines) {
		// Format: name\turl (fetch|push)
		const match = line.match(/^(\S+)\t(\S+)\s+\((fetch|push)\)$/);

		if (match) {
			const [, name, url, type] = match;

			if (!remoteMap.has(name)) {
				remoteMap.set(name, {});
			}

			const remote = remoteMap.get(name)!;
			if (type === "fetch") {
				remote.fetchUrl = url;
			} else {
				remote.pushUrl = url;
			}
		}
	}

	const remotes: GitRemote[] = [];
	for (const [name, urls] of remoteMap) {
		remotes.push({
			name,
			fetchUrl: urls.fetchUrl ?? "",
			pushUrl: urls.pushUrl ?? urls.fetchUrl ?? "",
		});
	}

	return remotes;
}

// =============================================================================
// Error Parsing
// =============================================================================

/**
 * Git error patterns for detection.
 */
export const GIT_ERROR_PATTERNS = {
	notARepository: /not a git repository/i,
	branchExists: /branch '([^']+)' already exists/i,
	branchNotFound: /error: branch '([^']+)' not found/i,
	refNotFound:
		/pathspec '([^']+)' did not match any file\(s\) known to git|unknown revision or path not in the working tree/i,
	dirtyWorkingTree:
		/please commit your changes or stash them|you have uncommitted changes|your local changes would be overwritten/i,
	mergeConflict: /merge conflict|automatic merge failed/i,
	worktreeExists: /already exists/i,
	worktreeNotFound: /is not a working tree|is not registered/i,
	stashNotFound: /no stash entries found|stash@\{(\d+)\}: not found/i,
} as const;

/**
 * Detect Git error type from error message.
 *
 * @param stderr - Error output from Git command
 * @returns Detected error type or 'CommandFailed' as default
 */
export function detectGitError(
	stderr: string,
): import("./types.ts").GitErrorType {
	if (GIT_ERROR_PATTERNS.notARepository.test(stderr)) {
		return "NotARepository";
	}

	if (GIT_ERROR_PATTERNS.branchExists.test(stderr)) {
		return "BranchExists";
	}

	if (GIT_ERROR_PATTERNS.branchNotFound.test(stderr)) {
		return "BranchNotFound";
	}

	if (GIT_ERROR_PATTERNS.dirtyWorkingTree.test(stderr)) {
		return "DirtyWorkingTree";
	}

	if (GIT_ERROR_PATTERNS.mergeConflict.test(stderr)) {
		return "MergeConflict";
	}

	if (GIT_ERROR_PATTERNS.worktreeExists.test(stderr)) {
		return "WorktreeExists";
	}

	if (GIT_ERROR_PATTERNS.worktreeNotFound.test(stderr)) {
		return "WorktreeNotFound";
	}

	if (GIT_ERROR_PATTERNS.stashNotFound.test(stderr)) {
		return "StashNotFound";
	}

	return "CommandFailed";
}
