/**
 * Event Helpers - Convenience functions for creating and emitting events
 *
 * These helpers provide a more ergonomic API for common event emission patterns.
 */

import type { WorkflowEmitter } from "./emitter";
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
	// Workflow call events (sub-workflow invocation)
	WorkflowCallStartPayload,
	WorkflowCallCompletePayload,
	WorkflowCallErrorPayload,
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
	// Parallel Bash events
	ToolParallelBashStartPayload,
	ToolParallelBashProgressPayload,
	ToolParallelBashCommandCompletePayload,
	ToolParallelBashCompletePayload,
	// Parallel Claude events
	ToolParallelClaudeStartPayload,
	ToolParallelClaudeProgressPayload,
	ToolParallelClaudeSessionCompletePayload,
	ToolParallelClaudeCompletePayload,
	// Parallel Workflows events
	ToolParallelWorkflowsStartPayload,
	ToolParallelWorkflowsProgressPayload,
	ToolParallelWorkflowsCompletePayload,
	ToolParallelWorkflowStartPayload,
	ToolParallelWorkflowCompletePayload,
	ToolClaudeStartPayload,
	ToolClaudeCompletePayload,
	ToolClaudeErrorPayload,
	ToolClaudePlanApprovalPayload,
	ToolClaudeSdkStartPayload,
	ToolClaudeSdkCompletePayload,
	ToolClaudeSdkErrorPayload,
	ToolClaudeSdkRetryPayload,
	// AgentSession events
	ToolAgentSessionStartPayload,
	ToolAgentSessionMessagePayload,
	ToolAgentSessionCompletePayload,
	ToolAgentSessionErrorPayload,
	ToolHookStartPayload,
	ToolHookCompletePayload,
	ToolChecklistStartPayload,
	ToolChecklistCompletePayload,
	ToolChecklistItemCompletePayload,
	// Git events
	ToolGitCommitPayload,
	ToolGitBranchCreatePayload,
	ToolGitBranchSwitchPayload,
	ToolGitBranchDeletePayload,
	ToolGitWorktreeAddPayload,
	ToolGitWorktreeRemovePayload,
	ToolGitErrorPayload,
	ToolGitStatusPayload,
	ToolGitStashPayload,
	// Retry events
	RetryStartPayload,
	RetryAttemptPayload,
	RetrySuccessPayload,
	RetryExhaustedPayload,
	// Circuit breaker events
	CircuitBreakerOpenedPayload,
	CircuitBreakerHalfOpenPayload,
	CircuitBreakerClosedPayload,
	CircuitBreakerTestPayload,
	CircuitBreakerTripPayload,
	CircuitBreakerRejectedPayload,
	// Infrastructure events
	TmuxPaneCreatePayload,
	TmuxPaneClosePayload,
	CleanupStartPayload,
	CleanupCompletePayload,
} from "./types.js";

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
			return emitter.emit("graph:compile:start", payload);
		},

		graphCompileComplete(payload: GraphCompileCompletePayload) {
			return emitter.emit("graph:compile:complete", payload);
		},

		graphNodeRegistered(payload: GraphNodeRegisteredPayload) {
			return emitter.emit("graph:node:registered", payload);
		},

		graphEdgeRegistered(payload: GraphEdgeRegisteredPayload) {
			return emitter.emit("graph:edge:registered", payload);
		},

		// ========================================================================
		// Workflow Lifecycle Events
		// ========================================================================

		workflowStart(payload: WorkflowStartPayload) {
			emitter.setContext({ workflowName: payload.workflowName });
			return emitter.emit("workflow:start", payload);
		},

		workflowComplete(payload: WorkflowCompletePayload) {
			return emitter.emit("workflow:complete", payload);
		},

		workflowError(payload: WorkflowErrorPayload) {
			return emitter.emit("workflow:error", payload);
		},

		workflowStateInitialized(
			workflowName: string,
			variables: Record<string, unknown>,
		) {
			return emitter.emit("workflow:state:initialized", {
				workflowName,
				variables,
			});
		},

		// ========================================================================
		// Workflow Call Events (sub-workflow invocation)
		// ========================================================================

		workflowCallStart(payload: WorkflowCallStartPayload) {
			return emitter.emit("workflow:call:start", payload);
		},

		workflowCallComplete(payload: WorkflowCallCompletePayload) {
			return emitter.emit("workflow:call:complete", payload);
		},

		workflowCallError(payload: WorkflowCallErrorPayload) {
			return emitter.emit("workflow:call:error", payload);
		},

		// ========================================================================
		// Node Execution Events
		// ========================================================================

		nodeStart(payload: NodeStartPayload) {
			emitter.setContext({ nodeName: payload.nodeName });
			return emitter.emit("node:start", payload);
		},

		nodeComplete(payload: NodeCompletePayload) {
			return emitter.emit("node:complete", payload);
		},

		nodeError(payload: NodeErrorPayload) {
			return emitter.emit("node:error", payload);
		},

		nodeToolsCreated(nodeName: string, availableTools: string[]) {
			return emitter.emit("node:tools:created", { nodeName, availableTools });
		},

		nodeVariablesMerged(
			nodeName: string,
			mergedVariables: Record<string, unknown>,
		) {
			return emitter.emit("node:variables:merged", {
				nodeName,
				mergedVariables,
			});
		},

		// ========================================================================
		// Routing Events
		// ========================================================================

		routerStart(payload: RouterStartPayload) {
			return emitter.emit("router:start", payload);
		},

		routerDecision(payload: RouterDecisionPayload) {
			return emitter.emit("router:decision", payload);
		},

		routerError(payload: RouterErrorPayload) {
			return emitter.emit("router:error", payload);
		},

		edgeTraverse(
			from: string,
			to: string,
			isParallel = false,
			parallelIndex?: number,
			parallelTotal?: number,
		) {
			return emitter.emit("edge:traverse", {
				from,
				to,
				isParallel,
				parallelIndex,
				parallelTotal,
			});
		},

		// ========================================================================
		// Tool: Bash Events
		// ========================================================================

		bashStart(payload: ToolBashStartPayload) {
			emitter.setContext({ toolName: "bash" });
			return emitter.emit("tool:bash:start", payload);
		},

		bashProgress(command: string, elapsedMs: number, label?: string) {
			return emitter.emit("tool:bash:progress", { command, elapsedMs, label });
		},

		bashOutput(
			command: string,
			output: string,
			isPartial: boolean,
			label?: string,
		) {
			return emitter.emit("tool:bash:output", {
				command,
				output,
				isPartial,
				label,
			});
		},

		bashComplete(payload: ToolBashCompletePayload) {
			return emitter.emit("tool:bash:complete", payload);
		},

		bashError(payload: ToolBashErrorPayload) {
			return emitter.emit("tool:bash:error", payload);
		},

		// ========================================================================
		// Tool: Parallel Bash Events
		// ========================================================================

		parallelBashStart(payload: ToolParallelBashStartPayload) {
			emitter.setContext({ toolName: "parallelBash" });
			return emitter.emit("tool:parallel:bash:start", payload);
		},

		parallelBashProgress(payload: ToolParallelBashProgressPayload) {
			return emitter.emit("tool:parallel:bash:progress", payload);
		},

		parallelBashCommandComplete(
			payload: ToolParallelBashCommandCompletePayload,
		) {
			return emitter.emit("tool:parallel:bash:command:complete", payload);
		},

		parallelBashComplete(payload: ToolParallelBashCompletePayload) {
			return emitter.emit("tool:parallel:bash:complete", payload);
		},

		// ========================================================================
		// Tool: Parallel Claude Events
		// ========================================================================

		parallelClaudeStart(payload: ToolParallelClaudeStartPayload) {
			emitter.setContext({ toolName: "parallelClaude" });
			return emitter.emit("tool:parallel:claude:start", payload);
		},

		parallelClaudeProgress(payload: ToolParallelClaudeProgressPayload) {
			return emitter.emit("tool:parallel:claude:progress", payload);
		},

		parallelClaudeSessionComplete(
			payload: ToolParallelClaudeSessionCompletePayload,
		) {
			return emitter.emit("tool:parallel:claude:session:complete", payload);
		},

		parallelClaudeComplete(payload: ToolParallelClaudeCompletePayload) {
			return emitter.emit("tool:parallel:claude:complete", payload);
		},

		// ========================================================================
		// Tool: Parallel Workflows Events
		// ========================================================================

		parallelWorkflowsStart(payload: ToolParallelWorkflowsStartPayload) {
			emitter.setContext({ toolName: "parallelWorkflows" });
			return emitter.emit("tool:parallel:workflows:start", payload);
		},

		parallelWorkflowsProgress(payload: ToolParallelWorkflowsProgressPayload) {
			return emitter.emit("tool:parallel:workflows:progress", payload);
		},

		parallelWorkflowsComplete(payload: ToolParallelWorkflowsCompletePayload) {
			return emitter.emit("tool:parallel:workflows:complete", payload);
		},

		parallelWorkflowStart(payload: ToolParallelWorkflowStartPayload) {
			return emitter.emit("tool:parallel:workflow:start", payload);
		},

		parallelWorkflowComplete(payload: ToolParallelWorkflowCompletePayload) {
			return emitter.emit("tool:parallel:workflow:complete", payload);
		},

		// ========================================================================
		// Tool: Claude Events
		// ========================================================================

		claudeStart(payload: ToolClaudeStartPayload) {
			emitter.setContext({ toolName: "claude" });
			return emitter.emit("tool:claude:start", payload);
		},

		claudeProgress(
			prompt: string,
			elapsedMs: number,
			label?: string,
			paneId?: string,
		) {
			return emitter.emit("tool:claude:progress", {
				prompt,
				elapsedMs,
				label,
				paneId,
			});
		},

		claudePlanApproval(payload: ToolClaudePlanApprovalPayload) {
			return emitter.emit("tool:claude:plan:approval", payload);
		},

		claudeComplete(payload: ToolClaudeCompletePayload) {
			return emitter.emit("tool:claude:complete", payload);
		},

		claudeError(payload: ToolClaudeErrorPayload) {
			return emitter.emit("tool:claude:error", payload);
		},

		// ========================================================================
		// Tool: ClaudeSdk Events
		// ========================================================================

		claudeSdkStart(payload: ToolClaudeSdkStartPayload) {
			emitter.setContext({ toolName: "claudeSdk" });
			return emitter.emit("tool:claudeSdk:start", payload);
		},

		claudeSdkRetry(payload: ToolClaudeSdkRetryPayload) {
			return emitter.emit("tool:claudeSdk:retry", payload);
		},

		claudeSdkComplete(payload: ToolClaudeSdkCompletePayload) {
			return emitter.emit("tool:claudeSdk:complete", payload);
		},

		claudeSdkError(payload: ToolClaudeSdkErrorPayload) {
			return emitter.emit("tool:claudeSdk:error", payload);
		},

		// ========================================================================
		// Tool: AgentSession Events
		// ========================================================================

		agentSessionStart(payload: ToolAgentSessionStartPayload) {
			emitter.setContext({ toolName: "agentSession" });
			return emitter.emit("tool:agentSession:start", payload);
		},

		agentSessionMessage(payload: ToolAgentSessionMessagePayload) {
			return emitter.emit("tool:agentSession:message", payload);
		},

		agentSessionComplete(payload: ToolAgentSessionCompletePayload) {
			return emitter.emit("tool:agentSession:complete", payload);
		},

		agentSessionError(payload: ToolAgentSessionErrorPayload) {
			return emitter.emit("tool:agentSession:error", payload);
		},

		// ========================================================================
		// Tool: Hook Events
		// ========================================================================

		hookStart(payload: ToolHookStartPayload) {
			emitter.setContext({ toolName: "hook" });
			return emitter.emit("tool:hook:start", payload);
		},

		hookComplete(payload: ToolHookCompletePayload) {
			return emitter.emit("tool:hook:complete", payload);
		},

		// ========================================================================
		// Tool: Checklist Events
		// ========================================================================

		checklistStart(payload: ToolChecklistStartPayload) {
			emitter.setContext({ toolName: "checklist" });
			return emitter.emit("tool:checklist:start", payload);
		},

		checklistItemComplete(payload: ToolChecklistItemCompletePayload) {
			return emitter.emit("tool:checklist:item:complete", payload);
		},

		checklistComplete(payload: ToolChecklistCompletePayload) {
			return emitter.emit("tool:checklist:complete", payload);
		},

		// ========================================================================
		// Tool: Git Events
		// ========================================================================

		gitCommit(payload: ToolGitCommitPayload) {
			emitter.setContext({ toolName: "git" });
			return emitter.emit("tool:git:commit", payload);
		},

		gitBranchCreate(payload: ToolGitBranchCreatePayload) {
			emitter.setContext({ toolName: "git" });
			return emitter.emit("tool:git:branch:create", payload);
		},

		gitBranchSwitch(payload: ToolGitBranchSwitchPayload) {
			emitter.setContext({ toolName: "git" });
			return emitter.emit("tool:git:branch:switch", payload);
		},

		gitBranchDelete(payload: ToolGitBranchDeletePayload) {
			emitter.setContext({ toolName: "git" });
			return emitter.emit("tool:git:branch:delete", payload);
		},

		gitWorktreeAdd(payload: ToolGitWorktreeAddPayload) {
			emitter.setContext({ toolName: "git" });
			return emitter.emit("tool:git:worktree:add", payload);
		},

		gitWorktreeRemove(payload: ToolGitWorktreeRemovePayload) {
			emitter.setContext({ toolName: "git" });
			return emitter.emit("tool:git:worktree:remove", payload);
		},

		gitStatus(payload: ToolGitStatusPayload) {
			emitter.setContext({ toolName: "git" });
			return emitter.emit("tool:git:status", payload);
		},

		gitStash(payload: ToolGitStashPayload) {
			emitter.setContext({ toolName: "git" });
			return emitter.emit("tool:git:stash", payload);
		},

		gitError(payload: ToolGitErrorPayload) {
			emitter.setContext({ toolName: "git" });
			return emitter.emit("tool:git:error", payload);
		},

		// ========================================================================
		// Retry Events
		// ========================================================================

		retryStart(payload: RetryStartPayload) {
			return emitter.emit("retry:start", payload);
		},

		retryAttempt(payload: RetryAttemptPayload) {
			return emitter.emit("retry:attempt", payload);
		},

		retrySuccess(payload: RetrySuccessPayload) {
			return emitter.emit("retry:success", payload);
		},

		retryExhausted(payload: RetryExhaustedPayload) {
			return emitter.emit("retry:exhausted", payload);
		},

		// ========================================================================
		// Circuit Breaker Events
		// ========================================================================

		circuitBreakerOpened(payload: CircuitBreakerOpenedPayload) {
			return emitter.emit("circuit:opened", payload);
		},

		circuitBreakerHalfOpen(payload: CircuitBreakerHalfOpenPayload) {
			return emitter.emit("circuit:halfopen", payload);
		},

		circuitBreakerClosed(payload: CircuitBreakerClosedPayload) {
			return emitter.emit("circuit:closed", payload);
		},

		circuitBreakerTest(payload: CircuitBreakerTestPayload) {
			return emitter.emit("circuit:test", payload);
		},

		circuitBreakerTrip(payload: CircuitBreakerTripPayload) {
			return emitter.emit("circuit:trip", payload);
		},

		circuitBreakerRejected(payload: CircuitBreakerRejectedPayload) {
			return emitter.emit("circuit:rejected", payload);
		},

		// ========================================================================
		// Tool: JSON Events
		// ========================================================================

		jsonStart(action: string, label?: string) {
			emitter.setContext({ toolName: "json" });
			return emitter.emit("tool:json:start", { action, label });
		},

		jsonComplete(
			action: string,
			success: boolean,
			result?: unknown,
			label?: string,
		) {
			return emitter.emit("tool:json:complete", {
				action,
				success,
				result,
				label,
			});
		},

		// ========================================================================
		// State Events
		// ========================================================================

		stateVariableSet(name: string, value: unknown, previousValue?: unknown) {
			return emitter.emit("state:variable:set", { name, value, previousValue });
		},

		stateVariableGet(name: string, value: unknown, existed: boolean) {
			return emitter.emit("state:variable:get", { name, value, existed });
		},

		stateMerge(updates: Record<string, unknown>, resultKeys: string[]) {
			return emitter.emit("state:merge", { updates, resultKeys });
		},

		// ========================================================================
		// Infrastructure Events
		// ========================================================================

		tmuxPaneCreate(payload: TmuxPaneCreatePayload) {
			emitter.setContext({ paneId: payload.paneId });
			return emitter.emit("tmux:pane:create", payload);
		},

		tmuxPaneClose(payload: TmuxPaneClosePayload) {
			return emitter.emit("tmux:pane:close", payload);
		},

		serverStart(port: number, host: string) {
			return emitter.emit("server:start", { port, host });
		},

		serverStop(port: number, uptime: number) {
			return emitter.emit("server:stop", { port, uptime });
		},

		cleanupStart(payload: CleanupStartPayload) {
			return emitter.emit("cleanup:start", payload);
		},

		cleanupComplete(payload: CleanupCompletePayload) {
			return emitter.emit("cleanup:complete", payload);
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
	createCompletePayload: (
		duration: number,
		result: R,
	) => PayloadByType<typeof completeType>,
	fn: () => R | Promise<R>,
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
