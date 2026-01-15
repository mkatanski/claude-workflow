---
name: code-review
description: Perform a thorough code review of recent changes. Checks correctness, code quality, patterns, error handling, security, and test coverage. Automatically fixes any issues found. Use after implementing code changes or when reviewing a story implementation.
---

# Code Review

Perform a comprehensive code review and automatically fix any issues found.

## When to Use

- After implementing a story or feature
- When reviewing code changes before commit
- When checking code quality and patterns
- Before running tests to catch obvious issues

## Instructions

### Review Checklist

Perform a thorough review covering these areas:

#### 1. Correctness
- Does the code work as intended?
- Are all acceptance criteria met?
- Are there any logic errors?
- Are edge cases handled?

#### 2. Code Quality
- Is the code readable and maintainable?
- Are variable/function names clear and descriptive?
- Is there unnecessary complexity?
- Is there code duplication that should be refactored?

#### 3. Patterns & Conventions
- Does it follow existing codebase patterns?
- Are naming conventions followed?
- Is the code organization consistent with the project?
- Are imports organized correctly?

#### 4. Error Handling
- Are errors properly caught and handled?
- Are error messages helpful?
- Are edge cases and boundary conditions handled?
- Is there proper input validation?

#### 5. Security
- Is user input validated and sanitized?
- Are there any injection vulnerabilities (SQL, XSS, etc.)?
- Are sensitive data handled properly?
- Are authentication/authorization checks in place?

#### 6. Tests
- Are there adequate tests?
- Do tests cover happy path and error cases?
- Are tests readable and maintainable?
- Do tests follow project patterns?

### Important: Fix Issues Immediately

When you find issues during review:

1. **DO NOT just report issues** - fix them
2. Make the necessary code changes
3. Document what was found and fixed
4. Verify the fix doesn't break other functionality

### Review Process

1. **Read the changes**: Understand what was modified
2. **Check against criteria**: Verify acceptance criteria are met
3. **Examine code quality**: Look for issues in the checklist
4. **Fix any issues**: Make corrections immediately
5. **Verify fixes**: Ensure fixes don't introduce new problems
6. **Document findings**: Summarize review results

## Output Format

After review, provide a summary:

```markdown
## Code Review Summary

### Changes Reviewed
- [File 1]: [Brief description]
- [File 2]: [Brief description]

### Issues Found and Fixed

#### Critical Issues
- [Issue]: [Description and fix applied]

#### Major Issues
- [Issue]: [Description and fix applied]

#### Minor Issues
- [Issue]: [Description and fix applied]

### No Issues Found In
- Error handling: [Verified correct]
- Security: [No vulnerabilities found]

### Acceptance Criteria Check
- [x] Criterion 1: Met
- [x] Criterion 2: Met

### Final Assessment
[ready / needs additional work]

### Recommendations
- [Any suggestions for future improvement]
```

## Issue Categories

### Critical Issues (must fix)
- Security vulnerabilities
- Data loss risks
- Breaking functionality
- Logic errors affecting core behavior

### Major Issues (should fix)
- Missing error handling
- Performance problems
- Missing tests for critical paths
- Incorrect patterns

### Minor Issues (nice to fix)
- Style inconsistencies
- Naming improvements
- Documentation gaps
- Minor optimizations

## Example Review

**Changes Reviewed**: AuthService implementation

```markdown
## Code Review Summary

### Changes Reviewed
- `src/services/AuthService.ts`: Password hashing and JWT methods
- `tests/unit/services/AuthService.test.ts`: Unit tests

### Issues Found and Fixed

#### Critical Issues
None found.

#### Major Issues
1. **Missing token expiry validation**: verifyToken didn't handle expired tokens gracefully
   - **Fix**: Added try-catch to handle TokenExpiredError and return null

2. **Hardcoded secret in development**: JWT_SECRET fallback was too simple
   - **Fix**: Changed to require JWT_SECRET in production environment

#### Minor Issues
1. **Inconsistent error messages**: Some errors used generic messages
   - **Fix**: Updated to use consistent, descriptive error messages

2. **Missing JSDoc comments**: Public methods lacked documentation
   - **Fix**: Added JSDoc comments to all public methods

### No Issues Found In
- Error handling: Now properly handles all error cases
- Security: Password hashing uses appropriate salt rounds
- Test coverage: All methods have unit tests

### Acceptance Criteria Check
- [x] Given a password, when hashPassword is called, then a bcrypt hash is returned
- [x] Given valid credentials, when verifyPassword is called, then true is returned

### Final Assessment
**Ready** - All issues have been addressed

### Recommendations
- Consider adding rate limiting for token generation in production
- Add integration tests for the full auth flow
```

## Best Practices

1. **Be thorough**: Check all areas of the checklist
2. **Fix, don't just report**: Make the corrections yourself
3. **Prioritize correctly**: Critical issues first
4. **Consider context**: Some issues may be acceptable given constraints
5. **Document everything**: Clear record of what was found and fixed
6. **Verify fixes**: Ensure fixes don't break other things
