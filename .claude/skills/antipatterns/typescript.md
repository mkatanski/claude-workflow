# TypeScript Antipatterns

Patterns to avoid when writing TypeScript code.

---

## Never use `any` type
**Don't:** `function process(data: any): any`
**Do:** Use specific types, generics, or `unknown` as last resort
**Why:** `any` defeats TypeScript's type safety and hides bugs
**Source:** Project CLAUDE.md

## No logic in index.ts files
**Don't:** Put business logic, classes, or functions in `index.ts`
**Do:** Use `index.ts` only for re-exports from module files
**Why:** Project convention - keeps modules clean and imports predictable
**Source:** Project CLAUDE.md

## Never disable ESLint rules
**Don't:** `// eslint-disable-next-line` or `/* eslint-disable */`
**Do:** Fix the underlying issue, adjust types, or refactor
**Why:** Project rule - disabling masks real problems that will cause issues later
**Source:** Project CLAUDE.md

## Avoid type assertions without validation
**Don't:** `const user = data as User;`
**Do:** Use type guards or runtime validation: `if (isUser(data)) { ... }`
**Why:** Type assertions bypass type checking and can hide runtime errors
**Source:** TypeScript best practice

## Use strict null checks
**Don't:** `user.name.toUpperCase()` without null check
**Do:** `user?.name?.toUpperCase()` or explicit null handling
**Why:** Null/undefined errors are common runtime failures
**Source:** TypeScript strict mode

## Prefer `interface` over `type` for objects
**Don't:** `type User = { name: string; }`
**Do:** `interface User { name: string; }`
**Why:** Interfaces have better error messages and can be extended
**Source:** TypeScript convention

## Don't use `!` (non-null assertion) carelessly
**Don't:** `const name = user!.name!.trim();`
**Do:** Use proper null checks or provide defaults
**Why:** Non-null assertions hide potential null errors
**Source:** TypeScript safety

## Avoid enum for simple values
**Don't:** `enum Status { Active, Inactive }`
**Do:** `const STATUS = { Active: 'active', Inactive: 'inactive' } as const;`
**Why:** Const objects are more flexible and produce smaller bundles
**Source:** TypeScript best practice

## Use proper async/await error handling
**Don't:**
```typescript
async function fetch() {
  const data = await api.get();
  return data;
}
```
**Do:**
```typescript
async function fetch() {
  try {
    const data = await api.get();
    return data;
  } catch (error) {
    throw new Error(`Failed to fetch: ${error}`);
  }
}
```
**Why:** Unhandled promise rejections crash applications
**Source:** Error handling best practice

## Don't mix callback and promise styles
**Don't:** Function that sometimes returns Promise, sometimes uses callback
**Do:** Pick one pattern (prefer async/await) and use it consistently
**Why:** Mixed patterns cause confusion and bugs
**Source:** JavaScript/TypeScript consistency
