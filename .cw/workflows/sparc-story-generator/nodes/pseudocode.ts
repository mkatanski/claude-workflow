/**
 * Pseudocode Phase Node (P in SPARC)
 *
 * Designs the approach for breaking down architectural requirements into
 * implementation stories across multiple passes.
 *
 * Reference: Section 4.2 Node Responsibilities, Section 7 AI Tool Integration
 */

import type { NodeFunction } from "../../../../src/core/graph/types.ts";
import { getPseudocodePrompt } from "../prompts/pseudocode.ts";
import { getAnalysis, getConfig, StateKeys } from "../state.ts";
import type { PseudocodeOutput } from "../types.ts";
import { parseJsonFromOutputSafe } from "../utils/jsonParser.ts";

/**
 * Pseudocode Node
 *
 * Responsibilities:
 * 1. Get the specification analysis from state
 * 2. Call agentSession with the pseudocode prompt
 * 3. Parse the JSON response
 * 4. Store the approach in state
 *
 * Type: AI (uses agentSession)
 * Model: sonnet (per Section 7.5)
 */
export const pseudocodeNode: NodeFunction = async (_state, tools) => {
	const analysis = getAnalysis(tools);
	const config = getConfig(tools);

	if (!analysis) {
		return {
			error:
				"No specification analysis available. Specification phase must run first.",
		};
	}

	tools.log("Starting SPARC Pseudocode phase (P)...", "info");

	// Generate the prompt with the analysis
	const prompt = getPseudocodePrompt(analysis);

	// Call agentSession with sonnet model (NOT claudeSdk, NOT planningAgentSession)
	const result = await tools.agentSession(prompt, {
		label: "SPARC Pseudocode",
		model: config.models.pseudocode, // "sonnet" per Section 7.5
		permissionMode: "bypassPermissions", // Per Section 1.2
		workingDirectory: tools.projectPath,
	});

	if (!result.success) {
		return {
			error: `Pseudocode phase failed: ${result.error}`,
		};
	}

	// Parse JSON from output using the robust parser
	const parseResult = parseJsonFromOutputSafe<PseudocodeOutput>(result.output);

	if (!parseResult.success) {
		tools.log(`JSON parse failed: ${parseResult.error}`, "error");
		return {
			error: `Failed to parse pseudocode output: ${parseResult.error}`,
		};
	}

	tools.log(
		`Pseudocode complete. Parsed using: ${parseResult.strategy}`,
		"info",
	);
	tools.log(`Planned passes: ${parseResult.data.passStructure.length}`, "info");
	tools.log(
		`Story groupings: ${parseResult.data.storyGroupings.length}`,
		"info",
	);

	// Store both the approach AND set totalPasses from the pass structure
	return {
		variables: {
			[StateKeys.approach]: parseResult.data,
			[StateKeys.totalPasses]: parseResult.data.passStructure.length,
		},
	};
};
