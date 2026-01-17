/**
 * Graph Composition for Epic-to-Implementation V3
 *
 * Wires together all nodes and edges to form the complete workflow graph.
 * Uses conditional edges for loops (story retry, drift fix, milestone iteration).
 */

import {
	END,
	START,
	type WorkflowGraph,
} from "../../../src/core/graph/workflowGraph.ts";

// Import all nodes
import {
	analyzeScope,
	checkDrift,
	finalization,
	fixDrift,
	fixTests,
	gitSetup,
	implementStory,
	milestoneCommit,
	milestoneSetup,
	nextStory,
	processMilestone,
	runTests,
	setup,
	simpleSetup,
	updateArchitecture,
} from "./nodes/index.ts";

// Import all routers
import {
	routeAfterDriftFix,
	routeAfterFix,
	routeAfterGit,
	routeAfterPostStories,
	routeByMode,
	routeDrift,
	routeMoreMilestones,
	routerPaths,
	routeStories,
	routeTestResult,
} from "./routers/index.ts";

/**
 * Build the workflow graph.
 *
 * Graph Structure:
 * ```
 * START
 *   │
 *   ▼
 * setup ──► analyzeScope
 *              │
 *              ├──► simpleSetup ────┐
 *              │                     │
 *              └──► milestoneSetup ──┼──► gitSetup
 *                                    │       │
 *                                    │       ▼
 *                                    │   ┌─► processMilestone ◄─┐
 *                                    │   │         │            │
 *                                    │   │         ▼            │
 *                                    └───┼── checkStories ◄─────┤
 *                                        │         │            │
 *                                        │         ▼            │
 *                                        │   implementStory     │
 *                                        │         │            │
 *                                        │         ▼            │
 *                                        │    runTests ◄──┐     │
 *                                        │         │      │     │
 *                                        │         ├──► fixTests│
 *                                        │         │            │
 *                                        │         ▼            │
 *                                        │    nextStory ────────┤
 *                                        │         │            │
 *                                        │         ▼            │
 *                                        │   postStories        │
 *                                        │   (checkDrift)       │
 *                                        │         │            │
 *                                        │         ├──► fixDrift│
 *                                        │         │            │
 *                                        │         ▼            │
 *                                        │ updateArchitecture   │
 *                                        │         │            │
 *                                        ├─────────┼────────────┘
 *                                        │         │
 *                                        │         ▼
 *                                        │  milestoneCommit ────┘
 *                                        │
 *                                        ▼
 *                                   finalization
 *                                        │
 *                                        ▼
 *                                       END
 * ```
 */
export function buildGraph(graph: WorkflowGraph): void {
	// ═══════════════════════════════════════════════════════════════════
	// PHASE 0: Setup and Scope Analysis
	// ═══════════════════════════════════════════════════════════════════

	graph.addNode("setup", setup);
	graph.addNode("analyzeScope", analyzeScope);

	// ═══════════════════════════════════════════════════════════════════
	// MODE SETUP: Simple vs Milestone
	// ═══════════════════════════════════════════════════════════════════

	graph.addNode("simpleSetup", simpleSetup);
	graph.addNode("milestoneSetup", milestoneSetup);

	// ═══════════════════════════════════════════════════════════════════
	// GIT SETUP
	// ═══════════════════════════════════════════════════════════════════

	graph.addNode("gitSetup", gitSetup);

	// ═══════════════════════════════════════════════════════════════════
	// MILESTONE PROCESSING (milestone mode only)
	// ═══════════════════════════════════════════════════════════════════

	graph.addNode("processMilestone", processMilestone);
	graph.addNode("milestoneCommit", milestoneCommit);

	// ═══════════════════════════════════════════════════════════════════
	// STORY LOOP
	// ═══════════════════════════════════════════════════════════════════

	// checkStories is a routing node (no-op, just for conditional edge)
	graph.addNode("checkStories", async () => ({ variables: {} }));
	graph.addNode("implementStory", implementStory);
	graph.addNode("runTests", runTests);
	graph.addNode("fixTests", fixTests);
	graph.addNode("nextStory", nextStory);

	// ═══════════════════════════════════════════════════════════════════
	// POST-STORIES: Drift Check and Architecture Update
	// ═══════════════════════════════════════════════════════════════════

	// postStories is a routing node that delegates to checkDrift
	graph.addNode("postStories", async () => ({ variables: {} }));
	graph.addNode("checkDrift", checkDrift);
	graph.addNode("fixDrift", fixDrift);
	graph.addNode("updateArchitecture", updateArchitecture);

	// ═══════════════════════════════════════════════════════════════════
	// FINALIZATION
	// ═══════════════════════════════════════════════════════════════════

	graph.addNode("finalization", finalization);

	// ═══════════════════════════════════════════════════════════════════
	// EDGES: Wire it all together
	// ═══════════════════════════════════════════════════════════════════

	// --- Start to setup ---
	graph.addEdge(START, "setup");
	graph.addEdge("setup", "analyzeScope");

	// --- Scope analysis routes to mode setup ---
	graph.addConditionalEdges(
		"analyzeScope",
		routeByMode,
		routerPaths.routeByMode,
	);

	// --- Mode setup to git setup ---
	graph.addEdge("simpleSetup", "gitSetup");
	graph.addEdge("milestoneSetup", "gitSetup");

	// --- Git setup routes based on mode ---
	graph.addConditionalEdges(
		"gitSetup",
		routeAfterGit,
		routerPaths.routeAfterGit,
	);

	// --- Process milestone (milestone mode) ---
	graph.addEdge("processMilestone", "checkStories");

	// --- Story loop ---
	graph.addConditionalEdges(
		"checkStories",
		routeStories,
		routerPaths.routeStories,
	);
	graph.addEdge("implementStory", "runTests");
	graph.addConditionalEdges(
		"runTests",
		routeTestResult,
		routerPaths.routeTestResult,
	);
	graph.addConditionalEdges(
		"fixTests",
		routeAfterFix,
		routerPaths.routeAfterFix,
	);
	graph.addEdge("nextStory", "checkStories"); // Loop back to check for more stories

	// --- Post-stories ---
	graph.addEdge("postStories", "checkDrift");
	graph.addConditionalEdges("checkDrift", routeDrift, routerPaths.routeDrift);
	graph.addConditionalEdges(
		"fixDrift",
		routeAfterDriftFix,
		routerPaths.routeAfterDriftFix,
	);
	graph.addConditionalEdges(
		"updateArchitecture",
		routeAfterPostStories,
		routerPaths.routeAfterPostStories,
	);

	// --- Milestone commit and loop ---
	graph.addConditionalEdges(
		"milestoneCommit",
		routeMoreMilestones,
		routerPaths.routeMoreMilestones,
	);

	// --- Finalization ---
	graph.addEdge("finalization", END);
}
