/**
 * Finalization Phase
 *
 * Final cleanup and completion tasks:
 * - Final lint and tests
 * - Consolidate antipatterns
 * - Learn new dependencies
 * - Final commit
 * - Log completion summary
 */

import type {
	StepDefinition,
	WorkflowBuilder,
} from "../../../../src/types/index.ts";
import {
	appendFile,
	checkLintPassed,
	checkTestsPassed,
	claudeCommitMessage,
	claudeSkill,
	extractField,
	gitCommit,
	gitGetCommitSha,
	gitStageAll,
	logPhase,
	preCommitChecklist,
	runLint,
	runTests,
} from "../helpers/index.ts";

/**
 * Generate steps for the finalization phase.
 */
export function finalizationSteps(t: WorkflowBuilder): StepDefinition[] {
	return [
		// Set phase
		t.step("Finalization start", t.set("workflow_phase", "finalization")),

		// Log phase header
		logPhase(t, "FINALIZATION PHASE"),

		// Final lint
		runLint(t, { output: "final_lint_output" }),
		checkLintPassed(t, "final_lint_passed", "final_lint_output"),

		// Final tests
		runTests(t, { output: "final_test_output" }),
		checkTestsPassed(t, "final_tests_passed", "final_test_output"),

		// Log final status
		t.step(
			"Log final status",
			t.bash(`echo "Final lint: {final_lint_passed}"
echo "Final tests: {final_tests_passed}"`),
			{ visible: true },
		),

		// Consolidate antipatterns
		claudeSkill(
			t,
			"consolidate-antipatterns",
			`Use the /consolidate-antipatterns skill to curate and deduplicate
all antipattern entries from this epic.

Output a brief summary.`,
			{ output: "consolidation_summary", model: "haiku" },
		),

		// Check for new dependencies
		t.step(
			"Check for new dependencies",
			t.bash(
				"cat pyproject.toml 2>/dev/null || cat package.json 2>/dev/null || cat requirements.txt 2>/dev/null || echo ''",
			),
			{ output: "deps_after" },
		),

		// Learn new dependencies
		claudeSkill(
			t,
			"learn-new-dependencies",
			`Use the /learn-new-dependencies skill to create skills for new dependencies.

## Before
{deps_before}

## After
{deps_after}

Output summary of skills created.`,
			{ output: "deps_learning_summary" },
		),

		// Post-epic hook
		t.step("Post-epic hook", t.hook("post-epic"), {
			output: "post_epic_hook_result",
			onError: "continue",
		}),

		// Pre-commit checks
		preCommitChecklist(t),

		// Generate final commit message
		claudeCommitMessage(
			t,
			`Generate a final git commit message for epic: {epic_title}

Mode: {workflow_mode}
Milestones: {milestones_count}

Format:
feat(scope): Brief description

- Major change 1
- Major change 2`,
			"commit_msg_json",
		),

		// Parse commit message
		extractField(t, "final commit message", "commit_msg_json", "message", {
			output: "commit_message",
		}),

		// Stage final changes
		gitStageAll(t),

		// Final commit
		gitCommit(t, "commit_message"),

		// Get final commit SHA
		gitGetCommitSha(t, "final_commit_sha"),

		// Log decision
		appendFile(
			t,
			"epic complete decision",
			"{output_dir}/decisions.md",
			`
---

## Epic Complete

**Completed**: $(date +%Y-%m-%d\\ %H:%M)
**Mode**: {workflow_mode}
**Branch**: {branch_name}
**Final Commit**: {final_commit_sha}
**Tests Passed**: {final_tests_passed}
`,
		),

		// Log completion
		t.step(
			"Log completion",
			t.bash(`echo ""
echo "=========================================="
echo "WORKFLOW COMPLETE"
echo "=========================================="
echo ""
echo "Epic: {epic_title}"
echo "Mode: {workflow_mode}"
echo "Branch: {branch_name}"
echo "Milestones: {milestones_count}"
echo "Final tests: {final_tests_passed}"
echo "Commit: {final_commit_sha}"
echo ""
echo "Generated artifacts:"
echo "  - {output_dir}/epic-description.md"
echo "  - {output_dir}/architecture.md"
echo "  - {output_dir}/decisions.md"
echo "  - {output_dir}/stories*.json"
if [ "{workflow_mode}" = "milestone" ]; then
  echo "  - {output_dir}/milestones.json"
fi
echo ""
echo "Next steps:"
echo "  1. Review changes: git log --oneline -10"
echo "  2. Push branch: git push -u origin {branch_name}"
echo "  3. Create pull request"
echo ""
echo "=========================================="`),
			{ visible: true },
		),

		// Cleanup
		t.step("Cleanup", t.bash("rm -rf {temp_dir}"), { onError: "continue" }),

		// Workflow end
		t.step(
			"Workflow end",
			t.bash("echo 'Epic implementation workflow v2 finished!'"),
		),
	];
}
