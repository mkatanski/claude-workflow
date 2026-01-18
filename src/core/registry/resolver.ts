/**
 * Workflow resolver with three-tier precedence and version matching.
 *
 * This module implements the core resolution logic for finding workflows
 * in the filesystem based on references. It supports:
 * - Three-tier precedence (project-local → project-installed → global)
 * - Source prefixes to bypass resolution order
 * - Semver version matching
 * - Export validation
 * - Configuration overrides
 *
 * @example
 * ```typescript
 * import { createResolver } from "./resolver.ts";
 *
 * const resolver = createResolver({
 *   config: loadedConfig,
 *   cache: resolutionCache,
 * });
 *
 * // Resolve a workflow reference
 * const result = await resolver.resolve("planning@^1.0.0");
 * if (isOk(result)) {
 *   console.log("Resolved to:", result.value.path);
 * }
 *
 * // List available workflows
 * const workflows = await resolver.list({ scope: "project" });
 * ```
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { WorkflowPackageJson } from "../packages/types.ts";
import { isWorkflowPackageJson } from "../packages/types.ts";
import type { Result } from "../utils/result/result.ts";
import type { ResolutionCache } from "./cache.ts";
import type {
	LoadedConfig,
	RegistryConfig,
	ResolutionOverride,
	ResolvedPaths,
} from "./config.ts";
import { getDefaultPaths, getOverride, loadConfig } from "./config.ts";
import { normalizeReference } from "./reference.ts";
import type {
	InstalledVersion,
	ListOptions,
	ResolutionContext,
	ResolutionError,
	ResolutionSource,
	ResolvedWorkflow,
	ResolveResult,
	WorkflowListEntry,
	WorkflowReference,
} from "./types.ts";
import { RESOLUTION_ERROR_CODES } from "./types.ts";
import {
	filterStableVersions,
	getLatestVersion,
	maxSatisfying,
	sortVersionsDescending,
} from "./version.ts";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a path exists on the filesystem.
 *
 * @param filePath - Path to check
 * @returns True if the path exists
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
 * Check if a path is a directory.
 *
 * @param filePath - Path to check
 * @returns True if the path is a directory
 */
async function isDirectory(filePath: string): Promise<boolean> {
	try {
		const stat = await fs.stat(filePath);
		return stat.isDirectory();
	} catch {
		return false;
	}
}

/**
 * Read and parse package.json from a directory.
 *
 * @param packageDir - Directory containing package.json
 * @returns Result with parsed metadata or null
 */
async function readPackageJson(
	packageDir: string,
): Promise<{ data: WorkflowPackageJson | null; error?: string }> {
	const packageJsonPath = path.join(packageDir, "package.json");
	try {
		const content = await fs.readFile(packageJsonPath, "utf-8");
		const data = JSON.parse(content) as unknown;
		if (isWorkflowPackageJson(data)) {
			return { data };
		}
		return { data: null, error: "Invalid package.json structure" };
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		return { data: null, error: message };
	}
}

/**
 * List directories in a path.
 *
 * @param dirPath - Directory to list
 * @returns Array of directory names
 */
async function listDirectories(dirPath: string): Promise<string[]> {
	try {
		const entries = await fs.readdir(dirPath, { withFileTypes: true });
		return entries
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name);
	} catch {
		return [];
	}
}

/**
 * Parse version from a versioned directory name.
 *
 * Versioned directories have format: `name@version` or `@scope/name@version`
 *
 * @param dirName - Directory name to parse
 * @returns Parsed name and version, or null if not versioned
 */
function parseVersionedDir(
	dirName: string,
): { name: string; version: string } | null {
	// Handle scoped packages: @scope/name@version
	if (dirName.startsWith("@")) {
		const lastAtIndex = dirName.lastIndexOf("@");
		if (lastAtIndex > 0) {
			return {
				name: dirName.substring(0, lastAtIndex),
				version: dirName.substring(lastAtIndex + 1),
			};
		}
		return null;
	}

	// Handle regular packages: name@version
	const atIndex = dirName.indexOf("@");
	if (atIndex > 0) {
		return {
			name: dirName.substring(0, atIndex),
			version: dirName.substring(atIndex + 1),
		};
	}
	return null;
}

/**
 * Get available exports from package metadata.
 *
 * @param metadata - Package.json metadata
 * @returns Array of export names
 */
function getAvailableExports(metadata: WorkflowPackageJson): string[] {
	const exports = new Set<string>(["default"]);
	if (metadata.workflows) {
		for (const exportName of Object.keys(metadata.workflows)) {
			exports.add(exportName);
		}
	}
	return Array.from(exports);
}

// ============================================================================
// Resolution Options
// ============================================================================

/**
 * Options for creating a workflow resolver.
 */
export interface ResolverOptions {
	/**
	 * Loaded configuration with resolved paths.
	 *
	 * If not provided, default paths will be used.
	 */
	config?: LoadedConfig;

	/**
	 * Resolution cache for performance optimization.
	 *
	 * If provided, resolved workflows will be cached.
	 */
	cache?: ResolutionCache;

	/**
	 * Current working directory for project resolution.
	 *
	 * If not specified, uses process.cwd().
	 */
	cwd?: string;
}

// ============================================================================
// Resolver Implementation
// ============================================================================

/**
 * Workflow resolver interface.
 *
 * Provides methods for resolving workflow references to their
 * filesystem locations with version matching and source precedence.
 */
export interface WorkflowResolver {
	/**
	 * Resolve a workflow reference to its location.
	 *
	 * @param reference - Reference string or object
	 * @param context - Optional resolution context
	 * @returns Result with resolved workflow or error
	 */
	resolve(
		reference: string | WorkflowReference,
		context?: ResolutionContext,
	): Promise<ResolveResult>;

	/**
	 * Check if a workflow exists.
	 *
	 * @param reference - Reference string or object
	 * @param context - Optional resolution context
	 * @returns True if the workflow can be resolved
	 */
	exists(
		reference: string | WorkflowReference,
		context?: ResolutionContext,
	): Promise<boolean>;

	/**
	 * Get all installed versions of a workflow.
	 *
	 * @param name - Workflow package name
	 * @returns Array of installed version information
	 */
	getVersions(name: string): Promise<InstalledVersion[]>;

	/**
	 * List available workflows with filtering.
	 *
	 * @param options - Listing options
	 * @returns Array of workflow list entries
	 */
	list(options?: ListOptions): Promise<WorkflowListEntry[]>;

	/**
	 * Get the resolved paths being used by the resolver.
	 *
	 * @returns Resolved filesystem paths
	 */
	getPaths(): ResolvedPaths;

	/**
	 * Refresh the resolver by clearing caches and reloading config.
	 */
	refresh(): Promise<void>;
}

/**
 * Internal candidate representing a potential workflow match.
 */
interface ResolutionCandidate {
	path: string;
	version: string;
	source: ResolutionSource;
	metadata: WorkflowPackageJson;
}

/**
 * Implementation of the WorkflowResolver interface.
 */
class WorkflowResolverImpl implements WorkflowResolver {
	private resolvedPaths: ResolvedPaths;
	private config: RegistryConfig;
	private cache: ResolutionCache | undefined;
	private cwd: string;

	constructor(options: ResolverOptions = {}) {
		this.cwd = options.cwd ?? process.cwd();
		this.cache = options.cache;

		if (options.config) {
			this.resolvedPaths = options.config.resolvedPaths;
			this.config = options.config.config;
		} else {
			this.resolvedPaths = getDefaultPaths(this.cwd);
			this.config = { resolution: { overrides: {} }, paths: {} };
		}
	}

	// ============================================================================
	// Main Resolution Method
	// ============================================================================

	/**
	 * Resolve a workflow reference to its location.
	 *
	 * Resolution algorithm:
	 * 1. Parse reference string into WorkflowReference
	 * 2. Check config overrides for explicit source/version
	 * 3. If source specified → resolve from source only
	 * 4. Search in order: project-local → project-installed → global
	 * 5. For each location:
	 *    a. Load package.json
	 *    b. Check version satisfies range
	 *    c. Check export exists
	 *    d. Return first valid match
	 * 6. Return detailed error with suggestions
	 */
	async resolve(
		reference: string | WorkflowReference,
		context?: ResolutionContext,
	): Promise<ResolveResult> {
		// Check cache first
		if (this.cache && !context?.noCache) {
			const cached = this.cache.getResolution(reference, {
				cwd: context?.cwd ?? this.cwd,
				includePrerelease: context?.includePrerelease,
			});
			if (cached) {
				return { _tag: "ok", value: cached };
			}
		}

		// Parse reference
		const normalizedResult = normalizeReference(reference);
		if (normalizedResult._tag === "err") {
			return normalizedResult;
		}
		const ref = normalizedResult.value;

		// Apply config overrides
		const override = getOverride(this.config, ref.name);
		const effectiveRef = this.applyOverride(ref, override);

		// Determine effective working directory
		const effectiveCwd = context?.cwd ?? this.cwd;

		// Resolve based on source
		let result: ResolveResult;
		if (effectiveRef.source) {
			result = await this.resolveFromSource(
				effectiveRef,
				effectiveCwd,
				context,
			);
		} else {
			result = await this.resolveWithPrecedence(
				effectiveRef,
				effectiveCwd,
				context,
			);
		}

		// Cache successful results
		if (result._tag === "ok" && this.cache && !context?.noCache) {
			this.cache.setResolution(reference, result.value, {
				context: {
					cwd: effectiveCwd,
					includePrerelease: context?.includePrerelease,
				},
			});
		}

		return result;
	}

	/**
	 * Check if a workflow exists.
	 */
	async exists(
		reference: string | WorkflowReference,
		context?: ResolutionContext,
	): Promise<boolean> {
		const result = await this.resolve(reference, context);
		return result._tag === "ok";
	}

	/**
	 * Get all installed versions of a workflow.
	 */
	async getVersions(name: string): Promise<InstalledVersion[]> {
		const versions: InstalledVersion[] = [];

		// Check project-local (single version, unversioned directory)
		const projectLocalPath = path.join(
			this.resolvedPaths.projectWorkflows,
			name,
		);
		const projectLocalMeta = await readPackageJson(projectLocalPath);
		if (projectLocalMeta.data) {
			versions.push({
				version: projectLocalMeta.data.version,
				source: "project",
				path: projectLocalPath,
			});
		}

		// Check project-installed (versioned directories)
		const installedVersions = await this.findVersionedPackages(
			this.resolvedPaths.projectInstalled,
			name,
		);
		for (const v of installedVersions) {
			versions.push({
				version: v.version,
				source: "project-installed",
				path: v.path,
			});
		}

		// Check global (versioned directories)
		const globalVersions = await this.findVersionedPackages(
			this.resolvedPaths.globalWorkflows,
			name,
		);
		for (const v of globalVersions) {
			versions.push({
				version: v.version,
				source: "global",
				path: v.path,
			});
		}

		return versions;
	}

	/**
	 * List available workflows with filtering.
	 */
	async list(options: ListOptions = {}): Promise<WorkflowListEntry[]> {
		const scope = options.scope ?? "all";
		const entries = new Map<string, WorkflowListEntry>();

		// Helper to add entries from a source
		const addEntries = async (
			basePath: string,
			source: ResolutionSource,
			versioned: boolean,
		): Promise<void> => {
			if (!(await pathExists(basePath))) {
				return;
			}

			const dirs = await listDirectories(basePath);
			for (const dir of dirs) {
				// Skip hidden directories
				if (dir.startsWith(".")) {
					continue;
				}

				let name: string;
				let version: string;
				const dirPath = path.join(basePath, dir);

				if (versioned) {
					const parsed = parseVersionedDir(dir);
					if (!parsed) {
						continue;
					}
					name = parsed.name;
					version = parsed.version;
				} else {
					name = dir;
					const meta = await readPackageJson(dirPath);
					if (!meta.data) {
						continue;
					}
					version = meta.data.version;
				}

				// Apply name pattern filter
				if (options.pattern && !this.matchesPattern(name, options.pattern)) {
					continue;
				}

				// Read metadata for full info
				const meta = await readPackageJson(dirPath);
				if (!meta.data) {
					continue;
				}

				// Apply keyword filter
				if (options.keyword && !meta.data.keywords?.includes(options.keyword)) {
					continue;
				}

				// Get or create entry
				let entry = entries.get(name);
				if (!entry) {
					entry = {
						name,
						versions: [],
						latestVersion: version,
						source,
						exports: getAvailableExports(meta.data),
						description: meta.data.description,
						keywords: meta.data.keywords,
					};
					entries.set(name, entry);
				}

				// Add version if not already present
				if (!entry.versions.includes(version)) {
					entry.versions.push(version);
				}
			}
		};

		// Collect entries based on scope
		if (scope === "project" || scope === "all") {
			await addEntries(this.resolvedPaths.projectWorkflows, "project", false);
			await addEntries(
				this.resolvedPaths.projectInstalled,
				"project-installed",
				true,
			);
		}
		if (scope === "global" || scope === "all") {
			await addEntries(this.resolvedPaths.globalWorkflows, "global", true);
		}

		// Sort versions and determine latest for each entry
		const result: WorkflowListEntry[] = [];
		for (const entry of entries.values()) {
			entry.versions = sortVersionsDescending(entry.versions);
			entry.latestVersion = entry.versions[0] ?? entry.latestVersion;
			result.push(entry);
		}

		// Sort entries by name
		result.sort((a, b) => a.name.localeCompare(b.name));

		return result;
	}

	/**
	 * Get the resolved paths being used by the resolver.
	 */
	getPaths(): ResolvedPaths {
		return this.resolvedPaths;
	}

	/**
	 * Refresh the resolver by clearing caches.
	 */
	async refresh(): Promise<void> {
		if (this.cache) {
			this.cache.refresh();
		}
	}

	// ============================================================================
	// Private Resolution Methods
	// ============================================================================

	/**
	 * Apply configuration override to a reference.
	 */
	private applyOverride(
		ref: WorkflowReference,
		override: ResolutionOverride | undefined,
	): WorkflowReference {
		if (!override) {
			return ref;
		}

		const result: WorkflowReference = { ...ref };

		if (override.source && !ref.source) {
			result.source = override.source;
		}

		if (override.version && !ref.version) {
			result.version = override.version;
		}

		return result;
	}

	/**
	 * Resolve directly from a specified source.
	 */
	private async resolveFromSource(
		ref: WorkflowReference,
		_cwd: string,
		context?: ResolutionContext,
	): Promise<ResolveResult> {
		const source = ref.source as string;

		if (source === "project") {
			// Search project-local first, then project-installed
			const localResult = await this.resolveFromProjectLocal(ref, context);
			if (localResult._tag === "ok") {
				return localResult;
			}
			// Try project-installed if project-local failed
			return this.resolveFromProjectInstalled(ref, context);
		}

		if (source === "global") {
			return this.resolveFromGlobal(ref, context);
		}

		// Custom source prefix - check config override path
		const override = getOverride(this.config, ref.name);
		if (override?.path) {
			return this.resolveFromPath(ref, override.path, "project", context);
		}

		// Unknown source
		return this.createNotFoundError(ref, [], []);
	}

	/**
	 * Resolve with three-tier precedence order.
	 */
	private async resolveWithPrecedence(
		ref: WorkflowReference,
		_cwd: string,
		context?: ResolutionContext,
	): Promise<ResolveResult> {
		const allCandidates: ResolutionCandidate[] = [];

		// Tier 1: Project-local
		const localCandidates = await this.findCandidates(
			this.resolvedPaths.projectWorkflows,
			ref.name,
			"project",
			false,
		);
		allCandidates.push(...localCandidates);

		// Try to match from project-local first
		const localMatch = this.selectBestCandidate(localCandidates, ref, context);
		if (localMatch) {
			return this.validateAndReturnCandidate(localMatch, ref);
		}

		// Tier 2: Project-installed
		const installedCandidates = await this.findCandidates(
			this.resolvedPaths.projectInstalled,
			ref.name,
			"project-installed",
			true,
		);
		allCandidates.push(...installedCandidates);

		const installedMatch = this.selectBestCandidate(
			installedCandidates,
			ref,
			context,
		);
		if (installedMatch) {
			return this.validateAndReturnCandidate(installedMatch, ref);
		}

		// Tier 3: Global
		const globalCandidates = await this.findCandidates(
			this.resolvedPaths.globalWorkflows,
			ref.name,
			"global",
			true,
		);
		allCandidates.push(...globalCandidates);

		const globalMatch = this.selectBestCandidate(
			globalCandidates,
			ref,
			context,
		);
		if (globalMatch) {
			return this.validateAndReturnCandidate(globalMatch, ref);
		}

		// No match found - return error with all available versions
		const availableVersions = allCandidates.map((c) => c.version);
		const availableExports = this.collectAvailableExports(allCandidates);
		return this.createNotFoundError(ref, availableVersions, availableExports);
	}

	/**
	 * Resolve from project-local directory.
	 */
	private async resolveFromProjectLocal(
		ref: WorkflowReference,
		context?: ResolutionContext,
	): Promise<ResolveResult> {
		const candidates = await this.findCandidates(
			this.resolvedPaths.projectWorkflows,
			ref.name,
			"project",
			false,
		);

		const match = this.selectBestCandidate(candidates, ref, context);
		if (match) {
			return this.validateAndReturnCandidate(match, ref);
		}

		return this.createNotFoundError(
			ref,
			candidates.map((c) => c.version),
			[],
		);
	}

	/**
	 * Resolve from project-installed directory.
	 */
	private async resolveFromProjectInstalled(
		ref: WorkflowReference,
		context?: ResolutionContext,
	): Promise<ResolveResult> {
		const candidates = await this.findCandidates(
			this.resolvedPaths.projectInstalled,
			ref.name,
			"project-installed",
			true,
		);

		const match = this.selectBestCandidate(candidates, ref, context);
		if (match) {
			return this.validateAndReturnCandidate(match, ref);
		}

		return this.createNotFoundError(
			ref,
			candidates.map((c) => c.version),
			[],
		);
	}

	/**
	 * Resolve from global directory.
	 */
	private async resolveFromGlobal(
		ref: WorkflowReference,
		context?: ResolutionContext,
	): Promise<ResolveResult> {
		const candidates = await this.findCandidates(
			this.resolvedPaths.globalWorkflows,
			ref.name,
			"global",
			true,
		);

		const match = this.selectBestCandidate(candidates, ref, context);
		if (match) {
			return this.validateAndReturnCandidate(match, ref);
		}

		return this.createNotFoundError(
			ref,
			candidates.map((c) => c.version),
			[],
		);
	}

	/**
	 * Resolve from a specific path (config override).
	 */
	private async resolveFromPath(
		ref: WorkflowReference,
		overridePath: string,
		source: ResolutionSource,
		_context?: ResolutionContext,
	): Promise<ResolveResult> {
		const absolutePath = path.resolve(this.cwd, overridePath);

		if (!(await isDirectory(absolutePath))) {
			return this.createPackageInvalidError(
				ref,
				`Path does not exist: ${overridePath}`,
			);
		}

		const metaResult = await readPackageJson(absolutePath);
		if (!metaResult.data) {
			return this.createPackageInvalidError(
				ref,
				metaResult.error ?? "Failed to read package.json",
			);
		}

		const candidate: ResolutionCandidate = {
			path: absolutePath,
			version: metaResult.data.version,
			source,
			metadata: metaResult.data,
		};

		return this.validateAndReturnCandidate(candidate, ref);
	}

	// ============================================================================
	// Candidate Discovery
	// ============================================================================

	/**
	 * Find resolution candidates in a base directory.
	 */
	private async findCandidates(
		basePath: string,
		name: string,
		source: ResolutionSource,
		versioned: boolean,
	): Promise<ResolutionCandidate[]> {
		const candidates: ResolutionCandidate[] = [];

		if (!(await pathExists(basePath))) {
			return candidates;
		}

		if (versioned) {
			// Look for versioned directories: name@version or @scope/name@version
			if (name.startsWith("@")) {
				// Scoped package: look inside basePath/@scope/ for name@version directories
				const [scope, pkgName] = name.split("/");
				const scopePath = path.join(basePath, scope);
				if (await isDirectory(scopePath)) {
					const dirs = await listDirectories(scopePath);
					for (const dir of dirs) {
						// Parse as regular versioned dir: pkgName@version
						const atIndex = dir.indexOf("@");
						if (atIndex <= 0) {
							continue;
						}
						const dirPkgName = dir.substring(0, atIndex);
						const version = dir.substring(atIndex + 1);
						if (dirPkgName !== pkgName) {
							continue;
						}

						const dirPath = path.join(scopePath, dir);
						const meta = await readPackageJson(dirPath);
						if (meta.data) {
							candidates.push({
								path: dirPath,
								version,
								source,
								metadata: meta.data,
							});
						}
					}
				}
			} else {
				// Regular package: look for name@version at top level
				const dirs = await listDirectories(basePath);
				for (const dir of dirs) {
					const parsed = parseVersionedDir(dir);
					if (!parsed || parsed.name !== name) {
						continue;
					}

					const dirPath = path.join(basePath, dir);
					const meta = await readPackageJson(dirPath);
					if (meta.data) {
						candidates.push({
							path: dirPath,
							version: parsed.version,
							source,
							metadata: meta.data,
						});
					}
				}
			}
		} else {
			// Look for unversioned directory: name or @scope/name
			let dirPath: string;

			if (name.startsWith("@")) {
				// Scoped package: @scope/name -> basePath/@scope/name
				const [scope, pkgName] = name.split("/");
				dirPath = path.join(basePath, scope, pkgName);
			} else {
				dirPath = path.join(basePath, name);
			}

			if (await isDirectory(dirPath)) {
				const meta = await readPackageJson(dirPath);
				if (meta.data) {
					candidates.push({
						path: dirPath,
						version: meta.data.version,
						source,
						metadata: meta.data,
					});
				}
			}
		}

		return candidates;
	}

	/**
	 * Find versioned packages in a directory.
	 */
	private async findVersionedPackages(
		basePath: string,
		name: string,
	): Promise<{ version: string; path: string }[]> {
		const results: { version: string; path: string }[] = [];

		if (!(await pathExists(basePath))) {
			return results;
		}

		if (name.startsWith("@")) {
			// Scoped package: look inside basePath/@scope/ for name@version directories
			const [scope, pkgName] = name.split("/");
			const scopePath = path.join(basePath, scope);
			if (await isDirectory(scopePath)) {
				const dirs = await listDirectories(scopePath);
				for (const dir of dirs) {
					const atIndex = dir.indexOf("@");
					if (atIndex <= 0) {
						continue;
					}
					const dirPkgName = dir.substring(0, atIndex);
					const version = dir.substring(atIndex + 1);
					if (dirPkgName !== pkgName) {
						continue;
					}
					results.push({
						version,
						path: path.join(scopePath, dir),
					});
				}
			}
		} else {
			// Regular package
			const dirs = await listDirectories(basePath);
			for (const dir of dirs) {
				const parsed = parseVersionedDir(dir);
				if (!parsed || parsed.name !== name) {
					continue;
				}

				results.push({
					version: parsed.version,
					path: path.join(basePath, dir),
				});
			}
		}

		return results;
	}

	// ============================================================================
	// Candidate Selection
	// ============================================================================

	/**
	 * Select the best candidate based on version matching.
	 */
	private selectBestCandidate(
		candidates: ResolutionCandidate[],
		ref: WorkflowReference,
		context?: ResolutionContext,
	): ResolutionCandidate | null {
		if (candidates.length === 0) {
			return null;
		}

		// Filter by prerelease if not included
		let availableVersions = candidates.map((c) => c.version);
		if (!context?.includePrerelease) {
			const stableVersions = filterStableVersions(availableVersions);
			// Only use stable versions if there are any
			if (stableVersions.length > 0) {
				availableVersions = stableVersions;
			}
		}

		// If no version range specified, get latest
		if (!ref.version) {
			const latest = getLatestVersion(availableVersions);
			if (latest) {
				return candidates.find((c) => c.version === latest) ?? null;
			}
			return null;
		}

		// Find the highest version satisfying the range
		const best = maxSatisfying(availableVersions, ref.version);
		if (best) {
			return candidates.find((c) => c.version === best) ?? null;
		}

		return null;
	}

	/**
	 * Validate export and return resolved workflow.
	 */
	private validateAndReturnCandidate(
		candidate: ResolutionCandidate,
		ref: WorkflowReference,
	): ResolveResult {
		const exportName = ref.export ?? "default";
		const availableExports = getAvailableExports(candidate.metadata);

		// Check if requested export exists
		if (!availableExports.includes(exportName)) {
			return this.createExportNotFoundError(ref, availableExports);
		}

		const resolved: ResolvedWorkflow = {
			reference: ref,
			path: candidate.path,
			version: candidate.version,
			source: candidate.source,
			exportName,
			metadata: candidate.metadata,
		};

		return { _tag: "ok", value: resolved };
	}

	// ============================================================================
	// Error Creation
	// ============================================================================

	/**
	 * Collect available exports from all candidates.
	 */
	private collectAvailableExports(candidates: ResolutionCandidate[]): string[] {
		const exports = new Set<string>();
		for (const candidate of candidates) {
			for (const exp of getAvailableExports(candidate.metadata)) {
				exports.add(exp);
			}
		}
		return Array.from(exports);
	}

	/**
	 * Create a WORKFLOW_NOT_FOUND or VERSION_NOT_FOUND error.
	 */
	private createNotFoundError(
		ref: WorkflowReference,
		availableVersions: string[],
		availableExports: string[],
	): ResolveResult {
		const hasVersions = availableVersions.length > 0;
		const sortedVersions = sortVersionsDescending(availableVersions);

		if (!hasVersions) {
			// No workflow found at all
			const error: ResolutionError = {
				code: RESOLUTION_ERROR_CODES.WORKFLOW_NOT_FOUND,
				message: `Workflow "${ref.name}" not found`,
				reference: ref,
				suggestions: [
					`Check the workflow name is spelled correctly`,
					`Run "cw list" to see available workflows`,
					`Install the workflow with "cw install ${ref.name}"`,
				],
			};
			return { _tag: "err", error };
		}

		// Workflow exists but version doesn't match
		const error: ResolutionError = {
			code: RESOLUTION_ERROR_CODES.VERSION_NOT_FOUND,
			message: `No version of "${ref.name}" satisfies "${ref.version ?? "latest"}"`,
			reference: ref,
			availableVersions: sortedVersions,
			availableExports,
			suggestions: [
				`Available versions: ${sortedVersions.slice(0, 5).join(", ")}${sortedVersions.length > 5 ? "..." : ""}`,
				`Try "${ref.name}@${sortedVersions[0]}" for the latest version`,
				`Install a compatible version with "cw install ${ref.name}@${ref.version}"`,
			],
		};
		return { _tag: "err", error };
	}

	/**
	 * Create an EXPORT_NOT_FOUND error.
	 */
	private createExportNotFoundError(
		ref: WorkflowReference,
		availableExports: string[],
	): ResolveResult {
		const error: ResolutionError = {
			code: RESOLUTION_ERROR_CODES.EXPORT_NOT_FOUND,
			message: `Export "${ref.export}" not found in "${ref.name}"`,
			reference: ref,
			availableExports,
			suggestions: [
				`Available exports: ${availableExports.join(", ")}`,
				`Use "${ref.name}:${availableExports[0]}" instead`,
			],
		};
		return { _tag: "err", error };
	}

	/**
	 * Create a PACKAGE_INVALID error.
	 */
	private createPackageInvalidError(
		ref: WorkflowReference,
		message: string,
	): ResolveResult {
		const error: ResolutionError = {
			code: RESOLUTION_ERROR_CODES.PACKAGE_INVALID,
			message: `Package "${ref.name}" is invalid: ${message}`,
			reference: ref,
			suggestions: [
				"Check the package has a valid package.json",
				"Ensure package.json has name, version, and main fields",
			],
		};
		return { _tag: "err", error };
	}

	/**
	 * Check if a name matches a glob pattern.
	 */
	private matchesPattern(name: string, pattern: string): boolean {
		// Simple glob matching for common patterns
		if (pattern === "*") {
			return true;
		}

		if (pattern.endsWith("*")) {
			const prefix = pattern.slice(0, -1);
			return name.startsWith(prefix);
		}

		if (pattern.startsWith("*")) {
			const suffix = pattern.slice(1);
			return name.endsWith(suffix);
		}

		// Exact match
		return name === pattern;
	}
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new WorkflowResolver instance.
 *
 * @param options - Resolver configuration options
 * @returns A new WorkflowResolver
 *
 * @example
 * ```typescript
 * // Create with default options
 * const resolver = createResolver();
 *
 * // Create with loaded config and cache
 * const resolver = createResolver({
 *   config: loadedConfig,
 *   cache: resolutionCache,
 * });
 *
 * // Resolve a workflow
 * const result = await resolver.resolve("planning@^1.0.0");
 * ```
 */
export function createResolver(options?: ResolverOptions): WorkflowResolver {
	return new WorkflowResolverImpl(options);
}

/**
 * Create a resolver with automatically loaded configuration.
 *
 * Loads configuration from .cw/config.ts and ~/.cw/config.ts,
 * then creates a resolver with the merged configuration.
 *
 * @param cwd - Current working directory (optional)
 * @param cache - Resolution cache (optional)
 * @returns Result with resolver or configuration error
 *
 * @example
 * ```typescript
 * const result = await createResolverWithConfig();
 * if (isOk(result)) {
 *   const resolver = result.value;
 *   // Use the resolver
 * } else {
 *   console.error("Config error:", result.error);
 * }
 * ```
 */
export async function createResolverWithConfig(
	cwd?: string,
	cache?: ResolutionCache,
): Promise<Result<WorkflowResolver, ResolutionError>> {
	const configResult = await loadConfig(cwd);

	if (configResult._tag === "err") {
		// Convert config error to resolution error
		const error: ResolutionError = {
			code: RESOLUTION_ERROR_CODES.PACKAGE_INVALID,
			message: `Configuration error: ${configResult.error.message}`,
			reference: { name: "<config>" },
			suggestions: configResult.error.suggestions,
		};
		return { _tag: "err", error };
	}

	const resolver = createResolver({
		config: configResult.value,
		cache,
		cwd,
	});

	return { _tag: "ok", value: resolver };
}
