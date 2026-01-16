---
name: learn-from-failure
description: Analyze test/lint failures and update antipatterns skills with curated learnings. Use after fixing a test or lint failure to record the pattern for future reference.
---

# Learn From Failure

This skill extracts generalizable patterns from test/lint failures and updates the antipatterns skill with curated learnings.

## When to Use

Use this skill:
- After successfully fixing a test failure
- After resolving a lint error
- When a code review reveals a recurring issue
- When you discover a pattern that others should avoid

## Instructions

### Step 1: Detect Project Language

Check marker files to determine the project's primary language:

| Check | Language | Target File |
|-------|----------|-------------|
| `package.json` AND `tsconfig.json` | TypeScript | typescript.md |
| `Cargo.toml` | Rust | rust.md |
| `go.mod` | Go | go.md |
| `pyproject.toml` OR `requirements.txt` | Python | python.md |

### Step 2: Analyze the Failure

Examine the original error and the fix applied:

1. **What was the error?** - The exact error message or test failure
2. **What caused it?** - The underlying code issue
3. **How was it fixed?** - The solution applied
4. **Is it generalizable?** - Would this help in other situations?

### Step 3: Determine if Pattern is New

Read the existing antipattern files to check if this pattern already exists.

List all `.md` files in `.claude/skills/antipatterns/` (except `SKILL.md`):
```bash
ls .claude/skills/antipatterns/*.md | grep -v SKILL.md
```

Always check:
- `shared.md` - Language-agnostic patterns
- The detected language file (e.g., `typescript.md`, `python.md`)

Also check relevant category files:
- `testing.md` - Testing-related patterns
- `architecture.md` - Design patterns
- `lint.md` - Linting patterns

If a similar pattern exists:
- Consider if it needs clarification or updating
- Skip if it's already well-documented

### Step 4: Categorize the Pattern

Use this decision tree to determine which file:

```
Is it specific to a language feature/syntax?
  YES -> Use language file (typescript.md, python.md, rust.md, go.md)
  NO -> Continue

Is it about testing?
  YES -> testing.md

Is it about linting/formatting/type checking?
  YES -> lint.md

Is it about module structure, imports, or design?
  YES -> architecture.md

Is it a universal pattern (applies to all languages)?
  YES -> shared.md
```

### Step 5: Write the Pattern

Add the pattern to the appropriate file using this format:

```markdown
## [Descriptive Pattern Name]
**Don't:** [specific thing to avoid with example]
**Do:** [correct approach with example]
**Why:** [brief explanation of consequences]
**Source:** [story ID or date when learned]
```

Guidelines:
- Keep it concise but complete
- Include code examples where helpful
- Make it actionable, not theoretical
- Focus on the "why" to aid understanding

### Step 6: Curate Existing Patterns

While adding the new pattern:
- Check if it duplicates an existing entry - if so, merge them
- Check if any existing patterns are too specific - consider removing
- Ensure consistent formatting across entries

## Output Format

Provide a brief summary:

```
## Learning Summary

**Pattern Added:** [name]
**Category:** [language/testing/architecture/lint/shared]
**File Updated:** .claude/skills/antipatterns/[file].md

**Pattern:**
- Don't: [brief]
- Do: [brief]
```

## Best Practices

1. **Be selective** - Only add patterns that are truly generalizable
2. **Keep it curated** - Quality over quantity
3. **Include context** - The "why" is as important as the "what"
4. **Use examples** - Concrete code is clearer than abstract rules
5. **Review existing** - Don't duplicate; improve what exists
6. **Create language files** - If a language file doesn't exist, create it
