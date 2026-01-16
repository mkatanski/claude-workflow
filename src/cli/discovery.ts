/**
 * Workflow discovery - finds workflow files in projects.
 *
 * Supports two workflow formats:
 * - Legacy: .workflow.ts files using the WorkflowBuilder pattern
 * - LangGraph: .ts files using the WorkflowGraph pattern
 */

import { readdir, stat } from "node:fs/promises";
import { join, basename, resolve } from "node:path";
import * as p from "@clack/prompts";
import type { WorkflowDefinition, WorkflowFactory } from "../types/index.ts";
import { createBuilder } from "../core/workflow/builder.ts";
import type {
	LangGraphWorkflowDefinition,
	LangGraphWorkflowFactory,
} from "../core/graph/types.ts";
import { isLangGraphWorkflow } from "../core/graph/types.ts";

/**
 * Workflow format types.
 */
export type WorkflowFormat = "legacy" | "langgraph";

/**
 * Discovered workflow file.
 */
export interface DiscoveredWorkflow {
	name: string;
	path: string;
	format: WorkflowFormat;
}

/**
 * Find all workflow files in a project.
 *
 * Discovers both legacy (.workflow.ts) and LangGraph (.ts) workflows.
 * Legacy workflows take precedence if both exist with the same name.
 */
export async function discoverWorkflows(
	projectPath: string,
): Promise<DiscoveredWorkflow[]> {
	const workflows: DiscoveredWorkflow[] = [];
	const seenNames = new Set<string>();

	// Look for .cw/workflows directory
	const workflowsDir = join(projectPath, ".cw", "workflows");

	try {
		const dirStat = await stat(workflowsDir);
		if (!dirStat.isDirectory()) {
			return [];
		}

		const files = await readdir(workflowsDir);

		// First pass: find legacy .workflow.ts files
		for (const file of files) {
			if (file.endsWith(".workflow.ts")) {
				const name = basename(file, ".workflow.ts");
				seenNames.add(name);
				workflows.push({
					name,
					path: join(workflowsDir, file),
					format: "legacy",
				});
			}
		}

		// Second pass: find new-style .ts files (excluding .workflow.ts and index.ts)
		for (const file of files) {
			if (
				file.endsWith(".ts") &&
				!file.endsWith(".workflow.ts") &&
				file !== "index.ts"
			) {
				const name = basename(file, ".ts");
				// Skip if we already have a legacy workflow with the same name
				if (!seenNames.has(name)) {
					seenNames.add(name);
					workflows.push({
						name,
						path: join(workflowsDir, file),
						format: "langgraph",
					});
				}
			}
		}
	} catch {
		// Directory doesn't exist
		return [];
	}

	return workflows;
}

/**
 * Load a legacy workflow from a .workflow.ts file.
 */
export async function loadWorkflow(
	workflowPath: string,
): Promise<WorkflowDefinition> {
	const absolutePath = resolve(workflowPath);

	// Import the workflow module
	const module = await import(absolutePath);

	// Get the default export (should be a WorkflowFactory function)
	const factory: WorkflowFactory = module.default;

	if (typeof factory !== "function") {
		throw new Error(
			`Workflow file must export a default function: ${workflowPath}`,
		);
	}

	// Create builder and invoke factory
	const builder = createBuilder();
	const definition = factory(builder);

	return definition;
}

/**
 * Load a LangGraph workflow from a .ts file.
 */
export async function loadLangGraphWorkflow(
	workflowPath: string,
): Promise<LangGraphWorkflowDefinition> {
	const absolutePath = resolve(workflowPath);

	// Import the workflow module
	const module = await import(absolutePath);

	// Get the default export (should be a factory function)
	const factory: LangGraphWorkflowFactory = module.default;

	if (typeof factory !== "function") {
		throw new Error(
			`Workflow file must export a default function: ${workflowPath}`,
		);
	}

	// Invoke factory to get definition
	const definition = factory();

	// Validate it's a LangGraph workflow
	if (!isLangGraphWorkflow(definition)) {
		throw new Error(
			`Invalid LangGraph workflow definition in: ${workflowPath}. ` +
				"Must have 'name' (string) and 'build' (function) properties.",
		);
	}

	return definition;
}

/**
 * Select a workflow interactively if multiple are available.
 */
export async function selectWorkflow(
	workflows: DiscoveredWorkflow[],
): Promise<DiscoveredWorkflow | null> {
	if (workflows.length === 0) {
		return null;
	}

	if (workflows.length === 1) {
		return workflows[0];
	}

	const selected = await p.select({
		message: "Select a workflow to run",
		options: workflows.map((workflow) => ({
			value: workflow.name,
			label: workflow.name,
			hint: workflow.format,
		})),
	});

	if (p.isCancel(selected)) {
		return null;
	}

	const workflow = workflows.find((w) => w.name === selected);
	return workflow ?? null;
}
