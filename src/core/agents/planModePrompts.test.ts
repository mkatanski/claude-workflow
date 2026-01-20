/**
 * Unit tests for plan mode prompts.
 */

import { describe, expect, it } from "bun:test";
import {
	buildPlanModeSystemPrompt,
	hasPlanModeReminder,
	PLAN_MODE_FULL_SYSTEM_PROMPT,
	PLAN_MODE_SYSTEM_REMINDER,
	removePlanModeReminder,
} from "./planModePrompts.js";

describe("Plan Mode Prompts", () => {
	describe("PLAN_MODE_SYSTEM_REMINDER", () => {
		it("should contain Plan Mode Active marker", () => {
			expect(PLAN_MODE_SYSTEM_REMINDER).toContain("Plan Mode Active");
		});

		it("should contain read-only constraint", () => {
			expect(PLAN_MODE_SYSTEM_REMINDER).toContain("READ-ONLY");
		});

		it("should mention critical files requirement", () => {
			expect(PLAN_MODE_SYSTEM_REMINDER).toContain("Critical Files");
		});

		it("should mention implementation steps", () => {
			expect(PLAN_MODE_SYSTEM_REMINDER).toContain("Implementation Steps");
		});
	});

	describe("PLAN_MODE_FULL_SYSTEM_PROMPT", () => {
		it("should contain Plan Mode marker", () => {
			expect(PLAN_MODE_FULL_SYSTEM_PROMPT).toContain("Plan Mode Active");
		});

		it("should contain software architect role", () => {
			expect(PLAN_MODE_FULL_SYSTEM_PROMPT).toContain("software architect");
		});

		it("should describe planning process", () => {
			expect(PLAN_MODE_FULL_SYSTEM_PROMPT).toContain("Planning Process");
		});
	});

	describe("buildPlanModeSystemPrompt", () => {
		it("should return reminder when no base prompt provided", () => {
			const result = buildPlanModeSystemPrompt();

			expect(result).toContain("Plan Mode Active");
			expect(result.trim()).toBe(PLAN_MODE_SYSTEM_REMINDER.trim());
		});

		it("should prepend base prompt when provided", () => {
			const basePrompt = "You are a helpful assistant.";
			const result = buildPlanModeSystemPrompt(basePrompt);

			expect(result).toStartWith(basePrompt);
			expect(result).toContain("Plan Mode Active");
		});

		it("should separate base prompt and reminder with newlines", () => {
			const basePrompt = "Base prompt content";
			const result = buildPlanModeSystemPrompt(basePrompt);

			expect(result).toContain("\n\n");
			expect(result).toContain(basePrompt);
			expect(result).toContain(PLAN_MODE_SYSTEM_REMINDER);
		});

		it("should handle empty string base prompt", () => {
			const result = buildPlanModeSystemPrompt("");

			// Empty string is truthy enough to pass the condition
			expect(result).toContain("Plan Mode Active");
		});
	});

	describe("hasPlanModeReminder", () => {
		it("should return true when reminder is present", () => {
			const prompt = "Some prompt\n\n## Plan Mode Active\n\nMore content";

			expect(hasPlanModeReminder(prompt)).toBe(true);
		});

		it("should return false when reminder is not present", () => {
			const prompt = "Some regular prompt without plan mode";

			expect(hasPlanModeReminder(prompt)).toBe(false);
		});

		it("should detect reminder in full system prompt", () => {
			expect(hasPlanModeReminder(PLAN_MODE_FULL_SYSTEM_PROMPT)).toBe(true);
		});

		it("should detect reminder in built prompt", () => {
			const built = buildPlanModeSystemPrompt("Base prompt");

			expect(hasPlanModeReminder(built)).toBe(true);
		});
	});

	describe("removePlanModeReminder", () => {
		it("should remove plan mode section from prompt", () => {
			const basePrompt = "You are a helpful assistant.";
			const fullPrompt = buildPlanModeSystemPrompt(basePrompt);

			const result = removePlanModeReminder(fullPrompt);

			expect(result).toContain(basePrompt);
			expect(result).not.toContain("Plan Mode Active");
		});

		it("should return original prompt if no reminder present", () => {
			const prompt = "Regular prompt without plan mode";

			const result = removePlanModeReminder(prompt);

			expect(result).toBe(prompt);
		});

		it("should handle prompt that is only the reminder", () => {
			const prompt = "## Plan Mode Active\n\nSome content";

			const result = removePlanModeReminder(prompt);

			expect(result).toBe("");
		});

		it("should preserve content before the marker", () => {
			const prompt =
				"First section\n\nSecond section\n\n## Plan Mode Active\n\nPlan content";

			const result = removePlanModeReminder(prompt);

			expect(result).toContain("First section");
			expect(result).toContain("Second section");
		});
	});
});
