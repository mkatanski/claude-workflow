/**
 * Example LangGraph Workflow
 *
 * Demonstrates the new LangGraph-based API for building workflows.
 * This example shows common patterns like bash commands, variable manipulation,
 * and conditional routing.
 *
 * Run with: bun run src/cli/main.ts run examples
 */

import type { LangGraphWorkflowDefinition } from "../../../src/core/graph/types.ts";
import type { ClaudeConfig, TmuxConfig } from "../../../src/types/index.ts";
import {
	START,
	END,
	type WorkflowGraph,
} from "../../../src/core/graph/workflowGraph.ts";

/**
 * Claude Code configuration for the workflow.
 */
const claudeConfig: ClaudeConfig = {
	model: "sonnet",
	dangerouslySkipPermissions: true,
};

/**
 * Tmux configuration for interactive mode.
 */
const tmuxConfig: TmuxConfig = {
	split: "vertical",
	idleTime: 2.0,
};

/**
 * Initial workflow variables.
 */
const initialVars: Record<string, unknown> = {
	greeting: "Hello",
	target: "World",
};

/**
 * Build the workflow graph.
 */
function buildGraph(graph: WorkflowGraph): void {
	// Node 1: Get current date using bash
	graph.addNode("getCurrentDate", async (state, tools) => {
		const result = await tools.bash("date");
		return {
			variables: {
				currentDate: result.output.trim(),
			},
		};
	});

	// Node 2: Build a message from variables
	graph.addNode("buildMessage", async (state, tools) => {
		const { greeting, target, currentDate } = state.variables;
		const message = `${greeting}, ${target}! Today is ${currentDate}`;
		return {
			variables: {
				message,
			},
		};
	});

	// Node 3: Show the message
	graph.addNode("showMessage", async (state, tools) => {
		const { message } = state.variables;
		await tools.bash(`echo '${message}'`);
		return { variables: {} };
	});

	// Node 4: Create JSON data
	graph.addNode("createJson", async (state, tools) => {
		const { target, currentDate } = state.variables;
		const jsonData = { name: target, date: currentDate };
		const result = await tools.json("stringify", { input: jsonData });
		return {
			variables: {
				jsonData: result.output,
			},
		};
	});

	// Node 5: Extract name from JSON
	graph.addNode("extractName", async (state, tools) => {
		const { jsonData } = state.variables;
		const result = await tools.json("query", {
			input: jsonData as string,
			query: "name",
		});
		return {
			variables: {
				extractedName: result.output,
			},
		};
	});

	// Node 6: Show final result
	graph.addNode("showResult", async (state, tools) => {
		const { extractedName } = state.variables;
		await tools.bash(`echo 'Extracted: ${extractedName}'`);
		return { variables: {} };
	});

	// Wire the nodes together
	graph.addEdge(START, "getCurrentDate");
	graph.addEdge("getCurrentDate", "buildMessage");
	graph.addEdge("buildMessage", "showMessage");
	graph.addEdge("showMessage", "createJson");
	graph.addEdge("createJson", "extractName");
	graph.addEdge("extractName", "showResult");
	graph.addEdge("showResult", END);
}

/**
 * Example Workflow Definition
 */
const workflow: LangGraphWorkflowDefinition = {
	name: "Example Workflow",
	description:
		"Demonstrates LangGraph API with bash commands, variables, and JSON manipulation",
	vars: initialVars,
	claude: claudeConfig,
	tmux: tmuxConfig,
	build: buildGraph,
};

/**
 * Workflow factory function - default export.
 */
export default () => workflow;
