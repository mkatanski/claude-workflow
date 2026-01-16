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

### Step 1: Detect Project Type and Dependencies

Check marker files to determine the project type and read dependencies:

| Marker File | Language | How to Read Dependencies |
|-------------|----------|--------------------------|
| `package.json` | TypeScript/JS | `dependencies` and `devDependencies` |
| `Cargo.toml` | Rust | `[dependencies]` section |
| `go.mod` | Go | `require` statements |
| `pyproject.toml` | Python | `[project.dependencies]` or `[tool.poetry.dependencies]` |
| `requirements.txt` | Python | Line-by-line packages |

### Step 2: Compare Before and After

Compare dependencies before and after implementation to identify NEW dependencies (not version updates).

For example, in TypeScript:
```bash
# Before (captured at workflow start)
# After (read now from package.json)
```

### Step 3: Filter Dependencies

Not every dependency needs a skill. Use these rules:

**Create skill for:**
- Libraries with significant API surface
- Libraries used throughout the codebase
- Libraries with non-obvious usage patterns
- Libraries where project-specific conventions matter

**Skip (by language):**

| Language | Skip These |
|----------|------------|
| TypeScript/JS | `@types/*`, type stubs, bundler plugins, test utilities |
| Python | `types-*`, `mypy`, build tools (setuptools, wheel) |
| Rust | `*-sys` crates, proc-macro crates |
| Go | Indirect dependencies, test utilities |

**Always Skip:**
- Simple utilities with obvious usage
- Build/compile tools
- Testing utilities covered by testing.md antipatterns
- Dev-only tooling (linters, formatters)

### Step 4: Fetch Documentation

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

### Step 5: Create Skill Using skill-writer

Use the `/skill-writer` skill to create each dependency skill:

1. **Location:** `.claude/skills/deps/{package-name}/SKILL.md`

2. **Skill content should include:**
   - When to use this library
   - Installation command (language-appropriate)
   - Basic usage patterns
   - Project-specific conventions (if any)
   - Common pitfalls to avoid
   - Links to official documentation

3. **Keep it focused:**
   - Max 200 lines
   - Don't duplicate official docs
   - Focus on project-specific usage
   - Include concrete examples

### Step 6: Validate Skills

Ensure each created skill:
- Has valid frontmatter (name, description)
- Includes "When to Use" section
- Has concrete examples
- References official docs for details

## Output Format

Provide a summary of skills created:

```
## Dependency Skills Created

### Project Type
[TypeScript/Python/Rust/Go]

### New Skills
| Package | Skill Path | Purpose |
|---------|------------|---------|
| jmespath | .claude/skills/deps/jmespath/SKILL.md | JSON/dict querying |
| zod | .claude/skills/deps/zod/SKILL.md | Schema validation |

### Skipped
| Package | Reason |
|---------|--------|
| @types/node | Type stubs only |
| vitest | Testing utility |

### Notes
- [Any special considerations or follow-ups needed]
```

## Example Skill Structure

```markdown
---
name: zod
description: Schema validation and TypeScript type inference. Use when validating external data, API responses, or form inputs with runtime type safety.
---

# Zod

Schema validation library for TypeScript with automatic type inference.

## When to Use

- Validating API responses
- Form input validation
- Parsing configuration files
- Runtime type checking at system boundaries

## Installation

\`\`\`bash
npm install zod
# or
bun add zod
\`\`\`

## Basic Usage

\`\`\`typescript
import { z } from "zod";

// Define schema
const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  age: z.number().min(0).optional(),
});

// Infer TypeScript type
type User = z.infer<typeof UserSchema>;

// Validate data
const result = UserSchema.safeParse(data);
if (result.success) {
  const user: User = result.data;
}
\`\`\`

## Common Pitfalls

- Use `.safeParse()` instead of `.parse()` for graceful error handling
- Remember that `.optional()` allows `undefined`, use `.nullable()` for `null`
- Use `.transform()` for data transformation during parsing

## Reference

Official docs: https://zod.dev/
```

## Best Practices

1. **Be selective** - Not every package needs a skill
2. **Keep it practical** - Focus on how we use it, not full API
3. **Include examples** - Real code from the project if possible
4. **Link to docs** - Don't duplicate, reference
5. **Update existing** - If skill exists, update rather than recreate
6. **Context7 first** - Always fetch latest docs before creating
