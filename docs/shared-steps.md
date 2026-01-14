# Shared Steps

Shared steps are reusable workflow step definitions that encapsulate common patterns and operations. Similar to GitHub Actions composite actions, they allow you to define a sequence of steps with inputs and outputs that can be referenced from any workflow.

## Table of Contents

- [Overview](#overview)
- [Why Use Shared Steps](#why-use-shared-steps)
- [Step File Format](#step-file-format)
  - [Required Fields](#required-fields)
  - [Inputs](#inputs)
  - [Outputs](#outputs)
  - [Steps](#steps)
- [Using Shared Steps in Workflows](#using-shared-steps-in-workflows)
  - [Basic Usage](#basic-usage)
  - [Passing Inputs](#passing-inputs)
  - [Capturing Outputs](#capturing-outputs)
- [Resolution Strategies](#resolution-strategies)
  - [Builtin Steps](#builtin-steps)
  - [Project Steps](#project-steps)
  - [Path-based Steps](#path-based-steps)
- [Builtin Shared Steps Reference](#builtin-shared-steps-reference)
  - [git-status](#git-status)
  - [git-commit](#git-commit)
  - [lint-fix](#lint-fix)
  - [run-tests](#run-tests)
- [Creating Custom Shared Steps](#creating-custom-shared-steps)
  - [Directory Structure](#directory-structure)
  - [Input Definition Options](#input-definition-options)
  - [Output Definition Options](#output-definition-options)
  - [Using Inputs in Steps](#using-inputs-in-steps)
- [Advanced Features](#advanced-features)
  - [Nested Shared Steps](#nested-shared-steps)
  - [Shared Steps in ForEach Loops](#shared-steps-in-foreach-loops)
  - [Conditional Execution](#conditional-execution)
  - [JSON Schema Validation](#json-schema-validation)
- [Error Handling](#error-handling)
- [Complete Examples](#complete-examples)

---

## Overview

A shared step is defined in a `step.yml` file and contains:
- **Inputs**: Parameters that can be passed when using the step
- **Outputs**: Values that can be captured by the calling workflow
- **Steps**: A sequence of tool executions that perform the actual work

When you use a shared step in a workflow, the orchestrator:
1. Resolves the step definition from the specified location
2. Validates provided inputs against the step's requirements
3. Creates an isolated execution context
4. Executes the internal steps sequentially
5. Maps outputs back to your workflow's context

---

## Why Use Shared Steps

Shared steps provide several benefits:

1. **Code Reuse**: Define common operations once, use them across multiple workflows
2. **Encapsulation**: Hide implementation details behind a clean interface
3. **Consistency**: Ensure the same operation is performed identically everywhere
4. **Maintainability**: Update a shared step once to fix bugs or add features
5. **Readability**: Workflows become more concise and easier to understand
6. **Testing**: Shared steps can be tested in isolation

---

## Step File Format

Shared steps are defined in YAML files named `step.yml` or `step.yaml`.

### Required Fields

```yaml
type: claude-step      # Must be "claude-step"
version: 1             # Schema version (currently only 1)
name: "Step Name"      # Human-readable name
steps:                 # At least one step is required
  - name: "Do something"
    tool: bash
    command: "echo hello"
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | yes | Must be `"claude-step"` |
| `version` | integer | yes | Schema version (currently `1`) |
| `name` | string | no | Human-readable name |
| `description` | string | no | What this step does |
| `inputs` | list | no | Input parameter definitions |
| `outputs` | list | no | Output definitions |
| `steps` | list | yes | Steps to execute |

### Inputs

Inputs define parameters that can be passed when using the shared step. They support both simple and detailed formats.

**Simple format** (just the name, required by default):
```yaml
inputs:
  - repository
  - branch
```

**Detailed format** (full configuration):
```yaml
inputs:
  - name: repository
    description: "Git repository URL"
    required: true
    schema:
      type: string
      pattern: "^https?://"

  - name: branch
    description: "Branch to checkout"
    required: false
    default: "main"
```

### Outputs

Outputs define values that the shared step exposes to the calling workflow.

**Simple format** (name matches internal variable):
```yaml
outputs:
  - commit_sha
  - branch_name
```

**Detailed format** (map internal variable to different name):
```yaml
outputs:
  - name: commit_sha
    description: "SHA of the created commit"
    from: internal_sha_variable

  - name: success
    description: "Whether the operation succeeded"
    from: operation_result
```

### Steps

The `steps` field contains a list of steps to execute, using the same format as workflow steps:

```yaml
steps:
  - name: "First step"
    tool: bash
    command: "echo {inputs.message}"
    output_var: result

  - name: "Second step"
    tool: set
    var: final_result
    value: "{result}"
    when: "{result} is not empty"
```

Steps can use:
- All standard tools (`bash`, `set`, `goto`, `claude_sdk`, etc.)
- Input values via `{inputs.name}` interpolation
- Variables set by previous steps
- Conditional execution with `when`
- Other shared steps via `uses`

---

## Using Shared Steps in Workflows

### Basic Usage

Use the `uses` field to reference a shared step:

```yaml
type: claude-workflow
version: 2
name: "My Workflow"

steps:
  - name: "Check repository status"
    uses: builtin:git-status
```

### Passing Inputs

Use the `with` field to pass input values:

```yaml
- name: "Create commit"
  uses: builtin:git-commit
  with:
    message: "feat: add new feature"
    add_all: true
```

Inputs support variable interpolation:

```yaml
- name: "Get commit message"
  tool: claude_sdk
  prompt: "Generate a commit message for the staged changes"
  output_var: commit_message

- name: "Create commit"
  uses: builtin:git-commit
  with:
    message: "{commit_message}"
```

### Capturing Outputs

Use the `outputs` field to map step outputs to workflow variables:

```yaml
- name: "Check status"
  uses: builtin:git-status
  outputs:
    branch: current_branch
    has_changes: has_uncommitted_changes
    staged_count: files_staged

- name: "Show info"
  tool: bash
  command: "echo 'Branch: {current_branch}, Changes: {has_uncommitted_changes}'"
```

The `outputs` field maps from the shared step's output name (left) to your workflow variable name (right).

---

## Resolution Strategies

Shared steps can be resolved from three locations using different prefixes.

### Builtin Steps

Steps shipped with the orchestrator package:

```yaml
uses: builtin:git-status
uses: builtin:git-commit
uses: builtin:lint-fix
uses: builtin:run-tests
```

Location: `orchestrator/shared_steps/builtin/<name>/step.yml`

### Project Steps

Steps defined in your project's `.claude/workflows/steps/` directory:

```yaml
uses: project:my-custom-step
uses: project:deploy-script
```

Location: `<project>/.claude/workflows/steps/<name>/step.yml`

### Path-based Steps

Steps resolved relative to the workflow file:

```yaml
uses: path:./local-steps/my-step
uses: path:../shared/common-step
```

Location: Relative to the directory containing the workflow file.

---

## Builtin Shared Steps Reference

### git-status

Get current git repository status including branch, changes, and commit info.

**Inputs:**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `include_untracked` | boolean | no | `true` | Include untracked files in the status |

**Outputs:**

| Name | Description |
|------|-------------|
| `branch` | Current branch name |
| `has_changes` | Whether there are uncommitted changes (`"true"` or `"false"`) |
| `staged_count` | Number of staged files |
| `modified_count` | Number of modified files |
| `untracked_count` | Number of untracked files |
| `commit_sha` | Current commit SHA (short) |
| `status_output` | Raw git status output |

**Example:**

```yaml
- name: "Check repository"
  uses: builtin:git-status
  outputs:
    branch: current_branch
    has_changes: needs_commit

- name: "Show status"
  tool: bash
  command: "echo 'On branch {current_branch}, needs commit: {needs_commit}'"
```

---

### git-commit

Stage and commit changes with a message.

**Inputs:**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `message` | string | yes | - | Commit message (minimum 1 character) |
| `add_all` | boolean | no | `true` | Stage all changes before committing |
| `allow_empty` | boolean | no | `false` | Allow creating an empty commit |

**Outputs:**

| Name | Description |
|------|-------------|
| `commit_sha` | SHA of the created commit |
| `committed` | Whether a commit was created (`"true"` or `"false"`) |

**Example:**

```yaml
- name: "Commit changes"
  uses: builtin:git-commit
  with:
    message: "fix: resolve authentication issue"
    add_all: true
  outputs:
    commit_sha: new_sha
    committed: was_committed

- name: "Log result"
  tool: bash
  command: "echo 'Created commit: {new_sha}'"
  when: "{was_committed} == true"
```

---

### lint-fix

Run linter with auto-fix for common languages and frameworks.

**Inputs:**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `language` | string | no | `"auto"` | Programming language: `auto`, `javascript`, `typescript`, `python`, `rust`, `go` |
| `fix` | boolean | no | `true` | Automatically fix issues when possible |
| `path` | string | no | `"."` | Path to lint |

**Outputs:**

| Name | Description |
|------|-------------|
| `success` | Whether linting passed (`"true"` or `"false"`) |
| `fixed_count` | Number of files that were auto-fixed |
| `output` | Linter output |

**Language Detection:**
- JavaScript/TypeScript: Detected via `package.json`
- Python: Detected via `pyproject.toml`, `setup.py`, or `requirements.txt`
- Rust: Detected via `Cargo.toml`
- Go: Detected via `go.mod`

**Linters Used:**
- JavaScript/TypeScript: ESLint
- Python: Ruff
- Rust: Clippy
- Go: golangci-lint

**Example:**

```yaml
- name: "Fix lint issues"
  uses: builtin:lint-fix
  with:
    language: typescript
    fix: true
    path: "./src"
  outputs:
    success: lint_passed
    output: lint_output

- name: "Report"
  tool: bash
  command: "echo 'Lint result: {lint_passed}'"
```

---

### run-tests

Run test suite for common languages and frameworks.

**Inputs:**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `language` | string | no | `"auto"` | Programming language: `auto`, `javascript`, `typescript`, `python`, `rust`, `go` |
| `coverage` | boolean | no | `false` | Generate coverage report |
| `test_path` | string | no | `""` | Specific test path or pattern to run |

**Outputs:**

| Name | Description |
|------|-------------|
| `success` | Whether all tests passed (`"true"`, `"false"`, or `"unknown"`) |
| `output` | Test output |
| `coverage_percent` | Coverage percentage (if coverage enabled) |

**Test Frameworks Used:**
- JavaScript/TypeScript: npm test (Jest, Vitest, etc.)
- Python: pytest
- Rust: cargo test
- Go: go test

**Example:**

```yaml
- name: "Run tests"
  uses: builtin:run-tests
  with:
    coverage: true
  outputs:
    success: tests_passed
    coverage_percent: coverage

- name: "Check coverage"
  tool: bash
  command: "echo 'Coverage: {coverage}%'"
  when: "{tests_passed} == true"
```

---

## Creating Custom Shared Steps

### Directory Structure

Create your shared steps in the `.claude/workflows/steps/` directory:

```
project/
  .claude/
    workflows/
      steps/
        my-step/
          step.yml
        deploy/
          step.yml
        notify-slack/
          step.yml
```

Each step must be in its own directory containing a `step.yml` or `step.yaml` file.

### Input Definition Options

```yaml
inputs:
  - name: environment
    description: "Deployment environment"
    required: true
    schema:
      type: string
      enum: ["dev", "staging", "prod"]

  - name: timeout
    description: "Operation timeout in seconds"
    required: false
    default: 60
    schema:
      type: integer
      minimum: 1
      maximum: 3600

  - name: notify
    description: "Send notifications"
    required: false
    default: true
    schema:
      type: boolean
```

**Input Definition Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Input parameter name |
| `description` | string | no | Human-readable description |
| `required` | boolean | no | Whether input must be provided (default: `true`) |
| `default` | any | no | Default value if not provided |
| `schema` | object | no | JSON Schema for validation |

### Output Definition Options

```yaml
outputs:
  - name: result_url
    description: "URL of the deployed application"
    from: deploy_url

  - name: version
    description: "Deployed version"
    from: app_version
```

**Output Definition Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Output name (exposed to parent workflow) |
| `description` | string | no | Human-readable description |
| `from` | string | no | Internal variable to expose (defaults to `name`) |

### Using Inputs in Steps

Access input values using `{inputs.name}` syntax:

```yaml
type: claude-step
version: 1
name: "Deploy Application"

inputs:
  - name: environment
    required: true
  - name: version
    required: true

outputs:
  - name: deploy_url
    from: url

steps:
  - name: "Deploy"
    tool: bash
    command: "deploy --env {inputs.environment} --version {inputs.version}"
    output_var: url
```

---

## Advanced Features

### Nested Shared Steps

Shared steps can use other shared steps:

```yaml
type: claude-step
version: 1
name: "Full Deploy"

inputs:
  - name: environment
    required: true

steps:
  - name: "Run tests"
    uses: builtin:run-tests
    outputs:
      success: tests_ok

  - name: "Check tests"
    tool: goto
    target: "Deploy failed"
    when: "{tests_ok} != true"

  - name: "Lint code"
    uses: builtin:lint-fix
    with:
      fix: false

  - name: "Deploy"
    tool: bash
    command: "deploy --env {inputs.environment}"
    output_var: deploy_result

  - name: "Done"
    tool: set
    var: success
    value: "true"

  - name: "Deploy failed"
    tool: set
    var: success
    value: "false"
    when: "false"
```

**Note:** The maximum nesting depth is 10 levels. Circular dependencies are detected and will raise an error.

### Shared Steps in ForEach Loops

Shared steps work seamlessly inside foreach loops:

```yaml
- name: "Get files"
  tool: bash
  command: "echo '[\"file1.ts\", \"file2.ts\"]'"
  output_var: files

- name: "Process each file"
  tool: foreach
  source: files
  item_var: file
  steps:
    - name: "Lint file"
      uses: builtin:lint-fix
      with:
        path: "{file}"
        fix: true
      outputs:
        success: lint_result

    - name: "Log result"
      tool: bash
      command: "echo 'Linted {file}: {lint_result}'"
```

### Conditional Execution

Use `when` conditions in shared step definitions:

```yaml
steps:
  - name: "Stage changes"
    tool: bash
    command: "git add -A"
    when: "{inputs.add_all} == true"

  - name: "Stage specific"
    tool: bash
    command: "git add {inputs.path}"
    when: "{inputs.add_all} == false"
```

### JSON Schema Validation

Use JSON Schema to validate input values:

```yaml
inputs:
  - name: port
    description: "Server port"
    required: true
    schema:
      type: integer
      minimum: 1
      maximum: 65535

  - name: protocol
    description: "Protocol to use"
    required: true
    schema:
      type: string
      enum: ["http", "https"]

  - name: headers
    description: "Additional headers"
    required: false
    schema:
      type: object
      additionalProperties:
        type: string
```

If an input value doesn't match its schema, an `InputSchemaValidationError` is raised with details about what went wrong.

**Note:** JSON Schema validation requires the `jsonschema` package to be installed. If not available, schema validation is skipped.

---

## Error Handling

Shared steps can encounter several types of errors:

| Error | Description |
|-------|-------------|
| `SharedStepNotFoundError` | The referenced step could not be found |
| `SharedStepParseError` | The step.yml file is invalid |
| `RequiredInputMissingError` | A required input was not provided |
| `InputSchemaValidationError` | An input value failed schema validation |
| `CircularDependencyError` | Circular reference detected in nested steps |
| `MaxDepthExceededError` | Nesting depth exceeded maximum (10) |
| `SharedStepExecutionError` | An internal step failed during execution |

Use `on_error` to control behavior when a shared step fails:

```yaml
- name: "Optional lint"
  uses: builtin:lint-fix
  on_error: continue  # Continue workflow even if lint fails

- name: "Required tests"
  uses: builtin:run-tests
  on_error: stop      # Stop workflow if tests fail (default)
```

---

## Complete Examples

### Example 1: CI/CD Pipeline Step

Create a reusable CI step at `.claude/workflows/steps/ci-check/step.yml`:

```yaml
type: claude-step
version: 1
name: "CI Check"
description: "Run full CI checks including lint, test, and build"

inputs:
  - name: skip_lint
    description: "Skip linting"
    required: false
    default: false
  - name: skip_tests
    description: "Skip tests"
    required: false
    default: false
  - name: coverage_threshold
    description: "Minimum coverage percentage"
    required: false
    default: 80

outputs:
  - name: success
    from: ci_passed
  - name: coverage
    from: test_coverage

steps:
  - name: "Run lint"
    uses: builtin:lint-fix
    with:
      fix: false
    outputs:
      success: lint_passed
    when: "{inputs.skip_lint} == false"

  - name: "Set lint default"
    tool: set
    var: lint_passed
    value: "true"
    when: "{inputs.skip_lint} == true"

  - name: "Run tests"
    uses: builtin:run-tests
    with:
      coverage: true
    outputs:
      success: test_passed
      coverage_percent: test_coverage
    when: "{inputs.skip_tests} == false"

  - name: "Set test defaults"
    tool: set
    var: test_passed
    value: "true"
    when: "{inputs.skip_tests} == true"

  - name: "Set coverage default"
    tool: set
    var: test_coverage
    value: "100"
    when: "{inputs.skip_tests} == true"

  - name: "Check coverage threshold"
    tool: bash
    command: |
      if [ "{test_coverage}" -ge "{inputs.coverage_threshold}" ]; then
        echo "true"
      else
        echo "false"
      fi
    output_var: coverage_ok

  - name: "Determine CI result"
    tool: bash
    command: |
      if [ "{lint_passed}" = "true" ] && [ "{test_passed}" = "true" ] && [ "{coverage_ok}" = "true" ]; then
        echo "true"
      else
        echo "false"
      fi
    output_var: ci_passed
```

**Usage in workflow:**

```yaml
type: claude-workflow
version: 2
name: "Deploy Pipeline"

steps:
  - name: "Run CI checks"
    uses: project:ci-check
    with:
      coverage_threshold: 90
    outputs:
      success: ci_passed
      coverage: final_coverage

  - name: "CI failed"
    tool: goto
    target: "Report failure"
    when: "{ci_passed} != true"

  - name: "Deploy"
    tool: bash
    command: "npm run deploy"
    visible: true

  - name: "Done"
    tool: bash
    command: "echo 'Deployed successfully with {final_coverage}% coverage'"

  - name: "Report failure"
    tool: bash
    command: "echo 'CI checks failed'"
    when: "false"
```

### Example 2: Notification Step

Create a Slack notification step at `.claude/workflows/steps/notify-slack/step.yml`:

```yaml
type: claude-step
version: 1
name: "Slack Notification"
description: "Send a message to Slack"

inputs:
  - name: channel
    description: "Slack channel"
    required: true
    schema:
      type: string
      pattern: "^#"
  - name: message
    description: "Message to send"
    required: true
  - name: status
    description: "Status indicator"
    required: false
    default: "info"
    schema:
      type: string
      enum: ["info", "success", "warning", "error"]

outputs:
  - name: sent
    from: was_sent

steps:
  - name: "Prepare payload"
    tool: bash
    command: |
      case "{inputs.status}" in
        success) emoji=":white_check_mark:" ;;
        warning) emoji=":warning:" ;;
        error) emoji=":x:" ;;
        *) emoji=":information_source:" ;;
      esac
      echo "$emoji {inputs.message}"
    output_var: formatted_message

  - name: "Send to Slack"
    tool: bash
    command: |
      curl -X POST "$SLACK_WEBHOOK_URL" \
        -H "Content-Type: application/json" \
        -d "{\"channel\": \"{inputs.channel}\", \"text\": \"{formatted_message}\"}" \
        && echo "true" || echo "false"
    output_var: was_sent
```

**Usage:**

```yaml
- name: "Notify start"
  uses: project:notify-slack
  with:
    channel: "#deployments"
    message: "Starting deployment of v{version}"
    status: info

- name: "Deploy"
  tool: bash
  command: "deploy-app"
  output_var: deploy_result

- name: "Notify success"
  uses: project:notify-slack
  with:
    channel: "#deployments"
    message: "Successfully deployed v{version}"
    status: success
  when: "{deploy_result} is not empty"
```

### Example 3: Using All Builtin Steps

```yaml
type: claude-workflow
version: 2
name: "Full Development Workflow"

steps:
  - name: "Check initial status"
    uses: builtin:git-status
    outputs:
      branch: current_branch
      has_changes: has_changes

  - name: "Fix lint issues"
    uses: builtin:lint-fix
    with:
      fix: true
    outputs:
      success: lint_ok
      fixed_count: files_fixed

  - name: "Run tests"
    uses: builtin:run-tests
    with:
      coverage: true
    outputs:
      success: tests_passed
      coverage_percent: coverage

  - name: "Commit changes"
    uses: builtin:git-commit
    with:
      message: "fix: auto-fix lint issues and update code"
    outputs:
      commit_sha: new_commit
      committed: was_committed
    when: "{files_fixed} > 0"

  - name: "Final status"
    uses: builtin:git-status
    outputs:
      commit_sha: final_sha

  - name: "Report"
    tool: bash
    command: |
      echo "Branch: {current_branch}"
      echo "Lint: {lint_ok} ({files_fixed} files fixed)"
      echo "Tests: {tests_passed} ({coverage}% coverage)"
      echo "Final commit: {final_sha}"
```
