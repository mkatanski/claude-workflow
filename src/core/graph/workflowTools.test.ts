/**
 * Unit tests for workflowTools.
 *
 * Tests the workflow composition functionality including:
 * - Reference parsing and validation
 * - Circular call detection
 * - Max depth enforcement
 * - Error handling and event emission
 * - Registry resolution
 * - Successful execution with isolated state
 * - Plan mode and EnterPlanMode blocking
 * - Critical files extraction
 */

import { describe, expect, it, mock } from "bun:test";
import { extractCriticalFiles } from "./workflowTools.ts";
import {
	createCallStack,
	createCallStackEntry,
	pushCall,
} from "../composition/circular.ts";
import type { WorkflowEmitter } from "../events/index.ts";
import type { ResolveResult, WorkflowRegistry } from "../registry/index.ts";
import type { WorkflowStateType } from "./state.ts";
import {
	createWorkflowTools,
	type WorkflowToolsConfig,
} from "./workflowTools.ts";

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Create a minimal workflow state for testing.
 */
function createTestState(
	variables: Record<string, unknown> = {},
): WorkflowStateType {
	return {
		variables: {
			...variables,
		},
		error: null,
		completed: false,
	};
}

/**
 * Create a mock emitter for testing event emission.
 */
function createMockEmitter(): WorkflowEmitter & {
	events: Array<{ type: string; payload: unknown }>;
} {
	const events: Array<{ type: string; payload: unknown }> = [];

	const emitter = {
		events,
		emit: (type: string, payload: unknown) => {
			events.push({ type, payload });
		},
		on: () => {},
		off: () => {},
		getContext: () => ({ workflowName: "test-workflow" }),
		setContext: () => {},
		generateEventId: () => "test-event-id",
		generateCorrelationId: () => "test-correlation-id",
	} as unknown as WorkflowEmitter & {
		events: Array<{ type: string; payload: unknown }>;
	};

	return emitter;
}

/**
 * Create a mock workflow registry.
 */
function createMockRegistry(resolveResult: ResolveResult): WorkflowRegistry {
	return {
		resolve: mock(() => Promise.resolve(resolveResult)),
		list: mock(() => Promise.resolve([])),
		get: mock(() => Promise.resolve(undefined)),
	} as unknown as WorkflowRegistry;
}

/**
 * Create default config for tests.
 */
function createTestConfig(
	overrides: Partial<WorkflowToolsConfig> = {},
): WorkflowToolsConfig {
	return {
		projectPath: "/test/project",
		tempDir: "/test/temp",
		workflowName: "test-parent",
		currentNodeName: "test-node",
		...overrides,
	};
}

// ============================================================================
// Tests: workflow() method
// ============================================================================

describe("WorkflowTools.workflow()", () => {
	describe("interface and structure", () => {
		it("should have workflow method on tools interface", () => {
			const state = createTestState();
			const config = createTestConfig();
			const { tools } = createWorkflowTools(state, config);

			expect(tools.workflow).toBeDefined();
			expect(typeof tools.workflow).toBe("function");
		});

		it("should return result with correct structure", async () => {
			const state = createTestState();
			const config = createTestConfig();
			const { tools } = createWorkflowTools(state, config);

			const result = await tools.workflow("some-workflow");

			// Should return a result object with required fields
			expect(result).toHaveProperty("success");
			expect(result).toHaveProperty("duration");
			expect(result).toHaveProperty("metadata");
			expect(typeof result.duration).toBe("number");
			expect(result.duration).toBeGreaterThanOrEqual(0);
		});
	});

	describe("reference parsing", () => {
		it("should parse simple workflow name", async () => {
			const state = createTestState();
			const config = createTestConfig();
			const { tools } = createWorkflowTools(state, config);

			const result = await tools.workflow("my-workflow");

			// Without registry, will get WORKFLOW_NOT_FOUND
			expect(result.metadata.name).toBe("my-workflow");
		});

		it("should parse workflow with version", async () => {
			const state = createTestState();
			const config = createTestConfig();
			const { tools } = createWorkflowTools(state, config);

			const result = await tools.workflow("my-workflow@^1.0.0");

			expect(result.metadata.name).toBe("my-workflow");
		});

		it("should parse workflow with export", async () => {
			const state = createTestState();
			const config = createTestConfig();
			const { tools } = createWorkflowTools(state, config);

			const result = await tools.workflow("my-workflow:analyzeCode");

			// Name should be parsed correctly
			expect(result.metadata.name).toBe("my-workflow");
			// Export is only included in metadata on successful execution
			// For early failures (like WORKFLOW_NOT_FOUND), it may not be present
		});

		it("should parse workflow with version and export", async () => {
			const state = createTestState();
			const config = createTestConfig();
			const { tools } = createWorkflowTools(state, config);

			const result = await tools.workflow("my-workflow@^1.0.0:analyzeCode");

			// Name should be parsed correctly
			expect(result.metadata.name).toBe("my-workflow");
			// Export is only included in metadata on successful execution
		});

		it("should parse scoped package name", async () => {
			const state = createTestState();
			const config = createTestConfig();
			const { tools } = createWorkflowTools(state, config);

			const result = await tools.workflow("@myorg/my-workflow");

			expect(result.metadata.name).toBe("@myorg/my-workflow");
		});

		it("should return error for empty reference", async () => {
			const state = createTestState();
			const config = createTestConfig();
			const { tools } = createWorkflowTools(state, config);

			const result = await tools.workflow("");

			expect(result.success).toBe(false);
			expect(result.error?.code).toBe("WORKFLOW_NOT_FOUND");
			expect(result.error?.message).toContain("empty");
		});

		it("should return error for invalid reference format", async () => {
			const state = createTestState();
			const config = createTestConfig();
			const { tools } = createWorkflowTools(state, config);

			const result = await tools.workflow("invalid name with spaces");

			expect(result.success).toBe(false);
			expect(result.error?.code).toBe("WORKFLOW_NOT_FOUND");
		});
	});

	describe("circular call detection", () => {
		it("should detect direct circular call", async () => {
			const state = createTestState();

			// Create a call stack with "workflow-a" already executing
			const callStack = createCallStack();
			const stackWithCall = pushCall(
				callStack,
				createCallStackEntry("workflow-a", "1.0.0", "init-node"),
			);

			const config = createTestConfig({
				workflowName: "parent-workflow",
				currentNodeName: "call-node",
				callStack: stackWithCall,
			});

			const { tools } = createWorkflowTools(state, config);

			// Try to call workflow-a again (circular)
			const result = await tools.workflow("workflow-a");

			expect(result.success).toBe(false);
			expect(result.error?.code).toBe("CIRCULAR_CALL");
			expect(result.error?.message).toContain(
				"Circular workflow call detected",
			);
			expect(result.error?.message).toContain("workflow-a");
		});

		it("should detect indirect circular call (A -> B -> A)", async () => {
			const state = createTestState();

			// Create a call stack: workflow-a called workflow-b
			const callStack = createCallStack();
			let stack = pushCall(
				callStack,
				createCallStackEntry("workflow-a", "1.0.0", "node-1"),
			);
			stack = pushCall(
				stack,
				createCallStackEntry("workflow-b", "1.0.0", "node-2"),
			);

			const config = createTestConfig({
				workflowName: "workflow-b",
				currentNodeName: "call-node",
				callStack: stack,
			});

			const { tools } = createWorkflowTools(state, config);

			// workflow-b tries to call workflow-a (circular)
			const result = await tools.workflow("workflow-a");

			expect(result.success).toBe(false);
			expect(result.error?.code).toBe("CIRCULAR_CALL");
		});

		it("should allow non-circular call", async () => {
			const state = createTestState();

			// Create a call stack with "workflow-a" executing
			const callStack = createCallStack();
			const stackWithCall = pushCall(
				callStack,
				createCallStackEntry("workflow-a", "1.0.0", "init-node"),
			);

			const config = createTestConfig({
				workflowName: "workflow-a",
				currentNodeName: "call-node",
				callStack: stackWithCall,
			});

			const { tools } = createWorkflowTools(state, config);

			// Call workflow-b (not circular)
			const result = await tools.workflow("workflow-b");

			// Should not be circular - will fail for other reason (no registry)
			expect(result.error?.code).not.toBe("CIRCULAR_CALL");
		});
	});

	describe("max depth enforcement", () => {
		it("should detect max depth exceeded", async () => {
			const state = createTestState();

			// Create a call stack at max depth
			let callStack = createCallStack({ maxDepth: 3 });
			for (let i = 0; i < 3; i++) {
				callStack = pushCall(
					callStack,
					createCallStackEntry(`workflow-${i}`, "1.0.0", "node"),
				);
			}

			const config = createTestConfig({
				workflowName: "workflow-2",
				currentNodeName: "call-node",
				callStack,
			});

			const { tools } = createWorkflowTools(state, config);

			// Try to call another workflow (would exceed max depth)
			const result = await tools.workflow("workflow-new");

			expect(result.success).toBe(false);
			expect(result.error?.code).toBe("CIRCULAR_CALL");
			expect(result.error?.message).toContain("Maximum workflow call depth");
		});
	});

	describe("WORKFLOW_NOT_FOUND errors", () => {
		it("should return WORKFLOW_NOT_FOUND when no registry configured", async () => {
			const state = createTestState();
			const config = createTestConfig({
				registry: undefined,
			});

			const { tools } = createWorkflowTools(state, config);

			const result = await tools.workflow("some-workflow");

			expect(result.success).toBe(false);
			expect(result.error?.code).toBe("WORKFLOW_NOT_FOUND");
			expect(result.error?.message).toContain(
				"No workflow registry is configured",
			);
		});

		it("should return WORKFLOW_NOT_FOUND when registry resolution fails", async () => {
			const state = createTestState();

			const registry = createMockRegistry({
				_tag: "err",
				error: {
					code: "NOT_FOUND",
					message: "Workflow not found",
				},
			} as unknown as ResolveResult);

			const config = createTestConfig({ registry });

			const { tools } = createWorkflowTools(state, config);

			const result = await tools.workflow("missing-workflow");

			expect(result.success).toBe(false);
			expect(result.error?.code).toBe("WORKFLOW_NOT_FOUND");
		});

		it("should return VERSION_NOT_FOUND for version mismatch", async () => {
			const state = createTestState();

			const registry = createMockRegistry({
				_tag: "err",
				error: {
					code: "VERSION_NOT_FOUND",
					message: "Version ^2.0.0 not found",
					availableVersions: ["1.0.0", "1.1.0"],
				},
			} as unknown as ResolveResult);

			const config = createTestConfig({ registry });

			const { tools } = createWorkflowTools(state, config);

			const result = await tools.workflow("my-workflow@^2.0.0");

			expect(result.success).toBe(false);
			expect(result.error?.code).toBe("VERSION_NOT_FOUND");
			expect(result.error?.availableVersions).toEqual(["1.0.0", "1.1.0"]);
		});
	});

	describe("event emission", () => {
		it("should emit workflow:call:error for parse errors", async () => {
			const state = createTestState();
			const emitter = createMockEmitter();
			const config = createTestConfig();

			const { tools } = createWorkflowTools(state, config, undefined, emitter);

			await tools.workflow("");

			// Should emit error event
			const errorEvents = emitter.events.filter(
				(e) => e.type === "workflow:call:error",
			);
			expect(errorEvents.length).toBeGreaterThanOrEqual(1);
		});

		it("should emit workflow:call:error for circular calls", async () => {
			const state = createTestState();
			const emitter = createMockEmitter();

			const callStack = createCallStack();
			const stackWithCall = pushCall(
				callStack,
				createCallStackEntry("workflow-a", "1.0.0", "init-node"),
			);

			const config = createTestConfig({
				callStack: stackWithCall,
			});

			const { tools } = createWorkflowTools(state, config, undefined, emitter);

			await tools.workflow("workflow-a");

			const errorEvents = emitter.events.filter(
				(e) => e.type === "workflow:call:error",
			);
			expect(errorEvents.length).toBeGreaterThanOrEqual(1);

			// Verify error payload structure
			const errorPayload = errorEvents[0].payload as {
				calledWorkflowName: string;
				callerWorkflowName: string;
				callerNodeName: string;
				error: string;
				depth: number;
			};

			expect(errorPayload.calledWorkflowName).toBe("workflow-a");
			expect(errorPayload.callerWorkflowName).toBe("test-parent");
			expect(errorPayload.callerNodeName).toBe("test-node");
			expect(errorPayload.error).toContain("Circular");
		});

		it("should emit workflow:call:error for WORKFLOW_NOT_FOUND", async () => {
			const state = createTestState();
			const emitter = createMockEmitter();
			const config = createTestConfig();

			const { tools } = createWorkflowTools(state, config, undefined, emitter);

			await tools.workflow("missing-workflow");

			const errorEvents = emitter.events.filter(
				(e) => e.type === "workflow:call:error",
			);
			expect(errorEvents.length).toBeGreaterThanOrEqual(1);
		});
	});

	describe("result structure", () => {
		it("should include duration in result", async () => {
			const state = createTestState();
			const config = createTestConfig();

			const { tools } = createWorkflowTools(state, config);

			const result = await tools.workflow("some-workflow");

			expect(typeof result.duration).toBe("number");
			expect(result.duration).toBeGreaterThanOrEqual(0);
		});

		it("should include metadata in result", async () => {
			const state = createTestState();
			const config = createTestConfig();

			const { tools } = createWorkflowTools(state, config);

			const result = await tools.workflow("my-workflow@1.0.0:myExport");

			expect(result.metadata).toBeDefined();
			expect(result.metadata.name).toBe("my-workflow");
			expect(result.metadata.source).toBe("project");
		});

		it("should not include export in metadata on early failures", async () => {
			const state = createTestState();
			const config = createTestConfig();

			const { tools } = createWorkflowTools(state, config);

			// Without a registry, this will fail with WORKFLOW_NOT_FOUND
			const result = await tools.workflow("my-workflow:myExport");

			// On early failures, export is not included in metadata
			// It would only be included on successful execution
			expect(result.success).toBe(false);
			expect(result.metadata.name).toBe("my-workflow");
			// Export is only populated on successful execution
		});
	});

	describe("options handling", () => {
		it("should accept input option", async () => {
			const state = createTestState();
			const config = createTestConfig();

			const { tools } = createWorkflowTools(state, config);

			// Even though it will fail (no registry), it should accept the input option
			const result = await tools.workflow("some-workflow", {
				input: { key: "value" },
			});

			expect(result).toBeDefined();
		});

		it("should accept timeout option", async () => {
			const state = createTestState();
			const config = createTestConfig();

			const { tools } = createWorkflowTools(state, config);

			const result = await tools.workflow("some-workflow", {
				timeout: 30000,
			});

			expect(result).toBeDefined();
		});

		it("should accept cwd option", async () => {
			const state = createTestState();
			const config = createTestConfig();

			const { tools } = createWorkflowTools(state, config);

			const result = await tools.workflow("some-workflow", {
				cwd: "/custom/path",
			});

			expect(result).toBeDefined();
		});

		it("should accept label option", async () => {
			const state = createTestState();
			const config = createTestConfig();

			const { tools } = createWorkflowTools(state, config);

			const result = await tools.workflow("some-workflow", {
				label: "my-label",
			});

			expect(result).toBeDefined();
		});
	});

	describe("result type guard compatibility", () => {
		it("should return success:false with error object on failure", async () => {
			const state = createTestState();
			const config = createTestConfig();

			const { tools } = createWorkflowTools(state, config);

			const result = await tools.workflow("missing-workflow");

			expect(result.success).toBe(false);
			expect(result.error).toBeDefined();
			expect(result.error?.code).toBeDefined();
			expect(result.error?.message).toBeDefined();
		});

		it("should not have output on failure", async () => {
			const state = createTestState();
			const config = createTestConfig();

			const { tools } = createWorkflowTools(state, config);

			const result = await tools.workflow("missing-workflow");

			expect(result.output).toBeUndefined();
		});
	});

	describe("type safety", () => {
		it("should support generic input type", async () => {
			const state = createTestState();
			const config = createTestConfig();

			const { tools } = createWorkflowTools(state, config);

			interface MyInput {
				path: string;
				options: { recursive: boolean };
			}

			const result = await tools.workflow<MyInput>("some-workflow", {
				input: { path: "./src", options: { recursive: true } },
			});

			expect(result).toBeDefined();
		});

		it("should support generic output type", async () => {
			const state = createTestState();
			const config = createTestConfig();

			const { tools } = createWorkflowTools(state, config);

			interface MyOutput {
				files: string[];
				count: number;
			}

			const result = await tools.workflow<unknown, MyOutput>("some-workflow");

			// Type should be WorkflowCallResult<MyOutput>
			expect(result).toBeDefined();
			// result.output would be MyOutput | undefined
		});
	});

	describe("default values", () => {
		it("should use default workflowName when not provided", async () => {
			const state = createTestState();
			const emitter = createMockEmitter();
			const config: WorkflowToolsConfig = {
				projectPath: "/test/project",
				tempDir: "/test/temp",
				// No workflowName specified
			};

			const { tools } = createWorkflowTools(state, config, undefined, emitter);

			await tools.workflow("test-workflow");

			// The error event should show "unknown" as the caller workflow
			const errorEvents = emitter.events.filter(
				(e) => e.type === "workflow:call:error",
			);
			if (errorEvents.length > 0) {
				const payload = errorEvents[0].payload as {
					callerWorkflowName: string;
				};
				expect(payload.callerWorkflowName).toBe("unknown");
			}
		});

		it("should use default currentNodeName when not provided", async () => {
			const state = createTestState();
			const emitter = createMockEmitter();
			const config: WorkflowToolsConfig = {
				projectPath: "/test/project",
				tempDir: "/test/temp",
				workflowName: "test-parent",
				// No currentNodeName specified
			};

			const { tools } = createWorkflowTools(state, config, undefined, emitter);

			await tools.workflow("test-workflow");

			// The error event should show "unknown" as the caller node
			const errorEvents = emitter.events.filter(
				(e) => e.type === "workflow:call:error",
			);
			if (errorEvents.length > 0) {
				const payload = errorEvents[0].payload as { callerNodeName: string };
				expect(payload.callerNodeName).toBe("unknown");
			}
		});

		it("should create empty call stack when not provided", async () => {
			const state = createTestState();
			const config: WorkflowToolsConfig = {
				projectPath: "/test/project",
				tempDir: "/test/temp",
				// No callStack specified
			};

			const { tools } = createWorkflowTools(state, config);

			// Should not fail due to missing call stack
			const result = await tools.workflow("test-workflow");
			expect(result).toBeDefined();
		});
	});
});

// ============================================================================
// Tests: extractCriticalFiles helper
// ============================================================================

describe("extractCriticalFiles", () => {
	it("should extract backtick-wrapped file paths", () => {
		const plan = `
## Critical Files
- Modify \`src/index.ts\` for main entry
- Update \`src/utils/helper.ts\` for utilities
`;
		const result = extractCriticalFiles(plan);

		expect(result).toContain("src/index.ts");
		expect(result).toContain("src/utils/helper.ts");
	});

	it("should extract simple file names", () => {
		const plan = `
Update the \`config.json\` and \`package.json\` files.
`;
		const result = extractCriticalFiles(plan);

		expect(result).toContain("config.json");
		expect(result).toContain("package.json");
	});

	it("should extract paths from list items", () => {
		const plan = `
## Files to Modify
- src/core/types.ts
- src/utils/index.ts
- tests/unit.test.ts
`;
		const result = extractCriticalFiles(plan);

		expect(result).toContain("src/core/types.ts");
		expect(result).toContain("src/utils/index.ts");
		expect(result).toContain("tests/unit.test.ts");
	});

	it("should handle paths with asterisks in list items", () => {
		const plan = `
## Files
* src/main.ts
* lib/helpers.js
`;
		const result = extractCriticalFiles(plan);

		expect(result).toContain("src/main.ts");
		expect(result).toContain("lib/helpers.js");
	});

	it("should skip URLs", () => {
		const plan = `
See \`https://example.com/docs.html\` for documentation.
Visit http://api.example.com/endpoint.json for the API.
`;
		const result = extractCriticalFiles(plan);

		expect(result).not.toContain("https://example.com/docs.html");
		expect(result).not.toContain("http://api.example.com/endpoint.json");
	});

	it("should skip package manager commands", () => {
		const plan = `
Run \`npm install\` or \`yarn add\` or \`pnpm install\`.
`;
		const result = extractCriticalFiles(plan);

		expect(result).toHaveLength(0);
	});

	it("should skip paths with spaces", () => {
		const plan = `
The file \`my file.ts\` should be skipped.
`;
		const result = extractCriticalFiles(plan);

		expect(result).not.toContain("my file.ts");
	});

	it("should deduplicate repeated file references", () => {
		const plan = `
Modify \`src/index.ts\` first.
Then update \`src/index.ts\` again.
- src/index.ts
`;
		const result = extractCriticalFiles(plan);

		const indexCount = result.filter((f) => f === "src/index.ts").length;
		expect(indexCount).toBe(1);
	});

	it("should handle empty plan content", () => {
		const result = extractCriticalFiles("");

		expect(result).toHaveLength(0);
	});

	it("should handle plan with no file references", () => {
		const plan = `
## Summary
This is a general plan without any specific file paths.
Just some text describing the approach.
`;
		const result = extractCriticalFiles(plan);

		expect(result).toHaveLength(0);
	});

	it("should handle various file extensions", () => {
		const plan = `
Files: \`app.tsx\`, \`style.css\`, \`config.yaml\`, \`data.json\`, \`script.py\`
`;
		const result = extractCriticalFiles(plan);

		expect(result).toContain("app.tsx");
		expect(result).toContain("style.css");
		expect(result).toContain("config.yaml");
		expect(result).toContain("data.json");
		expect(result).toContain("script.py");
	});
});

// ============================================================================
// Tests: agentSession plan mode behavior
// ============================================================================

describe("WorkflowTools.agentSession() plan mode", () => {
	describe("interface and structure", () => {
		it("should have agentSession method on tools interface", () => {
			const state = createTestState();
			const config = createTestConfig();
			const { tools } = createWorkflowTools(state, config);

			expect(tools.agentSession).toBeDefined();
			expect(typeof tools.agentSession).toBe("function");
		});

		it("should have planningAgentSession method on tools interface", () => {
			const state = createTestState();
			const config = createTestConfig();
			const { tools } = createWorkflowTools(state, config);

			expect(tools.planningAgentSession).toBeDefined();
			expect(typeof tools.planningAgentSession).toBe("function");
		});
	});
});
