/**
 * Debug Example Workflow
 *
 * Demonstrates debugging features with the --debug flag.
 * This workflow showcases:
 * - Variable inspection at different stages
 * - Conditional routing based on state
 * - Error handling patterns
 * - Step-through execution
 * - Multiple execution paths
 * - State mutations and tracking
 *
 * Run with: bun run src/cli/main.ts run debug-example
 * Debug with: bun run src/cli/main.ts run debug-example --debug
 *
 * Debugging tips:
 * - Set breakpoints on nodes like "processInput" or "validateData"
 * - Inspect variables after "calculateMetrics" to see computed values
 * - Use step-over to trace execution flow through conditional branches
 * - Watch how error handling works in "riskyOperation"
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
 * Initial workflow variables for debugging demo.
 */
const initialVars: Record<string, unknown> = {
	debugMode: true,
	environment: "development",
	inputValue: 42,
	enableValidation: true,
	retryCount: 0,
	maxRetries: 3,
};

/**
 * Build the workflow graph with multiple paths for debugging.
 */
function buildGraph(graph: WorkflowGraph): void {
	// Node 1: Initialize and log starting state
	graph.addNode("initialize", async (state, tools) => {
		tools.log("Starting debug example workflow", "info", {
			initialVars: state.variables,
		});

		const timestamp = await tools.bash("date +%s");

		return {
			variables: {
				startTime: parseInt(timestamp.output.trim()),
				status: "initialized",
			},
		};
	});

	// Node 2: Process input and transform data
	graph.addNode("processInput", async (state, tools) => {
		const { inputValue } = state.variables;

		// Demonstrate variable manipulation
		const doubled = (inputValue as number) * 2;
		const squared = (inputValue as number) ** 2;

		tools.log("Processing input", "debug", {
			original: inputValue,
			doubled,
			squared,
		});

		return {
			variables: {
				doubled,
				squared,
				processed: true,
			},
		};
	});

	// Node 3: Validate data - good breakpoint location
	graph.addNode("validateData", async (state, tools) => {
		const { enableValidation, doubled, squared } = state.variables;

		if (!enableValidation) {
			tools.log("Validation skipped", "warn");
			return {
				variables: {
					validationPassed: true,
					validationSkipped: true,
				},
			};
		}

		// Validation logic - inspect these variables in debugger
		const isDoubledValid = typeof doubled === "number" && doubled > 0;
		const isSquaredValid = typeof squared === "number" && squared > 0;
		const validationPassed = isDoubledValid && isSquaredValid;

		tools.log("Validation complete", "info", {
			isDoubledValid,
			isSquaredValid,
			validationPassed,
		});

		return {
			variables: {
				validationPassed,
				isDoubledValid,
				isSquaredValid,
			},
		};
	});

	// Node 4: Router - conditional branching based on validation
	graph.addNode("router", async (state, tools) => {
		const { validationPassed } = state.variables;

		tools.log("Routing decision", "debug", {
			validationPassed,
			nextPath: validationPassed ? "success-path" : "error-path",
		});

		// Return routing decision - debugger can inspect this
		return {
			variables: {
				routingDecision: validationPassed ? "success" : "error",
			},
		};
	});

	// Node 5: Success path - calculate metrics
	graph.addNode("calculateMetrics", async (state, tools) => {
		const { doubled, squared, startTime } = state.variables;

		// Complex calculations - good place to inspect intermediate values
		const sum = (doubled as number) + (squared as number);
		const average = sum / 2;
		const ratio = (squared as number) / (doubled as number);

		const currentTime = await tools.bash("date +%s");
		const elapsed = parseInt(currentTime.output.trim()) - (startTime as number);

		tools.log("Metrics calculated", "info", {
			sum,
			average,
			ratio,
			elapsed,
		});

		return {
			variables: {
				sum,
				average,
				ratio,
				executionTime: elapsed,
			},
		};
	});

	// Node 6: Create report data
	graph.addNode("createReport", async (state, tools) => {
		const {
			inputValue,
			doubled,
			squared,
			sum,
			average,
			ratio,
			executionTime,
		} = state.variables;

		// Build structured data - inspect JSON structure in debugger
		const reportData = {
			input: inputValue,
			transformations: {
				doubled,
				squared,
			},
			metrics: {
				sum,
				average,
				ratio,
			},
			metadata: {
				executionTime,
				status: "success",
			},
		};

		const jsonResult = await tools.json("stringify", { input: reportData });

		tools.log("Report created", "info", {
			reportSize: jsonResult.output.length,
		});

		return {
			variables: {
				report: jsonResult.output,
			},
		};
	});

	// Node 7: Error path - handle validation failure
	graph.addNode("handleError", async (state, tools) => {
		const { isDoubledValid, isSquaredValid, retryCount, maxRetries } =
			state.variables;

		tools.log("Handling validation error", "error", {
			isDoubledValid,
			isSquaredValid,
			retryCount,
		});

		// Check if we can retry
		const currentRetry = (retryCount as number) + 1;
		const canRetry = currentRetry < (maxRetries as number);

		return {
			variables: {
				errorHandled: true,
				retryCount: currentRetry,
				shouldRetry: canRetry,
				errorMessage: canRetry
					? `Validation failed, retry ${currentRetry}/${maxRetries}`
					: "Validation failed, max retries exceeded",
			},
		};
	});

	// Node 8: Risky operation - demonstrates error breakpoints
	graph.addNode("riskyOperation", async (state, tools) => {
		const { debugMode } = state.variables;

		tools.log("Executing risky operation", "warn", { debugMode });

		// Simulate operation that might fail
		const random = Math.random();
		const success = random > 0.3; // 70% success rate

		if (!success) {
			tools.log("Risky operation failed", "error", { random });
			throw new Error(`Operation failed with random value: ${random}`);
		}

		tools.log("Risky operation succeeded", "info", { random });

		return {
			variables: {
				riskyResult: "success",
				randomValue: random,
			},
		};
	});

	// Node 9: Cleanup and finalize
	graph.addNode("finalize", async (state, tools) => {
		const { startTime, status } = state.variables;

		const currentTime = await tools.bash("date +%s");
		const totalTime = parseInt(currentTime.output.trim()) - (startTime as number);

		tools.log("Workflow complete", "info", {
			totalExecutionTime: totalTime,
			finalStatus: status,
		});

		// Display final summary
		const summary = `Debug workflow finished in ${totalTime}s with status: ${status}`;
		await tools.bash(`echo '${summary}'`);

		return {
			variables: {
				totalExecutionTime: totalTime,
				completed: true,
			},
		};
	});

	// Node 10: Show results
	graph.addNode("showResults", async (state, tools) => {
		const { report } = state.variables;

		if (report) {
			tools.log("Displaying success results", "info");

			// Parse and display the report
			const parsed = await tools.json("query", {
				input: report as string,
				query: "metadata.status",
			});

			await tools.bash(`echo 'Report Status: ${parsed.output}'`);
		}

		return { variables: {} };
	});

	// Node 11: Show error details
	graph.addNode("showError", async (state, tools) => {
		const { errorMessage } = state.variables;

		tools.log("Displaying error results", "error");

		await tools.bash(`echo 'Error: ${errorMessage}'`);

		return { variables: {} };
	});

	// Wire the graph together
	graph.addEdge(START, "initialize");
	graph.addEdge("initialize", "processInput");
	graph.addEdge("processInput", "validateData");
	graph.addEdge("validateData", "router");

	// Conditional routing based on validation
	graph.addConditionalEdges("router", (state) => {
		const { routingDecision } = state.variables;
		return routingDecision === "success" ? "calculateMetrics" : "handleError";
	});

	// Success path
	graph.addEdge("calculateMetrics", "createReport");
	graph.addEdge("createReport", "riskyOperation");
	graph.addEdge("riskyOperation", "finalize");
	graph.addEdge("finalize", "showResults");
	graph.addEdge("showResults", END);

	// Error path
	graph.addConditionalEdges("handleError", (state) => {
		const { shouldRetry } = state.variables;
		// If we should retry, go back to processInput
		// Otherwise, go to showError
		return shouldRetry ? "processInput" : "showError";
	});

	graph.addEdge("showError", END);
}

/**
 * Debug Example Workflow Definition
 */
const workflow: LangGraphWorkflowDefinition = {
	name: "Debug Example Workflow",
	description:
		"Demonstrates debugging features including breakpoints, variable inspection, conditional routing, and error handling",
	vars: initialVars,
	claude: claudeConfig,
	tmux: tmuxConfig,
	build: buildGraph,
};

/**
 * Workflow factory function - default export.
 */
export default () => workflow;
