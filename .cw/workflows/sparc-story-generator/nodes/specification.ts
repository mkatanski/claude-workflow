/**
 * Specification Phase Node (S in SPARC)
 *
 * Analyzes the architectural document and extracts structured requirements,
 * components, constraints, and assumptions using an AI agent.
 *
 * Reference: Section 4.2 Node Responsibilities, Section 7 AI Tool Integration
 */

import type { NodeFunction } from "../../../../src/core/graph/types.ts";
import { getSpecificationPrompt } from "../prompts/specification.ts";
import { getConfig, getDocumentContent, StateKeys } from "../state.ts";
import type { SpecificationOutput } from "../types.ts";
import { parseJsonFromOutputSafe } from "../utils/jsonParser.ts";

/**
 * Specification Node
 *
 * Responsibilities:
 * 1. Get the document content from state
 * 2. Call agentSession with the specification prompt
 * 3. Parse the JSON response
 * 4. Store the analysis in state
 *
 * Type: AI (uses agentSession)
 * Model: opus (per Section 7.5)
 */
export const specificationNode: NodeFunction = async (_state, tools) => {
	const documentContent = getDocumentContent(tools);
	const config = getConfig(tools);

	if (!documentContent) {
		return {
			error: "No document content available. Read input step must run first.",
		};
	}

	tools.log("Starting SPARC Specification phase (S)...", "info");

	// Generate the prompt
	const prompt = getSpecificationPrompt(documentContent);

	// Call agentSession (NOT claudeSdk, NOT planningAgentSession)
	const result = await tools.agentSession(prompt, {
		label: "SPARC Specification",
		model: config.models.specification, // "opus" per Section 7.5
		permissionMode: "bypassPermissions", // Per Section 1.2
		workingDirectory: tools.projectPath,
	});

	if (!result.success) {
		return {
			error: `Specification phase failed: ${result.error}`,
		};
	}

	// Parse JSON from output using the robust parser
	const parseResult = parseJsonFromOutputSafe<SpecificationOutput>(
		result.output,
	);

	if (!parseResult.success) {
		tools.log(`JSON parse failed: ${parseResult.error}`, "error");
		return {
			error: `Failed to parse specification output: ${parseResult.error}`,
		};
	}

	tools.log(
		`Specification complete. Parsed using: ${parseResult.strategy}`,
		"info",
	);
	tools.log(
		`Found ${parseResult.data.businessRequirements.length} business requirements`,
		"info",
	);
	tools.log(
		`Found ${parseResult.data.technicalRequirements.length} technical requirements`,
		"info",
	);
	tools.log(`Found ${parseResult.data.components.length} components`, "info");

	return {
		variables: {
			[StateKeys.analysis]: parseResult.data,
		},
	};
};
