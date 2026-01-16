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
	.description("Run a workflow in the specified project")
	.action(async (projectPath: string, options) => {
		await runWorkflow(projectPath, {
			workflow: options.workflow,
			verbose: options.verbose,
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

// Parse and execute
program.parse();
