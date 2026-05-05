/**
 * Architecture Phase Node (A in SPARC)
 *
 * Creates detailed story plan based on specification analysis and pseudocode approach.
 * Defines phase boundaries, requirement mappings, and dependency graphs.
 *
 * Reference: Section 4.2 Node Responsibilities, Section 7 AI Tool Integration
 */

import type { NodeFunction } from "../../../../src/core/graph/types.ts";
import { getArchitecturePrompt } from "../prompts/architecture.ts";
import { getAnalysis, getApproach, getConfig, StateKeys } from "../state.ts";
import type { ArchitectureOutput } from "../types.ts";
import { parseJsonFromOutputSafe } from "../utils/jsonParser.ts";

/**
 * Architecture Node
 *
 * Responsibilities:
 * 1. Get both the specification analysis AND pseudocode approach from state
 * 2. Call agentSession with the architecture prompt
 * 3. Parse the JSON response
 * 4. Store the story plan in state
 *
 * Type: AI (uses agentSession)
 * Model: opus (per Section 7.5 - critical structural decisions)
 */
export const architectureNode: NodeFunction = async (_state, tools) => {
	const analysis = getAnalysis(tools);
	const approach = getApproach(tools);
	const config = getConfig(tools);

	if (!analysis) {
		return {
			error:
				"No specification analysis available. Specification phase must run first.",
		};
	}

	if (!approach) {
		return {
			error:
				"No pseudocode approach available. Pseudocode phase must run first.",
		};
	}

	tools.log("Starting SPARC Architecture phase (A)...", "info");

	// Generate the prompt with both analysis and approach
	const prompt = getArchitecturePrompt(analysis, approach);

	// Call agentSession with opus model (critical structural decisions)
	const result = await tools.agentSession(prompt, {
		label: "SPARC Architecture",
		model: config.models.architecture, // "opus" per Section 7.5
		permissionMode: "bypassPermissions", // Per Section 1.2
		workingDirectory: tools.projectPath,
	});

	if (!result.success) {
		return {
			error: `Architecture phase failed: ${result.error}`,
		};
	}

	// Parse JSON from output using the robust parser
	const parseResult = parseJsonFromOutputSafe<ArchitectureOutput>(
		result.output,
	);

	if (!parseResult.success) {
		tools.log(`JSON parse failed: ${parseResult.error}`, "error");
		return {
			error: `Failed to parse architecture output: ${parseResult.error}`,
		};
	}

	const storyPlan = parseResult.data;

	tools.log(
		`Architecture complete. Parsed using: ${parseResult.strategy}`,
		"info",
	);
	tools.log(`Phases: ${storyPlan.phases.length}`, "info");
	tools.log(
		`Cross-cutting concerns: ${storyPlan.crossCuttingConcerns.length}`,
		"info",
	);
	tools.log(`Confidence: ${(storyPlan.confidence * 100).toFixed(0)}%`, "info");

	return {
		variables: {
			[StateKeys.storyPlan]: storyPlan,
		},
	};
};
