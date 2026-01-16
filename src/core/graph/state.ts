/**
 * LangGraph state definition for workflows.
 *
 * Defines the WorkflowState annotation using LangGraph's Annotation API
 * with a merge reducer for partial variable updates.
 */

import { Annotation } from "@langchain/langgraph";

/**
 * Deep merge two objects, with source values overwriting target.
 */
function deepMerge(
	target: Record<string, unknown>,
	source: Record<string, unknown>,
): Record<string, unknown> {
	const result = { ...target };

	for (const key of Object.keys(source)) {
		const sourceValue = source[key];
		const targetValue = target[key];

		if (
			sourceValue !== null &&
			typeof sourceValue === "object" &&
			!Array.isArray(sourceValue) &&
			targetValue !== null &&
			typeof targetValue === "object" &&
			!Array.isArray(targetValue)
		) {
			result[key] = deepMerge(
				targetValue as Record<string, unknown>,
				sourceValue as Record<string, unknown>,
			);
		} else {
			result[key] = sourceValue;
		}
	}

	return result;
}

/**
 * WorkflowState annotation for LangGraph StateGraph.
 *
 * State channels:
 * - variables: Workflow variables with merge reducer for partial updates
 * - error: Last error message (null if no error)
 * - completed: Whether the workflow has completed
 */
export const WorkflowState = Annotation.Root({
	/**
	 * Workflow variables - uses merge reducer so nodes can return
	 * partial updates like { variables: { newKey: val } } which
	 * will be merged with existing variables.
	 */
	variables: Annotation<Record<string, unknown>>({
		reducer: (current, update) => deepMerge(current, update),
		default: () => ({}),
	}),

	/**
	 * Last error message, or null if no error.
	 */
	error: Annotation<string | null>({
		reducer: (_current, update) => update,
		default: () => null,
	}),

	/**
	 * Whether the workflow has completed.
	 */
	completed: Annotation<boolean>({
		reducer: (_current, update) => update,
		default: () => false,
	}),
});

/**
 * Type alias for the workflow state.
 */
export type WorkflowStateType = typeof WorkflowState.State;

/**
 * Type alias for partial state updates returned by nodes.
 */
export type WorkflowStateUpdate = Partial<WorkflowStateType>;
