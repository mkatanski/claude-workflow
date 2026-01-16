/**
 * Git operation helper factories for workflow steps.
 */

import type {
	StepDefinition,
	WorkflowBuilder,
} from "../../../../src/types/index.ts";

/**
 * Options for git step.
 */
export interface GitStepOptions {
	output?: string;
	when?: string;
	onError?: "stop" | "continue";
	visible?: boolean;
}

/**
 * Get the current branch name.
 */
export function gitGetCurrentBranch(
	t: WorkflowBuilder,
	outputVar = "current_branch",
): StepDefinition {
	return t.step("Get current branch", t.bash("git branch --show-current"), {
		output: outputVar,
	});
}

/**
 * Check for uncommitted changes.
 */
export function gitHasUncommittedChanges(
	t: WorkflowBuilder,
	outputVar = "has_uncommitted_changes",
): StepDefinition {
	return t.step(
		"Check uncommitted changes",
		t.bash('[ -n "$(git status --porcelain)" ] && echo true || echo false'),
		{ output: outputVar },
	);
}

/**
 * Options for stash step.
 */
export interface GitStashOptions {
	when?: string;
	message?: string;
}

/**
 * Stash changes with an auto-generated message.
 */
export function gitStashChanges(
	t: WorkflowBuilder,
	options: GitStashOptions = {},
): StepDefinition {
	const message =
		options.message ?? "epic-workflow-auto-stash-$(date +%Y%m%d-%H%M%S)";
	return t.step(
		"Stash uncommitted changes",
		t.bash(`git stash push -m "${message}" && echo "Changes stashed"`),
		{ when: options.when },
	);
}

/**
 * Create and checkout a new branch.
 */
export function gitCheckoutNewBranch(
	t: WorkflowBuilder,
	branchNameVar: string,
	options: GitStepOptions = {},
): StepDefinition {
	return t.step(
		"Create feature branch",
		t.bash(`git checkout -b {${branchNameVar}}
echo "Created and switched to branch: {${branchNameVar}}"`),
		{ visible: options.visible ?? true, when: options.when },
	);
}

/**
 * Stage all changes.
 */
export function gitStageAll(
	t: WorkflowBuilder,
	options: GitStepOptions = {},
): StepDefinition {
	return t.step("Stage all changes", t.bash("git add -A"), {
		when: options.when,
	});
}

/**
 * Commit with a message from a variable.
 */
export function gitCommit(
	t: WorkflowBuilder,
	messageVar: string,
	options: GitStepOptions = {},
): StepDefinition {
	return t.step(
		"Commit changes",
		t.bash(`git commit -m "{${messageVar}}" || echo "Nothing to commit"`),
		{ onError: options.onError ?? "continue", when: options.when },
	);
}

/**
 * Create an annotated tag.
 */
export function gitCreateTag(
	t: WorkflowBuilder,
	tagName: string,
	message: string,
	options: GitStepOptions = {},
): StepDefinition {
	return t.step(
		`Create tag: ${tagName}`,
		t.bash(
			`git tag -a "${tagName}" -m "${message}" 2>/dev/null || echo "Tag exists"`,
		),
		{ onError: options.onError ?? "continue", when: options.when },
	);
}

/**
 * Get the current commit SHA (short form).
 */
export function gitGetCommitSha(
	t: WorkflowBuilder,
	outputVar = "commit_sha",
): StepDefinition {
	return t.step(
		"Get commit SHA",
		t.bash("git rev-parse --short HEAD 2>/dev/null || echo 'unknown'"),
		{ output: outputVar },
	);
}

/**
 * Generate a branch name from an epic title.
 */
export function gitGenerateBranchName(
	t: WorkflowBuilder,
	titleVar: string,
	outputVar = "branch_name",
): StepDefinition {
	return t.step(
		"Generate branch name",
		t.bash(`TITLE=$(echo "{${titleVar}}" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-' | sed 's/--*/-/g' | sed 's/^-//' | sed 's/-$//' | cut -c1-25)
TIMESTAMP=$(date +%Y%m%d)
echo "feature/\${TIMESTAMP}-\${TITLE}"`),
		{ output: outputVar },
	);
}

/**
 * Check if there are changes to commit.
 */
export function gitHasChangesToCommit(
	t: WorkflowBuilder,
	outputVar = "has_changes",
): StepDefinition {
	return t.step(
		"Check for staged changes",
		t.bash(
			'[ -n "$(git diff --cached --name-only)" ] && echo true || echo false',
		),
		{ output: outputVar },
	);
}

/**
 * Get diff of staged and unstaged changes.
 */
export function gitGetDiff(
	t: WorkflowBuilder,
	outputVar = "git_diff",
): StepDefinition {
	return t.step(
		"Get git diff",
		t.bash("git diff HEAD 2>/dev/null || echo ''"),
		{
			output: outputVar,
		},
	);
}
