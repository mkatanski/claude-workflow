/**
 * StackTraceFormatter - Format and enrich stack traces for workflow errors.
 *
 * Provides stack trace parsing, formatting with source mapping support,
 * and integration with WorkflowError classes for better debugging.
 */

// ============================================================================
// Stack Trace Types
// ============================================================================

/**
 * Represents a single frame in a stack trace.
 */
export interface StackFrame {
	/** Function name (if available) */
	functionName?: string;
	/** File path or URL */
	fileName?: string;
	/** Line number in the file */
	lineNumber?: number;
	/** Column number in the file */
	columnNumber?: number;
	/** Raw stack trace line */
	raw: string;
	/** Whether this frame is from application code (vs node_modules) */
	isAppCode?: boolean;
}

/**
 * Parsed stack trace with metadata.
 */
export interface ParsedStackTrace {
	/** Error message (first line of stack trace) */
	message: string;
	/** Parsed stack frames */
	frames: StackFrame[];
	/** Raw stack trace string */
	raw: string;
}

/**
 * Configuration for stack trace formatting.
 */
export interface StackTraceFormatOptions {
	/** Include source file paths */
	includeFiles?: boolean;
	/** Include line and column numbers */
	includePositions?: boolean;
	/** Filter out node_modules frames */
	filterNodeModules?: boolean;
	/** Maximum number of frames to display (0 = unlimited) */
	maxFrames?: number;
	/** Include the error message in output */
	includeMessage?: boolean;
	/** Indentation string for stack frames */
	indent?: string;
	/** Highlight application code frames */
	highlightAppCode?: boolean;
}

/**
 * Default stack trace formatting options.
 */
export const DEFAULT_STACK_FORMAT_OPTIONS: Required<StackTraceFormatOptions> = {
	includeFiles: true,
	includePositions: true,
	filterNodeModules: true,
	maxFrames: 10,
	includeMessage: true,
	indent: "  ",
	highlightAppCode: true,
};

// ============================================================================
// Stack Trace Parsing
// ============================================================================

/**
 * Parse an Error's stack trace into structured frames.
 *
 * @param error - Error object to parse
 * @returns Parsed stack trace with frames
 *
 * @example
 * ```typescript
 * const error = new Error("Something went wrong");
 * const parsed = parseStackTrace(error);
 * console.log(parsed.frames[0].fileName); // "myFile.ts"
 * ```
 */
export function parseStackTrace(error: Error): ParsedStackTrace {
	const stackString = error.stack ?? "";
	const lines = stackString.split("\n");

	// First line is typically the error message
	const message = lines[0] || error.message;

	// Parse remaining lines as stack frames
	const frames: StackFrame[] = [];
	for (let i = 1; i < lines.length; i++) {
		const line = lines[i];
		if (!line.trim()) {
			continue;
		}

		const frame = parseStackFrame(line);
		if (frame) {
			frames.push(frame);
		}
	}

	return {
		message,
		frames,
		raw: stackString,
	};
}

/**
 * Parse a single stack trace line into a StackFrame.
 *
 * Handles multiple stack trace formats:
 * - V8 (Chrome/Node): "    at functionName (file.ts:10:5)"
 * - V8 anonymous: "    at file.ts:10:5"
 * - Firefox: "functionName@file.ts:10:5"
 *
 * @param line - Stack trace line to parse
 * @returns Parsed stack frame or null if unparseable
 */
function parseStackFrame(line: string): StackFrame | null {
	const trimmed = line.trim();

	// V8 format: "at functionName (file.ts:10:5)" or "at file.ts:10:5"
	const v8Match = trimmed.match(/^at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/);
	if (v8Match) {
		const [, functionName, fileName, lineNumber, columnNumber] = v8Match;
		return {
			functionName: functionName?.trim() || undefined,
			fileName: fileName?.trim(),
			lineNumber: Number.parseInt(lineNumber, 10),
			columnNumber: Number.parseInt(columnNumber, 10),
			raw: line,
			isAppCode: isApplicationCode(fileName?.trim()),
		};
	}

	// Firefox format: "functionName@file.ts:10:5"
	const firefoxMatch = trimmed.match(/^(.+?)@(.+?):(\d+):(\d+)$/);
	if (firefoxMatch) {
		const [, functionName, fileName, lineNumber, columnNumber] = firefoxMatch;
		return {
			functionName: functionName?.trim() || undefined,
			fileName: fileName?.trim(),
			lineNumber: Number.parseInt(lineNumber, 10),
			columnNumber: Number.parseInt(columnNumber, 10),
			raw: line,
			isAppCode: isApplicationCode(fileName?.trim()),
		};
	}

	// Couldn't parse - return raw line
	return {
		raw: line,
		isAppCode: false,
	};
}

/**
 * Determine if a file path is application code (vs dependencies).
 *
 * @param fileName - File path to check
 * @returns True if this is application code
 */
function isApplicationCode(fileName?: string): boolean {
	if (!fileName) {
		return false;
	}

	// Filter out node_modules and built-in modules
	return (
		!fileName.includes("node_modules") &&
		!fileName.startsWith("node:") &&
		!fileName.startsWith("internal/")
	);
}

// ============================================================================
// Stack Trace Formatting
// ============================================================================

/**
 * Format a parsed stack trace as a human-readable string.
 *
 * @param parsed - Parsed stack trace
 * @param options - Formatting options
 * @returns Formatted stack trace string
 *
 * @example
 * ```typescript
 * const error = new Error("Something went wrong");
 * const parsed = parseStackTrace(error);
 * const formatted = formatStackTrace(parsed, {
 *   filterNodeModules: true,
 *   maxFrames: 5,
 * });
 * console.log(formatted);
 * ```
 */
export function formatStackTrace(
	parsed: ParsedStackTrace,
	options?: StackTraceFormatOptions,
): string {
	const opts = { ...DEFAULT_STACK_FORMAT_OPTIONS, ...options };
	const lines: string[] = [];

	// Add error message
	if (opts.includeMessage && parsed.message) {
		lines.push(parsed.message);
	}

	// Filter and limit frames
	let frames = parsed.frames;
	if (opts.filterNodeModules) {
		frames = frames.filter((f) => f.isAppCode !== false);
	}
	if (opts.maxFrames > 0 && frames.length > opts.maxFrames) {
		frames = frames.slice(0, opts.maxFrames);
	}

	// Format each frame
	for (const frame of frames) {
		const frameLine = formatStackFrame(frame, opts);
		lines.push(frameLine);
	}

	// Add truncation notice if frames were cut off
	if (opts.maxFrames > 0 && parsed.frames.length > opts.maxFrames) {
		const remaining = parsed.frames.length - opts.maxFrames;
		lines.push(`${opts.indent}... and ${remaining} more frames`);
	}

	return lines.join("\n");
}

/**
 * Format a single stack frame.
 *
 * @param frame - Stack frame to format
 * @param options - Formatting options
 * @returns Formatted frame string
 */
function formatStackFrame(
	frame: StackFrame,
	options: Required<StackTraceFormatOptions>,
): string {
	const parts: string[] = [options.indent + "at"];

	// Add function name if available
	if (frame.functionName) {
		parts.push(frame.functionName);
	}

	// Add file and position
	if (options.includeFiles && frame.fileName) {
		const location = [frame.fileName];

		if (options.includePositions) {
			if (frame.lineNumber !== undefined) {
				location.push(`:${frame.lineNumber}`);
			}
			if (frame.columnNumber !== undefined) {
				location.push(`:${frame.columnNumber}`);
			}
		}

		if (frame.functionName) {
			parts.push(`(${location.join("")})`);
		} else {
			parts.push(location.join(""));
		}
	}

	// Highlight application code if enabled
	let result = parts.join(" ");
	if (options.highlightAppCode && frame.isAppCode) {
		result = `${result} [app]`;
	}

	return result;
}

/**
 * Format an Error's stack trace directly.
 * Convenience method that combines parsing and formatting.
 *
 * @param error - Error to format
 * @param options - Formatting options
 * @returns Formatted stack trace string
 *
 * @example
 * ```typescript
 * try {
 *   throw new Error("Something went wrong");
 * } catch (error) {
 *   console.error(formatErrorStack(error as Error));
 * }
 * ```
 */
export function formatErrorStack(
	error: Error,
	options?: StackTraceFormatOptions,
): string {
	const parsed = parseStackTrace(error);
	return formatStackTrace(parsed, options);
}

// ============================================================================
// Stack Trace Enrichment
// ============================================================================

/**
 * Extract the most relevant stack frame (first application code frame).
 *
 * @param error - Error to extract frame from
 * @returns First application code frame, or first frame, or null
 *
 * @example
 * ```typescript
 * const error = new Error("Something went wrong");
 * const topFrame = extractTopFrame(error);
 * if (topFrame?.fileName) {
 *   console.log(`Error in ${topFrame.fileName}:${topFrame.lineNumber}`);
 * }
 * ```
 */
export function extractTopFrame(error: Error): StackFrame | null {
	const parsed = parseStackTrace(error);

	// Try to find first application code frame
	const appFrame = parsed.frames.find((f) => f.isAppCode);
	if (appFrame) {
		return appFrame;
	}

	// Fall back to first frame
	return parsed.frames[0] || null;
}

/**
 * Create a concise error location string from a stack frame.
 *
 * @param frame - Stack frame
 * @returns Location string like "file.ts:10" or "unknown"
 */
export function formatFrameLocation(frame: StackFrame | null): string {
	if (!frame || !frame.fileName) {
		return "unknown";
	}

	const parts = [frame.fileName];
	if (frame.lineNumber !== undefined) {
		parts.push(`:${frame.lineNumber}`);
	}

	return parts.join("");
}

/**
 * Combine multiple errors' stack traces into a single trace.
 * Useful for error chaining and cause tracking.
 *
 * @param errors - Errors to combine (in order from most recent to root cause)
 * @param separator - Separator between stack traces
 * @returns Combined stack trace string
 *
 * @example
 * ```typescript
 * const rootError = new Error("Database connection failed");
 * const wrapperError = new WorkflowError("Query failed", { cause: rootError });
 * const combined = combineStackTraces([wrapperError, rootError]);
 * ```
 */
export function combineStackTraces(
	errors: Error[],
	separator = "\nCaused by:\n",
): string {
	return errors.map((error) => formatErrorStack(error)).join(separator);
}
