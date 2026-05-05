# SPARC Phase Prompt Templates

This directory contains prompt templates for the SPARC Story Generator workflow. Each phase has a dedicated prompt function that generates the appropriate instructions for the AI agent.

## Files Overview

### Core SPARC Phases

1. **specification.ts** - Specification Phase (S)
   - Extracts requirements, components, and constraints from architectural documents
   - Input: Raw architectural document content
   - Output: `SpecificationOutput` JSON with structured analysis

2. **pseudocode.ts** - Pseudocode Phase (P)
   - Designs the story generation approach and pass structure
   - Input: Specification analysis
   - Output: `PseudocodeOutput` JSON with pass structure and guidelines

3. **architecture.ts** - Architecture Phase (A)
   - Creates detailed story plan with phases and dependencies
   - Input: Specification + Pseudocode analysis
   - Output: `ArchitectureOutput` JSON with complete story plan

4. **refinement.ts** - Refinement Phase (R)
   - Generates implementation stories for a specific pass
   - Input: Story plan + Current phase context + Previous stories
   - Output: Array of `Story` objects in JSON format
   - Supports regeneration of rejected stories with feedback

5. **completion.ts** - Completion Phase (C)
   - Validates coverage and identifies gaps
   - Input: All generated stories + Original specification
   - Output: `CompletionOutput` JSON with validation report

### Review Phases (Secondary AI Agents)

6. **analysisReview.ts** - Analysis Review
   - Secondary AI validates architectural analysis accuracy
   - Input: Original document + Generated analysis
   - Output: `AnalysisReviewResult` with approval/rejection
   - Catches misunderstandings before story generation

7. **storyReview.ts** - Story Review
   - Secondary AI validates generated story quality
   - Input: Architecture plan + Story batch + Approved stories
   - Output: `BatchReviewResult` with per-story approval
   - Ensures clarity, scope, testability, and dependency validity

## Usage Pattern

All prompt functions follow this pattern:

```typescript
import { getSpecificationPrompt } from "./prompts/index.ts";

const prompt = getSpecificationPrompt(documentContent);
const result = await tools.agentSession(prompt, {
  label: "Specification Phase",
  model: "opus",
  permissionMode: "bypassPermissions",
});

const parsed = parseJsonFromOutput(result.output);
```

## JSON Response Format

Each prompt instructs the AI to return JSON in a markdown code block:

```markdown
\`\`\`json
{
  "field1": "value",
  "field2": ["array"]
}
\`\`\`
```

The workflow extracts and parses this JSON using the `parseJsonFromOutput` utility.

## Type Safety

All prompts reference type definitions from `../types.ts`. This ensures:
- Prompt outputs match expected workflow state
- Type checking catches schema mismatches
- Documentation is synchronized with types

## Model Selection

Recommended models per phase (from architecture doc):

| Phase | Model | Rationale |
|-------|-------|-----------|
| Specification | opus | Complex document analysis |
| Pseudocode | sonnet | Cost-effective planning |
| Architecture | opus | Critical structural decisions |
| Refinement | sonnet | Bulk generation, good quality/cost |
| Completion | sonnet | Validation checks |
| Analysis Review | sonnet | Cost-effective validation |
| Story Review | sonnet | Consistent quality checks |

## References

- Architecture Document: `.cw/docs/architecture/sparc-story-generator-workflow.md`
- Type Definitions: `../types.ts`
- SPARC Methodology: Section 3 of architecture document
