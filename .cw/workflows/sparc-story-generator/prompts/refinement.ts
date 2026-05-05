/**
 * Refinement Phase Prompt (R in SPARC)
 * Reference: Section 6.4 of sparc-story-generator-workflow.md
 *
 * Input: Story plan + Current pass context
 * Output: Generated stories array (Story[] type)
 */

import type {
	ArchitectureOutput,
	SpecificationOutput,
	Story,
	StoryPhase,
	StoryWithFeedback,
} from "../types.ts";

/**
 * Generates the Refinement phase prompt for story generation.
 *
 * This phase generates implementation stories for a specific pass,
 * following the defined schema and ensuring proper dependencies.
 *
 * @param specification - The structured analysis from Specification phase
 * @param architecture - The story plan from Architecture phase
 * @param currentPhase - The current phase being generated
 * @param previousStories - Stories generated in previous passes (for dependencies)
 * @param rejectedStories - Stories that failed review and need regeneration (optional)
 * @returns Formatted prompt string for the AI agent
 */
export function getRefinementPrompt(
	specification: SpecificationOutput,
	architecture: ArchitectureOutput,
	currentPhase: StoryPhase,
	previousStories: Story[],
	rejectedStories?: StoryWithFeedback[],
): string {
	const specJson = JSON.stringify(specification, null, 2);
	const archJson = JSON.stringify(architecture, null, 2);
	const previousJson = JSON.stringify(previousStories, null, 2);
	const rejectedJson = rejectedStories
		? JSON.stringify(rejectedStories, null, 2)
		: null;

	const phaseDescriptions: Record<StoryPhase, string> = {
		foundation:
			"Core infrastructure, type definitions, utilities, and basic setup",
		core: "Main components, primary functionality, and core business logic",
		features:
			"Feature-complete functionality, business rules, and advanced capabilities",
		integration:
			"Component connections, CLI interfaces, end-to-end tests, and documentation",
	};

	const regenerationSection = rejectedJson
		? `
## Stories Requiring Regeneration

The following stories from this phase were rejected during review. You MUST regenerate these stories addressing the specific feedback:

\`\`\`json
${rejectedJson}
\`\`\`

For each rejected story:
- Address the specific issues mentioned in reviewFeedback
- Improve based on the rejectionReason
- Ensure acceptance criteria are testable and specific
- Verify dependencies are valid
- Maintain the same story ID
`
		: "";

	return `# SPARC Refinement Phase - ${currentPhase.toUpperCase()}

You are generating implementation stories for the **${currentPhase}** phase.

## Your Role

You are a technical writer creating detailed, actionable implementation stories. Your stories will guide developers through implementing the architectural vision.

## Current Phase: ${currentPhase}

**Focus**: ${phaseDescriptions[currentPhase]}

## Specification Analysis

\`\`\`json
${specJson}
\`\`\`

## Architecture Plan

\`\`\`json
${archJson}
\`\`\`

## Previously Generated Stories

These stories have been generated in earlier passes and can be referenced as dependencies:

\`\`\`json
${previousJson}
\`\`\`
${regenerationSection}

## Your Task

Generate implementation stories for the **${currentPhase}** phase ONLY. Each story must:

1. **Follow the Story Schema**
   - Unique ID in format: "PROJ-###" (e.g., "STORY-001")
   - Phase set to "${currentPhase}"
   - Clear, concise title
   - Detailed description of what to implement
   - Priority: high, medium, or low
   - Estimated effort: small, medium, large, or xl

2. **Include Testable Acceptance Criteria**
   - Minimum 3 criteria per story
   - Each criterion must be testable/verifiable
   - Use specific, measurable language
   - Avoid vague terms like "should work well"

3. **Define Dependencies**
   - Reference ONLY stories from previous passes (listed above)
   - Use exact story IDs
   - Empty array [] if no dependencies
   - Foundation stories typically have no dependencies

4. **Provide Context**
   - Technical notes with implementation hints
   - Reference source document sections
   - Add relevant tags for categorization
   - Link to related requirements

## Story Schema Reference

\`\`\`typescript
{
  id: string;              // "STORY-001"
  phase: string;           // "${currentPhase}"
  title: string;           // "Implement Tool Server Socket Listener"
  description: string;     // Detailed description
  priority: string;        // "high" | "medium" | "low"
  estimatedEffort: string; // "small" | "medium" | "large" | "xl"
  acceptanceCriteria: string[];  // Minimum 3 testable criteria
  dependencies: string[];  // Story IDs from previous passes
  technicalNotes?: string; // Optional implementation hints
  tags: string[];          // ["infrastructure", "socket", "tool-server"]
  sourceRef?: string;      // "Section 5.1 Tool Server"
}
\`\`\`

## Example Story for ${currentPhase} Phase

\`\`\`json
{
  "id": "STORY-001",
  "phase": "${currentPhase}",
  "title": "Create Tool Request/Response Type Definitions",
  "description": "Define TypeScript interfaces for the tool communication protocol between sandbox containers and the host tool server. These types form the foundation for message serialization and validation.",
  "priority": "high",
  "estimatedEffort": "small",
  "acceptanceCriteria": [
    "ToolRequest interface defined with required fields: id, toolName, parameters",
    "ToolResponse interface defined with success/error discriminated union",
    "Types are exported from src/types/tool-protocol.ts",
    "All types are JSON-serializable (no functions or symbols)"
  ],
  "dependencies": [],
  "technicalNotes": "Reference the message format specification in Section 6.2. Use discriminated unions for response types to enable type-safe error handling.",
  "tags": ["types", "protocol", "foundation"],
  "sourceRef": "Section 6.2 Message Format"
}
\`\`\`

## Output Format

Return an array of story objects in JSON format:

\`\`\`json
[
  {
    "id": "STORY-001",
    "phase": "${currentPhase}",
    "title": "...",
    "description": "...",
    "priority": "high",
    "estimatedEffort": "medium",
    "acceptanceCriteria": ["...", "...", "..."],
    "dependencies": [],
    "technicalNotes": "...",
    "tags": ["tag1", "tag2"],
    "sourceRef": "Section X.Y"
  }
]
\`\`\`

## Important Guidelines

- **Only this phase** - Generate stories for ${currentPhase} phase only
- **Reference existing** - Dependencies must be from previous passes
- **Be specific** - Vague stories lead to confusion and rework
- **Think testability** - Acceptance criteria must be verifiable
- **Consider scope** - Each story should be completable in 2-4 hours
- **Maintain continuity** - Build on previous phases logically
- **Add value** - Every story should deliver tangible functionality

## Quality Checklist

Before finalizing stories, verify each one has:
- [ ] Clear, action-oriented title
- [ ] Detailed description with context
- [ ] At least 3 specific, testable acceptance criteria
- [ ] Valid dependencies (empty array or existing story IDs)
- [ ] Appropriate effort estimate
- [ ] Relevant tags and source references
- [ ] Phase set to "${currentPhase}"

## Output Requirements

IMPORTANT: Return ONLY the JSON array of story objects inside a markdown code block. No additional text before or after the code block.
`;
}
