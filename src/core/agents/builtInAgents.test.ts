/**
 * Unit tests for built-in agents.
 */

import { describe, expect, it } from "bun:test";
import {
	BUILT_IN_AGENTS,
	getBuiltInAgent,
	getBuiltInAgentNames,
	isBuiltInAgent,
	PLAN_AGENT,
} from "./builtInAgents.js";
import { READ_ONLY_TOOLS } from "./types.js";

describe("Built-in Agents", () => {
	describe("PLAN_AGENT", () => {
		it("should have required properties", () => {
			expect(PLAN_AGENT.description).toBeDefined();
			expect(PLAN_AGENT.prompt).toBeDefined();
			expect(PLAN_AGENT.tools).toBeDefined();
			expect(PLAN_AGENT.model).toBeDefined();
		});

		it("should be read-only", () => {
			expect(PLAN_AGENT.readOnly).toBe(true);
		});

		it("should support plan mode", () => {
			expect(PLAN_AGENT.supportsPlanMode).toBe(true);
		});

		it("should use opus model for complex reasoning", () => {
			expect(PLAN_AGENT.model).toBe("opus");
		});

		it("should only have read-only tools", () => {
			for (const tool of PLAN_AGENT.tools) {
				expect(READ_ONLY_TOOLS).toContain(tool);
			}
		});

		it("should mention planning in prompt", () => {
			expect(PLAN_AGENT.prompt.toLowerCase()).toContain("plan");
		});

		it("should mention critical files in prompt", () => {
			expect(PLAN_AGENT.prompt).toContain("Critical Files");
		});
	});

	describe("BUILT_IN_AGENTS", () => {
		it("should contain Plan agent", () => {
			expect(BUILT_IN_AGENTS).toHaveProperty("Plan");
			expect(BUILT_IN_AGENTS.Plan).toBe(PLAN_AGENT);
		});

		it("should have exactly 1 built-in agent", () => {
			expect(Object.keys(BUILT_IN_AGENTS)).toHaveLength(1);
		});
	});

	describe("getBuiltInAgent", () => {
		it("should return Plan agent by name", () => {
			const agent = getBuiltInAgent("Plan");

			expect(agent).toBe(PLAN_AGENT);
		});
	});

	describe("getBuiltInAgentNames", () => {
		it("should return array of agent names", () => {
			const names = getBuiltInAgentNames();

			expect(Array.isArray(names)).toBe(true);
			expect(names).toContain("Plan");
		});

		it("should return exactly 1 name", () => {
			const names = getBuiltInAgentNames();

			expect(names).toHaveLength(1);
		});
	});

	describe("isBuiltInAgent", () => {
		it("should return true for Plan", () => {
			expect(isBuiltInAgent("Plan")).toBe(true);
		});

		it("should return false for unknown agent", () => {
			expect(isBuiltInAgent("Unknown")).toBe(false);
		});

		it("should return false for empty string", () => {
			expect(isBuiltInAgent("")).toBe(false);
		});

		it("should be case-sensitive", () => {
			expect(isBuiltInAgent("plan")).toBe(false);
			expect(isBuiltInAgent("PLAN")).toBe(false);
		});
	});

	describe("READ_ONLY_TOOLS", () => {
		it("should contain expected tools", () => {
			expect(READ_ONLY_TOOLS).toContain("Read");
			expect(READ_ONLY_TOOLS).toContain("Glob");
			expect(READ_ONLY_TOOLS).toContain("Grep");
			expect(READ_ONLY_TOOLS).toContain("WebFetch");
			expect(READ_ONLY_TOOLS).toContain("WebSearch");
		});

		it("should not contain write tools", () => {
			expect(READ_ONLY_TOOLS).not.toContain("Write");
			expect(READ_ONLY_TOOLS).not.toContain("Edit");
			expect(READ_ONLY_TOOLS).not.toContain("Bash");
		});
	});
});
