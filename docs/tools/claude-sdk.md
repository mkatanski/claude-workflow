# Claude SDK Tool

The `claude_sdk` tool provides direct integration with the Claude API for AI-powered decision making in workflows. It uses the Claude Agent SDK to analyze context and return structured outputs.

## Overview

Unlike the standard `claude` tool which runs Claude Code in a tmux pane, `claude_sdk` makes direct API calls to Claude. This gives you:

- **Structured outputs**: Boolean, enum, decision, or custom JSON schema responses
- **Read-only tools**: Can use Read, Glob, Grep, WebFetch, WebSearch for context gathering
- **Faster execution**: No tmux overhead, direct API communication
- **Better for decisions**: Ideal for branching logic and conditional workflows

## When to Use SDK vs tmux-based Claude

| Use Case | Recommended Tool |
|----------|------------------|
| Make a yes/no decision | `claude_sdk` with `output_type: boolean` |
| Choose between options | `claude_sdk` with `output_type: enum` |
| Dynamic workflow routing | `claude_sdk` with `output_type: decision` |
| Generate structured data | `claude_sdk` with `output_type: schema` |
| Write/modify code | `claude` (tmux-based) |
| Run commands interactively | `claude` (tmux-based) |
| Complex multi-step coding | `claude` (tmux-based) |
| Needs file write access | `claude` (tmux-based) |

**Rule of thumb**: Use `claude_sdk` for decisions and analysis, use `claude` for actions that modify files.

## Required Environment Variables

```bash
# Required: Your Anthropic API key
export ANTHROPIC_API_KEY="sk-ant-..."
```

The SDK requires `claude-agent-sdk` to be installed:

```bash
pip install claude-agent-sdk
```

## Configuration Options

### Step-Level Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `prompt` | string | **required** | The prompt to send to Claude |
| `model` | string | `"sonnet"` | Model alias: `sonnet`, `opus`, or `haiku` |
| `system_prompt` | string | built-in | Custom system prompt for this step |
| `output_type` | string | none | Expected output format (see below) |
| `values` | list | none | Allowed values for `enum` output type |
| `schema` | object | none | JSON schema for `schema` output type |
| `max_retries` | int | `3` | Retries for schema validation failures |
| `max_turns` | int | `10` | Max agentic turns (tool calls) |
| `timeout` | int | `60000` | Timeout in milliseconds |
| `verbose` | bool | `false` | Include full transcript in output |
| `output_var` | string | none | Store result in this variable |

### Workflow-Level Defaults

Set defaults for all `claude_sdk` steps at the workflow level:

```yaml
type: claude-workflow
version: 2
name: My Workflow

claude_sdk:
  model: opus
  system_prompt: |
    You are a code reviewer. Be concise and precise.

steps:
  - name: analyze
    tool: claude_sdk
    prompt: Analyze this code quality
    # Inherits model and system_prompt from workflow level
```

### Model Aliases

| Alias | Model ID |
|-------|----------|
| `sonnet` | claude-sonnet-4-20250514 |
| `opus` | claude-opus-4-5-20251101 |
| `haiku` | claude-haiku-3-5-20241022 |

You can also use full model IDs directly.

## Output Types

### Boolean Output

Returns `true` or `false`:

```yaml
- name: check_tests_exist
  tool: claude_sdk
  prompt: Does this project have a test suite?
  output_type: boolean
  output_var: has_tests
```

Result stored in variable: `"true"` or `"false"`

### Enum Output

Returns one of the specified values:

```yaml
- name: detect_language
  tool: claude_sdk
  prompt: What is the primary programming language?
  output_type: enum
  values:
    - python
    - javascript
    - typescript
    - go
    - rust
    - other
  output_var: language
```

Result stored in variable: e.g., `"python"`

### Decision Output

Returns a step name and reason for workflow routing:

```yaml
- name: route_task
  tool: claude_sdk
  prompt: |
    Based on the issue description, which step should handle this?
    - fix_bug: For bug fixes
    - add_feature: For new features
    - refactor: For code cleanup
  output_type: decision
  output_var: routing_decision
```

Result: JSON with `goto` and `reason` fields. The workflow automatically jumps to the target step.

### Schema Output

Returns structured data matching a JSON schema:

```yaml
- name: extract_info
  tool: claude_sdk
  prompt: Extract key information from this file
  output_type: schema
  schema:
    type: object
    properties:
      title:
        type: string
      version:
        type: string
      dependencies:
        type: array
        items:
          type: string
    required:
      - title
      - version
  output_var: package_info
```

Result: JSON string matching the schema.

## Example Workflows

### Conditional Test Running

```yaml
type: claude-workflow
version: 2
name: Smart Test Runner

steps:
  - name: check_changes
    tool: claude_sdk
    prompt: |
      Look at the recent git changes. Are there any changes
      that require running the full test suite?
    output_type: boolean
    output_var: needs_full_tests

  - name: run_full_tests
    tool: bash
    command: npm run test
    when: "{{ needs_full_tests }} == true"

  - name: run_quick_tests
    tool: bash
    command: npm run test:quick
    when: "{{ needs_full_tests }} == false"
```

### Dynamic Workflow Routing

```yaml
type: claude-workflow
version: 2
name: Issue Handler

steps:
  - name: analyze_issue
    tool: claude_sdk
    prompt: |
      Read the issue description in {{ issue_file }}.
      Determine the type of work needed:
      - step: implement_feature (new functionality)
      - step: fix_bug (something is broken)
      - step: update_docs (documentation only)
    output_type: decision

  - name: implement_feature
    tool: claude
    prompt: Implement the feature described in {{ issue_file }}

  - name: fix_bug
    tool: claude
    prompt: Fix the bug described in {{ issue_file }}

  - name: update_docs
    tool: claude
    prompt: Update documentation as described in {{ issue_file }}
```

### Code Quality Analysis

```yaml
type: claude-workflow
version: 2
name: Code Review

claude_sdk:
  model: opus
  system_prompt: |
    You are a senior code reviewer. Focus on:
    - Security issues
    - Performance problems
    - Code clarity

steps:
  - name: analyze
    tool: claude_sdk
    prompt: Review the changes in the current branch
    output_type: schema
    schema:
      type: object
      properties:
        score:
          type: integer
          minimum: 1
          maximum: 10
        issues:
          type: array
          items:
            type: object
            properties:
              severity:
                type: string
                enum: [critical, warning, info]
              description:
                type: string
        recommendation:
          type: string
          enum: [approve, request_changes, needs_discussion]
      required: [score, issues, recommendation]
    output_var: review_result
```

## Available Tools

The `claude_sdk` tool has access to read-only tools for context gathering:

- **Read**: Read file contents
- **Glob**: Find files by pattern
- **Grep**: Search file contents
- **WebFetch**: Fetch web pages
- **WebSearch**: Search the web

These run with `bypassPermissions` mode for seamless execution.

## Tips and Patterns

### Large Variables Are Handled Automatically

Variables exceeding 10,000 characters are **automatically externalized** to temp files. The system:
- Writes large content to `{temp_dir}/{variable_name}.txt`
- Replaces `{var}` with `@/path/to/file.txt` in the prompt
- Claude reads the file via its `@filepath` syntax

This prevents prompt size errors and works transparently:
```yaml
steps:
  - name: "Get logs"
    tool: bash
    command: "cat large_logfile.txt"  # Could be 100KB+
    output_var: logs

  - name: "Analyze"
    tool: claude_sdk
    prompt: "Find critical errors in: {logs}"
    output_type: boolean
    # Automatically becomes: Find critical errors in: @/path/to/logs.txt
```

### Use Variables for Context

```yaml
- name: get_readme
  tool: bash
  command: cat README.md
  output_var: readme_content

- name: analyze
  tool: claude_sdk
  prompt: |
    Based on this README:
    {{ readme_content }}

    Is this a library or an application?
  output_type: enum
  values: [library, application]
```

### Chain Decisions

```yaml
- name: check_tests
  tool: claude_sdk
  prompt: Does this project have tests?
  output_type: boolean
  output_var: has_tests

- name: check_coverage
  tool: claude_sdk
  prompt: Is test coverage above 80%?
  output_type: boolean
  output_var: good_coverage
  when: "{{ has_tests }} == true"
```

### Use Verbose Mode for Debugging

```yaml
- name: debug_analysis
  tool: claude_sdk
  prompt: Analyze the project structure
  verbose: true  # Full transcript in output
  output_var: analysis
```

### Custom System Prompts for Specialized Tasks

```yaml
- name: security_review
  tool: claude_sdk
  system_prompt: |
    You are a security expert. Look for:
    - SQL injection
    - XSS vulnerabilities
    - Hardcoded secrets
    - Insecure dependencies
  prompt: Review src/ for security issues
  output_type: schema
  schema:
    type: object
    properties:
      vulnerabilities:
        type: array
        items:
          type: string
      risk_level:
        type: string
        enum: [none, low, medium, high, critical]
```

### Retry on Validation Failure

The SDK automatically retries when output validation fails. Each retry includes the previous error message to help Claude correct its output:

```yaml
- name: extract_data
  tool: claude_sdk
  prompt: Extract structured data
  output_type: schema
  schema: { ... }
  max_retries: 5  # Try up to 5 times on validation failure
```

## Error Handling

If the SDK is not installed:

```
claude-agent-sdk not installed. Run: pip install claude-agent-sdk
```

If output validation fails after all retries:

```
Output validation failed after 3 attempts: Expected boolean result, got: string
```

Use `on_error: continue` to proceed despite failures:

```yaml
- name: optional_check
  tool: claude_sdk
  prompt: Check if feature exists
  output_type: boolean
  on_error: continue
```
