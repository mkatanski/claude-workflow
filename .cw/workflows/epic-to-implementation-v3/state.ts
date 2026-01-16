/**
 * State Management for Epic-to-Implementation V3 Workflow
 *
 * Provides typed accessors for workflow state using the WorkflowTools interface.
 * Uses the existing WorkflowGraph's variables system with type-safe getters/setters.
 */

import type { WorkflowTools } from "../../../src/core/graph/tools.ts";
import type {
	ArchitectureState,
	DriftState,
	EpicData,
	GitState,
	Milestone,
	ScopeAnalysis,
	Story,
	TestLoopState,
	WorkflowConfig,
	WorkflowMode,
	WorkflowPhase,
} from "./types.ts";

/**
 * Default configuration values.
 */
export const DEFAULT_CONFIG: WorkflowConfig = {
	promptFile: ".cw/epic-prompt.md",
	outputDir: ".cw/generated",
	maxTestRetries: 3,
	maxDriftFixAttempts: 5,
	simpleEpicThreshold: 15,
};

/**
 * Typed state accessors for the workflow.
 *
 * These provide type-safe access to workflow variables without
 * needing to specify types at every call site.
 */
export const StateKeys = {
	// Configuration
	config: "config",

	// Epic data
	epic: "epic",

	// Scope analysis
	scope: "scope",
	mode: "mode",

	// Git state
	git: "git",

	// Architecture
	architecture: "architecture",

	// Milestones
	milestones: "milestones",
	currentMilestoneIndex: "currentMilestoneIndex",

	// Stories
	stories: "stories",
	currentStoryIndex: "currentStoryIndex",

	// Test loop
	testLoop: "testLoop",

	// Drift
	drift: "drift",

	// Cross-milestone context
	cumulativeSummary: "cumulativeSummary",

	// Workflow tracking
	phase: "phase",
	tempDir: "tempDir",
	workflowId: "workflowId",
	depsBefore: "depsBefore",
} as const;

/**
 * Get workflow configuration.
 */
export function getConfig(tools: WorkflowTools): WorkflowConfig {
	return tools.getVar<WorkflowConfig>(StateKeys.config) ?? DEFAULT_CONFIG;
}

/**
 * Get epic data.
 */
export function getEpic(tools: WorkflowTools): EpicData | undefined {
	return tools.getVar<EpicData>(StateKeys.epic);
}

/**
 * Get scope analysis result.
 */
export function getScope(tools: WorkflowTools): ScopeAnalysis | undefined {
	return tools.getVar<ScopeAnalysis>(StateKeys.scope);
}

/**
 * Get workflow mode.
 */
export function getMode(tools: WorkflowTools): WorkflowMode {
	return tools.getVar<WorkflowMode>(StateKeys.mode) ?? "unknown";
}

/**
 * Get git state.
 */
export function getGit(tools: WorkflowTools): GitState | undefined {
	return tools.getVar<GitState>(StateKeys.git);
}

/**
 * Get architecture state.
 */
export function getArchitecture(
	tools: WorkflowTools,
): ArchitectureState | undefined {
	return tools.getVar<ArchitectureState>(StateKeys.architecture);
}

/**
 * Get milestones array.
 */
export function getMilestones(tools: WorkflowTools): Milestone[] {
	return tools.getVar<Milestone[]>(StateKeys.milestones) ?? [];
}

/**
 * Get current milestone index.
 */
export function getCurrentMilestoneIndex(tools: WorkflowTools): number {
	return tools.getVar<number>(StateKeys.currentMilestoneIndex) ?? 0;
}

/**
 * Get current milestone.
 */
export function getCurrentMilestone(
	tools: WorkflowTools,
): Milestone | undefined {
	const milestones = getMilestones(tools);
	const index = getCurrentMilestoneIndex(tools);
	return milestones[index];
}

/**
 * Get stories array.
 */
export function getStories(tools: WorkflowTools): Story[] {
	return tools.getVar<Story[]>(StateKeys.stories) ?? [];
}

/**
 * Get current story index.
 */
export function getCurrentStoryIndex(tools: WorkflowTools): number {
	return tools.getVar<number>(StateKeys.currentStoryIndex) ?? 0;
}

/**
 * Get current story.
 */
export function getCurrentStory(tools: WorkflowTools): Story | undefined {
	const stories = getStories(tools);
	const index = getCurrentStoryIndex(tools);
	return stories[index];
}

/**
 * Get test loop state.
 */
export function getTestLoop(tools: WorkflowTools): TestLoopState {
	return (
		tools.getVar<TestLoopState>(StateKeys.testLoop) ?? {
			retryCount: 0,
			passed: false,
			lintPassed: false,
			lastOutput: "",
			lastLintOutput: "",
		}
	);
}

/**
 * Get drift state.
 */
export function getDrift(tools: WorkflowTools): DriftState {
	return (
		tools.getVar<DriftState>(StateKeys.drift) ?? {
			fixCount: 0,
			aligned: true,
			issues: [],
			keepImprovements: [],
		}
	);
}

/**
 * Get cumulative summary for cross-milestone context.
 */
export function getCumulativeSummary(tools: WorkflowTools): string {
	return tools.getVar<string>(StateKeys.cumulativeSummary) ?? "";
}

/**
 * Get current workflow phase.
 */
export function getPhase(tools: WorkflowTools): WorkflowPhase {
	return tools.getVar<WorkflowPhase>(StateKeys.phase) ?? "init";
}

/**
 * Get temp directory path.
 */
export function getTempDir(tools: WorkflowTools): string {
	return tools.getVar<string>(StateKeys.tempDir) ?? "";
}

/**
 * Get workflow ID.
 */
export function getWorkflowId(tools: WorkflowTools): string {
	return tools.getVar<string>(StateKeys.workflowId) ?? "";
}

/**
 * Check if there are more stories to process.
 */
export function hasMoreStories(tools: WorkflowTools): boolean {
	const stories = getStories(tools);
	const index = getCurrentStoryIndex(tools);
	return index < stories.length;
}

/**
 * Check if there are more milestones to process.
 */
export function hasMoreMilestones(tools: WorkflowTools): boolean {
	const milestones = getMilestones(tools);
	const index = getCurrentMilestoneIndex(tools);
	return index < milestones.length;
}

/**
 * Check if test retries are exhausted.
 */
export function isTestRetriesExhausted(tools: WorkflowTools): boolean {
	const config = getConfig(tools);
	const testLoop = getTestLoop(tools);
	return testLoop.retryCount >= config.maxTestRetries;
}

/**
 * Check if drift fix attempts are exhausted.
 */
export function isDriftFixExhausted(tools: WorkflowTools): boolean {
	const config = getConfig(tools);
	const drift = getDrift(tools);
	return drift.fixCount >= config.maxDriftFixAttempts;
}
