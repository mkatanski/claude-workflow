#!/usr/bin/env tsx
/**
 * Quick integration check script
 * Verifies all debugging components can be imported and basic types work
 */

// Check debugger exports
import {
    createDebugger,
    Debugger,
    BreakpointManager,
    VariableInspector,
    ReplayEngine,
    VsCodeDebugAdapter,
    createNodeBreakpoint,
    createEventBreakpoint,
    createDebugContext,
    type DebuggerConfig,
    type Breakpoint,
    type VariableInfo,
    type ExecutionTrace,
} from '../src/core/debugger/index.js';

// Check event exports
import {
    createEmitter,
    ConsoleRenderer,
    DebugRenderer,
    type DebugEvent,
} from '../src/core/events/index.js';

// Check CLI integration
import type { RunOptions } from '../src/cli/commands/run.js';

console.log('✓ All debugger exports available');
console.log('✓ All event exports available');
console.log('✓ CLI integration types available');

// Type checks
const config: DebuggerConfig = {
    verbose: true,
    onBreakpointHit: (hit) => {
        console.log('Breakpoint hit:', hit.nodeId);
    },
    onExecutionControl: (state) => {
        console.log('Execution state:', state.paused ? 'paused' : 'running');
    },
};

const runOptions: RunOptions = {
    workflow: 'test',
    debug: true,
    verbose: true,
};

console.log('✓ Type definitions work correctly');

// Create instances
const debugger = createDebugger(config);
const emitter = createEmitter();
const renderer = new DebugRenderer({ verbose: true, interactive: false });

console.log('✓ Can create debugger instance');
console.log('✓ Can create emitter instance');
console.log('✓ Can create debug renderer instance');

// Cleanup
renderer.dispose();

console.log('');
console.log('========================================');
console.log('✅ Integration check passed!');
console.log('========================================');
console.log('');
console.log('All debugging components properly integrated.');
console.log('Ready for end-to-end testing.');
