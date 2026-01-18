/**
 * Tests for Zod schemas for workflow package.json validation.
 *
 * This module tests all schemas defined in schemas.ts including:
 * - Base field schemas (name, version, main path)
 * - Author and repository schemas
 * - Workflow metadata schemas
 * - Dependencies schema
 * - Claude Orchestrator config schema
 * - Main WorkflowPackageJsonSchema
 * - Helper validation functions
 */

import { describe, expect, it } from "bun:test";
import {
	AuthorObjectSchema,
	AuthorSchema,
	ClaudeOrchestratorConfigSchema,
	DependenciesSchema,
	isValidPackageName,
	isValidSemver,
	isValidSemverRange,
	MainPathSchema,
	PackageNameSchema,
	RepositoryObjectSchema,
	RepositorySchema,
	RequiredToolSchema,
	SemverRangeSchema,
	SemverSchema,
	safeParsePackageJson,
	validatePackageJson,
	WorkflowExportMetadataSchema,
	WorkflowPackageJsonSchema,
	WorkflowsSchema,
} from "./schemas.js";

describe("PackageNameSchema", () => {
	describe("valid package names", () => {
		it("should accept simple lowercase names", () => {
			expect(PackageNameSchema.safeParse("my-package").success).toBe(true);
			expect(PackageNameSchema.safeParse("mypackage").success).toBe(true);
			expect(PackageNameSchema.safeParse("my_package").success).toBe(true);
			expect(PackageNameSchema.safeParse("my.package").success).toBe(true);
		});

		it("should accept scoped package names", () => {
			expect(PackageNameSchema.safeParse("@myorg/my-package").success).toBe(
				true,
			);
			expect(PackageNameSchema.safeParse("@scope/package").success).toBe(true);
			expect(PackageNameSchema.safeParse("@my-org/my-pkg").success).toBe(true);
		});

		it("should accept names with numbers", () => {
			expect(PackageNameSchema.safeParse("package123").success).toBe(true);
			expect(PackageNameSchema.safeParse("1-package").success).toBe(true);
			expect(PackageNameSchema.safeParse("@org/pkg123").success).toBe(true);
		});
	});

	describe("invalid package names", () => {
		it("should reject empty names", () => {
			const result = PackageNameSchema.safeParse("");
			expect(result.success).toBe(false);
		});

		it("should reject uppercase names", () => {
			const result = PackageNameSchema.safeParse("MyPackage");
			expect(result.success).toBe(false);
		});

		it("should reject names starting with a period", () => {
			const result = PackageNameSchema.safeParse(".mypackage");
			expect(result.success).toBe(false);
		});

		it("should reject names starting with underscore", () => {
			const result = PackageNameSchema.safeParse("_mypackage");
			expect(result.success).toBe(false);
		});

		it("should reject names with spaces", () => {
			const result = PackageNameSchema.safeParse("my package");
			expect(result.success).toBe(false);
		});

		it("should reject names exceeding 214 characters", () => {
			const longName = "a".repeat(215);
			const result = PackageNameSchema.safeParse(longName);
			expect(result.success).toBe(false);
		});
	});
});

describe("SemverSchema", () => {
	describe("valid semver versions", () => {
		it("should accept basic versions", () => {
			expect(SemverSchema.safeParse("1.0.0").success).toBe(true);
			expect(SemverSchema.safeParse("0.0.1").success).toBe(true);
			expect(SemverSchema.safeParse("10.20.30").success).toBe(true);
		});

		it("should accept pre-release versions", () => {
			expect(SemverSchema.safeParse("1.0.0-alpha").success).toBe(true);
			expect(SemverSchema.safeParse("1.0.0-beta.1").success).toBe(true);
			expect(SemverSchema.safeParse("1.0.0-rc.2").success).toBe(true);
			expect(SemverSchema.safeParse("2.1.0-alpha.beta").success).toBe(true);
		});

		it("should accept build metadata", () => {
			expect(SemverSchema.safeParse("1.0.0+build.123").success).toBe(true);
			expect(SemverSchema.safeParse("1.0.0+20130313144700").success).toBe(true);
		});

		it("should accept combined pre-release and build metadata", () => {
			expect(SemverSchema.safeParse("1.0.0-alpha.1+build.456").success).toBe(
				true,
			);
			expect(SemverSchema.safeParse("2.0.0-beta+exp.sha.5114f85").success).toBe(
				true,
			);
		});
	});

	describe("invalid semver versions", () => {
		it("should reject incomplete versions", () => {
			expect(SemverSchema.safeParse("1.0").success).toBe(false);
			expect(SemverSchema.safeParse("1").success).toBe(false);
		});

		it("should reject versions with v prefix", () => {
			expect(SemverSchema.safeParse("v1.0.0").success).toBe(false);
		});

		it("should reject versions with leading zeros", () => {
			expect(SemverSchema.safeParse("01.0.0").success).toBe(false);
			expect(SemverSchema.safeParse("1.01.0").success).toBe(false);
		});

		it("should reject non-numeric versions", () => {
			expect(SemverSchema.safeParse("a.b.c").success).toBe(false);
		});

		it("should reject empty strings", () => {
			expect(SemverSchema.safeParse("").success).toBe(false);
		});
	});
});

describe("SemverRangeSchema", () => {
	describe("valid semver ranges", () => {
		it("should accept exact versions", () => {
			expect(SemverRangeSchema.safeParse("1.0.0").success).toBe(true);
		});

		it("should accept caret ranges", () => {
			expect(SemverRangeSchema.safeParse("^1.0.0").success).toBe(true);
			expect(SemverRangeSchema.safeParse("^0.1.0").success).toBe(true);
		});

		it("should accept tilde ranges", () => {
			expect(SemverRangeSchema.safeParse("~1.0.0").success).toBe(true);
			expect(SemverRangeSchema.safeParse("~2.1.0").success).toBe(true);
		});

		it("should accept comparison ranges", () => {
			expect(SemverRangeSchema.safeParse(">=1.0.0").success).toBe(true);
			expect(SemverRangeSchema.safeParse(">1.0.0").success).toBe(true);
			expect(SemverRangeSchema.safeParse("<=2.0.0").success).toBe(true);
			expect(SemverRangeSchema.safeParse("<2.0.0").success).toBe(true);
		});

		it("should accept wildcard", () => {
			expect(SemverRangeSchema.safeParse("*").success).toBe(true);
		});

		it("should accept x-ranges", () => {
			expect(SemverRangeSchema.safeParse("1.x.x").success).toBe(true);
			expect(SemverRangeSchema.safeParse("1.0.x").success).toBe(true);
		});

		it("should accept hyphen ranges", () => {
			expect(SemverRangeSchema.safeParse("1.0.0 - 2.0.0").success).toBe(true);
		});
	});

	describe("invalid semver ranges", () => {
		it("should reject invalid ranges", () => {
			expect(SemverRangeSchema.safeParse("invalid").success).toBe(false);
			expect(SemverRangeSchema.safeParse("abc").success).toBe(false);
		});

		it("should reject empty strings", () => {
			expect(SemverRangeSchema.safeParse("").success).toBe(false);
		});
	});
});

describe("MainPathSchema", () => {
	describe("valid paths", () => {
		it("should accept relative paths with ./", () => {
			expect(MainPathSchema.safeParse("./src/index.ts").success).toBe(true);
			expect(MainPathSchema.safeParse("./workflow.ts").success).toBe(true);
		});

		it("should accept relative paths without ./", () => {
			expect(MainPathSchema.safeParse("index.ts").success).toBe(true);
			expect(MainPathSchema.safeParse("src/workflow.ts").success).toBe(true);
		});
	});

	describe("invalid paths", () => {
		it("should reject absolute paths", () => {
			const result = MainPathSchema.safeParse("/absolute/path.ts");
			expect(result.success).toBe(false);
		});

		it("should reject empty paths", () => {
			const result = MainPathSchema.safeParse("");
			expect(result.success).toBe(false);
		});
	});
});

describe("AuthorObjectSchema", () => {
	it("should accept author with only name", () => {
		const result = AuthorObjectSchema.safeParse({ name: "John Doe" });
		expect(result.success).toBe(true);
	});

	it("should accept author with all fields", () => {
		const result = AuthorObjectSchema.safeParse({
			name: "John Doe",
			email: "john@example.com",
			url: "https://example.com",
		});
		expect(result.success).toBe(true);
	});

	it("should reject empty name", () => {
		const result = AuthorObjectSchema.safeParse({ name: "" });
		expect(result.success).toBe(false);
	});

	it("should reject invalid email", () => {
		const result = AuthorObjectSchema.safeParse({
			name: "John Doe",
			email: "invalid-email",
		});
		expect(result.success).toBe(false);
	});

	it("should reject invalid URL", () => {
		const result = AuthorObjectSchema.safeParse({
			name: "John Doe",
			url: "not-a-url",
		});
		expect(result.success).toBe(false);
	});
});

describe("AuthorSchema", () => {
	it("should accept string author", () => {
		const result = AuthorSchema.safeParse("John Doe");
		expect(result.success).toBe(true);
	});

	it("should accept object author", () => {
		const result = AuthorSchema.safeParse({
			name: "John Doe",
			email: "john@example.com",
		});
		expect(result.success).toBe(true);
	});

	it("should reject empty string", () => {
		const result = AuthorSchema.safeParse("");
		expect(result.success).toBe(false);
	});
});

describe("RepositoryObjectSchema", () => {
	it("should accept valid repository object", () => {
		const result = RepositoryObjectSchema.safeParse({
			type: "git",
			url: "https://github.com/org/repo.git",
		});
		expect(result.success).toBe(true);
	});

	it("should reject empty type", () => {
		const result = RepositoryObjectSchema.safeParse({
			type: "",
			url: "https://github.com/org/repo.git",
		});
		expect(result.success).toBe(false);
	});

	it("should reject empty URL", () => {
		const result = RepositoryObjectSchema.safeParse({
			type: "git",
			url: "",
		});
		expect(result.success).toBe(false);
	});
});

describe("RepositorySchema", () => {
	it("should accept URL string", () => {
		const result = RepositorySchema.safeParse("https://github.com/org/repo");
		expect(result.success).toBe(true);
	});

	it("should accept repository object", () => {
		const result = RepositorySchema.safeParse({
			type: "git",
			url: "https://github.com/org/repo.git",
		});
		expect(result.success).toBe(true);
	});

	it("should reject invalid URL string", () => {
		const result = RepositorySchema.safeParse("not-a-url");
		expect(result.success).toBe(false);
	});
});

describe("WorkflowExportMetadataSchema", () => {
	it("should accept valid metadata with description", () => {
		const result = WorkflowExportMetadataSchema.safeParse({
			description: "A workflow for deployment",
		});
		expect(result.success).toBe(true);
	});

	it("should accept metadata with tags", () => {
		const result = WorkflowExportMetadataSchema.safeParse({
			description: "A workflow for deployment",
			tags: ["deploy", "ci-cd"],
		});
		expect(result.success).toBe(true);
	});

	it("should reject empty description", () => {
		const result = WorkflowExportMetadataSchema.safeParse({
			description: "",
		});
		expect(result.success).toBe(false);
	});

	it("should reject missing description", () => {
		const result = WorkflowExportMetadataSchema.safeParse({
			tags: ["deploy"],
		});
		expect(result.success).toBe(false);
	});
});

describe("WorkflowsSchema", () => {
	it("should accept valid workflows record", () => {
		const result = WorkflowsSchema.safeParse({
			default: { description: "Default workflow" },
			deploy: { description: "Deployment workflow", tags: ["deploy"] },
		});
		expect(result.success).toBe(true);
	});

	it("should accept empty record", () => {
		const result = WorkflowsSchema.safeParse({});
		expect(result.success).toBe(true);
	});

	it("should reject invalid workflow metadata", () => {
		const result = WorkflowsSchema.safeParse({
			default: { description: "" },
		});
		expect(result.success).toBe(false);
	});
});

describe("DependenciesSchema", () => {
	it("should accept valid dependencies", () => {
		const result = DependenciesSchema.safeParse({
			"my-package": "^1.0.0",
			"@org/other-package": "~2.0.0",
		});
		expect(result.success).toBe(true);
	});

	it("should accept empty dependencies", () => {
		const result = DependenciesSchema.safeParse({});
		expect(result.success).toBe(true);
	});

	it("should reject invalid package name", () => {
		const result = DependenciesSchema.safeParse({
			InvalidName: "^1.0.0",
		});
		expect(result.success).toBe(false);
	});

	it("should reject invalid version range", () => {
		const result = DependenciesSchema.safeParse({
			"my-package": "invalid",
		});
		expect(result.success).toBe(false);
	});
});

describe("RequiredToolSchema", () => {
	it("should accept valid tools", () => {
		expect(RequiredToolSchema.safeParse("tmux").success).toBe(true);
		expect(RequiredToolSchema.safeParse("git").success).toBe(true);
		expect(RequiredToolSchema.safeParse("docker").success).toBe(true);
	});

	it("should reject invalid tools", () => {
		expect(RequiredToolSchema.safeParse("npm").success).toBe(false);
		expect(RequiredToolSchema.safeParse("unknown").success).toBe(false);
	});
});

describe("ClaudeOrchestratorConfigSchema", () => {
	it("should accept empty config", () => {
		const result = ClaudeOrchestratorConfigSchema.safeParse({});
		expect(result.success).toBe(true);
	});

	it("should accept config with minVersion", () => {
		const result = ClaudeOrchestratorConfigSchema.safeParse({
			minVersion: "0.5.0",
		});
		expect(result.success).toBe(true);
	});

	it("should accept config with requires", () => {
		const result = ClaudeOrchestratorConfigSchema.safeParse({
			requires: ["git", "docker"],
		});
		expect(result.success).toBe(true);
	});

	it("should accept config with all fields", () => {
		const result = ClaudeOrchestratorConfigSchema.safeParse({
			minVersion: "1.0.0",
			requires: ["git", "tmux", "docker"],
		});
		expect(result.success).toBe(true);
	});

	it("should reject invalid minVersion", () => {
		const result = ClaudeOrchestratorConfigSchema.safeParse({
			minVersion: "invalid",
		});
		expect(result.success).toBe(false);
	});

	it("should reject invalid requires tool", () => {
		const result = ClaudeOrchestratorConfigSchema.safeParse({
			requires: ["invalid-tool"],
		});
		expect(result.success).toBe(false);
	});
});

describe("WorkflowPackageJsonSchema", () => {
	const validPackageJson = {
		name: "my-workflow",
		version: "1.0.0",
		main: "./src/index.ts",
	};

	describe("required fields", () => {
		it("should accept minimal valid package.json", () => {
			const result = WorkflowPackageJsonSchema.safeParse(validPackageJson);
			expect(result.success).toBe(true);
		});

		it("should reject missing name", () => {
			const { name, ...rest } = validPackageJson;
			const result = WorkflowPackageJsonSchema.safeParse(rest);
			expect(result.success).toBe(false);
		});

		it("should reject missing version", () => {
			const { version, ...rest } = validPackageJson;
			const result = WorkflowPackageJsonSchema.safeParse(rest);
			expect(result.success).toBe(false);
		});

		it("should reject missing main", () => {
			const { main, ...rest } = validPackageJson;
			const result = WorkflowPackageJsonSchema.safeParse(rest);
			expect(result.success).toBe(false);
		});
	});

	describe("optional fields", () => {
		it("should accept description", () => {
			const result = WorkflowPackageJsonSchema.safeParse({
				...validPackageJson,
				description: "A workflow package",
			});
			expect(result.success).toBe(true);
		});

		it("should accept author as string", () => {
			const result = WorkflowPackageJsonSchema.safeParse({
				...validPackageJson,
				author: "John Doe",
			});
			expect(result.success).toBe(true);
		});

		it("should accept author as object", () => {
			const result = WorkflowPackageJsonSchema.safeParse({
				...validPackageJson,
				author: { name: "John Doe", email: "john@example.com" },
			});
			expect(result.success).toBe(true);
		});

		it("should accept repository as string", () => {
			const result = WorkflowPackageJsonSchema.safeParse({
				...validPackageJson,
				repository: "https://github.com/org/repo",
			});
			expect(result.success).toBe(true);
		});

		it("should accept repository as object", () => {
			const result = WorkflowPackageJsonSchema.safeParse({
				...validPackageJson,
				repository: { type: "git", url: "https://github.com/org/repo.git" },
			});
			expect(result.success).toBe(true);
		});

		it("should accept keywords", () => {
			const result = WorkflowPackageJsonSchema.safeParse({
				...validPackageJson,
				keywords: ["deploy", "ci-cd"],
			});
			expect(result.success).toBe(true);
		});

		it("should accept license", () => {
			const result = WorkflowPackageJsonSchema.safeParse({
				...validPackageJson,
				license: "MIT",
			});
			expect(result.success).toBe(true);
		});

		it("should accept workflows", () => {
			const result = WorkflowPackageJsonSchema.safeParse({
				...validPackageJson,
				workflows: {
					default: { description: "Default workflow" },
					deploy: { description: "Deploy workflow", tags: ["deploy"] },
				},
			});
			expect(result.success).toBe(true);
		});

		it("should accept dependencies", () => {
			const result = WorkflowPackageJsonSchema.safeParse({
				...validPackageJson,
				dependencies: {
					"other-workflow": "^1.0.0",
					"@org/shared": "~2.0.0",
				},
			});
			expect(result.success).toBe(true);
		});

		it("should accept claude-orchestrator config", () => {
			const result = WorkflowPackageJsonSchema.safeParse({
				...validPackageJson,
				"claude-orchestrator": {
					minVersion: "0.5.0",
					requires: ["git", "docker"],
				},
			});
			expect(result.success).toBe(true);
		});
	});

	describe("full package.json", () => {
		it("should accept fully populated package.json", () => {
			const fullPackageJson = {
				name: "@myorg/deploy-workflow",
				version: "2.1.0-beta.1",
				main: "./src/workflow.ts",
				description: "Automated deployment workflow",
				author: {
					name: "John Doe",
					email: "john@example.com",
					url: "https://johndoe.com",
				},
				repository: {
					type: "git",
					url: "https://github.com/myorg/deploy-workflow.git",
				},
				keywords: ["deploy", "ci-cd", "automation"],
				license: "MIT",
				workflows: {
					default: { description: "Main deployment workflow" },
					rollback: { description: "Rollback deployment", tags: ["recovery"] },
				},
				dependencies: {
					"@myorg/notify-workflow": "^2.0.0",
					"shared-utils": "~1.0.0",
				},
				"claude-orchestrator": {
					minVersion: "0.5.0",
					requires: ["git", "docker"],
				},
			};

			const result = WorkflowPackageJsonSchema.safeParse(fullPackageJson);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.name).toBe("@myorg/deploy-workflow");
				expect(result.data.version).toBe("2.1.0-beta.1");
				expect(result.data.workflows?.default.description).toBe(
					"Main deployment workflow",
				);
			}
		});
	});
});

describe("isValidSemver", () => {
	it("should return true for valid semver", () => {
		expect(isValidSemver("1.0.0")).toBe(true);
		expect(isValidSemver("2.1.0-beta.1")).toBe(true);
		expect(isValidSemver("1.0.0+build.123")).toBe(true);
	});

	it("should return false for invalid semver", () => {
		expect(isValidSemver("1.0")).toBe(false);
		expect(isValidSemver("v1.0.0")).toBe(false);
		expect(isValidSemver("invalid")).toBe(false);
	});
});

describe("isValidSemverRange", () => {
	it("should return true for valid semver ranges", () => {
		expect(isValidSemverRange("^1.0.0")).toBe(true);
		expect(isValidSemverRange("~2.1.0")).toBe(true);
		expect(isValidSemverRange(">=1.0.0")).toBe(true);
		expect(isValidSemverRange("*")).toBe(true);
	});

	it("should return false for invalid semver ranges", () => {
		expect(isValidSemverRange("invalid")).toBe(false);
		expect(isValidSemverRange("")).toBe(false);
	});
});

describe("isValidPackageName", () => {
	it("should return true for valid package names", () => {
		expect(isValidPackageName("my-package")).toBe(true);
		expect(isValidPackageName("@org/my-package")).toBe(true);
		expect(isValidPackageName("package123")).toBe(true);
	});

	it("should return false for invalid package names", () => {
		expect(isValidPackageName("")).toBe(false);
		expect(isValidPackageName("MyPackage")).toBe(false);
		expect(isValidPackageName("_private")).toBe(false);
		expect(isValidPackageName(".hidden")).toBe(false);
	});

	it("should return false for names exceeding 214 characters", () => {
		const longName = "a".repeat(215);
		expect(isValidPackageName(longName)).toBe(false);
	});
});

describe("validatePackageJson", () => {
	const validPackageJson = {
		name: "my-workflow",
		version: "1.0.0",
		main: "./src/index.ts",
	};

	it("should return Ok for valid package.json", () => {
		const result = validatePackageJson(validPackageJson);
		expect(result.isOk()).toBe(true);
		if (result.isOk()) {
			const data = result.unwrap();
			expect(data.name).toBe("my-workflow");
			expect(data.version).toBe("1.0.0");
			expect(data.main).toBe("./src/index.ts");
		}
	});

	it("should return Err with INVALID_NAME for invalid name", () => {
		const result = validatePackageJson({
			...validPackageJson,
			name: "InvalidName",
		});
		expect(result.isErr()).toBe(true);
		if (result.isErr()) {
			const errors = result.unwrapErr();
			expect(errors.some((e) => e.code === "INVALID_NAME")).toBe(true);
		}
	});

	it("should return Err with INVALID_VERSION for invalid version", () => {
		const result = validatePackageJson({
			...validPackageJson,
			version: "1.0",
		});
		expect(result.isErr()).toBe(true);
		if (result.isErr()) {
			const errors = result.unwrapErr();
			expect(errors.some((e) => e.code === "INVALID_VERSION")).toBe(true);
		}
	});

	it("should return Err with INVALID_MAIN_PATH for absolute path", () => {
		const result = validatePackageJson({
			...validPackageJson,
			main: "/absolute/path.ts",
		});
		expect(result.isErr()).toBe(true);
		if (result.isErr()) {
			const errors = result.unwrapErr();
			expect(errors.some((e) => e.code === "INVALID_MAIN_PATH")).toBe(true);
		}
	});

	it("should return Err with MISSING_REQUIRED_FIELD for missing fields", () => {
		const result = validatePackageJson({ name: "my-workflow" });
		expect(result.isErr()).toBe(true);
		if (result.isErr()) {
			const errors = result.unwrapErr();
			expect(errors.length).toBeGreaterThan(0);
		}
	});

	it("should return Err with INVALID_DEPENDENCY for invalid dependency version", () => {
		const result = validatePackageJson({
			...validPackageJson,
			dependencies: {
				"other-pkg": "invalid-version",
			},
		});
		expect(result.isErr()).toBe(true);
		if (result.isErr()) {
			const errors = result.unwrapErr();
			expect(errors.some((e) => e.code === "INVALID_DEPENDENCY")).toBe(true);
		}
	});

	it("should return Err with INVALID_JSON for non-object input", () => {
		const result = validatePackageJson("not an object");
		expect(result.isErr()).toBe(true);
		if (result.isErr()) {
			const errors = result.unwrapErr();
			expect(errors.some((e) => e.code === "INVALID_JSON")).toBe(true);
		}
	});

	it("should return Err with INVALID_JSON for null input", () => {
		const result = validatePackageJson(null);
		expect(result.isErr()).toBe(true);
		if (result.isErr()) {
			const errors = result.unwrapErr();
			expect(errors.some((e) => e.code === "INVALID_JSON")).toBe(true);
		}
	});
});

describe("safeParsePackageJson", () => {
	const validJson = JSON.stringify({
		name: "my-workflow",
		version: "1.0.0",
		main: "./src/index.ts",
	});

	it("should return Ok for valid JSON", () => {
		const result = safeParsePackageJson(validJson);
		expect(result.isOk()).toBe(true);
		if (result.isOk()) {
			const data = result.unwrap();
			expect(data.name).toBe("my-workflow");
		}
	});

	it("should return Err with INVALID_JSON for invalid JSON syntax", () => {
		const result = safeParsePackageJson("{ invalid json }");
		expect(result.isErr()).toBe(true);
		if (result.isErr()) {
			const errors = result.unwrapErr();
			expect(errors.length).toBe(1);
			expect(errors[0].code).toBe("INVALID_JSON");
			expect(errors[0].message).toContain("Failed to parse package.json");
		}
	});

	it("should return Err for valid JSON but invalid schema", () => {
		const invalidPackageJson = JSON.stringify({
			name: "InvalidName",
			version: "1.0.0",
			main: "./src/index.ts",
		});
		const result = safeParsePackageJson(invalidPackageJson);
		expect(result.isErr()).toBe(true);
		if (result.isErr()) {
			const errors = result.unwrapErr();
			expect(errors.some((e) => e.code === "INVALID_NAME")).toBe(true);
		}
	});

	it("should return Err for empty string", () => {
		const result = safeParsePackageJson("");
		expect(result.isErr()).toBe(true);
		if (result.isErr()) {
			const errors = result.unwrapErr();
			expect(errors[0].code).toBe("INVALID_JSON");
		}
	});
});
