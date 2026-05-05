/**
 * Analysis Review Prompt (Secondary AI Agent)
 * Reference: Section 8.2 of sparc-story-generator-workflow.md
 *
 * Input: Original document + Generated analysis
 * Output: AnalysisReviewResult
 */

import type { ArchitectureOutput, SpecificationOutput } from "../types.ts";

/**
 * Generates the Analysis Review prompt for secondary AI validation.
 *
 * This prompt is used by a secondary AI agent to validate that the
 * architectural analysis accurately reflects the source document.
 *
 * @param originalDocument - The original architectural document content
 * @param specification - The generated specification analysis
 * @param architecture - The generated architecture plan
 * @param attemptNumber - Current review attempt (1-based)
 * @param previousFeedback - Feedback from previous review attempt (if any)
 * @returns Formatted prompt string for the reviewer AI agent
 */
export function getAnalysisReviewPrompt(
	originalDocument: string,
	specification: SpecificationOutput,
	architecture: ArchitectureOutput,
	attemptNumber: number,
	previousFeedback?: string,
): string {
	const specJson = JSON.stringify(specification, null, 2);
	const archJson = JSON.stringify(architecture, null, 2);

	const attemptSection =
		attemptNumber > 1
			? `
## Review Attempt #${attemptNumber}

This is attempt ${attemptNumber} of the analysis review. Previous feedback was:

\`\`\`
${previousFeedback || "No previous feedback available"}
\`\`\`

Check if the previous feedback has been adequately addressed.
`
			: "";

	return `# SPARC Analysis Review

You are a secondary AI agent reviewing the architectural analysis for accuracy and completeness.

## Your Role

You are an independent reviewer validating that the generated analysis accurately reflects the source architectural document. Your job is to catch misunderstandings, missing requirements, or misinterpretations before story generation begins.

This is a critical quality gate. If the analysis is wrong, all generated stories will be wrong.
${attemptSection}

## Original Architectural Document

\`\`\`markdown
${originalDocument}
\`\`\`

## Generated Specification Analysis

\`\`\`json
${specJson}
\`\`\`

## Generated Architecture Plan

\`\`\`json
${archJson}
\`\`\`

## Your Task

Perform a comprehensive review by comparing the analysis against the source document:

1. **Completeness Check**
   - Are all major sections of the document represented?
   - Are any significant requirements missing?
   - Are all components mentioned in the document captured?
   - Are important constraints or assumptions overlooked?

2. **Accuracy Check**
   - Do the extracted requirements match the document's intent?
   - Are components described accurately?
   - Are relationships between components correct?
   - Are any requirements misinterpreted or hallucinated?

3. **Component Validation**
   - Are all system components identified?
   - Are component responsibilities correct?
   - Are dependencies between components accurate?
   - Are components assigned to the right architectural layers?

4. **Dependency Validation**
   - Does the dependency graph make logical sense?
   - Are there any circular dependencies?
   - Do root components make sense as foundational?
   - Are leaf components correctly identified?

5. **Gap Identification**
   - What critical information is missing?
   - What sections of the document are underrepresented?
   - What requirements need clarification?
   - What assumptions should be validated?

## Output Format

Return your review as a JSON object with this exact structure:

\`\`\`json
{
  "approved": false,
  "confidence": 0.75,
  "feedback": "Overall assessment of the analysis quality. The analysis captures most core requirements but misses several important details about error handling and has one misinterpreted component.",
  "gaps": [
    {
      "type": "missing_requirement",
      "description": "Section 5.3 describes a caching mechanism that is not captured in technical requirements",
      "sourceReference": "Section 5.3 Performance Optimization"
    },
    {
      "type": "misinterpretation",
      "description": "Component COMP-2 is described as handling validation, but the document indicates it should only route requests",
      "sourceReference": "Section 4.2 Request Router"
    },
    {
      "type": "missing_component",
      "description": "The document mentions a monitoring component that is not identified in the analysis",
      "sourceReference": "Section 7.1 Observability"
    }
  ],
  "suggestions": [
    "Add technical requirement TR-X for caching mechanism",
    "Revise COMP-2 responsibilities to focus on routing only",
    "Add COMP-5 for monitoring/observability",
    "Include error handling patterns as cross-cutting concerns"
  ]
}
\`\`\`

## Approval Guidelines

**Approve (approved: true)** when:
- All major requirements are captured (100% or near 100%)
- Components accurately reflect the document
- No significant misinterpretations
- Dependency graph is logical and complete
- Minor gaps only (can be addressed during story generation)
- Confidence score >= 0.8

**Reject (approved: false)** when:
- Significant requirements are missing (< 90% coverage)
- Components mischaracterized or missing
- Major misinterpretations present
- Dependency graph has logical issues
- Confidence score < 0.8

## Confidence Score Guidelines

- **0.9-1.0**: Excellent analysis, fully represents document
- **0.8-0.89**: Good analysis, minor gaps or clarifications needed
- **0.7-0.79**: Acceptable but notable gaps, should be revised
- **0.6-0.69**: Significant issues, must be revised
- **< 0.6**: Poor analysis, restart specification phase

## Important Guidelines

- **Compare directly** - Reference specific document sections
- **Be specific** - Vague feedback doesn't help improve the analysis
- **Be fair** - Don't expect perfection, but ensure adequacy
- **Be thorough** - Check all aspects systematically
- **Be honest** - Low confidence is better than approving bad analysis
- **Think downstream** - Bad analysis leads to bad stories

## Review Checklist

Before finalizing your review:
- [ ] Compared analysis to every major document section
- [ ] Verified all components mentioned in document are captured
- [ ] Checked for hallucinated requirements not in document
- [ ] Validated dependency relationships make sense
- [ ] Identified specific gaps with source references
- [ ] Provided actionable suggestions for improvement
- [ ] Set confidence score reflecting actual quality
- [ ] Made clear approval/rejection decision

## Output Requirements

IMPORTANT: Return ONLY the JSON object inside a markdown code block. No additional text before or after the code block.
`;
}
