/**
 * Validate Batch Node - Deterministic validation of generated stories
 * Reference: Section 4.2 Node Responsibilities, Section 5.2 Story Schema
 *
 * This node validates story structure against the required schema:
 * - Checks all required fields are present
 * - Validates field values against allowed enums
 * - Validates acceptance criteria count (minimum 3)
 * - Validates dependencies reference existing stories
 * - Adds validated stories to the generated stories list
 * - Increments current pass for next iteration
 */

import type { NodeFunction } from "../../../../src/core/graph/types.ts";
import {
	getConfig,
	getCurrentPass,
	getGeneratedStories,
	getStoryReview,
	StateKeys,
} from "../state.ts";
import type { Story, StoryPhase } from "../types.ts";

const VALID_PHASES: StoryPhase[] = [
	"foundation",
	"core",
	"features",
	"integration",
];
const VALID_PRIORITIES = ["high", "medium", "low"];
const VALID_EFFORTS = ["small", "medium", "large", "xl"];

/**
 * Individual validation error for a story
 */
interface ValidationError {
	storyId: string;
	field: string;
	message: string;
}

/**
 * Validate a single story against the schema requirements.
 *
 * @param story - Story to validate
 * @param existingIds - Set of existing story IDs for dependency validation
 * @returns Array of validation errors (empty if valid)
 */
function validateStory(
	story: Story,
	existingIds: Set<string>,
): ValidationError[] {
	const errors: ValidationError[] = [];
	const id = story.id ?? "unknown";

	// Required field: id
	if (!story.id) {
		errors.push({ storyId: id, field: "id", message: "Missing id" });
	}

	// Required field: title
	if (!story.title) {
		errors.push({ storyId: id, field: "title", message: "Missing title" });
	}

	// Required field: description
	if (!story.description) {
		errors.push({
			storyId: id,
			field: "description",
			message: "Missing description",
		});
	}

	// Required field: phase (with enum validation)
	if (!story.phase || !VALID_PHASES.includes(story.phase)) {
		errors.push({
			storyId: id,
			field: "phase",
			message: `Invalid phase: ${story.phase}. Must be one of: ${VALID_PHASES.join(", ")}`,
		});
	}

	// Required field: priority (with enum validation)
	if (!story.priority || !VALID_PRIORITIES.includes(story.priority)) {
		errors.push({
			storyId: id,
			field: "priority",
			message: `Invalid priority: ${story.priority}. Must be one of: ${VALID_PRIORITIES.join(", ")}`,
		});
	}

	// Required field: estimatedEffort (with enum validation)
	if (
		!story.estimatedEffort ||
		!VALID_EFFORTS.includes(story.estimatedEffort)
	) {
		errors.push({
			storyId: id,
			field: "estimatedEffort",
			message: `Invalid effort: ${story.estimatedEffort}. Must be one of: ${VALID_EFFORTS.join(", ")}`,
		});
	}

	// Required field: acceptanceCriteria (minimum 3)
	if (!story.acceptanceCriteria || story.acceptanceCriteria.length < 3) {
		errors.push({
			storyId: id,
			field: "acceptanceCriteria",
			message: "Must have at least 3 acceptance criteria",
		});
	}

	// Required field: dependencies (array, can be empty)
	if (!story.dependencies) {
		errors.push({
			storyId: id,
			field: "dependencies",
			message: "Missing dependencies field (can be empty array)",
		});
	} else {
		// Validate dependencies reference existing stories
		for (const dep of story.dependencies) {
			if (!existingIds.has(dep)) {
				errors.push({
					storyId: id,
					field: "dependencies",
					message: `Invalid dependency: ${dep} (story does not exist)`,
				});
			}
		}
	}

	// Required field: tags (array, can be empty)
	if (!story.tags) {
		errors.push({
			storyId: id,
			field: "tags",
			message: "Missing tags field (can be empty array)",
		});
	}

	return errors;
}

/**
 * Validate Batch Node
 *
 * Validates approved stories from review against the schema:
 * 1. Validates story structure against required schema
 * 2. Checks all required fields are present
 * 3. Validates dependencies reference existing stories
 * 4. Adds validated stories to generated stories list
 * 5. Increments current pass for next iteration
 * 6. Clears storyReview state for next pass
 */
export const validateBatchNode: NodeFunction = async (_state, tools) => {
	const _config = getConfig(tools);
	const storyReview = getStoryReview(tools);
	const existingStories = getGeneratedStories(tools) ?? [];
	const currentPass = getCurrentPass(tools) ?? 1;

	if (!storyReview?.approvedStories?.length) {
		tools.log("No approved stories to validate.", "warning");
		return {
			variables: {
				[StateKeys.currentPass]: currentPass + 1,
			},
		};
	}

	const approvedStories = storyReview.approvedStories;
	tools.log(`Validating ${approvedStories.length} approved stories...`, "info");

	// Build set of existing story IDs for dependency validation
	const existingIds = new Set<string>(existingStories.map((s) => s.id));
	// Also include IDs from current batch (for internal dependencies)
	for (const story of approvedStories) {
		if (story.id) existingIds.add(story.id);
	}

	const validStories: Story[] = [];
	const allErrors: ValidationError[] = [];

	// Validate each story
	for (const story of approvedStories) {
		const errors = validateStory(story, existingIds);
		if (errors.length === 0) {
			validStories.push(story);
		} else {
			allErrors.push(...errors);
		}
	}

	// Log validation errors if any
	if (allErrors.length > 0) {
		tools.log(`Validation errors found: ${allErrors.length}`, "warning");
		for (const error of allErrors.slice(0, 5)) {
			tools.log(
				`  [${error.storyId}] ${error.field}: ${error.message}`,
				"warning",
			);
		}
		if (allErrors.length > 5) {
			tools.log(`  ... and ${allErrors.length - 5} more errors`, "warning");
		}
	}

	tools.log(
		`Validated ${validStories.length}/${approvedStories.length} stories`,
		"info",
	);

	// Merge valid stories with existing stories
	const allStories = [...existingStories, ...validStories];

	return {
		variables: {
			[StateKeys.generatedStories]: allStories,
			[StateKeys.currentPass]: currentPass + 1,
			[StateKeys.storyReview]: null, // Clear for next pass
		},
	};
};
