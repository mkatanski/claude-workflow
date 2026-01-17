/**
 * SchemaValidator - JSON parsing and schema validation utilities.
 *
 * Provides Result-based JSON parsing and optional schema validation
 * for workflow operations.
 */

import { ResultBox } from "../result/result.js";

/**
 * Validation error details.
 */
export interface ValidationError {
	/** Path to the invalid field */
	path: string;
	/** Error message */
	message: string;
	/** Expected value/type */
	expected?: string;
	/** Actual value/type */
	actual?: string;
}

/**
 * JSON schema type for validation.
 * Uses a simplified subset of JSON Schema.
 */
export interface JsonSchema {
	type?: "object" | "array" | "string" | "number" | "boolean" | "null";
	properties?: Record<string, JsonSchema>;
	items?: JsonSchema;
	required?: string[];
	enum?: unknown[];
	minimum?: number;
	maximum?: number;
	minLength?: number;
	maxLength?: number;
	pattern?: string;
	additionalProperties?: boolean | JsonSchema;
}

/**
 * Parse a JSON string safely.
 *
 * @param json - The JSON string to parse
 * @returns ResultBox with parsed data or error message
 *
 * @example
 * ```typescript
 * const result = parseJson<Config>('{"setting": "value"}');
 * if (result.isOk()) {
 *   console.log(result.unwrap().setting);
 * }
 * ```
 */
export function parseJson<T>(json: string): ResultBox<T, string> {
	try {
		const data = JSON.parse(json) as T;
		return ResultBox.ok(data);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown parse error";
		return ResultBox.err(`JSON parse error: ${message}`);
	}
}

/**
 * Parse a JSON string with a fallback value.
 *
 * @param json - The JSON string to parse
 * @param defaultValue - Value to return if parsing fails
 * @returns The parsed data or default value
 *
 * @example
 * ```typescript
 * const config = parseJsonSafe('invalid json', { setting: 'default' });
 * // Returns { setting: 'default' }
 * ```
 */
export function parseJsonSafe<T>(json: string, defaultValue: T): T {
	return parseJson<T>(json).unwrapOr(defaultValue);
}

/**
 * Try to parse JSON, returning undefined on failure.
 *
 * @param json - The JSON string to parse
 */
export function tryParseJson<T>(json: string): T | undefined {
	return parseJson<T>(json).toUndefined();
}

/**
 * Extract JSON from a string that might contain other content.
 * Looks for JSON objects or arrays in the string.
 *
 * @param content - String that might contain JSON
 * @returns ResultBox with extracted JSON or error
 *
 * @example
 * ```typescript
 * const result = extractJson<Data>('Some text {"data": 123} more text');
 * // Returns { data: 123 }
 * ```
 */
export function extractJson<T>(content: string): ResultBox<T, string> {
	// Try to find JSON object
	const objectMatch = content.match(/\{[\s\S]*\}/);
	if (objectMatch) {
		const parsed = parseJson<T>(objectMatch[0]);
		if (parsed.isOk()) {
			return parsed;
		}
	}

	// Try to find JSON array
	const arrayMatch = content.match(/\[[\s\S]*\]/);
	if (arrayMatch) {
		const parsed = parseJson<T>(arrayMatch[0]);
		if (parsed.isOk()) {
			return parsed;
		}
	}

	return ResultBox.err("No valid JSON found in content");
}

/**
 * Validate data against a schema.
 *
 * @param data - The data to validate
 * @param schema - The JSON schema to validate against
 * @param path - Current path (for error messages)
 * @returns Array of validation errors (empty if valid)
 */
export function validateSchema(
	data: unknown,
	schema: JsonSchema,
	path = "",
): ValidationError[] {
	const errors: ValidationError[] = [];

	// Type validation
	if (schema.type) {
		const actualType = getJsonType(data);
		if (actualType !== schema.type) {
			errors.push({
				path: path || "root",
				message: `Expected ${schema.type}, got ${actualType}`,
				expected: schema.type,
				actual: actualType,
			});
			return errors; // Stop further validation on type mismatch
		}
	}

	// Enum validation
	if (schema.enum) {
		if (!schema.enum.includes(data)) {
			errors.push({
				path: path || "root",
				message: `Value must be one of: ${schema.enum.join(", ")}`,
				expected: schema.enum.join(" | "),
				actual: String(data),
			});
		}
	}

	// String validations
	if (typeof data === "string") {
		if (schema.minLength !== undefined && data.length < schema.minLength) {
			errors.push({
				path: path || "root",
				message: `String too short (min: ${schema.minLength})`,
				expected: `minLength: ${schema.minLength}`,
				actual: `length: ${data.length}`,
			});
		}
		if (schema.maxLength !== undefined && data.length > schema.maxLength) {
			errors.push({
				path: path || "root",
				message: `String too long (max: ${schema.maxLength})`,
				expected: `maxLength: ${schema.maxLength}`,
				actual: `length: ${data.length}`,
			});
		}
		if (schema.pattern) {
			const regex = new RegExp(schema.pattern);
			if (!regex.test(data)) {
				errors.push({
					path: path || "root",
					message: `String does not match pattern: ${schema.pattern}`,
					expected: schema.pattern,
					actual: data,
				});
			}
		}
	}

	// Number validations
	if (typeof data === "number") {
		if (schema.minimum !== undefined && data < schema.minimum) {
			errors.push({
				path: path || "root",
				message: `Number too small (min: ${schema.minimum})`,
				expected: `minimum: ${schema.minimum}`,
				actual: String(data),
			});
		}
		if (schema.maximum !== undefined && data > schema.maximum) {
			errors.push({
				path: path || "root",
				message: `Number too large (max: ${schema.maximum})`,
				expected: `maximum: ${schema.maximum}`,
				actual: String(data),
			});
		}
	}

	// Object validations
	if (typeof data === "object" && data !== null && !Array.isArray(data)) {
		const obj = data as Record<string, unknown>;

		// Required fields
		if (schema.required) {
			for (const field of schema.required) {
				if (!(field in obj)) {
					errors.push({
						path: path ? `${path}.${field}` : field,
						message: `Required field missing`,
						expected: "defined",
						actual: "undefined",
					});
				}
			}
		}

		// Property validations
		if (schema.properties) {
			for (const [key, propSchema] of Object.entries(schema.properties)) {
				if (key in obj) {
					const propPath = path ? `${path}.${key}` : key;
					errors.push(...validateSchema(obj[key], propSchema, propPath));
				}
			}
		}
	}

	// Array validations
	if (Array.isArray(data) && schema.items) {
		for (let i = 0; i < data.length; i++) {
			const itemPath = path ? `${path}[${i}]` : `[${i}]`;
			errors.push(...validateSchema(data[i], schema.items, itemPath));
		}
	}

	return errors;
}

/**
 * Get JSON type of a value.
 */
function getJsonType(value: unknown): string {
	if (value === null) return "null";
	if (Array.isArray(value)) return "array";
	return typeof value;
}

/**
 * Validate data against a schema and return a ResultBox.
 *
 * @param data - The data to validate
 * @param schema - The JSON schema to validate against
 * @returns ResultBox with validated data or validation errors
 */
export function validate<T>(
	data: unknown,
	schema: JsonSchema,
): ResultBox<T, ValidationError[]> {
	const errors = validateSchema(data, schema);
	if (errors.length > 0) {
		return ResultBox.err(errors);
	}
	return ResultBox.ok(data as T);
}

/**
 * Parse JSON and validate against a schema.
 *
 * @param json - The JSON string to parse
 * @param schema - The JSON schema to validate against
 * @returns ResultBox with parsed and validated data or errors
 */
export function parseAndValidate<T>(
	json: string,
	schema: JsonSchema,
): ResultBox<T, ValidationError[]> {
	const parsed = parseJson<unknown>(json);
	if (parsed.isErr()) {
		return ResultBox.err([
			{
				path: "root",
				message: parsed.unwrapErr(),
			},
		]);
	}

	return validate<T>(parsed.unwrap(), schema);
}

/**
 * Format validation errors for display.
 *
 * @param errors - The validation errors to format
 * @returns Formatted string representation
 */
export function formatValidationErrors(errors: ValidationError[]): string {
	return errors.map((e) => `${e.path}: ${e.message}`).join("\n");
}

/**
 * SchemaValidator class - encapsulates validation with a predefined schema.
 */
export class SchemaValidator<T> {
	private readonly schema: JsonSchema;

	constructor(schema: JsonSchema) {
		this.schema = schema;
	}

	/**
	 * Parse and validate JSON.
	 */
	parse(json: string): ResultBox<T, ValidationError[]> {
		return parseAndValidate<T>(json, this.schema);
	}

	/**
	 * Parse with fallback value.
	 */
	parseOr(json: string, defaultValue: T): T {
		return this.parse(json).unwrapOr(defaultValue);
	}

	/**
	 * Validate an existing value.
	 */
	validate(data: unknown): ResultBox<T, ValidationError[]> {
		return validate<T>(data, this.schema);
	}

	/**
	 * Check if data is valid.
	 */
	isValid(data: unknown): boolean {
		return this.validate(data).isOk();
	}
}

/**
 * Create a SchemaValidator for a given schema.
 */
export function createValidator<T>(schema: JsonSchema): SchemaValidator<T> {
	return new SchemaValidator<T>(schema);
}
