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
  - [range](#range-tool)
  - [while](#while-tool)
  - [retry](#retry-tool)
  - [break](#break-tool)
  - [continue](#continue-tool)
  - [context](#context-tool)
  - [data](#data-tool)
  - [json](#json-tool)
  - [linear_tasks](#linear_tasks-tool)
  - [linear_manage](#linear_manage-tool)
- [Shared Steps](#shared-steps)
  - [Overview](#shared-steps-overview)
  - [Creating Shared Steps](#creating-shared-steps)
  - [Using Shared Steps](#using-shared-steps)
  - [Resolution Strategies](#resolution-strategies)
  - [Inputs and Outputs](#inputs-and-outputs)
- [Multiple Workflows](#multiple-workflows)
- [Complete Examples](#complete-examples)
- [CLI Options](#cli-options)
- [Hook Requirements](#hook-requirements)

---

## Overview

A workflow file defines a sequence of automated steps that can invoke Claude Code, execute bash commands, interact with Linear, and perform control flow operations. Workflows are written in YAML format and stored in a project's `.claude/` directory or any of its subdirectories. Files are discovered recursively.

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
| `tool` | string | `"claude"` | Tool to execute: `claude`, `claude_sdk`, `bash`, `set`, `goto`, `foreach`, `range`, `while`, `retry`, `break`, `continue`, `context`, `data`, `json`, `linear_tasks`, `linear_manage` |
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

### Large Variable Externalization

Variables exceeding 10,000 characters are **automatically externalized** when used in `claude` or `claude_sdk` tool prompts:

- Large content is written to `{temp_dir}/{variable_name}.txt`
- The prompt receives `@/path/to/file.txt` instead of inline content
- Claude reads the file using the `@filepath` syntax
- Files are automatically cleaned up when the workflow ends

This happens transparently - no special handling needed:

```yaml
steps:
  - name: "Get large data"
    tool: bash
    command: "cat huge_file.txt"
    output_var: data  # Could be 100KB+

  - name: "Process"
    prompt: "Analyze: {data}"
    # Automatically becomes: Analyze: @/path/to/data.txt
```

For nested paths like `{result.data.content}`, the filename uses underscores: `result_data_content.txt`.

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

Assign values to variables. Supports two modes: simple value assignment with interpolation, or expression evaluation with arithmetic and conditionals.

```yaml
# Simple value assignment
- name: "Set Counter"
  tool: set
  var: counter
  value: "0"

# Value with interpolation
- name: "Set From Variable"
  tool: set
  var: backup
  value: "{current_value}"

# Expression evaluation
- name: "Calculate Total"
  tool: set
  var: total
  expr: "{count} * {price}"

# Conditional expression
- name: "Set Status"
  tool: set
  var: status
  expr: "if({score} >= 80, 'pass', 'fail')"
```

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `var` | yes | - | Variable name to set |
| `value` | no* | - | Value (supports interpolation) |
| `expr` | no* | - | Expression to evaluate (arithmetic, comparisons, conditionals) |

*Either `value` or `expr` is required, but not both.

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

### range Tool

Execute nested steps for a range of numbers. A simple counting loop that iterates from a start value to an end value (inclusive).

```yaml
# Basic counting loop
- name: "Process 5 Batches"
  tool: range
  from: 1
  to: 5
  var: batch_num
  steps:
    - name: "Process Batch"
      tool: bash
      command: "process-batch.sh {batch_num}"

# With custom step value
- name: "Process Even Numbers"
  tool: range
  from: 2
  to: 10
  step: 2
  var: num
  steps:
    - name: "Handle Number"
      prompt: "Process even number {num}"

# Counting down
- name: "Countdown"
  tool: range
  from: 10
  to: 1
  step: -1
  var: count
  steps:
    - name: "Show Count"
      tool: bash
      command: "echo 'Countdown: {count}'"
```

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `from` | yes | - | Start value (integer) |
| `to` | yes | - | End value (integer, inclusive) |
| `step` | no | `1` | Increment value (cannot be 0) |
| `var` | yes | - | Variable name for current value |
| `steps` | yes | - | Nested steps to execute per iteration |

**Automatic variables:**
- `{var}`: Current value in the range
- `{_iteration}`: Zero-based iteration index

### while Tool

Execute nested steps while a condition is true. Requires `max_iterations` as a safety limit to prevent infinite loops.

```yaml
# Process while condition is true
- name: "Process All Pending Items"
  tool: while
  condition: "{status} == has_next"
  max_iterations: 50
  steps:
    - name: "Get Next Item"
      tool: bash
      command: "get-next-item.sh"
      output_var: status
    - name: "Process Item"
      prompt: "Process the retrieved item"

# With continue on max reached
- name: "Poll Until Ready"
  tool: while
  condition: "{ready} != true"
  max_iterations: 10
  on_max_reached: continue
  steps:
    - name: "Check Status"
      tool: bash
      command: "check-status.sh"
      output_var: ready
```

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `condition` | yes | - | Condition to evaluate before each iteration |
| `max_iterations` | yes | - | Maximum iterations (safety limit) |
| `on_max_reached` | no | `"error"` | Behavior when max reached: `error` or `continue` |
| `steps` | yes | - | Nested steps to execute per iteration |

**Automatic variables:**
- `{_iteration}`: Zero-based iteration index

### retry Tool

Retry steps until success or max attempts reached. Useful for flaky operations or implementing fix-and-retry patterns.

```yaml
# Basic retry with condition
- name: "Run Tests with Retry"
  tool: retry
  max_attempts: 3
  until: "{test_exit_code} == 0"
  delay: 2
  steps:
    - name: "Run Tests"
      tool: bash
      command: "npm test; echo $?"
      output_var: test_exit_code
    - name: "Fix if Failed"
      tool: claude
      prompt: "Fix the test failures..."
      when: "{test_exit_code} != 0"

# Retry without condition (success means no step errors)
- name: "Deploy with Retry"
  tool: retry
  max_attempts: 5
  delay: 10
  on_failure: continue
  steps:
    - name: "Deploy"
      tool: bash
      command: "deploy.sh"
```

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `max_attempts` | yes | - | Maximum number of attempts |
| `until` | no | - | Success condition (loop exits when true) |
| `delay` | no | `0` | Seconds to wait between attempts |
| `on_failure` | no | `"error"` | Behavior when all attempts fail: `error` or `continue` |
| `steps` | yes | - | Nested steps to execute per attempt |

**Automatic variables:**
- `{_attempt}`: Current attempt number (1-indexed)
- `{_retry_succeeded}`: `"true"` or `"false"` after completion
- `{_retry_attempts}`: Number of attempts made

### break Tool

Exit the current loop (foreach, range, while, or retry).

```yaml
- name: "Exit Loop"
  tool: break
  when: "{found} == true"
```

### continue Tool

Skip to the next iteration in a loop (foreach, range, while, or retry).

```yaml
- name: "Skip This Item"
  tool: continue
  when: "{item} is empty"
```

### context Tool

Batch variable operations for managing multiple variables at once. Reduces boilerplate for common variable operations.

```yaml
# Set multiple variables at once
- name: "Initialize Config"
  tool: context
  action: set
  values:
    env: "production"
    debug: "false"
    max_retries: "3"

# Copy variables (useful for backups)
- name: "Backup State"
  tool: context
  action: copy
  mappings:
    current_state: backup_state
    current_config: backup_config

# Clear variables from context
- name: "Cleanup Temp Vars"
  tool: context
  action: clear
  vars:
    - temp_result
    - temp_data
    - scratch

# Export context to JSON file (for debugging)
- name: "Debug Dump"
  tool: context
  action: export
  file: "/tmp/workflow-debug.json"
  vars:  # Optional: filter to specific vars
    - status
    - results
```

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `action` | yes | - | Operation: `set`, `copy`, `clear`, or `export` |

**Action-specific fields:**

| Action | Field | Required | Description |
|--------|-------|----------|-------------|
| `set` | `values` | yes | Dictionary of variable names to values |
| `copy` | `mappings` | yes | Dictionary mapping source vars to target vars |
| `clear` | `vars` | yes | List of variable names to remove |
| `export` | `file` | yes | Path to output JSON file |
| `export` | `vars` | no | List of specific vars to export (default: all) |

### data Tool

Write data to managed temporary files for Claude to read. Files are automatically cleaned up when the workflow ends.

```yaml
# Write JSON data
- name: "Prepare Config"
  tool: data
  content: '{"api_url": "{api_base}", "timeout": 30}'
  format: json
  output_var: config_file

# Write markdown documentation
- name: "Create Instructions"
  tool: data
  content: |
    # Task Instructions

    Process the following items:
    - Item 1: {item_1}
    - Item 2: {item_2}
  format: markdown
  filename: "instructions.md"
  output_var: instructions_file

# Write plain text
- name: "Save Log"
  tool: data
  content: "{log_output}"
  format: text
  output_var: log_file
```

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `content` | yes | - | Content to write (supports interpolation) |
| `format` | no | `"text"` | Output format: `json`, `text`, or `markdown` |
| `filename` | no | auto-generated | Custom filename for the temp file |

**Output:** Returns the absolute path to the created file.

### json Tool

Native JSON manipulation without shell commands or jq. Supports querying, setting, updating, and deleting JSON data from files or variables.

```yaml
# Query JSON data
- name: "Get API URL"
  tool: json
  action: query
  file: "config.json"
  query: ".api.base_url"
  output_var: api_url

# Query from variable
- name: "Get First Item"
  tool: json
  action: query
  source: response_data
  query: ".items[0].name"
  output_var: first_item

# Set value in JSON file
- name: "Update Config"
  tool: json
  action: set
  file: "config.json"
  path: ".settings.debug"
  value: true

# Update with operations
- name: "Add to Array"
  tool: json
  action: update
  source: my_data
  path: ".items"
  operation: append
  value: '{"name": "new item"}'

# Increment a counter
- name: "Increment Count"
  tool: json
  action: update
  file: "stats.json"
  path: ".request_count"
  operation: increment
  value: 1

# Merge objects
- name: "Merge Settings"
  tool: json
  action: update
  file: "config.json"
  path: ".settings"
  operation: merge
  value:
    timeout: 60
    retries: 3

# Delete a key
- name: "Remove Field"
  tool: json
  action: delete
  file: "data.json"
  path: ".temporary_field"

# Create if missing
- name: "Initialize Data"
  tool: json
  action: set
  file: "new-data.json"
  create_if_missing: true
  path: ".initialized"
  value: true
```

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `action` | yes | - | Operation: `query`, `set`, `update`, or `delete` |
| `file` | no* | - | Path to JSON file |
| `source` | no* | - | Variable name containing JSON data |
| `create_if_missing` | no | `false` | Create file/variable if not found |

*Either `file` or `source` is required, but not both.

**Action-specific fields:**

| Action | Field | Required | Description |
|--------|-------|----------|-------------|
| `query` | `query` | yes | Path expression (e.g., `.field.nested`, `.array[0]`) |
| `set` | `path` | yes | Path to set the value at |
| `set` | `value` | yes | Value to set (supports interpolation) |
| `update` | `path` | yes | Path to update |
| `update` | `operation` | yes | Operation: `append`, `prepend`, `increment`, or `merge` |
| `update` | `value` | yes | Value for the operation |
| `delete` | `path` | yes | Path to delete |

**Path syntax:**
- `.field` - Access object field
- `.nested.field` - Access nested field
- `.array[0]` - Access array index
- `.` - Access root

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

## Shared Steps

### Overview {#shared-steps-overview}

Shared steps allow you to create reusable step sequences, similar to GitHub Actions composite actions. They enable:

- **Reusability**: Define once, use in multiple workflows
- **Encapsulation**: Hide implementation details behind a clean interface
- **Inputs/Outputs**: Pass parameters and capture results
- **Nesting**: Shared steps can use other shared steps

### Creating Shared Steps

Shared steps are defined in `step.yml` files with the following structure:

```yaml
type: claude-step
version: 1

name: "Git Checkout"
description: "Clone a repository and checkout a specific branch"

inputs:
  - name: repository
    description: "Repository URL to clone"
    required: true
  - name: branch
    description: "Branch to checkout"
    required: false
    default: "main"
  - name: depth
    description: "Clone depth (0 for full history)"
    required: false
    default: 1
    schema:
      type: integer
      minimum: 0

outputs:
  - name: commit_sha
    description: "The SHA of the checked out commit"
    from: git_sha

steps:
  - name: "Clone Repository"
    tool: bash
    command: "git clone --depth {inputs.depth} --branch {inputs.branch} {inputs.repository} repo"

  - name: "Get Commit SHA"
    tool: bash
    command: "cd repo && git rev-parse HEAD"
    output_var: git_sha
```

**Required fields:**

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Must be `"claude-step"` |
| `version` | integer | Must be `1` |
| `steps` | list | At least one step definition |

**Optional fields:**

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Human-readable name |
| `description` | string | What the shared step does |
| `inputs` | list | Input parameter definitions |
| `outputs` | list | Output definitions |

### Using Shared Steps

Reference shared steps using the `uses` field instead of `tool`:

```yaml
steps:
  - name: "Checkout Code"
    uses: builtin:git-checkout
    with:
      repository: "https://github.com/user/repo"
      branch: "main"
    outputs:
      commit_sha: sha

  - name: "Show Commit"
    tool: bash
    command: "echo 'Checked out commit: {sha}'"
```

| Field | Required | Description |
|-------|----------|-------------|
| `uses` | yes | Shared step reference (e.g., `builtin:name`, `project:name`) |
| `with` | no | Input values to pass to the shared step |
| `outputs` | no | Mapping of step outputs to workflow variables |

### Resolution Strategies

Shared steps can be loaded from three sources:

| Prefix | Location | Example |
|--------|----------|---------|
| `builtin:` | `orchestrator/shared_steps/builtin/{name}/step.yml` | `builtin:git-checkout` |
| `project:` | `.claude/workflows/steps/{name}/step.yml` | `project:deploy-staging` |
| `path:` | Relative to workflow file | `path:./custom-steps/my-step` |

**Project structure example:**
```
project/
  .claude/
    workflows/
      steps/
        deploy-staging/
          step.yml
        run-tests/
          step.yml
    my-workflow.yml
```

### Inputs and Outputs

**Input definitions:**

```yaml
inputs:
  # Simple format (required, no default)
  - repository

  # Full format
  - name: branch
    description: "Branch to checkout"
    required: false
    default: "main"
    schema:  # Optional JSON Schema validation
      type: string
      pattern: "^[a-zA-Z0-9_-]+$"
```

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `name` | yes | - | Parameter name |
| `description` | no | `""` | Human-readable description |
| `required` | no | `true` | Whether the input must be provided |
| `default` | no | `null` | Default value if not provided |
| `schema` | no | `null` | JSON Schema for validation |

**Accessing inputs in steps:**

Use `{inputs.name}` syntax to access input values:

```yaml
steps:
  - name: "Clone"
    tool: bash
    command: "git clone {inputs.repository}"
```

**Output definitions:**

```yaml
outputs:
  # Simple format (name equals from_var)
  - commit_sha

  # Full format
  - name: commit_sha
    description: "The SHA of the checked out commit"
    from: internal_sha_variable
```

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `name` | yes | - | Output name exposed to parent workflow |
| `description` | no | `""` | Human-readable description |
| `from` | no | same as `name` | Internal variable to expose |

**Capturing outputs in workflow:**

```yaml
- name: "Checkout"
  uses: project:git-checkout
  with:
    repository: "{repo_url}"
  outputs:
    commit_sha: my_sha  # Map output 'commit_sha' to variable 'my_sha'

- name: "Use SHA"
  tool: bash
  command: "echo {my_sha}"
```

### Nesting and Safety

Shared steps can use other shared steps:

```yaml
# In .claude/workflows/steps/full-deploy/step.yml
steps:
  - name: "Checkout"
    uses: project:git-checkout
    with:
      repository: "{inputs.repo}"

  - name: "Build"
    uses: project:build-app

  - name: "Deploy"
    uses: project:deploy-to-cloud
```

**Safety limits:**
- Maximum nesting depth: 10 levels (configurable)
- Circular dependencies are detected and rejected

### Shared Step Examples

**Example 1: Reusable test runner**

```yaml
# .claude/workflows/steps/run-tests/step.yml
type: claude-step
version: 1

name: "Run Tests"
description: "Run tests with coverage and optional fix"

inputs:
  - name: test_command
    default: "npm test"
  - name: fix_on_failure
    default: false
    schema:
      type: boolean

outputs:
  - name: passed
    from: test_passed
  - name: coverage
    from: coverage_percent

steps:
  - name: "Run Tests"
    tool: bash
    command: "{inputs.test_command}"
    output_var: test_result
    on_error: continue

  - name: "Check Result"
    tool: set
    var: test_passed
    expr: "if('{test_result}' contains 'PASS', 'true', 'false')"

  - name: "Fix Failures"
    tool: claude
    prompt: "Fix the failing tests based on the output: {test_result}"
    when: "{test_passed} == false and {inputs.fix_on_failure} == true"

  - name: "Get Coverage"
    tool: bash
    command: "npm run coverage -- --json | jq '.total.statements.pct'"
    output_var: coverage_percent
```

**Example 2: Using the test runner**

```yaml
steps:
  - name: "Test with Auto-fix"
    uses: project:run-tests
    with:
      test_command: "pytest -v"
      fix_on_failure: true
    outputs:
      passed: tests_passed
      coverage: test_coverage

  - name: "Check Coverage"
    tool: goto
    target: "Coverage Too Low"
    when: "{test_coverage} < 80"
```

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

### Retry with Auto-fix

```yaml
type: claude-workflow
version: 2

name: "Test and Fix Workflow"

steps:
  - name: "Run Tests with Auto-fix"
    tool: retry
    max_attempts: 5
    until: "{exit_code} == 0"
    delay: 1
    steps:
      - name: "Execute Tests"
        tool: bash
        command: "npm test > /tmp/test-output.txt 2>&1; echo $?"
        output_var: exit_code

      - name: "Read Test Output"
        tool: bash
        command: "cat /tmp/test-output.txt"
        output_var: test_output
        when: "{exit_code} != 0"

      - name: "Fix Failures"
        prompt: |
          The tests failed. Here is the output:

          {test_output}

          Please analyze the failures and fix them.
        when: "{exit_code} != 0"

  - name: "Report Result"
    tool: bash
    command: "echo 'Tests passed after {_retry_attempts} attempt(s)'"
    when: "{_retry_succeeded} == true"
```

### Range-based Batch Processing

```yaml
type: claude-workflow
version: 2

name: "Batch Processor"

steps:
  - name: "Initialize Context"
    tool: context
    action: set
    values:
      total_processed: "0"
      errors: "0"
      batch_size: "10"

  - name: "Process Batches"
    tool: range
    from: 1
    to: 5
    var: batch_num
    steps:
      - name: "Prepare Batch Data"
        tool: data
        content: |
          {
            "batch": {batch_num},
            "size": {batch_size},
            "timestamp": "now"
          }
        format: json
        output_var: batch_file

      - name: "Process Batch"
        prompt: |
          Process batch {batch_num} using the data in {batch_file}.
          Update the processing status as you go.

      - name: "Update Counter"
        tool: set
        var: total_processed
        expr: "{total_processed} + {batch_size}"

  - name: "Summary"
    prompt: "Summarize the batch processing. Processed {total_processed} items."
```

### JSON-based Configuration Management

```yaml
type: claude-workflow
version: 2

name: "Config-Driven Deployment"

steps:
  - name: "Load Config"
    tool: json
    action: query
    file: "deploy-config.json"
    query: "."
    output_var: config

  - name: "Get Environment"
    tool: json
    action: query
    source: config
    query: ".environment"
    output_var: env

  - name: "Update Build Number"
    tool: json
    action: update
    file: "deploy-config.json"
    path: ".build_number"
    operation: increment
    value: 1

  - name: "Add Deployment Record"
    tool: json
    action: update
    file: "deploy-config.json"
    path: ".deployments"
    operation: append
    value:
      timestamp: "{_timestamp}"
      environment: "{env}"

  - name: "Deploy to Environment"
    prompt: "Deploy the application to {env} environment using the loaded configuration"

  - name: "Cleanup Temp Vars"
    tool: context
    action: clear
    vars:
      - config
      - env
```

### While Loop for Polling

```yaml
type: claude-workflow
version: 2

name: "Deployment Monitor"

steps:
  - name: "Start Deployment"
    tool: bash
    command: "deploy-async.sh"
    output_var: deploy_id

  - name: "Initialize Status"
    tool: set
    var: deploy_status
    value: "pending"

  - name: "Wait for Completion"
    tool: while
    condition: "{deploy_status} != complete and {deploy_status} != failed"
    max_iterations: 60
    on_max_reached: error
    steps:
      - name: "Check Status"
        tool: bash
        command: "check-deploy-status.sh {deploy_id}"
        output_var: deploy_status

      - name: "Log Progress"
        tool: bash
        command: "echo 'Deployment status: {deploy_status}'"

      - name: "Wait Between Checks"
        tool: bash
        command: "sleep 10"

  - name: "Handle Success"
    prompt: "Deployment completed successfully. Verify the deployment."
    when: "{deploy_status} == complete"

  - name: "Handle Failure"
    prompt: "Deployment failed. Investigate and report the issue."
    when: "{deploy_status} == failed"
```

### Shared Steps in Action

```yaml
type: claude-workflow
version: 2

name: "Full CI/CD Pipeline"

steps:
  - name: "Checkout Code"
    uses: project:git-checkout
    with:
      repository: "{repo_url}"
      branch: "{branch}"
    outputs:
      commit_sha: sha

  - name: "Run Tests"
    uses: project:run-tests
    with:
      test_command: "npm test"
      fix_on_failure: true
    outputs:
      passed: tests_passed
      coverage: test_coverage

  - name: "Check Tests"
    tool: goto
    target: "Test Failure"
    when: "{tests_passed} == false"

  - name: "Build Application"
    uses: project:build-app
    with:
      environment: "production"
    outputs:
      artifact: build_path

  - name: "Deploy"
    uses: project:deploy-to-cloud
    with:
      artifact_path: "{build_path}"
      environment: "production"

  - name: "Success"
    tool: bash
    command: "echo 'Pipeline completed successfully for commit {sha}'"

  - name: "Test Failure"
    tool: bash
    command: "echo 'Pipeline failed: tests did not pass'"
    when: "false"  # Only reached via goto
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

### Security Note

When using `--file` to load a workflow from outside the project directory, a warning will be displayed:

```
⚠ Warning: Loading workflow from outside project directory
  File: /path/to/workflow.yml
  Project: /path/to/project
```

This is a security reminder that workflows can execute commands and interact with Claude Code. Always review workflow files from untrusted sources before running them.

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
| `'step' cannot be zero` | Range step increment must be non-zero |
| `'max_iterations' must be a positive integer` | While/retry requires positive max limit |
| `While loop reached max_iterations` | Condition still true at limit; increase max or fix condition |
| `Retry failed after N attempts` | All retry attempts exhausted |
| `Set step requires either 'value' or 'expr'` | Must provide one assignment method |
| `Invalid action` | Check action name for context/json tools |
| `File not found` | JSON file path does not exist |
| `Query failed` | JSON path expression is invalid |
| `Shared step not found` | Check uses reference (builtin:, project:, path:) |
| `Circular dependency detected` | Shared steps cannot reference themselves |
| `Maximum nesting depth exceeded` | Reduce shared step nesting (default max: 10) |
| `Required input not provided` | Provide required input in `with:` block |
| `Input failed schema validation` | Input value doesn't match JSON Schema |
