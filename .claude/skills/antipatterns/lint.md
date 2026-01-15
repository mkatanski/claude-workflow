# Lint Antipatterns

Patterns to avoid when dealing with linting and type checking.

---

## Never disable linting rules
**Don't:** `# noqa`, `# type: ignore`, `# pylint: disable`
**Do:** Fix the underlying issue or adjust types properly
**Why:** Project rule - disabling masks real problems that will bite later
**Source:** Project CLAUDE.md

## Don't ignore type errors by widening types
**Don't:** Change `str` to `str | Any` just to silence mypy
**Do:** Understand why the type error occurs and fix the root cause
**Why:** Widening types defeats the purpose of type checking
**Source:** Type safety principle

## Avoid inconsistent string quotes
**Don't:** Mix `'single'` and `"double"` quotes arbitrarily
**Do:** Follow project formatter (ruff) conventions consistently
**Why:** Consistency aids readability and reduces diff noise
**Source:** Code style

## Don't suppress warnings in CI
**Don't:** Configure CI to ignore warnings or lower strictness
**Do:** Fix all warnings or explicitly document why they're acceptable
**Why:** Warnings often indicate real issues that become bugs
**Source:** CI best practice
