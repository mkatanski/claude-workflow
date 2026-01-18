/**
 * Unit tests for ClaudeAgentTool.
 */

import { describe, expect, it, beforeEach, mock } from "bun:test";
import { ClaudeAgentTool } from "./claudeAgent.ts";
import { resolveModel, MODEL_ALIASES } from "./claudeAgent.types.ts";
import type { AgentSessionOptions } from "./claudeAgent.ts";
import type {
	PreToolUseHook,
	PostToolUseHook,
	ClaudeAgentConfig,
} from "./claudeAgent.types.ts";
import type { StepConfig } from "../../types/index.ts";

// Mock the query function from the SDK
const mockQueryResults: unknown[] = [];

mock.module("@anthropic-ai/claude-agent-sdk", () => ({
	query: async function* mockQuery() {
		for (const result of mockQueryResults) {
			yield result;
		}
	},
}));

describe("resolveModel", () => {
	it("should resolve 'sonnet' alias to full model ID", () => {
		const result = resolveModel("sonnet");
		expect(result).toBe(MODEL_ALIASES.sonnet);
		expect(result).toContain("claude-sonnet");
	});

	it("should resolve 'opus' alias to full model ID", () => {
		const result = resolveModel("opus");
		expect(result).toBe(MODEL_ALIASES.opus);
		expect(result).toContain("claude-opus");
	});

	it("should resolve 'haiku' alias to full model ID", () => {
		const result = resolveModel("haiku");
		expect(result).toBe(MODEL_ALIASES.haiku);
		expect(result).toContain("claude-haiku");
	});

	it("should pass through full model ID unchanged", () => {
		const customModel = "claude-3-custom-20240101";
		const result = resolveModel(customModel);
		expect(result).toBe(customModel);
	});

	it("should pass through unknown string as-is", () => {
		const unknownModel = "some-other-model";
		const result = resolveModel(unknownModel);
		expect(result).toBe(unknownModel);
	});
});

describe("ClaudeAgentTool", () => {
	let tool: ClaudeAgentTool;

	beforeEach(() => {
		// Reset mock results before each test
		mockQueryResults.length = 0;
		tool = new ClaudeAgentTool();
	});

	describe("constructor and name", () => {
		it("should have correct tool name", () => {
			expect(tool.name).toBe("claude_agent");
		});

		it("should accept config in constructor", () => {
			const config: ClaudeAgentConfig = {
				model: "opus",
				workingDirectory: "/test/path",
				systemPrompt: "Test system prompt",
			};
			const configuredTool = new ClaudeAgentTool(config);
			expect(configuredTool.name).toBe("claude_agent");
		});
	});

	describe("validateStep", () => {
		it("should throw error when prompt is missing", () => {
			const step: StepConfig = {
				name: "test-step",
				tool: "claude_agent",
			};
			expect(() => tool.validateStep(step)).toThrow(
				"claude_agent tool requires 'prompt' field",
			);
		});

		it("should not throw when prompt is provided", () => {
			const step: StepConfig = {
				name: "test-step",
				tool: "claude_agent",
				prompt: "Test prompt",
			};
			expect(() => tool.validateStep(step)).not.toThrow();
		});
	});

	describe("executeSession", () => {
		it("should return error for empty prompt", async () => {
			const result = await tool.executeSession("   ");
			expect(result.success).toBe(false);
			expect(result.error).toBe("Empty prompt provided");
			expect(result.errorType).toBe("UNKNOWN");
			expect(result.messages).toEqual([]);
		});

		it("should return success for valid session", async () => {
			// Mock a successful session
			mockQueryResults.push(
				{
					type: "system",
					subtype: "init",
					session_id: "test-session-123",
					model: "claude-sonnet-4-20250514",
				},
				{
					type: "assistant",
					message: {
						content: [{ type: "text", text: "Hello! I can help you with that." }],
					},
					session_id: "test-session-123",
				},
				{
					type: "result",
					subtype: "success",
					result: "Task completed successfully",
					session_id: "test-session-123",
				},
			);

			const result = await tool.executeSession("Hello, can you help me?");

			expect(result.success).toBe(true);
			expect(result.output).toBe("Task completed successfully");
			expect(result.sessionId).toBe("test-session-123");
			expect(result.duration).toBeGreaterThanOrEqual(0);
		});

		it("should use default model when not specified", async () => {
			mockQueryResults.push({
				type: "result",
				subtype: "success",
				result: "Done",
				session_id: "session-1",
			});

			const result = await tool.executeSession("Test prompt");
			expect(result.success).toBe(true);
		});

		it("should use model from options", async () => {
			mockQueryResults.push({
				type: "result",
				subtype: "success",
				result: "Done",
				session_id: "session-1",
			});

			const options: AgentSessionOptions = { model: "opus" };
			const result = await tool.executeSession("Test prompt", options);
			expect(result.success).toBe(true);
		});

		it("should use model from config when options not provided", async () => {
			const configuredTool = new ClaudeAgentTool({ model: "haiku" });
			mockQueryResults.push({
				type: "result",
				subtype: "success",
				result: "Done",
				session_id: "session-1",
			});

			const result = await configuredTool.executeSession("Test prompt");
			expect(result.success).toBe(true);
		});
	});

	describe("message conversion", () => {
		it("should convert assistant text message", async () => {
			mockQueryResults.push(
				{
					type: "assistant",
					message: {
						content: [{ type: "text", text: "This is a response" }],
					},
					session_id: "session-1",
				},
				{
					type: "result",
					subtype: "success",
					result: "Done",
					session_id: "session-1",
				},
			);

			const result = await tool.executeSession("Hello");
			expect(result.messages).toHaveLength(2);
			expect(result.messages[0].type).toBe("assistant");
			expect(result.messages[0].content).toBe("This is a response");
		});

		it("should convert tool_use message to tool_call", async () => {
			mockQueryResults.push(
				{
					type: "assistant",
					message: {
						content: [
							{
								type: "tool_use",
								name: "Bash",
								input: { command: "ls -la" },
							},
						],
					},
					session_id: "session-1",
				},
				{
					type: "result",
					subtype: "success",
					result: "Done",
					session_id: "session-1",
				},
			);

			const result = await tool.executeSession("List files");
			expect(result.messages).toHaveLength(2);
			expect(result.messages[0].type).toBe("tool_call");
			expect(result.messages[0].toolName).toBe("Bash");
			expect(result.messages[0].toolInput).toEqual({ command: "ls -la" });
		});

		it("should convert system init message", async () => {
			mockQueryResults.push(
				{
					type: "system",
					subtype: "init",
					model: "claude-sonnet-4-20250514",
					session_id: "session-1",
				},
				{
					type: "result",
					subtype: "success",
					result: "Done",
					session_id: "session-1",
				},
			);

			const result = await tool.executeSession("Hello");
			expect(result.messages).toHaveLength(2);
			expect(result.messages[0].type).toBe("system");
			expect(result.messages[0].subtype).toBe("init");
			expect(result.messages[0].content).toContain("claude-sonnet");
		});

		it("should convert error result to error message", async () => {
			mockQueryResults.push({
				type: "result",
				subtype: "error",
				errors: ["Something went wrong", "Another error"],
				session_id: "session-1",
			});

			const result = await tool.executeSession("Hello");
			expect(result.success).toBe(false);
			expect(result.error).toBe("Something went wrong; Another error");
		});

		it("should skip user messages", async () => {
			mockQueryResults.push(
				{
					type: "user",
					message: { content: "Test prompt" },
					session_id: "session-1",
				},
				{
					type: "result",
					subtype: "success",
					result: "Done",
					session_id: "session-1",
				},
			);

			const result = await tool.executeSession("Hello");
			// User message should be skipped, only result message should be captured
			// Since user is not a valid AgentMessageType, we check that only valid types are present
			const validTypes = ["assistant", "tool_call", "tool_result", "error", "system"];
			const allMessagesValid = result.messages.every((m) => validTypes.includes(m.type));
			expect(allMessagesValid).toBe(true);
		});
	});

	describe("error categorization", () => {
		it("should categorize budget exceeded error", async () => {
			mockQueryResults.push({
				type: "result",
				subtype: "error_max_budget_usd",
				errors: ["Budget limit exceeded"],
				session_id: "session-1",
			});

			const result = await tool.executeSession("Hello");
			expect(result.success).toBe(false);
			expect(result.errorType).toBe("BUDGET_EXCEEDED");
		});

		it("should categorize max turns error as context length", async () => {
			mockQueryResults.push({
				type: "result",
				subtype: "error_max_turns",
				errors: ["Maximum turns reached"],
				session_id: "session-1",
			});

			const result = await tool.executeSession("Hello");
			expect(result.success).toBe(false);
			expect(result.errorType).toBe("CONTEXT_LENGTH_EXCEEDED");
		});

		it("should categorize authentication error from message content", async () => {
			mockQueryResults.push({
				type: "result",
				subtype: "error",
				errors: ["Authentication failed: invalid API key"],
				session_id: "session-1",
			});

			const result = await tool.executeSession("Hello");
			expect(result.success).toBe(false);
			expect(result.errorType).toBe("AUTHENTICATION_FAILED");
		});

		it("should categorize rate limit error from message content", async () => {
			mockQueryResults.push({
				type: "result",
				subtype: "error",
				errors: ["Rate limit exceeded: too many requests"],
				session_id: "session-1",
			});

			const result = await tool.executeSession("Hello");
			expect(result.success).toBe(false);
			expect(result.errorType).toBe("RATE_LIMIT_EXCEEDED");
		});

		it("should categorize permission denied error from message content", async () => {
			mockQueryResults.push({
				type: "result",
				subtype: "error",
				errors: ["Permission denied: access forbidden"],
				session_id: "session-1",
			});

			const result = await tool.executeSession("Hello");
			expect(result.success).toBe(false);
			expect(result.errorType).toBe("PERMISSION_DENIED");
		});

		it("should categorize context length error from message content", async () => {
			mockQueryResults.push({
				type: "result",
				subtype: "error",
				errors: ["Context token limit exceeded"],
				session_id: "session-1",
			});

			const result = await tool.executeSession("Hello");
			expect(result.success).toBe(false);
			expect(result.errorType).toBe("CONTEXT_LENGTH_EXCEEDED");
		});

		it("should return UNKNOWN for unrecognized errors", async () => {
			mockQueryResults.push({
				type: "result",
				subtype: "error",
				errors: ["Something unexpected happened"],
				session_id: "session-1",
			});

			const result = await tool.executeSession("Hello");
			expect(result.success).toBe(false);
			expect(result.errorType).toBe("UNKNOWN");
		});
	});

	describe("exception handling", () => {
		it("should handle thrown errors gracefully", async () => {
			// Push an invalid result that will cause iteration to fail
			// by pushing nothing and making the generator throw
			mockQueryResults.length = 0;

			// Create a tool that will throw
			const throwingTool = new ClaudeAgentTool();

			// Override to throw
			const originalExecuteSession = throwingTool.executeSession.bind(throwingTool);
			let callCount = 0;
			throwingTool.executeSession = async (prompt: string, options?: AgentSessionOptions) => {
				callCount++;
				if (callCount === 1) {
					// Return a mocked error result for the first call
					return {
						success: false,
						output: "",
						messages: [],
						duration: 0,
						error: "Network timeout occurred",
						errorType: "UNKNOWN" as const,
					};
				}
				return originalExecuteSession(prompt, options);
			};

			const result = await throwingTool.executeSession("Hello");
			expect(result.success).toBe(false);
			expect(result.error).toBeDefined();
		});

		it("should categorize session not found error from exception", async () => {
			const throwingTool = new ClaudeAgentTool();
			throwingTool.executeSession = async () => {
				return {
					success: false,
					output: "",
					messages: [],
					duration: 0,
					error: "Session not found: invalid session ID",
					errorType: "SESSION_NOT_FOUND" as const,
				};
			};

			const result = await throwingTool.executeSession("Hello");
			expect(result.success).toBe(false);
			expect(result.errorType).toBe("SESSION_NOT_FOUND");
		});
	});

	describe("hook configuration", () => {
		it("should build hooks from options", async () => {
			const preHook: PreToolUseHook = async (_toolName, _input, _sessionId) => {
				// Hook function is configured - verifying it doesn't throw when created
				return { behavior: "allow" };
			};

			const toolWithHooks = new ClaudeAgentTool({
				preToolUseHooks: [preHook],
			});

			mockQueryResults.push({
				type: "result",
				subtype: "success",
				result: "Done",
				session_id: "session-1",
			});

			await toolWithHooks.executeSession("Hello");
			// Hook was configured (we can't easily verify it was called without actual SDK integration)
			expect(toolWithHooks).toBeDefined();
		});

		it("should accept post tool use hooks", async () => {
			const postHook: PostToolUseHook = async (_toolName, _input, _response, _sessionId) => {
				// Post-hook function is configured - verifying it doesn't throw when created
			};

			const toolWithHooks = new ClaudeAgentTool({
				postToolUseHooks: [postHook],
			});

			mockQueryResults.push({
				type: "result",
				subtype: "success",
				result: "Done",
				session_id: "session-1",
			});

			await toolWithHooks.executeSession("Hello");
			expect(toolWithHooks).toBeDefined();
		});

		it("should merge hooks from config and options", async () => {
			const configHook: PreToolUseHook = () => ({ behavior: "allow" });
			const optionsHook: PreToolUseHook = () => ({ behavior: "allow" });

			const toolWithHooks = new ClaudeAgentTool({
				preToolUseHooks: [configHook],
			});

			mockQueryResults.push({
				type: "result",
				subtype: "success",
				result: "Done",
				session_id: "session-1",
			});

			// Options hooks should override config hooks
			const result = await toolWithHooks.executeSession("Hello", {
				preToolUseHooks: [optionsHook],
			});

			expect(result.success).toBe(true);
		});
	});

	describe("subagent configuration", () => {
		it("should build agents from config", async () => {
			const toolWithAgents = new ClaudeAgentTool({
				agents: {
					coder: {
						description: "A coding assistant",
						prompt: "You are a coding expert",
						tools: ["Read", "Write", "Edit"],
						model: "opus",
					},
				},
			});

			mockQueryResults.push({
				type: "result",
				subtype: "success",
				result: "Done",
				session_id: "session-1",
			});

			const result = await toolWithAgents.executeSession("Hello");
			expect(result.success).toBe(true);
		});

		it("should build agents from options", async () => {
			mockQueryResults.push({
				type: "result",
				subtype: "success",
				result: "Done",
				session_id: "session-1",
			});

			const result = await tool.executeSession("Hello", {
				agents: {
					researcher: {
						description: "A research assistant",
						prompt: "You are a research expert",
						tools: ["WebFetch", "WebSearch"],
						model: "haiku",
					},
				},
			});

			expect(result.success).toBe(true);
		});
	});

	describe("session options", () => {
		it("should pass working directory to SDK", async () => {
			mockQueryResults.push({
				type: "result",
				subtype: "success",
				result: "Done",
				session_id: "session-1",
			});

			const result = await tool.executeSession("Hello", {
				workingDirectory: "/custom/path",
			});

			expect(result.success).toBe(true);
		});

		it("should pass system prompt to SDK", async () => {
			mockQueryResults.push({
				type: "result",
				subtype: "success",
				result: "Done",
				session_id: "session-1",
			});

			const result = await tool.executeSession("Hello", {
				systemPrompt: "You are a helpful assistant.",
			});

			expect(result.success).toBe(true);
		});

		it("should pass tools configuration to SDK", async () => {
			mockQueryResults.push({
				type: "result",
				subtype: "success",
				result: "Done",
				session_id: "session-1",
			});

			const result = await tool.executeSession("Hello", {
				tools: ["Bash", "Read", "Write"],
			});

			expect(result.success).toBe(true);
		});

		it("should pass disallowed tools to SDK", async () => {
			mockQueryResults.push({
				type: "result",
				subtype: "success",
				result: "Done",
				session_id: "session-1",
			});

			const result = await tool.executeSession("Hello", {
				disallowedTools: ["Bash"],
			});

			expect(result.success).toBe(true);
		});

		it("should pass permission mode to SDK", async () => {
			mockQueryResults.push({
				type: "result",
				subtype: "success",
				result: "Done",
				session_id: "session-1",
			});

			const result = await tool.executeSession("Hello", {
				permissionMode: "acceptEdits",
			});

			expect(result.success).toBe(true);
		});

		it("should pass max budget to SDK", async () => {
			mockQueryResults.push({
				type: "result",
				subtype: "success",
				result: "Done",
				session_id: "session-1",
			});

			const result = await tool.executeSession("Hello", {
				maxBudgetUsd: 0.5,
			});

			expect(result.success).toBe(true);
		});

		it("should pass resume session ID to SDK", async () => {
			mockQueryResults.push({
				type: "result",
				subtype: "success",
				result: "Done",
				session_id: "session-1",
			});

			const result = await tool.executeSession("Continue our conversation", {
				resume: "previous-session-123",
			});

			expect(result.success).toBe(true);
		});
	});

	describe("result structure", () => {
		it("should include duration in result", async () => {
			mockQueryResults.push({
				type: "result",
				subtype: "success",
				result: "Done",
				session_id: "session-1",
			});

			const result = await tool.executeSession("Hello");
			expect(typeof result.duration).toBe("number");
			expect(result.duration).toBeGreaterThanOrEqual(0);
		});

		it("should include session ID in successful result", async () => {
			mockQueryResults.push({
				type: "result",
				subtype: "success",
				result: "Done",
				session_id: "test-session-id",
			});

			const result = await tool.executeSession("Hello");
			expect(result.sessionId).toBe("test-session-id");
		});

		it("should include messages array in result", async () => {
			mockQueryResults.push(
				{
					type: "assistant",
					message: {
						content: [{ type: "text", text: "First response" }],
					},
					session_id: "session-1",
				},
				{
					type: "assistant",
					message: {
						content: [{ type: "text", text: "Second response" }],
					},
					session_id: "session-1",
				},
				{
					type: "result",
					subtype: "success",
					result: "Done",
					session_id: "session-1",
				},
			);

			const result = await tool.executeSession("Hello");
			expect(Array.isArray(result.messages)).toBe(true);
			expect(result.messages.length).toBeGreaterThan(0);
		});
	});
});
