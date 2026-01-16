# Checklist Tool

The `checklist` tool runs validation checks in workflows. It supports three check types that all run in parallel for faster execution:

- **bash** - Run shell commands and compare output
- **regex** - Pattern matching in files using ripgrep
- **model** - LLM-based validation using Claude Haiku

## Overview

The checklist tool enables workflows to:

1. Validate code quality and standards
2. Check for required patterns or forbidden content
3. Run automated checks before deployment
4. Use AI to evaluate complex criteria

## Basic Usage

```typescript
import { createBuilder, WorkflowDefinition } from "claude-workflow";

export default function (t: ReturnType<typeof createBuilder>): WorkflowDefinition {
  return {
    name: "Validation Example",
    steps: [
      t.step("Run checks", t.checklist([
        {
          name: "Tests pass",
          type: "bash",
          command: "npm test"
        },
        {
          name: "No TODO comments",
          type: "regex",
          pattern: "TODO",
          files: "**/*.ts",
          expect: 0
        }
      ]))
    ]
  };
}
```

## API Reference

### `t.checklist(items)`

Creates a checklist tool definition.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `items` | ChecklistItem[] | Yes | Array of check definitions |

### Step Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `onFail` | string | `"warn"` | Failure mode: `stop`, `warn`, or `continue` |
| `output` | string | - | Variable to store results |
| `when` | string | - | Conditional execution |

### onFail Modes

| Mode | Behavior |
|------|----------|
| `stop` | Fail workflow if any check fails (error or warning) |
| `warn` | Fail workflow only on errors, warnings are reported |
| `continue` | Always continue, all failures are just reported |

## Check Types

### bash

Run shell commands and validate output.

```typescript
{
  name: "Check name",
  type: "bash",
  command: "npm test",           // Required: Command to run
  expect: "expected output",     // Optional: Exact match
  expectNot: "forbidden",        // Optional: Must not contain
  expectRegex: "^PASS",          // Optional: Regex match
  severity: "error"              // Optional: error/warning/info
}
```

**Validation Rules:**

- `expect`: Output must exactly match this string
- `expectNot`: Output must NOT contain this string
- `expectRegex`: Output must match this regex pattern
- If none specified: Command must exit with code 0

**Examples:**

```typescript
// Check exit code only
{
  name: "Build succeeds",
  type: "bash",
  command: "npm run build",
  severity: "error"
}

// Check exact output
{
  name: "Node version",
  type: "bash",
  command: "node --version",
  expect: "v20.0.0"
}

// Check output doesn't contain error
{
  name: "No errors in log",
  type: "bash",
  command: "cat app.log",
  expectNot: "ERROR"
}

// Check output matches pattern
{
  name: "Tests pass",
  type: "bash",
  command: "npm test 2>&1",
  expectRegex: "\\d+ passing"
}
```

### regex

Search for patterns in files using ripgrep.

```typescript
{
  name: "Check name",
  type: "regex",
  pattern: "console\\.log",      // Required: Regex pattern
  files: "**/*.ts",              // Optional: File glob (default: **/*.ts)
  exclude: "node_modules,dist",  // Optional: Exclude patterns
  expect: 0,                     // Optional: Expected match count
  severity: "warning"            // Optional: error/warning/info
}
```

**Note:** Requires `ripgrep` (`rg`) to be installed.

**Examples:**

```typescript
// Ensure no console.log statements
{
  name: "No console.log",
  type: "regex",
  pattern: "console\\.log",
  files: "src/**/*.ts",
  exclude: "*.test.ts,*.spec.ts",
  expect: 0,
  severity: "warning"
}

// Ensure copyright headers exist
{
  name: "Has copyright",
  type: "regex",
  pattern: "Copyright \\d{4}",
  files: "src/**/*.ts",
  expect: 10  // Expect at least 10 files with copyright
}

// Check for deprecated API usage
{
  name: "No deprecated API",
  type: "regex",
  pattern: "oldApiMethod",
  files: "**/*.{ts,tsx}",
  expect: 0,
  severity: "error"
}
```

### model

Use Claude Haiku for AI-powered validation.

```typescript
{
  name: "Check name",
  type: "model",
  prompt: "Analyze this code...",  // Required: Prompt for Claude
  passPattern: "PASS|yes|ok",      // Optional: Regex for pass (default: PASS|pass|yes|ok|true)
  contextVars: ["codeAnalysis"],   // Optional: Variables to include
  severity: "warning"              // Optional: error/warning/info
}
```

**How it works:**

1. The prompt (with interpolated variables) is sent to Claude Haiku
2. The response is checked against `passPattern`
3. If the pattern matches, the check passes

**Examples:**

```typescript
// Check code quality
{
  name: "Code quality check",
  type: "model",
  prompt: `
Review this code for quality issues:

{codeSnippet}

If the code follows best practices, respond with PASS.
If there are issues, respond with FAIL and explain why.
  `,
  contextVars: ["codeSnippet"],
  passPattern: "PASS",
  severity: "warning"
}

// Security review
{
  name: "Security check",
  type: "model",
  prompt: `
Check this code for security vulnerabilities:

{diff}

Respond YES if the code is secure, or NO with details if issues found.
  `,
  contextVars: ["diff"],
  passPattern: "YES"
}

// Architecture validation
{
  name: "Architecture compliance",
  type: "model",
  prompt: `
Does this implementation follow our architecture guidelines?

Implementation: {implementation}
Guidelines: {guidelines}

Respond with "compliant" if it follows guidelines, otherwise explain issues.
  `,
  contextVars: ["implementation", "guidelines"],
  passPattern: "compliant"
}
```

## Severity Levels

| Level | Symbol | Description |
|-------|--------|-------------|
| `error` | X | Critical failure, should block |
| `warning` | ! | Issue to address, may not block |
| `info` | i | Informational, never blocks |

Default severity is `warning`.

## Loading from Files

Checklists can be loaded from `.cw/checklists/` directory:

```typescript
// Load from .cw/checklists/pre-commit.json
t.step("Pre-commit checks", {
  tool: "checklist",
  checklist: "pre-commit"
})
```

**File format** (`.cw/checklists/pre-commit.json`):

```json
{
  "name": "Pre-commit Checks",
  "onFail": "stop",
  "items": [
    {
      "name": "Lint passes",
      "type": "bash",
      "command": "npm run lint",
      "severity": "error"
    },
    {
      "name": "Tests pass",
      "type": "bash",
      "command": "npm test",
      "severity": "error"
    }
  ]
}
```

## Example Workflows

### Pre-commit Validation

```typescript
import { createBuilder, WorkflowDefinition } from "claude-workflow";

export default function (t: ReturnType<typeof createBuilder>): WorkflowDefinition {
  return {
    name: "Pre-commit Checks",
    steps: [
      t.step("Validate", t.checklist([
        {
          name: "Lint passes",
          type: "bash",
          command: "npm run lint",
          severity: "error"
        },
        {
          name: "Tests pass",
          type: "bash",
          command: "npm test",
          severity: "error"
        },
        {
          name: "No console.log",
          type: "regex",
          pattern: "console\\.log",
          files: "src/**/*.ts",
          exclude: "*.test.ts",
          expect: 0,
          severity: "warning"
        },
        {
          name: "No TODO comments",
          type: "regex",
          pattern: "TODO|FIXME",
          files: "src/**/*.ts",
          expect: 0,
          severity: "info"
        }
      ]), {
        onFail: "stop"
      }),

      t.step("Commit", t.bash("git commit -m 'Changes validated'"))
    ]
  };
}
```

### Code Quality Gates

```typescript
import { createBuilder, WorkflowDefinition } from "claude-workflow";

export default function (t: ReturnType<typeof createBuilder>): WorkflowDefinition {
  return {
    name: "Quality Gates",
    steps: [
      t.step("Get diff", t.bash("git diff HEAD~1"), {
        output: "diff"
      }),

      t.step("Quality checks", t.checklist([
        {
          name: "Build succeeds",
          type: "bash",
          command: "npm run build",
          severity: "error"
        },
        {
          name: "Type check",
          type: "bash",
          command: "npx tsc --noEmit",
          severity: "error"
        },
        {
          name: "Code review",
          type: "model",
          prompt: `
Review these changes for potential issues:

{diff}

If the changes look good, respond PASS.
If there are concerns, respond FAIL and list them.
          `,
          contextVars: ["diff"],
          passPattern: "PASS",
          severity: "warning"
        }
      ]), {
        onFail: "warn"
      })
    ]
  };
}
```

### Security Scanning

```typescript
import { createBuilder, WorkflowDefinition } from "claude-workflow";

export default function (t: ReturnType<typeof createBuilder>): WorkflowDefinition {
  return {
    name: "Security Scan",
    steps: [
      t.step("Security checks", t.checklist([
        {
          name: "No hardcoded secrets",
          type: "regex",
          pattern: "(api[_-]?key|password|secret)\\s*[=:]\\s*['\"][^'\"]+['\"]",
          files: "**/*.{ts,js,json}",
          exclude: "*.test.*,*.spec.*",
          expect: 0,
          severity: "error"
        },
        {
          name: "No eval usage",
          type: "regex",
          pattern: "\\beval\\s*\\(",
          files: "src/**/*.ts",
          expect: 0,
          severity: "error"
        },
        {
          name: "Dependencies audit",
          type: "bash",
          command: "npm audit --audit-level=high",
          severity: "error"
        }
      ]), {
        onFail: "stop"
      })
    ]
  };
}
```

### Combined Validation

```typescript
import { createBuilder, WorkflowDefinition } from "claude-workflow";

export default function (t: ReturnType<typeof createBuilder>): WorkflowDefinition {
  return {
    name: "Full Validation",
    steps: [
      t.step("Get context", t.bash("git diff --cached"), {
        output: "stagedChanges"
      }),

      t.step("Run all checks", t.checklist([
        // Bash checks
        {
          name: "Format check",
          type: "bash",
          command: "npm run format:check",
          severity: "warning"
        },
        {
          name: "Lint",
          type: "bash",
          command: "npm run lint",
          severity: "error"
        },
        {
          name: "Unit tests",
          type: "bash",
          command: "npm test -- --coverage",
          severity: "error"
        },

        // Regex checks
        {
          name: "No debugger",
          type: "regex",
          pattern: "\\bdebugger\\b",
          files: "src/**/*.ts",
          expect: 0,
          severity: "error"
        },

        // Model check
        {
          name: "Change review",
          type: "model",
          prompt: `
Analyze these staged changes:

{stagedChanges}

Check for:
1. Breaking changes
2. Missing error handling
3. Potential bugs

Respond PASS if changes are safe, FAIL otherwise.
          `,
          contextVars: ["stagedChanges"],
          passPattern: "PASS",
          severity: "warning"
        }
      ]), {
        output: "checkResults",
        onFail: "warn"
      }),

      t.step("Report results", t.claude("Summarize these check results: {checkResults}"))
    ]
  };
}
```

## Output Format

The checklist tool outputs a formatted report:

```
## Checklist: Pre-commit Checks
Status: PASSED with warnings (4/5 checks passed)
Warnings: 1
Duration: 2.34s

V Lint passes
V Tests pass
V No console.log
! TODO comments found
  Found 3 matches, expected 0
    src/api.ts: 2 matches
    src/utils.ts: 1 matches
V Build succeeds
```

## Parallel Execution

All checks run in parallel for faster execution. This means:

- Independent checks don't wait for each other
- Total time is approximately the slowest check's time
- Order of results may differ from definition order

## Error Handling

```typescript
// Continue even if checks fail
t.step("Optional checks", t.checklist([...]), {
  onFail: "continue"
})

// Stop on any failure
t.step("Required checks", t.checklist([...]), {
  onFail: "stop"
})

// Fail on errors only, warn on warnings
t.step("Standard checks", t.checklist([...]), {
  onFail: "warn"  // Default
})
```

## Tips

### Use Severity Appropriately

- `error`: Blocking issues (security, build failures)
- `warning`: Should fix but not blocking
- `info`: Nice to know, tracking purposes

### Combine Check Types

Mix bash, regex, and model checks for comprehensive validation:

```typescript
t.checklist([
  { type: "bash", ... },     // Fast, deterministic
  { type: "regex", ... },    // Pattern matching
  { type: "model", ... }     // AI judgment
])
```

### Keep Prompts Focused

For model checks, use clear, focused prompts:

```typescript
// Good: Specific criteria
{
  type: "model",
  prompt: "Does this function have error handling? {code} Answer YES or NO.",
  passPattern: "YES"
}

// Bad: Vague criteria
{
  type: "model",
  prompt: "Is this code good? {code}"
}
```

### Use Context Variables

Pass relevant data to model checks:

```typescript
t.step("Get diff", t.bash("git diff"), { output: "diff" })

t.step("Review", t.checklist([{
  type: "model",
  prompt: "Review: {diff}",
  contextVars: ["diff"]
}]))
```
