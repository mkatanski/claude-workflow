/**
 * State Management for SPARC Story Generator Workflow
 *
 * Provides typed accessors for workflow state using the WorkflowTools interface.
 * Uses the existing WorkflowGraph's variables system with type-safe getters/setters.
 */

import type { WorkflowTools } from "../../../src/core/graph/workflowTools.ts";
import { defaultConfig } from "./config.ts";
import type {
	AnalysisReviewResult,
	ArchitectureOutput,
	ExecutionSummary,
	PseudocodeOutput,
	SPARCStoryGeneratorState,
	SpecificationOutput,
	Story,
	StoryGeneratorConfig,
	StoryPhase,
	StoryWithFeedback,
} from "./types.ts";

/**
 * State key constants for type-safe access.
 */
export const StateKeys = {
	// Input
	inputPath: "inputPath",
	documentContent: "documentContent",

	// SPARC Phase Outputs
	analysis: "analysis",
	approach: "approach",
	storyPlan: "storyPlan",

	// Review States
	analysisReview: "analysisReview",

	// Refinement Loop
	currentPass: "currentPass",
	totalPasses: "totalPasses",
	generatedStories: "generatedStories",

	// Story Review
	storyReview: "storyReview",

	// Output
	outputPath: "outputPath",
	completed: "completed",
	summary: "summary",

	// Configuration
	config: "config",

	// Error Handling
	error: "error",
} as const;

// ============================================================================
// Configuration Accessors
// ============================================================================

/**
 * Get workflow configuration.
 */
export function getConfig(tools: WorkflowTools): StoryGeneratorConfig {
	return tools.getVar<StoryGeneratorConfig>(StateKeys.config) ?? defaultConfig;
}

// ============================================================================
// Input Accessors
// ============================================================================

/**
 * Get input document path.
 */
export function getInputPath(tools: WorkflowTools): string | undefined {
	return tools.getVar<string>(StateKeys.inputPath);
}

/**
 * Get document content.
 */
export function getDocumentContent(tools: WorkflowTools): string | undefined {
	return tools.getVar<string>(StateKeys.documentContent);
}

// ============================================================================
// SPARC Phase Output Accessors
// ============================================================================

/**
 * Get Specification phase analysis output.
 */
export function getAnalysis(
	tools: WorkflowTools,
): SpecificationOutput | undefined {
	return tools.getVar<SpecificationOutput>(StateKeys.analysis);
}

/**
 * Get Pseudocode phase approach output.
 */
export function getApproach(
	tools: WorkflowTools,
): PseudocodeOutput | undefined {
	return tools.getVar<PseudocodeOutput>(StateKeys.approach);
}

/**
 * Get Architecture phase story plan output.
 */
export function getStoryPlan(
	tools: WorkflowTools,
): ArchitectureOutput | undefined {
	return tools.getVar<ArchitectureOutput>(StateKeys.storyPlan);
}

// ============================================================================
// Review State Accessors
// ============================================================================

/**
 * Get analysis review result from secondary AI agent.
 */
export function getAnalysisReview(
	tools: WorkflowTools,
): AnalysisReviewResult | undefined {
	return tools.getVar<AnalysisReviewResult>(StateKeys.analysisReview);
}

/**
 * Get story review state.
 */
export function getStoryReview(
	tools: WorkflowTools,
): SPARCStoryGeneratorState["storyReview"] | undefined {
	return tools.getVar<SPARCStoryGeneratorState["storyReview"]>(
		StateKeys.storyReview,
	);
}

// ============================================================================
// Refinement Loop Accessors
// ============================================================================

/**
 * Get current pass number.
 */
export function getCurrentPass(tools: WorkflowTools): number {
	return tools.getVar<number>(StateKeys.currentPass) ?? 0;
}

/**
 * Get total number of passes planned.
 */
export function getTotalPasses(tools: WorkflowTools): number {
	return tools.getVar<number>(StateKeys.totalPasses) ?? 0;
}

/**
 * Get all generated stories across all passes.
 */
export function getGeneratedStories(tools: WorkflowTools): Story[] {
	return tools.getVar<Story[]>(StateKeys.generatedStories) ?? [];
}

// ============================================================================
// Output Accessors
// ============================================================================

/**
 * Get output path for generated story files.
 */
export function getOutputPath(tools: WorkflowTools): string | undefined {
	return tools.getVar<string>(StateKeys.outputPath);
}

/**
 * Get workflow completion status.
 */
export function getCompleted(tools: WorkflowTools): boolean {
	return tools.getVar<boolean>(StateKeys.completed) ?? false;
}

/**
 * Get execution summary with statistics.
 */
export function getSummary(tools: WorkflowTools): ExecutionSummary | undefined {
	return tools.getVar<ExecutionSummary>(StateKeys.summary);
}

// ============================================================================
// Error Handling Accessors
// ============================================================================

/**
 * Get error state if workflow encountered failure.
 */
export function getError(tools: WorkflowTools): string | undefined {
	return tools.getVar<string>(StateKeys.error);
}

// ============================================================================
// Helper Functions for Analysis Phase
// ============================================================================

/**
 * Check if Specification, Pseudocode, and Architecture phases are complete.
 * This indicates the analysis is ready for review.
 */
export function isAnalysisComplete(tools: WorkflowTools): boolean {
	const analysis = getAnalysis(tools);
	const approach = getApproach(tools);
	const storyPlan = getStoryPlan(tools);

	return (
		analysis !== undefined && approach !== undefined && storyPlan !== undefined
	);
}

/**
 * Check if analysis has been reviewed and approved.
 */
export function isAnalysisApproved(tools: WorkflowTools): boolean {
	const review = getAnalysisReview(tools);
	return review?.approved ?? false;
}

// ============================================================================
// Helper Functions for Refinement Loop
// ============================================================================

/**
 * Check if more refinement passes are needed.
 */
export function hasMorePasses(tools: WorkflowTools): boolean {
	const currentPass = getCurrentPass(tools);
	const totalPasses = getTotalPasses(tools);
	return currentPass < totalPasses;
}

/**
 * Get stories generated in the current pass.
 * Returns stories matching the current pass number.
 */
export function getCurrentPassStories(tools: WorkflowTools): Story[] {
	const _currentPass = getCurrentPass(tools);
	const storyReview = getStoryReview(tools);

	if (!storyReview) {
		return [];
	}

	// Return stories from current batch being reviewed
	return storyReview.currentBatch ?? [];
}

// ============================================================================
// Helper Functions for Story Review
// ============================================================================

/**
 * Get all stories that have been approved through review.
 */
export function getApprovedStories(tools: WorkflowTools): Story[] {
	const storyReview = getStoryReview(tools);
	return storyReview?.approvedStories ?? [];
}

/**
 * Get stories that failed review with their feedback.
 */
export function getRejectedStories(tools: WorkflowTools): StoryWithFeedback[] {
	const storyReview = getStoryReview(tools);
	return storyReview?.rejectedStories ?? [];
}

/**
 * Get count of regeneration attempts for rejected stories.
 */
export function getRegenerationAttempts(tools: WorkflowTools): number {
	const storyReview = getStoryReview(tools);
	return storyReview?.regenerationAttempts ?? 0;
}

/**
 * Check if regeneration attempts are exhausted.
 */
export function isRegenerationExhausted(tools: WorkflowTools): boolean {
	const config = getConfig(tools);
	const attempts = getRegenerationAttempts(tools);
	return attempts >= config.review.storyReview.maxRegenerationAttempts;
}

// ============================================================================
// Helper Functions for Phase Management
// ============================================================================

/**
 * Get stories filtered by phase.
 */
export function getStoriesByPhase(
	tools: WorkflowTools,
	phase: StoryPhase,
): Story[] {
	const stories = getGeneratedStories(tools);
	return stories.filter((story) => story.phase === phase);
}

/**
 * Get total story count across all phases.
 */
export function getTotalStoryCount(tools: WorkflowTools): number {
	return getGeneratedStories(tools).length;
}

/**
 * Get approved story count.
 */
export function getApprovedStoryCount(tools: WorkflowTools): number {
	return getApprovedStories(tools).length;
}
