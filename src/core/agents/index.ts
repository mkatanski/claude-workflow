/**
 * Agents module for the Claude Agent SDK.
 *
 * Provides built-in agents (Plan), agent registry management,
 * plan mode configuration, and plan file storage.
 *
 * Note: The Explore agent is provided by the SDK's built-in Explore agent.
 *
 * @module
 */

// =============================================================================
// Type Exports
// =============================================================================

export type {
	AgentConfigOptions,
	AgentOverride,
	BuiltInAgentDefinition,
	BuiltInAgentName,
	ParsedPlan,
	PlanFile,
	PlanModeConfig,
	PlanModeResult,
	PlanStatus,
	PlanSummary,
} from "./types.js";

export { READ_ONLY_TOOLS } from "./types.js";

// =============================================================================
// Built-in Agents
// =============================================================================

export {
	BUILT_IN_AGENTS,
	getBuiltInAgent,
	getBuiltInAgentNames,
	isBuiltInAgent,
	PLAN_AGENT,
} from "./builtInAgents.js";

// =============================================================================
// Agent Registry
// =============================================================================

export type { MergedAgents } from "./agentRegistry.js";

export {
	getAvailableAgentNames,
	getMergedAgentDefinitions,
	hasBuiltInAgents,
	mergeAgents,
} from "./agentRegistry.js";

// =============================================================================
// Plan Mode Prompts
// =============================================================================

export {
	buildPlanModeSystemPrompt,
	hasPlanModeReminder,
	PLAN_MODE_FULL_SYSTEM_PROMPT,
	PLAN_MODE_SYSTEM_REMINDER,
	removePlanModeReminder,
} from "./planModePrompts.js";

// =============================================================================
// Plan Storage
// =============================================================================

export type { PlanStorageError, PlanStorageResult } from "./planStorage.js";

export {
	createPlanFromOutput,
	deletePlan,
	getPlanFilePath,
	listPlans,
	loadPlan,
	parseCriticalFiles,
	parseImplementationSteps,
	parsePlanContent,
	savePlan,
	updatePlanStatus,
} from "./planStorage.js";
