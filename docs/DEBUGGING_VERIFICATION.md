# Debugging Features - End-to-End Verification Guide

This guide provides step-by-step instructions for manually verifying all debugging features.

## Prerequisites

- Bun runtime installed
- Project built and ready to run
- Example workflow in `examples/.cw/workflows/debug-example.ts`

## Automated Verification

Run the automated verification script first:

```bash
bun run scripts/verify-debugging.ts
```

This will verify:
- ✓ Debugger creation and lifecycle
- ✓ Breakpoint management
- ✓ Variable inspection
- ✓ Execution control (step, pause, continue)
- ✓ Checkpoint and trace recording
- ✓ Trace save/load persistence
- ✓ Replay from checkpoint
- ✓ Event integration
- ✓ Debug renderer integration
- ✓ CLI integration

## Manual Verification Steps

### 1. Run Workflow with --debug Flag

**Test:** Verify debug mode can be activated

```bash
bun run dev run debug-example --debug
```

**Expected Behavior:**
- Interactive debug session starts
- Debug prompt appears: `Debug> `
- Available commands shown: `[s]tep, [c]ontinue, [i]nspect, [q]uit`

**Verification:**
- [ ] Debug mode activates without errors
- [ ] Interactive prompt appears
- [ ] Workflow execution pauses at start

---

### 2. Set Breakpoint and Verify Execution Pauses

**Test:** Verify breakpoints work correctly

At the debug prompt, you can set breakpoints before execution or when paused:

```
Debug> breakpoint node validateData
Debug> breakpoint event workflow:node:complete
Debug> breakpoint condition "state.variables.count > 5"
```

Then continue execution:

```
Debug> continue
```

**Expected Behavior:**
- Execution pauses when breakpoint is hit
- Message shown: `Breakpoint hit at node: validateData`
- Current node information displayed
- Variables at breakpoint shown (if configured)

**Verification:**
- [ ] Node breakpoints trigger correctly
- [ ] Event breakpoints trigger on matching events
- [ ] Conditional breakpoints only trigger when condition is true
- [ ] Execution pauses at the correct location

---

### 3. Inspect Variables at Breakpoint

**Test:** Verify variable inspection capabilities

When paused at a breakpoint, inspect variables:

```
Debug> inspect
Debug> inspect count
Debug> inspect state.variables.*
Debug> inspect data.nested.value
```

**Expected Behavior:**
- All variables displayed in formatted view
- Specific variable shows detailed value
- Pattern matching works for wildcards
- Nested values accessible with dot notation
- Types correctly identified (number, string, object, array, etc.)

**Verification:**
- [ ] Can inspect all workflow variables
- [ ] Can inspect specific variables by name
- [ ] Pattern matching works (wildcards)
- [ ] Nested object inspection works
- [ ] Arrays and objects formatted correctly
- [ ] Types displayed accurately

---

### 4. Step Through Execution

**Test:** Verify step-through execution control

Use stepping commands:

```
Debug> step-over    # or 's'
Debug> step-into    # Execute into function calls
Debug> step-out     # Complete current node and pause
```

**Expected Behavior:**
- `step-over`: Executes current node, pauses at next node
- `step-into`: For nodes with sub-executions, steps into them
- `step-out`: Completes current node context, pauses after
- After each step, shows current position and variables

**Verification:**
- [ ] Step-over advances to next node
- [ ] Step-into works for nested executions
- [ ] Step-out completes current context
- [ ] Current position accurately displayed after each step
- [ ] Can inspect variables between steps

---

### 5. Save Execution Trace

**Test:** Verify trace recording and saving

While debugging or after completion:

```
Debug> save-trace /tmp/debug-trace-1.json
```

Or programmatically:

```typescript
const debugger = createDebugger();
await debugger.start({ enabled: true, recordExecution: true });
// ... run workflow ...
debugger.saveTrace('./traces/execution-trace.json');
```

**Expected Behavior:**
- Trace file created at specified path
- File contains JSON with execution history
- All checkpoints recorded
- Variables captured at each checkpoint
- Events logged with timestamps

**Verification:**
- [ ] Trace file created successfully
- [ ] File contains valid JSON
- [ ] All executed nodes appear in trace
- [ ] Variables captured at checkpoints
- [ ] Timestamps and durations recorded
- [ ] File can be loaded in new debugger session

**Trace File Structure:**
```json
{
  "workflowName": "Debug Example Workflow",
  "executionId": "exec-abc123",
  "startTime": 1234567890,
  "endTime": 1234567900,
  "checkpoints": [
    {
      "id": "checkpoint-1",
      "nodeId": "initialize",
      "timestamp": 1234567891,
      "variables": { "status": "initialized" }
    }
  ],
  "events": [
    {
      "type": "workflow:node:start",
      "timestamp": 1234567891,
      "payload": { "nodeId": "initialize" }
    }
  ]
}
```

---

### 6. Replay Failed Execution from Checkpoint

**Test:** Verify replay functionality

After a workflow fails or completes, load trace and replay:

```typescript
import { createDebugger } from './src/core/debugger';

const debugger = createDebugger();
await debugger.start({ enabled: true, recordExecution: true });

// Load previous trace
debugger.loadTrace('./traces/failed-execution.json');

// Get checkpoint before failure
const checkpoints = debugger.getExecutionTrace().checkpoints;
const beforeFailure = checkpoints[checkpoints.length - 2]; // Second to last

// Replay from that checkpoint
const replayState = debugger.replayFromCheckpoint(beforeFailure.id);

// Can now modify variables and continue execution
const modifiedState = debugger.replayFromCheckpoint(beforeFailure.id, {
  overrides: {
    count: 10, // Fix the value that caused failure
    enableValidation: false // Skip validation
  }
});
```

**Expected Behavior:**
- Previous trace loads successfully
- Checkpoints available for selection
- Can replay from any checkpoint
- State restored to checkpoint values
- Can override variables during replay
- Execution continues from replay point

**Verification:**
- [ ] Trace loads without errors
- [ ] All checkpoints listed correctly
- [ ] Can select checkpoint to replay from
- [ ] State correctly restored to checkpoint
- [ ] Variable overrides work
- [ ] Execution continues from replay point
- [ ] Can step through replayed execution

---

### 7. Test VS Code Debugging Integration

**Test:** Verify Debug Adapter Protocol (DAP) integration

#### Setup VS Code Launch Configuration

1. Copy example configuration:
```bash
cp .vscode/launch.json.example .vscode/launch.json
```

2. Open VS Code
3. Go to Run and Debug panel (Cmd/Ctrl + Shift + D)
4. Select "Debug Workflow: debug-example"
5. Set breakpoints in workflow file by clicking in gutter
6. Press F5 to start debugging

**Expected Behavior:**
- Debug session starts in VS Code
- Workflow execution pauses at breakpoints
- Variables panel shows workflow state
- Call stack shows current execution context
- Debug console shows execution events
- Can use VS Code debug controls:
  - Continue (F5)
  - Step Over (F10)
  - Step Into (F11)
  - Step Out (Shift+F11)
  - Restart (Cmd/Ctrl + Shift + F5)
  - Stop (Shift+F5)

**Verification:**
- [ ] Launch configuration loads
- [ ] Debug session starts successfully
- [ ] Breakpoints in workflow file work
- [ ] Variables panel populated with state
- [ ] Call stack shows execution context
- [ ] Can step through execution with F10/F11
- [ ] Can inspect variables by hovering
- [ ] Debug console shows events
- [ ] Can continue/pause execution
- [ ] Can stop debugging cleanly

**VS Code Launch Configurations to Test:**

1. **Basic Debugging:**
```json
{
  "type": "workflow-debugger",
  "request": "launch",
  "name": "Debug Workflow: debug-example",
  "workflowPath": "${workspaceFolder}/examples/.cw/workflows/debug-example.ts",
  "stopOnEntry": false
}
```

2. **Stop on Entry:**
```json
{
  "type": "workflow-debugger",
  "request": "launch",
  "name": "Debug with Stop on Entry",
  "workflowPath": "${workspaceFolder}/examples/.cw/workflows/debug-example.ts",
  "stopOnEntry": true
}
```

3. **With Custom Variables:**
```json
{
  "type": "workflow-debugger",
  "request": "launch",
  "name": "Debug with Custom Vars",
  "workflowPath": "${workspaceFolder}/examples/.cw/workflows/debug-example.ts",
  "variables": {
    "debugMode": true,
    "inputValue": 100
  }
}
```

---

## Integration Test Scenarios

### Scenario 1: Debug a Successful Execution

1. Run: `bun run dev run debug-example --debug`
2. Set breakpoint on "calculateMetrics" node
3. Continue to breakpoint
4. Inspect variables: `doubled`, `squared`, `sum`
5. Step through remaining nodes
6. Verify completion

**Success Criteria:**
- All nodes execute in correct order
- Variables have expected values
- No errors during execution

---

### Scenario 2: Debug with Conditional Routing

1. Run debug-example workflow
2. Set breakpoint on "router" node
3. Inspect `validationPassed` variable
4. Step through conditional branch
5. Verify correct path taken (success or error)

**Success Criteria:**
- Router decision visible in variables
- Correct branch executed based on condition
- Can inspect state at decision point

---

### Scenario 3: Debug Error Handling

1. Modify debug-example to force validation failure
2. Run with --debug
3. Set breakpoint on "handleError" node
4. Observe error path execution
5. Inspect retry logic variables

**Success Criteria:**
- Error path triggered correctly
- Error handling node executes
- Retry count incremented
- Error message captured in state

---

### Scenario 4: Save and Replay Execution

1. Run debug-example to completion
2. Save trace: `debug> save-trace /tmp/trace.json`
3. Exit workflow
4. Start new debug session
5. Load trace
6. Replay from middle checkpoint
7. Continue execution with modifications

**Success Criteria:**
- Trace saves successfully
- Trace loads in new session
- Can replay from any checkpoint
- Modified variables affect execution
- Execution continues from replay point

---

## Performance Verification

### Test Debug Overhead

Compare execution times:

```bash
# Normal execution
time bun run dev run debug-example

# Debug execution (non-interactive)
time DEBUG_NON_INTERACTIVE=1 bun run dev run debug-example --debug

# Interactive debug
time bun run dev run debug-example --debug
```

**Success Criteria:**
- Debug overhead < 20% for non-interactive
- Recording doesn't cause memory leaks
- Large workflows remain responsive
- Trace files size reasonable (<1MB per 100 nodes)

---

## Error Handling Verification

### Test Invalid Scenarios

1. **Invalid breakpoint:**
   ```
   Debug> breakpoint node nonexistent-node
   ```
   - Should show error message
   - Should not crash debugger

2. **Invalid variable inspection:**
   ```
   Debug> inspect does.not.exist
   ```
   - Should show "variable not found"
   - Should not crash

3. **Load invalid trace file:**
   ```typescript
   debugger.loadTrace('/nonexistent/file.json');
   ```
   - Should throw clear error
   - Should not corrupt debugger state

4. **Replay from invalid checkpoint:**
   ```typescript
   debugger.replayFromCheckpoint('invalid-id');
   ```
   - Should return null or throw clear error
   - Should not crash

**Success Criteria:**
- All error cases handled gracefully
- Clear error messages shown
- Debugger remains stable after errors
- No crashes or undefined behavior

---

## Checklist: Complete Verification

- [ ] Automated tests pass (scripts/verify-debugging.ts)
- [ ] Debug mode activates with --debug flag
- [ ] Breakpoints work (node, event, conditional)
- [ ] Variable inspection works
- [ ] Step-through execution works
- [ ] Trace recording works
- [ ] Trace save/load works
- [ ] Replay from checkpoint works
- [ ] VS Code integration works
- [ ] Error handling is robust
- [ ] Performance overhead acceptable
- [ ] Documentation is clear and accurate

---

## Troubleshooting

### Debug session doesn't start
- Check that workflow file exists
- Verify --debug flag is passed
- Check for TypeScript compilation errors
- Ensure bun runtime is installed

### Breakpoints don't trigger
- Verify node ID is correct (case-sensitive)
- Check event pattern matches events being emitted
- Ensure conditional breakpoint expression is valid JavaScript
- Check that breakpoint was set before continuing execution

### Variables not showing
- Ensure recordExecution: true in debugger config
- Check that node has executed before inspecting
- Verify variable names are correct (case-sensitive)
- Try pattern matching if exact name unclear

### Trace file won't load
- Verify file path is correct
- Check JSON is valid (use `jq` or JSON validator)
- Ensure file was created by same debugger version
- Check file permissions

### VS Code debugging not working
- Verify launch.json configuration is correct
- Check that workspace folder path is correct
- Ensure Debug Adapter is installed
- Check VS Code debug console for error messages
- Try restarting VS Code

---

## Next Steps

After verification completes:

1. Document any issues found
2. Update implementation_plan.json status
3. Create GitHub issues for any bugs
4. Update main documentation (docs/debugging.md)
5. Mark subtask as completed
