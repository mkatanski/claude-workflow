# Linear Integration Tools

The Linear tools enable workflow automation with [Linear](https://linear.app) for issue tracking and project management. Two tools are available:

- **`linear_tasks`** - Fetch and query issues
- **`linear_manage`** - Create, update, and comment on issues

## Environment Setup

### Required Environment Variable

```bash
export LINEAR_API_KEY="lin_api_xxxxxxxxxxxxx"
```

The API key is required for all Linear operations.

### How to Get a Linear API Key

1. Open Linear and go to **Settings** (gear icon in the bottom-left)
2. Navigate to **Account** > **API**
3. Click **Create key** under "Personal API keys"
4. Give your key a descriptive label (e.g., "Claude Workflow")
5. Copy the key immediately - it won't be shown again
6. Store it securely and set it as `LINEAR_API_KEY`

**Note:** API keys have the same permissions as your Linear account. Keep them secure and never commit them to version control.

## Linear Tasks Tool

The `linear_tasks` tool fetches and manages issues from Linear.

### Basic Usage

```typescript
import { createBuilder, WorkflowDefinition } from "claude-workflow";

export default function (t: ReturnType<typeof createBuilder>): WorkflowDefinition {
  return {
    name: "Linear Tasks Example",
    steps: [
      t.step("Get next task", t.linear("get_next", {
        team: "ENG"
      }), {
        output: "issueId"
      })
    ]
  };
}
```

### Actions

#### get_next

Fetches the identifier of the next available issue matching filters.

```typescript
t.step("Get next task", t.linear("get_next", {
  team: "ENG",           // Required: Team key or name
  project: "Q1 Roadmap", // Optional: Filter by project
  priority: 2,           // Optional: Filter by priority (0-4)
  labels: ["bug"],       // Optional: Filter by label(s)
  status: "Todo"         // Optional: Filter by workflow state
}), {
  output: "issueId"
})
```

**Filters:**

| Field | Type | Description |
|-------|------|-------------|
| `team` | string | Team key (e.g., `"ENG"`) or name (required) |
| `project` | string | Project name filter |
| `priority` | number | Priority level (0=None, 1=Urgent, 2=High, 3=Medium, 4=Low) |
| `labels` | string[] | Label name(s) to filter by |
| `status` | string | Workflow state name (e.g., `"Todo"`, `"In Progress"`) |
| `assignee` | string | User ID, email, or name |

**Output:** Returns the issue identifier (e.g., `"ENG-123"`) or empty string if none found.

#### get

Fetches full details for a specific issue.

```typescript
t.step("Fetch details", t.linear("get", {
  issueId: "{issueId}"
}), {
  output: "issueData"
})
```

**Output:** Returns full issue details as JSON including title, description, status, assignee, labels, and more.

#### assign

Assigns an issue to a specific user.

```typescript
t.step("Assign to me", t.linear("assign", {
  issueId: "{issueId}",
  assignee: "developer@company.com"
}), {
  output: "updatedIssue"
})
```

### Blocked Issue Detection

By default, `get_next` skips issues blocked by unresolved issues. An issue is blocked if:

1. It has a "blocked by" relation to another issue
2. The blocking issue is not in a `completed` or `canceled` state

To include blocked issues, use the step config directly:

```typescript
// Note: skipBlocked is controlled via step config, not t.linear()
t.step("Get any task", {
  tool: "linear_tasks",
  action: "get_next",
  team: "ENG",
  skipBlocked: false
}, { output: "issueId" })
```

## Linear Manage Tool

The `linear_manage` tool creates, updates, and manages Linear issues.

### Actions

#### create

Creates a new issue in Linear.

```typescript
t.step("Create issue", t.linear("create", {
  title: "Implement feature X",  // Required
  team: "ENG",                   // Required
  description: "Detailed description...",
  priority: 2,
  labels: ["feature", "frontend"],
  status: "Backlog"
}), {
  output: "newIssue"
})
```

**Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | Issue title |
| `team` | string | Yes | Team key, name, or ID |
| `description` | string | No | Issue description (Markdown supported) |
| `project` | string | No | Project name |
| `priority` | number | No | Priority level (0-4) |
| `labels` | string[] | No | Label names |
| `status` | string | No | Initial workflow state |
| `assignee` | string | No | User ID, email, or name |

#### update

Updates fields on an existing issue.

```typescript
t.step("Update status", t.linear("update", {
  issueId: "{issueId}",
  status: "In Progress"
}), {
  output: "updatedIssue"
})

// Update multiple fields
t.step("Hand off for review", t.linear("update", {
  issueId: "{issueId}",
  status: "In Review",
  assignee: "reviewer@company.com",
  priority: 2
}), {
  output: "updatedIssue"
})
```

#### comment

Adds a comment to an existing issue.

```typescript
t.step("Add comment", t.linear("comment", {
  issueId: "{issueId}",
  body: "Implementation complete. Ready for review."
}), {
  output: "comment"
})
```

**Note:** The `body` field supports Markdown formatting.

## Example Workflows

### Basic Task Processing

```typescript
import { createBuilder, WorkflowDefinition } from "claude-workflow";

export default function (t: ReturnType<typeof createBuilder>): WorkflowDefinition {
  return {
    name: "Process Linear Task",
    steps: [
      t.step("Get next task", t.linear("get_next", {
        team: "ENG",
        status: "Todo"
      }), {
        output: "issueId"
      }),

      // Skip if no task found
      t.step("Check task", t.bash("test -n '{issueId}' || exit 1"), {
        onError: "stop"
      }),

      t.step("Fetch details", t.linear("get", {
        issueId: "{issueId}"
      }), {
        output: "issue"
      }),

      t.step("Implement", t.claude(`
Work on Linear issue {issueId}:

Title: {issue.title}
Description: {issue.description}

Implement the required changes.
      `))
    ]
  };
}
```

### Complete Development Flow

```typescript
import { createBuilder, WorkflowDefinition } from "claude-workflow";

export default function (t: ReturnType<typeof createBuilder>): WorkflowDefinition {
  return {
    name: "Feature Development",
    vars: {
      issueId: "ENG-123"
    },
    steps: [
      t.step("Start work", t.linear("update", {
        issueId: "{issueId}",
        status: "In Progress"
      })),

      t.step("Implement feature", t.claude("Implement the feature described in Linear issue {issueId}")),

      t.step("Document work", t.linear("comment", {
        issueId: "{issueId}",
        body: `
Implementation complete.

Changes made:
- Added new component
- Updated tests
- Documentation updated
        `
      })),

      t.step("Mark done", t.linear("update", {
        issueId: "{issueId}",
        status: "Done"
      }))
    ]
  };
}
```

### Process Multiple Tasks

```typescript
import { createBuilder, WorkflowDefinition } from "claude-workflow";

export default function (t: ReturnType<typeof createBuilder>): WorkflowDefinition {
  return {
    name: "Process High Priority Tasks",
    vars: {
      processed: "0"
    },
    steps: [
      t.range(1, 5, [
        t.step("Get task", t.linear("get_next", {
          team: "ENG",
          status: "Todo",
          priority: 2
        }), {
          output: "currentIssue"
        }),

        // Break if no more tasks
        t.step("Check", t.bash("test -n '{currentIssue}' || exit 1"), {
          onError: "continue"
        }),

        t.step("Assign", t.linear("assign", {
          issueId: "{currentIssue}",
          assignee: "developer@company.com"
        })),

        t.step("Get details", t.linear("get", {
          issueId: "{currentIssue}"
        }), {
          output: "issueData"
        }),

        t.step("Implement", t.claude(`
Implement the following task:

Issue: {currentIssue}
Title: {issueData.title}
Description: {issueData.description}
        `)),

        t.step("Count", t.bash("echo $(( {processed} + 1 ))"), {
          output: "processed"
        })
      ]),

      t.step("Summary", t.claude("Completed {processed} tasks. Provide a summary."))
    ]
  };
}
```

### Filter by Labels

```typescript
import { createBuilder, WorkflowDefinition } from "claude-workflow";

export default function (t: ReturnType<typeof createBuilder>): WorkflowDefinition {
  return {
    name: "Process Bug Fixes",
    steps: [
      t.step("Get bug", t.linear("get_next", {
        team: "ENG",
        labels: ["bug", "critical"],
        status: "Todo"
      }), {
        output: "bugId"
      }),

      t.step("Fix bug", t.claude("Fix the bug {bugId}"), {
        when: "{bugId} is not empty"
      })
    ]
  };
}
```

### Create Follow-up Issues

```typescript
import { createBuilder, WorkflowDefinition } from "claude-workflow";

export default function (t: ReturnType<typeof createBuilder>): WorkflowDefinition {
  return {
    name: "Create Follow-up",
    steps: [
      t.step("Analyze codebase", t.claude("Find all TODO comments"), {
        output: "todos"
      }),

      t.step("Create cleanup issue", t.linear("create", {
        title: "Tech debt: Address TODO comments",
        team: "ENG",
        description: `
Found TODO comments that need addressing:

{todos}
        `,
        priority: 4,
        labels: ["tech-debt"]
      }), {
        output: "newIssue"
      })
    ]
  };
}
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

## Resolution Rules

### Team Resolution

The `team` field accepts multiple formats:

- **Team key**: `"ENG"`, `"PROD"`
- **Team name**: `"Engineering"`, `"Product"`
- **Team UUID**: Full Linear team ID

### User Resolution

The `assignee` field accepts multiple formats:

- **Email**: `"user@company.com"`
- **Display name**: `"John Smith"`
- **User UUID**: Full Linear user ID

### Status Resolution

The `status` field accepts workflow state names as they appear in Linear:

- `"Backlog"`
- `"Todo"`
- `"In Progress"`
- `"In Review"`
- `"Done"`
- `"Canceled"`

State names are case-insensitive and resolved per-team.

## Error Handling

The tools return errors for:

- `LINEAR_API_KEY` not set
- Team not found
- User not found (for assign)
- Issue not found
- Network errors

```typescript
t.step("Get task", t.linear("get_next", {
  team: "ENG"
}), {
  output: "issueId",
  onError: "continue"
})

t.step("Handle error", t.claude("Failed to fetch from Linear. Check API key and network."), {
  when: "{issueId} is empty"
})
```

## Tips

### Use Descriptive Comments

Include context in comments:

```typescript
t.step("Document changes", t.linear("comment", {
  issueId: "{issueId}",
  body: `
## Automated Workflow Update

**Action**: Feature implementation
**Branch**: {branchName}
**Files changed**: {fileCount}

Ready for review.
  `
}))
```

### Combine Tasks and Manage

Use `linear_tasks` to find issues, then `linear_manage` to update them:

```typescript
t.step("Get next", t.linear("get_next", {
  team: "ENG",
  status: "Todo"
}), {
  output: "nextIssue"
})

t.step("Start work", t.linear("update", {
  issueId: "{nextIssue}",
  status: "In Progress"
}))
```

### Check for Empty Results

Always check if `get_next` found an issue:

```typescript
t.step("Check", t.bash("test -n '{issueId}' && echo 'found' || echo 'empty'"), {
  output: "result"
})

t.step("Work", t.claude("Work on {issueId}"), {
  when: "{result} == found"
})
```
