# Tools Overview

This document explains the tool system in claude-workflow's TypeScript implementation - the building blocks that make workflows actually do things.

## Philosophy: Why Tools Exist

Workflows in claude-workflow are declarative TypeScript or YAML files that describe *what* should happen. But declarations alone cannot execute shell commands, call AI models, or interact with external services. This is where tools come in.

**Tools are the execution layer.** Each tool encapsulates a specific capability - running bash commands, invoking Claude, managing Linear issues, or manipulating JSON data. This separation provides several benefits:

1. **Composability** - Complex workflows are built from simple, focused tools
2. **Testability** - Each tool can be tested in isolation
3. **Extensibility** - New capabilities are added by creating new tools, not modifying core workflow logic
4. **Consistency** - All tools follow the same interface, making workflows predictable

Think of tools like functions in a programming language. Your workflow is the program, and tools are the standard library functions you call to get work done.

## How the Tool Registry Works

The `ToolRegistry` is the central lookup table for all available tools. When the workflow engine encounters a step with `tool: "bash"`, it asks the registry for the `bash` tool implementation.

```typescript
import { ToolRegistry } from "./registry.ts";

// Get a tool by name
const bashTool = ToolRegistry.get("bash");

// List all available tools
const names = ToolRegistry.getToolNames(); // ["bash", "claude", "claude_sdk", ...]

// Check if a tool exists
const exists = ToolRegistry.has("bash"); // true
```

### Registration

Tools are registered at module initialization time. The registry is a singleton that stores tool instances by name:

```typescript
import { ToolRegistry } from "./registry.ts";
import { BashTool } from "./bash.ts";
import { ClaudeTool } from "./claude.ts";

ToolRegistry.register(new BashTool());
ToolRegistry.register(new ClaudeTool());
// ... and so on
```

This happens automatically when the workflow module is imported. You never need to manually register built-in tools.

### Error Handling

If you reference a tool that does not exist, the registry returns `undefined`:

```typescript
const tool = ToolRegistry.get("my_typo");
if (!tool) {
  throw new Error(`Unknown tool: my_typo. Available: ${ToolRegistry.getToolNames().join(", ")}`);
}
```

## The Common Tool Interface

Every tool extends `BaseTool` and implements three methods:

### 1. `name` Property

Returns the tool's identifier used in workflow files:

```typescript
get name(): string {
  return "bash";
}
```

This string is what you write in `tool: "bash"` in your workflow.

### 2. `validateStep(step)` Method

Validates the step configuration before execution. Called during workflow validation, not execution:

```typescript
validateStep(step: StepConfig): void {
  if (!step.command) {
    throw new Error("Bash step requires 'command' field");
  }
}
```

Validation catches configuration errors early, before any work is done.

### 3. `execute(step, context, tmuxManager)` Method

The actual work happens here. Every tool receives:

- `step` - The parsed configuration for this step
- `context` - The `ExecutionContext` with variables and project info
- `tmuxManager` - For tools that need visible terminal panes

```typescript
async execute(
  step: StepConfig,
  context: ExecutionContext,
  tmuxManager: TmuxManager
): Promise<ToolResult> {
  const command = context.interpolate(step.command!);
  // ... execute the command ...
  return successResult(output);
}
```

## ToolResult: What Tools Return

Every tool execution returns a `ToolResult` with these fields:

| Field | Type | Purpose |
|-------|------|---------|
| `success` | `boolean` | Did the tool complete successfully? |
| `output` | `string \| undefined` | Captured output (stored in `outputVar` if specified) |
| `error` | `string \| undefined` | Error message if `success` is false |
| `gotoStep` | `string \| undefined` | Target step name for control flow jumps |
| `loopSignal` | `LoopSignal` | Signal for loop control (`"none"`, `"break"`, `"continue"`) |

The `ToolResult` interface:

```typescript
interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
  gotoStep?: string;
  loopSignal: LoopSignal;
}
```

Helper functions are provided for common result patterns:

```typescript
import { successResult, errorResult } from "./types.ts";

// Successful execution with output
return successResult("file1.txt\nfile2.txt");

// Failed with error
return errorResult("Command timed out after 10 minutes");

// Custom result with goto
return {
  success: true,
  gotoStep: "handle_error",
  loopSignal: LoopSignal.NONE
};
```

## Available Tools

### Execution Tools

| Tool | Purpose |
|------|---------|
| `bash` | Execute shell commands in subprocess or visible tmux pane |
| `claude` | Run Claude Code prompts in a visible tmux pane with auto-completion detection |
| `claude_sdk` | AI-powered decision making with structured outputs (boolean, enum, decision, custom schema) |

### Data Tools

| Tool | Purpose |
|------|---------|
| `data` | Write content to managed temp files for Claude to read |
| `json` | JSON manipulation with JMESPath queries (query, set, parse, merge, keys, values, length) |

### Validation Tools

| Tool | Purpose |
|------|---------|
| `checklist` | Run validation checks (bash commands, regex patterns, model-based judgment) |

### Integration Tools

| Tool | Purpose |
|------|---------|
| `linear_tasks` | Query Linear issues (get_next, get, assign) |
| `linear_manage` | Create, update, and comment on Linear issues |

### Extension Tools

| Tool | Purpose |
|------|---------|
| `hook` | Execute optional project-specific hooks from `.cw/hooks/{name}.ts` |

## How Tools Interact with ExecutionContext

The `ExecutionContext` is the shared state that flows through every step. Tools interact with it in several ways:

### Reading Variables (Interpolation)

Tools use `context.interpolate()` to resolve `{variable}` placeholders in their configuration:

```typescript
// In workflow:
//   command: "echo {message}"
//
// In tool:
const command = context.interpolate(step.command!);
// If message="hello", command becomes "echo hello"
```

Interpolation supports:
- Simple variables: `{var_name}`
- Nested paths: `{issue.title}` or `{items.0.name}`
- JSON parsing: Automatically parses JSON strings to access nested fields

### Claude-Specific Interpolation

For Claude prompts, use `context.interpolateForClaude()` which automatically externalizes large variables (>10,000 chars) to temp files and replaces them with `@filepath` references:

```typescript
// Large variables become file references
const prompt = context.interpolateForClaude(step.prompt!);
// "{large_data}" becomes "@/tmp/workflow-xxx/large_data.txt"
```

### Writing Variables

Tools can store their output for later steps using `outputVar`:

```yaml
- name: list_files
  tool: bash
  command: ls -la
  outputVar: file_list  # Tool output stored here
```

The workflow engine handles `outputVar` automatically - tools just return `output` in their `ToolResult`.

### Reading and Setting Variables Directly

```typescript
// Get a variable
const value = context.get<string>("my_var");
const valueWithDefault = context.get("count", 0);

// Set a variable
context.set("result", someValue);

// Update multiple variables
context.update({
  status: "complete",
  timestamp: Date.now()
});

// Get all variables
const allVars = context.getAll();
```

### Project Path

Every context has a `projectPath` that tools use as the default working directory:

```typescript
const cwd = context.interpolateOptional(step.cwd) ?? context.projectPath;
```

## Choosing the Right Tool

### Need to run a shell command?

Use `bash`. Set `visible: true` if you want to watch the output in real-time.

```yaml
- name: install_deps
  tool: bash
  command: npm install
```

### Need Claude to analyze code or make changes?

Use `claude`. It runs Claude Code in a tmux pane and waits for completion.

```yaml
- name: refactor_code
  tool: claude
  prompt: "Refactor the authentication module to use async/await"
```

### Need an AI decision without full Claude Code?

Use `claude_sdk`. It is faster, uses the SDK directly, and supports structured outputs.

```yaml
- name: should_deploy
  tool: claude_sdk
  prompt: "Based on the test results in {test_output}, should we deploy?"
  outputType: boolean
```

### Need to manipulate JSON data?

Use `json` for native JSON operations with JMESPath queries:

```yaml
- name: get_user_name
  tool: json
  action: query
  input: "{user_data}"
  query: "users[0].name"
  outputVar: first_user

- name: merge_configs
  tool: json
  action: merge
  input: "{base_config}"
  newValue: '{"debug": true}'
  outputVar: merged_config
```

The `json` tool supports these actions:
- `query` - Extract data using JMESPath expressions
- `set` - Set a value at a path
- `parse` - Parse a JSON string
- `stringify` - Convert to JSON string
- `merge` - Shallow merge two objects
- `keys` - Get object keys
- `values` - Get object values
- `length` - Get array/object/string length

### Need to write data to a temp file for Claude?

Use `data` to write content to managed temp files:

```yaml
- name: prepare_context
  tool: data
  content: |
    Here are the files to process:
    {file_list}
  format: markdown
  outputVar: context_file
```

Files are automatically cleaned up when the workflow ends.

### Need to run validation checks?

Use `checklist` to run multiple validation checks in parallel:

```yaml
- name: pre_deploy_checks
  tool: checklist
  items:
    - name: tests_pass
      type: bash
      command: npm test
      expect: "0"  # Exit code
    - name: no_console_logs
      type: regex
      pattern: "console\\.log"
      files: "src/**/*.ts"
      expect: 0  # Match count
    - name: code_quality
      type: model
      prompt: "Review {code_changes} for quality issues"
      passPattern: "PASS|no issues"
```

Check types:
- `bash` - Run a command and check output/exit code
- `regex` - Search for patterns in files using ripgrep
- `model` - Use Claude Haiku for judgment-based checks

### Need to work with Linear issues?

Use `linear_tasks` for querying and `linear_manage` for mutations:

```yaml
- name: get_next_task
  tool: linear_tasks
  action: get_next
  team: engineering
  outputVar: issue_id

- name: mark_in_progress
  tool: linear_manage
  action: update
  issueId: "{issue_id}"
  status: "In Progress"
```

`linear_tasks` actions:
- `get_next` - Get the next available issue matching filters
- `get` - Fetch full issue details by ID
- `assign` - Assign an issue to a user

`linear_manage` actions:
- `create` - Create a new issue
- `update` - Update issue fields
- `comment` - Add a comment to an issue

### Need to run project-specific logic?

Use `hook` to execute optional TypeScript hooks. Hooks are project-specific and silently skip if not found:

```typescript
t.step("Post-build hook", t.hook("post-build"), { onError: "continue" })
```

Hook files live in `.cw/hooks/{name}.ts` and export a default async function:

```typescript
// .cw/hooks/post-build.ts
import type { HookContext } from "../../src/core/tools/hook.ts";

export default async function(context: HookContext): Promise<string | void> {
  // Custom logic here
  return "Hook completed";
}
```

## Further Reading

For detailed configuration options and examples for each tool, see:

- [bash Tool Reference](./tools/bash.md)
- [claude Tool Reference](./tools/claude.md)
- [claude_sdk Tool Reference](./tools/claude-sdk.md)
- [json Tool Reference](./tools/json.md)
- [data Tool Reference](./tools/data.md)
- [checklist Tool Reference](./tools/checklist.md)
- [Linear Integration Tools](./tools/linear.md)
- [hook Tool Reference](./tools/hook.md)
- [Creating Custom Tools](./creating-tools.md)
