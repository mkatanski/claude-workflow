# Workflow Structure Reference

Complete specification for claude-workflow YAML files.

## Required Header

Every workflow must start with:

```yaml
type: claude-workflow
version: 2
name: "Workflow Name"
```

| Field | Required | Description |
|-------|----------|-------------|
| `type` | Yes | Must be `"claude-workflow"` |
| `version` | Yes | Must be `2` (current version) |
| `name` | Yes | Human-readable workflow name |

## Complete Workflow Structure

```yaml
type: claude-workflow
version: 2
name: "Complete Example"
description: "Optional longer description"

# Initial variables (static configuration)
vars:
  key1: "value1"
  key2: "value2"

# Claude Code configuration
claude:
  model: sonnet
  interactive: true
  dangerously_skip_permissions: false
  allowed_tools:
    - "Bash(git:*)"
    - "Edit"
    - "Read"
  cwd: /path/to/project

# Tmux pane configuration
tmux:
  new_window: false
  split: vertical

# Workflow steps
steps:
  - name: "Step 1"
    prompt: "Task description"
    output_var: result
```

**Note:** Workflow-level `inputs` are NOT supported. For dynamic configuration, load values from a config file or environment variables at the start of your workflow. See [SKILL.md](SKILL.md#step-7-handle-dynamic-configuration) for patterns.

## Workflow-Level Fields

### `vars` - Initial Variables

Pre-defined variables available throughout the workflow:

```yaml
vars:
  environment: "production"
  max_retries: "3"
  api_url: "https://api.example.com"
```

**Notes:**
- All values are strings (use quotes)
- Available via `{variable_name}` interpolation
- Can be overwritten by step outputs
- **Large variables (>10,000 chars)** are automatically externalized to temp files when used in `claude` or `claude_sdk` prompts - the system replaces them with `@filepath` references that Claude can read

### `claude` - Claude Code Configuration

Configure Claude Code behavior:

```yaml
claude:
  model: sonnet
  interactive: true
  dangerously_skip_permissions: true
  allowed_tools:
    - "Bash(git:*)"
    - "Edit"
  cwd: /path/to/project
```

| Field | Default | Description |
|-------|---------|-------------|
| `model` | - | Model: `sonnet`, `opus`, or `haiku` |
| `interactive` | `true` | Enable interactive TUI mode |
| `dangerously_skip_permissions` | `false` | Skip permission prompts |
| `allowed_tools` | all | Restrict available tools |
| `cwd` | project path | Working directory |

### `tmux` - Tmux Configuration

Configure tmux pane behavior:

```yaml
tmux:
  new_window: false
  split: vertical
```

| Field | Default | Description |
|-------|---------|-------------|
| `new_window` | `false` | Create new window vs split |
| `split` | `vertical` | Split direction: `vertical` or `horizontal` |

## Step-Level Fields

### Common Step Fields

All steps support these fields:

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Step identifier and display name |
| `tool` | No | Tool to use (default: `claude`) |
| `when` | No | Conditional execution expression |
| `on_error` | No | Error handling: `stop` (default) or `continue` |
| `output_var` | No | Variable to store step output |
| `visible` | No | Show step in output (default: `true`) |

### Claude Step (Default)

Execute a Claude Code prompt:

```yaml
- name: "Implement feature"
  prompt: "Create a login form component"
  output_var: implementation_result
  model: opus  # Optional per-step model override
```

| Field | Required | Description |
|-------|----------|-------------|
| `prompt` | Yes | The prompt to send to Claude |
| `model` | No | Override workflow model for this step |

### Bash Step

Execute shell commands:

```yaml
- name: "Run tests"
  tool: bash
  command: "npm test"
  output_var: test_output
```

| Field | Required | Description |
|-------|----------|-------------|
| `command` | Yes | Shell command to execute |

### Set Step

Set a single variable:

```yaml
- name: "Set status"
  tool: set
  var: status
  value: "ready"
```

| Field | Required | Description |
|-------|----------|-------------|
| `var` | Yes | Variable name |
| `value` | Yes | Value to set (supports interpolation) |

### Shared Step

Use a shared step:

```yaml
- shared: shared-step-name
  with:
    param1: "value1"
    param2: "{dynamic_value}"
```

| Field | Required | Description |
|-------|----------|-------------|
| `shared` | Yes | Name of shared step file |
| `with` | No | Parameters to pass to shared step |

## Conditional Execution

Use `when` for conditional step execution:

```yaml
- name: "Deploy to production"
  prompt: "Deploy the application"
  when: "{environment} == production"
```

### Condition Operators

| Operator | Example |
|----------|---------|
| `==` | `{status} == success` |
| `!=` | `{status} != error` |
| `>`, `>=`, `<`, `<=` | `{count} > 0` |
| `contains` | `{output} contains error` |
| `not contains` | `{result} not contains failed` |
| `starts with` | `{path} starts with /api` |
| `ends with` | `{file} ends with .ts` |
| `is empty` | `{response} is empty` |
| `is not empty` | `{data} is not empty` |
| `and` | `{a} == 1 and {b} == 2` |
| `or` | `{x} == true or {y} == true` |

## Variable Interpolation

Use `{variable_name}` to interpolate variables:

```yaml
- name: "Use variables"
  prompt: "Process file {filename} in {directory}"

- name: "Nested access"
  prompt: "User name is {user.name}, email is {user.email}"
```

### Interpolation Contexts

Variables can be used in:
- `prompt` - Claude prompts
- `command` - Bash commands
- `value` - Set values
- `when` - Condition expressions
- `with` - Shared step parameters
- `file` - File paths
- `content` - Data tool content

## Error Handling

### Step-Level Error Handling

```yaml
- name: "Risky operation"
  tool: bash
  command: "might-fail.sh"
  on_error: continue  # Continue workflow even if step fails
```

### Capturing Errors

When a step fails with `on_error: continue`, the error is available in `{step_error}`.

## Output Variables

Capture step output with `output_var`:

```yaml
- name: "Get branch"
  tool: bash
  command: "git branch --show-current"
  output_var: current_branch

- name: "Use branch"
  prompt: "Create PR for branch {current_branch}"
```

### Output Types

| Tool | Output Content |
|------|----------------|
| `claude` | Claude's response text |
| `bash` | Command stdout |
| `set` | The set value |
| `json` (query) | Extracted JSON value |
| `linear_tasks` (get) | Issue JSON data |
| `data` | File path |

## Full Example

```yaml
type: claude-workflow
version: 2
name: "Feature Implementation"
description: |
  Implement a feature from Linear issue.

  USAGE: Create .claude/workflows.config.json with:
  { "issue_id": "ENG-123" }

vars:
  max_retries: "3"
  issue_id: ""  # Required - set via config file

claude:
  model: sonnet
  dangerously_skip_permissions: true

steps:
  # Load issue_id from config
  - name: "Load config"
    tool: bash
    command: "cat .claude/workflows.config.json"
    output_var: config_json

  - name: "Get issue_id"
    tool: json
    action: query
    source: config_json
    query: ".issue_id"
    output_var: issue_id

  - name: "Fetch issue"
    tool: linear_tasks
    action: get
    issue_id: "{issue_id}"
    output_var: issue

  - name: "Start work"
    tool: linear_manage
    action: update
    issue_id: "{issue_id}"
    status: "In Progress"

  - name: "Create branch"
    tool: bash
    command: "git checkout -b feature/{issue_id}"

  - name: "Implement feature"
    model: opus
    prompt: |
      Implement the following feature:

      Title: {issue.title}
      Description: {issue.description}

      Create the necessary code changes.
    output_var: implementation

  - name: "Run tests"
    tool: retry
    max_attempts: 3
    until: "{test_result} == 0"
    delay: 5
    steps:
      - name: "Execute tests"
        tool: bash
        command: "npm test && echo 0 || echo 1"
        output_var: test_result

      - name: "Fix if needed"
        prompt: "Fix the failing tests"
        when: "{test_result} != 0"

  - name: "Commit changes"
    shared: git-commit
    with:
      message: "{issue_id}: {issue.title}"

  - name: "Mark complete"
    tool: linear_manage
    action: update
    issue_id: "{issue_id}"
    status: "Done"
```
