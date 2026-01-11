# Linear Tasks Tool

The `linear_tasks` tool fetches and manages issues from [Linear](https://linear.app) for workflow automation. It enables workflows to query issues, fetch details, and assign work programmatically.

## Overview

This tool provides three actions for interacting with Linear:

| Action | Description |
|--------|-------------|
| `get_next` | Get the next available issue matching filters |
| `get` | Fetch full details for a specific issue |
| `assign` | Assign an issue to a user |

## Environment Setup

### Required Environment Variable

```bash
export LINEAR_API_KEY="lin_api_xxxxxxxxxxxxx"
```

The API key is required for all Linear operations. It can be:
- Set as the `LINEAR_API_KEY` environment variable (recommended)
- Passed directly via the `api_key` field in the step (not recommended for security reasons)

### How to Get a Linear API Key

1. Open Linear and go to **Settings** (gear icon in the bottom-left)
2. Navigate to **Account** > **API**
3. Click **Create key** under "Personal API keys"
4. Give your key a descriptive label (e.g., "Claude Workflow")
5. Copy the key immediately - it won't be shown again
6. Store it securely and set it as `LINEAR_API_KEY`

**Note:** API keys have the same permissions as your Linear account. Keep them secure and never commit them to version control.

## YAML Configuration

### Action: get_next

Fetches the identifier of the next available issue matching the specified filters.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tool` | string | Yes | Must be `"linear_tasks"` |
| `action` | string | Yes | Must be `"get_next"` |
| `name` | string | Yes | Step name for display |
| `team` | string | Yes | Team key or name (e.g., `"ENG"` or `"Engineering"`) |
| `project` | string | No | Filter by project name |
| `priority` | integer | No | Filter by priority (0-4) |
| `labels` | string or list | No | Filter by label name(s) |
| `status` | string | No | Filter by workflow state name |
| `assignee` | string | No | Filter by assignee (ID, email, or name) |
| `filter` | object | No | Raw GraphQL filter for advanced queries |
| `skip_blocked` | boolean | No | Skip blocked issues (default: `true`) |
| `api_key` | string | No | Override the environment API key |
| `output_var` | string | No | Variable to store the issue identifier |

**Priority Values:**
- `0` - No priority
- `1` - Urgent
- `2` - High
- `3` - Medium
- `4` - Low

```yaml
- name: get-next-task
  tool: linear_tasks
  action: get_next
  team: ENG
  status: "Todo"
  priority: 2
  output_var: issue_id
```

### Action: get

Fetches full details for a specific issue by its identifier.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tool` | string | Yes | Must be `"linear_tasks"` |
| `action` | string | Yes | Must be `"get"` |
| `name` | string | Yes | Step name for display |
| `issue_id` | string | Yes | Issue identifier (e.g., `"ENG-123"`) |
| `api_key` | string | No | Override the environment API key |
| `output_var` | string | No | Variable to store issue details as JSON |

```yaml
- name: fetch-issue-details
  tool: linear_tasks
  action: get
  issue_id: "{issue_id}"
  output_var: issue_data
```

### Action: assign

Assigns an issue to a specific user.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tool` | string | Yes | Must be `"linear_tasks"` |
| `action` | string | Yes | Must be `"assign"` |
| `name` | string | Yes | Step name for display |
| `issue_id` | string | Yes | Issue identifier to assign |
| `assignee` | string | Yes | User ID, email, or name |
| `api_key` | string | No | Override the environment API key |
| `output_var` | string | No | Variable to store updated issue data |

```yaml
- name: assign-to-me
  tool: linear_tasks
  action: assign
  issue_id: "{issue_id}"
  assignee: "john@example.com"
```

## Output Format

### get_next Output

Returns the issue identifier as a plain string:

```
ENG-123
```

Returns an empty string if no matching issues are found.

### get Output

Returns full issue details as JSON:

```json
{
  "id": "abc123-uuid",
  "identifier": "ENG-123",
  "title": "Implement feature X",
  "description": "Detailed description...",
  "priority": 2,
  "priorityLabel": "High",
  "estimate": 3,
  "dueDate": "2024-12-31",
  "createdAt": "2024-01-15T10:00:00.000Z",
  "updatedAt": "2024-01-20T15:30:00.000Z",
  "state": {
    "id": "state-uuid",
    "name": "Todo",
    "type": "unstarted",
    "color": "#95a2b3"
  },
  "team": {
    "id": "team-uuid",
    "key": "ENG",
    "name": "Engineering"
  },
  "project": {
    "id": "project-uuid",
    "name": "Q1 Roadmap",
    "state": "started"
  },
  "assignee": {
    "id": "user-uuid",
    "name": "John Doe",
    "email": "john@example.com"
  },
  "creator": {
    "id": "creator-uuid",
    "name": "Jane Smith",
    "email": "jane@example.com"
  },
  "labels": {
    "nodes": [
      {"id": "label-uuid", "name": "bug", "color": "#eb5757"}
    ]
  },
  "parent": null,
  "children": {"nodes": []},
  "relations": {"nodes": []},
  "comments": {"nodes": []},
  "attachments": {"nodes": []}
}
```

### assign Output

Returns updated issue data as JSON with the new assignee information.

## Blocked Issue Detection

By default, `get_next` skips issues that are blocked by other unresolved issues. An issue is considered blocked if:

1. It has a "blocked by" relation to another issue
2. The blocking issue is not in a `completed` or `canceled` state

To include blocked issues in results:

```yaml
- name: get-any-task
  tool: linear_tasks
  action: get_next
  team: ENG
  skip_blocked: false
  output_var: issue_id
```

## Example Workflows

### Basic Task Processing

```yaml
type: claude-workflow
version: 2
name: Process Next Linear Task

steps:
  - name: get-task
    tool: linear_tasks
    action: get_next
    team: ENG
    status: "Todo"
    output_var: issue_id

  - name: check-task-exists
    tool: break
    when: "{issue_id} is empty"

  - name: fetch-details
    tool: linear_tasks
    action: get
    issue_id: "{issue_id}"
    output_var: issue

  - name: work-on-task
    prompt: |
      Work on Linear issue {issue_id}:

      Title: {issue.title}
      Description: {issue.description}

      Implement the required changes.
```

### Process Multiple Tasks in a Loop

```yaml
type: claude-workflow
version: 2
name: Process All High Priority Tasks

vars:
  max_tasks: "5"
  processed: "0"

steps:
  - name: process-loop
    tool: foreach
    source: '["1", "2", "3", "4", "5"]'
    item_var: iteration
    steps:
      - name: get-next-task
        tool: linear_tasks
        action: get_next
        team: ENG
        status: "Todo"
        priority: 2
        output_var: current_issue

      - name: stop-if-no-more
        tool: break
        when: "{current_issue} is empty"

      - name: assign-to-me
        tool: linear_tasks
        action: assign
        issue_id: "{current_issue}"
        assignee: "developer@company.com"

      - name: get-issue-details
        tool: linear_tasks
        action: get
        issue_id: "{current_issue}"
        output_var: issue_data

      - name: implement-task
        prompt: |
          Implement the following task:

          Issue: {current_issue}
          Title: {issue_data.title}
          Description: {issue_data.description}

          Create the necessary code changes.

      - name: increment-counter
        tool: bash
        command: "echo $(( {processed} + 1 ))"
        output_var: processed

  - name: summary
    prompt: "Completed {processed} tasks. Provide a summary."
```

### Filter by Labels

```yaml
type: claude-workflow
version: 2
name: Process Bug Fixes

steps:
  - name: get-bug
    tool: linear_tasks
    action: get_next
    team: ENG
    labels:
      - "bug"
      - "critical"
    status: "Todo"
    output_var: bug_id

  - name: fix-bug
    prompt: "Fix the bug {bug_id}"
    when: "{bug_id} is not empty"
```

### Filter by Project

```yaml
type: claude-workflow
version: 2
name: Work on Q1 Roadmap

steps:
  - name: get-roadmap-task
    tool: linear_tasks
    action: get_next
    team: ENG
    project: "Q1 Roadmap"
    output_var: task_id

  - name: work-on-task
    prompt: "Implement {task_id} from the Q1 Roadmap"
    when: "{task_id} is not empty"
```

### Using Custom GraphQL Filters

For advanced filtering not covered by built-in options:

```yaml
- name: get-with-custom-filter
  tool: linear_tasks
  action: get_next
  team: ENG
  filter:
    estimate:
      gte: 1
      lte: 3
    dueDate:
      lt: "2024-12-31"
  output_var: issue_id
```

## Common Patterns

### Check for Available Work

```yaml
- name: check-for-work
  tool: linear_tasks
  action: get_next
  team: ENG
  status: "Todo"
  output_var: next_issue

- name: no-work-available
  prompt: "No tasks available in the queue."
  when: "{next_issue} is empty"

- name: work-available
  prompt: "Found task {next_issue} to work on."
  when: "{next_issue} is not empty"
```

### Fetch and Parse Issue Data

```yaml
- name: get-issue
  tool: linear_tasks
  action: get
  issue_id: "ENG-123"
  output_var: issue

- name: use-issue-fields
  prompt: |
    Working on: {issue.title}
    Priority: {issue.priorityLabel}
    Team: {issue.team.name}
    Status: {issue.state.name}
```

### Process Unassigned Issues

```yaml
- name: get-unassigned
  tool: linear_tasks
  action: get_next
  team: ENG
  status: "Backlog"
  filter:
    assignee:
      null: true
  output_var: unassigned_issue
```

## Error Handling

The tool returns an error result when:

- `LINEAR_API_KEY` is not set and no `api_key` is provided
- The specified team cannot be found
- The specified user (for assign) cannot be found
- The issue ID is invalid or not found
- Network errors occur when communicating with Linear API

Example error handling:

```yaml
- name: get-task
  tool: linear_tasks
  action: get_next
  team: ENG
  output_var: issue_id
  on_error: continue

- name: handle-error
  prompt: "Failed to fetch from Linear. Check API key and network."
  when: "{issue_id} is empty"
```

## Related Tools

- **[set](./set.md)** - Store issue data in variables for later use
- **[foreach](./foreach.md)** - Loop over multiple issues
- **[break](./break.md)** - Exit loops when no more issues are available

## Notes

- Team can be specified by key (e.g., `"ENG"`) or full name (e.g., `"Engineering"`)
- Assignee can be specified by Linear user ID, email address, or display name
- Status must match the exact workflow state name in your Linear workspace
- Labels are matched by name and support both single string and array formats
- The client caches team and user lookups to reduce API calls
