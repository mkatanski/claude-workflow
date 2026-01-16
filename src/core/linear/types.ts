/**
 * Type definitions for Linear integration.
 */

/**
 * Filter criteria for fetching issues.
 */
export interface IssueFilters {
	/** Required: team key or name */
	team: string;
	/** Optional project name */
	project?: string;
	/** Priority: 0=No priority, 1=Urgent, 2=High, 3=Medium, 4=Low */
	priority?: number;
	/** Labels to filter by */
	labels?: string[];
	/** State name like "Todo", "In Progress" */
	status?: string;
	/** User ID, email, or name */
	assignee?: string;
	/** Raw GraphQL filter object */
	customFilter?: Record<string, unknown>;
}

/**
 * Issue data for create/update operations.
 */
export interface IssueData {
	title?: string;
	description?: string;
	team?: string;
	project?: string;
	priority?: number;
	labels?: string[];
	status?: string;
	assignee?: string;
	parentId?: string;
}

/**
 * Wrapper for Linear API responses.
 */
export interface LinearResponse {
	success: boolean;
	data?: Record<string, unknown>;
	error?: string;
}

/**
 * Team info from Linear API.
 */
export interface TeamInfo {
	id: string;
	name: string;
	key: string;
}

/**
 * User info from Linear API.
 */
export interface UserInfo {
	id: string;
	name: string;
	email: string;
}

/**
 * Workflow state info from Linear API.
 */
export interface WorkflowState {
	id: string;
	name: string;
	type: string;
}

/**
 * Issue with blockers relation.
 */
export interface IssueWithBlockers {
	id: string;
	identifier: string;
	title: string;
	priority: number;
	state: {
		id: string;
		name: string;
		type: string;
	};
	project?: {
		id: string;
		name: string;
	};
	labels: {
		nodes: Array<{
			id: string;
			name: string;
		}>;
	};
	assignee?: {
		id: string;
		name: string;
		email: string;
	};
	relations: {
		nodes: Array<{
			type: string;
			relatedIssue: {
				id: string;
				identifier: string;
				state: {
					type: string;
				};
			};
		}>;
	};
}

/**
 * GraphQL response types.
 */
export interface TeamsQueryResponse {
	teams: {
		nodes: TeamInfo[];
	};
}

export interface UsersQueryResponse {
	users: {
		nodes: UserInfo[];
	};
}

export interface WorkflowStatesQueryResponse {
	team: {
		states: {
			nodes: WorkflowState[];
		};
	};
}

export interface IssuesWithBlockersQueryResponse {
	issues: {
		nodes: IssueWithBlockers[];
		pageInfo: {
			hasNextPage: boolean;
			endCursor: string;
		};
	};
}

export interface IssueDetailsQueryResponse {
	issue: Record<string, unknown>;
}

export interface IssueCreateMutationResponse {
	issueCreate: {
		success: boolean;
		issue: Record<string, unknown>;
	};
}

export interface IssueUpdateMutationResponse {
	issueUpdate: {
		success: boolean;
		issue: Record<string, unknown>;
	};
}

export interface CommentCreateMutationResponse {
	commentCreate: {
		success: boolean;
		comment: Record<string, unknown>;
	};
}

/**
 * GraphQL filter types for Linear API.
 */
export interface LinearIssueFilter {
	team?: { id: { eq: string } };
	priority?: { eq: number };
	state?: { id: { eq: string } };
	project?: { name: { eq: string } };
	labels?: { name: { in: string[] } };
	assignee?: { id: { eq: string } };
	[key: string]: unknown;
}
