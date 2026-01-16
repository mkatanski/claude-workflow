# Claude SDK Tool

The `claude_sdk` tool provides direct integration with the Anthropic API for AI-powered decision making in workflows. Unlike the `claude` tool which runs Claude Code CLI in a tmux pane, `claude_sdk` makes direct API calls for faster, structured responses.

## Overview

The Claude SDK tool is ideal for:

- **Structured outputs**: Boolean, enum, decision, or custom JSON schema responses
- **Faster execution**: No tmux overhead, direct API communication
- **Decision making**: Ideal for branching logic and conditional workflows
- **Analysis tasks**: Read-only analysis without file modifications

## When to Use SDK vs Claude Code

| Use Case | Recommended Tool |
|----------|------------------|
| Make a yes/no decision | `claude_sdk` with boolean schema |
| Choose between options | `claude_sdk` with enum values |
| Dynamic workflow routing | `claude_sdk` with decision schema |
| Generate structured data | `claude_sdk` with custom schema |
| Write/modify code | `claude` (tmux-based) |
| Run commands interactively | `claude` (tmux-based) |
| Complex multi-step coding | `claude` (tmux-based) |
| Needs file write access | `claude` (tmux-based) |

**Rule of thumb**: Use `claude_sdk` for decisions and analysis, use `claude` for actions that modify files.

## Basic Usage

```typescript
import type { WorkflowFactory } from "claude-workflow";

const workflow: WorkflowFactory = (t) => ({
  name: "analyze-project",
  steps: [
    t.step("Check tests exist", t.claudeSdk({
      prompt: "Does this project have a test suite?",
      schema: { type: "boolean" },
    }), {
      output: "has_tests",
    }),
  ],
});

export default workflow;
```

## Builder API

### `t.claudeSdk(config: ClaudeSdkToolConfig)`

Creates a Claude SDK tool definition with the specified configuration.

```typescript
interface ClaudeSdkToolConfig {
  prompt: string;                    // Required: The prompt to send
  schema?: Record<string, unknown>;  // JSON schema for structured output
  systemPrompt?: string;             // Custom system prompt
  model?: string;                    // Model alias or full ID
  maxRetries?: number;               // Retries for validation (default: 3)
  timeout?: number;                  // Timeout in milliseconds
}
```

### Step Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `output` | string | - | Variable name to store the result |
| `when` | string | - | Conditional expression for step execution |
| `onError` | "stop" \| "continue" | "stop" | Error handling behavior |

## Model Aliases

| Alias | Model ID |
|-------|----------|
| `sonnet` | claude-sonnet-4-5-20250514 |
| `opus` | claude-opus-4-5-20250514 |
| `haiku` | claude-haiku-4-5-20250514 |

You can use either aliases or full model IDs:

```typescript
t.claudeSdk({
  prompt: "Analyze this code",
  model: "opus", // Using alias
})

t.claudeSdk({
  prompt: "Quick check",
  model: "claude-haiku-4-5-20250514", // Using full ID
})
```

## Structured Output with JSON Schema

The `schema` field defines the expected output format. The SDK validates responses and retries automatically if validation fails.

### Boolean Output

Returns `true` or `false`:

```typescript
t.step("Check tests exist", t.claudeSdk({
  prompt: "Does this project have a test suite?",
  schema: {
    type: "boolean",
  },
}), {
  output: "has_tests",
})

// Result stored in variable: "true" or "false"
```

### Enum Output

Returns one of the specified values:

```typescript
t.step("Detect language", t.claudeSdk({
  prompt: "What is the primary programming language in this project?",
  schema: {
    type: "enum",
    values: ["python", "javascript", "typescript", "go", "rust", "other"],
  },
}), {
  output: "language",
})

// Result stored in variable: e.g., "typescript"
```

### Decision Output

Returns a step name and reason for workflow routing:

```typescript
t.step("Route task", t.claudeSdk({
  prompt: `
    Based on the issue description, which step should handle this?
    - fix_bug: For bug fixes
    - add_feature: For new features
    - refactor: For code cleanup
  `,
  schema: {
    type: "decision",
  },
}), {
  output: "routing_decision",
})

// Result: JSON with "goto" and "reason" fields
// The workflow automatically jumps to the target step
```

### Custom Schema Output

Returns structured data matching a JSON schema:

```typescript
t.step("Extract info", t.claudeSdk({
  prompt: "Extract key information from this project's package.json",
  schema: {
    type: "object",
    properties: {
      name: { type: "string" },
      version: { type: "string" },
      dependencies: {
        type: "array",
        items: { type: "string" },
      },
      hasTests: { type: "boolean" },
    },
    required: ["name", "version"],
  },
}), {
  output: "package_info",
})

// Result: JSON string matching the schema
```

## Workflow-Level Configuration

Set defaults for all `claude_sdk` steps at the workflow level:

```typescript
const workflow: WorkflowFactory = (t) => ({
  name: "code-review",
  claudeSdk: {
    model: "opus",
    systemPrompt: `
      You are a senior code reviewer. Focus on:
      - Security issues
      - Performance problems
      - Code clarity
    `,
  },
  steps: [
    t.step("Analyze", t.claudeSdk({
      prompt: "Review the changes in the current branch",
      // Inherits model and systemPrompt from workflow level
    })),
  ],
});
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `model` | string | "sonnet" | Default model for SDK steps |
| `systemPrompt` | string | built-in | Default system prompt for SDK steps |

## Example Workflows

### Conditional Test Running

```typescript
const workflow: WorkflowFactory = (t) => ({
  name: "smart-test-runner",
  steps: [
    t.step("Check changes", t.claudeSdk({
      prompt: `
        Look at the recent git changes. Are there any changes
        that require running the full test suite?
      `,
      schema: { type: "boolean" },
    }), {
      output: "needs_full_tests",
    }),
    t.step("Run full tests", t.bash("npm run test"), {
      when: "{needs_full_tests} == true",
    }),
    t.step("Run quick tests", t.bash("npm run test:quick"), {
      when: "{needs_full_tests} == false",
    }),
  ],
});
```

### Dynamic Workflow Routing

```typescript
const workflow: WorkflowFactory = (t) => ({
  name: "issue-handler",
  steps: [
    t.step("Analyze issue", t.claudeSdk({
      prompt: `
        Read the issue description. Determine the type of work needed:
        - step: implement_feature (new functionality)
        - step: fix_bug (something is broken)
        - step: update_docs (documentation only)
      `,
      schema: { type: "decision" },
    })),
    t.step("implement_feature", t.claude("Implement the new feature")),
    t.step("fix_bug", t.claude("Fix the bug")),
    t.step("update_docs", t.claude("Update the documentation")),
  ],
});
```

### Code Quality Analysis

```typescript
const workflow: WorkflowFactory = (t) => ({
  name: "code-review",
  claudeSdk: {
    model: "opus",
    systemPrompt: `
      You are a senior code reviewer. Focus on:
      - Security issues
      - Performance problems
      - Code clarity
    `,
  },
  steps: [
    t.step("Analyze", t.claudeSdk({
      prompt: "Review the changes in the current branch",
      schema: {
        type: "object",
        properties: {
          score: {
            type: "integer",
            minimum: 1,
            maximum: 10,
          },
          issues: {
            type: "array",
            items: {
              type: "object",
              properties: {
                severity: {
                  type: "string",
                  enum: ["critical", "warning", "info"],
                },
                description: { type: "string" },
              },
            },
          },
          recommendation: {
            type: "string",
            enum: ["approve", "request_changes", "needs_discussion"],
          },
        },
        required: ["score", "issues", "recommendation"],
      },
    }), {
      output: "review_result",
    }),
  ],
});
```

### Security Review

```typescript
t.step("Security review", t.claudeSdk({
  prompt: "Review src/ for security issues",
  systemPrompt: `
    You are a security expert. Look for:
    - SQL injection
    - XSS vulnerabilities
    - Hardcoded secrets
    - Insecure dependencies
  `,
  schema: {
    type: "object",
    properties: {
      vulnerabilities: {
        type: "array",
        items: { type: "string" },
      },
      riskLevel: {
        type: "string",
        enum: ["none", "low", "medium", "high", "critical"],
      },
    },
    required: ["vulnerabilities", "riskLevel"],
  },
}), {
  output: "security_result",
})
```

## Retry on Validation Failure

The SDK automatically retries when output validation fails. Each retry includes the previous error message to help Claude correct its output:

```typescript
t.step("Extract data", t.claudeSdk({
  prompt: "Extract structured data from the README",
  schema: {
    type: "object",
    properties: {
      title: { type: "string" },
      description: { type: "string" },
    },
    required: ["title", "description"],
  },
  maxRetries: 5, // Try up to 5 times on validation failure
}))
```

## Variable Interpolation

Use variables from previous steps in prompts:

```typescript
const workflow: WorkflowFactory = (t) => ({
  name: "analyze-readme",
  steps: [
    t.step("Get README", t.bash("cat README.md"), {
      output: "readme_content",
    }),
    t.step("Analyze", t.claudeSdk({
      prompt: `
        Based on this README:
        {readme_content}

        Is this a library or an application?
      `,
      schema: {
        type: "enum",
        values: ["library", "application"],
      },
    })),
  ],
});
```

## Large Variables

Variables exceeding 10,000 characters are automatically externalized to temp files:

```typescript
const workflow: WorkflowFactory = (t) => ({
  name: "analyze-logs",
  steps: [
    t.step("Get logs", t.bash("cat large_logfile.txt"), {
      output: "logs", // Could be 100KB+
    }),
    t.step("Analyze", t.claudeSdk({
      prompt: "Find critical errors in: {logs}",
      schema: { type: "boolean" },
    })),
    // Automatically becomes: Find critical errors in: @/path/to/logs.txt
  ],
});
```

## Environment Requirements

### Required

- **ANTHROPIC_API_KEY**: Your Anthropic API key must be set as an environment variable

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

## Error Handling

Use `onError: "continue"` to proceed despite failures:

```typescript
t.step("Optional check", t.claudeSdk({
  prompt: "Check if feature exists",
  schema: { type: "boolean" },
}), {
  onError: "continue",
})
```

If output validation fails after all retries, the step fails with an error message:

```
Output validation failed after 3 attempts: Expected boolean result, got: string
```

## Tips and Patterns

### Chain Decisions

```typescript
steps: [
  t.step("Check tests", t.claudeSdk({
    prompt: "Does this project have tests?",
    schema: { type: "boolean" },
  }), {
    output: "has_tests",
  }),
  t.step("Check coverage", t.claudeSdk({
    prompt: "Is test coverage above 80%?",
    schema: { type: "boolean" },
  }), {
    output: "good_coverage",
    when: "{has_tests} == true",
  }),
]
```

### Custom System Prompts for Specialized Tasks

Different tasks may benefit from different personas:

```typescript
// Security focus
t.claudeSdk({
  systemPrompt: "You are a security expert. Look for vulnerabilities.",
  prompt: "Review auth.ts",
  // ...
})

// Performance focus
t.claudeSdk({
  systemPrompt: "You are a performance engineer. Identify bottlenecks.",
  prompt: "Review database queries",
  // ...
})
```

### Use Appropriate Models

- **haiku**: Fast, cheap - simple yes/no decisions
- **sonnet**: Balanced - most analysis tasks
- **opus**: Powerful - complex reasoning, detailed analysis
