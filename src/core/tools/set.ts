/**
 * Set tool for setting context variables.
 */

import type { StepConfig } from "../../types/index.ts";
import type { ExecutionContext } from "../context/execution.ts";
import type { TmuxManager } from "../tmux/manager.ts";
import type { ToolResult } from "./types.ts";
import { BaseTool, errorResult, successResult } from "./types.ts";

/**
 * Tool for setting workflow context variables.
 */
export class SetTool extends BaseTool {
	get name(): string {
		return "set";
	}

	validateStep(step: StepConfig): void {
		if (!step.var) {
			throw new Error(
				"Set tool requires 'var' field specifying the variable name",
			);
		}
	}

	async execute(
		step: StepConfig,
		context: ExecutionContext,
		_tmuxManager: TmuxManager,
	): Promise<ToolResult> {
		const varName = step.var;
		if (!varName) {
			return errorResult("Set tool requires 'var' field");
		}

		// Interpolate the value if it contains variable references
		const rawValue = step.value ?? "";
		const value = context.interpolate(rawValue);

		// Set the variable in context
		context.set(varName, value);

		return successResult(value);
	}
}
