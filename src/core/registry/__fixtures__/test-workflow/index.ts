/**
 * Test Workflow Package
 *
 * A workflow package for integration testing of the registry module.
 * Demonstrates both default and named exports.
 *
 * EXPORTS:
 * - default: Main test workflow
 * - createAlternateWorkflow: Alternate workflow for testing named exports
 */

import type { LangGraphWorkflowDefinition } from "../../../graph/types.ts";

// ============================================================================
// Default Workflow
// ============================================================================

/**
 * Default Test Workflow Definition
 *
 * The main workflow for testing registry resolution.
 */
const defaultWorkflow: LangGraphWorkflowDefinition = {
	name: "Test Workflow",
	version: "1.0.0",
	description: "A test workflow for integration testing",
	vars: {
		testMode: true,
		counter: 0,
	},
	build(graph) {
		graph.addNode("init", async (_state, _tools) => {
			return {
				variables: {
					initialized: true,
				},
			};
		});

		graph.addNode("process", async (_state, _tools) => {
			return {
				variables: {
					processed: true,
					result: "Processed successfully",
				},
			};
		});

		graph.addEdge("__start__", "init");
		graph.addEdge("init", "process");
		graph.addEdge("process", "__end__");
	},
};

/**
 * Default export - Test workflow factory.
 */
export default () => defaultWorkflow;

// ============================================================================
// Named Export - Alternate Workflow
// ============================================================================

/**
 * Alternate Test Workflow Definition
 *
 * An alternate workflow for testing named export resolution.
 */
const alternateWorkflow: LangGraphWorkflowDefinition = {
	name: "Alternate Test Workflow",
	version: "1.0.0",
	description: "An alternate workflow for testing named exports",
	vars: {
		mode: "alternate",
	},
	build(graph) {
		graph.addNode("run", async (_state, _tools) => {
			return {
				variables: {
					mode: "alternate",
					executed: true,
				},
			};
		});

		graph.addEdge("__start__", "run");
		graph.addEdge("run", "__end__");
	},
};

/**
 * Named export - Alternate workflow factory.
 */
export function createAlternateWorkflow(): LangGraphWorkflowDefinition {
	return alternateWorkflow;
}
