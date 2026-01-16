/**
 * Linear tasks tool for workflow-focused issue operations.
 *
 * Actions:
 * - get_next: Get next available issue ID with filters
 * - get: Fetch full issue details by ID
 * - assign: Assign issue to a user
 */

import type { StepConfig } from "../../types/index.ts";
import { LoopSignal } from "../../types/index.ts";
import type { ExecutionContext } from "../context/execution.ts";
import { type IssueFilters, LinearClientWrapper } from "../linear/index.ts";
import type { TmuxManager } from "../tmux/manager.ts";
import type { ToolResult } from "./types.ts";
import { BaseTool, errorResult, successResult } from "./types.ts";

type LinearTasksAction = "get_next" | "get" | "assign";

/**
 * Fetch and query Linear issues for workflow automation.
 */
export class LinearTasksTool extends BaseTool {
	get name(): string {
		return "linear_tasks";
	}

	validateStep(step: StepConfig): void {
		const action = step.action as LinearTasksAction | undefined;
		if (!action) {
			throw new Error("linear_tasks step requires 'action' field");
		}

		const validActions = new Set<LinearTasksAction>([
			"get_next",
			"get",
			"assign",
		]);
		if (!validActions.has(action)) {
			throw new Error(
				`Invalid action '${action}'. Must be one of: get_next, get, assign`,
			);
		}

		if (action === "get_next") {
			if (!step.team) {
				throw new Error("get_next action requires 'team' field");
			}
		} else if (action === "get") {
			if (!step.issueId) {
				throw new Error("get action requires 'issueId' field");
			}
		} else if (action === "assign") {
			if (!step.issueId) {
				throw new Error("assign action requires 'issueId' field");
			}
			if (!step.assignee) {
				throw new Error("assign action requires 'assignee' field");
			}
		}
	}

	async execute(
		step: StepConfig,
		context: ExecutionContext,
		_tmuxManager: TmuxManager,
	): Promise<ToolResult> {
		const action = step.action as LinearTasksAction;
		const apiKey = step.apiKey as string | undefined;

		let client: LinearClientWrapper;
		try {
			client = new LinearClientWrapper(apiKey);
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			return errorResult(message);
		}

		switch (action) {
			case "get_next":
				return this.actionGetNext(step, context, client);
			case "get":
				return this.actionGet(step, context, client);
			case "assign":
				return this.actionAssign(step, context, client);
			default:
				return errorResult(`Unknown action: ${action}`);
		}
	}

	private async actionGetNext(
		step: StepConfig,
		context: ExecutionContext,
		client: LinearClientWrapper,
	): Promise<ToolResult> {
		// Parse labels
		const labelsRaw = step.labels as string | string[] | undefined;
		let labels: string[] | undefined;
		if (labelsRaw !== undefined) {
			if (Array.isArray(labelsRaw)) {
				labels = labelsRaw;
			} else if (typeof labelsRaw === "string") {
				labels = [labelsRaw];
			}
		}

		const filters: IssueFilters = {
			team: context.interpolate(step.team as string),
			project: context.interpolateOptional(step.project as string | undefined),
			priority: step.priority as number | undefined,
			labels,
			status: context.interpolateOptional(step.status as string | undefined),
			assignee: context.interpolateOptional(
				step.assignee as string | undefined,
			),
			customFilter: step.filter as Record<string, unknown> | undefined,
		};

		const skipBlocked = step.skipBlocked !== false;

		try {
			const issueId = await client.getNextIssue(filters, skipBlocked);

			if (issueId) {
				return successResult(issueId);
			}
			return successResult("");
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			return errorResult(message);
		}
	}

	private async actionGet(
		step: StepConfig,
		context: ExecutionContext,
		client: LinearClientWrapper,
	): Promise<ToolResult> {
		const issueId = context.interpolate(step.issueId as string);

		const response = await client.getIssue(issueId);

		if (response.success) {
			return {
				success: true,
				output: JSON.stringify(response.data, null, 2),
				loopSignal: LoopSignal.NONE,
			};
		}
		return errorResult(response.error ?? "Failed to get issue");
	}

	private async actionAssign(
		step: StepConfig,
		context: ExecutionContext,
		client: LinearClientWrapper,
	): Promise<ToolResult> {
		const issueId = context.interpolate(step.issueId as string);
		const assignee = context.interpolate(step.assignee as string);

		const response = await client.assignIssue(issueId, assignee);

		if (response.success) {
			return {
				success: true,
				output: JSON.stringify(response.data, null, 2),
				loopSignal: LoopSignal.NONE,
			};
		}
		return errorResult(response.error ?? "Failed to assign issue");
	}
}
