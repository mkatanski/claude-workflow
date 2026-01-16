/**
 * Epic to Implementation Pipeline V3
 *
 * A LangGraph-native workflow for implementing large features from epic prompts.
 *
 * KEY IMPROVEMENTS OVER V2:
 * - Native LangGraph patterns for loops via conditional edges
 * - Typed state accessors with proper TypeScript types
 * - Clean, modular node organization
 * - Structured outputs via claudeSdk
 * - Simplified graph structure without helper abstractions
 *
 * WORKFLOW MODES:
 * - Simple mode (<15 stories): Single-pass implementation
 * - Milestone mode (>=15 stories): Multi-phase with context carryover
 *
 * USAGE:
 * 1. Create .cw/epic-prompt.md with your feature/epic description
 * 2. Run: cw run epic-to-implementation-v3
 * 3. The workflow will:
 *    - Analyze epic scope and complexity
 *    - Create architecture document
 *    - Generate and implement stories
 *    - Run tests with retry loop
 *    - Check for architectural drift
 *    - Create feature branch with commits
 *
 * OUTPUT:
 * - .cw/generated/epic-description.md
 * - .cw/generated/architecture.md
 * - .cw/generated/stories.json (or stories-M1.json, etc.)
 * - .cw/generated/milestones.json (if milestone mode)
 * - .cw/generated/decisions.md
 * - Feature branch: epic/<title>-<date>
 */

import type { LangGraphWorkflowDefinition } from "../../../src/core/graph/types.ts";
import type { ClaudeConfig, TmuxConfig } from "../../../src/types/index.ts";
import { buildGraph } from "./graph.ts";
import { DEFAULT_CONFIG } from "./state.ts";

/**
 * Claude Code configuration for the workflow.
 */
const claudeConfig: ClaudeConfig = {
	model: "sonnet",
	interactive: true,
	dangerouslySkipPermissions: true,
};

/**
 * Tmux configuration for interactive mode.
 */
const tmuxConfig: TmuxConfig = {
	split: "vertical",
	idleTime: 5.0,
};

/**
 * Initial workflow variables.
 */
const initialVars: Record<string, unknown> = {
	config: DEFAULT_CONFIG,
};

/**
 * Epic to Implementation V3 Workflow Definition
 */
const workflow: LangGraphWorkflowDefinition = {
	name: "Epic to Implementation Pipeline V3",
	description:
		"LangGraph-native workflow for implementing large features from epic prompts with typed state, conditional routing, and structured outputs.",
	vars: initialVars,
	claude: claudeConfig,
	tmux: tmuxConfig,
	build: buildGraph,
};

/**
 * Workflow factory function - default export.
 */
export default () => workflow;
