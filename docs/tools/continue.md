# Continue Tool

The Continue tool skips the remaining steps in the current `foreach` loop iteration and moves to the next item.

## Overview

When executed inside a `foreach` loop, the `continue` tool signals the loop to skip all remaining steps in the current iteration and proceed to the next item. If used outside a loop context, the continue signal has no effect.

## YAML Configuration

```yaml
- name: skip-iteration
  tool: continue
```

The Continue tool requires no additional configuration. It only needs a `name` field (like all steps) and the `tool: continue` declaration.

### Conditional Continue

Use the `when` clause to skip iterations only when a condition is met:

```yaml
- name: skip-invalid
  tool: continue
  when: "{status} == invalid"
```

## How It Works with ForEach

The Continue tool works by returning a `LoopSignal.CONTINUE` signal to the parent `foreach` loop. When the foreach loop receives this signal, it:

1. Stops executing the remaining steps in the current iteration
2. Prints a continue message: `Continue at iteration N`
3. Advances to the next item in the source array
4. Continues normal execution with the next iteration

The skipped iteration is not counted as failed. Variables set before the continue are preserved.

### Execution Flow

```
foreach loop starts
  |
  v
Iteration 1 -> step A -> step B (continue) -> [skip C, D] -> Iteration 2
  |
  v
Iteration 2 -> step A -> step B -> step C -> step D -> success
  |
  v
Iteration 3 -> etc...
```

### Continue vs Break

| Behavior | `continue` | `break` |
|----------|------------|---------|
| Current iteration | Skips remaining steps | Skips remaining steps |
| Next iterations | Proceeds to next item | Terminates loop entirely |
| Loop outcome | Continues until all items processed | Exits immediately |

## Example Workflow Steps

### Skip Invalid Items

Process only valid items in a list:

```yaml
type: claude-workflow
version: 2
name: Process Valid Items

vars:
  items: '["valid", "invalid", "valid", "skip", "valid"]'

steps:
  - name: process-items
    tool: foreach
    source: items
    item_var: item
    steps:
      - name: check-validity
        tool: bash
        command: |
          if [ "{item}" = "invalid" ] || [ "{item}" = "skip" ]; then
            echo "false"
          else
            echo "true"
          fi
        output_var: is_valid

      - name: skip-invalid
        tool: continue
        when: "{is_valid} == false"

      - name: process
        prompt: Process the valid item: {item}
```

### Skip Already Processed

Avoid reprocessing items that were handled in a previous run:

```yaml
type: claude-workflow
version: 2
name: Resume Processing

vars:
  files: '["file1.txt", "file2.txt", "file3.txt"]'

steps:
  - name: process-files
    tool: foreach
    source: files
    item_var: file
    steps:
      - name: check-processed
        tool: bash
        command: |
          if [ -f "processed/{file}.done" ]; then
            echo "true"
          else
            echo "false"
          fi
        output_var: already_done

      - name: skip-processed
        tool: continue
        when: "{already_done} == true"

      - name: process-file
        prompt: Process {file} and save result

      - name: mark-complete
        tool: bash
        command: touch "processed/{file}.done"
```

### Filter by Type

Process only specific types of items:

```yaml
type: claude-workflow
version: 2
name: Process TypeScript Only

vars:
  files: '["main.ts", "utils.js", "types.ts", "config.json", "api.ts"]'

steps:
  - name: process-ts-files
    tool: foreach
    source: files
    item_var: file
    steps:
      - name: check-extension
        tool: bash
        command: echo "{file}" | grep -q '\.ts$' && echo "true" || echo "false"
        output_var: is_typescript

      - name: skip-non-ts
        tool: continue
        when: "{is_typescript} == false"

      - name: analyze
        prompt: Analyze TypeScript file {file} for type safety issues
```

### Skip Empty Results

Skip items that produce empty or null results:

```yaml
type: claude-workflow
version: 2
name: Process Non-Empty Results

vars:
  endpoints: '["users", "posts", "comments"]'

steps:
  - name: fetch-data
    tool: foreach
    source: endpoints
    item_var: endpoint
    steps:
      - name: fetch
        tool: bash
        command: curl -s "https://api.example.com/{endpoint}" | head -c 100
        output_var: response

      - name: skip-empty
        tool: continue
        when: "{response} is empty"

      - name: process-response
        prompt: Analyze and summarize the {endpoint} data
```

## Common Patterns

### Skip on Specific Value

Skip items matching a particular value:

```yaml
- name: skip-drafts
  tool: continue
  when: "{status} == draft"
```

### Skip on Error State

Skip items that failed validation:

```yaml
- name: skip-failed
  tool: continue
  when: "{validation_result} contains error"
```

### Skip on Condition Check

Skip based on a computed condition:

```yaml
- name: skip-small-files
  tool: continue
  when: "{file_size} < 1000"
```

### Skip on Missing Data

Skip items with missing required fields:

```yaml
- name: skip-incomplete
  tool: continue
  when: "{item.email} is empty or {item.name} is empty"
```

### Early Filter Pattern

Place continue checks at the start of loop to filter early:

```yaml
steps:
  - name: process-items
    tool: foreach
    source: items
    item_var: item
    steps:
      # Filter checks first
      - name: skip-invalid-type
        tool: continue
        when: "{item.type} != target"

      - name: skip-disabled
        tool: continue
        when: "{item.enabled} == false"

      # Main processing after filters
      - name: do-work
        prompt: Process {item}
```

## Related Tools

- **[break](./break.md)** - Exit the loop entirely instead of skipping to the next iteration
- **[foreach](./foreach.md)** - The loop construct that continue operates within
- **[set](./set.md)** - Often used to set flags that trigger continue conditions

## Notes

- Continue only affects the innermost `foreach` loop when loops are nested
- The continue step itself always succeeds (returns `success: true`)
- Using continue outside a foreach loop has no effect on workflow execution
- The `when` clause is evaluated before the continue signal is sent
- Steps after continue in the same iteration are not executed
- The iteration counter still increments when continue is used
