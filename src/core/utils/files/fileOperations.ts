/**
 * FileOperations - Service for file operations in workflows.
 *
 * Provides a clean API for reading and writing files with
 * Result-based error handling instead of exceptions.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { ResultBox } from "../result/result.js";
import { createFileError, type FileError, mapNodeError } from "./types.js";

/**
 * FileOperations - Wrapper for file system operations.
 *
 * Resolves paths relative to project or temp directory and
 * returns Results instead of throwing exceptions.
 *
 * @example
 * ```typescript
 * const files = new FileOperations(projectPath, tempDir);
 *
 * // Read JSON
 * const config = files.readJson<Config>("config.json");
 * if (config.isOk()) {
 *   console.log(config.unwrap().setting);
 * }
 *
 * // Write JSON
 * files.writeJson("output.json", data, true);
 *
 * // Read with fallback
 * const text = files.readTextOr("notes.txt", "No notes");
 * ```
 */
export class FileOperations {
	private readonly projectPath: string;
	private readonly tempDir: string;

	constructor(projectPath: string, tempDir: string) {
		this.projectPath = projectPath;
		this.tempDir = tempDir;
	}

	/**
	 * Resolve a path relative to project or temp directory.
	 * Absolute paths are returned as-is.
	 *
	 * @param filePath - The file path (can be relative or absolute)
	 * @param useTemp - If true, resolve relative to temp directory
	 */
	resolvePath(filePath: string, useTemp = false): string {
		if (path.isAbsolute(filePath)) {
			return filePath;
		}

		const basePath = useTemp ? this.tempDir : this.projectPath;
		return path.join(basePath, filePath);
	}

	/**
	 * Read and parse a JSON file.
	 *
	 * @param filePath - Path to the JSON file
	 * @param useTemp - If true, resolve relative to temp directory
	 * @returns ResultBox with parsed data or FileError
	 */
	readJson<T>(filePath: string, useTemp = false): ResultBox<T, FileError> {
		const fullPath = this.resolvePath(filePath, useTemp);

		try {
			const content = fs.readFileSync(fullPath, "utf-8");
			const data = JSON.parse(content) as T;
			return ResultBox.ok(data);
		} catch (error) {
			if (error instanceof SyntaxError) {
				return ResultBox.err(createFileError("PARSE_ERROR", fullPath, error));
			}
			return ResultBox.err(mapNodeError(fullPath, error));
		}
	}

	/**
	 * Read a JSON file with a fallback value.
	 *
	 * @param filePath - Path to the JSON file
	 * @param defaultValue - Value to return if file doesn't exist or can't be parsed
	 * @param useTemp - If true, resolve relative to temp directory
	 */
	readJsonOr<T>(filePath: string, defaultValue: T, useTemp = false): T {
		return this.readJson<T>(filePath, useTemp).unwrapOr(defaultValue);
	}

	/**
	 * Write data as JSON to a file.
	 *
	 * @param filePath - Path to write to
	 * @param data - Data to serialize
	 * @param pretty - If true, format with indentation
	 * @param useTemp - If true, resolve relative to temp directory
	 * @returns ResultBox with void on success or FileError
	 */
	writeJson<T>(
		filePath: string,
		data: T,
		pretty = true,
		useTemp = false,
	): ResultBox<void, FileError> {
		const fullPath = this.resolvePath(filePath, useTemp);

		try {
			const content = pretty
				? JSON.stringify(data, null, 2)
				: JSON.stringify(data);

			// Ensure directory exists
			const dir = path.dirname(fullPath);
			fs.mkdirSync(dir, { recursive: true });

			fs.writeFileSync(fullPath, content, "utf-8");
			return ResultBox.ok(undefined);
		} catch (error) {
			return ResultBox.err(mapNodeError(fullPath, error));
		}
	}

	/**
	 * Read a text file.
	 *
	 * @param filePath - Path to the file
	 * @param useTemp - If true, resolve relative to temp directory
	 * @returns ResultBox with content or FileError
	 */
	readText(filePath: string, useTemp = false): ResultBox<string, FileError> {
		const fullPath = this.resolvePath(filePath, useTemp);

		try {
			const content = fs.readFileSync(fullPath, "utf-8");
			return ResultBox.ok(content);
		} catch (error) {
			return ResultBox.err(mapNodeError(fullPath, error));
		}
	}

	/**
	 * Read a text file with a fallback value.
	 *
	 * @param filePath - Path to the file
	 * @param defaultValue - Value to return if file doesn't exist
	 * @param useTemp - If true, resolve relative to temp directory
	 */
	readTextOr(filePath: string, defaultValue: string, useTemp = false): string {
		return this.readText(filePath, useTemp).unwrapOr(defaultValue);
	}

	/**
	 * Write text to a file.
	 *
	 * @param filePath - Path to write to
	 * @param content - Text content to write
	 * @param useTemp - If true, resolve relative to temp directory
	 * @returns ResultBox with void on success or FileError
	 */
	writeText(
		filePath: string,
		content: string,
		useTemp = false,
	): ResultBox<void, FileError> {
		const fullPath = this.resolvePath(filePath, useTemp);

		try {
			// Ensure directory exists
			const dir = path.dirname(fullPath);
			fs.mkdirSync(dir, { recursive: true });

			fs.writeFileSync(fullPath, content, "utf-8");
			return ResultBox.ok(undefined);
		} catch (error) {
			return ResultBox.err(mapNodeError(fullPath, error));
		}
	}

	/**
	 * Append text to a file.
	 *
	 * @param filePath - Path to the file
	 * @param content - Text content to append
	 * @param useTemp - If true, resolve relative to temp directory
	 * @returns ResultBox with void on success or FileError
	 */
	appendText(
		filePath: string,
		content: string,
		useTemp = false,
	): ResultBox<void, FileError> {
		const fullPath = this.resolvePath(filePath, useTemp);

		try {
			// Ensure directory exists
			const dir = path.dirname(fullPath);
			fs.mkdirSync(dir, { recursive: true });

			fs.appendFileSync(fullPath, content, "utf-8");
			return ResultBox.ok(undefined);
		} catch (error) {
			return ResultBox.err(mapNodeError(fullPath, error));
		}
	}

	/**
	 * Check if a file exists.
	 *
	 * @param filePath - Path to check
	 * @param useTemp - If true, resolve relative to temp directory
	 */
	exists(filePath: string, useTemp = false): boolean {
		const fullPath = this.resolvePath(filePath, useTemp);
		return fs.existsSync(fullPath);
	}

	/**
	 * Check if a path is a directory.
	 *
	 * @param filePath - Path to check
	 * @param useTemp - If true, resolve relative to temp directory
	 */
	isDirectory(filePath: string, useTemp = false): boolean {
		const fullPath = this.resolvePath(filePath, useTemp);
		try {
			return fs.statSync(fullPath).isDirectory();
		} catch {
			return false;
		}
	}

	/**
	 * Ensure a directory exists, creating it if necessary.
	 *
	 * @param dirPath - Directory path
	 * @param useTemp - If true, resolve relative to temp directory
	 * @returns ResultBox with void on success or FileError
	 */
	ensureDir(dirPath: string, useTemp = false): ResultBox<void, FileError> {
		const fullPath = this.resolvePath(dirPath, useTemp);

		try {
			fs.mkdirSync(fullPath, { recursive: true });
			return ResultBox.ok(undefined);
		} catch (error) {
			return ResultBox.err(mapNodeError(fullPath, error));
		}
	}

	/**
	 * Delete a file.
	 *
	 * @param filePath - Path to the file
	 * @param useTemp - If true, resolve relative to temp directory
	 * @returns ResultBox with void on success or FileError
	 */
	delete(filePath: string, useTemp = false): ResultBox<void, FileError> {
		const fullPath = this.resolvePath(filePath, useTemp);

		try {
			if (fs.existsSync(fullPath)) {
				fs.unlinkSync(fullPath);
			}
			return ResultBox.ok(undefined);
		} catch (error) {
			return ResultBox.err(mapNodeError(fullPath, error));
		}
	}

	/**
	 * List files in a directory.
	 *
	 * @param dirPath - Directory path
	 * @param useTemp - If true, resolve relative to temp directory
	 * @returns ResultBox with array of filenames or FileError
	 */
	listDir(dirPath: string, useTemp = false): ResultBox<string[], FileError> {
		const fullPath = this.resolvePath(dirPath, useTemp);

		try {
			const files = fs.readdirSync(fullPath);
			return ResultBox.ok(files);
		} catch (error) {
			return ResultBox.err(mapNodeError(fullPath, error));
		}
	}

	/**
	 * Copy a file.
	 *
	 * @param srcPath - Source file path
	 * @param destPath - Destination file path
	 * @param useTemp - If true, resolve relative to temp directory
	 * @returns ResultBox with void on success or FileError
	 */
	copy(
		srcPath: string,
		destPath: string,
		useTemp = false,
	): ResultBox<void, FileError> {
		const fullSrcPath = this.resolvePath(srcPath, useTemp);
		const fullDestPath = this.resolvePath(destPath, useTemp);

		try {
			// Ensure destination directory exists
			const dir = path.dirname(fullDestPath);
			fs.mkdirSync(dir, { recursive: true });

			fs.copyFileSync(fullSrcPath, fullDestPath);
			return ResultBox.ok(undefined);
		} catch (error) {
			return ResultBox.err(mapNodeError(fullSrcPath, error));
		}
	}

	/**
	 * Get the project path.
	 */
	getProjectPath(): string {
		return this.projectPath;
	}

	/**
	 * Get the temp directory path.
	 */
	getTempDir(): string {
		return this.tempDir;
	}
}
