/**
 * Routing Functions for Graph Navigation
 *
 * These functions determine which node to execute next based on state.
 * Used with addConditionalEdges to create dynamic graph navigation.
 */

import type { WorkflowStateType } from "../../../../src/core/graph/state.ts";
import type { WorkflowTools } from "../../../../src/core/graph/tools.ts";
import {
	getDrift,
	getMode,
	getTestLoop,
	hasMoreMilestones,
	hasMoreStories,
	isDriftFixExhausted,
	isTestRetriesExhausted,
} from "../state.ts";

/**
 * Route by workflow mode after scope analysis.
 *
 * Returns:
 * - "simpleSetup" for simple mode (<15 stories)
 * - "milestoneSetup" for milestone mode (>=15 stories)
 */
export function routeByMode(
	_state: WorkflowStateType,
	tools: WorkflowTools,
): string {
	const mode = getMode(tools);

	if (mode === "milestone") {
		return "milestoneSetup";
	}

	return "simpleSetup";
}

/**
 * Route after git setup based on mode.
 *
 * Returns:
 * - "checkStories" for simple mode (go straight to story loop)
 * - "processMilestone" for milestone mode (process first milestone)
 */
export function routeAfterGit(
	_state: WorkflowStateType,
	tools: WorkflowTools,
): string {
	const mode = getMode(tools);

	if (mode === "milestone") {
		return "processMilestone";
	}

	return "checkStories";
}

/**
 * Route in story loop - check if more stories exist.
 *
 * Returns:
 * - "implementStory" if there are more stories to process
 * - "postStories" if all stories are done
 */
export function routeStories(
	_state: WorkflowStateType,
	tools: WorkflowTools,
): string {
	if (hasMoreStories(tools)) {
		return "implementStory";
	}

	return "postStories";
}

/**
 * Route based on test result.
 *
 * Returns:
 * - "nextStory" if tests passed
 * - "fixTests" if tests failed and retries remaining
 * - "nextStory" if tests failed but retries exhausted
 */
export function routeTestResult(
	_state: WorkflowStateType,
	tools: WorkflowTools,
): string {
	const testLoop = getTestLoop(tools);

	// Tests passed - move to next story
	if (testLoop.passed) {
		return "nextStory";
	}

	// Tests failed - check if we can retry
	if (isTestRetriesExhausted(tools)) {
		// No more retries - move to next story anyway
		tools.log("Max test retries reached, moving to next story", "warn");
		return "nextStory";
	}

	// Retry available - fix tests
	return "fixTests";
}

/**
 * Route after fix tests - go back to run tests.
 *
 * This creates the retry loop: runTests -> fixTests -> runTests
 */
export function routeAfterFix(
	_state: WorkflowStateType,
	_tools: WorkflowTools,
): string {
	return "runTests";
}

/**
 * Route in drift loop - check if fixes are needed.
 *
 * Returns:
 * - "fixDrift" if there are fix issues and attempts remaining
 * - "updateArchitecture" otherwise
 */
export function routeDrift(
	_state: WorkflowStateType,
	tools: WorkflowTools,
): string {
	const drift = getDrift(tools);

	// Get issues that need fixing
	const fixIssues = drift.issues.filter((i) => i.category === "fix");

	// If no fix issues or already aligned, go to architecture update
	if (fixIssues.length === 0 || drift.aligned) {
		return "updateArchitecture";
	}

	// If fix attempts exhausted, go to architecture update
	if (isDriftFixExhausted(tools)) {
		tools.log("Max drift fix attempts reached", "warn");
		return "updateArchitecture";
	}

	// Fix issues exist - attempt to fix
	return "fixDrift";
}

/**
 * Route after drift fix - re-check drift.
 *
 * This creates the drift fix loop: checkDrift -> fixDrift -> checkDrift
 */
export function routeAfterDriftFix(
	_state: WorkflowStateType,
	_tools: WorkflowTools,
): string {
	return "checkDrift";
}

/**
 * Route after post-stories phase.
 *
 * Returns:
 * - "milestoneCommit" for milestone mode
 * - "finalization" for simple mode
 */
export function routeAfterPostStories(
	_state: WorkflowStateType,
	tools: WorkflowTools,
): string {
	const mode = getMode(tools);

	if (mode === "milestone") {
		return "milestoneCommit";
	}

	return "finalization";
}

/**
 * Route after milestone commit - check if more milestones.
 *
 * Returns:
 * - "processMilestone" if more milestones to process
 * - "finalization" if all milestones complete
 */
export function routeMoreMilestones(
	_state: WorkflowStateType,
	tools: WorkflowTools,
): string {
	if (hasMoreMilestones(tools)) {
		return "processMilestone";
	}

	return "finalization";
}

/**
 * Router path mappings for graph visualization.
 *
 * These help LangGraph understand the possible destinations
 * for each conditional edge.
 */
export const routerPaths = {
	routeByMode: {
		simpleSetup: "simpleSetup",
		milestoneSetup: "milestoneSetup",
	},
	routeAfterGit: {
		checkStories: "checkStories",
		processMilestone: "processMilestone",
	},
	routeStories: {
		implementStory: "implementStory",
		postStories: "postStories",
	},
	routeTestResult: {
		nextStory: "nextStory",
		fixTests: "fixTests",
	},
	routeAfterFix: {
		runTests: "runTests",
	},
	routeDrift: {
		fixDrift: "fixDrift",
		updateArchitecture: "updateArchitecture",
	},
	routeAfterDriftFix: {
		checkDrift: "checkDrift",
	},
	routeAfterPostStories: {
		milestoneCommit: "milestoneCommit",
		finalization: "finalization",
	},
	routeMoreMilestones: {
		processMilestone: "processMilestone",
		finalization: "finalization",
	},
} as const;
