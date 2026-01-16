/**
 * Linear API client wrapper.
 *
 * Provides methods for querying and mutating Linear issues
 * with support for filtering, blocking detection, and CRUD operations.
 */

import {
	COMMENT_CREATE_MUTATION,
	ISSUE_CREATE_MUTATION,
	ISSUE_DETAILS_QUERY,
	ISSUE_UPDATE_MUTATION,
	ISSUES_WITH_BLOCKERS_QUERY,
	TEAMS_QUERY,
	USERS_QUERY,
	WORKFLOW_STATES_QUERY,
} from "./queries.ts";
import type {
	CommentCreateMutationResponse,
	IssueCreateMutationResponse,
	IssueData,
	IssueDetailsQueryResponse,
	IssueFilters,
	IssuesWithBlockersQueryResponse,
	IssueUpdateMutationResponse,
	IssueWithBlockers,
	LinearIssueFilter,
	LinearResponse,
	TeamInfo,
	TeamsQueryResponse,
	UserInfo,
	UsersQueryResponse,
	WorkflowState,
	WorkflowStatesQueryResponse,
} from "./types.ts";

const API_URL = "https://api.linear.app/graphql";

/**
 * Linear API client wrapper.
 */
export class LinearClientWrapper {
	private apiKey: string;
	private teamsCache: TeamInfo[] | null = null;
	private usersCache: UserInfo[] | null = null;
	private statesCache: Map<string, WorkflowState[]> = new Map();

	constructor(apiKey?: string) {
		const key = apiKey ?? process.env.LINEAR_API_KEY;
		if (!key) {
			throw new Error(
				"Linear API key required. Set LINEAR_API_KEY environment variable " +
					"or pass apiKey parameter.",
			);
		}
		this.apiKey = key;
	}

	/**
	 * Get the next available issue identifier matching filters.
	 *
	 * @param filters - Issue filter criteria
	 * @param skipBlocked - If true, skip issues blocked by unresolved blockers
	 * @returns Issue identifier (e.g., "ENG-123") or null if no issues match
	 */
	async getNextIssue(
		filters: IssueFilters,
		skipBlocked = true,
	): Promise<string | null> {
		// Get team ID from name/key
		const teamId = await this.resolveTeamId(filters.team);
		if (!teamId) {
			return null;
		}

		// Build GraphQL filter
		const gqlFilter = await this.buildIssueFilter(filters, teamId);

		// Execute query with blocking relations
		const result = await this.executeGraphql<IssuesWithBlockersQueryResponse>(
			ISSUES_WITH_BLOCKERS_QUERY,
			{ filter: gqlFilter, first: 50 },
		);

		if (!result?.issues?.nodes) {
			return null;
		}

		const issues = result.issues.nodes;

		for (const issue of issues) {
			if (skipBlocked && this.isBlocked(issue)) {
				continue;
			}
			return issue.identifier;
		}

		return null;
	}

	/**
	 * Fetch full issue details by ID or identifier.
	 *
	 * @param issueId - Issue UUID or identifier (e.g., "ENG-123")
	 * @returns LinearResponse with full issue data
	 */
	async getIssue(issueId: string): Promise<LinearResponse> {
		try {
			const result = await this.executeGraphql<IssueDetailsQueryResponse>(
				ISSUE_DETAILS_QUERY,
				{ id: issueId },
			);

			if (result?.issue) {
				return { success: true, data: result.issue };
			}

			return { success: false, error: `Issue not found: ${issueId}` };
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			return { success: false, error: message };
		}
	}

	/**
	 * Assign an issue to a user.
	 *
	 * @param issueId - Issue identifier
	 * @param assignee - User ID, email, or name
	 * @returns LinearResponse with updated issue data
	 */
	async assignIssue(
		issueId: string,
		assignee: string,
	): Promise<LinearResponse> {
		try {
			const userId = await this.resolveUserId(assignee);
			if (!userId) {
				return { success: false, error: `User not found: ${assignee}` };
			}

			const result = await this.executeGraphql<IssueUpdateMutationResponse>(
				ISSUE_UPDATE_MUTATION,
				{ id: issueId, input: { assigneeId: userId } },
			);

			if (result?.issueUpdate?.success) {
				return { success: true, data: result.issueUpdate.issue };
			}

			return { success: false, error: "Failed to assign issue" };
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			return { success: false, error: message };
		}
	}

	/**
	 * Create a new issue.
	 *
	 * @param data - Issue creation data
	 * @returns LinearResponse with created issue data
	 */
	async createIssue(data: IssueData): Promise<LinearResponse> {
		try {
			if (!data.title || !data.team) {
				return {
					success: false,
					error: "title and team are required for issue creation",
				};
			}

			const teamId = await this.resolveTeamId(data.team);
			if (!teamId) {
				return { success: false, error: `Team not found: ${data.team}` };
			}

			const inputData: Record<string, unknown> = {
				title: data.title,
				teamId: teamId,
			};

			if (data.description) {
				inputData.description = data.description;
			}

			if (data.priority !== undefined) {
				inputData.priority = data.priority;
			}

			if (data.assignee) {
				const userId = await this.resolveUserId(data.assignee);
				if (userId) {
					inputData.assigneeId = userId;
				}
			}

			if (data.status) {
				const stateId = await this.resolveStateId(teamId, data.status);
				if (stateId) {
					inputData.stateId = stateId;
				}
			}

			if (data.parentId) {
				inputData.parentId = data.parentId;
			}

			const result = await this.executeGraphql<IssueCreateMutationResponse>(
				ISSUE_CREATE_MUTATION,
				{ input: inputData },
			);

			if (result?.issueCreate?.success) {
				return { success: true, data: result.issueCreate.issue };
			}

			return { success: false, error: "Failed to create issue" };
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			return { success: false, error: message };
		}
	}

	/**
	 * Update an existing issue.
	 *
	 * @param issueId - Issue identifier
	 * @param data - Fields to update
	 * @returns LinearResponse with updated issue data
	 */
	async updateIssue(issueId: string, data: IssueData): Promise<LinearResponse> {
		try {
			const inputData: Record<string, unknown> = {};

			if (data.title) {
				inputData.title = data.title;
			}

			if (data.description) {
				inputData.description = data.description;
			}

			if (data.priority !== undefined) {
				inputData.priority = data.priority;
			}

			if (data.assignee) {
				const userId = await this.resolveUserId(data.assignee);
				if (userId) {
					inputData.assigneeId = userId;
				}
			}

			if (data.status) {
				// Need to get team ID from issue first
				const issueResponse = await this.getIssue(issueId);
				if (issueResponse.success && issueResponse.data) {
					const team = issueResponse.data.team as
						| { id: string }
						| null
						| undefined;
					const teamId = team?.id;
					if (teamId) {
						const stateId = await this.resolveStateId(teamId, data.status);
						if (stateId) {
							inputData.stateId = stateId;
						}
					}
				}
			}

			if (Object.keys(inputData).length === 0) {
				return { success: false, error: "No fields to update" };
			}

			const result = await this.executeGraphql<IssueUpdateMutationResponse>(
				ISSUE_UPDATE_MUTATION,
				{ id: issueId, input: inputData },
			);

			if (result?.issueUpdate?.success) {
				return { success: true, data: result.issueUpdate.issue };
			}

			return { success: false, error: "Failed to update issue" };
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			return { success: false, error: message };
		}
	}

	/**
	 * Add a comment to an issue.
	 *
	 * @param issueId - Issue identifier
	 * @param body - Comment body text
	 * @returns LinearResponse with comment data
	 */
	async addComment(issueId: string, body: string): Promise<LinearResponse> {
		try {
			const result = await this.executeGraphql<CommentCreateMutationResponse>(
				COMMENT_CREATE_MUTATION,
				{ issueId, body },
			);

			if (result?.commentCreate?.success) {
				return { success: true, data: result.commentCreate.comment };
			}

			return { success: false, error: "Failed to create comment" };
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			return { success: false, error: message };
		}
	}

	// --- Private helper methods ---

	private async resolveTeamId(team: string): Promise<string | null> {
		if (this.teamsCache === null) {
			const result = await this.executeGraphql<TeamsQueryResponse>(
				TEAMS_QUERY,
				{},
			);
			this.teamsCache = result?.teams?.nodes ?? [];
		}

		const teamLower = team.toLowerCase();
		for (const t of this.teamsCache) {
			if (
				t.name.toLowerCase() === teamLower ||
				t.key.toLowerCase() === teamLower ||
				t.id === team
			) {
				return t.id;
			}
		}

		return null;
	}

	private async resolveUserId(user: string): Promise<string | null> {
		if (this.usersCache === null) {
			const result = await this.executeGraphql<UsersQueryResponse>(
				USERS_QUERY,
				{},
			);
			this.usersCache = result?.users?.nodes ?? [];
		}

		const userLower = user.toLowerCase();
		for (const u of this.usersCache) {
			if (
				u.email.toLowerCase() === userLower ||
				u.name.toLowerCase() === userLower ||
				u.id === user
			) {
				return u.id;
			}
		}

		return null;
	}

	private async resolveStateId(
		teamId: string,
		stateName: string,
	): Promise<string | null> {
		if (!this.statesCache.has(teamId)) {
			const result = await this.executeGraphql<WorkflowStatesQueryResponse>(
				WORKFLOW_STATES_QUERY,
				{ teamId },
			);
			this.statesCache.set(teamId, result?.team?.states?.nodes ?? []);
		}

		const states = this.statesCache.get(teamId) ?? [];
		const stateLower = stateName.toLowerCase();
		for (const s of states) {
			if (s.name.toLowerCase() === stateLower || s.id === stateName) {
				return s.id;
			}
		}

		return null;
	}

	private async buildIssueFilter(
		filters: IssueFilters,
		teamId: string,
	): Promise<LinearIssueFilter> {
		const gqlFilter: LinearIssueFilter = { team: { id: { eq: teamId } } };

		if (filters.priority !== undefined) {
			gqlFilter.priority = { eq: filters.priority };
		}

		if (filters.status) {
			const stateId = await this.resolveStateId(teamId, filters.status);
			if (stateId) {
				gqlFilter.state = { id: { eq: stateId } };
			}
		}

		if (filters.project) {
			gqlFilter.project = { name: { eq: filters.project } };
		}

		if (filters.labels && filters.labels.length > 0) {
			gqlFilter.labels = { name: { in: filters.labels } };
		}

		if (filters.assignee) {
			const userId = await this.resolveUserId(filters.assignee);
			if (userId) {
				gqlFilter.assignee = { id: { eq: userId } };
			}
		}

		if (filters.customFilter) {
			Object.assign(gqlFilter, filters.customFilter);
		}

		return gqlFilter;
	}

	private isBlocked(issue: IssueWithBlockers): boolean {
		const relations = issue.relations?.nodes ?? [];

		for (const relation of relations) {
			// Check if this issue is blocked by looking for blocking relations
			if (relation.type === "blocked" || relation.type === "is_blocked_by") {
				const related = relation.relatedIssue;
				const stateType = related?.state?.type;
				// State types: backlog, unstarted, started, completed, canceled
				if (stateType !== "completed" && stateType !== "canceled") {
					return true;
				}
			}
		}

		return false;
	}

	private async executeGraphql<T>(
		query: string,
		variables: Record<string, unknown>,
	): Promise<T | null> {
		const response = await fetch(API_URL, {
			method: "POST",
			headers: {
				Authorization: this.apiKey,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ query, variables }),
		});

		if (response.status === 200) {
			const result = (await response.json()) as {
				data?: T;
				errors?: Array<{ message: string }>;
			};
			if (result.errors) {
				const errorMsg = result.errors[0]?.message ?? "Unknown error";
				throw new Error(errorMsg);
			}
			return result.data ?? null;
		}

		const text = await response.text();
		throw new Error(`HTTP ${response.status}: ${text}`);
	}
}
