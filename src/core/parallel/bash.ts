/**
 * Parallel bash execution implementation.
 *
 * Executes multiple bash commands concurrently with configurable concurrency
 * limits, timeout handling, and output truncation.
 */

import type {
	BashCommandResult,
	ParallelBashConfig,
	ParallelBashOptions,
	ParallelBashResult,
	ParallelBashSummary,
} from "./types.ts";
import {
	createParallelBashResult,
	DEFAULT_COMMAND_TIMEOUT,
	DEFAULT_MAX_CONCURRENCY,
	DEFAULT_MAX_OUTPUT_SIZE,
	MAX_CONCURRENCY,
	MIN_CONCURRENCY,
} from "./types.ts";

// =============================================================================
// Types
// =============================================================================

/**
 * Progress callback for tracking parallel execution.
 */
export type ParallelBashProgressCallback = (progress: {
	totalCommands: number;
	completedCommands: number;
	failedCommands: number;
	activeCommandIds: string[];
	percentComplete: number;
	elapsedMs: number;
}) => void;

/**
 * Options for executeParallelBash with callbacks.
 */
export interface ExecuteParallelBashOptions extends ParallelBashOptions {
	/** Default working directory for commands that don't specify one */
	readonly defaultCwd?: string;
	/** Progress callback called when a command completes */
	readonly onProgress?: ParallelBashProgressCallback;
	/** Callback called when a command completes */
	readonly onCommandComplete?: (result: BashCommandResult) => void;
}

// =============================================================================
// Internal Types
// =============================================================================

/**
 * Internal command state for queue management.
 */
interface CommandState {
	config: ParallelBashConfig;
	id: string;
	queuedAt: number;
}

/**
 * Internal abort controller for managing totalTimeout.
 */
interface AbortState {
	aborted: boolean;
	reason?: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate a unique ID from command string.
 */
function generateCommandId(command: string, index: number): string {
	// Take first 20 chars of command, replace non-alphanumeric with underscore
	const sanitized = command
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
	const v = value ?? DEFAULT_MAX_CONCURRENCY;
	return Math.max(MIN_CONCURRENCY, Math.min(MAX_CONCURRENCY, v));
}

/**
 * Truncate output if it exceeds the maximum size.
 */
function truncateOutput(
	output: string,
	maxSize: number,
): { output: string; truncated: boolean } {
	if (output.length <= maxSize) {
		return { output, truncated: false };
	}

	const truncatedOutput = output.slice(0, maxSize);
	const truncationMessage = `\n... [OUTPUT TRUNCATED: ${output.length - maxSize} bytes omitted]`;
	return {
		output: truncatedOutput + truncationMessage,
		truncated: true,
	};
}

/**
 * Build environment variables for command execution.
 */
function buildEnv(
	envConfig: Record<string, string> | undefined,
): Record<string, string> | undefined {
	if (!envConfig) {
		return undefined;
	}

	// Start with copy of current environment
	const env: Record<string, string> = { ...process.env } as Record<
		string,
		string
	>;

	// Add/override with custom variables
	for (const [key, value] of Object.entries(envConfig)) {
		env[key] = String(value);
	}

	return env;
}

// =============================================================================
// Single Command Execution
// =============================================================================

/**
 * Execute a single command with timeout handling.
 */
async function executeSingleCommand(
	state: CommandState,
	options: {
		defaultCwd: string;
		maxOutputSize: number;
		abortState: AbortState;
	},
): Promise<BashCommandResult> {
	const { config, id, queuedAt } = state;
	const { defaultCwd, maxOutputSize, abortState } = options;

	const executionStartTime = Date.now();
	const queueWaitTime = executionStartTime - queuedAt;
	const cwd = config.cwd ?? defaultCwd;
	const timeout = config.timeout ?? DEFAULT_COMMAND_TIMEOUT;

	// Check if already aborted before starting
	if (abortState.aborted) {
		return {
			id,
			command: config.command,
			success: false,
			exitCode: null,
			stdout: "",
			stderr: "",
			truncated: false,
			duration: 0,
			queueWaitTime,
			cwd,
			label: config.label,
			error: abortState.reason ?? "Execution aborted",
		};
	}

	try {
		const env = buildEnv(config.env);

		const proc = Bun.spawn(["sh", "-c", config.command], {
			cwd,
			env,
			stdout: "pipe",
			stderr: "pipe",
		});

		// Set up timeout
		let timeoutId: Timer | undefined;

		const timeoutPromise = new Promise<never>((_, reject) => {
			timeoutId = setTimeout(() => {
				proc.kill();
				reject(new Error(`Command timed out after ${timeout}ms`));
			}, timeout);
		});

		try {
			const [stdout, stderr] = await Promise.race([
				Promise.all([
					new Response(proc.stdout).text(),
					new Response(proc.stderr).text(),
				]),
				timeoutPromise,
			]);

			// Clear timeout since we completed
			if (timeoutId) {
				clearTimeout(timeoutId);
			}

			const exitCode = await proc.exited;
			const duration = Date.now() - executionStartTime;
			const success = exitCode === 0;

			// Truncate output if needed
			const { output: truncatedStdout, truncated: stdoutTruncated } =
				truncateOutput(stdout, maxOutputSize);
			const { output: truncatedStderr, truncated: stderrTruncated } =
				truncateOutput(stderr, maxOutputSize);
			const truncated = stdoutTruncated || stderrTruncated;

			return {
				id,
				command: config.command,
				success,
				exitCode,
				stdout: truncatedStdout,
				stderr: truncatedStderr,
				truncated,
				duration,
				queueWaitTime,
				cwd,
				label: config.label,
				error: success ? undefined : truncatedStderr || undefined,
			};
		} catch (error) {
			// Clear timeout on error
			if (timeoutId) {
				clearTimeout(timeoutId);
			}
			throw error;
		}
	} catch (error) {
		const duration = Date.now() - executionStartTime;
		const message = error instanceof Error ? error.message : String(error);

		return {
			id,
			command: config.command,
			success: false,
			exitCode: null,
			stdout: "",
			stderr: "",
			truncated: false,
			duration,
			queueWaitTime,
			cwd,
			label: config.label,
			error: message,
		};
	}
}

// =============================================================================
// Concurrency Queue Implementation
// =============================================================================

/**
 * Execute commands with concurrency limiting using a semaphore pattern.
 */
async function executeWithConcurrencyLimit(
	commandStates: CommandState[],
	options: {
		maxConcurrency: number;
		defaultCwd: string;
		maxOutputSize: number;
		continueOnError: boolean;
		abortState: AbortState;
		onCommandComplete?: (result: BashCommandResult) => void;
	},
): Promise<BashCommandResult[]> {
	const {
		maxConcurrency,
		defaultCwd,
		maxOutputSize,
		continueOnError,
		abortState,
		onCommandComplete,
	} = options;

	const results: BashCommandResult[] = [];
	const activePromises = new Set<Promise<void>>();
	let commandIndex = 0;

	// Process commands using a semaphore pattern
	async function processCommand(state: CommandState): Promise<void> {
		const result = await executeSingleCommand(state, {
			defaultCwd,
			maxOutputSize,
			abortState,
		});

		results.push(result);

		// Invoke callback if provided
		if (onCommandComplete) {
			onCommandComplete(result);
		}

		// If continueOnError is false and this command failed, abort remaining
		if (!continueOnError && !result.success) {
			abortState.aborted = true;
			abortState.reason = `Command '${state.id}' failed, aborting remaining commands`;
		}
	}

	// Start initial batch up to maxConcurrency
	while (commandIndex < commandStates.length && !abortState.aborted) {
		// Start commands up to concurrency limit
		while (
			activePromises.size < maxConcurrency &&
			commandIndex < commandStates.length &&
			!abortState.aborted
		) {
			const state = commandStates[commandIndex];
			commandIndex++;

			const promise = processCommand(state).finally(() => {
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
 * Execute multiple bash commands in parallel with concurrency control.
 *
 * Uses Promise.allSettled semantics by default - individual command failures
 * don't abort other commands unless continueOnError is set to false.
 *
 * @param commands - Array of command configurations to execute
 * @param options - Execution options including concurrency and timeout settings
 * @returns Promise resolving to ParallelBashResult with all command results
 *
 * @example
 * ```typescript
 * const result = await executeParallelBash([
 *   { command: 'npm test', id: 'tests', cwd: './packages/core' },
 *   { command: 'npm run lint', id: 'lint' },
 *   { command: 'npm run build', id: 'build' },
 * ], {
 *   maxConcurrency: 3,
 *   continueOnError: true,
 * });
 *
 * console.log(`${result.summary.succeeded}/${result.summary.total} succeeded`);
 * ```
 */
export async function executeParallelBash(
	commands: readonly ParallelBashConfig[],
	options: ExecuteParallelBashOptions = {},
): Promise<ParallelBashResult> {
	const startTime = Date.now();

	// Handle empty command array
	if (commands.length === 0) {
		return createParallelBashResult({
			success: true,
			totalDuration: 0,
			commands: [],
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
	const maxOutputSize = options.maxOutputSize ?? DEFAULT_MAX_OUTPUT_SIZE;
	const defaultCwd = options.defaultCwd ?? process.cwd();

	// Prepare command states with generated IDs
	const usedIds = new Set<string>();
	const commandStates: CommandState[] = commands.map((config, index) => {
		let id = config.id;

		// Generate unique ID if not provided or if duplicate
		if (!id || usedIds.has(id)) {
			id = generateCommandId(config.command, index);
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

	// Track progress for callback
	let completedCommands = 0;
	let failedCommands = 0;
	const activeCommandIds: string[] = [];

	const wrappedOnCommandComplete = (result: BashCommandResult) => {
		completedCommands++;
		if (!result.success) {
			failedCommands++;
		}

		// Update active command IDs
		const idx = activeCommandIds.indexOf(result.id);
		if (idx !== -1) {
			activeCommandIds.splice(idx, 1);
		}

		// Call user's onCommandComplete if provided
		if (options.onCommandComplete) {
			options.onCommandComplete(result);
		}

		// Call progress callback if provided
		if (options.onProgress) {
			options.onProgress({
				totalCommands: commands.length,
				completedCommands,
				failedCommands,
				activeCommandIds: [...activeCommandIds],
				percentComplete: Math.round(
					(completedCommands / commands.length) * 100,
				),
				elapsedMs: Date.now() - startTime,
			});
		}
	};

	try {
		// Execute commands with concurrency limiting
		const results = await executeWithConcurrencyLimit(commandStates, {
			maxConcurrency,
			defaultCwd,
			maxOutputSize,
			continueOnError,
			abortState,
			onCommandComplete: wrappedOnCommandComplete,
		});

		// Clear totalTimeout
		if (totalTimeoutId) {
			clearTimeout(totalTimeoutId);
		}

		// Calculate summary
		const totalDuration = Date.now() - startTime;
		const timedOutCount = results.filter(
			(r) => !r.success && r.error?.includes("timed out"),
		).length;
		const failedCount = results.filter((r) => !r.success).length;
		const succeededCount = results.filter((r) => r.success).length;

		const summary: ParallelBashSummary = {
			total: results.length,
			succeeded: succeededCount,
			failed: failedCount,
			timedOut: timedOutCount,
		};

		// Overall success is true only if all commands succeeded
		const success = failedCount === 0;

		return createParallelBashResult({
			success,
			totalDuration,
			commands: results,
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
		return createParallelBashResult({
			success: false,
			totalDuration,
			commands: [],
			summary: {
				total: commands.length,
				succeeded: 0,
				failed: commands.length,
				timedOut: 0,
			},
			label: options.label,
		});
	}
}
