/**
 * Uninstall command for marketplace packages.
 *
 * Removes workflow packages from the project or global location.
 * Supports checking for dependent packages and force removal.
 */

import { resolve } from "node:path";
import {
	createInstallationService,
	getProjectInstallDir,
	getGlobalInstallDir,
	type UninstallOptions as ServiceUninstallOptions,
	type UninstallResult,
} from "../../core/marketplace/index.ts";

/**
 * Options for the uninstall command.
 */
export interface UninstallOptions {
	/** Uninstall from global location (~/.cw/workflows/) instead of project */
	global?: boolean;

	/** Force uninstall even if other packages depend on this one */
	force?: boolean;

	/** Enable verbose output */
	verbose?: boolean;
}

/**
 * Uninstall workflow packages.
 *
 * Removes packages from the project-local or global installation directory.
 * By default, warns if other packages depend on the target package.
 *
 * @param names - Package names to uninstall
 * @param options - Uninstall options
 *
 * @example
 * ```typescript
 * // Uninstall from project
 * await uninstallPackages(['code-review']);
 *
 * // Force uninstall from global
 * await uninstallPackages(['my-workflow'], { global: true, force: true });
 * ```
 */
export async function uninstallPackages(
	names: string[],
	options: UninstallOptions = {},
): Promise<void> {
	const { verbose, global: isGlobal, force } = options;
	const projectPath = resolve(".");

	// Validate input
	if (names.length === 0) {
		console.error("Error: No package names provided.");
		console.error("\nUsage: cw uninstall <name> [name...]");
		process.exit(1);
	}

	// Create installation service
	const installer = createInstallationService({
		projectDir: getProjectInstallDir(projectPath),
		globalDir: getGlobalInstallDir(),
		tempDir: resolve(projectPath, ".cw", "tmp"),
	});

	// Log what we're doing
	if (verbose) {
		const scope = isGlobal ? "global" : "project";
		console.log(`Uninstalling packages from ${scope} scope...`);
		console.log(`Packages: ${names.join(", ")}`);
	}

	// Build service options
	const serviceOptions: ServiceUninstallOptions = {
		global: isGlobal,
		force,
		verbose,
	};

	// Perform uninstallation
	const result = await installer.uninstall(names, serviceOptions);

	if (result.isErr()) {
		const error = result.unwrapErr();
		console.error(`\nUninstall failed: ${error.message}`);
		if (error.suggestion) {
			console.error(`Suggestion: ${error.suggestion}`);
		}
		process.exit(1);
	}

	const uninstallResult: UninstallResult = result.unwrap();

	// Handle partial success or failures
	if (!uninstallResult.success) {
		console.error("\nUninstall completed with errors:");

		for (const error of uninstallResult.errors) {
			console.error(`  - ${error.package ?? "unknown"}: ${error.message}`);
			if (error.suggestion) {
				console.error(`    Suggestion: ${error.suggestion}`);
			}
		}

		// Show what was uninstalled before failure (if anything)
		if (uninstallResult.uninstalled.length > 0) {
			console.log("\nPackages uninstalled before failure:");
			for (const pkg of uninstallResult.uninstalled) {
				console.log(`  - ${pkg}`);
			}
		}

		process.exit(1);
	}

	// Show warnings if any
	if (uninstallResult.warnings.length > 0) {
		console.log("\nWarnings:");
		for (const warning of uninstallResult.warnings) {
			console.log(`  ⚠ ${warning}`);
		}
	}

	// Success output
	if (uninstallResult.uninstalled.length === 0) {
		console.log("No packages were uninstalled.");
		return;
	}

	console.log("\nSuccessfully uninstalled:");
	for (const pkg of uninstallResult.uninstalled) {
		console.log(`  - ${pkg}`);
	}

	// Summary
	const scope = isGlobal ? "global" : "project";
	console.log(
		`\nRemoved ${uninstallResult.uninstalled.length} package(s) from ${scope} scope.`,
	);
}
