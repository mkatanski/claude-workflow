/**
 * Tests for JSON Parser Utilities
 *
 * @module jsonParser.test
 */

import { describe, expect, test } from "bun:test";
import {
	cleanJsonString,
	extractCodeBlock,
	parseJsonArrayFromOutput,
	parseJsonArrayFromOutputSafe,
	parseJsonFromOutput,
	parseJsonFromOutputSafe,
	validateJson,
} from "./jsonParser.ts";

describe("cleanJsonString", () => {
	test("removes trailing commas", () => {
		const input = '{"key": "value",}';
		const result = cleanJsonString(input);
		expect(result).toBe('{"key": "value"}');
	});

	test("removes single-line comments", () => {
		const input = '{"key": "value"} // comment';
		const result = cleanJsonString(input);
		expect(result).toBe('{"key": "value"}');
	});

	test("removes multi-line comments", () => {
		const input = '{"key": /* comment */ "value"}';
		const result = cleanJsonString(input);
		expect(result).toBe('{"key":  "value"}');
	});

	test("handles empty string", () => {
		const result = cleanJsonString("");
		expect(result).toBe("");
	});
});

describe("extractCodeBlock", () => {
	test("extracts JSON from markdown code block", () => {
		const input = '```json\n{"key": "value"}\n```';
		const result = extractCodeBlock(input, "json");
		expect(result).toBe('{"key": "value"}');
	});

	test("extracts code from generic code block", () => {
		const input = '```\n{"key": "value"}\n```';
		const result = extractCodeBlock(input);
		expect(result).toBe('{"key": "value"}');
	});

	test("returns null for no code block", () => {
		const input = '{"key": "value"}';
		const result = extractCodeBlock(input);
		expect(result).toBeNull();
	});

	test("extracts first code block when multiple present", () => {
		const input =
			'```json\n{"first": "block"}\n```\nText\n```json\n{"second": "block"}\n```';
		const result = extractCodeBlock(input, "json");
		expect(result).toBe('{"first": "block"}');
	});
});

describe("validateJson", () => {
	test("validates with type guard", () => {
		interface TestType {
			name: string;
		}
		const guard = (data: unknown): data is TestType => {
			return (
				typeof data === "object" &&
				data !== null &&
				"name" in data &&
				typeof (data as TestType).name === "string"
			);
		};

		const validData = { name: "test" };
		const result = validateJson(validData, guard);
		expect(result).toEqual(validData);
	});

	test("rejects invalid data", () => {
		interface TestType {
			name: string;
		}
		const guard = (data: unknown): data is TestType => {
			return (
				typeof data === "object" &&
				data !== null &&
				"name" in data &&
				typeof (data as TestType).name === "string"
			);
		};

		const invalidData = { age: 25 };
		const result = validateJson(invalidData, guard);
		expect(result).toBeNull();
	});
});

describe("parseJsonFromOutput", () => {
	test("parses direct JSON", () => {
		const input = '{"key": "value"}';
		const result = parseJsonFromOutput<{ key: string }>(input);
		expect(result).toEqual({ key: "value" });
	});

	test("parses JSON from markdown code block", () => {
		const input = 'Here is the result:\n```json\n{"key": "value"}\n```';
		const result = parseJsonFromOutput<{ key: string }>(input);
		expect(result).toEqual({ key: "value" });
	});

	test("extracts JSON from conversational text", () => {
		const input =
			'Sure, here is your data: {"key": "value"} Let me know if you need anything else.';
		const result = parseJsonFromOutput<{ key: string }>(input);
		expect(result).toEqual({ key: "value" });
	});

	test("extracts array from text", () => {
		const input = "Here are the items: [1, 2, 3]";
		const result = parseJsonFromOutput<number[]>(input);
		expect(result).toEqual([1, 2, 3]);
	});

	test("returns null for invalid JSON", () => {
		const input = "This is not JSON at all";
		const result = parseJsonFromOutput<{ key: string }>(input);
		expect(result).toBeNull();
	});

	test("returns null for empty string", () => {
		const result = parseJsonFromOutput<{ key: string }>("");
		expect(result).toBeNull();
	});

	test("handles nested braces correctly", () => {
		const input = 'Text {"outer": {"inner": "value"}} more text';
		const result = parseJsonFromOutput<{ outer: { inner: string } }>(input);
		expect(result).toEqual({ outer: { inner: "value" } });
	});
});

describe("parseJsonFromOutputSafe", () => {
	test("returns success with strategy for direct parse", () => {
		const input = '{"key": "value"}';
		const result = parseJsonFromOutputSafe<{ key: string }>(input);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toEqual({ key: "value" });
			expect(result.strategy).toBe("direct");
		}
	});

	test("returns success with strategy for markdown block", () => {
		const input = '```json\n{"key": "value"}\n```';
		const result = parseJsonFromOutputSafe<{ key: string }>(input);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toEqual({ key: "value" });
			expect(result.strategy).toBe("markdown_code_block");
		}
	});

	test("returns success with strategy for curly braces", () => {
		const input = 'Some text {"key": "value"} more text';
		const result = parseJsonFromOutputSafe<{ key: string }>(input);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toEqual({ key: "value" });
			expect(result.strategy).toBe("curly_braces");
		}
	});

	test("returns error for invalid JSON", () => {
		const input = "Not JSON";
		const result = parseJsonFromOutputSafe<{ key: string }>(input);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toContain("All parsing strategies failed");
			expect(result.rawOutput).toBe(input);
		}
	});

	test("returns error for empty string", () => {
		const result = parseJsonFromOutputSafe<{ key: string }>("");
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toBe("Empty output string");
		}
	});

	test("handles cleaned JSON with trailing commas", () => {
		const input = '{"key": "value",}';
		const result = parseJsonFromOutputSafe<{ key: string }>(input);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toEqual({ key: "value" });
			expect(result.strategy).toBe("cleaned_json");
		}
	});
});

describe("parseJsonArrayFromOutput", () => {
	test("parses direct array", () => {
		const input = "[1, 2, 3]";
		const result = parseJsonArrayFromOutput<number>(input);
		expect(result).toEqual([1, 2, 3]);
	});

	test("extracts array from object with 'stories' property", () => {
		const input = '{"stories": [1, 2, 3]}';
		const result = parseJsonArrayFromOutput<number>(input);
		expect(result).toEqual([1, 2, 3]);
	});

	test("extracts array from object with 'items' property", () => {
		const input = '{"items": ["a", "b"]}';
		const result = parseJsonArrayFromOutput<string>(input);
		expect(result).toEqual(["a", "b"]);
	});

	test("extracts array from markdown code block", () => {
		const input = "```json\n[1, 2, 3]\n```";
		const result = parseJsonArrayFromOutput<number>(input);
		expect(result).toEqual([1, 2, 3]);
	});

	test("returns null for non-array JSON", () => {
		const input = '{"key": "value"}';
		const result = parseJsonArrayFromOutput<unknown>(input);
		expect(result).toBeNull();
	});

	test("returns null for invalid JSON", () => {
		const input = "Not JSON";
		const result = parseJsonArrayFromOutput<unknown>(input);
		expect(result).toBeNull();
	});
});

describe("parseJsonArrayFromOutputSafe", () => {
	test("returns success for direct array", () => {
		const input = "[1, 2, 3]";
		const result = parseJsonArrayFromOutputSafe<number>(input);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toEqual([1, 2, 3]);
		}
	});

	test("returns success for object with array property", () => {
		const input = '{"stories": [1, 2, 3]}';
		const result = parseJsonArrayFromOutputSafe<number>(input);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toEqual([1, 2, 3]);
		}
	});

	test("returns error for non-array JSON", () => {
		const input = '{"key": "value"}';
		const result = parseJsonArrayFromOutputSafe<unknown>(input);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toContain("not an array");
		}
	});

	test("returns error for invalid JSON", () => {
		const input = "Not JSON";
		const result = parseJsonArrayFromOutputSafe<unknown>(input);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toContain("All parsing strategies failed");
		}
	});
});

describe("edge cases", () => {
	test("handles multiple code blocks (uses first)", () => {
		const input =
			'```json\n{"first": true}\n```\nSome text\n```json\n{"second": true}\n```';
		const result = parseJsonFromOutput<{ first: boolean }>(input);
		expect(result).toEqual({ first: true });
	});

	test("handles JSON with special characters", () => {
		const input = '{"text": "Line 1\\nLine 2\\tTabbed"}';
		const result = parseJsonFromOutput<{ text: string }>(input);
		expect(result).toEqual({ text: "Line 1\nLine 2\tTabbed" });
	});

	test("handles deeply nested JSON", () => {
		const input = '{"a": {"b": {"c": {"d": "value"}}}}';
		const result = parseJsonFromOutput<{
			a: { b: { c: { d: string } } };
		}>(input);
		expect(result).toEqual({ a: { b: { c: { d: "value" } } } });
	});

	test("handles large arrays", () => {
		const input = `[${Array.from({ length: 100 }, (_, i) => i).join(",")}]`;
		const result = parseJsonArrayFromOutput<number>(input);
		expect(result).toHaveLength(100);
		expect(result?.[0]).toBe(0);
		expect(result?.[99]).toBe(99);
	});

	test("handles JSON with Unicode characters", () => {
		const input = '{"emoji": "🚀", "chinese": "你好"}';
		const result = parseJsonFromOutput<{ emoji: string; chinese: string }>(
			input,
		);
		expect(result).toEqual({ emoji: "🚀", chinese: "你好" });
	});
});
