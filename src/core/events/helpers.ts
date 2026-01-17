/**
 * Event Helpers - Convenience functions for creating and emitting events
 *
 * These helpers provide a more ergonomic API for common event emission patterns.
 */

import type { WorkflowEmitter } from './emitter';
import type {
  WorkflowEventType,
  PayloadByType,
  // Graph events
  GraphCompileStartPayload,
  GraphCompileCompletePayload,
  GraphNodeRegisteredPayload,
  GraphEdgeRegisteredPayload,
  // Workflow events
  WorkflowStartPayload,
  WorkflowCompletePayload,
  WorkflowErrorPayload,
  // Node events
  NodeStartPayload,
  NodeCompletePayload,
  NodeErrorPayload,
  // Router events
  RouterStartPayload,
  RouterDecisionPayload,
  RouterErrorPayload,
  // Tool events
  ToolBashStartPayload,
  ToolBashCompletePayload,
  ToolBashErrorPayload,
  ToolClaudeStartPayload,
  ToolClaudeCompletePayload,
  ToolClaudeErrorPayload,
  ToolClaudePlanApprovalPayload,
  ToolClaudeSdkStartPayload,
  ToolClaudeSdkCompletePayload,
  ToolClaudeSdkErrorPayload,
  ToolClaudeSdkRetryPayload,
  ToolHookStartPayload,
  ToolHookCompletePayload,
  ToolChecklistStartPayload,
  ToolChecklistCompletePayload,
  ToolChecklistItemCompletePayload,
  // Retry events
  RetryStartPayload,
  RetryAttemptPayload,
  RetrySuccessPayload,
  RetryExhaustedPayload,
  // Infrastructure events
  TmuxPaneCreatePayload,
  TmuxPaneClosePayload,
  CleanupStartPayload,
  CleanupCompletePayload,
} from './types.js';

// ============================================================================
// Event Creator Factory
// ============================================================================

/**
 * Creates a bound event emitter with helper methods for common events
 */
export function createEventHelpers(emitter: WorkflowEmitter) {
  return {
    // ========================================================================
    // Graph Lifecycle Events
    // ========================================================================

    graphCompileStart(payload: GraphCompileStartPayload) {
      return emitter.emit('graph:compile:start', payload);
    },

    graphCompileComplete(payload: GraphCompileCompletePayload) {
      return emitter.emit('graph:compile:complete', payload);
    },

    graphNodeRegistered(payload: GraphNodeRegisteredPayload) {
      return emitter.emit('graph:node:registered', payload);
    },

    graphEdgeRegistered(payload: GraphEdgeRegisteredPayload) {
      return emitter.emit('graph:edge:registered', payload);
    },

    // ========================================================================
    // Workflow Lifecycle Events
    // ========================================================================

    workflowStart(payload: WorkflowStartPayload) {
      emitter.setContext({ workflowName: payload.workflowName });
      return emitter.emit('workflow:start', payload);
    },

    workflowComplete(payload: WorkflowCompletePayload) {
      return emitter.emit('workflow:complete', payload);
    },

    workflowError(payload: WorkflowErrorPayload) {
      return emitter.emit('workflow:error', payload);
    },

    workflowStateInitialized(workflowName: string, variables: Record<string, unknown>) {
      return emitter.emit('workflow:state:initialized', { workflowName, variables });
    },

    // ========================================================================
    // Node Execution Events
    // ========================================================================

    nodeStart(payload: NodeStartPayload) {
      emitter.setContext({ nodeName: payload.nodeName });
      return emitter.emit('node:start', payload);
    },

    nodeComplete(payload: NodeCompletePayload) {
      return emitter.emit('node:complete', payload);
    },

    nodeError(payload: NodeErrorPayload) {
      return emitter.emit('node:error', payload);
    },

    nodeToolsCreated(nodeName: string, availableTools: string[]) {
      return emitter.emit('node:tools:created', { nodeName, availableTools });
    },

    nodeVariablesMerged(nodeName: string, mergedVariables: Record<string, unknown>) {
      return emitter.emit('node:variables:merged', { nodeName, mergedVariables });
    },

    // ========================================================================
    // Routing Events
    // ========================================================================

    routerStart(payload: RouterStartPayload) {
      return emitter.emit('router:start', payload);
    },

    routerDecision(payload: RouterDecisionPayload) {
      return emitter.emit('router:decision', payload);
    },

    routerError(payload: RouterErrorPayload) {
      return emitter.emit('router:error', payload);
    },

    edgeTraverse(from: string, to: string, isParallel = false, parallelIndex?: number, parallelTotal?: number) {
      return emitter.emit('edge:traverse', { from, to, isParallel, parallelIndex, parallelTotal });
    },

    // ========================================================================
    // Tool: Bash Events
    // ========================================================================

    bashStart(payload: ToolBashStartPayload) {
      emitter.setContext({ toolName: 'bash' });
      return emitter.emit('tool:bash:start', payload);
    },

    bashProgress(command: string, elapsedMs: number, label?: string) {
      return emitter.emit('tool:bash:progress', { command, elapsedMs, label });
    },

    bashOutput(command: string, output: string, isPartial: boolean, label?: string) {
      return emitter.emit('tool:bash:output', { command, output, isPartial, label });
    },

    bashComplete(payload: ToolBashCompletePayload) {
      return emitter.emit('tool:bash:complete', payload);
    },

    bashError(payload: ToolBashErrorPayload) {
      return emitter.emit('tool:bash:error', payload);
    },

    // ========================================================================
    // Tool: Claude Events
    // ========================================================================

    claudeStart(payload: ToolClaudeStartPayload) {
      emitter.setContext({ toolName: 'claude' });
      return emitter.emit('tool:claude:start', payload);
    },

    claudeProgress(prompt: string, elapsedMs: number, label?: string, paneId?: string) {
      return emitter.emit('tool:claude:progress', { prompt, elapsedMs, label, paneId });
    },

    claudePlanApproval(payload: ToolClaudePlanApprovalPayload) {
      return emitter.emit('tool:claude:plan:approval', payload);
    },

    claudeComplete(payload: ToolClaudeCompletePayload) {
      return emitter.emit('tool:claude:complete', payload);
    },

    claudeError(payload: ToolClaudeErrorPayload) {
      return emitter.emit('tool:claude:error', payload);
    },

    // ========================================================================
    // Tool: ClaudeSdk Events
    // ========================================================================

    claudeSdkStart(payload: ToolClaudeSdkStartPayload) {
      emitter.setContext({ toolName: 'claudeSdk' });
      return emitter.emit('tool:claudeSdk:start', payload);
    },

    claudeSdkRetry(payload: ToolClaudeSdkRetryPayload) {
      return emitter.emit('tool:claudeSdk:retry', payload);
    },

    claudeSdkComplete(payload: ToolClaudeSdkCompletePayload) {
      return emitter.emit('tool:claudeSdk:complete', payload);
    },

    claudeSdkError(payload: ToolClaudeSdkErrorPayload) {
      return emitter.emit('tool:claudeSdk:error', payload);
    },

    // ========================================================================
    // Tool: Hook Events
    // ========================================================================

    hookStart(payload: ToolHookStartPayload) {
      emitter.setContext({ toolName: 'hook' });
      return emitter.emit('tool:hook:start', payload);
    },

    hookComplete(payload: ToolHookCompletePayload) {
      return emitter.emit('tool:hook:complete', payload);
    },

    // ========================================================================
    // Tool: Checklist Events
    // ========================================================================

    checklistStart(payload: ToolChecklistStartPayload) {
      emitter.setContext({ toolName: 'checklist' });
      return emitter.emit('tool:checklist:start', payload);
    },

    checklistItemComplete(payload: ToolChecklistItemCompletePayload) {
      return emitter.emit('tool:checklist:item:complete', payload);
    },

    checklistComplete(payload: ToolChecklistCompletePayload) {
      return emitter.emit('tool:checklist:complete', payload);
    },

    // ========================================================================
    // Retry Events
    // ========================================================================

    retryStart(payload: RetryStartPayload) {
      return emitter.emit('retry:start', payload);
    },

    retryAttempt(payload: RetryAttemptPayload) {
      return emitter.emit('retry:attempt', payload);
    },

    retrySuccess(payload: RetrySuccessPayload) {
      return emitter.emit('retry:success', payload);
    },

    retryExhausted(payload: RetryExhaustedPayload) {
      return emitter.emit('retry:exhausted', payload);
    },

    // ========================================================================
    // Tool: JSON Events
    // ========================================================================

    jsonStart(action: string, label?: string) {
      emitter.setContext({ toolName: 'json' });
      return emitter.emit('tool:json:start', { action, label });
    },

    jsonComplete(action: string, success: boolean, result?: unknown, label?: string) {
      return emitter.emit('tool:json:complete', { action, success, result, label });
    },

    // ========================================================================
    // State Events
    // ========================================================================

    stateVariableSet(name: string, value: unknown, previousValue?: unknown) {
      return emitter.emit('state:variable:set', { name, value, previousValue });
    },

    stateVariableGet(name: string, value: unknown, existed: boolean) {
      return emitter.emit('state:variable:get', { name, value, existed });
    },

    stateMerge(updates: Record<string, unknown>, resultKeys: string[]) {
      return emitter.emit('state:merge', { updates, resultKeys });
    },

    // ========================================================================
    // Infrastructure Events
    // ========================================================================

    tmuxPaneCreate(payload: TmuxPaneCreatePayload) {
      emitter.setContext({ paneId: payload.paneId });
      return emitter.emit('tmux:pane:create', payload);
    },

    tmuxPaneClose(payload: TmuxPaneClosePayload) {
      return emitter.emit('tmux:pane:close', payload);
    },

    serverStart(port: number, host: string) {
      return emitter.emit('server:start', { port, host });
    },

    serverStop(port: number, uptime: number) {
      return emitter.emit('server:stop', { port, uptime });
    },

    cleanupStart(payload: CleanupStartPayload) {
      return emitter.emit('cleanup:start', payload);
    },

    cleanupComplete(payload: CleanupCompletePayload) {
      return emitter.emit('cleanup:complete', payload);
    },

    // ========================================================================
    // Custom Events
    // ========================================================================

    custom(name: string, data: Record<string, unknown>) {
      return emitter.emitCustom(name, data);
    },

    // ========================================================================
    // Generic Emit
    // ========================================================================

    emit<T extends WorkflowEventType>(type: T, payload: PayloadByType<T>) {
      return emitter.emit(type, payload);
    },

    emitSync<T extends WorkflowEventType>(type: T, payload: PayloadByType<T>) {
      return emitter.emitSync(type, payload);
    },
  };
}

export type EventHelpers = ReturnType<typeof createEventHelpers>;

// ============================================================================
// Timing Helpers
// ============================================================================

/**
 * Create a timer for measuring durations
 */
export function createTimer(): { elapsed: () => number; reset: () => void } {
  let start = Date.now();

  return {
    elapsed: () => Date.now() - start,
    reset: () => {
      start = Date.now();
    },
  };
}

/**
 * Wrap a function to automatically emit start/complete events
 */
export function withEventTiming<T extends WorkflowEventType, R>(
  emitter: WorkflowEmitter,
  startType: T,
  completeType: WorkflowEventType,
  startPayload: PayloadByType<T>,
  createCompletePayload: (duration: number, result: R) => PayloadByType<typeof completeType>,
  fn: () => R | Promise<R>
): Promise<R> {
  const timer = createTimer();
  emitter.emit(startType, startPayload);

  const handleResult = (result: R) => {
    const duration = timer.elapsed();
    emitter.emit(completeType, createCompletePayload(duration, result));
    return result;
  };

  const handleError = (error: unknown) => {
    // We don't emit complete on error - the caller should emit the error event
    throw error;
  };

  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.then(handleResult).catch(handleError);
    }
    return Promise.resolve(handleResult(result));
  } catch (error) {
    return Promise.reject(handleError(error));
  }
}
