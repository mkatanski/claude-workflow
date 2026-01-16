# Testing Antipatterns

Patterns to avoid when writing tests. Framework-agnostic advice that applies to any testing framework.

---

## Don't use bare asserts without messages
**Don't:** `expect(result).toBe(expected)` or `assert result == expected`
**Do:** Include context: `expect(result).toBe(expected)` with descriptive test name, or `assert result == expected, f"Expected {expected}, got {result}"`
**Why:** Clear assertion context makes debugging faster when tests fail
**Source:** Testing best practice

## Avoid test interdependence
**Don't:** Tests that depend on execution order or state from other tests
**Do:** Each test should set up its own state and clean up after itself
**Why:** Tests should be runnable in isolation and in any order
**Source:** Testing fundamentals

## Don't mock what you don't own
**Don't:** Mock third-party library internals directly
**Do:** Create wrapper/adapter and mock that, or use integration tests
**Why:** Internal APIs change without notice, breaking your mocks
**Source:** Testing best practice

## Use fixtures/setup for repeated setup
**Don't:** Duplicate setup code in multiple test functions
**Do:** Use test framework's setup features (beforeEach, fixtures, setUp)
**Why:** DRY principle, easier maintenance, clearer test intent
**Source:** Testing convention

## Never skip tests to make CI pass
**Don't:** Add `.skip()`, `@skip`, or `pytest.mark.skip` to make failures go away
**Do:** Fix the underlying issue or remove obsolete tests
**Why:** Skipped tests rot and provide false confidence
**Source:** CI best practice

## Avoid testing implementation details
**Don't:** Test internal method calls, private state, or execution order
**Do:** Test public interfaces, inputs/outputs, observable behavior
**Why:** Implementation changes shouldn't break tests; behavior changes should
**Source:** Test design principles

## Don't use sleeps for async testing
**Don't:** `setTimeout(..., 1000)` or `time.sleep(1)` to wait for async
**Do:** Use proper async utilities: `waitFor`, `eventually`, `await`
**Why:** Sleeps are flaky and slow; they either wait too long or not enough
**Source:** Async testing patterns

## Write descriptive test names
**Don't:** `test1()`, `testFunction()`, `it("works")`
**Do:** `shouldReturnTrueWhenInputIsValid()`, `it("returns user when ID exists")`
**Why:** Test names document expected behavior and help debug failures
**Source:** Testing convention

## Test one thing per test
**Don't:** Single test that verifies 5 different behaviors
**Do:** Multiple focused tests, each verifying one specific behavior
**Why:** When tests fail, you know exactly what broke
**Source:** Test design principles

## Don't assert on implementation timing
**Don't:** `expect(callCount).toBe(3)` (exact call count)
**Do:** `expect(wasCalledWith(args)).toBe(true)` or `expect(callCount).toBeGreaterThan(0)`
**Why:** Implementation may change how many times something is called
**Source:** Test robustness
