/**
 * Routing functions for SPARC Story Generator workflow
 *
 * These functions determine which node to execute next based on
 * state conditions. They implement the conditional logic for:
 * - Analysis review approval/rejection
 * - Story review approval/rejection
 * - Batch validation and pass progression
 */

import type { RoutingFunction } from "../../../../src/core/graph/types.ts";
import {
	getAnalysisReview,
	getConfig,
	getCurrentPass,
	getStoryReview,
	getTotalPasses,
} from "../state.ts";

/**
 * Route after analysis review based on approval status.
 *
 * Flow:
 * - If approved → generate_batch (proceed to story generation)
 * - If rejected AND attempts < max → specification (retry analysis)
 * - If rejected AND attempts >= max → end_with_error (max attempts reached)
 *
 * Reference: Section 4.1 "High-Level Flow" and Section 8.2.3 "Rejection Handling"
 */
export const routeAfterAnalysisReview: RoutingFunction = async (
	_state,
	tools,
) => {
	const config = getConfig(tools);
	const review = getAnalysisReview(tools);

	// If review is not present, skip review was configured, proceed to generation
	if (!review) {
		tools.log(
			"Analysis review skipped (disabled in config). Proceeding to story generation.",
			"info",
		);
		return "generate_batch";
	}

	// Analysis approved - proceed to story generation
	if (review.approved) {
		tools.log("Analysis approved. Proceeding to story generation.", "info");
		return "generate_batch";
	}

	// Analysis rejected - check if we can retry
	const maxAttempts = config.review.analysisReview.maxAttempts;
	if (review.attempts >= maxAttempts) {
		tools.log(
			`Analysis rejected after ${maxAttempts} attempts. Ending workflow with error.`,
			"error",
		);
		return "end_with_error";
	}

	// Retry specification with feedback
	tools.log(
		`Analysis rejected (attempt ${review.attempts}/${maxAttempts}). Retrying specification with feedback.`,
		"warning",
	);
	return "specification";
};

/**
 * Route after story review based on approval status.
 *
 * Flow:
 * - If all approved OR no rejected → validate_batch
 * - If has rejected AND regeneration < max → regenerate_rejected
 * - If has rejected AND regeneration >= max → validate_batch (partial batch if allowed)
 *
 * Reference: Section 4.1 "High-Level Flow" and Section 8.3.3 "Story Rejection Handling"
 */
export const routeAfterStoryReview: RoutingFunction = async (_state, tools) => {
	const config = getConfig(tools);
	const storyReview = getStoryReview(tools);

	// If review is not present, skip review was configured, proceed to validation
	if (!storyReview) {
		tools.log(
			"Story review skipped (disabled in config). Proceeding to validation.",
			"info",
		);
		return "validate_batch";
	}

	// Count rejected stories
	const rejectedCount = storyReview.rejectedStories?.length ?? 0;

	// All stories approved - proceed to validation
	if (rejectedCount === 0) {
		tools.log("All stories approved. Proceeding to validation.", "info");
		return "validate_batch";
	}

	// Some stories rejected - check if we can regenerate
	const maxRegen = config.review.storyReview.maxRegenerationAttempts;
	const currentAttempts = storyReview.regenerationAttempts ?? 0;

	if (currentAttempts >= maxRegen) {
		// Regeneration exhausted
		if (config.review.storyReview.allowPartialBatch) {
			tools.log(
				`Regeneration exhausted (${currentAttempts}/${maxRegen} attempts). ` +
					`Accepting partial batch with ${rejectedCount} rejected stories.`,
				"warning",
			);
		} else {
			tools.log(
				`Regeneration exhausted (${currentAttempts}/${maxRegen} attempts). ` +
					`Proceeding to validation with ${rejectedCount} rejected stories.`,
				"warning",
			);
		}
		return "validate_batch";
	}

	// Regenerate rejected stories
	tools.log(
		`${rejectedCount} stories rejected (attempt ${currentAttempts + 1}/${maxRegen}). ` +
			`Regenerating rejected stories.`,
		"warning",
	);
	return "regenerate_rejected";
};

/**
 * Route after batch validation based on pass progression.
 *
 * Flow:
 * - If currentPass < totalPasses → generate_batch (next pass)
 * - If currentPass >= totalPasses → completion (all passes done)
 *
 * Reference: Section 4.1 "High-Level Flow" and Section 5.1 "Pass-Based Generation"
 */
export const routeAfterValidateBatch: RoutingFunction = async (
	_state,
	tools,
) => {
	const currentPass = getCurrentPass(tools) ?? 1;
	const totalPasses = getTotalPasses(tools) ?? 4;

	// Check if more passes needed
	if (currentPass < totalPasses) {
		tools.log(
			`Pass ${currentPass}/${totalPasses} complete. Generating next batch.`,
			"info",
		);
		return "generate_batch";
	}

	// All passes complete
	tools.log(
		`All ${totalPasses} passes complete. Proceeding to completion.`,
		"info",
	);
	return "completion";
};
