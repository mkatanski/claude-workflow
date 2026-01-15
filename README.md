# claude-workflow

**Automate Claude Code like a boss.** Define multi-step workflows in YAML, run them through tmux, and let Claude handle the heavy lifting.

---

## Quick Install

```bash
# Zero-install run with uv (recommended)
uvx claude-workflow /path/to/project

# Or install globally
uv tool install claude-workflow

# Or with pip
pip install claude-workflow
```

## Requirements

- Python 3.11+
- tmux (workflows run in a tmux pane)
- Claude Code CLI installed and authenticated
- Claude hooks (auto-installed on first run)

---

## Quick Start

**1. Start a tmux session:**

```bash
tmux new -s workflow
```

**2. Create a workflow file** in the `.claude/` directory (or any subdirectory):

```yaml
type: claude-workflow
version: 2
name: Build and Ship

steps:
  - name: Install deps
    prompt: Install all project dependencies

  - name: Run tests
    prompt: Run the test suite and fix any failures

  - name: Deploy
    prompt: Build for production and deploy
```

**3. Run it:**

```bash
claude-workflow .
```

That's it. Claude takes over.

---

## CLI Options

```
claude-workflow [project_path] [options]
```

| Option | Description |
|--------|-------------|
| `project_path` | Path to your project (default: current directory) |
| `-w, --workflow NAME` | Run a specific workflow by name |
| `-f, --file PATH` | Run a workflow from a specific file path |
| `-p, --port PORT` | Port for completion signal server (default: 7432) |

### Examples

```bash
# Interactive picker (shows all workflows in .claude/ and subdirectories)
claude-workflow .

# Run specific workflow by name
claude-workflow . -w "Build and Test"

# Run workflow from custom file location
claude-workflow . -f ~/workflows/deploy.yml

# Use a specific port (useful for avoiding conflicts)
claude-workflow . -p 8000
```

---

## Workflow File Structure

Workflows live in your project's `.claude/` directory and any subdirectories. Any `.yml` or `.yaml` file with the proper header (`type: claude-workflow`, `version: 2`) is auto-discovered recursively.

### Minimal Example

```yaml
type: claude-workflow
version: 2
name: My Workflow

steps:
  - name: Do the thing
    prompt: Make it happen
```

### Full Example with Tools

```yaml
type: claude-workflow
version: 2
name: Build Pipeline

# Claude Code settings
claude:
  interactive: true
  model: sonnet
  dangerously_skip_permissions: true  # Use with caution!

# Tmux settings
tmux:
  split: vertical
  idle_time: 5.0

steps:
  # Use a shared step
  - name: Check git status
    uses: builtin:git-status
    outputs:
      branch: current_branch

  # Run bash commands
  - name: Get files to process
    tool: bash
    command: "find src -name '*.ts' | head -10"
    output_var: files_list

  # Loop over a range of numbers
  - name: Process batches
    tool: range
    from: 1
    to: 3
    var: batch_num
    steps:
      - name: Process batch
        prompt: "Process batch {batch_num}"

  # Loop with foreach
  - name: Process files
    tool: foreach
    source: files_list
    item_var: current_file
    steps:
      - name: Process file
        prompt: "Process {current_file}"

  # Retry with condition
  - name: Run tests with retry
    tool: retry
    max_attempts: 3
    until: "{test_result} == passed"
    delay: 2
    steps:
      - name: Run tests
        tool: bash
        command: "npm test && echo passed || echo failed"
        output_var: test_result

  # Batch variable operations
  - name: Set summary variables
    tool: context
    action: set
    values:
      branch: "{current_branch}"
      status: "complete"
```

---

## Available Tools

### Core Tools

| Tool | Description |
|------|-------------|
| `claude` | Run Claude Code with a prompt (default) |
| `claude_sdk` | Use Claude SDK for structured output |
| `bash` | Execute shell commands |
| `set` | Set a variable value |

### Control Flow

| Tool | Description |
|------|-------------|
| `goto` | Jump to another step (for loops/branching) |
| `foreach` | Iterate over arrays |
| `range` | Iterate over a range of numbers (counting loops) |
| `while` | Loop while a condition is true |
| `retry` | Retry steps until success or max attempts |
| `break` | Break out of a loop |
| `continue` | Skip to next loop iteration |

### Data Manipulation

| Tool | Description |
|------|-------------|
| `context` | Batch variable operations (set, copy, clear, export) |
| `data` | Write data to temp files (JSON, text, markdown) |
| `json` | Native JSON manipulation (query, set, update, delete) |

### Integrations

| Tool | Description |
|------|-------------|
| `linear_tasks` | Fetch tasks from Linear |
| `linear_manage` | Create/update Linear issues |

---

## Shared Steps

Shared steps are reusable workflow components with defined inputs and outputs, similar to GitHub Actions composite actions.

### Using Shared Steps

```yaml
steps:
  - name: Check git status
    uses: builtin:git-status
    outputs:
      branch: current_branch
      has_changes: repo_has_changes

  - name: Commit changes
    uses: builtin:git-commit
    with:
      message: "Auto-commit from workflow"
    when: "{repo_has_changes} == true"
```

### Resolution Strategies

| Prefix | Location |
|--------|----------|
| `builtin:` | Built-in steps shipped with claude-workflow |
| `project:` | Steps in `.claude/workflows/steps/` |
| `path:` | Relative path from the workflow file |

### Built-in Shared Steps

- `builtin:git-status` - Get repository status (branch, changes, staged files)
- `builtin:git-commit` - Stage and commit changes
- `builtin:lint-fix` - Run linter and fix issues
- `builtin:run-tests` - Execute test suite

---

## Key Features

- **Multi-workflow support** - Keep multiple workflows in `.claude/`, pick interactively or by name
- **Variable interpolation** - Use `{var_name}` anywhere in prompts and commands
- **Conditional steps** - Skip steps with `when:` conditions
- **Control flow** - Loops with `foreach`, `range`, `while`; branching with `goto`; error recovery with `retry`
- **Shared steps** - Reusable step definitions with inputs/outputs (like GitHub Actions)
- **Data tools** - Native JSON manipulation, batch context operations, temp file management
- **Output capture** - Store step output in variables with `output_var`
- **Error handling** - `on_error: stop | continue` per step
- **Beautiful TUI** - Rich terminal output with progress tracking
- **Multi-instance support** - Run multiple workflows concurrently with automatic port allocation

---

## How It Works

### Completion Detection

claude-workflow uses an HTTP server to detect when Claude Code finishes a task. When Claude completes a step or ends a session, it signals the orchestrator via HTTP requests.

**Architecture:**
1. The orchestrator starts a local HTTP server (default port: 7432)
2. Claude Code hooks send HTTP requests when tasks complete
3. The orchestrator receives signals and advances to the next step

**Multi-instance Support:**

Each workflow instance uses its own port via the `ORCHESTRATOR_PORT` environment variable:
- If the default port (7432) is busy, the next available port is used automatically (7433, 7434, etc.)
- Each Claude Code process receives its assigned port through environment variables
- This allows running multiple workflows simultaneously in different tmux sessions

---

## Hooks

Hooks are **required** for the orchestrator to function. They enable Claude Code to signal task completion back to the orchestrator.

### Auto-Installation

On first run, if hooks are not configured, you'll be prompted to install them:

```
⚠ Claude hooks not configured!

Hooks are required for reliable completion detection.

Where should hooks be installed?
❯ Global (~/.claude/settings.json)
  Project (.claude/settings.json)
  Cancel
```

### Auto-Update

If your hooks are outdated (e.g., after a claude-workflow update), you'll be prompted to update them. Your other custom hooks are preserved during updates.

### Manual Installation

If you prefer manual installation, add the following to your Claude settings.json:

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

**Settings file locations:**
- Global: `~/.claude/settings.json`
- Project: `<project>/.claude/settings.json`

**Note:** After installing or updating hooks, restart Claude Code for changes to take effect

---

## Documentation

For detailed documentation on all features, tools, and configuration options, see the [docs/](docs/) folder:

- [Workflow Specification](docs/workflow-spec.md) - Complete YAML schema reference
- [Tools Reference](docs/tools.md) - Detailed docs for each tool
- [Examples](docs/examples/) - Real-world workflow examples

---

## Development

```bash
# Clone and install dev dependencies
git clone https://github.com/michalkatanski/claude-workflow
cd claude-workflow
uv sync

# Run locally
uv run claude-workflow /path/to/project
```

---

## License

MIT
