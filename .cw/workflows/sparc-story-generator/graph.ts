/**
 * Graph building function for SPARC Story Generator workflow
 *
 * This function defines the complete workflow structure including:
 * - All nodes (read_input → SPARC phases → review → refinement → completion)
 * - Sequential edges for linear flow
 * - Conditional edges for review and loop routing
 *
 * Reference: Section 4.1 "High-Level Flow" in architecture document
 */

import { END, START } from "@langchain/langgraph";
import type { WorkflowGraph } from "../../../src/core/graph/workflowGraph.ts";
import {
	architectureNode,
	completionNode,
	generateBatchNode,
	pseudocodeNode,
	readInputNode,
	regenerateRejectedNode,
	reviewAnalysisNode,
	reviewStoriesNode,
	saveAnalysisNode,
	specificationNode,
	validateBatchNode,
} from "./nodes/index.ts";
import {
	routeAfterAnalysisReview,
	routeAfterStoryReview,
	routeAfterValidateBatch,
} from "./routers/index.ts";

/**
 * Build the workflow graph with all nodes and edges.
 *
 * Flow structure:
 * ```
 * START → read_input → specification → pseudocode → architecture → save_analysis → review_analysis
 *                                                                                        │
 *                                                                     ┌──────────────────┴───────────────────┐
 *                                                                     ▼                                      ▼
 *                                                               (approved)                              (rejected)
 *                                                                     │                                      │
 *                                                                     ▼                                      │
 *                                                           generate_batch                                   │
 *                                                                     │                                      │
 *                                                                     ▼                                      │
 *                                                           review_stories                                   │
 *                                                                     │                                      │
 *                                                     ┌───────────────┴───────────────┐                      │
 *                                                     ▼                               ▼                      │
 *                                             (all approved)                   (has rejected)                │
 *                                                     │                               │                      │
 *                                                     ▼                               ▼                      │
 *                                            validate_batch               regenerate_rejected                │
 *                                                     │                               │                      │
 *                                                     ▼                               ▼                      │
 *                                             (more passes?)              review_stories (loop)              │
 *                                                     │                                                      │
 *                                      ┌──────────────┴──────────────┐                                       │
 *                                      ▼                             ▼                                       │
 *                                   (yes)                          (no)                                      │
 *                                      │                             │                                       │
 *                                      ▼                             ▼                                       │
 *                               generate_batch                   completion                                  │
 *                                                                    │                                       │
 *                                                                    ▼                                       │
 *                                                                   END    ◀── [max attempts reached] ──────┘
 * ```
 */
export function buildGraph(graph: WorkflowGraph): void {
	// ========== Register all nodes ==========

	// Input node - reads and validates architecture document
	graph.addNode("read_input", readInputNode);

	// SPARC analysis phase nodes (S → P → A)
	graph.addNode("specification", specificationNode);
	graph.addNode("pseudocode", pseudocodeNode);
	graph.addNode("architecture", architectureNode);

	// Analysis saving and review
	graph.addNode("save_analysis", saveAnalysisNode);
	graph.addNode("review_analysis", reviewAnalysisNode);

	// Refinement phase nodes (R in SPARC)
	graph.addNode("generate_batch", generateBatchNode);
	graph.addNode("review_stories", reviewStoriesNode);
	graph.addNode("regenerate_rejected", regenerateRejectedNode);
	graph.addNode("validate_batch", validateBatchNode);

	// Completion phase node (C in SPARC)
	graph.addNode("completion", completionNode);

	// ========== Sequential edges for SPARC phases ==========

	// Input and analysis pipeline (S → P → A → Review)
	graph.addEdge(START, "read_input");
	graph.addEdge("read_input", "specification");
	graph.addEdge("specification", "pseudocode");
	graph.addEdge("pseudocode", "architecture");
	graph.addEdge("architecture", "save_analysis");
	graph.addEdge("save_analysis", "review_analysis");

	// ========== Analysis review routing ==========

	// After analysis review, route based on approval status:
	// - approved → generate_batch (proceed to story generation)
	// - rejected → specification (retry with feedback)
	// - max attempts → end_with_error (terminate)
	graph.addConditionalEdges("review_analysis", routeAfterAnalysisReview, {
		generate_batch: "generate_batch",
		specification: "specification",
		end_with_error: END,
	});

	// ========== Story generation and review loop ==========

	// After generating a batch, always review the stories
	graph.addEdge("generate_batch", "review_stories");

	// After story review, route based on approval status:
	// - all approved → validate_batch (proceed)
	// - has rejected → regenerate_rejected (retry)
	// - regeneration exhausted → validate_batch (partial batch)
	graph.addConditionalEdges("review_stories", routeAfterStoryReview, {
		validate_batch: "validate_batch",
		regenerate_rejected: "regenerate_rejected",
	});

	// After regenerating rejected stories, return to review
	graph.addEdge("regenerate_rejected", "review_stories");

	// ========== Validate and loop or complete ==========

	// After validating batch, route based on pass progression:
	// - more passes needed → generate_batch (next pass)
	// - all passes done → completion (finalize)
	graph.addConditionalEdges("validate_batch", routeAfterValidateBatch, {
		generate_batch: "generate_batch",
		completion: "completion",
	});

	// ========== End ==========

	// After completion, workflow ends
	graph.addEdge("completion", END);
}
