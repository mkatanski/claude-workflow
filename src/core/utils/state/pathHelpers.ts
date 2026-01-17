/**
 * Path-based helpers for nested object manipulation.
 *
 * These functions allow getting and setting values in deeply nested
 * objects using dot-notation paths like "config.database.host".
 */

/**
 * Parse a dot-notation path into an array of keys.
 * Handles array indices like "items[0].name".
 *
 * @param path - The dot-notation path string
 * @returns Array of path segments
 *
 * @example
 * ```typescript
 * parsePath("config.database.host") // ["config", "database", "host"]
 * parsePath("items[0].name")        // ["items", "0", "name"]
 * ```
 */
export function parsePath(path: string): string[] {
	if (!path) {
		return [];
	}

	// Replace array notation [0] with .0
	const normalized = path.replace(/\[(\d+)\]/g, ".$1");
	return normalized.split(".").filter(Boolean);
}

/**
 * Get a value from a nested object using a dot-notation path.
 *
 * @param obj - The source object
 * @param path - The dot-notation path
 * @param defaultValue - Optional default value if path doesn't exist
 * @returns The value at the path, or the default value
 *
 * @example
 * ```typescript
 * const obj = { config: { database: { host: "localhost" } } };
 * getPath(obj, "config.database.host")           // "localhost"
 * getPath(obj, "config.database.port", 5432)     // 5432
 * getPath(obj, "nonexistent")                    // undefined
 * ```
 */
export function getPath<T = unknown>(
	obj: unknown,
	path: string,
	defaultValue?: T,
): T | undefined {
	const keys = parsePath(path);

	let current: unknown = obj;
	for (const key of keys) {
		if (current === null || current === undefined) {
			return defaultValue;
		}

		if (typeof current !== "object") {
			return defaultValue;
		}

		current = (current as Record<string, unknown>)[key];
	}

	if (current === undefined) {
		return defaultValue;
	}

	return current as T;
}

/**
 * Set a value in a nested object using a dot-notation path.
 * Returns a new object with the value set (immutable).
 *
 * @param obj - The source object
 * @param path - The dot-notation path
 * @param value - The value to set
 * @returns A new object with the value set at the path
 *
 * @example
 * ```typescript
 * const obj = { config: { database: { host: "localhost" } } };
 * const updated = setPath(obj, "config.database.port", 5432);
 * // { config: { database: { host: "localhost", port: 5432 } } }
 * ```
 */
export function setPath<T extends Record<string, unknown>>(
	obj: T,
	path: string,
	value: unknown,
): T {
	const keys = parsePath(path);

	if (keys.length === 0) {
		return obj;
	}

	return setPathRecursive(obj, keys, value) as T;
}

/**
 * Internal recursive helper for setPath.
 */
function setPathRecursive(
	obj: unknown,
	keys: string[],
	value: unknown,
): unknown {
	if (keys.length === 0) {
		return value;
	}

	const [key, ...restKeys] = keys;
	const isArrayIndex = /^\d+$/.test(key);

	// Handle arrays
	if (isArrayIndex) {
		const index = parseInt(key, 10);
		const arr = Array.isArray(obj) ? [...obj] : [];

		// Expand array if needed
		while (arr.length <= index) {
			arr.push(undefined);
		}

		arr[index] = setPathRecursive(arr[index], restKeys, value);
		return arr;
	}

	// Handle objects
	const currentObj =
		obj !== null && typeof obj === "object" && !Array.isArray(obj)
			? { ...(obj as Record<string, unknown>) }
			: {};

	currentObj[key] = setPathRecursive(currentObj[key], restKeys, value);
	return currentObj;
}

/**
 * Delete a value from a nested object using a dot-notation path.
 * Returns a new object with the value removed (immutable).
 *
 * @param obj - The source object
 * @param path - The dot-notation path
 * @returns A new object with the value removed
 *
 * @example
 * ```typescript
 * const obj = { config: { database: { host: "localhost", port: 5432 } } };
 * const updated = deletePath(obj, "config.database.port");
 * // { config: { database: { host: "localhost" } } }
 * ```
 */
export function deletePath<T extends Record<string, unknown>>(
	obj: T,
	path: string,
): T {
	const keys = parsePath(path);

	if (keys.length === 0) {
		return obj;
	}

	return deletePathRecursive(obj, keys) as T;
}

/**
 * Internal recursive helper for deletePath.
 */
function deletePathRecursive(obj: unknown, keys: string[]): unknown {
	if (obj === null || obj === undefined || typeof obj !== "object") {
		return obj;
	}

	const [key, ...restKeys] = keys;

	// Handle arrays
	if (Array.isArray(obj)) {
		const index = parseInt(key, 10);
		if (Number.isNaN(index) || index < 0 || index >= obj.length) {
			return [...obj];
		}

		if (restKeys.length === 0) {
			// Remove the element
			return [...obj.slice(0, index), ...obj.slice(index + 1)];
		}

		const arr = [...obj];
		arr[index] = deletePathRecursive(arr[index], restKeys);
		return arr;
	}

	// Handle objects
	const currentObj = { ...(obj as Record<string, unknown>) };

	if (restKeys.length === 0) {
		delete currentObj[key];
	} else if (key in currentObj) {
		currentObj[key] = deletePathRecursive(currentObj[key], restKeys);
	}

	return currentObj;
}

/**
 * Check if a path exists in an object.
 *
 * @param obj - The source object
 * @param path - The dot-notation path
 * @returns true if the path exists
 */
export function hasPath(obj: unknown, path: string): boolean {
	const keys = parsePath(path);

	let current: unknown = obj;
	for (const key of keys) {
		if (current === null || current === undefined) {
			return false;
		}

		if (typeof current !== "object") {
			return false;
		}

		if (!(key in (current as Record<string, unknown>))) {
			return false;
		}

		current = (current as Record<string, unknown>)[key];
	}

	return true;
}

/**
 * Merge a value into a nested object at a path.
 * If the value at the path is an object, it will be merged.
 * Otherwise, it will be replaced.
 *
 * @param obj - The source object
 * @param path - The dot-notation path
 * @param value - The value to merge
 * @returns A new object with the value merged
 */
export function mergePath<T extends Record<string, unknown>>(
	obj: T,
	path: string,
	value: Record<string, unknown>,
): T {
	const existing = getPath(obj, path);

	if (
		existing !== null &&
		typeof existing === "object" &&
		!Array.isArray(existing)
	) {
		return setPath(obj, path, { ...existing, ...value });
	}

	return setPath(obj, path, value);
}
