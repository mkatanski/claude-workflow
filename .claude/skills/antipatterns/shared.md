# Shared Antipatterns

Language-agnostic patterns to avoid. These apply to all projects regardless of language.

---

## No logic in entry point files
**Don't:** Put business logic, classes, or functions in `index.ts`, `index.js`, `__init__.py`, `mod.rs`, or `lib.go`
**Do:** Use entry point files only for re-exports from module files
**Why:** Keeps modules clean, imports predictable, and prevents circular dependencies
**Source:** Project convention

## Avoid circular imports
**Don't:** Module A imports from B, and B imports from A
**Do:** Extract shared code to a third module, or use dependency injection
**Why:** Circular imports cause errors at runtime and indicate poor design
**Source:** Architecture fundamentals

## Don't mix concerns in single module
**Don't:** File that handles parsing, validation, storage, and formatting
**Do:** Separate into focused modules (parser, validator, storage)
**Why:** Single responsibility makes code testable and maintainable
**Source:** SOLID principles

## Prefer composition over inheritance
**Don't:** Deep inheritance hierarchies (3+ levels)
**Do:** Use composition, interfaces, or mixins for shared behavior
**Why:** Inheritance creates tight coupling; composition is more flexible
**Source:** Design patterns

## Don't swallow errors
**Don't:** `try { ... } catch { }` or `except: pass` with no handling
**Do:** Log errors, re-throw, or handle appropriately
**Why:** Silent failures hide bugs and make debugging impossible
**Source:** Error handling best practice

## Avoid deep nesting
**Don't:** Functions with 4+ levels of indentation
**Do:** Extract inner logic to helper functions, use early returns
**Why:** Deep nesting hurts readability and indicates complex logic
**Source:** Clean code principles

## Don't hardcode configuration
**Don't:** `timeout = 30` scattered throughout code
**Do:** Use configuration files, environment variables, or constants module
**Why:** Hardcoded values are hard to find and change
**Source:** 12-factor app methodology

## Avoid magic numbers
**Don't:** `if (status === 3)` or `slice(0, 50)`
**Do:** Use named constants: `if (status === STATUS_PENDING)` or `slice(0, MAX_PREVIEW_LENGTH)`
**Why:** Magic numbers obscure intent and are hard to update consistently
**Source:** Code readability

## Don't commit commented-out code
**Don't:** Leave large blocks of commented code in the codebase
**Do:** Delete unused code; use version control to retrieve it if needed
**Why:** Commented code creates confusion about what's active
**Source:** Clean code principles

## Avoid backwards-compatibility hacks
**Don't:** Rename unused variables to `_var`, add `// removed` comments, re-export removed types
**Do:** If something is unused, delete it completely
**Why:** Hacks add noise without value; version control provides history
**Source:** Code cleanliness
