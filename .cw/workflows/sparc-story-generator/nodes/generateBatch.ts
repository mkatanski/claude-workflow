/**
 * Generate Batch Node
 *
 * Generates a batch of implementation stories for the current pass/phase.
 * Uses the refinement prompt to guide story generation based on the architecture plan.
 *
 * Reference: Section 8.3 Story Review (Post-Generation per Batch)
 */

import type { NodeFunction } from "../../../../src/core/graph/types.ts";
import { getRefinementPrompt } from "../prompts/refinement.ts";
import {
	getAnalysis,
	getConfig,
	getCurrentPass,
	getGeneratedStories,
	getRejectedStories,
	getStoryPlan,
	StateKeys,
} from "../state.ts";
import type { Story, StoryPhase } from "../types.ts";
import { parseJsonArrayFromOutputSafe } from "../utils/jsonParser.ts";

const PHASE_ORDER: StoryPhase[] = [
	"foundation",
	"core",
	"features",
	"integration",
];

/**
 * Generate Batch Node
 *
 * Responsibilities:
 * 1. Determine current pass/phase (foundation, core, features, integration)
 * 2. Get previously generated stories for context
 * 3. Call agentSession with refinement prompt
 * 4. Parse the Story[] JSON response
 * 5. Store generated stories in state
 *
 * Type: AI (uses agentSession)
 * Model: sonnet (per Section 7.5 - good balance for bulk generation)
 */
export const generateBatchNode: NodeFunction = async (_state, tools) => {
	const config = getConfig(tools);
	const analysis = getAnalysis(tools);
	const storyPlan = getStoryPlan(tools);
	const currentPass = getCurrentPass(tools) ?? 1;
	const existingStories = getGeneratedStories(tools) ?? [];
	const rejectedStories = getRejectedStories(tools);

	if (!analysis || !storyPlan) {
		return {
			error: "No story plan available. Architecture phase must complete first.",
		};
	}

	// Determine current phase based on pass number
	const currentPhase =
		PHASE_ORDER[Math.min(currentPass - 1, PHASE_ORDER.length - 1)];

	tools.log(
		`Starting story generation for Phase ${currentPass}: ${currentPhase}...`,
		"info",
	);

	// Generate the prompt
	const prompt = getRefinementPrompt(
		analysis,
		storyPlan,
		currentPhase,
		existingStories,
		rejectedStories ?? undefined,
	);

	// Call agentSession
	const result = await tools.agentSession(prompt, {
		label: `Generate Stories - ${currentPhase}`,
		model: config.models.refinement,
		permissionMode: "bypassPermissions",
		workingDirectory: tools.projectPath,
	});

	if (!result.success) {
		return { error: `Story generation failed: ${result.error}` };
	}

	// Parse story array from output
	const parseResult = parseJsonArrayFromOutputSafe<Story>(result.output);

	if (!parseResult.success) {
		tools.log(`JSON parse failed: ${parseResult.error}`, "error");
		return {
			error: `Failed to parse stories: ${parseResult.error}`,
		};
	}

	const newStories = parseResult.data;
	tools.log(
		`Generated ${newStories.length} stories for ${currentPhase} phase`,
		"info",
	);

	return {
		variables: {
			[StateKeys.storyReview]: {
				currentBatch: newStories,
				approvedStories: [],
				rejectedStories: [],
				regenerationAttempts: 0,
			},
		},
	};
};
