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

---

## Quick Start

**1. Start a tmux session:**

```bash
tmux new -s workflow
```

**2. Create a workflow file** at `.claude/workflow.yml` in your project:

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

### Examples

```bash
# Interactive picker (shows all workflows in .claude/)
claude-workflow .

# Run specific workflow by name
claude-workflow . -w "Build and Test"

# Run workflow from custom file location
claude-workflow . -f ~/workflows/deploy.yml
```

---

## Workflow File Structure

Workflows live in your project's `.claude/` directory. Any `.yml` or `.yaml` file with the proper header is auto-discovered.

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
  # Run bash commands
  - name: Check status
    tool: bash
    command: "git status --porcelain"
    output_var: git_status

  # Conditional execution
  - name: Commit changes
    prompt: Commit all changes with a descriptive message
    when: "{git_status} is not empty"

  # Loop with foreach
  - name: Process files
    tool: foreach
    source: files_list
    item_var: current_file
    steps:
      - name: Process file
        prompt: "Process {current_file}"
```

---

## Available Tools

| Tool | Description |
|------|-------------|
| `claude` | Run Claude Code with a prompt (default) |
| `claude_sdk` | Use Claude SDK for structured output |
| `bash` | Execute shell commands |
| `set` | Set a variable value |
| `goto` | Jump to another step (for loops/branching) |
| `foreach` | Iterate over arrays |
| `break` | Break out of a foreach loop |
| `continue` | Skip to next foreach iteration |
| `linear_tasks` | Fetch tasks from Linear |
| `linear_manage` | Create/update Linear issues |

---

## Key Features

- **Multi-workflow support** - Keep multiple workflows in `.claude/`, pick interactively or by name
- **Variable interpolation** - Use `{var_name}` anywhere in prompts and commands
- **Conditional steps** - Skip steps with `when:` conditions
- **Control flow** - Loops with `foreach`, branching with `goto`
- **Output capture** - Store step output in variables with `output_var`
- **Error handling** - `on_error: stop | continue` per step
- **Beautiful TUI** - Rich terminal output with progress tracking

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
