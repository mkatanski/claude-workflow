/**
 * Phase 0: Scope Analysis
 *
 * Analyzes the epic prompt to determine:
 * - Estimated story count
 * - Complexity score
 * - Whether milestones are needed
 * - Workflow mode (simple vs milestone)
 */

import type {
	StepDefinition,
	WorkflowBuilder,
} from "../../../../src/types/index.ts";
import {
	claudeSkill,
	ensureDir,
	extractField,
	logKeyValues,
	logPhase,
	readFile,
} from "../helpers/index.ts";

/**
 * Generate steps for Phase 0: Scope Analysis.
 */
export function phase0ScopeAnalysis(t: WorkflowBuilder): StepDefinition[] {
	return [
		// Set phase
		t.step("Phase 0 start", t.set("workflow_phase", "scope_analysis")),

		// Log phase header
		logPhase(t, "PHASE 0: EPIC SCOPE ANALYSIS"),

		// Ensure output directory exists
		ensureDir(t, "{output_dir}"),

		// Setup temp directory
		t.step(
			"Setup temp directory",
			t.bash(`WORKFLOW_ID=$(date +%Y%m%d%H%M%S)-$$
mkdir -p .cw/tmp/orchestrator-\${WORKFLOW_ID}
echo "\${WORKFLOW_ID}"`),
			{ output: "workflow_id" },
		),

		t.step(
			"Set temp dir path",
			t.set("temp_dir", ".cw/tmp/orchestrator-{workflow_id}"),
		),

		// Read epic prompt
		readFile(t, "epic prompt file", "{prompt_file}", {
			output: "epic_prompt_content",
			allowEmpty: true,
		}),

		// Validate prompt file
		t.step(
			"Validate prompt file exists",
			t.bash(`if [ ! -s "{prompt_file}" ]; then
  echo "ERROR: Epic prompt file is empty or missing: {prompt_file}"
  echo "Please create the file with your feature/epic description and run again."
  exit 1
fi
echo "Prompt file loaded successfully ({prompt_file})"`),
			{ onError: "stop" },
		),

		// Capture initial dependencies
		t.step(
			"Capture initial dependencies",
			t.bash(
				"cat pyproject.toml 2>/dev/null || cat package.json 2>/dev/null || cat requirements.txt 2>/dev/null || echo ''",
			),
			{ output: "deps_before" },
		),

		// Analyze codebase structure
		t.step(
			"Analyze codebase structure",
			t.bash(`echo "=== Project Files ==="
find . -type f \\( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.py" -o -name "*.go" -o -name "*.rs" -o -name "*.java" \\) \\
  ! -path "*/node_modules/*" ! -path "*/.venv/*" ! -path "*/dist/*" ! -path "*/build/*" ! -path "*/__pycache__/*" ! -path "*/.git/*" \\
  2>/dev/null | head -100
echo ""
echo "=== Directory Structure ==="
find . -type d ! -path "*/node_modules/*" ! -path "*/.venv/*" ! -path "*/.git/*" ! -path "*/dist/*" ! -path "*/__pycache__/*" -maxdepth 4 2>/dev/null | head -60`),
			{ output: "codebase_structure" },
		),

		// Run epic scope analysis skill
		claudeSkill(
			t,
			"epic-scope-analyzer",
			`Use the /epic-scope-analyzer skill to analyze this epic prompt and determine its scope.

## Epic Prompt
{epic_prompt_content}

## Codebase Structure
{codebase_structure}

Save the analysis result as JSON to: {temp_dir}/scope-analysis.json

Output only "SAVED" when done.`,
			{ output: "scope_analysis_result", model: "opus" },
		),

		// Read scope analysis
		readFile(t, "scope analysis", "{temp_dir}/scope-analysis.json", {
			output: "scope_analysis_json",
		}),

		// Parse scope analysis results
		extractField(
			t,
			"needs_milestones",
			"scope_analysis_json",
			"needs_milestones",
		),
		extractField(
			t,
			"estimated story count",
			"scope_analysis_json",
			"estimated_story_count",
		),
		extractField(
			t,
			"complexity score",
			"scope_analysis_json",
			"complexity_score",
		),

		// Initialize decisions log
		t.step(
			"Initialize decisions log",
			t.bash(`cat > {output_dir}/decisions.md << 'EOF'
# Epic Implementation Decisions Log

This document records key decisions made during epic implementation.

## Scope Analysis Decision

- **Date**: $(date +%Y-%m-%d\\ %H:%M)
- **Estimated Stories**: {estimated_story_count}
- **Complexity Score**: {complexity_score}
- **Milestones Needed**: {needs_milestones}

---

EOF
echo "Decisions log initialized"`),
		),

		// Determine workflow mode
		t.step(
			"Determine workflow mode",
			t.bash(`if [ "{needs_milestones}" = "true" ]; then
  echo "milestone"
else
  echo "simple"
fi`),
			{ output: "workflow_mode" },
		),

		// Log scope analysis results
		logKeyValues(t, "Scope Analysis Results", [
			{ key: "Estimated stories", varName: "estimated_story_count" },
			{ key: "Complexity", varName: "complexity_score" },
			{ key: "Needs milestones", varName: "needs_milestones" },
			{ key: "Workflow mode", varName: "workflow_mode" },
		]),
	];
}
