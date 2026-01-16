/**
 * Types for Epic-to-Implementation V3 Workflow
 *
 * Contains interfaces for Stories, Milestones, DriftIssues, and other
 * domain-specific types used throughout the workflow.
 */

/**
 * Story status in the workflow.
 */
export type StoryStatus = "pending" | "in_progress" | "completed" | "failed";

/**
 * A single implementation story.
 */
export interface Story {
	id: string;
	title: string;
	description: string;
	priority: number;
	dependencies: string[];
	acceptanceCriteria: string[];
	implementationHints?: string[];
	estimatedEffort?: "small" | "medium" | "large";
	status?: StoryStatus;
	testsPassed?: boolean;
}

/**
 * A milestone grouping multiple stories.
 */
export interface Milestone {
	id: string;
	title: string;
	description: string;
	goals: string[];
	phase: "foundation" | "core" | "features" | "integration";
	storyCount: number;
	completed: boolean;
	commitSha?: string;
}

/**
 * Drift issue categories from drift check.
 */
export type DriftCategory = "keep" | "fix" | "defer" | "remove";

/**
 * A single drift issue.
 */
export interface DriftIssue {
	category: DriftCategory;
	description: string;
	file?: string;
	recommendation: string;
}

/**
 * Scope analysis result from epic-scope-analyzer.
 */
export interface ScopeAnalysis {
	needsMilestones: boolean;
	estimatedStoryCount: number;
	complexityScore: number;
	reasoning?: string;
}

/**
 * Git state tracking.
 */
export interface GitState {
	branchName: string;
	originalBranch: string;
	hasUncommittedChanges: boolean;
	stashRef?: string;
	finalCommitSha?: string;
}

/**
 * Test loop state for retry handling.
 */
export interface TestLoopState {
	retryCount: number;
	passed: boolean;
	lintPassed: boolean;
	lastOutput: string;
	lastLintOutput: string;
}

/**
 * Drift check and fix state.
 */
export interface DriftState {
	fixCount: number;
	aligned: boolean;
	issues: DriftIssue[];
	keepImprovements: DriftIssue[];
}

/**
 * Epic metadata parsed from prompt.
 */
export interface EpicData {
	promptContent: string;
	title: string;
	description?: string;
	codebaseStructure: string;
}

/**
 * Architecture document state.
 */
export interface ArchitectureState {
	document: string;
	version: number;
	pendingUpdates: string[];
}

/**
 * Configuration for the workflow.
 */
export interface WorkflowConfig {
	promptFile: string;
	outputDir: string;
	maxTestRetries: number;
	maxDriftFixAttempts: number;
	simpleEpicThreshold: number;
}

/**
 * Workflow mode after scope analysis.
 */
export type WorkflowMode = "simple" | "milestone" | "unknown";

/**
 * Workflow phase tracking.
 */
export type WorkflowPhase =
	| "init"
	| "scope_analysis"
	| "setup"
	| "architecture"
	| "stories"
	| "post_stories"
	| "milestone_commit"
	| "finalization"
	| "completed"
	| "error";
