/**
 * Post-epic hook for claude-orchestrator project.
 *
 * This hook runs after epic completion and updates the workflow-builder skill
 * if workflow files were modified during the epic.
 *
 * This is project-specific - only runs in this repository since the hook file exists.
 */

import type { HookContext } from "../../src/core/tools/hook.ts";

export default async function postEpicHook(
	context: HookContext,
): Promise<string> {
	console.log("Running post-epic hook: checking for workflow changes...");

	// Check if any workflow files were modified in recent commits
	const proc = Bun.spawn(
		["sh", "-c", "git diff --name-only HEAD~10 -- '.cw/workflows/' 2>/dev/null || echo ''"],
		{
			cwd: context.projectPath,
			stdout: "pipe",
			stderr: "pipe",
		},
	);

	const workflowChanges = await new Response(proc.stdout).text();
	await proc.exited;

	if (!workflowChanges.trim()) {
		return "No workflow changes detected, skipping workflow-builder update";
	}

	console.log(`Workflow changes detected:\n${workflowChanges}`);

	// The actual skill update should be done by Claude, not this hook.
	// This hook just detects the condition and reports it.
	// The workflow should then invoke Claude to run /update-workflow-builder if needed.

	return `Workflow files changed:\n${workflowChanges.trim()}\n\nConsider running /update-workflow-builder to update the skill documentation.`;
}
