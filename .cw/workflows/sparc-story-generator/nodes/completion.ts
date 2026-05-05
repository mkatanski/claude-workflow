/**
 * Completion Node for SPARC Story Generator
 *
 * Mixed Node: AI validation first, then deterministic file generation.
 * Reference: Section 6.5 Completion Phase, Section 9.1 Output Artifacts
 */

import * as path from "node:path";
import * as yaml from "js-yaml";
import type { NodeFunction } from "../../../../src/core/graph/types.ts";
import { isErr } from "../../../../src/core/utils/result/result.ts";
import { getCompletionPrompt } from "../prompts/completion.ts";
import {
	getAnalysis,
	getConfig,
	getGeneratedStories,
	getInputPath,
	StateKeys,
} from "../state.ts";
import type {
	CompletionOutput,
	ExecutionSummary,
	Story,
	StoryPhase,
} from "../types.ts";
import { parseJsonFromOutputSafe } from "../utils/jsonParser.ts";

const PHASE_ORDER: StoryPhase[] = [
	"foundation",
	"core",
	"features",
	"integration",
];

/**
 * Completion Node
 *
 * Responsibilities:
 * 1. Call agentSession to validate coverage and completeness
 * 2. Parse the CompletionOutput JSON response
 * 3. Generate YAML files for each phase
 * 4. Generate summary.md file
 * 5. Generate manifest.json file
 * 6. Mark workflow as completed
 *
 * Type: Mixed (AI validation + deterministic file output)
 *
 * Output Structure (from Section 9.1):
 * ```
 * .cw/generated/stories/
 * ├── stories/
 * │   ├── phase-1-foundation.yaml
 * │   ├── phase-2-core.yaml
 * │   ├── phase-3-features.yaml
 * │   └── phase-4-integration.yaml
 * ├── summary.md
 * └── manifest.json
 * ```
 */
export const completionNode: NodeFunction = async (_state, tools) => {
	const config = getConfig(tools);
	const analysis = getAnalysis(tools);
	const stories = getGeneratedStories(tools);
	const inputPath = getInputPath(tools);
	const startTime = Date.now();

	if (!analysis) {
		return {
			error: "No analysis available for completion validation.",
		};
	}

	if (stories.length === 0) {
		return {
			error: "No stories generated. Cannot complete.",
		};
	}

	tools.log("Starting SPARC Completion phase (C)...", "info");

	// ========================================================================
	// PHASE 1: AI Validation
	// ========================================================================

	tools.log("Validating coverage and completeness...", "info");
	const prompt = getCompletionPrompt(analysis, stories);

	const result = await tools.agentSession(prompt, {
		label: "SPARC Completion",
		model: config.models.completion,
		permissionMode: "bypassPermissions",
		workingDirectory: tools.projectPath,
	});

	let completionResult: CompletionOutput | undefined;
	if (result.success) {
		const parseResult = parseJsonFromOutputSafe<CompletionOutput>(
			result.output,
		);
		if (parseResult.success) {
			completionResult = parseResult.data;

			// Calculate coverage metrics
			const coveredCount = completionResult.coverageReport.filter(
				(r) => r.covered,
			).length;
			const totalRequirements = completionResult.coverageReport.length;
			const coverageScore =
				totalRequirements > 0
					? Math.round((coveredCount / totalRequirements) * 100)
					: 0;

			tools.log(`Coverage score: ${coverageScore}%`, "info");
			tools.log(
				`Requirements covered: ${coveredCount}/${totalRequirements}`,
				"info",
			);
			tools.log(`Gaps identified: ${completionResult.gaps.length}`, "info");
		} else {
			tools.log(
				`Warning: Failed to parse completion JSON: ${parseResult.error}`,
				"warn",
			);
		}
	} else {
		tools.log(`Warning: Completion validation failed: ${result.error}`, "warn");
	}

	// ========================================================================
	// PHASE 2: Deterministic File Generation
	// ========================================================================

	tools.log("Generating output files...", "info");

	const baseDir = path.join(tools.projectPath, config.output.directory);
	const storiesDir = path.join(baseDir, "stories");

	// Create directories
	const mkdirResult = await tools.bash(`mkdir -p "${storiesDir}"`);
	if (!mkdirResult.success) {
		return {
			error: `Failed to create output directory: ${mkdirResult.error}`,
		};
	}

	// Group stories by phase
	const storyGroups: Record<StoryPhase, Story[]> = {
		foundation: [],
		core: [],
		features: [],
		integration: [],
	};

	for (const story of stories) {
		if (story.phase && storyGroups[story.phase]) {
			storyGroups[story.phase].push(story);
		}
	}

	// Write YAML files for each phase
	for (let i = 0; i < PHASE_ORDER.length; i++) {
		const phase = PHASE_ORDER[i];
		const phaseStories = storyGroups[phase];

		if (phaseStories.length === 0) {
			continue;
		}

		const filename = `phase-${i + 1}-${phase}.yaml`;
		const filePath = path.join(storiesDir, filename);
		const yamlContent = yaml.dump(
			{ stories: phaseStories },
			{ indent: 2, lineWidth: 120 },
		);

		const writeResult = tools.files.writeText(filePath, yamlContent);
		if (isErr(writeResult)) {
			const error = writeResult.error;
			tools.log(`Failed to write ${filename}: ${error.message}`, "error");
		} else {
			tools.log(`Saved: ${filename} (${phaseStories.length} stories)`, "info");
		}
	}

	// Generate summary.md
	const summaryContent = generateSummary(
		stories,
		storyGroups,
		completionResult,
	);
	const summaryResult = tools.files.writeText(
		path.join(baseDir, "summary.md"),
		summaryContent,
	);
	if (isErr(summaryResult)) {
		const error = summaryResult.error;
		tools.log(`Failed to write summary.md: ${error.message}`, "error");
	} else {
		tools.log("Saved: summary.md", "info");
	}

	// Generate manifest.json
	const manifest = generateManifest(
		inputPath,
		stories,
		storyGroups,
		completionResult,
		startTime,
	);
	const manifestResult = tools.files.writeText(
		path.join(baseDir, "manifest.json"),
		JSON.stringify(manifest, null, 2),
	);
	if (isErr(manifestResult)) {
		const error = manifestResult.error;
		tools.log(`Failed to write manifest.json: ${error.message}`, "error");
	} else {
		tools.log("Saved: manifest.json", "info");
	}

	tools.log(
		`Completion phase finished. Total stories: ${stories.length}`,
		"info",
	);

	return {
		variables: {
			[StateKeys.completed]: true,
			[StateKeys.outputPath]: baseDir,
			[StateKeys.summary]: manifest as unknown as ExecutionSummary,
		},
	};
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate the summary.md markdown file.
 * Reference: Section 9.1 Generated Files
 */
function generateSummary(
	stories: Story[],
	groups: Record<StoryPhase, Story[]>,
	completion: CompletionOutput | undefined,
): string {
	let md = "# SPARC Story Generator - Summary\n\n";
	md += `Generated: ${new Date().toISOString()}\n\n`;

	// Overview section
	md += "## Overview\n\n";
	md += `- Total Stories: ${stories.length}\n`;
	md += `- Foundation: ${groups.foundation.length}\n`;
	md += `- Core: ${groups.core.length}\n`;
	md += `- Features: ${groups.features.length}\n`;
	md += `- Integration: ${groups.integration.length}\n\n`;

	// Coverage section
	if (completion) {
		md += "## Coverage\n\n";

		const coveredCount = completion.coverageReport.filter(
			(r) => r.covered,
		).length;
		const totalRequirements = completion.coverageReport.length;
		const coverageScore =
			totalRequirements > 0
				? Math.round((coveredCount / totalRequirements) * 100)
				: 0;

		md += `- Coverage Score: ${coverageScore}%\n`;
		md += `- Requirements Covered: ${coveredCount}/${totalRequirements}\n`;
		md += `- Completion Confidence: ${completion.completionConfidence}%\n\n`;

		// Gaps section
		if (completion.gaps.length > 0) {
			md += "## Identified Gaps\n\n";
			for (const gap of completion.gaps) {
				md += `- ${gap}\n`;
			}
			md += "\n";
		}

		// Orphaned dependencies
		if (completion.orphanedDependencies.length > 0) {
			md += "## Orphaned Dependencies\n\n";
			for (const dep of completion.orphanedDependencies) {
				md += `- ${dep}\n`;
			}
			md += "\n";
		}

		// Missing suggestions
		if (completion.missingSuggestions.length > 0) {
			md += "## Suggested Missing Stories\n\n";
			md += `${completion.missingSuggestions.length} story suggestions were generated to fill coverage gaps.\n\n`;
		}
	}

	// Phase breakdown
	md += "## Phase Breakdown\n\n";
	for (let i = 0; i < PHASE_ORDER.length; i++) {
		const phase = PHASE_ORDER[i];
		const phaseStories = groups[phase];

		if (phaseStories.length === 0) {
			continue;
		}

		md += `### Phase ${i + 1}: ${phase.charAt(0).toUpperCase() + phase.slice(1)}\n\n`;
		md += `**Story Count:** ${phaseStories.length}\n\n`;
		md += `**Output File:** \`stories/phase-${i + 1}-${phase}.yaml\`\n\n`;

		// List story titles
		for (const story of phaseStories) {
			md += `- ${story.id}: ${story.title}\n`;
		}
		md += "\n";
	}

	return md;
}

/**
 * Generate the manifest.json metadata file.
 * Reference: Section 9.2 Manifest Schema
 */
function generateManifest(
	inputPath: string | undefined,
	stories: Story[],
	groups: Record<StoryPhase, Story[]>,
	completion: CompletionOutput | undefined,
	startTime: number,
): Record<string, unknown> {
	const executionTime = (Date.now() - startTime) / 1000;

	// Calculate coverage score
	let coverageScore = 0;
	if (completion) {
		const coveredCount = completion.coverageReport.filter(
			(r) => r.covered,
		).length;
		const totalRequirements = completion.coverageReport.length;
		coverageScore =
			totalRequirements > 0
				? Math.round((coveredCount / totalRequirements) * 100)
				: 0;
	}

	return {
		generatedAt: new Date().toISOString(),
		inputDocument: inputPath ?? "unknown",
		inputHash: "not-implemented", // TODO: Could hash the input document
		phases: PHASE_ORDER.map((phase, i) => ({
			name: phase,
			storyCount: groups[phase].length,
			outputFile: `stories/phase-${i + 1}-${phase}.yaml`,
		})),
		totalStories: stories.length,
		coverageScore,
		executionTime,
		modelUsage: {
			inputTokens: 0, // Not tracked in agentSession
			outputTokens: 0, // Not tracked in agentSession
			estimatedCostUsd: 0, // Not tracked in agentSession
		},
	};
}
