/**
 * Install command for marketplace packages.
 *
 * Installs workflow packages from the central registry or git URLs.
 * Supports both project-local and global installation scopes.
 */

import { resolve } from "node:path";
import {
	createInstallationService,
	getProjectInstallDir,
	getGlobalInstallDir,
	type InstallOptions as ServiceInstallOptions,
	type InstallResult,
	type InstalledPackage,
} from "../../core/marketplace/index.ts";

/**
 * Options for the install command.
 */
export interface InstallOptions {
	/** Install to global location (~/.cw/workflows/) instead of project */
	global?: boolean;

	/** Skip dependency installation */
	noDeps?: boolean;

	/** Force reinstall even if package already exists */
	force?: boolean;

	/** Enable verbose output */
	verbose?: boolean;
}

/**
 * Install workflow packages from registry or git URLs.
 *
 * Supports the following source formats:
 * - `"my-workflow"` - lookup in registry, install latest
 * - `"my-workflow@1.0.0"` - install specific version
 * - `"my-workflow@^1.0.0"` - install latest matching range
 * - `"git:github.com/user/workflow"` - install from git
 * - `"git:github.com/user/workflow#v1.0.0"` - install specific ref
 *
 * @param sources - Package sources to install
 * @param options - Installation options
 *
 * @example
 * ```typescript
 * // Install from registry
 * await installPackages(['code-review@1.0.0'], { verbose: true });
 *
 * // Install from git with global scope
 * await installPackages(['git:github.com/user/workflow'], { global: true });
 * ```
 */
export async function installPackages(
	sources: string[],
	options: InstallOptions = {},
): Promise<void> {
	const { verbose, global: isGlobal, noDeps, force } = options;
	const projectPath = resolve(".");

	// Create installation service
	const installer = createInstallationService({
		projectDir: getProjectInstallDir(projectPath),
		globalDir: getGlobalInstallDir(),
		tempDir: resolve(projectPath, ".cw", "tmp"),
	});

	// Log what we're doing
	if (verbose) {
		const scope = isGlobal ? "global" : "project";
		console.log(`Installing packages to ${scope} scope...`);
		console.log(`Sources: ${sources.join(", ")}`);
	}

	// Build service options
	const serviceOptions: ServiceInstallOptions = {
		global: isGlobal,
		noDeps,
		force,
		verbose,
	};

	// Perform installation
	const result = await installer.install(sources, serviceOptions);

	if (result.isErr()) {
		const error = result.unwrapErr();
		console.error(`\nInstallation failed: ${error.message}`);
		if (error.suggestion) {
			console.error(`Suggestion: ${error.suggestion}`);
		}
		process.exit(1);
	}

	const installResult: InstallResult = result.unwrap();

	// Handle partial success (some packages installed, some failed)
	if (!installResult.success) {
		console.error("\nInstallation completed with errors:");

		for (const error of installResult.errors) {
			console.error(`  - ${error.package ?? "unknown"}: ${error.message}`);
			if (error.suggestion) {
				console.error(`    Suggestion: ${error.suggestion}`);
			}
		}

		// Show what was installed before failure (if anything)
		if (installResult.installed.length > 0) {
			console.log("\nPackages installed before failure:");
			for (const pkg of installResult.installed) {
				printInstalledPackage(pkg, verbose);
			}
		}

		process.exit(1);
	}

	// Success output
	if (installResult.installed.length === 0) {
		console.log("No packages were installed.");
		return;
	}

	console.log("\nSuccessfully installed:");
	for (const pkg of installResult.installed) {
		printInstalledPackage(pkg, verbose);
	}

	// Summary
	const mainPackages = installResult.installed.filter((p) => !p.isDependency);
	const dependencies = installResult.installed.filter((p) => p.isDependency);

	if (dependencies.length > 0) {
		console.log(
			`\nInstalled ${mainPackages.length} package(s) and ${dependencies.length} dependency(ies).`,
		);
	}
}

/**
 * Print information about an installed package.
 *
 * @param pkg - Installed package information
 * @param verbose - Whether to include extra details
 */
function printInstalledPackage(pkg: InstalledPackage, verbose?: boolean): void {
	const depMarker = pkg.isDependency ? " (dependency)" : "";
	console.log(`  ${pkg.name}@${pkg.version}${depMarker}`);

	if (verbose) {
		console.log(`    Path: ${pkg.path}`);
		console.log(`    Scope: ${pkg.scope}`);
		if (pkg.description) {
			console.log(`    Description: ${pkg.description}`);
		}
	}
}
