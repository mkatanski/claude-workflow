/**
 * Semver version utilities for workflow registry resolution.
 *
 * This module provides semver utilities using Bun.semver for:
 * - Version satisfaction checking
 * - Version comparison and sorting
 * - Finding the highest satisfying version (maxSatisfying)
 *
 * Note: Bun.semver only provides `satisfies()` and `order()` functions,
 * so `maxSatisfying()` is implemented manually using these primitives.
 *
 * @see https://bun.sh/docs/api/semver
 */

// ============================================================================
// Version Validation
// ============================================================================

/**
 * Regex pattern for semantic versioning.
 *
 * Supports:
 * - Basic version: 1.0.0
 * - Pre-release: 1.0.0-alpha, 1.0.0-beta.1
 * - Build metadata: 1.0.0+build.123
 * - Combined: 1.0.0-alpha.1+build.456
 */
const SEMVER_PATTERN =
	/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

/**
 * Check if a string is a valid semantic version.
 *
 * Validates against the full semver specification:
 * - MAJOR.MINOR.PATCH format (required)
 * - Pre-release suffix (optional): -alpha, -beta.1, -rc.2
 * - Build metadata (optional): +build.123
 *
 * @param version - The version string to validate
 * @returns True if the version follows semver format
 *
 * @example
 * ```typescript
 * isValidVersion("1.0.0");           // true
 * isValidVersion("2.1.0-beta.1");    // true
 * isValidVersion("1.0.0+build.123"); // true
 * isValidVersion("1.0");             // false - missing patch
 * isValidVersion("v1.0.0");          // false - no 'v' prefix allowed
 * ```
 */
export function isValidVersion(version: string): boolean {
	return SEMVER_PATTERN.test(version);
}

// ============================================================================
// Version Satisfaction
// ============================================================================

/**
 * Check if a version satisfies a semver range.
 *
 * Uses Bun.semver.satisfies() for range checking, which supports:
 * - Exact version: 1.0.0
 * - Caret range: ^1.0.0 (compatible with version)
 * - Tilde range: ~1.0.0 (approximately equivalent)
 * - Comparison operators: >=1.0.0, <2.0.0
 * - Range combinations: >=1.0.0 <2.0.0
 * - Hyphen ranges: 1.0.0 - 2.0.0
 * - X-ranges: 1.x, 1.0.x, *
 *
 * @param version - The version to check (must be valid semver)
 * @param range - The semver range to check against
 * @returns True if the version satisfies the range
 *
 * @example
 * ```typescript
 * satisfies("1.2.3", "^1.0.0");       // true - compatible
 * satisfies("2.0.0", "^1.0.0");       // false - breaking change
 * satisfies("1.2.3", "~1.2.0");       // true - approximately equal
 * satisfies("1.3.0", "~1.2.0");       // false - minor version differs
 * satisfies("1.2.3", ">=1.0.0");      // true
 * satisfies("0.9.0", ">=1.0.0");      // false
 * satisfies("1.5.0", "1.0.0 - 2.0.0"); // true
 * ```
 */
export function satisfies(version: string, range: string): boolean {
	try {
		return Bun.semver.satisfies(version, range);
	} catch {
		// Invalid version or range
		return false;
	}
}

// ============================================================================
// Version Comparison
// ============================================================================

/**
 * Compare two semver versions.
 *
 * Uses Bun.semver.order() for comparison, which returns:
 * - Negative number if a < b
 * - Zero if a === b
 * - Positive number if a > b
 *
 * @param a - First version to compare
 * @param b - Second version to compare
 * @returns Negative if a < b, zero if equal, positive if a > b
 *
 * @example
 * ```typescript
 * compareVersions("1.0.0", "2.0.0"); // negative (1.0.0 < 2.0.0)
 * compareVersions("2.0.0", "1.0.0"); // positive (2.0.0 > 1.0.0)
 * compareVersions("1.0.0", "1.0.0"); // 0 (equal)
 * compareVersions("1.0.0-alpha", "1.0.0"); // negative (prerelease < release)
 * ```
 */
export function compareVersions(a: string, b: string): number {
	return Bun.semver.order(a, b);
}

/**
 * Sort versions in ascending order (lowest to highest).
 *
 * Creates a new sorted array without modifying the original.
 *
 * @param versions - Array of semver version strings
 * @returns New array sorted in ascending order
 *
 * @example
 * ```typescript
 * sortVersionsAscending(["2.0.0", "1.0.0", "1.5.0"]);
 * // Returns: ["1.0.0", "1.5.0", "2.0.0"]
 *
 * sortVersionsAscending(["1.0.0", "1.0.0-alpha", "1.0.0-beta"]);
 * // Returns: ["1.0.0-alpha", "1.0.0-beta", "1.0.0"]
 * ```
 */
export function sortVersionsAscending(versions: string[]): string[] {
	return [...versions].sort((a, b) => Bun.semver.order(a, b));
}

/**
 * Sort versions in descending order (highest to lowest).
 *
 * Creates a new sorted array without modifying the original.
 *
 * @param versions - Array of semver version strings
 * @returns New array sorted in descending order
 *
 * @example
 * ```typescript
 * sortVersionsDescending(["1.0.0", "2.0.0", "1.5.0"]);
 * // Returns: ["2.0.0", "1.5.0", "1.0.0"]
 *
 * sortVersionsDescending(["1.0.0", "1.0.0-alpha", "1.0.0-beta"]);
 * // Returns: ["1.0.0", "1.0.0-beta", "1.0.0-alpha"]
 * ```
 */
export function sortVersionsDescending(versions: string[]): string[] {
	return [...versions].sort((a, b) => Bun.semver.order(b, a));
}

// ============================================================================
// Version Resolution
// ============================================================================

/**
 * Find the highest version that satisfies a semver range.
 *
 * This function implements npm's `maxSatisfying()` behavior using
 * Bun.semver primitives (satisfies + order). It finds all versions
 * that satisfy the range and returns the highest one.
 *
 * @param versions - Array of available semver versions
 * @param range - The semver range to satisfy
 * @returns The highest satisfying version, or null if none satisfy
 *
 * @example
 * ```typescript
 * const versions = ["1.0.0", "1.5.0", "2.0.0", "2.5.0"];
 *
 * maxSatisfying(versions, "^1.0.0");  // "1.5.0" - highest 1.x
 * maxSatisfying(versions, "^2.0.0");  // "2.5.0" - highest 2.x
 * maxSatisfying(versions, "~1.0.0");  // "1.0.0" - only 1.0.x matches
 * maxSatisfying(versions, ">=2.0.0"); // "2.5.0" - highest >= 2.0.0
 * maxSatisfying(versions, "^3.0.0");  // null - no 3.x versions
 * maxSatisfying(versions, "*");       // "2.5.0" - highest of all
 * ```
 *
 * @example
 * ```typescript
 * // With pre-release versions
 * const versions = ["1.0.0-alpha", "1.0.0-beta", "1.0.0"];
 *
 * maxSatisfying(versions, ">=1.0.0-alpha"); // "1.0.0" - release > prerelease
 * maxSatisfying(versions, "1.0.0-alpha");   // "1.0.0-alpha" - exact match
 * ```
 */
export function maxSatisfying(
	versions: string[],
	range: string,
): string | null {
	// Filter versions that satisfy the range
	const satisfying = versions.filter((v) => {
		try {
			return Bun.semver.satisfies(v, range);
		} catch {
			return false;
		}
	});

	if (satisfying.length === 0) {
		return null;
	}

	// Sort in descending order and return the first (highest)
	return satisfying.sort((a, b) => Bun.semver.order(b, a))[0];
}

/**
 * Find the minimum version that satisfies a semver range.
 *
 * Similar to maxSatisfying, but returns the lowest matching version.
 * Useful for determining the minimum compatible version.
 *
 * @param versions - Array of available semver versions
 * @param range - The semver range to satisfy
 * @returns The lowest satisfying version, or null if none satisfy
 *
 * @example
 * ```typescript
 * const versions = ["1.0.0", "1.5.0", "2.0.0"];
 *
 * minSatisfying(versions, "^1.0.0"); // "1.0.0" - lowest 1.x
 * minSatisfying(versions, ">=1.5.0"); // "1.5.0" - lowest >= 1.5.0
 * minSatisfying(versions, "^3.0.0"); // null - no match
 * ```
 */
export function minSatisfying(
	versions: string[],
	range: string,
): string | null {
	// Filter versions that satisfy the range
	const satisfying = versions.filter((v) => {
		try {
			return Bun.semver.satisfies(v, range);
		} catch {
			return false;
		}
	});

	if (satisfying.length === 0) {
		return null;
	}

	// Sort in ascending order and return the first (lowest)
	return satisfying.sort((a, b) => Bun.semver.order(a, b))[0];
}

/**
 * Get the latest (highest) version from a list of versions.
 *
 * This is useful when no version range is specified and we need
 * to resolve to the "latest" version.
 *
 * @param versions - Array of semver version strings
 * @returns The highest version, or null if the array is empty
 *
 * @example
 * ```typescript
 * getLatestVersion(["1.0.0", "2.0.0", "1.5.0"]); // "2.0.0"
 * getLatestVersion(["1.0.0-alpha", "1.0.0"]);    // "1.0.0"
 * getLatestVersion([]);                          // null
 * ```
 */
export function getLatestVersion(versions: string[]): string | null {
	if (versions.length === 0) {
		return null;
	}

	return sortVersionsDescending(versions)[0];
}

/**
 * Filter versions to only include those that satisfy a range.
 *
 * Unlike maxSatisfying/minSatisfying, this returns all matching versions.
 *
 * @param versions - Array of available semver versions
 * @param range - The semver range to satisfy
 * @returns Array of versions that satisfy the range, sorted descending
 *
 * @example
 * ```typescript
 * const versions = ["1.0.0", "1.5.0", "2.0.0", "2.5.0"];
 *
 * filterSatisfying(versions, "^1.0.0");
 * // Returns: ["1.5.0", "1.0.0"] - all 1.x versions, highest first
 *
 * filterSatisfying(versions, ">=2.0.0");
 * // Returns: ["2.5.0", "2.0.0"]
 * ```
 */
export function filterSatisfying(versions: string[], range: string): string[] {
	const satisfying = versions.filter((v) => {
		try {
			return Bun.semver.satisfies(v, range);
		} catch {
			return false;
		}
	});

	// Return sorted in descending order (highest first)
	return sortVersionsDescending(satisfying);
}

// ============================================================================
// Version Utilities
// ============================================================================

/**
 * Check if version A is greater than version B.
 *
 * @param a - First version
 * @param b - Second version
 * @returns True if a > b
 *
 * @example
 * ```typescript
 * isGreaterThan("2.0.0", "1.0.0"); // true
 * isGreaterThan("1.0.0", "2.0.0"); // false
 * isGreaterThan("1.0.0", "1.0.0"); // false
 * ```
 */
export function isGreaterThan(a: string, b: string): boolean {
	return Bun.semver.order(a, b) > 0;
}

/**
 * Check if version A is less than version B.
 *
 * @param a - First version
 * @param b - Second version
 * @returns True if a < b
 *
 * @example
 * ```typescript
 * isLessThan("1.0.0", "2.0.0"); // true
 * isLessThan("2.0.0", "1.0.0"); // false
 * isLessThan("1.0.0", "1.0.0"); // false
 * ```
 */
export function isLessThan(a: string, b: string): boolean {
	return Bun.semver.order(a, b) < 0;
}

/**
 * Check if two versions are equal.
 *
 * @param a - First version
 * @param b - Second version
 * @returns True if a === b
 *
 * @example
 * ```typescript
 * isEqual("1.0.0", "1.0.0"); // true
 * isEqual("1.0.0", "2.0.0"); // false
 * ```
 */
export function isEqual(a: string, b: string): boolean {
	return Bun.semver.order(a, b) === 0;
}

/**
 * Check if version A is greater than or equal to version B.
 *
 * @param a - First version
 * @param b - Second version
 * @returns True if a >= b
 *
 * @example
 * ```typescript
 * isGreaterThanOrEqual("2.0.0", "1.0.0"); // true
 * isGreaterThanOrEqual("1.0.0", "1.0.0"); // true
 * isGreaterThanOrEqual("1.0.0", "2.0.0"); // false
 * ```
 */
export function isGreaterThanOrEqual(a: string, b: string): boolean {
	return Bun.semver.order(a, b) >= 0;
}

/**
 * Check if version A is less than or equal to version B.
 *
 * @param a - First version
 * @param b - Second version
 * @returns True if a <= b
 *
 * @example
 * ```typescript
 * isLessThanOrEqual("1.0.0", "2.0.0"); // true
 * isLessThanOrEqual("1.0.0", "1.0.0"); // true
 * isLessThanOrEqual("2.0.0", "1.0.0"); // false
 * ```
 */
export function isLessThanOrEqual(a: string, b: string): boolean {
	return Bun.semver.order(a, b) <= 0;
}

/**
 * Check if a version is a pre-release version.
 *
 * Pre-release versions have a hyphen followed by identifiers:
 * 1.0.0-alpha, 1.0.0-beta.1, 1.0.0-rc.2
 *
 * @param version - The version to check
 * @returns True if the version contains a pre-release suffix
 *
 * @example
 * ```typescript
 * isPrerelease("1.0.0-alpha");     // true
 * isPrerelease("1.0.0-beta.1");    // true
 * isPrerelease("1.0.0");           // false
 * isPrerelease("1.0.0+build.123"); // false - build metadata is not prerelease
 * ```
 */
export function isPrerelease(version: string): boolean {
	const match = SEMVER_PATTERN.exec(version);
	if (!match) {
		return false;
	}
	// Group 4 is the pre-release part (after the hyphen)
	return match[4] !== undefined;
}

/**
 * Filter out pre-release versions from a list.
 *
 * @param versions - Array of semver versions
 * @returns Array with only stable (non-prerelease) versions
 *
 * @example
 * ```typescript
 * filterStableVersions(["1.0.0", "1.0.0-alpha", "2.0.0", "2.0.0-beta"]);
 * // Returns: ["1.0.0", "2.0.0"]
 * ```
 */
export function filterStableVersions(versions: string[]): string[] {
	return versions.filter((v) => !isPrerelease(v));
}
