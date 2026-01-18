/**
 * Resolution caching for workflow registry.
 *
 * This module provides caching for resolved workflows and dependency graphs
 * with configurable TTL (time-to-live) support and refresh capability.
 *
 * The cache improves performance by avoiding redundant filesystem operations
 * and version resolution calculations for frequently accessed workflows.
 *
 * @example
 * ```typescript
 * import { createResolutionCache, CacheOptions } from "./cache.ts";
 *
 * const options: CacheOptions = {
 *   defaultTTL: 60000, // 1 minute
 *   maxEntries: 1000,
 *   onEviction: (key) => console.log(`Evicted: ${key}`)
 * };
 *
 * const cache = createResolutionCache(options);
 *
 * // Cache a resolved workflow
 * cache.setResolution("planning@^1.0.0", resolvedWorkflow);
 *
 * // Retrieve from cache
 * const cached = cache.getResolution("planning@^1.0.0");
 * if (cached) {
 *   console.log("Cache hit:", cached.version);
 * }
 *
 * // Refresh all entries
 * await cache.refresh();
 * ```
 */

import { formatReference } from "./reference.ts";
import type {
	DependencyGraph,
	ResolvedWorkflow,
	WorkflowReference,
} from "./types.ts";

// ============================================================================
// Cache Configuration Types
// ============================================================================

/**
 * Options for configuring the resolution cache.
 *
 * @example
 * ```typescript
 * const options: CacheOptions = {
 *   defaultTTL: 300000, // 5 minutes
 *   maxEntries: 500,
 *   cleanupInterval: 60000 // Clean up expired entries every minute
 * };
 * ```
 */
export interface CacheOptions {
	/**
	 * Default time-to-live in milliseconds.
	 *
	 * Entries expire after this duration unless a custom TTL is specified.
	 * @default 300000 (5 minutes)
	 */
	defaultTTL?: number;

	/**
	 * Maximum number of entries to store.
	 *
	 * When exceeded, oldest entries are evicted using LRU policy.
	 * @default 1000
	 */
	maxEntries?: number;

	/**
	 * Interval for automatic cleanup of expired entries (in milliseconds).
	 *
	 * Set to 0 to disable automatic cleanup.
	 * @default 60000 (1 minute)
	 */
	cleanupInterval?: number;

	/**
	 * Callback invoked when an entry is evicted from the cache.
	 *
	 * @param key - The cache key of the evicted entry
	 * @param reason - Why the entry was evicted
	 */
	onEviction?: (key: string, reason: EvictionReason) => void;
}

/**
 * Reasons why a cache entry was evicted.
 */
export type EvictionReason =
	| "expired" // Entry exceeded its TTL
	| "manual" // Entry was manually invalidated
	| "capacity" // Cache exceeded maxEntries limit
	| "refresh" // Cache was refreshed/cleared
	| "stale"; // Entry was marked as stale

/**
 * Statistics about cache usage.
 */
export interface CacheStats {
	/** Total number of cache hits */
	hits: number;

	/** Total number of cache misses */
	misses: number;

	/** Current number of entries in the cache */
	size: number;

	/** Number of expired entries removed */
	evictions: number;

	/** Cache hit rate (0-1) */
	hitRate: number;

	/** Timestamp when stats were last reset */
	lastReset: number;
}

// ============================================================================
// Cache Entry Types
// ============================================================================

/**
 * A cached entry with metadata for TTL management.
 *
 * @template T - The type of the cached value
 */
export interface CacheEntry<T> {
	/** The cached value */
	value: T;

	/** Timestamp when the entry was created (ms since epoch) */
	createdAt: number;

	/** Timestamp when the entry was last accessed (ms since epoch) */
	lastAccessedAt: number;

	/** Timestamp when the entry expires (ms since epoch) */
	expiresAt: number;

	/** Number of times this entry has been accessed */
	accessCount: number;
}

/**
 * Internal cache entry with key for LRU tracking.
 */
interface InternalCacheEntry<T> extends CacheEntry<T> {
	/** The cache key */
	key: string;
	/** Monotonically increasing sequence for LRU tiebreaking */
	accessSequence: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default cache options.
 */
const DEFAULT_CACHE_OPTIONS: Required<CacheOptions> = {
	defaultTTL: 300000, // 5 minutes
	maxEntries: 1000,
	cleanupInterval: 60000, // 1 minute
	onEviction: () => {}, // No-op
};

// ============================================================================
// Cache Key Generation
// ============================================================================

/**
 * Generate a cache key for a workflow reference.
 *
 * Creates a unique, consistent key from a reference string or object.
 *
 * @param reference - The workflow reference (string or object)
 * @param context - Optional context that affects resolution
 * @returns A unique cache key
 *
 * @example
 * ```typescript
 * const key1 = generateCacheKey("planning@^1.0.0");
 * // => "planning@^1.0.0"
 *
 * const key2 = generateCacheKey({ name: "planning", version: "^1.0.0" });
 * // => "planning@^1.0.0"
 *
 * const key3 = generateCacheKey("planning", { cwd: "/project" });
 * // => "planning|cwd:/project"
 * ```
 */
export function generateCacheKey(
	reference: string | WorkflowReference,
	context?: { cwd?: string; includePrerelease?: boolean },
): string {
	// Normalize to string representation
	const refString =
		typeof reference === "string" ? reference : formatReference(reference);

	// Build context suffix if present
	const contextParts: string[] = [];
	if (context?.cwd) {
		contextParts.push(`cwd:${context.cwd}`);
	}
	if (context?.includePrerelease) {
		contextParts.push("prerelease");
	}

	// Combine reference with context
	if (contextParts.length > 0) {
		return `${refString}|${contextParts.join("|")}`;
	}

	return refString;
}

/**
 * Generate a cache key for a dependency graph.
 *
 * Includes information about the resolution context to ensure
 * different contexts produce different keys.
 *
 * @param reference - The root workflow reference
 * @param context - Optional context that affects resolution
 * @returns A unique cache key for the graph
 */
export function generateGraphCacheKey(
	reference: string | WorkflowReference,
	context?: { cwd?: string; includePrerelease?: boolean },
): string {
	return `graph:${generateCacheKey(reference, context)}`;
}

// ============================================================================
// Resolution Cache Implementation
// ============================================================================

/**
 * Cache for resolved workflows and dependency graphs.
 *
 * Provides TTL-based caching with LRU eviction policy for resolution results.
 *
 * @example
 * ```typescript
 * const cache = new ResolutionCache({ defaultTTL: 60000 });
 *
 * // Cache a resolution
 * cache.setResolution("planning@^1.0.0", resolvedWorkflow);
 *
 * // Later, retrieve from cache
 * const cached = cache.getResolution("planning@^1.0.0");
 *
 * // Invalidate when workflow changes
 * cache.invalidate("planning@^1.0.0");
 *
 * // Clear all entries
 * cache.clear();
 * ```
 */
export class ResolutionCache {
	private readonly resolutionCache: Map<
		string,
		InternalCacheEntry<ResolvedWorkflow>
	>;
	private readonly graphCache: Map<string, InternalCacheEntry<DependencyGraph>>;
	private readonly options: Required<CacheOptions>;
	private cleanupTimer: ReturnType<typeof setInterval> | null = null;
	/** Monotonically increasing counter for LRU ordering */
	private accessCounter: number = 0;
	private stats: {
		hits: number;
		misses: number;
		evictions: number;
		lastReset: number;
	};

	/**
	 * Create a new ResolutionCache.
	 *
	 * @param options - Cache configuration options
	 */
	constructor(options: CacheOptions = {}) {
		this.resolutionCache = new Map();
		this.graphCache = new Map();
		this.options = { ...DEFAULT_CACHE_OPTIONS, ...options };
		this.accessCounter = 0;
		this.stats = {
			hits: 0,
			misses: 0,
			evictions: 0,
			lastReset: Date.now(),
		};

		// Start automatic cleanup if enabled
		if (this.options.cleanupInterval > 0) {
			this.startCleanupTimer();
		}
	}

	// ============================================================================
	// Resolution Cache Methods
	// ============================================================================

	/**
	 * Get a cached resolved workflow.
	 *
	 * @param reference - The workflow reference (string or object)
	 * @param context - Optional resolution context
	 * @returns The cached resolved workflow, or undefined if not found or expired
	 */
	getResolution(
		reference: string | WorkflowReference,
		context?: { cwd?: string; includePrerelease?: boolean },
	): ResolvedWorkflow | undefined {
		const key = generateCacheKey(reference, context);
		return this.get(this.resolutionCache, key);
	}

	/**
	 * Cache a resolved workflow.
	 *
	 * @param reference - The workflow reference (string or object)
	 * @param resolved - The resolved workflow to cache
	 * @param options - Optional caching options
	 */
	setResolution(
		reference: string | WorkflowReference,
		resolved: ResolvedWorkflow,
		options?: {
			ttl?: number;
			context?: { cwd?: string; includePrerelease?: boolean };
		},
	): void {
		const key = generateCacheKey(reference, options?.context);
		this.set(this.resolutionCache, key, resolved, options?.ttl);
	}

	/**
	 * Check if a resolved workflow is in the cache.
	 *
	 * @param reference - The workflow reference (string or object)
	 * @param context - Optional resolution context
	 * @returns True if the entry exists and is not expired
	 */
	hasResolution(
		reference: string | WorkflowReference,
		context?: { cwd?: string; includePrerelease?: boolean },
	): boolean {
		const key = generateCacheKey(reference, context);
		return this.has(this.resolutionCache, key);
	}

	// ============================================================================
	// Dependency Graph Cache Methods
	// ============================================================================

	/**
	 * Get a cached dependency graph.
	 *
	 * @param reference - The root workflow reference (string or object)
	 * @param context - Optional resolution context
	 * @returns The cached dependency graph, or undefined if not found or expired
	 */
	getGraph(
		reference: string | WorkflowReference,
		context?: { cwd?: string; includePrerelease?: boolean },
	): DependencyGraph | undefined {
		const key = generateGraphCacheKey(reference, context);
		return this.get(this.graphCache, key);
	}

	/**
	 * Cache a dependency graph.
	 *
	 * @param reference - The root workflow reference (string or object)
	 * @param graph - The dependency graph to cache
	 * @param options - Optional caching options
	 */
	setGraph(
		reference: string | WorkflowReference,
		graph: DependencyGraph,
		options?: {
			ttl?: number;
			context?: { cwd?: string; includePrerelease?: boolean };
		},
	): void {
		const key = generateGraphCacheKey(reference, options?.context);
		this.set(this.graphCache, key, graph, options?.ttl);
	}

	/**
	 * Check if a dependency graph is in the cache.
	 *
	 * @param reference - The root workflow reference (string or object)
	 * @param context - Optional resolution context
	 * @returns True if the entry exists and is not expired
	 */
	hasGraph(
		reference: string | WorkflowReference,
		context?: { cwd?: string; includePrerelease?: boolean },
	): boolean {
		const key = generateGraphCacheKey(reference, context);
		return this.has(this.graphCache, key);
	}

	// ============================================================================
	// Invalidation Methods
	// ============================================================================

	/**
	 * Invalidate a specific cache entry.
	 *
	 * Removes both the resolution and any associated graph cache entries.
	 *
	 * @param reference - The workflow reference to invalidate
	 * @param context - Optional resolution context
	 */
	invalidate(
		reference: string | WorkflowReference,
		context?: { cwd?: string; includePrerelease?: boolean },
	): void {
		const resolutionKey = generateCacheKey(reference, context);
		const graphKey = generateGraphCacheKey(reference, context);

		this.delete(this.resolutionCache, resolutionKey, "manual");
		this.delete(this.graphCache, graphKey, "manual");
	}

	/**
	 * Invalidate all cache entries for a workflow name.
	 *
	 * Removes all cached versions and contexts for a given workflow name.
	 *
	 * @param name - The workflow name to invalidate
	 */
	invalidateByName(name: string): void {
		// Invalidate resolution cache entries
		for (const key of this.resolutionCache.keys()) {
			if (
				key.startsWith(name) &&
				(key === name ||
					key.charAt(name.length) === "@" ||
					key.charAt(name.length) === ":")
			) {
				this.delete(this.resolutionCache, key, "manual");
			}
		}

		// Invalidate graph cache entries
		for (const key of this.graphCache.keys()) {
			const refPart = key.replace(/^graph:/, "");
			if (
				refPart.startsWith(name) &&
				(refPart === name ||
					refPart.charAt(name.length) === "@" ||
					refPart.charAt(name.length) === ":")
			) {
				this.delete(this.graphCache, key, "manual");
			}
		}
	}

	/**
	 * Invalidate cache entries matching a pattern.
	 *
	 * @param pattern - Regular expression pattern to match cache keys
	 */
	invalidateByPattern(pattern: RegExp): void {
		for (const key of this.resolutionCache.keys()) {
			if (pattern.test(key)) {
				this.delete(this.resolutionCache, key, "manual");
			}
		}

		for (const key of this.graphCache.keys()) {
			if (pattern.test(key)) {
				this.delete(this.graphCache, key, "manual");
			}
		}
	}

	// ============================================================================
	// Cache Management Methods
	// ============================================================================

	/**
	 * Clear all cache entries.
	 *
	 * @param reason - The reason for clearing (default: "refresh")
	 */
	clear(reason: EvictionReason = "refresh"): void {
		// Notify evictions for resolution cache
		for (const [key] of this.resolutionCache) {
			this.options.onEviction(key, reason);
			this.stats.evictions++;
		}

		// Notify evictions for graph cache
		for (const [key] of this.graphCache) {
			this.options.onEviction(key, reason);
			this.stats.evictions++;
		}

		this.resolutionCache.clear();
		this.graphCache.clear();
	}

	/**
	 * Refresh the cache by clearing all entries.
	 *
	 * This is called when the underlying filesystem has changed
	 * and all cached resolutions may be stale.
	 */
	refresh(): void {
		this.clear("refresh");
	}

	/**
	 * Remove all expired entries from the cache.
	 *
	 * This is called automatically based on cleanupInterval,
	 * but can be called manually for immediate cleanup.
	 *
	 * @returns Number of entries removed
	 */
	cleanup(): number {
		const now = Date.now();
		let removed = 0;

		// Clean up resolution cache
		for (const [key, entry] of this.resolutionCache) {
			if (entry.expiresAt <= now) {
				this.delete(this.resolutionCache, key, "expired");
				removed++;
			}
		}

		// Clean up graph cache
		for (const [key, entry] of this.graphCache) {
			if (entry.expiresAt <= now) {
				this.delete(this.graphCache, key, "expired");
				removed++;
			}
		}

		return removed;
	}

	/**
	 * Get cache statistics.
	 *
	 * @returns Current cache statistics
	 */
	getStats(): CacheStats {
		const totalRequests = this.stats.hits + this.stats.misses;
		return {
			hits: this.stats.hits,
			misses: this.stats.misses,
			size: this.resolutionCache.size + this.graphCache.size,
			evictions: this.stats.evictions,
			hitRate: totalRequests > 0 ? this.stats.hits / totalRequests : 0,
			lastReset: this.stats.lastReset,
		};
	}

	/**
	 * Reset cache statistics.
	 */
	resetStats(): void {
		this.stats = {
			hits: 0,
			misses: 0,
			evictions: 0,
			lastReset: Date.now(),
		};
	}

	/**
	 * Get the total number of entries in the cache.
	 *
	 * @returns The number of cached entries
	 */
	get size(): number {
		return this.resolutionCache.size + this.graphCache.size;
	}

	/**
	 * Stop the automatic cleanup timer.
	 *
	 * Should be called when the cache is no longer needed to prevent memory leaks.
	 */
	dispose(): void {
		this.stopCleanupTimer();
		this.clear("manual");
	}

	// ============================================================================
	// Private Methods
	// ============================================================================

	/**
	 * Get a value from a cache map.
	 */
	private get<T>(
		cache: Map<string, InternalCacheEntry<T>>,
		key: string,
	): T | undefined {
		const entry = cache.get(key);

		if (!entry) {
			this.stats.misses++;
			return undefined;
		}

		// Check if expired
		const now = Date.now();
		if (entry.expiresAt <= now) {
			this.delete(cache, key, "expired");
			this.stats.misses++;
			return undefined;
		}

		// Update access metadata
		entry.lastAccessedAt = now;
		entry.accessSequence = ++this.accessCounter;
		entry.accessCount++;
		this.stats.hits++;

		return entry.value;
	}

	/**
	 * Set a value in a cache map.
	 */
	private set<T>(
		cache: Map<string, InternalCacheEntry<T>>,
		key: string,
		value: T,
		ttl?: number,
	): void {
		// Enforce capacity limit
		this.enforceCapacity(cache);

		const now = Date.now();
		const effectiveTTL = ttl ?? this.options.defaultTTL;

		const entry: InternalCacheEntry<T> = {
			key,
			value,
			createdAt: now,
			lastAccessedAt: now,
			expiresAt: now + effectiveTTL,
			accessCount: 0,
			accessSequence: ++this.accessCounter,
		};

		cache.set(key, entry);
	}

	/**
	 * Check if a key exists and is not expired.
	 */
	private has<T>(
		cache: Map<string, InternalCacheEntry<T>>,
		key: string,
	): boolean {
		const entry = cache.get(key);
		if (!entry) {
			return false;
		}

		// Check if expired
		if (entry.expiresAt <= Date.now()) {
			this.delete(cache, key, "expired");
			return false;
		}

		return true;
	}

	/**
	 * Delete an entry from a cache map.
	 */
	private delete<T>(
		cache: Map<string, InternalCacheEntry<T>>,
		key: string,
		reason: EvictionReason,
	): boolean {
		if (cache.has(key)) {
			cache.delete(key);
			this.options.onEviction(key, reason);
			this.stats.evictions++;
			return true;
		}
		return false;
	}

	/**
	 * Enforce the maximum capacity by evicting oldest entries.
	 */
	private enforceCapacity<T>(cache: Map<string, InternalCacheEntry<T>>): void {
		// Check combined capacity
		const totalSize = this.resolutionCache.size + this.graphCache.size;
		if (totalSize < this.options.maxEntries) {
			return;
		}

		// Find and evict the least recently used entry (lowest accessSequence)
		let oldestKey: string | null = null;
		let oldestSequence = Infinity;

		for (const [key, entry] of cache) {
			if (entry.accessSequence < oldestSequence) {
				oldestSequence = entry.accessSequence;
				oldestKey = key;
			}
		}

		if (oldestKey) {
			this.delete(cache, oldestKey, "capacity");
		}
	}

	/**
	 * Start the automatic cleanup timer.
	 */
	private startCleanupTimer(): void {
		if (this.cleanupTimer) {
			return;
		}

		this.cleanupTimer = setInterval(() => {
			this.cleanup();
		}, this.options.cleanupInterval);

		// Ensure timer doesn't prevent process exit
		if (this.cleanupTimer.unref) {
			this.cleanupTimer.unref();
		}
	}

	/**
	 * Stop the automatic cleanup timer.
	 */
	private stopCleanupTimer(): void {
		if (this.cleanupTimer) {
			clearInterval(this.cleanupTimer);
			this.cleanupTimer = null;
		}
	}
}

// ============================================================================
// Cache Entry Helpers
// ============================================================================

/**
 * Check if a cache entry is expired.
 *
 * @param entry - The cache entry to check
 * @returns True if the entry has expired
 */
export function isExpired<T>(entry: CacheEntry<T>): boolean {
	return entry.expiresAt <= Date.now();
}

/**
 * Get the remaining TTL for a cache entry.
 *
 * @param entry - The cache entry
 * @returns Remaining TTL in milliseconds (0 if expired)
 */
export function getRemainingTTL<T>(entry: CacheEntry<T>): number {
	const remaining = entry.expiresAt - Date.now();
	return remaining > 0 ? remaining : 0;
}

/**
 * Get the age of a cache entry.
 *
 * @param entry - The cache entry
 * @returns Age in milliseconds since creation
 */
export function getEntryAge<T>(entry: CacheEntry<T>): number {
	return Date.now() - entry.createdAt;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new ResolutionCache instance.
 *
 * @param options - Cache configuration options
 * @returns A new ResolutionCache
 *
 * @example
 * ```typescript
 * // Create with default options
 * const cache = createResolutionCache();
 *
 * // Create with custom TTL
 * const cache = createResolutionCache({
 *   defaultTTL: 60000, // 1 minute
 *   maxEntries: 500
 * });
 *
 * // Create with eviction callback
 * const cache = createResolutionCache({
 *   onEviction: (key, reason) => {
 *     console.log(`Evicted ${key}: ${reason}`);
 *   }
 * });
 * ```
 */
export function createResolutionCache(options?: CacheOptions): ResolutionCache {
	return new ResolutionCache(options);
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a value is a valid CacheEntry.
 *
 * @param value - Value to check
 * @returns True if value matches CacheEntry structure
 */
export function isCacheEntry<T>(value: unknown): value is CacheEntry<T> {
	if (!value || typeof value !== "object") {
		return false;
	}

	const obj = value as Record<string, unknown>;

	return (
		"value" in obj &&
		typeof obj.createdAt === "number" &&
		typeof obj.lastAccessedAt === "number" &&
		typeof obj.expiresAt === "number" &&
		typeof obj.accessCount === "number"
	);
}

/**
 * Type guard to check if a value is a valid CacheOptions.
 *
 * @param value - Value to check
 * @returns True if value matches CacheOptions structure
 */
export function isCacheOptions(value: unknown): value is CacheOptions {
	if (!value || typeof value !== "object") {
		return false;
	}

	const obj = value as Record<string, unknown>;

	// All properties are optional but must be correct type if present
	if (obj.defaultTTL !== undefined && typeof obj.defaultTTL !== "number") {
		return false;
	}
	if (obj.maxEntries !== undefined && typeof obj.maxEntries !== "number") {
		return false;
	}
	if (
		obj.cleanupInterval !== undefined &&
		typeof obj.cleanupInterval !== "number"
	) {
		return false;
	}
	if (obj.onEviction !== undefined && typeof obj.onEviction !== "function") {
		return false;
	}

	return true;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Constants for cache eviction reasons.
 */
export const EVICTION_REASONS = Object.freeze({
	/** Entry exceeded its TTL */
	EXPIRED: "expired" as EvictionReason,
	/** Entry was manually invalidated */
	MANUAL: "manual" as EvictionReason,
	/** Cache exceeded maxEntries limit */
	CAPACITY: "capacity" as EvictionReason,
	/** Cache was refreshed/cleared */
	REFRESH: "refresh" as EvictionReason,
	/** Entry was marked as stale */
	STALE: "stale" as EvictionReason,
});

/**
 * Default TTL values for different cache types.
 */
export const DEFAULT_TTL = Object.freeze({
	/** Default TTL for resolved workflows (5 minutes) */
	RESOLUTION: 300000,
	/** Default TTL for dependency graphs (10 minutes) */
	GRAPH: 600000,
	/** Short TTL for development mode (30 seconds) */
	DEVELOPMENT: 30000,
	/** Long TTL for production mode (1 hour) */
	PRODUCTION: 3600000,
});
