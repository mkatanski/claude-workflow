# Lint Antipatterns

Patterns to avoid when dealing with linting and type checking. Tool-agnostic advice.

---

## Never disable linting rules
**Don't:** `// eslint-disable`, `# noqa`, `#[allow(clippy::...)]`, `// nolint`
**Do:** Fix the underlying issue or adjust types properly
**Why:** Project rule - disabling masks real problems that will cause issues later
**Source:** Project CLAUDE.md

## Don't ignore type errors by widening types
**Don't:** Change `string` to `string | any` or add `| unknown` just to silence type checker
**Do:** Understand why the type error occurs and fix the root cause
**Why:** Widening types defeats the purpose of type checking
**Source:** Type safety principle

## Avoid inconsistent formatting
**Don't:** Mix different formatting styles (quotes, indentation, spacing)
**Do:** Follow project formatter conventions consistently, let tooling handle formatting
**Why:** Consistency aids readability and reduces diff noise
**Source:** Code style

## Don't suppress warnings in CI
**Don't:** Configure CI to ignore warnings or lower strictness
**Do:** Fix all warnings or explicitly document why they're acceptable
**Why:** Warnings often indicate real issues that become bugs
**Source:** CI best practice

## Fix root cause, not symptom
**Don't:** Cast to `any`/`unknown` or add type assertion to silence error
**Do:** Understand the type mismatch and fix the actual code
**Why:** Type errors reveal real bugs that will manifest at runtime
**Source:** Type safety

## Don't add unused exports to fix import errors
**Don't:** Export unused symbols just to make import statements work
**Do:** Only export what's actually needed; fix the import chain properly
**Why:** Unused exports add confusion and maintenance burden
**Source:** Module design

## Avoid import order hacks
**Don't:** Add blank lines or comments to trick import sorters
**Do:** Configure import sorting properly or fix actual import issues
**Why:** Import hacks are fragile and confusing
**Source:** Code cleanliness

## Don't use raw string for types
**Don't:** `const status: "active" | "pending"` when enum/type exists
**Do:** Use existing type definitions: `const status: Status`
**Why:** Centralized types prevent drift and typos
**Source:** Type reuse

## Address deprecation warnings
**Don't:** Ignore deprecation warnings in dependencies or code
**Do:** Plan migration to non-deprecated alternatives
**Why:** Deprecated features will eventually break
**Source:** Maintenance best practice
