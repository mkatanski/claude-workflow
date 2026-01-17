/**
 * Setup and Scope Analysis Nodes
 *
 * Phase 0: Initial setup and epic scope analysis to determine workflow mode.
 *
 * Nodes:
 * - setup: Create temp directory, read epic, capture dependencies
 * - analyzeScope: Run epic-scope-analyzer, determine mode
 */

import type {
	WorkflowStateType,
	WorkflowStateUpdate,
} from "../../../../src/core/graph/state.ts";
import type { WorkflowTools } from "../../../../src/core/graph/tools.ts";
import {
	fromToolResult,
	state,
	stateError,
} from "../../../../src/core/utils/index.js";
import { scopeAnalysisSchema } from "../schemas/index.ts";
import { DEFAULT_CONFIG, StateKeys } from "../state.ts";
import type { EpicData, ScopeAnalysis, WorkflowMode } from "../types.ts";

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
	const workflowIdResult = fromToolResult(
		await tools.bash('echo "$(date +%Y%m%d%H%M%S)-$$"', { stripOutput: true }),
	);
	if (workflowIdResult.isErr()) {
		return stateError(
			`Failed to generate workflow ID: ${workflowIdResult.unwrapErr()}`,
		);
	}
	const workflowId = workflowIdResult.unwrap().trim();

	const tempDir = `.cw/tmp/orchestrator-${workflowId}`;
	const mkdirResult = fromToolResult(await tools.bash(`mkdir -p "${tempDir}"`));
	if (mkdirResult.isErr()) {
		return stateError(
			`Failed to create temp directory: ${mkdirResult.unwrapErr()}`,
		);
	}

	// Ensure output directory exists
	const ensureOutputResult = fromToolResult(
		await tools.bash(`mkdir -p "${config.outputDir}"`),
	);
	if (ensureOutputResult.isErr()) {
		return stateError(
			`Failed to create output directory: ${ensureOutputResult.unwrapErr()}`,
		);
	}

	// Read epic prompt file using FileOperations
	const promptResult = tools.files.readText(config.promptFile);
	const promptContent = promptResult.isOk() ? promptResult.unwrap().trim() : "";

	if (!promptContent) {
		return stateError(
			`Epic prompt file is empty or missing: ${config.promptFile}. Please create the file with your feature/epic description and run again.`,
		);
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
	tools.log(
		`Epic prompt: ${config.promptFile} (${promptContent.length} chars)`,
		"debug",
	);

	const epicData: EpicData = {
		promptContent,
		title: "", // Will be set later
		codebaseStructure,
	};

	return state()
		.set(StateKeys.config, config)
		.set(StateKeys.workflowId, workflowId)
		.set(StateKeys.tempDir, tempDir)
		.set(StateKeys.epic, epicData)
		.set(StateKeys.depsBefore, depsBefore)
		.set(StateKeys.phase, "scope_analysis")
		.build();
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
	const config =
		tools.getVar<typeof DEFAULT_CONFIG>(StateKeys.config) ?? DEFAULT_CONFIG;
	const epic = tools.getVar<EpicData>(StateKeys.epic);
	const tempDir = tools.getVar<string>(StateKeys.tempDir) ?? "";

	if (!epic) {
		return stateError("Epic data not found in state");
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
		return stateError(`Epic scope analyzer failed: ${analyzerResult.error}`);
	}

	// Read the saved analysis using FileOperations
	const scopeResult = tools.files.readJson<ScopeAnalysis>(
		`${tempDir}/scope-analysis.json`,
	);

	if (scopeResult.isErr()) {
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
			return stateError(`Scope analysis failed: ${sdkResult.error}`);
		}

		const scope = sdkResult.data;
		const mode: WorkflowMode = scope.needsMilestones ? "milestone" : "simple";

		// Log scope analysis results
		tools.log(
			`Scope Analysis: ${scope.estimatedStoryCount} stories, complexity ${scope.complexityScore}, mode: ${mode}`,
		);

		// Initialize decisions log
		await initializeDecisionsLog(tools, scope, mode, config.outputDir);

		return state()
			.set(StateKeys.scope, scope)
			.set(StateKeys.mode, mode)
			.build();
	}

	const scope = scopeResult.unwrap();
	const mode: WorkflowMode = scope.needsMilestones ? "milestone" : "simple";

	// Log scope analysis results
	tools.log(
		`Scope Analysis: ${scope.estimatedStoryCount} stories, complexity ${scope.complexityScore}, mode: ${mode}`,
	);

	// Initialize decisions log
	await initializeDecisionsLog(tools, scope, mode, config.outputDir);

	return state().set(StateKeys.scope, scope).set(StateKeys.mode, mode).build();
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
	const dateResult = await tools.bash('date "+%Y-%m-%d %H:%M"', {
		stripOutput: true,
	});
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

	tools.files.writeText(`${outputDir}/decisions.md`, content);
}
