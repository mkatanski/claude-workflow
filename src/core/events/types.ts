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

export type GraphCompileStartEvent = BaseEvent<'graph:compile:start', GraphCompileStartPayload>;
export type GraphCompileCompleteEvent = BaseEvent<'graph:compile:complete', GraphCompileCompletePayload>;
export type GraphNodeRegisteredEvent = BaseEvent<'graph:node:registered', GraphNodeRegisteredPayload>;
export type GraphEdgeRegisteredEvent = BaseEvent<'graph:edge:registered', GraphEdgeRegisteredPayload>;

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

export type WorkflowStartEvent = BaseEvent<'workflow:start', WorkflowStartPayload>;
export type WorkflowCompleteEvent = BaseEvent<'workflow:complete', WorkflowCompletePayload>;
export type WorkflowErrorEvent = BaseEvent<'workflow:error', WorkflowErrorPayload>;
export type WorkflowStateInitializedEvent = BaseEvent<'workflow:state:initialized', WorkflowStateInitializedPayload>;

export type WorkflowLifecycleEvent =
  | WorkflowStartEvent
  | WorkflowCompleteEvent
  | WorkflowErrorEvent
  | WorkflowStateInitializedEvent;

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

export type NodeStartEvent = BaseEvent<'node:start', NodeStartPayload>;
export type NodeCompleteEvent = BaseEvent<'node:complete', NodeCompletePayload>;
export type NodeErrorEvent = BaseEvent<'node:error', NodeErrorPayload>;
export type NodeToolsCreatedEvent = BaseEvent<'node:tools:created', NodeToolsCreatedPayload>;
export type NodeVariablesMergedEvent = BaseEvent<'node:variables:merged', NodeVariablesMergedPayload>;

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

export type RouterStartEvent = BaseEvent<'router:start', RouterStartPayload>;
export type RouterDecisionEvent = BaseEvent<'router:decision', RouterDecisionPayload>;
export type RouterErrorEvent = BaseEvent<'router:error', RouterErrorPayload>;
export type EdgeTraverseEvent = BaseEvent<'edge:traverse', EdgeTraversePayload>;

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

export type ToolBashStartEvent = BaseEvent<'tool:bash:start', ToolBashStartPayload>;
export type ToolBashProgressEvent = BaseEvent<'tool:bash:progress', ToolBashProgressPayload>;
export type ToolBashOutputEvent = BaseEvent<'tool:bash:output', ToolBashOutputPayload>;
export type ToolBashCompleteEvent = BaseEvent<'tool:bash:complete', ToolBashCompletePayload>;
export type ToolBashErrorEvent = BaseEvent<'tool:bash:error', ToolBashErrorPayload>;

export type ToolBashEvent =
  | ToolBashStartEvent
  | ToolBashProgressEvent
  | ToolBashOutputEvent
  | ToolBashCompleteEvent
  | ToolBashErrorEvent;

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

export type ToolClaudeStartEvent = BaseEvent<'tool:claude:start', ToolClaudeStartPayload>;
export type ToolClaudeProgressEvent = BaseEvent<'tool:claude:progress', ToolClaudeProgressPayload>;
export type ToolClaudePlanApprovalEvent = BaseEvent<'tool:claude:plan:approval', ToolClaudePlanApprovalPayload>;
export type ToolClaudeCompleteEvent = BaseEvent<'tool:claude:complete', ToolClaudeCompletePayload>;
export type ToolClaudeErrorEvent = BaseEvent<'tool:claude:error', ToolClaudeErrorPayload>;

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

export type ToolClaudeSdkStartEvent = BaseEvent<'tool:claudeSdk:start', ToolClaudeSdkStartPayload>;
export type ToolClaudeSdkRetryEvent = BaseEvent<'tool:claudeSdk:retry', ToolClaudeSdkRetryPayload>;
export type ToolClaudeSdkCompleteEvent = BaseEvent<'tool:claudeSdk:complete', ToolClaudeSdkCompletePayload>;
export type ToolClaudeSdkErrorEvent = BaseEvent<'tool:claudeSdk:error', ToolClaudeSdkErrorPayload>;

export type ToolClaudeSdkEvent =
  | ToolClaudeSdkStartEvent
  | ToolClaudeSdkRetryEvent
  | ToolClaudeSdkCompleteEvent
  | ToolClaudeSdkErrorEvent;

// ============================================================================
// Tool Events - AgentSession
// ============================================================================

export interface ToolAgentSessionStartPayload {
  prompt: string;
  label?: string;
  model: string;
  tools?: string[];
  workingDirectory?: string;
  hasSubagents: boolean;
  isResume: boolean;
  resumeSessionId?: string;
}

export interface ToolAgentSessionMessagePayload {
  label?: string;
  messageType: 'assistant' | 'tool_call' | 'tool_result' | 'error' | 'system';
  content?: string;
  toolName?: string;
  sessionId?: string;
  subtype?: string;
  agentName?: string;
}

export interface ToolAgentSessionCompletePayload {
  label?: string;
  success: boolean;
  output: string;
  sessionId?: string;
  messageCount: number;
  duration: number;
}

export interface ToolAgentSessionErrorPayload {
  label?: string;
  error: string;
  errorType?: 'AUTHENTICATION_FAILED' | 'RATE_LIMIT_EXCEEDED' | 'CONTEXT_LENGTH_EXCEEDED' | 'PERMISSION_DENIED' | 'BUDGET_EXCEEDED' | 'SESSION_NOT_FOUND' | 'UNKNOWN';
  sessionId?: string;
}

export type ToolAgentSessionStartEvent = BaseEvent<'tool:agentSession:start', ToolAgentSessionStartPayload>;
export type ToolAgentSessionMessageEvent = BaseEvent<'tool:agentSession:message', ToolAgentSessionMessagePayload>;
export type ToolAgentSessionCompleteEvent = BaseEvent<'tool:agentSession:complete', ToolAgentSessionCompletePayload>;
export type ToolAgentSessionErrorEvent = BaseEvent<'tool:agentSession:error', ToolAgentSessionErrorPayload>;

export type ToolAgentSessionEvent =
  | ToolAgentSessionStartEvent
  | ToolAgentSessionMessageEvent
  | ToolAgentSessionCompleteEvent
  | ToolAgentSessionErrorEvent;

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

export type ToolJsonStartEvent = BaseEvent<'tool:json:start', ToolJsonStartPayload>;
export type ToolJsonCompleteEvent = BaseEvent<'tool:json:complete', ToolJsonCompletePayload>;

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

export type ToolChecklistStartEvent = BaseEvent<'tool:checklist:start', ToolChecklistStartPayload>;
export type ToolChecklistItemCompleteEvent = BaseEvent<'tool:checklist:item:complete', ToolChecklistItemCompletePayload>;
export type ToolChecklistCompleteEvent = BaseEvent<'tool:checklist:complete', ToolChecklistCompletePayload>;

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

export type ToolHookStartEvent = BaseEvent<'tool:hook:start', ToolHookStartPayload>;
export type ToolHookCompleteEvent = BaseEvent<'tool:hook:complete', ToolHookCompletePayload>;

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
  action: 'push' | 'pop' | 'list';
  message?: string;
  index?: number;
  label?: string;
  duration: number;
}

export type ToolGitCommitEvent = BaseEvent<'tool:git:commit', ToolGitCommitPayload>;
export type ToolGitBranchCreateEvent = BaseEvent<'tool:git:branch:create', ToolGitBranchCreatePayload>;
export type ToolGitBranchSwitchEvent = BaseEvent<'tool:git:branch:switch', ToolGitBranchSwitchPayload>;
export type ToolGitBranchDeleteEvent = BaseEvent<'tool:git:branch:delete', ToolGitBranchDeletePayload>;
export type ToolGitWorktreeAddEvent = BaseEvent<'tool:git:worktree:add', ToolGitWorktreeAddPayload>;
export type ToolGitWorktreeRemoveEvent = BaseEvent<'tool:git:worktree:remove', ToolGitWorktreeRemovePayload>;
export type ToolGitErrorEvent = BaseEvent<'tool:git:error', ToolGitErrorPayload>;
export type ToolGitStatusEvent = BaseEvent<'tool:git:status', ToolGitStatusPayload>;
export type ToolGitStashEvent = BaseEvent<'tool:git:stash', ToolGitStashPayload>;

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

export type RetryStartEvent = BaseEvent<'retry:start', RetryStartPayload>;
export type RetryAttemptEvent = BaseEvent<'retry:attempt', RetryAttemptPayload>;
export type RetrySuccessEvent = BaseEvent<'retry:success', RetrySuccessPayload>;
export type RetryExhaustedEvent = BaseEvent<'retry:exhausted', RetryExhaustedPayload>;

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

export type CircuitBreakerOpenedEvent = BaseEvent<'circuit:opened', CircuitBreakerOpenedPayload>;
export type CircuitBreakerHalfOpenEvent = BaseEvent<'circuit:halfopen', CircuitBreakerHalfOpenPayload>;
export type CircuitBreakerClosedEvent = BaseEvent<'circuit:closed', CircuitBreakerClosedPayload>;
export type CircuitBreakerTestEvent = BaseEvent<'circuit:test', CircuitBreakerTestPayload>;
export type CircuitBreakerTripEvent = BaseEvent<'circuit:trip', CircuitBreakerTripPayload>;
export type CircuitBreakerRejectedEvent = BaseEvent<'circuit:rejected', CircuitBreakerRejectedPayload>;

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

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogPayload {
  message: string;
  level: LogLevel;
  data?: Record<string, unknown>;
}

export type LogEvent = BaseEvent<'log', LogPayload>;

// ============================================================================
// Combined Tool Events
// ============================================================================

export type ToolEvent =
  | ToolBashEvent
  | ToolClaudeEvent
  | ToolClaudeSdkEvent
  | ToolAgentSessionEvent
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

export type StateVariableSetEvent = BaseEvent<'state:variable:set', StateVariableSetPayload>;
export type StateVariableGetEvent = BaseEvent<'state:variable:get', StateVariableGetPayload>;
export type StateMergeEvent = BaseEvent<'state:merge', StateMergePayload>;
export type StateCheckpointSaveEvent = BaseEvent<'state:checkpoint:save', StateCheckpointSavePayload>;
export type StateCheckpointRestoreEvent = BaseEvent<'state:checkpoint:restore', StateCheckpointRestorePayload>;

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
  paneType: 'claude' | 'bash';
  cwd?: string;
}

export interface TmuxPaneClosePayload {
  paneId: string;
  paneType: 'claude' | 'bash';
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

export type TmuxPaneCreateEvent = BaseEvent<'tmux:pane:create', TmuxPaneCreatePayload>;
export type TmuxPaneCloseEvent = BaseEvent<'tmux:pane:close', TmuxPaneClosePayload>;
export type ServerStartEvent = BaseEvent<'server:start', ServerStartPayload>;
export type ServerStopEvent = BaseEvent<'server:stop', ServerStopPayload>;
export type CleanupStartEvent = BaseEvent<'cleanup:start', CleanupStartPayload>;
export type CleanupCompleteEvent = BaseEvent<'cleanup:complete', CleanupCompletePayload>;

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
  stepType: 'step-over' | 'step-in' | 'step-out';
  variables: Record<string, unknown>;
}

export interface DebugStepAfterPayload {
  nodeName: string;
  stepType: 'step-over' | 'step-in' | 'step-out';
  duration: number;
  variableChanges: Record<string, unknown>;
}

export interface DebugVariableInspectPayload {
  nodeName: string;
  variableName: string;
  value: unknown;
  scope: 'workflow' | 'node' | 'local';
  path?: string;
}

export interface DebugExecutionPausePayload {
  nodeName: string;
  reason: 'breakpoint' | 'step' | 'exception' | 'pause-request';
  variables: Record<string, unknown>;
  callStack?: string[];
}

export interface DebugExecutionResumePayload {
  nodeName: string;
  resumeMode: 'continue' | 'step-over' | 'step-in' | 'step-out';
  duration: number;
}

export type DebugBreakpointHitEvent = BaseEvent<'debug:breakpoint:hit', DebugBreakpointHitPayload>;
export type DebugStepBeforeEvent = BaseEvent<'debug:step:before', DebugStepBeforePayload>;
export type DebugStepAfterEvent = BaseEvent<'debug:step:after', DebugStepAfterPayload>;
export type DebugVariableInspectEvent = BaseEvent<'debug:variable:inspect', DebugVariableInspectPayload>;
export type DebugExecutionPauseEvent = BaseEvent<'debug:execution:pause', DebugExecutionPausePayload>;
export type DebugExecutionResumeEvent = BaseEvent<'debug:execution:resume', DebugExecutionResumePayload>;

export type DebugEvent =
  | DebugBreakpointHitEvent
  | DebugStepBeforeEvent
  | DebugStepAfterEvent
  | DebugVariableInspectEvent
  | DebugExecutionPauseEvent
  | DebugExecutionResumeEvent;

// ============================================================================
// Custom Events (for workflow-specific data)
// ============================================================================

export interface CustomEventPayload {
  name: string;
  data: Record<string, unknown>;
}

export type CustomEvent = BaseEvent<'workflow:custom', CustomEventPayload>;

// ============================================================================
// Union of All Events
// ============================================================================

export type WorkflowEvent =
  | GraphEvent
  | WorkflowLifecycleEvent
  | NodeEvent
  | RoutingEvent
  | ToolEvent
  | StateEvent
  | InfrastructureEvent
  | DebugEvent
  | LogEvent
  | CustomEvent;

// ============================================================================
// Helper Types
// ============================================================================

/** Extract event type string literals */
export type WorkflowEventType = WorkflowEvent['type'];

/** Extract event by type */
export type EventByType<T extends WorkflowEventType> = Extract<WorkflowEvent, { type: T }>;

/** Extract payload by event type */
export type PayloadByType<T extends WorkflowEventType> = EventByType<T>['payload'];

/** Event handler function type */
export type EventHandler<T extends WorkflowEventType = WorkflowEventType> = (
  event: EventByType<T>
) => void | Promise<void>;

/** Pattern matcher for event categories */
export type EventPattern = '*' | 'graph:*' | 'workflow:*' | 'node:*' | 'router:*' | 'edge:*' | 'tool:*' | 'tool:bash:*' | 'tool:claude:*' | 'tool:claudeSdk:*' | 'tool:agentSession:*' | 'tool:json:*' | 'tool:checklist:*' | 'tool:hook:*' | 'tool:git:*' | 'retry:*' | 'circuit:*' | 'state:*' | 'tmux:*' | 'server:*' | 'cleanup:*' | 'debug:*' | 'log';

/** Subscription handle for cleanup */
export interface Subscription {
  unsubscribe: () => void;
}

// ============================================================================
// Event Category Guards
// ============================================================================

export function isGraphEvent(event: WorkflowEvent): event is GraphEvent {
  return event.type.startsWith('graph:');
}

export function isWorkflowLifecycleEvent(event: WorkflowEvent): event is WorkflowLifecycleEvent {
  return event.type.startsWith('workflow:') && !event.type.startsWith('workflow:custom');
}

export function isNodeEvent(event: WorkflowEvent): event is NodeEvent {
  return event.type.startsWith('node:');
}

export function isRoutingEvent(event: WorkflowEvent): event is RoutingEvent {
  return event.type.startsWith('router:') || event.type.startsWith('edge:');
}

export function isToolEvent(event: WorkflowEvent): event is ToolEvent {
  return event.type.startsWith('tool:');
}

export function isStateEvent(event: WorkflowEvent): event is StateEvent {
  return event.type.startsWith('state:');
}

export function isInfrastructureEvent(event: WorkflowEvent): event is InfrastructureEvent {
  return (
    event.type.startsWith('tmux:') ||
    event.type.startsWith('server:') ||
    event.type.startsWith('cleanup:')
  );
}

export function isCustomEvent(event: WorkflowEvent): event is CustomEvent {
  return event.type === 'workflow:custom';
}

export function isDebugEvent(event: WorkflowEvent): event is DebugEvent {
  return event.type.startsWith('debug:');
}

export function isLogEvent(event: WorkflowEvent): event is LogEvent {
  return event.type === 'log';
}

export function isRetryEvent(event: WorkflowEvent): event is RetryEvent {
  return event.type.startsWith('retry:');
}

export function isCircuitBreakerEvent(event: WorkflowEvent): event is CircuitBreakerEvent {
  return event.type.startsWith('circuit:');
}

export function isGitEvent(event: WorkflowEvent): event is ToolGitEvent {
  return event.type.startsWith('tool:git:');
}

export function isToolAgentSessionEvent(event: WorkflowEvent): event is ToolAgentSessionEvent {
  return event.type.startsWith('tool:agentSession:');
}
