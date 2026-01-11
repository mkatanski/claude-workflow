# ForEach Tool

The `foreach` tool allows you to iterate over arrays and execute a sequence of nested steps for each item. It provides loop control flow with `break` and `continue` support, error handling strategies, and automatic variable management.

## Configuration Options

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `source` | Yes | string | Variable name containing the array to iterate over. Supports dot notation (e.g., `team.members`). |
| `item_var` | Yes | string | Variable name to store the current item during each iteration. |
| `index_var` | No | string | Variable name to store the current index (0-based). |
| `steps` | Yes | array | List of steps to execute for each item. |
| `on_item_error` | No | string | Error handling strategy: `stop` (default), `stop_loop`, or `continue`. |

### Error Handling Strategies

- **`stop`** (default): Stop the loop and fail the entire workflow.
- **`stop_loop`**: Stop the loop but continue with the rest of the workflow.
- **`continue`**: Log the error and proceed to the next item.

## Basic Example

```yaml
steps:
  # First, create or set the array to iterate over
  - name: "Set Team Members"
    tool: set
    var: members
    value: '["alice", "bob", "charlie"]'

  # Iterate over the array
  - name: "Greet Team Members"
    tool: foreach
    source: members
    item_var: member
    index_var: idx
    steps:
      - name: "Send Greeting"
        prompt: "Say hello to {member} (member #{idx})"
```

## Accessing Current Item and Index

Within nested steps, you can reference the current item and index using variable interpolation:

```yaml
- name: "Process Files"
  tool: foreach
  source: file_list
  item_var: file
  index_var: i
  steps:
    - name: "Process File"
      prompt: "Process file {file} (index {i})"

    - name: "Log Progress"
      tool: bash
      command: "echo 'Processed item {i}: {file}'"
```

### Item Value Handling

- **Primitive values** (strings, numbers): Stored as strings directly.
- **Objects/arrays**: Stored as JSON strings for nested access.

To access properties of object items:

```yaml
- name: "Set Users"
  tool: set
  var: users
  value: '[{"name": "Alice", "role": "admin"}, {"name": "Bob", "role": "user"}]'

- name: "Process Users"
  tool: foreach
  source: users
  item_var: user
  steps:
    - name: "Handle User"
      prompt: "Process user with data: {user}"
```

## Using Break and Continue

The `break` and `continue` tools control loop execution flow within foreach loops.

### Break - Exit Loop Early

Use `break` to exit the loop entirely when a condition is met:

```yaml
- name: "Find First Match"
  tool: foreach
  source: items
  item_var: item
  steps:
    - name: "Check Item"
      tool: bash
      command: "test '{item}' = 'target' && echo 'found' || echo 'not found'"
      output_var: result

    - name: "Stop If Found"
      tool: break
      when: "{result} == found"

    - name: "Continue Processing"
      prompt: "Process non-matching item {item}"
```

### Continue - Skip to Next Iteration

Use `continue` to skip the remaining steps for the current item and move to the next:

```yaml
- name: "Process Valid Items"
  tool: foreach
  source: items
  item_var: item
  steps:
    - name: "Validate Item"
      tool: bash
      command: "test -n '{item}' && echo 'valid' || echo 'invalid'"
      output_var: validation

    - name: "Skip Invalid"
      tool: continue
      when: "{validation} == invalid"

    - name: "Process Valid Item"
      prompt: "Process the valid item: {item}"
```

## Nested Steps

Nested steps within a foreach loop support all standard step features:

- **Conditional execution** with `when`
- **Output capture** with `output_var`
- **Error handling** with `on_error`
- **Goto** (within the foreach's nested steps only)

### Example with All Features

```yaml
- name: "Complex Processing"
  tool: foreach
  source: tasks
  item_var: task
  index_var: task_idx
  on_item_error: continue
  steps:
    - name: "Check Prerequisites"
      tool: bash
      command: "check_prereqs.sh {task}"
      output_var: prereq_status
      on_error: continue

    - name: "Skip If Not Ready"
      tool: continue
      when: "{prereq_status} != ready"

    - name: "Execute Task"
      prompt: "Execute task: {task}"
      output_var: task_result

    - name: "Verify Result"
      tool: bash
      command: "verify_result.sh {task_result}"
      output_var: verified

    - name: "Abort On Critical Failure"
      tool: break
      when: "{verified} == critical_failure"
```

## Common Patterns

### Pattern 1: Process List from External Source

```yaml
steps:
  - name: "Get Issues from API"
    tool: bash
    command: "curl -s https://api.example.com/issues | jq -c '.items'"
    output_var: issues

  - name: "Process Each Issue"
    tool: foreach
    source: issues
    item_var: issue
    steps:
      - name: "Handle Issue"
        prompt: "Analyze and fix issue: {issue}"
```

### Pattern 2: Batch Processing with Error Tolerance

```yaml
steps:
  - name: "Set Files to Process"
    tool: set
    var: files
    value: '["file1.txt", "file2.txt", "file3.txt"]'

  - name: "Process All Files"
    tool: foreach
    source: files
    item_var: file
    on_item_error: continue  # Continue even if one file fails
    steps:
      - name: "Process File"
        tool: bash
        command: "process.sh {file}"
```

### Pattern 3: Find and Act on First Match

```yaml
steps:
  - name: "Search Directories"
    tool: foreach
    source: search_paths
    item_var: path
    steps:
      - name: "Check Path"
        tool: bash
        command: "test -f '{path}/config.json' && echo 'found' || echo 'missing'"
        output_var: found

      - name: "Use Found Config"
        prompt: "Load and apply config from {path}/config.json"
        when: "{found} == found"

      - name: "Stop Search"
        tool: break
        when: "{found} == found"
```

### Pattern 4: Nested Dot Notation Access

```yaml
steps:
  - name: "Set Team Data"
    tool: set
    var: team
    value: '{"name": "Engineering", "members": ["alice", "bob"]}'

  - name: "Notify Team Members"
    tool: foreach
    source: team.members  # Dot notation to access nested array
    item_var: member
    steps:
      - name: "Send Notification"
        prompt: "Send notification to {member}"
```

### Pattern 5: Index-Based Operations

```yaml
steps:
  - name: "Process Sequentially"
    tool: foreach
    source: items
    item_var: item
    index_var: idx
    steps:
      - name: "Skip First Item"
        tool: continue
        when: "{idx} == 0"

      - name: "Process Remaining"
        prompt: "Process item #{idx}: {item}"
```

## Variable Cleanup

The foreach tool automatically manages variables:

- Before the loop: Original values of `item_var` and `index_var` are saved.
- During iteration: Variables are updated with current item/index.
- After the loop: Original values are restored (or variables are deleted if they did not exist before).

This ensures that foreach loops do not pollute the context with leftover iteration variables.

## Output Summary

After completion, the foreach tool provides a summary:

```
Completed 5/5 iterations
```

Or with errors (when using `on_item_error: continue`):

```
Completed 3/5 iterations (2 errors)
```
