# Linear Manage Tool

The `linear_manage` tool creates, updates, and manages Linear issues during workflow execution. It enables automated issue lifecycle management directly from your workflows.

## Overview

The Linear Manage tool provides three core actions for issue management:

- **create**: Create new issues with full field support
- **update**: Modify existing issue fields (status, assignee, priority, etc.)
- **comment**: Add comments to issues

This tool is ideal for automating issue tracking updates as part of your development workflows, such as marking issues as "In Progress" when work starts or "Done" when complete.

## Environment Setup

### Required Environment Variable

```bash
export LINEAR_API_KEY="lin_api_..."
```

You can obtain an API key from Linear's Settings > API > Personal API keys.

### Optional: Per-Step Override

You can override the API key for specific steps:

```yaml
- name: "Update issue"
  tool: linear_manage
  action: update
  api_key: "lin_api_different_key"
  issue_id: "{issue}"
  status: "Done"
```

## Basic Usage

```yaml
steps:
  - name: "Mark issue in progress"
    tool: linear_manage
    action: update
    issue_id: "ENG-123"
    status: "In Progress"
```

## Configuration Options

### Common Options (All Actions)

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `action` | string | Yes | Action to perform: `create`, `update`, or `comment` |
| `api_key` | string | No | Override `LINEAR_API_KEY` environment variable |

### Create Action

Creates a new issue in Linear.

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `title` | string | Yes | Issue title |
| `team` | string | Yes | Team key, name, or ID (e.g., `"ENG"`, `"Engineering"`) |
| `description` | string | No | Issue description (Markdown supported) |
| `project` | string | No | Project name |
| `priority` | integer | No | Priority level (0=None, 1=Urgent, 2=High, 3=Medium, 4=Low) |
| `labels` | string or list | No | Label name(s) to apply |
| `status` | string | No | Initial workflow state (e.g., `"Todo"`, `"Backlog"`) |
| `assignee` | string | No | User ID, email, or name |
| `parent_id` | string | No | Parent issue ID for sub-issues |

### Update Action

Updates fields on an existing issue.

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `issue_id` | string | Yes | Issue identifier (e.g., `"ENG-123"`) or UUID |
| `title` | string | No | New title |
| `description` | string | No | New description |
| `project` | string | No | Project name |
| `priority` | integer | No | Priority level (0-4) |
| `labels` | string or list | No | Label name(s) |
| `status` | string | No | Workflow state name (e.g., `"Done"`, `"In Review"`) |
| `assignee` | string | No | User ID, email, or name |

### Comment Action

Adds a comment to an existing issue.

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `issue_id` | string | Yes | Issue identifier (e.g., `"ENG-123"`) |
| `body` | string | Yes | Comment body text (Markdown supported) |

## Variable Interpolation

All string fields support variable interpolation using `{variable_name}` syntax:

```yaml
steps:
  - name: "Create follow-up issue"
    tool: linear_manage
    action: create
    title: "Follow-up: {original_title}"
    team: "{team_key}"
    description: |
      This issue follows up on {parent_issue}.

      Context from previous work:
      {work_summary}
```

## Example Workflow Steps

### Complete Development Flow

```yaml
type: claude-workflow
version: 2
name: Feature Development

inputs:
  - name: issue
    prompt: "Linear issue ID"

steps:
  - name: "Start work"
    tool: linear_manage
    action: update
    issue_id: "{issue}"
    status: "In Progress"

  - name: "Implement feature"
    prompt: "Implement the feature described in Linear issue {issue}"

  - name: "Add implementation comment"
    tool: linear_manage
    action: comment
    issue_id: "{issue}"
    body: |
      Implementation complete.

      Changes made:
      - Added new component
      - Updated tests
      - Documentation updated

  - name: "Mark done"
    tool: linear_manage
    action: update
    issue_id: "{issue}"
    status: "Done"
```

### Create Sub-Issues

```yaml
steps:
  - name: "Create sub-task"
    tool: linear_manage
    action: create
    title: "Sub-task: Write unit tests"
    team: "ENG"
    parent_id: "{parent_issue}"
    priority: 3
    labels:
      - "testing"
      - "automated"
```

### Update Multiple Fields

```yaml
steps:
  - name: "Hand off for review"
    tool: linear_manage
    action: update
    issue_id: "{issue}"
    status: "In Review"
    assignee: "reviewer@company.com"
    priority: 2
```

### Create Issue with Full Details

```yaml
steps:
  - name: "Create bug report"
    tool: linear_manage
    action: create
    title: "Bug: Login form validation fails"
    team: "ENG"
    description: |
      ## Description
      The login form accepts invalid email formats.

      ## Steps to Reproduce
      1. Navigate to /login
      2. Enter "invalid-email" in email field
      3. Click submit

      ## Expected Behavior
      Form should show validation error.
    priority: 2
    labels:
      - "bug"
      - "frontend"
    status: "Backlog"
```

## Common Patterns

### 1. Track Work Progress

Update issue status at key workflow points:

```yaml
steps:
  - name: "Mark in progress"
    tool: linear_manage
    action: update
    issue_id: "{issue}"
    status: "In Progress"

  - name: "Do the work"
    prompt: "Complete the task"

  - name: "Mark complete"
    tool: linear_manage
    action: update
    issue_id: "{issue}"
    status: "Done"
```

### 2. Add Work Summary Comments

Document completed work in issue comments:

```yaml
steps:
  - name: "Implement feature"
    prompt: "Implement the feature and save a summary to work_summary variable"
    output_var: work_summary

  - name: "Document work"
    tool: linear_manage
    action: comment
    issue_id: "{issue}"
    body: |
      Work completed by automated workflow.

      {work_summary}
```

### 3. Create Follow-up Issues

Generate new issues based on workflow results:

```yaml
steps:
  - name: "Analyze codebase"
    prompt: "Find all TODO comments"
    output_var: todos

  - name: "Create cleanup issue"
    tool: linear_manage
    action: create
    title: "Tech debt: Address TODO comments"
    team: "ENG"
    description: |
      Found TODO comments that need addressing:

      {todos}
    priority: 4
    labels: "tech-debt"
```

### 4. Conditional Status Updates

Update status only when specific conditions are met:

```yaml
steps:
  - name: "Run tests"
    tool: bash
    command: "npm test"
    output_var: test_result
    on_error: continue

  - name: "Mark as passing"
    tool: linear_manage
    action: update
    issue_id: "{issue}"
    status: "Ready for Review"
    when: "{test_result} contains 'All tests passed'"

  - name: "Mark as failing"
    tool: linear_manage
    action: comment
    issue_id: "{issue}"
    body: "Tests failed - needs attention"
    when: "{test_result} contains 'FAILED'"
```

### 5. Assign and Prioritize

Route issues to team members based on workflow logic:

```yaml
steps:
  - name: "Triage issue"
    tool: linear_manage
    action: update
    issue_id: "{issue}"
    assignee: "oncall@company.com"
    priority: 1
```

## Priority Values

Linear uses numeric priority levels:

| Value | Label |
|-------|-------|
| 0 | No priority |
| 1 | Urgent |
| 2 | High |
| 3 | Medium |
| 4 | Low |

## Team Resolution

The `team` field accepts multiple formats:

- **Team key**: `"ENG"`, `"PROD"`
- **Team name**: `"Engineering"`, `"Product"`
- **Team UUID**: Full Linear team ID

The client automatically resolves names and keys to the correct team ID.

## User Resolution

The `assignee` field accepts multiple formats:

- **Email**: `"user@company.com"`
- **Display name**: `"John Smith"`
- **User UUID**: Full Linear user ID

## Status Resolution

The `status` field accepts workflow state names as they appear in Linear:

- `"Backlog"`
- `"Todo"`
- `"In Progress"`
- `"In Review"`
- `"Done"`
- `"Canceled"`

State names are case-insensitive and resolved per-team.

## Error Handling

The tool returns detailed errors for common issues:

- **Missing API key**: Set `LINEAR_API_KEY` environment variable
- **Team not found**: Verify team key/name exists
- **User not found**: Check assignee email or name
- **Issue not found**: Verify issue identifier

Use `on_error: continue` for non-critical updates:

```yaml
steps:
  - name: "Optional comment"
    tool: linear_manage
    action: comment
    issue_id: "{issue}"
    body: "Workflow completed"
    on_error: continue
```

## Tips

### Use Descriptive Comments

Include context in comments for team visibility:

```yaml
- name: "Document changes"
  tool: linear_manage
  action: comment
  issue_id: "{issue}"
  body: |
    ## Automated Workflow Update

    **Action**: Feature implementation
    **Branch**: {branch_name}
    **Files changed**: {file_count}

    Ready for review.
```

### Combine with linear_fetch

Use `linear_fetch` to get issues, then `linear_manage` to update them:

```yaml
steps:
  - name: "Get next issue"
    tool: linear_fetch
    team: "ENG"
    status: "Todo"
    output_var: next_issue

  - name: "Start work"
    tool: linear_manage
    action: update
    issue_id: "{next_issue.identifier}"
    status: "In Progress"
```

### Label Management

Apply multiple labels using a list:

```yaml
- name: "Add labels"
  tool: linear_manage
  action: update
  issue_id: "{issue}"
  labels:
    - "reviewed"
    - "approved"
    - "sprint-42"
```
