/**
 * Event types for workflow execution - renderer-agnostic event system
 *
 * This module defines all event types emitted during workflow execution.
 * Events are organized into categories:
 * - Graph lifecycle events
 * - Workflow execution events
 * - Node execution events
 * - Routing events
 * - Tool events
 * - State events
 * - Infrastructure events
 * - Debug events
 */

// ============================================================================
// Event Metadata
// ============================================================================

export interface EventContext {
	workflowName?: string;
	nodeName?: string;
	toolName?: string;
	paneId?: string;
}

export interface EventMetadata {
	/** Unique identifier for this event */
	eventId: string;
	/** ISO timestamp when event was created */
	timestamp: string;
	/** ID linking related events across a workflow execution */
	correlationId: string;
	/** ID of parent event for hierarchical tracking */
	parentEventId?: string;
	/** Contextual information about where the event occurred */
	context: EventContext;
}

// ============================================================================
// Base Event Interface
// ============================================================================

export interface BaseEvent<T extends string, P = unknown> {
	type: T;
	payload: P;
	metadata: EventMetadata;
}

// ============================================================================
// Graph Lifecycle Events
// ============================================================================

export interface GraphCompileStartPayload {
	workflowName: string;
	nodeCount: number;
}

export interface GraphCompileCompletePayload {
	workflowName: string;
	nodeCount: number;
	edgeCount: number;
	duration: number;
}

export interface GraphNodeRegisteredPayload {
	nodeName: string;
	nodeIndex: number;
}

export interface GraphEdgeRegisteredPayload {
	from: string;
	to: string;
	isConditional: boolean;
}

export type GraphCompileStartEvent = BaseEvent<
	"graph:compile:start",
	GraphCompileStartPayload
>;
export type GraphCompileCompleteEvent = BaseEvent<
	"graph:compile:complete",
	GraphCompileCompletePayload
>;
export type GraphNodeRegisteredEvent = BaseEvent<
	"graph:node:registered",
	GraphNodeRegisteredPayload
>;
export type GraphEdgeRegisteredEvent = BaseEvent<
	"graph:edge:registered",
	GraphEdgeRegisteredPayload
>;

export type GraphEvent =
	| GraphCompileStartEvent
	| GraphCompileCompleteEvent
	| GraphNodeRegisteredEvent
	| GraphEdgeRegisteredEvent;

// ============================================================================
// Workflow Execution Events
// ============================================================================

export interface WorkflowStartPayload {
	workflowName: string;
	initialVariables: Record<string, unknown>;
}

export interface WorkflowCompletePayload {
	workflowName: string;
	finalVariables: Record<string, unknown>;
	duration: number;
	success: boolean;
}

export interface WorkflowErrorPayload {
	workflowName: string;
	error: string;
	nodeName?: string;
	stack?: string;
}

export interface WorkflowStateInitializedPayload {
	workflowName: string;
	variables: Record<string, unknown>;
}

export type WorkflowStartEvent = BaseEvent<
	"workflow:start",
	WorkflowStartPayload
>;
export type WorkflowCompleteEvent = BaseEvent<
	"workflow:complete",
	WorkflowCompletePayload
>;
export type WorkflowErrorEvent = BaseEvent<
	"workflow:error",
	WorkflowErrorPayload
>;
export type WorkflowStateInitializedEvent = BaseEvent<
	"workflow:state:initialized",
	WorkflowStateInitializedPayload
>;

export type WorkflowLifecycleEvent =
	| WorkflowStartEvent
	| WorkflowCompleteEvent
	| WorkflowErrorEvent
	| WorkflowStateInitializedEvent;

// ============================================================================
// Workflow Call Events (sub-workflow invocation)
// ============================================================================

export interface WorkflowCallStartPayload {
	/** Name of the workflow being called */
	calledWorkflowName: string;
	/** Name of the parent workflow making the call */
	callerWorkflowName: string;
	/** Node in the caller workflow that initiated the call */
	callerNodeName: string;
	/** Input variables passed to the called workflow */
	inputVariables: Record<string, unknown>;
	/** Nesting depth (1 = direct child, 2 = grandchild, etc.) */
	depth: number;
}

export interface WorkflowCallCompletePayload {
	/** Name of the workflow that was called */
	calledWorkflowName: string;
	/** Name of the parent workflow that made the call */
	callerWorkflowName: string;
	/** Node in the caller workflow that initiated the call */
	callerNodeName: string;
	/** Output variables returned from the called workflow */
	outputVariables: Record<string, unknown>;
	/** Duration of the sub-workflow execution in ms */
	duration: number;
	/** Whether the called workflow completed successfully */
	success: boolean;
	/** Nesting depth */
	depth: number;
}

export interface WorkflowCallErrorPayload {
	/** Name of the workflow that was called */
	calledWorkflowName: string;
	/** Name of the parent workflow that made the call */
	callerWorkflowName: string;
	/** Node in the caller workflow that initiated the call */
	callerNodeName: string;
	/** Error message */
	error: string;
	/** Stack trace if available */
	stack?: string;
	/** Nesting depth */
	depth: number;
}

export type WorkflowCallStartEvent = BaseEvent<
	"workflow:call:start",
	WorkflowCallStartPayload
>;
export type WorkflowCallCompleteEvent = BaseEvent<
	"workflow:call:complete",
	WorkflowCallCompletePayload
>;
export type WorkflowCallErrorEvent = BaseEvent<
	"workflow:call:error",
	WorkflowCallErrorPayload
>;

export type WorkflowCallEvent =
	| WorkflowCallStartEvent
	| WorkflowCallCompleteEvent
	| WorkflowCallErrorEvent;

// ============================================================================
// Node Execution Events
// ============================================================================

export interface NodeStartPayload {
	nodeName: string;
	variables: Record<string, unknown>;
}

export interface NodeCompletePayload {
	nodeName: string;
	duration: number;
	variableUpdates: Record<string, unknown>;
}

export interface NodeErrorPayload {
	nodeName: string;
	error: string;
	stack?: string;
}

export interface NodeToolsCreatedPayload {
	nodeName: string;
	availableTools: string[];
}

export interface NodeVariablesMergedPayload {
	nodeName: string;
	mergedVariables: Record<string, unknown>;
}

export type NodeStartEvent = BaseEvent<"node:start", NodeStartPayload>;
export type NodeCompleteEvent = BaseEvent<"node:complete", NodeCompletePayload>;
export type NodeErrorEvent = BaseEvent<"node:error", NodeErrorPayload>;
export type NodeToolsCreatedEvent = BaseEvent<
	"node:tools:created",
	NodeToolsCreatedPayload
>;
export type NodeVariablesMergedEvent = BaseEvent<
	"node:variables:merged",
	NodeVariablesMergedPayload
>;

export type NodeEvent =
	| NodeStartEvent
	| NodeCompleteEvent
	| NodeErrorEvent
	| NodeToolsCreatedEvent
	| NodeVariablesMergedEvent;

// ============================================================================
// Routing Events
// ============================================================================

export interface RouterStartPayload {
	nodeName: string;
	sourceNode: string;
}

export interface RouterDecisionPayload {
	nodeName: string;
	sourceNode: string;
	decision: string;
	targetNode: string;
	duration: number;
}

export interface RouterErrorPayload {
	nodeName: string;
	sourceNode: string;
	error: string;
}

export interface EdgeTraversePayload {
	from: string;
	to: string;
	isParallel: boolean;
	parallelIndex?: number;
	parallelTotal?: number;
}

export type RouterStartEvent = BaseEvent<"router:start", RouterStartPayload>;
export type RouterDecisionEvent = BaseEvent<
	"router:decision",
	RouterDecisionPayload
>;
export type RouterErrorEvent = BaseEvent<"router:error", RouterErrorPayload>;
export type EdgeTraverseEvent = BaseEvent<"edge:traverse", EdgeTraversePayload>;

export type RoutingEvent =
	| RouterStartEvent
	| RouterDecisionEvent
	| RouterErrorEvent
	| EdgeTraverseEvent;

// ============================================================================
// Tool Events - Bash
// ============================================================================

export interface ToolBashStartPayload {
	command: string;
	label?: string;
	cwd?: string;
	visible: boolean;
}

export interface ToolBashProgressPayload {
	command: string;
	label?: string;
	elapsedMs: number;
}

export interface ToolBashOutputPayload {
	command: string;
	label?: string;
	output: string;
	isPartial: boolean;
}

export interface ToolBashCompletePayload {
	command: string;
	label?: string;
	success: boolean;
	output?: string;
	exitCode?: number;
	duration: number;
}

export interface ToolBashErrorPayload {
	command: string;
	label?: string;
	error: string;
	exitCode?: number;
}

export type ToolBashStartEvent = BaseEvent<
	"tool:bash:start",
	ToolBashStartPayload
>;
export type ToolBashProgressEvent = BaseEvent<
	"tool:bash:progress",
	ToolBashProgressPayload
>;
export type ToolBashOutputEvent = BaseEvent<
	"tool:bash:output",
	ToolBashOutputPayload
>;
export type ToolBashCompleteEvent = BaseEvent<
	"tool:bash:complete",
	ToolBashCompletePayload
>;
export type ToolBashErrorEvent = BaseEvent<
	"tool:bash:error",
	ToolBashErrorPayload
>;

export type ToolBashEvent =
	| ToolBashStartEvent
	| ToolBashProgressEvent
	| ToolBashOutputEvent
	| ToolBashCompleteEvent
	| ToolBashErrorEvent;

// ============================================================================
// Tool Events - Parallel Bash
// ============================================================================

export interface ParallelBashCommandConfig {
	id: string;
	command: string;
	label?: string;
	cwd?: string;
	timeout?: number;
	env?: Record<string, string>;
}

export interface ToolParallelBashStartPayload {
	commands: ParallelBashCommandConfig[];
	maxConcurrency: number;
	continueOnError: boolean;
	totalTimeout?: number;
}

export interface ToolParallelBashProgressPayload {
	completed: number;
	total: number;
	running: number;
	queued: number;
	succeeded: number;
	failed: number;
}

export interface ToolParallelBashCommandCompletePayload {
	id: string;
	command: string;
	label?: string;
	success: boolean;
	stdout: string;
	stderr: string;
	exitCode: number;
	duration: number;
	queueWaitTime: number;
	truncated: boolean;
	timedOut: boolean;
}

export interface ToolParallelBashCompletePayload {
	success: boolean;
	total: number;
	succeeded: number;
	failed: number;
	timedOut: number;
	duration: number;
	aborted: boolean;
}

export type ToolParallelBashStartEvent = BaseEvent<
	"tool:parallel:bash:start",
	ToolParallelBashStartPayload
>;
export type ToolParallelBashProgressEvent = BaseEvent<
	"tool:parallel:bash:progress",
	ToolParallelBashProgressPayload
>;
export type ToolParallelBashCommandCompleteEvent = BaseEvent<
	"tool:parallel:bash:command:complete",
	ToolParallelBashCommandCompletePayload
>;
export type ToolParallelBashCompleteEvent = BaseEvent<
	"tool:parallel:bash:complete",
	ToolParallelBashCompletePayload
>;

export type ToolParallelBashEvent =
	| ToolParallelBashStartEvent
	| ToolParallelBashProgressEvent
	| ToolParallelBashCommandCompleteEvent
	| ToolParallelBashCompleteEvent;

// ============================================================================
// Tool Events - Parallel Claude
// ============================================================================

export interface ParallelClaudeSessionConfig {
	id: string;
	prompt: string;
	model?: string;
	label?: string;
	timeout?: number;
	maxBudgetUsd?: number;
}

export interface ToolParallelClaudeStartPayload {
	sessions: ParallelClaudeSessionConfig[];
	maxConcurrency: number;
	continueOnError: boolean;
	totalTimeout?: number;
	maxTotalBudgetUsd?: number;
	label?: string;
}

export interface ToolParallelClaudeProgressPayload {
	completed: number;
	total: number;
	running: number;
	queued: number;
	succeeded: number;
	failed: number;
	tokensUsed: number;
	elapsedMs: number;
}

export interface ToolParallelClaudeSessionCompletePayload {
	id: string;
	prompt: string;
	label?: string;
	success: boolean;
	output?: string;
	error?: string;
	tokens: {
		input: number;
		output: number;
		total: number;
	};
	duration: number;
	queueWaitTime: number;
	model: string;
	sessionId?: string;
}

export interface ToolParallelClaudeCompletePayload {
	success: boolean;
	total: number;
	succeeded: number;
	failed: number;
	totalTokens: number;
	estimatedCostUsd: number;
	duration: number;
	aborted: boolean;
	label?: string;
}

export type ToolParallelClaudeStartEvent = BaseEvent<
	"tool:parallel:claude:start",
	ToolParallelClaudeStartPayload
>;
export type ToolParallelClaudeProgressEvent = BaseEvent<
	"tool:parallel:claude:progress",
	ToolParallelClaudeProgressPayload
>;
export type ToolParallelClaudeSessionCompleteEvent = BaseEvent<
	"tool:parallel:claude:session:complete",
	ToolParallelClaudeSessionCompletePayload
>;
export type ToolParallelClaudeCompleteEvent = BaseEvent<
	"tool:parallel:claude:complete",
	ToolParallelClaudeCompletePayload
>;

export type ToolParallelClaudeEvent =
	| ToolParallelClaudeStartEvent
	| ToolParallelClaudeProgressEvent
	| ToolParallelClaudeSessionCompleteEvent
	| ToolParallelClaudeCompleteEvent;

// ============================================================================
// Tool Events - Parallel Workflows
// ============================================================================

export interface ToolParallelWorkflowsStartPayload {
	/** Total number of workflows to execute */
	totalWorkflows: number;
	/** Maximum concurrent workflows */
	maxConcurrency: number;
	/** IDs of all workflows to be executed */
	workflowIds: string[];
	/** Human-readable label for the parallel operation */
	label?: string;
}

export interface ToolParallelWorkflowsProgressPayload {
	/** Total number of workflows */
	totalWorkflows: number;
	/** Number of completed workflows */
	completedWorkflows: number;
	/** Number of failed workflows */
	failedWorkflows: number;
	/** IDs of currently executing workflows */
	activeWorkflowIds: string[];
	/** IDs of workflows waiting in queue */
	queuedWorkflowIds: string[];
	/** Completion percentage (0-100) */
	percentComplete: number;
	/** Elapsed time in milliseconds */
	elapsedMs: number;
}

export interface ToolParallelWorkflowsCompletePayload {
	/** Whether all workflows succeeded */
	success: boolean;
	/** Total duration of parallel operation in milliseconds */
	totalDuration: number;
	/** Number of successful workflows */
	succeeded: number;
	/** Number of failed workflows */
	failed: number;
	/** Number of timed out workflows */
	timedOut: number;
	/** Human-readable label for the parallel operation */
	label?: string;
}

export interface ToolParallelWorkflowStartPayload {
	/** Unique identifier for this workflow */
	id: string;
	/** Workflow reference (name, name@version, or name:export) */
	reference: string;
	/** Position in the execution queue */
	queuePosition: number;
	/** Human-readable label for this workflow */
	label?: string;
}

export interface ToolParallelWorkflowCompletePayload {
	/** Unique identifier for this workflow */
	id: string;
	/** Workflow reference (name, name@version, or name:export) */
	reference: string;
	/** Whether the workflow completed successfully */
	success: boolean;
	/** Duration of workflow execution in milliseconds */
	duration: number;
	/** Human-readable label for this workflow */
	label?: string;
}

export type ToolParallelWorkflowsStartEvent = BaseEvent<
	"tool:parallel:workflows:start",
	ToolParallelWorkflowsStartPayload
>;
export type ToolParallelWorkflowsProgressEvent = BaseEvent<
	"tool:parallel:workflows:progress",
	ToolParallelWorkflowsProgressPayload
>;
export type ToolParallelWorkflowsCompleteEvent = BaseEvent<
	"tool:parallel:workflows:complete",
	ToolParallelWorkflowsCompletePayload
>;
export type ToolParallelWorkflowStartEvent = BaseEvent<
	"tool:parallel:workflow:start",
	ToolParallelWorkflowStartPayload
>;
export type ToolParallelWorkflowCompleteEvent = BaseEvent<
	"tool:parallel:workflow:complete",
	ToolParallelWorkflowCompletePayload
>;

export type ToolParallelWorkflowsEvent =
	| ToolParallelWorkflowsStartEvent
	| ToolParallelWorkflowsProgressEvent
	| ToolParallelWorkflowsCompleteEvent
	| ToolParallelWorkflowStartEvent
	| ToolParallelWorkflowCompleteEvent;

// ============================================================================
// Tool Events - Claude
// ============================================================================

export interface ToolClaudeStartPayload {
	prompt: string;
	label?: string;
	paneId?: string;
}

export interface ToolClaudeProgressPayload {
	prompt: string;
	label?: string;
	elapsedMs: number;
	paneId?: string;
}

export interface ToolClaudePlanApprovalPayload {
	prompt: string;
	label?: string;
	paneId?: string;
	approved: boolean;
	approvalCount: number;
}

export interface ToolClaudeCompletePayload {
	prompt: string;
	label?: string;
	success: boolean;
	output?: string;
	duration: number;
	paneId?: string;
}

export interface ToolClaudeErrorPayload {
	prompt: string;
	label?: string;
	error: string;
	paneId?: string;
}

export type ToolClaudeStartEvent = BaseEvent<
	"tool:claude:start",
	ToolClaudeStartPayload
>;
export type ToolClaudeProgressEvent = BaseEvent<
	"tool:claude:progress",
	ToolClaudeProgressPayload
>;
export type ToolClaudePlanApprovalEvent = BaseEvent<
	"tool:claude:plan:approval",
	ToolClaudePlanApprovalPayload
>;
export type ToolClaudeCompleteEvent = BaseEvent<
	"tool:claude:complete",
	ToolClaudeCompletePayload
>;
export type ToolClaudeErrorEvent = BaseEvent<
	"tool:claude:error",
	ToolClaudeErrorPayload
>;

export type ToolClaudeEvent =
	| ToolClaudeStartEvent
	| ToolClaudeProgressEvent
	| ToolClaudePlanApprovalEvent
	| ToolClaudeCompleteEvent
	| ToolClaudeErrorEvent;

// ============================================================================
// Tool Events - ClaudeSdk
// ============================================================================

export interface ToolClaudeSdkStartPayload {
	prompt: string;
	label?: string;
	model: string;
	outputType: string;
}

export interface ToolClaudeSdkRetryPayload {
	prompt: string;
	label?: string;
	attempt: number;
	maxAttempts: number;
	validationError?: string;
}

export interface ToolClaudeSdkCompletePayload {
	prompt: string;
	label?: string;
	success: boolean;
	result?: unknown;
	duration: number;
	attempts: number;
}

export interface ToolClaudeSdkErrorPayload {
	prompt: string;
	label?: string;
	error: string;
	attempts: number;
}

export type ToolClaudeSdkStartEvent = BaseEvent<
	"tool:claudeSdk:start",
	ToolClaudeSdkStartPayload
>;
export type ToolClaudeSdkRetryEvent = BaseEvent<
	"tool:claudeSdk:retry",
	ToolClaudeSdkRetryPayload
>;
export type ToolClaudeSdkCompleteEvent = BaseEvent<
	"tool:claudeSdk:complete",
	ToolClaudeSdkCompletePayload
>;
export type ToolClaudeSdkErrorEvent = BaseEvent<
	"tool:claudeSdk:error",
	ToolClaudeSdkErrorPayload
>;

export type ToolClaudeSdkEvent =
	| ToolClaudeSdkStartEvent
	| ToolClaudeSdkRetryEvent
	| ToolClaudeSdkCompleteEvent
	| ToolClaudeSdkErrorEvent;

// ============================================================================
// Tool Events - AgentSession
// ============================================================================

/**
 * Token usage statistics for agent sessions.
 */
export interface AgentSessionUsage {
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheCreationTokens: number;
}

/**
 * Per-model usage breakdown with cost.
 */
export interface AgentSessionModelUsage extends AgentSessionUsage {
	costUsd: number;
}

/**
 * File information from tool results (Read tool, etc.).
 */
export interface AgentSessionFileInfo {
	filePath: string;
	numLines: number;
	startLine?: number;
	totalLines?: number;
}

/**
 * Permission denial record.
 */
export interface AgentSessionPermissionDenial {
	toolName: string;
	toolUseId?: string;
	reason?: string;
}

export interface ToolAgentSessionStartPayload {
	prompt: string;
	label?: string;
	model: string;
	tools?: string[];
	workingDirectory?: string;
	hasSubagents: boolean;
	isResume: boolean;
	resumeSessionId?: string;

	/** Available tools in session (from init message) */
	availableTools?: string[];

	/** Permission mode (default, auto-approve, etc.) */
	permissionMode?: string;

	/** Claude Code version */
	claudeCodeVersion?: string;
}

export interface ToolAgentSessionMessagePayload {
	label?: string;
	messageType: "assistant" | "tool_call" | "tool_result" | "error" | "system";
	/** Subtype for more specific categorization (e.g., "text", "thinking", "tool_use", "init", "completion") */
	subtype?: string;
	content?: string;
	toolName?: string;
	/** Tool input parameters (for tool_call messages) */
	toolInput?: unknown;
	sessionId?: string;
	agentName?: string;
	/** Raw SDK message for debugging - always present */
	raw: unknown;

	/** Token usage for this message (if available from assistant messages) */
	usage?: {
		inputTokens?: number;
		outputTokens?: number;
		cacheReadTokens?: number;
		cacheCreationTokens?: number;
	};

	/** Stop reason if message was truncated or stopped (end_turn, max_tokens, tool_use, refusal) */
	stopReason?: string;

	/** Tool result file info (for tool_result messages from Read tool) */
	fileInfo?: AgentSessionFileInfo;
}

export interface ToolAgentSessionCompletePayload {
	label?: string;
	success: boolean;
	output: string;
	sessionId?: string;
	messageCount: number;
	duration: number;

	/** API call duration (separate from total, if available) */
	durationApiMs?: number;

	/** Number of API turns */
	numTurns?: number;

	/** Total cost in USD */
	costUsd?: number;

	/** Aggregated token usage for the session */
	totalUsage?: AgentSessionUsage;

	/** Per-model usage breakdown */
	modelUsage?: Record<string, AgentSessionModelUsage>;

	/** Permission denials during session */
	permissionDenials?: AgentSessionPermissionDenial[];
}

export interface ToolAgentSessionErrorPayload {
	label?: string;
	error: string;
	errorType?:
		| "AUTHENTICATION_FAILED"
		| "RATE_LIMIT_EXCEEDED"
		| "CONTEXT_LENGTH_EXCEEDED"
		| "PERMISSION_DENIED"
		| "BUDGET_EXCEEDED"
		| "SESSION_NOT_FOUND"
		| "UNKNOWN";
	sessionId?: string;
}

export type ToolAgentSessionStartEvent = BaseEvent<
	"tool:agentSession:start",
	ToolAgentSessionStartPayload
>;
export type ToolAgentSessionMessageEvent = BaseEvent<
	"tool:agentSession:message",
	ToolAgentSessionMessagePayload
>;
export type ToolAgentSessionCompleteEvent = BaseEvent<
	"tool:agentSession:complete",
	ToolAgentSessionCompletePayload
>;
export type ToolAgentSessionErrorEvent = BaseEvent<
	"tool:agentSession:error",
	ToolAgentSessionErrorPayload
>;

export type ToolAgentSessionEvent =
	| ToolAgentSessionStartEvent
	| ToolAgentSessionMessageEvent
	| ToolAgentSessionCompleteEvent
	| ToolAgentSessionErrorEvent;

// ============================================================================
// Tool Events - Planning Agent Session
// ============================================================================

export interface PlanningPhaseStartPayload {
	/** The prompt for the planning phase */
	prompt: string;
	/** Model used for planning */
	model: string;
	/** Optional label for the session */
	label?: string;
	/** Working directory for the planning session */
	workingDirectory?: string;
}

export interface PlanningPhaseCompletePayload {
	/** Path where the plan was saved */
	planPath: string;
	/** List of critical files identified in the plan */
	criticalFiles: string[];
	/** Duration of the planning phase in milliseconds */
	duration: number;
	/** Session ID of the planning session */
	sessionId?: string;
	/** Whether planning was successful */
	success: boolean;
	/** Error message if planning failed */
	error?: string;
}

export interface ImplementationPhaseStartPayload {
	/** Path to the plan being implemented */
	planPath: string;
	/** Model used for implementation */
	model: string;
	/** Optional label for the session */
	label?: string;
	/** Working directory for the implementation session */
	workingDirectory?: string;
	/** Whether this is a resumed session */
	isResume?: boolean;
	/** Session ID being resumed */
	resumeSessionId?: string;
}

export interface ImplementationPhaseCompletePayload {
	/** Session ID of the implementation session */
	sessionId?: string;
	/** Duration of the implementation phase in milliseconds */
	duration: number;
	/** Whether implementation was successful */
	success: boolean;
	/** Error message if implementation failed */
	error?: string;
	/** The output of the implementation */
	output?: string;
}

export type PlanningPhaseStartEvent = BaseEvent<
	"planning:phase:start",
	PlanningPhaseStartPayload
>;
export type PlanningPhaseCompleteEvent = BaseEvent<
	"planning:phase:complete",
	PlanningPhaseCompletePayload
>;
export type ImplementationPhaseStartEvent = BaseEvent<
	"implementation:phase:start",
	ImplementationPhaseStartPayload
>;
export type ImplementationPhaseCompleteEvent = BaseEvent<
	"implementation:phase:complete",
	ImplementationPhaseCompletePayload
>;

export type PlanningAgentEvent =
	| PlanningPhaseStartEvent
	| PlanningPhaseCompleteEvent
	| ImplementationPhaseStartEvent
	| ImplementationPhaseCompleteEvent;

// ============================================================================
// Tool Events - JSON
// ============================================================================

export interface ToolJsonStartPayload {
	action: string;
	label?: string;
}

export interface ToolJsonCompletePayload {
	action: string;
	label?: string;
	success: boolean;
	result?: unknown;
}

export type ToolJsonStartEvent = BaseEvent<
	"tool:json:start",
	ToolJsonStartPayload
>;
export type ToolJsonCompleteEvent = BaseEvent<
	"tool:json:complete",
	ToolJsonCompletePayload
>;

export type ToolJsonEvent = ToolJsonStartEvent | ToolJsonCompleteEvent;

// ============================================================================
// Tool Events - Checklist
// ============================================================================

export interface ToolChecklistStartPayload {
	label?: string;
	itemCount: number;
}

export interface ToolChecklistItemCompletePayload {
	label?: string;
	itemIndex: number;
	itemName: string;
	passed: boolean;
	message?: string;
}

export interface ToolChecklistCompletePayload {
	label?: string;
	passed: number;
	failed: number;
	total: number;
	success: boolean;
	duration: number;
}

export type ToolChecklistStartEvent = BaseEvent<
	"tool:checklist:start",
	ToolChecklistStartPayload
>;
export type ToolChecklistItemCompleteEvent = BaseEvent<
	"tool:checklist:item:complete",
	ToolChecklistItemCompletePayload
>;
export type ToolChecklistCompleteEvent = BaseEvent<
	"tool:checklist:complete",
	ToolChecklistCompletePayload
>;

export type ToolChecklistEvent =
	| ToolChecklistStartEvent
	| ToolChecklistItemCompleteEvent
	| ToolChecklistCompleteEvent;

// ============================================================================
// Tool Events - Hook
// ============================================================================

export interface ToolHookStartPayload {
	hookName: string;
	label?: string;
	hookPath?: string;
}

export interface ToolHookCompletePayload {
	hookName: string;
	label?: string;
	success: boolean;
	result?: string;
	duration: number;
	hookExists: boolean;
}

export type ToolHookStartEvent = BaseEvent<
	"tool:hook:start",
	ToolHookStartPayload
>;
export type ToolHookCompleteEvent = BaseEvent<
	"tool:hook:complete",
	ToolHookCompletePayload
>;

export type ToolHookEvent = ToolHookStartEvent | ToolHookCompleteEvent;

// ============================================================================
// Tool Events - Git
// ============================================================================

export interface ToolGitCommitPayload {
	hash: string;
	shortHash: string;
	message: string;
	filesCount: number;
	amend: boolean;
	label?: string;
	duration: number;
}

export interface ToolGitBranchCreatePayload {
	name: string;
	from: string;
	checkout: boolean;
	label?: string;
	duration: number;
}

export interface ToolGitBranchSwitchPayload {
	from: string;
	to: string;
	label?: string;
	duration: number;
}

export interface ToolGitBranchDeletePayload {
	name: string;
	force: boolean;
	label?: string;
	duration: number;
}

export interface ToolGitWorktreeAddPayload {
	path: string;
	absolutePath: string;
	branch: string;
	created: boolean;
	label?: string;
	duration: number;
}

export interface ToolGitWorktreeRemovePayload {
	path: string;
	force: boolean;
	label?: string;
	duration: number;
}

export interface ToolGitErrorPayload {
	operation: string;
	errorType: string;
	message: string;
	command?: string;
	label?: string;
}

export interface ToolGitStatusPayload {
	branch: string;
	staged: number;
	unstaged: number;
	untracked: number;
	label?: string;
	duration: number;
}

export interface ToolGitStashPayload {
	action: "push" | "pop" | "list";
	message?: string;
	index?: number;
	label?: string;
	duration: number;
}

export type ToolGitCommitEvent = BaseEvent<
	"tool:git:commit",
	ToolGitCommitPayload
>;
export type ToolGitBranchCreateEvent = BaseEvent<
	"tool:git:branch:create",
	ToolGitBranchCreatePayload
>;
export type ToolGitBranchSwitchEvent = BaseEvent<
	"tool:git:branch:switch",
	ToolGitBranchSwitchPayload
>;
export type ToolGitBranchDeleteEvent = BaseEvent<
	"tool:git:branch:delete",
	ToolGitBranchDeletePayload
>;
export type ToolGitWorktreeAddEvent = BaseEvent<
	"tool:git:worktree:add",
	ToolGitWorktreeAddPayload
>;
export type ToolGitWorktreeRemoveEvent = BaseEvent<
	"tool:git:worktree:remove",
	ToolGitWorktreeRemovePayload
>;
export type ToolGitErrorEvent = BaseEvent<
	"tool:git:error",
	ToolGitErrorPayload
>;
export type ToolGitStatusEvent = BaseEvent<
	"tool:git:status",
	ToolGitStatusPayload
>;
export type ToolGitStashEvent = BaseEvent<
	"tool:git:stash",
	ToolGitStashPayload
>;

export type ToolGitEvent =
	| ToolGitCommitEvent
	| ToolGitBranchCreateEvent
	| ToolGitBranchSwitchEvent
	| ToolGitBranchDeleteEvent
	| ToolGitWorktreeAddEvent
	| ToolGitWorktreeRemoveEvent
	| ToolGitErrorEvent
	| ToolGitStatusEvent
	| ToolGitStashEvent;

// ============================================================================
// Retry Events
// ============================================================================

export interface RetryStartPayload {
	operationName: string;
	maxAttempts: number;
	backoffStrategy: string;
}

export interface RetryAttemptPayload {
	operationName: string;
	attempt: number;
	maxAttempts: number;
	delayMs: number;
	error?: string;
}

export interface RetrySuccessPayload {
	operationName: string;
	attempt: number;
	totalAttempts: number;
	totalDuration: number;
}

export interface RetryExhaustedPayload {
	operationName: string;
	totalAttempts: number;
	totalDuration: number;
	lastError?: string;
}

export type RetryStartEvent = BaseEvent<"retry:start", RetryStartPayload>;
export type RetryAttemptEvent = BaseEvent<"retry:attempt", RetryAttemptPayload>;
export type RetrySuccessEvent = BaseEvent<"retry:success", RetrySuccessPayload>;
export type RetryExhaustedEvent = BaseEvent<
	"retry:exhausted",
	RetryExhaustedPayload
>;

export type RetryEvent =
	| RetryStartEvent
	| RetryAttemptEvent
	| RetrySuccessEvent
	| RetryExhaustedEvent;

// ============================================================================
// Circuit Breaker Events
// ============================================================================

export interface CircuitBreakerOpenedPayload {
	operationName: string;
	failureCount: number;
	failureThreshold: number;
	error?: string;
}

export interface CircuitBreakerHalfOpenPayload {
	operationName: string;
	timeoutDuration: number;
}

export interface CircuitBreakerClosedPayload {
	operationName: string;
	successCount: number;
}

export interface CircuitBreakerTestPayload {
	operationName: string;
	success: boolean;
	error?: string;
}

export interface CircuitBreakerTripPayload {
	operationName: string;
	currentFailureCount: number;
	failureThreshold: number;
	error?: string;
}

export interface CircuitBreakerRejectedPayload {
	operationName: string;
	consecutiveFailures: number;
	rejectedCount: number;
	resetTimeoutMs: number;
}

export type CircuitBreakerOpenedEvent = BaseEvent<
	"circuit:opened",
	CircuitBreakerOpenedPayload
>;
export type CircuitBreakerHalfOpenEvent = BaseEvent<
	"circuit:halfopen",
	CircuitBreakerHalfOpenPayload
>;
export type CircuitBreakerClosedEvent = BaseEvent<
	"circuit:closed",
	CircuitBreakerClosedPayload
>;
export type CircuitBreakerTestEvent = BaseEvent<
	"circuit:test",
	CircuitBreakerTestPayload
>;
export type CircuitBreakerTripEvent = BaseEvent<
	"circuit:trip",
	CircuitBreakerTripPayload
>;
export type CircuitBreakerRejectedEvent = BaseEvent<
	"circuit:rejected",
	CircuitBreakerRejectedPayload
>;

export type CircuitBreakerEvent =
	| CircuitBreakerOpenedEvent
	| CircuitBreakerHalfOpenEvent
	| CircuitBreakerClosedEvent
	| CircuitBreakerTestEvent
	| CircuitBreakerTripEvent
	| CircuitBreakerRejectedEvent;

// ============================================================================
// Log Events - User logging from workflows
// ============================================================================

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogPayload {
	message: string;
	level: LogLevel;
	data?: Record<string, unknown>;
}

export type LogEvent = BaseEvent<"log", LogPayload>;

// ============================================================================
// Combined Tool Events
// ============================================================================

export type ToolEvent =
	| ToolBashEvent
	| ToolParallelBashEvent
	| ToolParallelClaudeEvent
	| ToolParallelWorkflowsEvent
	| ToolClaudeEvent
	| ToolClaudeSdkEvent
	| ToolAgentSessionEvent
	| PlanningAgentEvent
	| ToolJsonEvent
	| ToolChecklistEvent
	| ToolHookEvent
	| ToolGitEvent
	| RetryEvent
	| CircuitBreakerEvent;

// ============================================================================
// State Events
// ============================================================================

export interface StateVariableSetPayload {
	name: string;
	value: unknown;
	previousValue?: unknown;
}

export interface StateVariableGetPayload {
	name: string;
	value: unknown;
	existed: boolean;
}

export interface StateMergePayload {
	updates: Record<string, unknown>;
	resultKeys: string[];
}

export interface StateCheckpointSavePayload {
	checkpointId: string;
	variables: Record<string, unknown>;
}

export interface StateCheckpointRestorePayload {
	checkpointId: string;
	variables: Record<string, unknown>;
}

export type StateVariableSetEvent = BaseEvent<
	"state:variable:set",
	StateVariableSetPayload
>;
export type StateVariableGetEvent = BaseEvent<
	"state:variable:get",
	StateVariableGetPayload
>;
export type StateMergeEvent = BaseEvent<"state:merge", StateMergePayload>;
export type StateCheckpointSaveEvent = BaseEvent<
	"state:checkpoint:save",
	StateCheckpointSavePayload
>;
export type StateCheckpointRestoreEvent = BaseEvent<
	"state:checkpoint:restore",
	StateCheckpointRestorePayload
>;

export type StateEvent =
	| StateVariableSetEvent
	| StateVariableGetEvent
	| StateMergeEvent
	| StateCheckpointSaveEvent
	| StateCheckpointRestoreEvent;

// ============================================================================
// Infrastructure Events
// ============================================================================

export interface TmuxPaneCreatePayload {
	paneId: string;
	paneType: "claude" | "bash";
	cwd?: string;
}

export interface TmuxPaneClosePayload {
	paneId: string;
	paneType: "claude" | "bash";
}

export interface ServerStartPayload {
	port: number;
	host: string;
}

export interface ServerStopPayload {
	port: number;
	uptime: number;
}

export interface CleanupStartPayload {
	workflowName: string;
	resourceCount: number;
}

export interface CleanupCompletePayload {
	workflowName: string;
	closedPanes: number;
	cleanedFiles: number;
	duration: number;
}

export type TmuxPaneCreateEvent = BaseEvent<
	"tmux:pane:create",
	TmuxPaneCreatePayload
>;
export type TmuxPaneCloseEvent = BaseEvent<
	"tmux:pane:close",
	TmuxPaneClosePayload
>;
export type ServerStartEvent = BaseEvent<"server:start", ServerStartPayload>;
export type ServerStopEvent = BaseEvent<"server:stop", ServerStopPayload>;
export type CleanupStartEvent = BaseEvent<"cleanup:start", CleanupStartPayload>;
export type CleanupCompleteEvent = BaseEvent<
	"cleanup:complete",
	CleanupCompletePayload
>;

export type InfrastructureEvent =
	| TmuxPaneCreateEvent
	| TmuxPaneCloseEvent
	| ServerStartEvent
	| ServerStopEvent
	| CleanupStartEvent
	| CleanupCompleteEvent;

// ============================================================================
// Debug Events
// ============================================================================

export interface DebugBreakpointHitPayload {
	breakpointId: string;
	nodeName: string;
	condition?: string;
	hitCount: number;
	variables: Record<string, unknown>;
}

export interface DebugStepBeforePayload {
	nodeName: string;
	stepType: "step-over" | "step-in" | "step-out";
	variables: Record<string, unknown>;
}

export interface DebugStepAfterPayload {
	nodeName: string;
	stepType: "step-over" | "step-in" | "step-out";
	duration: number;
	variableChanges: Record<string, unknown>;
}

export interface DebugVariableInspectPayload {
	nodeName: string;
	variableName: string;
	value: unknown;
	scope: "workflow" | "node" | "local";
	path?: string;
}

export interface DebugExecutionPausePayload {
	nodeName: string;
	reason: "breakpoint" | "step" | "exception" | "pause-request";
	variables: Record<string, unknown>;
	callStack?: string[];
}

export interface DebugExecutionResumePayload {
	nodeName: string;
	resumeMode: "continue" | "step-over" | "step-in" | "step-out";
	duration: number;
}

export type DebugBreakpointHitEvent = BaseEvent<
	"debug:breakpoint:hit",
	DebugBreakpointHitPayload
>;
export type DebugStepBeforeEvent = BaseEvent<
	"debug:step:before",
	DebugStepBeforePayload
>;
export type DebugStepAfterEvent = BaseEvent<
	"debug:step:after",
	DebugStepAfterPayload
>;
export type DebugVariableInspectEvent = BaseEvent<
	"debug:variable:inspect",
	DebugVariableInspectPayload
>;
export type DebugExecutionPauseEvent = BaseEvent<
	"debug:execution:pause",
	DebugExecutionPausePayload
>;
export type DebugExecutionResumeEvent = BaseEvent<
	"debug:execution:resume",
	DebugExecutionResumePayload
>;

export type DebugEvent =
	| DebugBreakpointHitEvent
	| DebugStepBeforeEvent
	| DebugStepAfterEvent
	| DebugVariableInspectEvent
	| DebugExecutionPauseEvent
	| DebugExecutionResumeEvent;

// ============================================================================
// Plan Events
// ============================================================================

export interface PlanCreatedPayload {
	/** Session ID for the plan */
	sessionId: string;
	/** Path to the saved plan file */
	planPath: string;
	/** Number of critical files identified */
	criticalFileCount: number;
	/** Plan status (pending, approved, etc.) */
	status: string;
}

export interface PlanApprovedPayload {
	/** Session ID for the plan */
	sessionId: string;
	/** Path to the saved plan file */
	planPath: string;
	/** Whether the plan was auto-approved */
	autoApproved: boolean;
}

export type PlanCreatedEvent = BaseEvent<"plan:created", PlanCreatedPayload>;
export type PlanApprovedEvent = BaseEvent<"plan:approved", PlanApprovedPayload>;

export type PlanEvent = PlanCreatedEvent | PlanApprovedEvent;

export function isPlanEvent(event: WorkflowEvent): event is PlanEvent {
	return event.type.startsWith("plan:");
}

// ============================================================================
// Custom Events (for workflow-specific data)
// ============================================================================

export interface CustomEventPayload {
	name: string;
	data: Record<string, unknown>;
}

export type CustomEvent = BaseEvent<"workflow:custom", CustomEventPayload>;

// ============================================================================
// Union of All Events
// ============================================================================

export type WorkflowEvent =
	| GraphEvent
	| WorkflowLifecycleEvent
	| WorkflowCallEvent
	| NodeEvent
	| RoutingEvent
	| ToolEvent
	| StateEvent
	| InfrastructureEvent
	| DebugEvent
	| PlanEvent
	| LogEvent
	| CustomEvent;

// ============================================================================
// Helper Types
// ============================================================================

/** Extract event type string literals */
export type WorkflowEventType = WorkflowEvent["type"];

/** Extract event by type */
export type EventByType<T extends WorkflowEventType> = Extract<
	WorkflowEvent,
	{ type: T }
>;

/** Extract payload by event type */
export type PayloadByType<T extends WorkflowEventType> =
	EventByType<T>["payload"];

/** Event handler function type */
export type EventHandler<T extends WorkflowEventType = WorkflowEventType> = (
	event: EventByType<T>,
) => void | Promise<void>;

/** Pattern matcher for event categories */
export type EventPattern =
	| "*"
	| "graph:*"
	| "workflow:*"
	| "workflow:call:*"
	| "node:*"
	| "router:*"
	| "edge:*"
	| "tool:*"
	| "tool:bash:*"
	| "tool:parallel:bash:*"
	| "tool:parallel:claude:*"
	| "tool:parallel:workflows:*"
	| "tool:parallel:workflow:*"
	| "tool:claude:*"
	| "tool:claudeSdk:*"
	| "tool:agentSession:*"
	| "tool:json:*"
	| "tool:checklist:*"
	| "tool:hook:*"
	| "tool:git:*"
	| "planning:*"
	| "planning:phase:*"
	| "implementation:*"
	| "implementation:phase:*"
	| "retry:*"
	| "circuit:*"
	| "state:*"
	| "plan:*"
	| "tmux:*"
	| "server:*"
	| "cleanup:*"
	| "debug:*"
	| "log";

/** Subscription handle for cleanup */
export interface Subscription {
	unsubscribe: () => void;
}

// ============================================================================
// Event Category Guards
// ============================================================================

export function isGraphEvent(event: WorkflowEvent): event is GraphEvent {
	return event.type.startsWith("graph:");
}

export function isWorkflowLifecycleEvent(
	event: WorkflowEvent,
): event is WorkflowLifecycleEvent {
	return (
		event.type.startsWith("workflow:") &&
		!event.type.startsWith("workflow:custom") &&
		!event.type.startsWith("workflow:call:")
	);
}

export function isWorkflowCallEvent(
	event: WorkflowEvent,
): event is WorkflowCallEvent {
	return event.type.startsWith("workflow:call:");
}

export function isNodeEvent(event: WorkflowEvent): event is NodeEvent {
	return event.type.startsWith("node:");
}

export function isRoutingEvent(event: WorkflowEvent): event is RoutingEvent {
	return event.type.startsWith("router:") || event.type.startsWith("edge:");
}

export function isToolEvent(event: WorkflowEvent): event is ToolEvent {
	return event.type.startsWith("tool:");
}

export function isStateEvent(event: WorkflowEvent): event is StateEvent {
	return event.type.startsWith("state:");
}

export function isInfrastructureEvent(
	event: WorkflowEvent,
): event is InfrastructureEvent {
	return (
		event.type.startsWith("tmux:") ||
		event.type.startsWith("server:") ||
		event.type.startsWith("cleanup:")
	);
}

export function isCustomEvent(event: WorkflowEvent): event is CustomEvent {
	return event.type === "workflow:custom";
}

export function isDebugEvent(event: WorkflowEvent): event is DebugEvent {
	return event.type.startsWith("debug:");
}

export function isLogEvent(event: WorkflowEvent): event is LogEvent {
	return event.type === "log";
}

export function isRetryEvent(event: WorkflowEvent): event is RetryEvent {
	return event.type.startsWith("retry:");
}

export function isCircuitBreakerEvent(
	event: WorkflowEvent,
): event is CircuitBreakerEvent {
	return event.type.startsWith("circuit:");
}

export function isGitEvent(event: WorkflowEvent): event is ToolGitEvent {
	return event.type.startsWith("tool:git:");
}

export function isToolAgentSessionEvent(
	event: WorkflowEvent,
): event is ToolAgentSessionEvent {
	return event.type.startsWith("tool:agentSession:");
}

export function isToolParallelBashEvent(
	event: WorkflowEvent,
): event is ToolParallelBashEvent {
	return event.type.startsWith("tool:parallel:bash:");
}

export function isToolParallelClaudeEvent(
	event: WorkflowEvent,
): event is ToolParallelClaudeEvent {
	return event.type.startsWith("tool:parallel:claude:");
}

export function isToolParallelWorkflowsEvent(
	event: WorkflowEvent,
): event is ToolParallelWorkflowsEvent {
	return (
		event.type.startsWith("tool:parallel:workflows:") ||
		event.type.startsWith("tool:parallel:workflow:")
	);
}

export function isPlanningAgentEvent(
	event: WorkflowEvent,
): event is PlanningAgentEvent {
	return (
		event.type.startsWith("planning:") ||
		event.type.startsWith("implementation:")
	);
}
