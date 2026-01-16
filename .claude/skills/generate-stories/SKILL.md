---
name: generate-stories
description: Generate implementation stories from an epic and architecture document. Creates prioritized, dependency-ordered stories with acceptance criteria and implementation hints. Use when breaking down an epic into implementable units of work.
---

# Generate Stories

Break down an epic and architecture document into implementable stories with clear acceptance criteria and implementation hints.

## When to Use

- After creating an epic description and architecture document
- When breaking down a large feature into smaller tasks
- When planning sprint work
- When you need ordered, dependency-aware task breakdown
- When generating stories for a specific milestone (milestone-aware mode)

## Instructions

### Step 1: Review Inputs

Before generating stories, ensure you have:

1. **Epic Description**: Requirements, acceptance criteria, goals
2. **Architecture Document**: File structure, implementation order, patterns
3. **Milestone Context** (optional): If generating for a specific milestone

### Step 1b: Milestone-Aware Mode (Optional)

When generating stories for a specific milestone:

**Use milestone ID prefix for story IDs**:
- Format: `{milestone_id}-STORY-XXX`
- Example: `M1-STORY-001`, `M2-STORY-003`

**Focus only on milestone scope**:
- Only generate stories for the current milestone's goals
- Reference previous milestone work where relevant
- Don't include stories for future milestones

**Adjust story count target**:
- Target 8-15 stories per milestone (instead of 10-12 for full epic)
- Respect natural breakpoints over arbitrary counts

**Example milestone context**:
```json
{
  "id": "M2",
  "title": "Core Services",
  "phase": "core",
  "goals": ["Implement AuthService", "Build data access layer"],
  "architecture_focus": ["src/services/", "src/repositories/"]
}
```

### Step 2: Identify Story Boundaries

Good stories are:
- **Independent**: Can be developed without blocking others (when possible)
- **Negotiable**: Capture essence, not implementation details
- **Valuable**: Deliver user or technical value
- **Estimable**: Clear enough to estimate effort
- **Small**: Completable in 2-4 hours of focused work
- **Testable**: Have clear pass/fail criteria

### Step 3: Order by Dependencies

Create a dependency graph:
1. Stories with NO dependencies come first
2. Stories that depend on #1 come next
3. Continue until all stories are ordered

### Step 4: Add Implementation Hints

For each story, include:
- Files to create
- Files to modify
- Patterns to follow (reference existing code)
- Testing notes

### Step 5: Define Acceptance Criteria

Each story needs specific, testable criteria in Given/When/Then format.

## Output Format

Output a JSON array with this structure:

```json
[
  {
    "id": "STORY-001",
    "title": "Short descriptive title",
    "description": "Detailed description of what to implement",
    "acceptance_criteria": [
      "Given X, when Y, then Z",
      "Given A, when B, then C"
    ],
    "dependencies": [],
    "files_to_create": ["path/to/new-file.ts"],
    "files_to_modify": ["path/to/existing.ts"],
    "complexity": "small",
    "testing_notes": "Specific testing requirements"
  }
]
```

### Field Definitions

| Field | Description |
|-------|-------------|
| `id` | Unique identifier (STORY-001, STORY-002, etc.) |
| `title` | Short, descriptive title (max 60 chars) |
| `description` | Detailed implementation description |
| `acceptance_criteria` | Array of Given/When/Then statements |
| `dependencies` | Array of story IDs this depends on |
| `files_to_create` | New files to create |
| `files_to_modify` | Existing files to modify |
| `complexity` | small (1-2h), medium (2-4h), large (4-8h) |
| `testing_notes` | Specific testing guidance |

## Story Types

Include different story types as needed:

### Feature Stories
User-facing functionality
```json
{
  "id": "STORY-001",
  "title": "Add login form component",
  "description": "Create the login form UI with email/password fields and validation",
  "acceptance_criteria": [
    "Given I am on the login page, when I see the form, then I see email and password fields",
    "Given I enter invalid email, when I blur the field, then I see validation error"
  ],
  "complexity": "small"
}
```

### Technical Stories
Infrastructure or foundation work
```json
{
  "id": "STORY-002",
  "title": "Set up authentication service",
  "description": "Create AuthService with methods for login, logout, and token management",
  "acceptance_criteria": [
    "Given valid credentials, when login is called, then a JWT token is returned",
    "Given invalid credentials, when login is called, then an error is thrown"
  ],
  "complexity": "medium"
}
```

### Test Stories
Dedicated testing tasks
```json
{
  "id": "STORY-003",
  "title": "Add integration tests for auth flow",
  "description": "Create integration tests covering the complete authentication flow",
  "acceptance_criteria": [
    "Given test suite runs, when auth tests execute, then login/logout flow is validated",
    "Given test suite runs, when auth tests execute, then token refresh is validated"
  ],
  "complexity": "medium"
}
```

## Example

**Input**: Epic for "User Authentication" + Architecture Document

**Output**:
```json
[
  {
    "id": "STORY-001",
    "title": "Create User model and types",
    "description": "Define the User mongoose schema and TypeScript interfaces for authentication. Include fields for email, passwordHash, and createdAt.",
    "acceptance_criteria": [
      "Given the User model exists, when a user is created with valid data, then it is saved to the database",
      "Given the User model exists, when creating a user with duplicate email, then a unique constraint error is thrown"
    ],
    "dependencies": [],
    "files_to_create": [
      "src/models/User.ts",
      "src/types/auth.ts"
    ],
    "files_to_modify": [
      "src/types/index.ts"
    ],
    "complexity": "small",
    "testing_notes": "Add unit tests for model validation. Test unique email constraint."
  },
  {
    "id": "STORY-002",
    "title": "Implement AuthService core methods",
    "description": "Create AuthService with hashPassword, verifyPassword, generateToken, and verifyToken methods using bcrypt and jsonwebtoken.",
    "acceptance_criteria": [
      "Given a password, when hashPassword is called, then a bcrypt hash is returned",
      "Given a valid password and hash, when verifyPassword is called, then true is returned",
      "Given a user payload, when generateToken is called, then a valid JWT is returned",
      "Given a valid token, when verifyToken is called, then the payload is returned"
    ],
    "dependencies": ["STORY-001"],
    "files_to_create": [
      "src/services/AuthService.ts"
    ],
    "files_to_modify": [],
    "complexity": "medium",
    "testing_notes": "Unit test each method. Mock bcrypt and jwt for faster tests."
  },
  {
    "id": "STORY-003",
    "title": "Add user registration endpoint",
    "description": "Create POST /api/auth/register endpoint that accepts email/password, validates input, hashes password, creates user, and returns JWT.",
    "acceptance_criteria": [
      "Given valid email and password, when POST /register is called, then user is created and JWT returned",
      "Given invalid email format, when POST /register is called, then 400 error is returned",
      "Given existing email, when POST /register is called, then 409 conflict error is returned"
    ],
    "dependencies": ["STORY-001", "STORY-002"],
    "files_to_create": [
      "src/controllers/AuthController.ts",
      "src/routes/auth.ts"
    ],
    "files_to_modify": [
      "src/routes/index.ts"
    ],
    "complexity": "medium",
    "testing_notes": "Integration test the full flow. Test validation errors."
  },
  {
    "id": "STORY-004",
    "title": "Add user login endpoint",
    "description": "Create POST /api/auth/login endpoint that accepts email/password, validates credentials, and returns JWT on success.",
    "acceptance_criteria": [
      "Given valid credentials, when POST /login is called, then JWT is returned",
      "Given invalid password, when POST /login is called, then 401 error is returned",
      "Given non-existent email, when POST /login is called, then 401 error is returned"
    ],
    "dependencies": ["STORY-002", "STORY-003"],
    "files_to_create": [],
    "files_to_modify": [
      "src/controllers/AuthController.ts",
      "src/routes/auth.ts"
    ],
    "complexity": "small",
    "testing_notes": "Test both success and failure cases. Don't leak whether email exists."
  },
  {
    "id": "STORY-005",
    "title": "Create auth middleware for protected routes",
    "description": "Create middleware that extracts JWT from Authorization header, verifies it, and attaches user to request object.",
    "acceptance_criteria": [
      "Given valid JWT in header, when middleware runs, then request.user is populated",
      "Given missing JWT, when middleware runs, then 401 error is returned",
      "Given expired JWT, when middleware runs, then 401 error is returned"
    ],
    "dependencies": ["STORY-002"],
    "files_to_create": [
      "src/middleware/authMiddleware.ts"
    ],
    "files_to_modify": [],
    "complexity": "small",
    "testing_notes": "Unit test with mocked tokens. Test all error cases."
  }
]
```

## Best Practices

1. **Keep stories small**: If complexity is "large", consider splitting
2. **Minimize dependencies**: More independent stories = more parallelization
3. **Be specific about files**: Exact paths, not vague references
4. **Include testing notes**: Each story should mention testing approach
5. **Story count guidelines**:
   - Full epic mode: Maximum 10-12 stories (if more, consider milestones)
   - Milestone mode: Target 8-15 stories per milestone
6. **Order matters**: Dependencies determine implementation sequence
7. **Milestone boundaries**: Never split tightly coupled stories across milestones
8. **Use milestone prefixes**: When in milestone mode, use `{milestone_id}-STORY-XXX` format

## Milestone Integration

When used with milestones, this skill is called once per milestone:

1. `/generate-milestones` creates milestone definitions
2. For each milestone:
   - **`/generate-stories`** generates 8-15 stories (THIS SKILL)
   - Stories are implemented
   - Drift check and architecture update
3. Next milestone uses updated architecture

**Milestone story ID format**: `M1-STORY-001`, `M2-STORY-001`, etc.

This ensures stories from different milestones are clearly distinguishable.
