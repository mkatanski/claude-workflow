/**
 * Registry service for marketplace package lookups.
 *
 * Provides methods for looking up packages in the central registry,
 * searching for packages by keyword, and managing the local registry cache.
 *
 * The registry is a JSON file hosted at a configurable URL that maps
 * package names to git repository URLs and metadata.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { ok, err, type ResultBox } from "../utils/result/index.ts";
import type {
	Registry,
	RegistryEntry,
	CachedRegistry,
	RegistryServiceConfig,
	MarketplaceError,
	MarketplaceErrorCode,
} from "./types.ts";
import { MARKETPLACE_ERROR_CODES, isRegistry } from "./types.ts";

// ============================================================================
// Types
// ============================================================================

/**
 * Result type for registry operations.
 */
export type RegistryResult<T> = ResultBox<T, MarketplaceError>;

/**
 * Search options for finding packages.
 */
export interface SearchOptions {
	/** Search term (matched against name, description, keywords) */
	query: string;

	/** Maximum number of results to return */
	limit?: number;

	/** Only return verified packages */
	verifiedOnly?: boolean;
}

/**
 * Search result with matched package info.
 */
export interface SearchResult {
	/** Package name */
	name: string;

	/** Registry entry */
	entry: RegistryEntry;

	/** Search relevance score (higher is better) */
	score: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a marketplace error with consistent structure.
 */
function createMarketplaceError(
	code: MarketplaceErrorCode,
	message: string,
	pkg?: string,
	cause?: string,
	suggestion?: string,
): MarketplaceError {
	return {
		code,
		message,
		package: pkg,
		cause,
		suggestion,
	};
}

/**
 * Check if a path exists on the filesystem.
 */
async function pathExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

/**
 * Calculate search relevance score for a package.
 * Higher scores indicate better matches.
 */
function calculateSearchScore(
	name: string,
	entry: RegistryEntry,
	query: string,
): number {
	const lowerQuery = query.toLowerCase();
	const lowerName = name.toLowerCase();
	let score = 0;

	// Exact name match - highest priority
	if (lowerName === lowerQuery) {
		score += 100;
	}
	// Name starts with query
	else if (lowerName.startsWith(lowerQuery)) {
		score += 75;
	}
	// Name contains query
	else if (lowerName.includes(lowerQuery)) {
		score += 50;
	}

	// Description match
	if (entry.description) {
		const lowerDesc = entry.description.toLowerCase();
		if (lowerDesc.includes(lowerQuery)) {
			score += 25;
		}
	}

	// Keyword match
	if (entry.keywords) {
		for (const keyword of entry.keywords) {
			const lowerKeyword = keyword.toLowerCase();
			if (lowerKeyword === lowerQuery) {
				score += 40;
			} else if (lowerKeyword.includes(lowerQuery)) {
				score += 20;
			}
		}
	}

	// Verified packages get a bonus
	if (entry.verified) {
		score += 10;
	}

	return score;
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default registry URL.
 * Can be overridden via CW_REGISTRY_URL environment variable.
 */
const DEFAULT_REGISTRY_URL =
	"https://raw.githubusercontent.com/cw-workflows/registry/main/registry.json";

/**
 * Default cache TTL in milliseconds (1 hour).
 * Can be overridden via CW_CACHE_TTL environment variable.
 */
const DEFAULT_CACHE_TTL = 60 * 60 * 1000;

/**
 * Default cache path relative to home directory.
 */
const DEFAULT_CACHE_FILENAME = "registry-cache.json";

// ============================================================================
// RegistryService Class
// ============================================================================

/**
 * Registry service for marketplace package lookups.
 *
 * Provides methods for:
 * - Looking up packages by name
 * - Searching for packages by keyword
 * - Refreshing the registry cache
 * - Managing local caching with TTL
 *
 * @example
 * ```typescript
 * const registryService = new RegistryService({
 *   registryUrl: 'https://example.com/registry.json',
 *   cacheTtl: 3600000, // 1 hour
 *   cachePath: '/home/user/.cw/registry-cache.json'
 * });
 *
 * // Look up a package
 * const result = await registryService.lookup('code-review');
 * if (result.isOk()) {
 *   const entry = result.unwrap();
 *   console.log(`Repository: ${entry.repository}`);
 * }
 *
 * // Search for packages
 * const searchResult = await registryService.search({ query: 'deploy' });
 * if (searchResult.isOk()) {
 *   const packages = searchResult.unwrap();
 *   for (const pkg of packages) {
 *     console.log(`${pkg.name}: ${pkg.entry.description}`);
 *   }
 * }
 * ```
 */
export class RegistryService {
	private readonly config: RegistryServiceConfig;
	private cachedRegistry: CachedRegistry | null = null;

	/**
	 * Create a new RegistryService instance.
	 *
	 * @param config - Service configuration. If not provided, uses defaults
	 *                 with environment variable overrides.
	 */
	constructor(config?: Partial<RegistryServiceConfig>) {
		const envRegistryUrl = process.env.CW_REGISTRY_URL;
		const envCacheTtl = process.env.CW_CACHE_TTL;
		const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? "";

		this.config = {
			registryUrl:
				config?.registryUrl ?? envRegistryUrl ?? DEFAULT_REGISTRY_URL,
			cacheTtl:
				config?.cacheTtl ??
				(envCacheTtl
					? Number.parseInt(envCacheTtl, 10) * 1000
					: DEFAULT_CACHE_TTL),
			cachePath:
				config?.cachePath ?? path.join(homeDir, ".cw", DEFAULT_CACHE_FILENAME),
		};
	}

	// ==========================================================================
	// Public Methods
	// ==========================================================================

	/**
	 * Look up a package by name in the registry.
	 *
	 * Loads the registry (from cache if valid, otherwise from network),
	 * then searches for the package by exact name match.
	 *
	 * @param name - Package name to look up
	 * @returns Result with RegistryEntry on success, or MarketplaceError on failure
	 *
	 * @example
	 * ```typescript
	 * const result = await registryService.lookup('code-review');
	 * if (result.isOk()) {
	 *   const entry = result.unwrap();
	 *   console.log(`Found: ${entry.repository}`);
	 *   console.log(`Description: ${entry.description}`);
	 * } else {
	 *   console.error(`Not found: ${result.unwrapErr().message}`);
	 * }
	 * ```
	 */
	async lookup(name: string): Promise<RegistryResult<RegistryEntry>> {
		const registryResult = await this.getRegistry();

		if (registryResult.isErr()) {
			return err(registryResult.unwrapErr());
		}

		const registry = registryResult.unwrap();
		const entry = registry.packages[name];

		if (!entry) {
			return err(
				createMarketplaceError(
					MARKETPLACE_ERROR_CODES.PACKAGE_NOT_FOUND,
					`Package "${name}" not found in registry`,
					name,
					undefined,
					"Check the package name or install directly from git URL",
				),
			);
		}

		return ok(entry);
	}

	/**
	 * Search for packages in the registry.
	 *
	 * Searches package names, descriptions, and keywords for matches.
	 * Results are sorted by relevance score.
	 *
	 * @param options - Search options
	 * @returns Result with array of SearchResult, or MarketplaceError on failure
	 *
	 * @example
	 * ```typescript
	 * const result = await registryService.search({
	 *   query: 'deploy',
	 *   limit: 10,
	 *   verifiedOnly: true
	 * });
	 *
	 * if (result.isOk()) {
	 *   const packages = result.unwrap();
	 *   for (const pkg of packages) {
	 *     console.log(`${pkg.name} (score: ${pkg.score})`);
	 *   }
	 * }
	 * ```
	 */
	async search(
		options: SearchOptions,
	): Promise<RegistryResult<SearchResult[]>> {
		const { query, limit = 20, verifiedOnly = false } = options;

		if (!query.trim()) {
			return ok([]);
		}

		const registryResult = await this.getRegistry();

		if (registryResult.isErr()) {
			return err(registryResult.unwrapErr());
		}

		const registry = registryResult.unwrap();
		const results: SearchResult[] = [];

		for (const [name, entry] of Object.entries(registry.packages)) {
			// Filter by verified if requested
			if (verifiedOnly && !entry.verified) {
				continue;
			}

			const score = calculateSearchScore(name, entry, query);

			// Only include results with a positive score
			if (score > 0) {
				results.push({ name, entry, score });
			}
		}

		// Sort by score descending
		results.sort((a, b) => b.score - a.score);

		// Apply limit
		return ok(results.slice(0, limit));
	}

	/**
	 * Force refresh the registry cache.
	 *
	 * Fetches the registry from the network regardless of cache validity
	 * and updates the local cache.
	 *
	 * @returns Result with the refreshed Registry, or MarketplaceError on failure
	 *
	 * @example
	 * ```typescript
	 * const result = await registryService.refresh();
	 * if (result.isOk()) {
	 *   console.log('Registry refreshed successfully');
	 *   const registry = result.unwrap();
	 *   console.log(`${Object.keys(registry.packages).length} packages available`);
	 * }
	 * ```
	 */
	async refresh(): Promise<RegistryResult<Registry>> {
		// Clear in-memory cache
		this.cachedRegistry = null;

		// Fetch fresh registry
		const fetchResult = await this.fetchRegistry();

		if (fetchResult.isErr()) {
			return err(fetchResult.unwrapErr());
		}

		const registry = fetchResult.unwrap();

		// Update cache
		await this.saveCache(registry);

		return ok(registry);
	}

	/**
	 * Get the full registry data.
	 *
	 * Returns cached data if valid, otherwise fetches from network.
	 *
	 * @returns Result with Registry, or MarketplaceError on failure
	 *
	 * @example
	 * ```typescript
	 * const result = await registryService.getRegistry();
	 * if (result.isOk()) {
	 *   const registry = result.unwrap();
	 *   console.log(`Registry version: ${registry.version}`);
	 *   console.log(`Last updated: ${registry.updated}`);
	 * }
	 * ```
	 */
	async getRegistry(): Promise<RegistryResult<Registry>> {
		// Check in-memory cache first
		if (this.cachedRegistry && this.isCacheValid(this.cachedRegistry)) {
			return ok(this.cachedRegistry.registry);
		}

		// Check file cache
		const fileCache = await this.loadCache();
		if (fileCache && this.isCacheValid(fileCache)) {
			this.cachedRegistry = fileCache;
			return ok(fileCache.registry);
		}

		// Fetch from network
		const fetchResult = await this.fetchRegistry();

		if (fetchResult.isErr()) {
			return err(fetchResult.unwrapErr());
		}

		const registry = fetchResult.unwrap();

		// Update cache
		await this.saveCache(registry);

		return ok(registry);
	}

	/**
	 * List all packages in the registry.
	 *
	 * @returns Result with array of package names, or MarketplaceError on failure
	 *
	 * @example
	 * ```typescript
	 * const result = await registryService.listPackages();
	 * if (result.isOk()) {
	 *   const packages = result.unwrap();
	 *   console.log(`${packages.length} packages available`);
	 * }
	 * ```
	 */
	async listPackages(): Promise<RegistryResult<string[]>> {
		const registryResult = await this.getRegistry();

		if (registryResult.isErr()) {
			return err(registryResult.unwrapErr());
		}

		const registry = registryResult.unwrap();
		return ok(Object.keys(registry.packages).sort());
	}

	/**
	 * Check if the registry cache is currently valid.
	 *
	 * @returns True if cache exists and is within TTL
	 */
	async isCached(): Promise<boolean> {
		if (this.cachedRegistry && this.isCacheValid(this.cachedRegistry)) {
			return true;
		}

		const fileCache = await this.loadCache();
		return fileCache !== null && this.isCacheValid(fileCache);
	}

	/**
	 * Clear the registry cache.
	 *
	 * Removes both in-memory and file cache.
	 */
	async clearCache(): Promise<void> {
		this.cachedRegistry = null;

		try {
			await fs.unlink(this.config.cachePath);
		} catch {
			// Ignore errors if file doesn't exist
		}
	}

	/**
	 * Get the current configuration.
	 */
	getConfig(): RegistryServiceConfig {
		return { ...this.config };
	}

	// ==========================================================================
	// Private Methods
	// ==========================================================================

	/**
	 * Check if a cached registry is still valid (within TTL).
	 */
	private isCacheValid(cache: CachedRegistry): boolean {
		const now = Date.now();
		const expiresAt = cache.cachedAt + cache.ttl;
		return now < expiresAt;
	}

	/**
	 * Load registry cache from file.
	 */
	private async loadCache(): Promise<CachedRegistry | null> {
		try {
			if (!(await pathExists(this.config.cachePath))) {
				return null;
			}

			const content = await fs.readFile(this.config.cachePath, "utf-8");
			const data = JSON.parse(content) as unknown;

			// Validate cache structure
			if (
				data &&
				typeof data === "object" &&
				"registry" in data &&
				"cachedAt" in data &&
				"ttl" in data
			) {
				const cache = data as CachedRegistry;
				if (isRegistry(cache.registry)) {
					return cache;
				}
			}

			return null;
		} catch {
			return null;
		}
	}

	/**
	 * Save registry to file cache.
	 */
	private async saveCache(registry: Registry): Promise<void> {
		const cache: CachedRegistry = {
			registry,
			cachedAt: Date.now(),
			ttl: this.config.cacheTtl,
		};

		this.cachedRegistry = cache;

		try {
			// Ensure cache directory exists
			const cacheDir = path.dirname(this.config.cachePath);
			await fs.mkdir(cacheDir, { recursive: true });

			// Write cache file
			await fs.writeFile(
				this.config.cachePath,
				JSON.stringify(cache, null, 2),
				"utf-8",
			);
		} catch {
			// Failing to save cache is not critical
			// The in-memory cache is still valid
		}
	}

	/**
	 * Fetch registry from network.
	 */
	private async fetchRegistry(): Promise<RegistryResult<Registry>> {
		try {
			const response = await fetch(this.config.registryUrl);

			if (!response.ok) {
				if (response.status === 404) {
					return err(
						createMarketplaceError(
							MARKETPLACE_ERROR_CODES.REGISTRY_ERROR,
							"Registry not found at configured URL",
							undefined,
							`HTTP ${response.status}: ${response.statusText}`,
							"Check CW_REGISTRY_URL environment variable or registry configuration",
						),
					);
				}

				return err(
					createMarketplaceError(
						MARKETPLACE_ERROR_CODES.NETWORK_ERROR,
						`Failed to fetch registry: HTTP ${response.status}`,
						undefined,
						response.statusText,
					),
				);
			}

			const data = (await response.json()) as unknown;

			if (!isRegistry(data)) {
				return err(
					createMarketplaceError(
						MARKETPLACE_ERROR_CODES.REGISTRY_ERROR,
						"Invalid registry format",
						undefined,
						"Registry JSON does not match expected schema",
						"The registry URL may be incorrect or the registry is malformed",
					),
				);
			}

			return ok(data);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);

			// Check for network errors
			if (
				message.includes("ENOTFOUND") ||
				message.includes("ECONNREFUSED") ||
				message.includes("fetch failed")
			) {
				return err(
					createMarketplaceError(
						MARKETPLACE_ERROR_CODES.NETWORK_ERROR,
						"Failed to connect to registry",
						undefined,
						message,
						"Check your internet connection and try again",
					),
				);
			}

			// Check for JSON parse errors
			if (message.includes("JSON")) {
				return err(
					createMarketplaceError(
						MARKETPLACE_ERROR_CODES.REGISTRY_ERROR,
						"Failed to parse registry JSON",
						undefined,
						message,
						"The registry URL may be incorrect or the registry is malformed",
					),
				);
			}

			return err(
				createMarketplaceError(
					MARKETPLACE_ERROR_CODES.REGISTRY_ERROR,
					`Failed to fetch registry: ${message}`,
					undefined,
					message,
				),
			);
		}
	}
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a RegistryService with default configuration.
 *
 * Uses environment variables for configuration:
 * - CW_REGISTRY_URL: Override default registry URL
 * - CW_CACHE_TTL: Cache TTL in seconds
 *
 * @param config - Optional partial configuration to override defaults
 * @returns Configured RegistryService instance
 *
 * @example
 * ```typescript
 * // Use defaults (with env var overrides)
 * const registryService = createRegistryService();
 *
 * // Custom configuration
 * const customService = createRegistryService({
 *   registryUrl: 'https://my-registry.com/registry.json',
 *   cacheTtl: 7200000, // 2 hours
 * });
 * ```
 */
export function createRegistryService(
	config?: Partial<RegistryServiceConfig>,
): RegistryService {
	return new RegistryService(config);
}
