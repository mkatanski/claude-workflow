/**
 * Error context for capturing workflow metadata.
 *
 * Provides structured context information for errors that occur during
 * workflow execution, enabling better debugging and error tracking.
 */

// ============================================================================
// Error Context Types
// ============================================================================

/**
 * Contextual information about where an error occurred in the workflow.
 * Similar to EventContext but focused on error scenarios.
 */
export interface ErrorContext {
	/** Name of the workflow where the error occurred */
	workflowName?: string;
	/** Name of the node being executed when the error occurred */
	nodeName?: string;
	/** Name of the tool that failed */
	toolName?: string;
	/** Step or phase within a node where the error occurred */
	step?: string;
	/** ID of the UI pane/component if applicable */
	paneId?: string;
	/** Operation being performed when the error occurred */
	operation?: string;
	/** Additional custom metadata */
	metadata?: Record<string, unknown>;
}

/**
 * Extended error context with correlation information for tracking
 * errors across the workflow execution lifecycle.
 */
export interface ErrorContextWithCorrelation extends ErrorContext {
	/** Unique identifier for this error instance */
	errorId: string;
	/** ISO timestamp when the error occurred */
	timestamp: string;
	/** ID linking related errors across a workflow execution */
	correlationId?: string;
	/** ID of parent error for hierarchical error tracking */
	parentErrorId?: string;
}

// ============================================================================
// Error Context Builders
// ============================================================================

/**
 * Create a basic error context for a workflow.
 *
 * @param workflowName - Name of the workflow
 * @param additionalContext - Additional context properties
 * @returns Error context object
 */
export function createWorkflowErrorContext(
	workflowName: string,
	additionalContext?: Partial<ErrorContext>,
): ErrorContext {
	return {
		workflowName,
		...additionalContext,
	};
}

/**
 * Create an error context for a node execution.
 *
 * @param workflowName - Name of the workflow
 * @param nodeName - Name of the node
 * @param additionalContext - Additional context properties
 * @returns Error context object
 */
export function createNodeErrorContext(
	workflowName: string,
	nodeName: string,
	additionalContext?: Partial<ErrorContext>,
): ErrorContext {
	return {
		workflowName,
		nodeName,
		...additionalContext,
	};
}

/**
 * Create an error context for a tool execution.
 *
 * @param workflowName - Name of the workflow
 * @param nodeName - Name of the node
 * @param toolName - Name of the tool
 * @param additionalContext - Additional context properties
 * @returns Error context object
 */
export function createToolErrorContext(
	workflowName: string,
	nodeName: string,
	toolName: string,
	additionalContext?: Partial<ErrorContext>,
): ErrorContext {
	return {
		workflowName,
		nodeName,
		toolName,
		...additionalContext,
	};
}

/**
 * Add correlation information to an error context.
 *
 * @param context - Base error context
 * @param errorId - Unique error identifier
 * @param correlationId - Optional correlation ID for linking related errors
 * @param parentErrorId - Optional parent error ID for hierarchical tracking
 * @returns Error context with correlation information
 */
export function enrichErrorContext(
	context: ErrorContext,
	errorId: string,
	correlationId?: string,
	parentErrorId?: string,
): ErrorContextWithCorrelation {
	return {
		...context,
		errorId,
		timestamp: new Date().toISOString(),
		correlationId,
		parentErrorId,
	};
}

/**
 * Merge multiple error contexts, with later contexts overriding earlier ones.
 *
 * @param contexts - Error contexts to merge
 * @returns Merged error context
 */
export function mergeErrorContexts(...contexts: ErrorContext[]): ErrorContext {
	return contexts.reduce((merged, context) => {
		return {
			...merged,
			...context,
			// Merge metadata objects if both exist
			metadata:
				merged.metadata || context.metadata
					? {
							...merged.metadata,
							...context.metadata,
						}
					: undefined,
		};
	}, {} as ErrorContext);
}

/**
 * Convert an error context to a plain object suitable for logging.
 *
 * @param context - Error context to serialize
 * @returns Plain object representation
 */
export function serializeErrorContext(
	context: ErrorContext | ErrorContextWithCorrelation,
): Record<string, unknown> {
	return {
		...context,
		// Ensure metadata is serializable
		metadata: context.metadata ? { ...context.metadata } : undefined,
	};
}

/**
 * Extract relevant context from an error context for display purposes.
 * Removes undefined/null values and formats for readability.
 *
 * @param context - Error context
 * @returns Filtered context with only defined values
 */
export function formatErrorContext(
	context: ErrorContext | ErrorContextWithCorrelation,
): Record<string, unknown> {
	const formatted: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(context)) {
		if (value !== undefined && value !== null) {
			formatted[key] = value;
		}
	}

	return formatted;
}
