/**
 * Regenerate Rejected Stories Node
 *
 * Regenerates stories that failed review, incorporating the specific feedback
 * from the reviewer to improve quality.
 *
 * Reference: Section 8.3.3 Story Rejection Handling
 */

import type { NodeFunction } from "../../../../src/core/graph/types.ts";
import { getRefinementPrompt } from "../prompts/refinement.ts";
import {
	getAnalysis,
	getConfig,
	getCurrentPass,
	getStoryPlan,
	getStoryReview,
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
 * Regenerate Rejected Node
 *
 * Responsibilities:
 * 1. Get rejected stories with their feedback
 * 2. Call agentSession with refinement prompt (including rejection feedback)
 * 3. Parse regenerated stories
 * 4. Replace rejected stories with new versions
 *
 * Type: AI (uses agentSession)
 * Model: sonnet (per Section 7.5 - good balance for bulk generation)
 */
export const regenerateRejectedNode: NodeFunction = async (_state, tools) => {
	const config = getConfig(tools);
	const analysis = getAnalysis(tools);
	const storyPlan = getStoryPlan(tools);
	const storyReview = getStoryReview(tools);
	const currentPass = getCurrentPass(tools) ?? 1;

	if (!analysis || !storyPlan || !storyReview?.rejectedStories?.length) {
		return { error: "No rejected stories to regenerate." };
	}

	const rejectedStories = storyReview.rejectedStories;
	const currentPhase =
		PHASE_ORDER[Math.min(currentPass - 1, PHASE_ORDER.length - 1)];

	tools.log(
		`Regenerating ${rejectedStories.length} rejected stories...`,
		"info",
	);

	// Generate prompt with rejection feedback
	const prompt = getRefinementPrompt(
		analysis,
		storyPlan,
		currentPhase,
		storyReview.approvedStories ?? [],
		rejectedStories,
	);

	// Call agentSession
	const result = await tools.agentSession(prompt, {
		label: `Regenerate Stories - ${currentPhase}`,
		model: config.models.refinement,
		permissionMode: "bypassPermissions",
		workingDirectory: tools.projectPath,
	});

	if (!result.success) {
		return { error: `Story regeneration failed: ${result.error}` };
	}

	// Parse regenerated stories
	const parseResult = parseJsonArrayFromOutputSafe<Story>(result.output);

	if (!parseResult.success) {
		tools.log(`JSON parse failed: ${parseResult.error}`, "error");
		return {
			error: `Failed to parse regenerated stories: ${parseResult.error}`,
		};
	}

	const regeneratedStories = parseResult.data;
	tools.log(`Regenerated ${regeneratedStories.length} stories`, "info");

	return {
		variables: {
			[StateKeys.storyReview]: {
				...storyReview,
				currentBatch: regeneratedStories,
				rejectedStories: [],
				regenerationAttempts: (storyReview.regenerationAttempts ?? 0) + 1,
			},
		},
	};
};
