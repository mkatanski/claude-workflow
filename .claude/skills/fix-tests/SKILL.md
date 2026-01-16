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

## Common Test Failure Patterns

### Assertion Failures

**TypeScript/JavaScript (Jest/Vitest):**
```
Expected: "hello"
Received: "Hello"
```

**Python (pytest):**
```
AssertionError: assert 'Hello' == 'hello'
```

**Rust (cargo test):**
```
assertion failed: `(left == right)`
  left: `"hello"`,
 right: `"Hello"`
```

**Go (go test):**
```
got: Hello
want: hello
```

**Fix approach:** Check case sensitivity, exact string matching, verify expected value is correct.

### Type Errors

**TypeScript:**
```
TypeError: Cannot read property 'x' of undefined
```

**Python:**
```
TypeError: 'NoneType' object is not subscriptable
```

**Rust:**
```
error[E0599]: no method named `x` found for type `Option<T>`
```

**Go:**
```
panic: runtime error: invalid memory address or nil pointer dereference
```

**Fix approach:** Check null/undefined handling, verify mock setup returns correct structure, check optional chaining.

### Async Issues

**TypeScript:**
```
Timeout - Async callback was not invoked within timeout
```

**Python:**
```
RuntimeWarning: coroutine 'test_async' was never awaited
```

**Rust:**
```
thread 'main' panicked at 'cannot block in async context'
```

**Go:**
```
fatal error: all goroutines are asleep - deadlock!
```

**Fix approach:** Check Promise/async handling, verify async/await usage, check mock async functions.

### Mock Issues

**TypeScript (Jest):**
```
Expected mock function to have been called
```

**Python (pytest-mock):**
```
AssertionError: Expected call: mock()
Not called
```

**Go (gomock):**
```
missing call(s) to *MockService.DoThing()
```

**Fix approach:** Verify mock is set up before test runs, check mock is imported correctly, verify function being tested uses the mock.

## Language-Specific Examples

### TypeScript Example

**Test Output:**
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

**Fix:**
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

### Python Example

**Test Output:**
```
FAILED tests/test_auth.py::test_verify_password - AssertionError
E       assert False == True
E        +  where False = <AuthService>.verify_password('password123', '$2b$12$...')
```

**Fix:**
```python
# Before (incorrect)
def verify_password(self, password: str, hash: str) -> bool:
    return bcrypt.checkpw(hash.encode(), password.encode())  # Wrong order!

# After (correct)
def verify_password(self, password: str, hash: str) -> bool:
    return bcrypt.checkpw(password.encode(), hash.encode())  # Correct order
```

### Rust Example

**Test Output:**
```
---- auth::tests::test_verify_password stdout ----
thread 'auth::tests::test_verify_password' panicked at 'assertion failed: result'
```

**Fix:**
```rust
// Before (incorrect)
pub fn verify_password(password: &str, hash: &str) -> bool {
    bcrypt::verify(hash, password).unwrap_or(false)  // Wrong order!
}

// After (correct)
pub fn verify_password(password: &str, hash: &str) -> bool {
    bcrypt::verify(password, hash).unwrap_or(false)  // Correct order
}
```

### Go Example

**Test Output:**
```
--- FAIL: TestVerifyPassword (0.00s)
    auth_test.go:25: VerifyPassword() = false, want true
```

**Fix:**
```go
// Before (incorrect)
func VerifyPassword(password, hash string) bool {
    err := bcrypt.CompareHashAndPassword([]byte(password), []byte(hash)) // Wrong order!
    return err == nil
}

// After (correct)
func VerifyPassword(password, hash string) bool {
    err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) // Correct order
    return err == nil
}
```

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

### Files Modified
- `path/to/file.ts`: [Description of changes]

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
