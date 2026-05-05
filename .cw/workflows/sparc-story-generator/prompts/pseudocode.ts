/**
 * Pseudocode Phase Prompt (P in SPARC)
 * Reference: Section 6.2 of sparc-story-generator-workflow.md
 *
 * Input: Specification analysis
 * Output: Story generation approach (PseudocodeOutput type)
 */

import type { SpecificationOutput } from "../types.ts";

/**
 * Generates the Pseudocode phase prompt for story generation planning.
 *
 * This phase reviews the extracted requirements and designs the approach for
 * breaking them down into implementation stories across multiple passes.
 *
 * @param specification - The structured analysis from Specification phase
 * @returns Formatted prompt string for the AI agent
 */
export function getPseudocodePrompt(
	specification: SpecificationOutput,
): string {
	const specJson = JSON.stringify(specification, null, 2);

	return `# SPARC Pseudocode Phase

You are designing the approach for breaking down architectural requirements into implementation stories.

## Your Role

You are a technical planner reviewing extracted requirements to design a story generation strategy. Your goal is to identify natural groupings, propose an implementation order, and define guidelines for story granularity.

## Specification Analysis

Here is the structured analysis from the Specification phase:

\`\`\`json
${specJson}
\`\`\`

## Your Task

Design a story generation approach by:

1. **Identifying Natural Groupings**
   - Group related requirements and components
   - Consider technical dependencies
   - Think about logical implementation order
   - Identify foundational vs. feature work

2. **Proposing Pass Structure**
   - Define 4 passes: Foundation → Core → Features → Integration
   - **Foundation**: Infrastructure, types, utilities, basic setup
   - **Core**: Main components, primary functionality
   - **Features**: Feature-complete functionality, business logic
   - **Integration**: Connections between components, CLI, docs, tests
   - Estimate story count for each pass
   - Explain focus area for each pass

3. **Defining Granularity Guidelines**
   - What makes a good story size?
   - How to split complex components?
   - What's too small? What's too large?
   - Testing considerations

## Output Format

Return your planning analysis as a JSON object with this exact structure:

\`\`\`json
{
  "passStructure": [
    {
      "phase": "foundation",
      "focus": "Core infrastructure, type definitions, and utilities",
      "estimatedStories": 5
    },
    {
      "phase": "core",
      "focus": "Main components and primary functionality",
      "estimatedStories": 10
    },
    {
      "phase": "features",
      "focus": "Feature-complete functionality and business logic",
      "estimatedStories": 8
    },
    {
      "phase": "integration",
      "focus": "Component integration, CLI, documentation, and tests",
      "estimatedStories": 7
    }
  ],
  "granularityGuidelines": [
    "Each story should be implementable in 2-4 hours",
    "Stories should have 3-5 testable acceptance criteria",
    "Avoid stories that span multiple architectural layers"
  ],
  "storyGroupings": [
    "Group 1: Socket communication and message protocol",
    "Group 2: Tool server and request routing",
    "Group 3: Security validation and policy enforcement"
  ]
}
\`\`\`

## Important Guidelines

- **Think in layers** - Foundation before features
- **Consider dependencies** - Core components before integrations
- **Balance scope** - Not too small (trivial), not too large (complex)
- **Be realistic** - Estimate story counts conservatively
- **Plan for testing** - Each phase should be testable
- **Consider the team** - Stories should be parallelizable where possible

## Output Requirements

IMPORTANT: Return ONLY the JSON object inside a markdown code block. No additional text before or after the code block.
`;
}
