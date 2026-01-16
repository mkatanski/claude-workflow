/**
 * Hook tool implementation.
 *
 * Discovers and executes project-specific hooks from .cw/hooks/{name}.ts
 * Hooks are optional - if the file doesn't exist, the step silently succeeds.
 */

import type { ExecutionContext } from "../context/execution.ts";
import type { TmuxManager } from "../tmux/manager.ts";
import type { StepConfig } from "../../types/index.ts";
import type { ToolResult } from "./types.ts";
import { BaseTool, successResult, errorResult } from "./types.ts";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Context passed to hook functions.
 */
export interface HookContext {
	/** Current story ID if in story loop */
	storyId?: string;
	/** Current milestone ID if in milestone mode */
	milestoneId?: string;
	/** Workflow mode: "simple" or "milestone" */
	workflowMode?: string;
	/** Current workflow phase */
	workflowPhase?: string;
	/** Project root path */
	projectPath: string;
	/** All context variables */
	variables: Record<string, unknown>;
}

/**
 * Hook function signature.
 */
export type HookFunction = (context: HookContext) => Promise<string | void>;

/**
 * Execute project-specific hooks from .cw/hooks/{name}.ts
 *
 * Hooks are optional - if the file doesn't exist, the step silently succeeds.
 * This allows workflows to define hook points without requiring implementations.
 */
export class HookTool extends BaseTool {
	get name(): string {
		return "hook";
	}

	validateStep(step: StepConfig): void {
		if (!step.hookName) {
			throw new Error("Hook step requires 'hookName' field");
		}
	}

	async execute(
		step: StepConfig,
		context: ExecutionContext,
		_tmuxManager: TmuxManager,
	): Promise<ToolResult> {
		const hookName = context.interpolate(step.hookName!);
		const hookPath = join(context.projectPath, ".cw", "hooks", `${hookName}.ts`);

		// Check if hook file exists
		if (!existsSync(hookPath)) {
			// Hook doesn't exist - this is fine, silently succeed
			console.log(`Hook "${hookName}" not found at ${hookPath}, skipping`);
			return successResult(`Hook "${hookName}" skipped (not found)`);
		}

		console.log(`Executing hook: ${hookName}`);

		try {
			// Import the hook module
			const hookModule = await import(hookPath);

			// Expect default export to be the hook function
			const hookFn: HookFunction | undefined = hookModule.default;

			if (typeof hookFn !== "function") {
				return errorResult(
					`Hook "${hookName}" does not export a default function`,
				);
			}

			// Build hook context from execution context
			const hookContext: HookContext = {
				storyId: context.get("story_id") as string | undefined,
				milestoneId: context.get("milestone_id") as string | undefined,
				workflowMode: context.get("workflow_mode") as string | undefined,
				workflowPhase: context.get("workflow_phase") as string | undefined,
				projectPath: context.projectPath,
				variables: context.getAll(),
			};

			// Execute the hook
			const result = await hookFn(hookContext);

			const output =
				typeof result === "string"
					? result
					: `Hook "${hookName}" executed successfully`;

			return successResult(output);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(`Hook "${hookName}" failed:`, message);
			return errorResult(`Hook "${hookName}" failed: ${message}`);
		}
	}
}
