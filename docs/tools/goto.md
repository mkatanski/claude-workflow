# Goto Tool

The `goto` tool enables non-linear control flow in workflows by jumping to a named step. This allows you to create loops, conditional branching, and retry logic.

## Overview

Unlike sequential step execution, `goto` redirects workflow execution to any named step. When a goto step executes, the workflow continues from the target step instead of the next step in sequence.

```yaml
- name: jump-to-start
  tool: goto
  target: process-item
```

## Configuration

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `target` | string | Name of the step to jump to. Must match an existing step's `name` field exactly. |

### Optional Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `when` | string | - | Condition that must be true for the goto to execute. If false, the goto is skipped and execution continues to the next step. |

## Variable Interpolation

The `target` field supports variable interpolation using `{variable_name}` syntax. This enables dynamic step targeting based on runtime values.

```yaml
- name: set-next-step
  tool: set
  var: next_step
  value: validate-data

- name: dynamic-jump
  tool: goto
  target: "{next_step}"
```

## Use Cases

### 1. Simple Loops

Repeat a sequence of steps until a condition is met.

```yaml
steps:
  - name: initialize-counter
    tool: set
    var: counter
    value: "0"

  - name: process-item
    tool: bash
    command: echo "Processing item {counter}"

  - name: increment-counter
    tool: bash
    command: echo $(( {counter} + 1 ))
    output_var: counter

  - name: check-loop
    tool: goto
    target: process-item
    when: "{counter} < 5"

  - name: done
    tool: bash
    command: echo "Finished processing"
```

### 2. Conditional Branching

Jump to different steps based on conditions.

```yaml
steps:
  - name: check-status
    tool: bash
    command: curl -s -o /dev/null -w "%{http_code}" https://api.example.com/health
    output_var: status_code

  - name: handle-success
    tool: goto
    target: continue-workflow
    when: "{status_code} == 200"

  - name: handle-failure
    prompt: The API returned status {status_code}. Investigate and fix the issue.

  - name: retry-check
    tool: goto
    target: check-status

  - name: continue-workflow
    prompt: API is healthy. Continue with main workflow.
```

### 3. Retry Logic

Retry a step until it succeeds or max attempts reached.

```yaml
steps:
  - name: init-retry
    tool: set
    var: attempts
    value: "0"

  - name: attempt-operation
    tool: bash
    command: |
      echo $(( {attempts} + 1 ))
    output_var: attempts

  - name: run-flaky-command
    tool: bash
    command: ./run-flaky-script.sh
    output_var: result
    on_error: continue

  - name: check-success
    tool: goto
    target: operation-complete
    when: "{result} contains success"

  - name: retry-if-attempts-left
    tool: goto
    target: attempt-operation
    when: "{attempts} < 3"

  - name: max-retries-exceeded
    tool: bash
    command: echo "Operation failed after 3 attempts"

  - name: operation-complete
    tool: bash
    command: echo "Operation succeeded on attempt {attempts}"
```

### 4. State Machine Pattern

Implement complex flows using state-based jumps.

```yaml
steps:
  - name: set-initial-state
    tool: set
    var: state
    value: "fetch"

  - name: state-fetch
    tool: bash
    command: curl -s https://api.example.com/data
    output_var: data
    when: "{state} == fetch"

  - name: transition-to-validate
    tool: set
    var: state
    value: "validate"
    when: "{state} == fetch"

  - name: state-validate
    tool: claude_sdk
    prompt: Validate this data structure
    when: "{state} == validate"

  - name: transition-to-complete
    tool: set
    var: state
    value: "complete"
    when: "{state} == validate"

  - name: state-router
    tool: goto
    target: state-fetch
    when: "{state} != complete"

  - name: workflow-complete
    tool: bash
    command: echo "State machine completed"
```

## Step Targeting

### How It Works

1. The workflow runner builds an index mapping step names to their positions
2. When `goto` executes, it looks up the target step name in this index
3. Execution continues from the target step (not after it)
4. The target step runs again with its full logic including any `when` conditions

### Target Resolution

- Step names are matched exactly (case-sensitive)
- The target must reference an existing step name
- If the target step doesn't exist, the workflow fails with an error listing available steps

```
Error: Goto target step 'non-existent-step' not found.
Available steps: ['initialize', 'process', 'validate', 'complete']
```

### Dynamic Targets

When using variable interpolation in the target:

```yaml
- name: dynamic-jump
  tool: goto
  target: "{next_step}"
```

The variable is resolved at execution time. If the variable doesn't exist or resolves to a non-existent step, the workflow fails.

## Combining with Conditions

The `when` field on a goto step determines whether the jump happens:

```yaml
- name: conditional-loop
  tool: goto
  target: start-processing
  when: "{items_remaining} > 0 and {errors} < 3"
```

### Available Condition Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `==` | Equal | `{count} == 5` |
| `!=` | Not equal | `{status} != error` |
| `>`, `>=`, `<`, `<=` | Numeric comparison | `{retries} < 3` |
| `contains` | Substring match | `{output} contains success` |
| `not contains` | Negative substring | `{result} not contains error` |
| `starts with` | Prefix match | `{path} starts with /api` |
| `ends with` | Suffix match | `{file} ends with .json` |
| `is empty` | Empty check | `{response} is empty` |
| `is not empty` | Non-empty check | `{data} is not empty` |
| `and` | Logical AND | `{a} > 0 and {b} < 10` |
| `or` | Logical OR | `{x} == 1 or {y} == 2` |

## Best Practices

### Use Descriptive Step Names

Clear step names make goto targets easier to understand and maintain.

```yaml
# Good
- name: retry-failed-upload
  tool: goto
  target: upload-file

# Avoid
- name: step-7
  tool: goto
  target: step-3
```

### Always Include Exit Conditions

Every loop created with goto must have a way to exit to prevent infinite loops.

```yaml
# Good - has exit condition
- name: loop-back
  tool: goto
  target: process
  when: "{counter} < 10"

# Dangerous - no exit condition
- name: infinite-loop
  tool: goto
  target: start
```

### Prefer Forward Jumps for Branching

When skipping steps based on conditions, jump forward to avoid confusion.

```yaml
# Clear control flow
- name: skip-optional-step
  tool: goto
  target: required-step
  when: "{skip_optional} == true"

- name: optional-step
  prompt: Do optional work

- name: required-step
  prompt: Continue with required work
```

### Limit Loop Iterations

Include a maximum iteration counter to prevent runaway loops.

```yaml
- name: increment-iteration
  tool: bash
  command: echo $(( {iteration} + 1 ))
  output_var: iteration

- name: safety-check
  tool: bash
  command: |
    if [ {iteration} -gt 100 ]; then
      echo "Max iterations exceeded"
      exit 1
    fi
  on_error: stop

- name: continue-loop
  tool: goto
  target: process-next
  when: "{has_more_items} == true"
```

## Warnings

### Infinite Loops

Goto can create infinite loops if exit conditions are not properly set. The workflow will run until manually stopped or resources are exhausted.

```yaml
# This will loop forever
steps:
  - name: infinite
    tool: bash
    command: echo "stuck"

  - name: bad-loop
    tool: goto
    target: infinite
```

### Step Order Matters

When jumping backward, be aware that variable values from later steps may not exist yet on first iteration.

```yaml
steps:
  - name: process  # First iteration: result doesn't exist yet
    tool: bash
    command: echo "Processing {result}"  # Uses empty string initially

  - name: compute
    tool: bash
    command: echo "computed"
    output_var: result

  - name: loop
    tool: goto
    target: process
    when: "{counter} < 5"
```

### Complex Flows

For very complex control flow, consider breaking the workflow into multiple simpler workflows or using the `foreach` tool for iteration over collections.

## Related Tools

- [set](./set.md) - Set variables for use in goto conditions
- [foreach](./foreach.md) - Iterate over arrays (often cleaner than goto loops)
- [bash](./bash.md) - Execute commands and capture output for conditions
