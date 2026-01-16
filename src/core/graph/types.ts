/**
 * Types for LangGraph-based workflow definitions.
 *
 * These types define the structure of workflow files that use
 * the new WorkflowGraph-based architecture.
 */

import type {
	ClaudeConfig,
	ClaudeSdkConfig,
	TmuxConfig,
} from "../../types/index.ts";
import type {
	WorkflowGraph,
	NodeFunction,
	RoutingFunction,
} from "./workflowGraph.ts";

/**
 * LangGraph-based workflow definition.
 *
 * Workflow files export a factory function that returns this definition.
 * The build function receives a WorkflowGraph instance and should add
 * all nodes and edges.
 *
 * @example
 * ```typescript
 * const workflow: LangGraphWorkflowDefinition = {
 *   name: "My Workflow",
 *   description: "Does something useful",
 *   build(graph) {
 *     graph.addNode("start", async (state, tools) => {
 *       const result = await tools.bash("echo hello");
 *       return { variables: { output: result.output } };
 *     });
 *     graph.addEdge(START, "start");
 *     graph.addEdge("start", END);
 *   },
 * };
 * export default () => workflow;
 * ```
 */
export interface LangGraphWorkflowDefinition {
	/** Workflow name (displayed in CLI) */
	name: string;

	/** Optional description */
	description?: string;

	/** Initial variables */
	vars?: Record<string, unknown>;

	/** Claude Code configuration */
	claude?: ClaudeConfig;

	/** Claude SDK configuration */
	claudeSdk?: ClaudeSdkConfig;

	/** Tmux configuration */
	tmux?: TmuxConfig;

	/**
	 * Build function that constructs the workflow graph.
	 *
	 * This function is called with a fresh WorkflowGraph instance.
	 * It should add all nodes and edges to define the workflow structure.
	 */
	build: (graph: WorkflowGraph) => void;
}

/**
 * Factory function for creating workflow definitions.
 *
 * Workflow files should export this as their default export.
 *
 * @example
 * ```typescript
 * // .cw/workflows/my-workflow.ts
 * import type { LangGraphWorkflowFactory } from "claude-workflow";
 *
 * const createWorkflow: LangGraphWorkflowFactory = () => ({
 *   name: "My Workflow",
 *   build(graph) {
 *     // Add nodes and edges
 *   },
 * });
 *
 * export default createWorkflow;
 * ```
 */
export type LangGraphWorkflowFactory = () => LangGraphWorkflowDefinition;

/**
 * Type guard to check if a definition is a LangGraph workflow.
 */
export function isLangGraphWorkflow(
	definition: unknown,
): definition is LangGraphWorkflowDefinition {
	if (!definition || typeof definition !== "object") {
		return false;
	}

	const def = definition as Record<string, unknown>;
	return typeof def.name === "string" && typeof def.build === "function";
}

/**
 * Re-export node and routing function types for workflow files.
 */
export type { NodeFunction, RoutingFunction };
