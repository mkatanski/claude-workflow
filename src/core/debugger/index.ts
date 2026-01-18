/**
 * Debugger module - Workflow debugging tools
 *
 * This module provides comprehensive debugging capabilities for workflows:
 * - Step-through execution with breakpoints
 * - Variable inspection at runtime
 * - Execution replay from checkpoints
 * - Debug Adapter Protocol (DAP) support for VS Code
 *
 * @example Basic usage
 * ```ts
 * import { createDebugger, createNodeBreakpoint } from './core/debugger';
 *
 * const dbg = createDebugger({
 *   onBreakpointHit: (hit) => {
 *     console.log('Breakpoint hit:', hit.reason);
 *     console.log('Variables:', dbg.inspectVariables({}));
 *   },
 * });
 *
 * await dbg.start({
 *   enabled: true,
 *   breakpoints: [
 *     createNodeBreakpoint('myNode', 'before'),
 *   ],
 * });
 * ```
 *
 * @example Execution replay
 * ```ts
 * import { ReplayEngine, findLastSuccessfulCheckpoint } from './core/debugger';
 *
 * const engine = new ReplayEngine({ autoSave: true, traceOutputPath: './trace.json' });
 * const trace = await engine.loadTrace('./failed-execution.json');
 * const lastGood = findLastSuccessfulCheckpoint(trace);
 *
 * await dbg.replay({
 *   trace,
 *   fromCheckpoint: lastGood.id,
 *   stepThroughReplay: true,
 * });
 * ```
 */

// ============================================================================
// Main Debugger
// ============================================================================

export {
	Debugger,
	createDebugger,
	createDebugContext,
	createStackFrame,
	type ExecutionControlCallback,
	type ExecutionResumeCallback,
	type BreakpointHitEventCallback,
	type DebugEventCallbacks,
} from "./debugger";

// ============================================================================
// Types
// ============================================================================

export type {
	// Debugger interface and config
	IDebugger,
	DebuggerConfig,
	DebugExecutionState,
	DebugContext,
	StepMode,
	StackFrame,
	// Breakpoints
	Breakpoint,
	BaseBreakpoint,
	NodeBreakpoint,
	EventBreakpoint,
	ExceptionBreakpoint,
	BreakpointHit,
	// Variables
	VariableInfo,
	VariableInspectionRequest,
	VariableScope,
	// Checkpoints and replay
	ExecutionCheckpoint,
	ExecutionTrace,
	CheckpointEvent,
	ReplayOptions,
	// Debug Adapter Protocol
	DapRequestType,
	DapResponse,
	DapEventType,
	StoppedReason,
} from "./types";

export {
	// Type guards
	isNodeBreakpoint,
	isEventBreakpoint,
	isExceptionBreakpoint,
	isDebuggerPaused,
	isDebuggerActive,
} from "./types";

// ============================================================================
// Breakpoint Manager
// ============================================================================

export {
	BreakpointManager,
	createNodeBreakpoint,
	createEventBreakpoint,
	createExceptionBreakpoint,
	type BreakpointManagerConfig,
	type BreakpointHitCallback,
} from "./breakpoints";

// ============================================================================
// Variable Inspector
// ============================================================================

export {
	VariableInspector,
	formatValueForDisplay,
	createSimpleVariableInfo,
	type VariableInspectorConfig,
} from "./inspector";

// ============================================================================
// Replay Engine
// ============================================================================

export {
	ReplayEngine,
	createCheckpointEvent,
	compareCheckpoints,
	findLastSuccessfulCheckpoint,
	type ReplayEngineConfig,
	type CheckpointOptions,
} from "./replay";

// ============================================================================
// VS Code Debug Adapter
// ============================================================================

export {
	VsCodeDebugAdapter,
	createVsCodeDebugAdapter,
	type VsCodeAdapterConfig,
	type LaunchConfiguration,
} from "./vscode-adapter";
