# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claude Workflow is a TypeScript/Bun workflow automation framework built on LangGraph from LangChain. It orchestrates complex AI-driven automation tasks using Claude Code with type-safe workflow definitions, state management, conditional routing, and debugging capabilities.

## Development Commands

```bash
# Run with tsx (Node.js)
bun run dev

# Run with Bun runtime
bun run dev:bun

# Build standalone binary
bun run build

# Run tests
bun test

# Run a single test file
bun test src/core/utils/result/result.test.ts

# TypeScript type checking
bun run typecheck

# Lint with Biome
bun run lint

# Format code
bun run format
```

### CLI Usage

```bash
cw run                       # Run workflow in current directory
cw run -w my-workflow .      # Run specific workflow
cw run --debug               # Debug mode with breakpoints
cw hooks install <path>      # Install Claude Code hooks
```

## Architecture

### Core Module Structure

```
src/
├── cli/              # CLI entry point (Commander.js)
│   ├── main.ts       # CLI setup
│   ├── discovery.ts  # Workflow file discovery from .cw/workflows/
│   └── commands/     # run, hooks commands
├── core/
│   ├── graph/        # LangGraph-based workflow system (primary API)
│   │   ├── workflowGraph.ts  # WorkflowGraph wrapper for StateGraph
│   │   ├── workflowTools.ts  # Tool factory injected into nodes
│   │   ├── state.ts          # State management and validators
│   │   └── types.ts          # LangGraphWorkflowDefinition, NodeFunction
│   ├── tools/        # 8 built-in tools (bash, claude, claudeSdk, json, data, checklist, linearTasks, linearManage)
│   ├── debugger/     # Breakpoints, variable inspection, execution replay
│   ├── events/       # Observable event system with pluggable renderers
│   ├── utils/        # Result type, retry, circuit-breaker, state builders
│   ├── tmux/         # Tmux pane management for claude tool
│   └── workflow/     # Legacy WorkflowRunner (deprecated)
└── types/            # TypeScript type definitions
```

### Workflow Execution Flow

1. CLI discovers workflows in `.cw/workflows/*.ts`
2. `LangGraphWorkflowFactory` loads and validates workflow definition
3. `WorkflowGraph` builds the graph via `build(graph)` function
4. Nodes receive `(state, tools)` and return `{ variables: {...} }`
5. `WorkflowRunner` executes nodes following edges
6. Events emitted for observability (ConsoleRenderer, JsonRenderer, DebugRenderer)

### Key Design Patterns

- **Factory Pattern**: Tool creation via `WorkflowTools`, workflow creation via factory functions
- **Result Type**: `Ok<T>` / `Err<E>` pattern in `src/core/utils/result/`
- **Circuit Breaker**: Failure tracking in `src/core/utils/circuit-breaker/`
- **Dependency Injection**: Tools injected into node functions via closure

## Workflow Definition (LangGraph API)

Workflows are TypeScript files in `.cw/workflows/` that export a factory function returning `LangGraphWorkflowDefinition`:

```typescript
import type { LangGraphWorkflowDefinition } from "../../../src/core/graph/types.ts";
import { START, END } from "@langchain/langgraph";

const workflow: LangGraphWorkflowDefinition = {
  name: "My Workflow",
  vars: { counter: 0 },

  build(graph) {
    graph.addNode("step1", async (state, tools) => {
      const result = await tools.bash("echo hello");
      return { variables: { output: result.output } };
    });

    graph.addEdge(START, "step1");
    graph.addEdge("step1", END);
  },
};

export default () => workflow;
```

### Conditional Routing

```typescript
function routeByStatus(state) {
  return state.success ? "continue" : "handle_error";
}

graph.addConditionalEdges("check_status", routeByStatus, {
  continue: "next_step",
  handle_error: "error_handler",
});
```

## Environment Requirements

- Bun (primary) or Node.js 18+ with tsx
- tmux (required for `claude` tool)
- `ANTHROPIC_API_KEY` for claudeSdk and checklist tools
- `LINEAR_API_KEY` (optional) for Linear tools

## Code Conventions

- **No `any` type**: Use `unknown` in worst case, prefer proper types or generics
- **No eslint disabling**: Fix type issues properly
- **index.ts files**: Only for re-exporting, never contain logic
- **Strict null checks**: Handle undefined explicitly
- **Type guards**: Use `isLangGraphWorkflow()`, `isOk()`, `isErr()` patterns
