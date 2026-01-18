/**
 * BreakpointManager - Manages breakpoints for workflow debugging
 *
 * Features:
 * - Line (node) breakpoints with before/after execution control
 * - Conditional breakpoints with expression evaluation
 * - Event breakpoints with pattern matching
 * - Exception breakpoints (all/uncaught)
 * - Hit count tracking and conditional breaking
 * - Logpoints (log without breaking)
 * - Enable/disable breakpoints
 * - Breakpoint hit callbacks
 */

import { randomUUID } from 'crypto';
import type {
	Breakpoint,
	NodeBreakpoint,
	EventBreakpoint,
	ExceptionBreakpoint,
	BreakpointHit,
	DebugContext,
} from './types';

// ============================================================================
// Types
// ============================================================================

/**
 * Callback when a breakpoint is hit
 */
export type BreakpointHitCallback = (hit: BreakpointHit) => void | Promise<void>;

/**
 * Configuration for BreakpointManager
 */
export interface BreakpointManagerConfig {
	/** Enable debug logging */
	debug?: boolean;
	/** Callback when breakpoints are hit */
	onBreakpointHit?: BreakpointHitCallback;
}

/**
 * Internal breakpoint tracking
 */
interface BreakpointEntry {
	breakpoint: Breakpoint;
	hitCount: number;
	lastHit?: string; // timestamp
}

// ============================================================================
// Condition Evaluation Utilities
// ============================================================================

/**
 * Safely evaluate a breakpoint condition in the context of current variables
 */
function evaluateCondition(
	condition: string,
	context: DebugContext
): boolean {
	try {
		// Create a safe evaluation context with current variables
		const variables = context.variables;
		const currentNode = context.currentNode;
		const previousNode = context.previousNode;
		const nextNode = context.nextNode;

		// Use Function constructor for safer evaluation than eval
		// eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
		const evalFn = new Function(
			'variables',
			'currentNode',
			'previousNode',
			'nextNode',
			`
			// Allow direct variable access
			const vars = variables;

			// Evaluate condition
			return (${condition});
		`
		);

		return Boolean(evalFn(variables, currentNode, previousNode, nextNode));
	} catch (error) {
		// If condition evaluation fails, don't break
		// This prevents malformed conditions from stopping execution
		return false;
	}
}

/**
 * Check if a node name matches a breakpoint pattern
 */
function matchesNodeName(nodeName: string, pattern: string): boolean {
	// Support wildcards in node names
	if (pattern === '*') {
		return true;
	}

	// Convert glob-like pattern to regex
	const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
	const regexStr = escaped.replace(/\*/g, '.*');
	const regex = new RegExp(`^${regexStr}$`);

	return regex.test(nodeName);
}

/**
 * Check if an event type matches a breakpoint pattern
 */
function matchesEventType(eventType: string, pattern: string): boolean {
	// Support wildcards in event types (e.g., 'tool:*', 'node:*')
	if (pattern === '*') {
		return true;
	}

	// Convert glob-like pattern to regex
	const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
	const regexStr = escaped.replace(/\*/g, '[^:]+');
	const regex = new RegExp(`^${regexStr}$`);

	return regex.test(eventType);
}

/**
 * Format a log message by replacing variable placeholders
 */
function formatLogMessage(
	message: string,
	context: DebugContext
): string {
	let formatted = message;

	// Replace {variableName} with variable values
	const variablePattern = /\{([^}]+)\}/g;
	formatted = formatted.replace(variablePattern, (_, varName) => {
		const value = context.variables[varName];
		return value !== undefined ? String(value) : `{${varName}}`;
	});

	// Replace {node} with current node
	formatted = formatted.replace(/\{node\}/g, context.currentNode || 'unknown');

	return formatted;
}

// ============================================================================
// BreakpointManager Class
// ============================================================================

export class BreakpointManager {
	private breakpoints: Map<string, BreakpointEntry> = new Map();
	private config: Required<BreakpointManagerConfig>;
	private disposed = false;

	constructor(config: BreakpointManagerConfig = {}) {
		this.config = {
			debug: config.debug ?? false,
			onBreakpointHit: config.onBreakpointHit ?? (() => {}),
		};
	}

	// ==========================================================================
	// Breakpoint Management
	// ==========================================================================

	/**
	 * Add a breakpoint
	 */
	add(breakpoint: Breakpoint): void {
		this.checkDisposed();

		const entry: BreakpointEntry = {
			breakpoint,
			hitCount: 0,
		};

		this.breakpoints.set(breakpoint.id, entry);
		this.debug(`Added breakpoint: ${breakpoint.id} (type: ${breakpoint.type})`);
	}

	/**
	 * Remove a breakpoint by ID
	 */
	remove(id: string): boolean {
		this.checkDisposed();

		const removed = this.breakpoints.delete(id);
		if (removed) {
			this.debug(`Removed breakpoint: ${id}`);
		}
		return removed;
	}

	/**
	 * Clear all breakpoints
	 */
	clear(): void {
		this.checkDisposed();

		const count = this.breakpoints.size;
		this.breakpoints.clear();
		this.debug(`Cleared ${count} breakpoints`);
	}

	/**
	 * Get a breakpoint by ID
	 */
	get(id: string): Breakpoint | undefined {
		this.checkDisposed();

		return this.breakpoints.get(id)?.breakpoint;
	}

	/**
	 * Get all breakpoints
	 */
	getAll(): Breakpoint[] {
		this.checkDisposed();

		return Array.from(this.breakpoints.values()).map((entry) => entry.breakpoint);
	}

	/**
	 * Get breakpoints by type
	 */
	getByType<T extends Breakpoint['type']>(
		type: T
	): Extract<Breakpoint, { type: T }>[] {
		this.checkDisposed();

		return this.getAll().filter(
			(bp) => bp.type === type
		) as Extract<Breakpoint, { type: T }>[];
	}

	/**
	 * Enable a breakpoint
	 */
	enable(id: string): void {
		this.checkDisposed();

		const entry = this.breakpoints.get(id);
		if (entry) {
			entry.breakpoint.enabled = true;
			this.debug(`Enabled breakpoint: ${id}`);
		}
	}

	/**
	 * Disable a breakpoint
	 */
	disable(id: string): void {
		this.checkDisposed();

		const entry = this.breakpoints.get(id);
		if (entry) {
			entry.breakpoint.enabled = false;
			this.debug(`Disabled breakpoint: ${id}`);
		}
	}

	/**
	 * Toggle a breakpoint's enabled state
	 */
	toggle(id: string): boolean {
		this.checkDisposed();

		const entry = this.breakpoints.get(id);
		if (entry) {
			entry.breakpoint.enabled = !entry.breakpoint.enabled;
			this.debug(
				`Toggled breakpoint: ${id} (enabled: ${entry.breakpoint.enabled})`
			);
			return entry.breakpoint.enabled;
		}
		return false;
	}

	/**
	 * Reset hit counts for all breakpoints
	 */
	resetHitCounts(): void {
		this.checkDisposed();

		for (const entry of this.breakpoints.values()) {
			entry.hitCount = 0;
			entry.lastHit = undefined;
		}
		this.debug('Reset all breakpoint hit counts');
	}

	// ==========================================================================
	// Breakpoint Evaluation
	// ==========================================================================

	/**
	 * Check if a node breakpoint should trigger
	 */
	checkNodeBreakpoint(
		nodeName: string,
		when: 'before' | 'after',
		context: DebugContext
	): BreakpointHit | null {
		this.checkDisposed();

		const nodeBreakpoints = this.getByType('node');

		for (const bp of nodeBreakpoints) {
			if (!bp.enabled) continue;
			if (bp.when !== when) continue;
			if (!matchesNodeName(nodeName, bp.nodeName)) continue;

			// Check if this breakpoint should trigger
			const shouldBreak = this.shouldBreakpoint(bp, context);
			if (shouldBreak) {
				return this.createBreakpointHit(bp, context, `Node ${when}: ${nodeName}`);
			}
		}

		return null;
	}

	/**
	 * Check if an event breakpoint should trigger
	 */
	checkEventBreakpoint(
		eventType: string,
		context: DebugContext
	): BreakpointHit | null {
		this.checkDisposed();

		const eventBreakpoints = this.getByType('event');

		for (const bp of eventBreakpoints) {
			if (!bp.enabled) continue;
			if (!matchesEventType(eventType, bp.eventType)) continue;

			const shouldBreak = this.shouldBreakpoint(bp, context);
			if (shouldBreak) {
				return this.createBreakpointHit(bp, context, `Event: ${eventType}`);
			}
		}

		return null;
	}

	/**
	 * Check if an exception breakpoint should trigger
	 */
	checkExceptionBreakpoint(
		error: Error,
		isUncaught: boolean,
		context: DebugContext
	): BreakpointHit | null {
		this.checkDisposed();

		const exceptionBreakpoints = this.getByType('exception');

		for (const bp of exceptionBreakpoints) {
			if (!bp.enabled) continue;

			// Check mode: 'all' breaks on any exception, 'uncaught' only on uncaught
			if (bp.mode === 'uncaught' && !isUncaught) continue;

			const shouldBreak = this.shouldBreakpoint(bp, context);
			if (shouldBreak) {
				return this.createBreakpointHit(
					bp,
					context,
					`Exception: ${error.message}`
				);
			}
		}

		return null;
	}

	// ==========================================================================
	// Internal Methods
	// ==========================================================================

	/**
	 * Check if a breakpoint should trigger based on conditions and hit count
	 */
	private shouldBreakpoint(
		breakpoint: Breakpoint,
		context: DebugContext
	): boolean {
		const entry = this.breakpoints.get(breakpoint.id);
		if (!entry) return false;

		// Increment hit count
		entry.hitCount++;

		// Check hit count condition
		if (breakpoint.hitCount !== undefined) {
			if (entry.hitCount !== breakpoint.hitCount) {
				return false;
			}
		}

		// Check conditional breakpoint
		if (breakpoint.condition) {
			if (!evaluateCondition(breakpoint.condition, context)) {
				return false;
			}
		}

		return true;
	}

	/**
	 * Create a breakpoint hit event
	 */
	private createBreakpointHit(
		breakpoint: Breakpoint,
		context: DebugContext,
		reason: string
	): BreakpointHit {
		const entry = this.breakpoints.get(breakpoint.id);
		if (!entry) {
			throw new Error(`Breakpoint entry not found: ${breakpoint.id}`);
		}

		const timestamp = new Date().toISOString();
		entry.lastHit = timestamp;

		const hit: BreakpointHit = {
			breakpoint,
			timestamp,
			context,
			reason,
			hitCount: entry.hitCount,
		};

		// Handle logpoint (log without breaking)
		if (breakpoint.logMessage) {
			const message = formatLogMessage(breakpoint.logMessage, context);
			this.log(`[Logpoint] ${message}`);
		}

		// Note: Callback is NOT called here - the caller (Debugger.beforeNodeExecution etc.)
		// is responsible for calling handleBreakpointHit which will invoke the callback
		return hit;
	}

	/**
	 * Check if disposed and throw error if true
	 */
	private checkDisposed(): void {
		if (this.disposed) {
			throw new Error('BreakpointManager has been disposed');
		}
	}

	/**
	 * Debug logging
	 */
	private debug(message: string): void {
		if (this.config.debug) {
			// eslint-disable-next-line no-console
			console.debug(`[BreakpointManager] ${message}`);
		}
	}

	/**
	 * General logging (for logpoints)
	 */
	private log(message: string): void {
		// eslint-disable-next-line no-console
		console.log(message);
	}

	// ==========================================================================
	// Lifecycle
	// ==========================================================================

	/**
	 * Dispose of the breakpoint manager
	 */
	dispose(): void {
		if (this.disposed) return;

		this.breakpoints.clear();
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
 * Create a node breakpoint
 */
export function createNodeBreakpoint(
	nodeName: string,
	when: 'before' | 'after' = 'before',
	options?: {
		condition?: string;
		hitCount?: number;
		logMessage?: string;
		enabled?: boolean;
	}
): NodeBreakpoint {
	return {
		id: randomUUID(),
		type: 'node',
		nodeName,
		when,
		enabled: options?.enabled ?? true,
		condition: options?.condition,
		hitCount: options?.hitCount,
		logMessage: options?.logMessage,
	};
}

/**
 * Create an event breakpoint
 */
export function createEventBreakpoint(
	eventType: string,
	options?: {
		condition?: string;
		hitCount?: number;
		logMessage?: string;
		enabled?: boolean;
	}
): EventBreakpoint {
	return {
		id: randomUUID(),
		type: 'event',
		eventType,
		enabled: options?.enabled ?? true,
		condition: options?.condition,
		hitCount: options?.hitCount,
		logMessage: options?.logMessage,
	};
}

/**
 * Create an exception breakpoint
 */
export function createExceptionBreakpoint(
	mode: 'all' | 'uncaught' = 'uncaught',
	options?: {
		condition?: string;
		hitCount?: number;
		logMessage?: string;
		enabled?: boolean;
	}
): ExceptionBreakpoint {
	return {
		id: randomUUID(),
		type: 'exception',
		mode,
		enabled: options?.enabled ?? true,
		condition: options?.condition,
		hitCount: options?.hitCount,
		logMessage: options?.logMessage,
	};
}
