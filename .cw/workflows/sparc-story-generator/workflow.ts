/**
 * SPARC Story Generator Workflow
 *
 * Analyzes architectural documents and generates implementation stories
 * using the SPARC methodology (Specification, Pseudocode, Architecture,
 * Refinement, Completion).
 *
 * Usage:
 *   cw run -w sparc-story-generator
 *   cw run -w sparc-story-generator --verbose
 *   cw run -w sparc-story-generator --resume --checkpoint
 *
 * Configuration:
 *   - Modify inputPath in this file to set the input document path
 *   - Modify defaultConfig in config.ts to adjust workflow behavior
 *
 * @see .cw/docs/architecture/sparc-story-generator-workflow.md
 */

import type { LangGraphWorkflowDefinition } from "../../../src/core/graph/types.ts";
import { defaultConfig } from "./config.ts";
import { buildGraph } from "./graph.ts";

/**
 * Create workflow definition
 *
 * NOTE: CLI argument parsing is planned for future enhancement.
 * For now, set the inputPath directly in the vars object below.
 */
const createWorkflow = (): LangGraphWorkflowDefinition => {
	return {
		name: "SPARC Story Generator",
		description:
			"Analyzes architectural documents and generates implementation stories using SPARC methodology",
		version: "1.0.0",

		vars: {
			// Configuration
			config: defaultConfig,

			// ⚠️ SET YOUR INPUT PATH HERE ⚠️
			// Example: inputPath: "./.cw/docs/architecture/my-feature.md"
			inputPath: undefined,

			// Flags
			analysisOnly: false, // Set to true to only run analysis phase
			verbose: false, // Set to true for detailed logging

			// Initial state (undefined values will be populated by nodes)
			documentContent: undefined,
			analysis: undefined,
			approach: undefined,
			storyPlan: undefined,
			analysisReview: undefined,
			currentPass: 1,
			totalPasses: defaultConfig.generation.maxPasses,
			generatedStories: [],
			storyReview: undefined,
			outputPath: undefined,
			completed: false,
			summary: undefined,
			error: undefined,
		},

		build: buildGraph,
	};
};

export default createWorkflow;
