/**
 * Linear manage tool for issue lifecycle operations.
 *
 * Actions:
 * - create: Create new issue
 * - update: Update issue fields
 * - comment: Add comment to issue
 */

import type { StepConfig } from "../../types/index.ts";
import { LoopSignal } from "../../types/index.ts";
import type { ExecutionContext } from "../context/execution.ts";
import { type IssueData, LinearClientWrapper } from "../linear/index.ts";
import type { TmuxManager } from "../tmux/manager.ts";
import type { ToolResult } from "./types.ts";
import { BaseTool, errorResult } from "./types.ts";

type LinearManageAction = "create" | "update" | "comment";

/**
 * Create, update, and manage Linear issues.
 */
export class LinearManageTool extends BaseTool {
	get name(): string {
		return "linear_manage";
	}

	validateStep(step: StepConfig): void {
		const action = step.action as LinearManageAction | undefined;
		if (!action) {
			throw new Error("linear_manage step requires 'action' field");
		}

		const validActions = new Set<LinearManageAction>([
			"create",
			"update",
			"comment",
		]);
		if (!validActions.has(action)) {
			throw new Error(
				`Invalid action '${action}'. Must be one of: create, update, comment`,
			);
		}

		if (action === "create") {
			if (!step.title) {
				throw new Error("create action requires 'title' field");
			}
			if (!step.team) {
				throw new Error("create action requires 'team' field");
			}
		} else if (action === "update") {
			if (!step.issueId) {
				throw new Error("update action requires 'issueId' field");
			}
		} else if (action === "comment") {
			if (!step.issueId) {
				throw new Error("comment action requires 'issueId' field");
			}
			if (!step.body) {
				throw new Error("comment action requires 'body' field");
			}
		}
	}

	async execute(
		step: StepConfig,
		context: ExecutionContext,
		_tmuxManager: TmuxManager,
	): Promise<ToolResult> {
		const action = step.action as LinearManageAction;
		const apiKey = step.apiKey as string | undefined;

		let client: LinearClientWrapper;
		try {
			client = new LinearClientWrapper(apiKey);
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			return errorResult(message);
		}

		switch (action) {
			case "create":
				return this.actionCreate(step, context, client);
			case "update":
				return this.actionUpdate(step, context, client);
			case "comment":
				return this.actionComment(step, context, client);
			default:
				return errorResult(`Unknown action: ${action}`);
		}
	}

	private async actionCreate(
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

		const data: IssueData = {
			title: context.interpolate(step.title as string),
			team: context.interpolate(step.team as string),
			description: context.interpolateOptional(
				step.description as string | undefined,
			),
			project: context.interpolateOptional(step.project as string | undefined),
			priority: step.priority as number | undefined,
			labels,
			status: context.interpolateOptional(step.status as string | undefined),
			assignee: context.interpolateOptional(
				step.assignee as string | undefined,
			),
			parentId: context.interpolateOptional(
				step.parentId as string | undefined,
			),
		};

		try {
			const response = await client.createIssue(data);

			if (response.success) {
				return {
					success: true,
					output: JSON.stringify(response.data, null, 2),
					loopSignal: LoopSignal.NONE,
				};
			}
			return errorResult(response.error ?? "Failed to create issue");
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			return errorResult(message);
		}
	}

	private async actionUpdate(
		step: StepConfig,
		context: ExecutionContext,
		client: LinearClientWrapper,
	): Promise<ToolResult> {
		const issueId = context.interpolate(step.issueId as string);

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

		const data: IssueData = {
			title: context.interpolateOptional(step.title as string | undefined),
			description: context.interpolateOptional(
				step.description as string | undefined,
			),
			project: context.interpolateOptional(step.project as string | undefined),
			priority: step.priority as number | undefined,
			labels,
			status: context.interpolateOptional(step.status as string | undefined),
			assignee: context.interpolateOptional(
				step.assignee as string | undefined,
			),
		};

		try {
			const response = await client.updateIssue(issueId, data);

			if (response.success) {
				return {
					success: true,
					output: JSON.stringify(response.data, null, 2),
					loopSignal: LoopSignal.NONE,
				};
			}
			return errorResult(response.error ?? "Failed to update issue");
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			return errorResult(message);
		}
	}

	private async actionComment(
		step: StepConfig,
		context: ExecutionContext,
		client: LinearClientWrapper,
	): Promise<ToolResult> {
		const issueId = context.interpolate(step.issueId as string);
		const body = context.interpolate(step.body as string);

		try {
			const response = await client.addComment(issueId, body);

			if (response.success) {
				return {
					success: true,
					output: JSON.stringify(response.data, null, 2),
					loopSignal: LoopSignal.NONE,
				};
			}
			return errorResult(response.error ?? "Failed to add comment");
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			return errorResult(message);
		}
	}
}
