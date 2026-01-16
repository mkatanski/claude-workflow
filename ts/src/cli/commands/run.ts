/**
 * Run workflow command.
 */

import { mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import * as p from "@clack/prompts";
import { discoverWorkflows, loadWorkflow, selectWorkflow } from "../discovery.ts";
import { WorkflowRunner } from "../../core/workflow/runner.ts";
import { checkHooksQuiet, installHooks, hasGlobalHooks, cleanupGlobalHooks } from "./hooks.ts";

/**
 * Options for the run command.
 */
export interface RunOptions {
  workflow?: string;
  verbose?: boolean;
}

/**
 * Run a workflow in the specified project.
 */
export async function runWorkflow(
  projectPath: string,
  options: RunOptions
): Promise<void> {
  const absoluteProjectPath = resolve(projectPath);

  console.log(`Project: ${absoluteProjectPath}`);

  // Check hooks before workflow execution
  const hooksInstalled = checkHooksQuiet(absoluteProjectPath);
  if (!hooksInstalled) {
    const shouldInstall = await p.confirm({
      message: "Orchestrator hooks not configured. Install them now?",
      initialValue: true,
    });

    if (p.isCancel(shouldInstall)) {
      process.exit(0);
    }

    if (shouldInstall) {
      installHooks(absoluteProjectPath);
      console.log("");
    } else {
      console.log("Warning: Workflow may not function correctly without hooks\n");
    }
  }

  // Check for legacy global hooks
  if (hasGlobalHooks()) {
    const shouldCleanup = await p.confirm({
      message: "Legacy global hooks found at ~/.claude/hooks/. Remove them?",
      initialValue: true,
    });
    if (!p.isCancel(shouldCleanup) && shouldCleanup) {
      cleanupGlobalHooks();
      console.log("");
    }
  }

  // Create temp directory for this run
  const tempDir = join(absoluteProjectPath, ".claude", "tmp", randomUUID().slice(0, 8));
  if (!existsSync(tempDir)) {
    mkdirSync(tempDir, { recursive: true });
  }

  // Discover workflows
  const workflows = await discoverWorkflows(absoluteProjectPath);

  if (workflows.length === 0) {
    console.error("No workflows found in .claude/workflows/");
    console.error("Create a workflow file like: .claude/workflows/my-workflow.workflow.ts");
    process.exit(1);
  }

  // Select workflow
  let selectedWorkflow;
  if (options.workflow) {
    selectedWorkflow = workflows.find((w) => w.name === options.workflow);
    if (!selectedWorkflow) {
      console.error(`Workflow not found: ${options.workflow}`);
      console.error("Available workflows:");
      for (const w of workflows) {
        console.error(`  - ${w.name}`);
      }
      process.exit(1);
    }
  } else {
    selectedWorkflow = await selectWorkflow(workflows);
    if (!selectedWorkflow) {
      console.error("No workflow selected");
      process.exit(1);
    }
  }

  console.log(`\nLoading workflow: ${selectedWorkflow.name}`);

  // Load workflow definition
  const definition = await loadWorkflow(selectedWorkflow.path);

  console.log(`Workflow: ${definition.name}`);
  console.log(`Steps: ${definition.steps.length}`);

  // Create runner
  const runner = new WorkflowRunner(definition, {
    projectPath: absoluteProjectPath,
    tempDir,
    verbose: options.verbose,
  });

  // Run workflow
  const result = await runner.run();

  if (!result.success) {
    console.error(`\nWorkflow failed: ${result.error}`);
    process.exit(1);
  }

  console.log("\nWorkflow completed successfully!");
}
