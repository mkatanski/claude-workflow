# Testing Antipatterns

Patterns to avoid when writing tests with pytest.

---

## Don't use bare asserts without messages
**Don't:** `assert result == expected`
**Do:** `assert result == expected, f"Expected {expected}, got {result}"`
**Why:** Clear assertion messages make debugging faster when tests fail
**Source:** pytest best practice

## Avoid test interdependence
**Don't:** Tests that depend on execution order or state from other tests
**Do:** Each test should set up its own state and clean up after itself
**Why:** Tests should be runnable in isolation and in any order
**Source:** Testing fundamentals

## Don't mock what you don't own
**Don't:** Mock third-party library internals
**Do:** Create wrapper/adapter and mock that, or use integration tests
**Why:** Internal APIs change without notice, breaking your mocks
**Source:** Testing best practice

## Use fixtures for repeated setup
**Don't:** Duplicate setup code in multiple test functions
**Do:** Create pytest fixtures for shared setup
**Why:** DRY principle, easier maintenance, clearer test intent
**Source:** pytest convention
