/**
 * Review Stories Node (Secondary AI Reviewer)
 *
 * Validates generated stories for quality, completeness, and correctness
 * using a secondary AI agent.
 *
 * Reference: Section 8.3 Story Review (Post-Generation per Batch)
 */

import type { NodeFunction } from "../../../../src/core/graph/types.ts";
import { getStoryReviewPrompt } from "../prompts/storyReview.ts";
import {
	getConfig,
	getCurrentPass,
	getGeneratedStories,
	getStoryPlan,
	getStoryReview,
	StateKeys,
} from "../state.ts";
import type { BatchReviewResult, Story, StoryWithFeedback } from "../types.ts";
import { parseJsonFromOutputSafe } from "../utils/jsonParser.ts";

const PHASE_ORDER = ["foundation", "core", "features", "integration"];

/**
 * Review Stories Node
 *
 * Responsibilities:
 * 1. Get the current batch of stories
 * 2. Call agentSession with story review prompt
 * 3. Parse BatchReviewResult JSON response
 * 4. Separate approved and rejected stories
 * 5. Update story review state
 *
 * Type: AI Secondary Reviewer (uses agentSession)
 * Model: sonnet (per Section 7.5 - cost-effective for review)
 */
export const reviewStoriesNode: NodeFunction = async (_state, tools) => {
	const config = getConfig(tools);
	const storyPlan = getStoryPlan(tools);
	const storyReview = getStoryReview(tools);
	const approvedStories = getGeneratedStories(tools) ?? [];
	const currentPass = getCurrentPass(tools) ?? 1;

	if (!storyPlan || !storyReview?.currentBatch) {
		return { error: "No stories to review." };
	}

	const currentBatch = storyReview.currentBatch;
	const currentPhase =
		PHASE_ORDER[Math.min(currentPass - 1, PHASE_ORDER.length - 1)];

	tools.log(`Reviewing ${currentBatch.length} stories...`, "info");

	// Generate review prompt
	const prompt = getStoryReviewPrompt(
		storyPlan,
		currentBatch,
		approvedStories,
		currentPhase,
	);

	// Call agentSession
	const result = await tools.agentSession(prompt, {
		label: "Story Review",
		model: config.models.storyReviewer,
		permissionMode: "bypassPermissions",
		workingDirectory: tools.projectPath,
	});

	if (!result.success) {
		return { error: `Story review failed: ${result.error}` };
	}

	// Parse review result
	const parseResult = parseJsonFromOutputSafe<BatchReviewResult>(result.output);

	if (!parseResult.success) {
		tools.log(`JSON parse failed: ${parseResult.error}`, "error");
		return {
			error: `Failed to parse review result: ${parseResult.error}`,
		};
	}

	const reviewResult = parseResult.data;

	// Separate approved and rejected stories
	const approved: Story[] = [];
	const rejected: StoryWithFeedback[] = [];

	for (const storyResult of reviewResult.results) {
		const story = currentBatch.find((s) => s.id === storyResult.storyId);
		if (!story) {
			tools.log(
				`Warning: Review result for unknown story ID: ${storyResult.storyId}`,
				"warning",
			);
			continue;
		}

		if (storyResult.approved) {
			approved.push(story);
		} else {
			// Find blocking issues for rejection reason
			const blockingIssue = storyResult.issues.find(
				(i) => i.severity === "blocking",
			);
			rejected.push({
				...story,
				reviewFeedback: storyResult.issues.map((i) => i.description).join("; "),
				rejectionReason:
					blockingIssue?.description ?? "Quality below threshold",
			});
		}
	}

	tools.log(
		`Stories approved: ${approved.length}, rejected: ${rejected.length}`,
		"info",
	);

	return {
		variables: {
			[StateKeys.storyReview]: {
				...storyReview,
				approvedStories: [...(storyReview.approvedStories ?? []), ...approved],
				rejectedStories: rejected,
			},
		},
	};
};
