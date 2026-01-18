/**
 * Unit tests for stack trace formatter utilities.
 */

import { describe, expect, it } from "bun:test";
import {
	combineStackTraces,
	DEFAULT_STACK_FORMAT_OPTIONS,
	extractTopFrame,
	formatErrorStack,
	formatFrameLocation,
	formatStackTrace,
	parseStackTrace,
	type ParsedStackTrace,
	type StackFrame,
} from "./stackTraceFormatter.js";

describe("parseStackTrace", () => {
	it("should parse V8 format stack trace", () => {
		const error = new Error("Test error");
		const parsed = parseStackTrace(error);

		expect(parsed.message).toContain("Test error");
		expect(parsed.frames.length).toBeGreaterThan(0);
		expect(parsed.raw).toBe(error.stack ?? "");
	});

	it("should parse function name and location", () => {
		const error = new Error("Test");
		const parsed = parseStackTrace(error);

		// At least one frame should have file info
		const frameWithFile = parsed.frames.find((f) => f.fileName);
		expect(frameWithFile).toBeDefined();
		if (frameWithFile) {
			expect(frameWithFile.lineNumber).toBeGreaterThan(0);
		}
	});

	it("should identify application code vs node_modules", () => {
		const error = new Error("Test");
		const parsed = parseStackTrace(error);

		// Current file should be marked as app code
		const appFrame = parsed.frames.find((f) => f.isAppCode);
		expect(appFrame).toBeDefined();
	});

	it("should handle error without stack", () => {
		const error = new Error("No stack");
		error.stack = undefined;

		const parsed = parseStackTrace(error);

		expect(parsed.message).toBe("No stack");
		expect(parsed.frames).toEqual([]);
		expect(parsed.raw).toBe("");
	});

	it("should handle empty lines in stack trace", () => {
		const error = new Error("Test");
		// Modify stack to include empty lines
		error.stack = `Error: Test

    at testFunction (file.ts:10:5)

    at anotherFunction (file.ts:20:10)
`;
		const parsed = parseStackTrace(error);

		expect(parsed.frames.length).toBe(2);
	});
});

describe("formatStackTrace", () => {
	it("should format parsed stack trace", () => {
		const parsed: ParsedStackTrace = {
			message: "Error: Test error",
			frames: [
				{
					functionName: "testFunction",
					fileName: "/app/src/test.ts",
					lineNumber: 10,
					columnNumber: 5,
					raw: "    at testFunction (/app/src/test.ts:10:5)",
					isAppCode: true,
				},
			],
			raw: "original stack",
		};

		const formatted = formatStackTrace(parsed);

		expect(formatted).toContain("Error: Test error");
		expect(formatted).toContain("testFunction");
		expect(formatted).toContain("/app/src/test.ts");
		expect(formatted).toContain(":10");
	});

	it("should filter node_modules frames when enabled", () => {
		const parsed: ParsedStackTrace = {
			message: "Error",
			frames: [
				{
					functionName: "appFunc",
					fileName: "/app/src/index.ts",
					lineNumber: 5,
					columnNumber: 1,
					raw: "at appFunc",
					isAppCode: true,
				},
				{
					functionName: "libFunc",
					fileName: "/app/node_modules/lib/index.js",
					lineNumber: 100,
					columnNumber: 1,
					raw: "at libFunc",
					isAppCode: false,
				},
			],
			raw: "",
		};

		const formatted = formatStackTrace(parsed, {
			filterNodeModules: true,
		});

		expect(formatted).toContain("appFunc");
		expect(formatted).not.toContain("libFunc");
	});

	it("should include node_modules frames when filter disabled", () => {
		const parsed: ParsedStackTrace = {
			message: "Error",
			frames: [
				{
					functionName: "libFunc",
					fileName: "/node_modules/lib/index.js",
					lineNumber: 100,
					columnNumber: 1,
					raw: "at libFunc",
					isAppCode: false,
				},
			],
			raw: "",
		};

		const formatted = formatStackTrace(parsed, {
			filterNodeModules: false,
		});

		expect(formatted).toContain("libFunc");
	});

	it("should limit number of frames", () => {
		const parsed: ParsedStackTrace = {
			message: "Error",
			frames: Array(20)
				.fill(null)
				.map((_, i) => ({
					functionName: `func${i}`,
					fileName: `/app/src/file${i}.ts`,
					lineNumber: i,
					columnNumber: 1,
					raw: `at func${i}`,
					isAppCode: true,
				})),
			raw: "",
		};

		const formatted = formatStackTrace(parsed, {
			maxFrames: 5,
			filterNodeModules: false,
		});

		expect(formatted).toContain("func0");
		expect(formatted).toContain("func4");
		expect(formatted).not.toContain("func5");
		expect(formatted).toContain("15 more frames");
	});

	it("should hide message when option disabled", () => {
		const parsed: ParsedStackTrace = {
			message: "Error: Secret message",
			frames: [],
			raw: "",
		};

		const formatted = formatStackTrace(parsed, {
			includeMessage: false,
		});

		expect(formatted).not.toContain("Secret message");
	});

	it("should hide file positions when option disabled", () => {
		const parsed: ParsedStackTrace = {
			message: "Error",
			frames: [
				{
					functionName: "test",
					fileName: "/app/test.ts",
					lineNumber: 42,
					columnNumber: 10,
					raw: "at test",
					isAppCode: true,
				},
			],
			raw: "",
		};

		const formatted = formatStackTrace(parsed, {
			includePositions: false,
		});

		expect(formatted).toContain("/app/test.ts");
		expect(formatted).not.toContain(":42");
		expect(formatted).not.toContain(":10");
	});

	it("should highlight app code when enabled", () => {
		const parsed: ParsedStackTrace = {
			message: "Error",
			frames: [
				{
					functionName: "appFunc",
					fileName: "/app/src/index.ts",
					lineNumber: 1,
					columnNumber: 1,
					raw: "at appFunc",
					isAppCode: true,
				},
			],
			raw: "",
		};

		const formatted = formatStackTrace(parsed, {
			highlightAppCode: true,
		});

		expect(formatted).toContain("[app]");
	});

	it("should use custom indentation", () => {
		const parsed: ParsedStackTrace = {
			message: "Error",
			frames: [
				{
					functionName: "test",
					fileName: "/app/test.ts",
					lineNumber: 1,
					columnNumber: 1,
					raw: "at test",
					isAppCode: true,
				},
			],
			raw: "",
		};

		const formatted = formatStackTrace(parsed, {
			indent: "    ",
		});

		expect(formatted).toContain("    at");
	});
});

describe("formatErrorStack", () => {
	it("should parse and format error in one call", () => {
		const error = new Error("Test error");
		const formatted = formatErrorStack(error);

		expect(formatted).toContain("Test error");
		expect(formatted).toContain("at");
	});

	it("should apply formatting options", () => {
		const error = new Error("Test");
		const formatted = formatErrorStack(error, {
			maxFrames: 2,
			includeMessage: false,
		});

		expect(formatted).not.toContain("Test");
	});
});

describe("extractTopFrame", () => {
	it("should return first application code frame", () => {
		const error = new Error("Test");
		const frame = extractTopFrame(error);

		expect(frame).toBeDefined();
		expect(frame?.fileName).toContain("stackTraceFormatter.test.ts");
	});

	it("should fall back to first frame if no app code", () => {
		const error = new Error("Test");
		// Simulate stack with only non-app frames
		error.stack = `Error: Test
    at internal (node:internal/module:123:45)
    at node:vm:456:78`;

		const frame = extractTopFrame(error);

		// Should return first frame even if not app code
		expect(frame).toBeDefined();
	});

	it("should return null for error without frames", () => {
		const error = new Error("Test");
		error.stack = "Error: Test";

		const frame = extractTopFrame(error);

		expect(frame).toBeNull();
	});
});

describe("formatFrameLocation", () => {
	it("should format frame with file and line", () => {
		const frame: StackFrame = {
			fileName: "/app/src/index.ts",
			lineNumber: 42,
			raw: "at index.ts:42",
		};

		const location = formatFrameLocation(frame);

		expect(location).toBe("/app/src/index.ts:42");
	});

	it("should format frame without line number", () => {
		const frame: StackFrame = {
			fileName: "/app/src/index.ts",
			raw: "at index.ts",
		};

		const location = formatFrameLocation(frame);

		expect(location).toBe("/app/src/index.ts");
	});

	it("should return 'unknown' for null frame", () => {
		const location = formatFrameLocation(null);

		expect(location).toBe("unknown");
	});

	it("should return 'unknown' for frame without filename", () => {
		const frame: StackFrame = {
			raw: "at anonymous",
		};

		const location = formatFrameLocation(frame);

		expect(location).toBe("unknown");
	});
});

describe("combineStackTraces", () => {
	it("should combine multiple error stacks", () => {
		const error1 = new Error("First error");
		const error2 = new Error("Second error");

		const combined = combineStackTraces([error1, error2]);

		expect(combined).toContain("First error");
		expect(combined).toContain("Second error");
		expect(combined).toContain("Caused by:");
	});

	it("should use custom separator", () => {
		const error1 = new Error("Error 1");
		const error2 = new Error("Error 2");

		const combined = combineStackTraces([error1, error2], "\n--- CAUSE ---\n");

		expect(combined).toContain("--- CAUSE ---");
	});

	it("should handle single error", () => {
		const error = new Error("Single error");
		const combined = combineStackTraces([error]);

		expect(combined).toContain("Single error");
		expect(combined).not.toContain("Caused by:");
	});

	it("should handle empty array", () => {
		const combined = combineStackTraces([]);

		expect(combined).toBe("");
	});
});

describe("DEFAULT_STACK_FORMAT_OPTIONS", () => {
	it("should have sensible defaults", () => {
		expect(DEFAULT_STACK_FORMAT_OPTIONS.includeFiles).toBe(true);
		expect(DEFAULT_STACK_FORMAT_OPTIONS.includePositions).toBe(true);
		expect(DEFAULT_STACK_FORMAT_OPTIONS.filterNodeModules).toBe(true);
		expect(DEFAULT_STACK_FORMAT_OPTIONS.maxFrames).toBe(10);
		expect(DEFAULT_STACK_FORMAT_OPTIONS.includeMessage).toBe(true);
		expect(DEFAULT_STACK_FORMAT_OPTIONS.indent).toBe("  ");
		expect(DEFAULT_STACK_FORMAT_OPTIONS.highlightAppCode).toBe(true);
	});
});
