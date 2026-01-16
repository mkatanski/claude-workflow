/**
 * Epic to Implementation Pipeline V2
 *
 * Enhanced workflow for implementing large features from epic prompts.
 *
 * KEY IMPROVEMENTS OVER V1:
 * - Phase 0: Epic scope analysis to determine if milestones are needed
 * - Milestone-based execution for large epics (15+ stories)
 * - Living architecture that evolves between milestones
 * - Bidirectional drift checking (code improvements update architecture)
 * - Context reset between milestones to manage window limits
 * - Decision logging throughout the process
 *
 * USAGE:
 * 1. Create .cw/epic-prompt.md with your feature/epic description
 * 2. Run this workflow
 * 3. The workflow will:
 *    - Analyze epic scope and complexity
 *    - If simple (<15 stories): Run v1-style single-pass execution
 *    - If complex: Split into milestones with fresh context per milestone
 *
 * OUTPUT:
 * - .cw/generated/epic-description.md
 * - .cw/generated/architecture.md (living document)
 * - .cw/generated/milestones.json (if applicable)
 * - .cw/generated/stories.json (or stories-M1.json, stories-M2.json, etc.)
 * - .cw/generated/decisions.md (decision log)
 * - Feature branch with all changes committed
 */

import type {
	WorkflowBuilder,
	WorkflowDefinition,
} from "../../../src/types/index.ts";

import { claudeConfig, defaultVars, tmuxConfig } from "./config/index.ts";
import { withCondition } from "./helpers/index.ts";
import {
	finalizationSteps,
	milestoneModeSteps,
	phase0ScopeAnalysis,
	simpleModeSteps,
} from "./phases/index.ts";

/**
 * Main workflow export.
 */
export default (t: WorkflowBuilder): WorkflowDefinition => ({
	name: "Epic to Implementation Pipeline V2",
	vars: defaultVars,
	claude: claudeConfig,
	tmux: tmuxConfig,
	steps: [
		// Phase 0: Scope Analysis (always runs)
		...phase0ScopeAnalysis(t),

		// Simple mode (runs if workflow_mode == "simple")
		...withCondition(simpleModeSteps(t), "{workflow_mode} == simple"),

		// Milestone mode (runs if workflow_mode == "milestone")
		...withCondition(milestoneModeSteps(t), "{workflow_mode} == milestone"),

		// Finalization (always runs)
		...finalizationSteps(t),
	],
});
