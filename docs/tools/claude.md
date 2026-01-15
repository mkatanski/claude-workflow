# Claude Tool

The `claude` tool executes Claude Code prompts in a tmux pane, enabling automated AI-powered development workflows.

## Overview

The Claude tool is the default tool for workflow steps. It:

1. Opens a new tmux pane next to your terminal
2. Launches Claude Code with the specified prompt
3. Waits for Claude to complete its work
4. Captures the output and closes the pane
5. Proceeds to the next step

This allows you to orchestrate multi-step development tasks where each step is handled by Claude Code with full access to your codebase.

## Basic Usage

```yaml
steps:
  - name: "Implement Feature"
    prompt: "Create a new login form component with email and password fields"
```

Since `claude` is the default tool, you don't need to specify `tool: claude`.

## YAML Configuration Options

### Step-Level Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | string | required | Display name for the step |
| `prompt` | string | required | The prompt to send to Claude Code |
| `tool` | string | `"claude"` | Tool identifier (optional for claude) |
| `model` | string | workflow default | Model for this step: `sonnet`, `opus`, or `haiku` |
| `output_var` | string | - | Variable name to store Claude's output |
| `on_error` | string | `"stop"` | Error handling: `stop` or `continue` |
| `when` | string | - | Conditional expression for step execution |

### Workflow-Level Claude Configuration

Configure Claude Code behavior in the `claude:` section of your workflow:

```yaml
claude:
  # Use interactive mode for full TUI experience
  interactive: true

  # Model to use: sonnet, opus, or haiku
  model: sonnet

  # Bypass permission checks (use with caution!)
  dangerously_skip_permissions: true

  # Restrict which tools Claude can use
  allowed_tools:
    - "Bash(git:*)"
    - "Edit"
    - "Read"

  # Working directory (defaults to project path)
  cwd: /path/to/project
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `interactive` | boolean | `true` | Enable interactive TUI mode |
| `model` | string | - | Model to use: `sonnet`, `opus`, or `haiku` |
| `cwd` | string | project path | Working directory for Claude |
| `dangerously_skip_permissions` | boolean | `false` | Skip all permission prompts |
| `allowed_tools` | list | - | Restrict available tools (e.g., `Bash(git:*)`, `Edit`) |

### Tmux Configuration

Configure tmux pane behavior in the `tmux:` section:

```yaml
tmux:
  new_window: false
  split: vertical
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `new_window` | boolean | `false` | Create new window instead of split pane |
| `split` | string | `"vertical"` | Split direction: `vertical` or `horizontal` |

## Completion Detection

The orchestrator uses an HTTP server-based system for instant, reliable completion detection. **Hooks are required** - the orchestrator will not start without them.

### How It Works

1. **HTTP Server**: When the orchestrator starts, it launches a local HTTP server on a dynamically assigned port (starting from 7432)
2. **Environment Variable**: The `ORCHESTRATOR_PORT` environment variable is automatically set when launching Claude, allowing hooks to know which port to signal
3. **Hook Signals**: When Claude completes or exits, hooks send HTTP POST requests to the server
4. **Instant Detection**: The server immediately notifies the orchestrator, providing instant completion detection

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

### Hook Details

| Hook | Endpoint | Purpose |
|------|----------|---------|
| `Stop` | `/complete` | Signals that Claude has finished processing the prompt |
| `SessionEnd` | `/exited` | Signals that the Claude session has ended |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `ORCHESTRATOR_PORT` | Set automatically when launching Claude. Contains the HTTP server port. |
| `TMUX_PANE` | Standard tmux environment variable containing the pane ID (e.g., `%123`) |

### Automatic Hook Installation

If hooks are not configured or are outdated, the orchestrator will prompt you to install them:

- **Global installation**: Installs to `~/.claude/settings.json` (affects all projects)
- **Project installation**: Installs to `<project>/.claude/settings.json` (affects only this project)

The installer preserves your existing hooks and only adds/updates the orchestrator-specific hooks.

### Server Details

The HTTP server:
- Runs on `127.0.0.1` (localhost only) for security
- Automatically finds an available port starting from 7432
- Supports multiple concurrent orchestrator instances (each gets its own port)
- Uses `--data-urlencode` in hooks to properly handle tmux pane IDs (which start with `%`)

## Tmux Integration

The Claude tool uses tmux to:

1. **Create panes**: Splits current window to run Claude Code
2. **Execute commands**: Launches `claude` CLI with the prompt and `ORCHESTRATOR_PORT` env var
3. **Wait for signals**: Receives completion signals via HTTP from hooks
4. **Clean shutdown**: Closes the pane gracefully after completion

### How It Works

```
+------------------+------------------+
|                  |                  |
|  Your Terminal   |  Claude Code     |
|  (orchestrator)  |  (running step)  |
|                  |                  |
+------------------+------------------+
        ^                   |
        |                   v
   HTTP Server  <----  Hook (curl)
   (port 7432+)
```

The orchestrator:
1. Starts an HTTP server on an available port
2. Creates a vertical or horizontal split pane
3. Runs: `cd <project> && ORCHESTRATOR_PORT=<port> claude [options] '<prompt>'`
4. Waits for the Stop hook to send a completion signal via HTTP
5. Captures final output from the pane
6. Closes the pane and continues to the next step

## Environment Requirements

### Required

- **Python 3.11+**: For running the orchestrator
- **tmux**: Must be running inside a tmux session
- **Claude Code CLI**: The `claude` command must be available
- **Claude Code Hooks**: Stop and SessionEnd hooks must be configured (the orchestrator will prompt for installation if missing)

### Recommended

- Use `dangerously_skip_permissions: true` only in sandboxed environments

### Starting a tmux Session

```bash
# Create a new session
tmux new -s workflow

# Or attach to existing session
tmux attach -t workflow
```

## Example Workflow Steps

### Basic Implementation Flow

```yaml
type: claude-workflow
version: 2
name: Feature Implementation

claude:
  interactive: true
  dangerously_skip_permissions: true

steps:
  - name: "Implement Feature"
    prompt: "Create a REST API endpoint for user authentication"

  - name: "Add Tests"
    prompt: "Write unit tests for the authentication endpoint"

  - name: "Code Review"
    prompt: "Review the changes for security issues and best practices"

  - name: "Commit"
    prompt: "Commit all changes with a descriptive message"
```

### Capturing Output

```yaml
steps:
  - name: "Analyze Codebase"
    prompt: "List all TODO comments in the codebase"
    output_var: todos

  - name: "Fix TODOs"
    prompt: "Address the following TODOs: {todos}"
```

### Conditional Execution

```yaml
steps:
  - name: "Check Tests"
    tool: bash
    command: "npm test"
    output_var: test_result
    on_error: continue

  - name: "Fix Failing Tests"
    prompt: "Fix the failing tests"
    when: "{test_result} contains FAILED"
```

### Multi-line Prompts

```yaml
steps:
  - name: "Complex Task"
    prompt: |
      Implement a user dashboard with:
      - User profile display
      - Recent activity feed
      - Settings panel

      Use React and TypeScript.
      Follow existing code patterns.
```

### Per-Step Model Override

You can override the workflow-level model for specific steps:

```yaml
claude:
  model: sonnet  # Default for all steps

steps:
  - name: "Quick Analysis"
    model: haiku  # Fast, cheap model for simple tasks
    prompt: "List all TODO comments in the codebase"

  - name: "Complex Implementation"
    model: opus  # Powerful model for complex tasks
    prompt: "Refactor the authentication system with proper error handling"

  - name: "Standard Task"
    prompt: "Add unit tests"  # Uses workflow default (sonnet)
```

### Restricting Tools

```yaml
claude:
  allowed_tools:
    - "Read"
    - "Bash(git:*)"  # Only git commands

steps:
  - name: "Code Review Only"
    prompt: "Review the codebase and suggest improvements (read-only)"
```

## Tips and Common Patterns

### 1. Use Specific Prompts

Be specific about what you want. Instead of:
```yaml
prompt: "fix the bug"
```

Use:
```yaml
prompt: "Fix the null pointer exception in UserService.getById() method"
```

### 2. Chain Related Steps

Break complex tasks into smaller steps:
```yaml
steps:
  - name: "Design"
    prompt: "Design the database schema for a blog system"

  - name: "Implement Models"
    prompt: "Implement the database models based on the designed schema"

  - name: "Add Migrations"
    prompt: "Create database migrations for the new models"
```

### 3. Handle Errors Gracefully

Use `on_error: continue` for non-critical steps:
```yaml
steps:
  - name: "Optional Optimization"
    prompt: "Optimize database queries if any are slow"
    on_error: continue

  - name: "Required Tests"
    prompt: "Ensure all tests pass"
    on_error: stop  # Default behavior
```

### 4. Use Variable Interpolation

Reference variables from previous steps:
```yaml
steps:
  - name: "Get Branch"
    tool: bash
    command: "git branch --show-current"
    output_var: branch

  - name: "Create PR"
    prompt: "Create a pull request for branch {branch}"
```

### 5. Large Variables Are Handled Automatically

Variables exceeding 10,000 characters are **automatically externalized** to temp files. The system:
- Writes large content to `{temp_dir}/{variable_name}.txt`
- Replaces `{var}` with `@/path/to/file.txt` in the prompt
- Claude Code reads the file via its `@filepath` syntax

This prevents prompt size errors and works transparently:
```yaml
steps:
  - name: "Get logs"
    tool: bash
    command: "cat large_logfile.txt"  # Could be 100KB+
    output_var: logs

  - name: "Analyze"
    prompt: "Find errors in: {logs}"
    # Automatically becomes: Find errors in: @/path/to/logs.txt
```

### 6. Let the Orchestrator Install Hooks

If hooks are not configured, the orchestrator will prompt you to install them before running. You can choose between global installation (affects all projects) or project-level installation.

## Troubleshooting

### "Not running inside tmux session"

Start tmux first:
```bash
tmux new -s workflow
claude-workflow /path/to/project
```

### "Claude hooks not configured" / "Claude hooks are outdated"

The orchestrator requires hooks to be configured. When prompted:
1. Choose where to install hooks (global or project-level)
2. Confirm the installation
3. The orchestrator will automatically install/update the hooks

If you prefer manual installation, add the hook configuration shown in the [Required Hook Configuration](#required-hook-configuration) section to your settings.json.

### Claude Pane Not Closing

This usually indicates an issue with the hooks:
1. Verify hooks are installed by checking `~/.claude/settings.json` or `<project>/.claude/settings.json`
2. Ensure the hook commands contain `$ORCHESTRATOR_PORT` (not a hardcoded port)
3. Check that `curl` is available in your PATH

### Steps Running Forever

Check if:
1. Hooks are configured correctly with the curl-based commands
2. Claude is waiting for user input (use `dangerously_skip_permissions: true`)
3. The prompt is causing Claude to run indefinitely
4. The HTTP server is running (check for port conflicts)

### Port Conflicts

If you see errors about port binding:
- The orchestrator automatically finds an available port starting from 7432
- Multiple orchestrator instances can run concurrently (each uses a different port)
- Check if another process is using ports in the 7432+ range

### Prompt Not Executing

Verify:
1. The `claude` command is available in your PATH
2. Your tmux session is active
3. The project path exists

### Output Variables Empty

Ensure:
1. The previous step completed successfully
2. Claude produced output (check the tmux pane)
3. Variable names match exactly (case-sensitive)

### Permission Prompts Blocking

For automated workflows, consider:
```yaml
claude:
  dangerously_skip_permissions: true
```

**Warning**: Only use this in sandboxed environments without sensitive data or network access.
