/**
 * Workflow discovery - finds .workflow.ts files in projects.
 */

import { readdir, stat } from "node:fs/promises";
import { join, basename, resolve } from "node:path";
import type { WorkflowDefinition, WorkflowFactory } from "../types/index.ts";
import { createBuilder } from "../core/workflow/builder.ts";

/**
 * Discovered workflow file.
 */
export interface DiscoveredWorkflow {
  name: string;
  path: string;
}

/**
 * Find all workflow files in a project.
 */
export async function discoverWorkflows(
  projectPath: string
): Promise<DiscoveredWorkflow[]> {
  const workflows: DiscoveredWorkflow[] = [];

  // Look for .cw/workflows directory
  const workflowsDir = join(projectPath, ".cw", "workflows");

  try {
    const dirStat = await stat(workflowsDir);
    if (!dirStat.isDirectory()) {
      return [];
    }

    const files = await readdir(workflowsDir);
    for (const file of files) {
      if (file.endsWith(".workflow.ts")) {
        const name = basename(file, ".workflow.ts");
        workflows.push({
          name,
          path: join(workflowsDir, file),
        });
      }
    }
  } catch {
    // Directory doesn't exist
    return [];
  }

  return workflows;
}

/**
 * Load a workflow from a .workflow.ts file.
 */
export async function loadWorkflow(
  workflowPath: string
): Promise<WorkflowDefinition> {
  const absolutePath = resolve(workflowPath);

  // Import the workflow module
  const module = await import(absolutePath);

  // Get the default export (should be a WorkflowFactory function)
  const factory: WorkflowFactory = module.default;

  if (typeof factory !== "function") {
    throw new Error(
      `Workflow file must export a default function: ${workflowPath}`
    );
  }

  // Create builder and invoke factory
  const builder = createBuilder();
  const definition = factory(builder);

  return definition;
}

/**
 * Select a workflow interactively if multiple are available.
 */
export async function selectWorkflow(
  workflows: DiscoveredWorkflow[]
): Promise<DiscoveredWorkflow | null> {
  if (workflows.length === 0) {
    return null;
  }

  if (workflows.length === 1) {
    return workflows[0];
  }

  // For now, just print options and return first one
  // In a more complete implementation, this would be interactive
  console.log("Available workflows:");
  for (let i = 0; i < workflows.length; i++) {
    console.log(`  ${i + 1}. ${workflows[i].name}`);
  }

  // Return first workflow as default
  console.log(`\nUsing: ${workflows[0].name}`);
  return workflows[0];
}
