# Context Tool

The `context` tool performs batch operations on workflow variables. It provides a convenient way to set multiple variables at once, copy values between variables, clear variables, and export context state for debugging.

## Overview

The context tool supports four actions:

| Action | Purpose |
|--------|---------|
| `set` | Set multiple variables in a single step |
| `copy` | Copy values from one variable to another |
| `clear` | Remove variables from the context |
| `export` | Save context variables to a JSON file |

## Configuration

### Common Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tool` | string | Yes | Must be `"context"` |
| `name` | string | Yes | Step name for display and goto refs |
| `action` | string | Yes | Operation type: `set`, `copy`, `clear`, or `export` |

### Action-Specific Fields

#### `set` Action

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `values` | object | Yes | Dictionary of variable names to values |

#### `copy` Action

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `mappings` | object | Yes | Dictionary mapping source variables to target variables |

#### `clear` Action

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `vars` | list | Yes | List of variable names to remove |

#### `export` Action

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | string | Yes | Output file path (supports interpolation) |
| `vars` | list | No | Filter to specific variables (exports all if omitted) |

## Basic Usage

### Setting Multiple Variables

Use the `set` action to define multiple variables in a single step:

```yaml
steps:
  - name: "Initialize Configuration"
    tool: context
    action: set
    values:
      api_url: "https://api.example.com"
      timeout: "30"
      max_retries: "3"
      environment: "production"
```

This is equivalent to four separate `set` tool steps but more concise:

```yaml
# Equivalent using individual set steps (more verbose)
steps:
  - name: "Set API URL"
    tool: set
    var: api_url
    value: "https://api.example.com"

  - name: "Set Timeout"
    tool: set
    var: timeout
    value: "30"

  # ... and so on
```

### Copying Variables

Use the `copy` action to duplicate values from one variable to another:

```yaml
steps:
  - name: "Backup Current State"
    tool: context
    action: copy
    mappings:
      current_branch: saved_branch
      current_version: original_version
```

### Clearing Variables

Use the `clear` action to remove variables from the context:

```yaml
steps:
  - name: "Clean Up Temp Variables"
    tool: context
    action: clear
    vars:
      - temp_result
      - intermediate_data
      - scratch_value
```

### Exporting Context

Use the `export` action to save variables to a JSON file:

```yaml
steps:
  - name: "Save Debug State"
    tool: context
    action: export
    file: "/tmp/workflow-debug.json"
```

## Variable Interpolation

The `set` action supports interpolation in values:

```yaml
steps:
  - name: "Get Project Name"
    tool: bash
    command: "basename {project_path}"
    output_var: project_name

  - name: "Set Derived Values"
    tool: context
    action: set
    values:
      build_dir: "{project_path}/build"
      output_file: "{project_name}-output.txt"
      log_file: "/tmp/{project_name}.log"
```

The `export` action also supports interpolation in the file path:

```yaml
steps:
  - name: "Export with Dynamic Path"
    tool: context
    action: export
    file: "{project_path}/debug/context-{timestamp}.json"
```

## Output Messages

Each action returns a descriptive success message:

| Action | Output Example |
|--------|----------------|
| `set` | `Set 4 variable(s): api_url, timeout, max_retries, environment` |
| `copy` | `Copied 2 variable(s): current_branch -> saved_branch; current_version -> original_version` |
| `clear` | `Cleared 3 variable(s): temp_result, intermediate_data, scratch_value` |
| `export` | `Exported 5 variable(s) to /tmp/workflow-debug.json` |

For `copy` action, if source variables are not found:

```
Copied 1 variable(s). Not found: missing_var, another_missing
```

## Common Patterns

### Workflow Initialization

Set up all configuration at the beginning of a workflow:

```yaml
steps:
  - name: "Initialize Workflow"
    tool: context
    action: set
    values:
      version: "1.0.0"
      environment: "staging"
      base_url: "https://staging.example.com"
      retry_count: "0"
      max_retries: "3"

  - name: "Start Processing"
    prompt: "Deploy version {version} to {environment}"
```

### State Preservation Before Risky Operations

Save current state before making changes:

```yaml
steps:
  - name: "Get Current Branch"
    tool: bash
    command: "git branch --show-current"
    output_var: current_branch

  - name: "Get Current Commit"
    tool: bash
    command: "git rev-parse HEAD"
    output_var: current_commit

  - name: "Save Original State"
    tool: context
    action: copy
    mappings:
      current_branch: original_branch
      current_commit: original_commit

  - name: "Perform Risky Operation"
    prompt: "Rebase onto main branch"
    on_error: continue

  - name: "Restore On Failure"
    tool: bash
    command: "git checkout {original_branch} && git reset --hard {original_commit}"
    when: "step_error is not empty"
```

### Debug Export During Development

Export context state at key points for debugging:

```yaml
steps:
  - name: "Process Data"
    prompt: "Transform the input data"
    output_var: processed_data

  - name: "Debug: Export After Processing"
    tool: context
    action: export
    file: "/tmp/debug-after-processing.json"

  - name: "Validate Data"
    prompt: "Validate the processed data"
    output_var: validation_result

  - name: "Debug: Export After Validation"
    tool: context
    action: export
    file: "/tmp/debug-after-validation.json"
```

### Selective Export

Export only specific variables of interest:

```yaml
steps:
  - name: "Export User Data Only"
    tool: context
    action: export
    file: "/tmp/user-context.json"
    vars:
      - user_id
      - user_name
      - user_role
      - session_token
```

### Cleanup After Loop Completion

Clear temporary loop variables after processing:

```yaml
steps:
  - name: "Process Items"
    tool: foreach
    items:
      - file1.txt
      - file2.txt
      - file3.txt
    item_var: current_file
    steps:
      - name: "Process File"
        prompt: "Process {current_file}"

  - name: "Clean Up Loop Variables"
    tool: context
    action: clear
    vars:
      - current_file
      - loop_index
      - temp_result
```

### Environment-Specific Configuration

Set different values based on environment:

```yaml
steps:
  - name: "Detect Environment"
    tool: bash
    command: "echo $NODE_ENV"
    output_var: env

  - name: "Set Production Config"
    tool: context
    action: set
    values:
      api_url: "https://api.example.com"
      log_level: "error"
      debug_mode: "false"
    when: "{env} == production"

  - name: "Set Development Config"
    tool: context
    action: set
    values:
      api_url: "http://localhost:3000"
      log_level: "debug"
      debug_mode: "true"
    when: "{env} != production"
```

### Renaming Variables

Use `copy` followed by `clear` to effectively rename a variable:

```yaml
steps:
  - name: "Rename Variable"
    tool: context
    action: copy
    mappings:
      old_variable_name: new_variable_name

  - name: "Remove Old Variable"
    tool: context
    action: clear
    vars:
      - old_variable_name
```

## Comparison with Set Tool

| Feature | `context` tool | `set` tool |
|---------|----------------|------------|
| Set single variable | Use `action: set` with single value | Natural fit |
| Set multiple variables | Single step with `values` dict | Multiple steps required |
| Copy between variables | `action: copy` | Not supported |
| Clear variables | `action: clear` | Not supported |
| Export to file | `action: export` | Not supported |

Use the `set` tool for simple, single-variable assignments. Use the `context` tool when you need to:
- Set multiple variables at once
- Copy values between variables
- Clear variables from context
- Export context state for debugging

## Tips

### Use Context Set for Related Variables

Group related configuration in a single step:

```yaml
# Good: Related variables together
- name: "Configure Database"
  tool: context
  action: set
  values:
    db_host: "localhost"
    db_port: "5432"
    db_name: "myapp"
    db_user: "admin"

# Less ideal: Scattered across multiple steps
- name: "Set DB Host"
  tool: set
  var: db_host
  value: "localhost"
# ... etc
```

### Export for Workflow Debugging

When debugging complex workflows, export context at different stages:

```yaml
- name: "Debug Checkpoint 1"
  tool: context
  action: export
  file: "/tmp/debug-{step_name}.json"
```

### Clear Sensitive Data After Use

Remove sensitive variables when no longer needed:

```yaml
- name: "Clear Credentials"
  tool: context
  action: clear
  vars:
    - api_key
    - auth_token
    - temp_password
```

### Copy Before Overwriting

Save important values before they might be overwritten:

```yaml
- name: "Save Before Loop"
  tool: context
  action: copy
  mappings:
    counter: counter_backup

- name: "Loop That Modifies Counter"
  tool: foreach
  # ... loop that uses counter
```

## Error Handling

The context tool handles errors gracefully:

- **Missing source in copy**: Reports which variables were not found but continues copying found ones
- **Clear non-existent variable**: Silently ignores variables that do not exist
- **Export file write failure**: Returns an error with the OS error message
- **Invalid action**: Returns validation error listing valid actions

Example of partial success in copy:

```yaml
# If 'missing_var' does not exist:
- name: "Copy with Missing Source"
  tool: context
  action: copy
  mappings:
    existing_var: target1
    missing_var: target2
# Output: "Copied 1 variable(s). Not found: missing_var"
```
