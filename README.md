# Claude Workflow - TypeScript Implementation

A TypeScript/LangChain-based implementation of claude-workflow, providing type-safe workflow automation with Claude Code.

## Overview

This is the TypeScript implementation of claude-workflow, designed to orchestrate complex automation tasks using Claude Code. It provides a **LangGraph-based API** for defining workflows as TypeScript files with full type safety, state management, and IDE support.

> **📢 API Migration Notice**
>
> The legacy WorkflowBuilder API (`t.step()`, `t.bash()`, etc.) is **deprecated** and will be removed in a future version. Please migrate to the new **LangGraph API** for better type safety, native graph visualization, and enhanced debugging capabilities.
>
> 👉 **[Migration Guide](./MIGRATION.md)** - Complete guide for migrating from WorkflowBuilder to LangGraph

## Features

- **TypeScript-first** with full type safety and IDE autocompletion
- **LangGraph-based workflows** with native graph visualization and state management
- **Type-safe state** with no string interpolation errors
- **Dual runtime support** - works with both Bun (recommended) and Node.js (via tsx)
- **8 built-in tools** for shell commands, Claude integration, data manipulation, and external services
- **Conditional routing** with clean, typed routing logic
- **Checkpointing & resumability** - pause and resume workflows automatically
- **tmux integration** for visible Claude Code execution

## Requirements

- [Bun](https://bun.sh/) (recommended) or Node.js 18+
- [tmux](https://github.com/tmux/tmux) (required for the `claude` tool)
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and configured
- `ANTHROPIC_API_KEY` environment variable (for `claude_sdk` and `checklist` model checks)
- `LINEAR_API_KEY` environment variable (for Linear tools, optional)

## Installation

```bash
cd ts
bun install
```

Or with npm:

```bash
cd ts
npm install
```

## CLI Commands

### Development Scripts

```bash
# Run with tsx (Node.js)
bun run dev

# Run with Bun runtime
bun run dev:bun

# Build standalone binary
bun run build

# Run tests
bun test

# TypeScript type checking
bun run typecheck

# Lint with Biome
bun run lint

# Format code
bun run format
```

### CLI Usage

The CLI is available as `cw` or `claude-workflow`:

```bash
# Run a workflow in current directory
cw run

# Run a workflow in a specific project
cw run /path/to/project

# Run a specific workflow by name
cw run -w my-workflow /path/to/project

# Verbose output
cw run -v /path/to/project
```

### Hook Management

Hooks enable completion detection when running Claude Code:

```bash
# Install workflow hooks to a project
cw hooks install <project-path>

# Check if hooks are installed
cw hooks check <project-path>

# Uninstall hooks from a project
cw hooks uninstall <project-path>

# Clean up legacy global hooks
cw hooks cleanup-global
```

## Workflow Files

Workflows are defined in `.cw/workflows/` as TypeScript files using the **LangGraph API**.

### Basic Structure (LangGraph API - Current)

```typescript
import type { LangGraphWorkflowDefinition } from "../../../src/core/graph/types.ts";
import type { ClaudeConfig } from "../../../src/types/index.ts";
import { START, END } from "@langchain/langgraph";

const claudeConfig: ClaudeConfig = {
  model: "sonnet",
  dangerouslySkipPermissions: true,
};

const workflow: LangGraphWorkflowDefinition = {
  name: "Example Workflow",

  // Initial state variables
  vars: {
    greeting: "Hello",
    target: "World",
  },

  claude: claudeConfig,

  // Build the workflow graph
  build(graph) {
    // Node: Get current date
    graph.addNode("get_date", async (state, tools) => {
      const result = await tools.bash("date");
      return {
        variables: {
          currentDate: result.output?.trim()
        }
      };
    });

    // Node: Show message
    graph.addNode("show_message", async (state, tools) => {
      const message = `${state.greeting}, ${state.target}!`;
      await tools.bash(`echo '${message}'`);
      return {};
    });

    // Define execution flow
    graph.addEdge(START, "get_date");
    graph.addEdge("get_date", "show_message");
    graph.addEdge("show_message", END);
  },
};

export default () => workflow;
```

> **Note:** The legacy WorkflowBuilder API is still supported but deprecated. See [MIGRATION.md](./MIGRATION.md) for migration instructions.

### Configuration Options

#### Top-Level Configuration

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Workflow display name |
| `vars` | `Record<string, unknown>` | Initial variables |
| `claude` | `ClaudeConfig` | Claude Code settings |
| `claudeSdk` | `ClaudeSdkConfig` | Claude SDK settings |
| `tmux` | `TmuxConfig` | Tmux pane settings |
| `onError` | `OnErrorConfig` | Error handling behavior |

#### Claude Configuration

```typescript
claude: {
  model: "sonnet",              // "opus", "sonnet", "haiku"
  dangerouslySkipPermissions: true,
  permissionMode: "auto",
  allowedTools: ["bash", "write"],
  autoApprovePlan: true,
  appendSystemPrompt: "Additional context...",
  cwd: "/custom/working/dir",
}
```

### Node Patterns

#### Capturing Output

```typescript
graph.addNode("get_version", async (state, tools) => {
  const result = await tools.bash("node --version");
  return {
    variables: {
      nodeVersion: result.output?.trim()
    }
  };
});
```

#### Using State Variables

```typescript
graph.addNode("show_message", async (state, tools) => {
  // Type-safe access to state variables
  const message = `${state.greeting}, ${state.target}`;
  await tools.bash(`echo '${message}'`);
  return {};
});
```

#### Conditional Routing

```typescript
// Router function
function routeByEnvironment(state) {
  return state.environment === "production" ? "deploy" : "skip";
}

// Use conditional edges
graph.addConditionalEdges("check_env", routeByEnvironment, {
  deploy: "deploy_node",
  skip: "skip_node",
});
```

## Available Tools

The `tools` parameter in node functions provides these built-in tools:

### 1. bash

Execute shell commands:

```typescript
graph.addNode("run_tests", async (state, tools) => {
  const result = await tools.bash("npm test");
  return {
    variables: {
      testResult: result.output
    }
  };
});
```

### 2. claude

Run Claude Code prompts in tmux with full IDE capabilities:

```typescript
graph.addNode("analyze", async (state, tools) => {
  const result = await tools.claude(`Analyze the error in ${state.file} and suggest fixes`, {
    model: "opus",
  });
  return {
    variables: {
      analysis: result.output
    }
  };
});
```

### 3. claudeSdk

Direct Claude SDK calls with structured output (Zod schema validation):

```typescript
import { z } from "zod";

const ExtractionSchema = z.object({
  title: z.string(),
  author: z.string(),
});

graph.addNode("extract_data", async (state, tools) => {
  const result = await tools.claudeSdk({
    systemPrompt: `Extract the title and author from: ${state.content}`,
    schema: ExtractionSchema,
    model: "haiku",
    maxRetries: 3,
  });
  return {
    variables: {
      extracted: result
    }
  };
});
```

### 4. setVar / getVar

Manipulate state variables:

```typescript
graph.addNode("update_counter", async (state, tools) => {
  const current = tools.getVar("counter") || 0;
  tools.setVar("counter", current + 1);
  return {};
});
```

### 5. JSON Operations

Use native JavaScript for JSON manipulation:

```typescript
graph.addNode("parse_json", async (state, tools) => {
  const data = JSON.parse(state.jsonString);
  const activeNames = data.items
    .filter(item => item.status === 'active')
    .map(item => item.name);

  return {
    variables: {
      parsed: data,
      activeNames
    }
  };
});
```

### 6. Validation with checklist

Run validation checks (see legacy API docs for checklist tool details):

```typescript
graph.addNode("validate", async (state, tools) => {
  // Validation logic using tools.bash() or tools.claudeSdk()
  const typeCheckResult = await tools.bash("tsc --noEmit");

  if (!typeCheckResult.success) {
    throw new Error("TypeScript compilation failed");
  }

  return {};
});
```

> **Note:** For detailed tool examples using the legacy WorkflowBuilder API, see [MIGRATION.md](./MIGRATION.md).

## Control Flow Patterns

### Loops

Use graph cycles with conditional routing:

```typescript
// Loop through items
function shouldContinueLoop(state) {
  return state.currentIndex < state.items.length ? "process" : "done";
}

graph.addNode("process_item", async (state, tools) => {
  const item = state.items[state.currentIndex];
  await tools.bash(`echo 'Processing ${item}'`);
  return {
    variables: {
      currentIndex: state.currentIndex + 1
    }
  };
});

graph.addConditionalEdges("check_loop", shouldContinueLoop, {
  process: "process_item",
  done: END,
});

// Create loop back edge
graph.addEdge("process_item", "check_loop");
```

### Conditional Routing

Use router functions for branching logic:

```typescript
function routeByEnvironment(state) {
  if (state.environment === "production") {
    return "deploy";
  }
  return "skip";
}

graph.addNode("deploy", async (state, tools) => {
  await tools.bash("./deploy.sh");
  return {};
});

graph.addNode("skip", async (state, tools) => {
  console.log("Skipping deployment");
  return {};
});

graph.addConditionalEdges("check_env", routeByEnvironment, {
  deploy: "deploy",
  skip: "skip",
});
```

### Retry Logic

```typescript
function shouldRetry(state) {
  if (state.success) return "complete";
  if (state.attempts >= 3) return "failed";
  return "retry";
}

graph.addNode("try_operation", async (state, tools) => {
  const result = await tools.bash("./flaky-command");
  return {
    variables: {
      success: result.success,
      attempts: state.attempts + 1,
    }
  };
});

graph.addConditionalEdges("try_operation", shouldRetry, {
  complete: END,
  retry: "try_operation", // Loop back
  failed: "handle_failure",
});
```

> **Note:** For legacy control flow patterns (forEach, while, retry), see [MIGRATION.md](./MIGRATION.md).

## Project Structure

```
ts/
├── src/
│   ├── cli/                    # CLI entry point and commands
│   │   ├── main.ts            # Commander CLI setup
│   │   ├── commands/          # Command implementations
│   │   │   ├── run.ts         # Workflow runner command
│   │   │   └── hooks.ts       # Hook management commands
│   │   └── discovery.ts       # Workflow file discovery
│   ├── core/
│   │   ├── context/           # Execution context and variables
│   │   │   ├── execution.ts   # Variable storage and interpolation
│   │   │   └── index.ts
│   │   ├── tools/             # Tool implementations
│   │   │   ├── bash.ts        # Shell command execution
│   │   │   ├── claude.ts      # Claude Code in tmux
│   │   │   ├── claudeSdk.ts   # Direct Claude SDK calls
│   │   │   ├── data.ts        # Temp file writing
│   │   │   ├── json.ts        # JSON manipulation
│   │   │   ├── checklist.ts   # Validation checks
│   │   │   ├── linearTasks.ts # Linear issue queries
│   │   │   ├── linearManage.ts # Linear issue management
│   │   │   ├── registry.ts    # Tool registry
│   │   │   └── types.ts       # Tool base class and types
│   │   ├── workflow/          # Workflow execution
│   │   │   ├── builder.ts     # Fluent builder API
│   │   │   ├── runner.ts      # Step execution engine
│   │   │   └── state.ts       # LangChain state management
│   │   ├── tmux/              # Tmux integration
│   │   │   ├── manager.ts     # Pane management
│   │   │   └── index.ts
│   │   ├── linear/            # Linear API client
│   │   │   ├── client.ts      # API wrapper
│   │   │   ├── queries.ts     # GraphQL queries
│   │   │   └── types.ts       # Linear types
│   │   ├── server/            # Completion signal server
│   │   │   └── manager.ts     # HTTP server for hooks
│   │   └── conditions/        # Condition evaluation
│   │       └── evaluator.ts   # Natural language conditions
│   └── types/                 # TypeScript type definitions
│       └── index.ts           # All exported types
├── examples/                   # Example workflows
│   └── .cw/workflows/
│       └── example.workflow.ts
├── package.json
├── tsconfig.json
└── biome.json                 # Linter/formatter config
```

## Documentation

For detailed documentation on individual tools and advanced usage, see the `docs/` folder (coming soon).

## Examples

See the `examples/` directory and real-world workflows:

- `examples/.cw/workflows/example.ts` - Basic LangGraph workflow demonstrating core features
- `.cw/workflows/epic-to-implementation-v3/workflow.ts` - Complex real-world workflow example
- `examples/.cw/workflows/example.legacy.workflow.ts` - Legacy WorkflowBuilder example (deprecated)

Run the example:

```bash
bun run dev examples
```

For migration from legacy API, see **[MIGRATION.md](./MIGRATION.md)**.

## License

MIT
