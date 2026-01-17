/**
 * Schema validation utilities for workflows.
 *
 * Provides Result-based JSON parsing and schema validation
 * to replace try/catch patterns in workflow nodes.
 *
 * @example
 * ```typescript
 * import { parseJson, parseJsonSafe, extractJson, validate, SchemaValidator } from "@/core/utils/schema";
 *
 * // Simple parsing
 * const result = parseJson<Config>(jsonString);
 * if (result.isOk()) {
 *   console.log(result.unwrap().setting);
 * }
 *
 * // With fallback
 * const config = parseJsonSafe(jsonString, defaultConfig);
 *
 * // Extract from mixed content
 * const data = extractJson<Data>("Some text {\"key\": \"value\"} more text");
 *
 * // With schema validation
 * const schema = { type: "object", required: ["name"], properties: { name: { type: "string" } } };
 * const validated = validate<User>(userData, schema);
 *
 * // Reusable validator
 * const userValidator = new SchemaValidator<User>(userSchema);
 * const user = userValidator.parseOr(jsonString, defaultUser);
 * ```
 *
 * @module
 */

export {
	createValidator,
	extractJson,
	formatValidationErrors,
	type JsonSchema,
	parseAndValidate,
	parseJson,
	parseJsonSafe,
	SchemaValidator,
	tryParseJson,
	type ValidationError,
	validate,
	validateSchema,
} from "./schemaValidator.js";
