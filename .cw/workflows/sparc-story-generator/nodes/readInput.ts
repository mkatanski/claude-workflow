/**
 * Read Input Node for SPARC Story Generator
 *
 * Reads and validates the architectural document from the input path.
 * Reference: Section 4.2 Node Responsibilities
 */

import type { NodeFunction } from "../../../../src/core/graph/types.ts";
import { getConfig, getInputPath, StateKeys } from "../state.ts";

/**
 * Read Input Node
 *
 * Responsibilities:
 * 1. Read the architecture document from the input path
 * 2. Validate the file format (must be .md or .txt)
 * 3. Validate the file size (check against maxDocumentTokens in config)
 * 4. Store the document content in state
 *
 * Type: Deterministic (no AI)
 */
export const readInputNode: NodeFunction = async (_state, tools) => {
	const inputPath = getInputPath(tools);
	const config = getConfig(tools);

	// Validate input path exists
	if (!inputPath) {
		return {
			error:
				"No input path provided. Use --input=<path> to specify the architecture document.",
		};
	}

	// Check file extension
	const supportedFormats = config.input.supportedFormats;
	const hasValidExtension = supportedFormats.some((ext) =>
		inputPath.endsWith(ext),
	);
	if (!hasValidExtension) {
		return {
			error: `Invalid file format. Supported formats: ${supportedFormats.join(", ")}`,
		};
	}

	// Read the file using tools.files
	const result = tools.files.readText(inputPath);
	if (result.isErr()) {
		const error = result.unwrapErr();
		return {
			error: `Failed to read input file: ${error.message}`,
		};
	}

	const content = result.unwrap();

	// Rough token estimation (1 token ≈ 4 characters)
	const estimatedTokens = Math.ceil(content.length / 4);
	if (estimatedTokens > config.input.maxDocumentTokens) {
		return {
			error: `Document too large: ~${estimatedTokens} tokens (max: ${config.input.maxDocumentTokens})`,
		};
	}

	tools.log(
		`Read architecture document: ${inputPath} (~${estimatedTokens} tokens)`,
		"info",
	);

	return {
		variables: {
			[StateKeys.documentContent]: content,
			[StateKeys.inputPath]: inputPath,
		},
	};
};
