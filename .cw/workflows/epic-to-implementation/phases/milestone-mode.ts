/**
 * Milestone Mode Phase
 *
 * Multi-pass execution for larger epics:
 * - Create high-level architecture
 * - Generate milestones
 * - Iterate through milestones with:
 *   - Refined architecture per milestone
 *   - Story generation and implementation
 *   - Drift checking and fixes
 *   - Milestone commits and tags
 */

import type {
	StepDefinition,
	WorkflowBuilder,
} from "../../../../src/types/index.ts";
import {
	appendFile,
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
	milestonePlanningChecklist,
	readFile,
	saveFile,
} from "../helpers/index.ts";
import { milestoneCommitSteps } from "./milestone-commit.ts";
import { postStoriesPhase } from "./post-stories.ts";
import { storyLoopSteps } from "./story-loop.ts";

/**
 * Generate steps for a single milestone iteration.
 */
function milestoneIterationSteps(t: WorkflowBuilder): StepDefinition[] {
	return [
		// Parse milestone fields
		extractField(t, "milestone ID", "current_milestone", "id", {
			output: "milestone_id",
		}),
		extractField(t, "milestone title", "current_milestone", "title", {
			output: "milestone_title",
		}),
		extractField(t, "milestone goals", "current_milestone", "goals", {
			output: "milestone_goals",
		}),

		// Log milestone start
		t.step(
			"Log milestone start",
			t.bash(`echo ""
echo "=========================================="
echo "MILESTONE: {milestone_id} - {milestone_title}"
echo "=========================================="
echo "Goals: {milestone_goals}"
echo ""`),
			{ visible: true },
		),

		// Log decision
		appendFile(
			t,
			"milestone start decision",
			"{output_dir}/decisions.md",
			`
---

## Milestone {milestone_id}: {milestone_title}

**Started**: $(date +%Y-%m-%d\\ %H:%M)
**Goals**: {milestone_goals}
`,
		),

		// Planning checklist
		milestonePlanningChecklist(t),

		// Refine architecture
		claudeSkill(
			t,
			"refine-architecture",
			`Refine the architecture document for milestone {milestone_id}: {milestone_title}

## Current Architecture
{architecture_document}

## Current Milestone
{current_milestone}

## Previous Milestones Summary
{cumulative_implementation_summary}

## Task
1. Review the current architecture
2. Add detailed design for this milestone's scope
3. Update any sections based on learnings from previous milestones

Save updated architecture to: {temp_dir}/architecture-{milestone_id}.md
Output "SAVED" when done.`,
			{ model: "opus" },
		),

		// Read refined architecture
		readFile(
			t,
			"refined architecture",
			"{temp_dir}/architecture-{milestone_id}.md",
			{ output: "architecture_document" },
		),

		// Save refined architecture
		saveFile(
			t,
			"refined architecture",
			"{output_dir}/architecture.md",
			"architecture_document",
		),

		// Increment architecture version
		t.step(
			"Increment architecture version",
			t.bash("echo $(( {architecture_version} + 1 ))"),
			{ output: "architecture_version" },
		),

		// Generate milestone stories
		claudeSkill(
			t,
			"generate-stories",
			`Use the /generate-stories skill to create stories for milestone {milestone_id}: {milestone_title}

## Milestone
{current_milestone}

## Architecture
{architecture_document}

## Previous Work Summary
{cumulative_implementation_summary}

## Guidelines
- Generate 8-15 stories for this milestone
- Use milestone prefix: {milestone_id}-STORY-001
- Focus ONLY on this milestone's goals

Save to: {temp_dir}/stories-{milestone_id}.json
Output "SAVED" when done.`,
			{ model: "opus" },
		),

		// Read milestone stories
		readFile(t, "milestone stories", "{temp_dir}/stories-{milestone_id}.json", {
			output: "stories_raw",
		}),

		// Save milestone stories
		saveFile(
			t,
			"milestone stories",
			"{output_dir}/stories-{milestone_id}.json",
			"stories_raw",
		),

		// Parse stories count
		countArray(t, "milestone stories", "stories_raw", {
			output: "stories_count",
		}),

		// Store stories for iteration
		t.step(
			"Store stories for iteration",
			t.set("stories_json", "{stories_raw}"),
		),

		// Log ready
		t.step(
			"Log milestone stories ready",
			t.bash(
				'echo "Milestone {milestone_id} stories generated: {stories_count}"',
			),
			{ visible: true },
		),

		// Story loop
		...storyLoopSteps(t),

		// Post-stories phase
		...postStoriesPhase(t),

		// Milestone commit
		...milestoneCommitSteps(t),
	];
}

/**
 * Generate steps for milestone mode execution.
 */
export function milestoneModeSteps(t: WorkflowBuilder): StepDefinition[] {
	return [
		logPhase(t, "MILESTONE MODE: Multi-pass execution"),

		// Log decision
		appendFile(
			t,
			"milestone mode decision",
			"{output_dir}/decisions.md",
			`
## Decision: Using Milestone-Based Execution

**Reason**: Epic scope requires milestone-based execution due to:
- Estimated {estimated_story_count} stories
- Complexity score: {complexity_score}
- Need for context management between phases
`,
		),

		// Phase 1 milestone planning
		t.step(
			"Phase 1 milestone planning",
			t.set("workflow_phase", "milestone_planning"),
		),

		logPhase(t, "PHASE 1: MILESTONE PLANNING"),

		// Analyze epic and generate milestones
		claudeSkill(
			t,
			"analyze-epic-and-milestones",
			`First, use the /analyze-epic skill to create the full epic description.
Then, use the /generate-milestones skill to split it into milestones.

## Input Prompt
{epic_prompt_content}

## Codebase Structure
{codebase_structure}

## Tasks
1. Save epic description to: {temp_dir}/epic-description.md
2. Save milestones JSON to: {temp_dir}/milestones.json

Milestones should follow risk-based phasing:
- Foundation (types, models, config)
- Core (services, business logic)
- Features (UI, endpoints, integrations)
- Integration (tests, docs, edge cases)

Output "SAVED" when done.`,
			{ model: "opus" },
		),

		// Read epic description
		readFile(t, "epic description", "{temp_dir}/epic-description.md", {
			output: "epic_description",
		}),

		// Save epic description
		saveFile(
			t,
			"epic description",
			"{output_dir}/epic-description.md",
			"epic_description",
		),

		// Read milestones
		readFile(t, "milestones", "{temp_dir}/milestones.json", {
			output: "milestones_json",
		}),

		// Save milestones
		saveFile(
			t,
			"milestones",
			"{output_dir}/milestones.json",
			"milestones_json",
		),

		// Parse milestones count
		t.step(
			"Parse milestones count",
			t.json("query", {
				input: "{milestones_json}",
				query: "length(milestones)",
			}),
			{ output: "milestones_count" },
		),

		// Extract epic title
		claudeExtractTitle(t, "epic_description"),

		// Parse epic title
		extractField(t, "epic title (milestone)", "epic_title_json", "title", {
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

		// Create high-level architecture
		claudeSkill(
			t,
			"create-architecture",
			`Use the /create-architecture skill to create a HIGH-LEVEL architectural document.

This is the initial architecture - it will be refined per milestone.

## Epic Description
{epic_description}

## Milestones Overview
{milestones_json}

## Codebase Structure
{codebase_structure}

Focus on overall design, component boundaries, patterns.
Leave milestone-specific details for refinement.

Save to: {temp_dir}/architecture.md
Output "SAVED" when done.`,
			{ model: "opus" },
		),

		// Read architecture
		readFile(t, "architecture", "{temp_dir}/architecture.md", {
			output: "architecture_document",
		}),

		// Save architecture
		saveFile(
			t,
			"architecture v1",
			"{output_dir}/architecture.md",
			"architecture_document",
		),

		// Log complete
		t.step(
			"Log milestone planning complete",
			t.bash(`echo ""
echo "Milestone planning complete"
echo "Milestones to execute: {milestones_count}"
echo "Architecture version: 1"
echo ""`),
			{ visible: true },
		),

		// Milestone loop
		t.forEach("{milestones_json.milestones}", "current_milestone", [
			...milestoneIterationSteps(t),
		]),
	];
}
