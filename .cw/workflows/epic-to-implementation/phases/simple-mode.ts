/**
 * Simple Mode Phase
 *
 * V1-style single-pass execution for smaller epics:
 * - Analyze epic and create architecture
 * - Generate stories
 * - Implement all stories
 * - Run post-stories phase
 */

import type {
	StepDefinition,
	WorkflowBuilder,
} from "../../../../src/types/index.ts";
import {
	claudeExtractTitle,
	claudeSkill,
	countArray,
	extractField,
	gitCheckoutNewBranch,
	gitGenerateBranchName,
	gitGetCurrentBranch,
	gitHasUncommittedChanges,
	gitStashChanges,
	logPhase,
	readFile,
	saveFile,
} from "../helpers/index.ts";
import { postStoriesPhase } from "./post-stories.ts";
import { storyLoopSteps } from "./story-loop.ts";

/**
 * Generate steps for simple mode execution.
 */
export function simpleModeSteps(t: WorkflowBuilder): StepDefinition[] {
	return [
		logPhase(t, "SIMPLE MODE: Single-pass execution"),

		// Analyze epic
		claudeSkill(
			t,
			"analyze-epic",
			`Use the /analyze-epic skill to analyze this feature request and create a structured epic description.

## Input Prompt
{epic_prompt_content}

Save the FULL markdown document to: {temp_dir}/epic-description.md
Output only "SAVED" when done.`,
			{ model: "opus" },
		),

		// Read epic description
		readFile(t, "epic description (simple)", "{temp_dir}/epic-description.md", {
			output: "epic_description",
		}),

		// Save epic description
		saveFile(
			t,
			"epic description",
			"{output_dir}/epic-description.md",
			"epic_description",
		),

		// Extract epic title
		claudeExtractTitle(t, "epic_description"),

		// Parse epic title
		extractField(t, "epic title (simple)", "epic_title_json", "title", {
			output: "epic_title",
		}),

		// Generate branch name
		gitGenerateBranchName(t, "epic_title"),

		// Git status check
		gitGetCurrentBranch(t, "original_branch"),
		gitHasUncommittedChanges(t),

		// Stash if needed
		gitStashChanges(t, { when: "{has_uncommitted_changes} == true" }),

		// Create feature branch
		gitCheckoutNewBranch(t, "branch_name"),

		// Create architecture
		claudeSkill(
			t,
			"create-architecture",
			`Use the /create-architecture skill to create an architectural document for this epic.

## Epic Description
{epic_description}

## Codebase Structure
{codebase_structure}

Save the FULL markdown document to: {temp_dir}/architecture.md
Output only "SAVED" when done.`,
			{ model: "opus" },
		),

		// Read architecture
		readFile(t, "architecture (simple)", "{temp_dir}/architecture.md", {
			output: "architecture_document",
		}),

		// Save architecture
		saveFile(
			t,
			"architecture document",
			"{output_dir}/architecture.md",
			"architecture_document",
		),

		// Generate stories
		claudeSkill(
			t,
			"generate-stories",
			`Use the /generate-stories skill to create implementation stories.

## Epic Description
{epic_description}

## Architecture Document
{architecture_document}

Save the FULL JSON array to: {temp_dir}/stories.json
Output only "SAVED" when done.`,
			{ model: "opus" },
		),

		// Read stories
		readFile(t, "stories (simple)", "{temp_dir}/stories.json", {
			output: "stories_raw",
		}),

		// Save stories
		saveFile(t, "stories", "{output_dir}/stories.json", "stories_raw"),

		// Parse stories count
		countArray(t, "stories (simple)", "stories_raw", {
			output: "stories_count",
		}),

		// Store stories for iteration
		t.step(
			"Store stories for iteration (simple)",
			t.set("stories_json", "{stories_raw}"),
		),

		// Log ready
		t.step(
			"Log simple mode ready",
			t.bash(`echo ""
echo "Simple mode ready"
echo "Stories to implement: {stories_count}"
echo ""`),
			{ visible: true },
		),

		// Story loop
		...storyLoopSteps(t),

		// Post-stories phase
		...postStoriesPhase(t),
	];
}
