/**
 * Workflow Composition Validation - Zod schema validation for workflow input/output
 *
 * This module provides utilities for validating workflow inputs and outputs
 * against Zod schemas. It converts Zod validation errors to the ValidationError
 * format used throughout the composition module.
 *
 * @example
 * ```typescript
 * import { z } from "zod";
 * import { validateInput, validateOutput, formatValidationErrors } from "./validation";
 *
 * const inputSchema = z.object({
 *   path: z.string().min(1),
 *   depth: z.number().optional(),
 * });
 *
 * const result = validateInput({ path: "" }, inputSchema);
 * if (result.isErr()) {
 *   console.error("Validation failed:", formatValidationErrors(result.unwrapErr()));
 * }
 * ```
 */

import type { z } from "zod";
import { ResultBox } from "../utils/result/result.js";
import type { ValidationError, WorkflowCallError } from "./types.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Result of validating data against a Zod schema.
 *
 * On success, contains the validated and parsed data.
 * On error, contains an array of field-level validation errors.
 */
export type ValidationResult<T> = ResultBox<T, ValidationError[]>;

/**
 * Options for validation functions.
 */
export interface ValidationOptions {
	/**
	 * Whether to strip unknown keys from objects.
	 * When true, extra fields not in the schema are removed.
	 * Default: false (extra fields are ignored but preserved).
	 */
	stripUnknown?: boolean;
}

// ============================================================================
// Core Validation Functions
// ============================================================================

/**
 * Validate data against a Zod schema.
 *
 * Uses Zod's safeParse to validate the input and converts any errors
 * to the ValidationError format. This is the core validation function
 * used by validateInput and validateOutput.
 *
 * @param data - The data to validate
 * @param schema - The Zod schema to validate against
 * @param options - Optional validation options
 * @returns ResultBox with validated data or validation errors
 *
 * @example
 * ```typescript
 * const schema = z.object({ name: z.string() });
 * const result = validateWithSchema({ name: "test" }, schema);
 *
 * if (result.isOk()) {
 *   console.log("Valid:", result.unwrap());
 * } else {
 *   console.error("Errors:", result.unwrapErr());
 * }
 * ```
 */
export function validateWithSchema<T>(
	data: unknown,
	schema: z.ZodTypeAny,
	options: ValidationOptions = {},
): ValidationResult<T> {
	// Apply strip transformation if requested
	const effectiveSchema = options.stripUnknown
		? applyStripUnknown(schema)
		: schema;

	const parseResult = effectiveSchema.safeParse(data);

	if (parseResult.success) {
		return ResultBox.ok(parseResult.data as T);
	}

	// Convert Zod errors to ValidationError format
	const errors = zodErrorsToValidationErrors(parseResult.error);
	return ResultBox.err(errors);
}

/**
 * Validate workflow input against a Zod schema.
 *
 * This function is specifically for validating input data before
 * workflow execution. It provides clear error messages that indicate
 * the validation is for input data.
 *
 * @param input - The input data to validate
 * @param schema - The Zod schema to validate against
 * @param options - Optional validation options
 * @returns ResultBox with validated input or validation errors
 *
 * @example
 * ```typescript
 * const inputSchema = z.object({
 *   projectPath: z.string().min(1),
 *   recursive: z.boolean().optional(),
 * });
 *
 * const result = validateInput({ projectPath: "./src" }, inputSchema);
 * if (result.isOk()) {
 *   const validInput = result.unwrap();
 *   // Use validInput with type safety
 * }
 * ```
 */
export function validateInput<TInput>(
	input: unknown,
	schema: z.ZodTypeAny,
	options: ValidationOptions = {},
): ValidationResult<TInput> {
	return validateWithSchema<TInput>(input, schema, options);
}

/**
 * Validate workflow output against a Zod schema.
 *
 * This function is specifically for validating output data after
 * workflow execution. It provides clear error messages that indicate
 * the validation is for output data.
 *
 * @param output - The output data to validate
 * @param schema - The Zod schema to validate against
 * @param options - Optional validation options
 * @returns ResultBox with validated output or validation errors
 *
 * @example
 * ```typescript
 * const outputSchema = z.object({
 *   success: z.boolean(),
 *   files: z.array(z.string()),
 * });
 *
 * const result = validateOutput(workflowResult, outputSchema);
 * if (result.isErr()) {
 *   console.error("Output validation failed:", result.unwrapErr());
 * }
 * ```
 */
export function validateOutput<TOutput>(
	output: unknown,
	schema: z.ZodTypeAny,
	options: ValidationOptions = {},
): ValidationResult<TOutput> {
	return validateWithSchema<TOutput>(output, schema, options);
}

// ============================================================================
// Error Conversion Functions
// ============================================================================

/**
 * Convert Zod validation errors to ValidationError format.
 *
 * Zod provides rich error information including paths, codes, and messages.
 * This function converts them to our simpler ValidationError format while
 * preserving the essential information.
 *
 * @param zodError - The Zod error object
 * @returns Array of ValidationError objects
 */
export function zodErrorsToValidationErrors(
	zodError: z.ZodError,
): ValidationError[] {
	return zodError.issues.map((issue) => ({
		path: formatZodPath(issue.path),
		message: formatZodMessage(issue),
	}));
}

/**
 * Format a Zod path array to a dot-notation string.
 *
 * Zod paths are arrays of strings (for object keys) and numbers (for array indices).
 * This converts them to a readable dot-notation path like "user.addresses[0].city".
 *
 * @param path - The Zod path array
 * @returns Formatted path string
 *
 * @example
 * ```typescript
 * formatZodPath(["user", "addresses", 0, "city"])
 * // Returns: "user.addresses[0].city"
 *
 * formatZodPath([])
 * // Returns: "root"
 * ```
 */
export function formatZodPath(path: (string | number)[]): string {
	if (path.length === 0) {
		return "root";
	}

	let result = "";
	for (let i = 0; i < path.length; i++) {
		const segment = path[i];
		if (typeof segment === "number") {
			result += `[${segment}]`;
		} else if (i === 0) {
			result = segment;
		} else {
			result += `.${segment}`;
		}
	}
	return result;
}

/**
 * Format a Zod issue into a human-readable message.
 *
 * Zod issues contain a code and message. This function ensures
 * the message is informative and consistent with our error format.
 *
 * @param issue - The Zod issue object
 * @returns Formatted error message
 */
export function formatZodMessage(issue: z.ZodIssue): string {
	// Use the message directly - Zod provides good messages
	return issue.message;
}

// ============================================================================
// Error Factory Functions
// ============================================================================

/**
 * Create a WorkflowCallError for input validation failure.
 *
 * @param errors - The validation errors
 * @returns WorkflowCallError with INPUT_VALIDATION code
 *
 * @example
 * ```typescript
 * const callError = createInputValidationError([
 *   { path: "email", message: "Invalid email format" }
 * ]);
 * // Returns: { code: "INPUT_VALIDATION", message: "...", validationErrors: [...] }
 * ```
 */
export function createInputValidationError(
	errors: ValidationError[],
): WorkflowCallError {
	const summary =
		errors.length === 1
			? `Input validation failed: ${errors[0].message} at "${errors[0].path}"`
			: `Input validation failed with ${errors.length} errors`;

	return {
		code: "INPUT_VALIDATION",
		message: summary,
		validationErrors: errors,
	};
}

/**
 * Create a WorkflowCallError for output validation failure.
 *
 * @param errors - The validation errors
 * @returns WorkflowCallError with OUTPUT_VALIDATION code
 *
 * @example
 * ```typescript
 * const callError = createOutputValidationError([
 *   { path: "result", message: "Expected string, received number" }
 * ]);
 * // Returns: { code: "OUTPUT_VALIDATION", message: "...", validationErrors: [...] }
 * ```
 */
export function createOutputValidationError(
	errors: ValidationError[],
): WorkflowCallError {
	const summary =
		errors.length === 1
			? `Output validation failed: ${errors[0].message} at "${errors[0].path}"`
			: `Output validation failed with ${errors.length} errors`;

	return {
		code: "OUTPUT_VALIDATION",
		message: summary,
		validationErrors: errors,
	};
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format validation errors for display.
 *
 * Creates a multi-line string with all validation errors,
 * suitable for logging or displaying to users.
 *
 * @param errors - The validation errors to format
 * @returns Formatted string with all errors
 *
 * @example
 * ```typescript
 * const formatted = formatValidationErrors([
 *   { path: "name", message: "Required" },
 *   { path: "email", message: "Invalid email format" },
 * ]);
 * // Returns:
 * // "- name: Required
 * //  - email: Invalid email format"
 * ```
 */
export function formatValidationErrors(errors: ValidationError[]): string {
	if (errors.length === 0) {
		return "No validation errors";
	}

	return errors.map((e) => `- ${e.path}: ${e.message}`).join("\n");
}

/**
 * Check if a value is a valid Zod schema.
 *
 * Used to verify that input/output schemas are actual Zod schemas
 * before attempting validation.
 *
 * @param value - The value to check
 * @returns True if the value appears to be a Zod schema
 */
export function isZodSchema(value: unknown): value is z.ZodTypeAny {
	if (!value || typeof value !== "object") {
		return false;
	}

	// Zod schemas have a _def property and parse/safeParse methods
	const maybeSchema = value as Record<string, unknown>;
	return (
		"_def" in maybeSchema &&
		typeof maybeSchema.safeParse === "function" &&
		typeof maybeSchema.parse === "function"
	);
}

/**
 * Apply strip transformation to a schema if it's an object type.
 *
 * This is used when stripUnknown option is true to remove extra
 * fields from objects during validation.
 *
 * @param schema - The Zod schema
 * @returns The schema with strip applied if applicable
 */
function applyStripUnknown(schema: z.ZodTypeAny): z.ZodTypeAny {
	// Check if schema has a strip method (ZodObject has it)
	// Use double assertion to avoid TypeScript error about incompatible types
	const schemaAny = schema as unknown as Record<string, unknown>;
	if (typeof schemaAny.strip === "function") {
		return schemaAny.strip() as z.ZodTypeAny;
	}
	return schema;
}

/**
 * Validate that input exists when a schema is defined.
 *
 * This is a pre-validation check to ensure that workflows with
 * defined input schemas receive some input data.
 *
 * @param input - The input to check
 * @param hasSchema - Whether the workflow has an input schema
 * @returns ValidationError array (empty if valid)
 */
export function validateInputExists(
	input: unknown,
	hasSchema: boolean,
): ValidationError[] {
	if (hasSchema && input === undefined) {
		return [
			{
				path: "root",
				message: "Input is required but was not provided",
			},
		];
	}
	return [];
}

/**
 * Combine multiple validation results into one.
 *
 * Useful when performing multiple validation checks and wanting
 * to collect all errors before returning.
 *
 * @param results - Array of validation results
 * @returns Combined validation errors (empty if all valid)
 */
export function combineValidationErrors(
	...errorArrays: ValidationError[][]
): ValidationError[] {
	return errorArrays.flat();
}
