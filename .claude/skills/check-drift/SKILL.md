---
name: check-drift
description: Check implementation against architecture document to detect drift. Categorizes deviations as keep (improvements), remove (unnecessary), or fix (violations). Use after implementing stories to ensure architectural alignment.
---

# Check Drift

Compare implementation against the architecture document to detect and categorize architectural drift.

## When to Use

- After implementing one or more stories
- Before finalizing a feature branch
- During code review
- When verifying architectural compliance

## Instructions

### Step 1: Gather Context

Collect the necessary information:

1. **Architecture Document**: The planned implementation structure
2. **Changed Files**: What was actually implemented (git diff)
3. **Story Context**: What was supposed to be implemented

### Step 2: Compare Implementation vs Plan

Check these areas:

#### File Structure
- Were planned files created in correct locations?
- Were files created that weren't planned?
- Are there missing planned files?

#### Patterns & Conventions
- Do implementations follow specified patterns?
- Are naming conventions followed?
- Is code organization consistent with architecture?

#### Interfaces & Types
- Do interfaces match the architecture spec?
- Are there unexpected types or interfaces?
- Are required types missing?

#### Integration Points
- Are integration points implemented as planned?
- Are there unexpected integrations?
- Are planned integrations missing?

### Step 3: Categorize Findings

Classify each deviation:

#### "keep" - Valid Improvements
These are deviations that improve the implementation:
- Security enhancements not in original plan
- Better error handling than specified
- Performance optimizations
- Improved type safety
- Better code organization

**Action**: Document and update architecture document

#### "remove" - Unnecessary Additions
These are features/code that shouldn't be there:
- Business logic not in requirements
- Features outside story scope
- "Nice to have" additions not requested
- Over-engineering or premature optimization

**Action**: Remove the code

#### "fix" - Architecture Violations
These are deviations that break the architecture:
- Wrong patterns used
- Files in wrong locations
- Incorrect interfaces
- Missing required functionality
- Integration points incorrectly implemented

**Action**: Refactor to match architecture

### Step 4: Output Results

Provide findings in JSON format for processing.

## Output Format

Output a JSON object with this structure:

```json
{
  "aligned": true,
  "issues": []
}
```

Or if there are issues:

```json
{
  "aligned": false,
  "issues": [
    {
      "type": "keep",
      "description": "Added input validation for email format",
      "file": "src/services/AuthService.ts",
      "action": "Document in architecture - improves security"
    },
    {
      "type": "remove",
      "description": "Added password strength meter UI not in requirements",
      "file": "src/components/LoginForm.tsx",
      "action": "Remove password strength meter component and related code"
    },
    {
      "type": "fix",
      "description": "Used Repository pattern instead of specified Service pattern",
      "file": "src/data/UserRepository.ts",
      "action": "Refactor to UserService following service pattern in architecture"
    }
  ]
}
```

### Field Definitions

| Field | Description |
|-------|-------------|
| `aligned` | `true` if no issues, `false` if issues exist |
| `type` | `keep`, `remove`, or `fix` |
| `description` | What the deviation is |
| `file` | File path where deviation exists |
| `action` | Specific action to take |

## Examples

### Example 1: Perfectly Aligned

```json
{
  "aligned": true,
  "issues": []
}
```

### Example 2: Mixed Issues

```json
{
  "aligned": false,
  "issues": [
    {
      "type": "keep",
      "description": "Added rate limiting to login endpoint",
      "file": "src/middleware/rateLimiter.ts",
      "action": "Document in architecture - security improvement"
    },
    {
      "type": "keep",
      "description": "Added request validation middleware",
      "file": "src/middleware/validate.ts",
      "action": "Document in architecture - better error handling"
    },
    {
      "type": "remove",
      "description": "Added social login buttons not in requirements",
      "file": "src/components/LoginForm.tsx",
      "action": "Remove social login UI components"
    },
    {
      "type": "remove",
      "description": "Added analytics tracking not in scope",
      "file": "src/utils/analytics.ts",
      "action": "Remove analytics utility and all usages"
    },
    {
      "type": "fix",
      "description": "User model in wrong directory",
      "file": "src/data/User.ts",
      "action": "Move to src/models/User.ts per architecture"
    },
    {
      "type": "fix",
      "description": "JWT secret hardcoded instead of from environment",
      "file": "src/services/AuthService.ts",
      "action": "Read JWT_SECRET from process.env"
    }
  ]
}
```

## Categorization Guidelines

### Keep If:
- Adds security without changing requirements
- Improves error messages/handling
- Adds input validation
- Optimizes performance without over-engineering
- Improves type safety
- Better follows language/framework best practices

### Remove If:
- Adds business logic not in acceptance criteria
- Implements features not in current story
- Adds UI components not in design
- Over-engineers for hypothetical future needs
- Adds dependencies not required

### Fix If:
- Uses different patterns than architecture specifies
- Files in wrong locations
- Missing required functionality
- Wrong interface implementations
- Incorrect naming conventions
- Integration points don't match plan

## Best Practices

1. **Be thorough**: Check all changed files
2. **Compare to architecture**: Not just requirements
3. **Consider intent**: Some deviations are improvements
4. **Be specific**: Exact file paths and actions
5. **Prioritize**: Fix security issues as "fix" not "keep"
