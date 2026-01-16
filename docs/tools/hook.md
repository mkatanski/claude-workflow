# Hook Tool

The `hook` tool enables project-specific extensibility by executing optional TypeScript files from `.cw/hooks/{name}.ts`. Hooks provide a way to inject custom logic at specific points in your workflows without modifying the workflows themselves.

## Overview

The hook tool:

1. Looks for a TypeScript file at `.cw/hooks/{name}.ts`
2. If found, imports and executes the default exported function
3. If not found, silently succeeds (hooks are optional)
4. Passes workflow context to the hook function
5. Returns the hook's result or a success message

This allows workflows to define extension points that projects can optionally implement based on their specific needs.

## Basic Usage

```typescript
import type { WorkflowFactory } from "claude-workflow";

const workflow: WorkflowFactory = (t) => ({
  name: "feature-implementation",
  steps: [
    t.step("Implement feature", t.claude("Create the login form")),
    t.step("Post-implementation hook", t.hook("post-implementation"), {
      onError: "continue",
    }),
  ],
});

export default workflow;
```

## Builder API

### `t.hook(name: string)`

Creates a hook tool definition that will execute `.cw/hooks/{name}.ts`.

```typescript
t.step("Run custom logic", t.hook("my-custom-hook"))
```

### Step Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `output` | string | - | Variable name to store hook's return value |
| `when` | string | - | Conditional expression for step execution |
| `onError` | "stop" \| "continue" | "stop" | Error handling behavior |

## Hook File Structure

Hook files must be placed at `.cw/hooks/{name}.ts` relative to your project root and export a default async function.

### Basic Hook

```typescript
// .cw/hooks/post-story.ts
import type { HookContext } from "claude-workflow";

export default async function(context: HookContext): Promise<string | void> {
  console.log(`Running in ${context.projectPath}`);
  console.log(`Story: ${context.storyId}`);

  // Do custom logic here

  return "Hook completed successfully";
}
```

### Hook with External Operations

```typescript
// .cw/hooks/notify-slack.ts
import type { HookContext } from "claude-workflow";

export default async function(context: HookContext): Promise<string> {
  const storyId = context.storyId;
  const projectPath = context.projectPath;

  // Send notification to Slack
  await fetch("https://hooks.slack.com/services/...", {
    method: "POST",
    body: JSON.stringify({
      text: `Story ${storyId} completed in ${projectPath}`,
    }),
  });

  return `Notified Slack about story ${storyId}`;
}
```

## HookContext Interface

The context object passed to every hook function:

```typescript
interface HookContext {
  /** Current story ID if in story loop */
  storyId?: string;

  /** Current milestone ID if in milestone mode */
  milestoneId?: string;

  /** Workflow mode: "simple" or "milestone" */
  workflowMode?: string;

  /** Current workflow phase */
  workflowPhase?: string;

  /** Project root path */
  projectPath: string;

  /** All workflow variables */
  variables: Record<string, unknown>;
}
```

### Accessing Variables

The `variables` object contains all workflow variables, including outputs from previous steps:

```typescript
export default async function(context: HookContext): Promise<void> {
  // Access workflow variables
  const epicPath = context.variables.epic_path as string;
  const testResults = context.variables.test_output as string;

  // Access loop variables
  const currentStory = context.variables.story_id as string;
}
```

## Common Hook Points

The epic-to-implementation workflow defines these hook points:

| Hook Name | When Called | Use Case |
|-----------|-------------|----------|
| `post-story` | After each story completes | Update tracking, run project-specific checks |
| `post-milestone` | After milestone commit | Deploy to staging, notify stakeholders |
| `post-epic` | Before finalization | Generate reports, cleanup resources |

## Example Workflows

### Story Implementation with Hooks

```typescript
const workflow: WorkflowFactory = (t) => ({
  name: "story-implementation",
  steps: [
    t.step("Get stories", t.bash("cat stories.json"), {
      output: "stories",
    }),
    t.loop("stories", [
      t.step("Implement story", t.claude("Implement story {story_id}")),
      t.step("Post-story hook", t.hook("post-story"), {
        onError: "continue",
      }),
    ]),
    t.step("Final hook", t.hook("post-epic"), {
      onError: "continue",
    }),
  ],
});
```

### Conditional Hook Execution

```typescript
const workflow: WorkflowFactory = (t) => ({
  name: "deploy-with-hooks",
  steps: [
    t.step("Build", t.bash("npm run build")),
    t.step("Deploy hook", t.hook("pre-deploy"), {
      when: "{environment} equals production",
      onError: "stop",
    }),
    t.step("Deploy", t.bash("npm run deploy")),
  ],
});
```

### Capturing Hook Output

```typescript
const workflow: WorkflowFactory = (t) => ({
  name: "validated-deploy",
  steps: [
    t.step("Validation hook", t.hook("validate-deploy"), {
      output: "validation_result",
    }),
    t.step("Deploy", t.claude("Deploy the application"), {
      when: "{validation_result} contains approved",
    }),
  ],
});
```

## Example Hook Implementations

### Update Linear on Story Completion

```typescript
// .cw/hooks/post-story.ts
import type { HookContext } from "claude-workflow";

export default async function(context: HookContext): Promise<string> {
  const storyId = context.storyId;

  if (!storyId) {
    return "No story ID, skipping Linear update";
  }

  // Update Linear issue status
  // (actual implementation would use Linear API)
  console.log(`Updating Linear issue ${storyId} to "Done"`);

  return `Updated Linear issue ${storyId}`;
}
```

### Run Project-Specific Tests

```typescript
// .cw/hooks/post-implementation.ts
import type { HookContext } from "claude-workflow";
import { spawnSync } from "node:child_process";

export default async function(context: HookContext): Promise<string> {
  const projectPath = context.projectPath;

  // Run project-specific test suite
  const result = spawnSync("npm", ["run", "test:integration"], {
    cwd: projectPath,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error("Integration tests failed");
  }

  return "Integration tests passed";
}
```

### Generate Documentation

```typescript
// .cw/hooks/post-epic.ts
import type { HookContext } from "claude-workflow";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

export default async function(context: HookContext): Promise<string> {
  const { projectPath, variables } = context;

  // Generate a summary of what was implemented
  const summary = {
    milestone: variables.milestone_id,
    storiesCompleted: variables.completed_stories,
    timestamp: new Date().toISOString(),
  };

  const summaryPath = join(projectPath, ".cw", "reports", "implementation-summary.json");
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  return `Generated summary at ${summaryPath}`;
}
```

## Best Practices

### 1. Always Use `onError: "continue"` for Optional Hooks

Since hooks are meant to be optional, prevent missing or failing hooks from breaking workflows:

```typescript
t.step("Optional hook", t.hook("my-hook"), {
  onError: "continue",
})
```

### 2. Keep Hooks Focused and Fast

Hooks should do one thing and do it quickly:

```typescript
// Good: Focused hook
export default async function(context: HookContext): Promise<string> {
  await notifySlack(context.storyId);
  return "Notified Slack";
}

// Avoid: Doing too much
export default async function(context: HookContext): Promise<string> {
  await notifySlack(context.storyId);
  await updateJira(context.storyId);
  await runTests();
  await generateDocs();
  // ... too many responsibilities
}
```

### 3. Log What the Hook is Doing

Provide visibility into hook execution:

```typescript
export default async function(context: HookContext): Promise<string> {
  console.log(`[post-story] Processing story ${context.storyId}`);

  // ... do work ...

  console.log(`[post-story] Completed processing`);
  return `Processed story ${context.storyId}`;
}
```

### 4. Return Meaningful Messages

Return strings that describe what happened:

```typescript
// Good: Descriptive return
return `Updated 3 Linear issues and notified #dev-channel`;

// Avoid: No information
return "Done";
```

### 5. Handle Missing Context Gracefully

Not all context values are available in all situations:

```typescript
export default async function(context: HookContext): Promise<string> {
  if (!context.storyId) {
    console.log("[post-story] No story ID available, skipping");
    return "Skipped - no story context";
  }

  // ... proceed with story-specific logic
}
```

## Error Handling

### Hook Errors

If a hook throws an error, the step fails:

```typescript
export default async function(context: HookContext): Promise<void> {
  const result = await someOperation();

  if (!result.success) {
    throw new Error(`Operation failed: ${result.error}`);
  }
}
```

### Workflow Configuration

Control how hook errors affect the workflow:

```typescript
// Stop workflow on hook failure
t.step("Critical hook", t.hook("pre-deploy"), {
  onError: "stop",
})

// Continue workflow even if hook fails
t.step("Optional hook", t.hook("notify"), {
  onError: "continue",
})
```

## Troubleshooting

### Hook Not Found

If you see "Hook not found" messages, verify:

1. The hook file exists at `.cw/hooks/{name}.ts`
2. The path is relative to your project root
3. The file has a `.ts` extension

### Hook Not Executing

Check that:

1. The hook exports a default function
2. The function is async (returns a Promise)
3. There are no syntax errors in the hook file

### Context Values Missing

Remember that context values depend on the workflow:

- `storyId` is only set inside story loops
- `milestoneId` is only set in milestone mode
- Custom variables must be set by previous steps

### Import Errors

Hook files are imported dynamically. Ensure:

1. All imports use valid paths
2. Dependencies are installed
3. TypeScript syntax is correct
