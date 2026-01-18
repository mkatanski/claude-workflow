/**
 * Simple Workflow Package
 *
 * A minimal workflow package for integration testing.
 * Demonstrates the standard structure for a workflow package with a single export.
 */

import type { LangGraphWorkflowDefinition } from "../../../graph/types.ts";

/**
 * Simple Workflow Definition
 *
 * A minimal workflow that demonstrates the basic structure.
 */
const workflow: LangGraphWorkflowDefinition = {
	name: "Simple Workflow",
	version: "1.0.0",
	description: "A simple workflow for integration testing",
	vars: {
		message: "Hello from simple workflow",
	},
	build(graph) {
		// Add a simple node that returns a greeting
		graph.addNode("greet", async (state, _tools) => {
			return {
				variables: {
					greeting: `${state.message} - processed`,
				},
			};
		});

		// Connect start to greet, greet to end
		// Note: Using string literals for START/END as this is a fixture
		graph.addEdge("__start__", "greet");
		graph.addEdge("greet", "__end__");
	},
};

/**
 * Workflow factory function - default export.
 */
export default () => workflow;
