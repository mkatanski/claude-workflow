/**
 * Configuration loader for workflow registry.
 *
 * This module provides configuration loading from `.cw/config.ts` files
 * with support for resolution overrides and path customization.
 *
 * Configuration files are TypeScript modules that export a configuration object.
 * Both project-local (`.cw/config.ts`) and global (`~/.cw/config.ts`) configs
 * are supported, with project config taking precedence.
 *
 * @example
 * ```typescript
 * // .cw/config.ts
 * import type { RegistryConfig } from "claude-workflow";
 *
 * export default {
 *   resolution: {
 *     overrides: {
 *       "my-workflow": { source: "project" },
 *       "shared-utils": { source: "global" }
 *     }
 *   },
 *   paths: {
 *     projectWorkflows: ".cw/workflows",
 *     globalWorkflows: "~/.cw/workflows"
 *   }
 * } satisfies RegistryConfig;
 * ```
 */

import * as fs from "node:fs/promises";
import { homedir } from "node:os";
import * as path from "node:path";
import type { Result } from "../utils/result/result.ts";
import type { SourcePrefix } from "./types.ts";

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Resolution override for a specific workflow.
 *
 * Allows forcing a workflow to be resolved from a specific source,
 * bypassing the normal resolution order.
 *
 * @example
 * ```typescript
 * const override: ResolutionOverride = {
 *   source: "global",
 *   version: "1.0.0" // Optional: pin to specific version
 * };
 * ```
 */
export interface ResolutionOverride {
	/**
	 * Source to resolve from.
	 *
	 * When specified, bypasses normal resolution order and resolves
	 * directly from this source.
	 */
	source?: SourcePrefix;

	/**
	 * Pin to a specific version.
	 *
	 * When specified, uses this version instead of the range
	 * specified in the reference.
	 */
	version?: string;

	/**
	 * Custom path to the workflow package.
	 *
	 * When specified, resolves directly from this path instead
	 * of searching in standard locations.
	 */
	path?: string;
}

/**
 * Configuration for resolution overrides.
 *
 * Maps workflow names (or patterns) to their override settings.
 */
export interface ResolutionConfig {
	/**
	 * Override settings keyed by workflow name or pattern.
	 *
	 * Keys can be:
	 * - Exact package names: "my-workflow"
	 * - Scoped packages: "@myorg/workflow"
	 * - Glob patterns: "@myorg/*" (future support)
	 */
	overrides?: Record<string, ResolutionOverride>;
}

/**
 * Configuration for workflow storage paths.
 *
 * Allows customizing where workflows are stored and searched.
 * All paths can be absolute or relative to their context.
 */
export interface PathConfig {
	/**
	 * Path to project-local workflows.
	 *
	 * Relative paths are resolved from the project root.
	 * @default ".cw/workflows"
	 */
	projectWorkflows?: string;

	/**
	 * Path to project-installed workflows.
	 *
	 * Relative paths are resolved from the project root.
	 * @default ".cw/workflows/.installed"
	 */
	projectInstalled?: string;

	/**
	 * Path to global workflows.
	 *
	 * Relative paths are resolved from the user's home directory.
	 * Can be overridden by `CW_GLOBAL_WORKFLOWS_PATH` environment variable.
	 * @default "~/.cw/workflows"
	 */
	globalWorkflows?: string;
}

/**
 * Main registry configuration.
 *
 * Loaded from `.cw/config.ts` (project) or `~/.cw/config.ts` (global).
 *
 * @example
 * ```typescript
 * const config: RegistryConfig = {
 *   resolution: {
 *     overrides: {
 *       "shared-utils": { source: "global" }
 *     }
 *   },
 *   paths: {
 *     globalWorkflows: "/opt/cw/workflows"
 *   }
 * };
 * ```
 */
export interface RegistryConfig {
	/**
	 * Resolution override settings.
	 */
	resolution?: ResolutionConfig;

	/**
	 * Path configuration.
	 */
	paths?: PathConfig;
}

/**
 * Loaded configuration with resolved paths.
 *
 * Contains the final merged configuration with all paths
 * resolved to absolute paths.
 */
export interface LoadedConfig {
	/**
	 * Merged registry configuration.
	 */
	config: RegistryConfig;

	/**
	 * Resolved absolute paths for workflow locations.
	 */
	resolvedPaths: ResolvedPaths;

	/**
	 * Path to the project config file (if loaded).
	 */
	projectConfigPath?: string;

	/**
	 * Path to the global config file (if loaded).
	 */
	globalConfigPath?: string;
}

/**
 * Resolved absolute paths for workflow locations.
 */
export interface ResolvedPaths {
	/** Absolute path to project-local workflows */
	projectWorkflows: string;

	/** Absolute path to project-installed workflows */
	projectInstalled: string;

	/** Absolute path to global workflows */
	globalWorkflows: string;

	/** Project root directory */
	projectRoot: string;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error codes for configuration loading failures.
 */
export type ConfigErrorCode =
	| "CONFIG_NOT_FOUND" // Config file does not exist (not an error for optional configs)
	| "CONFIG_PARSE_ERROR" // Config file exists but failed to parse/import
	| "CONFIG_INVALID" // Config file loaded but has invalid structure
	| "CONFIG_IMPORT_ERROR"; // Failed to dynamically import config module

/**
 * Configuration loading error.
 *
 * Provides detailed information about why configuration loading failed.
 */
export interface ConfigError {
	/** Error code identifying the type of failure */
	code: ConfigErrorCode;

	/** Human-readable error message */
	message: string;

	/** Path to the config file that failed to load */
	path?: string;

	/** Suggestions for resolving the error */
	suggestions?: string[];
}

/**
 * Constants for configuration error codes.
 */
export const CONFIG_ERROR_CODES = {
	/** Config file does not exist */
	CONFIG_NOT_FOUND: "CONFIG_NOT_FOUND",
	/** Config file exists but failed to parse/import */
	CONFIG_PARSE_ERROR: "CONFIG_PARSE_ERROR",
	/** Config file loaded but has invalid structure */
	CONFIG_INVALID: "CONFIG_INVALID",
	/** Failed to dynamically import config module */
	CONFIG_IMPORT_ERROR: "CONFIG_IMPORT_ERROR",
} as const satisfies Record<string, ConfigErrorCode>;

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
 * Check if a path is a file.
 *
 * @param filePath - Path to check
 * @returns True if the path is a file
 */
async function isFile(filePath: string): Promise<boolean> {
	try {
		const stat = await fs.stat(filePath);
		return stat.isFile();
	} catch {
		return false;
	}
}

/**
 * Get the user's home directory.
 *
 * @returns Absolute path to the home directory
 */
function getHomeDir(): string {
	return homedir();
}

/**
 * Expand tilde (~) in path to home directory.
 *
 * @param inputPath - Path that may contain tilde
 * @returns Path with tilde expanded
 */
function expandTilde(inputPath: string): string {
	if (inputPath.startsWith("~/")) {
		return path.join(getHomeDir(), inputPath.slice(2));
	}
	if (inputPath === "~") {
		return getHomeDir();
	}
	return inputPath;
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default path configuration values.
 */
const DEFAULT_PATHS = {
	projectWorkflows: ".cw/workflows",
	projectInstalled: ".cw/workflows/.installed",
	globalWorkflows: ".cw/workflows",
} as const;

/**
 * Get the default global workflows path.
 *
 * Checks for environment variable override, falls back to default.
 *
 * @returns Absolute path to global workflows directory
 */
export function getGlobalWorkflowsPath(): string {
	const envPath = process.env.CW_GLOBAL_WORKFLOWS_PATH;
	if (envPath) {
		return path.resolve(expandTilde(envPath));
	}
	return path.join(getHomeDir(), DEFAULT_PATHS.globalWorkflows);
}

/**
 * Get the project root path.
 *
 * Checks for environment variable override, falls back to provided cwd.
 *
 * @param cwd - Current working directory
 * @returns Absolute path to project root
 */
export function getProjectRoot(cwd?: string): string {
	const envPath = process.env.CW_PROJECT_PATH;
	if (envPath) {
		return path.resolve(expandTilde(envPath));
	}
	return path.resolve(cwd ?? process.cwd());
}

/**
 * Get default resolved paths for a project.
 *
 * @param cwd - Current working directory (optional)
 * @returns Resolved paths with all defaults applied
 */
export function getDefaultPaths(cwd?: string): ResolvedPaths {
	const projectRoot = getProjectRoot(cwd);
	return {
		projectWorkflows: path.join(projectRoot, DEFAULT_PATHS.projectWorkflows),
		projectInstalled: path.join(projectRoot, DEFAULT_PATHS.projectInstalled),
		globalWorkflows: getGlobalWorkflowsPath(),
		projectRoot,
	};
}

/**
 * Create an empty default configuration.
 *
 * @returns Empty registry configuration
 */
export function getDefaultConfig(): RegistryConfig {
	return {
		resolution: {
			overrides: {},
		},
		paths: {},
	};
}

// ============================================================================
// Configuration Validation
// ============================================================================

/**
 * Type guard to check if a value is a valid RegistryConfig.
 *
 * @param value - Value to check
 * @returns True if value matches RegistryConfig structure
 */
export function isRegistryConfig(value: unknown): value is RegistryConfig {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return false;
	}

	const obj = value as Record<string, unknown>;

	// Optional: resolution must be an object if present
	if (obj.resolution !== undefined) {
		if (typeof obj.resolution !== "object" || obj.resolution === null) {
			return false;
		}
		const resolution = obj.resolution as Record<string, unknown>;

		// Optional: overrides must be an object if present
		if (resolution.overrides !== undefined) {
			if (
				typeof resolution.overrides !== "object" ||
				resolution.overrides === null
			) {
				return false;
			}
		}
	}

	// Optional: paths must be an object if present
	if (obj.paths !== undefined) {
		if (typeof obj.paths !== "object" || obj.paths === null) {
			return false;
		}
		const paths = obj.paths as Record<string, unknown>;

		// All path properties must be strings if present
		for (const key of [
			"projectWorkflows",
			"projectInstalled",
			"globalWorkflows",
		]) {
			if (paths[key] !== undefined && typeof paths[key] !== "string") {
				return false;
			}
		}
	}

	return true;
}

/**
 * Type guard to check if a value is a valid ResolutionOverride.
 *
 * @param value - Value to check
 * @returns True if value matches ResolutionOverride structure
 */
export function isResolutionOverride(
	value: unknown,
): value is ResolutionOverride {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return false;
	}

	const obj = value as Record<string, unknown>;

	// All properties are optional but must be strings if present
	if (obj.source !== undefined && typeof obj.source !== "string") {
		return false;
	}
	if (obj.version !== undefined && typeof obj.version !== "string") {
		return false;
	}
	if (obj.path !== undefined && typeof obj.path !== "string") {
		return false;
	}

	return true;
}

/**
 * Validate a loaded configuration.
 *
 * @param config - Configuration to validate
 * @returns Validation result with errors if invalid
 */
export function validateConfig(
	config: unknown,
): Result<RegistryConfig, ConfigError> {
	if (!isRegistryConfig(config)) {
		return {
			_tag: "err",
			error: {
				code: CONFIG_ERROR_CODES.CONFIG_INVALID,
				message: "Configuration has invalid structure",
				suggestions: [
					"Ensure config exports an object with optional 'resolution' and 'paths' properties",
					"Check that all path values are strings",
					"Check that resolution.overrides is an object with workflow names as keys",
				],
			},
		};
	}

	// Validate individual overrides
	if (config.resolution?.overrides) {
		for (const [name, override] of Object.entries(
			config.resolution.overrides,
		)) {
			if (!isResolutionOverride(override)) {
				return {
					_tag: "err",
					error: {
						code: CONFIG_ERROR_CODES.CONFIG_INVALID,
						message: `Invalid override for workflow "${name}"`,
						suggestions: [
							"Override must be an object with optional 'source', 'version', and 'path' string properties",
							`Example: { "${name}": { source: "global", version: "^1.0.0" } }`,
						],
					},
				};
			}
		}
	}

	return { _tag: "ok", value: config };
}

// ============================================================================
// Configuration Loading
// ============================================================================

/**
 * Load a configuration file from the filesystem.
 *
 * Dynamically imports the TypeScript config file and validates its structure.
 *
 * @param configPath - Absolute path to the config file
 * @returns Result with loaded config or error
 */
async function loadConfigFile(
	configPath: string,
): Promise<Result<RegistryConfig, ConfigError>> {
	// Check if config file exists
	if (!(await pathExists(configPath))) {
		return {
			_tag: "err",
			error: {
				code: CONFIG_ERROR_CODES.CONFIG_NOT_FOUND,
				message: `Configuration file not found: ${configPath}`,
				path: configPath,
			},
		};
	}

	// Check if it's a file
	if (!(await isFile(configPath))) {
		return {
			_tag: "err",
			error: {
				code: CONFIG_ERROR_CODES.CONFIG_INVALID,
				message: `Configuration path is not a file: ${configPath}`,
				path: configPath,
				suggestions: [
					"Ensure the config path points to a .ts file, not a directory",
				],
			},
		};
	}

	// Dynamically import the config file
	let moduleExports: Record<string, unknown>;
	try {
		moduleExports = (await import(configPath)) as Record<string, unknown>;
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		return {
			_tag: "err",
			error: {
				code: CONFIG_ERROR_CODES.CONFIG_IMPORT_ERROR,
				message: `Failed to import configuration: ${message}`,
				path: configPath,
				suggestions: [
					"Ensure the config file is valid TypeScript",
					"Check for syntax errors in the config file",
					"Ensure all imports in the config file are valid",
				],
			},
		};
	}

	// Extract the default export
	const config = moduleExports.default;
	if (config === undefined) {
		return {
			_tag: "err",
			error: {
				code: CONFIG_ERROR_CODES.CONFIG_INVALID,
				message: "Configuration file must have a default export",
				path: configPath,
				suggestions: [
					"Add 'export default { ... }' to the config file",
					"Example: export default { resolution: { overrides: {} } }",
				],
			},
		};
	}

	// Validate the configuration structure
	return validateConfig(config);
}

/**
 * Load project-local configuration.
 *
 * Looks for `.cw/config.ts` in the project root.
 *
 * @param cwd - Current working directory (optional)
 * @returns Result with loaded config or error (CONFIG_NOT_FOUND if file doesn't exist)
 */
export async function loadProjectConfig(
	cwd?: string,
): Promise<Result<RegistryConfig, ConfigError>> {
	const projectRoot = getProjectRoot(cwd);
	const configPath = path.join(projectRoot, ".cw", "config.ts");
	return loadConfigFile(configPath);
}

/**
 * Load global configuration.
 *
 * Looks for `~/.cw/config.ts` in the user's home directory.
 *
 * @returns Result with loaded config or error (CONFIG_NOT_FOUND if file doesn't exist)
 */
export async function loadGlobalConfig(): Promise<
	Result<RegistryConfig, ConfigError>
> {
	const configPath = path.join(getHomeDir(), ".cw", "config.ts");
	return loadConfigFile(configPath);
}

/**
 * Merge two configurations, with override taking precedence.
 *
 * @param base - Base configuration
 * @param override - Override configuration (takes precedence)
 * @returns Merged configuration
 */
export function mergeConfigs(
	base: RegistryConfig,
	override: RegistryConfig,
): RegistryConfig {
	return {
		resolution: {
			overrides: {
				...base.resolution?.overrides,
				...override.resolution?.overrides,
			},
		},
		paths: {
			...base.paths,
			...override.paths,
		},
	};
}

/**
 * Resolve paths from a configuration.
 *
 * Converts relative paths to absolute paths and applies defaults.
 *
 * @param config - Configuration with path settings
 * @param cwd - Current working directory (optional)
 * @returns Resolved absolute paths
 */
export function resolvePaths(
	config: RegistryConfig,
	cwd?: string,
): ResolvedPaths {
	const defaults = getDefaultPaths(cwd);
	const projectRoot = defaults.projectRoot;
	const paths = config.paths ?? {};

	// Resolve project-local paths (relative to project root)
	const projectWorkflows = paths.projectWorkflows
		? path.resolve(projectRoot, expandTilde(paths.projectWorkflows))
		: defaults.projectWorkflows;

	const projectInstalled = paths.projectInstalled
		? path.resolve(projectRoot, expandTilde(paths.projectInstalled))
		: defaults.projectInstalled;

	// Resolve global path (relative to home or absolute)
	const globalWorkflows = paths.globalWorkflows
		? path.resolve(expandTilde(paths.globalWorkflows))
		: defaults.globalWorkflows;

	return {
		projectWorkflows,
		projectInstalled,
		globalWorkflows,
		projectRoot,
	};
}

/**
 * Load and merge configuration from all sources.
 *
 * Loads both global and project configuration files, merging them
 * with project config taking precedence over global config.
 *
 * If neither config file exists, returns default configuration.
 *
 * @param cwd - Current working directory (optional)
 * @returns Result with loaded and merged config
 *
 * @example
 * ```typescript
 * const result = await loadConfig();
 * if (isOk(result)) {
 *   const { config, resolvedPaths } = result.value;
 *   console.log("Project workflows:", resolvedPaths.projectWorkflows);
 * }
 * ```
 */
export async function loadConfig(
	cwd?: string,
): Promise<Result<LoadedConfig, ConfigError>> {
	const projectRoot = getProjectRoot(cwd);
	let mergedConfig = getDefaultConfig();
	let projectConfigPath: string | undefined;
	let globalConfigPath: string | undefined;

	// Load global config (optional)
	const globalResult = await loadGlobalConfig();
	if (globalResult._tag === "ok") {
		mergedConfig = mergeConfigs(mergedConfig, globalResult.value);
		globalConfigPath = path.join(getHomeDir(), ".cw", "config.ts");
	} else if (globalResult.error.code !== CONFIG_ERROR_CODES.CONFIG_NOT_FOUND) {
		// Return error if config exists but failed to load
		return globalResult;
	}

	// Load project config (optional, overrides global)
	const projectResult = await loadProjectConfig(cwd);
	if (projectResult._tag === "ok") {
		mergedConfig = mergeConfigs(mergedConfig, projectResult.value);
		projectConfigPath = path.join(projectRoot, ".cw", "config.ts");
	} else if (projectResult.error.code !== CONFIG_ERROR_CODES.CONFIG_NOT_FOUND) {
		// Return error if config exists but failed to load
		return projectResult;
	}

	// Resolve paths
	const resolvedPaths = resolvePaths(mergedConfig, cwd);

	return {
		_tag: "ok",
		value: {
			config: mergedConfig,
			resolvedPaths,
			projectConfigPath,
			globalConfigPath,
		},
	};
}

// ============================================================================
// Resolution Override Helpers
// ============================================================================

/**
 * Get the resolution override for a workflow.
 *
 * @param config - Registry configuration
 * @param workflowName - Name of the workflow
 * @returns Resolution override if found, undefined otherwise
 */
export function getOverride(
	config: RegistryConfig,
	workflowName: string,
): ResolutionOverride | undefined {
	return config.resolution?.overrides?.[workflowName];
}

/**
 * Check if a workflow has a resolution override.
 *
 * @param config - Registry configuration
 * @param workflowName - Name of the workflow
 * @returns True if workflow has an override
 */
export function hasOverride(
	config: RegistryConfig,
	workflowName: string,
): boolean {
	return getOverride(config, workflowName) !== undefined;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Configuration loader interface.
 *
 * Provides methods for loading and managing registry configuration.
 */
export interface ConfigLoader {
	/**
	 * Load configuration from all sources.
	 *
	 * @param cwd - Current working directory (optional)
	 * @returns Result with loaded configuration
	 */
	load(cwd?: string): Promise<Result<LoadedConfig, ConfigError>>;

	/**
	 * Load project-local configuration only.
	 *
	 * @param cwd - Current working directory (optional)
	 * @returns Result with project configuration
	 */
	loadProject(cwd?: string): Promise<Result<RegistryConfig, ConfigError>>;

	/**
	 * Load global configuration only.
	 *
	 * @returns Result with global configuration
	 */
	loadGlobal(): Promise<Result<RegistryConfig, ConfigError>>;

	/**
	 * Get default paths without loading configuration.
	 *
	 * @param cwd - Current working directory (optional)
	 * @returns Default resolved paths
	 */
	getDefaultPaths(cwd?: string): ResolvedPaths;
}

/**
 * Implementation of the ConfigLoader interface.
 */
class ConfigLoaderImpl implements ConfigLoader {
	async load(cwd?: string): Promise<Result<LoadedConfig, ConfigError>> {
		return loadConfig(cwd);
	}

	async loadProject(
		cwd?: string,
	): Promise<Result<RegistryConfig, ConfigError>> {
		return loadProjectConfig(cwd);
	}

	async loadGlobal(): Promise<Result<RegistryConfig, ConfigError>> {
		return loadGlobalConfig();
	}

	getDefaultPaths(cwd?: string): ResolvedPaths {
		return getDefaultPaths(cwd);
	}
}

/**
 * Create a new ConfigLoader instance.
 *
 * @returns A new ConfigLoader
 *
 * @example
 * ```typescript
 * const loader = createConfigLoader();
 * const result = await loader.load();
 *
 * if (isOk(result)) {
 *   const { config, resolvedPaths } = result.value;
 *   // Use the configuration
 * }
 * ```
 */
export function createConfigLoader(): ConfigLoader {
	return new ConfigLoaderImpl();
}
