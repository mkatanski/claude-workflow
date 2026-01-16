# Claude Orchestrator (TypeScript)

A TypeScript/Bun implementation of the Claude workflow orchestrator. Workflows are defined as `.workflow.ts` files using a fluent builder API.

## Requirements

- [Bun](https://bun.sh/) (recommended) or Node.js 20+
- tmux (for visible pane execution)

## Installation

```bash
# Install dependencies
bun install
# or
npm install

# Install Claude hooks (required for completion detection)
bun run dev hooks install
```

## Quick Start

1. Create a workflow file in your project:

```bash
mkdir -p .claude/workflows
```

2. Create `.claude/workflows/my-workflow.workflow.ts`:

```typescript
import type { WorkflowBuilder } from "claude-workflow";

export default (t: WorkflowBuilder) => ({
  name: "My First Workflow",

  vars: {
    greeting: "Hello",
  },

  claude: {
    model: "sonnet",
    dangerouslySkipPermissions: true,
  },

  steps: [
    t.step("Get date", t.bash("date"), { output: "today" }),
    t.step("Show greeting", t.bash("echo '{greeting}, today is {today}'")),
  ],
});
```

3. Run the workflow:

```bash
bun run /path/to/claude-workflow/ts/src/cli/main.ts /your/project
# or with npm
npx tsx /path/to/claude-workflow/ts/src/cli/main.ts /your/project
```

## Workflow File Format

Workflows are TypeScript files that export a default function. The function receives a builder object `t` with methods to define steps and tools.

### Basic Structure

```typescript
export default (t: WorkflowBuilder) => ({
  name: "Workflow Name",

  vars: {
    // Variables available in {var_name} placeholders
    myVar: "value",
  },

  claude: {
    model: "sonnet",  // or "opus", "haiku"
    dangerouslySkipPermissions: true,
  },

  steps: [
    // Step definitions
  ],
});
```

### Available Tools

#### bash
Execute shell commands:
```typescript
t.step("Run command", t.bash("npm test"), { output: "testOutput" })
```

#### claude
Execute Claude Code in a tmux pane:
```typescript
t.step("Analyze code", t.claude("Analyze the error in {file}"), { output: "analysis" })
```

#### claudeSdk
Get structured output using the Claude API:
```typescript
t.step("Extract info", t.claudeSdk({
  prompt: "Extract the title from: {content}",
  schema: { type: "object", properties: { title: { type: "string" } } },
}), { output: "extracted" })
```

#### set
Set a variable:
```typescript
t.step("Set message", t.set("message", "Hello {name}!"))
```

#### json
Manipulate JSON data:
```typescript
t.step("Query JSON", t.json("query", {
  input: "{jsonData}",
  query: "items[0].name",
}), { output: "firstName" })
```

### Step Options

- `output`: Store the step's output in a variable
- `when`: Conditional execution (`"{var} is not empty"`, `"{count} > 0"`)
- `onError`: Error handling (`"stop"` or `"continue"`)
- `visible`: Run in visible tmux pane (default: false for bash)
- `model`: Override the Claude model for this step

### Variable Interpolation

Use `{var_name}` syntax to interpolate variables:
- Simple: `{myVar}`
- Nested: `{obj.field.nested}`
- Array index: `{array.0.field}`

Variables larger than 10KB are automatically externalized to temp files and referenced with `@filepath`.

## Commands

```bash
# Run a workflow (uses first found, or specify with -w)
claude-workflow /path/to/project
claude-workflow -w my-workflow /path/to/project

# Manage hooks
claude-workflow hooks install   # Install completion detection hooks
claude-workflow hooks check     # Check if hooks are installed
claude-workflow hooks uninstall # Remove hooks
```

## Development

```bash
# Run in development mode
bun run dev examples

# Type check
npm run typecheck

# Build standalone binary (requires Bun)
bun run build
```

## Architecture

The orchestrator uses:
- **Bun.serve** for the HTTP completion signal server
- **tmux** for visible pane management
- **Anthropic SDK** for claude_sdk structured outputs
- Sequential step execution (LangGraph integration planned for loops)

### Key Modules

- `src/cli/` - CLI entry point and commands
- `src/core/context/` - Variable storage and interpolation
- `src/core/server/` - HTTP server for hook signals
- `src/core/tmux/` - Tmux pane management
- `src/core/tools/` - Tool implementations
- `src/core/workflow/` - Builder API and runner
- `src/core/conditions/` - Condition evaluation

## License

MIT
