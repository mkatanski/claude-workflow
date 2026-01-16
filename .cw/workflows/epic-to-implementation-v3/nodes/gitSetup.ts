/**
 * Git Setup Node
 *
 * Handles git branch management for the workflow:
 * - Stashes uncommitted changes if needed
 * - Creates feature branch based on epic title
 */

import type { WorkflowStateType } from "../../../../src/core/graph/state.ts";
import type { WorkflowTools } from "../../../../src/core/graph/tools.ts";
import type { WorkflowStateUpdate } from "../../../../src/core/graph/state.ts";
import { StateKeys, getEpic } from "../state.ts";
import type { GitState } from "../types.ts";

/**
 * Git setup node: Prepare git state for implementation.
 *
 * - Gets current branch
 * - Checks for uncommitted changes
 * - Stashes if needed
 * - Creates feature branch
 */
export async function gitSetup(
	_state: WorkflowStateType,
	tools: WorkflowTools,
): Promise<WorkflowStateUpdate> {
	const epic = getEpic(tools);

	if (!epic) {
		return { error: "Epic data not found in state" };
	}

	tools.log("Setting up git...");

	// Get current branch
	const branchResult = await tools.bash("git branch --show-current", {
		stripOutput: true,
	});
	if (!branchResult.success) {
		return { error: `Failed to get current branch: ${branchResult.error}` };
	}
	const originalBranch = branchResult.output.trim();
	tools.log(`Current branch: ${originalBranch}`, "debug");

	// Check for uncommitted changes
	const statusResult = await tools.bash("git status --porcelain");
	const hasUncommittedChanges = statusResult.output.trim().length > 0;

	let stashRef: string | undefined;
	if (hasUncommittedChanges) {
		tools.log("Uncommitted changes detected, stashing...");
		const stashResult = await tools.bash("git stash push -m 'epic-workflow-stash'");
		if (!stashResult.success) {
			return { error: `Failed to stash changes: ${stashResult.error}` };
		}

		// Get stash ref
		const stashListResult = await tools.bash("git stash list -1 --format=%H", {
			stripOutput: true,
		});
		stashRef = stashListResult.output.trim();
		tools.log(`Stashed: ${stashRef?.slice(0, 8) ?? "unknown"}`, "debug");
	}

	// Generate branch name from epic title
	const sanitizedTitle = epic.title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 40);

	const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
	const branchName = `epic/${sanitizedTitle}-${dateStr}`;

	// Check if branch already exists
	const branchExistsResult = await tools.bash(
		`git show-ref --verify --quiet refs/heads/${branchName} && echo "exists" || echo "new"`,
		{ stripOutput: true },
	);

	if (branchExistsResult.output.trim() === "exists") {
		// Checkout existing branch
		const checkoutResult = await tools.bash(`git checkout "${branchName}"`);
		if (!checkoutResult.success) {
			return { error: `Failed to checkout branch: ${checkoutResult.error}` };
		}
		tools.log(`Checked out existing branch: ${branchName}`);
	} else {
		// Create and checkout new branch
		const createResult = await tools.bash(`git checkout -b "${branchName}"`);
		if (!createResult.success) {
			return { error: `Failed to create branch: ${createResult.error}` };
		}
		tools.log(`Created branch: ${branchName}`);
	}

	const gitState: GitState = {
		branchName,
		originalBranch,
		hasUncommittedChanges,
		stashRef,
	};

	return {
		variables: {
			[StateKeys.git]: gitState,
		},
	};
}
