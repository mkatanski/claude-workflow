/**
 * Tests for resolution caching with TTL support.
 *
 * This module tests all caching functionality in cache.ts including:
 * - Type guards (isCacheEntry, isCacheOptions)
 * - Cache key generation (generateCacheKey, generateGraphCacheKey)
 * - Cache entry helpers (isExpired, getRemainingTTL, getEntryAge)
 * - ResolutionCache class methods and behavior
 * - TTL expiration and LRU eviction
 * - Factory function and constants
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	type CacheEntry,
	type CacheOptions,
	createResolutionCache,
	DEFAULT_TTL,
	EVICTION_REASONS,
	type EvictionReason,
	generateCacheKey,
	generateGraphCacheKey,
	getEntryAge,
	getRemainingTTL,
	isCacheEntry,
	isCacheOptions,
	isExpired,
	ResolutionCache,
} from "./cache.js";
import type { DependencyGraph, ResolvedWorkflow } from "./types.js";

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Create a mock ResolvedWorkflow for testing.
 */
function createMockResolvedWorkflow(
	name: string,
	version = "1.0.0",
): ResolvedWorkflow {
	return {
		reference: { name, version: `^${version}` },
		path: `/test/workflows/${name}@${version}`,
		version,
		source: "global",
		exportName: "default",
		metadata: {
			name,
			version,
			main: "./index.ts",
		},
	};
}

/**
 * Create a mock DependencyGraph for testing.
 */
function createMockDependencyGraph(name: string): DependencyGraph {
	const root = createMockResolvedWorkflow(name);
	return {
		root,
		dependencies: new Map(),
		edges: [],
		loadOrder: [name],
	};
}

/**
 * Create a mock CacheEntry for testing.
 */
function createMockCacheEntry<T>(value: T, ttl = 300000): CacheEntry<T> {
	const now = Date.now();
	return {
		value,
		createdAt: now,
		lastAccessedAt: now,
		expiresAt: now + ttl,
		accessCount: 0,
	};
}

// ============================================================================
// Type Guards Tests
// ============================================================================

describe("isCacheEntry", () => {
	describe("valid entries", () => {
		it("should return true for valid CacheEntry with primitive value", () => {
			const entry = createMockCacheEntry("test-value");
			expect(isCacheEntry(entry)).toBe(true);
		});

		it("should return true for valid CacheEntry with object value", () => {
			const entry = createMockCacheEntry(
				createMockResolvedWorkflow("planning"),
			);
			expect(isCacheEntry(entry)).toBe(true);
		});

		it("should return true for CacheEntry with null value", () => {
			const entry = createMockCacheEntry(null);
			expect(isCacheEntry(entry)).toBe(true);
		});

		it("should return true for CacheEntry with zero accessCount", () => {
			const entry = createMockCacheEntry("value");
			entry.accessCount = 0;
			expect(isCacheEntry(entry)).toBe(true);
		});
	});

	describe("invalid entries", () => {
		it("should return false for null", () => {
			expect(isCacheEntry(null)).toBe(false);
		});

		it("should return false for undefined", () => {
			expect(isCacheEntry(undefined)).toBe(false);
		});

		it("should return false for non-object", () => {
			expect(isCacheEntry("string")).toBe(false);
			expect(isCacheEntry(123)).toBe(false);
			expect(isCacheEntry(true)).toBe(false);
		});

		it("should return false for entry missing value", () => {
			const entry = {
				createdAt: Date.now(),
				lastAccessedAt: Date.now(),
				expiresAt: Date.now() + 300000,
				accessCount: 0,
			};
			expect(isCacheEntry(entry)).toBe(false);
		});

		it("should return false for entry with non-numeric createdAt", () => {
			const entry = {
				value: "test",
				createdAt: "not-a-number",
				lastAccessedAt: Date.now(),
				expiresAt: Date.now() + 300000,
				accessCount: 0,
			};
			expect(isCacheEntry(entry)).toBe(false);
		});

		it("should return false for entry with non-numeric lastAccessedAt", () => {
			const entry = {
				value: "test",
				createdAt: Date.now(),
				lastAccessedAt: "not-a-number",
				expiresAt: Date.now() + 300000,
				accessCount: 0,
			};
			expect(isCacheEntry(entry)).toBe(false);
		});

		it("should return false for entry with non-numeric expiresAt", () => {
			const entry = {
				value: "test",
				createdAt: Date.now(),
				lastAccessedAt: Date.now(),
				expiresAt: "not-a-number",
				accessCount: 0,
			};
			expect(isCacheEntry(entry)).toBe(false);
		});

		it("should return false for entry with non-numeric accessCount", () => {
			const entry = {
				value: "test",
				createdAt: Date.now(),
				lastAccessedAt: Date.now(),
				expiresAt: Date.now() + 300000,
				accessCount: "zero",
			};
			expect(isCacheEntry(entry)).toBe(false);
		});
	});
});

describe("isCacheOptions", () => {
	describe("valid options", () => {
		it("should return true for empty object", () => {
			expect(isCacheOptions({})).toBe(true);
		});

		it("should return true for valid defaultTTL", () => {
			expect(isCacheOptions({ defaultTTL: 60000 })).toBe(true);
		});

		it("should return true for valid maxEntries", () => {
			expect(isCacheOptions({ maxEntries: 500 })).toBe(true);
		});

		it("should return true for valid cleanupInterval", () => {
			expect(isCacheOptions({ cleanupInterval: 30000 })).toBe(true);
		});

		it("should return true for valid onEviction callback", () => {
			expect(isCacheOptions({ onEviction: () => {} })).toBe(true);
		});

		it("should return true for all options combined", () => {
			const options: CacheOptions = {
				defaultTTL: 60000,
				maxEntries: 500,
				cleanupInterval: 30000,
				onEviction: () => {},
			};
			expect(isCacheOptions(options)).toBe(true);
		});
	});

	describe("invalid options", () => {
		it("should return false for null", () => {
			expect(isCacheOptions(null)).toBe(false);
		});

		it("should return false for undefined", () => {
			expect(isCacheOptions(undefined)).toBe(false);
		});

		it("should return false for non-object", () => {
			expect(isCacheOptions("string")).toBe(false);
			expect(isCacheOptions(123)).toBe(false);
		});

		it("should return false for non-numeric defaultTTL", () => {
			expect(isCacheOptions({ defaultTTL: "60000" })).toBe(false);
		});

		it("should return false for non-numeric maxEntries", () => {
			expect(isCacheOptions({ maxEntries: "500" })).toBe(false);
		});

		it("should return false for non-numeric cleanupInterval", () => {
			expect(isCacheOptions({ cleanupInterval: "30000" })).toBe(false);
		});

		it("should return false for non-function onEviction", () => {
			expect(isCacheOptions({ onEviction: "callback" })).toBe(false);
		});
	});
});

// ============================================================================
// Cache Key Generation Tests
// ============================================================================

describe("generateCacheKey", () => {
	describe("string references", () => {
		it("should generate key for simple reference", () => {
			expect(generateCacheKey("planning")).toBe("planning");
		});

		it("should generate key for versioned reference", () => {
			expect(generateCacheKey("planning@^1.0.0")).toBe("planning@^1.0.0");
		});

		it("should generate key for reference with export", () => {
			expect(generateCacheKey("tools:refactor")).toBe("tools:refactor");
		});

		it("should generate key for full reference", () => {
			expect(generateCacheKey("global:@myorg/deploy@~2.0.0:rollback")).toBe(
				"global:@myorg/deploy@~2.0.0:rollback",
			);
		});
	});

	describe("object references", () => {
		it("should generate key for simple WorkflowReference", () => {
			expect(generateCacheKey({ name: "planning" })).toBe("planning");
		});

		it("should generate key for WorkflowReference with version", () => {
			expect(generateCacheKey({ name: "planning", version: "^1.0.0" })).toBe(
				"planning@^1.0.0",
			);
		});

		it("should generate key for WorkflowReference with export", () => {
			expect(generateCacheKey({ name: "tools", export: "refactor" })).toBe(
				"tools:refactor",
			);
		});

		it("should generate key for WorkflowReference with source", () => {
			expect(generateCacheKey({ name: "planning", source: "global" })).toBe(
				"global:planning",
			);
		});

		it("should generate key for full WorkflowReference", () => {
			expect(
				generateCacheKey({
					name: "@myorg/deploy",
					version: "~2.0.0",
					export: "rollback",
					source: "global",
				}),
			).toBe("global:@myorg/deploy@~2.0.0:rollback");
		});
	});

	describe("with context", () => {
		it("should append cwd to key", () => {
			const key = generateCacheKey("planning", { cwd: "/project" });
			expect(key).toBe("planning|cwd:/project");
		});

		it("should append prerelease flag to key", () => {
			const key = generateCacheKey("planning", { includePrerelease: true });
			expect(key).toBe("planning|prerelease");
		});

		it("should append both cwd and prerelease", () => {
			const key = generateCacheKey("planning", {
				cwd: "/project",
				includePrerelease: true,
			});
			expect(key).toBe("planning|cwd:/project|prerelease");
		});

		it("should not append context for empty context object", () => {
			const key = generateCacheKey("planning", {});
			expect(key).toBe("planning");
		});

		it("should not append context for false includePrerelease", () => {
			const key = generateCacheKey("planning", { includePrerelease: false });
			expect(key).toBe("planning");
		});
	});
});

describe("generateGraphCacheKey", () => {
	it("should prefix key with 'graph:'", () => {
		expect(generateGraphCacheKey("planning")).toBe("graph:planning");
	});

	it("should prefix versioned reference with 'graph:'", () => {
		expect(generateGraphCacheKey("planning@^1.0.0")).toBe(
			"graph:planning@^1.0.0",
		);
	});

	it("should prefix object reference with 'graph:'", () => {
		expect(generateGraphCacheKey({ name: "planning", version: "^1.0.0" })).toBe(
			"graph:planning@^1.0.0",
		);
	});

	it("should include context in graph key", () => {
		expect(generateGraphCacheKey("planning", { cwd: "/project" })).toBe(
			"graph:planning|cwd:/project",
		);
	});
});

// ============================================================================
// Cache Entry Helpers Tests
// ============================================================================

describe("isExpired", () => {
	it("should return false for entry with future expiration", () => {
		const entry = createMockCacheEntry("value", 300000);
		expect(isExpired(entry)).toBe(false);
	});

	it("should return true for entry with past expiration", () => {
		const entry = createMockCacheEntry("value");
		entry.expiresAt = Date.now() - 1000;
		expect(isExpired(entry)).toBe(true);
	});

	it("should return true for entry that just expired (edge case)", () => {
		const entry = createMockCacheEntry("value");
		entry.expiresAt = Date.now();
		// Small delay to ensure we're past the expiration
		expect(isExpired(entry)).toBe(true);
	});
});

describe("getRemainingTTL", () => {
	it("should return positive value for non-expired entry", () => {
		const entry = createMockCacheEntry("value", 300000);
		const remaining = getRemainingTTL(entry);
		expect(remaining).toBeGreaterThan(0);
		expect(remaining).toBeLessThanOrEqual(300000);
	});

	it("should return 0 for expired entry", () => {
		const entry = createMockCacheEntry("value");
		entry.expiresAt = Date.now() - 1000;
		expect(getRemainingTTL(entry)).toBe(0);
	});

	it("should return 0 for entry that just expired", () => {
		const entry = createMockCacheEntry("value");
		entry.expiresAt = Date.now() - 1;
		expect(getRemainingTTL(entry)).toBe(0);
	});
});

describe("getEntryAge", () => {
	it("should return age since creation", () => {
		const entry = createMockCacheEntry("value");
		entry.createdAt = Date.now() - 5000;
		const age = getEntryAge(entry);
		expect(age).toBeGreaterThanOrEqual(5000);
		expect(age).toBeLessThan(5100); // Allow small margin
	});

	it("should return 0 for just created entry", () => {
		const entry = createMockCacheEntry("value");
		const age = getEntryAge(entry);
		expect(age).toBeGreaterThanOrEqual(0);
		expect(age).toBeLessThan(100); // Should be nearly 0
	});
});

// ============================================================================
// ResolutionCache Tests
// ============================================================================

describe("ResolutionCache", () => {
	let cache: ResolutionCache;

	beforeEach(() => {
		// Create cache with cleanup disabled for deterministic tests
		cache = new ResolutionCache({ cleanupInterval: 0 });
	});

	afterEach(() => {
		cache.dispose();
	});

	// ============================================================================
	// Constructor and Options
	// ============================================================================

	describe("constructor", () => {
		it("should create cache with default options", () => {
			const defaultCache = new ResolutionCache();
			expect(defaultCache.size).toBe(0);
			defaultCache.dispose();
		});

		it("should accept custom defaultTTL", () => {
			const customCache = new ResolutionCache({
				defaultTTL: 60000,
				cleanupInterval: 0,
			});
			expect(customCache.size).toBe(0);
			customCache.dispose();
		});

		it("should accept custom maxEntries", () => {
			const customCache = new ResolutionCache({
				maxEntries: 100,
				cleanupInterval: 0,
			});
			expect(customCache.size).toBe(0);
			customCache.dispose();
		});

		it("should accept onEviction callback", () => {
			const evictions: Array<{ key: string; reason: EvictionReason }> = [];
			const customCache = new ResolutionCache({
				cleanupInterval: 0,
				onEviction: (key, reason) => evictions.push({ key, reason }),
			});

			customCache.setResolution("test", createMockResolvedWorkflow("test"));
			customCache.invalidate("test");

			expect(evictions.length).toBe(1);
			expect(evictions[0].key).toBe("test");
			expect(evictions[0].reason).toBe("manual");

			customCache.dispose();
		});
	});

	// ============================================================================
	// Resolution Cache Operations
	// ============================================================================

	describe("resolution caching", () => {
		describe("setResolution and getResolution", () => {
			it("should cache and retrieve a resolved workflow", () => {
				const resolved = createMockResolvedWorkflow("planning");
				cache.setResolution("planning@^1.0.0", resolved);

				const cached = cache.getResolution("planning@^1.0.0");
				expect(cached).toEqual(resolved);
			});

			it("should cache using WorkflowReference object", () => {
				const resolved = createMockResolvedWorkflow("planning");
				const ref = { name: "planning", version: "^1.0.0" };
				cache.setResolution(ref, resolved);

				const cached = cache.getResolution(ref);
				expect(cached).toEqual(resolved);
			});

			it("should return undefined for non-existent key", () => {
				const cached = cache.getResolution("non-existent");
				expect(cached).toBeUndefined();
			});

			it("should overwrite existing entry with same key", () => {
				const resolved1 = createMockResolvedWorkflow("planning", "1.0.0");
				const resolved2 = createMockResolvedWorkflow("planning", "2.0.0");

				cache.setResolution("planning@^1.0.0", resolved1);
				cache.setResolution("planning@^1.0.0", resolved2);

				const cached = cache.getResolution("planning@^1.0.0");
				expect(cached?.version).toBe("2.0.0");
			});

			it("should differentiate by context", () => {
				const resolved1 = createMockResolvedWorkflow("planning", "1.0.0");
				const resolved2 = createMockResolvedWorkflow("planning", "2.0.0");

				cache.setResolution("planning", resolved1, {
					context: { cwd: "/project1" },
				});
				cache.setResolution("planning", resolved2, {
					context: { cwd: "/project2" },
				});

				expect(cache.getResolution("planning", { cwd: "/project1" })).toEqual(
					resolved1,
				);
				expect(cache.getResolution("planning", { cwd: "/project2" })).toEqual(
					resolved2,
				);
			});
		});

		describe("hasResolution", () => {
			it("should return true for existing entry", () => {
				cache.setResolution("planning", createMockResolvedWorkflow("planning"));
				expect(cache.hasResolution("planning")).toBe(true);
			});

			it("should return false for non-existent entry", () => {
				expect(cache.hasResolution("non-existent")).toBe(false);
			});

			it("should return false for expired entry", () => {
				cache.setResolution(
					"planning",
					createMockResolvedWorkflow("planning"),
					{
						ttl: 0, // Immediately expires
					},
				);
				// Small delay to ensure expiration
				expect(cache.hasResolution("planning")).toBe(false);
			});
		});
	});

	// ============================================================================
	// Graph Cache Operations
	// ============================================================================

	describe("graph caching", () => {
		describe("setGraph and getGraph", () => {
			it("should cache and retrieve a dependency graph", () => {
				const graph = createMockDependencyGraph("planning");
				cache.setGraph("planning@^1.0.0", graph);

				const cached = cache.getGraph("planning@^1.0.0");
				expect(cached).toEqual(graph);
			});

			it("should cache using WorkflowReference object", () => {
				const graph = createMockDependencyGraph("planning");
				const ref = { name: "planning", version: "^1.0.0" };
				cache.setGraph(ref, graph);

				const cached = cache.getGraph(ref);
				expect(cached).toEqual(graph);
			});

			it("should return undefined for non-existent key", () => {
				const cached = cache.getGraph("non-existent");
				expect(cached).toBeUndefined();
			});
		});

		describe("hasGraph", () => {
			it("should return true for existing entry", () => {
				cache.setGraph("planning", createMockDependencyGraph("planning"));
				expect(cache.hasGraph("planning")).toBe(true);
			});

			it("should return false for non-existent entry", () => {
				expect(cache.hasGraph("non-existent")).toBe(false);
			});

			it("should return false for expired entry", () => {
				cache.setGraph("planning", createMockDependencyGraph("planning"), {
					ttl: 0,
				});
				expect(cache.hasGraph("planning")).toBe(false);
			});
		});
	});

	// ============================================================================
	// TTL Expiration Tests
	// ============================================================================

	describe("TTL expiration", () => {
		it("should return undefined for expired resolution", () => {
			cache.setResolution("planning", createMockResolvedWorkflow("planning"), {
				ttl: 0, // Immediately expires
			});

			const cached = cache.getResolution("planning");
			expect(cached).toBeUndefined();
		});

		it("should return undefined for expired graph", () => {
			cache.setGraph("planning", createMockDependencyGraph("planning"), {
				ttl: 0,
			});

			const cached = cache.getGraph("planning");
			expect(cached).toBeUndefined();
		});

		it("should use custom TTL when provided", () => {
			const customCache = new ResolutionCache({
				defaultTTL: 0, // Would immediately expire
				cleanupInterval: 0,
			});

			// Use longer TTL override
			customCache.setResolution(
				"planning",
				createMockResolvedWorkflow("planning"),
				{
					ttl: 300000,
				},
			);

			expect(customCache.hasResolution("planning")).toBe(true);
			customCache.dispose();
		});

		it("should track access and update lastAccessedAt", () => {
			cache.setResolution("planning", createMockResolvedWorkflow("planning"));

			// First access
			cache.getResolution("planning");
			// Second access
			cache.getResolution("planning");

			// Stats should show 2 hits
			const stats = cache.getStats();
			expect(stats.hits).toBe(2);
		});
	});

	// ============================================================================
	// Invalidation Tests
	// ============================================================================

	describe("invalidation", () => {
		describe("invalidate", () => {
			it("should invalidate a specific resolution entry", () => {
				cache.setResolution("planning", createMockResolvedWorkflow("planning"));
				cache.invalidate("planning");

				expect(cache.hasResolution("planning")).toBe(false);
			});

			it("should invalidate both resolution and graph for same reference", () => {
				cache.setResolution("planning", createMockResolvedWorkflow("planning"));
				cache.setGraph("planning", createMockDependencyGraph("planning"));

				cache.invalidate("planning");

				expect(cache.hasResolution("planning")).toBe(false);
				expect(cache.hasGraph("planning")).toBe(false);
			});

			it("should not affect other entries", () => {
				cache.setResolution("planning", createMockResolvedWorkflow("planning"));
				cache.setResolution("deploy", createMockResolvedWorkflow("deploy"));

				cache.invalidate("planning");

				expect(cache.hasResolution("planning")).toBe(false);
				expect(cache.hasResolution("deploy")).toBe(true);
			});

			it("should invalidate with context", () => {
				cache.setResolution(
					"planning",
					createMockResolvedWorkflow("planning"),
					{
						context: { cwd: "/project" },
					},
				);

				cache.invalidate("planning", { cwd: "/project" });

				expect(cache.hasResolution("planning", { cwd: "/project" })).toBe(
					false,
				);
			});
		});

		describe("invalidateByName", () => {
			it("should invalidate all entries matching name", () => {
				cache.setResolution(
					"planning@^1.0.0",
					createMockResolvedWorkflow("planning", "1.0.0"),
				);
				cache.setResolution(
					"planning@^2.0.0",
					createMockResolvedWorkflow("planning", "2.0.0"),
				);
				cache.setResolution("deploy", createMockResolvedWorkflow("deploy"));

				cache.invalidateByName("planning");

				expect(cache.hasResolution("planning@^1.0.0")).toBe(false);
				expect(cache.hasResolution("planning@^2.0.0")).toBe(false);
				expect(cache.hasResolution("deploy")).toBe(true);
			});

			it("should invalidate entries with export syntax", () => {
				cache.setResolution(
					"tools:refactor",
					createMockResolvedWorkflow("tools"),
				);
				cache.setResolution(
					"tools:analyze",
					createMockResolvedWorkflow("tools"),
				);

				cache.invalidateByName("tools");

				expect(cache.hasResolution("tools:refactor")).toBe(false);
				expect(cache.hasResolution("tools:analyze")).toBe(false);
			});

			it("should invalidate graph entries by name", () => {
				cache.setGraph(
					"planning@^1.0.0",
					createMockDependencyGraph("planning"),
				);
				cache.setGraph(
					"planning@^2.0.0",
					createMockDependencyGraph("planning"),
				);

				cache.invalidateByName("planning");

				expect(cache.hasGraph("planning@^1.0.0")).toBe(false);
				expect(cache.hasGraph("planning@^2.0.0")).toBe(false);
			});

			it("should not invalidate entries with similar but different names", () => {
				cache.setResolution("planning", createMockResolvedWorkflow("planning"));
				cache.setResolution(
					"planning-extended",
					createMockResolvedWorkflow("planning-extended"),
				);

				cache.invalidateByName("planning");

				expect(cache.hasResolution("planning")).toBe(false);
				expect(cache.hasResolution("planning-extended")).toBe(true);
			});
		});

		describe("invalidateByPattern", () => {
			it("should invalidate entries matching regex pattern", () => {
				cache.setResolution(
					"planning@^1.0.0",
					createMockResolvedWorkflow("planning"),
				);
				cache.setResolution(
					"deploy@^1.0.0",
					createMockResolvedWorkflow("deploy"),
				);
				cache.setResolution(
					"testing@^2.0.0",
					createMockResolvedWorkflow("testing"),
				);

				// Pattern matches keys ending with "^1.0.0"
				cache.invalidateByPattern(/\^1\.0\.0$/);

				// Should invalidate entries with version ^1.0.0
				expect(cache.hasResolution("planning@^1.0.0")).toBe(false);
				expect(cache.hasResolution("deploy@^1.0.0")).toBe(false);
				expect(cache.hasResolution("testing@^2.0.0")).toBe(true);
			});

			it("should invalidate graph entries matching pattern", () => {
				cache.setGraph("planning", createMockDependencyGraph("planning"));
				cache.setGraph("deploy", createMockDependencyGraph("deploy"));

				cache.invalidateByPattern(/^graph:planning/);

				expect(cache.hasGraph("planning")).toBe(false);
				expect(cache.hasGraph("deploy")).toBe(true);
			});

			it("should handle complex regex patterns", () => {
				cache.setResolution(
					"@myorg/planning",
					createMockResolvedWorkflow("@myorg/planning"),
				);
				cache.setResolution(
					"@myorg/deploy",
					createMockResolvedWorkflow("@myorg/deploy"),
				);
				cache.setResolution(
					"@other/planning",
					createMockResolvedWorkflow("@other/planning"),
				);

				cache.invalidateByPattern(/^@myorg\//);

				expect(cache.hasResolution("@myorg/planning")).toBe(false);
				expect(cache.hasResolution("@myorg/deploy")).toBe(false);
				expect(cache.hasResolution("@other/planning")).toBe(true);
			});
		});
	});

	// ============================================================================
	// Cache Management Tests
	// ============================================================================

	describe("cache management", () => {
		describe("clear", () => {
			it("should remove all entries", () => {
				cache.setResolution("planning", createMockResolvedWorkflow("planning"));
				cache.setResolution("deploy", createMockResolvedWorkflow("deploy"));
				cache.setGraph("planning", createMockDependencyGraph("planning"));

				cache.clear();

				expect(cache.size).toBe(0);
			});

			it("should trigger onEviction callbacks", () => {
				const evictions: string[] = [];
				const trackedCache = new ResolutionCache({
					cleanupInterval: 0,
					onEviction: (key) => evictions.push(key),
				});

				trackedCache.setResolution(
					"planning",
					createMockResolvedWorkflow("planning"),
				);
				trackedCache.setResolution(
					"deploy",
					createMockResolvedWorkflow("deploy"),
				);

				trackedCache.clear();

				expect(evictions).toContain("planning");
				expect(evictions).toContain("deploy");

				trackedCache.dispose();
			});

			it("should use provided eviction reason", () => {
				const evictions: Array<{ key: string; reason: EvictionReason }> = [];
				const trackedCache = new ResolutionCache({
					cleanupInterval: 0,
					onEviction: (key, reason) => evictions.push({ key, reason }),
				});

				trackedCache.setResolution(
					"planning",
					createMockResolvedWorkflow("planning"),
				);
				trackedCache.clear("stale");

				expect(evictions[0].reason).toBe("stale");

				trackedCache.dispose();
			});
		});

		describe("refresh", () => {
			it("should clear all entries with refresh reason", () => {
				const evictions: Array<{ key: string; reason: EvictionReason }> = [];
				const trackedCache = new ResolutionCache({
					cleanupInterval: 0,
					onEviction: (key, reason) => evictions.push({ key, reason }),
				});

				trackedCache.setResolution(
					"planning",
					createMockResolvedWorkflow("planning"),
				);
				trackedCache.refresh();

				expect(trackedCache.size).toBe(0);
				expect(evictions[0].reason).toBe("refresh");

				trackedCache.dispose();
			});
		});

		describe("cleanup", () => {
			it("should remove expired entries", () => {
				// Add entry with immediate expiration
				cache.setResolution("expired", createMockResolvedWorkflow("expired"), {
					ttl: 0,
				});
				// Add entry with long TTL
				cache.setResolution("valid", createMockResolvedWorkflow("valid"), {
					ttl: 300000,
				});

				const removed = cache.cleanup();

				expect(removed).toBe(1);
				expect(cache.hasResolution("expired")).toBe(false);
				expect(cache.hasResolution("valid")).toBe(true);
			});

			it("should return 0 when no entries are expired", () => {
				cache.setResolution("valid1", createMockResolvedWorkflow("valid1"));
				cache.setResolution("valid2", createMockResolvedWorkflow("valid2"));

				const removed = cache.cleanup();
				expect(removed).toBe(0);
			});

			it("should cleanup both resolution and graph caches", () => {
				cache.setResolution("expired", createMockResolvedWorkflow("expired"), {
					ttl: 0,
				});
				cache.setGraph("expired", createMockDependencyGraph("expired"), {
					ttl: 0,
				});

				const removed = cache.cleanup();
				expect(removed).toBe(2);
			});
		});

		describe("size", () => {
			it("should return total entries in both caches", () => {
				cache.setResolution("res1", createMockResolvedWorkflow("res1"));
				cache.setResolution("res2", createMockResolvedWorkflow("res2"));
				cache.setGraph("graph1", createMockDependencyGraph("graph1"));

				expect(cache.size).toBe(3);
			});

			it("should return 0 for empty cache", () => {
				expect(cache.size).toBe(0);
			});
		});

		describe("dispose", () => {
			it("should clear cache and stop cleanup timer", () => {
				const evictions: string[] = [];
				const trackedCache = new ResolutionCache({
					cleanupInterval: 1000, // Enable cleanup timer
					onEviction: (key) => evictions.push(key),
				});

				trackedCache.setResolution(
					"planning",
					createMockResolvedWorkflow("planning"),
				);
				trackedCache.dispose();

				expect(trackedCache.size).toBe(0);
				expect(evictions).toContain("planning");
			});
		});
	});

	// ============================================================================
	// Statistics Tests
	// ============================================================================

	describe("statistics", () => {
		describe("getStats", () => {
			it("should return initial stats", () => {
				const stats = cache.getStats();

				expect(stats.hits).toBe(0);
				expect(stats.misses).toBe(0);
				expect(stats.size).toBe(0);
				expect(stats.evictions).toBe(0);
				expect(stats.hitRate).toBe(0);
				expect(stats.lastReset).toBeLessThanOrEqual(Date.now());
			});

			it("should track hits", () => {
				cache.setResolution("planning", createMockResolvedWorkflow("planning"));
				cache.getResolution("planning");
				cache.getResolution("planning");

				const stats = cache.getStats();
				expect(stats.hits).toBe(2);
			});

			it("should track misses", () => {
				cache.getResolution("non-existent1");
				cache.getResolution("non-existent2");

				const stats = cache.getStats();
				expect(stats.misses).toBe(2);
			});

			it("should calculate hit rate correctly", () => {
				cache.setResolution("planning", createMockResolvedWorkflow("planning"));
				cache.getResolution("planning"); // hit
				cache.getResolution("planning"); // hit
				cache.getResolution("non-existent"); // miss

				const stats = cache.getStats();
				expect(stats.hitRate).toBeCloseTo(2 / 3, 5);
			});

			it("should track evictions", () => {
				cache.setResolution("planning", createMockResolvedWorkflow("planning"));
				cache.invalidate("planning");

				const stats = cache.getStats();
				expect(stats.evictions).toBe(1);
			});

			it("should track size", () => {
				cache.setResolution("res1", createMockResolvedWorkflow("res1"));
				cache.setGraph("graph1", createMockDependencyGraph("graph1"));

				const stats = cache.getStats();
				expect(stats.size).toBe(2);
			});
		});

		describe("resetStats", () => {
			it("should reset all counters", () => {
				cache.setResolution("planning", createMockResolvedWorkflow("planning"));
				cache.getResolution("planning");
				cache.getResolution("non-existent");
				cache.invalidate("planning");

				cache.resetStats();

				const stats = cache.getStats();
				expect(stats.hits).toBe(0);
				expect(stats.misses).toBe(0);
				expect(stats.evictions).toBe(0);
			});

			it("should update lastReset timestamp", () => {
				const beforeReset = Date.now();
				cache.resetStats();
				const stats = cache.getStats();

				expect(stats.lastReset).toBeGreaterThanOrEqual(beforeReset);
			});

			it("should not affect cache size", () => {
				cache.setResolution("planning", createMockResolvedWorkflow("planning"));
				cache.resetStats();

				expect(cache.size).toBe(1);
			});
		});
	});

	// ============================================================================
	// LRU Eviction Tests
	// ============================================================================

	describe("LRU eviction", () => {
		it("should evict oldest entry when capacity is exceeded", () => {
			const evictions: string[] = [];
			const smallCache = new ResolutionCache({
				maxEntries: 3,
				cleanupInterval: 0,
				onEviction: (key) => evictions.push(key),
			});

			// Add 3 entries (at capacity)
			smallCache.setResolution("first", createMockResolvedWorkflow("first"));
			smallCache.setResolution("second", createMockResolvedWorkflow("second"));
			smallCache.setResolution("third", createMockResolvedWorkflow("third"));

			// Access first to make it more recently used
			smallCache.getResolution("first");

			// Add 4th entry - should evict "second" (oldest accessed)
			smallCache.setResolution("fourth", createMockResolvedWorkflow("fourth"));

			expect(evictions).toContain("second");
			expect(smallCache.hasResolution("first")).toBe(true);
			expect(smallCache.hasResolution("third")).toBe(true);
			expect(smallCache.hasResolution("fourth")).toBe(true);

			smallCache.dispose();
		});

		it("should count both caches towards capacity", () => {
			const smallCache = new ResolutionCache({
				maxEntries: 2,
				cleanupInterval: 0,
			});

			smallCache.setResolution("res1", createMockResolvedWorkflow("res1"));
			smallCache.setGraph("graph1", createMockDependencyGraph("graph1"));

			// Cache is now at capacity - next set should evict
			smallCache.setResolution("res2", createMockResolvedWorkflow("res2"));

			expect(smallCache.size).toBe(2);

			smallCache.dispose();
		});
	});
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe("createResolutionCache", () => {
	it("should create cache with default options", () => {
		const cache = createResolutionCache();
		expect(cache).toBeInstanceOf(ResolutionCache);
		expect(cache.size).toBe(0);
		cache.dispose();
	});

	it("should create cache with custom options", () => {
		const cache = createResolutionCache({
			defaultTTL: 60000,
			maxEntries: 100,
			cleanupInterval: 0,
		});

		expect(cache).toBeInstanceOf(ResolutionCache);
		cache.dispose();
	});

	it("should create functional cache", () => {
		const cache = createResolutionCache({ cleanupInterval: 0 });

		cache.setResolution("planning", createMockResolvedWorkflow("planning"));
		expect(cache.hasResolution("planning")).toBe(true);

		cache.dispose();
	});
});

// ============================================================================
// Constants Tests
// ============================================================================

describe("EVICTION_REASONS", () => {
	it("should contain all eviction reasons", () => {
		expect(EVICTION_REASONS.EXPIRED).toBe("expired");
		expect(EVICTION_REASONS.MANUAL).toBe("manual");
		expect(EVICTION_REASONS.CAPACITY).toBe("capacity");
		expect(EVICTION_REASONS.REFRESH).toBe("refresh");
		expect(EVICTION_REASONS.STALE).toBe("stale");
	});

	it("should be immutable", () => {
		expect(Object.isFrozen(EVICTION_REASONS)).toBe(true);
	});
});

describe("DEFAULT_TTL", () => {
	it("should contain all TTL constants", () => {
		expect(DEFAULT_TTL.RESOLUTION).toBe(300000); // 5 minutes
		expect(DEFAULT_TTL.GRAPH).toBe(600000); // 10 minutes
		expect(DEFAULT_TTL.DEVELOPMENT).toBe(30000); // 30 seconds
		expect(DEFAULT_TTL.PRODUCTION).toBe(3600000); // 1 hour
	});

	it("should be immutable", () => {
		expect(Object.isFrozen(DEFAULT_TTL)).toBe(true);
	});
});

// ============================================================================
// Edge Cases Tests
// ============================================================================

describe("edge cases", () => {
	let cache: ResolutionCache;

	beforeEach(() => {
		cache = new ResolutionCache({ cleanupInterval: 0 });
	});

	afterEach(() => {
		cache.dispose();
	});

	it("should handle scoped package names in keys", () => {
		const resolved = createMockResolvedWorkflow("@myorg/planning");
		cache.setResolution("@myorg/planning@^1.0.0", resolved);

		expect(cache.hasResolution("@myorg/planning@^1.0.0")).toBe(true);
		expect(cache.getResolution("@myorg/planning@^1.0.0")).toEqual(resolved);
	});

	it("should handle special characters in context paths", () => {
		const resolved = createMockResolvedWorkflow("planning");
		cache.setResolution("planning", resolved, {
			context: { cwd: "/path/with spaces/and-dashes" },
		});

		expect(
			cache.hasResolution("planning", { cwd: "/path/with spaces/and-dashes" }),
		).toBe(true);
	});

	it("should handle empty cache operations gracefully", () => {
		expect(cache.cleanup()).toBe(0);
		expect(cache.getStats().size).toBe(0);

		// Should not throw
		cache.invalidateByName("non-existent");
		cache.invalidateByPattern(/.*$/);
		cache.clear();
	});

	it("should handle rapid set/get operations", () => {
		for (let i = 0; i < 100; i++) {
			const name = `workflow-${i}`;
			cache.setResolution(name, createMockResolvedWorkflow(name));
			expect(cache.getResolution(name)).toBeDefined();
		}

		expect(cache.size).toBe(100);
	});

	it("should handle invalid reference gracefully when getting", () => {
		// Empty string
		expect(cache.getResolution("")).toBeUndefined();

		// Whitespace
		expect(cache.getResolution("   ")).toBeUndefined();
	});

	it("should handle concurrent access patterns", () => {
		const resolved = createMockResolvedWorkflow("planning");

		// Simulate multiple set operations
		cache.setResolution("planning", resolved);
		cache.setResolution("planning", resolved);
		cache.setResolution("planning", resolved);

		// Should still have only one entry
		const stats = cache.getStats();
		expect(stats.size).toBe(1);
	});
});
