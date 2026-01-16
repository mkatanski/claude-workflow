/**
 * Post-Stories Phase
 *
 * Handles drift checking and architecture updates after story implementation:
 * - Bidirectional drift checking
 * - Drift fix retry loop
 * - Architecture updates with learnings
 */

import type {
	StepDefinition,
	WorkflowBuilder,
} from "../../../../src/types/index.ts";
import {
	architectureChecklist,
	claudeSkill,
	countArray,
	extractField,
	logMessage,
	logPhase,
	readFile,
	runTests,
	setDefaultIfEmpty,
} from "../helpers/index.ts";

/**
 * Generate steps for the post-stories phase.
 */
export function postStoriesPhase(t: WorkflowBuilder): StepDefinition[] {
	return [
		logPhase(t, "POST-STORIES: Alignment & Finalization"),

		// Architecture checklist
		architectureChecklist(t, "{output_dir}", {
			output: "architecture_check_result",
		}),

		// Initialize drift fix counter
		t.step("Reset drift fix count", t.set("drift_fix_count", "0")),

		// Drift fix retry loop
		t.retry({ maxAttempts: 5, until: "{drift_fix_issues_count} == 0" }, [
			logMessage(t, "Running drift check..."),

			// Run bidirectional drift check
			claudeSkill(
				t,
				"check-drift",
				`Use the /check-drift skill with bidirectional checking.

## Architecture Document
{architecture_document}

## Stories Completed
{stories_count} stories

## Task
1. Check if implementation matches architecture
2. Identify improvements to UPDATE the architecture (type: keep)
3. Identify violations to FIX in code (type: fix)
4. Note items for future milestones (type: defer)

Include architecture_updates list for any "keep" items.

Save to: {temp_dir}/drift-check.json
Output "SAVED" when done.`,
				{ output: "drift_check_raw" },
			),

			// Read drift check results
			readFile(t, "drift check", "{temp_dir}/drift-check.json", {
				output: "drift_check_result",
			}),

			// Parse drift results
			extractField(t, "drift aligned", "drift_check_result", "aligned", {
				output: "architecture_aligned",
				onError: "continue",
			}),

			setDefaultIfEmpty(t, "architecture_aligned", "true"),

			extractField(
				t,
				"architecture updates",
				"drift_check_result",
				"architecture_updates",
				{ output: "architecture_updates", onError: "continue" },
			),

			t.step(
				"Get drift issues to fix",
				t.json("query", {
					input: "{drift_check_result}",
					query: "issues[?type=='fix']",
				}),
				{ output: "drift_fix_issues", onError: "continue" },
			),

			countArray(t, "drift fix issues", "drift_fix_issues", {
				output: "drift_fix_issues_count",
				onError: "continue",
			}),

			setDefaultIfEmpty(t, "drift_fix_issues_count", "0"),

			// Log drift status
			t.step(
				"Log drift status",
				t.bash(`echo "Aligned: {architecture_aligned}"
echo "Fix issues: {drift_fix_issues_count}"`),
				{ visible: true },
			),

			// Fix drift issues
			claudeSkill(
				t,
				"fix-drift",
				`Use the /fix-drift skill to fix architectural drift issues.

## Issues to Fix
{drift_fix_issues}

## Architecture Document
{architecture_document}

## Instructions
1. Use /plan to plan the fixes for each drift issue
2. Apply fixes following the /fix-drift skill
3. Fix all issues of type "fix"

Start by using /plan to plan your fixes.`,
				{ output: "drift_fix_result", when: "{drift_fix_issues_count} != 0" },
			),

			// Increment drift fix counter
			t.step(
				"Increment drift fix count",
				t.bash("echo $(( {drift_fix_count} + 1 ))"),
				{ output: "drift_fix_count" },
			),

			// Run tests after drift fix
			runTests(t, { output: "post_drift_tests_passed" }),
		]),

		// Update architecture with learnings
		logMessage(t, "Updating architecture with learnings..."),

		claudeSkill(
			t,
			"update-architecture",
			`Use the /update-architecture skill to incorporate learnings.

## Current Architecture
{architecture_document}

## Updates to Make
{architecture_updates}

Save to: {temp_dir}/architecture-updated.md
Output "SAVED" when done.`,
			{ when: "{architecture_updates} is not empty" },
		),

		// Read updated architecture
		t.step(
			"Read updated architecture",
			t.bash("cat {temp_dir}/architecture-updated.md 2>/dev/null || echo ''"),
			{
				output: "updated_architecture",
				when: "{architecture_updates} is not empty",
			},
		),

		// Apply architecture update
		t.step(
			"Apply architecture update",
			t.bash(`if [ -n "{updated_architecture}" ]; then
  cat > {output_dir}/architecture.md << 'ARCH_EOF'
{updated_architecture}
ARCH_EOF
  echo "Architecture updated"
fi`),
			{ when: "{updated_architecture} is not empty" },
		),

		// Store updated architecture
		t.step(
			"Store updated architecture",
			t.set("architecture_document", "{updated_architecture}"),
			{ when: "{updated_architecture} is not empty" },
		),
	];
}
