# Range Tool

The `range` tool executes a sequence of nested steps for a range of numbers. It provides a simple counting loop that iterates from a start value to an end value, with support for custom step increments, loop control (`break` and `continue`), and automatic variable management.

## Use Cases

The range tool is ideal when you need to:

- **Iterate a fixed number of times**: Process batches, retry operations, or repeat tasks a specific count
- **Count up or down**: Supports both ascending and descending ranges with positive or negative steps
- **Index-based operations**: Access iteration index via the loop variable for numbered processing
- **Numeric iteration**: When you have numeric bounds rather than a collection to iterate over

### Range vs ForEach

| Use Case | Tool |
|----------|------|
| Iterate over an array of items | `foreach` |
| Iterate a specific number of times | `range` |
| Process numbered batches (1-10) | `range` |
| Process a list of files | `foreach` |
| Countdown or count-up loops | `range` |

## Basic Usage

```yaml
steps:
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

## Configuration Options

| Option | Required | Type | Default | Description |
|--------|----------|------|---------|-------------|
| `from` | Yes | integer | - | Start value of the range (inclusive) |
| `to` | Yes | integer | - | End value of the range (inclusive) |
| `var` | Yes | string | - | Variable name to store the current value during each iteration |
| `step` | No | integer | `1` | Increment/decrement value between iterations |
| `steps` | Yes | array | - | List of steps to execute for each value in the range |

### Required Fields

- **`from`**: The starting integer value. The range is inclusive of this value.
- **`to`**: The ending integer value. The range is inclusive of this value.
- **`var`**: Variable name that will hold the current iteration value. This variable is available within nested steps using `{var_name}` interpolation.
- **`steps`**: Array of nested steps to execute for each value in the range.

### Optional Fields

#### `step`

Controls the increment between iterations. Defaults to `1`.

- **Positive values**: Count upward (e.g., 1, 2, 3, 4, 5)
- **Negative values**: Count downward (e.g., 5, 4, 3, 2, 1)
- **Cannot be zero**: A step of 0 would cause an infinite loop and raises a validation error

```yaml
# Count by 2s: 0, 2, 4, 6, 8, 10
- name: "Process even numbers"
  tool: range
  from: 0
  to: 10
  step: 2
  var: num
  steps:
    - name: "Process {num}"
      tool: bash
      command: "echo Processing number {num}"
```

## Range Behavior

### Inclusive Bounds

Both `from` and `to` values are included in the range:

```yaml
# Produces values: 1, 2, 3, 4, 5
from: 1
to: 5
```

### Ascending Ranges (Positive Step)

When `step` is positive, the range counts upward:

```yaml
# Values: 1, 3, 5, 7, 9
from: 1
to: 10
step: 2
```

### Descending Ranges (Negative Step)

When `step` is negative, the range counts downward:

```yaml
# Values: 10, 8, 6, 4, 2
from: 10
to: 2
step: -2
```

### Empty Ranges

If the range produces no values (e.g., counting up when `from` > `to` with positive step), no iterations occur:

```yaml
# Empty range - no iterations
from: 10
to: 1
step: 1  # Cannot count up from 10 to 1
```

Output: `Empty range, no iterations performed`

## Automatic Variables

During each iteration, the range tool sets:

| Variable | Description |
|----------|-------------|
| `{var}` | Current value in the range (as specified by `var` field) |
| `{_iteration}` | Zero-based iteration index |

### Variable Cleanup

The range tool automatically manages variables:

- **Before the loop**: Original values of `var` and `_iteration` are saved
- **During iteration**: Variables are updated with current value/index
- **After the loop**: Original values are restored (or variables are deleted if they did not exist before)

This ensures that range loops do not pollute the context with leftover iteration variables.

## Using Break and Continue

The `break` and `continue` tools control loop execution flow within range loops.

### Break - Exit Loop Early

Use `break` to exit the loop entirely when a condition is met:

```yaml
- name: "Find threshold"
  tool: range
  from: 1
  to: 100
  var: num
  steps:
    - name: "Check value"
      tool: bash
      command: "test {num} -ge 50 && echo 'found' || echo 'searching'"
      output_var: status

    - name: "Stop when found"
      tool: break
      when: "{status} == found"

    - name: "Continue processing"
      tool: bash
      command: "echo 'Processing {num}'"
```

### Continue - Skip to Next Iteration

Use `continue` to skip the remaining steps for the current iteration and move to the next:

```yaml
- name: "Skip odd numbers"
  tool: range
  from: 1
  to: 10
  var: num
  steps:
    - name: "Check if odd"
      tool: bash
      command: "test $(( {num} % 2 )) -eq 1 && echo 'odd' || echo 'even'"
      output_var: parity

    - name: "Skip odd"
      tool: continue
      when: "{parity} == odd"

    - name: "Process even number"
      tool: bash
      command: "echo 'Processing even number {num}'"
```

## Nested Steps

Nested steps within a range loop support all standard step features:

- **Conditional execution** with `when`
- **Output capture** with `output_var`
- **Error handling** with `on_error`
- **Goto** (within the range's nested steps only)

### Example with All Features

```yaml
- name: "Complex batch processing"
  tool: range
  from: 1
  to: 10
  var: batch
  steps:
    - name: "Check batch status"
      tool: bash
      command: "check_batch.sh {batch}"
      output_var: batch_status
      on_error: continue

    - name: "Skip completed batches"
      tool: continue
      when: "{batch_status} == completed"

    - name: "Process batch"
      prompt: "Process batch number {batch}"
      output_var: result

    - name: "Verify batch"
      tool: bash
      command: "verify_batch.sh {batch}"
      output_var: verified

    - name: "Stop on critical failure"
      tool: break
      when: "{verified} == critical_failure"
```

## Error Handling

By default, the range tool uses "stop" behavior - if any nested step fails, the loop stops and the workflow fails.

### Nested Step Error Handling

Use `on_error` on individual nested steps to control behavior:

```yaml
- name: "Process with error tolerance"
  tool: range
  from: 1
  to: 5
  var: num
  steps:
    - name: "Risky operation"
      tool: bash
      command: "might_fail.sh {num}"
      on_error: continue  # Continue to next step even if this fails

    - name: "Always runs"
      tool: bash
      command: "cleanup.sh {num}"
```

## Common Patterns

### Pattern 1: Simple Counting Loop

```yaml
steps:
  - name: "Create 5 test users"
    tool: range
    from: 1
    to: 5
    var: user_num
    steps:
      - name: "Create user {user_num}"
        tool: bash
        command: "createuser testuser{user_num}"
```

### Pattern 2: Batch Processing

```yaml
steps:
  - name: "Process data in 10 batches"
    tool: range
    from: 0
    to: 9
    var: batch_id
    steps:
      - name: "Process batch {batch_id}"
        tool: bash
        command: "process_batch.sh --batch={batch_id} --total=10"
        visible: true
```

### Pattern 3: Countdown

```yaml
steps:
  - name: "Countdown timer"
    tool: range
    from: 10
    to: 1
    step: -1
    var: seconds
    steps:
      - name: "Display {seconds}"
        tool: bash
        command: "echo '{seconds} seconds remaining...'"

      - name: "Wait"
        tool: bash
        command: "sleep 1"
```

### Pattern 4: Retry Loop with Max Attempts

```yaml
steps:
  - name: "Retry operation up to 5 times"
    tool: range
    from: 1
    to: 5
    var: attempt
    steps:
      - name: "Attempt {attempt}"
        tool: bash
        command: "curl -s http://api.example.com/health && echo 'success' || echo 'failed'"
        output_var: result

      - name: "Stop on success"
        tool: break
        when: "{result} == success"

      - name: "Wait before retry"
        tool: bash
        command: "sleep 2"
        when: "{result} == failed"
```

### Pattern 5: Pagination

```yaml
steps:
  - name: "Fetch all pages"
    tool: range
    from: 1
    to: 10
    var: page
    steps:
      - name: "Fetch page {page}"
        tool: bash
        command: "curl -s 'https://api.example.com/items?page={page}'"
        output_var: page_data

      - name: "Process page data"
        prompt: "Process the items from page {page}: {page_data}"

      - name: "Check for empty page"
        tool: bash
        command: "test -z '{page_data}' && echo 'empty' || echo 'has_data'"
        output_var: page_status

      - name: "Stop if no more data"
        tool: break
        when: "{page_status} == empty"
```

### Pattern 6: Step by Custom Increment

```yaml
steps:
  - name: "Process every 10th item"
    tool: range
    from: 0
    to: 100
    step: 10
    var: offset
    steps:
      - name: "Process items at offset {offset}"
        tool: bash
        command: "process_items.sh --offset={offset} --limit=10"
```

### Pattern 7: Using _iteration Index

```yaml
steps:
  - name: "Numbered output"
    tool: range
    from: 100
    to: 105
    var: value
    steps:
      - name: "Show iteration info"
        tool: bash
        command: "echo 'Iteration {_iteration}: Value = {value}'"
```

Output:
```
Iteration 0: Value = 100
Iteration 1: Value = 101
Iteration 2: Value = 102
Iteration 3: Value = 103
Iteration 4: Value = 104
Iteration 5: Value = 105
```

## Output Summary

After completion, the range tool provides a summary:

```
Completed 5/5 iterations
```

Or with errors:

```
Completed 3/5 iterations (2 errors)
```

## Validation Rules

The range tool enforces the following validation rules:

1. **`from` is required**: Must be an integer
2. **`to` is required**: Must be an integer
3. **`var` is required**: Must be a non-empty string
4. **`steps` is required**: Must contain at least one step
5. **`step` cannot be zero**: Would cause an infinite loop
6. **All values must be integers**: Float values are not supported

### Validation Error Examples

```yaml
# ERROR: Missing 'from' field
- name: "Invalid"
  tool: range
  to: 5
  var: num
  steps: [...]

# ERROR: 'step' cannot be zero
- name: "Invalid"
  tool: range
  from: 1
  to: 5
  step: 0
  var: num
  steps: [...]

# ERROR: 'from' must be an integer
- name: "Invalid"
  tool: range
  from: 1.5
  to: 5
  var: num
  steps: [...]
```

## Tips and Best Practices

### 1. Use Descriptive Variable Names

```yaml
# Good - clear what the variable represents
var: batch_number

# Less clear
var: i
```

### 2. Combine with Conditional Steps

```yaml
- name: "Conditional processing"
  tool: range
  from: 1
  to: 10
  var: num
  steps:
    - name: "Heavy processing"
      prompt: "Process item {num} with full analysis"
      when: "{num} <= 3"  # Only first 3 get full processing

    - name: "Light processing"
      tool: bash
      command: "quick_process.sh {num}"
      when: "{num} > 3"  # Rest get quick processing
```

### 3. Use Break for Early Exit

Instead of processing all iterations, exit early when done:

```yaml
- name: "Find first match"
  tool: range
  from: 1
  to: 1000
  var: num
  steps:
    - name: "Check {num}"
      tool: bash
      command: "check_condition.sh {num}"
      output_var: found

    - name: "Exit when found"
      tool: break
      when: "{found} == true"
```

### 4. Handle Empty Ranges Gracefully

Empty ranges (no iterations) succeed with a message. Your workflow should account for this:

```yaml
# This will produce "Empty range, no iterations performed"
- name: "Possibly empty range"
  tool: range
  from: 10
  to: 1
  step: 1
  var: num
  steps:
    - name: "Process"
      tool: bash
      command: "echo {num}"
```

### 5. Prefer Range Over Bash Loops for Visibility

Using the range tool provides better visibility and control compared to bash for loops:

```yaml
# Better - orchestrator tracks each iteration
- name: "Process batches"
  tool: range
  from: 1
  to: 5
  var: batch
  steps:
    - name: "Process {batch}"
      tool: bash
      command: "process.sh {batch}"

# Less visible - all iterations happen in one bash step
- name: "Process all"
  tool: bash
  command: |
    for i in {1..5}; do
      process.sh $i
    done
```
