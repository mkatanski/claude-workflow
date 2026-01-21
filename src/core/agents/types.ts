/**
 * Type definitions for the agents module.
 *
 * Provides types for built-in agents, plan mode configuration,
 * plan file storage, and agent configuration options.
 */

import type {
	BuiltInTool,
	ModelSpec,
	SubagentDefinition,
} from "../tools/claudeAgent.types.js";

// ============================================================================
// Built-in Agent Types
// ============================================================================

/**
 * Names of built-in agents provided by the framework.
 * Note: Explore agent is not included as the SDK has a built-in Explore agent.
 */
export type BuiltInAgentName = "Plan";

/**
 * Read-only tools available for plan mode and exploration.
 * These tools cannot modify files or execute commands.
 */
export const READ_ONLY_TOOLS: BuiltInTool[] = [
	"Read",
	"Glob",
	"Grep",
	"WebFetch",
	"WebSearch",
];

/**
 * Write tools that should be disallowed in read-only mode.
 * These tools can modify files or execute commands.
 */
export const WRITE_TOOLS: BuiltInTool[] = [
	"Write",
	"Edit",
	"Bash",
	"NotebookEdit",
];

/**
 * Definition for a built-in agent.
 * Extends SubagentDefinition with additional metadata.
 */
export interface BuiltInAgentDefinition extends SubagentDefinition {
	/** Whether this agent is read-only (no file modifications) */
	readonly readOnly: boolean;
	/** Whether this agent supports plan mode */
	readonly supportsPlanMode: boolean;
}

// ============================================================================
// Plan Mode Types
// ============================================================================

/**
 * Configuration for plan mode execution.
 */
export interface PlanModeConfig {
	/** Whether plan mode is enabled */
	enabled: boolean;
	/** Auto-approve plans without user confirmation (default: true) */
	autoApprove: boolean;
	/** Session ID for tracking the plan */
	sessionId: string;
	/** Output format for the plan */
	outputFormat?: "markdown" | "json";
}

/**
 * Status of a plan file.
 */
export type PlanStatus = "pending" | "approved" | "rejected" | "executed";

/**
 * Represents a plan file stored on disk.
 */
export interface PlanFile {
	/** Session ID that created this plan */
	sessionId: string;
	/** ISO timestamp when the plan was created */
	createdAt: string;
	/** ISO timestamp when the plan was last updated */
	updatedAt: string;
	/** The plan content (markdown or structured) */
	content: string;
	/** Critical files identified in the plan */
	criticalFiles: string[];
	/** Current status of the plan */
	status: PlanStatus;
	/** ISO timestamp when the plan was approved (if applicable) */
	approvedAt?: string;
	/** Additional metadata about the plan */
	metadata?: Record<string, unknown>;
}

/**
 * Summary of a plan for quick reference.
 */
export interface PlanSummary {
	/** Session ID */
	sessionId: string;
	/** Number of steps in the plan */
	stepCount: number;
	/** Number of critical files identified */
	criticalFileCount: number;
	/** Plan status */
	status: PlanStatus;
	/** ISO timestamp when created */
	createdAt: string;
}

// ============================================================================
// Agent Configuration Types
// ============================================================================

/**
 * Override configuration for a built-in agent.
 * Allows customizing specific properties without replacing the entire definition.
 */
export interface AgentOverride {
	/** Override the description */
	description?: string;
	/** Override the system prompt */
	prompt?: string;
	/** Override the available tools */
	tools?: BuiltInTool[];
	/** Override the model */
	model?: ModelSpec;
}

/**
 * Configuration options for agent management.
 */
export interface AgentConfigOptions {
	/** Custom agent definitions to add */
	customAgents?: Record<string, SubagentDefinition>;
	/** Built-in agents to exclude */
	excludeBuiltIn?: BuiltInAgentName[];
	/** Overrides for built-in agents */
	overrides?: Partial<Record<BuiltInAgentName, AgentOverride>>;
}

// ============================================================================
// Extended Result Types
// ============================================================================

/**
 * Extended agent session result with plan information.
 */
export interface PlanModeResult {
	/** Whether the planning was successful */
	success: boolean;
	/** The generated plan */
	plan?: PlanFile;
	/** Path to the saved plan file */
	planPath?: string;
	/** Error message if planning failed */
	error?: string;
}

/**
 * Plan parsing result from agent output.
 */
export interface ParsedPlan {
	/** Extracted plan content */
	content: string;
	/** Identified critical files */
	criticalFiles: string[];
	/** Identified implementation steps */
	steps: string[];
	/** Any warnings during parsing */
	warnings?: string[];
}
