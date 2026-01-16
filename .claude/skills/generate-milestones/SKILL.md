---
name: generate-milestones
description: Generate risk-based milestones from an epic and architecture document. Splits large features into foundation, core, features, and integration phases with 8-15 stories each. Use when breaking down large epics into sequential implementation phases.
---

# Generate Milestones

Break down a large epic into risk-based milestones that deliver testable value incrementally.

## When to Use

- When `/epic-scope-analyzer` recommends milestones
- When an epic has more than 12-15 potential stories
- When implementing a feature that spans multiple logical phases
- When you need clear rollback points during implementation

## Risk-Based Phasing Strategy

Milestones follow a **risk-based phasing** approach that minimizes implementation risk by ordering work from lowest to highest uncertainty:

### Phase 1: Foundation
**Risk Level**: Lowest
**Focus**: Types, models, base infrastructure, configuration

This phase establishes the groundwork with work that:
- Has minimal dependencies on external systems
- Is unlikely to require significant rework
- Provides clear pass/fail validation (types compile, models validate)
- Creates the foundation other phases depend on

**Typical work**:
- Type definitions and interfaces
- Data models and schemas
- Configuration setup
- Utility functions
- Base error handling

**Target**: 6-10 stories

### Phase 2: Core
**Risk Level**: Low-Medium
**Focus**: Main services, business logic, core algorithms

This phase implements the heart of the feature:
- Builds on foundation types and models
- Contains the primary business rules
- Has testable behavior independent of UI
- May require iteration as edge cases emerge

**Typical work**:
- Service classes and business logic
- Core algorithms and transformations
- Data access and persistence
- Internal APIs and contracts

**Target**: 8-12 stories

### Phase 3: Features
**Risk Level**: Medium-High
**Focus**: User-facing functionality, UI components, integrations

This phase delivers visible value:
- Depends heavily on core phase work
- Most likely to receive feedback requiring changes
- Integrates multiple components together
- Validates the overall architecture

**Typical work**:
- UI components and views
- API endpoints and routes
- User workflows and interactions
- External service integrations

**Target**: 8-15 stories

### Phase 4: Integration/Polish
**Risk Level**: Highest
**Focus**: Testing, documentation, edge cases, performance

This phase hardens the implementation:
- Addresses issues discovered in earlier phases
- Handles edge cases and error scenarios
- Optimizes performance bottlenecks
- Completes documentation

**Typical work**:
- Integration and E2E tests
- Documentation and examples
- Performance optimization
- Edge case handling
- Accessibility and polish

**Target**: 4-8 stories

## Instructions

### Step 1: Analyze Epic Scope

Review the epic description and architecture document to understand:

1. **Feature boundaries**: What are the distinct functional areas?
2. **Technical layers**: What infrastructure, services, and UI work exists?
3. **Dependencies**: What must exist before other parts can be built?
4. **Risks**: What areas have the most uncertainty?

### Step 2: Identify Natural Breakpoints

Look for natural divisions in the work:

**Good milestone boundaries**:
- After foundation types/models are complete
- After core services can be unit tested
- After a vertical slice is functional
- After external integrations are working

**Poor milestone boundaries**:
- In the middle of a tightly coupled component
- Before dependent stories can be tested
- Arbitrary story count splits

### Step 3: Map Work to Phases

Categorize all anticipated work by phase:

```
Foundation (Phase 1)
├── Types and interfaces
├── Data models
└── Configuration

Core (Phase 2)
├── Business services
├── Data access
└── Core utilities

Features (Phase 3)
├── User-facing components
├── API endpoints
└── Integrations

Integration/Polish (Phase 4)
├── Integration tests
├── Documentation
└── Edge cases
```

### Step 4: Balance Milestone Size

Target **8-15 stories per milestone** with flexibility:

**Prefer natural breakpoints over arbitrary sizes**:
- If a phase has 7 stories, keep it at 7
- If a phase has 18 stories, look for a sub-boundary
- Never split tightly coupled stories across milestones

**Story estimation guidelines**:
| Complexity | Time | Stories per Milestone |
|------------|------|----------------------|
| Simple | 1-2h each | 12-15 stories |
| Medium | 2-4h each | 8-12 stories |
| Complex | 4-8h each | 6-10 stories |

### Step 5: Define Success Criteria

Each milestone must have clear success criteria:

1. **Testable**: Specific tests that must pass
2. **Demonstrable**: What can be shown working
3. **Reversible**: Clean rollback point if needed

### Step 6: Log Decision

Append milestone planning decisions to `.claude/generated/decisions.md`:

```markdown
## Milestone Planning: [Epic Title]

**Date**: YYYY-MM-DD
**Milestones**: [count]
**Total Estimated Stories**: [count]

### Phase Distribution
| Phase | Milestone | Stories | Focus |
|-------|-----------|---------|-------|
| Foundation | M1 | N | [areas] |
| Core | M2 | N | [areas] |

### Key Decisions
- [Decision]: [Rationale]

---
```

## Output Format

Output a JSON object with this structure:

```json
{
  "milestones": [
    {
      "id": "M1",
      "title": "Foundation",
      "phase": "foundation",
      "description": "Establish base types, models, and infrastructure",
      "goals": [
        "Define all TypeScript interfaces and types",
        "Create data models with validation",
        "Set up configuration and environment"
      ],
      "estimated_stories": 8,
      "dependencies": [],
      "success_criteria": [
        "All types compile without errors",
        "Models pass validation tests",
        "Configuration loads correctly"
      ],
      "architecture_focus": [
        "src/types/",
        "src/models/",
        "src/config/"
      ]
    },
    {
      "id": "M2",
      "title": "Core Services",
      "phase": "core",
      "description": "Implement main business logic and services",
      "goals": [
        "Implement core service classes",
        "Build data access layer",
        "Create utility functions"
      ],
      "estimated_stories": 12,
      "dependencies": ["M1"],
      "success_criteria": [
        "Services pass unit tests",
        "Data operations work correctly",
        "Business rules are validated"
      ],
      "architecture_focus": [
        "src/services/",
        "src/utils/",
        "src/repositories/"
      ]
    }
  ],
  "total_estimated_stories": 28,
  "estimated_milestones": 3,
  "phasing_rationale": "Risk-based ordering starting with stable foundation work"
}
```

### Field Definitions

| Field | Description |
|-------|-------------|
| `id` | Unique identifier (M1, M2, etc.) |
| `title` | Short, descriptive title (max 40 chars) |
| `phase` | One of: `foundation`, `core`, `features`, `integration` |
| `description` | What this milestone delivers |
| `goals` | 2-4 specific goals for this milestone |
| `estimated_stories` | Expected number of stories (8-15 target) |
| `dependencies` | Array of milestone IDs this depends on |
| `success_criteria` | Testable criteria for milestone completion |
| `architecture_focus` | Key directories/areas this milestone touches |

## Example

### Input

Epic: "User Authentication System" with Architecture Document

### Output

```json
{
  "milestones": [
    {
      "id": "M1",
      "title": "Auth Foundation",
      "phase": "foundation",
      "description": "Establish user types, auth configuration, and base error handling",
      "goals": [
        "Define User, AuthToken, and Credentials types",
        "Create auth configuration with JWT settings",
        "Implement auth-specific error classes"
      ],
      "estimated_stories": 6,
      "dependencies": [],
      "success_criteria": [
        "TypeScript compiles with no type errors",
        "JWT configuration validates correctly",
        "Error classes extend base Error properly"
      ],
      "architecture_focus": [
        "src/types/auth.ts",
        "src/config/auth.ts",
        "src/errors/auth.ts"
      ]
    },
    {
      "id": "M2",
      "title": "Auth Core Services",
      "phase": "core",
      "description": "Implement authentication business logic and token management",
      "goals": [
        "Build AuthService with login/register/logout methods",
        "Implement JWT token generation and verification",
        "Create password hashing utilities"
      ],
      "estimated_stories": 10,
      "dependencies": ["M1"],
      "success_criteria": [
        "AuthService unit tests pass (80%+ coverage)",
        "Tokens generate and verify correctly",
        "Password hashing is secure (bcrypt rounds >= 10)"
      ],
      "architecture_focus": [
        "src/services/AuthService.ts",
        "src/utils/jwt.ts",
        "src/utils/password.ts"
      ]
    },
    {
      "id": "M3",
      "title": "Auth Features & UI",
      "phase": "features",
      "description": "Build user-facing authentication endpoints and components",
      "goals": [
        "Create /auth/login and /auth/register endpoints",
        "Implement auth middleware for protected routes",
        "Build login/register form components"
      ],
      "estimated_stories": 12,
      "dependencies": ["M1", "M2"],
      "success_criteria": [
        "Login endpoint returns valid JWT on success",
        "Protected routes reject unauthenticated requests",
        "Forms validate and submit correctly"
      ],
      "architecture_focus": [
        "src/routes/auth.ts",
        "src/controllers/AuthController.ts",
        "src/middleware/authMiddleware.ts",
        "src/components/auth/"
      ]
    },
    {
      "id": "M4",
      "title": "Auth Integration & Security",
      "phase": "integration",
      "description": "Harden authentication with E2E tests and security review",
      "goals": [
        "Add end-to-end authentication flow tests",
        "Document authentication API and usage",
        "Handle security edge cases (rate limiting, token refresh)"
      ],
      "estimated_stories": 5,
      "dependencies": ["M1", "M2", "M3"],
      "success_criteria": [
        "E2E tests cover login, register, logout, protected access",
        "API documentation is complete with examples",
        "Rate limiting prevents brute force attempts"
      ],
      "architecture_focus": [
        "tests/e2e/auth/",
        "docs/auth.md"
      ]
    }
  ],
  "total_estimated_stories": 33,
  "estimated_milestones": 4,
  "phasing_rationale": "Foundation-first approach ensures stable types before business logic, with user-facing features only after core is validated"
}
```

## Best Practices

### Story Estimation Per Milestone

1. **Start conservative**: Better to have smaller milestones that complete than large ones that stall
2. **Account for testing**: Include test writing in story estimates
3. **Consider dependencies**: Tightly coupled work takes longer
4. **Reserve buffer**: Complex phases may need 10-20% buffer

### Milestone Boundaries

1. **Test at boundaries**: Each milestone should end with passing tests
2. **Commit at boundaries**: Clean git history with milestone commits
3. **Review at boundaries**: Architecture drift check at each milestone end
4. **Document at boundaries**: Update decisions.md with learnings

### Handling Large Epics

For epics with 40+ potential stories:
1. Consider splitting into multiple epics
2. Ensure foundation phase is especially solid
3. Plan for architecture evolution
4. Build in explicit review points

### Avoiding Common Mistakes

1. **Don't split tightly coupled stories** across milestones
2. **Don't skip foundation** even if it seems simple
3. **Don't overload features phase** - split if needed
4. **Don't defer all testing** to integration phase
5. **Don't ignore dependencies** - they determine order

## Integration with Other Skills

### Before generate-milestones
- `/analyze-epic`: Creates the epic description input
- `/epic-scope-analyzer`: Determines if milestones are needed
- `/create-architecture`: Creates the architecture document input

### After generate-milestones
- `/generate-stories`: Uses milestone context to generate 8-15 stories per milestone
- `/check-drift`: Validates implementation against architecture (per milestone)
- `/update-architecture`: Evolves architecture based on milestone learnings

## Validation Checklist

Before finalizing milestones, verify:

- [ ] Each milestone has 6-15 stories (flexible for natural breakpoints)
- [ ] Phases follow risk-based ordering
- [ ] Dependencies are correctly specified
- [ ] Success criteria are testable
- [ ] Architecture focus areas don't overlap unnecessarily
- [ ] Total estimated stories aligns with epic complexity
- [ ] Each milestone delivers demonstrable value
