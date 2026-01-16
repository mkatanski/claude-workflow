/**
 * Claude step helper factories for workflow steps.
 */

import type {
	StepDefinition,
	WorkflowBuilder,
} from "../../../../src/types/index.ts";

/**
 * Options for Claude step.
 */
export interface ClaudeStepOptions {
	output?: string;
	model?: string;
	when?: string;
	onError?: "stop" | "continue";
}

/**
 * Invoke a Claude skill with context sections.
 */
export function claudeSkill(
	t: WorkflowBuilder,
	skillName: string,
	prompt: string,
	options: ClaudeStepOptions = {},
): StepDefinition {
	return t.step(`Run ${skillName}`, t.claude(prompt), {
		output: options.output,
		model: options.model ?? "opus",
		when: options.when,
		onError: options.onError,
	});
}

/**
 * Schema definition for Claude SDK extraction.
 */
export interface ExtractSchema {
	type: "object";
	properties: Record<string, { type: string; description: string }>;
	required: string[];
}

/**
 * Options for Claude SDK extraction.
 */
export interface ClaudeExtractOptions {
	output: string;
	model?: string;
	when?: string;
}

/**
 * Extract structured data using Claude SDK.
 */
export function claudeExtract(
	t: WorkflowBuilder,
	label: string,
	prompt: string,
	schema: ExtractSchema,
	options: ClaudeExtractOptions,
): StepDefinition {
	return t.step(
		label,
		t.claudeSdk({
			prompt,
			model: options.model ?? "haiku",
			schema: schema as unknown as Record<string, unknown>,
		}),
		{ output: options.output, when: options.when },
	);
}

/**
 * Generate a commit message using Claude SDK.
 */
export function claudeCommitMessage(
	t: WorkflowBuilder,
	contextPrompt: string,
	outputVar = "commit_msg_json",
): StepDefinition {
	return t.step(
		"Generate commit message",
		t.claudeSdk({
			prompt: contextPrompt,
			model: "haiku",
			schema: {
				type: "object",
				properties: {
					message: {
						type: "string",
						description: "Git commit message in conventional format",
					},
				},
				required: ["message"],
			},
		}),
		{ output: outputVar },
	);
}

/**
 * Generate a summary using Claude SDK.
 */
export function claudeSummary(
	t: WorkflowBuilder,
	contextPrompt: string,
	outputVar = "summary_json",
): StepDefinition {
	return t.step(
		"Generate summary",
		t.claudeSdk({
			prompt: contextPrompt,
			model: "haiku",
			schema: {
				type: "object",
				properties: {
					summary: {
						type: "string",
						description: "Brief summary of the work done",
					},
				},
				required: ["summary"],
			},
		}),
		{ output: outputVar },
	);
}

/**
 * Extract a branch-safe title from text.
 */
export function claudeExtractTitle(
	t: WorkflowBuilder,
	textVar: string,
	outputVar = "epic_title_json",
): StepDefinition {
	return t.step(
		"Extract epic title",
		t.claudeSdk({
			prompt: `Extract a short title from this epic description for use in a git branch name.

Epic:
{${textVar}}

Rules:
- Maximum 25 characters
- Lowercase letters and hyphens only
- Use hyphens instead of spaces
- Examples: "user-auth", "payment-flow", "dark-mode"`,
			model: "haiku",
			schema: {
				type: "object",
				properties: {
					title: {
						type: "string",
						description: "Branch-safe title (lowercase, hyphens, max 25 chars)",
					},
				},
				required: ["title"],
			},
		}),
		{ output: outputVar },
	);
}

/**
 * Invoke Claude to implement a story with antipatterns review.
 */
export function claudeImplementStory(
	t: WorkflowBuilder,
	storyIdVar: string,
	storyTitleVar: string,
	storyVar: string,
	architectureVar: string,
	options: ClaudeStepOptions = {},
): StepDefinition {
	return t.step(
		"Plan and implement story",
		t.claude(`Implement story {${storyIdVar}}: {${storyTitleVar}}

## Story Details
{${storyVar}}

## Architecture Context
{${architectureVar}}

## Known Antipatterns
Before implementing, use the /antipatterns skill to review known mistakes to avoid.

## Instructions
1. First, use /antipatterns to check for relevant patterns
2. Use /plan to create an implementation plan
3. After the plan is accepted, implement following /implement-story skill
4. Write tests for all new functionality
5. Run lint and fix any issues

Start by reviewing antipatterns, then use /plan.`),
		{
			output: options.output ?? "implementation_result",
			model: options.model ?? "opus",
			when: options.when,
		},
	);
}

/**
 * Invoke Claude to review code changes.
 */
export function claudeCodeReview(
	t: WorkflowBuilder,
	storyIdVar: string,
	storyTitleVar: string,
	implementationVar: string,
	options: ClaudeStepOptions = {},
): StepDefinition {
	return t.step(
		"Code review implementation",
		t.claude(`Use the /code-review skill to review changes for story {${storyIdVar}}: {${storyTitleVar}}

## Implementation Summary
{${implementationVar}}

FIX any issues found immediately. Do not just report issues.`),
		{
			output: options.output ?? "review_result",
			model: options.model ?? "opus",
			when: options.when,
		},
	);
}

/**
 * Invoke Claude to fix failing tests.
 */
export function claudeFixTests(
	t: WorkflowBuilder,
	storyIdVar: string,
	storyTitleVar: string,
	testOutputVar: string,
	lintOutputVar: string,
	options: ClaudeStepOptions = {},
): StepDefinition {
	return t.step(
		"Fix failing tests",
		t.claude(`Fix the failing tests for story {${storyIdVar}}: {${storyTitleVar}}

## Test Output
{${testOutputVar}}

## Lint Output
{${lintOutputVar}}

## Instructions
1. Use /plan to analyze failures
2. Apply fixes following /fix-tests skill
3. Do NOT disable tests`),
		{
			output: options.output ?? "test_fix_result",
			model: options.model ?? "opus",
			when: options.when,
		},
	);
}

/**
 * Invoke Claude to learn from a test failure.
 */
export function claudeLearnFromFailure(
	t: WorkflowBuilder,
	testOutputVar: string,
	testFixResultVar: string,
	options: ClaudeStepOptions = {},
): StepDefinition {
	return t.step(
		"Learn from test failure",
		t.claude(`Use the /learn-from-failure skill to extract learnings from this test failure.

## Original Error
{${testOutputVar}}

## Fix Applied
{${testFixResultVar}}

Update the appropriate antipatterns file with curated learnings.`),
		{
			output: options.output ?? "learning_summary",
			model: options.model ?? "haiku",
			when: options.when,
		},
	);
}
