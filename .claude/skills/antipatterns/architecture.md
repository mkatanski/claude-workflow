# Architecture Antipatterns

Patterns to avoid in code structure and design.

---

## Avoid circular imports
**Don't:** Module A imports from B, and B imports from A
**Do:** Extract shared code to a third module, or use dependency injection
**Why:** Circular imports cause ImportError at runtime and indicate poor design
**Source:** Python architecture

## Don't mix concerns in single module
**Don't:** File that handles parsing, validation, storage, and formatting
**Do:** Separate into focused modules (parser.py, validator.py, storage.py)
**Why:** Single responsibility makes code testable and maintainable
**Source:** SOLID principles

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
