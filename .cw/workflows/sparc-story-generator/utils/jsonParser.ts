/**
 * JSON Parsing Utilities for AI Agent Session Responses
 *
 * Provides robust JSON extraction from free-form text returned by agentSession.
 * Implements multiple fallback strategies to handle various output formats.
 *
 * @module jsonParser
 */

/**
 * Strategy identifier for tracking which parsing method succeeded.
 */
export type ParseStrategy =
	| "direct"
	| "markdown_code_block"
	| "curly_braces"
	| "square_brackets"
	| "cleaned_json";

/**
 * Successful parse result with metadata.
 */
export interface ParseSuccess<T> {
	success: true;
	data: T;
	strategy: ParseStrategy;
}

/**
 * Failed parse result with error information.
 */
export interface ParseError {
	success: false;
	error: string;
	rawOutput: string;
}

/**
 * Result type for safe parsing operations.
 */
export type ParseResult<T> = ParseSuccess<T> | ParseError;

/**
 * Remove common JSON issues that prevent parsing.
 * Handles: trailing commas, comments, unquoted keys (basic cases).
 *
 * @param str - JSON string to clean
 * @returns Cleaned JSON string
 */
export function cleanJsonString(str: string): string {
	return (
		str
			// Remove single-line comments
			.replace(/\/\/.*$/gm, "")
			// Remove multi-line comments
			.replace(/\/\*[\s\S]*?\*\//g, "")
			// Remove trailing commas before closing braces/brackets
			.replace(/,(\s*[}\]])/g, "$1")
			.trim()
	);
}

/**
 * Extract content from markdown code block.
 * Supports both ```json and ``` formats.
 *
 * @param output - Text containing code block
 * @param language - Optional language identifier (e.g., "json", "typescript")
 * @returns Extracted code block content or null if not found
 */
export function extractCodeBlock(
	output: string,
	language?: string,
): string | null {
	// Build regex pattern based on language
	const langPattern = language ? `${language}` : "(?:json|typescript|ts|js)?";
	const regex = new RegExp(`\`\`\`${langPattern}\\s*([\\s\\S]*?)\`\`\``, "i");

	const match = output.match(regex);
	if (match?.[1]) {
		return match[1].trim();
	}

	return null;
}

/**
 * Type guard validation helper.
 * Validates parsed data against a type guard function.
 *
 * @param data - Parsed data to validate
 * @param validator - Type guard function
 * @returns Validated data or null if validation fails
 */
export function validateJson<T>(
	data: unknown,
	validator: (d: unknown) => d is T,
): T | null {
	if (validator(data)) {
		return data;
	}
	return null;
}

/**
 * Parse JSON from agent session output using multiple strategies.
 *
 * Strategies (in order):
 * 1. Direct parse - Try parsing entire output as JSON
 * 2. Markdown code block - Extract JSON from ```json blocks
 * 3. Curly braces - Find first { to last }
 * 4. Square brackets - Find first [ to last ]
 * 5. Cleaned JSON - Try cleaning common issues and retry
 *
 * @param output - Raw agent session output
 * @returns Parsed JSON object or null if all strategies fail
 *
 * @example
 * ```typescript
 * const result = parseJsonFromOutput<MyType>(agentOutput);
 * if (result) {
 *   console.log(result.field);
 * }
 * ```
 */
export function parseJsonFromOutput<T>(output: string): T | null {
	if (!output || output.trim().length === 0) {
		return null;
	}

	// Strategy 1: Try parsing entire output as JSON
	try {
		return JSON.parse(output) as T;
	} catch {
		// Continue to next strategy
	}

	// Strategy 2: Extract JSON from markdown code block
	const codeBlockContent = extractCodeBlock(output, "json");
	if (codeBlockContent) {
		try {
			return JSON.parse(codeBlockContent) as T;
		} catch {
			// Continue to next strategy
		}
	}

	// Strategy 3: Find first { to last } (for embedded JSON objects)
	const firstBrace = output.indexOf("{");
	const lastBrace = output.lastIndexOf("}");
	if (firstBrace !== -1 && lastBrace > firstBrace) {
		try {
			return JSON.parse(output.slice(firstBrace, lastBrace + 1)) as T;
		} catch {
			// Continue to next strategy
		}
	}

	// Strategy 4: Find first [ to last ] (for embedded JSON arrays)
	const firstBracket = output.indexOf("[");
	const lastBracket = output.lastIndexOf("]");
	if (firstBracket !== -1 && lastBracket > firstBracket) {
		try {
			return JSON.parse(output.slice(firstBracket, lastBracket + 1)) as T;
		} catch {
			// Continue to next strategy
		}
	}

	// Strategy 5: Try cleaning and parsing again (for all strategies)
	const cleaned = cleanJsonString(output);
	if (cleaned !== output) {
		try {
			return JSON.parse(cleaned) as T;
		} catch {
			// All strategies exhausted
		}
	}

	return null;
}

/**
 * Parse JSON with detailed error information and strategy tracking.
 * Returns a Result type for better error handling.
 *
 * @param output - Raw agent session output
 * @returns ParseResult with success/failure information
 *
 * @example
 * ```typescript
 * const result = parseJsonFromOutputSafe<MyType>(agentOutput);
 * if (result.success) {
 *   console.log(`Parsed using: ${result.strategy}`);
 *   processData(result.data);
 * } else {
 *   console.error(`Parse failed: ${result.error}`);
 * }
 * ```
 */
export function parseJsonFromOutputSafe<T>(output: string): ParseResult<T> {
	if (!output || output.trim().length === 0) {
		return {
			success: false,
			error: "Empty output string",
			rawOutput: output,
		};
	}

	// Strategy 1: Direct parse
	try {
		const data = JSON.parse(output) as T;
		return { success: true, data, strategy: "direct" };
	} catch (_error) {
		// Continue to next strategy
	}

	// Strategy 2: Markdown code block
	const codeBlockContent = extractCodeBlock(output, "json");
	if (codeBlockContent) {
		try {
			const data = JSON.parse(codeBlockContent) as T;
			return { success: true, data, strategy: "markdown_code_block" };
		} catch (_error) {
			// Continue to next strategy
		}
	}

	// Strategy 3: Curly braces
	const firstBrace = output.indexOf("{");
	const lastBrace = output.lastIndexOf("}");
	if (firstBrace !== -1 && lastBrace > firstBrace) {
		try {
			const extracted = output.slice(firstBrace, lastBrace + 1);
			const data = JSON.parse(extracted) as T;
			return { success: true, data, strategy: "curly_braces" };
		} catch (_error) {
			// Continue to next strategy
		}
	}

	// Strategy 4: Square brackets
	const firstBracket = output.indexOf("[");
	const lastBracket = output.lastIndexOf("]");
	if (firstBracket !== -1 && lastBracket > firstBracket) {
		try {
			const extracted = output.slice(firstBracket, lastBracket + 1);
			const data = JSON.parse(extracted) as T;
			return { success: true, data, strategy: "square_brackets" };
		} catch (_error) {
			// Continue to next strategy
		}
	}

	// Strategy 5: Cleaned JSON (try all extraction methods with cleaned content)
	const cleaned = cleanJsonString(output);
	if (cleaned !== output) {
		// Try direct parse with cleaned content
		try {
			const data = JSON.parse(cleaned) as T;
			return { success: true, data, strategy: "cleaned_json" };
		} catch (_error) {
			// Continue
		}

		// Try extracting from cleaned content (curly braces)
		const cleanedFirstBrace = cleaned.indexOf("{");
		const cleanedLastBrace = cleaned.lastIndexOf("}");
		if (cleanedFirstBrace !== -1 && cleanedLastBrace > cleanedFirstBrace) {
			try {
				const extracted = cleaned.slice(
					cleanedFirstBrace,
					cleanedLastBrace + 1,
				);
				const data = JSON.parse(extracted) as T;
				return { success: true, data, strategy: "cleaned_json" };
			} catch (_error) {
				// Continue
			}
		}
	}

	// All strategies exhausted
	return {
		success: false,
		error: "All parsing strategies failed. Output may not contain valid JSON.",
		rawOutput: output,
	};
}

/**
 * Parse JSON array specifically (for story lists).
 * Handles cases where agent returns array directly.
 *
 * @param output - Raw agent session output
 * @returns Parsed array or null if parsing fails
 *
 * @example
 * ```typescript
 * const stories = parseJsonArrayFromOutput<Story>(agentOutput);
 * if (stories) {
 *   console.log(`Parsed ${stories.length} stories`);
 * }
 * ```
 */
export function parseJsonArrayFromOutput<T>(output: string): T[] | null {
	const result = parseJsonFromOutput<T[]>(output);

	// Validate it's actually an array
	if (result && Array.isArray(result)) {
		return result;
	}

	// Check if it's an object with an array property (common pattern)
	if (result && typeof result === "object" && !Array.isArray(result)) {
		// Try common array property names
		const arrayKeys = ["stories", "items", "data", "results", "list"];
		for (const key of arrayKeys) {
			const value = (result as Record<string, unknown>)[key];
			if (Array.isArray(value)) {
				return value as T[];
			}
		}
	}

	return null;
}

/**
 * Parse JSON array with detailed error information.
 * Returns a Result type for better error handling.
 *
 * @param output - Raw agent session output
 * @returns ParseResult with success/failure information
 *
 * @example
 * ```typescript
 * const result = parseJsonArrayFromOutputSafe<Story>(agentOutput);
 * if (result.success) {
 *   console.log(`Parsed ${result.data.length} items using: ${result.strategy}`);
 * } else {
 *   console.error(`Parse failed: ${result.error}`);
 * }
 * ```
 */
export function parseJsonArrayFromOutputSafe<T>(
	output: string,
): ParseResult<T[]> {
	const result = parseJsonFromOutputSafe<T[]>(output);

	// If parsing succeeded, validate it's an array
	if (result.success) {
		if (Array.isArray(result.data)) {
			return result;
		}

		// Check if it's an object with an array property
		if (typeof result.data === "object") {
			const arrayKeys = ["stories", "items", "data", "results", "list"];
			for (const key of arrayKeys) {
				const value = (result.data as Record<string, unknown>)[key];
				if (Array.isArray(value)) {
					return {
						success: true,
						data: value as T[],
						strategy: result.strategy,
					};
				}
			}
		}

		// Parsed successfully but not an array
		return {
			success: false,
			error:
				"Parsed JSON is not an array or does not contain an array property",
			rawOutput: output,
		};
	}

	return result;
}
