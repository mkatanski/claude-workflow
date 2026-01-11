# claude-workflow

A terminal-based orchestrator for running Claude Code workflows defined in YAML files.

## Installation

### Quick Start (Recommended)

```bash
# One-time: Install uv (if not already installed)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Run without installing
uvx claude-workflow /path/to/project
```

### Permanent Installation

```bash
uv tool install claude-workflow
```

## Requirements

- Python 3.11+
- tmux (must be running in a tmux session)

## Usage

```bash
# Start a tmux session first
tmux new -s workflow

# Run with interactive workflow picker
claude-workflow /path/to/project

# Run specific workflow by name
claude-workflow /path/to/project -w "Build and Test"

# Run specific workflow file
claude-workflow /path/to/project -f /path/to/workflow.yml
```

## Workflow Files

Workflows are defined in YAML files in your project's `.claude/` directory.

### Example Workflow

```yaml
type: claude-workflow
version: 2
name: Build and Test

steps:
  - name: Install dependencies
    prompt: Install all project dependencies

  - name: Run tests
    prompt: Run the test suite and fix any failures

  - name: Build
    prompt: Build the project for production
```

### Required Fields

- `type: claude-workflow` - Identifies the file as a workflow
- `version: 2` - Workflow format version
- `name` - Display name for the workflow
- `steps` - List of steps to execute

## Updating

```bash
# Always run latest version
uvx claude-workflow@latest /path/to/project

# Or upgrade installed tool
uv tool upgrade claude-workflow
```

## License

MIT
