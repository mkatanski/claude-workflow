# Claude Tool

The `claude` tool executes Claude Code prompts in a tmux pane, enabling automated AI-powered development workflows.

## Overview

The Claude tool runs Claude Code CLI in a tmux pane. It:

1. Opens a new tmux pane next to your terminal
2. Launches Claude Code with the specified prompt
3. Waits for Claude to complete its work
4. Captures the output and closes the pane
5. Proceeds to the next step

This allows you to orchestrate multi-step development tasks where each step is handled by Claude Code with full access to your codebase.

## Basic Usage

```typescript
import type { WorkflowFactory } from "claude-workflow";

const workflow: WorkflowFactory = (t) => ({
  name: "feature-implementation",
  steps: [
    t.step("Implement Feature", t.claude("Create a new login form component with email and password fields")),
  ],
});

export default workflow;
```

## Builder API

### `t.claude(prompt: string)`

Creates a Claude Code tool definition with the specified prompt.

```typescript
t.step("Add tests", t.claude("Write unit tests for the authentication endpoint"))
```

### Step Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `output` | string | - | Variable name to store Claude's output |
| `when` | string | - | Conditional expression for step execution |
| `onError` | "stop" \| "continue" | "stop" | Error handling behavior |
| `model` | string | workflow default | Model for this step: `sonnet`, `opus`, or `haiku` |

## Workflow-Level Claude Configuration

Configure Claude Code behavior in the `claude` section of your workflow:

```typescript
const workflow: WorkflowFactory = (t) => ({
  name: "automated-dev",
  claude: {
    // Enable interactive TUI mode
    interactive: true,

    // Model to use: sonnet, opus, or haiku
    model: "sonnet",

    // Bypass permission checks (use with caution!)
    dangerouslySkipPermissions: true,

    // Restrict which tools Claude can use
    allowedTools: [
      "Bash(git:*)",
      "Edit",
      "Read",
    ],

    // Auto-approve plan prompts (default: true)
    autoApprovePlan: true,

    // Append text to every prompt
    appendSystemPrompt: "Follow the existing code patterns in this project.",

    // Working directory (defaults to project path)
    cwd: "/path/to/project",
  },
  steps: [
    t.step("Implement feature", t.claude("Create a REST API endpoint")),
  ],
});
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `interactive` | boolean | `true` | Enable interactive TUI mode |
| `model` | string | - | Model to use: `sonnet`, `opus`, or `haiku` |
| `cwd` | string | project path | Working directory for Claude |
| `dangerouslySkipPermissions` | boolean | `false` | Skip all permission prompts |
| `permissionMode` | string | - | Permission mode for Claude Code |
| `allowedTools` | string[] | - | Restrict available tools (e.g., `Bash(git:*)`, `Edit`) |
| `autoApprovePlan` | boolean | `true` | Automatically approve plan prompts |
| `appendSystemPrompt` | string | - | Text to prepend to every prompt |

## Hooks Requirement

The orchestrator uses an HTTP server-based system for instant, reliable completion detection. **Hooks are required** - the orchestrator will not start without them.

### How It Works

1. **HTTP Server**: When the orchestrator starts, it launches a local HTTP server
2. **Environment Variable**: The `ORCHESTRATOR_PORT` environment variable is set when launching Claude
3. **Hook Signals**: When Claude completes or exits, hooks send HTTP POST requests to the server
4. **Instant Detection**: The server immediately notifies the orchestrator

### Required Hook Configuration

Add the following hooks to your `~/.claude/settings.json`:

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST \"http://localhost:$ORCHESTRATOR_PORT/complete\" --data-urlencode \"pane=$TMUX_PANE\" 2>/dev/null || true"
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST \"http://localhost:$ORCHESTRATOR_PORT/exited\" --data-urlencode \"pane=$TMUX_PANE\" 2>/dev/null || true"
          }
        ]
      }
    ]
  }
}
```

### Automatic Hook Installation

If hooks are not configured, the orchestrator will prompt you to install them:
- **Global installation**: Installs to `~/.claude/settings.json` (affects all projects)
- **Project installation**: Installs to `<project>/.claude/settings.json` (affects only this project)

## Per-Step Model Override

Override the workflow-level model for specific steps:

```typescript
const workflow: WorkflowFactory = (t) => ({
  name: "mixed-models",
  claude: {
    model: "sonnet", // Default for all steps
  },
  steps: [
    t.step("Quick Analysis", t.claude("List all TODO comments"), {
      model: "haiku", // Fast, cheap model for simple tasks
    }),
    t.step("Complex Implementation", t.claude("Refactor the authentication system"), {
      model: "opus", // Powerful model for complex tasks
    }),
    t.step("Standard Task", t.claude("Add unit tests")), // Uses workflow default (sonnet)
  ],
});
```

## Output Capture

Capture Claude's output for use in later steps:

```typescript
const workflow: WorkflowFactory = (t) => ({
  name: "analyze-and-fix",
  steps: [
    t.step("Analyze Codebase", t.claude("List all TODO comments in the codebase"), {
      output: "todos",
    }),
    t.step("Fix TODOs", t.claude("Address the following TODOs: {todos}")),
  ],
});
```

## Example Workflows

### Basic Implementation Flow

```typescript
const workflow: WorkflowFactory = (t) => ({
  name: "feature-implementation",
  claude: {
    interactive: true,
    dangerouslySkipPermissions: true,
  },
  steps: [
    t.step("Implement Feature", t.claude("Create a REST API endpoint for user authentication")),
    t.step("Add Tests", t.claude("Write unit tests for the authentication endpoint")),
    t.step("Code Review", t.claude("Review the changes for security issues and best practices")),
    t.step("Commit", t.claude("Commit all changes with a descriptive message")),
  ],
});
```

### Conditional Execution

```typescript
const workflow: WorkflowFactory = (t) => ({
  name: "test-and-fix",
  steps: [
    t.step("Check Tests", t.bash("npm test"), {
      output: "test_result",
      onError: "continue",
    }),
    t.step("Fix Failing Tests", t.claude("Fix the failing tests"), {
      when: "{test_result} contains FAILED",
    }),
  ],
});
```

### Multi-line Prompts

```typescript
t.step("Complex Task", t.claude(`
  Implement a user dashboard with:
  - User profile display
  - Recent activity feed
  - Settings panel

  Use React and TypeScript.
  Follow existing code patterns.
`))
```

### Variable Interpolation

Reference variables from previous steps:

```typescript
const workflow: WorkflowFactory = (t) => ({
  name: "branch-pr",
  steps: [
    t.step("Get Branch", t.bash("git branch --show-current"), {
      output: "branch",
    }),
    t.step("Create PR", t.claude("Create a pull request for branch {branch}")),
  ],
});
```

### Restricting Tools

```typescript
const workflow: WorkflowFactory = (t) => ({
  name: "read-only-review",
  claude: {
    allowedTools: [
      "Read",
      "Bash(git:*)", // Only git commands
    ],
  },
  steps: [
    t.step("Code Review Only", t.claude("Review the codebase and suggest improvements (read-only)")),
  ],
});
```

## Large Variables

Variables exceeding 10,000 characters are **automatically externalized** to temp files. The system:
- Writes large content to `{temp_dir}/{variable_name}.txt`
- Replaces `{var}` with `@/path/to/file.txt` in the prompt
- Claude Code reads the file via its `@filepath` syntax

This prevents prompt size errors and works transparently:

```typescript
const workflow: WorkflowFactory = (t) => ({
  name: "analyze-logs",
  steps: [
    t.step("Get logs", t.bash("cat large_logfile.txt"), {
      output: "logs", // Could be 100KB+
    }),
    t.step("Analyze", t.claude("Find errors in: {logs}")),
    // Automatically becomes: Find errors in: @/path/to/logs.txt
  ],
});
```

## Environment Requirements

### Required

- **Bun runtime**: For running the TypeScript orchestrator
- **tmux**: Must be running inside a tmux session
- **Claude Code CLI**: The `claude` command must be available
- **Claude Code Hooks**: Stop and SessionEnd hooks must be configured

### Starting a tmux Session

```bash
# Create a new session
tmux new -s workflow

# Or attach to existing session
tmux attach -t workflow
```

## Tips and Common Patterns

### 1. Use Specific Prompts

Be specific about what you want. Instead of:
```typescript
t.claude("fix the bug")
```

Use:
```typescript
t.claude("Fix the null pointer exception in UserService.getById() method")
```

### 2. Chain Related Steps

Break complex tasks into smaller steps:
```typescript
steps: [
  t.step("Design", t.claude("Design the database schema for a blog system")),
  t.step("Implement Models", t.claude("Implement the database models based on the designed schema")),
  t.step("Add Migrations", t.claude("Create database migrations for the new models")),
]
```

### 3. Handle Errors Gracefully

Use `onError: "continue"` for non-critical steps:
```typescript
t.step("Optional Optimization", t.claude("Optimize database queries if any are slow"), {
  onError: "continue",
})
```

## Troubleshooting

### "Not running inside tmux session"

Start tmux first:
```bash
tmux new -s workflow
bunx claude-workflow run /path/to/workflow.ts
```

### "Claude hooks not configured"

The orchestrator requires hooks to be configured. Run the installer or manually add the hooks to your settings.json.

### Steps Running Forever

Check if:
1. Hooks are configured correctly
2. Claude is waiting for user input (use `dangerouslySkipPermissions: true`)
3. The prompt is causing Claude to run indefinitely

### Permission Prompts Blocking

For automated workflows, consider:
```typescript
claude: {
  dangerouslySkipPermissions: true,
}
```

**Warning**: Only use this in sandboxed environments without sensitive data or network access.
