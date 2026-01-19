/**
 * Parallel Module - Parallel execution with concurrency control
 *
 * This module provides types and utilities for executing multiple bash commands,
 * Claude sessions, or workflows in parallel with configurable concurrency, timeout
 * handling, and result aggregation.
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
 *
 * @example
 * ```typescript
 * import { executeParallelWorkflows, ParallelWorkflowConfig } from './core/parallel';
 *
 * const workflows: ParallelWorkflowConfig[] = [
 *   { name: 'lint', id: 'lint-task', input: { path: './src' } },
 *   { name: 'test', id: 'test-task' },
 *   { name: 'build', id: 'build-task', timeout: 60000 },
 * ];
 *
 * const result = await executeParallelWorkflows(
 *   workflows,
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

// =============================================================================
// Workflow Parallel Execution
// =============================================================================

// Types from workflows.ts
export type {
	ExecuteParallelWorkflowsOptions,
	OnWorkflowStartCallback,
	ParallelWorkflowsProgressCallback,
	WorkflowExecutor,
} from "./workflows";
// Execution
export { executeParallelWorkflows } from "./workflows";
// Types from workflowTypes.ts
export type {
	ParallelWorkflowConfig,
	ParallelWorkflowsOptions,
	ParallelWorkflowsResult,
	ParallelWorkflowsSummary,
	WorkflowResult,
	WorkflowResultMetadata,
} from "./workflowTypes";
// Factory Functions
// Constants
export {
	calculateWorkflowsSummary,
	createParallelWorkflowsResult,
	DEFAULT_WORKFLOW_CONCURRENCY,
	MAX_WORKFLOW_CONCURRENCY,
	MIN_WORKFLOW_CONCURRENCY,
} from "./workflowTypes";
