/**
 * ReplayEngine - Manages execution checkpoints and replay functionality
 *
 * Features:
 * - Checkpoint creation and management
 * - Event recording during execution
 * - Execution trace persistence (save/load)
 * - Replay from specific checkpoints
 * - Step-through replay support
 * - Variable state restoration
 * - Event playback
 */

import { randomUUID } from 'crypto';
import { readFile, writeFile } from 'fs/promises';
import type {
	ExecutionCheckpoint,
	ExecutionTrace,
	CheckpointEvent,
	ReplayOptions,
} from './types';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for ReplayEngine
 */
export interface ReplayEngineConfig {
	/** Enable debug logging */
	debug?: boolean;
	/** Auto-save trace after each checkpoint */
	autoSave?: boolean;
	/** Path to save trace file */
	traceOutputPath?: string;
}

/**
 * Checkpoint creation options
 */
export interface CheckpointOptions {
	/** Optional metadata to attach to checkpoint */
	metadata?: Record<string, unknown>;
}

/**
 * Replay state tracking
 */
interface ReplayState {
	/** Is replay currently active */
	active: boolean;
	/** Current checkpoint being replayed */
	currentCheckpoint?: ExecutionCheckpoint;
	/** Index of current checkpoint in trace */
	checkpointIndex: number;
	/** Events replayed so far */
	eventsReplayed: number;
	/** Whether to step through replay */
	stepThrough: boolean;
}

// ============================================================================
// ReplayEngine Class
// ============================================================================

export class ReplayEngine {
	private config: Required<Omit<ReplayEngineConfig, 'traceOutputPath'>> & {
		traceOutputPath?: string;
	};
	private trace: ExecutionTrace | null = null;
	private checkpoints: Map<string, ExecutionCheckpoint> = new Map();
	private sequenceNumber = 0;
	private disposed = false;
	private replayState: ReplayState = {
		active: false,
		checkpointIndex: 0,
		eventsReplayed: 0,
		stepThrough: false,
	};

	constructor(config: ReplayEngineConfig = {}) {
		this.config = {
			debug: config.debug ?? false,
			autoSave: config.autoSave ?? false,
			traceOutputPath: config.traceOutputPath,
		};
	}

	// ==========================================================================
	// Trace Management
	// ==========================================================================

	/**
	 * Start a new execution trace
	 */
	startTrace(workflowName: string, initialVariables: Record<string, unknown>): void {
		this.checkDisposed();

		const traceId = randomUUID();
		const startTime = new Date().toISOString();

		this.trace = {
			id: traceId,
			workflowName,
			startTime,
			status: 'running',
			checkpoints: [],
			events: [],
			initialVariables: { ...initialVariables },
		};

		this.checkpoints.clear();
		this.sequenceNumber = 0;

		this.debug(`Started trace: ${traceId} for workflow: ${workflowName}`);
	}

	/**
	 * Complete the current trace
	 */
	completeTrace(
		finalVariables: Record<string, unknown>,
		success = true
	): ExecutionTrace {
		this.checkDisposed();
		this.checkTraceActive();

		if (!this.trace) {
			throw new Error('No active trace');
		}

		const endTime = new Date().toISOString();
		const duration =
			new Date(endTime).getTime() - new Date(this.trace.startTime).getTime();

		this.trace.endTime = endTime;
		this.trace.status = success ? 'completed' : 'failed';
		this.trace.finalVariables = { ...finalVariables };
		this.trace.duration = duration;

		this.debug(
			`Completed trace: ${this.trace.id} (status: ${this.trace.status}, duration: ${duration}ms)`
		);

		// Auto-save if configured
		if (this.config.autoSave && this.config.traceOutputPath) {
			void this.saveTrace(this.config.traceOutputPath);
		}

		return this.trace;
	}

	/**
	 * Fail the current trace with an error
	 */
	failTrace(error: Error, nodeName?: string): ExecutionTrace {
		this.checkDisposed();
		this.checkTraceActive();

		if (!this.trace) {
			throw new Error('No active trace');
		}

		this.trace.error = {
			message: error.message,
			stack: error.stack,
			nodeName,
		};

		return this.completeTrace({}, false);
	}

	/**
	 * Get the current trace
	 */
	getTrace(): ExecutionTrace | null {
		this.checkDisposed();
		return this.trace;
	}

	/**
	 * Check if a trace is currently active
	 */
	isTraceActive(): boolean {
		return this.trace !== null && this.trace.status === 'running';
	}

	// ==========================================================================
	// Checkpoint Management
	// ==========================================================================

	/**
	 * Create a checkpoint at the current execution point
	 */
	createCheckpoint(
		workflowName: string,
		nodeName: string,
		variables: Record<string, unknown>,
		options: CheckpointOptions = {}
	): ExecutionCheckpoint {
		this.checkDisposed();
		this.checkTraceActive();

		if (!this.trace) {
			throw new Error('No active trace');
		}

		const checkpointId = randomUUID();
		const timestamp = new Date().toISOString();

		const checkpoint: ExecutionCheckpoint = {
			id: checkpointId,
			timestamp,
			workflowName,
			nodeName,
			variables: { ...variables },
			sequenceNumber: this.sequenceNumber++,
			events: [...this.trace.events],
			metadata: options.metadata,
		};

		this.checkpoints.set(checkpointId, checkpoint);
		this.trace.checkpoints.push(checkpoint);

		this.debug(
			`Created checkpoint: ${checkpointId} at node: ${nodeName} (seq: ${checkpoint.sequenceNumber})`
		);

		return checkpoint;
	}

	/**
	 * Get a checkpoint by ID
	 */
	getCheckpoint(checkpointId: string): ExecutionCheckpoint | undefined {
		this.checkDisposed();
		return this.checkpoints.get(checkpointId);
	}

	/**
	 * Get all checkpoints
	 */
	getAllCheckpoints(): ExecutionCheckpoint[] {
		this.checkDisposed();
		return Array.from(this.checkpoints.values()).sort(
			(a, b) => a.sequenceNumber - b.sequenceNumber
		);
	}

	/**
	 * Find checkpoint by node name
	 */
	findCheckpointByNode(nodeName: string): ExecutionCheckpoint | undefined {
		this.checkDisposed();

		const checkpoints = this.getAllCheckpoints();
		// Return the most recent checkpoint for this node
		for (let i = checkpoints.length - 1; i >= 0; i--) {
			if (checkpoints[i].nodeName === nodeName) {
				return checkpoints[i];
			}
		}

		return undefined;
	}

	/**
	 * Get the last checkpoint
	 */
	getLastCheckpoint(): ExecutionCheckpoint | undefined {
		this.checkDisposed();

		const checkpoints = this.getAllCheckpoints();
		return checkpoints[checkpoints.length - 1];
	}

	// ==========================================================================
	// Event Recording
	// ==========================================================================

	/**
	 * Record an event during execution
	 */
	recordEvent(
		eventType: string,
		payload: unknown,
		nodeName?: string
	): CheckpointEvent {
		this.checkDisposed();
		this.checkTraceActive();

		if (!this.trace) {
			throw new Error('No active trace');
		}

		const event: CheckpointEvent = {
			type: eventType,
			payload,
			timestamp: new Date().toISOString(),
			nodeName,
		};

		this.trace.events.push(event);

		this.debug(`Recorded event: ${eventType} (node: ${nodeName ?? 'none'})`);

		return event;
	}

	/**
	 * Get all recorded events
	 */
	getEvents(): CheckpointEvent[] {
		this.checkDisposed();
		return this.trace?.events ?? [];
	}

	/**
	 * Get events for a specific node
	 */
	getEventsForNode(nodeName: string): CheckpointEvent[] {
		this.checkDisposed();
		return this.getEvents().filter((event) => event.nodeName === nodeName);
	}

	/**
	 * Get events of a specific type
	 */
	getEventsByType(eventType: string): CheckpointEvent[] {
		this.checkDisposed();
		return this.getEvents().filter((event) => event.type === eventType);
	}

	// ==========================================================================
	// Trace Persistence
	// ==========================================================================

	/**
	 * Save trace to a file
	 */
	async saveTrace(filePath: string): Promise<void> {
		this.checkDisposed();

		if (!this.trace) {
			throw new Error('No trace to save');
		}

		try {
			const json = JSON.stringify(this.trace, null, 2);
			await writeFile(filePath, json, 'utf-8');
			this.debug(`Saved trace to: ${filePath}`);
		} catch (error) {
			throw new Error(
				`Failed to save trace: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	/**
	 * Load trace from a file
	 */
	async loadTrace(filePath: string): Promise<ExecutionTrace> {
		this.checkDisposed();

		try {
			const json = await readFile(filePath, 'utf-8');
			const trace = JSON.parse(json) as ExecutionTrace;

			// Validate trace structure
			if (!trace.id || !trace.workflowName || !trace.checkpoints || !trace.events) {
				throw new Error('Invalid trace file format');
			}

			this.trace = trace;

			// Rebuild checkpoint map
			this.checkpoints.clear();
			for (const checkpoint of trace.checkpoints) {
				this.checkpoints.set(checkpoint.id, checkpoint);
			}

			this.sequenceNumber = trace.checkpoints.length;

			this.debug(`Loaded trace from: ${filePath} (${trace.checkpoints.length} checkpoints)`);

			return trace;
		} catch (error) {
			throw new Error(
				`Failed to load trace: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	// ==========================================================================
	// Replay Functionality
	// ==========================================================================

	/**
	 * Start replay from a checkpoint
	 */
	async startReplay(options: ReplayOptions): Promise<void> {
		this.checkDisposed();

		const { fromCheckpoint, trace, stepThroughReplay = false, variableOverrides = {} } = options;

		// Load the trace
		this.trace = trace;
		this.checkpoints.clear();
		for (const checkpoint of trace.checkpoints) {
			this.checkpoints.set(checkpoint.id, checkpoint);
		}

		// Find the checkpoint to replay from
		const checkpoint = this.checkpoints.get(fromCheckpoint);
		if (!checkpoint) {
			throw new Error(`Checkpoint not found: ${fromCheckpoint}`);
		}

		// Find checkpoint index
		const checkpointIndex = trace.checkpoints.findIndex((cp) => cp.id === fromCheckpoint);
		if (checkpointIndex === -1) {
			throw new Error(`Checkpoint not found in trace: ${fromCheckpoint}`);
		}

		// Apply variable overrides
		const variables = { ...checkpoint.variables, ...variableOverrides };

		this.replayState = {
			active: true,
			currentCheckpoint: { ...checkpoint, variables },
			checkpointIndex,
			eventsReplayed: 0,
			stepThrough: stepThroughReplay,
		};

		this.debug(
			`Started replay from checkpoint: ${fromCheckpoint} (node: ${checkpoint.nodeName}, seq: ${checkpoint.sequenceNumber})`
		);
	}

	/**
	 * Stop replay
	 */
	stopReplay(): void {
		this.checkDisposed();

		this.replayState = {
			active: false,
			checkpointIndex: 0,
			eventsReplayed: 0,
			stepThrough: false,
		};

		this.debug('Stopped replay');
	}

	/**
	 * Check if replay is active
	 */
	isReplayActive(): boolean {
		return this.replayState.active;
	}

	/**
	 * Get current replay state
	 */
	getReplayState(): ReplayState {
		this.checkDisposed();
		return { ...this.replayState };
	}

	/**
	 * Get the current checkpoint during replay
	 */
	getCurrentReplayCheckpoint(): ExecutionCheckpoint | undefined {
		this.checkDisposed();
		return this.replayState.currentCheckpoint;
	}

	/**
	 * Get the next checkpoint during replay
	 */
	getNextReplayCheckpoint(): ExecutionCheckpoint | undefined {
		this.checkDisposed();

		if (!this.trace || !this.replayState.active) {
			return undefined;
		}

		const nextIndex = this.replayState.checkpointIndex + 1;
		if (nextIndex < this.trace.checkpoints.length) {
			return this.trace.checkpoints[nextIndex];
		}

		return undefined;
	}

	/**
	 * Advance to the next checkpoint during replay
	 */
	advanceReplay(): ExecutionCheckpoint | undefined {
		this.checkDisposed();

		const next = this.getNextReplayCheckpoint();
		if (next) {
			this.replayState.currentCheckpoint = next;
			this.replayState.checkpointIndex++;
			this.debug(
				`Advanced replay to checkpoint: ${next.id} (node: ${next.nodeName}, seq: ${next.sequenceNumber})`
			);
		}

		return next;
	}

	/**
	 * Get events to replay up to current checkpoint
	 */
	getEventsToReplay(): CheckpointEvent[] {
		this.checkDisposed();

		if (!this.replayState.currentCheckpoint) {
			return [];
		}

		// Events are stored in the checkpoint
		return this.replayState.currentCheckpoint.events.slice(this.replayState.eventsReplayed);
	}

	/**
	 * Mark events as replayed
	 */
	markEventsReplayed(count: number): void {
		this.checkDisposed();
		this.replayState.eventsReplayed += count;
		this.debug(`Marked ${count} events as replayed (total: ${this.replayState.eventsReplayed})`);
	}

	// ==========================================================================
	// Internal Methods
	// ==========================================================================

	/**
	 * Check if trace is active
	 */
	private checkTraceActive(): void {
		if (!this.isTraceActive()) {
			throw new Error('No active trace. Call startTrace() first.');
		}
	}

	/**
	 * Check if disposed and throw error if true
	 */
	private checkDisposed(): void {
		if (this.disposed) {
			throw new Error('ReplayEngine has been disposed');
		}
	}

	/**
	 * Debug logging
	 */
	private debug(message: string): void {
		if (this.config.debug) {
			// eslint-disable-next-line no-console
			console.debug(`[ReplayEngine] ${message}`);
		}
	}

	// ==========================================================================
	// Lifecycle
	// ==========================================================================

	/**
	 * Dispose of the replay engine
	 */
	dispose(): void {
		if (this.disposed) return;

		this.checkpoints.clear();
		this.trace = null;
		this.replayState = {
			active: false,
			checkpointIndex: 0,
			eventsReplayed: 0,
			stepThrough: false,
		};
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
// Utility Functions
// ============================================================================

/**
 * Create a checkpoint event from a base event
 */
export function createCheckpointEvent(
	type: string,
	payload: unknown,
	nodeName?: string
): CheckpointEvent {
	return {
		type,
		payload,
		timestamp: new Date().toISOString(),
		nodeName,
	};
}

/**
 * Compare two checkpoints by sequence number
 */
export function compareCheckpoints(a: ExecutionCheckpoint, b: ExecutionCheckpoint): number {
	return a.sequenceNumber - b.sequenceNumber;
}

/**
 * Find the last successful checkpoint before a failure
 */
export function findLastSuccessfulCheckpoint(
	trace: ExecutionTrace
): ExecutionCheckpoint | undefined {
	if (!trace.error) {
		// No error, return last checkpoint
		return trace.checkpoints[trace.checkpoints.length - 1];
	}

	// Find last checkpoint before the error
	const errorNode = trace.error.nodeName;
	if (!errorNode) {
		return trace.checkpoints[trace.checkpoints.length - 1];
	}

	// Find last checkpoint before the error node
	for (let i = trace.checkpoints.length - 1; i >= 0; i--) {
		if (trace.checkpoints[i].nodeName !== errorNode) {
			return trace.checkpoints[i];
		}
	}

	return undefined;
}
