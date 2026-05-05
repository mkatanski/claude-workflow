/**
 * Specification Phase Prompt (S in SPARC)
 * Reference: Section 6.1 of sparc-story-generator-workflow.md
 *
 * Input: Raw architectural document
 * Output: Structured analysis JSON (SpecificationOutput type)
 */

/**
 * Generates the Specification phase prompt for architectural analysis.
 *
 * This phase extracts all requirements, components, constraints, and assumptions
 * from the architectural document to create a structured foundation for story generation.
 *
 * @param documentContent - The complete architectural document content
 * @returns Formatted prompt string for the AI agent
 */
export function getSpecificationPrompt(documentContent: string): string {
	return `# SPARC Specification Phase

You are analyzing an architectural document to extract requirements, components, and constraints that will be used to generate implementation stories.

## Your Role

You are a requirements analyst extracting structured information from an architectural document. Your goal is to identify all business requirements, technical requirements, system components, constraints, and assumptions that will guide story generation.

## Input Document

${documentContent}

## Your Task

Carefully analyze the document and extract:

1. **Business Requirements** - User stories, business rules, and business-driven needs
   - Assign unique IDs (e.g., "BR-1", "BR-2")
   - Include title and detailed description
   - Classify by priority (high, medium, low)
   - Note source document references

2. **Technical Requirements** - Functional and non-functional technical needs
   - Assign unique IDs (e.g., "TR-1", "TR-2")
   - Include title and detailed description
   - Classify as functional or non-functional
   - Note source document references

3. **Components** - System components, modules, or services
   - Assign unique IDs (e.g., "COMP-1", "COMP-2")
   - Identify component responsibilities
   - Map dependencies between components
   - Relate to requirements they fulfill

4. **Constraints** - Technical limitations, technology choices, or restrictions
   - List all explicit constraints mentioned
   - Include rationale if provided

5. **Assumptions** - Implicit assumptions or prerequisites
   - Identify assumptions the document makes
   - Note areas where clarification might be needed

## Output Format

Return your analysis as a JSON object with this exact structure:

\`\`\`json
{
  "businessRequirements": [
    {
      "id": "BR-1",
      "title": "Brief requirement title",
      "description": "Detailed requirement description",
      "type": "business",
      "priority": "high",
      "sourceReference": "Section 2.1"
    }
  ],
  "technicalRequirements": [
    {
      "id": "TR-1",
      "title": "Brief requirement title",
      "description": "Detailed requirement description",
      "type": "technical",
      "priority": "high",
      "sourceReference": "Section 3.2"
    }
  ],
  "components": [
    {
      "id": "COMP-1",
      "name": "Component Name",
      "responsibilities": [
        "Primary responsibility",
        "Secondary responsibility"
      ],
      "dependencies": ["COMP-2", "COMP-3"],
      "layer": "infrastructure",
      "relatedRequirements": ["TR-1", "BR-2"]
    }
  ],
  "constraints": [
    "Must use Unix sockets for IPC",
    "Maximum 50k token document size"
  ],
  "assumptions": [
    "tmux is available on the system",
    "Users have basic CLI knowledge"
  ]
}
\`\`\`

## Important Guidelines

- **Be comprehensive** - Extract ALL requirements, don't skip sections
- **Be precise** - Capture exact meaning without interpretation
- **Use consistent IDs** - Sequential numbering within each category
- **Map relationships** - Connect components to their requirements
- **Note ambiguities** - If something is unclear, note it in assumptions
- **Preserve context** - Include enough detail for someone unfamiliar with the document

## Output Requirements

IMPORTANT: Return ONLY the JSON object inside a markdown code block. No additional text before or after the code block.
`;
}
