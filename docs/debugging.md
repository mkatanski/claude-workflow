# Workflow Debugging Guide

This guide covers the debugging capabilities in claude-workflow, including CLI debug mode, breakpoints, variable inspection, execution replay, and VS Code integration.

## Overview

Debugging AI workflows is challenging because execution flows through multiple nodes with complex state transformations. Claude-workflow provides comprehensive debugging tools that let you:

- **Step through execution** - Pause and advance node-by-node to understand the workflow
- **Set breakpoints** - Stop execution at specific nodes, events, or conditions
- **Inspect variables** - Examine workflow state at any point during execution
- **Record and replay** - Save execution traces and replay from any checkpoint
- **Debug in VS Code** - Use the Debug Adapter Protocol (DAP) for IDE integration

These features integrate with the existing event-based observability system to provide detailed execution traces without modifying your workflow code.

## Quick Start

### Enable Debug Mode

Run any workflow with the `--debug` flag:

```bash
bun run src/cli/main.ts run my-workflow --debug
```

This starts an interactive debug session with a prompt:

```
Debug> [s]tep, [c]ontinue, [i]nspect, [q]uit
```

### Basic Debug Commands

- `s` or `step` - Execute the next node and pause
- `c` or `continue` - Resume execution until next breakpoint
- `i` or `inspect` - Show all variables
- `q` or `quit` - Stop debugging and exit

### Example Session

```bash
$ bun run src/cli/main.ts run debug-example --debug

🔍 Debug Mode Active
Workflow: Debug Example Workflow

Debug> step
▶ Executing node: initialize
Variables: { status: "initialized", startTime: 1705518000 }

Debug> step
▶ Executing node: processInput
Variables: { inputValue: 42, doubled: 84, squared: 1764, processed: true }

Debug> inspect doubled
doubled: 84 (number)

Debug> continue
✓ Workflow completed successfully
```

## CLI Debug Mode

### Starting a Debug Session

When you run a workflow with `--debug`, the debugger:

1. Initializes the debugging engine
2. Sets up the interactive debug renderer
3. Pauses execution before the first node
4. Waits for your commands

### Execution Control

The debugger provides fine-grained execution control:

#### Step Over

Execute the current node and pause at the next one:

```
Debug> step
Debug> s           # shorthand
```

This is the most common way to trace through your workflow node by node.

#### Step Into

For nested workflows or complex node implementations, step into the execution:

```
Debug> step-into
Debug> si          # shorthand
```

This pauses inside the node's execution function, allowing you to debug the node logic itself.

#### Step Out

Complete the current node context and pause after:

```
Debug> step-out
Debug> so          # shorthand
```

Useful when you've stepped into a complex node and want to quickly complete it.

#### Continue

Resume execution until the next breakpoint or completion:

```
Debug> continue
Debug> c           # shorthand
```

#### Pause

Pause execution at the next node boundary:

```
Debug> pause
Debug> p           # shorthand
```

Execution will stop before the next node begins.

## Breakpoints

Breakpoints let you pause execution at specific points without manually stepping through every node.

### Node Breakpoints

Pause when a specific node is about to execute:

```typescript
import { createDebugger } from './src/core/debugger';

const debugger = createDebugger();
await debugger.start({ enabled: true });

// Break before node execution
debugger.addBreakpoint({
  type: 'node',
  nodeId: 'processInput',
  timing: 'before'
});

// Break after node execution
debugger.addBreakpoint({
  type: 'node',
  nodeId: 'validateData',
  timing: 'after'
});
```

### Event Breakpoints

Pause when specific events are emitted:

```typescript
// Break on specific event type
debugger.addBreakpoint({
  type: 'event',
  eventType: 'workflow:node:complete'
});

// Break on event pattern with wildcards
debugger.addBreakpoint({
  type: 'event',
  eventType: 'debug:*'  // Match all debug events
});
```

Common event patterns:
- `workflow:*` - All workflow events
- `workflow:node:*` - All node events
- `debug:breakpoint:*` - All debug breakpoint events
- `workflow:error` - Workflow errors

### Conditional Breakpoints

Pause only when a condition is true:

```typescript
// Break when a variable reaches a threshold
debugger.addBreakpoint({
  type: 'node',
  nodeId: 'calculateMetrics',
  condition: 'state.variables.count > 100',
  timing: 'before'
});

// Break on complex conditions
debugger.addBreakpoint({
  type: 'node',
  nodeId: 'router',
  condition: 'state.variables.validationPassed === false && state.variables.retryCount > 3',
  timing: 'before'
});
```

Conditions are evaluated as JavaScript expressions in the context of the workflow state.

### Exception Breakpoints

Pause when errors occur:

```typescript
// Break on all exceptions
debugger.addBreakpoint({
  type: 'exception',
  mode: 'all'
});

// Break only on uncaught exceptions
debugger.addBreakpoint({
  type: 'exception',
  mode: 'uncaught'
});
```

Exception breakpoints help you catch errors before they propagate, letting you inspect the state that caused the failure.

### Logpoints

Log information without pausing execution:

```typescript
debugger.addBreakpoint({
  type: 'node',
  nodeId: 'processInput',
  logMessage: 'Processing input: {inputValue}, doubled: {doubled}',
  timing: 'after'
});
```

Logpoints print to the debug console but don't interrupt execution. Variable substitution uses `{variableName}` syntax.

### Managing Breakpoints

```typescript
import { createNodeBreakpoint, createEventBreakpoint, createExceptionBreakpoint } from './src/core/debugger';

// Create and add breakpoints using factory functions
const bp1 = createNodeBreakpoint('validateData', 'before');
const bp2 = createEventBreakpoint('workflow:error');
const bp3 = createExceptionBreakpoint('all');

debugger.addBreakpoint(bp1);
debugger.addBreakpoint(bp2);
debugger.addBreakpoint(bp3);

// Remove specific breakpoint
debugger.removeBreakpoint(bp1.id);

// Remove all breakpoints
debugger.clearAllBreakpoints();

// Toggle breakpoint state
debugger.toggleBreakpoint(bp2.id);
```

## Variable Inspection

The variable inspector provides deep insight into workflow state at any point during execution.

### Inspect All Variables

View all variables in scope:

```
Debug> inspect
```

Output:
```
Workflow Variables:
  status: "initialized" (string)
  startTime: 1705518000 (number)
  inputValue: 42 (number)
  doubled: 84 (number)
  squared: 1764 (number)
  processed: true (boolean)
```

### Inspect Specific Variables

```
Debug> inspect inputValue
inputValue: 42 (number)

Debug> inspect status
status: "initialized" (string)
```

### Inspect Nested Objects

Use dot notation to access nested properties:

```
Debug> inspect state.variables
{
  status: "initialized",
  startTime: 1705518000,
  inputValue: 42,
  doubled: 84,
  squared: 1764
}

Debug> inspect metadata.executionTime
metadata.executionTime: 5 (number)
```

### Pattern Matching

Use wildcards to match multiple variables:

```
Debug> inspect input*
inputValue: 42 (number)
inputData: {...} (object)

Debug> inspect *Time
startTime: 1705518000 (number)
executionTime: 5 (number)
```

### Programmatic Inspection

```typescript
// Inspect all variables
const allVars = debugger.inspectVariables();

// Inspect specific variable
const value = debugger.inspectVariables({ pattern: 'inputValue' });

// Inspect with pattern
const timeVars = debugger.inspectVariables({ pattern: '*Time' });

// Inspect from specific scope
const nodeVars = debugger.inspectVariables({ scope: 'node' });
```

### Scopes

Variables are organized into three scopes:

1. **Workflow Scope** - Variables shared across the entire workflow
2. **Node Scope** - Variables local to the current node
3. **Local Scope** - Temporary variables within node execution

```typescript
// Inspect specific scope
const workflowVars = debugger.inspectVariables({ scope: 'workflow' });
const nodeVars = debugger.inspectVariables({ scope: 'node' });
const localVars = debugger.inspectVariables({ scope: 'local' });
```

### Type Detection

The inspector identifies all JavaScript types:

- **Primitives**: `string`, `number`, `boolean`, `null`, `undefined`
- **Objects**: `object`, `array`, `function`
- **Built-ins**: `Date`, `RegExp`, `Error`, `Map`, `Set`
- **Custom types**: Displays constructor name

### Expanding Complex Objects

Objects and arrays can be expanded to show nested structure:

```typescript
// Inspect with depth limit
const vars = debugger.inspectVariables({
  pattern: 'config',
  maxDepth: 3  // Expand up to 3 levels deep
});
```

## Execution Replay and Traces

Record workflow execution and replay from any checkpoint to debug failures or test different scenarios.

### Recording Execution

Enable execution recording when starting the debugger:

```typescript
const debugger = createDebugger();
await debugger.start({
  enabled: true,
  recordExecution: true  // Enable trace recording
});
```

The debugger automatically creates checkpoints at:
- Workflow start
- Before each node execution
- After each node execution
- Before workflow completion
- On exceptions

### Saving Traces

After workflow execution, save the trace to a file:

```typescript
// Save to JSON file
await debugger.saveTrace('./traces/execution-trace.json');
```

Trace files contain:
- Execution metadata (workflow name, execution ID, timestamps)
- All checkpoints with timestamps and variable snapshots
- All events emitted during execution
- Success/failure status

### Trace File Structure

```json
{
  "workflowName": "Debug Example Workflow",
  "executionId": "exec-abc123",
  "startTime": 1705518000,
  "endTime": 1705518010,
  "success": true,
  "checkpoints": [
    {
      "id": "checkpoint-1",
      "sequence": 0,
      "nodeId": "initialize",
      "timestamp": 1705518001,
      "variables": {
        "status": "initialized",
        "startTime": 1705518000
      }
    },
    {
      "id": "checkpoint-2",
      "sequence": 1,
      "nodeId": "processInput",
      "timestamp": 1705518003,
      "variables": {
        "inputValue": 42,
        "doubled": 84,
        "squared": 1764
      }
    }
  ],
  "events": [
    {
      "type": "workflow:start",
      "timestamp": 1705518000,
      "payload": {}
    },
    {
      "type": "workflow:node:start",
      "timestamp": 1705518001,
      "payload": { "nodeId": "initialize" }
    }
  ]
}
```

### Loading Traces

Load a previously saved trace into a new debug session:

```typescript
const debugger = createDebugger();
await debugger.start({ enabled: true, recordExecution: true });

// Load trace from file
await debugger.loadTrace('./traces/failed-execution.json');

// Get trace metadata
const trace = debugger.getExecutionTrace();
console.log(`Loaded ${trace.checkpoints.length} checkpoints`);
```

### Replaying from Checkpoints

Replay execution from any checkpoint to debug failures or test different scenarios:

```typescript
// Get all checkpoints
const trace = debugger.getExecutionTrace();
const checkpoints = trace.checkpoints;

// Find checkpoint before failure
const beforeFailure = checkpoints[checkpoints.length - 2];

// Replay from that checkpoint
const state = debugger.replayFromCheckpoint(beforeFailure.id);
console.log('State restored:', state.variables);
```

### Replaying with Variable Overrides

Test different scenarios by overriding variables during replay:

```typescript
// Replay with modified variables
const state = debugger.replayFromCheckpoint(beforeFailure.id, {
  overrides: {
    count: 10,           // Fix the value that caused failure
    enableValidation: false,  // Skip validation
    retryCount: 0        // Reset retry counter
  }
});

// Continue execution with modified state
debugger.continue();
```

This is powerful for debugging:
- Test different input values without re-running from the start
- Skip problematic validations to test downstream logic
- Modify retry counters or timeout values
- Inject test data at specific points

### Finding Checkpoints

Utility functions help locate specific checkpoints:

```typescript
import { findCheckpointByNode, findCheckpointsAfter } from './src/core/debugger';

// Find checkpoint for specific node
const checkpoint = findCheckpointByNode(trace, 'validateData');

// Find all checkpoints after a timestamp
const recent = findCheckpointsAfter(trace, 1705518005);

// Find last successful checkpoint before failure
const lastGood = trace.success ?
  trace.checkpoints[trace.checkpoints.length - 1] :
  trace.checkpoints[trace.checkpoints.length - 2];
```

### Replay Workflow

1. Run workflow to completion or failure
2. Save execution trace
3. Load trace in new debug session
4. Identify checkpoint before issue
5. Replay from checkpoint (optionally with overrides)
6. Step through to debug the issue
7. Save new trace for comparison

## VS Code Integration

The Debug Adapter Protocol (DAP) integration lets you debug workflows directly in VS Code with full IDE support.

### Setup

1. Copy the example launch configuration:

```bash
cp .vscode/launch.json.example .vscode/launch.json
```

2. Open VS Code
3. Go to Run and Debug panel (⇧⌘D / Ctrl+Shift+D)
4. Select a debug configuration from the dropdown
5. Press F5 to start debugging

### Launch Configurations

The example configuration includes several preset configurations:

#### Basic Debugging

```json
{
  "type": "workflow",
  "request": "launch",
  "name": "Debug Workflow",
  "workflowPath": "${workspaceFolder}/examples/.cw/workflows/example.ts",
  "stopOnEntry": false
}
```

#### Stop on Entry

Pause immediately when the workflow starts:

```json
{
  "type": "workflow",
  "request": "launch",
  "name": "Debug Workflow (Stop on Entry)",
  "workflowPath": "${workspaceFolder}/examples/.cw/workflows/example.ts",
  "stopOnEntry": true
}
```

#### Debug Current File

Debug whichever workflow file you currently have open:

```json
{
  "type": "workflow",
  "request": "launch",
  "name": "Debug Current Workflow",
  "workflowPath": "${file}",
  "trace": "${workspaceFolder}/.debug/trace-${fileBasenameNoExtension}.json"
}
```

#### Custom Variables

Pass initial variables to the workflow:

```json
{
  "type": "workflow",
  "request": "launch",
  "name": "Debug with Custom Variables",
  "workflowPath": "${workspaceFolder}/examples/.cw/workflows/example.ts",
  "variables": {
    "env": "development",
    "userId": "test-user-123",
    "config": {
      "timeout": 5000,
      "retries": 3
    }
  }
}
```

### VS Code Features

When debugging in VS Code, you get:

#### Breakpoints

- Click in the gutter to set breakpoints
- Right-click breakpoints to add conditions or logpoints
- Manage all breakpoints in the Breakpoints panel

#### Variables Panel

- Automatically shows workflow variables
- Expand objects and arrays to inspect nested data
- Right-click variables to copy value or add to watch

#### Call Stack

- Shows current execution context
- Displays node ID and execution frame
- Click frames to inspect state at different points

#### Debug Console

- View execution events as they happen
- Evaluate expressions in the current context
- See trace output and log messages

#### Debug Controls

- **Continue (F5)** - Resume execution
- **Step Over (F10)** - Execute current node, pause at next
- **Step Into (F11)** - Step into node implementation
- **Step Out (⇧F11 / Shift+F11)** - Complete current node
- **Restart (⇧⌘F5 / Ctrl+Shift+F5)** - Restart debugging session
- **Stop (⇧F5 / Shift+F5)** - Stop debugging

### Debug Adapter Protocol

The implementation uses the Debug Adapter Protocol (DAP), which means:

- Standard debugging interface across IDEs
- Could be integrated with other DAP-compatible editors
- Supports all DAP features (breakpoints, stepping, inspection)
- Two-way communication between IDE and debugger

For advanced usage or custom IDE integration, see the DAP implementation in `src/core/debugger/vscode-adapter.ts`.

## Best Practices

### When to Use Debug Mode

**Good use cases:**
- Understanding complex workflows with many conditional branches
- Debugging state transformation issues
- Investigating unexpected behavior
- Learning how a workflow executes
- Testing different variable values without changing code

**When not to use:**
- Production environments (use event tracing instead)
- Simple linear workflows (logs may be sufficient)
- Performance testing (debug mode adds overhead)

### Setting Effective Breakpoints

**Do:**
- Set breakpoints at decision points (routers, conditionals)
- Use conditional breakpoints to catch specific scenarios
- Set breakpoints before complex transformations
- Use logpoints for metrics without interrupting execution

**Don't:**
- Set breakpoints on every node (use step-over instead)
- Use complex conditions that might fail to evaluate
- Forget to remove breakpoints before production

### Variable Inspection Strategy

1. **Start broad** - Inspect all variables to understand state
2. **Narrow down** - Use patterns to focus on relevant variables
3. **Go deep** - Expand objects to find the specific issue
4. **Track changes** - Note how variables change between nodes

### Replay Strategy for Debugging Failures

1. **Reproduce the failure** - Run workflow to failure with recording enabled
2. **Save the trace** - Capture the complete execution history
3. **Analyze the trace** - Find where things went wrong
4. **Replay iteratively** - Test fixes by replaying with overrides
5. **Verify the fix** - Run full workflow to ensure fix works end-to-end

### Performance Considerations

Debug mode adds overhead:
- Variable snapshots at each checkpoint (~1-2% per checkpoint)
- Event recording (~0.5% per event)
- Conditional expression evaluation (varies with complexity)

For large workflows:
- Disable recording if you don't need replay: `recordExecution: false`
- Use specific breakpoints instead of stepping through everything
- Increase maxDepth limit only when needed for deep object inspection
- Save traces to disk and analyze offline

## Troubleshooting

### Debug Session Won't Start

**Problem:** Debug mode doesn't activate when using `--debug` flag

**Solutions:**
- Verify workflow file path is correct
- Check for TypeScript compilation errors in workflow file
- Ensure bun runtime is installed: `bun --version`
- Check for syntax errors in workflow: `bun run typecheck`

### Breakpoints Don't Trigger

**Problem:** Execution doesn't pause at breakpoints

**Solutions:**
- Verify node ID matches exactly (case-sensitive)
- Check event pattern uses correct syntax (wildcards: `*`)
- Test conditional expression in isolation
- Ensure breakpoint was set before execution reached that point
- Check if breakpoint is enabled (not disabled or toggled off)

### Variables Not Showing

**Problem:** Variable inspection returns empty or incomplete data

**Solutions:**
- Ensure `recordExecution: true` in debugger config
- Verify node has executed before inspecting its variables
- Check variable names are correct (case-sensitive)
- Use pattern matching if unsure of exact name: `inspect *name*`
- Increase `maxDepth` for deeply nested objects

### Trace File Won't Load

**Problem:** Loading a saved trace fails

**Solutions:**
- Verify file path is correct and file exists
- Check JSON is valid: `cat trace.json | jq .`
- Ensure file was created by compatible debugger version
- Check file permissions allow reading
- Try loading the trace in a JSON viewer to identify corruption

### VS Code Debugging Not Working

**Problem:** Debug session won't start in VS Code

**Solutions:**
- Verify `launch.json` configuration syntax
- Check `workflowPath` points to a valid file
- Ensure workspace folder path is correct
- Check VS Code debug console for error messages
- Try restarting VS Code
- Verify Debug Adapter is registered and running

### Performance Issues

**Problem:** Debug mode is slow or unresponsive

**Solutions:**
- Disable execution recording: `recordExecution: false`
- Use specific breakpoints instead of stepping
- Reduce `maxDepth` for variable inspection
- Clear old breakpoints: `clearAllBreakpoints()`
- Check trace file size isn't too large (>10MB)

## Examples

### Example 1: Debug Conditional Routing

```typescript
import { createDebugger } from './src/core/debugger';

async function debugConditionalWorkflow() {
  const debugger = createDebugger();

  await debugger.start({
    enabled: true,
    initialBreakpoints: [
      {
        type: 'node',
        nodeId: 'router',
        timing: 'before'
      }
    ],
    recordExecution: true
  });

  // Workflow runs...
  // Debugger pauses at 'router' node
  // Inspect variables to see routing decision
  const routingVar = debugger.inspectVariables({ pattern: 'routingDecision' });
  console.log('Router will choose:', routingVar);

  debugger.continue();
}
```

### Example 2: Replay Failed Workflow

```typescript
import { createDebugger } from './src/core/debugger';

async function replayFailedWorkflow() {
  const debugger = createDebugger();
  await debugger.start({ enabled: true, recordExecution: true });

  // Load trace from failed execution
  await debugger.loadTrace('./traces/failed-execution.json');

  // Find checkpoint before failure
  const trace = debugger.getExecutionTrace();
  const beforeFailure = trace.checkpoints[trace.checkpoints.length - 2];

  console.log('Replaying from:', beforeFailure.nodeId);

  // Replay with fixed variables
  debugger.replayFromCheckpoint(beforeFailure.id, {
    overrides: {
      validationEnabled: false,  // Skip problematic validation
      inputValue: 42             // Use known good value
    }
  });

  // Step through to verify fix
  debugger.stepOver();
  const vars = debugger.inspectVariables();
  console.log('State after fix:', vars);
}
```

### Example 3: Programmatic Debugging

```typescript
import { createDebugger, createNodeBreakpoint } from './src/core/debugger';

async function programmaticDebug() {
  const debugger = createDebugger();

  // Set up comprehensive debugging
  await debugger.start({ enabled: true, recordExecution: true });

  // Add breakpoints programmatically
  const bp1 = createNodeBreakpoint('validateData', 'after');
  const bp2 = createNodeBreakpoint('processInput', 'before', {
    condition: 'state.variables.inputValue > 100'
  });

  debugger.addBreakpoint(bp1);
  debugger.addBreakpoint(bp2);

  // Set up event callback for breakpoints
  debugger.onBreakpointHit((context) => {
    console.log(`Breakpoint at ${context.nodeId}`);
    console.log('Variables:', context.variables);

    // Auto-continue if validation passed
    if (context.variables.validationPassed) {
      debugger.continue();
    }
  });

  // Run workflow...

  // Save trace at end
  await debugger.saveTrace('./traces/auto-debug.json');
}
```

## Further Reading

- [Event System](./events.md) - Understanding workflow events
- [Example Workflow](../examples/.cw/workflows/debug-example.ts) - Debugging demonstration
- [VS Code Launch Configuration](../.vscode/launch.json.example) - IDE integration
- [Verification Guide](./DEBUGGING_VERIFICATION.md) - Testing debugging features
