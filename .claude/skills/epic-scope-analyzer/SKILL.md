---
name: epic-scope-analyzer
description: Analyze epic scope to determine if milestones are needed vs single-phase execution. Uses story count estimates and complexity scoring. Use after analyzing an epic and before generating stories to plan the execution strategy.
---

# Epic Scope Analyzer

Analyze an epic to determine optimal execution strategy: single-phase implementation or milestone-based phased approach.

## When to Use

- After creating an epic description with `/analyze-epic`
- Before running `/generate-stories` to break down the epic
- When planning a large feature that might need phased delivery
- When deciding between immediate implementation vs milestone-based approach

## Instructions

### Step 1: Gather Epic Information

Read the epic description and extract:

1. **Requirements Count**: Number of functional and non-functional requirements
2. **Acceptance Criteria Count**: Number of testable criteria defined
3. **Technical Considerations**: Architecture complexity indicators
4. **Dependencies**: External and internal dependencies
5. **Risk Assessment**: Technical risks identified in the epic

### Step 2: Estimate Story Count

Calculate estimated story count using these heuristics:

| Epic Characteristic | Story Multiplier |
|---------------------|------------------|
| Each must-have functional requirement | 1-2 stories |
| Each should-have functional requirement | 1 story |
| Each non-functional requirement | 0.5-1 story |
| Each external integration | 2-3 stories |
| Each new data model | 1-2 stories |
| Testing and documentation | 10-15% of total |

**Story Count Threshold**: Epics with **12 or more estimated stories** should consider milestones.

### Step 3: Calculate Complexity Score

Evaluate complexity across five dimensions. Score each 0-3 points:

#### Integration Complexity (0-3)
- **0**: No external integrations
- **1**: Single external API/service
- **2**: Multiple integrations, well-documented APIs
- **3**: Multiple integrations with undocumented/complex APIs

#### Pattern Novelty (0-3)
- **0**: Uses only existing patterns in codebase
- **1**: Minor pattern extensions needed
- **2**: New patterns required, similar to existing code
- **3**: Entirely new patterns, no reference implementations

#### Data Complexity (0-3)
- **0**: No new data models
- **1**: Simple data models, no migrations
- **2**: Complex models, schema changes required
- **3**: Major data restructuring, migrations with transformations

#### Testing Complexity (0-3)
- **0**: Standard unit tests sufficient
- **1**: Integration tests needed
- **2**: Complex test scenarios, mocking required
- **3**: E2E tests, test infrastructure changes needed

#### Risk Level (0-3)
- **0**: Low risk, rollback easy
- **1**: Medium risk, contained impact
- **2**: High risk, affects multiple systems
- **3**: Critical risk, security/data integrity concerns

**Total Score Interpretation**:
- **0-4**: `low` complexity
- **5-8**: `medium` complexity
- **9-12**: `high` complexity
- **13-15**: `very-high` complexity

### Step 4: Make Recommendation

Apply both criteria to determine recommendation:

| Story Count | Complexity | Recommendation |
|-------------|------------|----------------|
| < 12 | low/medium | Single-phase execution |
| < 12 | high/very-high | Consider milestones for risk management |
| >= 12 | low/medium | Consider milestones for tracking |
| >= 12 | high/very-high | **Strongly recommend milestones** |

**Milestone Strategy** (when recommended):

- **2 milestones**: For 12-18 stories or medium-high complexity
- **3 milestones**: For 18-25 stories or high complexity
- **4+ milestones**: For 25+ stories or very-high complexity (consider splitting epic)

### Step 5: Log Decision

Append the decision to `.claude/generated/decisions.md` using this format:

```markdown
## [YYYY-MM-DD HH:MM] Scope Analysis: [Epic Title]

**Estimated Stories**: [count]
**Complexity**: [score] ([total]/15)
**Decision**: [Milestones/Single-phase]

**Key Factors**:
- [factor 1]
- [factor 2]

**Recommendation**: [recommendation text]

---
```

## Output Format

Output a JSON object with this structure:

```json
{
  "needs_milestones": true,
  "estimated_story_count": 18,
  "complexity_score": "high",
  "complexity_breakdown": {
    "integration": 2,
    "pattern_novelty": 2,
    "data": 2,
    "testing": 2,
    "risk": 2,
    "total": 10
  },
  "complexity_factors": [
    "Multiple external API integrations",
    "New authentication patterns required",
    "Database schema migrations needed"
  ],
  "recommendation": "Use 3 milestones with risk-based phasing",
  "milestone_suggestion": {
    "count": 3,
    "phasing": "risk-based",
    "phases": [
      "Foundation: Core types, models, and configuration",
      "Core: Main services and business logic",
      "Features: User-facing functionality and integrations"
    ]
  },
  "reasoning": "With 18 estimated stories and high complexity (10/15), milestones provide risk containment and clearer progress tracking."
}
```

For single-phase execution:

```json
{
  "needs_milestones": false,
  "estimated_story_count": 8,
  "complexity_score": "medium",
  "complexity_breakdown": {
    "integration": 1,
    "pattern_novelty": 1,
    "data": 1,
    "testing": 1,
    "risk": 1,
    "total": 5
  },
  "complexity_factors": [
    "Single API integration (well-documented)",
    "Follows existing patterns with minor extensions"
  ],
  "recommendation": "Single-phase execution appropriate",
  "milestone_suggestion": null,
  "reasoning": "With 8 estimated stories and medium complexity (5/15), this epic can be implemented in a single phase without milestone overhead."
}
```

### Field Definitions

| Field | Type | Description |
|-------|------|-------------|
| `needs_milestones` | boolean | Primary recommendation |
| `estimated_story_count` | number | Estimated story count |
| `complexity_score` | string | `low`, `medium`, `high`, `very-high` |
| `complexity_breakdown` | object | Score breakdown by dimension |
| `complexity_factors` | array | Human-readable complexity contributors |
| `recommendation` | string | Brief actionable recommendation |
| `milestone_suggestion` | object/null | Suggested milestone structure |
| `reasoning` | string | Explanation of the recommendation |

## Example

### Input

Epic: "User Authentication System" with social login, MFA, and session management.

### Analysis

**Story Estimation**:
- 6 functional requirements (must-have): ~10 stories
- 3 non-functional requirements: ~2 stories
- 2 external integrations (OAuth): ~5 stories
- Testing overhead: ~2 stories
- **Total**: ~19 stories

**Complexity Scoring**:
- Integration: 3 (multiple OAuth providers)
- Pattern Novelty: 2 (new MFA patterns)
- Data: 2 (user schema changes)
- Testing: 2 (security testing required)
- Risk: 3 (security-critical)
- **Total**: 12/15 (high)

### Output

```json
{
  "needs_milestones": true,
  "estimated_story_count": 19,
  "complexity_score": "high",
  "complexity_breakdown": {
    "integration": 3,
    "pattern_novelty": 2,
    "data": 2,
    "testing": 2,
    "risk": 3,
    "total": 12
  },
  "complexity_factors": [
    "Multiple OAuth provider integrations (Google, GitHub)",
    "Security-critical implementation requiring audit",
    "New MFA patterns not in existing codebase",
    "User schema changes with migration"
  ],
  "recommendation": "Use 3 milestones with risk-based phasing",
  "milestone_suggestion": {
    "count": 3,
    "phasing": "risk-based",
    "phases": [
      "Foundation: User model, auth config, base types",
      "Core: AuthService, password hashing, JWT management",
      "Features: Login/register endpoints, OAuth, MFA"
    ]
  },
  "reasoning": "With 19 estimated stories and high complexity (12/15), milestones are strongly recommended. Risk-based phasing validates core security patterns before adding OAuth complexity."
}
```

## Best Practices

1. **Re-evaluate after architecture**: If `/create-architecture` reveals unexpected complexity, re-run scope analysis
2. **Err toward milestones for security-critical epics**: Even if story count is low
3. **Consider team context**: New team members or unfamiliar tech increases effective complexity
4. **Log all decisions**: Even "single-phase" decisions provide valuable history
5. **Review estimates after completion**: Compare estimates vs actuals to improve heuristics

## Integration with Workflow

This skill fits in the epic-to-implementation workflow:

1. `/analyze-epic` - Create epic description
2. **`/epic-scope-analyzer`** - Determine execution strategy (THIS SKILL)
3. `/create-architecture` - Design implementation structure
4. `/generate-milestones` - If milestones needed, split into phases
5. `/generate-stories` - Break down into stories

When milestones are recommended, the workflow branches to milestone mode instead of single-phase execution.
