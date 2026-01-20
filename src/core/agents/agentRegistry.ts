/**
 * Agent registry for merging built-in and custom agents.
 *
 * Provides functionality to combine built-in agents with custom definitions,
 * apply overrides, and manage agent exclusions.
 */

import type { SubagentDefinition } from "../tools/claudeAgent.types.js";
import {
	BUILT_IN_AGENTS,
	getBuiltInAgentNames,
	isBuiltInAgent,
} from "./builtInAgents.js";
import type {
	AgentConfigOptions,
	AgentOverride,
	BuiltInAgentName,
} from "./types.js";

/**
 * Result of merging agents.
 */
export interface MergedAgents {
	/** Final merged agent definitions */
	agents: Record<string, SubagentDefinition>;
	/** Names of built-in agents that were included */
	includedBuiltIn: BuiltInAgentName[];
	/** Names of built-in agents that were excluded */
	excludedBuiltIn: BuiltInAgentName[];
	/** Names of custom agents that were added */
	addedCustom: string[];
	/** Names of built-in agents that were overridden */
	overridden: BuiltInAgentName[];
}

/**
 * Apply an override to an agent definition.
 *
 * @param agent - Original agent definition
 * @param override - Override values to apply
 * @returns New agent definition with overrides applied
 */
function applyOverride(
	agent: SubagentDefinition,
	override: AgentOverride,
): SubagentDefinition {
	return {
		description: override.description ?? agent.description,
		prompt: override.prompt ?? agent.prompt,
		tools: override.tools ?? agent.tools,
		model: override.model ?? agent.model,
	};
}

/**
 * Merge built-in agents with custom agents and configuration.
 *
 * The merging process follows this order:
 * 1. Start with built-in agents
 * 2. Remove excluded built-in agents
 * 3. Apply overrides to remaining built-in agents
 * 4. Add custom agents (custom wins on name collision)
 *
 * @param options - Agent configuration options
 * @returns Merged agents with metadata about the merge process
 */
export function mergeAgents(options?: AgentConfigOptions): MergedAgents {
	const result: MergedAgents = {
		agents: {},
		includedBuiltIn: [],
		excludedBuiltIn: [],
		addedCustom: [],
		overridden: [],
	};

	// Step 1: Get all built-in agent names
	const allBuiltInNames = getBuiltInAgentNames();
	const excludeSet = new Set(options?.excludeBuiltIn ?? []);

	// Step 2: Process built-in agents
	for (const name of allBuiltInNames) {
		// Check if excluded
		if (excludeSet.has(name)) {
			result.excludedBuiltIn.push(name);
			continue;
		}

		// Get the built-in definition (convert to SubagentDefinition)
		const builtInDef = BUILT_IN_AGENTS[name];
		let agentDef: SubagentDefinition = {
			description: builtInDef.description,
			prompt: builtInDef.prompt,
			tools: builtInDef.tools,
			model: builtInDef.model,
		};

		// Apply override if provided
		const override = options?.overrides?.[name];
		if (override) {
			agentDef = applyOverride(agentDef, override);
			result.overridden.push(name);
		}

		result.agents[name] = agentDef;
		result.includedBuiltIn.push(name);
	}

	// Step 3: Add custom agents (they override built-in on collision)
	if (options?.customAgents) {
		for (const [name, definition] of Object.entries(options.customAgents)) {
			// Check if this replaces a built-in
			if (isBuiltInAgent(name) && result.includedBuiltIn.includes(name)) {
				// Remove from includedBuiltIn since it's being replaced
				const idx = result.includedBuiltIn.indexOf(name);
				if (idx !== -1) {
					result.includedBuiltIn.splice(idx, 1);
				}
			}

			result.agents[name] = definition;
			result.addedCustom.push(name);
		}
	}

	return result;
}

/**
 * Get merged agents as a simple Record for use with the SDK.
 *
 * @param options - Agent configuration options
 * @returns Agent definitions ready for SDK use
 */
export function getMergedAgentDefinitions(
	options?: AgentConfigOptions,
): Record<string, SubagentDefinition> {
	return mergeAgents(options).agents;
}

/**
 * Check if any built-in agents are included after merging.
 *
 * @param options - Agent configuration options
 * @returns True if at least one built-in agent is included
 */
export function hasBuiltInAgents(options?: AgentConfigOptions): boolean {
	const merged = mergeAgents(options);
	return merged.includedBuiltIn.length > 0;
}

/**
 * Get the list of agent names available after merging.
 *
 * @param options - Agent configuration options
 * @returns Array of agent names
 */
export function getAvailableAgentNames(options?: AgentConfigOptions): string[] {
	return Object.keys(mergeAgents(options).agents);
}
