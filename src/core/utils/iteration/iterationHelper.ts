/**
 * IterationHelper - Stateful iterator for workflow array processing.
 *
 * Provides a clean API for iterating through arrays with state tracking,
 * commonly used for processing stories, milestones, or other ordered items.
 */

import type { WorkflowTools } from "../../graph/tools.js";

/**
 * IterationHelper - Stateful iterator for workflow array processing.
 *
 * Tracks current position in an array and syncs with workflow state.
 * Useful for story loops, milestone processing, and other ordered iterations.
 *
 * @example
 * ```typescript
 * const stories = tools.getVar<Story[]>("stories") ?? [];
 * const iterator = new IterationHelper(stories, "currentStoryIndex", tools);
 *
 * while (iterator.hasMore()) {
 *   const story = iterator.current();
 *   // Process story...
 *   iterator.next();
 * }
 * ```
 */
export class IterationHelper<T> {
	private readonly items: readonly T[];
	private readonly stateKey: string;
	private readonly tools: WorkflowTools;
	private index: number;

	constructor(items: readonly T[], stateKey: string, tools: WorkflowTools) {
		this.items = items;
		this.stateKey = stateKey;
		this.tools = tools;
		// Initialize from state or default to 0
		this.index = tools.getVar<number>(stateKey) ?? 0;
	}

	/**
	 * Check if there are more items to process.
	 */
	hasMore(): boolean {
		return this.index < this.items.length;
	}

	/**
	 * Check if the iterator has started (index > 0).
	 */
	hasStarted(): boolean {
		return this.index > 0;
	}

	/**
	 * Check if iteration is complete (no more items).
	 */
	isComplete(): boolean {
		return this.index >= this.items.length;
	}

	/**
	 * Get the current item, or undefined if past the end.
	 */
	current(): T | undefined {
		return this.items[this.index];
	}

	/**
	 * Get the current index (0-based).
	 */
	currentIndex(): number {
		return this.index;
	}

	/**
	 * Get the current position (1-based, for display).
	 */
	currentPosition(): number {
		return this.index + 1;
	}

	/**
	 * Get the total number of items.
	 */
	total(): number {
		return this.items.length;
	}

	/**
	 * Get remaining items count.
	 */
	remaining(): number {
		return Math.max(0, this.items.length - this.index);
	}

	/**
	 * Get progress as a fraction (0-1).
	 */
	progress(): number {
		if (this.items.length === 0) {
			return 1;
		}
		return this.index / this.items.length;
	}

	/**
	 * Get progress as a percentage (0-100).
	 */
	progressPercent(): number {
		return Math.round(this.progress() * 100);
	}

	/**
	 * Advance to the next item and update state.
	 * Returns the next item, or undefined if at end.
	 */
	next(): T | undefined {
		if (this.index < this.items.length) {
			this.index++;
			this.tools.setVar(this.stateKey, this.index);
		}
		return this.current();
	}

	/**
	 * Peek at the next item without advancing.
	 */
	peek(): T | undefined {
		return this.items[this.index + 1];
	}

	/**
	 * Peek at an item at a relative offset.
	 *
	 * @param offset - Relative offset from current position
	 */
	peekAt(offset: number): T | undefined {
		return this.items[this.index + offset];
	}

	/**
	 * Get the previous item.
	 */
	previous(): T | undefined {
		return this.items[this.index - 1];
	}

	/**
	 * Reset iteration to the beginning.
	 */
	reset(): void {
		this.index = 0;
		this.tools.setVar(this.stateKey, 0);
	}

	/**
	 * Skip to a specific index.
	 *
	 * @param index - The index to skip to
	 */
	skipTo(index: number): void {
		this.index = Math.max(0, Math.min(index, this.items.length));
		this.tools.setVar(this.stateKey, this.index);
	}

	/**
	 * Skip forward by a number of items.
	 *
	 * @param count - Number of items to skip
	 */
	skip(count: number): void {
		this.skipTo(this.index + count);
	}

	/**
	 * Get all remaining items (from current position to end).
	 */
	remainingItems(): readonly T[] {
		return this.items.slice(this.index);
	}

	/**
	 * Get all processed items (from start to current position).
	 */
	processedItems(): readonly T[] {
		return this.items.slice(0, this.index);
	}

	/**
	 * Get the underlying items array.
	 */
	allItems(): readonly T[] {
		return this.items;
	}

	/**
	 * Get item by index.
	 *
	 * @param index - The index of the item to get
	 */
	getAt(index: number): T | undefined {
		return this.items[index];
	}

	/**
	 * Find an item by predicate.
	 *
	 * @param predicate - Function to test items
	 * @returns The found item and its index, or undefined
	 */
	find(
		predicate: (item: T, index: number) => boolean,
	): { item: T; index: number } | undefined {
		const index = this.items.findIndex(predicate);
		if (index === -1) {
			return undefined;
		}
		return { item: this.items[index], index };
	}

	/**
	 * Get a display string for progress (e.g., "3/10").
	 */
	progressDisplay(): string {
		return `${this.currentPosition()}/${this.total()}`;
	}

	/**
	 * Iterate remaining items with a callback.
	 * Advances the iterator as it goes.
	 *
	 * @param callback - Function to call for each item
	 */
	async forEach(
		callback: (item: T, index: number, iterator: this) => Promise<void> | void,
	): Promise<void> {
		while (this.hasMore()) {
			const item = this.current();
			if (item !== undefined) {
				await callback(item, this.currentIndex(), this);
			}
			this.next();
		}
	}

	/**
	 * Map remaining items with a callback.
	 * Does NOT advance the iterator.
	 *
	 * @param fn - Function to transform each item
	 */
	map<U>(fn: (item: T, index: number) => U): U[] {
		return this.remainingItems().map((item, i) => fn(item, this.index + i));
	}
}

/**
 * Create an IterationHelper for an array.
 * Convenience factory function.
 *
 * @param tools - WorkflowTools instance
 * @param items - The array to iterate
 * @param stateKey - State key for storing current index
 */
export function createIterator<T>(
	tools: WorkflowTools,
	items: readonly T[],
	stateKey: string,
): IterationHelper<T> {
	return new IterationHelper(items, stateKey, tools);
}

/**
 * Create an IterationHelper from state.
 * Loads the array from state if not provided.
 *
 * @param tools - WorkflowTools instance
 * @param arrayKey - State key containing the array
 * @param indexKey - State key for storing current index
 */
export function createIteratorFromState<T>(
	tools: WorkflowTools,
	arrayKey: string,
	indexKey: string,
): IterationHelper<T> {
	const items = tools.getVar<T[]>(arrayKey) ?? [];
	return new IterationHelper(items, indexKey, tools);
}
