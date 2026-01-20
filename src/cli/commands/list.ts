/**
 * List command for marketplace packages.
 *
 * Displays installed workflow packages with version and update information.
 * Supports both project-local and global installation scopes.
 */

import { resolve } from "node:path";
import {
	createInstallationService,
	getProjectInstallDir,
	getGlobalInstallDir,
	type ListOptions as ServiceListOptions,
	type ListResult,
	type InstalledPackage,
	type PackageWithUpdate,
} from "../../core/marketplace/index.ts";

/**
 * Options for the list command.
 */
export interface ListOptions {
	/** List packages from global location (~/.cw/workflows/) instead of project */
	global?: boolean;

	/** List packages from both project and global locations */
	all?: boolean;

	/** Show only packages with available updates */
	outdated?: boolean;

	/** Output in JSON format */
	json?: boolean;

	/** Enable verbose output */
	verbose?: boolean;
}

/**
 * Type guard to check if a package has update information.
 *
 * @param pkg - Package to check
 * @returns True if the package has update information
 */
function isPackageWithUpdate(
	pkg: InstalledPackage | PackageWithUpdate,
): pkg is PackageWithUpdate {
	return "updateAvailable" in pkg;
}

/**
 * List installed workflow packages.
 *
 * Supports listing project-local, global, or all packages.
 * Use --outdated to show only packages with available updates.
 * Use --json to output in JSON format for scripting.
 *
 * @param options - List options
 *
 * @example
 * ```typescript
 * // List project packages
 * await listPackages();
 *
 * // List global packages
 * await listPackages({ global: true });
 *
 * // List all packages with outdated detection
 * await listPackages({ all: true, outdated: true });
 *
 * // Output as JSON
 * await listPackages({ json: true });
 * ```
 */
export async function listPackages(options: ListOptions = {}): Promise<void> {
	const {
		verbose,
		global: isGlobal,
		all,
		outdated,
		json: jsonOutput,
	} = options;
	const projectPath = resolve(".");

	// Create installation service
	const installer = createInstallationService({
		projectDir: getProjectInstallDir(projectPath),
		globalDir: getGlobalInstallDir(),
		tempDir: resolve(projectPath, ".cw", "tmp"),
	});

	// Log what we're doing (skip for JSON output)
	if (verbose && !jsonOutput) {
		const scopeLabel = all ? "all scopes" : isGlobal ? "global" : "project";
		console.log(`Listing packages from ${scopeLabel}...`);
		if (outdated) {
			console.log("Checking for available updates...");
		}
	}

	// Build service options
	const serviceOptions: ServiceListOptions = {
		global: isGlobal,
		all,
		outdated,
		verbose,
	};

	// Perform list operation
	const result = await installer.list(serviceOptions);

	if (result.isErr()) {
		const error = result.unwrapErr();
		if (jsonOutput) {
			console.log(
				JSON.stringify(
					{
						success: false,
						error: {
							code: error.code,
							message: error.message,
							suggestion: error.suggestion,
						},
					},
					null,
					2,
				),
			);
		} else {
			console.error(`\nFailed to list packages: ${error.message}`);
			if (error.suggestion) {
				console.error(`Suggestion: ${error.suggestion}`);
			}
		}
		process.exit(1);
	}

	const listResult: ListResult = result.unwrap();

	// JSON output mode
	if (jsonOutput) {
		const output = {
			success: true,
			scope: listResult.scope,
			packages: listResult.packages.map((pkg) => ({
				name: pkg.name,
				version: pkg.version,
				path: pkg.path,
				scope: pkg.scope,
				isDependency: pkg.isDependency,
				description: pkg.description,
				...(isPackageWithUpdate(pkg)
					? {
							latestVersion: pkg.latestVersion,
							updateAvailable: pkg.updateAvailable,
						}
					: {}),
			})),
			total: listResult.packages.length,
		};
		console.log(JSON.stringify(output, null, 2));
		return;
	}

	// No packages found
	if (listResult.packages.length === 0) {
		const scopeLabel = all
			? "any scope"
			: isGlobal
				? "global scope"
				: "project scope";
		if (outdated) {
			console.log(`\nNo outdated packages found in ${scopeLabel}.`);
		} else {
			console.log(`\nNo packages installed in ${scopeLabel}.`);
			console.log("\nTo install a package, run:");
			console.log("  cw install <package-name>");
		}
		return;
	}

	// Filter to outdated packages if requested
	let packagesToShow = listResult.packages;
	if (outdated) {
		packagesToShow = packagesToShow.filter(
			(pkg) => isPackageWithUpdate(pkg) && pkg.updateAvailable,
		);

		if (packagesToShow.length === 0) {
			console.log("\nAll packages are up to date.");
			return;
		}
	}

	// Display header
	const scopeLabel =
		listResult.scope === "all"
			? "All"
			: listResult.scope === "global"
				? "Global"
				: "Project";

	if (outdated) {
		console.log(`\n${scopeLabel} packages with available updates:`);
	} else {
		console.log(`\n${scopeLabel} packages:`);
	}

	// Display packages
	for (const pkg of packagesToShow) {
		printPackage(pkg, verbose);
	}

	// Summary
	const totalCount = packagesToShow.length;
	const depCount = packagesToShow.filter((p) => p.isDependency).length;
	const mainCount = totalCount - depCount;

	if (outdated) {
		console.log(`\n${totalCount} package(s) can be updated.`);
		console.log("Run 'cw update <name>' to update a specific package.");
		console.log("Run 'cw update --all' to update all packages.");
	} else if (depCount > 0) {
		console.log(
			`\n${mainCount} package(s), ${depCount} dependenc${depCount === 1 ? "y" : "ies"}.`,
		);
	} else {
		console.log(`\n${totalCount} package(s).`);
	}
}

/**
 * Print information about a package.
 *
 * @param pkg - Installed package information
 * @param verbose - Whether to include extra details
 */
function printPackage(
	pkg: InstalledPackage | PackageWithUpdate,
	verbose?: boolean,
): void {
	const depMarker = pkg.isDependency ? " (dependency)" : "";

	// Show update info if available
	if (isPackageWithUpdate(pkg) && pkg.updateAvailable && pkg.latestVersion) {
		console.log(
			`  ${pkg.name}@${pkg.version} -> ${pkg.latestVersion} available${depMarker}`,
		);
	} else {
		console.log(`  ${pkg.name}@${pkg.version}${depMarker}`);
	}

	if (verbose) {
		console.log(`    Path: ${pkg.path}`);
		console.log(`    Scope: ${pkg.scope}`);
		if (pkg.description) {
			console.log(`    Description: ${pkg.description}`);
		}
		if (isPackageWithUpdate(pkg) && pkg.latestVersion && !pkg.updateAvailable) {
			console.log(`    Status: Up to date (latest: ${pkg.latestVersion})`);
		}
	}
}
