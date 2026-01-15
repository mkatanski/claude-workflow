---
name: update-workflow-builder
description: Update the workflow-builder skill when new workflow patterns or features are discovered. Use after epic completion when workflow files were modified.
---

# Update Workflow Builder

This skill keeps the workflow-builder skill current by incorporating new patterns discovered during workflow development.

## When to Use

Use this skill:
- After an epic that modified workflow YAML files
- When new workflow features or patterns were used
- When existing workflow-builder guidance needs correction
- When new tools or step types are added to the orchestrator

## Instructions

### Step 1: Identify Workflow Changes

Check what changed in workflow files:

```bash
git diff --name-only HEAD~N -- '.claude/workflows/'
```

If no workflow files changed, skip this skill.

### Step 2: Analyze Changes

For each changed workflow file, identify:

1. **New YAML features used:**
   - New step types (tool, model, uses, etc.)
   - New fields (when, on_error, output_var, etc.)
   - New control flow patterns (goto, loops, conditions)

2. **New patterns discovered:**
   - Error handling strategies
   - Variable management approaches
   - Integration with skills

3. **Corrections to existing guidance:**
   - Patterns that didn't work as expected
   - Better approaches found

### Step 3: Read Current Workflow-Builder Skill

Load the current skill to understand what's already documented:

- `.claude/skills/workflow-builder/SKILL.md`
- `.claude/skills/workflow-builder/reference.md` (if exists)
- `.claude/skills/workflow-builder/examples.md` (if exists)

### Step 4: Determine What to Update

Compare changes against existing documentation:

| Change Type | Action |
|-------------|--------|
| New feature | Add to appropriate section |
| New pattern | Add example to examples section |
| Correction | Update existing guidance |
| Clarification | Improve existing explanation |

### Step 5: Update the Skill

Make targeted updates to workflow-builder skill:

1. **Don't rewrite everything** - Only update what's new
2. **Add examples** - Concrete YAML snippets
3. **Maintain structure** - Follow existing organization
4. **Keep it focused** - Don't duplicate orchestrator README

### Step 6: Validate Updates

Ensure updates:
- Are consistent with orchestrator behavior
- Include working YAML examples
- Don't contradict existing guidance
- Follow the skill's existing format

## Output Format

Provide an update summary:

```
## Workflow-Builder Updates

### Changes Detected
- Modified: epic-to-implementation.workflow.yaml
  - Added: learning phase with new step types
  - Changed: test loop error handling

### Updates Made
| Section | Change | Description |
|---------|--------|-------------|
| Step Types | Added | New `set` tool documentation |
| Examples | Added | Learning phase example |
| Error Handling | Updated | Clarified `on_error: continue` usage |

### Files Updated
- .claude/skills/workflow-builder/SKILL.md
- .claude/skills/workflow-builder/examples.md
```

## What NOT to Update

1. **Don't duplicate orchestrator README** - Reference it instead
2. **Don't add implementation details** - Keep it user-focused
3. **Don't add temporary patterns** - Only stable, reusable patterns
4. **Don't break existing guidance** - Extend, don't replace

## Best Practices

1. **Incremental updates** - Small, focused changes
2. **Test examples** - Ensure YAML snippets are valid
3. **Cross-reference** - Link to related sections
4. **Version awareness** - Note if features are version-specific
5. **Keep it practical** - Focus on "how to use" not "how it works"
