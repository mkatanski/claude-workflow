# LangGraph Migration Guide

## Your YAML vs LangGraph TypeScript

This document shows how your current workflow patterns map to LangGraph.

---

## 1. Control Flow Comparison

### Your `goto` + `when` → LangGraph Conditional Edges

**YAML (current):**
```yaml
- name: "Check if milestone mode"
  tool: goto
  target: "milestone_mode_start"
  when: "{workflow_mode} == milestone"

- name: "simple_mode_start"
  # ... simple mode steps ...

- name: "milestone_mode_start"
  # ... milestone mode steps ...
```

**LangGraph:**
```typescript
function routeByMode(state: WorkflowStateType): "simple_mode" | "milestone_mode" {
  return state.workflowMode === "milestone" ? "milestone_mode" : "simple_mode";
}

workflow
  .addConditionalEdges("analyze_scope", routeByMode, {
    simple_mode: "simple_mode",
    milestone_mode: "milestone_mode",
  });
```

---

### Your `foreach` loop → LangGraph Cycle

**YAML (current):**
```yaml
- name: "story_loop_init"
  tool: set
  var: current_story_index
  value: "0"

- name: "story_loop_start"
  # ...

- name: "Check if all stories done"
  tool: bash
  command: |
    if [ "{current_story_index}" -ge "{stories_count}" ]; then
      echo "all_done"
    fi
  output_var: stories_loop_status

- name: "Jump to post-stories phase"
  tool: goto
  target: "post_stories_phase"
  when: "{stories_loop_status} == all_done"

# ... story implementation ...

- name: "increment_story_index"
  tool: bash
  command: "echo $(( {current_story_index} + 1 ))"
  output_var: current_story_index

- name: "Continue story loop"
  tool: goto
  target: "story_loop_start"
```

**LangGraph:**
```typescript
function shouldContinueStories(state: WorkflowStateType): "implement_story" | "post_stories" {
  if (state.currentStoryIndex >= state.stories.length) {
    return "post_stories";
  }
  return "implement_story";
}

async function storyComplete(state: WorkflowStateType): Promise<Partial<WorkflowStateType>> {
  return {
    currentStoryIndex: state.currentStoryIndex + 1, // Increment happens in state
  };
}

workflow
  .addConditionalEdges("story_complete", shouldContinueStories, {
    implement_story: "implement_story", // Loop back
    post_stories: "check_drift",        // Exit loop
  });
```

---

### Your `retry` loop → LangGraph Cycle with Max Check

**YAML (current):**
```yaml
- name: "test_loop_start"
  # Run tests

- name: "Tests passed - continue"
  tool: goto
  target: "story_complete"
  when: "{test_status} == passed"

- name: "Increment test retry"
  tool: bash
  command: "echo $(( {test_retry_count} + 1 ))"
  output_var: test_retry_count

- name: "Check max test retries"
  tool: bash
  command: |
    if [ "{test_retry_count}" -ge "{max_test_retries}" ]; then
      echo "exceeded"
    fi
  output_var: retry_status

- name: "Max retries exceeded"
  tool: goto
  target: "story_complete"
  when: "{retry_status} == exceeded"

- name: "Fix failing tests"
  # ... fix tests ...

- name: "Retry tests"
  tool: goto
  target: "test_loop_start"
```

**LangGraph:**
```typescript
function routeTestResult(state: WorkflowStateType): "story_complete" | "fix_tests" | "story_complete_failed" {
  if (state.testsPassed) {
    return "story_complete";
  }
  if (state.testRetryCount >= state.maxTestRetries) {
    return "story_complete_failed"; // Max retries exceeded
  }
  return "fix_tests";
}

async function fixTests(state: WorkflowStateType): Promise<Partial<WorkflowStateType>> {
  // ... fix tests ...
  return { testRetryCount: state.testRetryCount + 1 };
}

workflow
  .addConditionalEdges("run_tests", routeTestResult, {
    story_complete: "story_complete",
    fix_tests: "fix_tests",
    story_complete_failed: "story_complete",
  })
  .addEdge("fix_tests", "run_tests"); // Loop back to retry
```

---

## 2. Tool Mapping

| Your Tool | LangGraph Equivalent |
|-----------|---------------------|
| `tool: set` | Return new state: `return { varName: value }` |
| `tool: bash` | `async function` with `execAsync()` |
| `tool: claude` | `async function` calling Claude API |
| `tool: claude_sdk` | `async function` with structured output |
| `tool: json` | TypeScript JSON parsing (native) |
| `tool: goto` | `addConditionalEdges()` routing function |
| `tool: foreach` | Graph cycle with index in state |
| `tool: while` | Graph cycle with condition check |
| `tool: retry` | Graph cycle with attempt counter |
| `tool: break` | Return state that routes to exit |
| `tool: continue` | Return state that skips to next iteration |
| `uses: builtin:xxx` | Reusable async functions |
| `when: condition` | Conditional edge routing function |

---

## 3. State Management

**YAML (string variables with interpolation):**
```yaml
vars:
  current_story_index: "0"
  stories_count: "5"

steps:
  - name: "Check"
    tool: bash
    command: |
      if [ "{current_story_index}" -ge "{stories_count}" ]; then
        echo "done"
      fi
```

**LangGraph (typed state):**
```typescript
const WorkflowState = Annotation.Root({
  currentStoryIndex: Annotation<number>({ default: () => 0 }),
  stories: Annotation<Story[]>({ default: () => [] }),
});

// Access is type-safe
function checkDone(state: WorkflowStateType) {
  return state.currentStoryIndex >= state.stories.length;
}
```

---

## 4. Persistence / Checkpointing

**YAML (current - debug context only):**
```yaml
on_error:
  capture_context: true
  save_to: ".claude/workflow_debug"
```

**LangGraph (built-in checkpointing):**
```typescript
import { MemorySaver } from "@langchain/langgraph";

// Memory-based (development)
const checkpointer = new MemorySaver();

// Or SQLite-based (production)
// import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
// const checkpointer = SqliteSaver.fromConnString("./workflow.db");

const app = workflow.compile({ checkpointer });

// Run with thread ID
const result = await app.invoke(state, {
  configurable: { thread_id: "epic-123" }
});

// Later: resume from checkpoint
const resumed = await app.invoke(null, {
  configurable: { thread_id: "epic-123" }
});
```

---

## 5. Graph Visualization

Your YAML workflow as a LangGraph:

```
                    ┌─────────────────┐
                    │      START      │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │      setup      │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  analyze_scope  │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │ routeByMode                 │
              ▼                             ▼
     ┌────────────────┐           ┌────────────────┐
     │  simple_mode   │           │ milestone_mode │
     └───────┬────────┘           └───────┬────────┘
             │                            │
             └──────────┬─────────────────┘
                        │
               ┌────────▼────────┐
               │    git_setup    │
               └────────┬────────┘
                        │
         ┌──────────────┴──────────────┐
         │ (milestone mode)            │ (simple mode)
         ▼                             ▼
┌─────────────────┐           ┌─────────────────┐
│process_milestone│           │                 │
└────────┬────────┘           │                 │
         │                    │                 │
         └──────────┬─────────┘                 │
                    │                           │
           ┌────────▼────────┐                  │
           │ implement_story │◄─────────────────┘
           └────────┬────────┘
                    │
           ┌────────▼────────┐
           │    run_tests    │◄──────────┐
           └────────┬────────┘           │
                    │                    │
         ┌──────────┴──────────┐         │
         │routeTestResult      │         │
         ▼                     ▼         │
┌─────────────────┐   ┌─────────────┐    │
│  story_complete │   │  fix_tests  │────┘
└────────┬────────┘   └─────────────┘
         │
         │ shouldContinueStories
         │
    ┌────┴────┐
    │         │
    ▼         ▼
implement  ┌───────────┐
_story     │check_drift│◄──────┐
(loop)     └─────┬─────┘       │
                 │             │
          ┌──────┴──────┐      │
          │routeDrift   │      │
          ▼             ▼      │
    ┌───────────┐ ┌─────────┐  │
    │ update_   │ │fix_drift│──┘
    │architecture│ └─────────┘
    └─────┬─────┘
          │
          │ routeAfterPostStories
          │
    ┌─────┴─────┐
    ▼           ▼
milestone   ┌──────────────┐
_commit     │ finalization │
    │       └──────┬───────┘
    │              │
    │ shouldContinue
    │ Milestones
    │              │
    ▼              ▼
process_        ┌─────┐
milestone       │ END │
(loop)          └─────┘
```

---

## 6. What You Gain

| Feature | Your Engine | LangGraph |
|---------|-------------|-----------|
| Type safety | ❌ String interpolation | ✅ Full TypeScript |
| Checkpointing | ⚠️ Debug only | ✅ Built-in, multiple backends |
| Visualization | ❌ None | ✅ Built-in graph viz |
| Resume from failure | ❌ Manual | ✅ Automatic |
| Human-in-the-loop | ⚠️ Manual | ✅ `interrupt()` API |
| Streaming | ❌ None | ✅ Built-in streaming |
| Debugging | ⚠️ tmux logs | ✅ LangSmith integration |
| Graph inspection | ❌ None | ✅ `app.getGraph()` |

---

## 7. What You Lose

| Feature | Your Engine | LangGraph |
|---------|-------------|-----------|
| YAML definitions | ✅ Declarative | ❌ Code-only |
| Shared steps (uses:) | ✅ Built-in | ⚠️ Functions/subgraphs |
| Tmux integration | ✅ Built-in | ⚠️ Must implement |
| Checklist tool | ✅ Built-in | ⚠️ Must implement |
| Linear integration | ✅ Built-in | ⚠️ Must implement |

---

## 8. Migration Strategy

### Phase 1: Core Engine (1 week)
1. Set up LangGraph TypeScript project
2. Implement state type definitions
3. Create utility functions (bash, file I/O)
4. Implement Claude integration nodes

### Phase 2: Node Migration (1-2 weeks)
1. Convert each YAML step to a node function
2. Map `goto` + `when` to conditional edges
3. Implement loop patterns as graph cycles

### Phase 3: Tool Wrappers (1 week)
1. Create reusable tool functions (lint, test, git)
2. Implement Claude Code integration
3. Add checkpointing with SQLite

### Phase 4: Testing & Polish (1 week)
1. Test workflow end-to-end
2. Add LangSmith observability
3. Create graph visualization

---

## 9. Decision: Should You Migrate?

### Migrate if:
- You want automatic checkpointing/resume
- You want better debugging (LangSmith)
- You're comfortable with code-first workflows
- You want type safety

### Keep current if:
- YAML definitions are important to you
- You need the tmux/visual execution
- Migration effort is too high
- Current solution works well enough

---

## 10. Alternative: Hybrid Approach

Keep YAML definitions but add LangGraph for orchestration:

```typescript
// Parse your YAML
const workflow = loadYamlWorkflow("epic.workflow.yaml");

// Convert to LangGraph at runtime
const graph = convertToLangGraph(workflow);

// Run with LangGraph benefits
const result = await graph.invoke(state, { checkpointer });
```

This gives you:
- ✅ Keep YAML definitions
- ✅ LangGraph checkpointing
- ✅ LangGraph debugging
- ⚠️ More complex runtime
