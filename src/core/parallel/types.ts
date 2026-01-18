/**
 * Parallel bash execution types and interfaces.
 *
 * Provides type definitions for parallel command execution with concurrency
 * control, timeout handling, and result aggregation.
 */

// =============================================================================
// Command Configuration
// =============================================================================

/**
 * Configuration for a single command in parallel execution.
 */
export interface ParallelBashConfig {
	/** The shell command to execute */
	readonly command: string;
	/** Unique identifier for this command (auto-generated if not provided) */
	readonly id?: string;
	/** Working directory for command execution */
	readonly cwd?: string;
	/** Environment variables to set */
	readonly env?: Record<string, string>;
	/** Timeout in milliseconds for this command (default: 120000ms / 2 minutes) */
	readonly timeout?: number;
	/** Human-readable label for event display */
	readonly label?: string;
}

// =============================================================================
// Options
// =============================================================================

/**
 * Options for parallel bash execution.
 */
export interface ParallelBashOptions {
	/** Maximum number of commands to execute concurrently (default: 5, range: 1-10) */
	readonly maxConcurrency?: number;
	/** Whether to continue executing remaining commands when one fails (default: true) */
	readonly continueOnError?: boolean;
	/** Total timeout in milliseconds for all commands (default: none) */
	readonly totalTimeout?: number;
	/** Maximum output size in bytes before truncation (default: 1MB / 1048576 bytes) */
	readonly maxOutputSize?: number;
	/** Human-readable label for event display */
	readonly label?: string;
}

// =============================================================================
// Results
// =============================================================================

/**
 * Result of a single command execution.
 */
export interface BashCommandResult {
	/** Unique identifier for this command */
	readonly id: string;
	/** The command that was executed */
	readonly command: string;
	/** Whether the command succeeded (exit code 0) */
	readonly success: boolean;
	/** Exit code of the command (null if killed/timed out) */
	readonly exitCode: number | null;
	/** Standard output from the command */
	readonly stdout: string;
	/** Standard error from the command */
	readonly stderr: string;
	/** Whether the output was truncated due to size limits */
	readonly truncated: boolean;
	/** Execution duration in milliseconds (excluding queue wait time) */
	readonly duration: number;
	/** Time spent waiting in queue before execution started in milliseconds */
	readonly queueWaitTime: number;
	/** Working directory the command ran in */
	readonly cwd: string;
	/** Human-readable label for event display */
	readonly label?: string;
	/** Error message if command failed (timeout, killed, etc.) */
	readonly error?: string;
}

/**
 * Summary statistics for parallel execution.
 */
export interface ParallelBashSummary {
	/** Total number of commands executed */
	readonly total: number;
	/** Number of commands that succeeded */
	readonly succeeded: number;
	/** Number of commands that failed */
	readonly failed: number;
	/** Number of commands that timed out */
	readonly timedOut: number;
}

/**
 * Result of parallel bash execution with helper methods.
 */
export interface ParallelBashResult {
	/** Whether all commands succeeded */
	readonly success: boolean;
	/** Total duration of the parallel execution in milliseconds */
	readonly totalDuration: number;
	/** Array of individual command results */
	readonly commands: readonly BashCommandResult[];
	/** Summary statistics */
	readonly summary: ParallelBashSummary;
	/** Human-readable label for event display */
	readonly label?: string;

	/**
	 * Get a command result by its ID.
	 *
	 * @param id - The command ID to look up
	 * @returns The command result, or undefined if not found
	 */
	getCommand(id: string): BashCommandResult | undefined;

	/**
	 * Get the stdout of all successful commands.
	 *
	 * @returns Array of stdout strings from successful commands
	 */
	getSuccessfulOutputs(): string[];

	/**
	 * Get all failed command results.
	 *
	 * @returns Array of failed command results
	 */
	getErrors(): BashCommandResult[];
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a ParallelBashResult with helper methods.
 *
 * @param data - The result data without helper methods
 * @returns A complete ParallelBashResult with helper methods
 */
export function createParallelBashResult(data: {
	success: boolean;
	totalDuration: number;
	commands: BashCommandResult[];
	summary: ParallelBashSummary;
	label?: string;
}): ParallelBashResult {
	const { success, totalDuration, commands, summary, label } = data;

	return {
		success,
		totalDuration,
		commands,
		summary,
		label,

		getCommand(id: string): BashCommandResult | undefined {
			return commands.find((cmd) => cmd.id === id);
		},

		getSuccessfulOutputs(): string[] {
			return commands.filter((cmd) => cmd.success).map((cmd) => cmd.stdout);
		},

		getErrors(): BashCommandResult[] {
			return commands.filter((cmd) => !cmd.success);
		},
	};
}

// =============================================================================
// Default Values
// =============================================================================

/** Default maximum concurrency */
export const DEFAULT_MAX_CONCURRENCY = 5;

/** Minimum allowed concurrency */
export const MIN_CONCURRENCY = 1;

/** Maximum allowed concurrency */
export const MAX_CONCURRENCY = 10;

/** Default timeout per command in milliseconds (2 minutes) */
export const DEFAULT_COMMAND_TIMEOUT = 120_000;

/** Default maximum output size in bytes (1MB) */
export const DEFAULT_MAX_OUTPUT_SIZE = 1_048_576;
