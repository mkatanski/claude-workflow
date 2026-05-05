/**
 * Usage Examples for JSON Parser Utilities
 *
 * This file demonstrates how to use the JSON parser utilities
 * in workflow nodes to extract structured data from AI agent responses.
 *
 * @module jsonParser.example
 */

import type { WorkflowTools } from "../../../../src/core/graph/workflowTools.ts";
import {
	parseJsonArrayFromOutput,
	parseJsonFromOutput,
	parseJsonFromOutputSafe,
	validateJson,
} from "./jsonParser.ts";

// Example types for demonstration
interface AnalysisResult {
	businessRequirements: Array<{ id: string; description: string }>;
	technicalRequirements: Array<{ id: string; description: string }>;
	components: Array<{ name: string; responsibility: string }>;
}

interface Story {
	id: string;
	title: string;
	description: string;
	acceptanceCriteria: string[];
	dependencies: string[];
}

/**
 * Example 1: Basic parsing in a workflow node
 *
 * Use parseJsonFromOutput for simple cases where you just want the data or null.
 */
async function exampleBasicParsing(tools: WorkflowTools) {
	const result = await tools.agentSession(
		"Analyze this document and return JSON...",
		{
			label: "Specification Phase",
			model: "opus",
			permissionMode: "bypassPermissions",
		},
	);

	if (!result.success) {
		throw new Error(`Agent failed: ${result.error}`);
	}

	// Simple parsing - returns null if parsing fails
	const analysis = parseJsonFromOutput<AnalysisResult>(result.output);

	if (!analysis) {
		throw new Error("Failed to parse JSON from agent output");
	}

	console.log(
		`Found ${analysis.businessRequirements.length} business requirements`,
	);
	return analysis;
}

/**
 * Example 2: Safe parsing with detailed error information
 *
 * Use parseJsonFromOutputSafe when you need to know WHY parsing failed
 * or which strategy succeeded.
 */
async function exampleSafeParsing(tools: WorkflowTools) {
	const result = await tools.agentSession(
		"Generate stories based on this plan...",
		{
			label: "Story Generation",
			model: "sonnet",
			permissionMode: "bypassPermissions",
		},
	);

	if (!result.success) {
		throw new Error(`Agent failed: ${result.error}`);
	}

	// Safe parsing - returns detailed success/error information
	const parseResult = parseJsonFromOutputSafe<Story[]>(result.output);

	if (!parseResult.success) {
		console.error(`Parsing failed: ${parseResult.error}`);
		console.error(`Raw output: ${parseResult.rawOutput.substring(0, 200)}...`);
		throw new Error("Could not extract stories from agent response");
	}

	console.log(
		`Parsed ${parseResult.data.length} stories using strategy: ${parseResult.strategy}`,
	);
	return parseResult.data;
}

/**
 * Example 3: Parsing arrays with automatic property detection
 *
 * Use parseJsonArrayFromOutput when expecting arrays.
 * It automatically handles cases where the array is nested in an object.
 */
async function exampleArrayParsing(tools: WorkflowTools) {
	const result = await tools.agentSession("Return a list of stories...", {
		label: "Story Batch",
		model: "sonnet",
		permissionMode: "bypassPermissions",
	});

	if (!result.success) {
		throw new Error(`Agent failed: ${result.error}`);
	}

	// Handles both:
	// - Direct arrays: [story1, story2, ...]
	// - Wrapped arrays: { "stories": [story1, story2, ...] }
	const stories = parseJsonArrayFromOutput<Story>(result.output);

	if (!stories) {
		throw new Error("Failed to extract story array from agent output");
	}

	console.log(`Generated ${stories.length} stories`);
	return stories;
}

/**
 * Example 4: Parsing with validation
 *
 * Combine parsing with type guard validation for additional safety.
 */
function isValidAnalysis(data: unknown): data is AnalysisResult {
	if (typeof data !== "object" || data === null) return false;

	const obj = data as AnalysisResult;

	return (
		Array.isArray(obj.businessRequirements) &&
		Array.isArray(obj.technicalRequirements) &&
		Array.isArray(obj.components)
	);
}

async function exampleValidatedParsing(tools: WorkflowTools) {
	const result = await tools.agentSession("Analyze this document...", {
		label: "Specification",
		model: "opus",
		permissionMode: "bypassPermissions",
	});

	if (!result.success) {
		throw new Error(`Agent failed: ${result.error}`);
	}

	// First parse
	const parsed = parseJsonFromOutput<AnalysisResult>(result.output);

	// Then validate
	const validated = validateJson(parsed, isValidAnalysis);

	if (!validated) {
		throw new Error(
			"Parsed JSON does not match expected AnalysisResult schema",
		);
	}

	return validated;
}

/**
 * Example 5: Retry logic with fallback
 *
 * Combine parsing with retry logic for robust error handling.
 */
async function exampleWithRetry(tools: WorkflowTools) {
	let attempts = 0;
	const maxAttempts = 3;

	while (attempts < maxAttempts) {
		const result = await tools.agentSession(
			attempts === 0
				? "Generate stories in JSON format..."
				: "Generate stories in JSON format. IMPORTANT: Return ONLY valid JSON, no additional text.",
			{
				label: `Story Generation (attempt ${attempts + 1})`,
				model: "sonnet",
				permissionMode: "bypassPermissions",
			},
		);

		if (!result.success) {
			attempts++;
			continue;
		}

		const parseResult = parseJsonFromOutputSafe<Story[]>(result.output);

		if (parseResult.success) {
			console.log(`Succeeded on attempt ${attempts + 1}`);
			return parseResult.data;
		}

		console.warn(
			`Parse failed on attempt ${attempts + 1}: ${parseResult.error}`,
		);
		attempts++;
	}

	throw new Error(`Failed to get valid JSON after ${maxAttempts} attempts`);
}

/**
 * Example 6: Handling various output formats
 *
 * The parser handles many common formats automatically.
 */
function exampleVariousFormats() {
	// Direct JSON
	const format1 = '{"key": "value"}';
	const result1 = parseJsonFromOutput<{ key: string }>(format1);
	console.log("Direct JSON:", result1);

	// Markdown code block
	const format2 = 'Here is your data:\n```json\n{"key": "value"}\n```';
	const result2 = parseJsonFromOutput<{ key: string }>(format2);
	console.log("Markdown block:", result2);

	// Embedded in text
	const format3 =
		'Sure! Here is the result: {"key": "value"} Let me know if you need anything else.';
	const result3 = parseJsonFromOutput<{ key: string }>(format3);
	console.log("Embedded:", result3);

	// Array in object
	const format4 = '{"stories": [{"id": "1"}, {"id": "2"}]}';
	const result4 = parseJsonArrayFromOutput<Story>(format4);
	console.log("Array in object:", result4);

	// Direct array
	const format5 = '[{"id": "1"}, {"id": "2"}]';
	const result5 = parseJsonArrayFromOutput<Story>(format5);
	console.log("Direct array:", result5);
}

// Export examples for reference (not meant to be executed)
export {
	exampleBasicParsing,
	exampleSafeParsing,
	exampleArrayParsing,
	exampleValidatedParsing,
	exampleWithRetry,
	exampleVariousFormats,
};
