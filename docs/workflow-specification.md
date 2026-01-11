# Workflow Specification

This document provides a comprehensive specification for claude-workflow YAML files.

## Table of Contents

- [Overview](#overview)
- [File Structure](#file-structure)
- [Required Fields](#required-fields)
- [Configuration Sections](#configuration-sections)
  - [claude](#claude-configuration)
  - [claude_sdk](#claude_sdk-configuration)
  - [tmux](#tmux-configuration)
- [Steps](#steps)
  - [Common Step Fields](#common-step-fields)
  - [Error Handling](#error-handling)
- [Variable System](#variable-system)
  - [Variable Interpolation](#variable-interpolation)
  - [Reserved Variables](#reserved-variables)
  - [Nested Object Access](#nested-object-access)
- [Conditions System](#conditions-system)
  - [Operators](#operators)
  - [Compound Conditions](#compound-conditions)
- [Control Flow](#control-flow)
  - [Goto](#goto)
  - [Break and Continue](#break-and-continue)
- [Tools Reference](#tools-reference)
  - [claude](#claude-tool)
  - [claude_sdk](#claude_sdk-tool)
  - [bash](#bash-tool)
  - [set](#set-tool)
  - [goto](#goto-tool)
  - [foreach](#foreach-tool)
  - [break](#break-tool)
  - [continue](#continue-tool)
  - [linear_tasks](#linear_tasks-tool)
  - [linear_manage](#linear_manage-tool)
- [Multiple Workflows](#multiple-workflows)
- [Complete Examples](#complete-examples)
- [CLI Options](#cli-options)
- [Hook Requirements](#hook-requirements)

---

## Overview

A workflow file defines a sequence of automated steps that can invoke Claude Code, execute bash commands, interact with Linear, and perform control flow operations. Workflows are written in YAML format and stored in a project's `.claude/` directory.

## File Structure

```yaml
type: claude-workflow
version: 2

name: "My Workflow"

# Optional configuration sections
claude:
  # Claude Code settings

claude_sdk:
  # Claude SDK tool defaults

tmux:
  # Tmux pane settings

# Required: list of steps
steps:
  - name: "Step Name"
    tool: claude
    prompt: "Do something"
```

## Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Must be `"claude-workflow"` |
| `version` | integer | Must be `2` |
| `name` | string | Human-readable workflow name |
| `steps` | list | Array of step definitions |

---

## Configuration Sections

### claude Configuration

Controls Claude Code CLI behavior for `claude` tool steps.

```yaml
claude:
  interactive: true
  cwd: /path/to/project
  model: sonnet
  dangerously_skip_permissions: false
  allowed_tools:
    - "Bash(git:*)"
    - "Edit"
    - "Read"
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `interactive` | boolean | `true` | Enable full TUI experience |
| `cwd` | string | project path | Working directory for Claude |
| `model` | string | none | Model to use: `sonnet`, `opus`, or `haiku` |
| `dangerously_skip_permissions` | boolean | `false` | Bypass permission checks (use with caution) |
| `allowed_tools` | list/string | none | Restrict which tools Claude can use |

### claude_sdk Configuration

Default settings for `claude_sdk` tool steps.

```yaml
claude_sdk:
  system_prompt: "You are a helpful assistant..."
  model: sonnet
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `system_prompt` | string | built-in | Default system prompt for all claude_sdk steps |
| `model` | string | `"sonnet"` | Default model alias: `sonnet`, `opus`, or `haiku` |

### tmux Configuration

Controls tmux pane behavior for visible steps.

```yaml
tmux:
  new_window: false
  split: vertical
  idle_time: 5.0
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `new_window` | boolean | `false` | Create new window instead of split pane |
| `split` | string | `"vertical"` | Split direction: `vertical` or `horizontal` |
| `idle_time` | float | `3.0` | Seconds of inactivity before considering step complete |

---

## Steps

### Common Step Fields

Every step supports these fields:

```yaml
- name: "Step Name"
  tool: claude
  prompt: "Do something"
  output_var: result
  on_error: stop
  visible: false
  cwd: /custom/path
  when: "{variable} is not empty"
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | string | required | Unique identifier for the step |
| `tool` | string | `"claude"` | Tool to execute: `claude`, `claude_sdk`, `bash`, `set`, `goto`, `foreach`, `break`, `continue`, `linear_tasks`, `linear_manage` |
| `output_var` | string | none | Variable name to store step output |
| `on_error` | string | `"stop"` | Error handling: `stop` or `continue` |
| `visible` | boolean | `false` | Show execution in tmux pane (for `bash` tool) |
| `cwd` | string | project path | Working directory for this step |
| `when` | string | none | Condition that must be true to execute step |

### Error Handling

The `on_error` field controls behavior when a step fails:

- `stop` (default): Stop workflow execution immediately
- `continue`: Log the error and proceed to next step

```yaml
- name: "Optional Step"
  tool: bash
  command: "optional-command || true"
  on_error: continue
```

---

## Variable System

### Variable Interpolation

Variables are referenced using `{variable_name}` syntax in prompts, commands, and other string fields.

```yaml
- name: "Set User"
  tool: set
  var: username
  value: "john"

- name: "Greet User"
  prompt: "Say hello to {username}"
```

### Reserved Variables

Some variables are automatically populated:

| Variable | Description |
|----------|-------------|
| Step output | The `output_var` from previous steps |
| Loop variables | `item_var` and `index_var` in foreach loops |

### Nested Object Access

For JSON outputs, use dot notation to access nested fields:

```yaml
- name: "Get Issue"
  tool: linear_tasks
  action: get
  issue_id: "ABC-123"
  output_var: issue

- name: "Show Title"
  tool: bash
  command: "echo 'Title: {issue.title}'"

# Array index access
- name: "First Label"
  tool: bash
  command: "echo 'Label: {issue.labels.0.name}'"
```

Supported access patterns:
- Simple: `{variable}`
- Nested: `{object.field.subfield}`
- Array index: `{array.0.field}`

---

## Conditions System

Use the `when` field to conditionally execute steps.

### Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `is empty` | Value is empty/whitespace | `{var} is empty` |
| `is not empty` | Value has content | `{var} is not empty` |
| `contains` | Substring match (case-insensitive) | `{var} contains "error"` |
| `not contains` | Substring not present | `{var} not contains "skip"` |
| `starts with` | Prefix match (case-insensitive) | `{var} starts with "http"` |
| `ends with` | Suffix match (case-insensitive) | `{var} ends with ".js"` |
| `==` | Equality (string or numeric) | `{var} == "value"` |
| `!=` | Inequality | `{var} != "value"` |
| `>` | Greater than (numeric) | `{count} > 10` |
| `>=` | Greater than or equal | `{count} >= 1` |
| `<` | Less than (numeric) | `{count} < 100` |
| `<=` | Less than or equal | `{phase} <= 3` |

### Compound Conditions

Combine conditions with `and` / `or`:

```yaml
when: "{status} == ready and {count} > 0"
when: "{error} is empty or {retry} == true"
```

### Examples

```yaml
# Only commit if there are changes
- name: "Commit"
  prompt: "Commit all changes"
  when: "{git_status} is not empty"

# Loop continuation
- name: "Continue Loop"
  tool: goto
  target: "Process Item"
  when: "{index} < 10"

# Multiple conditions
- name: "Deploy"
  prompt: "Deploy to production"
  when: "{tests_passed} == true and {branch} == main"
```

---

## Control Flow

### Goto

Jump to a named step, enabling loops and branching:

```yaml
- name: "Start Loop"
  tool: set
  var: counter
  value: "1"

- name: "Process"
  prompt: "Process item {counter}"

- name: "Increment"
  tool: bash
  command: "echo $(( {counter} + 1 ))"
  output_var: counter

- name: "Loop Back"
  tool: goto
  target: "Process"
  when: "{counter} <= 5"

- name: "Done"
  prompt: "Loop complete"
```

### Break and Continue

Control flow within `foreach` loops:

```yaml
- name: "Process Items"
  tool: foreach
  source: items
  item_var: item
  steps:
    - name: "Check Skip"
      tool: continue
      when: "{item} starts with skip_"

    - name: "Check Stop"
      tool: break
      when: "{item} == STOP"

    - name: "Process"
      prompt: "Process {item}"
```

---

## Tools Reference

### claude Tool

Execute Claude Code with a prompt in a tmux pane.

```yaml
- name: "Implement Feature"
  tool: claude
  prompt: |
    Implement the user authentication feature.
    Use JWT tokens for session management.
```

| Field | Required | Description |
|-------|----------|-------------|
| `prompt` | yes | The prompt to send to Claude Code |

### claude_sdk Tool

AI-powered decision making with structured outputs.

```yaml
# Boolean decision
- name: "Should Deploy"
  tool: claude_sdk
  prompt: "Based on the test results, should we deploy?"
  output_type: boolean
  output_var: deploy_decision

# Enum selection
- name: "Choose Priority"
  tool: claude_sdk
  prompt: "Analyze the issue and determine priority"
  output_type: enum
  values: ["low", "medium", "high", "critical"]
  output_var: priority

# Decision with goto
- name: "Route Request"
  tool: claude_sdk
  prompt: "Determine the next step based on request type"
  output_type: decision
  # Returns: {"goto": "step_name", "reason": "explanation"}

# Custom schema
- name: "Extract Data"
  tool: claude_sdk
  prompt: "Extract user information from the document"
  output_type: schema
  schema:
    type: object
    properties:
      name:
        type: string
      email:
        type: string
      age:
        type: integer
    required: ["name", "email"]
  output_var: user_data
```

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `prompt` | yes | - | The prompt for analysis |
| `output_type` | no | none | Output format: `boolean`, `enum`, `decision`, `schema` |
| `values` | if enum | - | Allowed values for enum type |
| `schema` | if schema | - | JSON schema for structured output |
| `model` | no | workflow default | Model alias: `sonnet`, `opus`, `haiku` |
| `system_prompt` | no | workflow default | Override system prompt |
| `max_retries` | no | 3 | Schema validation retry attempts |
| `max_turns` | no | 10 | Maximum SDK agentic turns |
| `timeout` | no | 60000 | Timeout in milliseconds |
| `verbose` | no | false | Include full transcript in output |

**Model Aliases:**
- `sonnet` -> `claude-sonnet-4-20250514`
- `opus` -> `claude-opus-4-5-20251101`
- `haiku` -> `claude-haiku-3-5-20241022`

### bash Tool

Execute shell commands.

```yaml
# Background execution (default)
- name: "Check Status"
  tool: bash
  command: "git status --porcelain"
  output_var: git_status

# Visible in tmux
- name: "Run Build"
  tool: bash
  command: "npm run build"
  visible: true

# With custom working directory
- name: "List Files"
  tool: bash
  command: "ls -la"
  cwd: /path/to/directory

# Preserve whitespace in output
- name: "Get Content"
  tool: bash
  command: "cat file.txt"
  strip_output: false
```

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `command` | yes | - | Shell command to execute |
| `visible` | no | false | Run in visible tmux pane |
| `cwd` | no | project path | Working directory |
| `strip_output` | no | true | Strip whitespace from output |

### set Tool

Assign values to variables.

```yaml
- name: "Set Counter"
  tool: set
  var: counter
  value: "0"

- name: "Set From Variable"
  tool: set
  var: backup
  value: "{current_value}"
```

| Field | Required | Description |
|-------|----------|-------------|
| `var` | yes | Variable name to set |
| `value` | yes | Value (supports interpolation) |

### goto Tool

Jump to another step.

```yaml
- name: "Skip to End"
  tool: goto
  target: "Final Step"

- name: "Conditional Jump"
  tool: goto
  target: "Error Handler"
  when: "{status} != success"
```

| Field | Required | Description |
|-------|----------|-------------|
| `target` | yes | Name of step to jump to |

### foreach Tool

Iterate over an array.

```yaml
- name: "Get Files"
  tool: bash
  command: "echo '[\"file1.js\", \"file2.js\", \"file3.js\"]'"
  output_var: files

- name: "Process Each File"
  tool: foreach
  source: files
  item_var: file
  index_var: idx
  on_item_error: continue
  steps:
    - name: "Log Progress"
      tool: bash
      command: "echo 'Processing {idx}: {file}'"

    - name: "Process File"
      prompt: "Review and improve {file}"
```

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `source` | yes | - | Variable containing JSON array |
| `item_var` | yes | - | Variable name for current item |
| `index_var` | no | - | Variable name for current index |
| `steps` | yes | - | Nested steps to execute per item |
| `on_item_error` | no | `"stop"` | Error handling: `stop`, `stop_loop`, `continue` |

**on_item_error values:**
- `stop`: Stop loop AND workflow
- `stop_loop`: Stop loop, continue workflow
- `continue`: Log error, continue to next item

### break Tool

Exit the current foreach loop.

```yaml
- name: "Exit Loop"
  tool: break
  when: "{found} == true"
```

### continue Tool

Skip to the next iteration.

```yaml
- name: "Skip This Item"
  tool: continue
  when: "{item} is empty"
```

### linear_tasks Tool

Fetch and query Linear issues.

```yaml
# Get next available issue
- name: "Get Next Task"
  tool: linear_tasks
  action: get_next
  team: ENG
  project: "Backend API"
  status: "Todo"
  labels:
    - "bug"
    - "priority"
  skip_blocked: true
  output_var: issue_id

# Get issue details
- name: "Get Issue"
  tool: linear_tasks
  action: get
  issue_id: "{issue_id}"
  output_var: issue

# Assign issue
- name: "Assign to Me"
  tool: linear_tasks
  action: assign
  issue_id: "{issue_id}"
  assignee: "user-id-or-email"
```

**Actions:**

| Action | Required Fields | Description |
|--------|-----------------|-------------|
| `get_next` | `team` | Get next available issue matching filters |
| `get` | `issue_id` | Fetch full issue details |
| `assign` | `issue_id`, `assignee` | Assign issue to user |

**Filter fields for get_next:**

| Field | Type | Description |
|-------|------|-------------|
| `team` | string | Team key or name |
| `project` | string | Project name |
| `priority` | integer | Priority level (0-4) |
| `labels` | list/string | Label names |
| `status` | string | Workflow state name |
| `assignee` | string | User identifier |
| `skip_blocked` | boolean | Skip blocked issues (default: true) |
| `filter` | object | Custom GraphQL filter |

### linear_manage Tool

Create and manage Linear issues.

```yaml
# Create issue
- name: "Create Bug Report"
  tool: linear_manage
  action: create
  team: ENG
  title: "Bug: {error_message}"
  description: |
    Found during automated testing.
    Details: {error_details}
  priority: 2
  labels:
    - "bug"
    - "automated"
  output_var: new_issue

# Update issue
- name: "Update Status"
  tool: linear_manage
  action: update
  issue_id: "{issue_id}"
  status: "In Progress"
  assignee: "current-user"

# Add comment
- name: "Add Progress Note"
  tool: linear_manage
  action: comment
  issue_id: "{issue_id}"
  body: |
    Progress update:
    - Completed step 1
    - Working on step 2
```

**Actions:**

| Action | Required Fields | Description |
|--------|-----------------|-------------|
| `create` | `team`, `title` | Create new issue |
| `update` | `issue_id` | Update issue fields |
| `comment` | `issue_id`, `body` | Add comment to issue |

**Fields for create/update:**

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Issue title |
| `description` | string | Issue description (markdown) |
| `team` | string | Team key (create only) |
| `project` | string | Project name |
| `priority` | integer | Priority level (0-4) |
| `labels` | list/string | Label names |
| `status` | string | Workflow state name |
| `assignee` | string | User identifier |

---

## Multiple Workflows

A project can contain multiple workflow files in the `.claude/` directory. Each file must have:

1. `type: claude-workflow` marker
2. `version: 2` field
3. Unique `name` field

The CLI will discover all valid workflows and allow selection.

**Example structure:**
```
project/
  .claude/
    deploy.yml          # type: claude-workflow, name: "Deploy Pipeline"
    test.yml            # type: claude-workflow, name: "Test Suite"
    code-review.yml     # type: claude-workflow, name: "Code Review"
```

**Running workflows:**
```bash
# Interactive selection
claude-workflow /path/to/project

# Direct file path
claude-workflow -f /path/to/project/.claude/deploy.yml

# By name (if unique match)
claude-workflow /path/to/project --workflow "Deploy"

# With custom server port
claude-workflow /path/to/project --port 8000
```

---

## Complete Examples

### Basic Claude Workflow

```yaml
type: claude-workflow
version: 2

name: "Feature Implementation"

claude:
  interactive: true
  dangerously_skip_permissions: true

steps:
  - name: "Implement Feature"
    prompt: "Implement the user authentication feature"

  - name: "Add Tests"
    prompt: "Add unit tests for the new feature"

  - name: "Code Review"
    prompt: "Review the changes for issues and best practices"

  - name: "Commit"
    prompt: "Commit all changes with a descriptive message"
```

### Loop with Phases

```yaml
type: claude-workflow
version: 2

name: "Phased Implementation"

steps:
  - name: "Initialize"
    tool: set
    var: phase
    value: "1"

  - name: "Implement Phase"
    prompt: "Implement phase {phase} of the project"

  - name: "Increment Phase"
    tool: bash
    command: "echo $(( {phase} + 1 ))"
    output_var: phase

  - name: "Loop Check"
    tool: goto
    target: "Implement Phase"
    when: "{phase} <= 3"

  - name: "Complete"
    prompt: "Generate summary of all phases"
```

### ForEach with Items

```yaml
type: claude-workflow
version: 2

name: "Batch File Processing"

steps:
  - name: "List Files"
    tool: bash
    command: "find . -name '*.ts' -type f | head -5 | jq -R -s -c 'split(\"\n\") | map(select(. != \"\"))'"
    output_var: files

  - name: "Process Each File"
    tool: foreach
    source: files
    item_var: file
    index_var: idx
    on_item_error: continue
    steps:
      - name: "Skip Test Files"
        tool: continue
        when: "{file} contains .test."

      - name: "Review File"
        prompt: "Review {file} for code quality issues"

      - name: "Log Complete"
        tool: bash
        command: "echo 'Completed {idx}: {file}'"
```

### Linear Integration

```yaml
type: claude-workflow
version: 2

name: "Issue Processing"

steps:
  - name: "Get Next Issue"
    tool: linear_tasks
    action: get_next
    team: ENG
    status: "Todo"
    labels:
      - "automated"
    output_var: issue_id

  - name: "Check Issue Found"
    tool: goto
    target: "No Issues"
    when: "{issue_id} is empty"

  - name: "Get Issue Details"
    tool: linear_tasks
    action: get
    issue_id: "{issue_id}"
    output_var: issue

  - name: "Update Status"
    tool: linear_manage
    action: update
    issue_id: "{issue_id}"
    status: "In Progress"

  - name: "Implement"
    prompt: |
      Implement the following issue:

      Title: {issue.title}
      Description: {issue.description}

  - name: "Add Comment"
    tool: linear_manage
    action: comment
    issue_id: "{issue_id}"
    body: "Completed implementation via automated workflow"

  - name: "Mark Done"
    tool: linear_manage
    action: update
    issue_id: "{issue_id}"
    status: "Done"

  - name: "Done"
    tool: set
    var: complete
    value: "true"

  - name: "No Issues"
    tool: bash
    command: "echo 'No issues to process'"
```

### AI Decision Making

```yaml
type: claude-workflow
version: 2

name: "Smart Router"

claude_sdk:
  model: sonnet
  system_prompt: "You are a routing assistant that analyzes requests and determines the best handler."

steps:
  - name: "Analyze Request"
    tool: claude_sdk
    prompt: |
      Analyze this request and determine the appropriate handler:

      Request: {request}

      Available handlers:
      - "Handle API": For API-related requests
      - "Handle UI": For UI/frontend requests
      - "Handle Data": For database/data requests
      - "Handle Other": For everything else
    output_type: decision

  - name: "Handle API"
    prompt: "Process the API request: {request}"
    when: "false"  # Reached via goto from decision

  - name: "Handle UI"
    prompt: "Process the UI request: {request}"
    when: "false"

  - name: "Handle Data"
    prompt: "Process the data request: {request}"
    when: "false"

  - name: "Handle Other"
    prompt: "Process the general request: {request}"
    when: "false"

  - name: "Complete"
    prompt: "Generate summary of request handling"
```

---

## CLI Options

The `claude-workflow` command supports the following options:

```bash
claude-workflow [project_path] [options]
```

| Option | Short | Default | Description |
|--------|-------|---------|-------------|
| `project_path` | - | `.` | Path to the project containing `.claude/` workflows |
| `--workflow` | `-w` | none | Name of the workflow to run (from `name` field) |
| `--file` | `-f` | none | Direct path to a workflow file |
| `--port` | `-p` | `7432` | Port for the completion signal server |

### Port Configuration

The orchestrator runs a local HTTP server to receive completion signals from Claude Code via hooks. By default, it uses port `7432`.

```bash
# Use default port (7432)
claude-workflow /path/to/project

# Specify a custom port
claude-workflow /path/to/project --port 8000
claude-workflow /path/to/project -p 8000
```

**Port Auto-Discovery:** If the specified port is busy, the orchestrator automatically finds the next available port. When this happens, a message is displayed:

```
Port 7432 busy, using 7433
```

The `ORCHESTRATOR_PORT` environment variable is set automatically for hook communication, so workflows work correctly regardless of which port is used.

---

## Hook Requirements

Workflows that use the `claude` tool (Claude Code CLI) require hooks to be configured in your Claude settings. Hooks enable reliable detection of when Claude Code completes its work.

### Automatic Hook Installation

When you run a workflow that uses the `claude` tool, the CLI checks for required hooks:

1. **Missing Hooks:** If no hooks are found, you'll be prompted to install them:
   ```
   ⚠ Claude hooks not configured!

   Hooks are required for reliable completion detection.

   ? Where should hooks be installed?
   ❯ Global (~/.claude/settings.json)
     Project (.claude/settings.json)
     Cancel
   ```

2. **Outdated Hooks:** If hooks exist but are outdated, you'll be prompted to update them:
   ```
   ⚠ Claude hooks are outdated!

   Hooks in ~/.claude/settings.json need to be updated.
   Your other custom hooks will be preserved.

   ? Update hooks now? (Y/n)
   ```

3. **Current Hooks:** If hooks are up-to-date, the workflow runs immediately.

### Hook Locations

Hooks can be installed in two locations:

| Location | Path | Scope |
|----------|------|-------|
| Global | `~/.claude/settings.json` | All projects |
| Project | `<project>/.claude/settings.json` | Single project |

Project-level hooks take priority over global hooks.

### Manual Hook Configuration

If automatic installation fails, you can manually add hooks to your `settings.json`:

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

After installing or updating hooks, restart Claude Code for changes to take effect.

### Workflows Without Hooks

Workflows that only use tools like `bash`, `set`, `claude_sdk`, `linear_tasks`, etc. do not require hooks. The hook check is skipped for these workflows.

---

## Error Messages

Common validation errors and their solutions:

| Error | Solution |
|-------|----------|
| `Missing 'type' field` | Add `type: claude-workflow` |
| `Missing 'version' field` | Add `version: 2` |
| `Unknown tool` | Check tool name spelling |
| `Goto target not found` | Ensure target step name exists |
| `Source variable not found` | Ensure variable is set before foreach |
| `Invalid condition syntax` | Check operator spelling and format |
| `Cannot run without hooks configured` | Install hooks via the interactive prompt or manually |
| `Cannot run with outdated hooks` | Update hooks via the interactive prompt or manually |
| `Port X busy, using Y` | Informational - the next available port was used |
