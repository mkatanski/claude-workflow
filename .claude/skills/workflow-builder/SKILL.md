---
name: workflow-builder
description: Create claude-orchestrator workflow YAML files and shared steps. Use when the user wants to create, design, or modify workflows for Claude Code automation, multi-step AI tasks, or development pipelines. Triggers on workflow creation, step automation, Claude orchestration requests.
---

# Workflow Builder

This skill helps you create well-structured workflow YAML files for the claude-orchestrator system. It guides you through designing workflows that automate multi-step development tasks using Claude Code.

## Quick Start

For simple workflows, use this template:

```yaml
type: claude-workflow
version: 2
name: My Workflow

steps:
  - name: "Step 1"
    prompt: "Do the first task"
    output_var: result

  - name: "Step 2"
    prompt: "Do the second task using {result}"
```

## Workflow File Location

Workflow files can be placed anywhere within the `.claude/` directory:
- `.claude/` - Root workflow directory
- `.claude/workflows/` - Organized workflow subdirectory
- `.claude/<any-path>/` - Any nested subdirectory

All `.yml` and `.yaml` files with proper headers (`type: claude-workflow`, `version: 2`) are auto-discovered recursively.

## Instructions

### Step 1: Understand the User's Goal

Before creating a workflow, clarify:

1. **What is the overall goal?** (e.g., feature implementation, bug fixing, code review)
2. **What are the discrete steps?** Break complex tasks into atomic operations
3. **What data flows between steps?** Identify variables and outputs needed
4. **What conditions or loops are needed?** Conditional execution, iteration, retries
5. **What external integrations?** Bash commands, Linear issues, JSON manipulation

### Step 2: Choose the Right Structure

Based on the goal, determine the workflow structure:

| Goal | Structure |
|------|-----------|
| Sequential tasks | Simple steps with `output_var` chaining |
| Process multiple items | `foreach` loop over items |
| Retry until success | `retry` tool with `until` condition |
| Poll for status | `while` loop with max iterations |
| Conditional paths | Steps with `when` clauses |
| Complex branching | `goto` with labeled steps |
| Count-based iteration | `range` tool with from/to |

### Step 3: Select Tools for Each Step

For each step, choose the appropriate tool. See [tools-reference.md](tools-reference.md) for the complete tool guide.

**Decision tree for tool selection:**

```
Is it an AI task requiring reasoning?
  YES -> claude (default, just use prompt)
  NO -> Continue below

Is it a shell command?
  YES -> bash

Is it setting a variable?
  Single variable -> set
  Multiple variables -> context (action: set)

Is it iterating over items?
  Fixed list -> foreach
  Number range -> range
  Condition-based -> while

Is it handling failures?
  Retry with backoff -> retry
  Continue on error -> on_error: continue

Is it manipulating JSON?
  YES -> json

Is it writing temp files?
  YES -> data

Is it managing Linear issues?
  Fetching -> linear_tasks
  Creating/updating -> linear_manage
```

### Step 4: Design Variable Flow

Plan how data flows through the workflow:

1. **Capture outputs**: Use `output_var` to store step results
2. **Interpolate values**: Use `{variable_name}` in prompts, commands, conditions
3. **Initialize state**: Use `vars:` section or early `set` steps for initial values
4. **Chain dependencies**: Later steps reference earlier outputs
5. **Large variables handled automatically**: Variables >10,000 chars are externalized to temp files

```yaml
vars:
  project_name: "my-project"

steps:
  - name: "Get version"
    tool: bash
    command: "cat package.json | jq -r .version"
    output_var: version

  - name: "Create tag"
    prompt: "Create git tag for {project_name} version {version}"
```

**Note:** Large variables (>10,000 chars) in `claude` and `claude_sdk` prompts are automatically written to temp files and replaced with `@filepath` references. This prevents prompt size errors and works transparently.

### Step 5: Add Error Handling

Implement appropriate error handling:

```yaml
# Continue workflow even if step fails
- name: "Optional step"
  tool: bash
  command: "optional-command"
  on_error: continue

# Retry transient failures
- name: "Flaky operation"
  tool: retry
  max_attempts: 3
  delay: 5
  steps:
    - name: "Try"
      tool: bash
      command: "flaky-command.sh"

# Conditional execution based on previous results
- name: "Handle failure"
  prompt: "Fix the error: {error_message}"
  when: "{previous_result} contains error"
```

### Step 6: Configure Claude Options

Set Claude-specific options at the workflow level:

```yaml
claude:
  model: sonnet  # or opus, haiku
  dangerously_skip_permissions: true  # for automated workflows
  allowed_tools:  # restrict tools if needed
    - "Bash(git:*)"
    - "Edit"
    - "Read"
```

**Model selection guide:**
- `haiku`: Fast, cheap - simple tasks, quick analysis
- `sonnet`: Balanced - most development tasks (default)
- `opus`: Powerful - complex reasoning, architecture decisions

### Step 7: Handle Dynamic Configuration

**Important:** Workflows do NOT support runtime `inputs` at the workflow level. Use these patterns instead:

#### Pattern 1: Configuration File (Recommended)

Load configuration from a JSON file at workflow start:

```yaml
vars:
  # Default values
  environment: "staging"
  branch: "main"

steps:
  # Load overrides from config file if it exists
  - name: "Check for config"
    tool: bash
    command: "test -f .claude/workflows.config.json && echo 'exists' || echo 'missing'"
    output_var: config_exists

  - name: "Load config"
    tool: bash
    command: "cat .claude/workflows.config.json"
    output_var: config_json
    when: "{config_exists} == exists"

  - name: "Extract environment"
    tool: json
    action: query
    source: config_json
    query: ".environment"
    output_var: environment
    when: "{config_exists} == exists"
```

#### Pattern 2: Environment Variables

Read from environment variables via bash:

```yaml
steps:
  - name: "Get environment"
    tool: bash
    command: "echo ${MY_ENV:-default_value}"
    output_var: environment
```

#### Pattern 3: Static vars Section

For workflows with fixed configuration:

```yaml
vars:
  project_name: "my-project"
  max_retries: "3"
  test_command: "pytest"
```

**Note:** Shared steps DO support inputs - see [shared-steps-guide.md](shared-steps-guide.md).

### Step 8: Consider Shared Steps

For reusable logic, extract into shared steps. See [shared-steps-guide.md](shared-steps-guide.md).

```yaml
steps:
  - shared: git-commit
    with:
      message: "Implement feature"
```

## Reference Documentation

- [workflow-structure.md](workflow-structure.md) - Complete workflow YAML specification
- [tools-reference.md](tools-reference.md) - All available tools and when to use them
- [shared-steps-guide.md](shared-steps-guide.md) - Creating and using shared steps
- [examples.md](examples.md) - Real-world workflow examples
- [best-practices.md](best-practices.md) - Best practices and patterns

## Output Format

When creating a workflow, I will:

1. Clarify the goal and requirements
2. Design the workflow structure
3. Write the complete YAML file
4. Explain each step's purpose
5. Suggest improvements or alternatives
6. Identify opportunities for shared steps

The result will be a valid, well-documented workflow file ready to use with claude-orchestrator.
