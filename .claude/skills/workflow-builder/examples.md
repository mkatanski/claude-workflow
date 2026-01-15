# Workflow Examples

Real-world workflow templates and patterns for common development tasks.

## Quick Templates

### Minimal Workflow

```yaml
type: claude-workflow
version: 2
name: "Minimal Example"

steps:
  - name: "Do task"
    prompt: "Complete the requested task"
```

### With Variables

```yaml
type: claude-workflow
version: 2
name: "With Variables"

vars:
  default_branch: "main"

steps:
  - name: "Get branch"
    tool: bash
    command: "git branch --show-current"
    output_var: current_branch

  - name: "Work on branch"
    prompt: "You're on branch {current_branch}"
```

### With Configuration File

```yaml
type: claude-workflow
version: 2
name: "With Config"

vars:
  # Defaults - can be overridden via config file
  feature_name: "new-feature"
  branch_prefix: "feature"

steps:
  # Load config if exists
  - name: "Check config"
    tool: bash
    command: "test -f .claude/workflows.config.json && cat .claude/workflows.config.json || echo '{}'"
    output_var: config_json

  - name: "Load feature_name"
    tool: json
    action: query
    source: config_json
    query: "feature_name"  # JMESPath syntax (no leading dot)
    output_var: feature_name_override
    on_error: continue

  - name: "Apply override"
    tool: set
    var: feature_name
    value: "{feature_name_override}"
    when: "{feature_name_override} is not empty"

  - name: "Create branch"
    tool: bash
    command: "git checkout -b {branch_prefix}/{feature_name}"
```

---

## Feature Development

### Complete Feature Workflow

```yaml
type: claude-workflow
version: 2
name: "Feature Development"
description: |
  End-to-end feature implementation from Linear issue.

  USAGE: Create .claude/workflows.config.json with:
  { "issue_id": "ENG-123" }

vars:
  issue_id: ""  # Required - set via config file

claude:
  model: sonnet
  dangerously_skip_permissions: true

steps:
  # Load issue_id from config
  - name: "Load config"
    tool: bash
    command: "cat .claude/workflows.config.json"
    output_var: config_json

  - name: "Get issue_id"
    tool: json
    action: query
    source: config_json
    query: "issue_id"  # JMESPath syntax
    output_var: issue_id

  # Fetch issue details
  - name: "Get issue"
    tool: linear_tasks
    action: get
    issue_id: "{issue_id}"
    output_var: issue

  # Mark in progress
  - name: "Start work"
    tool: linear_manage
    action: update
    issue_id: "{issue_id}"
    status: "In Progress"

  # Create feature branch
  - name: "Create branch"
    tool: bash
    command: "git checkout -b feature/{issue_id}"

  # Implement the feature
  - name: "Implement feature"
    model: opus
    prompt: |
      Implement the following feature:

      **Title:** {issue.title}
      **Description:** {issue.description}

      Requirements:
      - Follow existing code patterns
      - Add appropriate tests
      - Update documentation if needed

  # Run tests with retry
  - name: "Run tests"
    tool: retry
    max_attempts: 3
    until: "{test_result} == passed"
    delay: 5
    steps:
      - name: "Execute tests"
        tool: bash
        command: "npm test && echo 'passed' || echo 'failed'"
        output_var: test_result

      - name: "Fix if failed"
        prompt: "Fix the failing tests"
        when: "{test_result} == failed"

  # Lint and format
  - name: "Lint code"
    uses: builtin:lint-fix
    with:
      fix: true

  # Commit changes
  - name: "Commit"
    uses: builtin:git-commit
    with:
      message: "{issue_id}: {issue.title}"
    outputs:
      commit_sha: commit

  # Add completion comment
  - name: "Comment"
    tool: linear_manage
    action: comment
    issue_id: "{issue_id}"
    body: |
      Implementation complete.

      - Commit: {commit}
      - Tests: Passing
      - Ready for review

  # Mark ready for review
  - name: "Ready for review"
    tool: linear_manage
    action: update
    issue_id: "{issue_id}"
    status: "In Review"
```

---

## Bug Fixing

### Bug Fix with Investigation

```yaml
type: claude-workflow
version: 2
name: "Bug Investigation and Fix"
description: |
  USAGE: Create .claude/workflows.config.json with:
  { "bug_description": "Description of the bug to fix" }

vars:
  bug_description: ""  # Required - set via config file

claude:
  model: sonnet
  dangerously_skip_permissions: true

steps:
  # Load bug description from config
  - name: "Load config"
    tool: bash
    command: "cat .claude/workflows.config.json"
    output_var: config_json

  - name: "Get bug_description"
    tool: json
    action: query
    source: config_json
    query: "bug_description"  # JMESPath syntax
    output_var: bug_description

  # Investigate
  - name: "Investigate"
    model: opus
    prompt: |
      Investigate this bug:

      {bug_description}

      1. Search the codebase for related code
      2. Identify the root cause
      3. Propose a fix

      Output a summary of findings and proposed solution.
    output_var: investigation

  # Implement fix
  - name: "Implement fix"
    prompt: |
      Based on this investigation:

      {investigation}

      Implement the fix. Make minimal, targeted changes.

  # Test the fix
  - name: "Test fix"
    tool: retry
    max_attempts: 3
    until: "{test_status} == 0"
    delay: 3
    steps:
      - name: "Run tests"
        tool: bash
        command: "npm test; echo $?"
        output_var: test_status

      - name: "Fix test failures"
        prompt: "Fix the test failures related to your changes"
        when: "{test_status} != 0"

  # Create commit
  - name: "Commit fix"
    uses: builtin:git-commit
    with:
      message: "fix: {bug_description}"
```

---

## Code Review

### Automated Code Review

```yaml
type: claude-workflow
version: 2
name: "Code Review"

vars:
  base_branch: "main"  # Default, can be overridden via config

claude:
  model: opus
  dangerously_skip_permissions: true
  allowed_tools:
    - "Read"
    - "Grep"
    - "Glob"

steps:
  # Load base_branch from config if exists
  - name: "Check config"
    tool: bash
    command: "test -f .claude/workflows.config.json && cat .claude/workflows.config.json || echo '{}'"
    output_var: config_json

  - name: "Load base_branch"
    tool: json
    action: query
    source: config_json
    query: "base_branch"  # JMESPath syntax
    output_var: base_branch_override
    on_error: continue

  - name: "Apply override"
    tool: set
    var: base_branch
    value: "{base_branch_override}"
    when: "{base_branch_override} is not empty"

  # Get changes
  - name: "Get diff"
    tool: bash
    command: "git diff {base_branch}...HEAD"
    output_var: diff

  # Get changed files
  - name: "Get files"
    tool: bash
    command: "git diff --name-only {base_branch}...HEAD"
    output_var: changed_files

  # Comprehensive review
  - name: "Review code"
    prompt: |
      Review these code changes:

      **Changed files:**
      {changed_files}

      **Diff:**
      {diff}

      Analyze for:
      1. **Bugs** - Logic errors, edge cases, null checks
      2. **Security** - Injection, XSS, sensitive data exposure
      3. **Performance** - N+1 queries, unnecessary loops, memory leaks
      4. **Style** - Naming, structure, readability
      5. **Tests** - Coverage, edge cases, assertions

      Format as actionable feedback.
    output_var: review

  # Save review
  - name: "Save review"
    tool: data
    content: |
      # Code Review

      {review}
    format: markdown
    filename: "code-review.md"
    output_var: review_file

  - name: "Report"
    tool: bash
    command: "echo 'Review saved to {review_file}'"
```

---

## CI/CD Workflows

### Full CI Pipeline

```yaml
type: claude-workflow
version: 2
name: "CI Pipeline"

vars:
  coverage_threshold: "80"

claude:
  dangerously_skip_permissions: true

steps:
  # Check repo status
  - name: "Check status"
    uses: builtin:git-status
    outputs:
      branch: branch
      has_changes: has_changes

  # Lint
  - name: "Lint"
    uses: builtin:lint-fix
    with:
      fix: false
    outputs:
      success: lint_passed
      output: lint_output

  - name: "Lint failed"
    tool: goto
    target: "Report failure"
    when: "{lint_passed} != true"

  # Test with coverage
  - name: "Test"
    uses: builtin:run-tests
    with:
      coverage: true
    outputs:
      success: tests_passed
      coverage_percent: coverage
      output: test_output

  - name: "Tests failed"
    tool: goto
    target: "Report failure"
    when: "{tests_passed} != true"

  # Check coverage threshold
  - name: "Check coverage"
    tool: bash
    command: |
      if [ "{coverage}" -ge "{coverage_threshold}" ]; then
        echo "pass"
      else
        echo "fail"
      fi
    output_var: coverage_check

  - name: "Coverage too low"
    tool: goto
    target: "Report failure"
    when: "{coverage_check} == fail"

  # Build
  - name: "Build"
    tool: bash
    command: "npm run build"
    output_var: build_output
    on_error: continue

  - name: "Build failed"
    tool: goto
    target: "Report failure"
    when: "{build_output} contains error"

  # Success
  - name: "CI Passed"
    tool: set
    var: ci_result
    value: "passed"

  - name: "Report success"
    tool: bash
    command: |
      echo "CI Pipeline Passed"
      echo "Branch: {branch}"
      echo "Coverage: {coverage}%"
    visible: true

  - name: "Done"
    tool: goto
    target: "End"

  # Failure handling
  - name: "Report failure"
    tool: set
    var: ci_result
    value: "failed"
    when: "false"  # Only reached via goto

  - name: "Show failure"
    tool: bash
    command: |
      echo "CI Pipeline Failed"
      echo "Lint: {lint_passed}"
      echo "Tests: {tests_passed}"
      echo "Coverage: {coverage}%"
    visible: true

  - name: "End"
    tool: bash
    command: "echo 'Pipeline complete: {ci_result}'"
```

### Deployment Workflow

```yaml
type: claude-workflow
version: 2
name: "Deploy to Environment"
description: |
  USAGE: Create .claude/workflows.config.json with:
  { "environment": "staging", "version": "1.0.0" }

vars:
  environment: ""  # Required - set via config
  version: ""      # Required - set via config
  max_health_checks: "30"

claude:
  dangerously_skip_permissions: true

steps:
  # Load config
  - name: "Load config"
    tool: bash
    command: "cat .claude/workflows.config.json"
    output_var: config_json

  - name: "Get environment"
    tool: json
    action: query
    source: config_json
    query: "environment"  # JMESPath syntax
    output_var: environment

  - name: "Get version"
    tool: json
    action: query
    source: config_json
    query: "version"  # JMESPath syntax
    output_var: version

  # Pre-deploy checks
  - name: "Pre-deploy"
    tool: bash
    command: |
      if [ "{environment}" = "production" ]; then
        echo "Deploying to PRODUCTION - extra caution"
      fi
    visible: true

  # Build
  - name: "Build"
    tool: bash
    command: "npm run build"

  # Deploy
  - name: "Deploy"
    tool: bash
    command: "deploy --env {environment} --version {version}"
    output_var: deploy_output

  # Wait for healthy
  - name: "Init health status"
    tool: set
    var: healthy
    value: "false"

  - name: "Wait for healthy"
    tool: while
    condition: "{healthy} != true"
    max_iterations: 30
    on_max_reached: error
    steps:
      - name: "Check health"
        tool: bash
        command: |
          curl -sf "https://{environment}.example.com/health" && echo "true" || echo "false"
        output_var: healthy

      - name: "Wait"
        tool: bash
        command: "sleep 10"
        when: "{healthy} != true"

  # Verify deployment
  - name: "Verify"
    tool: bash
    command: "curl -s 'https://{environment}.example.com/version'"
    output_var: deployed_version

  - name: "Check version"
    tool: bash
    command: |
      if [ "{deployed_version}" = "{version}" ]; then
        echo "Deployment verified: {version}"
      else
        echo "Version mismatch! Expected {version}, got {deployed_version}"
        exit 1
      fi
    visible: true
```

---

## Batch Processing

### Process Multiple Files

```yaml
type: claude-workflow
version: 2
name: "Process Files"

vars:
  processed_count: "0"
  failed_count: "0"

claude:
  dangerously_skip_permissions: true

steps:
  # Get files
  - name: "Find files"
    tool: bash
    command: "find src -name '*.ts' -type f | head -20"
    output_var: files

  # Process each file
  - name: "Process files"
    tool: foreach
    source: files
    item_var: file
    index_var: idx
    on_item_error: continue
    steps:
      - name: "Analyze {file}"
        prompt: |
          Analyze {file}:
          1. Check for code smells
          2. Suggest improvements
          3. Note any security issues

          Be concise.
        output_var: analysis

      - name: "Increment processed"
        tool: bash
        command: "echo $(( {processed_count} + 1 ))"
        output_var: processed_count

  # Summary
  - name: "Summary"
    tool: bash
    command: |
      echo "Processed {processed_count} files"
    visible: true
```

### Process Linear Tasks in Batch

```yaml
type: claude-workflow
version: 2
name: "Process Linear Backlog"

vars:
  max_tasks: "5"
  completed: "0"

claude:
  dangerously_skip_permissions: true

steps:
  - name: "Process tasks"
    tool: range
    from: 1
    to: 5
    var: task_num
    steps:
      # Get next task
      - name: "Get task {task_num}"
        tool: linear_tasks
        action: get_next
        team: ENG
        status: "Todo"
        priority: 3
        output_var: issue_id

      # Stop if no more tasks
      - name: "Check for tasks"
        tool: break
        when: "{issue_id} is empty"

      # Get details
      - name: "Get details"
        tool: linear_tasks
        action: get
        issue_id: "{issue_id}"
        output_var: issue

      # Assign
      - name: "Assign"
        tool: linear_manage
        action: update
        issue_id: "{issue_id}"
        status: "In Progress"

      # Implement
      - name: "Implement {issue_id}"
        prompt: |
          Implement: {issue.title}

          {issue.description}
        output_var: implementation

      # Mark done
      - name: "Complete {issue_id}"
        tool: linear_manage
        action: update
        issue_id: "{issue_id}"
        status: "Done"

      # Count
      - name: "Increment"
        tool: bash
        command: "echo $(( {completed} + 1 ))"
        output_var: completed

  - name: "Report"
    tool: bash
    command: "echo 'Completed {completed} tasks'"
    visible: true
```

---

## Data Processing

The `json` tool uses [JMESPath](https://jmespath.org/) query syntax and supports both JSON and YAML files.
See the [JMESPath Tutorial](https://jmespath.org/tutorial.html) for query syntax.

### JSON Configuration Management

```yaml
type: claude-workflow
version: 2
name: "Update Configs"
description: |
  USAGE: Create .claude/workflows.config.json with:
  { "new_version": "2.0.0" }

vars:
  new_version: ""  # Required - set via config

steps:
  # Load new_version from config
  - name: "Load config"
    tool: bash
    command: "cat .claude/workflows.config.json"
    output_var: config_json

  - name: "Get new_version"
    tool: json
    action: query
    source: config_json
    query: "new_version"  # JMESPath syntax
    output_var: new_version

  # Update package.json
  - name: "Update version"
    tool: json
    action: set
    file: "package.json"
    path: ".version"
    value: "{new_version}"

  # Add build metadata
  - name: "Get timestamp"
    tool: bash
    command: "date -u +%Y-%m-%dT%H:%M:%SZ"
    output_var: timestamp

  - name: "Get commit"
    tool: bash
    command: "git rev-parse --short HEAD"
    output_var: commit

  - name: "Add build info"
    tool: json
    action: update
    file: "package.json"
    path: ".build"
    operation: merge
    value:
      timestamp: "{timestamp}"
      commit: "{commit}"
      version: "{new_version}"

  # Verify
  - name: "Verify"
    tool: json
    action: query
    file: "package.json"
    query: "version"  # JMESPath syntax
    output_var: verified_version

  - name: "Check"
    tool: bash
    command: |
      if [ "{verified_version}" = "{new_version}" ]; then
        echo "Version updated to {new_version}"
      else
        echo "Update failed!"
        exit 1
      fi
    visible: true
```

### API Data Processing

```yaml
type: claude-workflow
version: 2
name: "Process API Data"

vars:
  api_url: "https://api.example.com"
  processed_items: "0"

steps:
  # Initialize pagination
  - name: "Init"
    tool: context
    action: set
    values:
      page: "1"
      has_more: "true"
      all_items: "[]"

  # Fetch all pages
  - name: "Fetch pages"
    tool: while
    condition: "{has_more} == true"
    max_iterations: 100
    steps:
      - name: "Fetch page {page}"
        tool: bash
        command: "curl -s '{api_url}/items?page={page}&limit=50'"
        output_var: response

      - name: "Extract items"
        tool: json
        action: query
        source: response
        query: "data"  # JMESPath syntax
        output_var: items

      - name: "Check for more"
        tool: json
        action: query
        source: response
        query: "has_next"  # JMESPath syntax
        output_var: has_more

      - name: "Increment page"
        tool: bash
        command: "echo $(( {page} + 1 ))"
        output_var: page

      - name: "Process items"
        prompt: "Process these items: {items}"

  - name: "Done"
    tool: bash
    command: "echo 'Processed all pages'"
```

---

## Patterns Reference

### Error Recovery Pattern

```yaml
- name: "Risky operation"
  tool: bash
  command: "risky-command"
  output_var: result
  on_error: continue

- name: "Handle error"
  prompt: "The operation failed. Analyze and fix the issue."
  when: "{result} is empty"

- name: "Retry"
  tool: bash
  command: "risky-command"
  when: "{result} is empty"
```

### Approval Gate Pattern

```yaml
- name: "Prepare changes"
  prompt: "Prepare the changes but don't commit yet"
  output_var: changes

- name: "Show changes"
  tool: bash
  command: "git diff"
  visible: true

- name: "Get approval"
  prompt: |
    Review the changes above.
    If they look correct, respond with "APPROVED".
    Otherwise, explain what needs to change.
  output_var: approval

- name: "Commit if approved"
  uses: builtin:git-commit
  with:
    message: "Apply reviewed changes"
  when: "{approval} contains APPROVED"
```

### Parallel-ish Processing Pattern

```yaml
# Gather all info first
- name: "Get file list"
  tool: bash
  command: "ls *.ts"
  output_var: files

# Process in loop
- name: "Process"
  tool: foreach
  source: files
  item_var: file
  steps:
    - name: "Quick analysis of {file}"
      model: haiku  # Fast model for simple tasks
      prompt: "Quick review of {file}"
```

### Checkpoint Pattern

```yaml
- name: "Checkpoint 1"
  tool: context
  action: export
  file: "/tmp/workflow-checkpoint-1.json"

# ... risky operations ...

- name: "Checkpoint 2"
  tool: context
  action: export
  file: "/tmp/workflow-checkpoint-2.json"
```
