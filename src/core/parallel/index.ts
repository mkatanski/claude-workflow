/**
 * Parallel Module - Parallel execution with concurrency control
 *
 * This module provides types and utilities for executing multiple bash commands
 * or Claude sessions in parallel with configurable concurrency, timeout handling,
 * and result aggregation.
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
 *
 * @example
 * ```typescript
 * import { executeParallelClaude, ParallelClaudeConfig } from './core/parallel';
 *
 * const sessions: ParallelClaudeConfig[] = [
 *   { prompt: 'Analyze the authentication code', id: 'auth-review' },
 *   { prompt: 'Review the database queries', id: 'db-review' },
 * ];
 *
 * const result = await executeParallelClaude(sessions, {
 *   maxConcurrency: 3,
 *   continueOnError: true,
 * });
 *
 * console.log(`${result.summary.succeeded}/${result.summary.total} succeeded`);
 * console.log(`Total cost: $${result.summary.estimatedCostUsd.toFixed(4)}`);
 * ```
 */

// =============================================================================
// Bash Parallel Execution
// =============================================================================

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

// =============================================================================
// Claude Parallel Execution
// =============================================================================

// Types from claude.ts
export type {
	ExecuteParallelClaudeOptions,
	ParallelClaudeProgressCallback,
} from "./claude";
// Execution
export { executeParallelClaude } from "./claude";
// Types from claudeTypes.ts
export type {
	ClaudeSessionResult,
	ParallelClaudeConfig,
	ParallelClaudeOptions,
	ParallelClaudeResult,
	ParallelClaudeSummary,
	TokenUsage,
} from "./claudeTypes";
// Factory Functions
// Constants
export {
	aggregateTokenUsage,
	createEmptyTokenUsage,
	createParallelClaudeResult,
	DEFAULT_CLAUDE_CONCURRENCY,
	DEFAULT_SESSION_TIMEOUT,
	MAX_CLAUDE_CONCURRENCY,
	MIN_CLAUDE_CONCURRENCY,
} from "./claudeTypes";
