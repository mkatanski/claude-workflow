# JSON Tool

The `json` tool provides native JSON manipulation capabilities without requiring external tools like `jq`. It supports querying, setting, updating, and deleting values in JSON files or in-memory variables.

## Overview

The JSON tool enables workflows to:

1. **Query** - Extract values from JSON data using path expressions
2. **Set** - Set or replace values at specific paths
3. **Update** - Modify existing values with operations (append, prepend, increment, merge)
4. **Delete** - Remove keys or elements from JSON structures

All operations can work on either JSON files or variables stored in the workflow context.

## Configuration

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `tool` | string | Yes | - | Must be `"json"` |
| `name` | string | Yes | - | Step name for display and goto refs |
| `action` | string | Yes | - | One of: `query`, `set`, `update`, `delete` |
| `file` | string | Conditional | - | Path to JSON file (required if `source` not provided) |
| `source` | string | Conditional | - | Variable name containing JSON (required if `file` not provided) |
| `create_if_missing` | boolean | No | `false` | Create empty object if file/source doesn't exist |
| `output_var` | string | No | - | Variable name to store query result |

### Action-Specific Fields

| Action | Field | Required | Description |
|--------|-------|----------|-------------|
| `query` | `query` | Yes | Path expression to extract value |
| `set` | `path` | Yes | Path where to set the value |
| `set` | `value` | Yes | Value to set (supports interpolation) |
| `update` | `path` | Yes | Path to the value to update |
| `update` | `operation` | Yes | One of: `append`, `prepend`, `increment`, `merge` |
| `update` | `value` | Yes | Value to use in the operation |
| `delete` | `path` | Yes | Path to the key/element to delete |

## Path Expression Syntax

The JSON tool uses a dot-notation path syntax for navigating JSON structures:

| Syntax | Description | Example |
|--------|-------------|---------|
| `.` or empty | Root of the document | `.` returns entire JSON |
| `.field` | Access object field | `.name` returns the `name` field |
| `.field.nested` | Access nested field | `.user.email` |
| `[0]` | Access array element by index | `.items[0]` returns first element |
| `.arr[1].field` | Combined access | `.users[0].name` |
| `['key']` or `["key"]` | Bracket notation for keys | `.data['special-key']` |

## Advanced Query Syntax (jq-style)

The JSON tool supports jq-style query syntax for complex data transformations, eliminating the need for external `jq` in most cases.

### Pipeline Operator (`|`)

Chain operations together by piping output from one stage to the next:

```yaml
- name: "Get story count"
  tool: json
  action: query
  file: "stories.json"
  query: ".stories | length"
  output_var: count
```

### Array Iteration (`[]`)

Iterate over all elements in an array:

```yaml
# Get all story IDs
- name: "Get story IDs"
  tool: json
  action: query
  file: "stories.json"
  query: ".stories[].id"
  output_var: ids
  # Returns: ["story_1", "story_2", "story_3"]

# Nested iteration
- name: "Get all tags"
  tool: json
  action: query
  source: data
  query: ".items[].tags[]"
  output_var: all_tags
```

### Built-in Transforms

| Transform | Input | Output | Description |
|-----------|-------|--------|-------------|
| `length` | array/object/string | integer | Length or key count |
| `to_entries` | object | array | Convert to `[{key, value}, ...]` |
| `from_entries` | array | object | Convert from `[{key, value}, ...]` |
| `keys` | object | array | Get all keys |
| `values` | object | array | Get all values |
| `first` | array | any | First element |
| `last` | array | any | Last element |
| `sort` | array | array | Sort elements |
| `reverse` | array | array | Reverse order |
| `unique` | array | array | Remove duplicates |
| `flatten` | array | array | Flatten one level |
| `min` | array | any | Minimum value |
| `max` | array | any | Maximum value |
| `add` | array | any | Sum numbers or concat strings |

```yaml
# Get keys from an object
- name: "Get config keys"
  tool: json
  action: query
  file: "config.json"
  query: ".settings | keys"
  output_var: setting_names

# Count failed stories (retry_counts >= 3)
- name: "Count failures"
  tool: json
  action: query
  file: "progress.json"
  query: "[.retry_counts | to_entries | select(.value >= 3)] | length"
  output_var: failed_count
```

### Select Filter (`select()`)

Filter items based on conditions:

```yaml
# Filter active items
- name: "Get active items"
  tool: json
  action: query
  source: data
  query: '.items[] | select(.status == "active")'
  output_var: active_items

# Numeric comparison
- name: "Get high priority"
  tool: json
  action: query
  source: tasks
  query: ".tasks[] | select(.priority >= 3)"
  output_var: high_priority
```

**Supported operators in select:**
- Equality: `==`, `!=`
- Comparison: `>`, `>=`, `<`, `<=`
- String: `contains`, `starts_with`, `ends_with`

### String Interpolation

Format output strings with field values:

```yaml
# Format story list
- name: "Format stories"
  tool: json
  action: query
  file: "stories.json"
  query: '.stories[] | "  - (.id): (.title)"'
  output_var: story_list
  # Returns: ["  - story_1: Fix bug", "  - story_2: Add feature"]
```

### Array Construction (`[...]`)

Explicitly wrap results in an array:

```yaml
# Get filtered entries as array
- name: "Get failed entries"
  tool: json
  action: query
  file: "progress.json"
  query: "[.retry_counts | to_entries | select(.value >= 3)]"
  output_var: failed_entries
```

### Complex Query Examples

```yaml
# Pattern from story-executor: count failed stories
- name: "Count failed stories"
  tool: json
  action: query
  file: ".claude/stories/progress.json"
  query: "[.retry_counts | to_entries | select(.value >= 3)] | length"
  output_var: failed_count

# Format story list for display
- name: "Format story list"
  tool: json
  action: query
  file: ".claude/stories/stories.json"
  query: '.stories[] | "  - (.id): (.title)"'
  output_var: story_lines

# Get completed story count
- name: "Get progress"
  tool: json
  action: query
  file: ".claude/stories/progress.json"
  query: ".completed | length"
  output_var: completed_count

# Get pending items with high value
- name: "High value pending"
  tool: json
  action: query
  source: items
  query: '.items[] | select(.status == "pending") | select(.value > 100)'
  output_var: high_value_pending
```

## Actions

### Query Action

Extract values from JSON data using path expressions.

```yaml
steps:
  - name: "Get Package Name"
    tool: json
    action: query
    file: "package.json"
    query: ".name"
    output_var: package_name

  - name: "Display Name"
    tool: bash
    command: "echo Package: {package_name}"
```

**Query Output Types:**
- Objects and arrays are returned as JSON strings
- Strings, numbers, and booleans are returned as their string representation
- `null` returns an empty string

### Set Action

Set or replace values at specific paths. Intermediate objects/arrays are created automatically if they don't exist.

```yaml
steps:
  - name: "Update Version"
    tool: json
    action: set
    file: "package.json"
    path: ".version"
    value: "2.0.0"
```

**Value Interpolation:**
- String values are interpolated with workflow variables
- Values that look like JSON (starting with `{`, `[`, or `"`) are parsed
- Numeric strings are converted to numbers
- Objects and arrays in the value field are recursively interpolated

### Update Action

Modify existing values with specific operations.

| Operation | Description | Target Type |
|-----------|-------------|-------------|
| `append` | Add element to end of array | Array |
| `prepend` | Add element to beginning of array | Array |
| `increment` | Add numeric value | Number |
| `merge` | Merge objects (shallow) | Object |

```yaml
steps:
  - name: "Add Dependency"
    tool: json
    action: update
    file: "package.json"
    path: ".dependencies"
    operation: merge
    value:
      lodash: "^4.17.21"
```

**Auto-Initialization:**
When the path doesn't exist and `update` is used:
- `append`/`prepend`: Initializes as empty array `[]`
- `increment`: Initializes as `0`
- `merge`: Initializes as empty object `{}`

### Delete Action

Remove keys from objects or elements from arrays.

```yaml
steps:
  - name: "Remove Dev Dependency"
    tool: json
    action: delete
    file: "package.json"
    path: ".devDependencies.eslint"
```

## Working with Files

### Reading from Files

```yaml
steps:
  - name: "Get Config Value"
    tool: json
    action: query
    file: "config.json"
    query: ".database.host"
    output_var: db_host
```

**File Path Resolution:**
- Absolute paths are used as-is
- Relative paths are resolved from the project path
- Variable interpolation is supported in file paths: `file: "{config_dir}/settings.json"`

### Creating New Files

Use `create_if_missing: true` to create files that don't exist:

```yaml
steps:
  - name: "Initialize Config"
    tool: json
    action: set
    file: "config.json"
    create_if_missing: true
    path: ".version"
    value: "1.0.0"
```

### Atomic File Writes

The JSON tool uses atomic writes for file operations:
1. Writes to a temporary file in the same directory
2. Renames the temp file to the target path
3. This prevents partial writes on failures

## Working with Variables

### Reading from Variables

```yaml
steps:
  - name: "Get API Response"
    tool: bash
    command: "curl -s https://api.example.com/data"
    output_var: api_response

  - name: "Extract User"
    tool: json
    action: query
    source: api_response
    query: ".data.user.name"
    output_var: user_name
```

### Creating In-Memory JSON

```yaml
steps:
  - name: "Initialize State"
    tool: json
    action: set
    source: state
    create_if_missing: true
    path: ".status"
    value: "pending"

  - name: "Add Item to State"
    tool: json
    action: update
    source: state
    path: ".items"
    operation: append
    value: "first_item"
```

**Variable Storage:**
- Variables containing JSON objects/arrays are stored as JSON strings
- When read via `source`, JSON strings are automatically parsed
- After mutations, the variable is updated with the new JSON string

## Example Workflows

### Package.json Manipulation

```yaml
type: claude-workflow
version: 2
name: Update Package Version

steps:
  - name: "Get Current Version"
    tool: json
    action: query
    file: "package.json"
    query: ".version"
    output_var: current_version

  - name: "Display Current"
    tool: bash
    command: "echo Current version: {current_version}"

  - name: "Bump Version"
    tool: json
    action: set
    file: "package.json"
    path: ".version"
    value: "2.0.0"

  - name: "Add Build Metadata"
    tool: json
    action: update
    file: "package.json"
    path: ".build"
    operation: merge
    value:
      timestamp: "{build_time}"
      commit: "{git_sha}"
```

### Configuration Management

```yaml
type: claude-workflow
version: 2
name: Environment Configuration

steps:
  - name: "Set Environment"
    tool: set
    var: env
    value: "production"

  - name: "Load Base Config"
    tool: bash
    command: "cat config/base.json"
    output_var: config

  - name: "Set Environment Value"
    tool: json
    action: set
    source: config
    path: ".environment"
    value: "{env}"

  - name: "Enable Production Features"
    tool: json
    action: set
    source: config
    path: ".features.caching"
    value: true
    when: "{env} == production"

  - name: "Set Replica Count"
    tool: json
    action: set
    source: config
    path: ".replicas"
    value: 3

  - name: "Write Final Config"
    tool: bash
    command: "echo '{config}' > config/generated.json"
```

### API Response Processing

```yaml
type: claude-workflow
version: 2
name: Process API Data

steps:
  - name: "Fetch Users"
    tool: bash
    command: "curl -s https://api.example.com/users"
    output_var: response

  - name: "Extract First User"
    tool: json
    action: query
    source: response
    query: ".data[0]"
    output_var: first_user

  - name: "Get User Name"
    tool: json
    action: query
    source: first_user
    query: ".name"
    output_var: user_name

  - name: "Get User Email"
    tool: json
    action: query
    source: first_user
    query: ".email"
    output_var: user_email

  - name: "Process User"
    prompt: "Create a welcome message for user {user_name} at {user_email}"
```

### Building JSON Incrementally

```yaml
type: claude-workflow
version: 2
name: Build Report

steps:
  - name: "Initialize Report"
    tool: json
    action: set
    source: report
    create_if_missing: true
    path: ".title"
    value: "Daily Report"

  - name: "Add Timestamp"
    tool: bash
    command: "date -u +%Y-%m-%dT%H:%M:%SZ"
    output_var: timestamp

  - name: "Set Generated Time"
    tool: json
    action: set
    source: report
    path: ".generated_at"
    value: "{timestamp}"

  - name: "Add First Finding"
    tool: json
    action: update
    source: report
    path: ".findings"
    operation: append
    value:
      type: "info"
      message: "Build completed successfully"

  - name: "Add Second Finding"
    tool: json
    action: update
    source: report
    path: ".findings"
    operation: append
    value:
      type: "warning"
      message: "Deprecated API usage detected"

  - name: "Increment Counter"
    tool: json
    action: update
    source: report
    path: ".finding_count"
    operation: increment
    value: 2

  - name: "Save Report"
    tool: bash
    command: "echo '{report}' > reports/daily.json"
```

### Nested Object Manipulation

```yaml
type: claude-workflow
version: 2
name: Complex Nested Updates

steps:
  - name: "Set Deep Value"
    tool: json
    action: set
    file: "config.json"
    create_if_missing: true
    path: ".database.connections.primary.host"
    value: "db.example.com"

  - name: "Set Array in Nested Object"
    tool: json
    action: set
    file: "config.json"
    path: ".database.connections.primary.replicas"
    value: ["replica1.db", "replica2.db"]

  - name: "Add Replica"
    tool: json
    action: update
    file: "config.json"
    path: ".database.connections.primary.replicas"
    operation: append
    value: "replica3.db"

  - name: "Merge Connection Options"
    tool: json
    action: update
    file: "config.json"
    path: ".database.connections.primary.options"
    operation: merge
    value:
      timeout: 30
      pool_size: 10
```

### Working with Arrays

```yaml
type: claude-workflow
version: 2
name: Array Operations

steps:
  - name: "Initialize List"
    tool: json
    action: set
    source: tasks
    create_if_missing: true
    path: ".items"
    value: []

  - name: "Add to End"
    tool: json
    action: update
    source: tasks
    path: ".items"
    operation: append
    value: "Task 1"

  - name: "Add to Beginning"
    tool: json
    action: update
    source: tasks
    path: ".items"
    operation: prepend
    value: "Priority Task"

  - name: "Query First Item"
    tool: json
    action: query
    source: tasks
    query: ".items[0]"
    output_var: first_task

  - name: "Delete First Item"
    tool: json
    action: delete
    source: tasks
    path: ".items[0]"
```

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `File not found` | File doesn't exist | Use `create_if_missing: true` or ensure file exists |
| `Variable not found` | Source variable not set | Initialize variable first or use `create_if_missing: true` |
| `Key not found` | Query path doesn't exist | Check path or use `set` to create the path |
| `Cannot index non-array` | Using array index on non-array | Verify the data structure |
| `Cannot append to non-array` | Append operation on non-array | Ensure target is an array |
| `Merge requires objects` | Merge operation on non-objects | Ensure both target and value are objects |

### Error Handling in Workflows

```yaml
steps:
  - name: "Try Query"
    tool: json
    action: query
    file: "config.json"
    query: ".optional.setting"
    output_var: setting
    on_error: continue

  - name: "Use Default"
    tool: set
    var: setting
    value: "default_value"
    when: "{setting} is empty"
```

## Tips and Best Practices

### 1. Use Variables for Complex Transformations

When performing multiple operations on the same JSON, load it into a variable first:

```yaml
steps:
  - name: "Load Config"
    tool: bash
    command: "cat config.json"
    output_var: config

  # Multiple operations on the variable
  - name: "Modify A"
    tool: json
    action: set
    source: config
    path: ".a"
    value: "1"

  - name: "Modify B"
    tool: json
    action: set
    source: config
    path: ".b"
    value: "2"

  # Write once at the end
  - name: "Save Config"
    tool: bash
    command: "echo '{config}' > config.json"
```

### 2. Initialize Before Update Operations

For `append`, `prepend`, `increment`, and `merge`, the path is auto-initialized if it doesn't exist. However, explicitly initializing can make workflows clearer:

```yaml
steps:
  - name: "Initialize Array"
    tool: json
    action: set
    source: data
    create_if_missing: true
    path: ".items"
    value: []

  - name: "Add Items"
    tool: json
    action: update
    source: data
    path: ".items"
    operation: append
    value: "new item"
```

### 3. Use Query for Validation

Query values before performing operations to validate data:

```yaml
steps:
  - name: "Check Type"
    tool: json
    action: query
    file: "data.json"
    query: ".items"
    output_var: items

  - name: "Append Only If Array"
    tool: json
    action: update
    file: "data.json"
    path: ".items"
    operation: append
    value: "new item"
    when: "{items} starts with ["
```

### 4. Path Expressions Support Interpolation

Use variables in path expressions:

```yaml
steps:
  - name: "Set Field Index"
    tool: set
    var: index
    value: "0"

  - name: "Get Item by Index"
    tool: json
    action: query
    file: "data.json"
    query: ".items[{index}]"
    output_var: item
```

### 5. Handle Missing Files Gracefully

Use `create_if_missing` for idempotent workflows:

```yaml
steps:
  - name: "Ensure Config Exists"
    tool: json
    action: set
    file: "state.json"
    create_if_missing: true
    path: ".initialized"
    value: true
```

## Comparison with Bash + jq

| Feature | JSON Tool | bash + jq |
|---------|-----------|-----------|
| Dependencies | None (built-in) | Requires jq |
| Syntax | jq-compatible query syntax | jq filter syntax |
| Pipelines | `\| length`, `\| to_entries` | Same |
| Array iteration | `.items[]` | Same |
| Filtering | `select(.value >= 3)` | Same |
| String interpolation | `"(.id): (.title)"` | `"\(.id): \(.title)"` |
| Transforms | `length`, `keys`, `to_entries`, etc. | Full jq library |
| Mutations | Native support | Complex command chaining |
| Atomic writes | Automatic | Manual implementation |
| Error handling | Structured errors | Exit codes + stderr |
| Variable integration | Direct | String escaping required |

**When to use JSON tool:**
- Most jq-style queries (pipelines, iteration, filtering)
- Simple to moderately complex transformations
- Workflow-centric JSON manipulation
- Cross-platform compatibility (no jq required)

**When to use bash + jq:**
- Advanced jq features not yet supported (recursive descent `..`, `@base64`, etc.)
- Complex map/reduce operations
- One-liner scripts outside workflows
