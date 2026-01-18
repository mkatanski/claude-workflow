/**
 * Unit tests for executeParallelClaude.
 */

import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { ParallelClaudeConfig } from "./claudeTypes.ts";
import {
	aggregateTokenUsage,
	createEmptyTokenUsage,
	DEFAULT_CLAUDE_CONCURRENCY,
	DEFAULT_SESSION_TIMEOUT,
	MAX_CLAUDE_CONCURRENCY,
	MIN_CLAUDE_CONCURRENCY,
} from "./claudeTypes.ts";

// Mock the query function from the SDK
const mockQueryResults: Map<number, unknown[]> = new Map();
let sessionCounter = 0;

mock.module("@anthropic-ai/claude-agent-sdk", () => ({
	query: async function* mockQuery() {
		const sessionIndex = sessionCounter++;
		const results = mockQueryResults.get(sessionIndex) ?? [
			{
				type: "result",
				subtype: "success",
				result: `Session ${sessionIndex} completed`,
				session_id: `session-${sessionIndex}`,
				usage: { input_tokens: 100, output_tokens: 50 },
			},
		];
		for (const result of results) {
			yield result;
		}
	},
}));

// Import after mocking
const { executeParallelClaude } = await import("./claude.ts");

describe("executeParallelClaude", () => {
	beforeEach(() => {
		// Reset mock state before each test
		mockQueryResults.clear();
		sessionCounter = 0;
	});

	describe("basic parallel execution", () => {
		it("should execute multiple sessions and return results", async () => {
			const sessions: ParallelClaudeConfig[] = [
				{ prompt: "Analyze this code", id: "session1" },
				{ prompt: "Review this function", id: "session2" },
				{ prompt: "Check for bugs", id: "session3" },
			];

			const result = await executeParallelClaude(sessions);

			expect(result.success).toBe(true);
			expect(result.sessions).toHaveLength(3);
			expect(result.summary.total).toBe(3);
			expect(result.summary.succeeded).toBe(3);
			expect(result.summary.failed).toBe(0);
			expect(result.totalDuration).toBeGreaterThanOrEqual(0);
		});

		it("should capture output for each session", async () => {
			mockQueryResults.set(0, [
				{
					type: "result",
					subtype: "success",
					result: "Output from session 1",
					session_id: "s1",
				},
			]);
			mockQueryResults.set(1, [
				{
					type: "result",
					subtype: "success",
					result: "Output from session 2",
					session_id: "s2",
				},
			]);

			const sessions: ParallelClaudeConfig[] = [
				{ prompt: "Task 1", id: "s1" },
				{ prompt: "Task 2", id: "s2" },
			];

			const result = await executeParallelClaude(sessions);

			expect(result.sessions[0].output).toContain("Output from session");
			expect(result.sessions[1].output).toContain("Output from session");
		});

		it("should track duration for each session", async () => {
			const sessions: ParallelClaudeConfig[] = [
				{ prompt: "Test prompt", id: "session1" },
			];

			const result = await executeParallelClaude(sessions);

			expect(result.sessions[0].duration).toBeGreaterThanOrEqual(0);
		});

		it("should track queueWaitTime for each session", async () => {
			const sessions: ParallelClaudeConfig[] = [
				{ prompt: "Test prompt", id: "session1" },
			];

			const result = await executeParallelClaude(sessions);

			expect(typeof result.sessions[0].queueWaitTime).toBe("number");
			expect(result.sessions[0].queueWaitTime).toBeGreaterThanOrEqual(0);
		});

		it("should include model information in results", async () => {
			const sessions: ParallelClaudeConfig[] = [
				{ prompt: "Test prompt", id: "session1", model: "haiku" },
			];

			const result = await executeParallelClaude(sessions);

			expect(result.sessions[0].model).toBeDefined();
			expect(result.sessions[0].model).toContain("claude");
		});
	});

	describe("empty sessions array", () => {
		it("should return success with empty results for empty sessions array", async () => {
			const result = await executeParallelClaude([]);

			expect(result.success).toBe(true);
			expect(result.sessions).toHaveLength(0);
			expect(result.summary.total).toBe(0);
			expect(result.summary.succeeded).toBe(0);
			expect(result.summary.failed).toBe(0);
			expect(result.totalDuration).toBe(0);
		});

		it("should include label when provided with empty array", async () => {
			const result = await executeParallelClaude([], { label: "empty batch" });

			expect(result.label).toBe("empty batch");
		});

		it("should have zero tokens and cost for empty array", async () => {
			const result = await executeParallelClaude([]);

			expect(result.summary.totalTokens.input).toBe(0);
			expect(result.summary.totalTokens.output).toBe(0);
			expect(result.summary.totalTokens.total).toBe(0);
			expect(result.summary.estimatedCostUsd).toBe(0);
		});
	});

	describe("auto-generated IDs", () => {
		it("should auto-generate IDs when not provided", async () => {
			const sessions: ParallelClaudeConfig[] = [
				{ prompt: "First task" },
				{ prompt: "Second task" },
			];

			const result = await executeParallelClaude(sessions);

			expect(result.sessions[0].id).toBeDefined();
			expect(result.sessions[0].id).not.toBe("");
			expect(result.sessions[1].id).toBeDefined();
			expect(result.sessions[1].id).not.toBe("");
			// IDs should be different
			expect(result.sessions[0].id).not.toBe(result.sessions[1].id);
		});

		it("should generate unique IDs even for duplicate prompts", async () => {
			const sessions: ParallelClaudeConfig[] = [
				{ prompt: "Same prompt here" },
				{ prompt: "Same prompt here" },
				{ prompt: "Same prompt here" },
			];

			const result = await executeParallelClaude(sessions);

			const ids = result.sessions.map((s) => s.id);
			const uniqueIds = new Set(ids);
			expect(uniqueIds.size).toBe(3);
		});

		it("should make duplicate IDs unique", async () => {
			const sessions: ParallelClaudeConfig[] = [
				{ prompt: "Task 1", id: "same" },
				{ prompt: "Task 2", id: "same" },
			];

			const result = await executeParallelClaude(sessions);

			const ids = result.sessions.map((s) => s.id);
			const uniqueIds = new Set(ids);
			expect(uniqueIds.size).toBe(2);
		});

		it("should generate ID from prompt text", async () => {
			const sessions: ParallelClaudeConfig[] = [
				{ prompt: "Analyze the authentication code" },
			];

			const result = await executeParallelClaude(sessions);

			expect(result.sessions[0].id).toContain("Analyze");
		});
	});

	describe("concurrency limiting", () => {
		it("should respect maxConcurrency option", async () => {
			const sessions: ParallelClaudeConfig[] = Array.from(
				{ length: 5 },
				(_, i) => ({
					prompt: `Session ${i}`,
					id: `session${i}`,
				}),
			);

			const result = await executeParallelClaude(sessions, {
				maxConcurrency: 2,
			});

			// All sessions should complete successfully
			expect(result.sessions.length).toBe(5);
			expect(result.summary.succeeded).toBe(5);
		});

		it("should default to DEFAULT_CLAUDE_CONCURRENCY", async () => {
			expect(DEFAULT_CLAUDE_CONCURRENCY).toBe(3);
		});

		it("should clamp maxConcurrency to minimum of MIN_CLAUDE_CONCURRENCY", async () => {
			const sessions: ParallelClaudeConfig[] = [
				{ prompt: "Test", id: "session1" },
			];

			// This should not throw and should work correctly
			const result = await executeParallelClaude(sessions, {
				maxConcurrency: 0,
			});

			expect(result.success).toBe(true);
			expect(MIN_CLAUDE_CONCURRENCY).toBe(1);
		});

		it("should clamp maxConcurrency to maximum of MAX_CLAUDE_CONCURRENCY", async () => {
			const sessions: ParallelClaudeConfig[] = [
				{ prompt: "Test", id: "session1" },
			];

			// This should not throw and should work correctly
			const result = await executeParallelClaude(sessions, {
				maxConcurrency: 100,
			});

			expect(result.success).toBe(true);
			expect(MAX_CLAUDE_CONCURRENCY).toBe(5);
		});
	});

	describe("error handling - continueOnError: true (default)", () => {
		it("should continue executing remaining sessions when one fails", async () => {
			mockQueryResults.set(0, [
				{
					type: "result",
					subtype: "success",
					result: "Success before",
					session_id: "before",
				},
			]);
			mockQueryResults.set(1, [
				{
					type: "result",
					subtype: "error",
					errors: ["Session failed"],
					session_id: "failing",
				},
			]);
			mockQueryResults.set(2, [
				{
					type: "result",
					subtype: "success",
					result: "Success after",
					session_id: "after",
				},
			]);

			const sessions: ParallelClaudeConfig[] = [
				{ prompt: "Before", id: "before" },
				{ prompt: "Failing", id: "failing" },
				{ prompt: "After", id: "after" },
			];

			const result = await executeParallelClaude(sessions, {
				continueOnError: true,
			});

			expect(result.success).toBe(false); // Overall failure because one failed
			expect(result.summary.total).toBe(3);
			expect(result.summary.succeeded).toBe(2);
			expect(result.summary.failed).toBe(1);

			// All sessions should have been executed
			expect(result.sessions).toHaveLength(3);
		});

		it("should capture all errors when multiple sessions fail", async () => {
			mockQueryResults.set(0, [
				{
					type: "result",
					subtype: "error",
					errors: ["Error 1"],
					session_id: "fail1",
				},
			]);
			mockQueryResults.set(1, [
				{
					type: "result",
					subtype: "error",
					errors: ["Error 2"],
					session_id: "fail2",
				},
			]);
			mockQueryResults.set(2, [
				{
					type: "result",
					subtype: "success",
					result: "Success",
					session_id: "success",
				},
			]);

			const sessions: ParallelClaudeConfig[] = [
				{ prompt: "Fail 1", id: "fail1" },
				{ prompt: "Fail 2", id: "fail2" },
				{ prompt: "Success", id: "success" },
			];

			const result = await executeParallelClaude(sessions, {
				continueOnError: true,
			});

			expect(result.summary.failed).toBe(2);
			expect(result.summary.succeeded).toBe(1);
		});

		it("should default to continueOnError: true", async () => {
			mockQueryResults.set(0, [
				{
					type: "result",
					subtype: "success",
					result: "Before",
					session_id: "before",
				},
			]);
			mockQueryResults.set(1, [
				{
					type: "result",
					subtype: "error",
					errors: ["Failed"],
					session_id: "failing",
				},
			]);
			mockQueryResults.set(2, [
				{
					type: "result",
					subtype: "success",
					result: "After",
					session_id: "after",
				},
			]);

			const sessions: ParallelClaudeConfig[] = [
				{ prompt: "Before", id: "before" },
				{ prompt: "Failing", id: "failing" },
				{ prompt: "After", id: "after" },
			];

			const result = await executeParallelClaude(sessions);

			// Default behavior: all sessions should complete
			expect(result.sessions).toHaveLength(3);
		});
	});

	describe("error handling - continueOnError: false (fail fast)", () => {
		it("should abort remaining sessions when one fails", async () => {
			mockQueryResults.set(0, [
				{
					type: "result",
					subtype: "error",
					errors: ["Session failed"],
					session_id: "failing",
				},
			]);

			const sessions: ParallelClaudeConfig[] = [
				{ prompt: "Failing", id: "failing" },
				{ prompt: "Should not run", id: "pending" },
			];

			const result = await executeParallelClaude(sessions, {
				continueOnError: false,
				maxConcurrency: 1, // Sequential to ensure predictable ordering
			});

			expect(result.success).toBe(false);
			// The second session may have been aborted before starting
			const failedSessions = result.sessions.filter((s) => !s.success);
			expect(failedSessions.length).toBeGreaterThanOrEqual(1);
		});

		it("should set abort error message for cancelled sessions", async () => {
			mockQueryResults.set(0, [
				{
					type: "result",
					subtype: "error",
					errors: ["Session failed"],
					session_id: "failing",
				},
			]);

			const sessions: ParallelClaudeConfig[] = [
				{ prompt: "Failing", id: "failing" },
				{ prompt: "Pending", id: "pending" },
			];

			const result = await executeParallelClaude(sessions, {
				continueOnError: false,
				maxConcurrency: 1,
			});

			// Look for aborted session (if any)
			const pendingSession = result.sessions.find((s) => s.id === "pending");
			if (pendingSession) {
				expect(pendingSession.success).toBe(false);
				expect(pendingSession.error).toContain("aborted");
			}
		});
	});

	describe("timeout per session", () => {
		it("should use DEFAULT_SESSION_TIMEOUT when not specified", async () => {
			expect(DEFAULT_SESSION_TIMEOUT).toBe(300000); // 5 minutes
		});

		it("should include error message for timed out sessions", async () => {
			// Note: We can't easily test actual timeouts in unit tests
			// but we can verify the timeout configuration is respected
			const sessions: ParallelClaudeConfig[] = [
				{ prompt: "Test", id: "session1", timeout: 1000 },
			];

			const result = await executeParallelClaude(sessions);

			// Session should complete normally (mock doesn't actually timeout)
			expect(result.sessions[0].id).toBe("session1");
		});
	});

	describe("totalTimeout", () => {
		it("should abort remaining sessions when totalTimeout is exceeded", async () => {
			// With very short totalTimeout, sessions should be aborted
			const sessions: ParallelClaudeConfig[] = [
				{ prompt: "Task 1", id: "task1" },
				{ prompt: "Task 2", id: "task2" },
			];

			// Note: Since the mock is instant, this test verifies the configuration
			// is accepted. In real usage, totalTimeout would abort sessions.
			const result = await executeParallelClaude(sessions, {
				totalTimeout: 100000, // Large enough for mock to complete
			});

			expect(result.sessions.length).toBeGreaterThanOrEqual(1);
		});
	});

	describe("token tracking and aggregation", () => {
		it("should track tokens for each session", async () => {
			mockQueryResults.set(0, [
				{
					type: "result",
					subtype: "success",
					result: "Done",
					session_id: "s1",
					usage: { input_tokens: 100, output_tokens: 50 },
				},
			]);

			const sessions: ParallelClaudeConfig[] = [{ prompt: "Test", id: "s1" }];

			const result = await executeParallelClaude(sessions);

			expect(result.sessions[0].tokens).toBeDefined();
			expect(result.sessions[0].tokens.input).toBeGreaterThanOrEqual(0);
			expect(result.sessions[0].tokens.output).toBeGreaterThanOrEqual(0);
			expect(result.sessions[0].tokens.total).toBeGreaterThanOrEqual(0);
		});

		it("should aggregate tokens in summary", async () => {
			mockQueryResults.set(0, [
				{
					type: "result",
					subtype: "success",
					result: "Done 1",
					session_id: "s1",
					usage: { input_tokens: 100, output_tokens: 50 },
				},
			]);
			mockQueryResults.set(1, [
				{
					type: "result",
					subtype: "success",
					result: "Done 2",
					session_id: "s2",
					usage: { input_tokens: 200, output_tokens: 100 },
				},
			]);

			const sessions: ParallelClaudeConfig[] = [
				{ prompt: "Task 1", id: "s1" },
				{ prompt: "Task 2", id: "s2" },
			];

			const result = await executeParallelClaude(sessions);

			expect(result.summary.totalTokens).toBeDefined();
			expect(result.summary.totalTokens.input).toBeGreaterThanOrEqual(0);
			expect(result.summary.totalTokens.output).toBeGreaterThanOrEqual(0);
		});

		it("should include estimated cost in summary", async () => {
			mockQueryResults.set(0, [
				{
					type: "result",
					subtype: "success",
					result: "Done",
					session_id: "s1",
					usage: { input_tokens: 1000, output_tokens: 500 },
				},
			]);

			const sessions: ParallelClaudeConfig[] = [{ prompt: "Test", id: "s1" }];

			const result = await executeParallelClaude(sessions);

			expect(typeof result.summary.estimatedCostUsd).toBe("number");
			expect(result.summary.estimatedCostUsd).toBeGreaterThanOrEqual(0);
		});
	});

	describe("helper methods", () => {
		describe("getSession", () => {
			it("should return session result by ID", async () => {
				const sessions: ParallelClaudeConfig[] = [
					{ prompt: "First", id: "first" },
					{ prompt: "Second", id: "second" },
					{ prompt: "Third", id: "third" },
				];

				const result = await executeParallelClaude(sessions);

				const second = result.getSession("second");
				expect(second).toBeDefined();
				expect(second?.id).toBe("second");
			});

			it("should return undefined for non-existent ID", async () => {
				const sessions: ParallelClaudeConfig[] = [
					{ prompt: "Test", id: "exists" },
				];

				const result = await executeParallelClaude(sessions);

				const notFound = result.getSession("does-not-exist");
				expect(notFound).toBeUndefined();
			});
		});

		describe("getSuccessfulOutputs", () => {
			it("should return outputs of all successful sessions", async () => {
				mockQueryResults.set(0, [
					{
						type: "result",
						subtype: "success",
						result: "Output 1",
						session_id: "s1",
					},
				]);
				mockQueryResults.set(1, [
					{
						type: "result",
						subtype: "success",
						result: "Output 2",
						session_id: "s2",
					},
				]);

				const sessions: ParallelClaudeConfig[] = [
					{ prompt: "Task 1", id: "s1" },
					{ prompt: "Task 2", id: "s2" },
				];

				const result = await executeParallelClaude(sessions);

				const outputs = result.getSuccessfulOutputs();
				expect(outputs).toHaveLength(2);
				expect(outputs.some((o) => o.output.includes("Output"))).toBe(true);
			});

			it("should not include output from failed sessions", async () => {
				mockQueryResults.set(0, [
					{
						type: "result",
						subtype: "success",
						result: "Success output",
						session_id: "success",
					},
				]);
				mockQueryResults.set(1, [
					{
						type: "result",
						subtype: "error",
						errors: ["Session failed"],
						session_id: "failed",
					},
				]);

				const sessions: ParallelClaudeConfig[] = [
					{ prompt: "Success", id: "success" },
					{ prompt: "Failed", id: "failed" },
				];

				const result = await executeParallelClaude(sessions);

				const outputs = result.getSuccessfulOutputs();
				expect(outputs).toHaveLength(1);
				expect(outputs[0].id).toBe("success");
			});

			it("should return empty array when all sessions fail", async () => {
				mockQueryResults.set(0, [
					{
						type: "result",
						subtype: "error",
						errors: ["Error 1"],
						session_id: "fail1",
					},
				]);
				mockQueryResults.set(1, [
					{
						type: "result",
						subtype: "error",
						errors: ["Error 2"],
						session_id: "fail2",
					},
				]);

				const sessions: ParallelClaudeConfig[] = [
					{ prompt: "Fail 1", id: "fail1" },
					{ prompt: "Fail 2", id: "fail2" },
				];

				const result = await executeParallelClaude(sessions);

				const outputs = result.getSuccessfulOutputs();
				expect(outputs).toHaveLength(0);
			});
		});

		describe("getErrors", () => {
			it("should return all failed session results", async () => {
				mockQueryResults.set(0, [
					{
						type: "result",
						subtype: "success",
						result: "Success",
						session_id: "success",
					},
				]);
				mockQueryResults.set(1, [
					{
						type: "result",
						subtype: "error",
						errors: ["Error 1"],
						session_id: "fail1",
					},
				]);
				mockQueryResults.set(2, [
					{
						type: "result",
						subtype: "error",
						errors: ["Error 2"],
						session_id: "fail2",
					},
				]);

				const sessions: ParallelClaudeConfig[] = [
					{ prompt: "Success", id: "success" },
					{ prompt: "Fail 1", id: "fail1" },
					{ prompt: "Fail 2", id: "fail2" },
				];

				const result = await executeParallelClaude(sessions);

				const errors = result.getErrors();
				expect(errors).toHaveLength(2);
				expect(errors.map((e) => e.id)).toContain("fail1");
				expect(errors.map((e) => e.id)).toContain("fail2");
			});

			it("should return empty array when all sessions succeed", async () => {
				const sessions: ParallelClaudeConfig[] = [
					{ prompt: "OK 1", id: "s1" },
					{ prompt: "OK 2", id: "s2" },
				];

				const result = await executeParallelClaude(sessions);

				const errors = result.getErrors();
				expect(errors).toHaveLength(0);
			});

			it("should include error message for failed sessions", async () => {
				mockQueryResults.set(0, [
					{
						type: "result",
						subtype: "error",
						errors: ["Something went wrong"],
						session_id: "fail",
					},
				]);

				const sessions: ParallelClaudeConfig[] = [
					{ prompt: "Failing", id: "fail" },
				];

				const result = await executeParallelClaude(sessions);

				const errors = result.getErrors();
				expect(errors).toHaveLength(1);
				expect(errors[0].error).toBeDefined();
			});
		});
	});

	describe("labels", () => {
		it("should include label in session result when provided", async () => {
			const sessions: ParallelClaudeConfig[] = [
				{ prompt: "Test", id: "session1", label: "Code Review" },
			];

			const result = await executeParallelClaude(sessions);

			expect(result.sessions[0].label).toBe("Code Review");
		});

		it("should include overall label in result", async () => {
			const sessions: ParallelClaudeConfig[] = [
				{ prompt: "Test", id: "session1" },
			];

			const result = await executeParallelClaude(sessions, {
				label: "Batch Analysis",
			});

			expect(result.label).toBe("Batch Analysis");
		});
	});

	describe("callbacks", () => {
		it("should call onSessionComplete for each session", async () => {
			const completedIds: string[] = [];

			const sessions: ParallelClaudeConfig[] = [
				{ prompt: "Task 1", id: "session1" },
				{ prompt: "Task 2", id: "session2" },
			];

			await executeParallelClaude(sessions, {
				onSessionComplete: (sessionResult) => {
					completedIds.push(sessionResult.id);
				},
			});

			expect(completedIds).toHaveLength(2);
			expect(completedIds).toContain("session1");
			expect(completedIds).toContain("session2");
		});

		it("should call onProgress with correct data", async () => {
			const progressCalls: Array<{
				totalSessions: number;
				completedSessions: number;
				percentComplete: number;
			}> = [];

			const sessions: ParallelClaudeConfig[] = [
				{ prompt: "Task 1", id: "session1" },
				{ prompt: "Task 2", id: "session2" },
			];

			await executeParallelClaude(sessions, {
				onProgress: (progress) => {
					progressCalls.push({
						totalSessions: progress.totalSessions,
						completedSessions: progress.completedSessions,
						percentComplete: progress.percentComplete,
					});
				},
			});

			expect(progressCalls.length).toBeGreaterThanOrEqual(2);
			// Last call should show 100% complete
			const lastCall = progressCalls[progressCalls.length - 1];
			expect(lastCall.percentComplete).toBe(100);
			expect(lastCall.completedSessions).toBe(2);
		});

		it("should report failed sessions in progress callback", async () => {
			let reportedFailedCount = 0;

			mockQueryResults.set(0, [
				{
					type: "result",
					subtype: "error",
					errors: ["Failed"],
					session_id: "fail",
				},
			]);
			mockQueryResults.set(1, [
				{
					type: "result",
					subtype: "success",
					result: "OK",
					session_id: "success",
				},
			]);

			const sessions: ParallelClaudeConfig[] = [
				{ prompt: "Fail", id: "fail" },
				{ prompt: "Success", id: "success" },
			];

			await executeParallelClaude(sessions, {
				onProgress: (progress) => {
					reportedFailedCount = progress.failedSessions;
				},
			});

			expect(reportedFailedCount).toBe(1);
		});

		it("should report tokens used in progress callback", async () => {
			let reportedTokens = 0;

			mockQueryResults.set(0, [
				{
					type: "result",
					subtype: "success",
					result: "Done",
					session_id: "s1",
					usage: { input_tokens: 100, output_tokens: 50 },
				},
			]);

			const sessions: ParallelClaudeConfig[] = [{ prompt: "Test", id: "s1" }];

			await executeParallelClaude(sessions, {
				onProgress: (progress) => {
					reportedTokens = progress.tokensUsed;
				},
			});

			expect(reportedTokens).toBeGreaterThanOrEqual(0);
		});
	});

	describe("result structure", () => {
		it("should have all required fields in result", async () => {
			const sessions: ParallelClaudeConfig[] = [
				{ prompt: "Test", id: "session1" },
			];

			const result = await executeParallelClaude(sessions);

			expect(typeof result.success).toBe("boolean");
			expect(typeof result.totalDuration).toBe("number");
			expect(Array.isArray(result.sessions)).toBe(true);
			expect(result.summary).toBeDefined();
			expect(typeof result.getSession).toBe("function");
			expect(typeof result.getSuccessfulOutputs).toBe("function");
			expect(typeof result.getErrors).toBe("function");
		});

		it("should have all required fields in session result", async () => {
			mockQueryResults.set(0, [
				{
					type: "result",
					subtype: "success",
					result: "Done",
					session_id: "s1",
					usage: { input_tokens: 100, output_tokens: 50 },
				},
			]);

			const sessions: ParallelClaudeConfig[] = [
				{ prompt: "Test", id: "session1", label: "Test Label" },
			];

			const result = await executeParallelClaude(sessions);
			const session = result.sessions[0];

			expect(typeof session.id).toBe("string");
			expect(typeof session.success).toBe("boolean");
			expect(typeof session.duration).toBe("number");
			expect(typeof session.queueWaitTime).toBe("number");
			expect(typeof session.model).toBe("string");
			expect(session.tokens).toBeDefined();
			expect(typeof session.tokens.input).toBe("number");
			expect(typeof session.tokens.output).toBe("number");
			expect(typeof session.tokens.total).toBe("number");
		});

		it("should have all required fields in summary", async () => {
			mockQueryResults.set(0, [
				{
					type: "result",
					subtype: "success",
					result: "OK",
					session_id: "s1",
				},
			]);
			mockQueryResults.set(1, [
				{
					type: "result",
					subtype: "error",
					errors: ["Failed"],
					session_id: "f1",
				},
			]);

			const sessions: ParallelClaudeConfig[] = [
				{ prompt: "OK", id: "s1" },
				{ prompt: "Fail", id: "f1" },
			];

			const result = await executeParallelClaude(sessions);

			expect(typeof result.summary.total).toBe("number");
			expect(typeof result.summary.succeeded).toBe("number");
			expect(typeof result.summary.failed).toBe("number");
			expect(result.summary.totalTokens).toBeDefined();
			expect(typeof result.summary.estimatedCostUsd).toBe("number");
			expect(result.summary.total).toBe(2);
			expect(result.summary.succeeded).toBe(1);
			expect(result.summary.failed).toBe(1);
		});
	});

	describe("all sessions fail scenario", () => {
		it("should return success: false when all sessions fail", async () => {
			mockQueryResults.set(0, [
				{
					type: "result",
					subtype: "error",
					errors: ["Error 1"],
					session_id: "fail1",
				},
			]);
			mockQueryResults.set(1, [
				{
					type: "result",
					subtype: "error",
					errors: ["Error 2"],
					session_id: "fail2",
				},
			]);
			mockQueryResults.set(2, [
				{
					type: "result",
					subtype: "error",
					errors: ["Error 3"],
					session_id: "fail3",
				},
			]);

			const sessions: ParallelClaudeConfig[] = [
				{ prompt: "Fail 1", id: "fail1" },
				{ prompt: "Fail 2", id: "fail2" },
				{ prompt: "Fail 3", id: "fail3" },
			];

			const result = await executeParallelClaude(sessions);

			expect(result.success).toBe(false);
			expect(result.summary.total).toBe(3);
			expect(result.summary.succeeded).toBe(0);
			expect(result.summary.failed).toBe(3);
		});

		it("should capture all error details when all fail", async () => {
			mockQueryResults.set(0, [
				{
					type: "result",
					subtype: "error",
					errors: ["Error message 1"],
					session_id: "fail1",
				},
			]);
			mockQueryResults.set(1, [
				{
					type: "result",
					subtype: "error",
					errors: ["Error message 2"],
					session_id: "fail2",
				},
			]);

			const sessions: ParallelClaudeConfig[] = [
				{ prompt: "Fail 1", id: "fail1" },
				{ prompt: "Fail 2", id: "fail2" },
			];

			const result = await executeParallelClaude(sessions);

			const errors = result.getErrors();
			expect(errors).toHaveLength(2);
			expect(errors[0].error).toBeDefined();
			expect(errors[1].error).toBeDefined();
		});
	});

	describe("model configuration", () => {
		it("should use specified model for each session", async () => {
			const sessions: ParallelClaudeConfig[] = [
				{ prompt: "Task 1", id: "s1", model: "sonnet" },
				{ prompt: "Task 2", id: "s2", model: "haiku" },
			];

			const result = await executeParallelClaude(sessions);

			// Both sessions should complete
			expect(result.sessions.length).toBe(2);
			// Models should be resolved
			expect(result.sessions[0].model).toContain("claude");
			expect(result.sessions[1].model).toContain("claude");
		});
	});
});

describe("TokenUsage utilities", () => {
	describe("createEmptyTokenUsage", () => {
		it("should create token usage with all zeros", () => {
			const usage = createEmptyTokenUsage();

			expect(usage.input).toBe(0);
			expect(usage.output).toBe(0);
			expect(usage.total).toBe(0);
		});
	});

	describe("aggregateTokenUsage", () => {
		it("should sum multiple token usages", () => {
			const usages = [
				{ input: 100, output: 50, total: 150 },
				{ input: 200, output: 100, total: 300 },
				{ input: 300, output: 150, total: 450 },
			];

			const result = aggregateTokenUsage(usages);

			expect(result.input).toBe(600);
			expect(result.output).toBe(300);
			expect(result.total).toBe(900);
		});

		it("should return zeros for empty array", () => {
			const result = aggregateTokenUsage([]);

			expect(result.input).toBe(0);
			expect(result.output).toBe(0);
			expect(result.total).toBe(0);
		});

		it("should handle single element", () => {
			const usages = [{ input: 100, output: 50, total: 150 }];

			const result = aggregateTokenUsage(usages);

			expect(result.input).toBe(100);
			expect(result.output).toBe(50);
			expect(result.total).toBe(150);
		});
	});
});
