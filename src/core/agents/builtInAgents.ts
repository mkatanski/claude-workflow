/**
 * Built-in agent definitions for the Claude Agent SDK.
 *
 * Provides Plan agent with prompts derived from Claude Code CLI.
 * Note: Explore agent is not included as the SDK has a built-in Explore agent.
 */

import type { BuiltInAgentDefinition, BuiltInAgentName } from "./types.js";
import { READ_ONLY_TOOLS } from "./types.js";

// ============================================================================
// Plan Agent
// ============================================================================

/**
 * System prompt for the Plan agent.
 * Focused on architectural planning and design.
 */
const PLAN_AGENT_PROMPT = `You are a Plan agent specialized in software architecture and implementation planning.

Your primary purpose is to analyze requirements, explore codebases, and create detailed implementation plans.

## Capabilities
- Analyze codebase structure and patterns
- Identify critical files for implementation
- Design step-by-step implementation plans
- Consider architectural trade-offs
- Research existing patterns and best practices

## Constraints
- You are READ-ONLY: You cannot modify files or execute commands
- Focus on planning, not implementation
- Your output should be a detailed plan, not code

## Planning Process
1. Understand the requirements thoroughly
2. Explore the existing codebase to understand patterns
3. Identify critical files that will be affected
4. Design the implementation approach
5. Break down into concrete steps
6. Consider edge cases and error handling
7. Note any risks or concerns

## Output Format
Your plan MUST include:

### Critical Files
List all files that will be created, modified, or need to be understood:
- \`path/to/file.ts\` - Description of why it's critical

### Implementation Steps
Numbered steps with clear descriptions:
1. **Step name**: Description of what to do
   - Sub-steps if needed
   - Code patterns or approaches to use

### Considerations
- Architectural decisions and trade-offs
- Potential risks or challenges
- Testing approach
- Future extensibility

Be thorough but concise. Focus on actionable information.`;

/**
 * Definition for the Plan agent.
 */
export const PLAN_AGENT: BuiltInAgentDefinition = {
	description:
		"Software architect for designing implementation plans with read-only codebase analysis",
	prompt: PLAN_AGENT_PROMPT,
	tools: [...READ_ONLY_TOOLS],
	model: "opus", // Complex reasoning model for planning
	readOnly: true,
	supportsPlanMode: true,
};

// ============================================================================
// Agent Registry
// ============================================================================

/**
 * Map of all built-in agents by name.
 * Note: Explore agent is not included as the SDK has a built-in Explore agent.
 */
export const BUILT_IN_AGENTS: Record<BuiltInAgentName, BuiltInAgentDefinition> =
	{
		Plan: PLAN_AGENT,
	};

/**
 * Get a built-in agent definition by name.
 *
 * @param name - Name of the built-in agent
 * @returns The agent definition or undefined if not found
 */
export function getBuiltInAgent(
	name: BuiltInAgentName,
): BuiltInAgentDefinition | undefined {
	return BUILT_IN_AGENTS[name];
}

/**
 * Get all built-in agent names.
 *
 * @returns Array of built-in agent names
 */
export function getBuiltInAgentNames(): BuiltInAgentName[] {
	return Object.keys(BUILT_IN_AGENTS) as BuiltInAgentName[];
}

/**
 * Check if an agent name is a built-in agent.
 *
 * @param name - Agent name to check
 * @returns True if it's a built-in agent
 */
export function isBuiltInAgent(name: string): name is BuiltInAgentName {
	return name in BUILT_IN_AGENTS;
}
