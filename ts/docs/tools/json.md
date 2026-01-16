# JSON Tool

The `json` tool provides native JSON manipulation capabilities using JMESPath query syntax. It supports querying, setting, merging, and transforming JSON data within workflow variables.

## Overview

The JSON tool enables workflows to:

1. **Query** - Extract values from JSON data using JMESPath expressions
2. **Set** - Set or replace values at specific paths
3. **Parse** - Parse JSON strings into objects
4. **Stringify** - Convert objects to JSON strings
5. **Merge** - Combine two objects
6. **Keys/Values/Length** - Get object keys, values, or length

All operations work on JSON data stored in workflow variables.

## Basic Usage

```typescript
import { createBuilder, WorkflowDefinition } from "claude-workflow";

export default function (t: ReturnType<typeof createBuilder>): WorkflowDefinition {
  return {
    name: "JSON Example",
    steps: [
      t.step("Query name", t.json("query", {
        input: "{packageJson}",
        query: "name"
      }), {
        output: "packageName"
      })
    ]
  };
}
```

## API Reference

### `t.json(action, config)`

Creates a JSON tool definition.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | Yes | Action to perform (see Actions below) |
| `config` | JsonToolConfig | Yes | Action-specific configuration |

### JsonToolConfig

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `input` | string | Yes* | JSON data to operate on (supports interpolation) |
| `query` | string | No | JMESPath expression for query action |
| `path` | string | No | Dot-notation path for set action |
| `value` | string | No | Value to set or merge |

*Required for most actions

## Actions

### query

Extract values from JSON data using JMESPath expressions.

```typescript
t.step("Get user name", t.json("query", {
  input: "{apiResponse}",
  query: "data.user.name"
}), {
  output: "userName"
})
```

**Output:** Returns the queried value as a string. Objects and arrays are JSON-stringified.

### set

Set or replace a value at a specific path. Intermediate objects are created automatically.

```typescript
t.step("Update version", t.json("set", {
  input: "{config}",
  path: "version",
  value: "2.0.0"
}), {
  output: "updatedConfig"
})
```

**Note:** The `path` field uses dot notation (e.g., `version`, `scripts.test`, `user.profile.name`).

### parse

Parse a JSON string into an object.

```typescript
t.step("Parse response", t.json("parse", {
  input: "{rawJsonString}"
}), {
  output: "parsedData"
})
```

### stringify

Convert an object to a JSON string.

```typescript
t.step("Stringify data", t.json("stringify", {
  input: "{dataObject}"
}), {
  output: "jsonString"
})
```

### merge

Shallow merge two objects together.

```typescript
t.step("Merge configs", t.json("merge", {
  input: "{baseConfig}",
  value: '{"debug": true, "logLevel": "verbose"}'
}), {
  output: "mergedConfig"
})
```

### keys

Get all keys from an object.

```typescript
t.step("Get keys", t.json("keys", {
  input: "{config}"
}), {
  output: "configKeys"
})
```

### values

Get all values from an object.

```typescript
t.step("Get values", t.json("values", {
  input: "{config}"
}), {
  output: "configValues"
})
```

### length

Get the length of an array, object (number of keys), or string.

```typescript
t.step("Count items", t.json("length", {
  input: "{items}"
}), {
  output: "itemCount"
})
```

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

**Important:** JMESPath does NOT use leading dots. Use `name` instead of `.name`.

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

### Filter Expressions

Filter arrays using `[?condition]`:

```typescript
// Filter by equality (strings use single quotes)
t.step("Get active", t.json("query", {
  input: "{users}",
  query: "users[?status == 'active']"
}), { output: "activeUsers" })

// Filter by comparison (numbers use backticks)
t.step("High priority", t.json("query", {
  input: "{tasks}",
  query: "items[?priority >= `3`]"
}), { output: "highPriority" })

// Filter with and/or
t.step("Active high priority", t.json("query", {
  input: "{tasks}",
  query: "items[?status == 'active' && priority > `2`]"
}), { output: "filtered" })

// Extract field from filtered results
t.step("Active names", t.json("query", {
  input: "{users}",
  query: "users[?active == `true`].name"
}), { output: "names" })
```

**Important:** In JMESPath filters:
- Strings use single quotes: `'active'`
- Numbers use backticks: `` `3` ``
- Booleans use backticks: `` `true` ``, `` `false` ``

### Multi-Select and Projections

```typescript
// Select multiple fields
t.step("Select fields", t.json("query", {
  input: "{data}",
  query: "{name: name, count: length(items)}"
}), { output: "selected" })

// Project specific fields from array
t.step("Project items", t.json("query", {
  input: "{data}",
  query: "items[*].{id: id, title: title}"
}), { output: "projected" })

// Flatten nested arrays
t.step("Flatten tags", t.json("query", {
  input: "{data}",
  query: "items[*].tags[]"
}), { output: "allTags" })
```

## Example Workflows

### API Response Processing

```typescript
import { createBuilder, WorkflowDefinition } from "claude-workflow";

export default function (t: ReturnType<typeof createBuilder>): WorkflowDefinition {
  return {
    name: "Process API Data",
    steps: [
      t.step("Fetch users", t.bash("curl -s https://api.example.com/users"), {
        output: "response"
      }),

      t.step("Get active user names", t.json("query", {
        input: "{response}",
        query: "data[?active == `true`].name"
      }), {
        output: "activeNames"
      }),

      t.step("Count active users", t.json("query", {
        input: "{response}",
        query: "length(data[?active == `true`])"
      }), {
        output: "activeCount"
      }),

      t.step("Report", t.claude("Found {activeCount} active users: {activeNames}"))
    ]
  };
}
```

### Package.json Manipulation

```typescript
import { createBuilder, WorkflowDefinition } from "claude-workflow";

export default function (t: ReturnType<typeof createBuilder>): WorkflowDefinition {
  return {
    name: "Update Package",
    steps: [
      t.step("Read package", t.bash("cat package.json"), {
        output: "pkg"
      }),

      t.step("Get current version", t.json("query", {
        input: "{pkg}",
        query: "version"
      }), {
        output: "currentVersion"
      }),

      t.step("Display", t.bash("echo 'Current version: {currentVersion}'")),

      t.step("Bump version", t.json("set", {
        input: "{pkg}",
        path: "version",
        value: "2.0.0"
      }), {
        output: "updatedPkg"
      }),

      t.step("Count dependencies", t.json("query", {
        input: "{pkg}",
        query: "length(keys(dependencies))"
      }), {
        output: "depCount"
      })
    ]
  };
}
```

### Configuration Management

```typescript
import { createBuilder, WorkflowDefinition } from "claude-workflow";

export default function (t: ReturnType<typeof createBuilder>): WorkflowDefinition {
  return {
    name: "Config Management",
    steps: [
      t.step("Get base config", t.bash("cat config.json"), {
        output: "baseConfig"
      }),

      t.step("Merge with overrides", t.json("merge", {
        input: "{baseConfig}",
        value: '{"debug": true, "logLevel": "verbose"}'
      }), {
        output: "mergedConfig"
      }),

      t.step("Set environment", t.json("set", {
        input: "{mergedConfig}",
        path: "environment",
        value: "production"
      }), {
        output: "finalConfig"
      }),

      t.step("Get all keys", t.json("keys", {
        input: "{finalConfig}"
      }), {
        output: "configKeys"
      })
    ]
  };
}
```

### Working with Nested Data

```typescript
import { createBuilder, WorkflowDefinition } from "claude-workflow";

export default function (t: ReturnType<typeof createBuilder>): WorkflowDefinition {
  return {
    name: "Nested Data",
    steps: [
      t.step("Set nested value", t.json("set", {
        input: "{}",
        path: "user.profile.settings.theme",
        value: "dark"
      }), {
        output: "config"
      }),

      t.step("Query nested", t.json("query", {
        input: "{config}",
        query: "user.profile.settings"
      }), {
        output: "settings"
      })
    ]
  };
}
```

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `JMESPath error` | Invalid query syntax | Check JMESPath syntax (no leading dots in queries) |
| `Cannot set path on non-object` | Input is not an object | Ensure input is valid JSON object |
| `Failed to parse JSON` | Invalid JSON in input | Verify JSON syntax in input |
| `Cannot get keys of non-object` | Keys action on non-object | Ensure input is an object |
| `Cannot get length of this value type` | Length on incompatible type | Use length with arrays, objects, or strings |

### Error Handling in Workflows

```typescript
t.step("Try query", t.json("query", {
  input: "{maybeInvalid}",
  query: "optional.setting"
}), {
  output: "setting",
  onError: "continue"
})
```

## Tips and Best Practices

### 1. No Leading Dots in Queries

JMESPath queries don't use leading dots:

```typescript
// Correct
query: "name"
query: "scripts.test"

// Incorrect (old jq-style)
query: ".name"
query: ".scripts.test"
```

### 2. Use Backticks for Literals in Filters

```typescript
// Numbers need backticks
query: "items[?count > `5`]"

// Booleans need backticks
query: "items[?active == `true`]"

// Strings use single quotes
query: "items[?status == 'active']"
```

### 3. Variable Interpolation in Queries

Use variables in queries:

```typescript
t.step("Get by index", t.json("query", {
  input: "{data}",
  query: "items[{index}]"
}), {
  output: "item"
})
```

### 4. Chain Operations

Build up complex transformations:

```typescript
// Step 1: Parse raw JSON
t.step("Parse", t.json("parse", { input: "{raw}" }), { output: "parsed" })

// Step 2: Query specific data
t.step("Query", t.json("query", {
  input: "{parsed}",
  query: "users[?active == `true`]"
}), { output: "active" })

// Step 3: Get count
t.step("Count", t.json("length", { input: "{active}" }), { output: "count" })
```

## Further Reading

### JMESPath Resources

- **[JMESPath Official Site](https://jmespath.org/)** - Language specification and overview
- **[JMESPath Tutorial](https://jmespath.org/tutorial.html)** - Interactive tutorial to learn JMESPath
- **[JMESPath Specification](https://jmespath.org/specification.html)** - Complete language specification
- **[JMESPath Examples](https://jmespath.org/examples.html)** - Common query patterns and examples

### Related Tools

- [data Tool Reference](./data.md) - Writing temp files
- [checklist Tool Reference](./checklist.md) - Validation checks
