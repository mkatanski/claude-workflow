---
name: workflow-builder
description: Create claude-orchestrator workflow TypeScript files. Use when the user wants to create, design, or modify workflows for Claude Code automation, multi-step AI tasks, or development pipelines. Triggers on workflow creation, step automation, Claude orchestration requests.
---

# Workflow Builder

This skill helps you create well-structured workflow TypeScript files for the claude-orchestrator system using the fluent `WorkflowBuilder` API.

## Quick Start

Workflows are TypeScript files that export a function receiving a `WorkflowBuilder` instance:

```typescript
import type { WorkflowBuilder, WorkflowDefinition } from "../../src/types/index.ts";

export default (t: WorkflowBuilder): WorkflowDefinition => ({
  name: "My Workflow",
  vars: {
    project_name: "my-project",
  },
  claude: {
    model: "sonnet",
    dangerouslySkipPermissions: true,
  },
  steps: [
    t.step("First task", t.claude("Do the first task"), { output: "result" }),
    t.step("Second task", t.claude("Do the second task using {result}")),
  ],
});
```

## Workflow File Location

Workflow files are placed in `.cw/workflows/`:
- `.cw/workflows/my-workflow/workflow.ts` - Standard location
- Must export a default function that returns a `WorkflowDefinition`

## Instructions

### Step 1: Understand the User's Goal

Before creating a workflow, clarify:
1. **What is the overall goal?** (e.g., feature implementation, bug fixing, code review)
2. **What are the discrete steps?** Break complex tasks into atomic operations
3. **What data flows between steps?** Identify variables and outputs needed
4. **What conditions or loops are needed?** Conditional execution, iteration, retries

### Step 2: Choose the Right Structure

| Goal | Structure |
|------|-----------|
| Sequential tasks | Simple steps with `output` option |
| Process multiple items | `t.forEach(source, itemVar, steps)` |
| Retry until success | `t.retry(config, steps)` |
| Poll for status | `t.while(condition, steps)` |
| Count-based iteration | `t.range(from, to, steps)` |
| Conditional execution | Step with `when` option |

### Step 3: Use Builder Methods

## WorkflowBuilder API Reference

### Core Step Method

```typescript
t.step(name: string, tool: ToolDefinition, options?: StepOptions): StepDefinition
```

**Options:**
- `output?: string` - Variable name to store result
- `when?: string` - Condition for execution (e.g., `"{status} == ready"`)
- `onError?: "stop" | "continue"` - Error handling
- `visible?: boolean` - Show in tmux pane (for bash)
- `model?: string` - Override model for this step
- `cwd?: string` - Working directory

### Tool Methods

#### `t.bash(command: string)` - Execute shell commands
```typescript
t.step("Get branch", t.bash("git branch --show-current"), { output: "branch" })
```

#### `t.claude(prompt: string)` - Execute AI prompts
```typescript
t.step("Implement feature", t.claude(`Implement the login feature based on {spec}`))
```

#### `t.set(varName: string, value: string)` - Set a variable
```typescript
t.step("Init counter", t.set("count", "0"))
```

#### `t.claudeSdk(config)` - Structured AI output
```typescript
t.step("Extract title", t.claudeSdk({
  prompt: "Extract a short title from: {description}",
  model: "haiku",
  schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Short title" }
    },
    required: ["title"]
  }
}), { output: "title_json" })
```

#### `t.json(action, config)` - JSON manipulation
```typescript
// Query JSON
t.step("Parse", t.json("query", { input: "{data}", query: "name" }), { output: "name" })

// Set value
t.step("Update", t.json("set", { input: "{data}", path: ".version", value: "2.0" }))
```

#### `t.data(content, format)` - Create temp file
```typescript
t.step("Create context", t.data("# Context\n{info}", "markdown"), { output: "context_file" })
```

#### `t.checklist(items)` - Run quality checks
```typescript
t.step("Quality checks", t.checklist([
  {
    name: "Tests pass",
    command: "npm test && echo pass || echo fail",
    expectedPattern: "pass"
  }
]))
```

#### `t.linear(action, config)` - Linear issue management
```typescript
t.step("Create issue", t.linear("create", {
  title: "New feature",
  team: "ENG",
  priority: 2
}))
```

#### `t.hook(name)` - Execute project-specific hook
```typescript
t.step("Post-story hook", t.hook("post-story"), { onError: "continue" })
```

### Loop Methods

#### `t.forEach(source, itemVar, steps)` - Iterate over array
```typescript
t.forEach("{items_json}", "current_item", [
  t.step("Process item", t.claude("Process {current_item}")),
])
```

#### `t.while(condition, steps)` - Loop while condition is true
```typescript
t.while("{status} != done", [
  t.step("Check", t.bash("check-status.sh"), { output: "status" }),
  t.step("Wait", t.bash("sleep 5")),
])
```

#### `t.range(from, to, steps)` - Loop over number range
```typescript
t.range(1, 5, [
  t.step("Batch", t.bash("process-batch.sh {_index}")),
])
```

#### `t.retry(config, steps)` - Retry until success
```typescript
t.retry({ maxAttempts: 3, until: "{tests_passed} == true" }, [
  t.step("Run tests", t.bash("npm test && echo true || echo false"), { output: "tests_passed" }),
  t.step("Fix tests", t.claude("Fix failing tests"), { when: "{tests_passed} == false" }),
])
```

## WorkflowDefinition Interface

```typescript
interface WorkflowDefinition {
  name: string;
  vars?: Record<string, unknown>;
  claude?: {
    model?: "sonnet" | "opus" | "haiku";
    interactive?: boolean;
    dangerouslySkipPermissions?: boolean;
    allowedTools?: string[];
    appendSystemPrompt?: string;
  };
  claudeSdk?: {
    systemPrompt?: string;
    model?: string;
  };
  tmux?: {
    newWindow?: boolean;
    split?: "vertical" | "horizontal";
    idleTime?: number;
  };
  onError?: {
    captureContext?: boolean;
    saveTo?: string;
  };
  steps: StepDefinition[];
}
```

## Variable Interpolation

Use `{variable_name}` syntax for interpolation:

```typescript
vars: {
  project: "my-app",
  version: "1.0.0",
},
steps: [
  t.step("Build", t.bash("npm run build --project={project}")),
  t.step("Tag", t.bash("git tag v{version}")),
]
```

Nested access with dots: `{data.user.name}` or `{items.0.id}`

## Helper Functions Pattern

Extract reusable logic into helper functions:

```typescript
function gitStatusSteps(t: WorkflowBuilder): StepDefinition[] {
  return [
    t.step("Get branch", t.bash("git branch --show-current"), { output: "branch" }),
    t.step("Check changes", t.bash('git status --porcelain | wc -l'), { output: "changes" }),
  ];
}

export default (t: WorkflowBuilder): WorkflowDefinition => ({
  name: "My Workflow",
  steps: [
    ...gitStatusSteps(t),
    t.step("Main task", t.claude("Do the work")),
  ],
});
```

## Conditional Steps with `when`

```typescript
t.step("Deploy", t.bash("deploy.sh"), { when: "{tests_passed} == true" })
```

Condition syntax:
- `{var} == value` - Equality
- `{var} != value` - Inequality
- `{var} is empty` - Check empty
- `{var} is not empty` - Check non-empty
- `{var} contains text` - Substring check
- `{var} starts with text` - Prefix check

## Reference Documentation

- [tools-reference.md](tools-reference.md) - All available tools (YAML examples, concepts apply)
- [best-practices.md](best-practices.md) - Best practices and patterns

## Output Format

When creating a workflow, I will:
1. Clarify the goal and requirements
2. Design the workflow structure
3. Write the complete TypeScript file
4. Explain each step's purpose
5. Suggest improvements or alternatives

The result will be a valid TypeScript workflow file ready to use with claude-orchestrator.
