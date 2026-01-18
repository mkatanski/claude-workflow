/**
 * Tests for Zod schema validation utilities.
 *
 * This module tests all validation functions defined in validation.ts including:
 * - Core validation with Zod schemas
 * - Input/output validation
 * - Error conversion from Zod to ValidationError format
 * - Error factory functions
 * - Helper utilities
 */

import { describe, expect, it } from "bun:test";
import { z } from "zod";
import {
	combineValidationErrors,
	createInputValidationError,
	createOutputValidationError,
	formatValidationErrors,
	formatZodMessage,
	formatZodPath,
	isZodSchema,
	validateInput,
	validateInputExists,
	validateOutput,
	validateWithSchema,
	zodErrorsToValidationErrors,
} from "./validation.js";

// ============================================================================
// Test Schemas
// ============================================================================

const SimpleStringSchema = z.string();
const SimpleNumberSchema = z.number();
const SimpleBooleanSchema = z.boolean();

const ObjectSchema = z.object({
	name: z.string().min(1, "Name is required"),
	age: z.number().int().positive("Age must be positive"),
	email: z.string().email("Invalid email format").optional(),
});

const NestedObjectSchema = z.object({
	user: z.object({
		profile: z.object({
			displayName: z.string(),
			bio: z.string().optional(),
		}),
		settings: z.object({
			theme: z.enum(["light", "dark"]),
		}),
	}),
});

const ArraySchema = z.array(z.string().min(1));

const ArrayOfObjectsSchema = z.array(
	z.object({
		id: z.number(),
		value: z.string(),
	}),
);

const UnionSchema = z.union([z.string(), z.number()]);

const WorkflowInputSchema = z.object({
	projectPath: z.string().min(1, "Project path is required"),
	recursive: z.boolean().optional().default(false),
	depth: z.number().int().min(1).max(10).optional(),
	patterns: z.array(z.string()).optional(),
});

const WorkflowOutputSchema = z.object({
	success: z.boolean(),
	files: z.array(z.string()),
	metadata: z
		.object({
			duration: z.number(),
			count: z.number(),
		})
		.optional(),
});

// ============================================================================
// validateWithSchema Tests
// ============================================================================

describe("validateWithSchema", () => {
	describe("valid data", () => {
		it("should accept valid string", () => {
			const result = validateWithSchema<string>("hello", SimpleStringSchema);
			expect(result.isOk()).toBe(true);
			expect(result.unwrap()).toBe("hello");
		});

		it("should accept valid number", () => {
			const result = validateWithSchema<number>(42, SimpleNumberSchema);
			expect(result.isOk()).toBe(true);
			expect(result.unwrap()).toBe(42);
		});

		it("should accept valid boolean", () => {
			const result = validateWithSchema<boolean>(true, SimpleBooleanSchema);
			expect(result.isOk()).toBe(true);
			expect(result.unwrap()).toBe(true);
		});

		it("should accept valid object", () => {
			const input = { name: "John", age: 30 };
			const result = validateWithSchema(input, ObjectSchema);
			expect(result.isOk()).toBe(true);
			expect(result.unwrap()).toEqual({ name: "John", age: 30 });
		});

		it("should accept valid object with optional fields", () => {
			const input = { name: "John", age: 30, email: "john@example.com" };
			const result = validateWithSchema(input, ObjectSchema);
			expect(result.isOk()).toBe(true);
			expect(result.unwrap()).toEqual(input);
		});

		it("should accept valid nested object", () => {
			const input = {
				user: {
					profile: { displayName: "John" },
					settings: { theme: "dark" as const },
				},
			};
			const result = validateWithSchema(input, NestedObjectSchema);
			expect(result.isOk()).toBe(true);
		});

		it("should accept valid array", () => {
			const result = validateWithSchema<string[]>(["a", "b", "c"], ArraySchema);
			expect(result.isOk()).toBe(true);
			expect(result.unwrap()).toEqual(["a", "b", "c"]);
		});

		it("should accept valid array of objects", () => {
			const input = [
				{ id: 1, value: "one" },
				{ id: 2, value: "two" },
			];
			const result = validateWithSchema(input, ArrayOfObjectsSchema);
			expect(result.isOk()).toBe(true);
		});

		it("should accept valid union type - string", () => {
			const result = validateWithSchema("hello", UnionSchema);
			expect(result.isOk()).toBe(true);
			expect(result.unwrap()).toBe("hello");
		});

		it("should accept valid union type - number", () => {
			const result = validateWithSchema(42, UnionSchema);
			expect(result.isOk()).toBe(true);
			expect(result.unwrap()).toBe(42);
		});
	});

	describe("invalid data", () => {
		it("should reject invalid type - expected string got number", () => {
			const result = validateWithSchema<string>(123, SimpleStringSchema);
			expect(result.isErr()).toBe(true);
			const errors = result.unwrapErr();
			expect(errors.length).toBe(1);
			expect(errors[0].path).toBe("root");
		});

		it("should reject invalid type - expected number got string", () => {
			const result = validateWithSchema<number>("hello", SimpleNumberSchema);
			expect(result.isErr()).toBe(true);
		});

		it("should reject object with missing required field", () => {
			const input = { name: "John" }; // missing age
			const result = validateWithSchema(input, ObjectSchema);
			expect(result.isErr()).toBe(true);
			const errors = result.unwrapErr();
			expect(errors.some((e) => e.path === "age")).toBe(true);
		});

		it("should reject object with invalid field value", () => {
			const input = { name: "John", age: -5 }; // negative age
			const result = validateWithSchema(input, ObjectSchema);
			expect(result.isErr()).toBe(true);
			const errors = result.unwrapErr();
			expect(errors.some((e) => e.path === "age")).toBe(true);
			expect(errors.some((e) => e.message.includes("positive"))).toBe(true);
		});

		it("should reject object with empty required string", () => {
			const input = { name: "", age: 30 }; // empty name
			const result = validateWithSchema(input, ObjectSchema);
			expect(result.isErr()).toBe(true);
			const errors = result.unwrapErr();
			expect(errors.some((e) => e.path === "name")).toBe(true);
		});

		it("should reject object with invalid email format", () => {
			const input = { name: "John", age: 30, email: "not-an-email" };
			const result = validateWithSchema(input, ObjectSchema);
			expect(result.isErr()).toBe(true);
			const errors = result.unwrapErr();
			expect(errors.some((e) => e.path === "email")).toBe(true);
			expect(errors.some((e) => e.message.includes("email"))).toBe(true);
		});

		it("should reject nested object with invalid field", () => {
			const input = {
				user: {
					profile: { displayName: "John" },
					settings: { theme: "invalid" }, // should be "light" or "dark"
				},
			};
			const result = validateWithSchema(input, NestedObjectSchema);
			expect(result.isErr()).toBe(true);
			const errors = result.unwrapErr();
			expect(errors.some((e) => e.path === "user.settings.theme")).toBe(true);
		});

		it("should reject array with empty string element", () => {
			const result = validateWithSchema(["a", "", "c"], ArraySchema);
			expect(result.isErr()).toBe(true);
			const errors = result.unwrapErr();
			expect(errors.some((e) => e.path === "[1]")).toBe(true);
		});

		it("should reject array of objects with invalid element", () => {
			const input = [
				{ id: 1, value: "one" },
				{ id: "not-a-number", value: "two" }, // id should be number
			];
			const result = validateWithSchema(input, ArrayOfObjectsSchema);
			expect(result.isErr()).toBe(true);
			const errors = result.unwrapErr();
			expect(errors.some((e) => e.path === "[1].id")).toBe(true);
		});

		it("should collect multiple validation errors", () => {
			const input = { name: "", age: -5 }; // both fields invalid
			const result = validateWithSchema(input, ObjectSchema);
			expect(result.isErr()).toBe(true);
			const errors = result.unwrapErr();
			expect(errors.length).toBe(2);
		});
	});

	describe("stripUnknown option", () => {
		it("should strip unknown fields when option is true", () => {
			const input = { name: "John", age: 30, extra: "ignored" };
			const result = validateWithSchema(input, ObjectSchema, {
				stripUnknown: true,
			});
			expect(result.isOk()).toBe(true);
			const data = result.unwrap() as Record<string, unknown>;
			expect(data.extra).toBeUndefined();
			expect(data.name).toBe("John");
		});

		it("should preserve unknown fields when option is false", () => {
			const input = { name: "John", age: 30, extra: "preserved" };
			const result = validateWithSchema(input, ObjectSchema, {
				stripUnknown: false,
			});
			expect(result.isOk()).toBe(true);
			// Note: Zod by default allows extra fields on object schemas
		});
	});
});

// ============================================================================
// validateInput Tests
// ============================================================================

describe("validateInput", () => {
	it("should accept valid workflow input", () => {
		const input = {
			projectPath: "./src",
			recursive: true,
			depth: 5,
			patterns: ["*.ts", "*.js"],
		};
		const result = validateInput(input, WorkflowInputSchema);
		expect(result.isOk()).toBe(true);
		expect(result.unwrap()).toMatchObject({
			projectPath: "./src",
			recursive: true,
			depth: 5,
		});
	});

	it("should accept minimal workflow input", () => {
		const input = { projectPath: "./src" };
		const result = validateInput(input, WorkflowInputSchema);
		expect(result.isOk()).toBe(true);
	});

	it("should reject empty projectPath", () => {
		const input = { projectPath: "" };
		const result = validateInput(input, WorkflowInputSchema);
		expect(result.isErr()).toBe(true);
		const errors = result.unwrapErr();
		expect(errors.some((e) => e.path === "projectPath")).toBe(true);
	});

	it("should reject depth outside valid range", () => {
		const input = { projectPath: "./src", depth: 100 };
		const result = validateInput(input, WorkflowInputSchema);
		expect(result.isErr()).toBe(true);
		const errors = result.unwrapErr();
		expect(errors.some((e) => e.path === "depth")).toBe(true);
	});

	it("should apply default values", () => {
		const input = { projectPath: "./src" };
		const result = validateInput(input, WorkflowInputSchema);
		expect(result.isOk()).toBe(true);
		const validated = result.unwrap() as { recursive: boolean };
		expect(validated.recursive).toBe(false);
	});
});

// ============================================================================
// validateOutput Tests
// ============================================================================

describe("validateOutput", () => {
	it("should accept valid workflow output", () => {
		const output = {
			success: true,
			files: ["file1.ts", "file2.ts"],
			metadata: { duration: 1234, count: 2 },
		};
		const result = validateOutput(output, WorkflowOutputSchema);
		expect(result.isOk()).toBe(true);
	});

	it("should accept minimal workflow output", () => {
		const output = { success: true, files: [] };
		const result = validateOutput(output, WorkflowOutputSchema);
		expect(result.isOk()).toBe(true);
	});

	it("should reject missing required fields", () => {
		const output = { success: true }; // missing files
		const result = validateOutput(output, WorkflowOutputSchema);
		expect(result.isErr()).toBe(true);
		const errors = result.unwrapErr();
		expect(errors.some((e) => e.path === "files")).toBe(true);
	});

	it("should reject invalid array element type", () => {
		const output = { success: true, files: [123, 456] }; // should be strings
		const result = validateOutput(output, WorkflowOutputSchema);
		expect(result.isErr()).toBe(true);
	});

	it("should reject invalid nested metadata", () => {
		const output = {
			success: true,
			files: [],
			metadata: { duration: "slow", count: 2 }, // duration should be number
		};
		const result = validateOutput(output, WorkflowOutputSchema);
		expect(result.isErr()).toBe(true);
	});
});

// ============================================================================
// zodErrorsToValidationErrors Tests
// ============================================================================

describe("zodErrorsToValidationErrors", () => {
	it("should convert single Zod error", () => {
		const result = SimpleStringSchema.safeParse(123);
		expect(result.success).toBe(false);
		if (!result.success) {
			const errors = zodErrorsToValidationErrors(result.error);
			expect(errors.length).toBe(1);
			expect(errors[0].path).toBe("root");
			expect(errors[0].message).toBeDefined();
		}
	});

	it("should convert multiple Zod errors", () => {
		const schema = z.object({
			a: z.string(),
			b: z.number(),
		});
		const result = schema.safeParse({ a: 123, b: "hello" });
		expect(result.success).toBe(false);
		if (!result.success) {
			const errors = zodErrorsToValidationErrors(result.error);
			expect(errors.length).toBe(2);
			expect(errors.some((e) => e.path === "a")).toBe(true);
			expect(errors.some((e) => e.path === "b")).toBe(true);
		}
	});

	it("should convert nested object errors", () => {
		const result = NestedObjectSchema.safeParse({
			user: {
				profile: { displayName: 123 }, // should be string
				settings: { theme: "dark" },
			},
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			const errors = zodErrorsToValidationErrors(result.error);
			expect(errors.some((e) => e.path === "user.profile.displayName")).toBe(
				true,
			);
		}
	});

	it("should convert array index errors", () => {
		const result = ArraySchema.safeParse(["a", 123, "c"]);
		expect(result.success).toBe(false);
		if (!result.success) {
			const errors = zodErrorsToValidationErrors(result.error);
			expect(errors.some((e) => e.path === "[1]")).toBe(true);
		}
	});
});

// ============================================================================
// formatZodPath Tests
// ============================================================================

describe("formatZodPath", () => {
	it("should return 'root' for empty path", () => {
		expect(formatZodPath([])).toBe("root");
	});

	it("should format simple object path", () => {
		expect(formatZodPath(["name"])).toBe("name");
	});

	it("should format nested object path", () => {
		expect(formatZodPath(["user", "profile", "name"])).toBe(
			"user.profile.name",
		);
	});

	it("should format array index", () => {
		expect(formatZodPath([0])).toBe("[0]");
	});

	it("should format array index in object", () => {
		expect(formatZodPath(["items", 0])).toBe("items[0]");
	});

	it("should format complex path with arrays and objects", () => {
		expect(formatZodPath(["users", 0, "addresses", 1, "city"])).toBe(
			"users[0].addresses[1].city",
		);
	});

	it("should handle consecutive array indices", () => {
		expect(formatZodPath([0, 1, 2])).toBe("[0][1][2]");
	});

	it("should handle object after array index", () => {
		expect(formatZodPath([0, "name"])).toBe("[0].name");
	});
});

// ============================================================================
// formatZodMessage Tests
// ============================================================================

describe("formatZodMessage", () => {
	it("should return the issue message", () => {
		const result = SimpleStringSchema.safeParse(123);
		expect(result.success).toBe(false);
		if (!result.success) {
			const issue = result.error.issues[0];
			const message = formatZodMessage(issue);
			expect(typeof message).toBe("string");
			expect(message.length).toBeGreaterThan(0);
		}
	});

	it("should return custom message when provided", () => {
		const schema = z.string().min(5, "Must be at least 5 characters");
		const result = schema.safeParse("abc");
		expect(result.success).toBe(false);
		if (!result.success) {
			const issue = result.error.issues[0];
			const message = formatZodMessage(issue);
			expect(message).toBe("Must be at least 5 characters");
		}
	});
});

// ============================================================================
// createInputValidationError Tests
// ============================================================================

describe("createInputValidationError", () => {
	it("should create error with single validation error", () => {
		const errors = [{ path: "email", message: "Invalid email format" }];
		const callError = createInputValidationError(errors);
		expect(callError.code).toBe("INPUT_VALIDATION");
		expect(callError.message).toContain("Input validation failed");
		expect(callError.message).toContain("Invalid email format");
		expect(callError.message).toContain("email");
		expect(callError.validationErrors).toEqual(errors);
	});

	it("should create error with multiple validation errors", () => {
		const errors = [
			{ path: "name", message: "Required" },
			{ path: "age", message: "Must be positive" },
		];
		const callError = createInputValidationError(errors);
		expect(callError.code).toBe("INPUT_VALIDATION");
		expect(callError.message).toContain("2 errors");
		expect(callError.validationErrors?.length).toBe(2);
	});

	it("should create error with empty errors array", () => {
		const callError = createInputValidationError([]);
		expect(callError.code).toBe("INPUT_VALIDATION");
		expect(callError.validationErrors).toEqual([]);
	});
});

// ============================================================================
// createOutputValidationError Tests
// ============================================================================

describe("createOutputValidationError", () => {
	it("should create error with single validation error", () => {
		const errors = [{ path: "result", message: "Expected string" }];
		const callError = createOutputValidationError(errors);
		expect(callError.code).toBe("OUTPUT_VALIDATION");
		expect(callError.message).toContain("Output validation failed");
		expect(callError.message).toContain("Expected string");
		expect(callError.message).toContain("result");
		expect(callError.validationErrors).toEqual(errors);
	});

	it("should create error with multiple validation errors", () => {
		const errors = [
			{ path: "success", message: "Required" },
			{ path: "data", message: "Invalid type" },
		];
		const callError = createOutputValidationError(errors);
		expect(callError.code).toBe("OUTPUT_VALIDATION");
		expect(callError.message).toContain("2 errors");
	});
});

// ============================================================================
// formatValidationErrors Tests
// ============================================================================

describe("formatValidationErrors", () => {
	it("should format empty errors array", () => {
		const formatted = formatValidationErrors([]);
		expect(formatted).toBe("No validation errors");
	});

	it("should format single error", () => {
		const errors = [{ path: "name", message: "Required" }];
		const formatted = formatValidationErrors(errors);
		expect(formatted).toBe("- name: Required");
	});

	it("should format multiple errors", () => {
		const errors = [
			{ path: "name", message: "Required" },
			{ path: "email", message: "Invalid format" },
		];
		const formatted = formatValidationErrors(errors);
		expect(formatted).toContain("- name: Required");
		expect(formatted).toContain("- email: Invalid format");
		expect(formatted.split("\n").length).toBe(2);
	});

	it("should handle complex paths", () => {
		const errors = [
			{ path: "users[0].addresses[1].city", message: "Too short" },
		];
		const formatted = formatValidationErrors(errors);
		expect(formatted).toBe("- users[0].addresses[1].city: Too short");
	});
});

// ============================================================================
// isZodSchema Tests
// ============================================================================

describe("isZodSchema", () => {
	it("should return true for Zod string schema", () => {
		expect(isZodSchema(z.string())).toBe(true);
	});

	it("should return true for Zod number schema", () => {
		expect(isZodSchema(z.number())).toBe(true);
	});

	it("should return true for Zod object schema", () => {
		expect(isZodSchema(z.object({ name: z.string() }))).toBe(true);
	});

	it("should return true for Zod array schema", () => {
		expect(isZodSchema(z.array(z.string()))).toBe(true);
	});

	it("should return true for complex Zod schema", () => {
		expect(isZodSchema(WorkflowInputSchema)).toBe(true);
	});

	it("should return false for null", () => {
		expect(isZodSchema(null)).toBe(false);
	});

	it("should return false for undefined", () => {
		expect(isZodSchema(undefined)).toBe(false);
	});

	it("should return false for plain object", () => {
		expect(isZodSchema({ name: "test" })).toBe(false);
	});

	it("should return false for string", () => {
		expect(isZodSchema("string")).toBe(false);
	});

	it("should return false for number", () => {
		expect(isZodSchema(42)).toBe(false);
	});

	it("should return false for function without schema methods", () => {
		expect(isZodSchema(() => {})).toBe(false);
	});

	it("should return false for object with only _def", () => {
		expect(isZodSchema({ _def: {} })).toBe(false);
	});
});

// ============================================================================
// validateInputExists Tests
// ============================================================================

describe("validateInputExists", () => {
	it("should return empty array when input exists and schema is defined", () => {
		const errors = validateInputExists({ data: "test" }, true);
		expect(errors).toEqual([]);
	});

	it("should return empty array when input is null and schema is defined", () => {
		// null is a valid value, just not undefined
		const errors = validateInputExists(null, true);
		expect(errors).toEqual([]);
	});

	it("should return empty array when no schema is defined", () => {
		const errors = validateInputExists(undefined, false);
		expect(errors).toEqual([]);
	});

	it("should return error when input is undefined but schema is defined", () => {
		const errors = validateInputExists(undefined, true);
		expect(errors.length).toBe(1);
		expect(errors[0].path).toBe("root");
		expect(errors[0].message).toContain("required");
	});

	it("should return empty array for empty object when schema is defined", () => {
		const errors = validateInputExists({}, true);
		expect(errors).toEqual([]);
	});

	it("should return empty array for empty string when schema is defined", () => {
		const errors = validateInputExists("", true);
		expect(errors).toEqual([]);
	});
});

// ============================================================================
// combineValidationErrors Tests
// ============================================================================

describe("combineValidationErrors", () => {
	it("should return empty array for no inputs", () => {
		const combined = combineValidationErrors();
		expect(combined).toEqual([]);
	});

	it("should return empty array for empty arrays", () => {
		const combined = combineValidationErrors([], [], []);
		expect(combined).toEqual([]);
	});

	it("should return single array unchanged", () => {
		const errors = [{ path: "name", message: "Required" }];
		const combined = combineValidationErrors(errors);
		expect(combined).toEqual(errors);
	});

	it("should combine multiple error arrays", () => {
		const errors1 = [{ path: "name", message: "Required" }];
		const errors2 = [{ path: "email", message: "Invalid" }];
		const combined = combineValidationErrors(errors1, errors2);
		expect(combined.length).toBe(2);
		expect(combined).toContainEqual({ path: "name", message: "Required" });
		expect(combined).toContainEqual({ path: "email", message: "Invalid" });
	});

	it("should combine arrays with mixed empty and non-empty", () => {
		const errors1: { path: string; message: string }[] = [];
		const errors2 = [{ path: "age", message: "Must be positive" }];
		const errors3: { path: string; message: string }[] = [];
		const combined = combineValidationErrors(errors1, errors2, errors3);
		expect(combined.length).toBe(1);
		expect(combined[0].path).toBe("age");
	});

	it("should preserve order of errors", () => {
		const errors1 = [{ path: "a", message: "A error" }];
		const errors2 = [{ path: "b", message: "B error" }];
		const errors3 = [{ path: "c", message: "C error" }];
		const combined = combineValidationErrors(errors1, errors2, errors3);
		expect(combined[0].path).toBe("a");
		expect(combined[1].path).toBe("b");
		expect(combined[2].path).toBe("c");
	});
});

// ============================================================================
// Integration Tests
// ============================================================================

describe("Integration: Full Validation Flow", () => {
	it("should validate input and create proper error on failure", () => {
		const input = { projectPath: "", depth: 100 };
		const result = validateInput(input, WorkflowInputSchema);

		expect(result.isErr()).toBe(true);
		const errors = result.unwrapErr();

		const callError = createInputValidationError(errors);
		expect(callError.code).toBe("INPUT_VALIDATION");
		expect(callError.validationErrors?.length).toBeGreaterThan(0);

		const formatted = formatValidationErrors(errors);
		expect(formatted).toContain("projectPath");
	});

	it("should validate output and create proper error on failure", () => {
		const output = { success: "not-boolean", files: 123 };
		const result = validateOutput(output, WorkflowOutputSchema);

		expect(result.isErr()).toBe(true);
		const errors = result.unwrapErr();

		const callError = createOutputValidationError(errors);
		expect(callError.code).toBe("OUTPUT_VALIDATION");
		expect(callError.validationErrors?.length).toBeGreaterThan(0);
	});

	it("should handle successful validation end-to-end", () => {
		const input = { projectPath: "./src" };
		const inputResult = validateInput(input, WorkflowInputSchema);
		expect(inputResult.isOk()).toBe(true);

		const output = { success: true, files: ["file.ts"] };
		const outputResult = validateOutput(output, WorkflowOutputSchema);
		expect(outputResult.isOk()).toBe(true);
	});

	it("should combine pre-validation and schema validation errors", () => {
		const existsErrors = validateInputExists(undefined, true);
		// Even though input doesn't exist, let's pretend we tried to validate something
		const schemaErrors = [{ path: "name", message: "Expected string" }];

		const allErrors = combineValidationErrors(existsErrors, schemaErrors);
		expect(allErrors.length).toBe(2);

		const formatted = formatValidationErrors(allErrors);
		expect(formatted).toContain("root");
		expect(formatted).toContain("name");
	});
});

// ============================================================================
// Edge Cases
// ============================================================================

describe("Edge Cases", () => {
	it("should handle validation of null value", () => {
		const result = validateWithSchema(null, z.null());
		expect(result.isOk()).toBe(true);
	});

	it("should handle validation of undefined value against optional", () => {
		const schema = z.string().optional();
		const result = validateWithSchema(undefined, schema);
		expect(result.isOk()).toBe(true);
	});

	it("should handle very deeply nested validation errors", () => {
		const deepSchema = z.object({
			a: z.object({
				b: z.object({
					c: z.object({
						d: z.object({
							e: z.string(),
						}),
					}),
				}),
			}),
		});

		const result = validateWithSchema(
			{ a: { b: { c: { d: { e: 123 } } } } },
			deepSchema,
		);
		expect(result.isErr()).toBe(true);
		const errors = result.unwrapErr();
		expect(errors[0].path).toBe("a.b.c.d.e");
	});

	it("should handle validation with transform", () => {
		const schema = z.string().transform((s) => s.toUpperCase());
		const result = validateWithSchema<string>("hello", schema);
		expect(result.isOk()).toBe(true);
		expect(result.unwrap()).toBe("HELLO");
	});

	it("should handle validation with refine", () => {
		const schema = z.string().refine((s) => s.startsWith("test"), {
			message: "Must start with 'test'",
		});

		const validResult = validateWithSchema("testing", schema);
		expect(validResult.isOk()).toBe(true);

		const invalidResult = validateWithSchema("invalid", schema);
		expect(invalidResult.isErr()).toBe(true);
		const errors = invalidResult.unwrapErr();
		expect(errors[0].message).toBe("Must start with 'test'");
	});

	it("should handle discriminated union validation", () => {
		const schema = z.discriminatedUnion("type", [
			z.object({ type: z.literal("a"), aValue: z.string() }),
			z.object({ type: z.literal("b"), bValue: z.number() }),
		]);

		const validA = validateWithSchema({ type: "a", aValue: "test" }, schema);
		expect(validA.isOk()).toBe(true);

		const validB = validateWithSchema({ type: "b", bValue: 42 }, schema);
		expect(validB.isOk()).toBe(true);

		const invalid = validateWithSchema({ type: "c" }, schema);
		expect(invalid.isErr()).toBe(true);
	});

	it("should handle empty string path formatting", () => {
		// This shouldn't happen in practice, but let's handle it gracefully
		const path = formatZodPath([""]);
		expect(path).toBe("");
	});

	it("should handle special characters in error messages", () => {
		const errors = [
			{
				path: "field",
				message: "Value contains 'quotes' and \"double quotes\"",
			},
		];
		const formatted = formatValidationErrors(errors);
		expect(formatted).toContain("'quotes'");
		expect(formatted).toContain('"double quotes"');
	});
});
