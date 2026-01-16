/**
 * Helper module exports.
 */

import type { StepDefinition } from "../../../../src/types/index.ts";

export * from "./checklist.ts";
export * from "./claude.ts";
export * from "./files.ts";
export * from "./git.ts";
export * from "./json.ts";
// Re-export all helpers
export * from "./logging.ts";
export * from "./testing.ts";

/**
 * Add a condition to a list of steps.
 * Used for conditional phase execution (e.g., simple vs milestone mode).
 */
export function withCondition(
	steps: StepDefinition[],
	condition: string,
): StepDefinition[] {
	return steps.map((step) => {
		if ("type" in step) {
			// It's a loop definition, we can't add when directly
			return step;
		}
		return {
			...step,
			when: step.when ? `(${step.when}) && (${condition})` : condition,
		};
	});
}
