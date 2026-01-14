# Retry Tool

The `retry` tool executes a sequence of nested steps repeatedly until a success condition is met or the maximum number of attempts is reached. It is ideal for handling transient failures, flaky operations, and scenarios where eventual success is expected.

## When to Use Retry

Use the retry tool when:

- **API calls may fail transiently**: Network timeouts, rate limiting, temporary service unavailability
- **Tests are flaky**: Intermittent test failures that often pass on retry
- **Resources may not be immediately available**: Waiting for a service to start, file to appear, or deployment to complete
- **Self-healing workflows**: Combined with Claude to automatically fix issues between attempts

### Retry vs Other Error Handling

| Scenario | Recommended Tool |
|----------|------------------|
| Transient failures that resolve on retry | `retry` |
| Known fix needed between attempts | `retry` with Claude steps |
| Single attempt with fallback | `on_error: continue` on step |
| Loop until condition met (no failure expected) | `while` or `foreach` |
| Critical step that must succeed | `retry` with `on_failure: error` |
| Best-effort operation | `retry` with `on_failure: continue` |

## Configuration Options

| Option | Required | Type | Default | Description |
|--------|----------|------|---------|-------------|
| `max_attempts` | Yes | integer | - | Maximum number of retry attempts (must be positive) |
| `steps` | Yes | array | - | List of steps to execute on each attempt |
| `until` | No | string | - | Success condition expression. When true, loop exits successfully |
| `delay` | No | number | `0` | Seconds to wait between attempts |
| `on_failure` | No | string | `"error"` | Behavior when all attempts fail: `error` or `continue` |

### Required Fields

- **`max_attempts`**: A positive integer specifying the maximum number of attempts before giving up
- **`steps`**: At least one nested step to execute during each attempt

### Optional Fields

#### `until`

A condition expression that determines success. When this condition evaluates to true, the retry loop exits successfully without further attempts.

```yaml
- name: "Wait for service"
  tool: retry
  max_attempts: 10
  until: "{health_status} == healthy"
  delay: 5
  steps:
    - name: "Check health"
      tool: bash
      command: "curl -s http://localhost:8080/health | jq -r '.status'"
      output_var: health_status
```

If no `until` condition is provided, the loop succeeds when all nested steps complete without error.

#### `delay`

Number of seconds to wait between attempts. Useful for giving external systems time to recover.

```yaml
- name: "Retry with backoff"
  tool: retry
  max_attempts: 5
  delay: 10  # Wait 10 seconds between attempts
  steps:
    - name: "Call API"
      tool: bash
      command: "curl -f https://api.example.com/resource"
```

#### `on_failure`

Controls workflow behavior when all retry attempts are exhausted:

- **`error`** (default): Stop the workflow with an error
- **`continue`**: Log a warning and proceed with the next workflow step

```yaml
- name: "Optional sync"
  tool: retry
  max_attempts: 3
  on_failure: continue  # Continue workflow even if sync fails
  steps:
    - name: "Sync data"
      tool: bash
      command: "sync-tool --remote"
```

## Context Variables

The retry tool provides special variables during execution:

| Variable | Description |
|----------|-------------|
| `_attempt` | Current attempt number (1-indexed) |
| `_retry_succeeded` | Set after loop: `"true"` or `"false"` |
| `_retry_attempts` | Set after loop: Total attempts made |

### Using Attempt Number

```yaml
- name: "Retry with attempt info"
  tool: retry
  max_attempts: 3
  until: "{result} == success"
  steps:
    - name: "Log attempt"
      tool: bash
      command: "echo 'Attempt {_attempt} of 3'"

    - name: "Try operation"
      tool: bash
      command: "my-command --attempt={_attempt}"
      output_var: result
```

### Checking Retry Result

```yaml
- name: "Retry operation"
  tool: retry
  max_attempts: 5
  on_failure: continue
  until: "{status} == ok"
  steps:
    - name: "Check status"
      tool: bash
      command: "check-status.sh"
      output_var: status

- name: "Handle result"
  prompt: "The retry {_retry_succeeded == 'true' ? 'succeeded' : 'failed'} after {_retry_attempts} attempts"
```

## Basic Example

```yaml
steps:
  - name: "Run flaky tests"
    tool: retry
    max_attempts: 3
    until: "{test_exit_code} == 0"
    delay: 2
    steps:
      - name: "Execute tests"
        tool: bash
        command: "npm test && echo 0 || echo 1"
        output_var: test_exit_code
```

## Nested Step Features

Nested steps within a retry loop support all standard step features:

- **Conditional execution** with `when`
- **Output capture** with `output_var`
- **Error handling** with `on_error`
- **Loop control** with `break` and `continue`
- **Goto** (within the retry's nested steps only)

### Using Break and Continue

#### Break - Exit Loop Successfully

```yaml
- name: "Find working endpoint"
  tool: retry
  max_attempts: 5
  steps:
    - name: "Try endpoint"
      tool: bash
      command: "curl -sf http://endpoint-{_attempt}.example.com/health"
      output_var: response
      on_error: continue

    - name: "Exit if found"
      tool: break
      when: "{response} is not empty"
```

#### Continue - Skip to Next Attempt

```yaml
- name: "Retry with skip logic"
  tool: retry
  max_attempts: 10
  until: "{build_status} == success"
  steps:
    - name: "Check precondition"
      tool: bash
      command: "check-ready.sh"
      output_var: ready

    - name: "Skip if not ready"
      tool: continue
      when: "{ready} != yes"

    - name: "Run build"
      tool: bash
      command: "build.sh"
      output_var: build_status
```

## Common Patterns

### Pattern 1: API Call with Retry

```yaml
steps:
  - name: "Fetch data with retry"
    tool: retry
    max_attempts: 5
    delay: 2
    until: "{api_response} is not empty"
    steps:
      - name: "Call API"
        tool: bash
        command: "curl -sf https://api.example.com/data"
        output_var: api_response
        on_error: continue

  - name: "Process data"
    prompt: "Process the API response: {api_response}"
```

### Pattern 2: Wait for Service Startup

```yaml
steps:
  - name: "Start service"
    tool: bash
    command: "docker-compose up -d"

  - name: "Wait for healthy"
    tool: retry
    max_attempts: 30
    delay: 2
    until: "{health} == healthy"
    steps:
      - name: "Check health"
        tool: bash
        command: "curl -sf http://localhost:8080/health | jq -r '.status' || echo 'unhealthy'"
        output_var: health
```

### Pattern 3: Self-Healing Test Loop

```yaml
steps:
  - name: "Run tests with auto-fix"
    tool: retry
    max_attempts: 3
    until: "{test_result} == 0"
    delay: 5
    steps:
      - name: "Run tests"
        tool: bash
        command: "npm test; echo $?"
        output_var: test_result

      - name: "Fix failures if needed"
        prompt: "Analyze and fix the test failures. Focus on the root cause."
        when: "{test_result} != 0"
```

### Pattern 4: Deployment with Verification

```yaml
steps:
  - name: "Deploy and verify"
    tool: retry
    max_attempts: 3
    until: "{deploy_verified} == true"
    delay: 30
    steps:
      - name: "Deploy"
        tool: bash
        command: "kubectl apply -f deployment.yaml"

      - name: "Wait for rollout"
        tool: bash
        command: "kubectl rollout status deployment/myapp --timeout=60s && echo 'true' || echo 'false'"
        output_var: deploy_verified

      - name: "Rollback if failed"
        tool: bash
        command: "kubectl rollout undo deployment/myapp"
        when: "{deploy_verified} != true"
```

### Pattern 5: Rate-Limited API Requests

```yaml
steps:
  - name: "API with rate limit handling"
    tool: retry
    max_attempts: 5
    delay: 60  # Wait 1 minute between retries for rate limit reset
    until: "{api_success} == true"
    steps:
      - name: "Make request"
        tool: bash
        command: |
          response=$(curl -sf -w "%{http_code}" https://api.example.com/resource)
          if [ "$response" = "200" ]; then
            echo "true"
          elif [ "$response" = "429" ]; then
            echo "rate_limited"
          else
            echo "false"
          fi
        output_var: api_success
```

### Pattern 6: Conditional Retry with Escalation

```yaml
steps:
  - name: "Retry with escalating fixes"
    tool: retry
    max_attempts: 3
    until: "{build_success} == true"
    steps:
      - name: "Try build"
        tool: bash
        command: "npm run build && echo 'true' || echo 'false'"
        output_var: build_success

      # First retry: just try again
      - name: "Simple retry"
        tool: continue
        when: "{build_success} != true and {_attempt} == 1"

      # Second retry: clean and rebuild
      - name: "Clean build"
        tool: bash
        command: "rm -rf node_modules && npm install"
        when: "{build_success} != true and {_attempt} == 2"

      # Third retry: let Claude fix it
      - name: "AI fix"
        prompt: "The build is failing. Analyze the error and fix the issue."
        when: "{build_success} != true and {_attempt} == 3"
```

### Pattern 7: Graceful Degradation

```yaml
steps:
  - name: "Try primary service"
    tool: retry
    max_attempts: 3
    delay: 5
    on_failure: continue
    until: "{primary_response} is not empty"
    steps:
      - name: "Call primary"
        tool: bash
        command: "curl -sf https://primary.example.com/api"
        output_var: primary_response
        on_error: continue

  - name: "Fallback to secondary"
    tool: bash
    command: "curl -sf https://secondary.example.com/api"
    output_var: fallback_response
    when: "{_retry_succeeded} == false"

  - name: "Process response"
    prompt: "Process: {primary_response}{fallback_response}"
```

## Error Handling Within Retry

### Step-Level Error Handling

Use `on_error` on nested steps to control behavior when individual steps fail:

```yaml
- name: "Retry with error handling"
  tool: retry
  max_attempts: 5
  until: "{final_result} == success"
  steps:
    - name: "Risky operation"
      tool: bash
      command: "risky-command.sh"
      on_error: continue  # Don't fail the attempt, continue to next step

    - name: "Check result"
      tool: bash
      command: "verify-result.sh"
      output_var: final_result
```

### Loop-Level Error Handling

Use `on_failure` on the retry tool to control behavior when all attempts fail:

```yaml
- name: "Best effort sync"
  tool: retry
  max_attempts: 3
  on_failure: continue  # Workflow continues even if all retries fail
  steps:
    - name: "Sync"
      tool: bash
      command: "sync-data.sh"
```

## Output Summary

After completion, the retry tool provides a summary:

**On success:**
```
Succeeded on attempt 2
```

**On failure (with `on_failure: continue`):**
```
Failed after 5 attempts
```

## Tips and Best Practices

### 1. Set Appropriate Timeouts

Combine retry with reasonable delays to avoid overwhelming services:

```yaml
- name: "Respectful retry"
  tool: retry
  max_attempts: 5
  delay: 10  # 10 seconds between attempts
```

### 2. Use Clear Success Conditions

Be explicit about what constitutes success:

```yaml
until: "{exit_code} == 0"           # Exact match
until: "{response} is not empty"     # Non-empty response
until: "{status} contains success"   # Partial match
```

### 3. Avoid Infinite-Like Loops

Set reasonable `max_attempts` limits. For truly long-running waits, consider using larger delays instead of more attempts:

```yaml
# Better: 10 attempts with 30s delay (5 minutes total)
max_attempts: 10
delay: 30

# Worse: 300 attempts with 1s delay (also 5 minutes, but more overhead)
max_attempts: 300
delay: 1
```

### 4. Combine with on_error for Robustness

Use `on_error: continue` on risky nested steps to prevent single step failures from counting as attempt failures:

```yaml
steps:
  - name: "Robust retry"
    tool: retry
    max_attempts: 3
    steps:
      - name: "Primary approach"
        tool: bash
        command: "primary-method.sh"
        on_error: continue

      - name: "Fallback approach"
        tool: bash
        command: "fallback-method.sh"
```

### 5. Log Attempt Information

Use `_attempt` variable to provide context in logs:

```yaml
- name: "Log progress"
  tool: bash
  command: "echo 'Attempt {_attempt}: trying operation...'"
```

### 6. Use delay for External Dependencies

When waiting for external systems, always include a delay:

```yaml
# Good: Gives external system time to stabilize
delay: 5

# Bad: Hammers the service with rapid requests
delay: 0
```
