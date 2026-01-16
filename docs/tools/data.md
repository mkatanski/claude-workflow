# Data Tool

The `data` tool writes content to managed temporary files during workflow execution. Files are automatically cleaned up when the workflow ends, making it ideal for passing structured data between steps or providing context files to Claude.

## Overview

The data tool:

1. Takes content (text, JSON, markdown, etc.) as input
2. Writes it to a file in the workflow's temp directory
3. Returns the file path as output
4. Automatically cleans up when the workflow completes

This is useful for:
- Creating context files for Claude to read
- Storing intermediate data in a file format
- Building dynamic configuration files
- Preparing structured input for other tools

## Basic Usage

```typescript
import { createBuilder, WorkflowDefinition } from "claude-workflow";

export default function (t: ReturnType<typeof createBuilder>): WorkflowDefinition {
  return {
    name: "Data Example",
    steps: [
      t.step("Create context file", t.data("This is the content to write", "text"), {
        output: "filePath"
      }),

      t.step("Use the file", t.claude("Read and analyze the file at {filePath}"))
    ]
  };
}
```

## API Reference

### `t.data(content, format)`

Creates a data tool definition.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `content` | string | Yes | The content to write (supports variable interpolation) |
| `format` | string | Yes | Output format determining file extension |

### Step Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `output` | string | - | Variable name to store the file path |
| `when` | string | - | Conditional expression for step execution |
| `onError` | string | `"stop"` | Error handling: `stop` or `continue` |

## Formats

The format parameter determines the file extension:

| Format | Extension |
|--------|-----------|
| `text`, `txt` | `.txt` |
| `json` | `.json` |
| `markdown`, `md` | `.md` |
| `yaml`, `yml` | `.yaml` |
| `csv` | `.csv` |
| `xml` | `.xml` |
| `html` | `.html` |

```typescript
// Create a JSON file
t.step("Write JSON", t.data('{"name": "test", "value": 42}', "json"), {
  output: "jsonPath"
})

// Create a markdown file
t.step("Write docs", t.data("# Title\n\nContent here", "markdown"), {
  output: "mdPath"
})
```

## Variable Interpolation

Content supports variable interpolation using `{variableName}` syntax.

### Basic Interpolation

```typescript
import { createBuilder, WorkflowDefinition } from "claude-workflow";

export default function (t: ReturnType<typeof createBuilder>): WorkflowDefinition {
  return {
    name: "Interpolation Example",
    steps: [
      t.step("Get project info", t.bash("cat package.json"), {
        output: "package"
      }),

      t.step("Create summary", t.data(`
Project: {package.name}
Version: {package.version}
Description: {package.description}
      `, "markdown"), {
        output: "summaryFile"
      })
    ]
  };
}
```

### Nested Object Access

Access nested JSON fields using dot notation:

```typescript
t.step("Create user context", t.data(`
User Profile:
- Name: {user.name}
- Email: {user.email}
- Role: {user.role}
`, "markdown"), {
  output: "userContext"
})
```

## Example Workflows

### Creating Context for Claude

```typescript
import { createBuilder, WorkflowDefinition } from "claude-workflow";

export default function (t: ReturnType<typeof createBuilder>): WorkflowDefinition {
  return {
    name: "Context Creation",
    steps: [
      t.step("Gather project info", t.bash("cat package.json"), {
        output: "package"
      }),

      t.step("Get recent changes", t.bash("git log --oneline -10"), {
        output: "recentCommits"
      }),

      t.step("Create context file", t.data(`
# Project Context

## Package Info
- Name: {package.name}
- Version: {package.version}

## Recent Commits
{recentCommits}
      `, "markdown"), {
        output: "contextFile"
      }),

      t.step("Analyze with context", t.claude("Read {contextFile} and suggest the next feature to implement"))
    ]
  };
}
```

### Building Dynamic Configuration

```typescript
import { createBuilder, WorkflowDefinition } from "claude-workflow";

export default function (t: ReturnType<typeof createBuilder>): WorkflowDefinition {
  return {
    name: "Dynamic Config",
    vars: {
      env: "staging",
      apiUrl: "https://staging-api.example.com"
    },
    steps: [
      t.step("Create config", t.data(`{
  "environment": "{env}",
  "apiUrl": "{apiUrl}",
  "debug": true
}`, "json"), {
        output: "configPath"
      }),

      t.step("Deploy with config", t.claude("Use the configuration at {configPath} to set up the deployment"))
    ]
  };
}
```

### Storing Intermediate Results

```typescript
import { createBuilder, WorkflowDefinition } from "claude-workflow";

export default function (t: ReturnType<typeof createBuilder>): WorkflowDefinition {
  return {
    name: "Intermediate Storage",
    steps: [
      t.step("Analyze codebase", t.claude("List all public API endpoints in this codebase"), {
        output: "endpoints"
      }),

      t.step("Save analysis", t.data("{endpoints}", "markdown"), {
        output: "analysisFile"
      }),

      t.step("Generate documentation", t.claude("Read {analysisFile} and generate API documentation"))
    ]
  };
}
```

### Loop with Data Aggregation

```typescript
import { createBuilder, WorkflowDefinition } from "claude-workflow";

export default function (t: ReturnType<typeof createBuilder>): WorkflowDefinition {
  return {
    name: "Data Aggregation",
    vars: {
      allResults: ""
    },
    steps: [
      t.forEach('["file1.py", "file2.py", "file3.py"]', "currentFile", [
        t.step("Analyze file", t.claude("Analyze {currentFile} and list its functions"), {
          output: "analysis"
        }),

        t.step("Append to results", t.bash("echo '{allResults}\n\n## {currentFile}\n{analysis}'"), {
          output: "allResults"
        })
      ]),

      t.step("Save all results", t.data(`
# Code Analysis Report

{allResults}
      `, "markdown"), {
        output: "reportFile"
      }),

      t.step("Final summary", t.claude("Read {reportFile} and create an executive summary"))
    ]
  };
}
```

## Output

The data tool returns the full path to the created file:

```
/tmp/claude-workflow-abc123/data_f7e8d9c0.txt
```

This path can be:
- Captured with `output` option for use in later steps
- Passed to Claude prompts for reading
- Used in bash commands

## Error Handling

### No Temp Directory

The data tool requires the workflow temp directory. If it's not available, the step fails:

```
No temp directory available. Ensure workflow temp directory is set up.
```

### File Write Errors

If the file cannot be written (permissions, disk space, etc.), the step fails with the OS error message.

## Comparison with Bash

While you can create files with bash:

```typescript
// Using bash
t.step("Create file", t.bash("echo 'content' > /tmp/myfile.txt"))
```

The data tool offers advantages:

| Feature | `data` tool | `bash` echo |
|---------|-------------|-------------|
| Auto-cleanup | Yes | No |
| Variable interpolation | Built-in | Manual escaping needed |
| Temp directory | Managed | Manual |
| Cross-platform | Yes | Shell-dependent |

## Tips and Best Practices

### Always Capture File Paths

Capture the file path if you need to reference it later:

```typescript
t.step("Create data", t.data("Important data", "text"), {
  output: "dataPath"  // Don't forget this!
})

t.step("Use data", t.claude("Process {dataPath}"))
```

### Use Markdown for Claude Context

Claude works well with markdown-formatted context files:

```typescript
t.step("Create context", t.data(`
# Task Context

## Current State
{currentState}

## Requirements
{requirements}

## Constraints
- Must be backward compatible
- Must pass all tests
`, "markdown"), {
  output: "context"
})
```

### Combine with forEach for Batch Processing

Create multiple files in a loop:

```typescript
t.forEach('["users", "products", "orders"]', "entity", [
  t.step("Generate schema", t.claude("Generate JSON schema for {entity}"), {
    output: "schema"
  }),

  t.step("Save schema", t.data("{schema}", "json"), {
    output: "schemaPath"
  })
])
```
