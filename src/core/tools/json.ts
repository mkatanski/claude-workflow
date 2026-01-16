/**
 * JSON tool for JSON manipulation using JMESPath.
 */

import jmespath from "jmespath";
import type { ExecutionContext } from "../context/execution.ts";
import type { TmuxManager } from "../tmux/manager.ts";
import type { StepConfig } from "../../types/index.ts";
import type { ToolResult } from "./types.ts";
import { BaseTool, successResult, errorResult } from "./types.ts";

/**
 * JSON manipulation tool using JMESPath queries.
 */
export class JsonTool extends BaseTool {
	get name(): string {
		return "json";
	}

	validateStep(step: StepConfig): void {
		if (!step.action) {
			throw new Error("JSON step requires 'action' field");
		}

		const validActions = [
			"query",
			"set",
			"parse",
			"stringify",
			"merge",
			"keys",
			"values",
			"length",
		];
		if (!validActions.includes(step.action)) {
			throw new Error(
				`Invalid JSON action: ${step.action}. Valid actions: ${validActions.join(", ")}`,
			);
		}

		if (step.action === "query" && !step.query) {
			throw new Error("JSON query action requires 'query' field");
		}

		if (step.action === "set" && (!step.path || step.newValue === undefined)) {
			throw new Error("JSON set action requires 'path' and 'newValue' fields");
		}
	}

	async execute(
		step: StepConfig,
		context: ExecutionContext,
		_tmuxManager: TmuxManager,
	): Promise<ToolResult> {
		const action = step.action!;

		try {
			switch (action) {
				case "query":
					return this.executeQuery(step, context);
				case "set":
					return this.executeSet(step, context);
				case "parse":
					return this.executeParse(step, context);
				case "stringify":
					return this.executeStringify(step, context);
				case "merge":
					return this.executeMerge(step, context);
				case "keys":
					return this.executeKeys(step, context);
				case "values":
					return this.executeValues(step, context);
				case "length":
					return this.executeLength(step, context);
				default:
					return errorResult(`Unknown JSON action: ${action}`);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return errorResult(`JSON ${action} failed: ${message}`);
		}
	}

	private getInput(step: StepConfig, context: ExecutionContext): unknown {
		const inputStr = context.interpolate(step.input ?? "{}");

		// Try to parse as JSON
		try {
			return JSON.parse(inputStr);
		} catch {
			return inputStr;
		}
	}

	private executeQuery(
		step: StepConfig,
		context: ExecutionContext,
	): ToolResult {
		const input = this.getInput(step, context);
		const query = context.interpolate(step.query!);

		const result = jmespath.search(input, query);

		const output =
			typeof result === "object" && result !== null
				? JSON.stringify(result)
				: String(result ?? "");

		console.log(`JSON query "${query}" -> ${output.slice(0, 100)}`);
		return successResult(output);
	}

	private executeSet(step: StepConfig, context: ExecutionContext): ToolResult {
		const input = this.getInput(step, context);
		const path = context.interpolate(step.path!);
		const newValueStr = context.interpolate(step.newValue!);

		// Parse new value
		let newValue: unknown;
		try {
			newValue = JSON.parse(newValueStr);
		} catch {
			newValue = newValueStr;
		}

		// Navigate to path and set value
		if (typeof input !== "object" || input === null) {
			return errorResult("Cannot set path on non-object value");
		}

		const obj = input as Record<string, unknown>;
		const parts = path.split(".");
		let current: Record<string, unknown> = obj;

		for (let i = 0; i < parts.length - 1; i++) {
			const part = parts[i];
			if (!(part in current) || typeof current[part] !== "object") {
				current[part] = {};
			}
			current = current[part] as Record<string, unknown>;
		}

		current[parts[parts.length - 1]] = newValue;

		const output = JSON.stringify(obj);
		console.log(`JSON set ${path} -> ${output.slice(0, 100)}`);
		return successResult(output);
	}

	private executeParse(
		step: StepConfig,
		context: ExecutionContext,
	): ToolResult {
		const inputStr = context.interpolate(step.input ?? "{}");

		try {
			const parsed = JSON.parse(inputStr);
			const output = JSON.stringify(parsed);
			console.log(`JSON parse -> ${output.slice(0, 100)}`);
			return successResult(output);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return errorResult(`Failed to parse JSON: ${message}`);
		}
	}

	private executeStringify(
		step: StepConfig,
		context: ExecutionContext,
	): ToolResult {
		const input = this.getInput(step, context);
		const output = JSON.stringify(input);
		console.log(`JSON stringify -> ${output.slice(0, 100)}`);
		return successResult(output);
	}

	private executeMerge(
		step: StepConfig,
		context: ExecutionContext,
	): ToolResult {
		const input = this.getInput(step, context);
		const newValueStr = context.interpolate(step.newValue ?? "{}");

		let newValue: unknown;
		try {
			newValue = JSON.parse(newValueStr);
		} catch {
			return errorResult("newValue must be valid JSON for merge");
		}

		if (
			typeof input !== "object" ||
			input === null ||
			typeof newValue !== "object" ||
			newValue === null
		) {
			return errorResult("Both input and newValue must be objects for merge");
		}

		const merged = { ...(input as object), ...(newValue as object) };
		const output = JSON.stringify(merged);
		console.log(`JSON merge -> ${output.slice(0, 100)}`);
		return successResult(output);
	}

	private executeKeys(step: StepConfig, context: ExecutionContext): ToolResult {
		const input = this.getInput(step, context);

		if (typeof input !== "object" || input === null) {
			return errorResult("Cannot get keys of non-object value");
		}

		const keys = Object.keys(input);
		const output = JSON.stringify(keys);
		console.log(`JSON keys -> ${output}`);
		return successResult(output);
	}

	private executeValues(
		step: StepConfig,
		context: ExecutionContext,
	): ToolResult {
		const input = this.getInput(step, context);

		if (typeof input !== "object" || input === null) {
			return errorResult("Cannot get values of non-object value");
		}

		const values = Object.values(input);
		const output = JSON.stringify(values);
		console.log(`JSON values -> ${output.slice(0, 100)}`);
		return successResult(output);
	}

	private executeLength(
		step: StepConfig,
		context: ExecutionContext,
	): ToolResult {
		const input = this.getInput(step, context);

		let length: number;
		if (Array.isArray(input)) {
			length = input.length;
		} else if (typeof input === "object" && input !== null) {
			length = Object.keys(input).length;
		} else if (typeof input === "string") {
			length = input.length;
		} else {
			return errorResult("Cannot get length of this value type");
		}

		console.log(`JSON length -> ${length}`);
		return successResult(String(length));
	}
}
