/**
 * Tests for semver version utilities for workflow registry resolution.
 *
 * This module tests all version utilities defined in version.ts including:
 * - Version validation (isValidVersion)
 * - Version satisfaction checking (satisfies)
 * - Version comparison and sorting
 * - Version resolution (maxSatisfying, minSatisfying, getLatestVersion)
 * - Filter utilities (filterSatisfying, filterStableVersions)
 * - Comparison helpers (isGreaterThan, isLessThan, isEqual, etc.)
 * - Pre-release detection
 */

import { describe, expect, it } from "bun:test";
import {
	compareVersions,
	filterSatisfying,
	filterStableVersions,
	getLatestVersion,
	isEqual,
	isGreaterThan,
	isGreaterThanOrEqual,
	isLessThan,
	isLessThanOrEqual,
	isPrerelease,
	isValidVersion,
	maxSatisfying,
	minSatisfying,
	satisfies,
	sortVersionsAscending,
	sortVersionsDescending,
} from "./version.js";

describe("isValidVersion", () => {
	describe("valid versions", () => {
		it("should accept basic semver versions", () => {
			expect(isValidVersion("1.0.0")).toBe(true);
			expect(isValidVersion("0.0.1")).toBe(true);
			expect(isValidVersion("10.20.30")).toBe(true);
			expect(isValidVersion("999.999.999")).toBe(true);
		});

		it("should accept pre-release versions", () => {
			expect(isValidVersion("1.0.0-alpha")).toBe(true);
			expect(isValidVersion("1.0.0-beta.1")).toBe(true);
			expect(isValidVersion("1.0.0-rc.2")).toBe(true);
			expect(isValidVersion("2.1.0-alpha.beta")).toBe(true);
			expect(isValidVersion("1.0.0-0.3.7")).toBe(true);
			expect(isValidVersion("1.0.0-x.7.z.92")).toBe(true);
		});

		it("should accept build metadata", () => {
			expect(isValidVersion("1.0.0+build.123")).toBe(true);
			expect(isValidVersion("1.0.0+20130313144700")).toBe(true);
			expect(isValidVersion("1.0.0+exp.sha.5114f85")).toBe(true);
		});

		it("should accept combined pre-release and build metadata", () => {
			expect(isValidVersion("1.0.0-alpha.1+build.456")).toBe(true);
			expect(isValidVersion("2.0.0-beta+exp.sha.5114f85")).toBe(true);
			expect(isValidVersion("1.0.0-rc.1+build.123")).toBe(true);
		});
	});

	describe("invalid versions", () => {
		it("should reject incomplete versions", () => {
			expect(isValidVersion("1.0")).toBe(false);
			expect(isValidVersion("1")).toBe(false);
			expect(isValidVersion("1.")).toBe(false);
			expect(isValidVersion(".0.0")).toBe(false);
		});

		it("should reject versions with v prefix", () => {
			expect(isValidVersion("v1.0.0")).toBe(false);
			expect(isValidVersion("V1.0.0")).toBe(false);
		});

		it("should reject versions with leading zeros", () => {
			expect(isValidVersion("01.0.0")).toBe(false);
			expect(isValidVersion("1.01.0")).toBe(false);
			expect(isValidVersion("1.0.01")).toBe(false);
		});

		it("should reject non-numeric versions", () => {
			expect(isValidVersion("a.b.c")).toBe(false);
			expect(isValidVersion("one.two.three")).toBe(false);
		});

		it("should reject empty strings", () => {
			expect(isValidVersion("")).toBe(false);
		});

		it("should reject negative numbers", () => {
			expect(isValidVersion("-1.0.0")).toBe(false);
			expect(isValidVersion("1.-1.0")).toBe(false);
		});

		it("should reject versions with spaces", () => {
			expect(isValidVersion("1.0.0 ")).toBe(false);
			expect(isValidVersion(" 1.0.0")).toBe(false);
			expect(isValidVersion("1. 0.0")).toBe(false);
		});
	});
});

describe("satisfies", () => {
	describe("exact version matching", () => {
		it("should match exact versions", () => {
			expect(satisfies("1.0.0", "1.0.0")).toBe(true);
			expect(satisfies("2.5.3", "2.5.3")).toBe(true);
			expect(satisfies("0.1.0", "0.1.0")).toBe(true);
		});

		it("should not match different exact versions", () => {
			expect(satisfies("1.0.0", "1.0.1")).toBe(false);
			expect(satisfies("1.0.0", "2.0.0")).toBe(false);
			expect(satisfies("1.0.1", "1.0.0")).toBe(false);
		});
	});

	describe("caret range (^) - compatible versions", () => {
		it("should match compatible versions for ^1.x.x", () => {
			expect(satisfies("1.0.0", "^1.0.0")).toBe(true);
			expect(satisfies("1.5.0", "^1.0.0")).toBe(true);
			expect(satisfies("1.9.9", "^1.0.0")).toBe(true);
			expect(satisfies("1.0.1", "^1.0.0")).toBe(true);
		});

		it("should not match incompatible major versions for ^1.x.x", () => {
			expect(satisfies("2.0.0", "^1.0.0")).toBe(false);
			expect(satisfies("0.9.9", "^1.0.0")).toBe(false);
			expect(satisfies("3.0.0", "^1.0.0")).toBe(false);
		});

		it("should handle caret range for ^0.x.x (special behavior)", () => {
			// For ^0.x.x, only patch versions are allowed
			expect(satisfies("0.1.0", "^0.1.0")).toBe(true);
			expect(satisfies("0.1.5", "^0.1.0")).toBe(true);
			// Minor version change is breaking for 0.x
			expect(satisfies("0.2.0", "^0.1.0")).toBe(false);
		});

		it("should handle caret range for ^0.0.x", () => {
			// For ^0.0.x, only exact matches
			expect(satisfies("0.0.1", "^0.0.1")).toBe(true);
			expect(satisfies("0.0.2", "^0.0.1")).toBe(false);
		});
	});

	describe("tilde range (~) - approximately equivalent", () => {
		it("should match patch versions for ~1.2.x", () => {
			expect(satisfies("1.2.0", "~1.2.0")).toBe(true);
			expect(satisfies("1.2.3", "~1.2.0")).toBe(true);
			expect(satisfies("1.2.99", "~1.2.0")).toBe(true);
		});

		it("should not match different minor versions for ~1.2.x", () => {
			expect(satisfies("1.3.0", "~1.2.0")).toBe(false);
			expect(satisfies("1.1.0", "~1.2.0")).toBe(false);
			expect(satisfies("2.2.0", "~1.2.0")).toBe(false);
		});

		it("should handle tilde range for ~0.x.x", () => {
			expect(satisfies("0.1.0", "~0.1.0")).toBe(true);
			expect(satisfies("0.1.5", "~0.1.0")).toBe(true);
			expect(satisfies("0.2.0", "~0.1.0")).toBe(false);
		});
	});

	describe("comparison operators", () => {
		it("should handle >= operator", () => {
			expect(satisfies("1.0.0", ">=1.0.0")).toBe(true);
			expect(satisfies("1.5.0", ">=1.0.0")).toBe(true);
			expect(satisfies("2.0.0", ">=1.0.0")).toBe(true);
			expect(satisfies("0.9.0", ">=1.0.0")).toBe(false);
		});

		it("should handle > operator", () => {
			expect(satisfies("1.0.1", ">1.0.0")).toBe(true);
			expect(satisfies("2.0.0", ">1.0.0")).toBe(true);
			expect(satisfies("1.0.0", ">1.0.0")).toBe(false);
			expect(satisfies("0.9.0", ">1.0.0")).toBe(false);
		});

		it("should handle <= operator", () => {
			expect(satisfies("1.0.0", "<=1.0.0")).toBe(true);
			expect(satisfies("0.5.0", "<=1.0.0")).toBe(true);
			expect(satisfies("1.0.1", "<=1.0.0")).toBe(false);
			expect(satisfies("2.0.0", "<=1.0.0")).toBe(false);
		});

		it("should handle < operator", () => {
			expect(satisfies("0.9.9", "<1.0.0")).toBe(true);
			expect(satisfies("0.0.1", "<1.0.0")).toBe(true);
			expect(satisfies("1.0.0", "<1.0.0")).toBe(false);
			expect(satisfies("1.0.1", "<1.0.0")).toBe(false);
		});
	});

	describe("wildcard and x-ranges", () => {
		it("should match any version with *", () => {
			expect(satisfies("1.0.0", "*")).toBe(true);
			expect(satisfies("0.0.1", "*")).toBe(true);
			expect(satisfies("99.99.99", "*")).toBe(true);
		});

		it("should handle x-ranges", () => {
			expect(satisfies("1.0.0", "1.x.x")).toBe(true);
			expect(satisfies("1.5.3", "1.x.x")).toBe(true);
			expect(satisfies("2.0.0", "1.x.x")).toBe(false);

			expect(satisfies("1.0.0", "1.0.x")).toBe(true);
			expect(satisfies("1.0.5", "1.0.x")).toBe(true);
			expect(satisfies("1.1.0", "1.0.x")).toBe(false);
		});
	});

	describe("hyphen ranges", () => {
		it("should match versions in hyphen range", () => {
			expect(satisfies("1.0.0", "1.0.0 - 2.0.0")).toBe(true);
			expect(satisfies("1.5.0", "1.0.0 - 2.0.0")).toBe(true);
			expect(satisfies("2.0.0", "1.0.0 - 2.0.0")).toBe(true);
		});

		it("should not match versions outside hyphen range", () => {
			expect(satisfies("0.9.0", "1.0.0 - 2.0.0")).toBe(false);
			expect(satisfies("2.0.1", "1.0.0 - 2.0.0")).toBe(false);
			expect(satisfies("3.0.0", "1.0.0 - 2.0.0")).toBe(false);
		});
	});

	describe("invalid inputs", () => {
		it("should return false for invalid versions", () => {
			expect(satisfies("invalid", "^1.0.0")).toBe(false);
			expect(satisfies("1.0", "^1.0.0")).toBe(false);
		});

		it("should treat invalid/empty ranges as matching all (Bun.semver behavior)", () => {
			// Note: Bun.semver treats invalid and empty ranges as "*" (matches all)
			// This is documented behavior from Bun's semver implementation
			expect(satisfies("1.0.0", "")).toBe(true);
			expect(satisfies("1.0.0", "invalid")).toBe(true);
		});
	});
});

describe("compareVersions", () => {
	it("should return negative for lower version", () => {
		expect(compareVersions("1.0.0", "2.0.0")).toBeLessThan(0);
		expect(compareVersions("1.0.0", "1.1.0")).toBeLessThan(0);
		expect(compareVersions("1.0.0", "1.0.1")).toBeLessThan(0);
	});

	it("should return positive for higher version", () => {
		expect(compareVersions("2.0.0", "1.0.0")).toBeGreaterThan(0);
		expect(compareVersions("1.1.0", "1.0.0")).toBeGreaterThan(0);
		expect(compareVersions("1.0.1", "1.0.0")).toBeGreaterThan(0);
	});

	it("should return zero for equal versions", () => {
		expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
		expect(compareVersions("2.5.3", "2.5.3")).toBe(0);
	});

	it("should compare pre-release versions correctly", () => {
		// Pre-release < release
		expect(compareVersions("1.0.0-alpha", "1.0.0")).toBeLessThan(0);
		expect(compareVersions("1.0.0-beta", "1.0.0")).toBeLessThan(0);

		// Alpha < beta
		expect(compareVersions("1.0.0-alpha", "1.0.0-beta")).toBeLessThan(0);

		// Numeric pre-release comparison
		expect(compareVersions("1.0.0-alpha.1", "1.0.0-alpha.2")).toBeLessThan(0);
	});
});

describe("sortVersionsAscending", () => {
	it("should sort versions in ascending order", () => {
		const versions = ["2.0.0", "1.0.0", "1.5.0", "3.0.0"];
		const sorted = sortVersionsAscending(versions);
		expect(sorted).toEqual(["1.0.0", "1.5.0", "2.0.0", "3.0.0"]);
	});

	it("should not modify the original array", () => {
		const original = ["2.0.0", "1.0.0"];
		const sorted = sortVersionsAscending(original);
		expect(original).toEqual(["2.0.0", "1.0.0"]);
		expect(sorted).not.toBe(original);
	});

	it("should handle pre-release versions", () => {
		const versions = ["1.0.0", "1.0.0-alpha", "1.0.0-beta"];
		const sorted = sortVersionsAscending(versions);
		expect(sorted).toEqual(["1.0.0-alpha", "1.0.0-beta", "1.0.0"]);
	});

	it("should handle empty array", () => {
		expect(sortVersionsAscending([])).toEqual([]);
	});

	it("should handle single version", () => {
		expect(sortVersionsAscending(["1.0.0"])).toEqual(["1.0.0"]);
	});
});

describe("sortVersionsDescending", () => {
	it("should sort versions in descending order", () => {
		const versions = ["1.0.0", "2.0.0", "1.5.0", "3.0.0"];
		const sorted = sortVersionsDescending(versions);
		expect(sorted).toEqual(["3.0.0", "2.0.0", "1.5.0", "1.0.0"]);
	});

	it("should not modify the original array", () => {
		const original = ["1.0.0", "2.0.0"];
		const sorted = sortVersionsDescending(original);
		expect(original).toEqual(["1.0.0", "2.0.0"]);
		expect(sorted).not.toBe(original);
	});

	it("should handle pre-release versions", () => {
		const versions = ["1.0.0-alpha", "1.0.0", "1.0.0-beta"];
		const sorted = sortVersionsDescending(versions);
		expect(sorted).toEqual(["1.0.0", "1.0.0-beta", "1.0.0-alpha"]);
	});

	it("should handle empty array", () => {
		expect(sortVersionsDescending([])).toEqual([]);
	});
});

describe("maxSatisfying", () => {
	const versions = ["1.0.0", "1.5.0", "2.0.0", "2.5.0", "3.0.0"];

	describe("exact version resolution", () => {
		it("should return exact version when matched", () => {
			expect(maxSatisfying(versions, "1.5.0")).toBe("1.5.0");
			expect(maxSatisfying(versions, "2.0.0")).toBe("2.0.0");
		});

		it("should return null for non-existent exact version", () => {
			expect(maxSatisfying(versions, "1.2.3")).toBe(null);
			expect(maxSatisfying(versions, "4.0.0")).toBe(null);
		});
	});

	describe("caret range resolution", () => {
		it("should return highest compatible version for ^", () => {
			expect(maxSatisfying(versions, "^1.0.0")).toBe("1.5.0");
			expect(maxSatisfying(versions, "^2.0.0")).toBe("2.5.0");
			expect(maxSatisfying(versions, "^3.0.0")).toBe("3.0.0");
		});

		it("should return null when no compatible version exists", () => {
			expect(maxSatisfying(versions, "^4.0.0")).toBe(null);
			expect(maxSatisfying(versions, "^0.1.0")).toBe(null);
		});
	});

	describe("tilde range resolution", () => {
		it("should return highest patch version for ~", () => {
			expect(maxSatisfying(versions, "~1.0.0")).toBe("1.0.0");
			expect(maxSatisfying(versions, "~2.0.0")).toBe("2.0.0");
		});

		it("should handle tilde with matching minor versions", () => {
			const patchVersions = ["1.2.0", "1.2.1", "1.2.5", "1.3.0"];
			expect(maxSatisfying(patchVersions, "~1.2.0")).toBe("1.2.5");
		});
	});

	describe("comparison operator resolution", () => {
		it("should resolve >= correctly", () => {
			expect(maxSatisfying(versions, ">=2.0.0")).toBe("3.0.0");
			expect(maxSatisfying(versions, ">=1.0.0")).toBe("3.0.0");
		});

		it("should resolve > correctly", () => {
			expect(maxSatisfying(versions, ">2.0.0")).toBe("3.0.0");
			expect(maxSatisfying(versions, ">1.0.0")).toBe("3.0.0");
		});

		it("should resolve <= correctly", () => {
			expect(maxSatisfying(versions, "<=2.0.0")).toBe("2.0.0");
			expect(maxSatisfying(versions, "<=1.5.0")).toBe("1.5.0");
		});

		it("should resolve < correctly", () => {
			expect(maxSatisfying(versions, "<2.0.0")).toBe("1.5.0");
			expect(maxSatisfying(versions, "<3.0.0")).toBe("2.5.0");
		});
	});

	describe("wildcard resolution (latest)", () => {
		it("should return highest version for *", () => {
			expect(maxSatisfying(versions, "*")).toBe("3.0.0");
		});

		it("should return highest version for x-ranges", () => {
			expect(maxSatisfying(versions, "1.x.x")).toBe("1.5.0");
			expect(maxSatisfying(versions, "2.x.x")).toBe("2.5.0");
		});
	});

	describe("edge cases", () => {
		it("should return null for empty versions array", () => {
			expect(maxSatisfying([], "^1.0.0")).toBe(null);
		});

		it("should handle pre-release versions", () => {
			const prereleaseVersions = ["1.0.0-alpha", "1.0.0-beta", "1.0.0"];
			expect(maxSatisfying(prereleaseVersions, ">=1.0.0-alpha")).toBe("1.0.0");
		});

		it("should treat empty/invalid ranges as matching all (Bun.semver behavior)", () => {
			// Note: Bun.semver treats invalid and empty ranges as "*" (matches all)
			// This is documented behavior from Bun's semver implementation
			expect(maxSatisfying(versions, "")).toBe("3.0.0");
			expect(maxSatisfying(versions, "invalid")).toBe("3.0.0");
		});
	});
});

describe("minSatisfying", () => {
	const versions = ["1.0.0", "1.5.0", "2.0.0", "2.5.0", "3.0.0"];

	it("should return lowest compatible version for ^", () => {
		expect(minSatisfying(versions, "^1.0.0")).toBe("1.0.0");
		expect(minSatisfying(versions, "^2.0.0")).toBe("2.0.0");
	});

	it("should return lowest version for *", () => {
		expect(minSatisfying(versions, "*")).toBe("1.0.0");
	});

	it("should return lowest version satisfying >=", () => {
		expect(minSatisfying(versions, ">=2.0.0")).toBe("2.0.0");
		expect(minSatisfying(versions, ">=1.5.0")).toBe("1.5.0");
	});

	it("should return null for no matches", () => {
		expect(minSatisfying(versions, "^4.0.0")).toBe(null);
		expect(minSatisfying([], "^1.0.0")).toBe(null);
	});

	it("should treat empty/invalid ranges as matching all (Bun.semver behavior)", () => {
		// Note: Bun.semver treats invalid and empty ranges as "*" (matches all)
		// This is documented behavior from Bun's semver implementation
		expect(minSatisfying(versions, "")).toBe("1.0.0");
		expect(minSatisfying(versions, "invalid")).toBe("1.0.0");
	});
});

describe("getLatestVersion", () => {
	it("should return the highest version", () => {
		const versions = ["1.0.0", "2.0.0", "1.5.0"];
		expect(getLatestVersion(versions)).toBe("2.0.0");
	});

	it("should handle pre-release versions", () => {
		const versions = ["1.0.0-alpha", "1.0.0"];
		expect(getLatestVersion(versions)).toBe("1.0.0");
	});

	it("should return null for empty array", () => {
		expect(getLatestVersion([])).toBe(null);
	});

	it("should handle single version", () => {
		expect(getLatestVersion(["1.0.0"])).toBe("1.0.0");
	});

	it("should handle many versions correctly", () => {
		const versions = [
			"0.1.0",
			"0.2.0",
			"1.0.0",
			"1.1.0",
			"2.0.0",
			"2.0.1",
			"10.0.0",
		];
		expect(getLatestVersion(versions)).toBe("10.0.0");
	});
});

describe("filterSatisfying", () => {
	const versions = ["1.0.0", "1.5.0", "2.0.0", "2.5.0", "3.0.0"];

	it("should return all matching versions for ^", () => {
		const result = filterSatisfying(versions, "^1.0.0");
		expect(result).toEqual(["1.5.0", "1.0.0"]);
	});

	it("should return all matching versions for >=", () => {
		const result = filterSatisfying(versions, ">=2.0.0");
		expect(result).toEqual(["3.0.0", "2.5.0", "2.0.0"]);
	});

	it("should return all versions for *", () => {
		const result = filterSatisfying(versions, "*");
		expect(result).toEqual(["3.0.0", "2.5.0", "2.0.0", "1.5.0", "1.0.0"]);
	});

	it("should return results in descending order", () => {
		const result = filterSatisfying(versions, "^2.0.0");
		expect(result).toEqual(["2.5.0", "2.0.0"]);
		expect(result[0]).toBe("2.5.0"); // Highest first
	});

	it("should return empty array for no matches", () => {
		expect(filterSatisfying(versions, "^4.0.0")).toEqual([]);
		expect(filterSatisfying(versions, "^0.1.0")).toEqual([]);
	});

	it("should return empty array for empty input", () => {
		expect(filterSatisfying([], "^1.0.0")).toEqual([]);
	});
});

describe("comparison helpers", () => {
	describe("isGreaterThan", () => {
		it("should return true when a > b", () => {
			expect(isGreaterThan("2.0.0", "1.0.0")).toBe(true);
			expect(isGreaterThan("1.1.0", "1.0.0")).toBe(true);
			expect(isGreaterThan("1.0.1", "1.0.0")).toBe(true);
		});

		it("should return false when a <= b", () => {
			expect(isGreaterThan("1.0.0", "2.0.0")).toBe(false);
			expect(isGreaterThan("1.0.0", "1.0.0")).toBe(false);
		});

		it("should handle pre-release versions", () => {
			expect(isGreaterThan("1.0.0", "1.0.0-alpha")).toBe(true);
			expect(isGreaterThan("1.0.0-beta", "1.0.0-alpha")).toBe(true);
		});
	});

	describe("isLessThan", () => {
		it("should return true when a < b", () => {
			expect(isLessThan("1.0.0", "2.0.0")).toBe(true);
			expect(isLessThan("1.0.0", "1.1.0")).toBe(true);
			expect(isLessThan("1.0.0", "1.0.1")).toBe(true);
		});

		it("should return false when a >= b", () => {
			expect(isLessThan("2.0.0", "1.0.0")).toBe(false);
			expect(isLessThan("1.0.0", "1.0.0")).toBe(false);
		});

		it("should handle pre-release versions", () => {
			expect(isLessThan("1.0.0-alpha", "1.0.0")).toBe(true);
			expect(isLessThan("1.0.0-alpha", "1.0.0-beta")).toBe(true);
		});
	});

	describe("isEqual", () => {
		it("should return true for equal versions", () => {
			expect(isEqual("1.0.0", "1.0.0")).toBe(true);
			expect(isEqual("2.5.3", "2.5.3")).toBe(true);
			expect(isEqual("1.0.0-alpha", "1.0.0-alpha")).toBe(true);
		});

		it("should return false for different versions", () => {
			expect(isEqual("1.0.0", "1.0.1")).toBe(false);
			expect(isEqual("1.0.0", "2.0.0")).toBe(false);
			expect(isEqual("1.0.0-alpha", "1.0.0-beta")).toBe(false);
		});
	});

	describe("isGreaterThanOrEqual", () => {
		it("should return true when a >= b", () => {
			expect(isGreaterThanOrEqual("2.0.0", "1.0.0")).toBe(true);
			expect(isGreaterThanOrEqual("1.0.0", "1.0.0")).toBe(true);
		});

		it("should return false when a < b", () => {
			expect(isGreaterThanOrEqual("1.0.0", "2.0.0")).toBe(false);
		});
	});

	describe("isLessThanOrEqual", () => {
		it("should return true when a <= b", () => {
			expect(isLessThanOrEqual("1.0.0", "2.0.0")).toBe(true);
			expect(isLessThanOrEqual("1.0.0", "1.0.0")).toBe(true);
		});

		it("should return false when a > b", () => {
			expect(isLessThanOrEqual("2.0.0", "1.0.0")).toBe(false);
		});
	});
});

describe("isPrerelease", () => {
	it("should return true for pre-release versions", () => {
		expect(isPrerelease("1.0.0-alpha")).toBe(true);
		expect(isPrerelease("1.0.0-beta.1")).toBe(true);
		expect(isPrerelease("1.0.0-rc.2")).toBe(true);
		expect(isPrerelease("2.0.0-alpha.beta")).toBe(true);
		expect(isPrerelease("1.0.0-0.3.7")).toBe(true);
	});

	it("should return false for stable versions", () => {
		expect(isPrerelease("1.0.0")).toBe(false);
		expect(isPrerelease("2.5.3")).toBe(false);
		expect(isPrerelease("0.0.1")).toBe(false);
	});

	it("should return false for build metadata only", () => {
		expect(isPrerelease("1.0.0+build.123")).toBe(false);
		expect(isPrerelease("1.0.0+20130313144700")).toBe(false);
	});

	it("should return true for pre-release with build metadata", () => {
		expect(isPrerelease("1.0.0-alpha+build.123")).toBe(true);
		expect(isPrerelease("1.0.0-rc.1+build")).toBe(true);
	});

	it("should return false for invalid versions", () => {
		expect(isPrerelease("invalid")).toBe(false);
		expect(isPrerelease("1.0")).toBe(false);
		expect(isPrerelease("")).toBe(false);
	});
});

describe("filterStableVersions", () => {
	it("should remove pre-release versions", () => {
		const versions = ["1.0.0", "1.0.0-alpha", "2.0.0", "2.0.0-beta"];
		const result = filterStableVersions(versions);
		expect(result).toEqual(["1.0.0", "2.0.0"]);
	});

	it("should keep all stable versions", () => {
		const versions = ["1.0.0", "2.0.0", "3.0.0"];
		const result = filterStableVersions(versions);
		expect(result).toEqual(["1.0.0", "2.0.0", "3.0.0"]);
	});

	it("should return empty array if all are pre-release", () => {
		const versions = ["1.0.0-alpha", "1.0.0-beta", "1.0.0-rc.1"];
		const result = filterStableVersions(versions);
		expect(result).toEqual([]);
	});

	it("should handle empty array", () => {
		expect(filterStableVersions([])).toEqual([]);
	});

	it("should keep versions with build metadata", () => {
		const versions = ["1.0.0", "1.0.0+build.123", "1.0.0-alpha"];
		const result = filterStableVersions(versions);
		expect(result).toEqual(["1.0.0", "1.0.0+build.123"]);
	});
});
