#!/usr/bin/env bun
/**
 * Claude Workflow CLI - TypeScript/Bun workflow runner.
 */

import { Command } from "commander";
import { runWorkflow } from "./commands/run.ts";
import {
	installHooks,
	checkHooks,
	uninstallHooks,
	cleanupGlobalHooks,
} from "./commands/hooks.ts";
import { installPackages } from "./commands/install.ts";
import { uninstallPackages } from "./commands/uninstall.ts";
import { updatePackages } from "./commands/update.ts";
import { listPackages } from "./commands/list.ts";

const program = new Command();

program
	.name("claude-workflow")
	.description("Workflow runner for Claude Code")
	.version("1.0.0");

// Run command
program
	.command("run")
	.argument("[project-path]", "Path to project", ".")
	.option("-w, --workflow <name>", "Workflow name to run")
	.option("-v, --verbose", "Verbose output")
	.option("-c, --color", "Force color output (even in non-TTY)")
	.option("--json", "Use JSON renderer for structured output")
	.option("--debug", "Enable debug mode with enhanced logging")
	.option("--checkpoint", "Enable checkpointing for resumable execution")
	.option("--thread-id <id>", "Thread ID for checkpoint tracking (optional, uses latest if not provided)")
	.option("--resume", "Resume from existing checkpoint (uses latest thread ID if --thread-id not provided)")
	.description("Run a workflow in the specified project")
	.action(async (projectPath: string, options) => {
		await runWorkflow(projectPath, {
			workflow: options.workflow,
			verbose: options.verbose,
			color: options.color,
			json: options.json,
			debug: options.debug,
			checkpoint: options.checkpoint,
			threadId: options.threadId,
			resume: options.resume,
		});
	});

// Note: Removed default command to avoid conflict with "run" subcommand
// Users should use: cw run [project-path] -w <workflow>

// Hooks command group
const hooksCmd = program.command("hooks").description("Manage Claude hooks");

hooksCmd
	.command("install")
	.argument("<project-path>", "Path to the target project")
	.description("Install workflow hooks to project")
	.action((projectPath: string) => {
		installHooks(projectPath);
	});

hooksCmd
	.command("check")
	.argument("<project-path>", "Path to the target project")
	.description("Check if hooks are installed in project")
	.action((projectPath: string) => {
		checkHooks(projectPath);
	});

hooksCmd
	.command("uninstall")
	.argument("<project-path>", "Path to the target project")
	.description("Uninstall workflow hooks from project")
	.action((projectPath: string) => {
		uninstallHooks(projectPath);
	});

hooksCmd
	.command("cleanup-global")
	.description("Remove legacy global hooks from ~/.claude/hooks/")
	.action(() => {
		cleanupGlobalHooks();
	});

// Install command - install workflow packages
program
	.command("install")
	.argument(
		"<source...>",
		"Package source(s) to install (name, name@version, or git:url)",
	)
	.option("-g, --global", "Install to global location (~/.cw/workflows/)")
	.option("--no-deps", "Skip dependency installation")
	.option("-f, --force", "Force reinstall even if package exists")
	.option("-v, --verbose", "Enable verbose output")
	.description("Install workflow packages from registry or git URLs")
	.action(async (sources: string[], options) => {
		await installPackages(sources, {
			global: options.global,
			noDeps: options.deps === false,
			force: options.force,
			verbose: options.verbose,
		});
	});

// Uninstall command - remove workflow packages
program
	.command("uninstall")
	.argument("<name...>", "Package name(s) to uninstall")
	.option("-g, --global", "Uninstall from global location (~/.cw/workflows/)")
	.option(
		"-f, --force",
		"Force uninstall even if other packages depend on this one",
	)
	.option("-v, --verbose", "Enable verbose output")
	.description("Remove installed workflow packages")
	.action(async (names: string[], options) => {
		await uninstallPackages(names, {
			global: options.global,
			force: options.force,
			verbose: options.verbose,
		});
	});

// Update command - update workflow packages
program
	.command("update")
	.argument(
		"[name...]",
		"Package name(s) to update (or --all for all packages)",
	)
	.option("-a, --all", "Update all installed packages")
	.option("-g, --global", "Update from global location (~/.cw/workflows/)")
	.option("-n, --dry-run", "Show what would be updated without making changes")
	.option("-v, --verbose", "Enable verbose output")
	.description("Update installed workflow packages to newer versions")
	.action(async (names: string[], options) => {
		await updatePackages(names, {
			all: options.all,
			global: options.global,
			dryRun: options.dryRun,
			verbose: options.verbose,
		});
	});

// List command - list installed workflow packages
program
	.command("list")
	.option(
		"-g, --global",
		"List packages from global location (~/.cw/workflows/)",
	)
	.option("-a, --all", "List packages from both project and global locations")
	.option("-o, --outdated", "Show only packages with available updates")
	.option("--json", "Output in JSON format")
	.option("-v, --verbose", "Enable verbose output")
	.description("List installed workflow packages")
	.action(async (options) => {
		await listPackages({
			global: options.global,
			all: options.all,
			outdated: options.outdated,
			json: options.json,
			verbose: options.verbose,
		});
	});

// Parse and execute
program.parse();
