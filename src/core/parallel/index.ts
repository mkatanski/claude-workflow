/**
 * Parallel Module - Parallel bash command execution with concurrency control
 *
 * This module provides types and utilities for executing multiple bash commands
 * in parallel with configurable concurrency, timeout handling, and result aggregation.
 *
 * @example
 * ```typescript
 * import { executeParallelBash, ParallelBashConfig } from './core/parallel';
 *
 * const commands: ParallelBashConfig[] = [
 *   { command: 'echo "hello"', id: 'cmd1' },
 *   { command: 'echo "world"', id: 'cmd2' },
 * ];
 *
 * const result = await executeParallelBash(commands, {
 *   maxConcurrency: 2,
 *   continueOnError: true,
 * });
 *
 * console.log(`${result.summary.succeeded}/${result.summary.total} succeeded`);
 * ```
 */

export type {
	ExecuteParallelBashOptions,
	ParallelBashProgressCallback,
} from "./bash";
// Execution
export { executeParallelBash } from "./bash";
// Types
export type {
	BashCommandResult,
	ParallelBashConfig,
	ParallelBashOptions,
	ParallelBashResult,
	ParallelBashSummary,
} from "./types";
// Factory Functions
// Constants
export {
	createParallelBashResult,
	DEFAULT_COMMAND_TIMEOUT,
	DEFAULT_MAX_CONCURRENCY,
	DEFAULT_MAX_OUTPUT_SIZE,
	MAX_CONCURRENCY,
	MIN_CONCURRENCY,
} from "./types";
