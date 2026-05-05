import type { StoryGeneratorConfig } from "./types.ts";

/**
 * Claude model types supported by the workflow.
 * Reference: Section 7.5 Model Selection by Phase
 */
export type ClaudeModel = "sonnet" | "opus" | "haiku";

/**
 * Default configuration for SPARC Story Generator workflow.
 * Reference: Section 11.1 Workflow Configuration
 */
export const defaultConfig: StoryGeneratorConfig = {
	input: {
		maxDocumentTokens: 50000,
		supportedFormats: [".md", ".txt"],
	},
	generation: {
		batchSize: 10,
		maxPasses: 6,
		minStoriesPerPhase: 3,
	},
	models: {
		// Generation models (Section 7.5)
		specification: "opus", // Complex document analysis
		pseudocode: "sonnet", // Lighter planning, cost-effective
		architecture: "opus", // Critical structural decisions
		refinement: "sonnet", // Bulk generation, good quality/cost
		completion: "sonnet", // Validation checks

		// Review models (secondary AI agents)
		analysisReviewer: "sonnet", // Cost-effective secondary validation
		storyReviewer: "sonnet", // Consistent quality checks
	},
	output: {
		directory: ".cw/generated/stories",
		format: "yaml",
	},
	review: {
		analysisReview: {
			enabled: true,
			maxAttempts: 3,
			confidenceThreshold: 0.8, // Minimum confidence to approve (0.0-1.0)
		},
		storyReview: {
			enabled: true,
			maxRegenerationAttempts: 2,
			minScoreToApprove: 70, // Story score threshold (0-100)
			allowPartialBatch: true, // Continue if some stories fail
		},
	},
};
