/**
 * Update command for marketplace packages.
 *
 * Updates workflow packages to newer versions.
 * Supports both project-local and global scopes with dry-run mode.
 */

import { resolve } from "node:path";
import {
	createInstallationService,
	getProjectInstallDir,
	getGlobalInstallDir,
	type UpdateOptions as ServiceUpdateOptions,
	type UpdateResult,
	type PendingUpdate,
} from "../../core/marketplace/index.ts";

/**
 * Options for the update command.
 */
export interface UpdateOptions {
	/** Update all installed packages */
	all?: boolean;

	/** Update from global location (~/.cw/workflows/) instead of project */
	global?: boolean;

	/** Show what would be updated without making changes */
	dryRun?: boolean;

	/** Enable verbose output */
	verbose?: boolean;
}

/**
 * Update workflow packages to newer versions.
 *
 * Supports updating specific packages or all installed packages.
 * Use --dry-run to preview updates without making changes.
 *
 * @param names - Package names to update (empty with --all to update all)
 * @param options - Update options
 *
 * @example
 * ```typescript
 * // Update a specific package
 * await updatePackages(['code-review']);
 *
 * // Update all packages with dry-run
 * await updatePackages([], { all: true, dryRun: true });
 *
 * // Update to a specific version
 * await updatePackages(['code-review@2.0.0']);
 * ```
 */
export async function updatePackages(
	names: string[],
	options: UpdateOptions = {},
): Promise<void> {
	const { verbose, global: isGlobal, all, dryRun } = options;
	const projectPath = resolve(".");

	// Validate input: need either package names or --all flag
	if (names.length === 0 && !all) {
		console.error("Error: No package names provided.");
		console.error("\nUsage: cw update <name> [name...]");
		console.error("       cw update --all");
		console.error("\nOptions:");
		console.error("  --all       Update all installed packages");
		console.error("  --global    Update from global location");
		console.error("  --dry-run   Show what would be updated");
		process.exit(1);
	}

	// Create installation service
	const installer = createInstallationService({
		projectDir: getProjectInstallDir(projectPath),
		globalDir: getGlobalInstallDir(),
		tempDir: resolve(projectPath, ".cw", "tmp"),
	});

	// Log what we're doing
	const scope = isGlobal ? "global" : "project";
	if (dryRun) {
		console.log(`Checking for updates in ${scope} scope (dry-run)...`);
	} else if (verbose) {
		console.log(`Updating packages in ${scope} scope...`);
		if (all) {
			console.log("Updating all installed packages.");
		} else {
			console.log(`Packages: ${names.join(", ")}`);
		}
	}

	// Build service options
	const serviceOptions: ServiceUpdateOptions = {
		global: isGlobal,
		all,
		dryRun,
		verbose,
	};

	// Perform update
	const result = await installer.update(names, serviceOptions);

	if (result.isErr()) {
		const error = result.unwrapErr();
		console.error(`\nUpdate failed: ${error.message}`);
		if (error.suggestion) {
			console.error(`Suggestion: ${error.suggestion}`);
		}
		process.exit(1);
	}

	const updateResult: UpdateResult = result.unwrap();

	// Handle partial success or failures
	if (!updateResult.success) {
		console.error("\nUpdate completed with errors:");

		for (const error of updateResult.errors) {
			console.error(`  - ${error.package ?? "unknown"}: ${error.message}`);
			if (error.suggestion) {
				console.error(`    Suggestion: ${error.suggestion}`);
			}
		}

		// Show what was updated before failure (if anything)
		if (updateResult.updated.length > 0) {
			console.log("\nPackages updated before failure:");
			for (const pkg of updateResult.updated) {
				printUpdatedPackage(pkg, verbose, dryRun);
			}
		}

		process.exit(1);
	}

	// Dry-run output
	if (dryRun) {
		if (updateResult.updated.length === 0) {
			console.log("\nAll packages are up to date.");
			if (updateResult.skipped.length > 0 && verbose) {
				console.log("\nAlready at latest version:");
				for (const name of updateResult.skipped) {
					console.log(`  - ${name}`);
				}
			}
			return;
		}

		console.log("\nPackages that would be updated:");
		for (const pkg of updateResult.updated) {
			printUpdatedPackage(pkg, verbose, dryRun);
		}

		// Show skipped packages if any
		if (updateResult.skipped.length > 0 && verbose) {
			console.log("\nAlready at latest version:");
			for (const name of updateResult.skipped) {
				console.log(`  - ${name}`);
			}
		}

		console.log(`\nRun without --dry-run to perform the update.`);
		return;
	}

	// Success output
	if (updateResult.updated.length === 0) {
		console.log("\nAll packages are already up to date.");
		return;
	}

	console.log("\nSuccessfully updated:");
	for (const pkg of updateResult.updated) {
		printUpdatedPackage(pkg, verbose, dryRun);
	}

	// Show skipped packages if any
	if (updateResult.skipped.length > 0 && verbose) {
		console.log("\nAlready at latest version:");
		for (const name of updateResult.skipped) {
			console.log(`  - ${name}`);
		}
	}

	// Summary
	console.log(
		`\nUpdated ${updateResult.updated.length} package(s) in ${scope} scope.`,
	);
}

/**
 * Print information about an updated package.
 *
 * @param pkg - Pending update information
 * @param verbose - Whether to include extra details
 * @param dryRun - Whether this is a dry-run (changes output format)
 */
function printUpdatedPackage(
	pkg: PendingUpdate,
	verbose?: boolean,
	dryRun?: boolean,
): void {
	const arrow = dryRun ? "->" : "=>";
	console.log(`  ${pkg.name} ${pkg.currentVersion} ${arrow} ${pkg.newVersion}`);

	if (verbose) {
		console.log(`    Scope: ${pkg.scope}`);
	}
}
