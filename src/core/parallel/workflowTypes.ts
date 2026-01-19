/**
 * Parallel workflow execution types and interfaces.
 *
 * Provides type definitions for parallel workflow execution with concurrency
 * control, timeout handling, and result aggregation.
 */

import type {
	WorkflowCallError,
	WorkflowSource,
} from "../composition/types.ts";

// =============================================================================
// Workflow Configuration
// =============================================================================

/**
 * Configuration for a single workflow in parallel execution.
 */
export interface ParallelWorkflowConfig {
	/** Workflow reference (name, name@version, or name:export) */
	readonly name: string;
	/** Unique identifier for this workflow in results (auto-generated if not provided) */
	readonly id?: string;
	/** Input data for the workflow */
	readonly input?: Record<string, unknown>;
	/** Timeout in milliseconds for this specific workflow (default: none) */
	readonly timeout?: number;
	/** Human-readable label for event display */
	readonly label?: string;
}

// =============================================================================
// Options
// =============================================================================

/**
 * Options for parallel workflow execution.
 */
export interface ParallelWorkflowsOptions {
	/** Maximum number of workflows to execute concurrently (default: 5, range: 1-10) */
	readonly maxConcurrency?: number;
	/** Whether to continue executing remaining workflows when one fails (default: true) */
	readonly continueOnError?: boolean;
	/** Total timeout in milliseconds for all workflows (default: none) */
	readonly totalTimeout?: number;
	/** Human-readable label for event display */
	readonly label?: string;
}

// =============================================================================
// Results
// =============================================================================

/**
 * Metadata about the executed workflow.
 */
export interface WorkflowResultMetadata {
	/** Resolved workflow name */
	readonly name: string;
	/** Resolved workflow version */
	readonly version: string;
	/** Where the workflow was loaded from */
	readonly source: WorkflowSource;
}

/**
 * Result of a single workflow execution in parallel execution.
 */
export interface WorkflowResult {
	/** Unique identifier for this workflow */
	readonly id: string;
	/** Workflow reference that was requested */
	readonly reference: string;
	/** Whether the workflow succeeded */
	readonly success: boolean;
	/** Output from the workflow (only present on success) */
	readonly output?: unknown;
	/** Error details if workflow failed */
	readonly error?: WorkflowCallError;
	/** Execution duration in milliseconds (excluding queue wait time) */
	readonly duration: number;
	/** Time spent waiting in queue before execution started in milliseconds */
	readonly queueWaitTime: number;
	/** Metadata about the resolved workflow */
	readonly metadata: WorkflowResultMetadata;
	/** Human-readable label for event display */
	readonly label?: string;
	/** Whether the workflow timed out */
	readonly timedOut?: boolean;
}

/**
 * Summary statistics for parallel workflow execution.
 */
export interface ParallelWorkflowsSummary {
	/** Total number of workflows executed */
	readonly total: number;
	/** Number of workflows that succeeded */
	readonly succeeded: number;
	/** Number of workflows that failed */
	readonly failed: number;
	/** Number of workflows that timed out */
	readonly timedOut: number;
}

/**
 * Result of parallel workflow execution with helper methods.
 */
export interface ParallelWorkflowsResult {
	/** Whether all workflows succeeded */
	readonly success: boolean;
	/** Total duration of the parallel execution in milliseconds */
	readonly totalDuration: number;
	/** Array of individual workflow results */
	readonly workflows: readonly WorkflowResult[];
	/** Summary statistics */
	readonly summary: ParallelWorkflowsSummary;
	/** Human-readable label for event display */
	readonly label?: string;

	/**
	 * Get a workflow result by its ID.
	 *
	 * @param id - The workflow ID to look up
	 * @returns The workflow result, or undefined if not found
	 */
	getWorkflow(id: string): WorkflowResult | undefined;

	/**
	 * Get the outputs of all successful workflows.
	 *
	 * @returns Array of objects with id and output from successful workflows
	 */
	getSuccessfulOutputs(): Array<{ id: string; output: unknown }>;

	/**
	 * Get all failed workflow results with their errors.
	 *
	 * @returns Array of objects with id and error from failed workflows
	 */
	getErrors(): Array<{ id: string; error: WorkflowCallError }>;

	/**
	 * Check if a specific workflow succeeded.
	 *
	 * @param id - The workflow ID to check
	 * @returns True if the workflow succeeded, false if it failed or not found
	 */
	isSuccessful(id: string): boolean;
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a ParallelWorkflowsResult with helper methods.
 *
 * @param data - The result data without helper methods
 * @returns A complete ParallelWorkflowsResult with helper methods
 */
export function createParallelWorkflowsResult(data: {
	success: boolean;
	totalDuration: number;
	workflows: WorkflowResult[];
	summary: ParallelWorkflowsSummary;
	label?: string;
}): ParallelWorkflowsResult {
	const { success, totalDuration, workflows, summary, label } = data;

	return {
		success,
		totalDuration,
		workflows,
		summary,
		label,

		getWorkflow(id: string): WorkflowResult | undefined {
			return workflows.find((workflow) => workflow.id === id);
		},

		getSuccessfulOutputs(): Array<{ id: string; output: unknown }> {
			return workflows
				.filter((workflow) => workflow.success && workflow.output !== undefined)
				.map((workflow) => ({
					id: workflow.id,
					output: workflow.output,
				}));
		},

		getErrors(): Array<{ id: string; error: WorkflowCallError }> {
			return workflows
				.filter((workflow) => !workflow.success && workflow.error !== undefined)
				.map((workflow) => ({
					id: workflow.id,
					error: workflow.error as WorkflowCallError,
				}));
		},

		isSuccessful(id: string): boolean {
			const workflow = workflows.find((w) => w.id === id);
			return workflow?.success ?? false;
		},
	};
}

/**
 * Calculate summary statistics from workflow results.
 *
 * @param workflows - Array of workflow results
 * @returns Summary statistics
 */
export function calculateWorkflowsSummary(
	workflows: WorkflowResult[],
): ParallelWorkflowsSummary {
	const total = workflows.length;
	const succeeded = workflows.filter((w) => w.success).length;
	const timedOut = workflows.filter((w) => w.timedOut).length;
	const failed = total - succeeded;

	return {
		total,
		succeeded,
		failed,
		timedOut,
	};
}

// =============================================================================
// Default Values
// =============================================================================

/** Default maximum concurrency for parallel workflow execution */
export const DEFAULT_WORKFLOW_CONCURRENCY = 5;

/** Minimum allowed concurrency for parallel workflow execution */
export const MIN_WORKFLOW_CONCURRENCY = 1;

/** Maximum allowed concurrency for parallel workflow execution */
export const MAX_WORKFLOW_CONCURRENCY = 10;
