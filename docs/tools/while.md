# While Tool

The `while` tool executes a sequence of nested steps repeatedly while a condition evaluates to true. It provides condition-based looping with built-in safety limits, loop control signals (`break` and `continue`), and automatic iteration tracking.

## Overview

Unlike `foreach` which iterates over a fixed collection, the `while` tool continues executing until its condition becomes false or a maximum iteration limit is reached. This makes it ideal for scenarios where the number of iterations is not known in advance.

```yaml
- name: process-queue
  tool: while
  condition: "{has_more_items} == true"
  max_iterations: 100
  steps:
    - name: get-next
      tool: bash
      command: ./get_next_item.sh
      output_var: current_item
```

## Configuration Options

| Option | Required | Type | Default | Description |
|--------|----------|------|---------|-------------|
| `condition` | Yes | string | - | Condition expression evaluated before each iteration. Loop continues while true. |
| `max_iterations` | Yes | integer | - | Safety limit to prevent infinite loops. Must be a positive integer. |
| `steps` | Yes | array | - | List of steps to execute for each iteration. |
| `on_max_reached` | No | string | `"error"` | Behavior when max_iterations is reached: `error` or `continue`. |

### Field Details

#### `condition` (required)

The condition expression evaluated before each iteration. Supports variable interpolation and all standard condition operators. The loop executes while this condition is true.

```yaml
condition: "{status} == pending"
condition: "{counter} < 10"
condition: "{result} contains more_data"
```

#### `max_iterations` (required)

A mandatory safety limit that prevents infinite loops. The workflow will stop if this limit is reached, regardless of the condition. This field is required to ensure workflows do not run indefinitely.

```yaml
max_iterations: 50
max_iterations: 1000
```

#### `on_max_reached` (optional)

Controls behavior when `max_iterations` is reached while the condition is still true:

- **`error`** (default): Fail the workflow with an error message
- **`continue`**: Log a warning and continue with the rest of the workflow

```yaml
on_max_reached: continue  # Proceed even if limit hit
```

## When to Use While vs ForEach vs Goto

| Tool | Best For | Example Use Case |
|------|----------|------------------|
| `while` | Unknown iteration count, condition-based loops | Polling APIs, processing queues, retry until success |
| `foreach` | Fixed collections, known data sets | Processing list of files, iterating over API results |
| `goto` | State machines, complex branching, retry with specific jumps | Multi-path workflows, manual loop construction |

### Choose While When:

- You do not know how many iterations you need
- You are waiting for a condition to change
- You are processing data until exhausted
- You need built-in safety limits for iteration count

### Choose ForEach When:

- You have a fixed array or collection to iterate over
- You need filtering, sorting, or `break_when` functionality
- The iteration count is determined by the data

### Choose Goto When:

- You need complex branching between multiple steps
- You are implementing a state machine
- You need more control over the flow structure

## Basic Examples

### Polling Until Ready

```yaml
steps:
  - name: wait-for-deployment
    tool: while
    condition: "{deploy_status} != ready"
    max_iterations: 30
    steps:
      - name: check-status
        tool: bash
        command: kubectl get deployment myapp -o jsonpath='{.status.availableReplicas}'
        output_var: deploy_status

      - name: wait
        tool: bash
        command: sleep 10
```

### Processing a Queue

```yaml
steps:
  - name: set-initial-state
    tool: set
    var: has_items
    value: "true"

  - name: process-queue
    tool: while
    condition: "{has_items} == true"
    max_iterations: 100
    steps:
      - name: get-next-item
        tool: bash
        command: ./dequeue.sh
        output_var: item

      - name: check-if-empty
        tool: set
        var: has_items
        value: "false"
        when: "{item} is empty"

      - name: process-item
        prompt: "Process queue item: {item}"
        when: "{item} is not empty"
```

### Retry Until Success

```yaml
steps:
  - name: set-initial-result
    tool: set
    var: operation_result
    value: "failed"

  - name: retry-operation
    tool: while
    condition: "{operation_result} != success"
    max_iterations: 5
    on_max_reached: error
    steps:
      - name: attempt-operation
        tool: bash
        command: ./flaky_operation.sh
        output_var: operation_result
        on_error: continue

      - name: wait-before-retry
        tool: bash
        command: sleep 5
        when: "{operation_result} != success"
```

## Using Break and Continue

The `break` and `continue` tools control loop execution flow within while loops, just as they do with foreach loops.

### Break - Exit Loop Early

Use `break` to exit the while loop immediately when a specific condition is met:

```yaml
steps:
  - name: search-logs
    tool: while
    condition: "{page} <= {total_pages}"
    max_iterations: 100
    steps:
      - name: fetch-page
        tool: bash
        command: curl -s "https://api.example.com/logs?page={page}"
        output_var: log_data

      - name: check-for-error
        tool: bash
        command: echo "{log_data}" | grep -q "CRITICAL" && echo "found" || echo "not_found"
        output_var: found_critical

      - name: exit-on-critical
        tool: break
        when: "{found_critical} == found"

      - name: next-page
        tool: bash
        command: echo $(( {page} + 1 ))
        output_var: page
```

### Continue - Skip to Next Iteration

Use `continue` to skip the remaining steps in the current iteration and move to the next:

```yaml
steps:
  - name: process-stream
    tool: while
    condition: "{stream_active} == true"
    max_iterations: 1000
    steps:
      - name: read-message
        tool: bash
        command: ./read_stream.sh
        output_var: message

      - name: skip-heartbeats
        tool: continue
        when: "{message} contains heartbeat"

      - name: process-message
        prompt: "Process stream message: {message}"
```

## Condition Syntax

The `condition` field supports the same operators available in `when` clauses throughout the workflow system.

### Available Operators

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

### Condition Examples

```yaml
# Simple equality
condition: "{status} == pending"

# Numeric comparison
condition: "{retry_count} < 5"

# String matching
condition: "{response} contains more_pages"

# Compound conditions
condition: "{status} != done and {errors} < 3"

# Empty checks
condition: "{queue} is not empty"
```

## Automatic Variables

The while tool automatically manages the `_iteration` variable during execution:

| Variable | Description |
|----------|-------------|
| `_iteration` | Current iteration index (0-based), available within nested steps |

### Using _iteration

```yaml
steps:
  - name: countdown
    tool: while
    condition: "{counter} > 0"
    max_iterations: 10
    steps:
      - name: log-iteration
        tool: bash
        command: echo "Iteration {_iteration}, counter is {counter}"

      - name: decrement
        tool: bash
        command: echo $(( {counter} - 1 ))
        output_var: counter
```

After the loop completes, the `_iteration` variable is cleaned up (restored to its original value if it existed, or removed).

## Nested Steps Features

Steps within a while loop support all standard step features:

- **Conditional execution** with `when`
- **Output capture** with `output_var`
- **Error handling** with `on_error`
- **Goto** (within the while loop's nested steps only)

### Example with Multiple Features

```yaml
steps:
  - name: complex-processing
    tool: while
    condition: "{queue_size} > 0"
    max_iterations: 50
    steps:
      - name: get-queue-size
        tool: bash
        command: ./queue_size.sh
        output_var: queue_size

      - name: skip-if-empty
        tool: continue
        when: "{queue_size} == 0"

      - name: process-batch
        tool: bash
        command: ./process_batch.sh
        output_var: batch_result
        on_error: continue

      - name: check-critical-error
        tool: break
        when: "{batch_result} contains CRITICAL"

      - name: log-progress
        tool: bash
        command: echo "Processed batch, {queue_size} remaining"
```

## Common Patterns

### Pattern 1: Pagination

Fetch all pages from an API:

```yaml
steps:
  - name: init-pagination
    tool: set
    var: page
    value: "1"

  - name: init-has-more
    tool: set
    var: has_more
    value: "true"

  - name: fetch-all-pages
    tool: while
    condition: "{has_more} == true"
    max_iterations: 100
    steps:
      - name: fetch-page
        tool: bash
        command: |
          curl -s "https://api.example.com/items?page={page}" | jq -c '.'
        output_var: response

      - name: check-next-page
        tool: bash
        command: echo "{response}" | jq -r '.has_next // "false"'
        output_var: has_more

      - name: process-items
        prompt: "Process items from page {page}: {response}"

      - name: increment-page
        tool: bash
        command: echo $(( {page} + 1 ))
        output_var: page
```

### Pattern 2: Waiting for External Process

Wait for a long-running job to complete:

```yaml
steps:
  - name: start-job
    tool: bash
    command: ./start_job.sh
    output_var: job_id

  - name: wait-for-completion
    tool: while
    condition: "{job_status} != completed and {job_status} != failed"
    max_iterations: 60
    on_max_reached: error
    steps:
      - name: check-status
        tool: bash
        command: ./check_job_status.sh {job_id}
        output_var: job_status

      - name: wait-interval
        tool: bash
        command: sleep 30

  - name: handle-result
    prompt: "Job {job_id} finished with status: {job_status}"
```

### Pattern 3: Incremental Processing

Process data in batches until complete:

```yaml
steps:
  - name: init-offset
    tool: set
    var: offset
    value: "0"

  - name: process-batches
    tool: while
    condition: "{batch_count} > 0"
    max_iterations: 200
    steps:
      - name: fetch-batch
        tool: bash
        command: |
          curl -s "https://api.example.com/data?offset={offset}&limit=50" | jq -c '.items'
        output_var: batch

      - name: count-batch
        tool: bash
        command: echo "{batch}" | jq 'length'
        output_var: batch_count

      - name: skip-empty
        tool: continue
        when: "{batch_count} == 0"

      - name: process-batch
        prompt: "Process batch of {batch_count} items starting at offset {offset}"

      - name: update-offset
        tool: bash
        command: echo $(( {offset} + 50 ))
        output_var: offset
```

### Pattern 4: Retry with Exponential Backoff

Implement retry logic with increasing delays:

```yaml
steps:
  - name: init-retry
    tool: set
    var: attempt
    value: "0"

  - name: init-delay
    tool: set
    var: delay
    value: "1"

  - name: init-result
    tool: set
    var: success
    value: "false"

  - name: retry-with-backoff
    tool: while
    condition: "{success} == false"
    max_iterations: 5
    on_max_reached: continue
    steps:
      - name: increment-attempt
        tool: bash
        command: echo $(( {attempt} + 1 ))
        output_var: attempt

      - name: try-operation
        tool: bash
        command: ./unreliable_operation.sh && echo "true" || echo "false"
        output_var: success
        on_error: continue

      - name: wait-before-retry
        tool: bash
        command: sleep {delay}
        when: "{success} == false"

      - name: double-delay
        tool: bash
        command: echo $(( {delay} * 2 ))
        output_var: delay
        when: "{success} == false"

  - name: report-result
    prompt: "Operation completed after {attempt} attempts. Success: {success}"
```

### Pattern 5: Interactive User Input Loop

Process user inputs until done (useful with interactive workflows):

```yaml
steps:
  - name: init-continue
    tool: set
    var: user_wants_more
    value: "true"

  - name: interactive-loop
    tool: while
    condition: "{user_wants_more} == true"
    max_iterations: 20
    steps:
      - name: get-user-input
        prompt: "Ask the user what they want to process next"
        output_var: user_request

      - name: process-request
        prompt: "Process the user's request: {user_request}"

      - name: check-continue
        prompt: |
          Ask the user if they want to continue.
          Output only "true" or "false".
        output_var: user_wants_more
```

## Error Handling

### Step-Level Errors

Use `on_error` on individual steps within the while loop:

```yaml
steps:
  - name: robust-loop
    tool: while
    condition: "{active} == true"
    max_iterations: 100
    steps:
      - name: risky-operation
        tool: bash
        command: ./might_fail.sh
        output_var: result
        on_error: continue  # Continue even if this step fails

      - name: process-result
        prompt: "Process: {result}"
        when: "{result} is not empty"
```

### Loop-Level Error Behavior

When a nested step fails and `on_error` is `stop` (the default), the entire while loop fails and the workflow stops:

```yaml
steps:
  - name: strict-loop
    tool: while
    condition: "{count} < 10"
    max_iterations: 10
    steps:
      - name: critical-step
        tool: bash
        command: ./must_succeed.sh
        # on_error: stop is default - loop fails on error
```

### Max Iterations Behavior

Control what happens when the loop hits its iteration limit:

```yaml
# Default: fail the workflow
- name: strict-limit
  tool: while
  condition: "{processing} == true"
  max_iterations: 100
  on_max_reached: error  # Default - workflow fails

# Alternative: continue with warning
- name: soft-limit
  tool: while
  condition: "{processing} == true"
  max_iterations: 100
  on_max_reached: continue  # Log warning, continue workflow
```

## Output

After completion, the while tool provides a summary:

```
Completed 15 iterations
```

If the loop exits due to the condition becoming false:

```
Condition false after 15 iterations: {status} != pending
```

If max_iterations is reached:

```
Warning: Reached max_iterations (100)
```

## Warnings and Best Practices

### Always Set Reasonable max_iterations

The `max_iterations` field is required to prevent infinite loops. Choose a value that:

- Is high enough for expected use cases
- Provides a reasonable upper bound for safety
- Considers the time each iteration takes

```yaml
# Good: reasonable limit for a retry loop
max_iterations: 10

# Good: higher limit for pagination
max_iterations: 500

# Consider: very high limits may indicate a design issue
max_iterations: 10000
```

### Ensure Conditions Can Become False

Make sure your loop condition will eventually become false:

```yaml
# Good: condition changes based on step output
condition: "{queue_empty} == false"
steps:
  - name: check-queue
    tool: bash
    command: ./check_queue.sh
    output_var: queue_empty  # This updates the condition variable

# Dangerous: condition never changes
condition: "true == true"  # Will always hit max_iterations
```

### Avoid Expensive Operations Without Delays

For polling or retry loops, include delays to avoid overwhelming external services:

```yaml
steps:
  - name: poll-service
    tool: while
    condition: "{ready} == false"
    max_iterations: 60
    steps:
      - name: check-status
        tool: bash
        command: curl -s https://api.example.com/status
        output_var: ready

      - name: wait-between-polls
        tool: bash
        command: sleep 10  # Avoid hammering the API
```

## Related Tools

- **[foreach](./foreach.md)** - Iterate over fixed collections
- **[goto](./goto.md)** - Create custom loops and branching
- **[break](./break.md)** - Exit the while loop early
- **[continue](./continue.md)** - Skip to the next iteration
- **[set](./set.md)** - Set variables used in conditions
- **[retry](./retry.md)** - Simpler retry mechanism for single steps
