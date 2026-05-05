/**
 * Save Analysis Node for SPARC Story Generator
 *
 * Saves specification, pseudocode, and architecture analysis outputs to JSON files.
 * Reference: Section 4.2 Node Responsibilities, Section 9.1 Generated Files
 */

import * as path from "node:path";
import type { NodeFunction } from "../../../../src/core/graph/types.ts";
import { getAnalysis, getApproach, getConfig, getStoryPlan } from "../state.ts";

/**
 * Save Analysis Node
 *
 * Responsibilities:
 * 1. Save specification analysis to analysis/specification.json
 * 2. Save pseudocode approach to analysis/approach.json
 * 3. Save architecture story plan to analysis/story-plan.json
 * 4. Create the output directory if it doesn't exist
 *
 * Type: Deterministic (no AI)
 *
 * Output Structure (from Section 9.1):
 * ```
 * .cw/generated/sparc-output/
 * ├── analysis/
 * │   ├── specification.json      # S phase output
 * │   ├── approach.json           # P phase output
 * │   └── story-plan.json         # A phase output
 * ```
 */
export const saveAnalysisNode: NodeFunction = async (_state, tools) => {
	const config = getConfig(tools);
	const analysis = getAnalysis(tools);
	const approach = getApproach(tools);
	const storyPlan = getStoryPlan(tools);

	// Validate all analysis data is present
	if (!analysis || !approach || !storyPlan) {
		return {
			error:
				"Missing analysis data. All SPARC phases (S, P, A) must complete first.",
		};
	}

	tools.log("Saving analysis artifacts...", "info");

	// Create output directory path
	const baseDir = path.join(
		tools.projectPath,
		config.output.directory,
		"analysis",
	);

	// Ensure directory exists using bash
	const mkdirResult = await tools.bash(`mkdir -p "${baseDir}"`);
	if (!mkdirResult.success) {
		return {
			error: `Failed to create analysis directory: ${mkdirResult.error}`,
		};
	}

	// Save specification.json
	const specPath = path.join(baseDir, "specification.json");
	const specResult = tools.files.writeText(
		specPath,
		JSON.stringify(analysis, null, 2),
	);
	if (specResult.isErr()) {
		const error = specResult.unwrapErr();
		return {
			error: `Failed to write specification.json: ${error.message}`,
		};
	}
	tools.log(`Saved: ${specPath}`, "info");

	// Save approach.json
	const approachPath = path.join(baseDir, "approach.json");
	const approachResult = tools.files.writeText(
		approachPath,
		JSON.stringify(approach, null, 2),
	);
	if (approachResult.isErr()) {
		const error = approachResult.unwrapErr();
		return {
			error: `Failed to write approach.json: ${error.message}`,
		};
	}
	tools.log(`Saved: ${approachPath}`, "info");

	// Save story-plan.json
	const planPath = path.join(baseDir, "story-plan.json");
	const planResult = tools.files.writeText(
		planPath,
		JSON.stringify(storyPlan, null, 2),
	);
	if (planResult.isErr()) {
		const error = planResult.unwrapErr();
		return {
			error: `Failed to write story-plan.json: ${error.message}`,
		};
	}
	tools.log(`Saved: ${planPath}`, "info");

	tools.log("Analysis artifacts saved successfully.", "info");

	return {
		variables: {
			// Mark analysis as complete for review routing
			analysisComplete: true,
		},
	};
};
