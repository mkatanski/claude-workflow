/**
 * Sub-workflow executor for workflow composition.
 *
 * This module provides the SubWorkflowExecutor class that handles executing
 * sub-workflows with:
 * - Complete state isolation from the parent workflow
 * - Timeout support with distinguishable timeout errors
 * - Input/output validation against Zod schemas
 * - Event emission for workflow call lifecycle
 * - Integration with call stack for circular detection
 *
 * @example
 * ```typescript
 * import { SubWorkflowExecutor, createExecutorContext } from "./executor.js";
 *
 * // Create an executor
 * const executor = new SubWorkflowExecutor({
 *   projectPath: "/path/to/project",
 *   tempDir: "/tmp/workflow",
 *   emitter: workflowEmitter,
 * });
 *
 * // Execute a sub-workflow
 * const result = await executor.execute(
 *   workflowDefinition,
 *   { input: { path: "./src" }, timeout: 30000 },
 *   executorContext,
 * );
 *
 * if (result.success) {
 *   console.log("Sub-workflow completed:", result.output);
 * } else {
 *   console.error("Sub-workflow failed:", result.error?.message);
 * }
 * ```
 */

import type { z } from "zod";
import type { ClaudeConfig, ClaudeSdkConfig } from "../../types/index.js";
import {
	createEventHelpers,
	createTimer,
	type EventHelpers,
	type WorkflowEmitter,
} from "../events/index.js";
import type { LangGraphWorkflowDefinition } from "../graph/types.js";
import { WorkflowGraph } from "../graph/workflowGraph.js";
import {
	checkCircular,
	createCallStackEntry,
	createCircularCallError,
	createMaxDepthError,
	getCallDepth,
	pushCall,
} from "./circular.js";
import type {
	CallStack,
	SubWorkflowContext,
	WorkflowCallError,
	WorkflowCallMetadata,
	WorkflowCallOptions,
	WorkflowCallResult,
	WorkflowSource,
} from "./types.js";
import {
	createInputValidationError,
	createOutputValidationError,
	isZodSchema,
	validateInput,
	validateOutput,
} from "./validation.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for creating a SubWorkflowExecutor.
 */
export interface SubWorkflowExecutorConfig {
	/** Project root path */
	projectPath: string;
	/** Temporary directory for workflow files */
	tempDir: string;
	/** Claude Code configuration */
	claudeConfig?: ClaudeConfig;
	/** Claude SDK configuration */
	claudeSdkConfig?: ClaudeSdkConfig;
	/** Optional event emitter for workflow observability */
	emitter?: WorkflowEmitter;
}

/**
 * Context for executing a sub-workflow.
 *
 * Provides all the information needed to execute a sub-workflow
 * with proper isolation and context propagation.
 */
export interface ExecutorContext {
	/** Parent workflow name */
	parentWorkflow: string;
	/** Parent node name that initiated the call */
	parentNode: string;
	/** Current call stack for circular detection */
	callStack: CallStack;
	/** Optional override for working directory */
	cwd?: string;
}

// ============================================================================
// SubWorkflowExecutor Class
// ============================================================================

/**
 * Executor for sub-workflows in workflow composition.
 *
 * Handles the execution of child workflows with complete state isolation,
 * timeout support, input/output validation, and event emission.
 *
 * Key responsibilities:
 * - Create isolated execution environment for sub-workflows
 * - Enforce timeout limits
 * - Validate input/output against Zod schemas
 * - Emit workflow call lifecycle events
 * - Integrate with call stack for circular detection
 */
export class SubWorkflowExecutor {
	private readonly config: SubWorkflowExecutorConfig;
	private readonly events: EventHelpers | null;

	/**
	 * Create a new SubWorkflowExecutor.
	 *
	 * @param config - Configuration for the executor
	 */
	constructor(config: SubWorkflowExecutorConfig) {
		this.config = config;
		this.events = config.emitter ? createEventHelpers(config.emitter) : null;
	}

	/**
	 * Execute a sub-workflow with the given options.
	 *
	 * This method:
	 * 1. Checks for circular calls
	 * 2. Validates input against the workflow's input schema
	 * 3. Creates an isolated execution environment
	 * 4. Executes the workflow with timeout support
	 * 5. Validates output against the workflow's output schema
	 * 6. Emits appropriate lifecycle events
	 *
	 * @param definition - The workflow definition to execute
	 * @param options - Options for the workflow call
	 * @param context - Execution context including call stack
	 * @returns Result of the workflow execution
	 */
	async execute<TInput = unknown, TOutput = unknown>(
		definition: LangGraphWorkflowDefinition,
		options: WorkflowCallOptions<TInput>,
		context: ExecutorContext,
	): Promise<WorkflowCallResult<TOutput>> {
		const timer = createTimer();
		const workflowName = definition.name;
		const workflowVersion = definition.version ?? "0.0.0";
		const depth = getCallDepth(context.callStack) + 1;

		// Build metadata for the result
		const metadata: WorkflowCallMetadata = {
			name: workflowName,
			version: workflowVersion,
			source: "project" as WorkflowSource, // TODO: Support other sources when registry is implemented
		};

		// Helper to create error result
		const createErrorResult = (
			error: WorkflowCallError,
		): WorkflowCallResult<TOutput> => {
			return {
				success: false,
				error,
				duration: timer.elapsed(),
				metadata,
			};
		};

		// Emit start event
		this.events?.workflowCallStart({
			calledWorkflowName: workflowName,
			callerWorkflowName: context.parentWorkflow,
			callerNodeName: context.parentNode,
			inputVariables: (options.input ?? {}) as Record<string, unknown>,
			depth,
		});

		try {
			// Step 1: Check for circular calls
			const circularCheck = checkCircular(
				context.callStack,
				workflowName,
				workflowVersion,
			);

			if (circularCheck.isCircular) {
				const error = createCircularCallError(
					context.callStack,
					workflowName,
					workflowVersion,
				);
				this.emitError(
					workflowName,
					context.parentWorkflow,
					context.parentNode,
					error.message,
					depth,
				);
				return createErrorResult(error);
			}

			// Step 2: Check max depth
			if (circularCheck.exceedsMaxDepth) {
				const error = createMaxDepthError(context.callStack, workflowName);
				this.emitError(
					workflowName,
					context.parentWorkflow,
					context.parentNode,
					error.message,
					depth,
				);
				return createErrorResult(error);
			}

			// Step 3: Validate input if schema is defined
			if (definition.input && isZodSchema(definition.input)) {
				const inputValidation = validateInput(
					options.input,
					definition.input as z.ZodTypeAny,
				);

				if (inputValidation.isErr()) {
					const error = createInputValidationError(inputValidation.unwrapErr());
					this.emitError(
						workflowName,
						context.parentWorkflow,
						context.parentNode,
						error.message,
						depth,
					);
					return createErrorResult(error);
				}
			}

			// Step 4: Update call stack for the sub-workflow
			const updatedCallStack = pushCall(
				context.callStack,
				createCallStackEntry(workflowName, workflowVersion, context.parentNode),
			);

			// Step 5: Create isolated execution environment
			const subWorkflowContext: SubWorkflowContext = {
				parentWorkflow: context.parentWorkflow,
				parentNode: context.parentNode,
				projectPath: this.config.projectPath,
				cwd: options.cwd ?? context.cwd ?? this.config.projectPath,
				callStack: updatedCallStack,
				correlationId: crypto.randomUUID(),
			};

			// Step 6: Execute the workflow with timeout support
			const executionResult = await this.executeWithTimeout<TOutput>(
				definition,
				options,
				subWorkflowContext,
			);

			if (!executionResult.success) {
				const error: WorkflowCallError = executionResult.error ?? {
					code: "EXECUTION_FAILED",
					message: executionResult.errorMessage ?? "Unknown execution error",
					stack: executionResult.errorStack,
				};

				this.emitError(
					workflowName,
					context.parentWorkflow,
					context.parentNode,
					error.message,
					depth,
					error.stack,
				);
				return createErrorResult(error);
			}

			// Step 7: Validate output if schema is defined
			if (definition.output && isZodSchema(definition.output)) {
				const outputValidation = validateOutput(
					executionResult.output,
					definition.output as z.ZodTypeAny,
				);

				if (outputValidation.isErr()) {
					const error = createOutputValidationError(
						outputValidation.unwrapErr(),
					);
					this.emitError(
						workflowName,
						context.parentWorkflow,
						context.parentNode,
						error.message,
						depth,
					);
					return createErrorResult(error);
				}
			}

			// Step 8: Emit success event
			this.events?.workflowCallComplete({
				calledWorkflowName: workflowName,
				callerWorkflowName: context.parentWorkflow,
				callerNodeName: context.parentNode,
				outputVariables: (executionResult.output ?? {}) as Record<
					string,
					unknown
				>,
				duration: timer.elapsed(),
				success: true,
				depth,
			});

			return {
				success: true,
				output: executionResult.output as TOutput,
				duration: timer.elapsed(),
				metadata,
			};
		} catch (error) {
			// Handle unexpected errors
			const message = error instanceof Error ? error.message : String(error);
			const stack = error instanceof Error ? error.stack : undefined;

			const callError: WorkflowCallError = {
				code: "EXECUTION_FAILED",
				message,
				stack,
			};

			this.emitError(
				workflowName,
				context.parentWorkflow,
				context.parentNode,
				message,
				depth,
				stack,
			);

			return createErrorResult(callError);
		}
	}

	/**
	 * Execute a workflow with timeout support.
	 *
	 * @param definition - The workflow definition to execute
	 * @param options - Options for the workflow call
	 * @param subContext - Sub-workflow execution context
	 * @returns Internal execution result
	 */
	private async executeWithTimeout<TOutput>(
		definition: LangGraphWorkflowDefinition,
		options: WorkflowCallOptions<unknown>,
		subContext: SubWorkflowContext,
	): Promise<{
		success: boolean;
		output?: TOutput;
		error?: WorkflowCallError;
		errorMessage?: string;
		errorStack?: string;
	}> {
		const timeout = options.timeout;

		// Create execution promise
		const executionPromise = this.executeGraph<TOutput>(
			definition,
			options.input,
			subContext,
		);

		// If no timeout, just run the execution
		if (!timeout || timeout <= 0) {
			return executionPromise;
		}

		// Create timeout promise
		const timeoutPromise = new Promise<{
			success: false;
			error: WorkflowCallError;
		}>((resolve) => {
			setTimeout(() => {
				resolve({
					success: false,
					error: {
						code: "TIMEOUT",
						message: `Workflow execution timed out after ${timeout}ms`,
					},
				});
			}, timeout);
		});

		// Race between execution and timeout
		return Promise.race([executionPromise, timeoutPromise]);
	}

	/**
	 * Execute the workflow graph with isolated state.
	 *
	 * @param definition - The workflow definition to execute
	 * @param input - Input data for the workflow
	 * @param subContext - Sub-workflow execution context
	 * @returns Internal execution result
	 */
	private async executeGraph<TOutput>(
		definition: LangGraphWorkflowDefinition,
		input: unknown,
		subContext: SubWorkflowContext,
	): Promise<{
		success: boolean;
		output?: TOutput;
		error?: WorkflowCallError;
		errorMessage?: string;
		errorStack?: string;
	}> {
		// Create a new WorkflowGraph with isolated configuration
		const graph = new WorkflowGraph({
			projectPath: subContext.cwd,
			tempDir: this.config.tempDir,
			claudeConfig: this.config.claudeConfig,
			claudeSdkConfig: this.config.claudeSdkConfig,
			emitter: this.config.emitter,
			workflowName: definition.name,
		});

		try {
			// Build the workflow graph
			definition.build(graph);

			// Prepare initial variables - completely isolated from parent
			const initialVars: Record<string, unknown> = {
				// Include input if provided
				...(input !== undefined
					? { _input: input, ...((input as Record<string, unknown>) ?? {}) }
					: {}),
				// Include any default variables from the workflow definition
				...(definition.vars ?? {}),
				// Add context metadata
				_parentWorkflow: subContext.parentWorkflow,
				_parentNode: subContext.parentNode,
				_correlationId: subContext.correlationId,
			};

			// Run the workflow with isolated state
			const result = await graph.run(initialVars);

			// Check for errors
			if (result.error) {
				return {
					success: false,
					errorMessage: result.error,
				};
			}

			// Extract output from the result
			// The output can be:
			// 1. Explicitly set via _output variable
			// 2. All variables (if no explicit output)
			const output =
				result.variables._output !== undefined
					? result.variables._output
					: this.extractOutput(result.variables);

			return {
				success: true,
				output: output as TOutput,
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			const stack = error instanceof Error ? error.stack : undefined;

			return {
				success: false,
				errorMessage: message,
				errorStack: stack,
			};
		} finally {
			// Clean up graph resources
			await graph.cleanup();
		}
	}

	/**
	 * Extract output from workflow result variables.
	 *
	 * Filters out internal variables (prefixed with _) and returns
	 * the remaining variables as the workflow output.
	 *
	 * @param variables - All workflow variables
	 * @returns Filtered output variables
	 */
	private extractOutput(
		variables: Record<string, unknown>,
	): Record<string, unknown> {
		const output: Record<string, unknown> = {};

		for (const [key, value] of Object.entries(variables)) {
			// Skip internal variables
			if (key.startsWith("_")) {
				continue;
			}
			output[key] = value;
		}

		return output;
	}

	/**
	 * Emit a workflow call error event.
	 */
	private emitError(
		calledWorkflowName: string,
		callerWorkflowName: string,
		callerNodeName: string,
		error: string,
		depth: number,
		stack?: string,
	): void {
		this.events?.workflowCallError({
			calledWorkflowName,
			callerWorkflowName,
			callerNodeName,
			error,
			stack,
			depth,
		});
	}
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a SubWorkflowExecutor with the given configuration.
 *
 * @param config - Configuration for the executor
 * @returns A new SubWorkflowExecutor instance
 *
 * @example
 * ```typescript
 * const executor = createSubWorkflowExecutor({
 *   projectPath: "/path/to/project",
 *   tempDir: "/tmp/workflow",
 *   emitter: workflowEmitter,
 * });
 * ```
 */
export function createSubWorkflowExecutor(
	config: SubWorkflowExecutorConfig,
): SubWorkflowExecutor {
	return new SubWorkflowExecutor(config);
}

/**
 * Create an ExecutorContext for sub-workflow execution.
 *
 * @param parentWorkflow - Name of the parent workflow
 * @param parentNode - Name of the node initiating the call
 * @param callStack - Current call stack
 * @param cwd - Optional working directory override
 * @returns ExecutorContext for sub-workflow execution
 *
 * @example
 * ```typescript
 * const context = createExecutorContext(
 *   "parent-workflow",
 *   "analyze-node",
 *   callStack,
 * );
 * ```
 */
export function createExecutorContext(
	parentWorkflow: string,
	parentNode: string,
	callStack: CallStack,
	cwd?: string,
): ExecutorContext {
	return {
		parentWorkflow,
		parentNode,
		callStack,
		cwd,
	};
}

// ============================================================================
// Timeout Utilities
// ============================================================================

/**
 * Default timeout for sub-workflow execution (5 minutes).
 */
export const DEFAULT_EXECUTION_TIMEOUT = 5 * 60 * 1000;

/**
 * Create a timeout error.
 *
 * @param timeout - The timeout value in milliseconds
 * @returns WorkflowCallError for timeout
 */
export function createTimeoutError(timeout: number): WorkflowCallError {
	return {
		code: "TIMEOUT",
		message: `Workflow execution timed out after ${timeout}ms`,
	};
}

/**
 * Create an execution failed error.
 *
 * @param message - Error message
 * @param stack - Optional stack trace
 * @returns WorkflowCallError for execution failure
 */
export function createExecutionError(
	message: string,
	stack?: string,
): WorkflowCallError {
	return {
		code: "EXECUTION_FAILED",
		message,
		stack,
	};
}
