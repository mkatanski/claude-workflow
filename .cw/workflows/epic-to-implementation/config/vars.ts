/**
 * Default workflow variables for the Epic to Implementation Pipeline.
 */

import type { ClaudeConfig, TmuxConfig } from "../../../../src/types/index.ts";

/**
 * Default workflow variables organized by category.
 */
export const defaultVars: Record<string, string> = {
	// Input configuration
	prompt_file: ".cw/epic-prompt.md",
	output_dir: ".cw/generated",

	// Limits and configuration
	max_test_retries: "3",
	max_drift_fix_attempts: "5",
	simple_epic_threshold: "15",

	// Epic scope analysis results
	needs_milestones: "false",
	estimated_story_count: "0",
	complexity_score: "0",

	// Milestone tracking
	milestones_json: "",
	milestones_count: "0",
	current_milestone_index: "0",
	current_milestone: "",
	milestone_id: "",
	milestone_title: "",
	milestone_goals: "",

	// Story loop state
	stories_json: "",
	stories_count: "0",
	current_story_index: "0",
	current_story: "",
	story_id: "",
	story_title: "",
	test_retry_count: "0",
	drift_fix_count: "0",

	// Workflow phase tracking
	workflow_phase: "init",
	workflow_mode: "unknown",

	// Results
	epic_title: "",
	branch_name: "",
	architecture_document: "",
	architecture_version: "1",
	original_branch: "",
	has_uncommitted_changes: "false",

	// Cross-milestone state
	cumulative_implementation_summary: "",

	// Learning tracking
	test_failure_occurred: "false",
	deps_before: "",

	// Temp file management
	workflow_id: "",
	temp_dir: "",

	// Test and lint state
	lint_passed: "true",
	lint_output: "",
	tests_passed: "true",
	test_output: "",
	test_status: "unknown",

	// Drift state
	drift_check_result: "",
	architecture_aligned: "true",
	architecture_updates: "",
	drift_fix_issues: "",
	drift_fix_issues_count: "0",
	updated_architecture: "",

	// Final state
	final_lint_passed: "true",
	final_lint_output: "",
	final_tests_passed: "true",
	final_test_output: "",
	final_commit_sha: "",
	commit_message: "",
};

/**
 * Default Claude configuration.
 */
export const claudeConfig: ClaudeConfig = {
	model: "sonnet",
	interactive: true,
	dangerouslySkipPermissions: true,
};

/**
 * Default tmux configuration.
 */
export const tmuxConfig: TmuxConfig = {
	split: "vertical",
	idleTime: 5.0,
};
