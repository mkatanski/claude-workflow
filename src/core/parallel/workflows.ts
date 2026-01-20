/**
 * Parallel workflow execution implementation.
 *
 * Executes multiple workflows concurrently with configurable concurrency
 * limits, timeout handling, and result aggregation.
 */

import type {
	WorkflowCallError,
	WorkflowSource,
} from "../composition/types.ts";
import type {
	ParallelWorkflowConfig,
	ParallelWorkflowsOptions,
	WorkflowResult,
	WorkflowResultMetadata,
} from "./workflowTypes.ts";
import {
	calculateWorkflowsSummary,
	createParallelWorkflowsResult,
	DEFAULT_WORKFLOW_CONCURRENCY,
	MAX_WORKFLOW_CONCURRENCY,
	MIN_WORKFLOW_CONCURRENCY,
} from "./workflowTypes.ts";
import type { ParallelWorkflowsResult } from "./workflowTypes.ts";

// =============================================================================
// Types
// =============================================================================

/**
 * Progress callback for tracking parallel workflow execution.
 */
export type ParallelWorkflowsProgressCallback = (progress: {
	totalWorkflows: number;
	completedWorkflows: number;
	failedWorkflows: number;
	activeWorkflowIds: string[];
	queuedWorkflowIds: string[];
	percentComplete: number;
	elapsedMs: number;
}) => void;

/**
 * Callback type for executing a single workflow.
 *
 * This abstracts the actual workflow execution mechanism,
 * allowing the parallel executor to be decoupled from
 * the WorkflowTools implementation.
 */
export type WorkflowExecutor = (
	reference: string,
	options: {
		input?: Record<string, unknown>;
		timeout?: number;
		label?: string;
	},
) => Promise<{
	success: boolean;
	output?: unknown;
	error?: WorkflowCallError;
	duration: number;
	metadata: {
		name: string;
		version: string;
		source: WorkflowSource;
	};
}>;

/**
 * Callback for when a workflow starts execution.
 */
export type OnWorkflowStartCallback = (info: {
	id: string;
	reference: string;
	queuePosition: number;
	label?: string;
}) => void;

/**
 * Options for executeParallelWorkflows with callbacks.
 */
export interface ExecuteParallelWorkflowsOptions
	extends ParallelWorkflowsOptions {
	/** Progress callback called when a workflow completes */
	readonly onProgress?: ParallelWorkflowsProgressCallback;
	/** Callback called when a workflow completes */
	readonly onWorkflowComplete?: (result: WorkflowResult) => void;
	/** Callback called when a workflow starts execution */
	readonly onWorkflowStart?: OnWorkflowStartCallback;
}

// =============================================================================
// Internal Types
// =============================================================================

/**
 * Internal workflow state for queue management.
 */
interface WorkflowState {
	config: ParallelWorkflowConfig;
	id: string;
	queuedAt: number;
	queuePosition: number;
}

/**
 * Internal abort controller for managing totalTimeout and fail-fast.
 */
interface AbortState {
	aborted: boolean;
	reason?: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate a unique ID from workflow name.
 */
function generateWorkflowId(name: string, index: number): string {
	// Take first 20 chars of name, replace non-alphanumeric with underscore
	const sanitized = name
		.slice(0, 20)
		.replace(/[^a-zA-Z0-9]/g, "_")
		.replace(/_+/g, "_")
		.replace(/^_|_$/g, "");
	return `${sanitized}_${index}`;
}

/**
 * Clamp concurrency to valid range.
 */
function clampConcurrency(value: number | undefined): number {
	const v = value ?? DEFAULT_WORKFLOW_CONCURRENCY;
	return Math.max(
		MIN_WORKFLOW_CONCURRENCY,
		Math.min(MAX_WORKFLOW_CONCURRENCY, v),
	);
}

/**
 * Create a workflow result for aborted/cancelled workflows.
 */
function createAbortedResult(
	state: WorkflowState,
	reason: string,
): WorkflowResult {
	return {
		id: state.id,
		reference: state.config.name,
		success: false,
		error: {
			code: "EXECUTION_FAILED",
			message: reason,
		},
		duration: 0,
		queueWaitTime: Date.now() - state.queuedAt,
		metadata: {
			name: state.config.name,
			version: "unknown",
			source: "project" as WorkflowSource,
		},
		label: state.config.label,
		timedOut: reason.includes("timed out"),
	};
}

// =============================================================================
// Single Workflow Execution
// =============================================================================

/**
 * Execute a single workflow with timeout handling.
 */
async function executeSingleWorkflow(
	state: WorkflowState,
	executor: WorkflowExecutor,
	options: {
		abortState: AbortState;
		onWorkflowStart?: OnWorkflowStartCallback;
	},
): Promise<WorkflowResult> {
	const { config, id, queuedAt, queuePosition } = state;
	const { abortState, onWorkflowStart } = options;

	const executionStartTime = Date.now();
	const queueWaitTime = executionStartTime - queuedAt;

	// Check if already aborted before starting
	if (abortState.aborted) {
		return createAbortedResult(state, abortState.reason ?? "Execution aborted");
	}

	// Emit workflow start callback
	if (onWorkflowStart) {
		onWorkflowStart({
			id,
			reference: config.name,
			queuePosition,
			label: config.label,
		});
	}

	try {
		// Execute the workflow via the callback
		const result = await executor(config.name, {
			input: config.input,
			timeout: config.timeout,
			label: config.label,
		});

		const duration = Date.now() - executionStartTime;

		if (result.success) {
			return {
				id,
				reference: config.name,
				success: true,
				output: result.output,
				duration,
				queueWaitTime,
				metadata: result.metadata as WorkflowResultMetadata,
				label: config.label,
			};
		}

		// Check if this was a timeout
		const isTimeout = result.error?.code === "TIMEOUT";

		return {
			id,
			reference: config.name,
			success: false,
			error: result.error,
			duration,
			queueWaitTime,
			metadata: result.metadata as WorkflowResultMetadata,
			label: config.label,
			timedOut: isTimeout,
		};
	} catch (error) {
		const duration = Date.now() - executionStartTime;
		const message = error instanceof Error ? error.message : String(error);

		return {
			id,
			reference: config.name,
			success: false,
			error: {
				code: "EXECUTION_FAILED",
				message,
				stack: error instanceof Error ? error.stack : undefined,
			},
			duration,
			queueWaitTime,
			metadata: {
				name: config.name,
				version: "unknown",
				source: "project" as WorkflowSource,
			},
			label: config.label,
		};
	}
}

// =============================================================================
// Concurrency Queue Implementation
// =============================================================================

/**
 * Execute workflows with concurrency limiting using a semaphore pattern.
 */
async function executeWithConcurrencyLimit(
	workflowStates: WorkflowState[],
	executor: WorkflowExecutor,
	options: {
		maxConcurrency: number;
		continueOnError: boolean;
		abortState: AbortState;
		onWorkflowComplete?: (result: WorkflowResult) => void;
		onWorkflowStart?: OnWorkflowStartCallback;
	},
): Promise<WorkflowResult[]> {
	const {
		maxConcurrency,
		continueOnError,
		abortState,
		onWorkflowComplete,
		onWorkflowStart,
	} = options;

	const results: WorkflowResult[] = [];
	const activePromises = new Set<Promise<void>>();
	let workflowIndex = 0;

	// Process workflows using a semaphore pattern
	async function processWorkflow(state: WorkflowState): Promise<void> {
		const result = await executeSingleWorkflow(state, executor, {
			abortState,
			onWorkflowStart,
		});

		results.push(result);

		// Invoke callback if provided
		if (onWorkflowComplete) {
			onWorkflowComplete(result);
		}

		// If continueOnError is false and this workflow failed, abort remaining
		if (!continueOnError && !result.success) {
			abortState.aborted = true;
			abortState.reason = `Workflow '${state.id}' failed, aborting remaining workflows`;
		}
	}

	// Start initial batch up to maxConcurrency
	while (workflowIndex < workflowStates.length && !abortState.aborted) {
		// Start workflows up to concurrency limit
		while (
			activePromises.size < maxConcurrency &&
			workflowIndex < workflowStates.length &&
			!abortState.aborted
		) {
			const state = workflowStates[workflowIndex];
			workflowIndex++;

			const promise = processWorkflow(state).finally(() => {
				activePromises.delete(promise);
			});

			activePromises.add(promise);
		}

		// Wait for at least one to complete if at limit
		if (activePromises.size >= maxConcurrency && !abortState.aborted) {
			await Promise.race(activePromises);
		}
	}

	// Wait for all remaining active promises
	if (activePromises.size > 0) {
		await Promise.allSettled(activePromises);
	}

	return results;
}

// =============================================================================
// Main Export
// =============================================================================

/**
 * Execute multiple workflows in parallel with concurrency control.
 *
 * Uses Promise.allSettled semantics by default - individual workflow failures
 * don't abort other workflows unless continueOnError is set to false.
 *
 * @param workflows - Array of workflow configurations to execute
 * @param executor - Callback function that executes a single workflow
 * @param options - Execution options including concurrency and timeout settings
 * @returns Promise resolving to ParallelWorkflowsResult with all workflow results
 *
 * @example
 * ```typescript
 * const result = await executeParallelWorkflows(
 *   [
 *     { name: 'lint', id: 'lint-task', input: { path: './src' } },
 *     { name: 'test', id: 'test-task' },
 *     { name: 'build', id: 'build-task', timeout: 60000 },
 *   ],
 *   async (reference, options) => tools.workflow(reference, options),
 *   {
 *     maxConcurrency: 3,
 *     continueOnError: true,
 *   }
 * );
 *
 * console.log(`${result.summary.succeeded}/${result.summary.total} succeeded`);
 * ```
 */
export async function executeParallelWorkflows(
	workflows: readonly ParallelWorkflowConfig[],
	executor: WorkflowExecutor,
	options: ExecuteParallelWorkflowsOptions = {},
): Promise<ParallelWorkflowsResult> {
	const startTime = Date.now();

	// Handle empty workflow array
	if (workflows.length === 0) {
		return createParallelWorkflowsResult({
			success: true,
			totalDuration: 0,
			workflows: [],
			summary: {
				total: 0,
				succeeded: 0,
				failed: 0,
				timedOut: 0,
			},
			label: options.label,
		});
	}

	// Extract and validate options
	const maxConcurrency = clampConcurrency(options.maxConcurrency);
	const continueOnError = options.continueOnError ?? true;
	const totalTimeout = options.totalTimeout;

	// Prepare workflow states with generated IDs
	const usedIds = new Set<string>();
	const workflowStates: WorkflowState[] = workflows.map((config, index) => {
		let id = config.id;

		// Generate unique ID if not provided or if duplicate
		if (!id || usedIds.has(id)) {
			id = generateWorkflowId(config.name, index);
			// Ensure uniqueness
			let suffix = 0;
			let uniqueId = id;
			while (usedIds.has(uniqueId)) {
				suffix++;
				uniqueId = `${id}_${suffix}`;
			}
			id = uniqueId;
		}

		usedIds.add(id);

		return {
			config,
			id,
			queuedAt: Date.now(),
			queuePosition: index,
		};
	});

	// Set up abort state for totalTimeout and continueOnError handling
	const abortState: AbortState = { aborted: false };
	let totalTimeoutId: Timer | undefined;

	// Set up totalTimeout if specified
	if (totalTimeout !== undefined) {
		totalTimeoutId = setTimeout(() => {
			abortState.aborted = true;
			abortState.reason = `Total timeout of ${totalTimeout}ms exceeded`;
		}, totalTimeout);
	}

	// Track progress for callback
	let completedWorkflows = 0;
	let failedWorkflows = 0;
	const activeWorkflowIds: string[] = [];
	const queuedWorkflowIds: string[] = workflowStates.map((s) => s.id);

	const wrappedOnWorkflowStart = (info: {
		id: string;
		reference: string;
		queuePosition: number;
		label?: string;
	}) => {
		// Move from queued to active
		const queuedIdx = queuedWorkflowIds.indexOf(info.id);
		if (queuedIdx !== -1) {
			queuedWorkflowIds.splice(queuedIdx, 1);
		}
		activeWorkflowIds.push(info.id);

		// Call user's onWorkflowStart if provided
		if (options.onWorkflowStart) {
			options.onWorkflowStart(info);
		}
	};

	const wrappedOnWorkflowComplete = (result: WorkflowResult) => {
		completedWorkflows++;
		if (!result.success) {
			failedWorkflows++;
		}

		// Remove from active
		const activeIdx = activeWorkflowIds.indexOf(result.id);
		if (activeIdx !== -1) {
			activeWorkflowIds.splice(activeIdx, 1);
		}

		// Call user's onWorkflowComplete if provided
		if (options.onWorkflowComplete) {
			options.onWorkflowComplete(result);
		}

		// Call progress callback if provided
		if (options.onProgress) {
			options.onProgress({
				totalWorkflows: workflows.length,
				completedWorkflows,
				failedWorkflows,
				activeWorkflowIds: [...activeWorkflowIds],
				queuedWorkflowIds: [...queuedWorkflowIds],
				percentComplete: Math.round(
					(completedWorkflows / workflows.length) * 100,
				),
				elapsedMs: Date.now() - startTime,
			});
		}
	};

	try {
		// Execute workflows with concurrency limiting
		const results = await executeWithConcurrencyLimit(
			workflowStates,
			executor,
			{
				maxConcurrency,
				continueOnError,
				abortState,
				onWorkflowComplete: wrappedOnWorkflowComplete,
				onWorkflowStart: wrappedOnWorkflowStart,
			},
		);

		// Clear totalTimeout
		if (totalTimeoutId) {
			clearTimeout(totalTimeoutId);
		}

		// Calculate summary
		const totalDuration = Date.now() - startTime;
		const summary = calculateWorkflowsSummary(results);

		// Overall success is true only if all workflows succeeded
		const success = summary.failed === 0;

		return createParallelWorkflowsResult({
			success,
			totalDuration,
			workflows: results,
			summary,
			label: options.label,
		});
	} catch (_error) {
		// Clear totalTimeout on unexpected error
		if (totalTimeoutId) {
			clearTimeout(totalTimeoutId);
		}

		const totalDuration = Date.now() - startTime;

		// Return error result
		return createParallelWorkflowsResult({
			success: false,
			totalDuration,
			workflows: [],
			summary: {
				total: workflows.length,
				succeeded: 0,
				failed: workflows.length,
				timedOut: 0,
			},
			label: options.label,
		});
	}
}
