/**
 * Architecture Phase Prompt (A in SPARC)
 * Reference: Section 6.3 of sparc-story-generator-workflow.md
 *
 * Input: Specification + Pseudocode analysis
 * Output: Detailed story plan (ArchitectureOutput type)
 */

import type { PseudocodeOutput, SpecificationOutput } from "../types.ts";

/**
 * Generates the Architecture phase prompt for detailed story planning.
 *
 * This phase creates the detailed blueprint for story generation including
 * phase boundaries, requirement mappings, and dependency graphs.
 *
 * @param specification - The structured analysis from Specification phase
 * @param pseudocode - The planning approach from Pseudocode phase
 * @returns Formatted prompt string for the AI agent
 */
export function getArchitecturePrompt(
	specification: SpecificationOutput,
	pseudocode: PseudocodeOutput,
): string {
	const specJson = JSON.stringify(specification, null, 2);
	const pseudoJson = JSON.stringify(pseudocode, null, 2);

	return `# SPARC Architecture Phase

You are creating a detailed story generation plan based on requirements analysis and the proposed approach.

## Your Role

You are a technical architect designing the detailed blueprint for story generation. Your goal is to define clear phase boundaries, map requirements to phases, identify dependencies, and create a dependency graph that will guide story generation.

## Specification Analysis

\`\`\`json
${specJson}
\`\`\`

## Proposed Approach

\`\`\`json
${pseudoJson}
\`\`\`

## Your Task

Create a detailed story plan by:

1. **Defining Story Phases**
   - Confirm the 4 phases: foundation, core, features, integration
   - Define clear boundaries for each phase
   - Ensure each phase builds on the previous

2. **Mapping Requirements to Phases**
   - Assign each requirement ID to one or more phases
   - Consider dependencies and implementation order
   - Ensure no requirement is missed

3. **Identifying Cross-Cutting Concerns**
   - Error handling patterns
   - Logging and observability
   - Security considerations
   - Testing strategies
   - Documentation requirements

4. **Creating Dependency Graph**
   - Identify root components (no dependencies)
   - Map component dependencies
   - Identify leaf components (final implementation)
   - Create dependency and dependent mappings

5. **Confidence Assessment**
   - Rate your confidence in this plan (0.0 to 1.0)
   - Note any areas of uncertainty

## Output Format

Return your architecture plan as a JSON object with this exact structure:

\`\`\`json
{
  "phases": ["foundation", "core", "features", "integration"],
  "requirementMapping": {
    "BR-1": ["foundation", "core"],
    "TR-1": ["foundation"],
    "TR-2": ["core", "features"]
  },
  "crossCuttingConcerns": [
    "Error handling must use Result type pattern",
    "All components must emit lifecycle events",
    "Security validation required for all external inputs"
  ],
  "dependencyGraph": {
    "dependencies": {
      "COMP-1": [],
      "COMP-2": ["COMP-1"],
      "COMP-3": ["COMP-1", "COMP-2"]
    },
    "dependents": {
      "COMP-1": ["COMP-2", "COMP-3"],
      "COMP-2": ["COMP-3"],
      "COMP-3": []
    },
    "roots": ["COMP-1"],
    "leaves": ["COMP-3"]
  },
  "confidence": 0.85
}
\`\`\`

## Important Guidelines

- **Be explicit** - Clear phase boundaries prevent confusion
- **Map everything** - Every requirement should be assigned to phases
- **Think dependencies** - Component graph drives story ordering
- **Cross-cutting matters** - These become stories or acceptance criteria
- **Be honest** - Low confidence means areas need more detail
- **Validate completeness** - Check all components and requirements are covered

## Validation Checklist

Before finalizing your plan, verify:
- [ ] All requirements from specification are mapped to phases
- [ ] All components from specification are in dependency graph
- [ ] No circular dependencies exist
- [ ] Root components are foundational (can be built first)
- [ ] Cross-cutting concerns are comprehensive
- [ ] Confidence score reflects actual readiness

## Output Requirements

IMPORTANT: Return ONLY the JSON object inside a markdown code block. No additional text before or after the code block.
`;
}
