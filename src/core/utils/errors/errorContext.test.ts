/**
 * Unit tests for error context utilities.
 */

import { describe, expect, it } from "bun:test";
import {
	createNodeErrorContext,
	createToolErrorContext,
	createWorkflowErrorContext,
	enrichErrorContext,
	formatErrorContext,
	mergeErrorContexts,
	serializeErrorContext,
	type ErrorContext,
} from "./errorContext.js";

describe("createWorkflowErrorContext", () => {
	it("should create basic workflow context", () => {
		const context = createWorkflowErrorContext("my-workflow");

		expect(context.workflowName).toBe("my-workflow");
		expect(context.nodeName).toBeUndefined();
		expect(context.toolName).toBeUndefined();
	});

	it("should merge additional context", () => {
		const context = createWorkflowErrorContext("my-workflow", {
			step: "initialization",
			metadata: { version: "1.0" },
		});

		expect(context.workflowName).toBe("my-workflow");
		expect(context.step).toBe("initialization");
		expect(context.metadata).toEqual({ version: "1.0" });
	});
});

describe("createNodeErrorContext", () => {
	it("should create node context with workflow and node", () => {
		const context = createNodeErrorContext("my-workflow", "process-data");

		expect(context.workflowName).toBe("my-workflow");
		expect(context.nodeName).toBe("process-data");
	});

	it("should merge additional context", () => {
		const context = createNodeErrorContext("my-workflow", "process-data", {
			operation: "transform",
			paneId: "pane-123",
		});

		expect(context.workflowName).toBe("my-workflow");
		expect(context.nodeName).toBe("process-data");
		expect(context.operation).toBe("transform");
		expect(context.paneId).toBe("pane-123");
	});
});

describe("createToolErrorContext", () => {
	it("should create tool context with all identifiers", () => {
		const context = createToolErrorContext(
			"my-workflow",
			"execute-step",
			"bash",
		);

		expect(context.workflowName).toBe("my-workflow");
		expect(context.nodeName).toBe("execute-step");
		expect(context.toolName).toBe("bash");
	});

	it("should merge additional context", () => {
		const context = createToolErrorContext(
			"my-workflow",
			"execute-step",
			"bash",
			{
				step: "command-execution",
				metadata: { command: "ls -la" },
			},
		);

		expect(context.toolName).toBe("bash");
		expect(context.step).toBe("command-execution");
		expect(context.metadata).toEqual({ command: "ls -la" });
	});
});

describe("enrichErrorContext", () => {
	it("should add correlation information", () => {
		const baseContext: ErrorContext = {
			workflowName: "test-workflow",
			nodeName: "test-node",
		};

		const enriched = enrichErrorContext(
			baseContext,
			"error-123",
			"correlation-456",
			"parent-789",
		);

		expect(enriched.workflowName).toBe("test-workflow");
		expect(enriched.nodeName).toBe("test-node");
		expect(enriched.errorId).toBe("error-123");
		expect(enriched.correlationId).toBe("correlation-456");
		expect(enriched.parentErrorId).toBe("parent-789");
		expect(enriched.timestamp).toBeDefined();
	});

	it("should generate valid ISO timestamp", () => {
		const context = enrichErrorContext({ workflowName: "test" }, "error-id");

		// Should be valid ISO format
		const parsedDate = new Date(context.timestamp);
		expect(parsedDate.toISOString()).toBe(context.timestamp);
	});

	it("should work without optional correlation info", () => {
		const enriched = enrichErrorContext({ workflowName: "test" }, "error-id");

		expect(enriched.errorId).toBe("error-id");
		expect(enriched.correlationId).toBeUndefined();
		expect(enriched.parentErrorId).toBeUndefined();
	});
});

describe("mergeErrorContexts", () => {
	it("should merge multiple contexts", () => {
		const context1: ErrorContext = { workflowName: "workflow-1" };
		const context2: ErrorContext = { nodeName: "node-1" };
		const context3: ErrorContext = { toolName: "tool-1" };

		const merged = mergeErrorContexts(context1, context2, context3);

		expect(merged.workflowName).toBe("workflow-1");
		expect(merged.nodeName).toBe("node-1");
		expect(merged.toolName).toBe("tool-1");
	});

	it("should allow later contexts to override earlier ones", () => {
		const context1: ErrorContext = {
			workflowName: "workflow-1",
			nodeName: "node-1",
		};
		const context2: ErrorContext = {
			nodeName: "node-2",
			toolName: "tool-1",
		};

		const merged = mergeErrorContexts(context1, context2);

		expect(merged.workflowName).toBe("workflow-1");
		expect(merged.nodeName).toBe("node-2");
		expect(merged.toolName).toBe("tool-1");
	});

	it("should merge metadata objects", () => {
		const context1: ErrorContext = {
			workflowName: "test",
			metadata: { key1: "value1", shared: "from-1" },
		};
		const context2: ErrorContext = {
			metadata: { key2: "value2", shared: "from-2" },
		};

		const merged = mergeErrorContexts(context1, context2);

		expect(merged.metadata).toEqual({
			key1: "value1",
			key2: "value2",
			shared: "from-2",
		});
	});

	it("should handle contexts without metadata", () => {
		const context1: ErrorContext = { workflowName: "test" };
		const context2: ErrorContext = { nodeName: "node" };

		const merged = mergeErrorContexts(context1, context2);

		expect(merged.metadata).toBeUndefined();
	});

	it("should handle single context with metadata", () => {
		const context1: ErrorContext = { workflowName: "test" };
		const context2: ErrorContext = {
			metadata: { key: "value" },
		};

		const merged = mergeErrorContexts(context1, context2);

		expect(merged.metadata).toEqual({ key: "value" });
	});

	it("should handle empty contexts array", () => {
		const merged = mergeErrorContexts();

		expect(merged).toEqual({});
	});
});

describe("serializeErrorContext", () => {
	it("should serialize basic context", () => {
		const context: ErrorContext = {
			workflowName: "test-workflow",
			nodeName: "test-node",
			toolName: "test-tool",
		};

		const serialized = serializeErrorContext(context);

		expect(serialized.workflowName).toBe("test-workflow");
		expect(serialized.nodeName).toBe("test-node");
		expect(serialized.toolName).toBe("test-tool");
	});

	it("should copy metadata to new object", () => {
		const metadata = { key: "value" };
		const context: ErrorContext = {
			workflowName: "test",
			metadata,
		};

		const serialized = serializeErrorContext(context);

		// Should be a copy, not the same reference
		expect(serialized.metadata).toEqual({ key: "value" });
		expect(serialized.metadata).not.toBe(metadata);
	});

	it("should handle context with correlation", () => {
		const context = enrichErrorContext(
			{ workflowName: "test" },
			"error-123",
			"correlation-456",
		);

		const serialized = serializeErrorContext(context);

		expect(serialized.errorId).toBe("error-123");
		expect(serialized.correlationId).toBe("correlation-456");
		expect(serialized.timestamp).toBeDefined();
	});

	it("should handle undefined metadata", () => {
		const context: ErrorContext = { workflowName: "test" };

		const serialized = serializeErrorContext(context);

		expect(serialized.metadata).toBeUndefined();
	});
});

describe("formatErrorContext", () => {
	it("should filter out undefined values", () => {
		const context: ErrorContext = {
			workflowName: "test",
			nodeName: undefined,
			toolName: "bash",
		};

		const formatted = formatErrorContext(context);

		expect(formatted.workflowName).toBe("test");
		expect(formatted.toolName).toBe("bash");
		expect("nodeName" in formatted).toBe(false);
	});

	it("should filter out null values", () => {
		const context = {
			workflowName: "test",
			nodeName: null,
		} as unknown as ErrorContext;

		const formatted = formatErrorContext(context);

		expect(formatted.workflowName).toBe("test");
		expect("nodeName" in formatted).toBe(false);
	});

	it("should keep falsy but valid values", () => {
		const context: ErrorContext = {
			workflowName: "",
			metadata: { count: 0, active: false },
		};

		const formatted = formatErrorContext(context);

		// Empty string is falsy but valid
		expect(formatted.workflowName).toBe("");
		expect(formatted.metadata).toEqual({ count: 0, active: false });
	});

	it("should handle enriched context", () => {
		const enriched = enrichErrorContext(
			{
				workflowName: "test",
				nodeName: undefined,
				metadata: { key: "value" },
			},
			"error-id",
		);

		const formatted = formatErrorContext(enriched);

		expect(formatted.workflowName).toBe("test");
		expect(formatted.errorId).toBe("error-id");
		expect(formatted.metadata).toEqual({ key: "value" });
		expect("nodeName" in formatted).toBe(false);
	});
});
