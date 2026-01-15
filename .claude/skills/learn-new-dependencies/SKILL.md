---
name: learn-new-dependencies
description: Create skills for new project dependencies added during implementation. Uses context7 for documentation and skill-writer for proper skill creation. Use after epic completion when new packages were added.
---

# Learn New Dependencies

This skill creates focused skills for new dependencies added to the project, enabling better code generation in future implementations.

## When to Use

Use this skill:
- After epic completion when new packages were added
- When a significant new library is introduced
- When existing dependency usage patterns should be documented

## Instructions

### Step 1: Identify New Dependencies

Compare dependencies before and after implementation:

For Python projects, check:
- `pyproject.toml` - dependencies and dev-dependencies sections
- `requirements.txt` - if used
- `setup.py` - if used

Extract the list of NEW dependencies (not version updates).

### Step 2: Filter Dependencies

Not every dependency needs a skill. Create skills for:

**Create skill for:**
- Libraries with significant API surface (jmespath, pydantic, etc.)
- Libraries used throughout the codebase
- Libraries with non-obvious usage patterns
- Libraries where project-specific conventions matter

**Skip skill for:**
- Simple utilities with obvious usage (python-dotenv, etc.)
- Type stubs (types-*)
- Testing utilities already covered by testing.md antipatterns
- Build tools (setuptools, wheel, etc.)

### Step 3: Fetch Documentation

For each dependency that needs a skill:

1. Use context7 to fetch current documentation:
   ```
   Use context7 to look up documentation for [package-name]
   ```

2. Focus on:
   - Core API and main use cases
   - Common patterns and idioms
   - Gotchas and common mistakes
   - Configuration options

### Step 4: Create Skill Using skill-writer

Use the `/skill-writer` skill to create each dependency skill:

1. **Location:** `.claude/skills/deps/{package-name}/SKILL.md`

2. **Skill content should include:**
   - When to use this library
   - Basic usage patterns
   - Project-specific conventions (if any)
   - Common pitfalls to avoid
   - Links to official documentation

3. **Keep it focused:**
   - Max 200 lines
   - Don't duplicate official docs
   - Focus on project-specific usage
   - Include concrete examples

### Step 5: Validate Skills

Ensure each created skill:
- Has valid frontmatter (name, description)
- Includes "When to Use" section
- Has concrete examples
- References official docs for details

## Output Format

Provide a summary of skills created:

```
## Dependency Skills Created

### New Skills
| Package | Skill Path | Purpose |
|---------|------------|---------|
| jmespath | .claude/skills/deps/jmespath/SKILL.md | JSON/dict querying |
| pydantic | .claude/skills/deps/pydantic/SKILL.md | Data validation |

### Skipped
| Package | Reason |
|---------|--------|
| python-dotenv | Simple utility, obvious usage |
| types-requests | Type stubs only |

### Notes
- [Any special considerations or follow-ups needed]
```

## Example Skill Structure

```markdown
---
name: jmespath
description: Query JSON and dict structures using JMESPath expressions. Use when extracting data from complex nested structures or transforming JSON data.
---

# JMESPath

JMESPath is a query language for JSON. Use it for extracting and transforming data from complex nested structures.

## When to Use

- Extracting specific values from API responses
- Filtering lists based on conditions
- Transforming data structures

## Basic Usage

\`\`\`python
import jmespath

data = {"users": [{"name": "Alice", "age": 30}, {"name": "Bob", "age": 25}]}

# Extract all names
names = jmespath.search("users[*].name", data)  # ["Alice", "Bob"]

# Filter by condition
adults = jmespath.search("users[?age >= `30`]", data)
\`\`\`

## Project Conventions

- Prefer JMESPath over manual dict traversal for complex queries
- Use for workflow variable extraction (see workflow.py)

## Common Pitfalls

- Numbers in expressions need backticks: `[?age >= \`30\`]`
- Strings need quotes: `[?name == 'Alice']`

## Reference

Official docs: https://jmespath.org/
```

## Best Practices

1. **Be selective** - Not every package needs a skill
2. **Keep it practical** - Focus on how we use it, not full API
3. **Include examples** - Real code from the project if possible
4. **Link to docs** - Don't duplicate, reference
5. **Update existing** - If skill exists, update rather than recreate
