/**
 * Unit tests for agent registry.
 */

import { describe, expect, it } from "bun:test";
import {
	getAvailableAgentNames,
	getMergedAgentDefinitions,
	hasBuiltInAgents,
	mergeAgents,
} from "./agentRegistry.js";
import { BUILT_IN_AGENTS } from "./builtInAgents.js";

describe("Agent Registry", () => {
	describe("mergeAgents", () => {
		describe("with no options", () => {
			it("should include all built-in agents", () => {
				const result = mergeAgents();

				expect(result.agents).toHaveProperty("Plan");
				expect(result.includedBuiltIn).toContain("Plan");
			});

			it("should have no excluded or overridden agents", () => {
				const result = mergeAgents();

				expect(result.excludedBuiltIn).toHaveLength(0);
				expect(result.overridden).toHaveLength(0);
				expect(result.addedCustom).toHaveLength(0);
			});
		});

		describe("with exclusions", () => {
			it("should exclude specified built-in agents", () => {
				const result = mergeAgents({
					excludeBuiltIn: ["Plan"],
				});

				expect(result.agents).not.toHaveProperty("Plan");
				expect(result.excludedBuiltIn).toContain("Plan");
				expect(result.includedBuiltIn).not.toContain("Plan");
			});

			it("should exclude all agents when all are excluded", () => {
				const result = mergeAgents({
					excludeBuiltIn: ["Plan"],
				});

				expect(Object.keys(result.agents)).toHaveLength(0);
			});
		});

		describe("with overrides", () => {
			it("should apply override to built-in agent model", () => {
				const result = mergeAgents({
					overrides: {
						Plan: {
							model: "haiku",
						},
					},
				});

				expect(result.agents.Plan.model).toBe("haiku");
				expect(result.overridden).toContain("Plan");
			});

			it("should apply override to built-in agent tools", () => {
				const customTools: ("Read" | "Grep")[] = ["Read", "Grep"];
				const result = mergeAgents({
					overrides: {
						Plan: {
							tools: customTools,
						},
					},
				});

				expect(result.agents.Plan.tools).toEqual(customTools);
			});

			it("should preserve non-overridden properties", () => {
				const originalPrompt = BUILT_IN_AGENTS.Plan.prompt;
				const result = mergeAgents({
					overrides: {
						Plan: {
							model: "haiku",
						},
					},
				});

				expect(result.agents.Plan.prompt).toBe(originalPrompt);
			});
		});

		describe("with custom agents", () => {
			it("should add custom agents", () => {
				const result = mergeAgents({
					customAgents: {
						SecurityReview: {
							description: "Security specialist",
							prompt: "You are a security expert",
							tools: ["Read", "Grep"],
							model: "opus",
						},
					},
				});

				expect(result.agents).toHaveProperty("SecurityReview");
				expect(result.addedCustom).toContain("SecurityReview");
			});

			it("should allow custom agent to override built-in by name", () => {
				const result = mergeAgents({
					customAgents: {
						Plan: {
							description: "Custom Plan",
							prompt: "Custom prompt",
							tools: ["Read"],
							model: "haiku",
						},
					},
				});

				expect(result.agents.Plan.description).toBe("Custom Plan");
				expect(result.addedCustom).toContain("Plan");
				// When custom replaces built-in, it's removed from includedBuiltIn
				expect(result.includedBuiltIn).not.toContain("Plan");
			});
		});

		describe("with combined options", () => {
			it("should handle exclusion and custom agents together", () => {
				const result = mergeAgents({
					excludeBuiltIn: ["Plan"],
					customAgents: {
						CustomPlanner: {
							description: "Custom planning agent",
							prompt: "Custom planner prompt",
							tools: ["Read", "Glob"],
							model: "sonnet",
						},
					},
				});

				expect(result.agents).not.toHaveProperty("Plan");
				expect(result.agents).toHaveProperty("CustomPlanner");
			});

			it("should handle overrides and custom agents together", () => {
				const result = mergeAgents({
					overrides: {
						Plan: { model: "haiku" },
					},
					customAgents: {
						Analyzer: {
							description: "Code analyzer",
							prompt: "Analyze code",
							tools: ["Read"],
							model: "sonnet",
						},
					},
				});

				expect(result.agents.Plan.model).toBe("haiku");
				expect(result.agents).toHaveProperty("Analyzer");
				expect(result.overridden).toContain("Plan");
				expect(result.addedCustom).toContain("Analyzer");
			});
		});
	});

	describe("getMergedAgentDefinitions", () => {
		it("should return agent definitions as simple Record", () => {
			const result = getMergedAgentDefinitions();

			expect(typeof result).toBe("object");
			expect(result.Plan).toBeDefined();
		});

		it("should apply options correctly", () => {
			const result = getMergedAgentDefinitions({
				excludeBuiltIn: ["Plan"],
			});

			expect(result.Plan).toBeUndefined();
		});
	});

	describe("hasBuiltInAgents", () => {
		it("should return true when built-in agents are included", () => {
			const result = hasBuiltInAgents();

			expect(result).toBe(true);
		});

		it("should return false when all built-in agents are excluded", () => {
			const result = hasBuiltInAgents({
				excludeBuiltIn: ["Plan"],
			});

			expect(result).toBe(false);
		});
	});

	describe("getAvailableAgentNames", () => {
		it("should return array of agent names", () => {
			const result = getAvailableAgentNames();

			expect(Array.isArray(result)).toBe(true);
			expect(result).toContain("Plan");
		});

		it("should include custom agents in names", () => {
			const result = getAvailableAgentNames({
				customAgents: {
					CustomAgent: {
						description: "Custom",
						prompt: "Custom prompt",
						tools: [],
						model: "sonnet",
					},
				},
			});

			expect(result).toContain("CustomAgent");
		});

		it("should exclude excluded agents from names", () => {
			const result = getAvailableAgentNames({
				excludeBuiltIn: ["Plan"],
			});

			expect(result).not.toContain("Plan");
		});
	});
});
