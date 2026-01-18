/**
 * Types for LangGraph-based workflow definitions.
 *
 * These types define the structure of workflow files that use
 * the new WorkflowGraph-based architecture.
 */

import type { z } from "zod";
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
 * @typeParam TInput - Zod schema type for input validation (optional)
 * @typeParam TOutput - Zod schema type for output validation (optional)
 *
 * @example
 * ```typescript
 * import { z } from "zod";
 *
 * // Workflow with input/output schemas
 * const workflow: LangGraphWorkflowDefinition<
 *   typeof InputSchema,
 *   typeof OutputSchema
 * > = {
 *   name: "My Workflow",
 *   version: "1.0.0",
 *   description: "Does something useful",
 *   input: z.object({ message: z.string() }),
 *   output: z.object({ result: z.string() }),
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
export interface LangGraphWorkflowDefinition<
	TInput extends z.ZodTypeAny = z.ZodTypeAny,
	TOutput extends z.ZodTypeAny = z.ZodTypeAny,
> {
	/** Workflow name (displayed in CLI) */
	name: string;

	/**
	 * Workflow version in semver format.
	 * Should match the version in package.json for packaged workflows.
	 */
	version?: string;

	/** Optional description */
	description?: string;

	/**
	 * Zod schema for validating workflow inputs.
	 * When specified, inputs will be validated before workflow execution.
	 */
	input?: TInput;

	/**
	 * Zod schema for validating workflow outputs.
	 * When specified, outputs will be validated after workflow completion.
	 */
	output?: TOutput;

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
 * Supports optional generic type parameters for input/output schema types.
 *
 * @typeParam TInput - Zod schema type for input validation (optional)
 * @typeParam TOutput - Zod schema type for output validation (optional)
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
 *
 * @example
 * ```typescript
 * // With typed input/output schemas
 * import type { LangGraphWorkflowFactory } from "claude-workflow";
 * import { z } from "zod";
 *
 * const InputSchema = z.object({ message: z.string() });
 * const OutputSchema = z.object({ result: z.string() });
 *
 * const createWorkflow: LangGraphWorkflowFactory<
 *   typeof InputSchema,
 *   typeof OutputSchema
 * > = () => ({
 *   name: "Typed Workflow",
 *   input: InputSchema,
 *   output: OutputSchema,
 *   build(graph) {
 *     // Add nodes and edges
 *   },
 * });
 *
 * export default createWorkflow;
 * ```
 */
export type LangGraphWorkflowFactory<
	TInput extends z.ZodTypeAny = z.ZodTypeAny,
	TOutput extends z.ZodTypeAny = z.ZodTypeAny,
> = () => LangGraphWorkflowDefinition<TInput, TOutput>;

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
