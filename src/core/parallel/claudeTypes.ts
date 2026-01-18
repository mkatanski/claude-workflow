/**
 * Parallel Claude session execution types and interfaces.
 *
 * Provides type definitions for parallel Claude Agent SDK session execution
 * with concurrency control, token tracking, and result aggregation.
 */

import type { AgentMessage } from "../tools/claudeAgent.ts";
import type { BuiltInTool, ModelSpec } from "../tools/claudeAgent.types.ts";

// =============================================================================
// Token Usage
// =============================================================================

/**
 * Token usage tracking for input, output, and total tokens.
 */
export interface TokenUsage {
	/** Number of input tokens consumed */
	readonly input: number;
	/** Number of output tokens generated */
	readonly output: number;
	/** Total tokens (input + output) */
	readonly total: number;
}

// =============================================================================
// Session Configuration
// =============================================================================

/**
 * Configuration for a single Claude session in parallel execution.
 */
export interface ParallelClaudeConfig {
	/** The prompt to send to the Claude session */
	readonly prompt: string;
	/** Unique identifier for this session (auto-generated if not provided) */
	readonly id?: string;
	/** Model to use for this session (alias or full ID) */
	readonly model?: ModelSpec;
	/** Tools available to this session */
	readonly tools?: BuiltInTool[];
	/** System prompt for this session */
	readonly systemPrompt?: string;
	/** Working directory for file operations */
	readonly workingDirectory?: string;
	/** Timeout in milliseconds for this session (default: 300000ms / 5 minutes) */
	readonly timeout?: number;
	/** Maximum budget in USD for this session */
	readonly maxBudgetUsd?: number;
	/** Human-readable label for event display */
	readonly label?: string;
}

// =============================================================================
// Options
// =============================================================================

/**
 * Options for parallel Claude session execution.
 */
export interface ParallelClaudeOptions {
	/** Maximum number of sessions to execute concurrently (default: 3, range: 1-5) */
	readonly maxConcurrency?: number;
	/** Whether to continue executing remaining sessions when one fails (default: true) */
	readonly continueOnError?: boolean;
	/** Total timeout in milliseconds for all sessions (default: none) */
	readonly totalTimeout?: number;
	/** Maximum total budget in USD for all sessions combined */
	readonly maxTotalBudgetUsd?: number;
	/** Human-readable label for event display */
	readonly label?: string;
}

// =============================================================================
// Results
// =============================================================================

/**
 * Result of a single Claude session execution.
 */
export interface ClaudeSessionResult {
	/** Unique identifier for this session */
	readonly id: string;
	/** Whether the session succeeded */
	readonly success: boolean;
	/** Output text from the session (final assistant response) */
	readonly output?: string;
	/** All messages from the session conversation */
	readonly messages: readonly AgentMessage[];
	/** Error message if session failed */
	readonly error?: string;
	/** Token usage for this session */
	readonly tokens: TokenUsage;
	/** Execution duration in milliseconds (excluding queue wait time) */
	readonly duration: number;
	/** Time spent waiting in queue before execution started in milliseconds */
	readonly queueWaitTime: number;
	/** Model used for this session (resolved full model ID) */
	readonly model: string;
	/** Session ID from the Claude Agent SDK (for potential resume) */
	readonly sessionId?: string;
	/** Human-readable label for event display */
	readonly label?: string;
}

/**
 * Summary statistics for parallel Claude execution.
 */
export interface ParallelClaudeSummary {
	/** Total number of sessions executed */
	readonly total: number;
	/** Number of sessions that succeeded */
	readonly succeeded: number;
	/** Number of sessions that failed */
	readonly failed: number;
	/** Aggregated token usage across all sessions */
	readonly totalTokens: TokenUsage;
	/** Estimated total cost in USD */
	readonly estimatedCostUsd: number;
}

/**
 * Result of parallel Claude execution with helper methods.
 */
export interface ParallelClaudeResult {
	/** Whether all sessions succeeded */
	readonly success: boolean;
	/** Total duration of the parallel execution in milliseconds */
	readonly totalDuration: number;
	/** Array of individual session results */
	readonly sessions: readonly ClaudeSessionResult[];
	/** Summary statistics */
	readonly summary: ParallelClaudeSummary;
	/** Human-readable label for event display */
	readonly label?: string;

	/**
	 * Get a session result by its ID.
	 *
	 * @param id - The session ID to look up
	 * @returns The session result, or undefined if not found
	 */
	getSession(id: string): ClaudeSessionResult | undefined;

	/**
	 * Get the outputs of all successful sessions.
	 *
	 * @returns Array of objects with id and output from successful sessions
	 */
	getSuccessfulOutputs(): Array<{ id: string; output: string }>;

	/**
	 * Get all failed session results with their errors.
	 *
	 * @returns Array of objects with id and error from failed sessions
	 */
	getErrors(): Array<{ id: string; error: string }>;
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a ParallelClaudeResult with helper methods.
 *
 * @param data - The result data without helper methods
 * @returns A complete ParallelClaudeResult with helper methods
 */
export function createParallelClaudeResult(data: {
	success: boolean;
	totalDuration: number;
	sessions: ClaudeSessionResult[];
	summary: ParallelClaudeSummary;
	label?: string;
}): ParallelClaudeResult {
	const { success, totalDuration, sessions, summary, label } = data;

	return {
		success,
		totalDuration,
		sessions,
		summary,
		label,

		getSession(id: string): ClaudeSessionResult | undefined {
			return sessions.find((session) => session.id === id);
		},

		getSuccessfulOutputs(): Array<{ id: string; output: string }> {
			return sessions
				.filter((session) => session.success && session.output !== undefined)
				.map((session) => ({
					id: session.id,
					output: session.output as string,
				}));
		},

		getErrors(): Array<{ id: string; error: string }> {
			return sessions
				.filter((session) => !session.success && session.error !== undefined)
				.map((session) => ({ id: session.id, error: session.error as string }));
		},
	};
}

/**
 * Create an empty TokenUsage object.
 *
 * @returns TokenUsage with all values set to 0
 */
export function createEmptyTokenUsage(): TokenUsage {
	return {
		input: 0,
		output: 0,
		total: 0,
	};
}

/**
 * Aggregate multiple TokenUsage objects into a single total.
 *
 * @param usages - Array of TokenUsage objects to aggregate
 * @returns Combined TokenUsage with summed values
 */
export function aggregateTokenUsage(usages: TokenUsage[]): TokenUsage {
	return usages.reduce(
		(acc, usage) => ({
			input: acc.input + usage.input,
			output: acc.output + usage.output,
			total: acc.total + usage.total,
		}),
		createEmptyTokenUsage(),
	);
}

// =============================================================================
// Default Values
// =============================================================================

/** Default maximum concurrency for parallel Claude execution */
export const DEFAULT_CLAUDE_CONCURRENCY = 3;

/** Minimum allowed concurrency for parallel Claude execution */
export const MIN_CLAUDE_CONCURRENCY = 1;

/** Maximum allowed concurrency for parallel Claude execution */
export const MAX_CLAUDE_CONCURRENCY = 5;

/** Default timeout per session in milliseconds (5 minutes) */
export const DEFAULT_SESSION_TIMEOUT = 300_000;
