/**
 * Completion Phase Prompt (C in SPARC)
 * Reference: Section 6.5 of sparc-story-generator-workflow.md
 *
 * Input: All generated stories
 * Output: Validation report + missing stories (CompletionOutput type)
 */

import type { SpecificationOutput, Story } from "../types.ts";

/**
 * Generates the Completion phase prompt for final validation.
 *
 * This phase validates that all requirements are covered, checks for
 * orphaned dependencies, identifies gaps, and suggests missing stories.
 *
 * @param specification - The structured analysis from Specification phase
 * @param allStories - All stories generated across all phases
 * @returns Formatted prompt string for the AI agent
 */
export function getCompletionPrompt(
	specification: SpecificationOutput,
	allStories: Story[],
): string {
	const specJson = JSON.stringify(specification, null, 2);
	const storiesJson = JSON.stringify(allStories, null, 2);

	return `# SPARC Completion Phase

You are performing final validation on the generated implementation stories to ensure completeness and quality.

## Your Role

You are a quality assurance analyst verifying that the generated stories fully cover all requirements, have no orphaned dependencies, and represent a complete implementation plan.

## Specification Analysis

\`\`\`json
${specJson}
\`\`\`

## Generated Stories

\`\`\`json
${storiesJson}
\`\`\`

## Your Task

Perform a comprehensive validation by:

1. **Verify Requirement Coverage**
   - Check each business requirement is addressed by stories
   - Check each technical requirement is addressed by stories
   - Identify which stories cover each requirement
   - Flag any requirements with no coverage

2. **Check for Orphaned Dependencies**
   - Verify every dependency references an existing story ID
   - Flag any dependencies that point to non-existent stories
   - Ensure dependency chains are valid

3. **Identify Coverage Gaps**
   - Missing functionality or components
   - Requirements mentioned but not implemented
   - Edge cases or error scenarios not covered
   - Testing or documentation gaps

4. **Suggest Missing Stories**
   - Generate stories for any identified gaps
   - Follow the same story schema as generated stories
   - Assign to appropriate phase
   - Include proper dependencies

5. **Provide Confidence Score**
   - Rate completion confidence from 0-100
   - 100 = Perfect coverage, ready to implement
   - 80+ = Good coverage, minor gaps
   - 60-79 = Acceptable, notable gaps
   - < 60 = Significant gaps, needs revision

## Output Format

Return your validation report as a JSON object with this exact structure:

\`\`\`json
{
  "coverageReport": [
    {
      "requirementId": "BR-1",
      "covered": true,
      "coveredByStories": ["STORY-001", "STORY-005"]
    },
    {
      "requirementId": "TR-3",
      "covered": false,
      "coveredByStories": []
    }
  ],
  "orphanedDependencies": [
    "STORY-999 (referenced by STORY-012 but does not exist)"
  ],
  "gaps": [
    "No stories cover error handling for socket disconnection",
    "Missing integration tests between components",
    "Documentation for deployment is not addressed"
  ],
  "missingSuggestions": [
    {
      "id": "STORY-999",
      "phase": "core",
      "title": "Implement Socket Disconnection Error Handling",
      "description": "Handle graceful shutdown when socket connections are lost unexpectedly.",
      "priority": "high",
      "estimatedEffort": "medium",
      "acceptanceCriteria": [
        "Detect socket disconnection events",
        "Clean up resources on disconnect",
        "Log disconnection with context"
      ],
      "dependencies": ["STORY-002"],
      "technicalNotes": "Use event emitters to propagate disconnection events",
      "tags": ["error-handling", "socket", "reliability"],
      "sourceRef": "Section 8.1 Error Handling"
    }
  ],
  "completionConfidence": 85
}
\`\`\`

## Important Guidelines

- **Be thorough** - Check every requirement systematically
- **Be honest** - Don't overlook gaps to inflate confidence score
- **Be constructive** - Suggested stories should be actionable
- **Be specific** - Vague gaps are not helpful
- **Consider quality** - Coverage isn't just quantity, but appropriateness
- **Think holistically** - Consider testing, docs, error handling, edge cases

## Validation Checklist

- [ ] Every business requirement has at least one story
- [ ] Every technical requirement has at least one story
- [ ] Every component from specification appears in stories
- [ ] No dependencies reference non-existent story IDs
- [ ] Cross-cutting concerns are addressed (errors, logging, security)
- [ ] Testing strategy is covered
- [ ] Documentation is included
- [ ] Integration points are addressed

## Coverage Score Guidelines

**90-100: Excellent**
- All requirements covered
- No orphaned dependencies
- Cross-cutting concerns addressed
- Testing and docs included

**80-89: Good**
- All major requirements covered
- Minor gaps (e.g., edge cases)
- Suggested stories fill gaps
- Overall plan is solid

**70-79: Acceptable**
- Most requirements covered
- Some notable gaps
- May need additional planning
- Implementation can proceed with caution

**Below 70: Needs Revision**
- Significant coverage gaps
- Major requirements missing
- Many suggested stories needed
- Consider re-running earlier phases

## Output Requirements

IMPORTANT: Return ONLY the JSON object inside a markdown code block. No additional text before or after the code block.
`;
}
