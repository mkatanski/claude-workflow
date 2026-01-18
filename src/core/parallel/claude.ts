/**
 * Parallel Claude session execution implementation.
 *
 * Executes multiple Claude Agent SDK sessions concurrently with configurable
 * concurrency limits, timeout handling, token tracking, and cost estimation.
 */

import type { AgentSessionOptions } from "../tools/claudeAgent.ts";
import { ClaudeAgentTool } from "../tools/claudeAgent.ts";
import { resolveModel } from "../tools/claudeAgent.types.ts";
import type {
	ClaudeSessionResult,
	ParallelClaudeConfig,
	ParallelClaudeOptions,
	ParallelClaudeResult,
	ParallelClaudeSummary,
	TokenUsage,
} from "./claudeTypes.ts";
import {
	aggregateTokenUsage,
	createEmptyTokenUsage,
	createParallelClaudeResult,
	DEFAULT_CLAUDE_CONCURRENCY,
	DEFAULT_SESSION_TIMEOUT,
	MAX_CLAUDE_CONCURRENCY,
	MIN_CLAUDE_CONCURRENCY,
} from "./claudeTypes.ts";
import { estimateTotalCost } from "./tokens.ts";

// =============================================================================
// Types
// =============================================================================

/**
 * Progress callback for tracking parallel Claude execution.
 */
export type ParallelClaudeProgressCallback = (progress: {
	totalSessions: number;
	completedSessions: number;
	failedSessions: number;
	activeSessionIds: string[];
	percentComplete: number;
	tokensUsed: number;
	elapsedMs: number;
}) => void;

/**
 * Options for executeParallelClaude with callbacks.
 */
export interface ExecuteParallelClaudeOptions extends ParallelClaudeOptions {
	/** Default working directory for sessions that don't specify one */
	readonly defaultWorkingDirectory?: string;
	/** Progress callback called when a session completes */
	readonly onProgress?: ParallelClaudeProgressCallback;
	/** Callback called when a session completes */
	readonly onSessionComplete?: (result: ClaudeSessionResult) => void;
}

// =============================================================================
// Internal Types
// =============================================================================

/**
 * Internal session state for queue management.
 */
interface SessionState {
	config: ParallelClaudeConfig;
	id: string;
	queuedAt: number;
}

/**
 * Internal abort controller for managing totalTimeout and budget.
 */
interface AbortState {
	aborted: boolean;
	reason?: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate a unique ID from prompt string.
 */
function generateSessionId(prompt: string, index: number): string {
	// Take first 20 chars of prompt, replace non-alphanumeric with underscore
	const sanitized = prompt
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
	const v = value ?? DEFAULT_CLAUDE_CONCURRENCY;
	return Math.max(MIN_CLAUDE_CONCURRENCY, Math.min(MAX_CLAUDE_CONCURRENCY, v));
}

/**
 * Extract token usage from session messages.
 *
 * This attempts to extract token counts from the session result.
 * If token data is not available, returns zeros.
 */
function extractTokenUsage(messages: readonly unknown[]): TokenUsage {
	// Try to find token usage in messages
	// The SDK typically includes this in system/result messages
	let inputTokens = 0;
	let outputTokens = 0;

	for (const msg of messages) {
		const message = msg as Record<string, unknown>;

		// Check for usage data in various message formats
		if (message.usage && typeof message.usage === "object") {
			const usage = message.usage as Record<string, unknown>;
			if (typeof usage.input_tokens === "number") {
				inputTokens += usage.input_tokens;
			}
			if (typeof usage.output_tokens === "number") {
				outputTokens += usage.output_tokens;
			}
		}

		// Check for tokens in result messages
		if (message.type === "result" && message.usage) {
			const usage = message.usage as Record<string, unknown>;
			if (typeof usage.input_tokens === "number") {
				inputTokens = usage.input_tokens;
			}
			if (typeof usage.output_tokens === "number") {
				outputTokens = usage.output_tokens;
			}
		}
	}

	return {
		input: inputTokens,
		output: outputTokens,
		total: inputTokens + outputTokens,
	};
}

// =============================================================================
// Single Session Execution
// =============================================================================

/**
 * Execute a single Claude session with timeout handling.
 */
async function executeSingleSession(
	state: SessionState,
	tool: ClaudeAgentTool,
	options: {
		defaultWorkingDirectory: string;
		abortState: AbortState;
	},
): Promise<ClaudeSessionResult> {
	const { config, id, queuedAt } = state;
	const { defaultWorkingDirectory, abortState } = options;

	const executionStartTime = Date.now();
	const queueWaitTime = executionStartTime - queuedAt;
	const timeout = config.timeout ?? DEFAULT_SESSION_TIMEOUT;
	const model = resolveModel(config.model ?? "sonnet");

	// Check if already aborted before starting
	if (abortState.aborted) {
		return {
			id,
			success: false,
			messages: [],
			error: abortState.reason ?? "Execution aborted",
			tokens: createEmptyTokenUsage(),
			duration: 0,
			queueWaitTime,
			model,
			label: config.label,
		};
	}

	try {
		// Build session options
		const sessionOptions: AgentSessionOptions = {
			model: config.model,
			tools: config.tools,
			systemPrompt: config.systemPrompt,
			workingDirectory: config.workingDirectory ?? defaultWorkingDirectory,
			maxBudgetUsd: config.maxBudgetUsd,
			label: config.label,
		};

		// Set up timeout
		let timeoutId: Timer | undefined;
		let timedOut = false;

		const timeoutPromise = new Promise<never>((_, reject) => {
			timeoutId = setTimeout(() => {
				timedOut = true;
				reject(new Error(`Session timed out after ${timeout}ms`));
			}, timeout);
		});

		try {
			// Execute session with timeout
			const result = await Promise.race([
				tool.executeSession(config.prompt, sessionOptions),
				timeoutPromise,
			]);

			// Clear timeout since we completed
			if (timeoutId) {
				clearTimeout(timeoutId);
			}

			const duration = Date.now() - executionStartTime;
			const tokens = extractTokenUsage(result.messages);

			if (result.success) {
				return {
					id,
					success: true,
					output: result.output,
					messages: result.messages,
					tokens,
					duration,
					queueWaitTime,
					model,
					sessionId: result.sessionId,
					label: config.label,
				};
			}

			return {
				id,
				success: false,
				messages: result.messages,
				error: result.error ?? "Session failed",
				tokens,
				duration,
				queueWaitTime,
				model,
				sessionId: result.sessionId,
				label: config.label,
			};
		} catch (error) {
			// Clear timeout on error
			if (timeoutId) {
				clearTimeout(timeoutId);
			}

			const duration = Date.now() - executionStartTime;
			const message = error instanceof Error ? error.message : String(error);

			return {
				id,
				success: false,
				messages: [],
				error: timedOut ? `Session timed out after ${timeout}ms` : message,
				tokens: createEmptyTokenUsage(),
				duration,
				queueWaitTime,
				model,
				label: config.label,
			};
		}
	} catch (error) {
		const duration = Date.now() - executionStartTime;
		const message = error instanceof Error ? error.message : String(error);

		return {
			id,
			success: false,
			messages: [],
			error: message,
			tokens: createEmptyTokenUsage(),
			duration,
			queueWaitTime,
			model,
			label: config.label,
		};
	}
}

// =============================================================================
// Concurrency Queue Implementation
// =============================================================================

/**
 * Execute sessions with concurrency limiting using a semaphore pattern.
 */
async function executeWithConcurrencyLimit(
	sessionStates: SessionState[],
	tool: ClaudeAgentTool,
	options: {
		maxConcurrency: number;
		defaultWorkingDirectory: string;
		continueOnError: boolean;
		abortState: AbortState;
		onSessionComplete?: (result: ClaudeSessionResult) => void;
	},
): Promise<ClaudeSessionResult[]> {
	const {
		maxConcurrency,
		defaultWorkingDirectory,
		continueOnError,
		abortState,
		onSessionComplete,
	} = options;

	const results: ClaudeSessionResult[] = [];
	const activePromises = new Set<Promise<void>>();
	let sessionIndex = 0;

	// Process sessions using a semaphore pattern
	async function processSession(state: SessionState): Promise<void> {
		const result = await executeSingleSession(state, tool, {
			defaultWorkingDirectory,
			abortState,
		});

		results.push(result);

		// Invoke callback if provided
		if (onSessionComplete) {
			onSessionComplete(result);
		}

		// If continueOnError is false and this session failed, abort remaining
		if (!continueOnError && !result.success) {
			abortState.aborted = true;
			abortState.reason = `Session '${state.id}' failed, aborting remaining sessions`;
		}
	}

	// Start initial batch up to maxConcurrency
	while (sessionIndex < sessionStates.length && !abortState.aborted) {
		// Start sessions up to concurrency limit
		while (
			activePromises.size < maxConcurrency &&
			sessionIndex < sessionStates.length &&
			!abortState.aborted
		) {
			const state = sessionStates[sessionIndex];
			sessionIndex++;

			const promise = processSession(state).finally(() => {
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
 * Execute multiple Claude sessions in parallel with concurrency control.
 *
 * Uses Promise.allSettled semantics by default - individual session failures
 * don't abort other sessions unless continueOnError is set to false.
 *
 * @param sessions - Array of session configurations to execute
 * @param options - Execution options including concurrency and timeout settings
 * @returns Promise resolving to ParallelClaudeResult with all session results
 *
 * @example
 * ```typescript
 * const result = await executeParallelClaude([
 *   { prompt: 'Analyze the authentication code', id: 'auth-review' },
 *   { prompt: 'Review the database queries', id: 'db-review' },
 *   { prompt: 'Check the API endpoints', id: 'api-review' },
 * ], {
 *   maxConcurrency: 3,
 *   continueOnError: true,
 * });
 *
 * console.log(`${result.summary.succeeded}/${result.summary.total} succeeded`);
 * console.log(`Total cost: $${result.summary.estimatedCostUsd.toFixed(4)}`);
 * ```
 */
export async function executeParallelClaude(
	sessions: readonly ParallelClaudeConfig[],
	options: ExecuteParallelClaudeOptions = {},
): Promise<ParallelClaudeResult> {
	const startTime = Date.now();

	// Handle empty session array
	if (sessions.length === 0) {
		return createParallelClaudeResult({
			success: true,
			totalDuration: 0,
			sessions: [],
			summary: {
				total: 0,
				succeeded: 0,
				failed: 0,
				totalTokens: createEmptyTokenUsage(),
				estimatedCostUsd: 0,
			},
			label: options.label,
		});
	}

	// Extract and validate options
	const maxConcurrency = clampConcurrency(options.maxConcurrency);
	const continueOnError = options.continueOnError ?? true;
	const totalTimeout = options.totalTimeout;
	const maxTotalBudgetUsd = options.maxTotalBudgetUsd;
	const defaultWorkingDirectory =
		options.defaultWorkingDirectory ?? process.cwd();

	// Prepare session states with generated IDs
	const usedIds = new Set<string>();
	const sessionStates: SessionState[] = sessions.map((config, index) => {
		let id = config.id;

		// Generate unique ID if not provided or if duplicate
		if (!id || usedIds.has(id)) {
			id = generateSessionId(config.prompt, index);
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

	// Create the Claude Agent tool instance
	const tool = new ClaudeAgentTool();

	// Track progress for callback
	let completedSessions = 0;
	let failedSessions = 0;
	let totalTokensUsed = 0;
	let totalCostUsed = 0;
	const activeSessionIds: string[] = [];

	// Initialize active session tracking
	for (const state of sessionStates) {
		activeSessionIds.push(state.id);
	}

	const wrappedOnSessionComplete = (result: ClaudeSessionResult) => {
		completedSessions++;
		if (!result.success) {
			failedSessions++;
		}

		// Update token tracking
		totalTokensUsed += result.tokens.total;

		// Update cost tracking
		totalCostUsed += estimateTotalCost([
			{ tokens: result.tokens, model: result.model },
		]);

		// Check if total budget exceeded
		if (maxTotalBudgetUsd !== undefined && totalCostUsed > maxTotalBudgetUsd) {
			abortState.aborted = true;
			abortState.reason = `Total budget of $${maxTotalBudgetUsd} exceeded`;
		}

		// Update active session IDs
		const idx = activeSessionIds.indexOf(result.id);
		if (idx !== -1) {
			activeSessionIds.splice(idx, 1);
		}

		// Call user's onSessionComplete if provided
		if (options.onSessionComplete) {
			options.onSessionComplete(result);
		}

		// Call progress callback if provided
		if (options.onProgress) {
			options.onProgress({
				totalSessions: sessions.length,
				completedSessions,
				failedSessions,
				activeSessionIds: [...activeSessionIds],
				percentComplete: Math.round(
					(completedSessions / sessions.length) * 100,
				),
				tokensUsed: totalTokensUsed,
				elapsedMs: Date.now() - startTime,
			});
		}
	};

	try {
		// Execute sessions with concurrency limiting
		const results = await executeWithConcurrencyLimit(sessionStates, tool, {
			maxConcurrency,
			defaultWorkingDirectory,
			continueOnError,
			abortState,
			onSessionComplete: wrappedOnSessionComplete,
		});

		// Clear totalTimeout
		if (totalTimeoutId) {
			clearTimeout(totalTimeoutId);
		}

		// Calculate summary
		const totalDuration = Date.now() - startTime;
		const failedCount = results.filter((r) => !r.success).length;
		const succeededCount = results.filter((r) => r.success).length;
		const totalTokens = aggregateTokenUsage(results.map((r) => r.tokens));
		const estimatedCostUsd = estimateTotalCost(
			results.map((r) => ({ tokens: r.tokens, model: r.model })),
		);

		const summary: ParallelClaudeSummary = {
			total: results.length,
			succeeded: succeededCount,
			failed: failedCount,
			totalTokens,
			estimatedCostUsd,
		};

		// Overall success is true only if all sessions succeeded
		const success = failedCount === 0;

		return createParallelClaudeResult({
			success,
			totalDuration,
			sessions: results,
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
		return createParallelClaudeResult({
			success: false,
			totalDuration,
			sessions: [],
			summary: {
				total: sessions.length,
				succeeded: 0,
				failed: sessions.length,
				totalTokens: createEmptyTokenUsage(),
				estimatedCostUsd: 0,
			},
			label: options.label,
		});
	}
}
