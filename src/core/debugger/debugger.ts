/**
 * Debugger - Main debugger controller for workflow debugging
 *
 * This class orchestrates all debugging functionality including:
 * - Breakpoint management and evaluation
 * - Step-through execution control
 * - Variable inspection
 * - Execution tracing and checkpoints
 * - Replay functionality
 *
 * Features:
 * - Integrates BreakpointManager, VariableInspector, and ReplayEngine
 * - Provides unified debugging API
 * - Manages execution state and control flow
 * - Supports Debug Adapter Protocol (DAP) integration
 * - Event-driven architecture for integration with WorkflowGraph
 */

import type {
	IDebugger,
	DebuggerConfig,
	DebugExecutionState,
	DebugContext,
	Breakpoint,
	BreakpointHit,
	VariableInfo,
	VariableInspectionRequest,
	ExecutionCheckpoint,
	ExecutionTrace,
	ReplayOptions,
	StepMode,
	StackFrame,
} from './types';
import { BreakpointManager } from './breakpoints';
import { VariableInspector } from './inspector';
import { ReplayEngine } from './replay';

// ============================================================================
// Types
// ============================================================================

/**
 * Execution control callback types
 */
export type ExecutionControlCallback = () => void | Promise<void>;
export type ExecutionResumeCallback = (mode: StepMode) => void | Promise<void>;
export type BreakpointHitEventCallback = (hit: BreakpointHit) => void | Promise<void>;

/**
 * Debug event callbacks
 */
export interface DebugEventCallbacks {
	/** Called when execution pauses */
	onPause?: ExecutionControlCallback;
	/** Called when execution resumes */
	onResume?: ExecutionResumeCallback;
	/** Called when a breakpoint is hit */
	onBreakpointHit?: BreakpointHitEventCallback;
	/** Called when execution state changes */
	onStateChange?: (state: DebugExecutionState) => void | Promise<void>;
	/** Called when a checkpoint is created */
	onCheckpoint?: (checkpoint: ExecutionCheckpoint) => void | Promise<void>;
}

/**
 * Internal execution control state
 */
interface ExecutionControl {
	/** Current step mode */
	stepMode: StepMode;
	/** Promise resolver for paused execution */
	resumeResolver: (() => void) | null;
	/** Whether execution should pause at next opportunity */
	shouldPause: boolean;
	/** Step target (node name for step-over/out) */
	stepTarget: string | null;
	/** Stack depth for step-out */
	stepStackDepth: number;
}

// ============================================================================
// Debugger Class
// ============================================================================

export class Debugger implements IDebugger {
	private config: DebuggerConfig | null = null;
	private _state: DebugExecutionState = 'stopped';
	private _context: DebugContext | null = null;
	private breakpointManager: BreakpointManager;
	private variableInspector: VariableInspector;
	private replayEngine: ReplayEngine;
	private disposed = false;
	private eventCallbacks: DebugEventCallbacks = {};
	private executionControl: ExecutionControl = {
		stepMode: 'continue',
		resumeResolver: null,
		shouldPause: false,
		stepTarget: null,
		stepStackDepth: 0,
	};

	constructor(callbacks?: DebugEventCallbacks) {
		this.eventCallbacks = callbacks ?? {};

		// Initialize components
		this.breakpointManager = new BreakpointManager({
			debug: false,
			onBreakpointHit: this.handleBreakpointHit.bind(this),
		});

		this.variableInspector = new VariableInspector({
			defaultMaxDepth: 3,
			debug: false,
		});

		this.replayEngine = new ReplayEngine({
			debug: false,
			autoSave: false,
		});
	}

	// ==========================================================================
	// IDebugger Implementation - Properties
	// ==========================================================================

	get state(): DebugExecutionState {
		return this._state;
	}

	get context(): DebugContext | null {
		return this._context;
	}

	// ==========================================================================
	// IDebugger Implementation - Session Management
	// ==========================================================================

	/**
	 * Start debugging session
	 */
	async start(config: DebuggerConfig): Promise<void> {
		this.checkDisposed();

		this.config = config;
		this._state = config.enabled ? 'paused' : 'running';

		// Initialize trace if configured
		if (config.traceOutputPath) {
			this.replayEngine = new ReplayEngine({
				debug: false,
				autoSave: true,
				traceOutputPath: config.traceOutputPath,
			});
		}

		// Add initial breakpoints
		if (config.breakpoints) {
			for (const breakpoint of config.breakpoints) {
				this.setBreakpoint(breakpoint);
			}
		}

		// Set up auto-break conditions
		if (config.breakOnStart) {
			this.executionControl.shouldPause = true;
		}

		this.debug(`Started debugging session (enabled: ${config.enabled})`);
		await this.notifyStateChange(this._state);
	}

	/**
	 * Stop debugging session
	 */
	async stop(): Promise<void> {
		this.checkDisposed();

		// Resume execution if paused
		if (this._state === 'paused') {
			this.resume();
		}

		// Complete trace if active (before clearing context)
		if (this.replayEngine.isTraceActive() && this._context) {
			this.replayEngine.completeTrace(this._context.variables);
		}

		this._state = 'stopped';
		this._context = null;
		this.config = null;

		// Clean up components
		this.breakpointManager.clear();
		this.variableInspector.clearReferences();

		this.debug('Stopped debugging session');
		await this.notifyStateChange(this._state);
	}

	// ==========================================================================
	// IDebugger Implementation - Breakpoint Management
	// ==========================================================================

	setBreakpoint(breakpoint: Breakpoint): void {
		this.checkDisposed();
		this.breakpointManager.add(breakpoint);
		this.debug(`Set breakpoint: ${breakpoint.id} (type: ${breakpoint.type})`);
	}

	removeBreakpoint(id: string): void {
		this.checkDisposed();
		this.breakpointManager.remove(id);
		this.debug(`Removed breakpoint: ${id}`);
	}

	clearBreakpoints(): void {
		this.checkDisposed();
		this.breakpointManager.clear();
		this.debug('Cleared all breakpoints');
	}

	getBreakpoints(): Breakpoint[] {
		this.checkDisposed();
		return this.breakpointManager.getAll();
	}

	// ==========================================================================
	// IDebugger Implementation - Execution Control
	// ==========================================================================

	continue(): void {
		this.checkDisposed();
		this.resume('continue');
	}

	stepOver(): void {
		this.checkDisposed();
		this.resume('step-over');
	}

	stepIn(): void {
		this.checkDisposed();
		this.resume('step-into');
	}

	stepOut(): void {
		this.checkDisposed();
		this.resume('step-out');
	}

	pause(): void {
		this.checkDisposed();

		if (this._state === 'running') {
			this.executionControl.shouldPause = true;
			this.debug('Pause requested');
		}
	}

	// ==========================================================================
	// IDebugger Implementation - Variable Inspection
	// ==========================================================================

	inspectVariables(request: VariableInspectionRequest): VariableInfo[] {
		this.checkDisposed();

		if (!this._context) {
			return [];
		}

		return this.variableInspector.inspect(this._context, request);
	}

	// ==========================================================================
	// IDebugger Implementation - Checkpoints and Replay
	// ==========================================================================

	createCheckpoint(nodeName: string): ExecutionCheckpoint {
		this.checkDisposed();

		if (!this._context) {
			throw new Error('Cannot create checkpoint without active context');
		}

		// Ensure trace is started
		if (!this.replayEngine.isTraceActive()) {
			this.replayEngine.startTrace(
				this._context.workflowName,
				this._context.variables
			);
		}

		const checkpoint = this.replayEngine.createCheckpoint(
			this._context.workflowName,
			nodeName,
			this._context.variables
		);

		void this.eventCallbacks.onCheckpoint?.(checkpoint);
		this.debug(`Created checkpoint: ${checkpoint.id} at node: ${nodeName}`);

		return checkpoint;
	}

	getTrace(): ExecutionTrace {
		this.checkDisposed();

		const trace = this.replayEngine.getTrace();
		if (!trace) {
			throw new Error('No active trace');
		}

		return trace;
	}

	async replay(options: ReplayOptions): Promise<void> {
		this.checkDisposed();

		await this.replayEngine.startReplay(options);
		this.debug(`Started replay from checkpoint: ${options.fromCheckpoint}`);

		// If step-through replay, pause at first checkpoint
		if (options.stepThroughReplay) {
			this.executionControl.stepMode = 'step-over';
			await this.pauseExecution('Replay started');
		}
	}

	// ==========================================================================
	// Execution Control - Internal
	// ==========================================================================

	/**
	 * Resume execution with a specific step mode
	 */
	private resume(mode: StepMode = 'continue'): void {
		if (this._state !== 'paused') {
			return;
		}

		this.executionControl.stepMode = mode;
		this.executionControl.shouldPause = false;

		// Set step target for step-over/out
		if (mode === 'step-over' && this._context) {
			this.executionControl.stepTarget = this._context.currentNode ?? null;
		} else if (mode === 'step-out' && this._context) {
			this.executionControl.stepStackDepth = this._context.callStack.length - 1;
		}

		// Resolve the pause promise to resume execution
		if (this.executionControl.resumeResolver) {
			this.executionControl.resumeResolver();
			this.executionControl.resumeResolver = null;
		}

		this._state = mode === 'continue' ? 'running' : 'stepping';

		void this.eventCallbacks.onResume?.(mode);
		void this.notifyStateChange(this._state);

		this.debug(`Resumed execution (mode: ${mode})`);
	}

	/**
	 * Pause execution
	 */
	private async pauseExecution(reason: string): Promise<void> {
		if (this._state === 'paused') {
			return;
		}

		const previousState = this._state;
		this._state = 'paused';

		this.debug(`Paused execution: ${reason}`);

		// Create the wait promise BEFORE any async operations
		// This ensures resumeResolver is set before continue() can be called
		let waitPromise: Promise<void> | undefined;
		if (previousState !== 'stopped') {
			waitPromise = new Promise<void>((resolve) => {
				this.executionControl.resumeResolver = resolve;
			});
		}

		// Now notify state change (this may yield to other code)
		await this.notifyStateChange(this._state);
		void this.eventCallbacks.onPause?.();

		// Wait for resume if we created a wait promise
		if (waitPromise) {
			await waitPromise;
		}
	}

	/**
	 * Handle breakpoint hit
	 */
	private async handleBreakpointHit(hit: BreakpointHit): Promise<void> {
		this.debug(`Breakpoint hit: ${hit.breakpoint.id} - ${hit.reason}`);

		// Update context
		this._context = hit.context;

		// Notify callback
		void this.eventCallbacks.onBreakpointHit?.(hit);

		// Pause execution
		await this.pauseExecution(hit.reason);
	}

	// ==========================================================================
	// Node Execution Hooks - Called by WorkflowGraph
	// ==========================================================================

	/**
	 * Called before a node executes
	 */
	async beforeNodeExecution(
		nodeName: string,
		context: DebugContext
	): Promise<void> {
		this.checkDisposed();

		if (!this.config?.enabled) {
			return;
		}

		this._context = context;

		// Check node breakpoints (before)
		const breakpointHit = this.breakpointManager.checkNodeBreakpoint(
			nodeName,
			'before',
			context
		);

		if (breakpointHit) {
			await this.handleBreakpointHit(breakpointHit);
			return;
		}

		// Check step mode
		await this.checkStepMode(nodeName, context);

		// Check if pause requested
		if (this.executionControl.shouldPause) {
			this.executionControl.shouldPause = false;
			await this.pauseExecution('Pause requested');
		}

		// Record event in trace
		if (this.replayEngine.isTraceActive()) {
			this.replayEngine.recordEvent('node:before', { nodeName }, nodeName);
		}
	}

	/**
	 * Called after a node executes
	 */
	async afterNodeExecution(
		nodeName: string,
		context: DebugContext
	): Promise<void> {
		this.checkDisposed();

		if (!this.config?.enabled) {
			return;
		}

		this._context = context;

		// Create checkpoint
		this.createCheckpoint(nodeName);

		// Check node breakpoints (after)
		const breakpointHit = this.breakpointManager.checkNodeBreakpoint(
			nodeName,
			'after',
			context
		);

		if (breakpointHit) {
			await this.handleBreakpointHit(breakpointHit);
		}

		// Record event in trace
		if (this.replayEngine.isTraceActive()) {
			this.replayEngine.recordEvent('node:after', { nodeName }, nodeName);
		}
	}

	/**
	 * Called when an event is emitted
	 */
	async onEventEmitted(
		eventType: string,
		payload: unknown,
		context: DebugContext
	): Promise<void> {
		this.checkDisposed();

		if (!this.config?.enabled) {
			return;
		}

		this._context = context;

		// Check event breakpoints
		const breakpointHit = this.breakpointManager.checkEventBreakpoint(
			eventType,
			context
		);

		if (breakpointHit) {
			await this.handleBreakpointHit(breakpointHit);
		}

		// Record event in trace
		if (this.replayEngine.isTraceActive()) {
			this.replayEngine.recordEvent(
				eventType,
				payload,
				context.currentNode
			);
		}
	}

	/**
	 * Called when an exception occurs
	 */
	async onException(
		error: Error,
		isUncaught: boolean,
		context: DebugContext
	): Promise<void> {
		this.checkDisposed();

		if (!this.config?.enabled) {
			return;
		}

		this._context = context;

		// Check exception breakpoints
		const breakpointHit = this.breakpointManager.checkExceptionBreakpoint(
			error,
			isUncaught,
			context
		);

		if (breakpointHit) {
			await this.handleBreakpointHit(breakpointHit);
		} else if (this.config.breakOnError) {
			// Break on any error if configured (no specific breakpoint)
			await this.pauseExecution(`Exception: ${error.message}`);
		}

		// Record error in trace
		if (this.replayEngine.isTraceActive()) {
			this.replayEngine.failTrace(error, context.currentNode);
		}
	}

	// ==========================================================================
	// Step Mode Handling
	// ==========================================================================

	/**
	 * Check if execution should pause based on step mode
	 */
	private async checkStepMode(
		nodeName: string,
		context: DebugContext
	): Promise<void> {
		const { stepMode, stepTarget, stepStackDepth } = this.executionControl;

		switch (stepMode) {
			case 'step-over':
				// Pause at every node at the same level
				if (!stepTarget || nodeName !== stepTarget) {
					await this.pauseExecution(`Step over to: ${nodeName}`);
				}
				break;

			case 'step-into':
				// Pause at every node (including nested)
				await this.pauseExecution(`Step into: ${nodeName}`);
				break;

			case 'step-out':
				// Pause when we've stepped out to parent level
				if (context.callStack.length <= stepStackDepth) {
					await this.pauseExecution(`Step out to: ${nodeName}`);
				}
				break;

			case 'pause':
				// Pause immediately
				await this.pauseExecution('Paused');
				break;

			case 'continue':
			default:
				// Continue - only pause at breakpoints
				break;
		}
	}

	// ==========================================================================
	// Workflow Integration
	// ==========================================================================

	/**
	 * Initialize debugging for a workflow
	 */
	initializeWorkflow(
		workflowName: string,
		initialVariables: Record<string, unknown>
	): void {
		this.checkDisposed();

		if (!this.config?.enabled) {
			return;
		}

		// Initialize context
		this._context = {
			workflowName,
			variables: { ...initialVariables },
			callStack: [],
		};

		// Start trace
		this.replayEngine.startTrace(workflowName, initialVariables);

		this.debug(`Initialized workflow: ${workflowName}`);
	}

	/**
	 * Finalize debugging for a workflow
	 */
	finalizeWorkflow(
		finalVariables: Record<string, unknown>,
		success = true
	): ExecutionTrace | null {
		this.checkDisposed();

		if (!this.replayEngine.isTraceActive()) {
			return null;
		}

		const trace = this.replayEngine.completeTrace(finalVariables, success);
		this.debug(`Finalized workflow: ${trace.workflowName} (status: ${trace.status})`);

		return trace;
	}

	// ==========================================================================
	// Utilities
	// ==========================================================================

	/**
	 * Get breakpoint manager for advanced control
	 */
	getBreakpointManager(): BreakpointManager {
		return this.breakpointManager;
	}

	/**
	 * Get variable inspector for advanced control
	 */
	getVariableInspector(): VariableInspector {
		return this.variableInspector;
	}

	/**
	 * Get replay engine for advanced control
	 */
	getReplayEngine(): ReplayEngine {
		return this.replayEngine;
	}

	/**
	 * Update event callbacks
	 */
	setEventCallbacks(callbacks: DebugEventCallbacks): void {
		this.eventCallbacks = { ...this.eventCallbacks, ...callbacks };
	}

	// ==========================================================================
	// Internal Methods
	// ==========================================================================

	/**
	 * Notify state change
	 */
	private async notifyStateChange(state: DebugExecutionState): Promise<void> {
		await this.eventCallbacks.onStateChange?.(state);
	}

	/**
	 * Check if disposed and throw error if true
	 */
	private checkDisposed(): void {
		if (this.disposed) {
			throw new Error('Debugger has been disposed');
		}
	}

	/**
	 * Debug logging
	 */
	private debug(message: string): void {
		// Only log if config is enabled and verbose
		// In production, this would integrate with a logger
		if (this.config?.enabled) {
			// eslint-disable-next-line no-console
			console.debug(`[Debugger] ${message}`);
		}
	}

	// ==========================================================================
	// Lifecycle
	// ==========================================================================

	/**
	 * Dispose of the debugger
	 */
	dispose(): void {
		if (this.disposed) return;

		// Stop session if active
		if (this._state !== 'stopped') {
			void this.stop();
		}

		// Dispose components
		this.breakpointManager.dispose();
		this.variableInspector.dispose();
		this.replayEngine.dispose();

		this.disposed = true;
		this.debug('Disposed');
	}

	/**
	 * Check if disposed
	 */
	isDisposed(): boolean {
		return this.disposed;
	}
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a debugger instance with callbacks
 */
export function createDebugger(callbacks?: DebugEventCallbacks): Debugger {
	return new Debugger(callbacks);
}

/**
 * Create a minimal debug context for testing
 */
export function createDebugContext(
	workflowName: string,
	variables: Record<string, unknown> = {},
	currentNode?: string
): DebugContext {
	return {
		workflowName,
		variables,
		callStack: [],
		currentNode,
	};
}

/**
 * Create a stack frame for debug context
 */
export function createStackFrame(
	id: number,
	name: string,
	source: string,
	variables: Record<string, unknown> = {}
): StackFrame {
	return {
		id,
		name,
		source,
		variables,
	};
}
