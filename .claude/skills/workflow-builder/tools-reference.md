# Tools Reference

Complete guide to all available workflow tools with usage patterns and selection criteria.

## Tool Selection Guide

### Quick Reference Table

| Tool | Use When |
|------|----------|
| `claude` (default) | AI reasoning, code generation, analysis, complex decisions |
| `bash` | Shell commands, scripts, system operations |
| `set` | Setting a single variable |
| `context` | Batch variable operations (set multiple, copy, clear, export) |
| `foreach` | Iterating over arrays/lists |
| `range` | Iterating over number ranges |
| `while` | Looping until condition is false |
| `retry` | Retrying operations until success |
| `goto` | Jumping to labeled steps, state machines |
| `break` | Exit loop early |
| `continue` | Skip to next iteration |
| `json` | JSON manipulation (query, set, update, delete) |
| `data` | Write temporary files |
| `linear_tasks` | Fetch Linear issues |
| `linear_manage` | Create/update Linear issues |

### Decision Flowchart

```
START: What does this step need to do?
    |
    +-- Needs AI reasoning/analysis?
    |   YES -> claude (default tool)
    |
    +-- Run shell command?
    |   YES -> bash
    |
    +-- Set/manage variables?
    |   +-- Single variable? -> set
    |   +-- Multiple variables? -> context (action: set)
    |   +-- Copy between vars? -> context (action: copy)
    |   +-- Clear variables? -> context (action: clear)
    |
    +-- Loop/iterate?
    |   +-- Over array of items? -> foreach
    |   +-- Over number range? -> range
    |   +-- Until condition false? -> while
    |   +-- Retry until success? -> retry
    |
    +-- Control loop flow?
    |   +-- Exit loop early? -> break
    |   +-- Skip to next item? -> continue
    |
    +-- Jump to another step?
    |   YES -> goto
    |
    +-- Manipulate JSON?
    |   YES -> json
    |
    +-- Create temp file?
    |   YES -> data
    |
    +-- Work with Linear?
        +-- Fetch issues? -> linear_tasks
        +-- Create/update? -> linear_manage
```

---

## Claude Tool (Default)

Execute AI prompts via Claude Code. **This is the default tool** - if you don't specify `tool:`, it uses claude.

### When to Use
- Code generation and implementation
- Code review and analysis
- Complex reasoning tasks
- Decision making
- Documentation generation
- Any task requiring AI intelligence

### Configuration

```yaml
# Minimal (uses defaults)
- name: "Generate code"
  prompt: "Create a React component for user login"

# With output capture
- name: "Analyze code"
  prompt: "Review this code for security issues"
  output_var: review_result

# With model override
- name: "Complex task"
  model: opus  # Override for this step only
  prompt: "Design the system architecture"
```

### Model Selection

| Model | Best For |
|-------|----------|
| `haiku` | Quick tasks, simple queries, fast iteration |
| `sonnet` | Most development tasks, balanced (default) |
| `opus` | Complex reasoning, architecture, difficult problems |

### Large Variable Handling

Variables exceeding 10,000 characters are automatically externalized to temp files. The prompt receives `@/path/to/file.txt` instead of inline content - Claude Code reads it using the `@filepath` syntax. This prevents prompt size errors.

### Multi-line Prompts

```yaml
- name: "Complex implementation"
  prompt: |
    Implement a user authentication system with:
    - Email/password login
    - Password reset flow
    - Session management

    Use the existing database schema.
    Follow the project's coding conventions.
```

---

## Bash Tool

Execute shell commands.

### When to Use
- Git operations
- File system operations
- Running scripts
- Package management (npm, pip, etc.)
- System commands
- API calls with curl

### Configuration

```yaml
- name: "Run tests"
  tool: bash
  command: "npm test"
  output_var: test_output
```

### Common Patterns

```yaml
# Git operations
- name: "Get branch"
  tool: bash
  command: "git branch --show-current"
  output_var: branch

# Check command success
- name: "Check if file exists"
  tool: bash
  command: "test -f config.json && echo 'exists' || echo 'missing'"
  output_var: file_status

# Multi-command
- name: "Setup"
  tool: bash
  command: "npm install && npm run build"

# With variable interpolation
- name: "Create branch"
  tool: bash
  command: "git checkout -b feature/{issue_id}"
```

### Error Handling

```yaml
# Continue even if command fails
- name: "Optional cleanup"
  tool: bash
  command: "rm -rf temp/"
  on_error: continue
```

---

## Set Tool

Set a single variable value.

### When to Use
- Initialize a variable
- Store a computed value
- Set flags/status

### Configuration

```yaml
- name: "Initialize counter"
  tool: set
  var: counter
  value: "0"

# With interpolation
- name: "Build path"
  tool: set
  var: full_path
  value: "{base_dir}/{filename}"
```

---

## Context Tool

Batch variable operations.

### When to Use
- Set multiple variables at once
- Copy variables
- Clear variables
- Export context to file (debugging)

### Actions

#### `set` - Set Multiple Variables

```yaml
- name: "Initialize config"
  tool: context
  action: set
  values:
    api_url: "https://api.example.com"
    timeout: "30"
    max_retries: "3"
```

#### `copy` - Copy Variables

```yaml
- name: "Backup state"
  tool: context
  action: copy
  mappings:
    current_branch: saved_branch
    current_commit: saved_commit
```

#### `clear` - Remove Variables

```yaml
- name: "Cleanup"
  tool: context
  action: clear
  vars:
    - temp_result
    - intermediate_data
```

#### `export` - Export to File

```yaml
- name: "Debug export"
  tool: context
  action: export
  file: "/tmp/debug-context.json"
  vars:  # Optional, exports all if omitted
    - important_var1
    - important_var2
```

---

## ForEach Tool

Iterate over arrays/lists.

### When to Use
- Process multiple files
- Handle list of items
- Iterate over API results
- Batch operations

### Configuration

```yaml
- name: "Process files"
  tool: foreach
  items: ["file1.ts", "file2.ts", "file3.ts"]
  item_var: file
  steps:
    - name: "Analyze {file}"
      prompt: "Review {file} for issues"
```

### With Source Variable

```yaml
- name: "Get files"
  tool: bash
  command: "ls *.ts"
  output_var: files

- name: "Process all"
  tool: foreach
  source: files  # Reference variable
  item_var: current_file
  steps:
    - name: "Process {current_file}"
      prompt: "Analyze {current_file}"
```

### Options

| Field | Required | Description |
|-------|----------|-------------|
| `items` or `source` | Yes (one) | Array literal or variable name |
| `item_var` | Yes | Variable for current item |
| `index_var` | No | Variable for current index |
| `filter` | No | Filter expression |
| `sort` | No | Sort items: `asc`, `desc` |
| `unique` | No | Remove duplicates: `true` |
| `on_item_error` | No | Error handling: `stop`, `continue` |

### Advanced Example

```yaml
- name: "Process unique sorted files"
  tool: foreach
  source: files
  item_var: file
  index_var: idx
  filter: "{item} ends with .ts"
  sort: asc
  unique: true
  on_item_error: continue
  steps:
    - name: "Step {idx}: {file}"
      prompt: "Process {file}"
```

---

## Range Tool

Iterate over number ranges.

### When to Use
- Fixed number of iterations
- Batch processing with numbered items
- Countdown/countup operations
- Pagination with known page counts

### Configuration

```yaml
- name: "Process 5 batches"
  tool: range
  from: 1
  to: 5
  var: batch_num
  steps:
    - name: "Process batch {batch_num}"
      tool: bash
      command: "process-batch.sh {batch_num}"
```

### Options

| Field | Required | Description |
|-------|----------|-------------|
| `from` | Yes | Start value (inclusive) |
| `to` | Yes | End value (inclusive) |
| `var` | Yes | Variable for current value |
| `step` | No | Increment (default: 1, can be negative) |

### Examples

```yaml
# Count by 2s: 0, 2, 4, 6, 8, 10
- name: "Even numbers"
  tool: range
  from: 0
  to: 10
  step: 2
  var: num
  steps:
    - name: "Process {num}"
      prompt: "Handle item {num}"

# Countdown: 10, 9, 8, ... 1
- name: "Countdown"
  tool: range
  from: 10
  to: 1
  step: -1
  var: seconds
  steps:
    - name: "Count {seconds}"
      tool: bash
      command: "echo '{seconds}...' && sleep 1"
```

---

## While Tool

Loop while condition is true.

### When to Use
- Poll until status changes
- Process queue until empty
- Wait for external process
- Unknown number of iterations

### Configuration

```yaml
- name: "Wait for ready"
  tool: while
  condition: "{status} != ready"
  max_iterations: 30  # Required safety limit
  steps:
    - name: "Check status"
      tool: bash
      command: "curl -s http://api/health"
      output_var: status

    - name: "Wait"
      tool: bash
      command: "sleep 10"
```

### Options

| Field | Required | Description |
|-------|----------|-------------|
| `condition` | Yes | Loop while this is true |
| `max_iterations` | Yes | Safety limit (required) |
| `on_max_reached` | No | `error` (default) or `continue` |

### Pattern: Polling

```yaml
- name: "init"
  tool: set
  var: deploy_ready
  value: "false"

- name: "wait-for-deploy"
  tool: while
  condition: "{deploy_ready} != true"
  max_iterations: 60
  steps:
    - name: "check"
      tool: bash
      command: "kubectl get deploy myapp -o jsonpath='{.status.readyReplicas}'"
      output_var: replicas

    - name: "update-status"
      tool: set
      var: deploy_ready
      value: "true"
      when: "{replicas} >= 3"

    - name: "wait"
      tool: bash
      command: "sleep 10"
```

---

## Retry Tool

Retry operations until success.

### When to Use
- Transient failures (network, APIs)
- Flaky tests
- Wait for resource availability
- Self-healing workflows (retry with fixes)

### Configuration

```yaml
- name: "Retry API call"
  tool: retry
  max_attempts: 5
  delay: 10
  until: "{result} == success"
  steps:
    - name: "Call API"
      tool: bash
      command: "curl -sf http://api/endpoint && echo 'success' || echo 'failed'"
      output_var: result
```

### Options

| Field | Required | Description |
|-------|----------|-------------|
| `max_attempts` | Yes | Maximum retry attempts |
| `until` | No | Success condition (exits when true) |
| `delay` | No | Seconds between attempts |
| `on_failure` | No | `error` (default) or `continue` |

### Context Variables

- `{_attempt}` - Current attempt number (1-indexed)
- `{_retry_succeeded}` - After loop: `"true"` or `"false"`
- `{_retry_attempts}` - After loop: total attempts made

### Pattern: Self-Healing Tests

```yaml
- name: "Run tests with auto-fix"
  tool: retry
  max_attempts: 3
  until: "{test_result} == 0"
  steps:
    - name: "Run tests"
      tool: bash
      command: "npm test && echo 0 || echo 1"
      output_var: test_result

    - name: "Fix failures"
      prompt: "Analyze and fix the failing tests"
      when: "{test_result} != 0"
```

---

## Goto Tool

Jump to a labeled step.

### When to Use
- State machines
- Complex branching logic
- Skip sections conditionally
- Retry specific steps

### Configuration

```yaml
steps:
  - name: "start"
    tool: bash
    command: "echo 'Starting'"

  - name: "check-condition"
    tool: bash
    command: "check.sh"
    output_var: result

  - name: "jump-to-end"
    tool: goto
    target: "finish"
    when: "{result} == skip"

  - name: "do-work"
    prompt: "Do the main work"

  - name: "finish"
    prompt: "Finalize the workflow"
```

### Options

| Field | Required | Description |
|-------|----------|-------------|
| `target` | Yes | Name of step to jump to |

**Note:** Can only jump forward. Cannot jump into or out of loops.

---

## Break Tool

Exit loop early.

### When to Use
- Stop on first match
- Exit on error
- Limit processing
- Early termination conditions

### Configuration

```yaml
- name: "search-loop"
  tool: foreach
  source: items
  item_var: item
  steps:
    - name: "check"
      tool: bash
      command: "check {item}"
      output_var: found

    - name: "exit-if-found"
      tool: break
      when: "{found} == true"
```

---

## Continue Tool

Skip to next iteration.

### When to Use
- Filter items in loop
- Skip invalid items
- Conditional processing

### Configuration

```yaml
- name: "process-valid"
  tool: foreach
  source: items
  item_var: item
  steps:
    - name: "validate"
      tool: bash
      command: "validate {item}"
      output_var: is_valid

    - name: "skip-invalid"
      tool: continue
      when: "{is_valid} != true"

    - name: "process"
      prompt: "Process valid item {item}"
```

---

## JSON Tool

Native JSON and YAML manipulation using JMESPath queries.

### When to Use
- Extract values from JSON/YAML files
- Modify JSON/YAML configuration files
- Build JSON data structures
- Query API responses
- Update package.json, YAML configs, etc.

### File Format Support

| Extension | Format |
|-----------|--------|
| `.json` | JSON (default) |
| `.yaml`, `.yml` | YAML |

File format is auto-detected by extension.

### Query Syntax (JMESPath)

The json tool uses [JMESPath](https://jmespath.org/) query syntax:

| Pattern | Example | Description |
|---------|---------|-------------|
| Field access | `name` | Get field value |
| Nested access | `user.profile.email` | Get nested field |
| Array index | `items[0]` | Get first element |
| Negative index | `items[-1]` | Get last element |
| Array projection | `items[*].name` | Get all names from array |
| Filter | `items[?status == 'active']` | Filter by condition |
| Functions | `length(items)` | Get array length |
| Multi-select | `{name: name, count: length(items)}` | Build object |

### Built-in Functions

| Function | Example | Description |
|----------|---------|-------------|
| `length()` | `length(items)` | Array/object/string length |
| `keys()` | `keys(config)` | Object keys |
| `values()` | `values(config)` | Object values |
| `sort()` | `sort(items)` | Sort array |
| `reverse()` | `reverse(items)` | Reverse array |
| `min()` | `min(nums)` | Minimum value |
| `max()` | `max(nums)` | Maximum value |
| `sum()` | `sum(nums)` | Sum numbers |
| `to_entries()` | `to_entries(obj)` | Object to [{key,value}] |
| `from_entries()` | `from_entries(arr)` | [{key,value}] to object |
| `unique()` | `unique(items)` | Remove duplicates |
| `flatten()` | `flatten(nested)` | Flatten one level |
| `add()` | `add(items)` | Sum/concatenate |

### Actions

#### `query` - Extract Values

```yaml
- name: "Get version"
  tool: json
  action: query
  file: "package.json"
  query: "version"  # JMESPath: no leading dot
  output_var: version

# Array projection
- name: "Get all names"
  tool: json
  action: query
  file: "data.json"
  query: "users[*].name"
  output_var: names

# Filter with condition
- name: "Get active items"
  tool: json
  action: query
  file: "data.json"
  query: "items[?status == 'active']"
  output_var: active_items

# Using functions
- name: "Count items"
  tool: json
  action: query
  file: "data.json"
  query: "length(items)"
  output_var: count
```

#### `set` - Set Values

```yaml
- name: "Update version"
  tool: json
  action: set
  file: "package.json"
  path: ".version"
  value: "2.0.0"

# YAML file
- name: "Update config"
  tool: json
  action: set
  file: "config.yaml"
  path: ".database.host"
  value: "localhost"
```

#### `update` - Modify Values

```yaml
# Append to array
- name: "Add dependency"
  tool: json
  action: update
  file: "package.json"
  path: ".dependencies"
  operation: merge
  value:
    lodash: "^4.17.21"

# Increment counter
- name: "Increment count"
  tool: json
  action: update
  file: "stats.json"
  path: ".retry_count"
  operation: increment
  value: 1
```

Operations: `append`, `prepend`, `increment`, `merge`

#### `delete` - Remove Values

```yaml
- name: "Remove key"
  tool: json
  action: delete
  file: "package.json"
  path: ".devDependencies.eslint"
```

### Working with Variables

```yaml
- name: "Get API response"
  tool: bash
  command: "curl -s https://api/data"
  output_var: response

- name: "Extract user"
  tool: json
  action: query
  source: response  # Variable instead of file
  query: "data.user.name"  # JMESPath syntax
  output_var: user_name
```

### YAML Examples

```yaml
# Query YAML config
- name: "Get database host"
  tool: json
  action: query
  file: "docker-compose.yml"
  query: "services.db.environment"
  output_var: db_env

# Update YAML
- name: "Update replica count"
  tool: json
  action: set
  file: "deployment.yaml"
  path: ".spec.replicas"
  value: 3

# Filter YAML array
- name: "Get pending tasks"
  tool: json
  action: query
  file: "tasks.yml"
  query: "tasks[?status == 'pending'].name"
  output_var: pending_tasks
```

---

## Data Tool

Write temporary files.

### When to Use
- Create context files for Claude
- Store intermediate data
- Build configuration files
- Generate reports

### Configuration

```yaml
- name: "Create context"
  tool: data
  content: |
    # Project Context

    Current branch: {branch}
    Recent changes: {changes}
  format: markdown
  filename: "context.md"
  output_var: context_file

- name: "Use context"
  prompt: "Read {context_file} and suggest improvements"
```

### Options

| Field | Required | Description |
|-------|----------|-------------|
| `content` | Yes | File content (supports interpolation) |
| `format` | No | `text` (default), `json`, `markdown` |
| `filename` | No | Custom filename |
| `output_var` | No | Variable for file path |

**Note:** Files are auto-cleaned when workflow ends.

---

## Linear Tasks Tool

Fetch Linear issues.

### When to Use
- Get next task from backlog
- Fetch issue details
- Query by filters
- Assign issues

### Actions

#### `get_next` - Get Next Issue

```yaml
- name: "Get next task"
  tool: linear_tasks
  action: get_next
  team: ENG
  status: "Todo"
  priority: 2
  output_var: issue_id
```

#### `get` - Get Issue Details

```yaml
- name: "Fetch details"
  tool: linear_tasks
  action: get
  issue_id: "{issue_id}"
  output_var: issue
```

#### `assign` - Assign Issue

```yaml
- name: "Assign to me"
  tool: linear_tasks
  action: assign
  issue_id: "{issue_id}"
  assignee: "developer@company.com"
```

### Filter Options

| Field | Description |
|-------|-------------|
| `team` | Team key or name (required for get_next) |
| `status` | Workflow state name |
| `priority` | 0=None, 1=Urgent, 2=High, 3=Medium, 4=Low |
| `labels` | Label name(s) |
| `project` | Project name |
| `assignee` | User ID, email, or name |
| `skip_blocked` | Skip blocked issues (default: true) |

---

## Linear Manage Tool

Create and update Linear issues.

### When to Use
- Create new issues
- Update issue status
- Add comments
- Track workflow progress

### Actions

#### `create` - Create Issue

```yaml
- name: "Create bug report"
  tool: linear_manage
  action: create
  title: "Bug: Login form validation"
  team: ENG
  description: "Detailed description..."
  priority: 2
  labels:
    - "bug"
    - "frontend"
```

#### `update` - Update Issue

```yaml
- name: "Mark in progress"
  tool: linear_manage
  action: update
  issue_id: "{issue_id}"
  status: "In Progress"
  assignee: "dev@company.com"
```

#### `comment` - Add Comment

```yaml
- name: "Add work summary"
  tool: linear_manage
  action: comment
  issue_id: "{issue_id}"
  body: |
    ## Work Completed

    - Implemented feature
    - Added tests
    - Updated docs
```

### Status Values

Common Linear status names:
- `Backlog`
- `Todo`
- `In Progress`
- `In Review`
- `Done`
- `Canceled`
