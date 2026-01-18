/**
 * VariableInspector - Inspects and formats workflow variables for debugging
 *
 * Features:
 * - Multi-scope variable inspection (workflow, node, local)
 * - Pattern matching with wildcards
 * - Deep object/array expansion with configurable depth limits
 * - Type detection and formatting
 * - Child variable lazy-loading
 * - DAP-compatible variable references
 * - Call stack frame inspection
 */

import type {
	VariableInfo,
	VariableInspectionRequest,
	VariableScope,
	DebugContext,
	StackFrame,
} from './types';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for VariableInspector
 */
export interface VariableInspectorConfig {
	/** Default max depth for object expansion */
	defaultMaxDepth?: number;
	/** Enable debug logging */
	debug?: boolean;
}

/**
 * Internal variable reference tracking for DAP
 */
interface VariableReference {
	id: number;
	value: unknown;
	scope: VariableScope;
	path: string[];
}

// ============================================================================
// Type Detection and Formatting Utilities
// ============================================================================

/**
 * Get the type string for a value
 */
function getValueType(value: unknown): string {
	if (value === null) return 'null';
	if (value === undefined) return 'undefined';
	if (Array.isArray(value)) return 'array';
	if (value instanceof Date) return 'Date';
	if (value instanceof RegExp) return 'RegExp';
	if (value instanceof Error) return 'Error';
	if (value instanceof Map) return 'Map';
	if (value instanceof Set) return 'Set';
	if (typeof value === 'object') return 'object';
	return typeof value;
}

/**
 * Get child count for objects and arrays
 */
function getChildCount(value: unknown): number | undefined {
	if (Array.isArray(value)) {
		return value.length;
	}
	if (value !== null && typeof value === 'object') {
		if (value instanceof Map) {
			return value.size;
		}
		if (value instanceof Set) {
			return value.size;
		}
		return Object.keys(value).length;
	}
	return undefined;
}

/**
 * Check if a value can have children (is expandable)
 */
function isExpandable(value: unknown): boolean {
	if (Array.isArray(value)) return value.length > 0;
	if (value instanceof Map) return value.size > 0;
	if (value instanceof Set) return value.size > 0;
	if (value !== null && typeof value === 'object') {
		return Object.keys(value).length > 0;
	}
	return false;
}

/**
 * Check if a variable name matches a pattern
 */
function matchesPattern(name: string, pattern: string): boolean {
	// If no pattern, match all
	if (!pattern) return true;

	// Support wildcards
	if (pattern === '*') return true;

	// Convert glob-like pattern to regex
	const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
	const regexStr = escaped.replace(/\*/g, '.*');
	const regex = new RegExp(`^${regexStr}$`);

	return regex.test(name);
}

/**
 * Get child variables from a value
 */
function getChildren(value: unknown): Array<{ name: string; value: unknown }> {
	const children: Array<{ name: string; value: unknown }> = [];

	if (Array.isArray(value)) {
		// Array indices as children
		value.forEach((item, index) => {
			children.push({ name: `[${index}]`, value: item });
		});
	} else if (value instanceof Map) {
		// Map entries as children
		for (const [key, val] of value.entries()) {
			children.push({ name: String(key), value: val });
		}
	} else if (value instanceof Set) {
		// Set values as children
		let index = 0;
		for (const val of value.values()) {
			children.push({ name: `[${index}]`, value: val });
			index++;
		}
	} else if (value !== null && typeof value === 'object') {
		// Object properties as children
		for (const [key, val] of Object.entries(value)) {
			children.push({ name: key, value: val });
		}
	}

	return children;
}

// ============================================================================
// VariableInspector Class
// ============================================================================

export class VariableInspector {
	private config: Required<VariableInspectorConfig>;
	private nextVariableRef = 1;
	private variableRefs: Map<number, VariableReference> = new Map();
	private disposed = false;

	constructor(config: VariableInspectorConfig = {}) {
		this.config = {
			defaultMaxDepth: config.defaultMaxDepth ?? 3,
			debug: config.debug ?? false,
		};
	}

	// ==========================================================================
	// Public Inspection API
	// ==========================================================================

	/**
	 * Inspect variables based on a request
	 */
	inspect(context: DebugContext, request: VariableInspectionRequest = {}): VariableInfo[] {
		this.checkDisposed();

		const {
			scope,
			namePattern = '*',
			frameId,
			maxDepth = this.config.defaultMaxDepth,
		} = request;

		// Get variables from the appropriate scope
		const variables = this.getVariablesForScope(context, scope, frameId);

		// Filter by pattern and convert to VariableInfo
		const result: VariableInfo[] = [];
		for (const [name, value] of Object.entries(variables)) {
			if (matchesPattern(name, namePattern)) {
				result.push(this.createVariableInfo(name, value, scope ?? 'workflow', maxDepth));
			}
		}

		this.debug(`Inspected ${result.length} variables (scope: ${scope ?? 'all'}, pattern: ${namePattern})`);
		return result;
	}

	/**
	 * Get variables from a specific scope
	 */
	inspectScope(context: DebugContext, scope: VariableScope): VariableInfo[] {
		this.checkDisposed();

		return this.inspect(context, { scope });
	}

	/**
	 * Get a single variable by name
	 */
	inspectVariable(
		context: DebugContext,
		name: string,
		scope?: VariableScope
	): VariableInfo | null {
		this.checkDisposed();

		const variables = this.getVariablesForScope(context, scope);

		// Check if key exists (to distinguish "not found" from "value is undefined")
		if (!(name in variables)) {
			return null;
		}

		const value = variables[name];
		return this.createVariableInfo(name, value, scope ?? 'workflow', this.config.defaultMaxDepth);
	}

	/**
	 * Get child variables for a variable reference (for DAP)
	 */
	getVariableChildren(variableReference: number): VariableInfo[] {
		this.checkDisposed();

		const ref = this.variableRefs.get(variableReference);
		if (!ref) {
			return [];
		}

		const children = getChildren(ref.value);
		return children.map((child) =>
			this.createVariableInfo(
				child.name,
				child.value,
				ref.scope,
				this.config.defaultMaxDepth - ref.path.length,
				[...ref.path, child.name]
			)
		);
	}

	/**
	 * Inspect call stack frame variables
	 */
	inspectFrame(frame: StackFrame): VariableInfo[] {
		this.checkDisposed();

		const result: VariableInfo[] = [];
		for (const [name, value] of Object.entries(frame.variables)) {
			result.push(this.createVariableInfo(name, value, 'local', this.config.defaultMaxDepth));
		}

		this.debug(`Inspected frame ${frame.id}: ${result.length} variables`);
		return result;
	}

	/**
	 * Clear all variable references
	 */
	clearReferences(): void {
		this.checkDisposed();

		this.variableRefs.clear();
		this.nextVariableRef = 1;
		this.debug('Cleared all variable references');
	}

	// ==========================================================================
	// Internal Methods
	// ==========================================================================

	/**
	 * Get variables for a specific scope
	 */
	private getVariablesForScope(
		context: DebugContext,
		scope?: VariableScope,
		frameId?: number
	): Record<string, unknown> {
		// If frameId is specified, get variables from that stack frame
		if (frameId !== undefined) {
			const frame = context.callStack.find((f) => f.id === frameId);
			if (!frame) {
				return {};
			}
			return frame.variables;
		}

		// Otherwise, get variables based on scope
		switch (scope) {
			case 'workflow':
				return context.variables;

			case 'node':
				// Node scope is the current top of the call stack
				if (context.callStack.length > 0) {
					return context.callStack[context.callStack.length - 1].variables;
				}
				return {};

			case 'local':
				// Local scope is also the top of the call stack
				if (context.callStack.length > 0) {
					return context.callStack[context.callStack.length - 1].variables;
				}
				return {};

			default:
				// No scope specified - return workflow variables
				return context.variables;
		}
	}

	/**
	 * Create a VariableInfo object for a variable
	 */
	private createVariableInfo(
		name: string,
		value: unknown,
		scope: VariableScope,
		maxDepth: number,
		path: string[] = []
	): VariableInfo {
		const type = getValueType(value);
		const childCount = getChildCount(value);
		const expandable = isExpandable(value);

		// Create variable info
		const info: VariableInfo = {
			name,
			value,
			type,
			scope,
			readonly: false, // Could be enhanced to detect readonly properties
			childCount,
		};

		// Create variable reference if expandable
		if (expandable && maxDepth > 0) {
			const refId = this.createVariableReference(value, scope, path);
			info.variableReference = refId;

			// Optionally expand children up to maxDepth
			if (maxDepth > 1) {
				const children = getChildren(value);
				info.children = children.map((child) =>
					this.createVariableInfo(
						child.name,
						child.value,
						scope,
						maxDepth - 1,
						[...path, child.name]
					)
				);
			}
		}

		return info;
	}

	/**
	 * Create a variable reference for DAP
	 */
	private createVariableReference(
		value: unknown,
		scope: VariableScope,
		path: string[]
	): number {
		const refId = this.nextVariableRef++;

		this.variableRefs.set(refId, {
			id: refId,
			value,
			scope,
			path,
		});

		return refId;
	}

	/**
	 * Check if disposed and throw error if true
	 */
	private checkDisposed(): void {
		if (this.disposed) {
			throw new Error('VariableInspector has been disposed');
		}
	}

	/**
	 * Debug logging
	 */
	private debug(message: string): void {
		if (this.config.debug) {
			// eslint-disable-next-line no-console
			console.debug(`[VariableInspector] ${message}`);
		}
	}

	// ==========================================================================
	// Lifecycle
	// ==========================================================================

	/**
	 * Dispose of the variable inspector
	 */
	dispose(): void {
		if (this.disposed) return;

		this.variableRefs.clear();
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
 * Format a value for display (truncate long strings, etc.)
 */
export function formatValueForDisplay(value: unknown, maxLength = 100): string {
	if (value === null) return 'null';
	if (value === undefined) return 'undefined';

	const type = getValueType(value);

	switch (type) {
		case 'string':
			{
				const str = String(value);
				if (str.length > maxLength) {
					return `"${str.substring(0, maxLength)}..."`;
				}
				return `"${str}"`;
			}

		case 'array':
			{
				const arr = value as unknown[];
				return `Array(${arr.length})`;
			}

		case 'object':
			{
				const obj = value as Record<string, unknown>;
				const keys = Object.keys(obj);
				return `Object {${keys.length} properties}`;
			}

		case 'Map':
			{
				const map = value as Map<unknown, unknown>;
				return `Map(${map.size})`;
			}

		case 'Set':
			{
				const set = value as Set<unknown>;
				return `Set(${set.size})`;
			}

		case 'Date':
			return (value as Date).toISOString();

		case 'RegExp':
			return String(value);

		case 'Error':
			return (value as Error).message;

		default:
			{
				const str = String(value);
				if (str.length > maxLength) {
					return `${str.substring(0, maxLength)}...`;
				}
				return str;
			}
	}
}

/**
 * Create a simple variable info (without expansion)
 */
export function createSimpleVariableInfo(
	name: string,
	value: unknown,
	scope: VariableScope = 'workflow'
): VariableInfo {
	return {
		name,
		value,
		type: getValueType(value),
		scope,
		readonly: false,
		childCount: getChildCount(value),
	};
}
