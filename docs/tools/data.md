# Data Tool

The `data` tool writes content to managed temporary files during workflow execution. Files are automatically cleaned up when the workflow ends, making it ideal for passing structured data between steps or providing context files to Claude.

## Overview

The data tool:

1. Takes content (text, JSON, or markdown) as input
2. Writes it to a file in the workflow's temp directory
3. Returns the file path as output
4. Automatically cleans up when the workflow completes

This is useful for:
- Creating context files for Claude to read
- Storing intermediate data in a file format
- Building dynamic configuration files
- Preparing structured input for other tools

## Basic Usage

```yaml
steps:
  - name: "Create context file"
    tool: data
    content: "This is the content to write"
    output_var: file_path

  - name: "Use the file"
    prompt: "Read and analyze the file at {file_path}"
```

## Configuration

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `tool` | string | Yes | - | Must be `"data"` |
| `name` | string | Yes | - | Step name for display and goto refs |
| `content` | string | Yes | - | The content to write (supports interpolation) |
| `format` | string | No | `"text"` | Output format: `json`, `text`, or `markdown` |
| `filename` | string | No | auto-generated | Custom filename (supports interpolation) |
| `output_var` | string | No | - | Variable name to store the file path |

### Required Fields

- `tool: data` - Identifies this as a data step
- `name` - Step name for display
- `content` - The content to write to the file

### Optional Fields

#### `format`

Specifies the output format. Determines file extension and content processing:

| Format | Extension | Processing |
|--------|-----------|------------|
| `text` | `.txt` | Written as-is |
| `json` | `.json` | Parsed and pretty-printed with 2-space indent |
| `markdown` | `.md` | Written as-is |

```yaml
- name: "Create JSON file"
  tool: data
  content: '{"name": "test", "value": 42}'
  format: json
  output_var: json_path
```

#### `filename`

Override the auto-generated filename. Supports variable interpolation.

```yaml
- name: "Create named file"
  tool: data
  content: "Config content"
  filename: "my-config.txt"
  output_var: config_path
```

If not specified, filenames are auto-generated as `data_<8-char-hex>.{ext}` (e.g., `data_a1b2c3d4.txt`).

#### `output_var`

Captures the full file path for use in subsequent steps.

```yaml
- name: "Write data"
  tool: data
  content: "Important information"
  output_var: data_file

- name: "Process file"
  prompt: "Read {data_file} and summarize the content"
```

## Variable Interpolation

Both `content` and `filename` support variable interpolation using `{variable_name}` syntax.

### In Content

```yaml
steps:
  - name: "Get project info"
    tool: bash
    command: "cat package.json"
    output_var: package

  - name: "Create summary"
    tool: data
    content: |
      Project: {package.name}
      Version: {package.version}
      Description: {package.description}
    format: markdown
    output_var: summary_file
```

### In Filename

```yaml
steps:
  - name: "Set version"
    tool: set
    var: version
    value: "1.2.3"

  - name: "Create versioned config"
    tool: data
    content: "Configuration for version {version}"
    filename: "config-v{version}.txt"
    output_var: config_path
```

### Nested Object Access

Access nested JSON fields using dot notation:

```yaml
- name: "Get API response"
  tool: bash
  command: 'curl -s https://api.example.com/user'
  output_var: user

- name: "Create user context"
  tool: data
  content: |
    User Profile:
    - Name: {user.name}
    - Email: {user.email}
    - Role: {user.role}
  format: markdown
  output_var: user_context
```

## Formats

### Text Format (Default)

Plain text files. Content is written exactly as provided.

```yaml
- name: "Write text file"
  tool: data
  content: |
    Line 1
    Line 2
    Line 3
  format: text
  output_var: text_file
```

### JSON Format

JSON content is validated, parsed, and pretty-printed with 2-space indentation.

```yaml
- name: "Write JSON data"
  tool: data
  content: '{"users": [{"name": "Alice"}, {"name": "Bob"}], "count": 2}'
  format: json
  output_var: json_file
```

The output file will contain:

```json
{
  "users": [
    {
      "name": "Alice"
    },
    {
      "name": "Bob"
    }
  ],
  "count": 2
}
```

If the content is not valid JSON, the step fails with an error.

### Markdown Format

Markdown files. Content is written exactly as provided.

```yaml
- name: "Write markdown doc"
  tool: data
  content: |
    # Report

    ## Summary

    This is a summary of findings.

    ## Details

    - Item 1
    - Item 2
  format: markdown
  output_var: report_file
```

## Example Workflows

### Creating Context for Claude

```yaml
steps:
  - name: "Gather project info"
    tool: bash
    command: "cat package.json"
    output_var: package

  - name: "Get recent changes"
    tool: bash
    command: "git log --oneline -10"
    output_var: recent_commits

  - name: "Create context file"
    tool: data
    content: |
      # Project Context

      ## Package Info
      - Name: {package.name}
      - Version: {package.version}

      ## Recent Commits
      {recent_commits}
    format: markdown
    output_var: context_file

  - name: "Analyze with context"
    prompt: "Read {context_file} and suggest the next feature to implement"
```

### Building Dynamic Configuration

```yaml
steps:
  - name: "Set environment"
    tool: set
    var: env
    value: "staging"

  - name: "Set API URL"
    tool: set
    var: api_url
    value: "https://staging-api.example.com"

  - name: "Create config"
    tool: data
    content: |
      {
        "environment": "{env}",
        "apiUrl": "{api_url}",
        "debug": true
      }
    format: json
    filename: "config.json"
    output_var: config_path

  - name: "Deploy with config"
    prompt: "Use the configuration at {config_path} to set up the deployment"
```

### Storing Intermediate Results

```yaml
steps:
  - name: "Analyze codebase"
    prompt: "List all public API endpoints in this codebase"
    output_var: endpoints

  - name: "Save analysis"
    tool: data
    content: "{endpoints}"
    format: markdown
    filename: "api-endpoints.md"
    output_var: analysis_file

  - name: "Generate documentation"
    prompt: "Read {analysis_file} and generate API documentation"
```

### Loop with Data Aggregation

```yaml
steps:
  - name: "Initialize results"
    tool: set
    var: all_results
    value: ""

  - name: "Process files"
    tool: foreach
    items: ["file1.py", "file2.py", "file3.py"]
    item_var: current_file
    steps:
      - name: "Analyze file"
        prompt: "Analyze {current_file} and list its functions"
        output_var: analysis

      - name: "Append to results"
        tool: set
        var: all_results
        value: "{all_results}\n\n## {current_file}\n{analysis}"

  - name: "Save all results"
    tool: data
    content: |
      # Code Analysis Report

      {all_results}
    format: markdown
    output_var: report_file

  - name: "Final summary"
    prompt: "Read {report_file} and create an executive summary"
```

### Conditional Data Creation

```yaml
steps:
  - name: "Check environment"
    tool: bash
    command: "echo $NODE_ENV"
    output_var: node_env

  - name: "Create production config"
    tool: data
    content: |
      {
        "debug": false,
        "logLevel": "error",
        "minify": true
      }
    format: json
    filename: "build-config.json"
    output_var: config_path
    when: "{node_env} == production"

  - name: "Create development config"
    tool: data
    content: |
      {
        "debug": true,
        "logLevel": "debug",
        "minify": false
      }
    format: json
    filename: "build-config.json"
    output_var: config_path
    when: "{node_env} != production"
```

## Error Handling

### Invalid JSON

When using `format: json`, the content must be valid JSON. Invalid JSON causes the step to fail:

```yaml
# This will fail - invalid JSON
- name: "Bad JSON"
  tool: data
  content: "{invalid: json}"  # Missing quotes around key
  format: json
```

Error message: `Invalid JSON content: Expecting property name enclosed in double quotes...`

### No Temp Directory

The data tool requires the workflow temp directory. If it's not available (rare), the step fails:

```
No temp directory available. The data tool requires workflow temp directory support.
```

### File Write Errors

If the file cannot be written (permissions, disk space, etc.), the step fails with the OS error message.

## Output

The data tool returns the full path to the created file:

```
/tmp/claude-workflow-abc123/data_f7e8d9c0.txt
```

This path can be:
- Captured with `output_var` for use in later steps
- Passed to Claude prompts for reading
- Used in bash commands

## Comparison with Bash echo/cat

While you can create files with bash:

```yaml
# Using bash
- name: "Create file"
  tool: bash
  command: "echo 'content' > /tmp/myfile.txt"
```

The data tool offers advantages:

| Feature | `data` tool | `bash` echo/cat |
|---------|-------------|-----------------|
| Auto-cleanup | Yes | No |
| Variable interpolation | Built-in | Manual escaping needed |
| JSON validation | Yes | No |
| Pretty-printing | Yes (JSON) | No |
| Temp directory | Managed | Manual |
| Cross-platform | Yes | Shell-dependent |

## Tips and Best Practices

### Use output_var to Capture File Paths

Always capture the file path if you need to reference it later:

```yaml
- name: "Create data"
  tool: data
  content: "Important data"
  output_var: data_path  # Don't forget this!

- name: "Use data"
  prompt: "Process {data_path}"
```

### Use Meaningful Filenames

Custom filenames make debugging easier:

```yaml
- name: "Create report"
  tool: data
  content: "{analysis_results}"
  filename: "security-audit-report.md"
  format: markdown
```

### Validate JSON Content

If building JSON dynamically, ensure proper escaping:

```yaml
- name: "Build JSON safely"
  tool: bash
  command: "echo '{\"key\": \"value\"}'"  # Properly escaped
  output_var: json_string

- name: "Write JSON"
  tool: data
  content: "{json_string}"
  format: json
```

### Use Markdown for Claude Context

Claude works well with markdown-formatted context files:

```yaml
- name: "Create context"
  tool: data
  content: |
    # Task Context

    ## Current State
    {current_state}

    ## Requirements
    {requirements}

    ## Constraints
    - Must be backward compatible
    - Must pass all tests
  format: markdown
  output_var: context
```

### Combine with foreach for Batch Processing

Create multiple files in a loop:

```yaml
- name: "Process items"
  tool: foreach
  items: ["users", "products", "orders"]
  item_var: entity
  steps:
    - name: "Generate schema"
      prompt: "Generate JSON schema for {entity}"
      output_var: schema

    - name: "Save schema"
      tool: data
      content: "{schema}"
      format: json
      filename: "{entity}-schema.json"
```
