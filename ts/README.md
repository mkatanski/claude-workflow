# Claude Workflow - TypeScript Implementation

A TypeScript/LangChain-based implementation of claude-workflow, providing type-safe workflow automation with Claude Code.

## Overview

This is the TypeScript implementation of claude-workflow, designed to orchestrate complex automation tasks using Claude Code. It provides a fluent builder API for defining workflows as TypeScript files with full type safety and IDE support.

## Features

- **TypeScript-first** with full type safety and IDE autocompletion
- **LangChain state graphs** for workflow execution
- **Builder API** for programmatic workflow definition
- **Dual runtime support** - works with both Bun (recommended) and Node.js (via tsx)
- **8 built-in tools** for shell commands, Claude integration, data manipulation, and external services
- **Variable interpolation** with automatic externalization for large content
- **Conditional execution** with natural language conditions
- **tmux integration** for visible Claude Code execution

## Requirements

- [Bun](https://bun.sh/) (recommended) or Node.js 18+
- [tmux](https://github.com/tmux/tmux) (required for the `claude` tool)
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and configured
- `ANTHROPIC_API_KEY` environment variable (for `claude_sdk` and `checklist` model checks)
- `LINEAR_API_KEY` environment variable (for Linear tools, optional)

## Installation

```bash
cd ts
bun install
```

Or with npm:

```bash
cd ts
npm install
```

## CLI Commands

### Development Scripts

```bash
# Run with tsx (Node.js)
bun run dev

# Run with Bun runtime
bun run dev:bun

# Build standalone binary
bun run build

# Run tests
bun test

# TypeScript type checking
bun run typecheck

# Lint with Biome
bun run lint

# Format code
bun run format
```

### CLI Usage

The CLI is available as `cw` or `claude-workflow`:

```bash
# Run a workflow in current directory
cw run

# Run a workflow in a specific project
cw run /path/to/project

# Run a specific workflow by name
cw run -w my-workflow /path/to/project

# Verbose output
cw run -v /path/to/project
```

### Hook Management

Hooks enable completion detection when running Claude Code:

```bash
# Install workflow hooks to a project
cw hooks install <project-path>

# Check if hooks are installed
cw hooks check <project-path>

# Uninstall hooks from a project
cw hooks uninstall <project-path>

# Clean up legacy global hooks
cw hooks cleanup-global
```

## Workflow Files

Workflows are defined in `.cw/workflows/` as `.workflow.ts` files using the builder API.

### Basic Structure

```typescript
import type { WorkflowBuilder } from "../../../src/types/index.ts";

export default (t: WorkflowBuilder) => ({
  name: "Example Workflow",

  // Variables available via {var_name} interpolation
  vars: {
    greeting: "Hello",
    target: "World",
  },

  // Claude Code configuration
  claude: {
    model: "sonnet",
    dangerouslySkipPermissions: true,
  },

  // Workflow steps
  steps: [
    t.step("Get current date", t.bash("date"), { output: "currentDate" }),
    t.step("Show message", t.bash("echo '{greeting}, {target}!'")),
  ],
});
```

### Configuration Options

#### Top-Level Configuration

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Workflow display name |
| `vars` | `Record<string, unknown>` | Initial variables |
| `claude` | `ClaudeConfig` | Claude Code settings |
| `claudeSdk` | `ClaudeSdkConfig` | Claude SDK settings |
| `tmux` | `TmuxConfig` | Tmux pane settings |
| `onError` | `OnErrorConfig` | Error handling behavior |

#### Claude Configuration

```typescript
claude: {
  model: "sonnet",              // "opus", "sonnet", "haiku"
  dangerouslySkipPermissions: true,
  permissionMode: "auto",
  allowedTools: ["bash", "write"],
  autoApprovePlan: true,
  appendSystemPrompt: "Additional context...",
  cwd: "/custom/working/dir",
}
```

### Step Options

```typescript
t.step("Step name", t.bash("command"), {
  output: "varName",       // Store output in variable
  when: "{var} is not empty", // Conditional execution
  onError: "continue",     // "stop" (default) or "continue"
  visible: true,           // Show in tmux pane
  cwd: "/custom/path",     // Working directory override
  model: "opus",           // Model override for this step
})
```

### Variable Interpolation

Use `{var_name}` syntax in prompts and commands:

```typescript
// Simple variable
t.bash("echo '{greeting}'")

// Nested access
t.bash("echo '{user.name}'")

// Array index
t.bash("echo '{items.0.title}'")

// Complex interpolation
t.claude("Fix the error in {filePath}: {errorMessage}")
```

Variables larger than 10KB are automatically externalized to temp files and referenced with `@filepath`.

## Available Tools

### 1. bash

Execute shell commands:

```typescript
t.step("Run tests", t.bash("npm test"), { output: "testResult" })
t.step("Build", t.bash("npm run build"))
```

### 2. claude

Run Claude Code prompts in tmux with full IDE capabilities:

```typescript
t.step("Analyze code", t.claude("Analyze the error in {file} and suggest fixes"), {
  output: "analysis",
  model: "opus",
})
```

### 3. claude_sdk

Direct Claude SDK calls with structured output (JSON schema validation):

```typescript
t.step("Extract data", t.claudeSdk({
  prompt: "Extract the title and author from: {content}",
  schema: {
    type: "object",
    properties: {
      title: { type: "string" },
      author: { type: "string" },
    },
    required: ["title", "author"],
  },
  systemPrompt: "You are a data extraction assistant.",
  model: "haiku",
  maxRetries: 3,
  timeout: 30000,
}), { output: "extracted" })
```

### 4. data

Write content to temporary files (useful for large data):

```typescript
t.step("Save data", t.data("{largeContent}", "json"), { output: "dataFilePath" })
```

### 5. json

JSON/YAML manipulation with JMESPath queries:

```typescript
// Parse JSON string
t.step("Parse", t.json("parse", { input: "{jsonString}" }), { output: "parsed" })

// Query with JMESPath
t.step("Query", t.json("query", {
  input: "{data}",
  query: "items[?status=='active'].name",
}), { output: "activeNames" })

// Stringify object
t.step("Stringify", t.json("stringify", { input: "{object}" }), { output: "jsonStr" })

// Set value at path
t.step("Update", t.json("set", {
  input: "{data}",
  path: "config.enabled",
  value: "true",
}), { output: "updated" })
```

### 6. checklist

Run validation checks with three check types:

```typescript
t.step("Validate", t.checklist([
  // Bash check - run command and verify output
  {
    name: "TypeScript compiles",
    type: "bash",
    command: "tsc --noEmit",
    severity: "error",
  },
  // Regex check - pattern matching in files
  {
    name: "No console.log in production",
    type: "regex",
    pattern: "console\\.log",
    files: "src/**/*.ts",
    exclude: "**/*.test.ts",
    expect: 0,
    severity: "warning",
  },
  // Model check - LLM-based judgment
  {
    name: "Code quality check",
    type: "model",
    prompt: "Does this code follow best practices? {codeSnippet}",
    passPattern: "yes|pass|good",
    contextVars: ["codeSnippet"],
    severity: "info",
  },
]))
```

### 7. linear_tasks

Query Linear issues for workflow automation:

```typescript
// Get next available issue
t.step("Get task", t.linear("get_next", {
  team: "ENG",
  project: "Backend",
  status: "Todo",
  priority: 1,
  labels: ["bug"],
}), { output: "issueId" })

// Get full issue details
t.step("Get details", t.linear("get", {
  issueId: "{issueId}",
}), { output: "issueDetails" })

// Assign issue
t.step("Assign", t.linear("assign", {
  issueId: "{issueId}",
  assignee: "me",
}))
```

### 8. linear_manage

Create and update Linear issues:

```typescript
// Create new issue
t.step("Create issue", t.linear("create", {
  team: "ENG",
  title: "Fix bug in {component}",
  description: "{bugDescription}",
  priority: 2,
  labels: ["bug", "urgent"],
}), { output: "newIssueId" })

// Update issue status
t.step("Update status", t.linear("update", {
  issueId: "{issueId}",
  status: "In Progress",
}))

// Add comment
t.step("Add comment", t.linear("comment", {
  issueId: "{issueId}",
  body: "Started implementation. See PR: {prUrl}",
}))
```

## Control Flow

### Loops

```typescript
// ForEach loop
t.forEach("{items}", "item", [
  t.step("Process", t.bash("echo 'Processing {item}'")),
])

// While loop
t.while("{counter} < 10", [
  t.step("Increment", t.bash("echo $((counter + 1))")),
])

// Range loop
t.range(1, 5, [
  t.step("Iterate", t.bash("echo 'Iteration {i}'")),
])

// Retry with backoff
t.retry({ maxAttempts: 3, until: "{success} == true", backoff: 1000 }, [
  t.step("Try operation", t.bash("./flaky-command")),
])
```

### Conditions

Use natural language conditions with `when`:

```typescript
t.step("Deploy", t.bash("./deploy.sh"), {
  when: "{environment} == production",
})

t.step("Notify", t.bash("./notify.sh"), {
  when: "{result} is not empty",
})

t.step("Rollback", t.bash("./rollback.sh"), {
  when: "{exitCode} != 0",
})
```

## Project Structure

```
ts/
├── src/
│   ├── cli/                    # CLI entry point and commands
│   │   ├── main.ts            # Commander CLI setup
│   │   ├── commands/          # Command implementations
│   │   │   ├── run.ts         # Workflow runner command
│   │   │   └── hooks.ts       # Hook management commands
│   │   └── discovery.ts       # Workflow file discovery
│   ├── core/
│   │   ├── context/           # Execution context and variables
│   │   │   ├── execution.ts   # Variable storage and interpolation
│   │   │   └── index.ts
│   │   ├── tools/             # Tool implementations
│   │   │   ├── bash.ts        # Shell command execution
│   │   │   ├── claude.ts      # Claude Code in tmux
│   │   │   ├── claudeSdk.ts   # Direct Claude SDK calls
│   │   │   ├── data.ts        # Temp file writing
│   │   │   ├── json.ts        # JSON manipulation
│   │   │   ├── checklist.ts   # Validation checks
│   │   │   ├── linearTasks.ts # Linear issue queries
│   │   │   ├── linearManage.ts # Linear issue management
│   │   │   ├── registry.ts    # Tool registry
│   │   │   └── types.ts       # Tool base class and types
│   │   ├── workflow/          # Workflow execution
│   │   │   ├── builder.ts     # Fluent builder API
│   │   │   ├── runner.ts      # Step execution engine
│   │   │   └── state.ts       # LangChain state management
│   │   ├── tmux/              # Tmux integration
│   │   │   ├── manager.ts     # Pane management
│   │   │   └── index.ts
│   │   ├── linear/            # Linear API client
│   │   │   ├── client.ts      # API wrapper
│   │   │   ├── queries.ts     # GraphQL queries
│   │   │   └── types.ts       # Linear types
│   │   ├── server/            # Completion signal server
│   │   │   └── manager.ts     # HTTP server for hooks
│   │   └── conditions/        # Condition evaluation
│   │       └── evaluator.ts   # Natural language conditions
│   └── types/                 # TypeScript type definitions
│       └── index.ts           # All exported types
├── examples/                   # Example workflows
│   └── .cw/workflows/
│       └── example.workflow.ts
├── package.json
├── tsconfig.json
└── biome.json                 # Linter/formatter config
```

## Documentation

For detailed documentation on individual tools and advanced usage, see the `docs/` folder (coming soon).

## Examples

See the `examples/` directory for complete workflow examples:

- `examples/.cw/workflows/example.workflow.ts` - Basic workflow demonstrating all core features

Run the example:

```bash
bun run dev examples
```

## License

MIT
