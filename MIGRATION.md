# Migration Guide: WorkflowBuilder → LangGraph API

This guide helps you migrate from the deprecated WorkflowBuilder API to the new LangGraph-based workflow system.

## Why Migrate?

The WorkflowBuilder API (`t.step()`, `t.bash()`, etc.) is being deprecated in favor of the more powerful and flexible LangGraph-based architecture. The new API provides:

- ✅ **Type-safe state management** - No more string interpolation errors
- ✅ **Native graph visualization** - Built-in workflow visualization
- ✅ **Conditional routing** - Clean, typed routing logic instead of `goto` and `when`
- ✅ **Checkpointing & resumability** - Pause and resume workflows automatically
- ✅ **Better debugging** - LangSmith integration for observability
- ✅ **Graph cycles for loops** - Native loop patterns without manual iteration

## Quick Comparison

### Legacy WorkflowBuilder API (Deprecated)

```typescript
import type { WorkflowBuilder } from "../../../src/types/index.ts";

export default (t: WorkflowBuilder) => ({
  name: "Example Workflow",

  vars: {
    greeting: "Hello",
    target: "World",
  },

  claude: {
    model: "sonnet",
    dangerouslySkipPermissions: true,
  },

  steps: [
    t.step("Get current date", t.bash("date"), { output: "currentDate" }),
    t.step("Build message", t.set("message", "{greeting}, {target}! Today is {currentDate}")),
    t.step("Show message", t.bash("echo '{message}'")),
  ],
});
```

### New LangGraph API (Current)

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

  vars: {
    greeting: "Hello",
    target: "World",
  },

  claude: claudeConfig,

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

    // Node: Build and show message
    graph.addNode("show_message", async (state, tools) => {
      const message = `${state.greeting}, ${state.target}! Today is ${state.currentDate}`;
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

## Migration Steps

### Step 1: Update Imports

**Before:**
```typescript
import type { WorkflowBuilder } from "../../../src/types/index.ts";
```

**After:**
```typescript
import type { LangGraphWorkflowDefinition } from "../../../src/core/graph/types.ts";
import type { ClaudeConfig, TmuxConfig } from "../../../src/types/index.ts";
import { START, END } from "@langchain/langgraph";
```

### Step 2: Change Export Pattern

**Before:**
```typescript
export default (t: WorkflowBuilder) => ({
  name: "My Workflow",
  steps: [...],
});
```

**After:**
```typescript
const workflow: LangGraphWorkflowDefinition = {
  name: "My Workflow",
  build(graph) {
    // Add nodes and edges
  },
};

export default () => workflow;
```

### Step 3: Extract Configuration

Move configuration objects outside the workflow definition for clarity.

**Before:**
```typescript
export default (t: WorkflowBuilder) => ({
  claude: {
    model: "sonnet",
    dangerouslySkipPermissions: true,
  },
  // ...
});
```

**After:**
```typescript
const claudeConfig: ClaudeConfig = {
  model: "sonnet",
  dangerouslySkipPermissions: true,
};

const workflow: LangGraphWorkflowDefinition = {
  claude: claudeConfig,
  // ...
};
```

### Step 4: Convert Steps to Nodes

Each `t.step()` becomes a `graph.addNode()` call in the `build` function.

**Before:**
```typescript
steps: [
  t.step("Run tests", t.bash("bun test"), { output: "testResult" }),
]
```

**After:**
```typescript
build(graph) {
  graph.addNode("run_tests", async (state, tools) => {
    const result = await tools.bash("bun test");
    return {
      variables: {
        testResult: result.output
      }
    };
  });
}
```

### Step 5: Define Graph Edges

Connect nodes using `addEdge()` to define execution flow.

```typescript
build(graph) {
  // Add all nodes first
  graph.addNode("step1", async (state, tools) => { /* ... */ });
  graph.addNode("step2", async (state, tools) => { /* ... */ });

  // Then define the flow
  graph.addEdge(START, "step1");  // Start → step1
  graph.addEdge("step1", "step2"); // step1 → step2
  graph.addEdge("step2", END);     // step2 → End
}
```

## Pattern Migrations

### Pattern 1: Simple Bash Commands

**Before:**
```typescript
t.step("Install dependencies", t.bash("bun install"))
```

**After:**
```typescript
graph.addNode("install_deps", async (state, tools) => {
  await tools.bash("bun install");
  return {};
});
```

### Pattern 2: Capturing Output

**Before:**
```typescript
t.step("Get version", t.bash("node --version"), { output: "nodeVersion" })
```

**After:**
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

### Pattern 3: Using Variables

**Before:**
```typescript
vars: {
  message: "Hello",
},
steps: [
  t.step("Echo message", t.bash("echo '{message}'")),
]
```

**After:**
```typescript
vars: {
  message: "Hello",
},
build(graph) {
  graph.addNode("echo_message", async (state, tools) => {
    await tools.bash(`echo '${state.message}'`);
    return {};
  });
}
```

### Pattern 4: Setting Variables

**Before:**
```typescript
t.step("Set counter", t.set("counter", "0"))
```

**After:**
```typescript
graph.addNode("set_counter", async (state, tools) => {
  return {
    variables: {
      counter: 0
    }
  };
});
```

### Pattern 5: Conditional Execution

**Before:**
```typescript
t.step("Deploy to prod", t.bash("./deploy.sh"), {
  when: "{environment} == production",
})
```

**After:**
```typescript
// Use conditional edges for routing
function routeByEnvironment(state) {
  return state.environment === "production" ? "deploy" : "skip_deploy";
}

graph.addNode("deploy", async (state, tools) => {
  await tools.bash("./deploy.sh");
  return {};
});

graph.addNode("skip_deploy", async (state, tools) => {
  return {};
});

graph.addConditionalEdges("check_env", routeByEnvironment, {
  deploy: "deploy",
  skip_deploy: "skip_deploy",
});
```

### Pattern 6: JSON Operations

**Before:**
```typescript
t.step("Parse JSON", t.json("query", {
  input: "{jsonData}",
  query: "name",
}), { output: "extractedName" })
```

**After:**
```typescript
graph.addNode("parse_json", async (state, tools) => {
  const data = JSON.parse(state.jsonData);
  return {
    variables: {
      extractedName: data.name
    }
  };
});
```

### Pattern 7: Claude SDK (Structured Output)

**Before:**
```typescript
t.step("Analyze code", t.claudeSdk({
  prompt: "Analyze this code: {code}",
  outputType: "json",
  schema: {
    issues: "array",
    score: "number",
  },
}), { output: "analysis" })
```

**After:**
```typescript
import { z } from "zod";

// Define schema
const AnalysisSchema = z.object({
  issues: z.array(z.string()),
  score: z.number(),
});

graph.addNode("analyze_code", async (state, tools) => {
  const result = await tools.claudeSdk({
    systemPrompt: `Analyze this code: ${state.code}`,
    schema: AnalysisSchema,
  });
  return {
    variables: {
      analysis: result
    }
  };
});
```

### Pattern 8: Loops (forEach)

**Before:**
```typescript
t.forEach("{files}", "file", [
  t.step("Process file", t.bash("cat {file}")),
])
```

**After:**
```typescript
// Use graph cycles with conditional routing
function shouldContinueLoop(state) {
  return state.currentIndex < state.files.length ? "process_file" : "done";
}

graph.addNode("process_file", async (state, tools) => {
  const file = state.files[state.currentIndex];
  await tools.bash(`cat ${file}`);
  return {
    variables: {
      currentIndex: state.currentIndex + 1
    }
  };
});

graph.addConditionalEdges("check_loop", shouldContinueLoop, {
  process_file: "process_file",
  done: END,
});

// Create the loop back edge
graph.addEdge("process_file", "check_loop");
```

### Pattern 9: Retry Logic

**Before:**
```typescript
t.retry({
  maxAttempts: 3,
}, [
  t.step("Run flaky test", t.bash("bun test flaky.test.ts")),
])
```

**After:**
```typescript
function shouldRetry(state) {
  if (state.testPassed) {
    return "success";
  }
  if (state.attempts >= 3) {
    return "failed";
  }
  return "retry";
}

graph.addNode("run_test", async (state, tools) => {
  const result = await tools.bash("bun test flaky.test.ts");
  return {
    variables: {
      testPassed: result.success,
      attempts: state.attempts + 1,
    }
  };
});

graph.addNode("success", async (state, tools) => {
  return {};
});

graph.addNode("failed", async (state, tools) => {
  throw new Error("Test failed after 3 attempts");
});

graph.addConditionalEdges("run_test", shouldRetry, {
  success: "success",
  retry: "run_test", // Loop back
  failed: "failed",
});
```

## Type Safety & State Management

### Defining Typed State

For complex workflows, define a typed state interface:

```typescript
import { Annotation } from "@langchain/langgraph";

// Define state schema
const WorkflowState = Annotation.Root({
  // Primitive types
  counter: Annotation<number>({ default: () => 0 }),
  message: Annotation<string>({ default: () => "" }),

  // Arrays
  files: Annotation<string[]>({ default: () => [] }),

  // Objects
  config: Annotation<{ env: string; debug: boolean }>({
    default: () => ({ env: "dev", debug: false }),
  }),
});

type WorkflowStateType = typeof WorkflowState.State;

// Use in build function
build(graph) {
  graph.addNode("process", async (state: WorkflowStateType, tools) => {
    // state is now fully typed!
    const count = state.counter + 1;
    return { variables: { counter: count } };
  });
}
```

### Accessing State Variables

**Before (string interpolation):**
```typescript
t.bash("echo '{counter}'")
```

**After (type-safe access):**
```typescript
async (state, tools) => {
  await tools.bash(`echo '${state.counter}'`);
}
```

## Common Patterns

### Pattern: Linear Workflow

```typescript
build(graph) {
  // Define nodes
  graph.addNode("step1", async (state, tools) => { /* ... */ });
  graph.addNode("step2", async (state, tools) => { /* ... */ });
  graph.addNode("step3", async (state, tools) => { /* ... */ });

  // Linear flow
  graph.addEdge(START, "step1");
  graph.addEdge("step1", "step2");
  graph.addEdge("step2", "step3");
  graph.addEdge("step3", END);
}
```

### Pattern: Branching Workflow

```typescript
build(graph) {
  // Router function
  function routeByMode(state) {
    return state.mode === "fast" ? "fast_path" : "thorough_path";
  }

  // Define nodes
  graph.addNode("analyze", async (state, tools) => { /* ... */ });
  graph.addNode("fast_path", async (state, tools) => { /* ... */ });
  graph.addNode("thorough_path", async (state, tools) => { /* ... */ });
  graph.addNode("finalize", async (state, tools) => { /* ... */ });

  // Branching flow
  graph.addEdge(START, "analyze");
  graph.addConditionalEdges("analyze", routeByMode, {
    fast_path: "fast_path",
    thorough_path: "thorough_path",
  });
  graph.addEdge("fast_path", "finalize");
  graph.addEdge("thorough_path", "finalize");
  graph.addEdge("finalize", END);
}
```

### Pattern: Loop with Exit Condition

```typescript
build(graph) {
  // Exit condition
  function checkComplete(state) {
    return state.done ? "complete" : "continue";
  }

  // Loop body
  graph.addNode("process_item", async (state, tools) => {
    // Process current item
    const done = state.currentIndex >= state.items.length;
    return {
      variables: {
        currentIndex: state.currentIndex + 1,
        done
      }
    };
  });

  // Loop control
  graph.addEdge(START, "process_item");
  graph.addConditionalEdges("process_item", checkComplete, {
    continue: "process_item", // Loop back
    complete: END,
  });
}
```

## Tool Reference

### Available Tools

The `tools` parameter in node functions provides these methods:

| Tool | Description | Example |
|------|-------------|---------|
| `bash(cmd)` | Execute shell command | `await tools.bash("ls -la")` |
| `claudeSdk(config)` | Call Claude with structured output | `await tools.claudeSdk({ systemPrompt, schema })` |
| `setVar(name, value)` | Set state variable | `tools.setVar("counter", 42)` |
| `getVar(name)` | Get state variable | `tools.getVar("counter")` |

### Tool: bash

```typescript
const result = await tools.bash("bun test");

// result.success: boolean
// result.output: string | undefined
// result.error: string | undefined
```

### Tool: claudeSdk

```typescript
import { z } from "zod";

const schema = z.object({
  summary: z.string(),
  score: z.number(),
});

const result = await tools.claudeSdk({
  systemPrompt: "Analyze this code",
  schema,
  maxRetries: 3,
});

// result is typed according to schema
```

## Configuration Reference

### Claude Configuration

```typescript
const claudeConfig: ClaudeConfig = {
  model: "sonnet" | "opus" | "haiku",
  interactive: boolean,
  dangerouslySkipPermissions: boolean,
  cwd: string,
  permissionMode: string,
  allowedTools: string[],
  autoApprovePlan: boolean,
  appendSystemPrompt: string,
};
```

### Tmux Configuration

```typescript
const tmuxConfig: TmuxConfig = {
  newWindow: boolean,
  split: "vertical" | "horizontal",
  idleTime: number, // seconds
};
```

### Claude SDK Configuration

```typescript
const claudeSdkConfig: ClaudeSdkConfig = {
  systemPrompt: string,
  model: string,
};
```

## Complete Example

Here's a complete side-by-side comparison:

### Legacy WorkflowBuilder (Deprecated)

```typescript
import type { WorkflowBuilder } from "../../../src/types/index.ts";

export default (t: WorkflowBuilder) => ({
  name: "CI Pipeline",

  vars: {
    environment: "production",
    testsPassed: false,
  },

  claude: {
    model: "sonnet",
    dangerouslySkipPermissions: true,
  },

  steps: [
    t.step("Install deps", t.bash("bun install")),
    t.step("Run tests", t.bash("bun test"), { output: "testResult" }),
    t.step("Set test status", t.set("testsPassed", "true"), {
      when: "{testResult} contains 'All tests passed'",
    }),
    t.step("Deploy", t.bash("./deploy.sh"), {
      when: "{testsPassed} == true AND {environment} == production",
    }),
  ],
});
```

### New LangGraph API (Current)

```typescript
import type { LangGraphWorkflowDefinition } from "../../../src/core/graph/types.ts";
import type { ClaudeConfig } from "../../../src/types/index.ts";
import { START, END } from "@langchain/langgraph";

const claudeConfig: ClaudeConfig = {
  model: "sonnet",
  dangerouslySkipPermissions: true,
};

const initialVars = {
  environment: "production",
  testsPassed: false,
};

const workflow: LangGraphWorkflowDefinition = {
  name: "CI Pipeline",
  vars: initialVars,
  claude: claudeConfig,

  build(graph) {
    // Install dependencies
    graph.addNode("install_deps", async (state, tools) => {
      await tools.bash("bun install");
      return {};
    });

    // Run tests
    graph.addNode("run_tests", async (state, tools) => {
      const result = await tools.bash("bun test");
      const testsPassed = result.output?.includes("All tests passed") || false;
      return {
        variables: {
          testsPassed,
          testResult: result.output,
        }
      };
    });

    // Deploy (only if tests passed and environment is production)
    graph.addNode("deploy", async (state, tools) => {
      await tools.bash("./deploy.sh");
      return {};
    });

    // Skip deployment
    graph.addNode("skip_deploy", async (state, tools) => {
      console.log("Skipping deployment");
      return {};
    });

    // Routing logic
    function shouldDeploy(state) {
      return state.testsPassed && state.environment === "production"
        ? "deploy"
        : "skip_deploy";
    }

    // Define flow
    graph.addEdge(START, "install_deps");
    graph.addEdge("install_deps", "run_tests");
    graph.addConditionalEdges("run_tests", shouldDeploy, {
      deploy: "deploy",
      skip_deploy: "skip_deploy",
    });
    graph.addEdge("deploy", END);
    graph.addEdge("skip_deploy", END);
  },
};

export default () => workflow;
```

## Troubleshooting

### Issue: "Cannot find module '@langchain/langgraph'"

**Solution:** Ensure dependencies are installed:
```bash
bun install
```

### Issue: "graph.addNode is not a function"

**Solution:** Make sure you're using the `build` function pattern:
```typescript
build(graph) {
  // graph is the WorkflowGraph instance
  graph.addNode(...);
}
```

### Issue: Type errors with state access

**Solution:** Define a typed state interface using `Annotation`:
```typescript
import { Annotation } from "@langchain/langgraph";

const WorkflowState = Annotation.Root({
  myVar: Annotation<string>({ default: () => "" }),
});
```

## Getting Help

- Check the [epic-to-implementation-v3 workflow](.cw/workflows/epic-to-implementation-v3/workflow.ts) for a complex real-world example
- Review [LangGraph documentation](https://langchain-ai.github.io/langgraphjs/)
- See the [example workflow](examples/.cw/workflows/example.ts) for patterns

## Next Steps

1. ✅ Read this migration guide
2. ✅ Study the example workflows
3. ✅ Convert one workflow as a test
4. ✅ Update remaining workflows
5. ✅ Remove legacy `.workflow.ts` files

The new LangGraph API provides a more powerful, type-safe foundation for building complex workflows. While the migration requires some effort, the benefits of type safety, better debugging, and native graph features make it worthwhile.
