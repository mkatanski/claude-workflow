/**
 * Claude Workflow - LangGraph-based workflow engine.
 *
 * This package provides tools for building and running workflows
 * that orchestrate Claude Code and other tools.
 */

// LangGraph-based workflow components (new architecture)
export {
	// State
	WorkflowState,
	// Workflow graph
	WorkflowGraph,
	START,
	END,
	// Tool creation
	createWorkflowTools,
	// Type guard
	isLangGraphWorkflow,
} from "./core/graph/index.ts";

// Type exports
export type {
	// State types
	WorkflowStateType,
	WorkflowStateUpdate,
	// Tool types
	WorkflowTools,
	WorkflowToolsConfig,
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
	// Workflow graph types
	WorkflowGraphConfig,
	NodeFunction,
	RoutingFunction,
	// Workflow definition types
	LangGraphWorkflowDefinition,
	LangGraphWorkflowFactory,
} from "./core/graph/index.ts";

// Configuration types from legacy system (still useful)
export type {
	ClaudeConfig,
	ClaudeSdkConfig,
	TmuxConfig,
} from "./types/index.ts";
