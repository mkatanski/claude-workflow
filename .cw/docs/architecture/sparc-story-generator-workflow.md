# SPARC Story Generator Workflow Architecture

> **Version**: 1.1.0
> **Status**: Draft
> **Created**: 2026-01-21

---

## 1. Executive Summary

### 1.1 Purpose

Create a workflow that implements the SPARC methodology (Specification, Pseudocode, Architecture, Refinement, Completion) to analyze complex architectural documents and generate implementation stories in YAML format.

### 1.2 Key Design Decision

**The workflow graph IS the orchestrator.** Unlike traditional SPARC implementations that use an AI "orchestrator" prompt to manage phases, our LangGraph-based workflow provides deterministic control flow. This means:

- We use **5 phase-specific AI prompts** (S, P, A, R, C)
- We do **NOT** use an orchestrator prompt
- Phase transitions are **deterministic** (workflow edges)
- AI is used **only** where reasoning/creativity is required

### 1.3 Scope

The workflow will:
1. Accept an architectural document as input
2. Analyze and extract requirements through SPARC phases
3. Generate implementation stories in multiple passes
4. Output validated stories in YAML format

---

## 2. Business Requirements

### 2.1 User Stories

#### US-1: Architectural Document Analysis
> As a developer, I want to feed an architectural document to the workflow and receive a structured analysis, so that I understand the scope before story generation.

**Acceptance Criteria:**
- Workflow accepts markdown architectural documents
- Extracts business requirements, technical requirements, components
- Produces structured analysis output
- Identifies dependencies between components

#### US-2: Multi-Pass Story Generation
> As a developer, I want stories generated in logical passes (foundation → core → features → integration), so that I can implement them in the correct order.

**Acceptance Criteria:**
- Stories are grouped into implementation phases
- Each phase builds on previous phases
- Dependencies between stories are explicit
- Pass count is configurable

#### US-3: AI Review of Architectural Analysis
> As a developer, I want the architectural analysis reviewed by a secondary AI agent before story generation begins, so that misunderstandings are caught automatically.

**Acceptance Criteria:**
- Analysis phase produces reviewable output
- Secondary AI agent (reviewer) validates analysis against source document
- Reviewer identifies gaps, misinterpretations, or missing components
- Refinements are incorporated automatically before proceeding
- Review criteria are configurable

#### US-3b: AI Review of Generated Stories
> As a developer, I want generated stories reviewed by a secondary AI agent, so that story quality is ensured without manual intervention.

**Acceptance Criteria:**
- Each batch of generated stories is reviewed by a secondary AI agent
- Reviewer validates stories against architectural analysis and requirements
- Reviewer checks acceptance criteria quality and testability
- Reviewer identifies missing dependencies or gaps in coverage
- Low-quality stories are flagged for regeneration

#### US-4: YAML Story Output
> As a developer, I want stories output in YAML format, so that they can be processed by other workflows or tools.

**Acceptance Criteria:**
- Stories follow consistent YAML schema
- Each story has: id, title, description, acceptance criteria, dependencies, phase
- Output is valid YAML
- Stories are saved to configurable path

#### US-5: Large Document Handling
> As a developer, I want the workflow to handle large architectural documents that may produce 50+ stories, so that complex systems can be broken down effectively.

**Acceptance Criteria:**
- Documents up to 50,000 tokens can be processed
- Story generation happens in batches to manage context
- Progress is tracked and resumable

### 2.2 Business Rules

| ID | Rule |
|----|------|
| BR-1 | Architectural analysis MUST pass AI agent review before story generation |
| BR-2 | Generated stories MUST pass AI agent review before finalization |
| BR-3 | Stories MUST have explicit dependencies |
| BR-4 | Stories MUST be grouped into implementation phases |
| BR-5 | Each story MUST have testable acceptance criteria |
| BR-6 | Story IDs MUST be unique and sequential within phases |
| BR-7 | Review feedback MUST be incorporated before proceeding to next phase |

---

## 3. SPARC Methodology Application

### 3.1 Phase Mapping

| SPARC Phase | Workflow Responsibility | AI Responsibility |
|-------------|------------------------|-------------------|
| **S**pecification | Read document, pass to AI | Analyze requirements, extract structure |
| **P**seudocode | Store analysis, prepare prompts | Design story generation approach |
| **A**rchitecture | Validate structure, save artifacts | Plan story grouping, identify passes |
| **R**efinement | Loop control, batch management | Generate stories, refine based on feedback |
| **C**ompletion | YAML serialization, file output | Final validation, completeness check |

### 3.2 What MUST Be AI vs What CAN Be Deterministic

| Must Be AI (agentSession) | Can Be Deterministic (workflow code) |
|---------------------------|--------------------------------------|
| Understanding document requirements | Reading input files |
| Identifying components and dependencies | Writing output files (YAML) |
| Extracting acceptance criteria | Validating YAML structure |
| Designing story breakdown approach | Managing phase transitions |
| Writing story descriptions | Tracking progress/state |
| Analyzing complexity and effort | Batching stories for processing |
| Reviewing for completeness | Counting/numbering stories |
| Creative decisions on grouping | Git operations (branch, commit) |
| | Parsing AI output to structured data |
| | Retry logic on failures |
| | Conditional routing based on results |

### 3.3 SPARC Prompts Reference

We use phase-specific prompts adapted from the [ruvnet/rUv-dev](https://github.com/ruvnet/rUv-dev) repository:

| Phase | Prompt Source | Key Adaptations |
|-------|---------------|-----------------|
| Specification | [rules-spec-pseudocode](https://github.com/ruvnet/rUv-dev/tree/main/.roo/rules-spec-pseudocode) | Focus on extracting requirements from architecture docs |
| Architecture | [rules-architect](https://github.com/ruvnet/rUv-dev/tree/main/.roo/rules-architect) | Focus on story structure design, not system design |
| Refinement (TDD) | [rules-tdd](https://github.com/ruvnet/rUv-dev/tree/main/.roo/rules-tdd) | Adapted for story refinement, not code TDD |
| Completion | [rules-code](https://github.com/ruvnet/rUv-dev/tree/main/.roo/rules-code) | Validation and finalization focus |

**Sources:**
- [SPARC Methodology Wiki](https://github.com/ruvnet/claude-flow/wiki/SPARC-Methodology)
- [Claude-SPARC Automated Development System](https://gist.github.com/ruvnet/e8bb444c6149e6e060a785d1a693a194)
- [SPARC + TDD Integration Guide](https://gist.github.com/mondweep/d9c1615c32e3f375e0bef9e8e75496d4)

---

## 4. Workflow Architecture

### 4.1 High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    SPARC STORY GENERATOR                             │
│                   (Workflow = Orchestrator)                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  INPUT                                                               │
│  └── architecture-doc.md                                             │
│                                                                      │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐                          │
│  │ S: SPEC │───▶│P: PSEUDO│───▶│A: ARCH  │                          │
│  │  (AI)   │    │  (AI)   │    │  (AI)   │                          │
│  └─────────┘    └─────────┘    └────┬────┘                          │
│                                     │                                │
│                          ┌──────────▼──────────┐                    │
│                          │  ANALYSIS REVIEW    │                    │
│                          │  (Secondary AI)     │                    │
│                          └──────────┬──────────┘                    │
│                    ┌────────────────┴────────────────┐              │
│                    ▼                                 ▼               │
│              ┌──────────┐                     ┌──────────┐          │
│              │ Approved │                     │ Rejected │          │
│              └────┬─────┘                     └────┬─────┘          │
│                   │                                │                 │
│                   │                    [Return to SPEC with feedback]│
│                   ▼                                                  │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                  R: REFINEMENT LOOP                          │    │
│  │  ┌─────────────────────────────────────────────────────┐    │    │
│  │  │  For each pass:                                      │    │    │
│  │  │  ├─ Generate batch (AI)                              │    │    │
│  │  │  ├─ Review batch (Secondary AI) ◀── NEW              │    │    │
│  │  │  ├─ Regenerate rejected stories                      │    │    │
│  │  │  ├─ Validate structure (deterministic)               │    │    │
│  │  │  └─ Save progress                                    │    │    │
│  │  └─────────────────────────────────────────────────────┘    │    │
│  └───────────────────────────┬─────────────────────────────────┘    │
│                              │                                       │
│                              ▼                                       │
│  ┌───────────────────────────────────────┐                          │
│  │            C: COMPLETION              │                          │
│  │  ├─ Final coverage validation (AI)    │                          │
│  │  ├─ Generate YAML output              │                          │
│  │  └─ Summary report                    │                          │
│  └───────────────────────────┬───────────┘                          │
│                              │                                       │
│                              ▼                                       │
│  OUTPUT                                                              │
│  ├── stories/phase-1-foundation.yaml                                │
│  ├── stories/phase-2-core.yaml                                      │
│  ├── stories/phase-3-features.yaml                                  │
│  └── stories/summary.md                                             │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Node Responsibilities

| Node | Type | Responsibility |
|------|------|----------------|
| `read_input` | Deterministic | Read architecture doc, validate format |
| `specification` | AI | Extract requirements, components, constraints |
| `pseudocode` | AI | Design story generation approach |
| `architecture` | AI | Plan story structure, phases, dependencies |
| `save_analysis` | Deterministic | Write analysis to file for review |
| `review_analysis` | AI (Secondary) | Validate analysis against source document |
| `route_analysis_review` | Deterministic | Route based on review approval/rejection |
| `refinement_loop` | Deterministic | Control loop for pass-based generation |
| `generate_batch` | AI | Generate stories for current pass |
| `review_stories` | AI (Secondary) | Review generated stories for quality |
| `regenerate_rejected` | AI | Regenerate stories that failed review |
| `validate_batch` | Deterministic | Validate story structure, YAML schema |
| `completion` | Mixed | AI final check + deterministic YAML output |

### 4.3 State Schema

```typescript
interface SPARCStoryGeneratorState {
  // Input
  inputPath: string;
  documentContent: string;

  // Specification phase output
  analysis: {
    businessRequirements: Requirement[];
    technicalRequirements: Requirement[];
    components: Component[];
    constraints: string[];
    assumptions: string[];
  };

  // Architecture phase output
  storyPlan: {
    phases: StoryPhase[];
    totalEstimatedStories: number;
    dependencies: DependencyGraph;
  };

  // Analysis Review (AI Agent)
  analysisReview: {
    approved: boolean;
    feedback: string;
    gaps: string[];
    suggestions: string[];
    reviewerModel: string;
    attempts: number;
  };

  // Refinement phase
  currentPass: number;
  totalPasses: number;
  generatedStories: Story[];

  // Story Review (AI Agent)
  storyReview: {
    currentBatch: Story[];
    approvedStories: Story[];
    rejectedStories: StoryWithFeedback[];
    regenerationAttempts: number;
  };

  // Completion
  outputPath: string;
  completed: boolean;
  summary: ExecutionSummary;
}

interface StoryWithFeedback extends Story {
  reviewFeedback: string;
  rejectionReason: string;
}
```

---

## 5. Story Generation Strategy

### 5.1 Pass-Based Generation

Stories are generated in passes to manage complexity and ensure proper ordering:

| Pass | Focus | Example Stories |
|------|-------|-----------------|
| **Pass 1: Foundation** | Core infrastructure, types, utilities | Tool Server setup, Security Validator types |
| **Pass 2: Core** | Main components, primary functionality | Tool Proxy implementation, Request routing |
| **Pass 3: Features** | Feature-complete functionality | Policy enforcement, Budget tracking |
| **Pass 4: Integration** | Connections, CLI, documentation | CLI commands, End-to-end tests |

### 5.2 Story Schema (YAML)

```yaml
id: "SANDBOX-001"
phase: "foundation"
title: "Implement Tool Server Socket Listener"
description: |
  Create the Unix socket server that listens for tool requests
  from sandboxed containers.

priority: high
estimatedEffort: "medium"  # small, medium, large, xl

acceptanceCriteria:
  - Server binds to configurable Unix socket path
  - Server accepts multiple concurrent connections
  - Server gracefully handles connection errors
  - Server logs all connection events

dependencies: []  # No dependencies for foundation

technicalNotes: |
  Reference: Section 5.1 Tool Server in architecture doc

tags:
  - tool-server
  - socket
  - infrastructure
```

### 5.3 Batch Size Configuration

| Document Size | Stories Expected | Batch Size | Passes |
|---------------|------------------|------------|--------|
| Small (< 5k tokens) | 5-15 | 5 | 1-2 |
| Medium (5-20k tokens) | 15-40 | 10 | 3-4 |
| Large (20k+ tokens) | 40+ | 10 | 5+ |

---

## 6. Phase Prompts (Contracts)

### 6.1 Specification Phase Prompt

**Input:** Raw architectural document
**Output:** Structured analysis JSON

**Prompt Contract:**
- Extract all business requirements with IDs
- Extract all technical/functional requirements
- Identify system components and their responsibilities
- List constraints and assumptions
- Output as structured JSON

### 6.2 Pseudocode Phase Prompt

**Input:** Specification analysis
**Output:** Story generation approach

**Prompt Contract:**
- Review the extracted requirements
- Identify natural groupings for stories
- Propose pass structure (foundation → integration)
- Estimate story count per pass
- Define story granularity guidelines

### 6.3 Architecture Phase Prompt

**Input:** Specification + Pseudocode analysis
**Output:** Detailed story plan

**Prompt Contract:**
- Define story phases with clear boundaries
- Map requirements to story phases
- Identify cross-cutting concerns
- Create dependency graph outline
- Provide confidence assessment

### 6.4 Refinement Phase Prompt

**Input:** Story plan + Current pass context
**Output:** Generated stories (JSON array)

**Prompt Contract:**
- Generate stories for specified pass only
- Each story follows the defined schema
- Dependencies reference only existing stories
- Acceptance criteria are testable
- Technical notes reference source document sections

### 6.5 Completion Phase Prompt

**Input:** All generated stories
**Output:** Validation report + any missing stories

**Prompt Contract:**
- Verify all requirements are covered
- Check for orphaned dependencies
- Identify gaps in coverage
- Suggest any missing stories
- Provide completion confidence score

---

## 7. AI Agent Review System

### 7.1 Purpose

Quality assurance through secondary AI agent review at two critical points:
1. **Analysis Review** - Before story generation begins
2. **Story Review** - After each batch of stories is generated

This dual-review approach ensures:
- Architectural analysis accurately reflects source document
- Generated stories are high-quality and actionable
- No manual intervention required in the workflow
- Consistent quality standards across all outputs

### 7.2 Analysis Review (Post-Architecture Phase)

#### 7.2.1 Reviewer Responsibilities

The secondary AI agent (reviewer) receives:
- Original source document
- Generated analysis (specification + architecture outputs)

The reviewer validates:
| Aspect | Validation Criteria |
|--------|---------------------|
| Completeness | All major sections of source document are represented |
| Accuracy | Requirements correctly interpreted (no hallucinations) |
| Components | All components identified with correct responsibilities |
| Dependencies | Logical dependency relationships identified |
| Gaps | No critical requirements missing from analysis |

#### 7.2.2 Review Output

```typescript
interface AnalysisReviewResult {
  approved: boolean;
  confidence: number;  // 0.0 - 1.0
  feedback: string;
  gaps: {
    type: "missing_requirement" | "misinterpretation" | "missing_component";
    description: string;
    sourceReference?: string;
  }[];
  suggestions: string[];
}
```

#### 7.2.3 Rejection Handling

If analysis is rejected:
1. Reviewer provides specific, actionable feedback
2. Workflow returns to Specification phase
3. Feedback is injected into the prompt context
4. Maximum 3 refinement attempts before escalation
5. On max attempts: Save partial results, flag for manual review

### 7.3 Story Review (Post-Generation per Batch)

#### 7.3.1 Reviewer Responsibilities

The secondary AI agent receives:
- Architectural analysis (approved)
- Generated story batch
- Previously approved stories (for context)

The reviewer validates each story:
| Aspect | Validation Criteria |
|--------|---------------------|
| Clarity | Title and description are clear and unambiguous |
| Scope | Story represents a single, implementable unit of work |
| Acceptance Criteria | At least 3 testable criteria per story |
| Dependencies | References only existing or previously approved stories |
| Traceability | Clear link to source requirement or component |
| Effort Estimation | Effort estimate is reasonable for scope |

#### 7.3.2 Review Output

```typescript
interface StoryReviewResult {
  storyId: string;
  approved: boolean;
  score: number;  // 0-100
  issues: {
    type: "clarity" | "scope" | "criteria" | "dependency" | "traceability";
    severity: "blocking" | "warning";
    description: string;
    suggestion?: string;
  }[];
}

interface BatchReviewResult {
  totalStories: number;
  approved: number;
  rejected: number;
  results: StoryReviewResult[];
}
```

#### 7.3.3 Story Rejection Handling

Stories that fail review are:
1. Collected with their feedback
2. Passed to regeneration node with specific improvement guidance
3. Regenerated (max 2 attempts per story)
4. If still failing: Marked as "needs_manual_review" and included in output

### 7.4 Review Model Configuration

Different models can be used for generation vs review:

| Role | Recommended Model | Rationale |
|------|------------------|-----------|
| Analysis Generator | opus | Complex reasoning for extraction |
| Analysis Reviewer | sonnet | Cost-effective validation |
| Story Generator | sonnet | Good balance for bulk work |
| Story Reviewer | sonnet | Consistent quality checks |

Using a different model for review than generation helps catch model-specific biases.

### 7.5 Review Prompts (Contracts)

#### Analysis Review Prompt Contract
- Compare analysis against original document section by section
- Identify any requirements mentioned in source but missing from analysis
- Flag interpretations that don't match source intent
- Suggest specific improvements with source references
- Output structured JSON with approval decision

#### Story Review Prompt Contract
- Evaluate each story against quality criteria
- Check acceptance criteria are specific and testable
- Verify dependency chains are valid
- Ensure no duplicate functionality across stories
- Output structured JSON with per-story decisions

---

## 8. Output Artifacts

### 8.1 Generated Files

```
.cw/generated/sparc-output/
├── analysis/
│   ├── specification.json      # S phase output
│   ├── approach.json           # P phase output
│   └── story-plan.json         # A phase output
├── stories/
│   ├── phase-1-foundation.yaml
│   ├── phase-2-core.yaml
│   ├── phase-3-features.yaml
│   └── phase-4-integration.yaml
├── summary.md                  # Human-readable summary
└── manifest.json               # Metadata, timestamps, stats
```

### 8.2 Manifest Schema

```typescript
interface OutputManifest {
  generatedAt: string;
  inputDocument: string;
  inputHash: string;
  phases: {
    name: string;
    storyCount: number;
    outputFile: string;
  }[];
  totalStories: number;
  coverageScore: number;  // 0-100
  executionTime: number;  // seconds
  modelUsage: {
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
  };
}
```

---

## 9. Error Handling & Recovery

### 9.1 Failure Points

| Phase | Potential Failures | Recovery |
|-------|-------------------|----------|
| Specification | Document too large, unparseable | Split document, request format |
| Architecture | Insufficient detail in doc | Ask user for clarification |
| Refinement | Story generation timeout | Resume from last batch |
| Completion | YAML validation fails | Regenerate invalid stories |

### 9.2 Checkpointing

State is saved after each major step:
- After specification analysis
- After architecture plan approval
- After each refinement batch
- After completion validation

Recovery command: `cw run sparc-story-generator --resume`

---

## 10. Configuration

### 10.1 Workflow Configuration

```yaml
# .cw/workflows/sparc-story-generator/config.yaml
input:
  maxDocumentTokens: 50000
  supportedFormats: [".md", ".txt"]

generation:
  batchSize: 10
  maxPasses: 6
  minStoriesPerPhase: 3

models:
  # Generation models
  specification: opus    # Complex analysis
  pseudocode: sonnet     # Planning
  architecture: opus     # Critical decisions
  refinement: sonnet     # Bulk generation
  completion: sonnet     # Validation

  # Review models (secondary AI agents)
  analysisReviewer: sonnet    # Validates analysis
  storyReviewer: sonnet       # Validates stories

output:
  directory: ".cw/generated/stories"
  format: yaml

review:
  analysisReview:
    enabled: true
    maxAttempts: 3
    confidenceThreshold: 0.8  # Minimum confidence to approve
  storyReview:
    enabled: true
    maxRegenerationAttempts: 2
    minScoreToApprove: 70     # Story score threshold (0-100)
    allowPartialBatch: true   # Continue if some stories fail
```

### 10.2 CLI Usage

```bash
# Basic usage
cw run sparc-story-generator --input=./architecture.md

# With options
cw run sparc-story-generator \
  --input=./architecture.md \
  --output=./stories \
  --batch-size=15

# Resume interrupted run
cw run sparc-story-generator --resume

# Dry run (analysis only, no stories)
cw run sparc-story-generator --input=./architecture.md --analysis-only

# Skip reviews (not recommended, for testing only)
cw run sparc-story-generator \
  --input=./architecture.md \
  --skip-analysis-review \
  --skip-story-review

# Verbose mode (shows review details)
cw run sparc-story-generator --input=./architecture.md --verbose
```

---

## 11. Success Metrics

| Metric | Target |
|--------|--------|
| Requirement coverage | > 95% of documented requirements have stories |
| Story quality | All stories have ≥ 3 acceptance criteria |
| Dependency accuracy | 0 orphaned dependencies |
| Processing time | < 15 minutes for 50-story document |
| Analysis review pass rate | > 80% on first attempt |
| Story review pass rate | > 85% of stories approved on first generation |
| Regeneration success rate | > 90% of rejected stories pass after regeneration |

---

## 12. Constraints & Decisions

### 12.1 Design Decisions

| Decision | Rationale |
|----------|-----------|
| Workflow as orchestrator | Deterministic control, better debugging, model flexibility per phase |
| YAML output format | Human-readable, easy to edit, standard format |
| Pass-based generation | Manages context window, ensures dependency order |
| AI agent review (not human) | Enables fully automated pipeline, consistent quality criteria |
| Dual-point review | Analysis review catches misunderstandings; story review ensures quality |
| Secondary AI for review | Different model perspective helps catch biases, cost-effective |
| Opus for analysis phases | Complex reasoning required for extraction |
| Sonnet for generation & review | Good quality/cost balance for bulk work |

### 12.2 Constraints

| Constraint | Reason |
|------------|--------|
| Single architectural document input | Scope management |
| Markdown format required | Consistent parsing |
| 50k token limit | Context window management |
| YAML output only | Standardization |

---

## 13. Dependencies

| Dependency | Purpose |
|------------|---------|
| `js-yaml` | YAML parsing and serialization |
| `ajv` | JSON Schema validation for stories |
| Existing `agentSession` | AI phase execution |
| Existing `files` utility | File operations |

---

## 14. Future Enhancements

| Enhancement | Priority |
|-------------|----------|
| Multiple document input | Medium |
| Story import/merge | Medium |
| Linear/Jira export | Low |
| Interactive story editing | Low |
| Dependency visualization | Low |

---

## Appendix A: SPARC Prompt Templates

Full prompts are stored in:
```
.cw/workflows/sparc-story-generator/prompts/
├── specification.md
├── pseudocode.md
├── architecture.md
├── refinement.md
└── completion.md
```

These are adapted from:
- [ruvnet/rUv-dev .roo rules](https://github.com/ruvnet/rUv-dev/tree/main/.roo)
- [SPARC Methodology documentation](https://github.com/ruvnet/claude-flow/wiki/SPARC-Methodology)

---

## Appendix B: Example Story Output

```yaml
# phase-1-foundation.yaml
stories:
  - id: "SBX-001"
    phase: foundation
    title: "Define Tool Request/Response Types"
    description: |
      Create TypeScript interfaces for tool communication protocol
      between sandbox container and host tool server.
    priority: high
    estimatedEffort: small
    acceptanceCriteria:
      - ToolRequest interface defined with required fields
      - ToolResponse interface defined with success/error variants
      - Message types exported from sandbox/types.ts
      - Types are JSON-serializable
    dependencies: []
    tags: [types, protocol, foundation]
    sourceRef: "Section 6.2 Message Format"

  - id: "SBX-002"
    phase: foundation
    title: "Implement Unix Socket Server"
    description: |
      Create the Tool Server component that listens on a Unix socket
      for incoming tool requests from sandboxed containers.
    priority: high
    estimatedEffort: medium
    acceptanceCriteria:
      - Server binds to configurable socket path
      - Accepts NDJSON formatted messages
      - Handles concurrent connections
      - Emits connection lifecycle events
      - Graceful shutdown on SIGTERM
    dependencies:
      - "SBX-001"  # Requires types
    tags: [tool-server, socket, infrastructure]
    sourceRef: "Section 5.1 Tool Server"
```

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-21 | Initial draft |
| 1.1.0 | 2026-01-21 | Replaced human approval with AI agent review system; added story review mechanism; updated state schema, configuration, and metrics |
