/**
 * Setup and Scope Analysis Nodes
 *
 * Phase 0: Initial setup and epic scope analysis to determine workflow mode.
 *
 * Nodes:
 * - setup: Create temp directory, read epic, capture dependencies
 * - analyzeScope: Run epic-scope-analyzer, determine mode
 */

import type { WorkflowStateType } from "../../../../src/core/graph/state.ts";
import type { WorkflowTools } from "../../../../src/core/graph/tools.ts";
import type { WorkflowStateUpdate } from "../../../../src/core/graph/state.ts";
import { DEFAULT_CONFIG, StateKeys } from "../state.ts";
import { scopeAnalysisSchema } from "../schemas/index.ts";
import type { ScopeAnalysis, WorkflowMode, EpicData } from "../types.ts";

/**
 * Setup node: Initialize workflow state and read epic prompt.
 *
 * - Creates temp directory with workflow ID
 * - Reads epic-prompt.md
 * - Captures initial dependencies
 * - Analyzes codebase structure
 */
export async function setup(
	_state: WorkflowStateType,
	tools: WorkflowTools,
): Promise<WorkflowStateUpdate> {
	const config = DEFAULT_CONFIG;

	// Create workflow ID and temp directory
	const workflowIdResult = await tools.bash(
		'echo "$(date +%Y%m%d%H%M%S)-$$"',
		{ stripOutput: true },
	);
	if (!workflowIdResult.success) {
		return { error: `Failed to generate workflow ID: ${workflowIdResult.error}` };
	}
	const workflowId = workflowIdResult.output.trim();

	const tempDir = `.cw/tmp/orchestrator-${workflowId}`;
	const mkdirResult = await tools.bash(`mkdir -p "${tempDir}"`);
	if (!mkdirResult.success) {
		return { error: `Failed to create temp directory: ${mkdirResult.error}` };
	}

	// Ensure output directory exists
	const ensureOutputResult = await tools.bash(`mkdir -p "${config.outputDir}"`);
	if (!ensureOutputResult.success) {
		return { error: `Failed to create output directory: ${ensureOutputResult.error}` };
	}

	// Read epic prompt file
	const readPromptResult = await tools.bash(
		`cat "${config.promptFile}" 2>/dev/null || echo ""`,
		{ stripOutput: false },
	);
	const promptContent = readPromptResult.output.trim();

	if (!promptContent) {
		return {
			error: `Epic prompt file is empty or missing: ${config.promptFile}. Please create the file with your feature/epic description and run again.`,
		};
	}

	// Capture initial dependencies
	const depsResult = await tools.bash(
		'cat pyproject.toml 2>/dev/null || cat package.json 2>/dev/null || cat requirements.txt 2>/dev/null || echo ""',
		{ stripOutput: false },
	);
	const depsBefore = depsResult.output;

	// Analyze codebase structure
	const structureResult = await tools.bash(
		`echo "=== Project Files ==="
find . -type f \\( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.py" -o -name "*.go" -o -name "*.rs" -o -name "*.java" \\) \\
  ! -path "*/node_modules/*" ! -path "*/.venv/*" ! -path "*/dist/*" ! -path "*/build/*" ! -path "*/__pycache__/*" ! -path "*/.git/*" \\
  2>/dev/null | head -100
echo ""
echo "=== Directory Structure ==="
find . -type d ! -path "*/node_modules/*" ! -path "*/.venv/*" ! -path "*/.git/*" ! -path "*/dist/*" ! -path "*/__pycache__/*" -maxdepth 4 2>/dev/null | head -60`,
		{ stripOutput: false },
	);
	const codebaseStructure = structureResult.output;

	// Log setup completion
	tools.log(`Workflow ID: ${workflowId}`, "debug");
	tools.log(`Temp directory: ${tempDir}`, "debug");
	tools.log(`Epic prompt: ${config.promptFile} (${promptContent.length} chars)`, "debug");

	const epicData: EpicData = {
		promptContent,
		title: "", // Will be set later
		codebaseStructure,
	};

	return {
		variables: {
			[StateKeys.config]: config,
			[StateKeys.workflowId]: workflowId,
			[StateKeys.tempDir]: tempDir,
			[StateKeys.epic]: epicData,
			[StateKeys.depsBefore]: depsBefore,
			[StateKeys.phase]: "scope_analysis",
		},
	};
}

/**
 * Analyze scope node: Run epic-scope-analyzer to determine workflow mode.
 *
 * Uses claudeSdk with structured output to determine:
 * - Estimated story count
 * - Complexity score
 * - Whether milestones are needed
 */
export async function analyzeScope(
	_state: WorkflowStateType,
	tools: WorkflowTools,
): Promise<WorkflowStateUpdate> {
	const config = tools.getVar<typeof DEFAULT_CONFIG>(StateKeys.config) ?? DEFAULT_CONFIG;
	const epic = tools.getVar<EpicData>(StateKeys.epic);
	const tempDir = tools.getVar<string>(StateKeys.tempDir) ?? "";

	if (!epic) {
		return { error: "Epic data not found in state" };
	}

	// Run epic-scope-analyzer skill
	const analyzerResult = await tools.claude(
		`Use the /epic-scope-analyzer skill to analyze this epic prompt and determine its scope.

## Epic Prompt
${epic.promptContent}

## Codebase Structure
${epic.codebaseStructure}

Save the analysis result as JSON to: ${tempDir}/scope-analysis.json

Output only "SAVED" when done.`,
		{ model: "opus" },
	);

	if (!analyzerResult.success) {
		return { error: `Epic scope analyzer failed: ${analyzerResult.error}` };
	}

	// Read the saved analysis
	const readResult = await tools.bash(`cat "${tempDir}/scope-analysis.json"`, {
		stripOutput: false,
	});

	if (!readResult.success || !readResult.output.trim()) {
		// Fallback: Use claudeSdk to analyze directly
		const sdkResult = await tools.claudeSdk<ScopeAnalysis>(
			`Analyze this epic prompt and determine its scope:

## Epic Prompt
${epic.promptContent}

## Codebase Structure
${epic.codebaseStructure}

Determine:
1. Estimated number of implementation stories (count discrete pieces of work)
2. Complexity score from 1-10 (consider dependencies, new patterns, testing needs)
3. Whether milestones are needed (typically if >15 stories or complexity >7)

Provide your analysis.`,
			{
				outputType: "schema",
				schema: scopeAnalysisSchema,
			},
		);

		if (!sdkResult.success || !sdkResult.data) {
			return { error: `Scope analysis failed: ${sdkResult.error}` };
		}

		const scope = sdkResult.data;
		const mode: WorkflowMode = scope.needsMilestones ? "milestone" : "simple";

		// Log scope analysis results
		tools.log(`Scope Analysis: ${scope.estimatedStoryCount} stories, complexity ${scope.complexityScore}, mode: ${mode}`);

		// Initialize decisions log
		await initializeDecisionsLog(tools, scope, mode, config.outputDir);

		return {
			variables: {
				[StateKeys.scope]: scope,
				[StateKeys.mode]: mode,
			},
		};
	}

	// Parse the JSON from file
	let scope: ScopeAnalysis;
	try {
		scope = JSON.parse(readResult.output) as ScopeAnalysis;
	} catch {
		return { error: `Failed to parse scope analysis JSON: ${readResult.output}` };
	}

	const mode: WorkflowMode = scope.needsMilestones ? "milestone" : "simple";

	// Log scope analysis results
	tools.log(`Scope Analysis: ${scope.estimatedStoryCount} stories, complexity ${scope.complexityScore}, mode: ${mode}`);

	// Initialize decisions log
	await initializeDecisionsLog(tools, scope, mode, config.outputDir);

	return {
		variables: {
			[StateKeys.scope]: scope,
			[StateKeys.mode]: mode,
		},
	};
}

/**
 * Initialize the decisions log file.
 */
async function initializeDecisionsLog(
	tools: WorkflowTools,
	scope: ScopeAnalysis,
	mode: WorkflowMode,
	outputDir: string,
): Promise<void> {
	const dateResult = await tools.bash('date "+%Y-%m-%d %H:%M"', { stripOutput: true });
	const date = dateResult.output.trim();

	const content = `# Epic Implementation Decisions Log

This document records key decisions made during epic implementation.

## Scope Analysis Decision

- **Date**: ${date}
- **Estimated Stories**: ${scope.estimatedStoryCount}
- **Complexity Score**: ${scope.complexityScore}
- **Milestones Needed**: ${scope.needsMilestones}
- **Workflow Mode**: ${mode}

---

`;

	await tools.bash(`cat > "${outputDir}/decisions.md" << 'DECISIONS_EOF'
${content}
DECISIONS_EOF`);
}
