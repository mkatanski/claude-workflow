---
name: update-architecture
description: Update architecture document after milestone completion to reflect implementation learnings. Incorporates valid improvements, documents emerged patterns, and refines future milestone sections. Use after completing a milestone when drift check identified improvements to keep.
---

# Update Architecture

Evolve the architecture document after milestone completion to reflect implementation reality and learnings.

## When to Use

- After completing a milestone and running `/check-drift`
- When drift check identifies `keep` items (improvements to document)
- When implementation revealed better patterns than originally planned
- When future milestone architecture needs refinement based on learnings

## Instructions

### Step 1: Review Drift Check Results

Examine the drift check output for items categorized as `keep`:

```json
{
  "type": "keep",
  "description": "Added input validation middleware",
  "file": "src/middleware/validate.ts",
  "action": "Document in architecture - improves security"
}
```

These are valid improvements that should be incorporated into the architecture.

### Step 2: Identify Emerged Patterns

Look for patterns that emerged during implementation:

1. **New utilities**: Helper functions that proved useful
2. **Error handling**: Patterns for error management
3. **Testing patterns**: Approaches that worked well
4. **Integration patterns**: How components connected

### Step 3: Update Architecture Sections

#### File Structure
Add new files/directories that were created:

```markdown
## File Structure

src/
├── middleware/
│   ├── validate.ts      # [NEW] Input validation middleware
│   └── rateLimit.ts     # [NEW] Rate limiting middleware
```

#### Patterns
Document new patterns discovered:

```markdown
## Patterns

### Input Validation (NEW)
All API endpoints use the validation middleware:
```typescript
router.post('/endpoint', validate(schema), handler)
```
```

#### Integration Points
Update how components connect:

```markdown
## Integration Points

### Middleware Chain (UPDATED)
Request flow: rateLimit -> validate -> auth -> handler
```

### Step 4: Refine Future Milestones

Based on learnings, update future milestone architecture:

1. **Adjust file locations**: If better locations were discovered
2. **Update patterns**: If patterns evolved from the plan
3. **Add dependencies**: If new dependencies emerged
4. **Clarify interfaces**: If interfaces were refined

### Step 5: Version the Document

Track architecture evolution:

```markdown
## Version History

| Version | Date | Milestone | Changes |
|---------|------|-----------|---------|
| 1.0 | 2024-01-15 | Initial | Initial architecture |
| 1.1 | 2024-01-16 | M1 | Added validation middleware pattern |
| 1.2 | 2024-01-17 | M2 | Refined service interfaces |
```

### Step 6: Log the Update

Append to `.claude/generated/decisions.md`:

```markdown
## Architecture Update: Post-M[N]

**Date**: YYYY-MM-DD
**Version**: X.Y -> X.Z

**Changes Made**:
- Added: [new sections/patterns]
- Updated: [modified sections]
- Removed: [deprecated sections]

**Reasoning**: [why these changes were made]

---
```

## Output Format

Output the updated architecture document as markdown, maintaining the original structure but with updates clearly indicated.

### Update Markers

Use these markers to indicate changes:

- `[NEW]` - Newly added section/item
- `[UPDATED]` - Modified from original
- `[REMOVED]` - Deprecated (keep in history)
- `[M1]`, `[M2]` - Added during specific milestone

### Example Update

**Before** (Original Architecture):
```markdown
## File Structure

src/
├── services/
│   └── AuthService.ts
└── routes/
    └── auth.ts
```

**After** (Updated):
```markdown
## File Structure

src/
├── middleware/
│   ├── validate.ts      # [NEW:M1] Input validation
│   └── rateLimit.ts     # [NEW:M1] Rate limiting
├── services/
│   └── AuthService.ts
└── routes/
    └── auth.ts
```

## What to Update

### Always Update
- File structure (new files/directories)
- Patterns that proved useful
- Integration points that changed
- Interfaces that were refined

### Consider Updating
- Component relationships if they evolved
- Data flow if it changed
- Error handling if patterns emerged
- Testing approaches if new patterns used

### Don't Update
- Sections for future milestones (unless directly relevant)
- Removed/deprecated approaches (move to history)
- Speculative additions not yet implemented

## Example

### Input

**Current Architecture** (v1.0):
```markdown
## Authentication Architecture

### File Structure
src/
├── services/
│   └── AuthService.ts
└── routes/
    └── auth.ts

### Patterns
- Service pattern for business logic
- Express router for endpoints
```

**Drift Check Result**:
```json
{
  "issues": [
    {
      "type": "keep",
      "description": "Added validation middleware with Zod schemas",
      "file": "src/middleware/validate.ts"
    },
    {
      "type": "keep",
      "description": "Added custom error classes for auth errors",
      "file": "src/errors/AuthError.ts"
    }
  ],
  "architecture_updates": [
    "Add middleware directory to file structure",
    "Add errors directory to file structure",
    "Document validation pattern",
    "Document error handling pattern"
  ]
}
```

### Output

**Updated Architecture** (v1.1):
```markdown
## Authentication Architecture

### Version History
| Version | Date | Milestone | Changes |
|---------|------|-----------|---------|
| 1.0 | 2024-01-15 | Initial | Initial architecture |
| 1.1 | 2024-01-16 | M1 | Added validation and error handling patterns |

### File Structure
src/
├── errors/
│   └── AuthError.ts     # [NEW:M1] Custom auth error classes
├── middleware/
│   └── validate.ts      # [NEW:M1] Zod schema validation
├── services/
│   └── AuthService.ts
└── routes/
    └── auth.ts

### Patterns

#### Service Pattern
Business logic in service classes.

#### Validation Pattern [NEW:M1]
All endpoints validate input using Zod schemas:
```typescript
const schema = z.object({ email: z.string().email() });
router.post('/login', validate(schema), loginHandler);
```

#### Error Handling Pattern [NEW:M1]
Custom error classes for domain-specific errors:
```typescript
class AuthError extends Error {
  constructor(message: string, public code: string) {
    super(message);
  }
}
```
```

## Best Practices

1. **Be conservative**: Only add patterns that proved genuinely useful
2. **Maintain structure**: Keep the original document organization
3. **Clear markers**: Always indicate what's new vs updated
4. **Version everything**: Track changes over time
5. **Future-proof**: Don't lock in decisions that might change

## Integration with Workflow

This skill is called after drift check in the milestone loop:

1. `/check-drift` - Identifies improvements (keep) and violations (fix)
2. **`/update-architecture`** - Incorporates improvements (THIS SKILL)
3. Continue to next milestone with updated architecture

The updated architecture becomes the baseline for the next milestone's story generation.
