/**
 * Git Setup Node
 *
 * Handles git branch management for the workflow:
 * - Stashes uncommitted changes if needed
 * - Creates feature branch based on epic title
 */

import type {
	WorkflowStateType,
	WorkflowStateUpdate,
} from "../../../../src/core/graph/state.ts";
import type { WorkflowTools } from "../../../../src/core/graph/tools.ts";
import {
	fromToolResult,
	state,
	stateError,
} from "../../../../src/core/utils/index.js";
import { getEpic, StateKeys } from "../state.ts";
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
		return stateError("Epic data not found in state");
	}

	tools.log("Setting up git...");

	// Get current branch
	const branchResult = fromToolResult(
		await tools.bash("git branch --show-current", { stripOutput: true }),
	);
	if (branchResult.isErr()) {
		return stateError(
			`Failed to get current branch: ${branchResult.unwrapErr()}`,
		);
	}
	const originalBranch = branchResult.unwrap().trim();
	tools.log(`Current branch: ${originalBranch}`, "debug");

	// Check for uncommitted changes
	const statusResult = await tools.bash("git status --porcelain");
	const hasUncommittedChanges = statusResult.output.trim().length > 0;

	let stashRef: string | undefined;
	if (hasUncommittedChanges) {
		tools.log("Uncommitted changes detected, stashing...");
		const stashResult = fromToolResult(
			await tools.bash("git stash push -m 'epic-workflow-stash'"),
		);
		if (stashResult.isErr()) {
			return stateError(`Failed to stash changes: ${stashResult.unwrapErr()}`);
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
		const checkoutResult = fromToolResult(
			await tools.bash(`git checkout "${branchName}"`),
		);
		if (checkoutResult.isErr()) {
			return stateError(
				`Failed to checkout branch: ${checkoutResult.unwrapErr()}`,
			);
		}
		tools.log(`Checked out existing branch: ${branchName}`);
	} else {
		// Create and checkout new branch
		const createResult = fromToolResult(
			await tools.bash(`git checkout -b "${branchName}"`),
		);
		if (createResult.isErr()) {
			return stateError(`Failed to create branch: ${createResult.unwrapErr()}`);
		}
		tools.log(`Created branch: ${branchName}`);
	}

	const gitState: GitState = {
		branchName,
		originalBranch,
		hasUncommittedChanges,
		stashRef,
	};

	return state().set(StateKeys.git, gitState).build();
}
