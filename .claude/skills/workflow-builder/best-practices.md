# Best Practices

Guidelines for creating effective, maintainable, and reliable workflows.

## Workflow Design

### Keep Workflows Focused

**Do:** Create workflows with a single, clear purpose.

```yaml
# Good: Single purpose
name: "Run Tests and Fix Failures"

steps:
  - name: "Run tests"
    tool: bash
    command: "npm test"
```

**Don't:** Create monolithic workflows that do everything.

```yaml
# Bad: Too many responsibilities
name: "Do Everything"

steps:
  - name: "Setup"
  - name: "Lint"
  - name: "Test"
  - name: "Build"
  - name: "Deploy"
  - name: "Notify"
  # ... 50 more steps
```

### Use Descriptive Names

**Do:** Use names that describe what the step accomplishes.

```yaml
- name: "Fetch user data from API"
- name: "Validate email format"
- name: "Create feature branch"
```

**Don't:** Use generic or unclear names.

```yaml
- name: "Step 1"
- name: "Process"
- name: "Do thing"
```

### Plan Variable Flow

**Do:** Plan which variables each step needs and produces.

```yaml
vars:
  project_name: "my-project"  # Static config

steps:
  - name: "Get version"
    tool: bash
    command: "cat package.json | jq -r .version"
    output_var: version  # Dynamic value

  - name: "Build tag"
    tool: set
    var: tag
    value: "{project_name}-v{version}"  # Composed value
```

---

## Tool Selection

### Use the Right Tool

| Need | Tool | Why |
|------|------|-----|
| AI reasoning | `claude` (default) | Complex decisions, code generation |
| Simple shell commands | `bash` | Fast, no AI overhead |
| Setting variables | `set` or `context` | Cleaner than bash echo |
| JSON manipulation | `json` | Safer than jq, no dependency |
| Temp files | `data` | Auto-cleanup, cross-platform |

### Prefer Native Tools Over Bash

**Do:** Use native tools for cleaner, safer operations.

```yaml
# Good: Native JSON tool
- name: "Get version"
  tool: json
  action: query
  file: "package.json"
  query: ".version"
  output_var: version
```

**Don't:** Use bash for everything.

```yaml
# Bad: Fragile bash with jq
- name: "Get version"
  tool: bash
  command: "cat package.json | jq -r .version"
  output_var: version
```

### Choose the Right Model

**Do:** Use model tiers strategically.

```yaml
# Fast tasks: haiku
- name: "Quick format check"
  model: haiku
  prompt: "Is this JSON valid? {data}"

# Most tasks: sonnet (default)
- name: "Implement feature"
  prompt: "Create the login component"

# Complex tasks: opus
- name: "Architecture design"
  model: opus
  prompt: "Design the microservices architecture"
```

---

## Error Handling

### Always Handle Potential Failures

**Do:** Add explicit error handling for risky operations.

```yaml
- name: "Call external API"
  tool: bash
  command: "curl -sf https://api.example.com/data"
  output_var: response
  on_error: continue

- name: "Handle API failure"
  tool: set
  var: response
  value: "{}"
  when: "{response} is empty"
```

### Use Retry for Transient Failures

**Do:** Retry operations that might fail temporarily.

```yaml
- name: "Fetch with retry"
  tool: retry
  max_attempts: 3
  delay: 5
  until: "{response} is not empty"
  steps:
    - name: "Fetch"
      tool: bash
      command: "curl -sf https://api.example.com/data"
      output_var: response
      on_error: continue
```

### Provide Meaningful Error Context

**Do:** Capture and report error details.

```yaml
- name: "Run tests"
  tool: bash
  command: "npm test 2>&1"  # Capture stderr too
  output_var: test_output
  on_error: continue

- name: "Report failure"
  prompt: |
    Tests failed. Analyze this output and suggest fixes:

    {test_output}
  when: "{test_output} contains FAILED"
```

---

## Loops and Iteration

### Set Reasonable Limits

**Do:** Always set max_iterations on while loops.

```yaml
- name: "Poll for status"
  tool: while
  condition: "{status} != ready"
  max_iterations: 60  # Never infinite
  on_max_reached: error
  steps:
    - name: "Check"
      tool: bash
      command: "check-status.sh"
      output_var: status
```

### Include Delays for External Services

**Do:** Add delays when polling external services.

```yaml
- name: "Wait for deployment"
  tool: while
  condition: "{healthy} != true"
  max_iterations: 30
  steps:
    - name: "Check health"
      tool: bash
      command: "curl -sf http://app/health && echo 'true' || echo 'false'"
      output_var: healthy

    - name: "Wait between checks"
      tool: bash
      command: "sleep 10"  # Don't hammer the service
      when: "{healthy} != true"
```

### Use Break for Early Exit

**Do:** Exit loops early when the goal is achieved.

```yaml
- name: "Find first match"
  tool: foreach
  source: items
  item_var: item
  steps:
    - name: "Check {item}"
      tool: bash
      command: "check {item}"
      output_var: found

    - name: "Stop when found"
      tool: break
      when: "{found} == true"
```

---

## Variable Management

### Initialize Variables Before Use

**Do:** Initialize variables with sensible defaults.

```yaml
vars:
  result: "unknown"
  count: "0"

steps:
  - name: "Set initial state"
    tool: context
    action: set
    values:
      status: "pending"
      errors: "[]"
```

### Use Clear Variable Names

**Do:** Use descriptive, consistent naming.

```yaml
# Good: Clear what each holds
output_var: user_email
output_var: test_results
output_var: deploy_status
```

**Don't:** Use ambiguous names.

```yaml
# Bad: Unclear purpose
output_var: x
output_var: temp
output_var: data
```

### Clean Up Sensitive Data

**Do:** Clear sensitive variables after use.

```yaml
- name: "Use API key"
  tool: bash
  command: "curl -H 'Authorization: {api_key}' https://api.example.com"

- name: "Clear credentials"
  tool: context
  action: clear
  vars:
    - api_key
    - auth_token
```

---

## Large Variables

### Automatic Externalization

Large variables (>10,000 characters) are **automatically externalized** to temp files when used in `claude` or `claude_sdk` prompts. You don't need to handle this manually.

**How it works:**
- Variables exceeding 10,000 chars are written to `{temp_dir}/{variable_name}.txt`
- The prompt receives `@/path/to/file.txt` instead of the content
- Claude Code understands `@filepath` syntax and reads the file
- Files are automatically cleaned up when the workflow ends

**Example:**
```yaml
steps:
  - name: "Get large file"
    tool: bash
    command: "cat huge_log.txt"
    output_var: log_content  # Could be 50,000+ chars

  - name: "Analyze logs"
    prompt: |
      Analyze these logs for errors:
      {log_content}

      # Automatically becomes:
      # Analyze these logs for errors:
      # @/path/to/.claude/workflow_temp/session_id/log_content.txt
```

**Nested paths:** Variables like `{result.data.content}` create files named `result_data_content.txt`.

**No action needed:** This happens transparently - just use variables normally and the system handles large content automatically.

---

## Prompts

### Write Clear, Specific Prompts

**Do:** Be explicit about what you want.

```yaml
- name: "Implement login"
  prompt: |
    Create a React login form component with:
    - Email and password fields
    - Client-side validation
    - Error message display
    - Submit button with loading state

    Use TypeScript and follow the existing component patterns.
```

**Don't:** Be vague.

```yaml
- name: "Make login"
  prompt: "Create a login form"
```

### Include Context in Prompts

**Do:** Provide relevant context from previous steps.

```yaml
- name: "Fix issue"
  prompt: |
    Fix this bug:

    **Error message:**
    {error_message}

    **Stack trace:**
    {stack_trace}

    **Relevant code:**
    {code_snippet}
```

### Use Multi-line Prompts for Complex Tasks

**Do:** Use YAML block scalar for readability.

```yaml
- name: "Complex implementation"
  prompt: |
    Implement the following feature:

    ## Requirements
    - User authentication
    - Session management
    - Password reset

    ## Constraints
    - Must use existing auth library
    - Follow security best practices

    ## Expected deliverables
    - Implementation code
    - Unit tests
    - Updated documentation
```

---

## Shared Steps

### Extract Reusable Patterns

**Do:** Create shared steps for repeated operations.

```yaml
# .claude/workflows/steps/commit-with-lint/step.yml
type: claude-step
version: 1
name: "Lint and Commit"

inputs:
  - name: message
    required: true

steps:
  - name: "Lint"
    uses: builtin:lint-fix
    with:
      fix: true

  - name: "Commit"
    uses: builtin:git-commit
    with:
      message: "{inputs.message}"
```

### Document Shared Steps

**Do:** Add descriptions to inputs and outputs.

```yaml
inputs:
  - name: environment
    description: "Target environment: staging or production"
    required: true
    schema:
      type: string
      enum: ["staging", "production"]

outputs:
  - name: url
    description: "URL of the deployed application"
```

---

## Performance

### Use Appropriate Models

**Do:** Use haiku for simple, fast tasks.

```yaml
- name: "Validate JSON"
  model: haiku  # Fast and cheap
  prompt: "Validate this JSON syntax: {data}"
```

### Minimize API Calls

**Do:** Batch operations when possible.

```yaml
# Good: Set multiple variables at once
- name: "Initialize"
  tool: context
  action: set
  values:
    var1: "value1"
    var2: "value2"
    var3: "value3"
```

**Don't:** Make many small calls.

```yaml
# Bad: Three separate steps
- name: "Set var1"
  tool: set
  var: var1
  value: "value1"

- name: "Set var2"
  tool: set
  var: var2
  value: "value2"

- name: "Set var3"
  tool: set
  var: var3
  value: "value3"
```

---

## Security

### Never Hardcode Secrets

**Do:** Use environment variables for secrets.

```yaml
- name: "Call API"
  tool: bash
  command: "curl -H 'Authorization: Bearer $API_TOKEN' https://api.example.com"
```

**Don't:** Put secrets in workflow files.

```yaml
# NEVER DO THIS
- name: "Call API"
  tool: bash
  command: "curl -H 'Authorization: Bearer sk-abc123' https://api.example.com"
```

### Use Allowed Tools for Sensitive Workflows

**Do:** Restrict tools when appropriate.

```yaml
claude:
  allowed_tools:
    - "Read"       # Can read files
    - "Grep"       # Can search
    - "Glob"       # Can find files
    # No Write, Edit, or Bash - read-only workflow
```

### Be Careful with dangerously_skip_permissions

**Do:** Only use in controlled environments.

```yaml
claude:
  dangerously_skip_permissions: true  # Only in sandboxed CI/CD
```

---

## Testing and Debugging

### Use Context Export for Debugging

**Do:** Export context state at key points.

```yaml
- name: "Debug checkpoint"
  tool: context
  action: export
  file: "/tmp/workflow-debug-{_step_name}.json"
```

### Test Workflows Incrementally

**Do:** Test small sections before combining.

```yaml
# First test just the fetch
- name: "Test fetch"
  tool: bash
  command: "curl -s https://api.example.com/data"
  output_var: data

- name: "Verify"
  tool: bash
  command: "echo 'Got: {data}'"
  visible: true
```

### Add Visible Output for Monitoring

**Do:** Show progress for long workflows.

```yaml
- name: "Report progress"
  tool: bash
  command: |
    echo "=== Step {_step_num} Complete ==="
    echo "Status: {status}"
    echo "Processed: {count} items"
  visible: true
```

---

## Common Anti-Patterns

### Anti-Pattern: Deeply Nested Conditions

**Bad:**
```yaml
- name: "Check A"
  when: "{a} == true"
  ...

- name: "Check A and B"
  when: "{a} == true and {b} == true"
  ...

- name: "Check A and B and C"
  when: "{a} == true and {b} == true and {c} == true"
```

**Good:** Use goto for complex branching.

### Anti-Pattern: Ignoring All Errors

**Bad:**
```yaml
# Every step ignores errors
- name: "Step 1"
  on_error: continue
- name: "Step 2"
  on_error: continue
- name: "Step 3"
  on_error: continue
```

**Good:** Only ignore errors intentionally, with handling.

### Anti-Pattern: Hardcoded Values

**Bad:**
```yaml
- name: "Deploy"
  tool: bash
  command: "deploy --env production --version 1.2.3"
```

**Good:** Use variables loaded from configuration.

```yaml
vars:
  environment: "staging"  # Defaults
  version: "1.0.0"

steps:
  # Load from config file if exists
  - name: "Load config"
    tool: bash
    command: "test -f .claude/workflows.config.json && cat .claude/workflows.config.json || echo '{}'"
    output_var: config_json

  - name: "Get environment"
    tool: json
    action: query
    source: config_json
    query: ".environment // empty"
    output_var: env_override
    on_error: continue

  - name: "Apply environment"
    tool: set
    var: environment
    value: "{env_override}"
    when: "{env_override} is not empty"

  - name: "Deploy"
    tool: bash
    command: "deploy --env {environment} --version {version}"
```

---

## Checklist

Before finalizing a workflow:

- [ ] Workflow has a clear, single purpose
- [ ] All steps have descriptive names
- [ ] Variables are initialized before use
- [ ] Error handling is in place for risky operations
- [ ] Loops have reasonable max_iterations
- [ ] External service calls have delays
- [ ] Prompts are specific and include context
- [ ] Secrets use environment variables
- [ ] Reusable logic is in shared steps
- [ ] Debugging output is available (visible: true)
