---
name: consolidate-antipatterns
description: Curate and consolidate antipatterns after epic completion. Removes duplicates, merges similar patterns, and ensures consistent formatting. Use at the end of an epic implementation.
---

# Consolidate Antipatterns

This skill curates the antipatterns knowledge base to maintain quality and prevent bloat.

## When to Use

Use this skill:
- At the end of an epic implementation
- When antipattern files have grown significantly
- During periodic maintenance of the knowledge base
- When patterns seem redundant or outdated

## Instructions

### Step 1: Read All Antipattern Files

Load and analyze each category file:

- `.claude/skills/antipatterns/python.md`
- `.claude/skills/antipatterns/testing.md`
- `.claude/skills/antipatterns/architecture.md`
- `.claude/skills/antipatterns/lint.md`

### Step 2: Identify Issues

Look for these problems:

1. **Duplicates** - Same pattern described in different words
2. **Too specific** - Patterns that only apply to one unique case
3. **Outdated** - Patterns that no longer apply (dependencies removed, etc.)
4. **Poorly written** - Unclear, missing examples, or lacking "why"
5. **Wrong category** - Pattern in wrong file
6. **Inconsistent format** - Not following the standard structure

### Step 3: Consolidate Duplicates

When you find duplicate patterns:

1. Keep the better-written version
2. Merge any unique insights from both
3. Remove the inferior duplicate
4. Ensure the merged pattern is complete

### Step 4: Remove Non-Generalizable Patterns

Patterns should be removed if:
- They only applied to a single, specific bug
- The underlying code was removed
- The pattern is too narrow to help in future

### Step 5: Improve Clarity

For each remaining pattern, ensure:
- **Don't** has a concrete example
- **Do** has a concrete example
- **Why** explains the consequences
- **Source** identifies where it came from

### Step 6: Ensure Consistent Formatting

All patterns should follow:

```markdown
## [Pattern Name]
**Don't:** [what to avoid]
**Do:** [correct approach]
**Why:** [brief explanation]
**Source:** [origin]
```

### Step 7: Update Files

Write the consolidated content back to each file.

## Output Format

Provide a consolidation summary:

```
## Consolidation Summary

### Changes Made
- **Duplicates merged:** [count]
- **Patterns removed:** [count]
- **Patterns improved:** [count]
- **Patterns moved:** [count]

### Details
- Merged: "[pattern A]" and "[pattern B]" → "[merged name]"
- Removed: "[pattern]" - [reason]
- Improved: "[pattern]" - [what was improved]
```

## Best Practices

1. **Preserve valuable knowledge** - Don't over-prune
2. **Merge rather than delete** - Combine insights from duplicates
3. **Keep it actionable** - Remove theory, keep practice
4. **Maintain balance** - Each category should have meaningful patterns
5. **Document removals** - Note why patterns were removed
