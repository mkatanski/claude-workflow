---
name: implement-story
description: Implement a single story following architectural guidelines. Includes planning, coding, and test writing phases. Use when working on a specific story from a stories list, implementing a focused piece of functionality.
---

# Implement Story

Implement a single story following the architecture document and project conventions.

## When to Use

- When implementing a specific story from the stories list
- When you have story details and architectural context
- When focused implementation work is needed

## IMPORTANT: Always Use /plan First

Before making any code changes, you MUST use the `/plan` tool to create an implementation plan and get it approved.

## Instructions

### Step 1: Analysis (Read-Only)

Before planning, gather context:

1. **Read the story details**:
   - What are the acceptance criteria?
   - What files need to be created/modified?
   - What are the dependencies?

2. **Read existing code**:
   - Read files mentioned in `files_to_modify`
   - Look at similar implementations for patterns
   - Understand the testing approach

3. **Understand the context**:
   - Review the architecture document
   - Check how this story fits with others
   - Note any constraints or requirements

### Step 2: Create Plan with /plan

Use `/plan` to create your implementation plan. The plan should include:

1. **Files to create** (in order):
   - Types/interfaces first
   - Core implementation next
   - Integration/exports last

2. **Files to modify**:
   - What specific changes in each file
   - Why each change is needed

3. **Test cases to write**:
   - Happy path tests
   - Error cases
   - Edge cases

4. **Potential risks**:
   - What could go wrong
   - How to mitigate

### Step 3: Execute Plan (After Approval)

Once the plan is approved, implement:

1. **Create new files**:
   - Follow existing naming conventions
   - Use similar files as templates
   - Include proper imports and exports

2. **Modify existing files**:
   - Make minimal, focused changes
   - Don't refactor unrelated code
   - Maintain existing style

3. **Follow patterns**:
   - Use the same patterns as existing code
   - Don't introduce new patterns without reason
   - Match indentation, naming, structure

4. **Handle errors**:
   - Add appropriate error handling
   - Don't swallow errors silently
   - Use typed errors when available

### Step 4: Write Tests

Write tests for the implementation:

1. **Unit tests**:
   - Test each function/method
   - Mock dependencies
   - Cover edge cases

2. **Follow test patterns**:
   - Use project's test framework
   - Match existing test structure
   - Use descriptive test names

### Step 5: Verification

Before completing:

1. **Check acceptance criteria**:
   - Does implementation satisfy each criterion?
   - Are there any gaps?

2. **Run linter**:
   - Fix any linting issues
   - Don't disable rules

3. **Run tests**:
   - Ensure new tests pass
   - Ensure existing tests still pass

## Output Summary

After implementation, provide a summary:

```markdown
## Implementation Summary

### Files Created
- `path/to/new-file.ts`: [Description]

### Files Modified
- `path/to/existing.ts`: [Description of changes]

### Tests Added
- `path/to/test.ts`: [What it tests]

### Acceptance Criteria Status
- [x] Criterion 1: [How it's satisfied]
- [x] Criterion 2: [How it's satisfied]

### Notes
- [Any concerns, TODOs, or follow-ups]
```

## Example

**Story Input**:
```json
{
  "id": "STORY-002",
  "title": "Implement AuthService core methods",
  "description": "Create AuthService with hashPassword, verifyPassword, generateToken, and verifyToken methods",
  "acceptance_criteria": [
    "Given a password, when hashPassword is called, then a bcrypt hash is returned",
    "Given valid credentials, when verifyPassword is called, then true is returned"
  ],
  "files_to_create": ["src/services/AuthService.ts"],
  "files_to_modify": []
}
```

**Implementation**:

```typescript
// src/services/AuthService.ts
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { User, AuthTokenPayload } from '../types';

const SALT_ROUNDS = 10;
const JWT_SECRET = process.env.JWT_SECRET || 'development-secret';
const TOKEN_EXPIRY = '24h';

export class AuthService {
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  generateToken(user: User): string {
    const payload: AuthTokenPayload = {
      userId: user.id,
      email: user.email,
    };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
  }

  verifyToken(token: string): AuthTokenPayload {
    return jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
  }
}

export const authService = new AuthService();
```

**Tests**:
```typescript
// tests/unit/services/AuthService.test.ts
import { AuthService } from '../../../src/services/AuthService';

describe('AuthService', () => {
  const service = new AuthService();

  describe('hashPassword', () => {
    it('should return a bcrypt hash', async () => {
      const hash = await service.hashPassword('password123');
      expect(hash).toMatch(/^\$2[ab]\$/);
    });

    it('should produce different hashes for same password', async () => {
      const hash1 = await service.hashPassword('password123');
      const hash2 = await service.hashPassword('password123');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifyPassword', () => {
    it('should return true for correct password', async () => {
      const hash = await service.hashPassword('password123');
      const result = await service.verifyPassword('password123', hash);
      expect(result).toBe(true);
    });

    it('should return false for incorrect password', async () => {
      const hash = await service.hashPassword('password123');
      const result = await service.verifyPassword('wrongpassword', hash);
      expect(result).toBe(false);
    });
  });
});
```

**Summary**:
```markdown
## Implementation Summary

### Files Created
- `src/services/AuthService.ts`: AuthService class with password hashing and JWT methods

### Files Modified
- None

### Tests Added
- `tests/unit/services/AuthService.test.ts`: Unit tests for hashPassword, verifyPassword, generateToken, verifyToken

### Acceptance Criteria Status
- [x] Given a password, when hashPassword is called, then a bcrypt hash is returned
- [x] Given valid credentials, when verifyPassword is called, then true is returned

### Notes
- JWT_SECRET should be set in environment variables for production
- Consider adding token refresh functionality in a future story
```

## Best Practices

1. **Read before write**: Always understand existing code first
2. **Follow patterns**: Don't introduce new patterns unnecessarily
3. **Test as you go**: Write tests alongside implementation
4. **Keep it focused**: Only implement what the story requires
5. **Document decisions**: Note any deviations or concerns
