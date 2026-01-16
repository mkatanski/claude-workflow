/**
 * Milestone Commit Phase
 *
 * Handles committing, tagging, and summarizing a completed milestone:
 * - Stage and commit changes
 * - Create annotated tag
 * - Generate summary
 * - Update cumulative summary
 */

import type {
	StepDefinition,
	WorkflowBuilder,
} from "../../../../src/types/index.ts";
import {
	appendFile,
	claudeCommitMessage,
	claudeSummary,
	extractField,
	gitCommit,
	gitCreateTag,
	gitStageAll,
	milestoneCompletionChecklist,
} from "../helpers/index.ts";

/**
 * Generate steps for milestone commit phase.
 */
export function milestoneCommitSteps(t: WorkflowBuilder): StepDefinition[] {
	return [
		t.step(
			"Milestone commit start",
			t.bash(`echo ""
echo "=== Committing Milestone {milestone_id} ==="`),
			{ visible: true },
		),

		// Completion checklist
		milestoneCompletionChecklist(t),

		// Stage changes
		gitStageAll(t),

		// Generate commit message
		claudeCommitMessage(
			t,
			`Generate a git commit message for milestone {milestone_id}: {milestone_title}

Stories completed: {stories_count}

Format:
feat({milestone_id}): Brief description

- Change 1
- Change 2`,
			"milestone_commit_msg_json",
		),

		// Parse commit message
		extractField(
			t,
			"milestone commit message",
			"milestone_commit_msg_json",
			"message",
			{ output: "milestone_commit_message" },
		),

		// Commit
		gitCommit(t, "milestone_commit_message"),

		// Create tag
		gitCreateTag(
			t,
			"milestone-{milestone_id}",
			"Milestone {milestone_id}: {milestone_title}",
		),

		// Log decision
		appendFile(
			t,
			"milestone completion decision",
			"{output_dir}/decisions.md",
			`
**Completed**: $(date +%Y-%m-%d\\ %H:%M)
**Stories Implemented**: {stories_count}
**Architecture Updated**: Yes
**Git Tag**: milestone-{milestone_id}
`,
		),

		// Generate summary
		claudeSummary(
			t,
			`Summarize what was built in milestone {milestone_id}: {milestone_title}

Stories completed: {stories_count}

Provide a 2-3 sentence summary focusing on WHAT was built.`,
			"milestone_summary_json",
		),

		// Parse summary
		extractField(t, "milestone summary", "milestone_summary_json", "summary", {
			output: "milestone_summary",
		}),

		// Update cumulative summary
		t.step(
			"Update cumulative summary",
			t.bash(`CURRENT="{cumulative_implementation_summary}"
NEW="## Milestone {milestone_id}: {milestone_title}
{milestone_summary}

"
echo "\${CURRENT}\${NEW}"`),
			{ output: "cumulative_implementation_summary" },
		),

		// Post-milestone hook
		t.step("Post-milestone hook", t.hook("post-milestone"), {
			output: "post_milestone_hook_result",
			onError: "continue",
		}),
	];
}
