# Shared Steps Guide

Shared steps are reusable workflow components that encapsulate common patterns. They allow you to define a sequence of steps once and use them across multiple workflows.

## When to Create Shared Steps

Create a shared step when you find yourself:

1. **Repeating the same steps** across multiple workflows
2. **Encapsulating complex logic** that should be reusable
3. **Standardizing operations** across your team
4. **Creating testable units** of workflow logic

## Shared Step Structure

Create shared steps in the `.claude/workflows/steps/` directory:

```
project/
  .claude/
    workflows/
      steps/
        my-step/
          step.yml    # Required
        deploy/
          step.yml
```

### Basic Structure

```yaml
type: claude-step
version: 1
name: "Step Name"
description: "What this step does"

inputs:
  - name: param1
    description: "First parameter"
    required: true
  - name: param2
    description: "Second parameter"
    required: false
    default: "default_value"

outputs:
  - name: result
    description: "Step result"
    from: internal_result_var

steps:
  - name: "Do something"
    tool: bash
    command: "echo {inputs.param1}"
    output_var: internal_result_var
```

## Using Shared Steps

### Resolution Strategies

Three ways to reference shared steps:

| Prefix | Location | Example |
|--------|----------|---------|
| `builtin:` | Package built-ins | `uses: builtin:git-commit` |
| `project:` | Project `.claude/workflows/steps/` | `uses: project:my-step` |
| `path:` | Relative to workflow file | `uses: path:./local-steps/my-step` |

### Basic Usage

```yaml
steps:
  - name: "Commit changes"
    uses: builtin:git-commit
    with:
      message: "feat: add new feature"
```

### Passing Inputs

Use the `with` field:

```yaml
- name: "Deploy"
  uses: project:deploy
  with:
    environment: "production"
    version: "{app_version}"  # Interpolation supported
```

### Capturing Outputs

Use the `outputs` field to map shared step outputs to workflow variables:

```yaml
- name: "Run tests"
  uses: builtin:run-tests
  with:
    coverage: true
  outputs:
    success: tests_passed       # Map 'success' output to 'tests_passed' variable
    coverage_percent: coverage  # Map 'coverage_percent' to 'coverage' variable

- name: "Check result"
  prompt: "Tests {tests_passed}, coverage: {coverage}%"
```

## Builtin Shared Steps

### git-status

Get repository status.

```yaml
- name: "Check repo"
  uses: builtin:git-status
  outputs:
    branch: current_branch
    has_changes: needs_commit
    staged_count: files_staged
    commit_sha: current_sha
```

**Outputs:**
- `branch` - Current branch name
- `has_changes` - `"true"` or `"false"`
- `staged_count` - Number of staged files
- `modified_count` - Number of modified files
- `untracked_count` - Number of untracked files
- `commit_sha` - Current commit SHA (short)

### git-commit

Stage and commit changes.

```yaml
- name: "Commit"
  uses: builtin:git-commit
  with:
    message: "fix: resolve bug"  # Required
    add_all: true                # Optional, default: true
    allow_empty: false           # Optional, default: false
  outputs:
    commit_sha: new_sha
    committed: was_committed
```

**Inputs:**
- `message` (required) - Commit message
- `add_all` - Stage all changes (default: true)
- `allow_empty` - Allow empty commits (default: false)

**Outputs:**
- `commit_sha` - SHA of new commit
- `committed` - `"true"` or `"false"`

### lint-fix

Run linter with auto-fix.

```yaml
- name: "Fix lint"
  uses: builtin:lint-fix
  with:
    language: "auto"      # auto, javascript, typescript, python, rust, go
    fix: true             # Auto-fix issues
    path: "./src"         # Path to lint
  outputs:
    success: lint_passed
    fixed_count: files_fixed
    output: lint_output
```

**Linters used:**
- JavaScript/TypeScript: ESLint
- Python: Ruff
- Rust: Clippy
- Go: golangci-lint

### run-tests

Run test suite.

```yaml
- name: "Run tests"
  uses: builtin:run-tests
  with:
    language: "auto"      # auto, javascript, typescript, python, rust, go
    coverage: true        # Generate coverage report
    test_path: ""         # Specific test path
  outputs:
    success: tests_passed
    coverage_percent: coverage
    output: test_output
```

**Test frameworks:**
- JavaScript/TypeScript: npm test (Jest, Vitest, etc.)
- Python: pytest
- Rust: cargo test
- Go: go test

## Creating Custom Shared Steps

### Step 1: Create Directory

```bash
mkdir -p .claude/workflows/steps/my-step
```

### Step 2: Define step.yml

```yaml
type: claude-step
version: 1
name: "My Custom Step"
description: "What this step does"

inputs:
  - name: target
    description: "Target to process"
    required: true

  - name: verbose
    description: "Enable verbose output"
    required: false
    default: false
    schema:
      type: boolean

outputs:
  - name: result
    description: "Processing result"
    from: process_output

  - name: success
    description: "Whether processing succeeded"
    from: process_success

steps:
  - name: "Process target"
    tool: bash
    command: |
      if [ "{inputs.verbose}" = "true" ]; then
        echo "Processing {inputs.target} verbosely"
      else
        echo "Processing {inputs.target}"
      fi
    output_var: process_output

  - name: "Check result"
    tool: bash
    command: |
      if [ -n "{process_output}" ]; then
        echo "true"
      else
        echo "false"
      fi
    output_var: process_success
```

### Step 3: Use in Workflow

```yaml
- name: "Use custom step"
  uses: project:my-step
  with:
    target: "my-target"
    verbose: true
  outputs:
    result: step_result
    success: step_success
```

## Input Definition Options

### Simple Format

```yaml
inputs:
  - param1  # Required, no default
  - param2
```

### Detailed Format

```yaml
inputs:
  - name: environment
    description: "Deployment environment"
    required: true
    schema:
      type: string
      enum: ["dev", "staging", "prod"]

  - name: timeout
    description: "Timeout in seconds"
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

### JSON Schema Validation

Supported schema types:
- `string` - With optional `pattern`, `enum`, `minLength`, `maxLength`
- `integer` / `number` - With optional `minimum`, `maximum`
- `boolean`
- `object` - With optional `properties`, `required`, `additionalProperties`
- `array` - With optional `items`, `minItems`, `maxItems`

## Output Definition Options

### Simple Format

```yaml
outputs:
  - result  # Output name matches internal variable
```

### Detailed Format

```yaml
outputs:
  - name: result
    description: "The result of the operation"
    from: internal_variable_name  # Map from different internal name
```

## Accessing Inputs in Steps

Use `{inputs.name}` syntax:

```yaml
steps:
  - name: "Use inputs"
    tool: bash
    command: "deploy --env {inputs.environment} --timeout {inputs.timeout}"
```

## Advanced Features

### Nested Shared Steps

Shared steps can use other shared steps:

```yaml
type: claude-step
version: 1
name: "Full Deploy"

steps:
  - name: "Run tests first"
    uses: builtin:run-tests
    outputs:
      success: tests_ok

  - name: "Check tests"
    tool: break
    when: "{tests_ok} != true"

  - name: "Lint code"
    uses: builtin:lint-fix
    with:
      fix: false

  - name: "Deploy"
    tool: bash
    command: "deploy --env {inputs.environment}"
```

**Note:** Maximum nesting depth is 10 levels.

### Shared Steps in Loops

```yaml
- name: "Process files"
  tool: foreach
  source: files
  item_var: file
  steps:
    - name: "Lint {file}"
      uses: builtin:lint-fix
      with:
        path: "{file}"
        fix: true
      outputs:
        success: lint_result
```

### Conditional Execution

```yaml
- name: "Optional lint"
  uses: builtin:lint-fix
  with:
    fix: true
  when: "{run_lint} == true"
```

### Error Handling

```yaml
- name: "Optional step"
  uses: project:risky-operation
  on_error: continue  # Continue workflow if step fails
```

## Common Patterns

### CI Check Step

```yaml
type: claude-step
version: 1
name: "CI Check"

inputs:
  - name: coverage_threshold
    default: 80

outputs:
  - name: success
    from: ci_passed
  - name: coverage
    from: test_coverage

steps:
  - name: "Lint"
    uses: builtin:lint-fix
    with:
      fix: false
    outputs:
      success: lint_ok

  - name: "Test"
    uses: builtin:run-tests
    with:
      coverage: true
    outputs:
      success: test_ok
      coverage_percent: test_coverage

  - name: "Check threshold"
    tool: bash
    command: |
      if [ "{test_coverage}" -ge "{inputs.coverage_threshold}" ]; then
        echo "true"
      else
        echo "false"
      fi
    output_var: coverage_ok

  - name: "Final result"
    tool: bash
    command: |
      if [ "{lint_ok}" = "true" ] && [ "{test_ok}" = "true" ] && [ "{coverage_ok}" = "true" ]; then
        echo "true"
      else
        echo "false"
      fi
    output_var: ci_passed
```

### Notification Step

```yaml
type: claude-step
version: 1
name: "Slack Notify"

inputs:
  - name: channel
    required: true
  - name: message
    required: true
  - name: status
    default: "info"

outputs:
  - name: sent
    from: was_sent

steps:
  - name: "Send"
    tool: bash
    command: |
      curl -X POST "$SLACK_WEBHOOK_URL" \
        -H "Content-Type: application/json" \
        -d '{"channel": "{inputs.channel}", "text": "{inputs.message}"}' \
        && echo "true" || echo "false"
    output_var: was_sent
```

### Deploy Step

```yaml
type: claude-step
version: 1
name: "Deploy"

inputs:
  - name: environment
    required: true
    schema:
      type: string
      enum: ["staging", "production"]
  - name: version
    required: true

outputs:
  - name: url
    from: deploy_url
  - name: success
    from: deploy_success

steps:
  - name: "Deploy"
    tool: bash
    command: "deploy --env {inputs.environment} --version {inputs.version}"
    output_var: deploy_output

  - name: "Get URL"
    tool: bash
    command: "get-deploy-url {inputs.environment}"
    output_var: deploy_url

  - name: "Check"
    tool: bash
    command: |
      curl -sf "{deploy_url}/health" && echo "true" || echo "false"
    output_var: deploy_success
```

## Error Types

| Error | Cause |
|-------|-------|
| `SharedStepNotFoundError` | Step not found at specified location |
| `SharedStepParseError` | Invalid step.yml format |
| `RequiredInputMissingError` | Required input not provided |
| `InputSchemaValidationError` | Input value failed schema validation |
| `CircularDependencyError` | Circular reference in nested steps |
| `MaxDepthExceededError` | Nesting depth > 10 levels |
| `SharedStepExecutionError` | Internal step failed |

## Best Practices

1. **Use descriptive names** for inputs and outputs
2. **Add descriptions** to help users understand usage
3. **Set sensible defaults** for optional inputs
4. **Use JSON schemas** to validate complex inputs
5. **Keep steps focused** - one purpose per shared step
6. **Document** what the step does and its requirements
7. **Handle errors gracefully** within the step
8. **Test shared steps** independently before using in workflows
