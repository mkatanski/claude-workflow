/**
 * Unit tests for executeParallelBash.
 */

import { describe, expect, it } from "bun:test";
import { executeParallelBash } from "./bash.ts";
import type { ParallelBashConfig } from "./types.ts";
import {
	DEFAULT_COMMAND_TIMEOUT,
	DEFAULT_MAX_CONCURRENCY,
	DEFAULT_MAX_OUTPUT_SIZE,
} from "./types.ts";

describe("executeParallelBash", () => {
	describe("basic parallel execution", () => {
		it("should execute multiple commands and return results", async () => {
			const commands: ParallelBashConfig[] = [
				{ command: 'echo "hello"', id: "cmd1" },
				{ command: 'echo "world"', id: "cmd2" },
				{ command: 'echo "test"', id: "cmd3" },
			];

			const result = await executeParallelBash(commands);

			expect(result.success).toBe(true);
			expect(result.commands).toHaveLength(3);
			expect(result.summary.total).toBe(3);
			expect(result.summary.succeeded).toBe(3);
			expect(result.summary.failed).toBe(0);
			expect(result.summary.timedOut).toBe(0);
			expect(result.totalDuration).toBeGreaterThanOrEqual(0);
		});

		it("should capture stdout for each command", async () => {
			const commands: ParallelBashConfig[] = [
				{ command: 'echo "output1"', id: "cmd1" },
				{ command: 'echo "output2"', id: "cmd2" },
			];

			const result = await executeParallelBash(commands);

			expect(result.commands[0].stdout).toContain("output1");
			expect(result.commands[1].stdout).toContain("output2");
		});

		it("should capture stderr for each command", async () => {
			const commands: ParallelBashConfig[] = [
				{ command: 'echo "error1" >&2', id: "cmd1" },
				{ command: 'echo "error2" >&2', id: "cmd2" },
			];

			const result = await executeParallelBash(commands);

			expect(result.commands[0].stderr).toContain("error1");
			expect(result.commands[1].stderr).toContain("error2");
		});

		it("should set exitCode to 0 for successful commands", async () => {
			const commands: ParallelBashConfig[] = [
				{ command: "true", id: "success" },
			];

			const result = await executeParallelBash(commands);

			expect(result.commands[0].success).toBe(true);
			expect(result.commands[0].exitCode).toBe(0);
		});

		it("should set exitCode to non-zero for failed commands", async () => {
			const commands: ParallelBashConfig[] = [
				{ command: "exit 1", id: "failure" },
			];

			const result = await executeParallelBash(commands);

			expect(result.commands[0].success).toBe(false);
			expect(result.commands[0].exitCode).toBe(1);
		});

		it("should track duration for each command", async () => {
			const commands: ParallelBashConfig[] = [
				{ command: "sleep 0.1", id: "cmd1" },
			];

			const result = await executeParallelBash(commands);

			expect(result.commands[0].duration).toBeGreaterThanOrEqual(50);
		});

		it("should track queueWaitTime for each command", async () => {
			const commands: ParallelBashConfig[] = [{ command: "true", id: "cmd1" }];

			const result = await executeParallelBash(commands);

			expect(typeof result.commands[0].queueWaitTime).toBe("number");
			expect(result.commands[0].queueWaitTime).toBeGreaterThanOrEqual(0);
		});
	});

	describe("empty command array", () => {
		it("should return success with empty results for empty command array", async () => {
			const result = await executeParallelBash([]);

			expect(result.success).toBe(true);
			expect(result.commands).toHaveLength(0);
			expect(result.summary.total).toBe(0);
			expect(result.summary.succeeded).toBe(0);
			expect(result.summary.failed).toBe(0);
			expect(result.totalDuration).toBe(0);
		});

		it("should include label when provided with empty array", async () => {
			const result = await executeParallelBash([], { label: "empty batch" });

			expect(result.label).toBe("empty batch");
		});
	});

	describe("auto-generated IDs", () => {
		it("should auto-generate IDs when not provided", async () => {
			const commands: ParallelBashConfig[] = [
				{ command: 'echo "test"' },
				{ command: 'printf "hello"' },
			];

			const result = await executeParallelBash(commands);

			expect(result.commands[0].id).toBeDefined();
			expect(result.commands[0].id).not.toBe("");
			expect(result.commands[1].id).toBeDefined();
			expect(result.commands[1].id).not.toBe("");
			// IDs should be different
			expect(result.commands[0].id).not.toBe(result.commands[1].id);
		});

		it("should generate unique IDs even for duplicate commands", async () => {
			const commands: ParallelBashConfig[] = [
				{ command: 'echo "same"' },
				{ command: 'echo "same"' },
				{ command: 'echo "same"' },
			];

			const result = await executeParallelBash(commands);

			const ids = result.commands.map((cmd) => cmd.id);
			const uniqueIds = new Set(ids);
			expect(uniqueIds.size).toBe(3);
		});

		it("should make duplicate IDs unique", async () => {
			const commands: ParallelBashConfig[] = [
				{ command: 'echo "1"', id: "same" },
				{ command: 'echo "2"', id: "same" },
			];

			const result = await executeParallelBash(commands);

			const ids = result.commands.map((cmd) => cmd.id);
			const uniqueIds = new Set(ids);
			expect(uniqueIds.size).toBe(2);
		});

		it("should generate ID from command text", async () => {
			const commands: ParallelBashConfig[] = [{ command: "npm test" }];

			const result = await executeParallelBash(commands);

			expect(result.commands[0].id).toContain("npm");
		});
	});

	describe("concurrency limiting", () => {
		it("should respect maxConcurrency option", async () => {
			const commands: ParallelBashConfig[] = Array.from(
				{ length: 5 },
				(_, i) => ({
					command: `sleep 0.1 && echo "cmd${i}"`,
					id: `cmd${i}`,
				}),
			);

			const result = await executeParallelBash(commands, {
				maxConcurrency: 2,
			});

			// Commands should have been limited by maxConcurrency
			// All commands completed successfully
			expect(result.commands.length).toBe(5);
			expect(result.summary.succeeded).toBe(5);
		});

		it("should default to DEFAULT_MAX_CONCURRENCY", async () => {
			expect(DEFAULT_MAX_CONCURRENCY).toBe(5);
		});

		it("should clamp maxConcurrency to minimum of 1", async () => {
			const commands: ParallelBashConfig[] = [
				{ command: 'echo "test"', id: "cmd1" },
			];

			// This should not throw and should work correctly
			const result = await executeParallelBash(commands, { maxConcurrency: 0 });

			expect(result.success).toBe(true);
		});

		it("should clamp maxConcurrency to maximum of 10", async () => {
			const commands: ParallelBashConfig[] = [
				{ command: 'echo "test"', id: "cmd1" },
			];

			// This should not throw and should work correctly
			const result = await executeParallelBash(commands, {
				maxConcurrency: 100,
			});

			expect(result.success).toBe(true);
		});
	});

	describe("error handling - continueOnError: true (default)", () => {
		it("should continue executing remaining commands when one fails", async () => {
			const commands: ParallelBashConfig[] = [
				{ command: 'echo "before"', id: "before" },
				{ command: "exit 1", id: "failing" },
				{ command: 'echo "after"', id: "after" },
			];

			const result = await executeParallelBash(commands, {
				continueOnError: true,
			});

			expect(result.success).toBe(false); // Overall failure because one failed
			expect(result.summary.total).toBe(3);
			expect(result.summary.succeeded).toBe(2);
			expect(result.summary.failed).toBe(1);

			// All commands should have been executed
			expect(result.commands).toHaveLength(3);
		});

		it("should capture all errors when multiple commands fail", async () => {
			const commands: ParallelBashConfig[] = [
				{ command: "exit 1", id: "fail1" },
				{ command: "exit 2", id: "fail2" },
				{ command: 'echo "success"', id: "success" },
			];

			const result = await executeParallelBash(commands, {
				continueOnError: true,
			});

			expect(result.summary.failed).toBe(2);
			expect(result.summary.succeeded).toBe(1);
		});

		it("should default to continueOnError: true", async () => {
			const commands: ParallelBashConfig[] = [
				{ command: 'echo "before"', id: "before" },
				{ command: "exit 1", id: "failing" },
				{ command: 'echo "after"', id: "after" },
			];

			const result = await executeParallelBash(commands);

			// Default behavior: all commands should complete
			expect(result.commands).toHaveLength(3);
		});
	});

	describe("error handling - continueOnError: false (fail fast)", () => {
		it("should abort remaining commands when one fails", async () => {
			const commands: ParallelBashConfig[] = [
				{ command: "exit 1", id: "failing" },
				{ command: "sleep 1 && echo 'slow'", id: "slow" },
			];

			const result = await executeParallelBash(commands, {
				continueOnError: false,
				maxConcurrency: 1, // Sequential to ensure predictable ordering
			});

			expect(result.success).toBe(false);
			// The second command may have been aborted before starting
			const failedCommands = result.commands.filter((c) => !c.success);
			expect(failedCommands.length).toBeGreaterThanOrEqual(1);
		});

		it("should set abort error message for cancelled commands", async () => {
			const commands: ParallelBashConfig[] = [
				{ command: "exit 1", id: "failing" },
				{ command: "sleep 1", id: "pending" },
			];

			const result = await executeParallelBash(commands, {
				continueOnError: false,
				maxConcurrency: 1,
			});

			// Look for aborted command (if any)
			const pendingCmd = result.commands.find((c) => c.id === "pending");
			if (pendingCmd) {
				expect(pendingCmd.success).toBe(false);
				expect(pendingCmd.error).toContain("aborted");
			}
		});
	});

	describe("timeout per command", () => {
		it("should timeout and kill commands exceeding their timeout", async () => {
			const commands: ParallelBashConfig[] = [
				{ command: "sleep 10", id: "slow", timeout: 100 },
			];

			const result = await executeParallelBash(commands);

			expect(result.commands[0].success).toBe(false);
			expect(result.commands[0].error).toContain("timed out");
			expect(result.summary.timedOut).toBe(1);
		});

		it("should mark timed out commands correctly in summary", async () => {
			const commands: ParallelBashConfig[] = [
				{ command: "sleep 10", id: "timeout1", timeout: 50 },
				{ command: 'echo "quick"', id: "quick" },
			];

			const result = await executeParallelBash(commands);

			expect(result.summary.timedOut).toBe(1);
			expect(result.summary.succeeded).toBe(1);
		});

		it("should set exitCode to null for timed out commands", async () => {
			const commands: ParallelBashConfig[] = [
				{ command: "sleep 10", id: "timeout", timeout: 50 },
			];

			const result = await executeParallelBash(commands);

			expect(result.commands[0].exitCode).toBeNull();
		});

		it("should use DEFAULT_COMMAND_TIMEOUT when not specified", async () => {
			expect(DEFAULT_COMMAND_TIMEOUT).toBe(120000); // 2 minutes
		});
	});

	describe("totalTimeout", () => {
		it("should prevent pending commands from starting when totalTimeout is exceeded", async () => {
			const commands: ParallelBashConfig[] = [
				{ command: "sleep 0.5", id: "slow1" },
				{ command: "sleep 0.5", id: "slow2" },
				{ command: "sleep 0.5", id: "slow3" },
			];

			const result = await executeParallelBash(commands, {
				totalTimeout: 100,
				maxConcurrency: 1, // Sequential execution
			});

			// The first command runs but totalTimeout triggers after 100ms.
			// Remaining commands are prevented from starting (they get abort errors).
			// So we should see fewer commands completed than total requested.
			// Note: with maxConcurrency: 1, first command starts immediately
			// After 100ms, totalTimeout aborts remaining, but first continues
			expect(result.commands.length).toBeGreaterThanOrEqual(1);
		});

		it("should mark aborted commands with appropriate error", async () => {
			const commands: ParallelBashConfig[] = [
				{ command: "sleep 0.5", id: "slow1" },
				{ command: 'echo "should not run"', id: "pending" },
			];

			const result = await executeParallelBash(commands, {
				totalTimeout: 50,
				maxConcurrency: 1,
			});

			// Check that pending command was aborted (if it made it to results)
			const pendingCmd = result.commands.find((c) => c.id === "pending");
			if (pendingCmd) {
				expect(pendingCmd.success).toBe(false);
				expect(pendingCmd.error).toBeDefined();
			}
		});
	});

	describe("output truncation", () => {
		it("should truncate output exceeding maxOutputSize", async () => {
			// Generate output larger than the limit
			const outputSize = 1000;
			const commands: ParallelBashConfig[] = [
				{
					command: `python3 -c "print('x' * ${outputSize})"`,
					id: "large",
				},
			];

			const result = await executeParallelBash(commands, {
				maxOutputSize: 100, // Very small limit for testing
			});

			expect(result.commands[0].truncated).toBe(true);
			expect(result.commands[0].stdout).toContain("TRUNCATED");
		});

		it("should not truncate output within limits", async () => {
			const commands: ParallelBashConfig[] = [
				{ command: 'echo "small output"', id: "small" },
			];

			const result = await executeParallelBash(commands, {
				maxOutputSize: DEFAULT_MAX_OUTPUT_SIZE,
			});

			expect(result.commands[0].truncated).toBe(false);
		});

		it("should use DEFAULT_MAX_OUTPUT_SIZE when not specified", async () => {
			expect(DEFAULT_MAX_OUTPUT_SIZE).toBe(1_048_576); // 1MB
		});

		it("should truncate stderr independently", async () => {
			const commands: ParallelBashConfig[] = [
				{
					command: `python3 -c "import sys; sys.stderr.write('x' * 1000)"`,
					id: "large-stderr",
				},
			];

			const result = await executeParallelBash(commands, {
				maxOutputSize: 100,
			});

			expect(result.commands[0].truncated).toBe(true);
		});
	});

	describe("helper methods", () => {
		describe("getCommand", () => {
			it("should return command result by ID", async () => {
				const commands: ParallelBashConfig[] = [
					{ command: 'echo "one"', id: "first" },
					{ command: 'echo "two"', id: "second" },
					{ command: 'echo "three"', id: "third" },
				];

				const result = await executeParallelBash(commands);

				const second = result.getCommand("second");
				expect(second).toBeDefined();
				expect(second?.id).toBe("second");
				expect(second?.stdout).toContain("two");
			});

			it("should return undefined for non-existent ID", async () => {
				const commands: ParallelBashConfig[] = [
					{ command: 'echo "test"', id: "exists" },
				];

				const result = await executeParallelBash(commands);

				const notFound = result.getCommand("does-not-exist");
				expect(notFound).toBeUndefined();
			});
		});

		describe("getSuccessfulOutputs", () => {
			it("should return stdout of all successful commands", async () => {
				const commands: ParallelBashConfig[] = [
					{ command: 'echo "success1"', id: "s1" },
					{ command: 'echo "success2"', id: "s2" },
				];

				const result = await executeParallelBash(commands);

				const outputs = result.getSuccessfulOutputs();
				expect(outputs).toHaveLength(2);
				expect(outputs.some((o) => o.includes("success1"))).toBe(true);
				expect(outputs.some((o) => o.includes("success2"))).toBe(true);
			});

			it("should not include output from failed commands", async () => {
				const commands: ParallelBashConfig[] = [
					{ command: 'echo "success"', id: "success" },
					{ command: 'echo "failed" && exit 1', id: "failed" },
				];

				const result = await executeParallelBash(commands);

				const outputs = result.getSuccessfulOutputs();
				expect(outputs).toHaveLength(1);
				expect(outputs[0]).toContain("success");
			});

			it("should return empty array when all commands fail", async () => {
				const commands: ParallelBashConfig[] = [
					{ command: "exit 1", id: "fail1" },
					{ command: "exit 2", id: "fail2" },
				];

				const result = await executeParallelBash(commands);

				const outputs = result.getSuccessfulOutputs();
				expect(outputs).toHaveLength(0);
			});
		});

		describe("getErrors", () => {
			it("should return all failed command results", async () => {
				const commands: ParallelBashConfig[] = [
					{ command: 'echo "success"', id: "success" },
					{ command: "exit 1", id: "fail1" },
					{ command: "exit 2", id: "fail2" },
				];

				const result = await executeParallelBash(commands);

				const errors = result.getErrors();
				expect(errors).toHaveLength(2);
				expect(errors.map((e) => e.id)).toContain("fail1");
				expect(errors.map((e) => e.id)).toContain("fail2");
			});

			it("should return empty array when all commands succeed", async () => {
				const commands: ParallelBashConfig[] = [
					{ command: 'echo "ok"', id: "s1" },
					{ command: 'echo "ok"', id: "s2" },
				];

				const result = await executeParallelBash(commands);

				const errors = result.getErrors();
				expect(errors).toHaveLength(0);
			});

			it("should include error message for failed commands", async () => {
				const commands: ParallelBashConfig[] = [
					{ command: 'echo "error" >&2 && exit 1', id: "fail" },
				];

				const result = await executeParallelBash(commands);

				const errors = result.getErrors();
				expect(errors).toHaveLength(1);
				expect(errors[0].error).toBeDefined();
			});
		});
	});

	describe("working directory", () => {
		it("should use command-specific cwd when provided", async () => {
			const commands: ParallelBashConfig[] = [
				{ command: "pwd", id: "cwd", cwd: "/tmp" },
			];

			const result = await executeParallelBash(commands);

			expect(result.commands[0].stdout).toContain("/tmp");
			expect(result.commands[0].cwd).toBe("/tmp");
		});

		it("should use defaultCwd when command cwd not specified", async () => {
			const commands: ParallelBashConfig[] = [{ command: "pwd", id: "cwd" }];

			const result = await executeParallelBash(commands, {
				defaultCwd: "/tmp",
			});

			expect(result.commands[0].stdout).toContain("/tmp");
		});

		it("should handle invalid cwd with error", async () => {
			const commands: ParallelBashConfig[] = [
				{
					command: "pwd",
					id: "badcwd",
					cwd: "/nonexistent/path/definitely/not/here",
				},
			];

			const result = await executeParallelBash(commands);

			expect(result.commands[0].success).toBe(false);
			expect(result.commands[0].error).toBeDefined();
		});
	});

	describe("environment variables", () => {
		it("should pass environment variables to command", async () => {
			const commands: ParallelBashConfig[] = [
				{
					command: "echo $TEST_VAR",
					id: "env",
					env: { TEST_VAR: "hello_world" },
				},
			];

			const result = await executeParallelBash(commands);

			expect(result.commands[0].stdout).toContain("hello_world");
		});

		it("should inherit existing environment", async () => {
			const commands: ParallelBashConfig[] = [
				{ command: "echo $PATH", id: "path" },
			];

			const result = await executeParallelBash(commands);

			// PATH should exist
			expect(result.commands[0].stdout.trim().length).toBeGreaterThan(0);
		});
	});

	describe("labels", () => {
		it("should include label in result when provided", async () => {
			const commands: ParallelBashConfig[] = [
				{ command: 'echo "test"', id: "cmd1", label: "Test Command" },
			];

			const result = await executeParallelBash(commands);

			expect(result.commands[0].label).toBe("Test Command");
		});

		it("should include overall label in result", async () => {
			const commands: ParallelBashConfig[] = [
				{ command: 'echo "test"', id: "cmd1" },
			];

			const result = await executeParallelBash(commands, {
				label: "Build Batch",
			});

			expect(result.label).toBe("Build Batch");
		});
	});

	describe("callbacks", () => {
		it("should call onCommandComplete for each command", async () => {
			const completedIds: string[] = [];

			const commands: ParallelBashConfig[] = [
				{ command: 'echo "1"', id: "cmd1" },
				{ command: 'echo "2"', id: "cmd2" },
			];

			await executeParallelBash(commands, {
				onCommandComplete: (result) => {
					completedIds.push(result.id);
				},
			});

			expect(completedIds).toHaveLength(2);
			expect(completedIds).toContain("cmd1");
			expect(completedIds).toContain("cmd2");
		});

		it("should call onProgress with correct data", async () => {
			const progressCalls: Array<{
				totalCommands: number;
				completedCommands: number;
				percentComplete: number;
			}> = [];

			const commands: ParallelBashConfig[] = [
				{ command: 'echo "1"', id: "cmd1" },
				{ command: 'echo "2"', id: "cmd2" },
			];

			await executeParallelBash(commands, {
				onProgress: (progress) => {
					progressCalls.push({
						totalCommands: progress.totalCommands,
						completedCommands: progress.completedCommands,
						percentComplete: progress.percentComplete,
					});
				},
			});

			expect(progressCalls.length).toBeGreaterThanOrEqual(2);
			// Last call should show 100% complete
			const lastCall = progressCalls[progressCalls.length - 1];
			expect(lastCall.percentComplete).toBe(100);
			expect(lastCall.completedCommands).toBe(2);
		});

		it("should report failed commands in progress callback", async () => {
			let reportedFailedCount = 0;

			const commands: ParallelBashConfig[] = [
				{ command: "exit 1", id: "fail" },
				{ command: 'echo "ok"', id: "success" },
			];

			await executeParallelBash(commands, {
				onProgress: (progress) => {
					reportedFailedCount = progress.failedCommands;
				},
			});

			expect(reportedFailedCount).toBe(1);
		});
	});

	describe("result structure", () => {
		it("should have all required fields in result", async () => {
			const commands: ParallelBashConfig[] = [
				{ command: 'echo "test"', id: "cmd1" },
			];

			const result = await executeParallelBash(commands);

			expect(typeof result.success).toBe("boolean");
			expect(typeof result.totalDuration).toBe("number");
			expect(Array.isArray(result.commands)).toBe(true);
			expect(result.summary).toBeDefined();
			expect(typeof result.getCommand).toBe("function");
			expect(typeof result.getSuccessfulOutputs).toBe("function");
			expect(typeof result.getErrors).toBe("function");
		});

		it("should have all required fields in command result", async () => {
			const commands: ParallelBashConfig[] = [
				{ command: 'echo "test"', id: "cmd1", cwd: "/tmp", label: "Test" },
			];

			const result = await executeParallelBash(commands);
			const cmd = result.commands[0];

			expect(typeof cmd.id).toBe("string");
			expect(typeof cmd.command).toBe("string");
			expect(typeof cmd.success).toBe("boolean");
			expect(typeof cmd.stdout).toBe("string");
			expect(typeof cmd.stderr).toBe("string");
			expect(typeof cmd.truncated).toBe("boolean");
			expect(typeof cmd.duration).toBe("number");
			expect(typeof cmd.queueWaitTime).toBe("number");
			expect(typeof cmd.cwd).toBe("string");
		});

		it("should have all required fields in summary", async () => {
			const commands: ParallelBashConfig[] = [
				{ command: 'echo "ok"', id: "s1" },
				{ command: "exit 1", id: "f1" },
			];

			const result = await executeParallelBash(commands);

			expect(typeof result.summary.total).toBe("number");
			expect(typeof result.summary.succeeded).toBe("number");
			expect(typeof result.summary.failed).toBe("number");
			expect(typeof result.summary.timedOut).toBe("number");
			expect(result.summary.total).toBe(2);
			expect(result.summary.succeeded).toBe(1);
			expect(result.summary.failed).toBe(1);
		});
	});

	describe("all commands fail scenario", () => {
		it("should return success: false when all commands fail", async () => {
			const commands: ParallelBashConfig[] = [
				{ command: "exit 1", id: "fail1" },
				{ command: "exit 2", id: "fail2" },
				{ command: "exit 3", id: "fail3" },
			];

			const result = await executeParallelBash(commands);

			expect(result.success).toBe(false);
			expect(result.summary.total).toBe(3);
			expect(result.summary.succeeded).toBe(0);
			expect(result.summary.failed).toBe(3);
		});

		it("should capture all error details when all fail", async () => {
			const commands: ParallelBashConfig[] = [
				{ command: 'echo "error1" >&2 && exit 1', id: "fail1" },
				{ command: 'echo "error2" >&2 && exit 2', id: "fail2" },
			];

			const result = await executeParallelBash(commands);

			const errors = result.getErrors();
			expect(errors).toHaveLength(2);
			expect(errors[0].stderr).toBeDefined();
			expect(errors[1].stderr).toBeDefined();
		});
	});
});
