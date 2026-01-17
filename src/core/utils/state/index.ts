/**
 * State management utilities for workflow nodes.
 *
 * Provides immutable state update helpers and a fluent builder
 * for constructing WorkflowStateUpdate objects.
 *
 * @example
 * ```typescript
 * import { state, stateError, stateVars, updateAt } from "@/core/utils/state";
 *
 * // Fluent builder
 * return state()
 *   .set("status", "completed")
 *   .updateAt("stories", stories, index, { done: true })
 *   .build();
 *
 * // Quick error return
 * return stateError("Something went wrong");
 *
 * // Quick variables return
 * return stateVars({ result: data });
 *
 * // Direct array helpers
 * const updatedStories = updateAt(stories, 0, { status: "done" });
 * ```
 *
 * @module
 */

export {
	append,
	findAndUpdate,
	findAndUpdateAll,
	insertAt,
	moveAt,
	prepend,
	removeAt,
	replaceAt,
	updateAt,
} from "./arrayHelpers.js";
export {
	deletePath,
	hasPath,
	mergePath,
	parsePath,
	setPath,
} from "./pathHelpers.js";
export {
	getPath,
	StateBuilder,
	state,
	stateError,
	stateVars,
	type WorkflowStateUpdate,
} from "./stateBuilder.js";
