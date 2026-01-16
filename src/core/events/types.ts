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
  | ToolJsonEvent
  | ToolChecklistEvent
  | ToolHookEvent;

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
export type EventPattern = '*' | 'graph:*' | 'workflow:*' | 'node:*' | 'router:*' | 'edge:*' | 'tool:*' | 'tool:bash:*' | 'tool:claude:*' | 'tool:claudeSdk:*' | 'tool:json:*' | 'tool:checklist:*' | 'tool:hook:*' | 'state:*' | 'tmux:*' | 'server:*' | 'cleanup:*' | 'log';

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

export function isLogEvent(event: WorkflowEvent): event is LogEvent {
  return event.type === 'log';
}
