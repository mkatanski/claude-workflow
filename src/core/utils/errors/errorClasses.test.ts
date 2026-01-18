/**
 * Unit tests for error class hierarchy.
 */

import { describe, expect, it } from "bun:test";
import {
	CircuitBreakerError,
	ConfigurationError,
	ExecutionError,
	getRetrySuggestion,
	isCircuitBreakerError,
	isConfigurationError,
	isExecutionError,
	isRetryError,
	isTimeoutError,
	isToolError,
	isValidationError,
	isWorkflowError,
	RetryError,
	TimeoutError,
	ToolError,
	toWorkflowError,
	ValidationError,
	WorkflowError,
} from "./errorClasses.js";

describe("WorkflowError", () => {
	it("should create error with default values", () => {
		const error = new WorkflowError("Test error");

		expect(error.message).toBe("Test error");
		expect(error.name).toBe("WorkflowError");
		expect(error.type).toBe("WorkflowError");
		expect(error.category).toBe("unknown");
		expect(error.cause).toBeUndefined();
		expect(error.context).toBeUndefined();
		expect(error.timestamp).toBeInstanceOf(Date);
	});

	it("should create error with custom options", () => {
		const cause = new Error("Original error");
		const error = new WorkflowError("Test error", {
			type: "CustomType",
			category: "transient",
			cause,
			context: { key: "value" },
		});

		expect(error.type).toBe("CustomType");
		expect(error.category).toBe("transient");
		expect(error.cause).toBe(cause);
		expect(error.context).toEqual({ key: "value" });
	});

	it("should format error string correctly", () => {
		const cause = new Error("Root cause");
		const error = new WorkflowError("Something went wrong", {
			context: { operation: "test" },
			cause,
		});

		const formatted = error.toFormattedString();

		expect(formatted).toContain("[WorkflowError] Something went wrong");
		expect(formatted).toContain("Context:");
		expect(formatted).toContain("operation");
		expect(formatted).toContain("Caused by: Root cause");
	});

	it("should serialize to JSON correctly", () => {
		const error = new WorkflowError("Test error", {
			type: "TestType",
			category: "permanent",
			context: { data: 123 },
		});

		const json = error.toJSON();

		expect(json.name).toBe("WorkflowError");
		expect(json.type).toBe("TestType");
		expect(json.category).toBe("permanent");
		expect(json.message).toBe("Test error");
		expect(json.context).toEqual({ data: 123 });
		expect(json.timestamp).toBeDefined();
		expect(json.stack).toBeDefined();
	});

	it("should include cause in JSON when present", () => {
		const cause = new Error("Root cause");
		const error = new WorkflowError("Wrapper", { cause });

		const json = error.toJSON();

		expect(json.cause).toBeDefined();
		expect((json.cause as Record<string, unknown>).message).toBe("Root cause");
	});
});

describe("ValidationError", () => {
	it("should create with field information", () => {
		const error = new ValidationError("Invalid email", {
			field: "email",
			expected: "valid email format",
			received: "not-an-email",
		});

		expect(error.name).toBe("ValidationError");
		expect(error.type).toBe("ValidationError");
		expect(error.category).toBe("permanent");
		expect(error.field).toBe("email");
		expect(error.expected).toBe("valid email format");
		expect(error.received).toBe("not-an-email");
	});

	it("should include field info in context", () => {
		const error = new ValidationError("Invalid value", {
			field: "count",
			expected: "number",
			received: "string",
		});

		expect(error.context?.field).toBe("count");
		expect(error.context?.expected).toBe("number");
		expect(error.context?.received).toBe("string");
	});
});

describe("ExecutionError", () => {
	it("should create with step and exit code", () => {
		const error = new ExecutionError("Command failed", {
			step: "build",
			exitCode: 1,
		});

		expect(error.name).toBe("ExecutionError");
		expect(error.type).toBe("ExecutionError");
		expect(error.category).toBe("unknown");
		expect(error.step).toBe("build");
		expect(error.exitCode).toBe(1);
	});
});

describe("TimeoutError", () => {
	it("should create with timeout information", () => {
		const error = new TimeoutError("Operation timed out", {
			timeoutMs: 5000,
			elapsedMs: 5100,
			operation: "api-call",
		});

		expect(error.name).toBe("TimeoutError");
		expect(error.type).toBe("TimeoutError");
		expect(error.category).toBe("transient");
		expect(error.timeoutMs).toBe(5000);
		expect(error.elapsedMs).toBe(5100);
		expect(error.operation).toBe("api-call");
	});
});

describe("ConfigurationError", () => {
	it("should create with config key", () => {
		const error = new ConfigurationError("Invalid config", {
			configKey: "api.url",
		});

		expect(error.name).toBe("ConfigurationError");
		expect(error.type).toBe("ConfigurationError");
		expect(error.category).toBe("permanent");
		expect(error.configKey).toBe("api.url");
	});
});

describe("ToolError", () => {
	it("should create with tool information", () => {
		const error = new ToolError("Tool failed", {
			toolName: "bash",
			output: "Command not found",
		});

		expect(error.name).toBe("ToolError");
		expect(error.type).toBe("ToolError");
		expect(error.category).toBe("transient");
		expect(error.toolName).toBe("bash");
		expect(error.output).toBe("Command not found");
	});
});

describe("RetryError", () => {
	it("should create with retry information", () => {
		const lastError = new Error("Final failure");
		const error = new RetryError("All retries exhausted", {
			attempts: 3,
			maxAttempts: 3,
			lastError,
		});

		expect(error.name).toBe("RetryError");
		expect(error.type).toBe("RetryError");
		expect(error.category).toBe("permanent");
		expect(error.attempts).toBe(3);
		expect(error.maxAttempts).toBe(3);
		expect(error.lastError).toBe(lastError);
		expect(error.cause).toBe(lastError);
	});
});

describe("CircuitBreakerError", () => {
	it("should create with circuit breaker information", () => {
		const resetTime = new Date();
		const error = new CircuitBreakerError("Circuit open", {
			circuitName: "api-service",
			failures: 5,
			resetTime,
		});

		expect(error.name).toBe("CircuitBreakerError");
		expect(error.type).toBe("CircuitBreakerError");
		expect(error.category).toBe("transient");
		expect(error.circuitName).toBe("api-service");
		expect(error.failures).toBe(5);
		expect(error.resetTime).toBe(resetTime);
	});
});

describe("Type guards", () => {
	it("isWorkflowError should identify WorkflowError instances", () => {
		const workflowError = new WorkflowError("Test");
		const validationError = new ValidationError("Test", { field: "x" });
		const regularError = new Error("Test");

		expect(isWorkflowError(workflowError)).toBe(true);
		expect(isWorkflowError(validationError)).toBe(true);
		expect(isWorkflowError(regularError)).toBe(false);
		expect(isWorkflowError("string")).toBe(false);
		expect(isWorkflowError(null)).toBe(false);
	});

	it("isValidationError should identify ValidationError instances", () => {
		const validationError = new ValidationError("Test", { field: "x" });
		const workflowError = new WorkflowError("Test");

		expect(isValidationError(validationError)).toBe(true);
		expect(isValidationError(workflowError)).toBe(false);
	});

	it("isExecutionError should identify ExecutionError instances", () => {
		const executionError = new ExecutionError("Test");
		const workflowError = new WorkflowError("Test");

		expect(isExecutionError(executionError)).toBe(true);
		expect(isExecutionError(workflowError)).toBe(false);
	});

	it("isTimeoutError should identify TimeoutError instances", () => {
		const timeoutError = new TimeoutError("Test", { timeoutMs: 1000 });
		const workflowError = new WorkflowError("Test");

		expect(isTimeoutError(timeoutError)).toBe(true);
		expect(isTimeoutError(workflowError)).toBe(false);
	});

	it("isConfigurationError should identify ConfigurationError instances", () => {
		const configError = new ConfigurationError("Test");
		const workflowError = new WorkflowError("Test");

		expect(isConfigurationError(configError)).toBe(true);
		expect(isConfigurationError(workflowError)).toBe(false);
	});

	it("isToolError should identify ToolError instances", () => {
		const toolError = new ToolError("Test", { toolName: "bash" });
		const workflowError = new WorkflowError("Test");

		expect(isToolError(toolError)).toBe(true);
		expect(isToolError(workflowError)).toBe(false);
	});

	it("isRetryError should identify RetryError instances", () => {
		const retryError = new RetryError("Test", { attempts: 1, maxAttempts: 3 });
		const workflowError = new WorkflowError("Test");

		expect(isRetryError(retryError)).toBe(true);
		expect(isRetryError(workflowError)).toBe(false);
	});

	it("isCircuitBreakerError should identify CircuitBreakerError instances", () => {
		const cbError = new CircuitBreakerError("Test", {
			circuitName: "test",
			failures: 1,
		});
		const workflowError = new WorkflowError("Test");

		expect(isCircuitBreakerError(cbError)).toBe(true);
		expect(isCircuitBreakerError(workflowError)).toBe(false);
	});
});

describe("toWorkflowError", () => {
	it("should return WorkflowError unchanged", () => {
		const original = new WorkflowError("Test");
		const result = toWorkflowError(original);

		expect(result).toBe(original);
	});

	it("should wrap regular Error", () => {
		const original = new Error("Regular error");
		const result = toWorkflowError(original);

		expect(result).toBeInstanceOf(WorkflowError);
		expect(result.message).toBe("Regular error");
		expect(result.cause).toBe(original);
	});

	it("should wrap string", () => {
		const result = toWorkflowError("String error");

		expect(result).toBeInstanceOf(WorkflowError);
		expect(result.message).toBe("String error");
	});

	it("should wrap with context", () => {
		const result = toWorkflowError(new Error("Test"), { operation: "test" });

		expect(result.context).toEqual({ operation: "test" });
	});
});

describe("getRetrySuggestion", () => {
	it("should suggest no retry for permanent errors", () => {
		const error = new ValidationError("Invalid", { field: "test" });
		const suggestion = getRetrySuggestion(error);

		expect(suggestion.shouldRetry).toBe(false);
		expect(suggestion.maxAttempts).toBe(0);
	});

	it("should suggest exponential backoff for timeout errors", () => {
		const error = new TimeoutError("Timeout", { timeoutMs: 5000 });
		const suggestion = getRetrySuggestion(error);

		expect(suggestion.shouldRetry).toBe(true);
		expect(suggestion.maxAttempts).toBe(3);
		expect(suggestion.backoffStrategy).toBe("exponential");
	});

	it("should suggest no retry for circuit breaker errors", () => {
		const error = new CircuitBreakerError("Open", {
			circuitName: "test",
			failures: 5,
		});
		const suggestion = getRetrySuggestion(error);

		expect(suggestion.shouldRetry).toBe(false);
	});

	it("should suggest no retry for already exhausted retries", () => {
		const error = new RetryError("Exhausted", {
			attempts: 3,
			maxAttempts: 3,
		});
		const suggestion = getRetrySuggestion(error);

		expect(suggestion.shouldRetry).toBe(false);
	});

	it("should suggest no retry for validation errors", () => {
		const error = new ValidationError("Invalid", { field: "test" });
		const suggestion = getRetrySuggestion(error);

		expect(suggestion.shouldRetry).toBe(false);
		// ValidationError has category "permanent", so it matches the permanent check first
		expect(suggestion.reason).toContain("permanent");
	});

	it("should suggest no retry for configuration errors", () => {
		const error = new ConfigurationError("Bad config");
		const suggestion = getRetrySuggestion(error);

		expect(suggestion.shouldRetry).toBe(false);
		// ConfigurationError has category "permanent", so it matches the permanent check first
		expect(suggestion.reason).toContain("permanent");
	});

	it("should suggest linear backoff for execution errors", () => {
		const error = new ExecutionError("Failed");
		const suggestion = getRetrySuggestion(error);

		expect(suggestion.shouldRetry).toBe(true);
		expect(suggestion.maxAttempts).toBe(2);
		expect(suggestion.backoffStrategy).toBe("linear");
	});

	it("should suggest exponential backoff for tool errors", () => {
		const error = new ToolError("Tool failed", { toolName: "api" });
		const suggestion = getRetrySuggestion(error);

		expect(suggestion.shouldRetry).toBe(true);
		expect(suggestion.maxAttempts).toBe(3);
		expect(suggestion.backoffStrategy).toBe("exponential");
	});

	it("should suggest retry for transient category errors", () => {
		const error = new WorkflowError("Transient failure", {
			category: "transient",
		});
		const suggestion = getRetrySuggestion(error);

		expect(suggestion.shouldRetry).toBe(true);
		expect(suggestion.backoffStrategy).toBe("exponential");
	});

	it("should use conservative strategy for unknown category", () => {
		const error = new WorkflowError("Unknown failure");
		const suggestion = getRetrySuggestion(error);

		expect(suggestion.shouldRetry).toBe(true);
		expect(suggestion.maxAttempts).toBe(2);
		expect(suggestion.backoffStrategy).toBe("linear");
	});

	it("should handle regular Error objects", () => {
		const error = new Error("Regular error");
		const suggestion = getRetrySuggestion(error);

		expect(suggestion.shouldRetry).toBe(true);
		expect(suggestion.reason).toContain("unknown");
	});
});
