/**
 * Iteration utilities for workflow array processing.
 *
 * Provides stateful iteration helpers for processing ordered arrays
 * like stories, milestones, and other items in workflows.
 *
 * @example
 * ```typescript
 * import { IterationHelper, createIterator, createIteratorFromState } from "@/core/utils/iteration";
 *
 * // Create from array
 * const stories = tools.getVar<Story[]>("stories") ?? [];
 * const iterator = createIterator(tools, stories, "currentStoryIndex");
 *
 * // Or create from state
 * const iterator = createIteratorFromState<Story>(tools, "stories", "currentStoryIndex");
 *
 * // Basic iteration
 * while (iterator.hasMore()) {
 *   const story = iterator.current();
 *   console.log(`Processing ${iterator.progressDisplay()}: ${story.title}`);
 *   // Process...
 *   iterator.next();
 * }
 *
 * // Async iteration
 * await iterator.forEach(async (story, index) => {
 *   await processStory(story);
 * });
 * ```
 *
 * @module
 */

export {
	createIterator,
	createIteratorFromState,
	IterationHelper,
} from "./iterationHelper.js";
