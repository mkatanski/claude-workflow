/**
 * StateBuilder - Fluent builder for constructing workflow state updates.
 *
 * Provides a chainable API for building partial state updates
 * with immutable array and object operations.
 */

import {
	findAndUpdate,
	findAndUpdateAll,
	insertAt,
	removeAt,
	updateAt,
} from "./arrayHelpers.js";
import { deletePath, getPath, mergePath, setPath } from "./pathHelpers.js";

/**
 * WorkflowStateUpdate type - matches the LangGraph state structure.
 */
export interface WorkflowStateUpdate {
	variables?: Record<string, unknown>;
	error?: string | null;
	completed?: boolean;
}

/**
 * StateBuilder - Fluent builder for constructing workflow state updates.
 *
 * @example
 * ```typescript
 * const update = new StateBuilder()
 *   .set("status", "completed")
 *   .set("timestamp", Date.now())
 *   .updateAt("stories", stories, 0, { status: "done" })
 *   .build();
 *
 * return update; // { variables: { status, timestamp, stories } }
 * ```
 */
export class StateBuilder {
	private variables: Record<string, unknown> = {};
	private _error: string | null = null;
	private _completed: boolean | undefined = undefined;

	/**
	 * Set a variable value.
	 *
	 * @param name - Variable name
	 * @param value - Variable value
	 */
	set(name: string, value: unknown): this {
		this.variables[name] = value;
		return this;
	}

	/**
	 * Set multiple variables at once.
	 *
	 * @param vars - Object of variable name-value pairs
	 */
	setAll(vars: Record<string, unknown>): this {
		Object.assign(this.variables, vars);
		return this;
	}

	/**
	 * Set a nested value using dot-notation path.
	 *
	 * @param path - Dot-notation path (e.g., "config.database.host")
	 * @param value - Value to set
	 *
	 * @example
	 * ```typescript
	 * builder.setPath("config.database.host", "localhost");
	 * ```
	 */
	setPath(path: string, value: unknown): this {
		this.variables = setPath(this.variables, path, value);
		return this;
	}

	/**
	 * Delete a nested value using dot-notation path.
	 *
	 * @param path - Dot-notation path to delete
	 */
	deletePath(path: string): this {
		this.variables = deletePath(this.variables, path);
		return this;
	}

	/**
	 * Merge values into a nested object at a path.
	 *
	 * @param path - Dot-notation path
	 * @param value - Object to merge
	 */
	mergePath(path: string, value: Record<string, unknown>): this {
		this.variables = mergePath(this.variables, path, value);
		return this;
	}

	/**
	 * Update an item at a specific index in an array variable.
	 * Stores the updated array in a variable.
	 *
	 * @param arrayName - Name of the array variable to store the result
	 * @param array - The source array
	 * @param index - Index to update
	 * @param updates - Partial updates to apply
	 *
	 * @example
	 * ```typescript
	 * builder.updateAt("stories", stories, currentIndex, { status: "completed" });
	 * ```
	 */
	updateAt<T extends Record<string, unknown>>(
		arrayName: string,
		array: readonly T[],
		index: number,
		updates: Partial<T>,
	): this {
		this.variables[arrayName] = updateAt(array, index, updates);
		return this;
	}

	/**
	 * Remove an item at a specific index from an array variable.
	 * Stores the updated array in a variable.
	 *
	 * @param arrayName - Name of the array variable to store the result
	 * @param array - The source array
	 * @param index - Index to remove
	 */
	removeAt<T>(arrayName: string, array: readonly T[], index: number): this {
		this.variables[arrayName] = removeAt(array, index);
		return this;
	}

	/**
	 * Insert an item at a specific index in an array variable.
	 * Stores the updated array in a variable.
	 *
	 * @param arrayName - Name of the array variable to store the result
	 * @param array - The source array
	 * @param index - Index to insert at
	 * @param item - Item to insert
	 */
	insertAt<T>(
		arrayName: string,
		array: readonly T[],
		index: number,
		item: T,
	): this {
		this.variables[arrayName] = insertAt(array, index, item);
		return this;
	}

	/**
	 * Find and update the first matching item in an array variable.
	 * Stores the updated array in a variable.
	 *
	 * @param arrayName - Name of the array variable to store the result
	 * @param array - The source array
	 * @param predicate - Function to find the item
	 * @param updates - Partial updates to apply
	 */
	findAndUpdate<T extends Record<string, unknown>>(
		arrayName: string,
		array: readonly T[],
		predicate: (item: T, index: number) => boolean,
		updates: Partial<T>,
	): this {
		this.variables[arrayName] = findAndUpdate(array, predicate, updates);
		return this;
	}

	/**
	 * Find and update all matching items in an array variable.
	 * Stores the updated array in a variable.
	 *
	 * @param arrayName - Name of the array variable to store the result
	 * @param array - The source array
	 * @param predicate - Function to find items
	 * @param updates - Partial updates to apply
	 */
	findAndUpdateAll<T extends Record<string, unknown>>(
		arrayName: string,
		array: readonly T[],
		predicate: (item: T, index: number) => boolean,
		updates: Partial<T>,
	): this {
		this.variables[arrayName] = findAndUpdateAll(array, predicate, updates);
		return this;
	}

	/**
	 * Set an error on the state update.
	 * This will cause the node to be marked as failed.
	 *
	 * @param error - Error message
	 */
	error(error: string): this {
		this._error = error;
		return this;
	}

	/**
	 * Clear any error on the state update.
	 */
	clearError(): this {
		this._error = null;
		return this;
	}

	/**
	 * Mark the workflow as completed.
	 *
	 * @param completed - Whether the workflow is complete
	 */
	complete(completed = true): this {
		this._completed = completed;
		return this;
	}

	/**
	 * Conditionally apply operations based on a predicate.
	 *
	 * @param condition - Condition to check
	 * @param fn - Function to apply if condition is true
	 *
	 * @example
	 * ```typescript
	 * builder.when(hasError, b => b.error("Something went wrong"));
	 * ```
	 */
	when(condition: boolean, fn: (builder: this) => this): this {
		if (condition) {
			return fn(this);
		}
		return this;
	}

	/**
	 * Build the final state update object.
	 *
	 * @returns WorkflowStateUpdate object ready to return from a node
	 */
	build(): WorkflowStateUpdate {
		const result: WorkflowStateUpdate = {};

		if (Object.keys(this.variables).length > 0) {
			result.variables = this.variables;
		}

		if (this._error !== null) {
			result.error = this._error;
		}

		if (this._completed !== undefined) {
			result.completed = this._completed;
		}

		return result;
	}
}

/**
 * Create a new StateBuilder instance.
 * Convenience function for fluent usage.
 *
 * @example
 * ```typescript
 * return state()
 *   .set("result", data)
 *   .build();
 * ```
 */
export function state(): StateBuilder {
	return new StateBuilder();
}

/**
 * Create a state update with an error.
 * Convenience function for error returns.
 *
 * @param message - Error message
 *
 * @example
 * ```typescript
 * if (!result.success) {
 *   return stateError(`Operation failed: ${result.error}`);
 * }
 * ```
 */
export function stateError(message: string): WorkflowStateUpdate {
	return { error: message };
}

/**
 * Create a state update with variables.
 * Convenience function for simple variable returns.
 *
 * @param vars - Variables to set
 *
 * @example
 * ```typescript
 * return stateVars({ result: data, status: "complete" });
 * ```
 */
export function stateVars(vars: Record<string, unknown>): WorkflowStateUpdate {
	return { variables: vars };
}

// Re-export path helpers for direct use
export { getPath };
