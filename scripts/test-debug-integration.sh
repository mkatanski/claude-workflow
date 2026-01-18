#!/bin/bash
#
# Integration Test for Debugging Features
#
# This script runs end-to-end integration tests for all debugging capabilities
# It should be run after unit tests pass
#

set -e  # Exit on error

echo "=========================================="
echo "Debugging Features Integration Test"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Function to run a test
run_test() {
    local test_name="$1"
    local test_command="$2"

    echo -n "Running: $test_name... "
    TESTS_RUN=$((TESTS_RUN + 1))

    if eval "$test_command" > /tmp/test-output-$TESTS_RUN.log 2>&1; then
        echo -e "${GREEN}✓ PASSED${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        echo -e "${RED}✗ FAILED${NC}"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        echo "  Error output:"
        cat /tmp/test-output-$TESTS_RUN.log | head -20 | sed 's/^/    /'
        return 1
    fi
}

# Function to check if file exists
check_file() {
    local file="$1"
    if [ -f "$file" ]; then
        return 0
    else
        return 1
    fi
}

echo "Step 1: Verify TypeScript compilation"
echo "--------------------------------------"
run_test "TypeScript type checking" "bun run typecheck"
echo ""

echo "Step 2: Verify debugger module exports"
echo "---------------------------------------"
cat > /tmp/test-exports.ts << 'EOF'
import {
    createDebugger,
    Debugger,
    BreakpointManager,
    VariableInspector,
    ReplayEngine,
    VsCodeDebugAdapter
} from './src/core/debugger/index.ts';

import {
    DebuggerConfig,
    DebuggerState,
    Breakpoint,
    BreakpointHit,
    VariableInfo,
    ExecutionTrace,
    Checkpoint
} from './src/core/debugger/types.ts';

console.log('All debugger exports available');
EOF

run_test "Debugger module exports" "bun run /tmp/test-exports.ts"
echo ""

echo "Step 3: Verify event system integration"
echo "----------------------------------------"
cat > /tmp/test-events.ts << 'EOF'
import { createEmitter } from './src/core/events/index.ts';
import { DebugRenderer } from './src/core/events/renderers/debug.ts';
import type { DebugEvent } from './src/core/events/types.ts';

const emitter = createEmitter();
const renderer = new DebugRenderer({ verbose: true, interactive: false });
const sub = renderer.connect(emitter);

// Test emitting debug events
await emitter.emit('debug:breakpoint:hit', {
    breakpointId: 'test-bp',
    nodeId: 'test-node',
    variables: { count: 5 },
    callStack: []
});

await emitter.emit('debug:execution:pause', {
    nodeId: 'test-node',
    state: { variables: {}, metadata: {} as any }
});

await emitter.flush();
sub.unsubscribe();
renderer.dispose();

console.log('Event system integration working');
EOF

run_test "Event system integration" "bun run /tmp/test-events.ts"
echo ""

echo "Step 4: Verify CLI command integration"
echo "---------------------------------------"
run_test "CLI --debug flag present" "bun run dev run --help | grep -q debug"
echo ""

echo "Step 5: Verify example workflow exists"
echo "---------------------------------------"
run_test "Debug example workflow exists" "check_file ./examples/.cw/workflows/debug-example.ts"
echo ""

echo "Step 6: Verify VS Code configuration"
echo "--------------------------------------"
run_test "VS Code launch.json.example exists" "check_file ./.vscode/launch.json.example"
echo ""

echo "Step 7: Run automated verification tests"
echo "-----------------------------------------"
run_test "Automated verification script" "bun run scripts/verify-debugging.ts"
echo ""

echo "Step 8: Test debugger lifecycle"
echo "--------------------------------"
cat > /tmp/test-lifecycle.ts << 'EOF'
import { createDebugger } from './src/core/debugger/index.ts';

const debugger = createDebugger({
    verbose: false,
    onBreakpointHit: (hit) => {
        console.log(`Breakpoint hit: ${hit.nodeId}`);
    },
    onExecutionControl: (state) => {
        console.log(`Execution state: ${state.paused ? 'paused' : 'running'}`);
    }
});

// Start debugger
await debugger.start({
    enabled: true,
    breakpoints: [],
    recordExecution: true
});

// Set breakpoints
const bp1 = debugger.setBreakpoint({ type: 'node', nodeId: 'test' });
const bp2 = debugger.setBreakpoint({
    type: 'node',
    nodeId: 'conditional',
    condition: 'state.count > 5'
});

// Test execution control
debugger.pause();
debugger.continue();
debugger.stepOver();
debugger.stepInto();

// Create checkpoint
const cpId = debugger.createCheckpoint({
    nodeId: 'test',
    variables: { count: 10 }
});

// Get trace
const trace = debugger.getExecutionTrace();
console.log(`Trace has ${trace.checkpoints.length} checkpoints`);

// Save trace
debugger.saveTrace('/tmp/test-trace.json');

// Cleanup
await debugger.stop();
debugger.dispose();

console.log('Debugger lifecycle test passed');
EOF

run_test "Debugger lifecycle" "bun run /tmp/test-lifecycle.ts"
echo ""

echo "Step 9: Test trace persistence"
echo "-------------------------------"
cat > /tmp/test-persistence.ts << 'EOF'
import { createDebugger } from './src/core/debugger/index.ts';
import { existsSync, readFileSync } from 'fs';

// Create debugger and trace
const debugger1 = createDebugger();
await debugger1.start({ enabled: true, recordExecution: true });

debugger1.createCheckpoint({ nodeId: 'node1', variables: { step: 1 } });
debugger1.createCheckpoint({ nodeId: 'node2', variables: { step: 2 } });

const tracePath = '/tmp/test-trace-persist.json';
debugger1.saveTrace(tracePath);

await debugger1.stop();
debugger1.dispose();

// Verify file exists
if (!existsSync(tracePath)) {
    throw new Error('Trace file not created');
}

// Verify JSON is valid
const content = readFileSync(tracePath, 'utf-8');
const trace = JSON.parse(content);

if (trace.checkpoints.length !== 2) {
    throw new Error(`Expected 2 checkpoints, got ${trace.checkpoints.length}`);
}

// Load in new debugger
const debugger2 = createDebugger();
await debugger2.start({ enabled: true, recordExecution: true });
debugger2.loadTrace(tracePath);

const loadedTrace = debugger2.getExecutionTrace();
if (loadedTrace.checkpoints.length !== 2) {
    throw new Error('Trace not loaded correctly');
}

await debugger2.stop();
debugger2.dispose();

console.log('Trace persistence test passed');
EOF

run_test "Trace persistence" "bun run /tmp/test-persistence.ts"
echo ""

echo "Step 10: Test replay functionality"
echo "-----------------------------------"
cat > /tmp/test-replay.ts << 'EOF'
import { createDebugger } from './src/core/debugger/index.ts';

const debugger = createDebugger();
await debugger.start({ enabled: true, recordExecution: true });

// Create execution history
const cp1 = debugger.createCheckpoint({
    nodeId: 'init',
    variables: { count: 0, status: 'started' }
});

const cp2 = debugger.createCheckpoint({
    nodeId: 'process',
    variables: { count: 5, status: 'processing' }
});

const cp3 = debugger.createCheckpoint({
    nodeId: 'complete',
    variables: { count: 10, status: 'done' }
});

// Replay from middle checkpoint
const replayState = debugger.replayFromCheckpoint(cp2);

if (!replayState) {
    throw new Error('Replay failed');
}

if (replayState.variables.count !== 5) {
    throw new Error(`Expected count=5, got ${replayState.variables.count}`);
}

// Replay with overrides
const modifiedReplay = debugger.replayFromCheckpoint(cp2, {
    overrides: { count: 100 }
});

if (modifiedReplay.variables.count !== 100) {
    throw new Error('Variable override failed');
}

await debugger.stop();
debugger.dispose();

console.log('Replay functionality test passed');
EOF

run_test "Replay functionality" "bun run /tmp/test-replay.ts"
echo ""

# Print summary
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo "Total tests run:    $TESTS_RUN"
echo -e "Tests passed:       ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests failed:       ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All integration tests passed!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Run manual verification: see docs/DEBUGGING_VERIFICATION.md"
    echo "2. Test interactive debugging: bun run dev run debug-example --debug"
    echo "3. Test VS Code integration: Open in VS Code and use F5"
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    echo ""
    echo "Check the output above for details"
    echo "Logs saved to: /tmp/test-output-*.log"
    exit 1
fi
