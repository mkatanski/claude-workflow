/**
 * Immutable array helper functions.
 *
 * These functions return new arrays without modifying the original,
 * making them safe to use with workflow state management.
 */

/**
 * Update an item at a specific index in an array.
 * Returns a new array with the updated item.
 *
 * @param array - The source array
 * @param index - The index to update
 * @param updates - Partial updates to merge with the existing item
 * @returns A new array with the updated item
 *
 * @example
 * ```typescript
 * const stories = [{ id: "1", status: "pending" }, { id: "2", status: "pending" }];
 * const updated = updateAt(stories, 0, { status: "completed" });
 * // [{ id: "1", status: "completed" }, { id: "2", status: "pending" }]
 * ```
 */
export function updateAt<T extends Record<string, unknown>>(
	array: readonly T[],
	index: number,
	updates: Partial<T>,
): T[] {
	if (index < 0 || index >= array.length) {
		return [...array];
	}

	return array.map((item, i) => (i === index ? { ...item, ...updates } : item));
}

/**
 * Remove an item at a specific index from an array.
 * Returns a new array without the item.
 *
 * @param array - The source array
 * @param index - The index to remove
 * @returns A new array without the item at the specified index
 *
 * @example
 * ```typescript
 * const items = ["a", "b", "c"];
 * const result = removeAt(items, 1);
 * // ["a", "c"]
 * ```
 */
export function removeAt<T>(array: readonly T[], index: number): T[] {
	if (index < 0 || index >= array.length) {
		return [...array];
	}

	return [...array.slice(0, index), ...array.slice(index + 1)];
}

/**
 * Insert an item at a specific index in an array.
 * Returns a new array with the item inserted.
 *
 * @param array - The source array
 * @param index - The index to insert at
 * @param item - The item to insert
 * @returns A new array with the item inserted
 *
 * @example
 * ```typescript
 * const items = ["a", "c"];
 * const result = insertAt(items, 1, "b");
 * // ["a", "b", "c"]
 * ```
 */
export function insertAt<T>(array: readonly T[], index: number, item: T): T[] {
	const clampedIndex = Math.max(0, Math.min(index, array.length));
	return [...array.slice(0, clampedIndex), item, ...array.slice(clampedIndex)];
}

/**
 * Find and update the first item matching a predicate.
 * Returns a new array with the updated item.
 *
 * @param array - The source array
 * @param predicate - Function to find the item to update
 * @param updates - Partial updates to merge with the found item
 * @returns A new array with the first matching item updated
 *
 * @example
 * ```typescript
 * const stories = [{ id: "1", status: "pending" }, { id: "2", status: "pending" }];
 * const updated = findAndUpdate(
 *   stories,
 *   s => s.id === "2",
 *   { status: "completed" }
 * );
 * ```
 */
export function findAndUpdate<T extends Record<string, unknown>>(
	array: readonly T[],
	predicate: (item: T, index: number) => boolean,
	updates: Partial<T>,
): T[] {
	const index = array.findIndex(predicate);
	if (index === -1) {
		return [...array];
	}

	return updateAt(array, index, updates);
}

/**
 * Find and update all items matching a predicate.
 * Returns a new array with all matching items updated.
 *
 * @param array - The source array
 * @param predicate - Function to find items to update
 * @param updates - Partial updates to merge with found items
 * @returns A new array with all matching items updated
 */
export function findAndUpdateAll<T extends Record<string, unknown>>(
	array: readonly T[],
	predicate: (item: T, index: number) => boolean,
	updates: Partial<T>,
): T[] {
	return array.map((item, index) =>
		predicate(item, index) ? { ...item, ...updates } : item,
	);
}

/**
 * Replace an item at a specific index.
 * Unlike updateAt, this completely replaces the item instead of merging.
 *
 * @param array - The source array
 * @param index - The index to replace
 * @param newItem - The new item
 * @returns A new array with the replaced item
 */
export function replaceAt<T>(
	array: readonly T[],
	index: number,
	newItem: T,
): T[] {
	if (index < 0 || index >= array.length) {
		return [...array];
	}

	return array.map((item, i) => (i === index ? newItem : item));
}

/**
 * Move an item from one index to another.
 * Returns a new array with the item moved.
 *
 * @param array - The source array
 * @param fromIndex - The current index of the item
 * @param toIndex - The target index
 * @returns A new array with the item moved
 */
export function moveAt<T>(
	array: readonly T[],
	fromIndex: number,
	toIndex: number,
): T[] {
	if (
		fromIndex < 0 ||
		fromIndex >= array.length ||
		toIndex < 0 ||
		toIndex >= array.length
	) {
		return [...array];
	}

	const result = [...array];
	const [item] = result.splice(fromIndex, 1);
	result.splice(toIndex, 0, item);
	return result;
}

/**
 * Append an item to the end of an array.
 * Returns a new array with the item appended.
 */
export function append<T>(array: readonly T[], item: T): T[] {
	return [...array, item];
}

/**
 * Prepend an item to the beginning of an array.
 * Returns a new array with the item prepended.
 */
export function prepend<T>(array: readonly T[], item: T): T[] {
	return [item, ...array];
}
