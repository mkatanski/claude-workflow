/**
 * Finalization Node
 *
 * Final workflow steps:
 * - Run final lint and tests
 * - Consolidate antipatterns
 * - Check for new dependencies
 * - Learn new dependencies
 * - Final commit
 * - Cleanup
 */

import type { WorkflowStateType } from "../../../../src/core/graph/state.ts";
import type { WorkflowTools } from "../../../../src/core/graph/tools.ts";
import type { WorkflowStateUpdate } from "../../../../src/core/graph/state.ts";
import {
	StateKeys,
	DEFAULT_CONFIG,
	getEpic,
	getGit,
	getStories,
	getTempDir,
	getMode,
	getMilestones,
} from "../state.ts";
import { commitMessageSchema, newDependenciesSchema } from "../schemas/index.ts";
import type { GitState, WorkflowConfig } from "../types.ts";

/**
 * Finalization node: Complete the workflow.
 *
 * - Final lint and tests
 * - Consolidate antipatterns
 * - Check for new dependencies
 * - Learn new dependencies
 * - Final commit
 * - Cleanup temp files
 */
export async function finalization(
	_state: WorkflowStateType,
	tools: WorkflowTools,
): Promise<WorkflowStateUpdate> {
	const config = tools.getVar<WorkflowConfig>(StateKeys.config) ?? DEFAULT_CONFIG;
	const epic = getEpic(tools);
	const git = getGit(tools);
	const stories = getStories(tools);
	const tempDir = getTempDir(tools);
	const mode = getMode(tools);
	const milestones = getMilestones(tools);
	const depsBefore = tools.getVar<string>(StateKeys.depsBefore) ?? "";

	tools.log("FINALIZATION");

	// Step 1: Final lint and tests
	tools.log("Running final lint and tests...");

	const lintResult = await tools.bash(
		'npx eslint . --fix --ext .ts,.tsx,.js,.jsx 2>&1 || echo "LINT_ERRORS"',
		{ stripOutput: false },
	);
	const finalLintPassed =
		!lintResult.output.includes("LINT_ERRORS") && !lintResult.output.includes("error");

	if (finalLintPassed) {
		tools.log("Final lint passed", "debug");
	} else {
		tools.log("Final lint has warnings/errors", "warn");
	}

	const testResult = await tools.bash(
		'npm test 2>&1 || bun test 2>&1 || pytest 2>&1 || echo "TEST_FAILED"',
		{ stripOutput: false },
	);
	const finalTestsPassed =
		!testResult.output.includes("TEST_FAILED") && !testResult.output.includes("FAILED");

	if (finalTestsPassed) {
		tools.log("Final tests passed", "debug");
	} else {
		tools.log("Some tests may be failing", "warn");
	}

	// Step 2: Consolidate antipatterns
	tools.log("Consolidating antipatterns...", "debug");
	const consolidateResult = await tools.claude(
		`Use the /consolidate-antipatterns skill to curate and consolidate antipatterns learned during this epic implementation.

Remove duplicates, merge similar patterns, and ensure consistent formatting.

Output "CONSOLIDATED" when done.`,
	);

	if (!consolidateResult.success) {
		tools.log("Consolidation skipped", "warn");
	}

	// Step 3: Check for new dependencies
	tools.log("Checking for new dependencies...", "debug");
	const depsAfterResult = await tools.bash(
		'cat pyproject.toml 2>/dev/null || cat package.json 2>/dev/null || cat requirements.txt 2>/dev/null || echo ""',
		{ stripOutput: false },
	);
	const depsAfter = depsAfterResult.output;

	// Compare dependencies
	const hasNewDeps = depsAfter !== depsBefore;

	if (hasNewDeps) {
		tools.log("New dependencies detected", "debug");

		// Use claudeSdk to identify new dependencies
		const newDepsResult = await tools.claudeSdk<{
			hasNewDependencies: boolean;
			newDependencies: Array<{ name: string; version?: string; type?: string }>;
		}>(
			`Compare these dependency files and identify any NEW dependencies added:

## Before
\`\`\`
${depsBefore.slice(0, 2000)}
\`\`\`

## After
\`\`\`
${depsAfter.slice(0, 2000)}
\`\`\`

List only the NEW dependencies that were added.`,
			{
				outputType: "schema",
				schema: newDependenciesSchema,
			},
		);

		if (newDepsResult.data?.hasNewDependencies && newDepsResult.data.newDependencies.length > 0) {
			const newDeps = newDepsResult.data.newDependencies;
			tools.log(`Found ${newDeps.length} new dependencies`);
			for (const dep of newDeps) {
				tools.log(`- ${dep.name}${dep.version ? `@${dep.version}` : ""}`, "debug");
			}

			// Step 4: Learn new dependencies
			tools.log("Learning new dependencies...", "debug");
			const learnResult = await tools.claude(
				`Use the /learn-new-dependencies skill to create skills for these newly added dependencies:

${newDeps.map((d) => `- ${d.name}`).join("\n")}

Use context7 for documentation and create proper skill files.

Output "LEARNED" when done.`,
			);

			if (!learnResult.success) {
				tools.log("Dependency learning skipped", "warn");
			}
		}
	} else {
		tools.log("No new dependencies added", "debug");
	}

	// Step 5: Final commit (for simple mode or after all milestones)
	let finalCommitSha: string | undefined;

	if (git) {
		tools.log("Creating final commit...", "debug");

		// Stage all changes
		await tools.bash("git add -A");

		// Check if there are changes to commit
		const statusResult = await tools.bash("git status --porcelain");
		if (statusResult.output.trim()) {
			// Generate final commit message
			const completedStories = stories.filter((s) => s.status === "completed").length;
			const failedStories = stories.filter((s) => s.status === "failed").length;

			const commitMsgResult = await tools.claudeSdk<{ subject: string; body?: string }>(
				`Generate a final commit message for completing the epic "${epic?.title ?? "unknown"}".

Summary:
- Mode: ${mode}
- Stories completed: ${completedStories}/${stories.length}
${failedStories > 0 ? `- Stories with issues: ${failedStories}` : ""}
${mode === "milestone" ? `- Milestones: ${milestones.length}` : ""}

Use conventional commit format.`,
				{
					outputType: "schema",
					schema: commitMessageSchema,
				},
			);

			const subject = commitMsgResult.data?.subject ?? `feat: complete ${epic?.title ?? "epic"}`;
			const body = commitMsgResult.data?.body ?? "";
			const commitMessage = body ? `${subject}\n\n${body}` : subject;

			const commitResult = await tools.bash(
				`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`,
			);

			if (commitResult.success) {
				const shaResult = await tools.bash("git rev-parse HEAD", { stripOutput: true });
				finalCommitSha = shaResult.output.trim();
				tools.log(`Final commit: ${finalCommitSha.slice(0, 8)}`, "debug");
			} else {
				tools.log("Final commit failed", "warn");
			}
		} else {
			tools.log("No changes to commit", "debug");
		}
	}

	// Step 6: Cleanup temp directory
	if (tempDir) {
		tools.log("Cleaning up temp files...", "debug");
		await tools.bash(`rm -rf "${tempDir}"`);
	}

	// Generate summary
	const completedStories = stories.filter((s) => s.status === "completed").length;
	const failedStories = stories.filter((s) => s.status === "failed").length;

	tools.log("EPIC IMPLEMENTATION COMPLETE");
	tools.log(`Epic: ${epic?.title ?? "unknown"}, Mode: ${mode}`);
	tools.log(`Stories: ${completedStories}/${stories.length} completed`);
	if (failedStories > 0) {
		tools.log(`Stories with issues: ${failedStories}`, "warn");
	}
	if (mode === "milestone") {
		tools.log(`Milestones: ${milestones.filter((m) => m.completed).length}/${milestones.length}`, "debug");
	}
	tools.log(`Branch: ${git?.branchName ?? "unknown"}`, "debug");
	if (finalCommitSha) {
		tools.log(`Final commit: ${finalCommitSha.slice(0, 8)}`, "debug");
	}

	// Log final decision
	await logDecision(tools, config.outputDir, "Epic Complete", [
		`Stories completed: ${completedStories}/${stories.length}`,
		`Branch: ${git?.branchName ?? "unknown"}`,
		finalCommitSha ? `Final commit: ${finalCommitSha.slice(0, 8)}` : "No final commit",
		`Final tests: ${finalTestsPassed ? "passed" : "failing"}`,
	]);

	// Update git state with final commit
	const updatedGit: GitState | undefined = git
		? { ...git, finalCommitSha }
		: undefined;

	return {
		variables: {
			[StateKeys.git]: updatedGit,
			[StateKeys.phase]: "completed",
		},
		completed: true,
	};
}

/**
 * Log a decision to the decisions log.
 */
async function logDecision(
	tools: WorkflowTools,
	outputDir: string,
	decision: string,
	details: string[],
): Promise<void> {
	const dateResult = await tools.bash('date "+%Y-%m-%d %H:%M"', { stripOutput: true });
	const date = dateResult.output.trim();

	const detailsStr = details.map((d) => `- ${d}`).join("\n");
	const content = `
## ${decision}

- **Date**: ${date}
${detailsStr}

---
`;

	await tools.bash(`cat >> "${outputDir}/decisions.md" << 'DECISION_EOF'
${content}
DECISION_EOF`);
}
