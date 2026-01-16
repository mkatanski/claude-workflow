/**
 * Milestone Mode Nodes
 *
 * For complex epics that need to be split into milestones (>15 stories).
 *
 * Nodes:
 * - milestoneSetup: Initial setup with milestones and high-level architecture
 * - processMilestone: Refine architecture and generate stories for current milestone
 * - milestoneCommit: Commit milestone changes and generate summary
 */

import type { WorkflowStateType } from "../../../../src/core/graph/state.ts";
import type { WorkflowTools } from "../../../../src/core/graph/tools.ts";
import type { WorkflowStateUpdate } from "../../../../src/core/graph/state.ts";
import {
	StateKeys,
	DEFAULT_CONFIG,
	getEpic,
	getTempDir,
	getMilestones,
	getCurrentMilestoneIndex,
	getCurrentMilestone,
	getArchitecture,
	getCumulativeSummary,
} from "../state.ts";
import {
	epicTitleSchema,
	milestonesJsonSchema,
	storiesJsonSchema,
	commitMessageSchema,
	milestoneSummarySchema,
} from "../schemas/index.ts";
import type {
	EpicData,
	Milestone,
	Story,
	ArchitectureState,
	WorkflowConfig,
} from "../types.ts";

/**
 * Milestone setup node: Initial setup for complex epics.
 *
 * - Runs /analyze-epic skill
 * - Extracts epic title
 * - Creates high-level architecture
 * - Generates milestones via /generate-milestones
 */
export async function milestoneSetup(
	_state: WorkflowStateType,
	tools: WorkflowTools,
): Promise<WorkflowStateUpdate> {
	const config = tools.getVar<WorkflowConfig>(StateKeys.config) ?? DEFAULT_CONFIG;
	const epic = getEpic(tools);

	if (!epic) {
		return { error: "Epic data not found in state" };
	}

	tools.log("MILESTONE MODE: Multi-Phase Implementation");

	// Step 1: Analyze epic
	tools.log("Analyzing epic...");
	const analyzeResult = await tools.claude(
		`Use the /analyze-epic skill to analyze this epic prompt and create a well-structured epic description.

## Epic Prompt
${epic.promptContent}

Save the epic description to: ${config.outputDir}/epic-description.md

Output only "SAVED" when done.`,
	);

	if (!analyzeResult.success) {
		return { error: `Epic analysis failed: ${analyzeResult.error}` };
	}

	// Step 2: Extract epic title
	const titleResult = await tools.claudeSdk<{ title: string; description?: string }>(
		`Based on this epic prompt, provide a concise title (max 50 chars) and brief description:

${epic.promptContent}`,
		{
			outputType: "schema",
			schema: epicTitleSchema,
		},
	);

	const epicTitle = titleResult.data?.title ?? "unnamed-epic";
	const updatedEpic: EpicData = {
		...epic,
		title: epicTitle,
		description: titleResult.data?.description,
	};

	tools.log(`Epic title: ${epicTitle}`, "debug");

	// Step 3: Create high-level architecture
	tools.log("Creating high-level architecture...");
	const archResult = await tools.claude(
		`Use the /create-architecture skill to create a HIGH-LEVEL architectural document for implementing this epic.

This is a complex epic that will be implemented in multiple milestones. Create architecture that:
1. Defines the overall structure and patterns
2. Identifies key components and their relationships
3. Leaves room for refinement in each milestone

The epic description is at: ${config.outputDir}/epic-description.md

Save the architecture document to: ${config.outputDir}/architecture.md

Output only "SAVED" when done.`,
	);

	if (!archResult.success) {
		return { error: `Architecture creation failed: ${archResult.error}` };
	}

	// Read architecture document
	const readArchResult = await tools.bash(
		`cat "${config.outputDir}/architecture.md"`,
		{ stripOutput: false },
	);
	const architectureDocument = readArchResult.output;

	const architecture: ArchitectureState = {
		document: architectureDocument,
		version: 1,
		pendingUpdates: [],
	};

	// Step 4: Generate milestones
	tools.log("Generating milestones...");
	const milestonesResult = await tools.claude(
		`Use the /generate-milestones skill to generate risk-based milestones from the epic and architecture.

The architecture document is at: ${config.outputDir}/architecture.md
The epic description is at: ${config.outputDir}/epic-description.md

Save the milestones to: ${config.outputDir}/milestones.json

Output only "SAVED" when done.`,
	);

	if (!milestonesResult.success) {
		return { error: `Milestone generation failed: ${milestonesResult.error}` };
	}

	// Read and parse milestones
	const readMilestonesResult = await tools.bash(
		`cat "${config.outputDir}/milestones.json"`,
		{ stripOutput: false },
	);

	if (!readMilestonesResult.success || !readMilestonesResult.output.trim()) {
		return { error: "Failed to read generated milestones" };
	}

	let milestones: Milestone[];
	try {
		const parsed = JSON.parse(readMilestonesResult.output) as { milestones: Milestone[] };
		milestones = (parsed.milestones ?? []).map((m) => ({
			...m,
			completed: false,
		}));
	} catch {
		return { error: `Failed to parse milestones JSON` };
	}

	tools.log(`Generated ${milestones.length} milestones`);
	for (const m of milestones) {
		tools.log(`- ${m.id}: ${m.title} (${m.phase}, ~${m.storyCount} stories)`, "debug");
	}

	// Log decision
	await logDecision(tools, config.outputDir, "Milestone Mode Setup", [
		`Generated ${milestones.length} milestones`,
		`Created high-level architecture document v1`,
		`Epic title: ${epicTitle}`,
		`Phases: ${[...new Set(milestones.map((m) => m.phase))].join(", ")}`,
	]);

	return {
		variables: {
			[StateKeys.epic]: updatedEpic,
			[StateKeys.architecture]: architecture,
			[StateKeys.milestones]: milestones,
			[StateKeys.currentMilestoneIndex]: 0,
			[StateKeys.cumulativeSummary]: "",
		},
	};
}

/**
 * Process milestone node: Setup for current milestone.
 *
 * - Refines architecture for the milestone
 * - Generates milestone-specific stories
 */
export async function processMilestone(
	_state: WorkflowStateType,
	tools: WorkflowTools,
): Promise<WorkflowStateUpdate> {
	const config = tools.getVar<WorkflowConfig>(StateKeys.config) ?? DEFAULT_CONFIG;
	const milestone = getCurrentMilestone(tools);
	const architecture = getArchitecture(tools);
	const cumulativeSummary = getCumulativeSummary(tools);
	const milestoneIndex = getCurrentMilestoneIndex(tools);

	if (!milestone) {
		return { error: "No current milestone found" };
	}

	if (!architecture) {
		return { error: "Architecture not found" };
	}

	tools.log(`MILESTONE ${milestoneIndex + 1}: ${milestone.title} (${milestone.phase})`);

	// Step 1: Refine architecture for this milestone
	tools.log("Refining architecture for milestone...", "debug");

	const contextSection = cumulativeSummary
		? `\n## Previous Milestones Summary\n${cumulativeSummary}\n`
		: "";

	const refineResult = await tools.claude(
		`Refine the architecture document for milestone "${milestone.title}" (${milestone.phase} phase).

## Current Architecture
${architecture.document}
${contextSection}
## Milestone Goals
${milestone.goals.map((g) => `- ${g}`).join("\n")}

Update ${config.outputDir}/architecture.md with milestone-specific details while preserving the overall structure.
Focus on:
1. Concrete implementation details for this milestone
2. Specific file paths and interfaces
3. Testing strategy for this phase

Output only "UPDATED" when done.`,
	);

	if (!refineResult.success) {
		tools.log("Architecture refinement skipped", "warn");
	}

	// Read updated architecture
	const readArchResult = await tools.bash(
		`cat "${config.outputDir}/architecture.md"`,
		{ stripOutput: false },
	);
	const updatedArchDocument = readArchResult.output || architecture.document;

	// Step 2: Generate stories for this milestone
	tools.log("Generating stories for milestone...");
	const storiesFile = `${config.outputDir}/stories-${milestone.id}.json`;

	const storiesResult = await tools.claude(
		`Use the /generate-stories skill to generate implementation stories for milestone "${milestone.title}".

The architecture document is at: ${config.outputDir}/architecture.md
The epic description is at: ${config.outputDir}/epic-description.md

Focus on stories that achieve these milestone goals:
${milestone.goals.map((g) => `- ${g}`).join("\n")}

Expected story count: ~${milestone.storyCount}

Save the stories to: ${storiesFile}

Output only "SAVED" when done.`,
	);

	if (!storiesResult.success) {
		return { error: `Story generation failed: ${storiesResult.error}` };
	}

	// Read and parse stories
	const readStoriesResult = await tools.bash(`cat "${storiesFile}"`, { stripOutput: false });

	if (!readStoriesResult.success || !readStoriesResult.output.trim()) {
		return { error: "Failed to read generated stories" };
	}

	let stories: Story[];
	try {
		const parsed = JSON.parse(readStoriesResult.output) as { stories: Story[] };
		stories = parsed.stories ?? [];
	} catch {
		return { error: "Failed to parse stories JSON" };
	}

	tools.log(`Generated ${stories.length} stories for ${milestone.id}`);

	// Log decision
	await logDecision(tools, config.outputDir, `Milestone ${milestone.id} Setup`, [
		`Generated ${stories.length} implementation stories`,
		`Refined architecture for ${milestone.phase} phase`,
		`Goals: ${milestone.goals.slice(0, 2).join(", ")}${milestone.goals.length > 2 ? "..." : ""}`,
	]);

	return {
		variables: {
			[StateKeys.architecture]: {
				document: updatedArchDocument,
				version: architecture.version,
				pendingUpdates: [],
			},
			[StateKeys.stories]: stories,
			[StateKeys.currentStoryIndex]: 0,
			[StateKeys.phase]: "stories",
		},
	};
}

/**
 * Milestone commit node: Commit changes and generate summary.
 *
 * - Stages all changes
 * - Generates commit message
 * - Creates git tag
 * - Generates milestone summary for context carryover
 */
export async function milestoneCommit(
	_state: WorkflowStateType,
	tools: WorkflowTools,
): Promise<WorkflowStateUpdate> {
	const config = tools.getVar<WorkflowConfig>(StateKeys.config) ?? DEFAULT_CONFIG;
	const milestone = getCurrentMilestone(tools);
	const milestones = getMilestones(tools);
	const milestoneIndex = getCurrentMilestoneIndex(tools);
	const cumulativeSummary = getCumulativeSummary(tools);

	if (!milestone) {
		return { error: "No current milestone found" };
	}

	tools.log(`COMMITTING MILESTONE: ${milestone.id}`);

	// Stage all changes
	const stageResult = await tools.bash("git add -A");
	if (!stageResult.success) {
		return { error: `Failed to stage changes: ${stageResult.error}` };
	}

	// Check if there are changes to commit
	const statusResult = await tools.bash("git status --porcelain");
	if (!statusResult.output.trim()) {
		tools.log("No changes to commit for this milestone", "debug");
	} else {
		// Generate commit message
		const commitMsgResult = await tools.claudeSdk<{ subject: string; body?: string }>(
			`Generate a commit message for completing milestone "${milestone.title}" (${milestone.phase} phase).

Goals achieved:
${milestone.goals.map((g) => `- ${g}`).join("\n")}

Use conventional commit format (feat:, fix:, etc.)`,
			{
				outputType: "schema",
				schema: commitMessageSchema,
			},
		);

		const subject = commitMsgResult.data?.subject ?? `feat: complete ${milestone.id}`;
		const body = commitMsgResult.data?.body ?? "";

		// Create commit
		const commitMessage = body ? `${subject}\n\n${body}` : subject;
		const commitResult = await tools.bash(
			`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`,
		);

		if (!commitResult.success) {
			tools.log(`Commit failed: ${commitResult.error}`, "warn");
		} else {
			// Get commit SHA
			const shaResult = await tools.bash("git rev-parse HEAD", { stripOutput: true });
			const commitSha = shaResult.output.trim();

			// Create tag
			const tagResult = await tools.bash(`git tag -a "${milestone.id}" -m "Milestone: ${milestone.title}"`);
			if (!tagResult.success) {
				tools.log("Tag creation failed", "warn");
			}

			tools.log(`Committed: ${commitSha.slice(0, 8)}, tagged: ${milestone.id}`);

			// Update milestone with commit sha
			const updatedMilestones = milestones.map((m, i) =>
				i === milestoneIndex ? { ...m, completed: true, commitSha } : m,
			);

			// Generate milestone summary for context carryover
			const summaryResult = await tools.claudeSdk<{
				summary: string;
				keyChanges: string[];
				lessonsLearned?: string[];
			}>(
				`Generate a brief summary of what was implemented in milestone "${milestone.title}".

This summary will be used as context for the next milestone. Be concise but capture:
1. Key changes made
2. Important patterns established
3. Any lessons learned`,
				{
					outputType: "schema",
					schema: milestoneSummarySchema,
				},
			);

			const milestoneSummary = summaryResult.data?.summary ?? `Completed ${milestone.id}`;
			const keyChanges = summaryResult.data?.keyChanges ?? [];

			// Append to cumulative summary
			const newSummarySection = `### ${milestone.id}: ${milestone.title}
${milestoneSummary}
Key changes: ${keyChanges.join(", ")}
`;

			const updatedCumulativeSummary = cumulativeSummary + "\n" + newSummarySection;

			// Log decision
			await logDecision(tools, config.outputDir, `Milestone ${milestone.id} Complete`, [
				`Commit: ${commitSha.slice(0, 8)}`,
				`Tag: ${milestone.id}`,
				...keyChanges.slice(0, 3).map((c) => `Change: ${c}`),
			]);

			return {
				variables: {
					[StateKeys.milestones]: updatedMilestones,
					[StateKeys.currentMilestoneIndex]: milestoneIndex + 1,
					[StateKeys.cumulativeSummary]: updatedCumulativeSummary,
					[StateKeys.phase]: "milestone_commit",
				},
			};
		}
	}

	// No changes case - still increment milestone
	const updatedMilestones = milestones.map((m, i) =>
		i === milestoneIndex ? { ...m, completed: true } : m,
	);

	return {
		variables: {
			[StateKeys.milestones]: updatedMilestones,
			[StateKeys.currentMilestoneIndex]: milestoneIndex + 1,
			[StateKeys.phase]: "milestone_commit",
		},
	};
}

/**
 * Log a decision to the decisions log.
 */
async function logDecision(
	tools: WorkflowTools,
	outputDir: string,
	decision: string,
	details: string[],
): Promise<void> {
	const dateResult = await tools.bash('date "+%Y-%m-%d %H:%M"', { stripOutput: true });
	const date = dateResult.output.trim();

	const detailsStr = details.map((d) => `- ${d}`).join("\n");
	const content = `
## ${decision}

- **Date**: ${date}
${detailsStr}

---
`;

	await tools.bash(`cat >> "${outputDir}/decisions.md" << 'DECISION_EOF'
${content}
DECISION_EOF`);
}
