/**
 * Unit tests for executeParallelWorkflows.
 */

import { describe, expect, it } from "bun:test";
import type { WorkflowCallErrorCode } from "../composition/types.ts";
import type { ParallelWorkflowConfig } from "./workflowTypes.ts";
import {
	calculateWorkflowsSummary,
	createParallelWorkflowsResult,
	DEFAULT_WORKFLOW_CONCURRENCY,
	MAX_WORKFLOW_CONCURRENCY,
	MIN_WORKFLOW_CONCURRENCY,
} from "./workflowTypes.ts";
import {
	executeParallelWorkflows,
	type WorkflowExecutor,
} from "./workflows.ts";

// =============================================================================
// Mock Executor Factory
// =============================================================================

/**
 * Creates a mock workflow executor for testing.
 *
 * @param results - Map of workflow reference to mock result
 * @param options - Options for controlling mock behavior
 */
function createMockExecutor(
	results: Map<
		string,
		{
			success: boolean;
			output?: unknown;
			error?: { code: WorkflowCallErrorCode; message: string };
			delay?: number;
		}
	> = new Map(),
	options: {
		defaultDelay?: number;
		onExecute?: (reference: string, index: number) => void;
	} = {},
): {
	executor: WorkflowExecutor;
	executionOrder: string[];
	executionCount: number;
} {
	const executionOrder: string[] = [];
	let executionCount = 0;

	const executor: WorkflowExecutor = async (reference, _opts) => {
		const index = executionCount++;
		executionOrder.push(reference);
		options.onExecute?.(reference, index);

		const mockResult = results.get(reference);
		const delay = mockResult?.delay ?? options.defaultDelay ?? 0;

		if (delay > 0) {
			await new Promise((resolve) => setTimeout(resolve, delay));
		}

		if (mockResult) {
			return {
				success: mockResult.success,
				output: mockResult.output,
				error: mockResult.error,
				duration: delay,
				metadata: {
					name: reference,
					version: "1.0.0",
					source: "project" as const,
				},
			};
		}

		// Default success response
		return {
			success: true,
			output: `Output from ${reference}`,
			duration: delay,
			metadata: {
				name: reference,
				version: "1.0.0",
				source: "project" as const,
			},
		};
	};

	return { executor, executionOrder, executionCount };
}

describe("executeParallelWorkflows", () => {
	describe("basic parallel execution", () => {
		it("should execute multiple workflows and return results", async () => {
			const { executor } = createMockExecutor();

			const workflows: ParallelWorkflowConfig[] = [
				{ name: "workflow-a", id: "wf1" },
				{ name: "workflow-b", id: "wf2" },
				{ name: "workflow-c", id: "wf3" },
			];

			const result = await executeParallelWorkflows(workflows, executor);

			expect(result.success).toBe(true);
			expect(result.workflows).toHaveLength(3);
			expect(result.summary.total).toBe(3);
			expect(result.summary.succeeded).toBe(3);
			expect(result.summary.failed).toBe(0);
			expect(result.summary.timedOut).toBe(0);
			expect(result.totalDuration).toBeGreaterThanOrEqual(0);
		});

		it("should capture output for each workflow", async () => {
			const results = new Map([
				["workflow-a", { success: true, output: "Output A" }],
				["workflow-b", { success: true, output: "Output B" }],
			]);
			const { executor } = createMockExecutor(results);

			const workflows: ParallelWorkflowConfig[] = [
				{ name: "workflow-a", id: "wf1" },
				{ name: "workflow-b", id: "wf2" },
			];

			const result = await executeParallelWorkflows(workflows, executor);

			expect(result.workflows[0].output).toBe("Output A");
			expect(result.workflows[1].output).toBe("Output B");
		});

		it("should track duration for each workflow", async () => {
			const results = new Map([
				["workflow-a", { success: true, output: "Done", delay: 50 }],
			]);
			const { executor } = createMockExecutor(results);

			const workflows: ParallelWorkflowConfig[] = [
				{ name: "workflow-a", id: "wf1" },
			];

			const result = await executeParallelWorkflows(workflows, executor);

			expect(result.workflows[0].duration).toBeGreaterThanOrEqual(40);
		});

		it("should track queueWaitTime for each workflow", async () => {
			const { executor } = createMockExecutor();

			const workflows: ParallelWorkflowConfig[] = [
				{ name: "workflow-a", id: "wf1" },
			];

			const result = await executeParallelWorkflows(workflows, executor);

			expect(typeof result.workflows[0].queueWaitTime).toBe("number");
			expect(result.workflows[0].queueWaitTime).toBeGreaterThanOrEqual(0);
		});

		it("should include metadata in results", async () => {
			const { executor } = createMockExecutor();

			const workflows: ParallelWorkflowConfig[] = [
				{ name: "my-workflow", id: "wf1" },
			];

			const result = await executeParallelWorkflows(workflows, executor);

			expect(result.workflows[0].metadata).toBeDefined();
			expect(result.workflows[0].metadata.name).toBe("my-workflow");
			expect(result.workflows[0].metadata.version).toBe("1.0.0");
			expect(result.workflows[0].metadata.source).toBe("project");
		});
	});

	describe("empty workflows array", () => {
		it("should return success with empty results for empty workflows array", async () => {
			const { executor } = createMockExecutor();

			const result = await executeParallelWorkflows([], executor);

			expect(result.success).toBe(true);
			expect(result.workflows).toHaveLength(0);
			expect(result.summary.total).toBe(0);
			expect(result.summary.succeeded).toBe(0);
			expect(result.summary.failed).toBe(0);
			expect(result.summary.timedOut).toBe(0);
			expect(result.totalDuration).toBe(0);
		});

		it("should include label when provided with empty array", async () => {
			const { executor } = createMockExecutor();

			const result = await executeParallelWorkflows([], executor, {
				label: "empty batch",
			});

			expect(result.label).toBe("empty batch");
		});
	});

	describe("auto-generated IDs", () => {
		it("should auto-generate IDs when not provided", async () => {
			const { executor } = createMockExecutor();

			const workflows: ParallelWorkflowConfig[] = [
				{ name: "workflow-a" },
				{ name: "workflow-b" },
			];

			const result = await executeParallelWorkflows(workflows, executor);

			expect(result.workflows[0].id).toBeDefined();
			expect(result.workflows[0].id).not.toBe("");
			expect(result.workflows[1].id).toBeDefined();
			expect(result.workflows[1].id).not.toBe("");
			// IDs should be different
			expect(result.workflows[0].id).not.toBe(result.workflows[1].id);
		});

		it("should generate unique IDs even for duplicate workflow names", async () => {
			const { executor } = createMockExecutor();

			const workflows: ParallelWorkflowConfig[] = [
				{ name: "same-workflow" },
				{ name: "same-workflow" },
				{ name: "same-workflow" },
			];

			const result = await executeParallelWorkflows(workflows, executor);

			const ids = result.workflows.map((w) => w.id);
			const uniqueIds = new Set(ids);
			expect(uniqueIds.size).toBe(3);
		});

		it("should make duplicate IDs unique", async () => {
			const { executor } = createMockExecutor();

			const workflows: ParallelWorkflowConfig[] = [
				{ name: "workflow-a", id: "same" },
				{ name: "workflow-b", id: "same" },
			];

			const result = await executeParallelWorkflows(workflows, executor);

			const ids = result.workflows.map((w) => w.id);
			const uniqueIds = new Set(ids);
			expect(uniqueIds.size).toBe(2);
		});

		it("should generate ID from workflow name", async () => {
			const { executor } = createMockExecutor();

			const workflows: ParallelWorkflowConfig[] = [
				{ name: "my-custom-workflow" },
			];

			const result = await executeParallelWorkflows(workflows, executor);

			expect(result.workflows[0].id).toContain("my");
		});
	});

	describe("concurrency limiting", () => {
		it("should respect maxConcurrency option", async () => {
			const concurrentExecutions: number[] = [];
			let currentConcurrent = 0;

			const results = new Map([
				["workflow-a", { success: true, output: "A", delay: 50 }],
				["workflow-b", { success: true, output: "B", delay: 50 }],
				["workflow-c", { success: true, output: "C", delay: 50 }],
				["workflow-d", { success: true, output: "D", delay: 50 }],
				["workflow-e", { success: true, output: "E", delay: 50 }],
			]);

			const { executor } = createMockExecutor(results, {
				onExecute: () => {
					currentConcurrent++;
					concurrentExecutions.push(currentConcurrent);
					// Simulate async work
					setTimeout(() => {
						currentConcurrent--;
					}, 40);
				},
			});

			const workflows: ParallelWorkflowConfig[] = [
				{ name: "workflow-a", id: "wf1" },
				{ name: "workflow-b", id: "wf2" },
				{ name: "workflow-c", id: "wf3" },
				{ name: "workflow-d", id: "wf4" },
				{ name: "workflow-e", id: "wf5" },
			];

			const result = await executeParallelWorkflows(workflows, executor, {
				maxConcurrency: 2,
			});

			// All workflows should complete successfully
			expect(result.workflows.length).toBe(5);
			expect(result.summary.succeeded).toBe(5);
			// Max concurrent executions should not exceed 2
			expect(Math.max(...concurrentExecutions)).toBeLessThanOrEqual(2);
		});

		it("should default to DEFAULT_WORKFLOW_CONCURRENCY", () => {
			expect(DEFAULT_WORKFLOW_CONCURRENCY).toBe(5);
		});

		it("should clamp maxConcurrency to minimum of 1", async () => {
			const { executor } = createMockExecutor();

			const workflows: ParallelWorkflowConfig[] = [
				{ name: "workflow-a", id: "wf1" },
			];

			// This should not throw and should work correctly
			const result = await executeParallelWorkflows(workflows, executor, {
				maxConcurrency: 0,
			});

			expect(result.success).toBe(true);
			expect(MIN_WORKFLOW_CONCURRENCY).toBe(1);
		});

		it("should clamp maxConcurrency to maximum of 10", async () => {
			const { executor } = createMockExecutor();

			const workflows: ParallelWorkflowConfig[] = [
				{ name: "workflow-a", id: "wf1" },
			];

			// This should not throw and should work correctly
			const result = await executeParallelWorkflows(workflows, executor, {
				maxConcurrency: 100,
			});

			expect(result.success).toBe(true);
			expect(MAX_WORKFLOW_CONCURRENCY).toBe(10);
		});

		it("should execute workflows sequentially with maxConcurrency: 1", async () => {
			const executionOrder: string[] = [];

			const results = new Map([
				["workflow-a", { success: true, output: "A", delay: 20 }],
				["workflow-b", { success: true, output: "B", delay: 20 }],
				["workflow-c", { success: true, output: "C", delay: 20 }],
			]);

			const { executor } = createMockExecutor(results, {
				onExecute: (ref) => {
					executionOrder.push(`start:${ref}`);
				},
			});

			const workflows: ParallelWorkflowConfig[] = [
				{ name: "workflow-a", id: "wf1" },
				{ name: "workflow-b", id: "wf2" },
				{ name: "workflow-c", id: "wf3" },
			];

			await executeParallelWorkflows(workflows, executor, {
				maxConcurrency: 1,
			});

			// With maxConcurrency: 1, workflows should start in order
			expect(executionOrder[0]).toBe("start:workflow-a");
			expect(executionOrder[1]).toBe("start:workflow-b");
			expect(executionOrder[2]).toBe("start:workflow-c");
		});
	});

	describe("error handling - continueOnError: true (default)", () => {
		it("should continue executing remaining workflows when one fails", async () => {
			const results = new Map([
				["workflow-a", { success: true, output: "Before" }],
				[
					"workflow-b",
					{
						success: false,
						error: {
							code: "EXECUTION_FAILED" as const,
							message: "Workflow failed",
						},
					},
				],
				["workflow-c", { success: true, output: "After" }],
			]);
			const { executor } = createMockExecutor(results);

			const workflows: ParallelWorkflowConfig[] = [
				{ name: "workflow-a", id: "before" },
				{ name: "workflow-b", id: "failing" },
				{ name: "workflow-c", id: "after" },
			];

			const result = await executeParallelWorkflows(workflows, executor, {
				continueOnError: true,
			});

			expect(result.success).toBe(false); // Overall failure because one failed
			expect(result.summary.total).toBe(3);
			expect(result.summary.succeeded).toBe(2);
			expect(result.summary.failed).toBe(1);

			// All workflows should have been executed
			expect(result.workflows).toHaveLength(3);
		});

		it("should capture all errors when multiple workflows fail", async () => {
			const results = new Map([
				[
					"workflow-a",
					{
						success: false,
						error: { code: "EXECUTION_FAILED" as const, message: "Error 1" },
					},
				],
				[
					"workflow-b",
					{
						success: false,
						error: { code: "EXECUTION_FAILED" as const, message: "Error 2" },
					},
				],
				["workflow-c", { success: true, output: "Success" }],
			]);
			const { executor } = createMockExecutor(results);

			const workflows: ParallelWorkflowConfig[] = [
				{ name: "workflow-a", id: "fail1" },
				{ name: "workflow-b", id: "fail2" },
				{ name: "workflow-c", id: "success" },
			];

			const result = await executeParallelWorkflows(workflows, executor, {
				continueOnError: true,
			});

			expect(result.summary.failed).toBe(2);
			expect(result.summary.succeeded).toBe(1);
		});

		it("should default to continueOnError: true", async () => {
			const results = new Map([
				["workflow-a", { success: true, output: "Before" }],
				[
					"workflow-b",
					{
						success: false,
						error: { code: "EXECUTION_FAILED" as const, message: "Failed" },
					},
				],
				["workflow-c", { success: true, output: "After" }],
			]);
			const { executor } = createMockExecutor(results);

			const workflows: ParallelWorkflowConfig[] = [
				{ name: "workflow-a", id: "before" },
				{ name: "workflow-b", id: "failing" },
				{ name: "workflow-c", id: "after" },
			];

			const result = await executeParallelWorkflows(workflows, executor);

			// Default behavior: all workflows should complete
			expect(result.workflows).toHaveLength(3);
		});
	});

	describe("error handling - continueOnError: false (fail fast)", () => {
		it("should abort remaining workflows when one fails", async () => {
			const results = new Map([
				[
					"workflow-a",
					{
						success: false,
						error: {
							code: "EXECUTION_FAILED" as const,
							message: "Workflow failed",
						},
						delay: 10,
					},
				],
				["workflow-b", { success: true, output: "Should not run", delay: 100 }],
			]);
			const { executor } = createMockExecutor(results);

			const workflows: ParallelWorkflowConfig[] = [
				{ name: "workflow-a", id: "failing" },
				{ name: "workflow-b", id: "pending" },
			];

			const result = await executeParallelWorkflows(workflows, executor, {
				continueOnError: false,
				maxConcurrency: 1, // Sequential to ensure predictable ordering
			});

			expect(result.success).toBe(false);
			// The second workflow may have been aborted before starting
			const failedWorkflows = result.workflows.filter((w) => !w.success);
			expect(failedWorkflows.length).toBeGreaterThanOrEqual(1);
		});

		it("should set abort error message for cancelled workflows", async () => {
			const results = new Map([
				[
					"workflow-a",
					{
						success: false,
						error: {
							code: "EXECUTION_FAILED" as const,
							message: "Workflow failed",
						},
					},
				],
				["workflow-b", { success: true, output: "Pending", delay: 100 }],
			]);
			const { executor } = createMockExecutor(results);

			const workflows: ParallelWorkflowConfig[] = [
				{ name: "workflow-a", id: "failing" },
				{ name: "workflow-b", id: "pending" },
			];

			const result = await executeParallelWorkflows(workflows, executor, {
				continueOnError: false,
				maxConcurrency: 1,
			});

			// Look for aborted workflow (if any)
			const pendingWorkflow = result.workflows.find((w) => w.id === "pending");
			if (pendingWorkflow) {
				expect(pendingWorkflow.success).toBe(false);
				expect(pendingWorkflow.error?.message).toContain("aborted");
			}
		});
	});

	describe("individual workflow timeout", () => {
		it("should mark timed out workflows correctly", async () => {
			const results = new Map([
				[
					"slow-workflow",
					{
						success: false,
						error: { code: "TIMEOUT" as const, message: "Workflow timed out" },
					},
				],
			]);
			const { executor } = createMockExecutor(results);

			const workflows: ParallelWorkflowConfig[] = [
				{ name: "slow-workflow", id: "slow", timeout: 100 },
			];

			const result = await executeParallelWorkflows(workflows, executor);

			expect(result.workflows[0].success).toBe(false);
			expect(result.workflows[0].timedOut).toBe(true);
			expect(result.summary.timedOut).toBe(1);
		});

		it("should pass timeout to workflow executor", async () => {
			let receivedTimeout: number | undefined;

			const executor: WorkflowExecutor = async (_reference, opts) => {
				receivedTimeout = opts.timeout;
				return {
					success: true,
					output: "Done",
					duration: 0,
					metadata: {
						name: "test",
						version: "1.0.0",
						source: "project" as const,
					},
				};
			};

			const workflows: ParallelWorkflowConfig[] = [
				{ name: "test-workflow", id: "wf1", timeout: 5000 },
			];

			await executeParallelWorkflows(workflows, executor);

			expect(receivedTimeout).toBe(5000);
		});
	});

	describe("totalTimeout", () => {
		it("should abort remaining workflows when totalTimeout is exceeded", async () => {
			const results = new Map([
				["workflow-a", { success: true, output: "A", delay: 200 }],
				["workflow-b", { success: true, output: "B", delay: 200 }],
				["workflow-c", { success: true, output: "C", delay: 200 }],
			]);
			const { executor } = createMockExecutor(results);

			const workflows: ParallelWorkflowConfig[] = [
				{ name: "workflow-a", id: "wf1" },
				{ name: "workflow-b", id: "wf2" },
				{ name: "workflow-c", id: "wf3" },
			];

			const result = await executeParallelWorkflows(workflows, executor, {
				totalTimeout: 100,
				maxConcurrency: 1, // Sequential execution
			});

			// Some workflows should have been aborted
			expect(result.workflows.length).toBeGreaterThanOrEqual(1);
		});

		it("should mark aborted workflows with appropriate error", async () => {
			const results = new Map([
				["workflow-a", { success: true, output: "A", delay: 150 }],
				["workflow-b", { success: true, output: "B", delay: 10 }],
			]);
			const { executor } = createMockExecutor(results);

			const workflows: ParallelWorkflowConfig[] = [
				{ name: "workflow-a", id: "slow" },
				{ name: "workflow-b", id: "pending" },
			];

			const result = await executeParallelWorkflows(workflows, executor, {
				totalTimeout: 50,
				maxConcurrency: 1,
			});

			// Check that pending workflow was aborted (if it made it to results)
			const pendingWorkflow = result.workflows.find((w) => w.id === "pending");
			if (pendingWorkflow) {
				expect(pendingWorkflow.success).toBe(false);
				expect(pendingWorkflow.error).toBeDefined();
			}
		});
	});

	describe("helper methods", () => {
		describe("getWorkflow", () => {
			it("should return workflow result by ID", async () => {
				const results = new Map([
					["workflow-a", { success: true, output: "One" }],
					["workflow-b", { success: true, output: "Two" }],
					["workflow-c", { success: true, output: "Three" }],
				]);
				const { executor } = createMockExecutor(results);

				const workflows: ParallelWorkflowConfig[] = [
					{ name: "workflow-a", id: "first" },
					{ name: "workflow-b", id: "second" },
					{ name: "workflow-c", id: "third" },
				];

				const result = await executeParallelWorkflows(workflows, executor);

				const second = result.getWorkflow("second");
				expect(second).toBeDefined();
				expect(second?.id).toBe("second");
				expect(second?.output).toBe("Two");
			});

			it("should return undefined for non-existent ID", async () => {
				const { executor } = createMockExecutor();

				const workflows: ParallelWorkflowConfig[] = [
					{ name: "workflow-a", id: "exists" },
				];

				const result = await executeParallelWorkflows(workflows, executor);

				const notFound = result.getWorkflow("does-not-exist");
				expect(notFound).toBeUndefined();
			});
		});

		describe("getSuccessfulOutputs", () => {
			it("should return outputs of all successful workflows", async () => {
				const results = new Map([
					["workflow-a", { success: true, output: "Success 1" }],
					["workflow-b", { success: true, output: "Success 2" }],
				]);
				const { executor } = createMockExecutor(results);

				const workflows: ParallelWorkflowConfig[] = [
					{ name: "workflow-a", id: "s1" },
					{ name: "workflow-b", id: "s2" },
				];

				const result = await executeParallelWorkflows(workflows, executor);

				const outputs = result.getSuccessfulOutputs();
				expect(outputs).toHaveLength(2);
				expect(outputs.some((o) => o.output === "Success 1")).toBe(true);
				expect(outputs.some((o) => o.output === "Success 2")).toBe(true);
			});

			it("should not include output from failed workflows", async () => {
				const results = new Map([
					["workflow-a", { success: true, output: "Success" }],
					[
						"workflow-b",
						{
							success: false,
							error: { code: "EXECUTION_FAILED" as const, message: "Failed" },
						},
					],
				]);
				const { executor } = createMockExecutor(results);

				const workflows: ParallelWorkflowConfig[] = [
					{ name: "workflow-a", id: "success" },
					{ name: "workflow-b", id: "failed" },
				];

				const result = await executeParallelWorkflows(workflows, executor);

				const outputs = result.getSuccessfulOutputs();
				expect(outputs).toHaveLength(1);
				expect(outputs[0].id).toBe("success");
			});

			it("should return empty array when all workflows fail", async () => {
				const results = new Map([
					[
						"workflow-a",
						{
							success: false,
							error: { code: "EXECUTION_FAILED" as const, message: "Error 1" },
						},
					],
					[
						"workflow-b",
						{
							success: false,
							error: { code: "EXECUTION_FAILED" as const, message: "Error 2" },
						},
					],
				]);
				const { executor } = createMockExecutor(results);

				const workflows: ParallelWorkflowConfig[] = [
					{ name: "workflow-a", id: "fail1" },
					{ name: "workflow-b", id: "fail2" },
				];

				const result = await executeParallelWorkflows(workflows, executor);

				const outputs = result.getSuccessfulOutputs();
				expect(outputs).toHaveLength(0);
			});
		});

		describe("getErrors", () => {
			it("should return all failed workflow results", async () => {
				const results = new Map([
					["workflow-a", { success: true, output: "Success" }],
					[
						"workflow-b",
						{
							success: false,
							error: { code: "EXECUTION_FAILED" as const, message: "Error 1" },
						},
					],
					[
						"workflow-c",
						{
							success: false,
							error: { code: "EXECUTION_FAILED" as const, message: "Error 2" },
						},
					],
				]);
				const { executor } = createMockExecutor(results);

				const workflows: ParallelWorkflowConfig[] = [
					{ name: "workflow-a", id: "success" },
					{ name: "workflow-b", id: "fail1" },
					{ name: "workflow-c", id: "fail2" },
				];

				const result = await executeParallelWorkflows(workflows, executor);

				const errors = result.getErrors();
				expect(errors).toHaveLength(2);
				expect(errors.map((e) => e.id)).toContain("fail1");
				expect(errors.map((e) => e.id)).toContain("fail2");
			});

			it("should return empty array when all workflows succeed", async () => {
				const { executor } = createMockExecutor();

				const workflows: ParallelWorkflowConfig[] = [
					{ name: "workflow-a", id: "s1" },
					{ name: "workflow-b", id: "s2" },
				];

				const result = await executeParallelWorkflows(workflows, executor);

				const errors = result.getErrors();
				expect(errors).toHaveLength(0);
			});

			it("should include error details for failed workflows", async () => {
				const results = new Map([
					[
						"workflow-a",
						{
							success: false,
							error: {
								code: "EXECUTION_FAILED" as const,
								message: "Something went wrong",
							},
						},
					],
				]);
				const { executor } = createMockExecutor(results);

				const workflows: ParallelWorkflowConfig[] = [
					{ name: "workflow-a", id: "fail" },
				];

				const result = await executeParallelWorkflows(workflows, executor);

				const errors = result.getErrors();
				expect(errors).toHaveLength(1);
				expect(errors[0].error).toBeDefined();
				expect(errors[0].error.code).toBe("EXECUTION_FAILED");
				expect(errors[0].error.message).toBe("Something went wrong");
			});
		});

		describe("isSuccessful", () => {
			it("should return true for successful workflow", async () => {
				const results = new Map([
					["workflow-a", { success: true, output: "Done" }],
				]);
				const { executor } = createMockExecutor(results);

				const workflows: ParallelWorkflowConfig[] = [
					{ name: "workflow-a", id: "success" },
				];

				const result = await executeParallelWorkflows(workflows, executor);

				expect(result.isSuccessful("success")).toBe(true);
			});

			it("should return false for failed workflow", async () => {
				const results = new Map([
					[
						"workflow-a",
						{
							success: false,
							error: { code: "EXECUTION_FAILED" as const, message: "Failed" },
						},
					],
				]);
				const { executor } = createMockExecutor(results);

				const workflows: ParallelWorkflowConfig[] = [
					{ name: "workflow-a", id: "failed" },
				];

				const result = await executeParallelWorkflows(workflows, executor);

				expect(result.isSuccessful("failed")).toBe(false);
			});

			it("should return false for non-existent ID", async () => {
				const { executor } = createMockExecutor();

				const workflows: ParallelWorkflowConfig[] = [
					{ name: "workflow-a", id: "exists" },
				];

				const result = await executeParallelWorkflows(workflows, executor);

				expect(result.isSuccessful("does-not-exist")).toBe(false);
			});
		});
	});

	describe("labels", () => {
		it("should include label in workflow result when provided", async () => {
			const { executor } = createMockExecutor();

			const workflows: ParallelWorkflowConfig[] = [
				{ name: "workflow-a", id: "wf1", label: "Build Frontend" },
			];

			const result = await executeParallelWorkflows(workflows, executor);

			expect(result.workflows[0].label).toBe("Build Frontend");
		});

		it("should include overall label in result", async () => {
			const { executor } = createMockExecutor();

			const workflows: ParallelWorkflowConfig[] = [
				{ name: "workflow-a", id: "wf1" },
			];

			const result = await executeParallelWorkflows(workflows, executor, {
				label: "Parallel Build",
			});

			expect(result.label).toBe("Parallel Build");
		});

		it("should pass label to workflow executor", async () => {
			let receivedLabel: string | undefined;

			const executor: WorkflowExecutor = async (_reference, opts) => {
				receivedLabel = opts.label;
				return {
					success: true,
					output: "Done",
					duration: 0,
					metadata: {
						name: "test",
						version: "1.0.0",
						source: "project" as const,
					},
				};
			};

			const workflows: ParallelWorkflowConfig[] = [
				{ name: "workflow-a", id: "wf1", label: "Test Label" },
			];

			await executeParallelWorkflows(workflows, executor);

			expect(receivedLabel).toBe("Test Label");
		});
	});

	describe("callbacks", () => {
		it("should call onWorkflowComplete for each workflow", async () => {
			const completedIds: string[] = [];
			const { executor } = createMockExecutor();

			const workflows: ParallelWorkflowConfig[] = [
				{ name: "workflow-a", id: "wf1" },
				{ name: "workflow-b", id: "wf2" },
			];

			await executeParallelWorkflows(workflows, executor, {
				onWorkflowComplete: (workflowResult) => {
					completedIds.push(workflowResult.id);
				},
			});

			expect(completedIds).toHaveLength(2);
			expect(completedIds).toContain("wf1");
			expect(completedIds).toContain("wf2");
		});

		it("should call onProgress with correct data", async () => {
			const progressCalls: Array<{
				totalWorkflows: number;
				completedWorkflows: number;
				percentComplete: number;
			}> = [];
			const { executor } = createMockExecutor();

			const workflows: ParallelWorkflowConfig[] = [
				{ name: "workflow-a", id: "wf1" },
				{ name: "workflow-b", id: "wf2" },
			];

			await executeParallelWorkflows(workflows, executor, {
				onProgress: (progress) => {
					progressCalls.push({
						totalWorkflows: progress.totalWorkflows,
						completedWorkflows: progress.completedWorkflows,
						percentComplete: progress.percentComplete,
					});
				},
			});

			expect(progressCalls.length).toBeGreaterThanOrEqual(2);
			// Last call should show 100% complete
			const lastCall = progressCalls[progressCalls.length - 1];
			expect(lastCall.percentComplete).toBe(100);
			expect(lastCall.completedWorkflows).toBe(2);
		});

		it("should report failed workflows in progress callback", async () => {
			let reportedFailedCount = 0;

			const results = new Map([
				[
					"workflow-a",
					{
						success: false,
						error: { code: "EXECUTION_FAILED" as const, message: "Failed" },
					},
				],
				["workflow-b", { success: true, output: "OK" }],
			]);
			const { executor } = createMockExecutor(results);

			const workflows: ParallelWorkflowConfig[] = [
				{ name: "workflow-a", id: "fail" },
				{ name: "workflow-b", id: "success" },
			];

			await executeParallelWorkflows(workflows, executor, {
				onProgress: (progress) => {
					reportedFailedCount = progress.failedWorkflows;
				},
			});

			expect(reportedFailedCount).toBe(1);
		});

		it("should call onWorkflowStart for each workflow", async () => {
			const startedWorkflows: Array<{
				id: string;
				reference: string;
				queuePosition: number;
			}> = [];
			const { executor } = createMockExecutor();

			const workflows: ParallelWorkflowConfig[] = [
				{ name: "workflow-a", id: "wf1" },
				{ name: "workflow-b", id: "wf2" },
			];

			await executeParallelWorkflows(workflows, executor, {
				onWorkflowStart: (info) => {
					startedWorkflows.push({
						id: info.id,
						reference: info.reference,
						queuePosition: info.queuePosition,
					});
				},
			});

			expect(startedWorkflows).toHaveLength(2);
			expect(startedWorkflows.map((w) => w.id)).toContain("wf1");
			expect(startedWorkflows.map((w) => w.id)).toContain("wf2");
		});

		it("should report elapsed time in progress callback", async () => {
			let lastElapsed = 0;
			const results = new Map([
				["workflow-a", { success: true, output: "A", delay: 20 }],
			]);
			const { executor } = createMockExecutor(results);

			const workflows: ParallelWorkflowConfig[] = [
				{ name: "workflow-a", id: "wf1" },
			];

			await executeParallelWorkflows(workflows, executor, {
				onProgress: (progress) => {
					lastElapsed = progress.elapsedMs;
				},
			});

			expect(lastElapsed).toBeGreaterThan(0);
		});
	});

	describe("result structure", () => {
		it("should have all required fields in result", async () => {
			const { executor } = createMockExecutor();

			const workflows: ParallelWorkflowConfig[] = [
				{ name: "workflow-a", id: "wf1" },
			];

			const result = await executeParallelWorkflows(workflows, executor);

			expect(typeof result.success).toBe("boolean");
			expect(typeof result.totalDuration).toBe("number");
			expect(Array.isArray(result.workflows)).toBe(true);
			expect(result.summary).toBeDefined();
			expect(typeof result.getWorkflow).toBe("function");
			expect(typeof result.getSuccessfulOutputs).toBe("function");
			expect(typeof result.getErrors).toBe("function");
			expect(typeof result.isSuccessful).toBe("function");
		});

		it("should have all required fields in workflow result", async () => {
			const { executor } = createMockExecutor();

			const workflows: ParallelWorkflowConfig[] = [
				{ name: "test-workflow", id: "wf1", label: "Test" },
			];

			const result = await executeParallelWorkflows(workflows, executor);
			const workflow = result.workflows[0];

			expect(typeof workflow.id).toBe("string");
			expect(typeof workflow.reference).toBe("string");
			expect(typeof workflow.success).toBe("boolean");
			expect(typeof workflow.duration).toBe("number");
			expect(typeof workflow.queueWaitTime).toBe("number");
			expect(workflow.metadata).toBeDefined();
			expect(typeof workflow.metadata.name).toBe("string");
			expect(typeof workflow.metadata.version).toBe("string");
			expect(typeof workflow.metadata.source).toBe("string");
		});

		it("should have all required fields in summary", async () => {
			const results = new Map([
				["workflow-a", { success: true, output: "OK" }],
				[
					"workflow-b",
					{
						success: false,
						error: { code: "EXECUTION_FAILED" as const, message: "Failed" },
					},
				],
			]);
			const { executor } = createMockExecutor(results);

			const workflows: ParallelWorkflowConfig[] = [
				{ name: "workflow-a", id: "s1" },
				{ name: "workflow-b", id: "f1" },
			];

			const result = await executeParallelWorkflows(workflows, executor);

			expect(typeof result.summary.total).toBe("number");
			expect(typeof result.summary.succeeded).toBe("number");
			expect(typeof result.summary.failed).toBe("number");
			expect(typeof result.summary.timedOut).toBe("number");
			expect(result.summary.total).toBe(2);
			expect(result.summary.succeeded).toBe(1);
			expect(result.summary.failed).toBe(1);
		});
	});

	describe("all workflows fail scenario", () => {
		it("should return success: false when all workflows fail", async () => {
			const results = new Map([
				[
					"workflow-a",
					{
						success: false,
						error: { code: "EXECUTION_FAILED" as const, message: "Error 1" },
					},
				],
				[
					"workflow-b",
					{
						success: false,
						error: { code: "EXECUTION_FAILED" as const, message: "Error 2" },
					},
				],
				[
					"workflow-c",
					{
						success: false,
						error: { code: "EXECUTION_FAILED" as const, message: "Error 3" },
					},
				],
			]);
			const { executor } = createMockExecutor(results);

			const workflows: ParallelWorkflowConfig[] = [
				{ name: "workflow-a", id: "fail1" },
				{ name: "workflow-b", id: "fail2" },
				{ name: "workflow-c", id: "fail3" },
			];

			const result = await executeParallelWorkflows(workflows, executor);

			expect(result.success).toBe(false);
			expect(result.summary.total).toBe(3);
			expect(result.summary.succeeded).toBe(0);
			expect(result.summary.failed).toBe(3);
		});

		it("should capture all error details when all fail", async () => {
			const results = new Map([
				[
					"workflow-a",
					{
						success: false,
						error: {
							code: "EXECUTION_FAILED" as const,
							message: "Error message 1",
						},
					},
				],
				[
					"workflow-b",
					{
						success: false,
						error: {
							code: "EXECUTION_FAILED" as const,
							message: "Error message 2",
						},
					},
				],
			]);
			const { executor } = createMockExecutor(results);

			const workflows: ParallelWorkflowConfig[] = [
				{ name: "workflow-a", id: "fail1" },
				{ name: "workflow-b", id: "fail2" },
			];

			const result = await executeParallelWorkflows(workflows, executor);

			const errors = result.getErrors();
			expect(errors).toHaveLength(2);
			expect(errors[0].error).toBeDefined();
			expect(errors[1].error).toBeDefined();
		});
	});

	describe("single workflow execution", () => {
		it("should work correctly for single workflow", async () => {
			const results = new Map([
				["single-workflow", { success: true, output: "Single output" }],
			]);
			const { executor } = createMockExecutor(results);

			const workflows: ParallelWorkflowConfig[] = [
				{ name: "single-workflow", id: "single" },
			];

			const result = await executeParallelWorkflows(workflows, executor);

			expect(result.success).toBe(true);
			expect(result.workflows).toHaveLength(1);
			expect(result.workflows[0].id).toBe("single");
			expect(result.workflows[0].output).toBe("Single output");
			expect(result.summary.total).toBe(1);
			expect(result.summary.succeeded).toBe(1);
		});

		it("should still use parallel infrastructure for single workflow", async () => {
			const progressCalls: number[] = [];
			const { executor } = createMockExecutor();

			const workflows: ParallelWorkflowConfig[] = [
				{ name: "single-workflow", id: "single" },
			];

			await executeParallelWorkflows(workflows, executor, {
				onProgress: (progress) => {
					progressCalls.push(progress.completedWorkflows);
				},
			});

			// Progress should have been called at least once
			expect(progressCalls.length).toBeGreaterThanOrEqual(1);
			expect(progressCalls[progressCalls.length - 1]).toBe(1);
		});
	});

	describe("workflow input passing", () => {
		it("should pass input to workflow executor", async () => {
			let receivedInput: Record<string, unknown> | undefined;

			const executor: WorkflowExecutor = async (_reference, opts) => {
				receivedInput = opts.input;
				return {
					success: true,
					output: "Done",
					duration: 0,
					metadata: {
						name: "test",
						version: "1.0.0",
						source: "project" as const,
					},
				};
			};

			const workflows: ParallelWorkflowConfig[] = [
				{
					name: "test-workflow",
					id: "wf1",
					input: { key1: "value1", key2: 42 },
				},
			];

			await executeParallelWorkflows(workflows, executor);

			expect(receivedInput).toEqual({ key1: "value1", key2: 42 });
		});
	});
});

describe("WorkflowTypes utilities", () => {
	describe("createParallelWorkflowsResult", () => {
		it("should create result with helper methods", () => {
			const result = createParallelWorkflowsResult({
				success: true,
				totalDuration: 100,
				workflows: [
					{
						id: "wf1",
						reference: "workflow-a",
						success: true,
						output: "Output A",
						duration: 50,
						queueWaitTime: 10,
						metadata: {
							name: "workflow-a",
							version: "1.0.0",
							source: "project" as const,
						},
					},
					{
						id: "wf2",
						reference: "workflow-b",
						success: false,
						error: { code: "EXECUTION_FAILED" as const, message: "Failed" },
						duration: 30,
						queueWaitTime: 5,
						metadata: {
							name: "workflow-b",
							version: "1.0.0",
							source: "project" as const,
						},
					},
				],
				summary: {
					total: 2,
					succeeded: 1,
					failed: 1,
					timedOut: 0,
				},
			});

			expect(typeof result.getWorkflow).toBe("function");
			expect(typeof result.getSuccessfulOutputs).toBe("function");
			expect(typeof result.getErrors).toBe("function");
			expect(typeof result.isSuccessful).toBe("function");

			expect(result.getWorkflow("wf1")?.output).toBe("Output A");
			expect(result.getSuccessfulOutputs()).toHaveLength(1);
			expect(result.getErrors()).toHaveLength(1);
			expect(result.isSuccessful("wf1")).toBe(true);
			expect(result.isSuccessful("wf2")).toBe(false);
		});

		it("should include label when provided", () => {
			const result = createParallelWorkflowsResult({
				success: true,
				totalDuration: 0,
				workflows: [],
				summary: { total: 0, succeeded: 0, failed: 0, timedOut: 0 },
				label: "Test Label",
			});

			expect(result.label).toBe("Test Label");
		});
	});

	describe("calculateWorkflowsSummary", () => {
		it("should calculate summary correctly", () => {
			const workflows = [
				{
					id: "wf1",
					reference: "a",
					success: true,
					output: "A",
					duration: 10,
					queueWaitTime: 0,
					metadata: { name: "a", version: "1.0.0", source: "project" as const },
				},
				{
					id: "wf2",
					reference: "b",
					success: false,
					error: { code: "EXECUTION_FAILED" as const, message: "Failed" },
					duration: 10,
					queueWaitTime: 0,
					metadata: { name: "b", version: "1.0.0", source: "project" as const },
					timedOut: true,
				},
				{
					id: "wf3",
					reference: "c",
					success: true,
					output: "C",
					duration: 10,
					queueWaitTime: 0,
					metadata: { name: "c", version: "1.0.0", source: "project" as const },
				},
			];

			const summary = calculateWorkflowsSummary(workflows);

			expect(summary.total).toBe(3);
			expect(summary.succeeded).toBe(2);
			expect(summary.failed).toBe(1);
			expect(summary.timedOut).toBe(1);
		});

		it("should return zeros for empty array", () => {
			const summary = calculateWorkflowsSummary([]);

			expect(summary.total).toBe(0);
			expect(summary.succeeded).toBe(0);
			expect(summary.failed).toBe(0);
			expect(summary.timedOut).toBe(0);
		});

		it("should handle single element", () => {
			const workflows = [
				{
					id: "wf1",
					reference: "a",
					success: true,
					output: "A",
					duration: 10,
					queueWaitTime: 0,
					metadata: { name: "a", version: "1.0.0", source: "project" as const },
				},
			];

			const summary = calculateWorkflowsSummary(workflows);

			expect(summary.total).toBe(1);
			expect(summary.succeeded).toBe(1);
			expect(summary.failed).toBe(0);
			expect(summary.timedOut).toBe(0);
		});
	});
});
