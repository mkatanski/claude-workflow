/**
 * LangGraph-based workflow module.
 *
 * This module provides the core components for building workflows
 * using LangGraph's StateGraph as the underlying execution engine.
 */

// State definition
export { WorkflowState } from "./state.ts";
export type { WorkflowStateType, WorkflowStateUpdate } from "./state.ts";

// Tool interfaces
export type {
	WorkflowTools,
	BashOptions,
	BashResult,
	ClaudeOptions,
	ClaudeResult,
	ClaudeSdkOptions,
	ClaudeSdkResult,
	JsonAction,
	JsonOptions,
	JsonResult,
	ChecklistItem,
	ChecklistOptions,
	ChecklistResult,
	HookResult,
} from "./tools.ts";

// Tool implementation
export { createWorkflowTools } from "./workflowTools.ts";
export type { WorkflowToolsConfig } from "./workflowTools.ts";

// Workflow graph
export { WorkflowGraph, START, END } from "./workflowGraph.ts";
export type {
	WorkflowGraphConfig,
	NodeFunction,
	RoutingFunction,
} from "./workflowGraph.ts";

// Workflow definition types
export type {
	LangGraphWorkflowDefinition,
	LangGraphWorkflowFactory,
} from "./types.ts";
export { isLangGraphWorkflow } from "./types.ts";
