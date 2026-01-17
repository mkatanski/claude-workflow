/**
 * Types for file operations.
 */

/**
 * File error codes for categorizing file operation failures.
 */
export type FileErrorCode =
	| "NOT_FOUND"
	| "PARSE_ERROR"
	| "WRITE_ERROR"
	| "PERMISSION_DENIED"
	| "INVALID_PATH";

/**
 * Structured error for file operations.
 */
export interface FileError {
	/** Error category */
	code: FileErrorCode;
	/** Human-readable error message */
	message: string;
	/** File path that caused the error */
	path: string;
	/** Optional underlying error */
	cause?: Error;
}

/**
 * Create a FileError from an Error object.
 */
export function createFileError(
	code: FileErrorCode,
	path: string,
	cause?: Error,
): FileError {
	const messages: Record<FileErrorCode, string> = {
		NOT_FOUND: `File not found: ${path}`,
		PARSE_ERROR: `Failed to parse file: ${path}`,
		WRITE_ERROR: `Failed to write file: ${path}`,
		PERMISSION_DENIED: `Permission denied: ${path}`,
		INVALID_PATH: `Invalid path: ${path}`,
	};

	return {
		code,
		message: cause ? `${messages[code]}: ${cause.message}` : messages[code],
		path,
		cause,
	};
}

/**
 * Check if an error is a "file not found" error.
 */
export function isNotFoundError(error: unknown): boolean {
	if (error instanceof Error) {
		const nodeError = error as NodeJS.ErrnoException;
		return nodeError.code === "ENOENT";
	}
	return false;
}

/**
 * Check if an error is a permission error.
 */
export function isPermissionError(error: unknown): boolean {
	if (error instanceof Error) {
		const nodeError = error as NodeJS.ErrnoException;
		return nodeError.code === "EACCES" || nodeError.code === "EPERM";
	}
	return false;
}

/**
 * Map a Node.js error to a FileError.
 */
export function mapNodeError(path: string, error: unknown): FileError {
	if (!(error instanceof Error)) {
		return createFileError("WRITE_ERROR", path);
	}

	const nodeError = error as NodeJS.ErrnoException;

	if (nodeError.code === "ENOENT") {
		return createFileError("NOT_FOUND", path, error);
	}

	if (nodeError.code === "EACCES" || nodeError.code === "EPERM") {
		return createFileError("PERMISSION_DENIED", path, error);
	}

	return createFileError("WRITE_ERROR", path, error);
}
