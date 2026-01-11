# Set Tool

The `set` tool assigns values to variables in the workflow execution context. These variables can be referenced in subsequent steps using interpolation syntax.

## Configuration

| Field   | Type   | Required | Description                          |
|---------|--------|----------|--------------------------------------|
| `tool`  | string | Yes      | Must be `"set"`                      |
| `name`  | string | Yes      | Step name for display and goto refs  |
| `var`   | string | Yes      | Variable name to assign              |
| `value` | any    | Yes      | Value to assign (supports interpolation) |

## Basic Usage

```yaml
steps:
  - name: "Set API URL"
    tool: set
    var: api_url
    value: "https://api.example.com"

  - name: "Use Variable"
    prompt: "Fetch data from {api_url}"
```

## Variable Interpolation

Values support interpolation of existing variables using `{var_name}` syntax:

```yaml
steps:
  - name: "Set Base Path"
    tool: set
    var: base_path
    value: "/app"

  - name: "Set Full Path"
    tool: set
    var: config_path
    value: "{base_path}/config.json"
    # Result: config_path = "/app/config.json"
```

## How Variables Are Stored

Variables are stored in the `ExecutionContext.variables` dictionary. The context provides:

- `set(name, value)` - Store a variable
- `get(name, default)` - Retrieve a variable with optional default
- `interpolate(template)` - Replace `{var}` placeholders with values

All values are converted to strings before storage. When retrieved via interpolation, values are returned as strings.

## Variable Scoping

Variables have **workflow-level scope**:

- Variables persist for the entire workflow execution
- Variables set in earlier steps are available in later steps
- Variables can be overwritten by subsequent `set` steps or `output_var` captures
- No block scoping - all variables share the same namespace

**Special case with `foreach`:**
- Loop variables (`item_var`, `index_var`) are scoped to the loop
- Original values are restored after the loop completes
- Nested steps can still access outer variables

## Accessing Nested Data

Variables containing JSON can be accessed with dot notation:

```yaml
steps:
  - name: "Get User Data"
    tool: bash
    command: 'echo ''{"name": "Alice", "role": "admin"}'''
    output_var: user

  - name: "Use Nested Field"
    prompt: "Send welcome email to {user.name} with {user.role} permissions"
```

Array indexing is also supported:

```yaml
steps:
  - name: "Get Items"
    tool: bash
    command: 'echo ''["first", "second", "third"]'''
    output_var: items

  - name: "Use Index"
    tool: set
    var: selected
    value: "{items.1}"
    # Result: selected = "second"
```

## Common Patterns

### Loop Counter

```yaml
steps:
  - name: "Initialize Counter"
    tool: set
    var: counter
    value: "1"

  - name: "Do Work"
    prompt: "Process item {counter}"

  - name: "Increment"
    tool: bash
    command: "echo $(( {counter} + 1 ))"
    output_var: counter

  - name: "Loop Back"
    tool: goto
    target: "Do Work"
    when: "{counter} <= 5"
```

### Configuration Values

```yaml
steps:
  - name: "Set Environment"
    tool: set
    var: env
    value: "staging"

  - name: "Set Max Retries"
    tool: set
    var: max_retries
    value: "3"

  - name: "Deploy"
    prompt: "Deploy to {env} environment with {max_retries} retry attempts"
```

### Storing Intermediate Results

```yaml
steps:
  - name: "Get Branch"
    tool: bash
    command: "git branch --show-current"
    output_var: current_branch

  - name: "Remember Original Branch"
    tool: set
    var: original_branch
    value: "{current_branch}"

  # ... switch branches and do work ...

  - name: "Return to Original"
    tool: bash
    command: "git checkout {original_branch}"
```

### Building Dynamic Values

```yaml
steps:
  - name: "Set Prefix"
    tool: set
    var: prefix
    value: "feature"

  - name: "Get Ticket ID"
    tool: bash
    command: "echo 'PROJ-123'"
    output_var: ticket_id

  - name: "Build Branch Name"
    tool: set
    var: branch_name
    value: "{prefix}/{ticket_id}"
    # Result: branch_name = "feature/PROJ-123"
```

### Conditional Value Assignment

```yaml
steps:
  - name: "Check Environment"
    tool: bash
    command: "echo $NODE_ENV"
    output_var: node_env

  - name: "Set Production URL"
    tool: set
    var: api_url
    value: "https://api.prod.example.com"
    when: "{node_env} == production"

  - name: "Set Development URL"
    tool: set
    var: api_url
    value: "http://localhost:3000"
    when: "{node_env} != production"
```

## Output

The set tool returns a success message showing the assignment:

```
Set api_url=https://api.example.com
```

## Comparison with output_var

Both `set` and `output_var` store variables, but serve different purposes:

| Feature | `set` tool | `output_var` |
|---------|------------|--------------|
| Purpose | Explicit variable assignment | Capture tool output |
| Source | Static value or interpolation | Command/prompt output |
| Usage | Standalone step | Field on other tool steps |

Example showing both:

```yaml
steps:
  # Using set for static/computed values
  - name: "Set Threshold"
    tool: set
    var: threshold
    value: "100"

  # Using output_var to capture command output
  - name: "Count Files"
    tool: bash
    command: "find . -name '*.py' | wc -l"
    output_var: file_count

  # Using both variables
  - name: "Check Threshold"
    prompt: "We have {file_count} files, threshold is {threshold}"
```
