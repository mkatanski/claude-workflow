/**
 * Analysis Review Node (Secondary AI Reviewer)
 *
 * Validates the architectural analysis (Specification + Pseudocode + Architecture phases)
 * for accuracy and completeness using a secondary AI agent.
 *
 * Reference: Section 8.2 Analysis Review (Post-Architecture Phase)
 */

import type { NodeFunction } from "../../../../src/core/graph/types.ts";
import { getAnalysisReviewPrompt } from "../prompts/analysisReview.ts";
import {
	getAnalysis,
	getAnalysisReview,
	getApproach,
	getConfig,
	getDocumentContent,
	getStoryPlan,
	StateKeys,
} from "../state.ts";
import type { AnalysisReviewResult } from "../types.ts";
import { parseJsonFromOutputSafe } from "../utils/jsonParser.ts";

/**
 * Review Analysis Node
 *
 * Responsibilities:
 * 1. Get the original document content and generated analysis from state
 * 2. Call agentSession with the analysis review prompt
 * 3. Parse the AnalysisReviewResult JSON response
 * 4. Store the review result in state
 * 5. Handle rejection by tracking attempts
 *
 * Type: AI Secondary Reviewer (uses agentSession)
 * Model: sonnet (per Section 7.5 - cost-effective for review)
 */
export const reviewAnalysisNode: NodeFunction = async (_state, tools) => {
	const config = getConfig(tools);
	const documentContent = getDocumentContent(tools);
	const analysis = getAnalysis(tools);
	const approach = getApproach(tools);
	const storyPlan = getStoryPlan(tools);
	const previousReview = getAnalysisReview(tools);

	// Validate all required data is available
	if (!documentContent || !analysis || !approach || !storyPlan) {
		return {
			error:
				"Missing required data for analysis review. All SPARC phases (Specification, Pseudocode, Architecture) must complete first.",
		};
	}

	// Track attempt number
	const attemptNumber = (previousReview?.attempts ?? 0) + 1;

	tools.log(`Starting Analysis Review (attempt ${attemptNumber})...`, "info");

	// Get previous feedback if this is a retry
	const previousFeedback = previousReview?.feedback;

	// Generate the review prompt
	// Note: The prompt expects specification and architecture, but we pass approach (pseudocode) as architecture
	// since the review validates the complete analysis including the planning approach
	const prompt = getAnalysisReviewPrompt(
		documentContent,
		analysis,
		storyPlan,
		attemptNumber,
		previousFeedback,
	);

	// Call agentSession with sonnet model (cost-effective for review per Section 7.5)
	const result = await tools.agentSession(prompt, {
		label: "Analysis Review",
		model: config.models.analysisReviewer, // "sonnet"
		permissionMode: "bypassPermissions",
		workingDirectory: tools.projectPath,
	});

	if (!result.success) {
		return {
			error: `Analysis review failed: ${result.error}`,
		};
	}

	// Parse JSON from output
	const parseResult = parseJsonFromOutputSafe<AnalysisReviewResult>(
		result.output,
	);

	if (!parseResult.success) {
		tools.log(`JSON parse failed: ${parseResult.error}`, "error");
		return {
			error: `Failed to parse analysis review output: ${parseResult.error}`,
		};
	}

	const reviewResult = parseResult.data;

	tools.log(
		`Analysis Review complete. Approved: ${reviewResult.approved}`,
		"info",
	);
	tools.log(
		`Confidence: ${(reviewResult.confidence * 100).toFixed(0)}%`,
		"info",
	);
	tools.log(`Gaps found: ${reviewResult.gaps.length}`, "info");

	if (!reviewResult.approved) {
		tools.log(`Rejection feedback: ${reviewResult.feedback}`, "warning");
		tools.log(
			`Number of suggestions: ${reviewResult.suggestions.length}`,
			"warning",
		);
	} else {
		tools.log("Analysis approved! Proceeding to story generation.", "info");
	}

	// Map AnalysisGap objects to strings for state storage
	const gapDescriptions = reviewResult.gaps.map(
		(gap) =>
			`[${gap.type}] ${gap.description}${gap.sourceReference ? ` (${gap.sourceReference})` : ""}`,
	);

	return {
		variables: {
			[StateKeys.analysisReview]: {
				approved: reviewResult.approved,
				feedback: reviewResult.feedback,
				gaps: gapDescriptions,
				suggestions: reviewResult.suggestions,
				reviewerModel: config.models.analysisReviewer,
				attempts: attemptNumber,
				confidence: reviewResult.confidence,
			},
		},
	};
};
