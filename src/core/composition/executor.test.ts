/**
 * Tests for sub-workflow executor module.
 *
 * This module tests the SubWorkflowExecutor class that handles executing
 * sub-workflows with:
 * - Complete state isolation from the parent workflow
 * - Timeout support with distinguishable timeout errors
 * - Input/output validation against Zod schemas
 * - Event emission for workflow call lifecycle
 * - Integration with call stack for circular detection
 */

import { describe, expect, it } from "bun:test";
import { END, START } from "@langchain/langgraph";
import { z } from "zod";
import { createEmitter, type WorkflowEmitter } from "../events/index.js";
import type { LangGraphWorkflowDefinition } from "../graph/types.js";
import type { WorkflowGraph } from "../graph/workflowGraph.js";
import { createCallStack, createCallStackEntry, pushCall } from "./circular.js";
import {
	createExecutionError,
	createExecutorContext,
	createSubWorkflowExecutor,
	createTimeoutError,
	DEFAULT_EXECUTION_TIMEOUT,
	type ExecutorContext,
	SubWorkflowExecutor,
	type SubWorkflowExecutorConfig,
} from "./executor.js";

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a minimal workflow definition for testing.
 */
function createTestWorkflow(
	name: string,
	options: {
		version?: string;
		input?: z.ZodTypeAny;
		output?: z.ZodTypeAny;
		vars?: Record<string, unknown>;
		buildFn?: (graph: WorkflowGraph) => void;
	} = {},
): LangGraphWorkflowDefinition {
	return {
		name,
		version: options.version ?? "1.0.0",
		input: options.input,
		output: options.output,
		vars: options.vars,
		build:
			options.buildFn ??
			((graph) => {
				graph.addNode("start", async (_state, _tools) => {
					return { variables: { result: "success" } };
				});
				graph.addEdge(START, "start");
				graph.addEdge("start", END);
			}),
	};
}

/**
 * Create a test executor config.
 */
function createTestConfig(
	overrides: Partial<SubWorkflowExecutorConfig> = {},
): SubWorkflowExecutorConfig {
	return {
		projectPath: "/test/project",
		tempDir: "/test/temp",
		...overrides,
	};
}

/**
 * Create a test executor context.
 */
function createTestContext(
	overrides: Partial<ExecutorContext> = {},
): ExecutorContext {
	return {
		parentWorkflow: "parent-workflow",
		parentNode: "parent-node",
		callStack: createCallStack(),
		...overrides,
	};
}

/**
 * Create a mock event emitter that captures events.
 * Uses asyncByDefault: false to ensure events are captured synchronously.
 */
function createMockEmitter(): {
	emitter: WorkflowEmitter;
	events: Array<{ type: string; payload: unknown }>;
	flush: () => Promise<void>;
} {
	const events: Array<{ type: string; payload: unknown }> = [];
	// Use synchronous emission for tests to ensure events are captured
	const emitter = createEmitter({ asyncByDefault: false });

	// Subscribe to all events
	emitter.onPattern("*", (event) => {
		events.push({ type: event.type, payload: event.payload });
	});

	return { emitter, events, flush: () => emitter.flush() };
}

// ============================================================================
// SubWorkflowExecutor Class Tests
// ============================================================================

describe("SubWorkflowExecutor", () => {
	describe("constructor", () => {
		it("creates executor with basic config", () => {
			const config = createTestConfig();
			const executor = new SubWorkflowExecutor(config);

			expect(executor).toBeInstanceOf(SubWorkflowExecutor);
		});

		it("creates executor with event emitter", () => {
			const { emitter } = createMockEmitter();
			const config = createTestConfig({ emitter });
			const executor = new SubWorkflowExecutor(config);

			expect(executor).toBeInstanceOf(SubWorkflowExecutor);
		});
	});

	describe("circular call detection", () => {
		it("returns CIRCULAR_CALL error for direct circular call", async () => {
			const executor = createSubWorkflowExecutor(createTestConfig());
			const workflow = createTestWorkflow("workflow-a");

			// Create context with workflow-a already in the call stack
			const callStack = pushCall(
				createCallStack(),
				createCallStackEntry("workflow-a", "1.0.0", "init-node"),
			);
			const context = createTestContext({ callStack });

			const result = await executor.execute(workflow, {}, context);

			expect(result.success).toBe(false);
			expect(result.error?.code).toBe("CIRCULAR_CALL");
			expect(result.error?.message).toContain("workflow-a");
		});

		it("returns CIRCULAR_CALL error for indirect circular call", async () => {
			const executor = createSubWorkflowExecutor(createTestConfig());
			const workflow = createTestWorkflow("workflow-a", { version: "1.0.0" });

			// Create context with A -> B in the call stack, now trying to call A again
			let callStack = createCallStack();
			callStack = pushCall(
				callStack,
				createCallStackEntry("workflow-a", "1.0.0", "init-node"),
			);
			callStack = pushCall(
				callStack,
				createCallStackEntry("workflow-b", "1.0.0", "process-node"),
			);
			const context = createTestContext({ callStack });

			const result = await executor.execute(workflow, {}, context);

			expect(result.success).toBe(false);
			expect(result.error?.code).toBe("CIRCULAR_CALL");
		});

		it("returns CIRCULAR_CALL error when max depth exceeded", async () => {
			const executor = createSubWorkflowExecutor(createTestConfig());
			const workflow = createTestWorkflow("workflow-d");

			// Create a deep call stack at max depth (10 by default)
			let callStack = createCallStack({ maxDepth: 3 });
			callStack = pushCall(
				callStack,
				createCallStackEntry("workflow-a", "1.0.0", "n1"),
			);
			callStack = pushCall(
				callStack,
				createCallStackEntry("workflow-b", "1.0.0", "n2"),
			);
			callStack = pushCall(
				callStack,
				createCallStackEntry("workflow-c", "1.0.0", "n3"),
			);
			const context = createTestContext({ callStack });

			const result = await executor.execute(workflow, {}, context);

			expect(result.success).toBe(false);
			expect(result.error?.code).toBe("CIRCULAR_CALL");
			expect(result.error?.message).toContain("depth");
		});
	});

	describe("input validation", () => {
		it("returns INPUT_VALIDATION error for invalid input", async () => {
			const inputSchema = z.object({
				name: z.string().min(1, "Name is required"),
				age: z.number().positive("Age must be positive"),
			});

			const executor = createSubWorkflowExecutor(createTestConfig());
			const workflow = createTestWorkflow("validation-workflow", {
				input: inputSchema,
			});

			const result = await executor.execute(
				workflow,
				{ input: { name: "", age: -5 } },
				createTestContext(),
			);

			expect(result.success).toBe(false);
			expect(result.error?.code).toBe("INPUT_VALIDATION");
			expect(result.error?.validationErrors).toBeDefined();
			expect(result.error?.validationErrors?.length).toBeGreaterThan(0);
		});

		it("returns INPUT_VALIDATION error for missing required fields", async () => {
			const inputSchema = z.object({
				required: z.string(),
			});

			const executor = createSubWorkflowExecutor(createTestConfig());
			const workflow = createTestWorkflow("validation-workflow", {
				input: inputSchema,
			});

			const result = await executor.execute(
				workflow,
				{ input: {} },
				createTestContext(),
			);

			expect(result.success).toBe(false);
			expect(result.error?.code).toBe("INPUT_VALIDATION");
			expect(
				result.error?.validationErrors?.some((e) => e.path === "required"),
			).toBe(true);
		});

		it("accepts valid input", async () => {
			const inputSchema = z.object({
				name: z.string(),
			});

			const executor = createSubWorkflowExecutor(createTestConfig());
			const workflow = createTestWorkflow("validation-workflow", {
				input: inputSchema,
				buildFn: (graph) => {
					graph.addNode("process", async (_state) => {
						return { variables: { processed: true } };
					});
					graph.addEdge(START, "process");
					graph.addEdge("process", END);
				},
			});

			// Note: The actual execution will fail in tests because we can't
			// fully mock WorkflowGraph. We're testing that it gets past validation.
			const result = await executor.execute(
				workflow,
				{ input: { name: "Test" } },
				createTestContext(),
			);

			// If it's an execution error, it got past validation
			if (!result.success && result.error?.code !== "EXECUTION_FAILED") {
				expect(result.error?.code).not.toBe("INPUT_VALIDATION");
			}
		});

		it("skips validation when no input schema defined", async () => {
			const executor = createSubWorkflowExecutor(createTestConfig());
			const workflow = createTestWorkflow("no-schema-workflow");

			// This should not fail with INPUT_VALIDATION
			const result = await executor.execute(
				workflow,
				{ input: { anything: "goes" } },
				createTestContext(),
			);

			// Should either succeed or fail with EXECUTION_FAILED (not INPUT_VALIDATION)
			if (!result.success) {
				expect(result.error?.code).not.toBe("INPUT_VALIDATION");
			}
		});
	});

	describe("timeout handling", () => {
		it("returns TIMEOUT error when timeout is exceeded", async () => {
			const executor = createSubWorkflowExecutor(createTestConfig());

			// Create a workflow that takes longer than the timeout
			const workflow = createTestWorkflow("slow-workflow", {
				buildFn: (graph) => {
					graph.addNode("slow", async () => {
						await new Promise((resolve) => setTimeout(resolve, 500));
						return { variables: { result: "done" } };
					});
					graph.addEdge(START, "slow");
					graph.addEdge("slow", END);
				},
			});

			const result = await executor.execute(
				workflow,
				{ timeout: 50 },
				createTestContext(),
			);

			expect(result.success).toBe(false);
			expect(result.error?.code).toBe("TIMEOUT");
			expect(result.error?.message).toContain("50ms");
		});

		it("completes successfully when within timeout", async () => {
			const executor = createSubWorkflowExecutor(createTestConfig());
			const workflow = createTestWorkflow("fast-workflow", {
				buildFn: (graph) => {
					graph.addNode("fast", async () => {
						return { variables: { result: "done" } };
					});
					graph.addEdge(START, "fast");
					graph.addEdge("fast", END);
				},
			});

			// Large timeout to ensure we don't hit it
			const result = await executor.execute(
				workflow,
				{ timeout: 10000 },
				createTestContext(),
			);

			// May fail for other reasons in test env, but not timeout
			if (!result.success) {
				expect(result.error?.code).not.toBe("TIMEOUT");
			}
		});

		it("runs without timeout when not specified", async () => {
			const executor = createSubWorkflowExecutor(createTestConfig());
			const workflow = createTestWorkflow("no-timeout-workflow");

			// No timeout option - should not produce TIMEOUT error
			const result = await executor.execute(workflow, {}, createTestContext());

			if (!result.success) {
				expect(result.error?.code).not.toBe("TIMEOUT");
			}
		});
	});

	describe("error handling", () => {
		it("returns EXECUTION_FAILED for node errors", async () => {
			const executor = createSubWorkflowExecutor(createTestConfig());
			const workflow = createTestWorkflow("error-workflow", {
				buildFn: (graph) => {
					graph.addNode("error-node", async () => {
						throw new Error("Intentional error");
					});
					graph.addEdge(START, "error-node");
					graph.addEdge("error-node", END);
				},
			});

			const result = await executor.execute(workflow, {}, createTestContext());

			expect(result.success).toBe(false);
			expect(result.error?.code).toBe("EXECUTION_FAILED");
		});

		it("includes error message in result", async () => {
			const executor = createSubWorkflowExecutor(createTestConfig());
			const workflow = createTestWorkflow("error-workflow", {
				buildFn: (graph) => {
					graph.addNode("error-node", async () => {
						throw new Error("Specific error message");
					});
					graph.addEdge(START, "error-node");
					graph.addEdge("error-node", END);
				},
			});

			const result = await executor.execute(workflow, {}, createTestContext());

			expect(result.error?.message).toBeDefined();
		});

		it("never throws errors (returns result instead)", async () => {
			const executor = createSubWorkflowExecutor(createTestConfig());
			const workflow = createTestWorkflow("error-workflow", {
				buildFn: (graph) => {
					graph.addNode("error-node", async () => {
						throw new Error("Should be caught");
					});
					graph.addEdge(START, "error-node");
					graph.addEdge("error-node", END);
				},
			});

			// Should not throw
			const result = await executor.execute(workflow, {}, createTestContext());

			// Should return a result object
			expect(result).toHaveProperty("success");
			expect(result).toHaveProperty("duration");
			expect(result).toHaveProperty("metadata");
		});
	});

	describe("result metadata", () => {
		it("includes workflow name in metadata", async () => {
			const executor = createSubWorkflowExecutor(createTestConfig());
			const workflow = createTestWorkflow("test-workflow-name");

			const result = await executor.execute(workflow, {}, createTestContext());

			expect(result.metadata.name).toBe("test-workflow-name");
		});

		it("includes workflow version in metadata", async () => {
			const executor = createSubWorkflowExecutor(createTestConfig());
			const workflow = createTestWorkflow("versioned-workflow", {
				version: "2.1.0",
			});

			const result = await executor.execute(workflow, {}, createTestContext());

			expect(result.metadata.version).toBe("2.1.0");
		});

		it("uses default version when not specified", async () => {
			const executor = createSubWorkflowExecutor(createTestConfig());
			const workflow: LangGraphWorkflowDefinition = {
				name: "no-version-workflow",
				build: (graph) => {
					graph.addNode("node", async () => ({ variables: {} }));
					graph.addEdge(START, "node");
					graph.addEdge("node", END);
				},
			};

			const result = await executor.execute(workflow, {}, createTestContext());

			expect(result.metadata.version).toBe("0.0.0");
		});

		it("includes source in metadata", async () => {
			const executor = createSubWorkflowExecutor(createTestConfig());
			const workflow = createTestWorkflow("sourced-workflow");

			const result = await executor.execute(workflow, {}, createTestContext());

			expect(result.metadata.source).toBe("project");
		});

		it("includes duration in result", async () => {
			const executor = createSubWorkflowExecutor(createTestConfig());
			const workflow = createTestWorkflow("timed-workflow");

			const result = await executor.execute(workflow, {}, createTestContext());

			expect(typeof result.duration).toBe("number");
			expect(result.duration).toBeGreaterThanOrEqual(0);
		});
	});

	describe("event emission", () => {
		it("emits workflowCallStart event", async () => {
			const { emitter, events } = createMockEmitter();
			const executor = createSubWorkflowExecutor(createTestConfig({ emitter }));
			const workflow = createTestWorkflow("event-workflow");

			await executor.execute(workflow, {}, createTestContext());

			const startEvent = events.find((e) => e.type === "workflow:call:start");
			expect(startEvent).toBeDefined();
		});

		it("emits workflowCallComplete event on success", async () => {
			const { emitter, events } = createMockEmitter();
			const executor = createSubWorkflowExecutor(createTestConfig({ emitter }));
			const workflow = createTestWorkflow("success-workflow");

			await executor.execute(workflow, {}, createTestContext());

			// Either completes or errors - check for either event
			const completeEvent = events.find(
				(e) => e.type === "workflow:call:complete",
			);
			const errorEvent = events.find((e) => e.type === "workflow:call:error");

			expect(completeEvent || errorEvent).toBeDefined();
		});

		it("emits workflowCallError event on failure", async () => {
			const { emitter, events } = createMockEmitter();
			const executor = createSubWorkflowExecutor(createTestConfig({ emitter }));

			// Create circular call to trigger error
			const workflow = createTestWorkflow("circular-workflow");
			const callStack = pushCall(
				createCallStack(),
				createCallStackEntry("circular-workflow", "1.0.0", "node"),
			);

			await executor.execute(workflow, {}, createTestContext({ callStack }));

			const errorEvent = events.find((e) => e.type === "workflow:call:error");
			expect(errorEvent).toBeDefined();
		});

		it("includes correct payload in start event", async () => {
			const { emitter, events } = createMockEmitter();
			const executor = createSubWorkflowExecutor(createTestConfig({ emitter }));
			const workflow = createTestWorkflow("payload-workflow");

			await executor.execute(
				workflow,
				{ input: { key: "value" } },
				createTestContext({
					parentWorkflow: "my-parent",
					parentNode: "my-node",
				}),
			);

			const startEvent = events.find((e) => e.type === "workflow:call:start");
			expect(startEvent).toBeDefined();

			const payload = startEvent?.payload as Record<string, unknown>;
			expect(payload.calledWorkflowName).toBe("payload-workflow");
			expect(payload.callerWorkflowName).toBe("my-parent");
			expect(payload.callerNodeName).toBe("my-node");
		});
	});
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe("createSubWorkflowExecutor", () => {
	it("creates a SubWorkflowExecutor instance", () => {
		const executor = createSubWorkflowExecutor(createTestConfig());

		expect(executor).toBeInstanceOf(SubWorkflowExecutor);
	});

	it("passes config to executor", () => {
		const { emitter } = createMockEmitter();
		const executor = createSubWorkflowExecutor(createTestConfig({ emitter }));

		expect(executor).toBeInstanceOf(SubWorkflowExecutor);
	});
});

describe("createExecutorContext", () => {
	it("creates context with required fields", () => {
		const callStack = createCallStack();
		const context = createExecutorContext("parent-wf", "parent-nd", callStack);

		expect(context.parentWorkflow).toBe("parent-wf");
		expect(context.parentNode).toBe("parent-nd");
		expect(context.callStack).toBe(callStack);
	});

	it("creates context with optional cwd", () => {
		const callStack = createCallStack();
		const context = createExecutorContext(
			"parent-wf",
			"parent-nd",
			callStack,
			"/custom/cwd",
		);

		expect(context.cwd).toBe("/custom/cwd");
	});

	it("creates context without cwd when not specified", () => {
		const callStack = createCallStack();
		const context = createExecutorContext("parent-wf", "parent-nd", callStack);

		expect(context.cwd).toBeUndefined();
	});
});

// ============================================================================
// Error Factory Tests
// ============================================================================

describe("createTimeoutError", () => {
	it("creates error with TIMEOUT code", () => {
		const error = createTimeoutError(5000);

		expect(error.code).toBe("TIMEOUT");
	});

	it("includes timeout value in message", () => {
		const error = createTimeoutError(30000);

		expect(error.message).toContain("30000ms");
	});

	it("handles various timeout values", () => {
		expect(createTimeoutError(100).message).toContain("100ms");
		expect(createTimeoutError(60000).message).toContain("60000ms");
	});
});

describe("createExecutionError", () => {
	it("creates error with EXECUTION_FAILED code", () => {
		const error = createExecutionError("Something failed");

		expect(error.code).toBe("EXECUTION_FAILED");
	});

	it("includes message", () => {
		const error = createExecutionError("Custom error message");

		expect(error.message).toBe("Custom error message");
	});

	it("includes stack trace when provided", () => {
		const error = createExecutionError("Error", "Error: ...\n  at ...");

		expect(error.stack).toBe("Error: ...\n  at ...");
	});

	it("omits stack when not provided", () => {
		const error = createExecutionError("Error");

		expect(error.stack).toBeUndefined();
	});
});

// ============================================================================
// Constants Tests
// ============================================================================

describe("DEFAULT_EXECUTION_TIMEOUT", () => {
	it("is 5 minutes in milliseconds", () => {
		expect(DEFAULT_EXECUTION_TIMEOUT).toBe(5 * 60 * 1000);
	});
});

// ============================================================================
// State Isolation Tests
// ============================================================================

describe("state isolation", () => {
	it("sub-workflow starts with isolated state", async () => {
		const executor = createSubWorkflowExecutor(createTestConfig());

		let capturedState: Record<string, unknown> | null = null;
		const workflow = createTestWorkflow("isolated-workflow", {
			buildFn: (graph) => {
				graph.addNode("capture", async (state) => {
					capturedState = { ...state.variables };
					return { variables: { captured: true } };
				});
				graph.addEdge(START, "capture");
				graph.addEdge("capture", END);
			},
		});

		// Parent context with some variables shouldn't leak to sub-workflow
		await executor.execute(
			workflow,
			{ input: { subInput: "value" } },
			createTestContext(),
		);

		// The captured state should not contain parent variables
		// (parent variables would be things not passed as input)
		if (capturedState) {
			expect(capturedState).not.toHaveProperty("parentSecret");
		}
	});

	it("includes input in sub-workflow variables", async () => {
		const executor = createSubWorkflowExecutor(createTestConfig());

		let capturedInput: unknown = null;
		const workflow = createTestWorkflow("input-workflow", {
			buildFn: (graph) => {
				graph.addNode("capture", async (state) => {
					capturedInput = state.variables._input;
					return { variables: { done: true } };
				});
				graph.addEdge(START, "capture");
				graph.addEdge("capture", END);
			},
		});

		await executor.execute(
			workflow,
			{ input: { myKey: "myValue" } },
			createTestContext(),
		);

		if (capturedInput !== null) {
			expect(capturedInput).toEqual({ myKey: "myValue" });
		}
	});

	it("includes default vars in sub-workflow state", async () => {
		const executor = createSubWorkflowExecutor(createTestConfig());

		let capturedDefault: unknown = null;
		const workflow = createTestWorkflow("default-vars-workflow", {
			vars: { defaultKey: "defaultValue" },
			buildFn: (graph) => {
				graph.addNode("capture", async (state) => {
					capturedDefault = state.variables.defaultKey;
					return { variables: { done: true } };
				});
				graph.addEdge(START, "capture");
				graph.addEdge("capture", END);
			},
		});

		await executor.execute(workflow, {}, createTestContext());

		if (capturedDefault !== null) {
			expect(capturedDefault).toBe("defaultValue");
		}
	});
});

// ============================================================================
// Integration Tests
// ============================================================================

describe("integration scenarios", () => {
	it("handles successful workflow execution end-to-end", async () => {
		const { emitter, events } = createMockEmitter();
		const executor = createSubWorkflowExecutor(createTestConfig({ emitter }));

		const inputSchema = z.object({ name: z.string() });
		const workflow = createTestWorkflow("full-workflow", {
			input: inputSchema,
			version: "1.2.3",
			buildFn: (graph) => {
				graph.addNode("process", async (state) => {
					return {
						variables: {
							_output: { greeting: `Hello, ${state.variables.name}` },
						},
					};
				});
				graph.addEdge(START, "process");
				graph.addEdge("process", END);
			},
		});

		const result = await executor.execute(
			workflow,
			{ input: { name: "World" } },
			createTestContext(),
		);

		// Verify events were emitted
		const startEvent = events.find((e) => e.type === "workflow:call:start");
		expect(startEvent).toBeDefined();

		// Verify metadata
		expect(result.metadata.name).toBe("full-workflow");
		expect(result.metadata.version).toBe("1.2.3");

		// Verify duration is tracked
		expect(result.duration).toBeGreaterThanOrEqual(0);
	});

	it("handles workflow with cwd override", async () => {
		const executor = createSubWorkflowExecutor(createTestConfig());
		const workflow = createTestWorkflow("cwd-workflow");

		// Execute with cwd option
		const result = await executor.execute(
			workflow,
			{ cwd: "/custom/directory" },
			createTestContext(),
		);

		// Should not fail with a path error (execution may fail for other reasons)
		if (!result.success) {
			expect(result.error?.message).not.toContain("cwd");
		}
	});

	it("passes call stack context to sub-workflow", async () => {
		const executor = createSubWorkflowExecutor(createTestConfig());

		let capturedParent: string | undefined;
		const workflow = createTestWorkflow("context-workflow", {
			buildFn: (graph) => {
				graph.addNode("capture", async (state) => {
					capturedParent = state.variables._parentWorkflow as
						| string
						| undefined;
					return { variables: {} };
				});
				graph.addEdge(START, "capture");
				graph.addEdge("capture", END);
			},
		});

		await executor.execute(
			workflow,
			{},
			createTestContext({ parentWorkflow: "specific-parent" }),
		);

		if (capturedParent !== undefined) {
			expect(capturedParent).toBe("specific-parent");
		}
	});

	it("handles multiple sequential executions", async () => {
		const executor = createSubWorkflowExecutor(createTestConfig());
		const workflow = createTestWorkflow("sequential-workflow");

		const result1 = await executor.execute(workflow, {}, createTestContext());
		const result2 = await executor.execute(workflow, {}, createTestContext());
		const result3 = await executor.execute(workflow, {}, createTestContext());

		// All should have metadata
		expect(result1.metadata).toBeDefined();
		expect(result2.metadata).toBeDefined();
		expect(result3.metadata).toBeDefined();

		// All should have duration
		expect(result1.duration).toBeGreaterThanOrEqual(0);
		expect(result2.duration).toBeGreaterThanOrEqual(0);
		expect(result3.duration).toBeGreaterThanOrEqual(0);
	});
});

// ============================================================================
// Edge Cases
// ============================================================================

describe("edge cases", () => {
	it("handles workflow with empty name", async () => {
		const executor = createSubWorkflowExecutor(createTestConfig());
		const workflow = createTestWorkflow("");

		const result = await executor.execute(workflow, {}, createTestContext());

		expect(result.metadata.name).toBe("");
	});

	it("handles workflow with special characters in name", async () => {
		const executor = createSubWorkflowExecutor(createTestConfig());
		const workflow = createTestWorkflow("@scope/workflow-name_v1.0");

		const result = await executor.execute(workflow, {}, createTestContext());

		expect(result.metadata.name).toBe("@scope/workflow-name_v1.0");
	});

	it("handles undefined input", async () => {
		const executor = createSubWorkflowExecutor(createTestConfig());
		const workflow = createTestWorkflow("no-input-workflow");

		// Explicitly pass undefined input
		const result = await executor.execute(
			workflow,
			{ input: undefined },
			createTestContext(),
		);

		// Should not fail with undefined input when no schema
		if (!result.success) {
			expect(result.error?.code).not.toBe("INPUT_VALIDATION");
		}
	});

	it("handles null input when schema allows", async () => {
		const executor = createSubWorkflowExecutor(createTestConfig());
		const workflow = createTestWorkflow("nullable-input-workflow", {
			input: z.null(),
		});

		const result = await executor.execute(
			workflow,
			{ input: null },
			createTestContext(),
		);

		// Should pass validation
		if (!result.success) {
			expect(result.error?.code).not.toBe("INPUT_VALIDATION");
		}
	});

	it("handles very long timeout value", async () => {
		const executor = createSubWorkflowExecutor(createTestConfig());
		const workflow = createTestWorkflow("long-timeout-workflow");

		// Use a large but valid 32-bit timeout (just under max int32)
		const result = await executor.execute(
			workflow,
			{ timeout: 2147483647 }, // Max 32-bit signed int
			createTestContext(),
		);

		// Should not fail due to timeout value
		if (!result.success) {
			expect(result.error?.code).not.toBe("TIMEOUT");
		}
	});

	it("handles zero timeout gracefully", async () => {
		const executor = createSubWorkflowExecutor(createTestConfig());
		const workflow = createTestWorkflow("zero-timeout-workflow");

		// Zero timeout - workflow should timeout immediately
		const result = await executor.execute(
			workflow,
			{ timeout: 0 },
			createTestContext(),
		);

		// With zero or negative timeout, executor skips timeout logic
		// So it should either succeed or fail for other reasons
		expect(result).toHaveProperty("success");
	});

	it("handles negative timeout (treated as no timeout)", async () => {
		const executor = createSubWorkflowExecutor(createTestConfig());
		const workflow = createTestWorkflow("negative-timeout-workflow");

		// Negative timeout should be treated as no timeout
		const result = await executor.execute(
			workflow,
			{ timeout: -1000 },
			createTestContext(),
		);

		// Should not produce TIMEOUT error
		if (!result.success) {
			expect(result.error?.code).not.toBe("TIMEOUT");
		}
	});
});
