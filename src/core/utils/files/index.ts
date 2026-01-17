/**
 * File operations utilities for workflows.
 *
 * Provides a Result-based API for file system operations,
 * replacing bash-based file reads/writes with type-safe methods.
 *
 * @example
 * ```typescript
 * import { FileOperations } from "@/core/utils/files";
 *
 * const files = new FileOperations(projectPath, tempDir);
 *
 * // Read JSON with Result
 * const config = files.readJson<Config>("config.json");
 * if (config.isOk()) {
 *   console.log(config.unwrap().setting);
 * }
 *
 * // Read with fallback
 * const data = files.readJsonOr<Data>("data.json", defaultData);
 *
 * // Write JSON
 * files.writeJson("output.json", data);
 *
 * // Read/write text
 * const content = files.readTextOr("notes.txt", "");
 * files.appendText("log.txt", "New line\n");
 * ```
 *
 * @module
 */

export { FileOperations } from "./fileOperations.js";

export {
	createFileError,
	type FileError,
	type FileErrorCode,
	isNotFoundError,
	isPermissionError,
	mapNodeError,
} from "./types.js";
