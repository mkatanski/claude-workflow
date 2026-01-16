/**
 * Checklist builder helper factories for workflow steps.
 */

import type {
	ChecklistItem,
	StepDefinition,
	WorkflowBuilder,
} from "../../../../src/types/index.ts";

/**
 * Options for checklist step.
 */
export interface ChecklistOptions {
	output?: string;
	onError?: "stop" | "continue";
}

/**
 * Create a generic checklist step.
 */
export function createChecklist(
	t: WorkflowBuilder,
	label: string,
	items: ChecklistItem[],
	options: ChecklistOptions = {},
): StepDefinition {
	return t.step(`${label} checklist`, t.checklist(items), {
		output: options.output,
		onError: options.onError ?? "continue",
	});
}

/**
 * Pre-built checklist for code quality checks.
 */
export function codeQualityChecklist(
	t: WorkflowBuilder,
	options: ChecklistOptions = {},
): StepDefinition {
	return createChecklist(
		t,
		"Code quality",
		[
			{
				name: "No console.log left",
				command:
					'git diff --cached --name-only | xargs grep -l "console.log" 2>/dev/null && echo fail || echo pass',
				expectedPattern: "pass",
			},
		],
		options,
	);
}

/**
 * Pre-built checklist for test coverage.
 */
export function testCoverageChecklist(
	t: WorkflowBuilder,
	options: ChecklistOptions = {},
): StepDefinition {
	return createChecklist(
		t,
		"Test coverage",
		[
			{
				name: "Tests cover new code",
				command:
					'git diff --cached --name-only | grep -E "\\.(test|spec)\\." && echo pass || echo warn',
				expectedPattern: "pass",
			},
		],
		options,
	);
}

/**
 * Pre-built checklist for pre-commit checks.
 */
export function preCommitChecklist(
	t: WorkflowBuilder,
	options: ChecklistOptions = {},
): StepDefinition {
	return createChecklist(
		t,
		"Pre-commit",
		[
			{
				name: "No merge conflicts",
				command:
					'git diff --check 2>&1 | grep -q "conflict" && echo fail || echo pass',
				expectedPattern: "pass",
			},
		],
		options,
	);
}

/**
 * Pre-built checklist for milestone planning.
 */
export function milestonePlanningChecklist(
	t: WorkflowBuilder,
	goalsVar = "milestone_goals",
	options: ChecklistOptions = {},
): StepDefinition {
	return createChecklist(
		t,
		"Milestone planning",
		[
			{
				name: "Milestone scope defined",
				command: `[ -n "{${goalsVar}}" ] && echo pass || echo fail`,
				expectedPattern: "pass",
			},
		],
		options,
	);
}

/**
 * Pre-built checklist for milestone completion.
 */
export function milestoneCompletionChecklist(
	t: WorkflowBuilder,
	storiesCountVar = "stories_count",
	options: ChecklistOptions = {},
): StepDefinition {
	return createChecklist(
		t,
		"Milestone completion",
		[
			{
				name: "Stories implemented",
				command: `[ "{${storiesCountVar}}" -gt "0" ] && echo pass || echo fail`,
				expectedPattern: "pass",
			},
		],
		options,
	);
}

/**
 * Pre-built checklist for story pre-implementation.
 */
export function storyPreImplementationChecklist(
	t: WorkflowBuilder,
	storyVar = "current_story",
	options: ChecklistOptions = {},
): StepDefinition {
	return createChecklist(
		t,
		"Pre-implementation",
		[
			{
				name: "Story has clear acceptance criteria",
				command: `echo "{${storyVar}}" | grep -qi "acceptance" && echo pass || echo warn`,
				expectedPattern: "pass",
			},
		],
		options,
	);
}

/**
 * Pre-built checklist for architecture verification.
 */
export function architectureChecklist(
	t: WorkflowBuilder,
	outputDir = "{output_dir}",
	options: ChecklistOptions = {},
): StepDefinition {
	return createChecklist(
		t,
		"Architecture",
		[
			{
				name: "Architecture document up to date",
				command: `[ -f "${outputDir}/architecture.md" ] && echo pass || echo fail`,
				expectedPattern: "pass",
			},
		],
		options,
	);
}
