# Set Tool

The `set` tool assigns values to variables in the workflow execution context. These variables can be referenced in subsequent steps using interpolation syntax.

## Configuration

| Field   | Type   | Required | Description                          |
|---------|--------|----------|--------------------------------------|
| `tool`  | string | Yes      | Must be `"set"`                      |
| `name`  | string | Yes      | Step name for display and goto refs  |
| `var`   | string | Yes      | Variable name to assign              |
| `value` | any    | *        | Value to assign (supports interpolation) |
| `expr`  | string | *        | Expression to evaluate               |

**Note:** You must provide either `value` OR `expr`, but not both.

## Two Modes of Operation

The set tool supports two modes:

### 1. Value Mode (Simple Assignment)

Use `value` for direct assignment with variable interpolation:

```yaml
steps:
  - name: "Set API URL"
    tool: set
    var: api_url
    value: "https://api.example.com"

  - name: "Use Variable"
    prompt: "Fetch data from {api_url}"
```

### 2. Expression Mode (Computed Assignment)

Use `expr` for computed values with arithmetic, comparisons, and conditionals:

```yaml
steps:
  - name: "Calculate Total"
    tool: set
    var: total
    expr: "{price} * {quantity}"

  - name: "Check Threshold"
    tool: set
    var: status
    expr: "if {total} > 100 then 'high' else 'low'"
```

## Expression Syntax

The `expr` field supports a rich expression language for computed values.

### Arithmetic Operators

| Operator | Description    | Example          |
|----------|----------------|------------------|
| `+`      | Addition       | `5 + 3` = `8`    |
| `-`      | Subtraction    | `10 - 4` = `6`   |
| `*`      | Multiplication | `6 * 7` = `42`   |
| `/`      | Division       | `15 / 3` = `5`   |
| `%`      | Modulo         | `17 % 5` = `2`   |

```yaml
steps:
  - name: "Calculate"
    tool: set
    var: result
    expr: "({count} + 1) * 2"
```

### Comparison Operators

| Operator | Description              | Example           |
|----------|--------------------------|-------------------|
| `==`     | Equal                    | `5 == 5` = `true` |
| `!=`     | Not equal                | `5 != 3` = `true` |
| `>`      | Greater than             | `10 > 5` = `true` |
| `<`      | Less than                | `3 < 7` = `true`  |
| `>=`     | Greater than or equal    | `5 >= 5` = `true` |
| `<=`     | Less than or equal       | `4 <= 6` = `true` |

```yaml
steps:
  - name: "Check Limit"
    tool: set
    var: exceeded
    expr: "{count} > {max_count}"
```

### Boolean Operators

| Operator | Description    | Example                      |
|----------|----------------|------------------------------|
| `and`    | Logical AND    | `true and false` = `false`   |
| `or`     | Logical OR     | `true or false` = `true`     |
| `not`    | Logical NOT    | `not false` = `true`         |

```yaml
steps:
  - name: "Check Conditions"
    tool: set
    var: should_proceed
    expr: "{has_permission} and {is_valid}"
```

### Boolean Literals

The expression evaluator recognizes `true` and `false` as boolean values:

```yaml
steps:
  - name: "Set Flag"
    tool: set
    var: enabled
    expr: "true"

  - name: "Check Flag"
    tool: set
    var: result
    expr: "{enabled} and {ready}"
```

### String Concatenation

The `+` operator concatenates strings when operands are not both numbers:

```yaml
steps:
  - name: "Build Message"
    tool: set
    var: greeting
    expr: "'Hello, ' + {username} + '!'"
```

### Conditional Expressions

Use `if CONDITION then VALUE else VALUE` for conditional logic:

```yaml
steps:
  - name: "Set Status"
    tool: set
    var: status
    expr: "if {score} >= 70 then 'pass' else 'fail'"

  - name: "Set Priority"
    tool: set
    var: priority
    expr: "if {urgent} then 'high' else if {important} then 'medium' else 'low'"
```

### Parentheses for Grouping

Use parentheses to control evaluation order:

```yaml
steps:
  - name: "Complex Calculation"
    tool: set
    var: result
    expr: "(({a} + {b}) * {c}) / ({d} - {e})"
```

### Truthy Values

The expression evaluator considers the following values as "falsy":
- Empty string `""`
- `"false"` (case-insensitive)
- `"0"`
- `"null"`
- `"none"`
- Numeric `0`

All other values are considered "truthy".

## Variable Interpolation

Both `value` and `expr` support interpolation of existing variables using `{var_name}` syntax:

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

### Loop Counter with Expression

```yaml
steps:
  - name: "Initialize Counter"
    tool: set
    var: counter
    value: "1"

  - name: "Do Work"
    prompt: "Process item {counter}"

  - name: "Increment"
    tool: set
    var: counter
    expr: "{counter} + 1"

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

### Conditional Value Assignment (Using expr)

```yaml
steps:
  - name: "Get Environment"
    tool: bash
    command: "echo $NODE_ENV"
    output_var: node_env

  - name: "Set API URL Based on Environment"
    tool: set
    var: api_url
    expr: "if {node_env} == 'production' then 'https://api.prod.example.com' else 'http://localhost:3000'"
```

### Calculated Values

```yaml
steps:
  - name: "Get File Count"
    tool: bash
    command: "find . -name '*.py' | wc -l"
    output_var: file_count

  - name: "Calculate Batch Size"
    tool: set
    var: batch_size
    expr: "if {file_count} > 100 then 20 else 10"

  - name: "Calculate Total Batches"
    tool: set
    var: total_batches
    expr: "({file_count} + {batch_size} - 1) / {batch_size}"
```

### Boolean Logic

```yaml
steps:
  - name: "Check Conditions"
    tool: set
    var: can_deploy
    expr: "{tests_passed} and {code_reviewed} and not {has_conflicts}"

  - name: "Deploy"
    prompt: "Deploy the application"
    when: "{can_deploy} == true"
```

### Percentage Calculation

```yaml
steps:
  - name: "Calculate Progress"
    tool: set
    var: progress_percent
    expr: "({completed} * 100) / {total}"

  - name: "Show Progress"
    prompt: "Progress: {progress_percent}% complete"
```

## Output

The set tool returns a success message showing the assignment:

```
Set api_url=https://api.example.com
```

For expressions, it shows the computed result:

```
Set total=42
```

## Comparison: value vs expr

| Feature | `value` | `expr` |
|---------|---------|--------|
| Variable interpolation | Yes | Yes |
| Arithmetic operations | No | Yes |
| Comparisons | No | Yes |
| Boolean logic | No | Yes |
| Conditionals | No | Yes |
| String concatenation | Via interpolation only | Yes (`+` operator) |
| Use case | Static/interpolated values | Computed values |

### When to Use Each

**Use `value` when:**
- Assigning static strings
- Simple variable interpolation
- Building paths or URLs from variables

**Use `expr` when:**
- Performing calculations
- Making conditional assignments
- Combining boolean conditions
- Incrementing counters

## Comparison with output_var

Both `set` and `output_var` store variables, but serve different purposes:

| Feature | `set` tool | `output_var` |
|---------|------------|--------------|
| Purpose | Explicit variable assignment | Capture tool output |
| Source | Static value, interpolation, or expression | Command/prompt output |
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

  # Using expr for computed comparison
  - name: "Check Exceeded"
    tool: set
    var: exceeded
    expr: "{file_count} > {threshold}"

  # Using both variables
  - name: "Report Status"
    prompt: "We have {file_count} files (threshold: {threshold}). Exceeded: {exceeded}"
```

## Error Handling

Expression errors are reported with descriptive messages:

```yaml
# Division by zero
- name: "Bad Division"
  tool: set
  var: result
  expr: "{count} / 0"
  # Error: Expression error: Division by zero

# Cannot have both value and expr
- name: "Invalid Config"
  tool: set
  var: result
  value: "test"
  expr: "1 + 1"
  # Error: Set step cannot have both 'value' and 'expr' fields

# Missing value or expr
- name: "Missing Field"
  tool: set
  var: result
  # Error: Set step requires either 'value' or 'expr' field
```
