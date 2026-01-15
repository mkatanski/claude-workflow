---
name: fix-tests
description: Analyze failing tests and fix the issues. Identifies root causes in implementation or test code and applies fixes. Use when tests are failing after implementation or code changes.
---

# Fix Tests

Analyze test failures, identify root causes, and fix the issues.

## When to Use

- When tests are failing after implementation
- When CI/CD pipeline reports test failures
- When debugging test issues
- After code changes break existing tests

## IMPORTANT: Always Use /plan First

Before making any code changes, you MUST use the `/plan` tool to analyze failures and plan fixes.

## Instructions

### Step 1: Analyze Test Output (Read-Only)

Read the test output carefully:

1. **Identify which tests failed**: Note the test file and test name
2. **Read the error message**: What does the assertion say?
3. **Check the stack trace**: Where exactly did it fail?
4. **Look for patterns**: Are multiple tests failing for the same reason?

### Step 2: Determine Root Cause (Read-Only)

The issue could be in:

#### Implementation Code
- Logic error in the implementation
- Missing functionality
- Incorrect return values
- Unhandled edge cases

#### Test Code
- Incorrect test assertions
- Wrong expected values
- Missing test setup/teardown
- Flaky test (timing issues)

#### Configuration/Environment
- Missing dependencies
- Incorrect environment variables
- Database/file system issues
- Mock configuration problems

### Step 3: Create Plan with /plan

Use `/plan` to create your fix plan. The plan should include:

1. **Root cause analysis** for each failing test
2. **Specific fixes** to apply (which files, what changes)
3. **Order of fixes** (if multiple)
4. **Verification steps**

### Step 4: Apply Fixes (After Plan Approval)

Based on approved plan:

#### If Implementation is Wrong
1. Read the test to understand expected behavior
2. Fix the implementation to match expected behavior
3. Ensure fix doesn't break other tests

#### If Test is Wrong
1. Verify the implementation is correct
2. Update test expectations if needed
3. Fix test setup/mocking issues

#### If Both Need Fixes
1. Fix implementation first
2. Then fix tests to match

### Step 5: Verify Fixes

After applying fixes:

1. Run the failing tests again
2. Run the full test suite
3. Ensure no regressions

## Important Rules

1. **Never disable tests** to make them pass
2. **Never skip tests** without fixing them
3. **Fix the root cause**, not symptoms
4. **Run lint** after making changes
5. **Document** significant fixes

## Output Format

After fixing tests, provide a summary:

```markdown
## Test Fix Summary

### Failing Tests Analyzed
- `test/path/file.test.ts`: TestName1, TestName2

### Root Causes Identified

#### Test 1: [Test Name]
- **Error**: [Error message]
- **Root Cause**: [Implementation/Test/Config]
- **Analysis**: [What was wrong]
- **Fix Applied**: [What was changed]

#### Test 2: [Test Name]
- **Error**: [Error message]
- **Root Cause**: [Implementation/Test/Config]
- **Analysis**: [What was wrong]
- **Fix Applied**: [What was changed]

### Files Modified
- `path/to/file.ts`: [Description of changes]

### Verification
- [x] Fixed tests now pass
- [x] Other tests still pass
- [x] Lint passes
```

## Common Test Failure Patterns

### Assertion Failures
```
Expected: "hello"
Received: "Hello"
```
- Check case sensitivity
- Check exact string matching
- Verify expected value is correct

### Type Errors
```
TypeError: Cannot read property 'x' of undefined
```
- Check null/undefined handling
- Verify mock setup returns correct structure
- Check optional chaining usage

### Async Issues
```
Timeout - Async callback was not invoked within timeout
```
- Check Promise handling
- Verify async/await usage
- Check mock async functions

### Mock Issues
```
Expected mock function to have been called
```
- Verify mock is set up before test runs
- Check mock is imported correctly
- Verify function being tested uses the mock

## Example Fix

**Test Output**:
```
FAIL tests/unit/services/AuthService.test.ts
  AuthService
    verifyPassword
      ✕ should return true for correct password (5ms)

  ● AuthService › verifyPassword › should return true for correct password

    expect(received).toBe(expected)

    Expected: true
    Received: false

      12 |     it('should return true for correct password', async () => {
      13 |       const hash = await service.hashPassword('password123');
    > 14 |       const result = await service.verifyPassword('password123', hash);
      15 |       expect(result).toBe(true);
      16 |     });
```

**Analysis**:
1. Test expects `verifyPassword` to return `true` for correct password
2. But it returns `false`
3. Read `AuthService.verifyPassword` implementation
4. Found: password and hash parameters were swapped in bcrypt.compare call

**Fix Applied**:
```typescript
// Before (incorrect)
async verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(hash, password); // Wrong order!
}

// After (correct)
async verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash); // Correct order
}
```

**Summary**:
```markdown
## Test Fix Summary

### Failing Tests Analyzed
- `tests/unit/services/AuthService.test.ts`: verifyPassword tests

### Root Causes Identified

#### Test: should return true for correct password
- **Error**: Expected true, Received false
- **Root Cause**: Implementation
- **Analysis**: bcrypt.compare was called with arguments in wrong order
- **Fix Applied**: Swapped password and hash arguments in verifyPassword method

### Files Modified
- `src/services/AuthService.ts`: Fixed verifyPassword argument order

### Verification
- [x] Fixed tests now pass
- [x] Other tests still pass
- [x] Lint passes
```

## Best Practices

1. **Read carefully**: Don't assume you know the cause
2. **Check both sides**: Could be implementation OR test
3. **One fix at a time**: Don't make multiple changes at once
4. **Run full suite**: Ensure no regressions
5. **Document fixes**: Help future debugging
