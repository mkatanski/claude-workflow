---
name: antipatterns
description: Review known antipatterns and mistakes to avoid before implementing code. Use when starting implementation of a story, fixing bugs, or writing new features. Helps prevent repeating past mistakes.
---

# Antipatterns

This skill provides curated knowledge about patterns to avoid in this project. It is continuously updated based on learnings from test failures, lint issues, and code reviews.

## When to Use

Use this skill:
- Before implementing a new story
- When fixing test failures
- When encountering lint errors
- When making architectural decisions

## Instructions

### Step 1: Identify Relevant Categories

Based on the task at hand, determine which antipattern categories are relevant:

- **Python patterns** ([python.md](python.md)) - Type hints, idioms, common Python mistakes
- **Testing patterns** ([testing.md](testing.md)) - pytest fixtures, assertions, test structure
- **Architecture patterns** ([architecture.md](architecture.md)) - Module structure, dependencies, design
- **Lint patterns** ([lint.md](lint.md)) - ruff, mypy, formatting issues

### Step 2: Review Relevant Patterns

Read the relevant category files and note any patterns that apply to your current task.

### Step 3: Apply Learnings

When implementing:
1. Actively avoid the "Don't" patterns
2. Follow the "Do" recommendations
3. Understand the "Why" to make informed decisions

### Step 4: Contribute New Learnings

If you encounter and fix a new issue that others should avoid:
1. Use the `/learn-from-failure` skill to record it
2. The pattern will be added to the appropriate category file

## Pattern Format

Each antipattern follows this structure:

```markdown
## [Pattern Name]
**Don't:** [what to avoid]
**Do:** [correct approach]
**Why:** [brief explanation]
**Source:** [where this was learned]
```

## Best Practices

1. **Check before implementing** - Review relevant categories before writing code
2. **Learn from failures** - When tests fail, check if it's a known antipattern
3. **Keep patterns general** - Antipatterns should be reusable, not one-off fixes
4. **Update outdated patterns** - If a pattern no longer applies, flag it for removal
