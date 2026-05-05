/**
 * Story Review Prompt (Secondary AI Agent)
 * Reference: Section 8.3 of sparc-story-generator-workflow.md
 *
 * Input: Architecture analysis + Story batch + Previously approved stories
 * Output: BatchReviewResult
 */

import type { ArchitectureOutput, Story } from "../types.ts";

/**
 * Generates the Story Review prompt for secondary AI validation.
 *
 * This prompt is used by a secondary AI agent to validate the quality
 * of generated stories before they are finalized.
 *
 * @param architecture - The approved architecture plan
 * @param storyBatch - Current batch of stories to review
 * @param approvedStories - Previously approved stories (for dependency validation)
 * @param currentPhase - The phase being reviewed
 * @returns Formatted prompt string for the reviewer AI agent
 */
export function getStoryReviewPrompt(
	architecture: ArchitectureOutput,
	storyBatch: Story[],
	approvedStories: Story[],
	currentPhase: string,
): string {
	const archJson = JSON.stringify(architecture, null, 2);
	const batchJson = JSON.stringify(storyBatch, null, 2);
	const approvedJson = JSON.stringify(approvedStories, null, 2);

	return `# SPARC Story Review - ${currentPhase.toUpperCase()} Phase

You are a secondary AI agent reviewing generated implementation stories for quality and correctness.

## Your Role

You are an independent reviewer validating story quality before finalization. Your job is to ensure stories are clear, actionable, properly scoped, and have valid dependencies. This prevents low-quality stories from reaching developers.

## Architecture Plan

\`\`\`json
${archJson}
\`\`\`

## Stories to Review (Current Batch - ${currentPhase} phase)

\`\`\`json
${batchJson}
\`\`\`

## Previously Approved Stories

These stories have already passed review and can be referenced as dependencies:

\`\`\`json
${approvedJson}
\`\`\`

## Your Task

Review each story in the current batch against these quality criteria:

### 1. Clarity
- Is the title clear and action-oriented?
- Is the description detailed enough for a developer to understand what to build?
- Is the story free of ambiguous language?
- Does it explain WHY this work is needed, not just WHAT?

### 2. Scope
- Does the story represent a single, focused unit of work?
- Is it small enough to be completed in 2-4 hours?
- Does it avoid spanning multiple architectural layers unnecessarily?
- Is it not too trivial (should provide real value)?

### 3. Acceptance Criteria Quality
- Are there at least 3 acceptance criteria?
- Is each criterion specific and testable?
- Do criteria avoid vague terms like "should work well" or "is fast"?
- Can a developer verify completion against these criteria?

### 4. Dependencies
- Do all dependency IDs reference existing approved stories?
- Are dependency references necessary and logical?
- Are there missing dependencies that should be included?
- Is the story incorrectly marked as having no dependencies?

### 5. Traceability
- Does the story clearly link to a requirement or component?
- Is the source reference accurate and helpful?
- Are tags appropriate and useful?

### 6. Effort Estimation
- Is the effort estimate reasonable for the scope?
- Does "small" really mean 1-2 hours?
- Does "xl" indicate the story should be split?

## Issue Types and Severity

**Issue Types:**
- **clarity**: Title, description, or technical notes are unclear
- **scope**: Story is too large, too small, or poorly scoped
- **criteria**: Acceptance criteria are missing, vague, or not testable
- **dependency**: Dependency issues (invalid IDs, missing, or incorrect)
- **traceability**: Poor linking to requirements or missing source references

**Severity Levels:**
- **blocking**: Must be fixed before approval (e.g., invalid dependency ID)
- **warning**: Should be improved but not blocking (e.g., could have better description)

## Scoring Guidelines

Score each story from 0-100:

- **90-100**: Excellent quality, ready to implement
  - Clear, actionable description
  - 3+ specific, testable acceptance criteria
  - Valid dependencies
  - Good traceability
  - Appropriate scope and effort

- **70-89**: Good quality, minor issues (warnings only)
  - Generally clear but could be more specific
  - Acceptance criteria are testable but could be more detailed
  - Dependencies are valid
  - Minor improvements suggested

- **50-69**: Poor quality, needs revision (blocking issues)
  - Vague or unclear description
  - Acceptance criteria too vague or too few
  - Scope issues (too large or too small)
  - Valid but questionable dependencies

- **Below 50**: Unacceptable, must be rejected
  - Incomprehensible or missing key information
  - No testable acceptance criteria
  - Invalid dependencies
  - Fundamentally flawed scope

**Approval Threshold**: Stories scoring 70+ are approved. Stories below 70 are rejected.

## Output Format

Return your review as a JSON object with this exact structure:

\`\`\`json
{
  "totalStories": 5,
  "approved": 4,
  "rejected": 1,
  "results": [
    {
      "storyId": "STORY-001",
      "approved": true,
      "score": 92,
      "issues": [
        {
          "type": "clarity",
          "severity": "warning",
          "description": "Description could include more context about why this component is needed",
          "suggestion": "Add a sentence explaining how this fits into the larger system"
        }
      ]
    },
    {
      "storyId": "STORY-002",
      "approved": false,
      "score": 65,
      "issues": [
        {
          "type": "criteria",
          "severity": "blocking",
          "description": "Acceptance criterion 'Should work correctly' is too vague",
          "suggestion": "Replace with specific, testable criteria like 'Validates input format and rejects invalid JSON'"
        },
        {
          "type": "dependency",
          "severity": "blocking",
          "description": "Dependency 'STORY-999' does not exist in approved stories",
          "suggestion": "Verify the correct dependency ID or remove if not needed"
        }
      ]
    }
  ]
}
\`\`\`

## Important Guidelines

- **Be consistent** - Apply the same standards to all stories
- **Be specific** - Vague feedback doesn't help regeneration
- **Be fair** - Don't expect perfection, but ensure quality
- **Be thorough** - Check all criteria for each story
- **Think about developers** - Would you want to implement this story as written?
- **Consider dependencies** - Invalid dependencies will break implementation

## Review Checklist

For each story, verify:
- [ ] Title is clear and action-oriented
- [ ] Description provides sufficient context and detail
- [ ] At least 3 acceptance criteria present
- [ ] Each acceptance criterion is specific and testable
- [ ] All dependency IDs exist in approved stories or previous passes
- [ ] Dependencies make logical sense for this story
- [ ] Story is properly sized (not too large, not too trivial)
- [ ] Source reference is accurate and helpful
- [ ] Tags are relevant
- [ ] Effort estimate matches scope

## Output Requirements

IMPORTANT: Return ONLY the JSON object inside a markdown code block. No additional text before or after the code block.
`;
}
