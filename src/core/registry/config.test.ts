/**
 * Tests for configuration loading module.
 *
 * This module tests all configuration functionality in config.ts including:
 * - Type guards (isRegistryConfig, isResolutionOverride)
 * - Configuration validation (validateConfig)
 * - Default paths (getDefaultPaths, getGlobalWorkflowsPath, getProjectRoot)
 * - Path resolution (resolvePaths)
 * - Config merging (mergeConfigs)
 * - Environment variable overrides
 * - Override helpers (getOverride, hasOverride)
 * - Default config (getDefaultConfig)
 * - ConfigLoader factory (createConfigLoader)
 */

import { describe, expect, it } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	// Error codes
	CONFIG_ERROR_CODES,
	// Factory
	createConfigLoader,
	// Default getters
	getDefaultConfig,
	getDefaultPaths,
	getGlobalWorkflowsPath,
	// Override helpers
	getOverride,
	getProjectRoot,
	hasOverride,
	// Type guards
	isRegistryConfig,
	isResolutionOverride,
	// Merging
	mergeConfigs,
	// Types are exported for documentation but tested via type guards
	type RegistryConfig,
	type ResolutionOverride,
	// Path resolution
	resolvePaths,
	// Validation
	validateConfig,
} from "./config.js";

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Save and restore environment variables during tests.
 */
function withEnvVars<T>(
	vars: Record<string, string | undefined>,
	fn: () => T,
): T {
	const saved: Record<string, string | undefined> = {};

	// Save and set
	for (const [key, value] of Object.entries(vars)) {
		saved[key] = process.env[key];
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}

	try {
		return fn();
	} finally {
		// Restore
		for (const [key, value] of Object.entries(saved)) {
			if (value === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = value;
			}
		}
	}
}

// ============================================================================
// isRegistryConfig Tests
// ============================================================================

describe("isRegistryConfig", () => {
	describe("valid configurations", () => {
		it("should accept empty object", () => {
			expect(isRegistryConfig({})).toBe(true);
		});

		it("should accept config with empty resolution", () => {
			expect(isRegistryConfig({ resolution: {} })).toBe(true);
		});

		it("should accept config with empty resolution.overrides", () => {
			expect(isRegistryConfig({ resolution: { overrides: {} } })).toBe(true);
		});

		it("should accept config with resolution overrides", () => {
			const config: RegistryConfig = {
				resolution: {
					overrides: {
						"my-workflow": { source: "global" },
						"another-workflow": { version: "^1.0.0" },
					},
				},
			};
			expect(isRegistryConfig(config)).toBe(true);
		});

		it("should accept config with empty paths", () => {
			expect(isRegistryConfig({ paths: {} })).toBe(true);
		});

		it("should accept config with all path properties", () => {
			const config: RegistryConfig = {
				paths: {
					projectWorkflows: ".cw/workflows",
					projectInstalled: ".cw/workflows/.installed",
					globalWorkflows: "~/.cw/workflows",
				},
			};
			expect(isRegistryConfig(config)).toBe(true);
		});

		it("should accept config with partial path properties", () => {
			const config: RegistryConfig = {
				paths: {
					projectWorkflows: "custom/path",
				},
			};
			expect(isRegistryConfig(config)).toBe(true);
		});

		it("should accept config with both resolution and paths", () => {
			const config: RegistryConfig = {
				resolution: {
					overrides: {
						"my-workflow": { source: "project" },
					},
				},
				paths: {
					globalWorkflows: "/opt/cw/workflows",
				},
			};
			expect(isRegistryConfig(config)).toBe(true);
		});
	});

	describe("invalid configurations", () => {
		it("should reject null", () => {
			expect(isRegistryConfig(null)).toBe(false);
		});

		it("should reject undefined", () => {
			expect(isRegistryConfig(undefined)).toBe(false);
		});

		it("should reject string", () => {
			expect(isRegistryConfig("config")).toBe(false);
		});

		it("should reject number", () => {
			expect(isRegistryConfig(123)).toBe(false);
		});

		it("should reject array", () => {
			expect(isRegistryConfig([])).toBe(false);
		});

		it("should reject non-object resolution", () => {
			expect(isRegistryConfig({ resolution: "invalid" })).toBe(false);
			expect(isRegistryConfig({ resolution: 123 })).toBe(false);
			expect(isRegistryConfig({ resolution: null })).toBe(false);
		});

		it("should reject non-object resolution.overrides", () => {
			expect(isRegistryConfig({ resolution: { overrides: "invalid" } })).toBe(
				false,
			);
			expect(isRegistryConfig({ resolution: { overrides: 123 } })).toBe(false);
			expect(isRegistryConfig({ resolution: { overrides: null } })).toBe(false);
		});

		it("should reject non-object paths", () => {
			expect(isRegistryConfig({ paths: "invalid" })).toBe(false);
			expect(isRegistryConfig({ paths: 123 })).toBe(false);
			expect(isRegistryConfig({ paths: null })).toBe(false);
		});

		it("should reject non-string path properties", () => {
			expect(isRegistryConfig({ paths: { projectWorkflows: 123 } })).toBe(
				false,
			);
			expect(isRegistryConfig({ paths: { projectInstalled: null } })).toBe(
				false,
			);
			expect(isRegistryConfig({ paths: { globalWorkflows: {} } })).toBe(false);
		});
	});
});

// ============================================================================
// isResolutionOverride Tests
// ============================================================================

describe("isResolutionOverride", () => {
	describe("valid overrides", () => {
		it("should accept empty object", () => {
			expect(isResolutionOverride({})).toBe(true);
		});

		it("should accept override with source only", () => {
			expect(isResolutionOverride({ source: "global" })).toBe(true);
			expect(isResolutionOverride({ source: "project" })).toBe(true);
		});

		it("should accept override with version only", () => {
			expect(isResolutionOverride({ version: "^1.0.0" })).toBe(true);
			expect(isResolutionOverride({ version: "1.2.3" })).toBe(true);
		});

		it("should accept override with path only", () => {
			expect(isResolutionOverride({ path: "/custom/path" })).toBe(true);
			expect(isResolutionOverride({ path: "./relative/path" })).toBe(true);
		});

		it("should accept override with all properties", () => {
			const override: ResolutionOverride = {
				source: "global",
				version: "^1.0.0",
				path: "/custom/path",
			};
			expect(isResolutionOverride(override)).toBe(true);
		});

		it("should accept override with partial properties", () => {
			expect(isResolutionOverride({ source: "global", version: "1.0.0" })).toBe(
				true,
			);
			expect(isResolutionOverride({ source: "project", path: "/path" })).toBe(
				true,
			);
		});
	});

	describe("invalid overrides", () => {
		it("should reject null", () => {
			expect(isResolutionOverride(null)).toBe(false);
		});

		it("should reject undefined", () => {
			expect(isResolutionOverride(undefined)).toBe(false);
		});

		it("should reject string", () => {
			expect(isResolutionOverride("override")).toBe(false);
		});

		it("should reject number", () => {
			expect(isResolutionOverride(123)).toBe(false);
		});

		it("should reject array", () => {
			expect(isResolutionOverride([])).toBe(false);
		});

		it("should reject non-string source", () => {
			expect(isResolutionOverride({ source: 123 })).toBe(false);
			expect(isResolutionOverride({ source: null })).toBe(false);
			expect(isResolutionOverride({ source: {} })).toBe(false);
		});

		it("should reject non-string version", () => {
			expect(isResolutionOverride({ version: 123 })).toBe(false);
			expect(isResolutionOverride({ version: null })).toBe(false);
			expect(isResolutionOverride({ version: {} })).toBe(false);
		});

		it("should reject non-string path", () => {
			expect(isResolutionOverride({ path: 123 })).toBe(false);
			expect(isResolutionOverride({ path: null })).toBe(false);
			expect(isResolutionOverride({ path: {} })).toBe(false);
		});
	});
});

// ============================================================================
// validateConfig Tests
// ============================================================================

describe("validateConfig", () => {
	describe("valid configurations", () => {
		it("should return Ok for valid empty config", () => {
			const result = validateConfig({});

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toEqual({});
			}
		});

		it("should return Ok for valid config with overrides", () => {
			const config: RegistryConfig = {
				resolution: {
					overrides: {
						"my-workflow": { source: "global" },
					},
				},
			};
			const result = validateConfig(config);

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toEqual(config);
			}
		});

		it("should return Ok for valid config with paths", () => {
			const config: RegistryConfig = {
				paths: {
					projectWorkflows: "custom/workflows",
				},
			};
			const result = validateConfig(config);

			expect(result._tag).toBe("ok");
			if (result._tag === "ok") {
				expect(result.value).toEqual(config);
			}
		});
	});

	describe("invalid configurations", () => {
		it("should return Err for non-object config", () => {
			const result = validateConfig("invalid");

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.code).toBe(CONFIG_ERROR_CODES.CONFIG_INVALID);
				expect(result.error.message).toContain("invalid structure");
			}
		});

		it("should return Err for null config", () => {
			const result = validateConfig(null);

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.code).toBe(CONFIG_ERROR_CODES.CONFIG_INVALID);
			}
		});

		it("should return Err for invalid override", () => {
			const config = {
				resolution: {
					overrides: {
						"my-workflow": { source: 123 }, // Invalid - should be string
					},
				},
			};
			const result = validateConfig(config);

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.code).toBe(CONFIG_ERROR_CODES.CONFIG_INVALID);
				expect(result.error.message).toContain("my-workflow");
			}
		});

		it("should include suggestions in error", () => {
			const result = validateConfig("invalid");

			expect(result._tag).toBe("err");
			if (result._tag === "err") {
				expect(result.error.suggestions).toBeDefined();
				expect(result.error.suggestions?.length).toBeGreaterThan(0);
			}
		});
	});
});

// ============================================================================
// getDefaultConfig Tests
// ============================================================================

describe("getDefaultConfig", () => {
	it("should return config with empty overrides", () => {
		const config = getDefaultConfig();

		expect(config.resolution).toBeDefined();
		expect(config.resolution?.overrides).toEqual({});
	});

	it("should return config with empty paths", () => {
		const config = getDefaultConfig();

		expect(config.paths).toBeDefined();
		expect(config.paths).toEqual({});
	});

	it("should return a new object each time", () => {
		const config1 = getDefaultConfig();
		const config2 = getDefaultConfig();

		expect(config1).not.toBe(config2);
		expect(config1).toEqual(config2);
	});
});

// ============================================================================
// getGlobalWorkflowsPath Tests
// ============================================================================

describe("getGlobalWorkflowsPath", () => {
	it("should return default path when env var is not set", () => {
		const result = withEnvVars({ CW_GLOBAL_WORKFLOWS_PATH: undefined }, () => {
			return getGlobalWorkflowsPath();
		});

		expect(result).toBe(join(homedir(), ".cw", "workflows"));
	});

	it("should use env var when set", () => {
		const result = withEnvVars(
			{ CW_GLOBAL_WORKFLOWS_PATH: "/custom/global/workflows" },
			() => {
				return getGlobalWorkflowsPath();
			},
		);

		expect(result).toBe("/custom/global/workflows");
	});

	it("should expand tilde in env var path", () => {
		const result = withEnvVars(
			{ CW_GLOBAL_WORKFLOWS_PATH: "~/custom/workflows" },
			() => {
				return getGlobalWorkflowsPath();
			},
		);

		expect(result).toBe(join(homedir(), "custom/workflows"));
	});

	it("should resolve relative paths in env var", () => {
		const result = withEnvVars(
			{ CW_GLOBAL_WORKFLOWS_PATH: "relative/path" },
			() => {
				return getGlobalWorkflowsPath();
			},
		);

		// Relative paths get resolved to absolute paths from cwd
		expect(result).toContain("relative/path");
		expect(result.startsWith("/")).toBe(true);
	});
});

// ============================================================================
// getProjectRoot Tests
// ============================================================================

describe("getProjectRoot", () => {
	it("should return provided cwd when no env var", () => {
		const result = withEnvVars({ CW_PROJECT_PATH: undefined }, () => {
			return getProjectRoot("/my/project");
		});

		expect(result).toBe("/my/project");
	});

	it("should return process.cwd when no cwd provided and no env var", () => {
		const result = withEnvVars({ CW_PROJECT_PATH: undefined }, () => {
			return getProjectRoot();
		});

		expect(result).toBe(process.cwd());
	});

	it("should use env var when set", () => {
		const result = withEnvVars({ CW_PROJECT_PATH: "/override/project" }, () => {
			return getProjectRoot("/original/project");
		});

		expect(result).toBe("/override/project");
	});

	it("should expand tilde in env var path", () => {
		const result = withEnvVars({ CW_PROJECT_PATH: "~/my-project" }, () => {
			return getProjectRoot();
		});

		expect(result).toBe(join(homedir(), "my-project"));
	});
});

// ============================================================================
// getDefaultPaths Tests
// ============================================================================

describe("getDefaultPaths", () => {
	it("should return default paths relative to project root", () => {
		const paths = withEnvVars(
			{ CW_PROJECT_PATH: undefined, CW_GLOBAL_WORKFLOWS_PATH: undefined },
			() => {
				return getDefaultPaths("/my/project");
			},
		);

		expect(paths.projectRoot).toBe("/my/project");
		expect(paths.projectWorkflows).toBe("/my/project/.cw/workflows");
		expect(paths.projectInstalled).toBe("/my/project/.cw/workflows/.installed");
		expect(paths.globalWorkflows).toBe(join(homedir(), ".cw", "workflows"));
	});

	it("should use env vars for path overrides", () => {
		const paths = withEnvVars(
			{
				CW_PROJECT_PATH: "/env/project",
				CW_GLOBAL_WORKFLOWS_PATH: "/env/global",
			},
			() => {
				return getDefaultPaths("/original/project");
			},
		);

		// CW_PROJECT_PATH takes precedence
		expect(paths.projectRoot).toBe("/env/project");
		expect(paths.projectWorkflows).toBe("/env/project/.cw/workflows");
		expect(paths.globalWorkflows).toBe("/env/global");
	});
});

// ============================================================================
// resolvePaths Tests
// ============================================================================

describe("resolvePaths", () => {
	it("should use defaults when config paths are empty", () => {
		const paths = withEnvVars(
			{ CW_PROJECT_PATH: undefined, CW_GLOBAL_WORKFLOWS_PATH: undefined },
			() => {
				return resolvePaths({}, "/my/project");
			},
		);

		expect(paths.projectWorkflows).toBe("/my/project/.cw/workflows");
		expect(paths.projectInstalled).toBe("/my/project/.cw/workflows/.installed");
		expect(paths.globalWorkflows).toBe(join(homedir(), ".cw", "workflows"));
	});

	it("should use config paths when provided", () => {
		const config: RegistryConfig = {
			paths: {
				projectWorkflows: "custom/workflows",
				projectInstalled: "custom/installed",
				globalWorkflows: "/absolute/global",
			},
		};

		const paths = withEnvVars(
			{ CW_PROJECT_PATH: undefined, CW_GLOBAL_WORKFLOWS_PATH: undefined },
			() => {
				return resolvePaths(config, "/my/project");
			},
		);

		expect(paths.projectWorkflows).toBe("/my/project/custom/workflows");
		expect(paths.projectInstalled).toBe("/my/project/custom/installed");
		expect(paths.globalWorkflows).toBe("/absolute/global");
	});

	it("should expand tilde in config paths", () => {
		const config: RegistryConfig = {
			paths: {
				globalWorkflows: "~/my-global-workflows",
			},
		};

		const paths = withEnvVars(
			{ CW_PROJECT_PATH: undefined, CW_GLOBAL_WORKFLOWS_PATH: undefined },
			() => {
				return resolvePaths(config, "/my/project");
			},
		);

		expect(paths.globalWorkflows).toBe(join(homedir(), "my-global-workflows"));
	});

	it("should handle partial config paths", () => {
		const config: RegistryConfig = {
			paths: {
				projectWorkflows: "only-workflows",
			},
		};

		const paths = withEnvVars(
			{ CW_PROJECT_PATH: undefined, CW_GLOBAL_WORKFLOWS_PATH: undefined },
			() => {
				return resolvePaths(config, "/my/project");
			},
		);

		expect(paths.projectWorkflows).toBe("/my/project/only-workflows");
		// Others should be defaults
		expect(paths.projectInstalled).toBe("/my/project/.cw/workflows/.installed");
		expect(paths.globalWorkflows).toBe(join(homedir(), ".cw", "workflows"));
	});
});

// ============================================================================
// mergeConfigs Tests
// ============================================================================

describe("mergeConfigs", () => {
	it("should merge empty configs", () => {
		const result = mergeConfigs({}, {});

		expect(result).toEqual({
			resolution: { overrides: {} },
			paths: {},
		});
	});

	it("should use base config when override is empty", () => {
		const base: RegistryConfig = {
			resolution: {
				overrides: {
					"base-workflow": { source: "global" },
				},
			},
			paths: {
				projectWorkflows: "base/path",
			},
		};

		const result = mergeConfigs(base, {});

		expect(result.resolution?.overrides?.["base-workflow"]).toEqual({
			source: "global",
		});
		expect(result.paths?.projectWorkflows).toBe("base/path");
	});

	it("should use override config when base is empty", () => {
		const override: RegistryConfig = {
			resolution: {
				overrides: {
					"override-workflow": { version: "^2.0.0" },
				},
			},
			paths: {
				globalWorkflows: "/override/global",
			},
		};

		const result = mergeConfigs({}, override);

		expect(result.resolution?.overrides?.["override-workflow"]).toEqual({
			version: "^2.0.0",
		});
		expect(result.paths?.globalWorkflows).toBe("/override/global");
	});

	it("should override base values with override values", () => {
		const base: RegistryConfig = {
			resolution: {
				overrides: {
					"shared-workflow": { source: "global" },
				},
			},
			paths: {
				projectWorkflows: "base/workflows",
			},
		};

		const override: RegistryConfig = {
			resolution: {
				overrides: {
					"shared-workflow": { source: "project" },
				},
			},
			paths: {
				projectWorkflows: "override/workflows",
			},
		};

		const result = mergeConfigs(base, override);

		// Override takes precedence
		expect(result.resolution?.overrides?.["shared-workflow"]).toEqual({
			source: "project",
		});
		expect(result.paths?.projectWorkflows).toBe("override/workflows");
	});

	it("should merge overrides from both configs", () => {
		const base: RegistryConfig = {
			resolution: {
				overrides: {
					"base-only": { source: "global" },
				},
			},
		};

		const override: RegistryConfig = {
			resolution: {
				overrides: {
					"override-only": { source: "project" },
				},
			},
		};

		const result = mergeConfigs(base, override);

		expect(result.resolution?.overrides).toEqual({
			"base-only": { source: "global" },
			"override-only": { source: "project" },
		});
	});

	it("should merge paths from both configs", () => {
		const base: RegistryConfig = {
			paths: {
				projectWorkflows: "base/workflows",
			},
		};

		const override: RegistryConfig = {
			paths: {
				globalWorkflows: "/override/global",
			},
		};

		const result = mergeConfigs(base, override);

		expect(result.paths).toEqual({
			projectWorkflows: "base/workflows",
			globalWorkflows: "/override/global",
		});
	});
});

// ============================================================================
// getOverride Tests
// ============================================================================

describe("getOverride", () => {
	it("should return override when it exists", () => {
		const config: RegistryConfig = {
			resolution: {
				overrides: {
					"my-workflow": { source: "global", version: "^1.0.0" },
				},
			},
		};

		const override = getOverride(config, "my-workflow");

		expect(override).toEqual({ source: "global", version: "^1.0.0" });
	});

	it("should return undefined when override does not exist", () => {
		const config: RegistryConfig = {
			resolution: {
				overrides: {
					"my-workflow": { source: "global" },
				},
			},
		};

		const override = getOverride(config, "other-workflow");

		expect(override).toBeUndefined();
	});

	it("should return undefined when resolution is undefined", () => {
		const config: RegistryConfig = {};

		const override = getOverride(config, "my-workflow");

		expect(override).toBeUndefined();
	});

	it("should return undefined when overrides is undefined", () => {
		const config: RegistryConfig = {
			resolution: {},
		};

		const override = getOverride(config, "my-workflow");

		expect(override).toBeUndefined();
	});

	it("should handle scoped package names", () => {
		const config: RegistryConfig = {
			resolution: {
				overrides: {
					"@myorg/workflow": { source: "project" },
				},
			},
		};

		const override = getOverride(config, "@myorg/workflow");

		expect(override).toEqual({ source: "project" });
	});
});

// ============================================================================
// hasOverride Tests
// ============================================================================

describe("hasOverride", () => {
	it("should return true when override exists", () => {
		const config: RegistryConfig = {
			resolution: {
				overrides: {
					"my-workflow": { source: "global" },
				},
			},
		};

		expect(hasOverride(config, "my-workflow")).toBe(true);
	});

	it("should return false when override does not exist", () => {
		const config: RegistryConfig = {
			resolution: {
				overrides: {
					"my-workflow": { source: "global" },
				},
			},
		};

		expect(hasOverride(config, "other-workflow")).toBe(false);
	});

	it("should return false for empty config", () => {
		const config: RegistryConfig = {};

		expect(hasOverride(config, "my-workflow")).toBe(false);
	});

	it("should return true for empty override object", () => {
		const config: RegistryConfig = {
			resolution: {
				overrides: {
					"empty-override": {},
				},
			},
		};

		expect(hasOverride(config, "empty-override")).toBe(true);
	});
});

// ============================================================================
// createConfigLoader Tests
// ============================================================================

describe("createConfigLoader", () => {
	it("should create a ConfigLoader instance", () => {
		const loader = createConfigLoader();

		expect(loader).toBeDefined();
		expect(typeof loader.load).toBe("function");
		expect(typeof loader.loadProject).toBe("function");
		expect(typeof loader.loadGlobal).toBe("function");
		expect(typeof loader.getDefaultPaths).toBe("function");
	});

	it("should return default paths via getDefaultPaths", () => {
		const loader = createConfigLoader();

		const paths = withEnvVars(
			{ CW_PROJECT_PATH: undefined, CW_GLOBAL_WORKFLOWS_PATH: undefined },
			() => {
				return loader.getDefaultPaths("/test/project");
			},
		);

		expect(paths.projectRoot).toBe("/test/project");
		expect(paths.projectWorkflows).toBe("/test/project/.cw/workflows");
		expect(paths.projectInstalled).toBe(
			"/test/project/.cw/workflows/.installed",
		);
		expect(paths.globalWorkflows).toBe(join(homedir(), ".cw", "workflows"));
	});
});

// ============================================================================
// CONFIG_ERROR_CODES Tests
// ============================================================================

describe("CONFIG_ERROR_CODES", () => {
	it("should have CONFIG_NOT_FOUND code", () => {
		expect(CONFIG_ERROR_CODES.CONFIG_NOT_FOUND).toBe("CONFIG_NOT_FOUND");
	});

	it("should have CONFIG_PARSE_ERROR code", () => {
		expect(CONFIG_ERROR_CODES.CONFIG_PARSE_ERROR).toBe("CONFIG_PARSE_ERROR");
	});

	it("should have CONFIG_INVALID code", () => {
		expect(CONFIG_ERROR_CODES.CONFIG_INVALID).toBe("CONFIG_INVALID");
	});

	it("should have CONFIG_IMPORT_ERROR code", () => {
		expect(CONFIG_ERROR_CODES.CONFIG_IMPORT_ERROR).toBe("CONFIG_IMPORT_ERROR");
	});

	it("should be immutable (const)", () => {
		// TypeScript enforces this at compile time, but we can verify the values are strings
		expect(typeof CONFIG_ERROR_CODES.CONFIG_NOT_FOUND).toBe("string");
		expect(typeof CONFIG_ERROR_CODES.CONFIG_PARSE_ERROR).toBe("string");
		expect(typeof CONFIG_ERROR_CODES.CONFIG_INVALID).toBe("string");
		expect(typeof CONFIG_ERROR_CODES.CONFIG_IMPORT_ERROR).toBe("string");
	});
});

// ============================================================================
// Edge Cases
// ============================================================================

describe("edge cases", () => {
	describe("path handling", () => {
		it("should handle paths with spaces", () => {
			const paths = withEnvVars(
				{ CW_PROJECT_PATH: undefined, CW_GLOBAL_WORKFLOWS_PATH: undefined },
				() => {
					return resolvePaths({}, "/my project/with spaces");
				},
			);

			expect(paths.projectRoot).toBe("/my project/with spaces");
			expect(paths.projectWorkflows).toBe(
				"/my project/with spaces/.cw/workflows",
			);
		});

		it("should handle paths with unicode characters", () => {
			const paths = withEnvVars(
				{ CW_PROJECT_PATH: undefined, CW_GLOBAL_WORKFLOWS_PATH: undefined },
				() => {
					return resolvePaths({}, "/my/project/日本語");
				},
			);

			expect(paths.projectRoot).toBe("/my/project/日本語");
		});

		it("should handle empty string cwd", () => {
			const paths = withEnvVars(
				{ CW_PROJECT_PATH: undefined, CW_GLOBAL_WORKFLOWS_PATH: undefined },
				() => {
					return getDefaultPaths("");
				},
			);

			// Empty string resolves to cwd
			expect(paths.projectRoot).toBe(process.cwd());
		});
	});

	describe("override handling", () => {
		it("should handle workflow names with special characters", () => {
			const config: RegistryConfig = {
				resolution: {
					overrides: {
						"@scope/my-workflow-v2": { source: "global" },
						"workflow.with.dots": { source: "project" },
						workflow_with_underscores: { version: "1.0.0" },
					},
				},
			};

			expect(getOverride(config, "@scope/my-workflow-v2")).toEqual({
				source: "global",
			});
			expect(getOverride(config, "workflow.with.dots")).toEqual({
				source: "project",
			});
			expect(getOverride(config, "workflow_with_underscores")).toEqual({
				version: "1.0.0",
			});
		});

		it("should handle empty string workflow name", () => {
			const config: RegistryConfig = {
				resolution: {
					overrides: {
						"": { source: "global" },
					},
				},
			};

			// Empty string is a valid key in JS objects
			expect(getOverride(config, "")).toEqual({ source: "global" });
		});
	});

	describe("config validation edge cases", () => {
		it("should validate config with extra unknown properties (passes - loose validation)", () => {
			const config = {
				resolution: { overrides: {} },
				paths: {},
				unknownProperty: "value",
			};

			// We do loose validation - extra properties are allowed
			const result = validateConfig(config);
			expect(result._tag).toBe("ok");
		});

		it("should handle deeply nested invalid config", () => {
			const config = {
				resolution: {
					overrides: {
						workflow1: { source: "valid" },
						workflow2: { source: 123 }, // Invalid nested value
					},
				},
			};

			const result = validateConfig(config);
			expect(result._tag).toBe("err");
		});
	});
});
