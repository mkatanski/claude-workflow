# Break Tool

The Break tool exits the current `foreach` loop immediately, stopping all remaining iterations.

## Overview

When executed inside a `foreach` loop, the `break` tool signals the loop to terminate. The workflow continues with the next step after the `foreach` block. If used outside a loop context, the break signal has no effect.

## YAML Configuration

```yaml
- name: exit-loop
  tool: break
```

The Break tool requires no additional configuration. It only needs a `name` field (like all steps) and the `tool: break` declaration.

### Conditional Break

Use the `when` clause to break only when a condition is met:

```yaml
- name: exit-on-error
  tool: break
  when: "{status} == error"
```

## How It Works with ForEach

The Break tool works by returning a `LoopSignal.BREAK` signal to the parent `foreach` loop. When the foreach loop receives this signal, it:

1. Stops processing the current iteration
2. Skips all remaining items in the source array
3. Prints a break message: `Break at iteration N`
4. Returns control to the main workflow

The loop is considered successful even when broken early. Variables set during completed iterations are preserved.

### Execution Flow

```
foreach loop starts
  |
  v
Iteration 1 -> steps execute -> success
  |
  v
Iteration 2 -> step with break executes
  |
  v
Loop terminates immediately
  |
  v
Workflow continues after foreach
```

## Example Workflow Steps

### Basic Early Exit

Stop processing files after finding a match:

```yaml
type: claude-workflow
version: 2
name: Find First Match

vars:
  files: '["config.json", "settings.yaml", "data.json"]'
  found: "false"

steps:
  - name: search-files
    tool: foreach
    source: files
    item_var: file
    steps:
      - name: check-file
        prompt: Check if {file} contains the search term
        output_var: result

      - name: mark-found
        tool: set
        var: found
        value: "true"
        when: "{result} contains match"

      - name: stop-search
        tool: break
        when: "{found} == true"

  - name: report
    prompt: Report that search is complete. Found: {found}
```

### Processing Until Limit

Process items until a quota is reached:

```yaml
type: claude-workflow
version: 2
name: Process With Limit

vars:
  items: '["task1", "task2", "task3", "task4", "task5"]'
  processed_count: "0"
  max_items: "3"

steps:
  - name: process-items
    tool: foreach
    source: items
    item_var: item
    index_var: idx
    steps:
      - name: check-limit
        tool: break
        when: "{processed_count} >= {max_items}"

      - name: process
        prompt: Process {item}

      - name: increment
        tool: set
        var: processed_count
        value: "{idx}"
```

### Error-Based Exit

Stop on first failure without failing the workflow:

```yaml
type: claude-workflow
version: 2
name: Validate Until Error

vars:
  configs: '["prod.yaml", "staging.yaml", "dev.yaml"]'
  validation_failed: "false"

steps:
  - name: validate-configs
    tool: foreach
    source: configs
    item_var: config
    on_item_error: continue
    steps:
      - name: validate
        prompt: Validate {config} and output "valid" or "invalid"
        output_var: validation_result

      - name: mark-failure
        tool: set
        var: validation_failed
        value: "true"
        when: "{validation_result} contains invalid"

      - name: stop-on-failure
        tool: break
        when: "{validation_failed} == true"

  - name: handle-result
    prompt: |
      Validation complete.
      Failed: {validation_failed}
      Take appropriate action.
```

## Common Patterns

### Early Exit on Success

Exit as soon as a task succeeds:

```yaml
- name: exit-on-success
  tool: break
  when: "{task_result} == success"
```

### Exit on Threshold

Break when a numeric threshold is exceeded:

```yaml
- name: exit-on-threshold
  tool: break
  when: "{error_count} > 5"
```

### Exit on Empty Result

Stop when no more data is available:

```yaml
- name: exit-on-empty
  tool: break
  when: "{response} is empty"
```

### Conditional Multi-Criteria Exit

Break based on multiple conditions:

```yaml
- name: exit-complex
  tool: break
  when: "{status} == done and {validated} == true"
```

## Related Tools

- **[continue](./continue.md)** - Skip to the next iteration without exiting the loop
- **[foreach](./foreach.md)** - The loop construct that break operates within
- **[set](./set.md)** - Often used to set flags that trigger break conditions

## Notes

- Break only affects the innermost `foreach` loop when loops are nested
- The break step itself always succeeds (returns `success: true`)
- Using break outside a foreach loop has no effect on workflow execution
- The `when` clause is evaluated before the break signal is sent
