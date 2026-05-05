/**
 * SPARC Phase Prompt Templates
 * Reference: Section 6 of sparc-story-generator-workflow.md
 *
 * This module exports all phase-specific prompt generation functions
 * used by the SPARC Story Generator workflow.
 */

export { getAnalysisReviewPrompt } from "./analysisReview.ts";
export { getArchitecturePrompt } from "./architecture.ts";
export { getCompletionPrompt } from "./completion.ts";
export { getPseudocodePrompt } from "./pseudocode.ts";
export { getRefinementPrompt } from "./refinement.ts";
export { getSpecificationPrompt } from "./specification.ts";
export { getStoryReviewPrompt } from "./storyReview.ts";
