/**
 * Simple Mode Setup Node
 *
 * For epics that don't need milestones (<15 stories, lower complexity).
 * Runs the full setup in a single pass:
 * - Analyze epic
 * - Create architecture
 * - Generate stories
 */

import type { WorkflowStateType } from "../../../../src/core/graph/state.ts";
import type { WorkflowTools } from "../../../../src/core/graph/tools.ts";
import type { WorkflowStateUpdate } from "../../../../src/core/graph/state.ts";
import { StateKeys, DEFAULT_CONFIG, getEpic, getTempDir } from "../state.ts";
import { epicTitleSchema, storiesJsonSchema } from "../schemas/index.ts";
import type { EpicData, Story, ArchitectureState, WorkflowConfig } from "../types.ts";

/**
 * Simple setup node: Full setup for simple epics.
 *
 * - Runs /analyze-epic skill
 * - Extracts epic title
 * - Creates architecture via /create-architecture
 * - Generates stories via /generate-stories
 */
export async function simpleSetup(
	_state: WorkflowStateType,
	tools: WorkflowTools,
): Promise<WorkflowStateUpdate> {
	const config = tools.getVar<WorkflowConfig>(StateKeys.config) ?? DEFAULT_CONFIG;
	const epic = getEpic(tools);
	const tempDir = getTempDir(tools);

	if (!epic) {
		return { error: "Epic data not found in state" };
	}

	tools.log("SIMPLE MODE: Single-Pass Implementation");

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

	// Step 3: Create architecture
	tools.log("Creating architecture...");
	const archResult = await tools.claude(
		`Use the /create-architecture skill to create an architectural document for implementing this epic.

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

	// Step 4: Generate stories
	tools.log("Generating stories...");
	const storiesResult = await tools.claude(
		`Use the /generate-stories skill to generate implementation stories from the epic and architecture.

The architecture document is at: ${config.outputDir}/architecture.md
The epic description is at: ${config.outputDir}/epic-description.md

Save the stories to: ${config.outputDir}/stories.json

Output only "SAVED" when done.`,
	);

	if (!storiesResult.success) {
		return { error: `Story generation failed: ${storiesResult.error}` };
	}

	// Read and parse stories
	const readStoriesResult = await tools.bash(
		`cat "${config.outputDir}/stories.json"`,
		{ stripOutput: false },
	);

	if (!readStoriesResult.success || !readStoriesResult.output.trim()) {
		return { error: "Failed to read generated stories" };
	}

	let stories: Story[];
	try {
		const parsed = JSON.parse(readStoriesResult.output) as { stories: Story[] };
		stories = parsed.stories ?? [];
	} catch {
		return { error: `Failed to parse stories JSON: ${readStoriesResult.output.slice(0, 200)}` };
	}

	tools.log(`Generated ${stories.length} stories`);

	// Log decision
	await logDecision(tools, config.outputDir, "Simple Mode Setup", [
		`Generated ${stories.length} implementation stories`,
		`Created architecture document v1`,
		`Epic title: ${epicTitle}`,
	]);

	return {
		variables: {
			[StateKeys.epic]: updatedEpic,
			[StateKeys.architecture]: architecture,
			[StateKeys.stories]: stories,
			[StateKeys.currentStoryIndex]: 0,
			[StateKeys.phase]: "stories",
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
