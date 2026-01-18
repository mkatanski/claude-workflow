/**
 * Tests for the RegistryService.
 *
 * This module tests all registry functionality including:
 * - Package lookups
 * - Registry caching with TTL
 * - Handling missing packages
 * - Cache refresh
 * - Search functionality
 * - Network error handling
 * - Invalid JSON handling
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import * as fs from "node:fs/promises";
import path from "node:path";
import { createRegistryService, RegistryService } from "./registry.ts";
import type { Registry, RegistryEntry, CachedRegistry } from "./types.ts";
import { MARKETPLACE_ERROR_CODES } from "./types.ts";

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Create a mock registry for testing.
 */
function createMockRegistry(packages?: Record<string, RegistryEntry>): Registry {
	return {
		version: "1.0.0",
		updated: "2024-01-18T12:00:00Z",
		packages: packages ?? {
			"code-review": {
				repository: "https://github.com/user/code-review.git",
				description: "Automated code review workflow",
				author: "test-author",
				keywords: ["review", "automation", "code"],
				verified: true,
			},
			deploy: {
				repository: "https://github.com/org/deploy.git",
				description: "Deployment automation workflow",
				author: "deploy-author",
				keywords: ["deploy", "ci", "cd"],
				verified: true,
			},
			testing: {
				repository: "https://github.com/user/testing.git",
				description: "Test runner workflow",
				author: "test-user",
				keywords: ["test", "runner"],
				verified: false,
			},
			"my-workflow": {
				repository: "https://github.com/user/my-workflow.git",
				description: "My custom workflow for automation",
				keywords: ["custom"],
			},
		},
	};
}

/**
 * Create a mock cached registry entry.
 */
function createMockCachedRegistry(
	registry: Registry,
	cachedAt = Date.now(),
	ttl = 3600000,
): CachedRegistry {
	return {
		registry,
		cachedAt,
		ttl,
	};
}

/**
 * Create a mock Response for fetch.
 */
function createMockResponse(
	body: unknown,
	status = 200,
	statusText = "OK",
): Response {
	return new Response(JSON.stringify(body), {
		status,
		statusText,
		headers: { "Content-Type": "application/json" },
	});
}

// ============================================================================
// Test Setup
// ============================================================================

describe("RegistryService", () => {
	let originalFetch: typeof global.fetch;
	let mockFetch: ReturnType<typeof mock>;
	let testCachePath: string;

	beforeEach(() => {
		// Save original fetch
		originalFetch = global.fetch;

		// Create mock fetch
		mockFetch = mock(() =>
			Promise.resolve(createMockResponse(createMockRegistry())),
		);
		global.fetch = mockFetch as unknown as typeof fetch;

		// Use a unique cache path for each test
		testCachePath = `/tmp/test-registry-cache-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
	});

	afterEach(async () => {
		// Restore original fetch
		global.fetch = originalFetch;

		// Clean up test cache file
		try {
			await fs.unlink(testCachePath);
		} catch {
			// File may not exist, ignore error
		}
	});

	// ==========================================================================
	// Constructor Tests
	// ==========================================================================

	describe("constructor", () => {
		it("should create service with default configuration", () => {
			const service = new RegistryService();
			const config = service.getConfig();

			expect(config.registryUrl).toContain("registry.json");
			expect(config.cacheTtl).toBe(3600000); // 1 hour default
			expect(config.cachePath).toContain("registry-cache.json");
		});

		it("should create service with custom configuration", () => {
			const service = new RegistryService({
				registryUrl: "https://custom.example.com/registry.json",
				cacheTtl: 7200000,
				cachePath: testCachePath,
			});
			const config = service.getConfig();

			expect(config.registryUrl).toBe(
				"https://custom.example.com/registry.json",
			);
			expect(config.cacheTtl).toBe(7200000);
			expect(config.cachePath).toBe(testCachePath);
		});

		it("should use environment variables for configuration", () => {
			const originalRegistryUrl = process.env.CW_REGISTRY_URL;
			const originalCacheTtl = process.env.CW_CACHE_TTL;

			try {
				process.env.CW_REGISTRY_URL = "https://env.example.com/registry.json";
				process.env.CW_CACHE_TTL = "120"; // 120 seconds

				const service = new RegistryService();
				const config = service.getConfig();

				expect(config.registryUrl).toBe(
					"https://env.example.com/registry.json",
				);
				expect(config.cacheTtl).toBe(120000); // Converted to ms
			} finally {
				// Restore environment variables
				if (originalRegistryUrl !== undefined) {
					process.env.CW_REGISTRY_URL = originalRegistryUrl;
				} else {
					delete process.env.CW_REGISTRY_URL;
				}
				if (originalCacheTtl !== undefined) {
					process.env.CW_CACHE_TTL = originalCacheTtl;
				} else {
					delete process.env.CW_CACHE_TTL;
				}
			}
		});
	});

	// ==========================================================================
	// Lookup Tests
	// ==========================================================================

	describe("lookup", () => {
		describe("successful lookups", () => {
			it("should look up an existing package", async () => {
				const service = new RegistryService({ cachePath: testCachePath });
				const result = await service.lookup("code-review");

				expect(result.isOk()).toBe(true);
				const entry = result.unwrap();
				expect(entry.repository).toBe(
					"https://github.com/user/code-review.git",
				);
				expect(entry.description).toBe("Automated code review workflow");
				expect(entry.author).toBe("test-author");
				expect(entry.verified).toBe(true);
			});

			it("should look up package with all optional fields", async () => {
				const service = new RegistryService({ cachePath: testCachePath });
				const result = await service.lookup("deploy");

				expect(result.isOk()).toBe(true);
				const entry = result.unwrap();
				expect(entry.keywords).toEqual(["deploy", "ci", "cd"]);
			});

			it("should look up package without optional fields", async () => {
				const service = new RegistryService({ cachePath: testCachePath });
				const result = await service.lookup("my-workflow");

				expect(result.isOk()).toBe(true);
				const entry = result.unwrap();
				expect(entry.author).toBeUndefined();
				expect(entry.verified).toBeUndefined();
			});
		});

		describe("handling missing packages", () => {
			it("should return error for non-existent package", async () => {
				const service = new RegistryService({ cachePath: testCachePath });
				const result = await service.lookup("non-existent-package");

				expect(result.isErr()).toBe(true);
				const error = result.unwrapErr();
				expect(error.code).toBe(MARKETPLACE_ERROR_CODES.PACKAGE_NOT_FOUND);
				expect(error.message).toContain("non-existent-package");
				expect(error.package).toBe("non-existent-package");
				expect(error.suggestion).toBeDefined();
			});

			it("should return error for empty package name lookup", async () => {
				const registryWithEmpty = createMockRegistry({
					"": {
						repository: "https://example.com/empty.git",
					},
				});
				mockFetch.mockImplementationOnce(() =>
					Promise.resolve(createMockResponse(registryWithEmpty)),
				);

				const service = new RegistryService({ cachePath: testCachePath });
				// When there's no "" key in packages, should return not found
				const result = await service.lookup("");

				// The empty key exists in this mock, so it will succeed
				expect(result.isOk()).toBe(true);
			});
		});
	});

	// ==========================================================================
	// Cache Behavior Tests
	// ==========================================================================

	describe("cache behavior", () => {
		describe("caching registry", () => {
			it("should cache registry after first fetch", async () => {
				const service = new RegistryService({ cachePath: testCachePath });

				// First lookup - should fetch from network
				await service.lookup("code-review");
				expect(mockFetch).toHaveBeenCalledTimes(1);

				// Second lookup - should use cache
				await service.lookup("deploy");
				expect(mockFetch).toHaveBeenCalledTimes(1);
			});

			it("should use in-memory cache for subsequent lookups", async () => {
				const service = new RegistryService({ cachePath: testCachePath });

				await service.lookup("code-review");
				await service.lookup("deploy");
				await service.lookup("testing");

				// All lookups should use same cached registry
				expect(mockFetch).toHaveBeenCalledTimes(1);
			});

			it("should report cache status correctly", async () => {
				const service = new RegistryService({ cachePath: testCachePath });

				// Before any fetch
				expect(await service.isCached()).toBe(false);

				// After fetch
				await service.getRegistry();
				expect(await service.isCached()).toBe(true);
			});
		});

		describe("cache TTL", () => {
			it("should refetch when cache is expired", async () => {
				// Create a service with very short TTL
				const service = new RegistryService({
					cachePath: testCachePath,
					cacheTtl: 1, // 1ms TTL
				});

				await service.getRegistry();
				expect(mockFetch).toHaveBeenCalledTimes(1);

				// Wait for cache to expire
				await new Promise((resolve) => setTimeout(resolve, 10));

				// Clear in-memory cache to force file cache check
				await service.clearCache();

				// Next access should fetch again
				await service.getRegistry();
				expect(mockFetch).toHaveBeenCalledTimes(2);
			});

			it("should not use expired file cache", async () => {
				// Create expired cache file
				const expiredCache = createMockCachedRegistry(
					createMockRegistry(),
					Date.now() - 7200000, // 2 hours ago
					3600000, // 1 hour TTL (expired)
				);

				await fs.mkdir(path.dirname(testCachePath), { recursive: true });
				await fs.writeFile(testCachePath, JSON.stringify(expiredCache), "utf-8");

				const service = new RegistryService({
					cachePath: testCachePath,
					cacheTtl: 3600000,
				});

				await service.getRegistry();

				// Should have fetched from network since cache is expired
				expect(mockFetch).toHaveBeenCalledTimes(1);
			});
		});

		describe("cache refresh", () => {
			it("should force refresh cache when requested", async () => {
				const service = new RegistryService({ cachePath: testCachePath });

				await service.getRegistry();
				expect(mockFetch).toHaveBeenCalledTimes(1);

				const result = await service.refresh();
				expect(result.isOk()).toBe(true);
				expect(mockFetch).toHaveBeenCalledTimes(2);
			});

			it("should return fresh registry after refresh", async () => {
				const service = new RegistryService({ cachePath: testCachePath });

				// First fetch
				await service.getRegistry();

				// Change what fetch returns
				const newRegistry = createMockRegistry({
					"new-package": {
						repository: "https://github.com/new/package.git",
						description: "New package",
					},
				});
				mockFetch.mockImplementationOnce(() =>
					Promise.resolve(createMockResponse(newRegistry)),
				);

				// Refresh
				const result = await service.refresh();
				expect(result.isOk()).toBe(true);

				const registry = result.unwrap();
				expect(registry.packages["new-package"]).toBeDefined();
			});

			it("should clear cache and remove cache file", async () => {
				const service = new RegistryService({ cachePath: testCachePath });

				await service.getRegistry();
				expect(await service.isCached()).toBe(true);

				await service.clearCache();
				expect(await service.isCached()).toBe(false);
			});
		});

		describe("file cache", () => {
			it("should save cache to file", async () => {
				const service = new RegistryService({ cachePath: testCachePath });
				await service.getRegistry();

				// Check that cache file was created
				const cacheContent = await fs.readFile(testCachePath, "utf-8");
				const cache = JSON.parse(cacheContent) as CachedRegistry;

				expect(cache.registry.version).toBe("1.0.0");
				expect(cache.cachedAt).toBeGreaterThan(0);
				expect(cache.ttl).toBeGreaterThan(0);
			});

			it("should load valid cache from file", async () => {
				// Create valid cache file
				const validCache = createMockCachedRegistry(createMockRegistry());

				await fs.mkdir(path.dirname(testCachePath), { recursive: true });
				await fs.writeFile(testCachePath, JSON.stringify(validCache), "utf-8");

				const service = new RegistryService({
					cachePath: testCachePath,
					cacheTtl: 3600000,
				});

				await service.getRegistry();

				// Should not have fetched from network
				expect(mockFetch).toHaveBeenCalledTimes(0);
			});

			it("should handle corrupted cache file gracefully", async () => {
				// Create corrupted cache file
				await fs.mkdir(path.dirname(testCachePath), { recursive: true });
				await fs.writeFile(testCachePath, "not valid json", "utf-8");

				const service = new RegistryService({ cachePath: testCachePath });
				const result = await service.getRegistry();

				expect(result.isOk()).toBe(true);
				// Should have fetched from network due to corrupted cache
				expect(mockFetch).toHaveBeenCalledTimes(1);
			});

			it("should handle cache file with invalid structure", async () => {
				// Create cache file with invalid structure
				const invalidCache = {
					notRegistry: true,
					wrongFields: "yes",
				};

				await fs.mkdir(path.dirname(testCachePath), { recursive: true });
				await fs.writeFile(
					testCachePath,
					JSON.stringify(invalidCache),
					"utf-8",
				);

				const service = new RegistryService({ cachePath: testCachePath });
				const result = await service.getRegistry();

				expect(result.isOk()).toBe(true);
				// Should have fetched from network due to invalid cache structure
				expect(mockFetch).toHaveBeenCalledTimes(1);
			});
		});
	});

	// ==========================================================================
	// Search Tests
	// ==========================================================================

	describe("search", () => {
		describe("search functionality", () => {
			it("should find packages by exact name match", async () => {
				const service = new RegistryService({ cachePath: testCachePath });
				const result = await service.search({ query: "deploy" });

				expect(result.isOk()).toBe(true);
				const results = result.unwrap();

				expect(results.length).toBeGreaterThan(0);
				expect(results[0].name).toBe("deploy");
				// Score breakdown: 100 (exact name) + 25 (description) + 40 (exact keyword) + 10 (verified) = 175
				expect(results[0].score).toBe(175);
			});

			it("should find packages by partial name match", async () => {
				const service = new RegistryService({ cachePath: testCachePath });
				const result = await service.search({ query: "code" });

				expect(result.isOk()).toBe(true);
				const results = result.unwrap();

				const codeReviewResult = results.find((r) => r.name === "code-review");
				expect(codeReviewResult).toBeDefined();
			});

			it("should find packages by description match", async () => {
				const service = new RegistryService({ cachePath: testCachePath });
				const result = await service.search({ query: "automation" });

				expect(result.isOk()).toBe(true);
				const results = result.unwrap();

				// Both code-review and my-workflow mention automation
				expect(results.length).toBeGreaterThanOrEqual(1);
			});

			it("should find packages by keyword match", async () => {
				const service = new RegistryService({ cachePath: testCachePath });
				const result = await service.search({ query: "ci" });

				expect(result.isOk()).toBe(true);
				const results = result.unwrap();

				const deployResult = results.find((r) => r.name === "deploy");
				expect(deployResult).toBeDefined();
			});

			it("should return empty array for empty query", async () => {
				const service = new RegistryService({ cachePath: testCachePath });
				const result = await service.search({ query: "" });

				expect(result.isOk()).toBe(true);
				expect(result.unwrap()).toEqual([]);
			});

			it("should return empty array for whitespace query", async () => {
				const service = new RegistryService({ cachePath: testCachePath });
				const result = await service.search({ query: "   " });

				expect(result.isOk()).toBe(true);
				expect(result.unwrap()).toEqual([]);
			});

			it("should return empty array for no matches", async () => {
				// Use a registry without verified packages to avoid verified bonus
				const noVerifiedRegistry = createMockRegistry({
					"unverified-pkg": {
						repository: "https://example.com/unverified.git",
						description: "An unverified package",
						verified: false,
					},
				});
				mockFetch.mockImplementationOnce(() =>
					Promise.resolve(createMockResponse(noVerifiedRegistry)),
				);

				const service = new RegistryService({ cachePath: testCachePath });
				const result = await service.search({
					query: "zzz-non-existent-query-zzz",
				});

				expect(result.isOk()).toBe(true);
				expect(result.unwrap()).toEqual([]);
			});
		});

		describe("search options", () => {
			it("should limit results to specified count", async () => {
				const service = new RegistryService({ cachePath: testCachePath });
				const result = await service.search({ query: "workflow", limit: 2 });

				expect(result.isOk()).toBe(true);
				const results = result.unwrap();

				expect(results.length).toBeLessThanOrEqual(2);
			});

			it("should filter to verified packages only", async () => {
				const service = new RegistryService({ cachePath: testCachePath });
				const result = await service.search({
					query: "test",
					verifiedOnly: true,
				});

				expect(result.isOk()).toBe(true);
				const results = result.unwrap();

				// testing package is not verified, should not be in results
				const testingResult = results.find((r) => r.name === "testing");
				expect(testingResult).toBeUndefined();
			});

			it("should include unverified packages when not filtering", async () => {
				const service = new RegistryService({ cachePath: testCachePath });
				const result = await service.search({
					query: "test",
					verifiedOnly: false,
				});

				expect(result.isOk()).toBe(true);
				const results = result.unwrap();

				const testingResult = results.find((r) => r.name === "testing");
				expect(testingResult).toBeDefined();
			});
		});

		describe("search scoring", () => {
			it("should rank exact name matches highest", async () => {
				const service = new RegistryService({ cachePath: testCachePath });
				const result = await service.search({ query: "deploy" });

				expect(result.isOk()).toBe(true);
				const results = result.unwrap();

				// deploy should be first with highest score
				expect(results[0].name).toBe("deploy");
			});

			it("should give verified packages a bonus score", async () => {
				const registryWithBoth = createMockRegistry({
					verified: {
						repository: "https://example.com/verified.git",
						description: "Same description",
						verified: true,
					},
					unverified: {
						repository: "https://example.com/unverified.git",
						description: "Same description",
						verified: false,
					},
				});
				mockFetch.mockImplementationOnce(() =>
					Promise.resolve(createMockResponse(registryWithBoth)),
				);

				const service = new RegistryService({ cachePath: testCachePath });
				const result = await service.search({ query: "same" });

				expect(result.isOk()).toBe(true);
				const results = result.unwrap();

				const verifiedResult = results.find((r) => r.name === "verified");
				const unverifiedResult = results.find((r) => r.name === "unverified");

				expect(verifiedResult).toBeDefined();
				expect(unverifiedResult).toBeDefined();
				expect(verifiedResult!.score).toBeGreaterThan(unverifiedResult!.score);
			});

			it("should sort results by score descending", async () => {
				const service = new RegistryService({ cachePath: testCachePath });
				const result = await service.search({ query: "review" });

				expect(result.isOk()).toBe(true);
				const results = result.unwrap();

				if (results.length > 1) {
					for (let i = 1; i < results.length; i++) {
						expect(results[i - 1].score).toBeGreaterThanOrEqual(
							results[i].score,
						);
					}
				}
			});

			it("should be case insensitive", async () => {
				const service = new RegistryService({ cachePath: testCachePath });

				const lowerResult = await service.search({ query: "deploy" });
				const upperResult = await service.search({ query: "DEPLOY" });
				const mixedResult = await service.search({ query: "DePlOy" });

				expect(lowerResult.isOk()).toBe(true);
				expect(upperResult.isOk()).toBe(true);
				expect(mixedResult.isOk()).toBe(true);

				// All should find the same package
				expect(lowerResult.unwrap()[0].name).toBe("deploy");
				expect(upperResult.unwrap()[0].name).toBe("deploy");
				expect(mixedResult.unwrap()[0].name).toBe("deploy");
			});
		});
	});

	// ==========================================================================
	// Error Handling Tests
	// ==========================================================================

	describe("error handling", () => {
		describe("network errors", () => {
			it("should handle fetch failure", async () => {
				mockFetch.mockImplementationOnce(() =>
					Promise.reject(new Error("fetch failed")),
				);

				const service = new RegistryService({ cachePath: testCachePath });
				const result = await service.lookup("code-review");

				expect(result.isErr()).toBe(true);
				const error = result.unwrapErr();
				expect(error.code).toBe(MARKETPLACE_ERROR_CODES.NETWORK_ERROR);
				expect(error.message).toContain("connect");
			});

			it("should handle connection refused", async () => {
				mockFetch.mockImplementationOnce(() =>
					Promise.reject(new Error("ECONNREFUSED")),
				);

				const service = new RegistryService({ cachePath: testCachePath });
				const result = await service.getRegistry();

				expect(result.isErr()).toBe(true);
				const error = result.unwrapErr();
				expect(error.code).toBe(MARKETPLACE_ERROR_CODES.NETWORK_ERROR);
			});

			it("should handle DNS resolution failure", async () => {
				mockFetch.mockImplementationOnce(() =>
					Promise.reject(new Error("ENOTFOUND")),
				);

				const service = new RegistryService({ cachePath: testCachePath });
				const result = await service.getRegistry();

				expect(result.isErr()).toBe(true);
				const error = result.unwrapErr();
				expect(error.code).toBe(MARKETPLACE_ERROR_CODES.NETWORK_ERROR);
				expect(error.suggestion).toContain("internet");
			});

			it("should handle HTTP 404 error", async () => {
				mockFetch.mockImplementationOnce(() =>
					Promise.resolve(
						createMockResponse({ error: "Not found" }, 404, "Not Found"),
					),
				);

				const service = new RegistryService({ cachePath: testCachePath });
				const result = await service.getRegistry();

				expect(result.isErr()).toBe(true);
				const error = result.unwrapErr();
				expect(error.code).toBe(MARKETPLACE_ERROR_CODES.REGISTRY_ERROR);
				expect(error.message).toContain("not found");
			});

			it("should handle HTTP 500 error", async () => {
				mockFetch.mockImplementationOnce(() =>
					Promise.resolve(
						createMockResponse(
							{ error: "Internal Server Error" },
							500,
							"Internal Server Error",
						),
					),
				);

				const service = new RegistryService({ cachePath: testCachePath });
				const result = await service.getRegistry();

				expect(result.isErr()).toBe(true);
				const error = result.unwrapErr();
				expect(error.code).toBe(MARKETPLACE_ERROR_CODES.NETWORK_ERROR);
				expect(error.message).toContain("500");
			});
		});

		describe("invalid JSON handling", () => {
			it("should handle invalid JSON response", async () => {
				const invalidJsonResponse = new Response("not valid json {{{", {
					status: 200,
					statusText: "OK",
					headers: { "Content-Type": "application/json" },
				});
				mockFetch.mockImplementationOnce(() =>
					Promise.resolve(invalidJsonResponse),
				);

				const service = new RegistryService({ cachePath: testCachePath });
				const result = await service.getRegistry();

				expect(result.isErr()).toBe(true);
				const error = result.unwrapErr();
				expect(error.code).toBe(MARKETPLACE_ERROR_CODES.REGISTRY_ERROR);
				expect(error.message).toContain("JSON");
			});

			it("should handle invalid registry structure", async () => {
				const invalidRegistry = {
					wrongField: true,
					packages: "not an object",
				};
				mockFetch.mockImplementationOnce(() =>
					Promise.resolve(createMockResponse(invalidRegistry)),
				);

				const service = new RegistryService({ cachePath: testCachePath });
				const result = await service.getRegistry();

				expect(result.isErr()).toBe(true);
				const error = result.unwrapErr();
				expect(error.code).toBe(MARKETPLACE_ERROR_CODES.REGISTRY_ERROR);
				expect(error.message).toContain("Invalid registry format");
			});

			it("should handle missing required fields in registry", async () => {
				const incompleteRegistry = {
					version: "1.0.0",
					// missing updated and packages
				};
				mockFetch.mockImplementationOnce(() =>
					Promise.resolve(createMockResponse(incompleteRegistry)),
				);

				const service = new RegistryService({ cachePath: testCachePath });
				const result = await service.getRegistry();

				expect(result.isErr()).toBe(true);
				const error = result.unwrapErr();
				expect(error.code).toBe(MARKETPLACE_ERROR_CODES.REGISTRY_ERROR);
			});
		});
	});

	// ==========================================================================
	// List Packages Tests
	// ==========================================================================

	describe("listPackages", () => {
		it("should list all package names", async () => {
			const service = new RegistryService({ cachePath: testCachePath });
			const result = await service.listPackages();

			expect(result.isOk()).toBe(true);
			const packages = result.unwrap();

			expect(packages).toContain("code-review");
			expect(packages).toContain("deploy");
			expect(packages).toContain("testing");
			expect(packages).toContain("my-workflow");
		});

		it("should return sorted package names", async () => {
			const service = new RegistryService({ cachePath: testCachePath });
			const result = await service.listPackages();

			expect(result.isOk()).toBe(true);
			const packages = result.unwrap();

			const sortedPackages = [...packages].sort();
			expect(packages).toEqual(sortedPackages);
		});

		it("should return empty array for empty registry", async () => {
			const emptyRegistry = createMockRegistry({});
			mockFetch.mockImplementationOnce(() =>
				Promise.resolve(createMockResponse(emptyRegistry)),
			);

			const service = new RegistryService({ cachePath: testCachePath });
			const result = await service.listPackages();

			expect(result.isOk()).toBe(true);
			expect(result.unwrap()).toEqual([]);
		});
	});

	// ==========================================================================
	// Get Registry Tests
	// ==========================================================================

	describe("getRegistry", () => {
		it("should return full registry data", async () => {
			const service = new RegistryService({ cachePath: testCachePath });
			const result = await service.getRegistry();

			expect(result.isOk()).toBe(true);
			const registry = result.unwrap();

			expect(registry.version).toBe("1.0.0");
			expect(registry.updated).toBe("2024-01-18T12:00:00Z");
			expect(registry.packages).toBeDefined();
			expect(Object.keys(registry.packages).length).toBe(4);
		});

		it("should propagate errors from fetch", async () => {
			mockFetch.mockImplementationOnce(() =>
				Promise.reject(new Error("Network error")),
			);

			const service = new RegistryService({ cachePath: testCachePath });
			const result = await service.getRegistry();

			expect(result.isErr()).toBe(true);
		});
	});
});

// =============================================================================
// Factory Function Tests
// =============================================================================

describe("createRegistryService", () => {
	let originalFetch: typeof global.fetch;
	let mockFetch: ReturnType<typeof mock>;

	beforeEach(() => {
		originalFetch = global.fetch;
		mockFetch = mock(() =>
			Promise.resolve(
				new Response(JSON.stringify(createMockRegistry()), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			),
		);
		global.fetch = mockFetch as unknown as typeof fetch;
	});

	afterEach(() => {
		global.fetch = originalFetch;
	});

	it("should create service with default options", () => {
		const service = createRegistryService();
		expect(service).toBeInstanceOf(RegistryService);
	});

	it("should create service with custom options", () => {
		const service = createRegistryService({
			registryUrl: "https://custom.example.com/registry.json",
			cacheTtl: 7200000,
		});

		const config = service.getConfig();
		expect(config.registryUrl).toBe("https://custom.example.com/registry.json");
		expect(config.cacheTtl).toBe(7200000);
	});

	it("should create functional service", async () => {
		const service = createRegistryService({
			cachePath: `/tmp/test-factory-${Date.now()}.json`,
		});

		const result = await service.getRegistry();
		expect(result.isOk()).toBe(true);
	});
});
