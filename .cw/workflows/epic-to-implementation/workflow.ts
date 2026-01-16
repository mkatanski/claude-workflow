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
	StepDefinition,
	WorkflowBuilder,
	WorkflowDefinition,
} from "../../../src/types/index.ts";

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Add a condition to a list of steps.
 */
function withCondition(
	steps: StepDefinition[],
	condition: string,
): StepDefinition[] {
	return steps.map((step) => {
		if ("type" in step) {
			// It's a loop definition, we can't add when directly
			return step;
		}
		return {
			...step,
			when: step.when ? `(${step.when}) && (${condition})` : condition,
		};
	});
}

// ============================================================
// PHASE 0: SCOPE ANALYSIS
// ============================================================

function phase0ScopeAnalysis(t: WorkflowBuilder): StepDefinition[] {
	return [
		t.step("Phase 0 start", t.set("workflow_phase", "scope_analysis")),

		t.step(
			"Log phase 0",
			t.bash(`echo ""
echo "========================================"
echo "PHASE 0: EPIC SCOPE ANALYSIS"
echo "========================================"
echo ""`),
			{ visible: true },
		),

		t.step("Ensure output directory exists", t.bash("mkdir -p {output_dir}")),

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

		t.step(
			"Read epic prompt file",
			t.bash("cat {prompt_file} 2>/dev/null || echo ''"),
			{ output: "epic_prompt_content" },
		),

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

		t.step(
			"Capture initial dependencies",
			t.bash(
				"cat pyproject.toml 2>/dev/null || cat package.json 2>/dev/null || cat requirements.txt 2>/dev/null || echo ''",
			),
			{ output: "deps_before" },
		),

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

		t.step(
			"Run epic scope analysis",
			t.claude(`Use the /epic-scope-analyzer skill to analyze this epic prompt and determine its scope.

## Epic Prompt
{epic_prompt_content}

## Codebase Structure
{codebase_structure}

Save the analysis result as JSON to: {temp_dir}/scope-analysis.json

Output only "SAVED" when done.`),
			{ output: "scope_analysis_result", model: "opus" },
		),

		t.step(
			"Read scope analysis",
			t.bash("cat {temp_dir}/scope-analysis.json"),
			{ output: "scope_analysis_json" },
		),

		t.step(
			"Parse needs_milestones",
			t.json("query", {
				input: "{scope_analysis_json}",
				query: "needs_milestones",
			}),
			{ output: "needs_milestones" },
		),

		t.step(
			"Parse estimated story count",
			t.json("query", {
				input: "{scope_analysis_json}",
				query: "estimated_story_count",
			}),
			{ output: "estimated_story_count" },
		),

		t.step(
			"Parse complexity score",
			t.json("query", {
				input: "{scope_analysis_json}",
				query: "complexity_score",
			}),
			{ output: "complexity_score" },
		),

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

		t.step(
			"Determine workflow mode",
			t.bash(`if [ "{needs_milestones}" = "true" ]; then
  echo "milestone"
else
  echo "simple"
fi`),
			{ output: "workflow_mode" },
		),

		t.step(
			"Log scope analysis results",
			t.bash(`echo ""
echo "=== Scope Analysis Results ==="
echo "Estimated stories: {estimated_story_count}"
echo "Complexity: {complexity_score}"
echo "Needs milestones: {needs_milestones}"
echo "Workflow mode: {workflow_mode}"
echo ""`),
			{ visible: true },
		),
	];
}

// ============================================================
// SIMPLE MODE (V1-STYLE)
// ============================================================

function simpleModeSteps(t: WorkflowBuilder): StepDefinition[] {
	return [
		t.step(
			"Simple mode start",
			t.bash(`echo ""
echo "========================================"
echo "SIMPLE MODE: Single-pass execution"
echo "========================================"`),
			{ visible: true },
		),

		t.step(
			"Analyze epic (simple mode)",
			t.claude(`Use the /analyze-epic skill to analyze this feature request and create a structured epic description.

## Input Prompt
{epic_prompt_content}

Save the FULL markdown document to: {temp_dir}/epic-description.md
Output only "SAVED" when done.`),
			{ model: "opus" },
		),

		t.step(
			"Read epic description (simple)",
			t.bash("cat {temp_dir}/epic-description.md"),
			{
				output: "epic_description",
			},
		),

		t.step(
			"Save epic description",
			t.bash(`cat > {output_dir}/epic-description.md << 'EPIC_EOF'
{epic_description}
EPIC_EOF
echo "Epic description saved"`),
		),

		t.step(
			"Extract epic title (simple)",
			t.claudeSdk({
				prompt: `Extract a short title from this epic description for use in a git branch name.

Epic:
{epic_description}

Rules:
- Maximum 25 characters
- Lowercase letters and hyphens only
- Use hyphens instead of spaces
- Examples: "user-auth", "payment-flow", "dark-mode"`,
				model: "haiku",
				schema: {
					type: "object",
					properties: {
						title: {
							type: "string",
							description:
								"Branch-safe title (lowercase, hyphens, max 25 chars)",
						},
					},
					required: ["title"],
				},
			}),
			{ output: "epic_title_json" },
		),

		t.step(
			"Parse epic title (simple)",
			t.json("query", { input: "{epic_title_json}", query: "title" }),
			{ output: "epic_title" },
		),

		t.step(
			"Generate branch name",
			t.bash(`TITLE=$(echo "{epic_title}" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-' | sed 's/--*/-/g' | sed 's/^-//' | sed 's/-$//' | cut -c1-25)
TIMESTAMP=$(date +%Y%m%d)
echo "feature/\${TIMESTAMP}-\${TITLE}"`),
			{ output: "branch_name" },
		),

		// Git status check (inline builtin:git-status)
		t.step("Get current branch", t.bash("git branch --show-current"), {
			output: "original_branch",
		}),

		t.step(
			"Check uncommitted changes",
			t.bash('[ -n "$(git status --porcelain)" ] && echo true || echo false'),
			{ output: "has_uncommitted_changes" },
		),

		t.step(
			"Stash uncommitted changes",
			t.bash(
				'git stash push -m "epic-workflow-auto-stash-$(date +%Y%m%d-%H%M%S)" && echo "Changes stashed"',
			),
			{ when: "{has_uncommitted_changes} == true" },
		),

		t.step(
			"Create feature branch",
			t.bash(`git checkout -b {branch_name}
echo "Created and switched to branch: {branch_name}"`),
			{ visible: true },
		),

		t.step(
			"Create architecture (simple mode)",
			t.claude(`Use the /create-architecture skill to create an architectural document for this epic.

## Epic Description
{epic_description}

## Codebase Structure
{codebase_structure}

Save the FULL markdown document to: {temp_dir}/architecture.md
Output only "SAVED" when done.`),
			{ model: "opus" },
		),

		t.step(
			"Read architecture (simple)",
			t.bash("cat {temp_dir}/architecture.md"),
			{
				output: "architecture_document",
			},
		),

		t.step(
			"Save architecture document",
			t.bash(`cat > {output_dir}/architecture.md << 'ARCH_EOF'
{architecture_document}
ARCH_EOF
echo "Architecture document saved"`),
		),

		t.step(
			"Generate stories (simple mode)",
			t.claude(`Use the /generate-stories skill to create implementation stories.

## Epic Description
{epic_description}

## Architecture Document
{architecture_document}

Save the FULL JSON array to: {temp_dir}/stories.json
Output only "SAVED" when done.`),
			{ model: "opus" },
		),

		t.step("Read stories (simple)", t.bash("cat {temp_dir}/stories.json"), {
			output: "stories_raw",
		}),

		t.step(
			"Save stories to file",
			t.bash(`cat > {output_dir}/stories.json << 'STORIES_EOF'
{stories_raw}
STORIES_EOF
echo "Stories saved"`),
		),

		t.step(
			"Parse stories count (simple)",
			t.json("query", { input: "{stories_raw}", query: "length(@)" }),
			{ output: "stories_count" },
		),

		t.step(
			"Store stories for iteration (simple)",
			t.set("stories_json", "{stories_raw}"),
		),

		t.step(
			"Log simple mode ready",
			t.bash(`echo ""
echo "Simple mode ready"
echo "Stories to implement: {stories_count}"
echo ""`),
			{ visible: true },
		),

		// Story loop for simple mode
		...storyLoopSteps(t),

		// Post-stories phase
		...postStoriesPhase(t),
	];
}

// ============================================================
// MILESTONE MODE
// ============================================================

function milestoneModeSteps(t: WorkflowBuilder): StepDefinition[] {
	return [
		t.step(
			"Milestone mode start",
			t.bash(`echo ""
echo "========================================"
echo "MILESTONE MODE: Multi-pass execution"
echo "========================================"`),
			{ visible: true },
		),

		t.step(
			"Log decision: Using milestones",
			t.bash(`cat >> {output_dir}/decisions.md << EOF

## Decision: Using Milestone-Based Execution

**Reason**: Epic scope requires milestone-based execution due to:
- Estimated {estimated_story_count} stories
- Complexity score: {complexity_score}
- Need for context management between phases

EOF`),
		),

		t.step(
			"Phase 1 milestone planning",
			t.set("workflow_phase", "milestone_planning"),
		),

		t.step(
			"Log phase 1",
			t.bash(`echo ""
echo "========================================"
echo "PHASE 1: MILESTONE PLANNING"
echo "========================================"`),
			{ visible: true },
		),

		t.step(
			"Analyze epic for milestones",
			t.claude(`First, use the /analyze-epic skill to create the full epic description.
Then, use the /generate-milestones skill to split it into milestones.

## Input Prompt
{epic_prompt_content}

## Codebase Structure
{codebase_structure}

## Tasks
1. Save epic description to: {temp_dir}/epic-description.md
2. Save milestones JSON to: {temp_dir}/milestones.json

Milestones should follow risk-based phasing:
- Foundation (types, models, config)
- Core (services, business logic)
- Features (UI, endpoints, integrations)
- Integration (tests, docs, edge cases)

Output "SAVED" when done.`),
			{ model: "opus" },
		),

		t.step(
			"Read epic description",
			t.bash("cat {temp_dir}/epic-description.md"),
			{
				output: "epic_description",
			},
		),

		t.step(
			"Save epic description",
			t.bash(`cat > {output_dir}/epic-description.md << 'EPIC_EOF'
{epic_description}
EPIC_EOF`),
		),

		t.step("Read milestones", t.bash("cat {temp_dir}/milestones.json"), {
			output: "milestones_json",
		}),

		t.step(
			"Save milestones file",
			t.bash(`cat > {output_dir}/milestones.json << 'MILES_EOF'
{milestones_json}
MILES_EOF`),
		),

		t.step(
			"Parse milestones count",
			t.json("query", {
				input: "{milestones_json}",
				query: "length(milestones)",
			}),
			{ output: "milestones_count" },
		),

		t.step(
			"Extract epic title",
			t.claudeSdk({
				prompt: `Extract a short title from this epic description for use in a git branch name.

Epic:
{epic_description}

Rules:
- Maximum 25 characters
- Lowercase letters and hyphens only
- Use hyphens instead of spaces
- Examples: "user-auth", "payment-flow", "dark-mode"`,
				model: "haiku",
				schema: {
					type: "object",
					properties: {
						title: {
							type: "string",
							description:
								"Branch-safe title (lowercase, hyphens, max 25 chars)",
						},
					},
					required: ["title"],
				},
			}),
			{ output: "epic_title_json" },
		),

		t.step(
			"Parse epic title (milestone)",
			t.json("query", { input: "{epic_title_json}", query: "title" }),
			{ output: "epic_title" },
		),

		t.step(
			"Generate branch name (milestone)",
			t.bash(`TITLE=$(echo "{epic_title}" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-' | sed 's/--*/-/g' | cut -c1-25)
TIMESTAMP=$(date +%Y%m%d)
echo "feature/\${TIMESTAMP}-\${TITLE}"`),
			{ output: "branch_name" },
		),

		// Git status check (inline builtin:git-status)
		t.step(
			"Get current branch (milestone)",
			t.bash("git branch --show-current"),
			{
				output: "original_branch",
			},
		),

		t.step(
			"Check uncommitted changes (milestone)",
			t.bash('[ -n "$(git status --porcelain)" ] && echo true || echo false'),
			{ output: "has_uncommitted_changes" },
		),

		t.step(
			"Stash changes if needed",
			t.bash(
				'git stash push -m "epic-workflow-auto-stash-$(date +%Y%m%d-%H%M%S)"',
			),
			{ when: "{has_uncommitted_changes} == true" },
		),

		t.step(
			"Create feature branch",
			t.bash(`git checkout -b {branch_name}
echo "Created branch: {branch_name}"`),
			{ visible: true },
		),

		t.step(
			"Create high-level architecture",
			t.claude(`Use the /create-architecture skill to create a HIGH-LEVEL architectural document.

This is the initial architecture - it will be refined per milestone.

## Epic Description
{epic_description}

## Milestones Overview
{milestones_json}

## Codebase Structure
{codebase_structure}

Focus on overall design, component boundaries, patterns.
Leave milestone-specific details for refinement.

Save to: {temp_dir}/architecture.md
Output "SAVED" when done.`),
			{ model: "opus" },
		),

		t.step("Read architecture", t.bash("cat {temp_dir}/architecture.md"), {
			output: "architecture_document",
		}),

		t.step(
			"Save architecture v1",
			t.bash(`cat > {output_dir}/architecture.md << 'ARCH_EOF'
{architecture_document}
ARCH_EOF`),
		),

		t.step(
			"Log milestone planning complete",
			t.bash(`echo ""
echo "Milestone planning complete"
echo "Milestones to execute: {milestones_count}"
echo "Architecture version: 1"
echo ""`),
			{ visible: true },
		),

		// Milestone loop
		t.forEach("{milestones_json.milestones}", "current_milestone", [
			...milestoneIterationSteps(t),
		]),
	];
}

// ============================================================
// MILESTONE ITERATION STEPS
// ============================================================

function milestoneIterationSteps(t: WorkflowBuilder): StepDefinition[] {
	return [
		t.step(
			"Get milestone ID",
			t.json("query", { input: "{current_milestone}", query: "id" }),
			{ output: "milestone_id" },
		),

		t.step(
			"Get milestone title",
			t.json("query", { input: "{current_milestone}", query: "title" }),
			{ output: "milestone_title" },
		),

		t.step(
			"Get milestone goals",
			t.json("query", { input: "{current_milestone}", query: "goals" }),
			{ output: "milestone_goals" },
		),

		t.step(
			"Log milestone start",
			t.bash(`echo ""
echo "=========================================="
echo "MILESTONE: {milestone_id} - {milestone_title}"
echo "=========================================="
echo "Goals: {milestone_goals}"
echo ""`),
			{ visible: true },
		),

		t.step(
			"Log decision: Starting milestone",
			t.bash(`cat >> {output_dir}/decisions.md << EOF

---

## Milestone {milestone_id}: {milestone_title}

**Started**: $(date +%Y-%m-%d\\ %H:%M)
**Goals**: {milestone_goals}

EOF`),
		),

		t.step(
			"Milestone planning checklist",
			t.checklist([
				{
					name: "Milestone scope defined",
					command: '[ -n "{milestone_goals}" ] && echo pass || echo fail',
					expectedPattern: "pass",
				},
			]),
			{ onError: "continue" },
		),

		t.step(
			"Refine architecture for milestone",
			t.claude(`Refine the architecture document for milestone {milestone_id}: {milestone_title}

## Current Architecture
{architecture_document}

## Current Milestone
{current_milestone}

## Previous Milestones Summary
{cumulative_implementation_summary}

## Task
1. Review the current architecture
2. Add detailed design for this milestone's scope
3. Update any sections based on learnings from previous milestones

Save updated architecture to: {temp_dir}/architecture-{milestone_id}.md
Output "SAVED" when done.`),
			{ model: "opus" },
		),

		t.step(
			"Read refined architecture",
			t.bash("cat {temp_dir}/architecture-{milestone_id}.md"),
			{ output: "architecture_document" },
		),

		t.step(
			"Save refined architecture",
			t.bash(`cat > {output_dir}/architecture.md << 'ARCH_EOF'
{architecture_document}
ARCH_EOF`),
		),

		t.step(
			"Increment architecture version",
			t.bash("echo $(( {architecture_version} + 1 ))"),
			{ output: "architecture_version" },
		),

		t.step(
			"Generate milestone stories",
			t.claude(`Use the /generate-stories skill to create stories for milestone {milestone_id}: {milestone_title}

## Milestone
{current_milestone}

## Architecture
{architecture_document}

## Previous Work Summary
{cumulative_implementation_summary}

## Guidelines
- Generate 8-15 stories for this milestone
- Use milestone prefix: {milestone_id}-STORY-001
- Focus ONLY on this milestone's goals

Save to: {temp_dir}/stories-{milestone_id}.json
Output "SAVED" when done.`),
			{ model: "opus" },
		),

		t.step(
			"Read milestone stories",
			t.bash("cat {temp_dir}/stories-{milestone_id}.json"),
			{ output: "stories_raw" },
		),

		t.step(
			"Save milestone stories",
			t.bash(`cat > {output_dir}/stories-{milestone_id}.json << 'STORIES_EOF'
{stories_raw}
STORIES_EOF`),
		),

		t.step(
			"Parse milestone stories count",
			t.json("query", { input: "{stories_raw}", query: "length(@)" }),
			{ output: "stories_count" },
		),

		t.step(
			"Store stories for iteration",
			t.set("stories_json", "{stories_raw}"),
		),

		t.step(
			"Log milestone stories ready",
			t.bash(
				'echo "Milestone {milestone_id} stories generated: {stories_count}"',
			),
			{ visible: true },
		),

		// Story loop for milestone
		...storyLoopSteps(t),

		// Post-stories phase
		...postStoriesPhase(t),

		// Milestone commit
		...milestoneCommitSteps(t),
	];
}

// ============================================================
// STORY LOOP STEPS
// ============================================================

function storyLoopSteps(t: WorkflowBuilder): StepDefinition[] {
	return [
		t.step("Initialize story index", t.set("current_story_index", "0")),

		t.forEach("{stories_json}", "current_story", [
			t.step(
				"Get story ID",
				t.json("query", { input: "{current_story}", query: "id" }),
				{ output: "story_id" },
			),

			t.step(
				"Get story title",
				t.json("query", { input: "{current_story}", query: "title" }),
				{ output: "story_title" },
			),

			t.step(
				"Log story start",
				t.bash(`echo ""
echo "=========================================="
echo "IMPLEMENTING: {story_id}"
echo "{story_title}"
echo "==========================================="`),
				{ visible: true },
			),

			t.step(
				"Pre-implementation checks",
				t.checklist([
					{
						name: "Story has clear acceptance criteria",
						command:
							'echo "{current_story}" | grep -qi "acceptance" && echo pass || echo warn',
						expectedPattern: "pass",
					},
				]),
				{ onError: "continue" },
			),

			t.step(
				"Plan and implement story",
				t.claude(`Implement story {story_id}: {story_title}

## Story Details
{current_story}

## Architecture Context
{architecture_document}

## Known Antipatterns
Before implementing, use the /antipatterns skill to review known mistakes to avoid.

## Instructions
1. First, use /antipatterns to check for relevant patterns
2. Use /plan to create an implementation plan
3. After the plan is accepted, implement following /implement-story skill
4. Write tests for all new functionality
5. Run lint and fix any issues

Start by reviewing antipatterns, then use /plan.`),
				{ output: "implementation_result", model: "opus" },
			),

			t.step(
				"Code review implementation",
				t.claude(`Use the /code-review skill to review changes for story {story_id}: {story_title}

## Implementation Summary
{implementation_result}

FIX any issues found immediately. Do not just report issues.`),
				{ output: "review_result", model: "opus" },
			),

			t.step(
				"Code quality checks",
				t.checklist([
					{
						name: "No console.log left",
						command:
							'git diff --cached --name-only | xargs grep -l "console.log" 2>/dev/null && echo fail || echo pass',
						expectedPattern: "pass",
					},
				]),
				{ onError: "continue" },
			),

			// Test retry loop
			t.step("Reset test retry count", t.set("test_retry_count", "0")),

			t.retry({ maxAttempts: 3, until: "{tests_passed} == true" }, [
				t.step(
					"Log test attempt",
					t.bash("echo '--- Test Run (attempt {test_retry_count}) ---'"),
					{
						visible: true,
					},
				),

				// Lint fix (inline builtin:lint-fix)
				t.step(
					"Run lint",
					t.bash("npx eslint . --fix 2>&1 || bun lint --fix 2>&1 || true"),
					{ output: "lint_output", onError: "continue" },
				),

				t.step(
					"Check lint passed",
					t.bash(
						'echo "{lint_output}" | grep -qiE "error" && echo false || echo true',
					),
					{ output: "lint_passed" },
				),

				// Run tests (inline builtin:run-tests)
				t.step(
					"Run tests",
					t.bash("bun test 2>&1 || npm test 2>&1 || echo 'No tests found'"),
					{
						output: "test_output",
						onError: "continue",
					},
				),

				t.step(
					"Check tests passed",
					t.bash(
						'echo "{test_output}" | grep -qiE "failed|error|FAIL" && echo false || echo true',
					),
					{ output: "tests_passed" },
				),

				t.step(
					"Evaluate test results",
					t.bash(`if [ "{tests_passed}" = "true" ]; then
  echo "passed"
else
  echo "failed"
fi`),
					{ output: "test_status" },
				),

				t.step("Mark test failure", t.set("test_failure_occurred", "true"), {
					when: "{test_status} == failed",
				}),

				t.step(
					"Fix failing tests",
					t.claude(`Fix the failing tests for story {story_id}: {story_title}

## Test Output
{test_output}

## Lint Output
{lint_output}

## Instructions
1. Use /plan to analyze failures
2. Apply fixes following /fix-tests skill
3. Do NOT disable tests`),
					{
						output: "test_fix_result",
						model: "opus",
						when: "{test_status} == failed",
					},
				),

				t.step(
					"Learn from test failure",
					t.claude(`Use the /learn-from-failure skill to extract learnings from this test failure.

## Original Error
{test_output}

## Fix Applied
{test_fix_result}

Update the appropriate antipatterns file with curated learnings.`),
					{
						output: "learning_summary",
						model: "haiku",
						when: "{test_failure_occurred} == true",
					},
				),

				t.step(
					"Reset test failure flag",
					t.set("test_failure_occurred", "false"),
				),

				t.step(
					"Increment test retry",
					t.bash("echo $(( {test_retry_count} + 1 ))"),
					{ output: "test_retry_count" },
				),
			]),

			t.step(
				"Story complete",
				t.bash(`echo ""
echo "Story {story_id} complete"
echo "Tests: {test_status}"`),
				{ visible: true },
			),

			t.step(
				"Test quality checks",
				t.checklist([
					{
						name: "Tests cover new code",
						command:
							'git diff --cached --name-only | grep -E "\\.(test|spec)\\." && echo pass || echo warn',
						expectedPattern: "pass",
					},
				]),
				{ onError: "continue" },
			),

			t.step(
				"Increment story index",
				t.bash("echo $(( {current_story_index} + 1 ))"),
				{ output: "current_story_index" },
			),

			t.step(
				"Post-story hook",
				t.hook("post-story"),
				{ output: "post_story_hook_result", onError: "continue" },
			),
		]),
	];
}

// ============================================================
// POST-STORIES PHASE
// ============================================================

function postStoriesPhase(t: WorkflowBuilder): StepDefinition[] {
	return [
		t.step(
			"Post stories phase",
			t.bash(`echo ""
echo "========================================"
echo "POST-STORIES: Alignment & Finalization"
echo "========================================"`),
			{ visible: true },
		),

		t.step(
			"Architecture checklist",
			t.checklist([
				{
					name: "Architecture document up to date",
					command:
						'[ -f "{output_dir}/architecture.md" ] && echo pass || echo fail',
					expectedPattern: "pass",
				},
			]),
			{ output: "architecture_check_result", onError: "continue" },
		),

		t.step("Reset drift fix count", t.set("drift_fix_count", "0")),

		// Drift fix retry loop
		t.retry({ maxAttempts: 5, until: "{drift_fix_issues_count} == 0" }, [
			t.step("Drift check start", t.bash("echo 'Running drift check...'"), {
				visible: true,
			}),

			t.step(
				"Bidirectional drift check",
				t.claude(`Use the /check-drift skill with bidirectional checking.

## Architecture Document
{architecture_document}

## Stories Completed
{stories_count} stories

## Task
1. Check if implementation matches architecture
2. Identify improvements to UPDATE the architecture (type: keep)
3. Identify violations to FIX in code (type: fix)
4. Note items for future milestones (type: defer)

Include architecture_updates list for any "keep" items.

Save to: {temp_dir}/drift-check.json
Output "SAVED" when done.`),
				{ output: "drift_check_raw", model: "opus" },
			),

			t.step("Read drift check", t.bash("cat {temp_dir}/drift-check.json"), {
				output: "drift_check_result",
			}),

			t.step(
				"Parse drift aligned",
				t.json("query", { input: "{drift_check_result}", query: "aligned" }),
				{ output: "architecture_aligned", onError: "continue" },
			),

			t.step("Default alignment", t.set("architecture_aligned", "true"), {
				when: "{architecture_aligned} is empty",
			}),

			t.step(
				"Get architecture updates",
				t.json("query", {
					input: "{drift_check_result}",
					query: "architecture_updates",
				}),
				{ output: "architecture_updates", onError: "continue" },
			),

			t.step(
				"Get drift issues to fix",
				t.json("query", {
					input: "{drift_check_result}",
					query: "issues[?type=='fix']",
				}),
				{ output: "drift_fix_issues", onError: "continue" },
			),

			t.step(
				"Count drift fix issues",
				t.json("query", { input: "{drift_fix_issues}", query: "length(@)" }),
				{ output: "drift_fix_issues_count", onError: "continue" },
			),

			t.step("Default drift count", t.set("drift_fix_issues_count", "0"), {
				when: "{drift_fix_issues_count} is empty",
			}),

			t.step(
				"Log drift status",
				t.bash(`echo "Aligned: {architecture_aligned}"
echo "Fix issues: {drift_fix_issues_count}"`),
				{ visible: true },
			),

			t.step(
				"Fix drift issues",
				t.claude(`Use the /fix-drift skill to fix architectural drift issues.

## Issues to Fix
{drift_fix_issues}

## Architecture Document
{architecture_document}

## Instructions
1. Use /plan to plan the fixes for each drift issue
2. Apply fixes following the /fix-drift skill
3. Fix all issues of type "fix"

Start by using /plan to plan your fixes.`),
				{
					output: "drift_fix_result",
					model: "opus",
					when: "{drift_fix_issues_count} != 0",
				},
			),

			t.step(
				"Increment drift fix count",
				t.bash("echo $(( {drift_fix_count} + 1 ))"),
				{ output: "drift_fix_count" },
			),

			t.step(
				"Run tests after drift fix",
				t.bash("bun test 2>&1 || npm test 2>&1 || true"),
				{
					output: "post_drift_tests_passed",
					onError: "continue",
				},
			),
		]),

		t.step(
			"Update architecture step",
			t.bash("echo 'Updating architecture with learnings...'"),
			{ visible: true },
		),

		t.step(
			"Update architecture with learnings",
			t.claude(`Use the /update-architecture skill to incorporate learnings.

## Current Architecture
{architecture_document}

## Updates to Make
{architecture_updates}

Save to: {temp_dir}/architecture-updated.md
Output "SAVED" when done.`),
			{ model: "opus", when: "{architecture_updates} is not empty" },
		),

		t.step(
			"Read updated architecture",
			t.bash("cat {temp_dir}/architecture-updated.md 2>/dev/null || echo ''"),
			{
				output: "updated_architecture",
				when: "{architecture_updates} is not empty",
			},
		),

		t.step(
			"Apply architecture update",
			t.bash(`if [ -n "{updated_architecture}" ]; then
  cat > {output_dir}/architecture.md << 'ARCH_EOF'
{updated_architecture}
ARCH_EOF
  echo "Architecture updated"
fi`),
			{ when: "{updated_architecture} is not empty" },
		),

		t.step(
			"Store updated architecture",
			t.set("architecture_document", "{updated_architecture}"),
			{
				when: "{updated_architecture} is not empty",
			},
		),
	];
}

// ============================================================
// MILESTONE COMMIT STEPS
// ============================================================

function milestoneCommitSteps(t: WorkflowBuilder): StepDefinition[] {
	return [
		t.step(
			"Milestone commit start",
			t.bash(`echo ""
echo "=== Committing Milestone {milestone_id} ==="`),
			{ visible: true },
		),

		t.step(
			"Milestone completion checklist",
			t.checklist([
				{
					name: "Stories implemented",
					command: '[ "{stories_count}" -gt "0" ] && echo pass || echo fail',
					expectedPattern: "pass",
				},
			]),
			{ onError: "continue" },
		),

		t.step("Stage milestone changes", t.bash("git add -A")),

		t.step(
			"Generate milestone commit message",
			t.claudeSdk({
				prompt: `Generate a git commit message for milestone {milestone_id}: {milestone_title}

Stories completed: {stories_count}

Format:
feat({milestone_id}): Brief description

- Change 1
- Change 2`,
				model: "haiku",
				schema: {
					type: "object",
					properties: {
						message: {
							type: "string",
							description: "Git commit message in conventional format",
						},
					},
					required: ["message"],
				},
			}),
			{ output: "milestone_commit_msg_json" },
		),

		t.step(
			"Parse milestone commit message",
			t.json("query", {
				input: "{milestone_commit_msg_json}",
				query: "message",
			}),
			{ output: "milestone_commit_message" },
		),

		t.step(
			"Commit milestone",
			t.bash(
				'git commit -m "{milestone_commit_message}" || echo "Nothing to commit"',
			),
			{ onError: "continue" },
		),

		t.step(
			"Create milestone tag",
			t.bash(
				'git tag -a "milestone-{milestone_id}" -m "Milestone {milestone_id}: {milestone_title}" 2>/dev/null || echo "Tag exists"',
			),
			{ onError: "continue" },
		),

		t.step(
			"Log decision: Milestone complete",
			t.bash(`cat >> {output_dir}/decisions.md << EOF

**Completed**: $(date +%Y-%m-%d\\ %H:%M)
**Stories Implemented**: {stories_count}
**Architecture Updated**: Yes
**Git Tag**: milestone-{milestone_id}

EOF`),
		),

		t.step(
			"Generate milestone summary",
			t.claudeSdk({
				prompt: `Summarize what was built in milestone {milestone_id}: {milestone_title}

Stories completed: {stories_count}

Provide a 2-3 sentence summary focusing on WHAT was built.`,
				model: "haiku",
				schema: {
					type: "object",
					properties: {
						summary: {
							type: "string",
							description: "2-3 sentence summary of what was built",
						},
					},
					required: ["summary"],
				},
			}),
			{ output: "milestone_summary_json" },
		),

		t.step(
			"Parse milestone summary",
			t.json("query", { input: "{milestone_summary_json}", query: "summary" }),
			{ output: "milestone_summary" },
		),

		t.step(
			"Update cumulative summary",
			t.bash(`CURRENT="{cumulative_implementation_summary}"
NEW="## Milestone {milestone_id}: {milestone_title}
{milestone_summary}

"
echo "\${CURRENT}\${NEW}"`),
			{ output: "cumulative_implementation_summary" },
		),

		t.step(
			"Post-milestone hook",
			t.hook("post-milestone"),
			{ output: "post_milestone_hook_result", onError: "continue" },
		),
	];
}

// ============================================================
// FINALIZATION PHASE
// ============================================================

function finalizationSteps(t: WorkflowBuilder): StepDefinition[] {
	return [
		t.step("Finalization start", t.set("workflow_phase", "finalization")),

		t.step(
			"Log finalization",
			t.bash(`echo ""
echo "========================================"
echo "FINALIZATION PHASE"
echo "========================================"`),
			{ visible: true },
		),

		// Final lint (inline builtin:lint-fix)
		t.step(
			"Final lint",
			t.bash("npx eslint . --fix 2>&1 || bun lint --fix 2>&1 || true"),
			{
				output: "final_lint_output",
				onError: "continue",
			},
		),

		t.step(
			"Check final lint passed",
			t.bash(
				'echo "{final_lint_output}" | grep -qiE "error" && echo false || echo true',
			),
			{ output: "final_lint_passed" },
		),

		// Final tests (inline builtin:run-tests)
		t.step(
			"Final tests",
			t.bash("bun test 2>&1 || npm test 2>&1 || echo 'No tests found'"),
			{
				output: "final_test_output",
				onError: "continue",
			},
		),

		t.step(
			"Check final tests passed",
			t.bash(
				'echo "{final_test_output}" | grep -qiE "failed|error|FAIL" && echo false || echo true',
			),
			{ output: "final_tests_passed" },
		),

		t.step(
			"Log final status",
			t.bash(`echo "Final lint: {final_lint_passed}"
echo "Final tests: {final_tests_passed}"`),
			{ visible: true },
		),

		t.step(
			"Consolidate antipatterns",
			t.claude(`Use the /consolidate-antipatterns skill to curate and deduplicate
all antipattern entries from this epic.

Output a brief summary.`),
			{ output: "consolidation_summary", model: "haiku" },
		),

		t.step(
			"Check for new dependencies",
			t.bash(
				"cat pyproject.toml 2>/dev/null || cat package.json 2>/dev/null || cat requirements.txt 2>/dev/null || echo ''",
			),
			{ output: "deps_after" },
		),

		t.step(
			"Learn new dependencies",
			t.claude(`Use the /learn-new-dependencies skill to create skills for new dependencies.

## Before
{deps_before}

## After
{deps_after}

Output summary of skills created.`),
			{ output: "deps_learning_summary" },
		),

		t.step(
			"Post-epic hook",
			t.hook("post-epic"),
			{ output: "post_epic_hook_result", onError: "continue" },
		),

		t.step(
			"Pre-commit checks",
			t.checklist([
				{
					name: "No merge conflicts",
					command:
						'git diff --check 2>&1 | grep -q "conflict" && echo fail || echo pass',
					expectedPattern: "pass",
				},
			]),
			{ onError: "continue" },
		),

		t.step(
			"Generate final commit message",
			t.claudeSdk({
				prompt: `Generate a final git commit message for epic: {epic_title}

Mode: {workflow_mode}
Milestones: {milestones_count}

Format:
feat(scope): Brief description

- Major change 1
- Major change 2`,
				model: "haiku",
				schema: {
					type: "object",
					properties: {
						message: {
							type: "string",
							description: "Git commit message in conventional format",
						},
					},
					required: ["message"],
				},
			}),
			{ output: "commit_msg_json" },
		),

		t.step(
			"Parse final commit message",
			t.json("query", { input: "{commit_msg_json}", query: "message" }),
			{ output: "commit_message" },
		),

		t.step("Stage final changes", t.bash("git add -A")),

		t.step(
			"Final commit",
			t.bash('git commit -m "{commit_message}" || echo "Nothing to commit"'),
			{ onError: "continue" },
		),

		t.step(
			"Get final commit SHA",
			t.bash("git rev-parse --short HEAD 2>/dev/null || echo 'unknown'"),
			{ output: "final_commit_sha" },
		),

		t.step(
			"Log decision: Epic complete",
			t.bash(`cat >> {output_dir}/decisions.md << EOF

---

## Epic Complete

**Completed**: $(date +%Y-%m-%d\\ %H:%M)
**Mode**: {workflow_mode}
**Branch**: {branch_name}
**Final Commit**: {final_commit_sha}
**Tests Passed**: {final_tests_passed}

EOF`),
		),

		t.step(
			"Log completion",
			t.bash(`echo ""
echo "=========================================="
echo "WORKFLOW COMPLETE"
echo "=========================================="
echo ""
echo "Epic: {epic_title}"
echo "Mode: {workflow_mode}"
echo "Branch: {branch_name}"
echo "Milestones: {milestones_count}"
echo "Final tests: {final_tests_passed}"
echo "Commit: {final_commit_sha}"
echo ""
echo "Generated artifacts:"
echo "  - {output_dir}/epic-description.md"
echo "  - {output_dir}/architecture.md"
echo "  - {output_dir}/decisions.md"
echo "  - {output_dir}/stories*.json"
if [ "{workflow_mode}" = "milestone" ]; then
  echo "  - {output_dir}/milestones.json"
fi
echo ""
echo "Next steps:"
echo "  1. Review changes: git log --oneline -10"
echo "  2. Push branch: git push -u origin {branch_name}"
echo "  3. Create pull request"
echo ""
echo "=========================================="`),
			{ visible: true },
		),

		t.step("Cleanup", t.bash("rm -rf {temp_dir}"), { onError: "continue" }),

		t.step(
			"Workflow end",
			t.bash("echo 'Epic implementation workflow v2 finished!'"),
		),
	];
}

// ============================================================
// MAIN WORKFLOW EXPORT
// ============================================================

export default (t: WorkflowBuilder): WorkflowDefinition => ({
	name: "Epic to Implementation Pipeline V2",
	vars: {
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
	},
	claude: {
		model: "sonnet",
		interactive: true,
		dangerouslySkipPermissions: true,
	},
	tmux: {
		split: "vertical",
		idleTime: 5.0,
	},
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
