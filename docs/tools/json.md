# JSON/YAML Tool

The `json` tool provides native JSON and YAML manipulation capabilities using JMESPath query syntax. It supports querying, setting, updating, and deleting values in JSON/YAML files or in-memory variables.

## Overview

The JSON/YAML tool enables workflows to:

1. **Query** - Extract values from JSON/YAML data using JMESPath expressions
2. **Set** - Set or replace values at specific paths
3. **Update** - Modify existing values with operations (append, prepend, increment, merge)
4. **Delete** - Remove keys or elements from data structures

All operations can work on either files (JSON or YAML) or variables stored in the workflow context.

## File Format Support

| Extension | Format | Read | Write |
|-----------|--------|------|-------|
| `.json` | JSON | Yes | Yes |
| `.yaml` | YAML | Yes | Yes |
| `.yml` | YAML | Yes | Yes |

File format is auto-detected by extension. All formats are queried using JMESPath syntax.

## Configuration

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `tool` | string | Yes | - | Must be `"json"` |
| `name` | string | Yes | - | Step name for display and goto refs |
| `action` | string | Yes | - | One of: `query`, `set`, `update`, `delete` |
| `file` | string | Conditional | - | Path to JSON/YAML file (required if `source` not provided) |
| `source` | string | Conditional | - | Variable name containing JSON (required if `file` not provided) |
| `create_if_missing` | boolean | No | `false` | Create empty object if file/source doesn't exist |
| `output_var` | string | No | - | Variable name to store query result |

### Action-Specific Fields

| Action | Field | Required | Description |
|--------|-------|----------|-------------|
| `query` | `query` | Yes | JMESPath expression to extract value |
| `set` | `path` | Yes | Path where to set the value |
| `set` | `value` | Yes | Value to set (supports interpolation) |
| `update` | `path` | Yes | Path to the value to update |
| `update` | `operation` | Yes | One of: `append`, `prepend`, `increment`, `merge` |
| `update` | `value` | Yes | Value to use in the operation |
| `delete` | `path` | Yes | Path to the key/element to delete |

## JMESPath Query Syntax

The JSON tool uses [JMESPath](https://jmespath.org/) for queries - a powerful query language for JSON.

### Basic Access

| Syntax | Description | Example |
|--------|-------------|---------|
| `@` | Entire document | `@` returns the whole JSON |
| `name` | Access field | `name` returns the `name` field |
| `a.b.c` | Nested field | `user.email` |
| `items[0]` | Array index | `items[0]` returns first element |
| `items[-1]` | Negative index | `items[-1]` returns last element |
| `items[*]` | All elements | `items[*].name` returns all names |

**Note**: JMESPath does NOT use leading dots. Use `name` instead of `.name`.

### Built-in Functions

| Function | Description | Example |
|----------|-------------|---------|
| `length(x)` | Length of array/object/string | `length(items)` |
| `keys(obj)` | Get object keys | `keys(config)` |
| `values(obj)` | Get object values | `values(config)` |
| `sort(arr)` | Sort array | `sort(names)` |
| `reverse(arr)` | Reverse array | `reverse(items)` |
| `min(arr)` | Minimum value | `min(scores)` |
| `max(arr)` | Maximum value | `max(scores)` |
| `sum(arr)` | Sum of numbers | `sum(values)` |
| `join(sep, arr)` | Join strings | `join(', ', names)` |
| `contains(arr, val)` | Check if contains | `contains(tags, 'test')` |
| `starts_with(str, prefix)` | String prefix check | `starts_with(name, 'test')` |
| `ends_with(str, suffix)` | String suffix check | `ends_with(file, '.js')` |
| `type(val)` | Get type name | `type(config)` |
| `not_null(...)` | First non-null value | `not_null(a, b, c)` |
| `merge(obj1, obj2)` | Merge objects | `merge(defaults, config)` |

### Custom Functions

Additional functions extending JMESPath:

| Function | Description | Example |
|----------|-------------|---------|
| `to_entries(obj)` | Convert to `[{key, value}]` | `to_entries(config)` |
| `from_entries(arr)` | Convert from `[{key, value}]` | `from_entries(pairs)` |
| `unique(arr)` | Remove duplicates | `unique(tags)` |
| `flatten(arr)` | Flatten one level | `flatten(nested)` |
| `add(arr)` | Sum numbers or concat arrays/strings | `add(values)` |

### Filter Expressions

Filter arrays using `[?condition]`:

```yaml
# Filter by equality (strings use single quotes)
query: "items[?status == 'active']"

# Filter by comparison (numbers use backticks)
query: "items[?priority >= `3`]"

# Filter with and/or
query: "items[?status == 'active' && priority > `2`]"

# Extract field from filtered results
query: "items[?active == `true`].name"
```

**Important**: In JMESPath filters:
- Strings use single quotes: `'active'`
- Numbers use backticks: `` `3` ``
- Booleans use backticks: `` `true` ``, `` `false` ``

### Multi-Select and Projections

```yaml
# Select multiple fields
query: "{name: name, count: length(items)}"

# Project specific fields from array
query: "items[*].{id: id, title: title}"

# Flatten nested arrays
query: "items[*].tags[]"
```

## Query Examples

### Simple Queries

```yaml
steps:
  # Get a field value
  - name: "Get name"
    tool: json
    action: query
    file: "package.json"
    query: "name"
    output_var: package_name

  # Get nested value
  - name: "Get test script"
    tool: json
    action: query
    file: "package.json"
    query: "scripts.test"
    output_var: test_cmd

  # Get array element
  - name: "Get first keyword"
    tool: json
    action: query
    file: "package.json"
    query: "keywords[0]"
    output_var: first_kw
```

### Using Functions

```yaml
steps:
  # Count items
  - name: "Count dependencies"
    tool: json
    action: query
    file: "package.json"
    query: "length(keys(dependencies))"
    output_var: dep_count

  # Get all keys
  - name: "List scripts"
    tool: json
    action: query
    file: "package.json"
    query: "keys(scripts)"
    output_var: script_names

  # Sort values
  - name: "Sorted keywords"
    tool: json
    action: query
    file: "package.json"
    query: "sort(keywords)"
    output_var: sorted_kw
```

### Filtering

```yaml
steps:
  # Filter by status
  - name: "Get active users"
    tool: json
    action: query
    file: "users.json"
    query: "users[?active == `true`]"
    output_var: active_users

  # Filter and extract names
  - name: "Active user names"
    tool: json
    action: query
    file: "users.json"
    query: "users[?active == `true`].name"
    output_var: names

  # Numeric filter
  - name: "High priority tasks"
    tool: json
    action: query
    file: "tasks.json"
    query: "tasks[?priority >= `3`]"
    output_var: high_priority
```

### Array Projections

```yaml
steps:
  # Get all IDs from array
  - name: "All user IDs"
    tool: json
    action: query
    file: "users.json"
    query: "users[*].id"
    output_var: user_ids

  # Flatten nested arrays
  - name: "All tags"
    tool: json
    action: query
    file: "items.json"
    query: "items[*].tags[]"
    output_var: all_tags
```

## Actions

### Query Action

Extract values from JSON/YAML data using JMESPath expressions.

```yaml
steps:
  - name: "Get Package Name"
    tool: json
    action: query
    file: "package.json"
    query: "name"
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

Set or replace values at specific paths. Intermediate objects/arrays are created automatically.

```yaml
steps:
  - name: "Update Version"
    tool: json
    action: set
    file: "package.json"
    path: ".version"
    value: "2.0.0"
```

**Note**: The `path` field uses dot-notation with leading dot (e.g., `.version`, `.scripts.test`).

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

## YAML File Examples

The JSON tool works seamlessly with YAML files:

```yaml
steps:
  # Query YAML config
  - name: "Get DB host"
    tool: json
    action: query
    file: "config.yaml"
    query: "database.host"
    output_var: db_host

  # Update YAML value
  - name: "Update version"
    tool: json
    action: set
    file: "config.yaml"
    path: ".version"
    value: "2.0.0"

  # Filter YAML array
  - name: "Get web servers"
    tool: json
    action: query
    file: "config.yaml"
    query: "servers[?type == 'web'].name"
    output_var: web_servers
```

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
    query: "data.user.name"
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
```

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
    query: "version"
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
```

### YAML Configuration Management

```yaml
type: claude-workflow
version: 2
name: Update Config

steps:
  - name: "Get current DB host"
    tool: json
    action: query
    file: "config.yml"
    query: "database.host"
    output_var: db_host

  - name: "Update to production"
    tool: json
    action: set
    file: "config.yml"
    path: ".database.host"
    value: "prod-db.example.com"

  - name: "Add feature flag"
    tool: json
    action: update
    file: "config.yml"
    path: ".features"
    operation: merge
    value:
      caching: true
      logging: true
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

  - name: "Get active user names"
    tool: json
    action: query
    source: response
    query: "data[?active == `true`].name"
    output_var: active_names

  - name: "Count active users"
    tool: json
    action: query
    source: response
    query: "length(data[?active == `true`])"
    output_var: active_count
```

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `File not found` | File doesn't exist | Use `create_if_missing: true` or ensure file exists |
| `Variable not found` | Source variable not set | Initialize variable first or use `create_if_missing: true` |
| `JMESPath error` | Invalid query syntax | Check JMESPath syntax (no leading dots in queries) |
| `Cannot append to non-array` | Append operation on non-array | Ensure target is an array |

### Error Handling in Workflows

```yaml
steps:
  - name: "Try Query"
    tool: json
    action: query
    file: "config.json"
    query: "optional.setting"
    output_var: setting
    on_error: continue

  - name: "Use Default"
    tool: set
    var: setting
    value: "default_value"
    when: "{setting} is empty"
```

## Migration from jq-style Syntax

If upgrading from the previous jq-style syntax:

| Old (jq-style) | New (JMESPath) |
|----------------|----------------|
| `.name` | `name` |
| `.a.b.c` | `a.b.c` |
| `.items[]` | `items[*]` |
| `.items[0]` | `items[0]` |
| `.items \| length` | `length(items)` |
| `.items \| keys` | `keys(items)` |
| `.items \| first` | `items[0]` |
| `.items \| last` | `items[-1]` |
| `select(.x >= 3)` | `[?x >= \`3\`]` |
| `select(.s == "a")` | `[?s == 'a']` |
| `.items \| to_entries` | `to_entries(items)` |

## Tips and Best Practices

### 1. No Leading Dots in Queries

JMESPath queries don't use leading dots:
```yaml
# Correct
query: "name"
query: "scripts.test"

# Incorrect (old jq-style)
query: ".name"
query: ".scripts.test"
```

### 2. Use Backticks for Literals in Filters

```yaml
# Numbers need backticks
query: "items[?count > `5`]"

# Booleans need backticks
query: "items[?active == `true`]"

# Strings use single quotes
query: "items[?status == 'active']"
```

### 3. Path Expressions Support Interpolation

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
    query: "items[{index}]"
    output_var: item
```

### 4. YAML Files Preserve Format

When writing to YAML files, the tool preserves YAML formatting. When writing to JSON files, output is formatted with 2-space indentation.

## Further Reading

### JMESPath Resources

- **[JMESPath Official Site](https://jmespath.org/)** - Language specification and overview
- **[JMESPath Tutorial](https://jmespath.org/tutorial.html)** - Interactive tutorial to learn JMESPath
- **[JMESPath Specification](https://jmespath.org/specification.html)** - Complete language specification
- **[JMESPath Examples](https://jmespath.org/examples.html)** - Common query patterns and examples

### Related Tools

- [data Tool Reference](./data.md) - Writing temp files for Claude
- [bash Tool Reference](./bash.md) - Shell command execution
- [set Tool Reference](./set.md) - Simple variable assignment
