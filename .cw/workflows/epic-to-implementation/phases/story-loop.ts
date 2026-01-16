/**
 * Story Loop Phase
 *
 * Iterates over stories, implementing each one with:
 * - Antipatterns review
 * - Plan and implementation
 * - Code review
 * - Test retry loop with learning from failures
 */

import type {
	StepDefinition,
	WorkflowBuilder,
} from "../../../../src/types/index.ts";
import {
	checkLintPassed,
	checkTestsPassed,
	claudeCodeReview,
	claudeFixTests,
	claudeImplementStory,
	claudeLearnFromFailure,
	codeQualityChecklist,
	evaluateTestStatus,
	extractField,
	incrementTestRetry,
	logTestAttempt,
	runLint,
	runTests,
	storyPreImplementationChecklist,
	testCoverageChecklist,
} from "../helpers/index.ts";

/**
 * Generate steps for the story iteration loop.
 */
export function storyLoopSteps(t: WorkflowBuilder): StepDefinition[] {
	return [
		t.step("Initialize story index", t.set("current_story_index", "0")),

		t.forEach("{stories_json}", "current_story", [
			// Parse story fields
			extractField(t, "story ID", "current_story", "id", {
				output: "story_id",
			}),
			extractField(t, "story title", "current_story", "title", {
				output: "story_title",
			}),

			// Log story start
			t.step(
				"Log story start",
				t.bash(`echo ""
echo "=========================================="
echo "IMPLEMENTING: {story_id}"
echo "{story_title}"
echo "==========================================="`),
				{ visible: true },
			),

			// Pre-implementation checks
			storyPreImplementationChecklist(t),

			// Plan and implement
			claudeImplementStory(
				t,
				"story_id",
				"story_title",
				"current_story",
				"architecture_document",
			),

			// Code review
			claudeCodeReview(t, "story_id", "story_title", "implementation_result"),

			// Code quality checks
			codeQualityChecklist(t),

			// Test retry loop
			t.step("Reset test retry count", t.set("test_retry_count", "0")),

			t.retry({ maxAttempts: 3, until: "{tests_passed} == true" }, [
				logTestAttempt(t),

				// Lint
				runLint(t),
				checkLintPassed(t, "lint_passed"),

				// Tests
				runTests(t),
				checkTestsPassed(t, "tests_passed"),

				// Evaluate status
				evaluateTestStatus(t, "tests_passed"),

				// Mark failure
				t.step("Mark test failure", t.set("test_failure_occurred", "true"), {
					when: "{test_status} == failed",
				}),

				// Fix failing tests
				claudeFixTests(
					t,
					"story_id",
					"story_title",
					"test_output",
					"lint_output",
					{ when: "{test_status} == failed" },
				),

				// Learn from failure
				claudeLearnFromFailure(t, "test_output", "test_fix_result", {
					when: "{test_failure_occurred} == true",
				}),

				// Reset failure flag
				t.step(
					"Reset test failure flag",
					t.set("test_failure_occurred", "false"),
				),

				// Increment retry counter
				incrementTestRetry(t),
			]),

			// Story complete
			t.step(
				"Story complete",
				t.bash(`echo ""
echo "Story {story_id} complete"
echo "Tests: {test_status}"`),
				{ visible: true },
			),

			// Test coverage checks
			testCoverageChecklist(t),

			// Increment story index
			t.step(
				"Increment story index",
				t.bash("echo $(( {current_story_index} + 1 ))"),
				{ output: "current_story_index" },
			),

			// Post-story hook
			t.step("Post-story hook", t.hook("post-story"), {
				output: "post_story_hook_result",
				onError: "continue",
			}),
		]),
	];
}
