/**
 * Tests for VariableInspector
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
	VariableInspector,
	formatValueForDisplay,
	createSimpleVariableInfo,
} from './inspector';
import type { DebugContext } from './types';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockContext(variables: Record<string, unknown> = {}): DebugContext {
	return {
		workflowName: 'test-workflow',
		currentNode: 'test-node',
		previousNode: undefined,
		nextNode: 'next-node',
		variables,
		callStack: [],
	};
}

function createContextWithStack(
	variables: Record<string, unknown>,
	stackVariables: Record<string, unknown>
): DebugContext {
	return {
		workflowName: 'test-workflow',
		currentNode: 'test-node',
		previousNode: undefined,
		nextNode: 'next-node',
		variables,
		callStack: [
			{
				id: 1,
				name: 'test-node',
				source: 'test-node',
				variables: stackVariables,
			},
		],
	};
}

// ============================================================================
// Basic Inspection Tests
// ============================================================================

describe('VariableInspector - Basic Inspection', () => {
	let inspector: VariableInspector;

	beforeEach(() => {
		inspector = new VariableInspector();
	});

	it('should inspect all workflow variables', () => {
		const context = createMockContext({
			name: 'test',
			count: 42,
			enabled: true,
		});

		const result = inspector.inspect(context);

		expect(result).toHaveLength(3);
		expect(result.find((v) => v.name === 'name')?.value).toBe('test');
		expect(result.find((v) => v.name === 'count')?.value).toBe(42);
		expect(result.find((v) => v.name === 'enabled')?.value).toBe(true);
	});

	it('should inspect empty variables', () => {
		const context = createMockContext({});

		const result = inspector.inspect(context);

		expect(result).toHaveLength(0);
	});

	it('should inspect single variable by name', () => {
		const context = createMockContext({
			foo: 'bar',
			baz: 123,
		});

		const result = inspector.inspectVariable(context, 'foo');

		expect(result).not.toBeNull();
		expect(result?.name).toBe('foo');
		expect(result?.value).toBe('bar');
		expect(result?.type).toBe('string');
	});

	it('should return null for non-existent variable', () => {
		const context = createMockContext({
			foo: 'bar',
		});

		const result = inspector.inspectVariable(context, 'nonexistent');

		expect(result).toBeNull();
	});
});

// ============================================================================
// Scope Inspection Tests
// ============================================================================

describe('VariableInspector - Scope Inspection', () => {
	let inspector: VariableInspector;

	beforeEach(() => {
		inspector = new VariableInspector();
	});

	it('should inspect workflow scope', () => {
		const context = createContextWithStack(
			{ workflow: 'var' },
			{ local: 'var' }
		);

		const result = inspector.inspectScope(context, 'workflow');

		expect(result).toHaveLength(1);
		expect(result[0].name).toBe('workflow');
		expect(result[0].scope).toBe('workflow');
	});

	it('should inspect node scope from call stack', () => {
		const context = createContextWithStack(
			{ workflow: 'var' },
			{ local: 'var' }
		);

		const result = inspector.inspectScope(context, 'node');

		expect(result).toHaveLength(1);
		expect(result[0].name).toBe('local');
		expect(result[0].scope).toBe('node');
	});

	it('should inspect local scope from call stack', () => {
		const context = createContextWithStack(
			{ workflow: 'var' },
			{ local: 'var' }
		);

		const result = inspector.inspectScope(context, 'local');

		expect(result).toHaveLength(1);
		expect(result[0].name).toBe('local');
		expect(result[0].scope).toBe('local');
	});

	it('should return empty array for node scope without call stack', () => {
		const context = createMockContext({ workflow: 'var' });

		const result = inspector.inspectScope(context, 'node');

		expect(result).toHaveLength(0);
	});
});

// ============================================================================
// Pattern Matching Tests
// ============================================================================

describe('VariableInspector - Pattern Matching', () => {
	let inspector: VariableInspector;

	beforeEach(() => {
		inspector = new VariableInspector();
	});

	it('should match all variables with wildcard', () => {
		const context = createMockContext({
			foo: 1,
			bar: 2,
			baz: 3,
		});

		const result = inspector.inspect(context, { namePattern: '*' });

		expect(result).toHaveLength(3);
	});

	it('should match exact variable name', () => {
		const context = createMockContext({
			foo: 1,
			bar: 2,
			baz: 3,
		});

		const result = inspector.inspect(context, { namePattern: 'foo' });

		expect(result).toHaveLength(1);
		expect(result[0].name).toBe('foo');
	});

	it('should match variables with prefix pattern', () => {
		const context = createMockContext({
			test_foo: 1,
			test_bar: 2,
			other: 3,
		});

		const result = inspector.inspect(context, { namePattern: 'test_*' });

		expect(result).toHaveLength(2);
		expect(result.map((v) => v.name).sort()).toEqual(['test_bar', 'test_foo']);
	});

	it('should match variables with suffix pattern', () => {
		const context = createMockContext({
			foo_test: 1,
			bar_test: 2,
			other: 3,
		});

		const result = inspector.inspect(context, { namePattern: '*_test' });

		expect(result).toHaveLength(2);
	});

	it('should match variables with middle pattern', () => {
		const context = createMockContext({
			foo_test_bar: 1,
			foo_other_bar: 2,
			other: 3,
		});

		const result = inspector.inspect(context, { namePattern: 'foo_*_bar' });

		expect(result).toHaveLength(2);
	});
});

// ============================================================================
// Type Detection Tests
// ============================================================================

describe('VariableInspector - Type Detection', () => {
	let inspector: VariableInspector;

	beforeEach(() => {
		inspector = new VariableInspector();
	});

	it('should detect string type', () => {
		const context = createMockContext({ str: 'hello' });
		const result = inspector.inspectVariable(context, 'str');
		expect(result?.type).toBe('string');
	});

	it('should detect number type', () => {
		const context = createMockContext({ num: 42 });
		const result = inspector.inspectVariable(context, 'num');
		expect(result?.type).toBe('number');
	});

	it('should detect boolean type', () => {
		const context = createMockContext({ bool: true });
		const result = inspector.inspectVariable(context, 'bool');
		expect(result?.type).toBe('boolean');
	});

	it('should detect null type', () => {
		const context = createMockContext({ nul: null });
		const result = inspector.inspectVariable(context, 'nul');
		expect(result?.type).toBe('null');
	});

	it('should detect undefined type', () => {
		const context = createMockContext({ undef: undefined });
		const result = inspector.inspectVariable(context, 'undef');
		expect(result?.type).toBe('undefined');
	});

	it('should detect array type', () => {
		const context = createMockContext({ arr: [1, 2, 3] });
		const result = inspector.inspectVariable(context, 'arr');
		expect(result?.type).toBe('array');
		expect(result?.childCount).toBe(3);
	});

	it('should detect object type', () => {
		const context = createMockContext({ obj: { a: 1, b: 2 } });
		const result = inspector.inspectVariable(context, 'obj');
		expect(result?.type).toBe('object');
		expect(result?.childCount).toBe(2);
	});

	it('should detect Date type', () => {
		const context = createMockContext({ date: new Date() });
		const result = inspector.inspectVariable(context, 'date');
		expect(result?.type).toBe('Date');
	});

	it('should detect RegExp type', () => {
		const context = createMockContext({ regex: /test/ });
		const result = inspector.inspectVariable(context, 'regex');
		expect(result?.type).toBe('RegExp');
	});

	it('should detect Error type', () => {
		const context = createMockContext({ err: new Error('test') });
		const result = inspector.inspectVariable(context, 'err');
		expect(result?.type).toBe('Error');
	});

	it('should detect Map type', () => {
		const context = createMockContext({ map: new Map([['a', 1]]) });
		const result = inspector.inspectVariable(context, 'map');
		expect(result?.type).toBe('Map');
		expect(result?.childCount).toBe(1);
	});

	it('should detect Set type', () => {
		const context = createMockContext({ set: new Set([1, 2, 3]) });
		const result = inspector.inspectVariable(context, 'set');
		expect(result?.type).toBe('Set');
		expect(result?.childCount).toBe(3);
	});
});

// ============================================================================
// Object Expansion Tests
// ============================================================================

describe('VariableInspector - Object Expansion', () => {
	let inspector: VariableInspector;

	beforeEach(() => {
		inspector = new VariableInspector();
	});

	it('should expand array children', () => {
		const context = createMockContext({
			arr: [1, 2, 3],
		});

		const result = inspector.inspect(context, { maxDepth: 2 });
		const arrVar = result.find((v) => v.name === 'arr');

		expect(arrVar?.children).toBeDefined();
		expect(arrVar?.children).toHaveLength(3);
		expect(arrVar?.children?.[0].name).toBe('[0]');
		expect(arrVar?.children?.[0].value).toBe(1);
	});

	it('should expand object children', () => {
		const context = createMockContext({
			obj: { a: 1, b: 2 },
		});

		const result = inspector.inspect(context, { maxDepth: 2 });
		const objVar = result.find((v) => v.name === 'obj');

		expect(objVar?.children).toBeDefined();
		expect(objVar?.children).toHaveLength(2);
		expect(objVar?.children?.find((c) => c.name === 'a')?.value).toBe(1);
		expect(objVar?.children?.find((c) => c.name === 'b')?.value).toBe(2);
	});

	it('should expand Map children', () => {
		const context = createMockContext({
			map: new Map([['key', 'value']]),
		});

		const result = inspector.inspect(context, { maxDepth: 2 });
		const mapVar = result.find((v) => v.name === 'map');

		expect(mapVar?.children).toBeDefined();
		expect(mapVar?.children).toHaveLength(1);
		expect(mapVar?.children?.[0].name).toBe('key');
		expect(mapVar?.children?.[0].value).toBe('value');
	});

	it('should expand Set children', () => {
		const context = createMockContext({
			set: new Set([1, 2, 3]),
		});

		const result = inspector.inspect(context, { maxDepth: 2 });
		const setVar = result.find((v) => v.name === 'set');

		expect(setVar?.children).toBeDefined();
		expect(setVar?.children).toHaveLength(3);
	});

	it('should respect max depth limit', () => {
		const context = createMockContext({
			nested: {
				level1: {
					level2: {
						level3: 'deep',
					},
				},
			},
		});

		// maxDepth=3 means:
		// - nested (depth 3) gets children expanded
		// - level1 (depth 2) gets children expanded
		// - level2 (depth 1) does NOT get children expanded
		const result = inspector.inspect(context, { maxDepth: 3 });
		const nestedVar = result.find((v) => v.name === 'nested');

		expect(nestedVar?.children).toBeDefined();
		expect(nestedVar?.children?.[0].name).toBe('level1');
		expect(nestedVar?.children?.[0].children).toBeDefined();
		expect(nestedVar?.children?.[0].children?.[0].name).toBe('level2');
		// Max depth reached, no more children
		expect(nestedVar?.children?.[0].children?.[0].children).toBeUndefined();
	});

	it('should not expand with maxDepth 1', () => {
		const context = createMockContext({
			obj: { a: 1, b: 2 },
		});

		const result = inspector.inspect(context, { maxDepth: 1 });
		const objVar = result.find((v) => v.name === 'obj');

		expect(objVar?.variableReference).toBeDefined();
		expect(objVar?.children).toBeUndefined();
	});

	it('should not expand primitives', () => {
		const context = createMockContext({
			str: 'hello',
			num: 42,
		});

		const result = inspector.inspect(context);

		expect(result[0].children).toBeUndefined();
		expect(result[1].children).toBeUndefined();
	});
});

// ============================================================================
// Variable Reference Tests (DAP)
// ============================================================================

describe('VariableInspector - Variable References', () => {
	let inspector: VariableInspector;

	beforeEach(() => {
		inspector = new VariableInspector();
	});

	it('should create variable reference for expandable objects', () => {
		const context = createMockContext({
			obj: { a: 1, b: 2 },
		});

		const result = inspector.inspect(context, { maxDepth: 1 });
		const objVar = result.find((v) => v.name === 'obj');

		expect(objVar?.variableReference).toBeDefined();
		expect(objVar?.variableReference).toBeGreaterThan(0);
	});

	it('should get children from variable reference', () => {
		const context = createMockContext({
			obj: { a: 1, b: 2, c: 3 },
		});

		const result = inspector.inspect(context, { maxDepth: 1 });
		const objVar = result.find((v) => v.name === 'obj');
		const varRef = objVar?.variableReference;

		expect(varRef).toBeDefined();

		const children = inspector.getVariableChildren(varRef!);

		expect(children).toHaveLength(3);
		expect(children.map((c) => c.name).sort()).toEqual(['a', 'b', 'c']);
	});

	it('should return empty array for invalid variable reference', () => {
		const children = inspector.getVariableChildren(999999);

		expect(children).toHaveLength(0);
	});

	it('should clear variable references', () => {
		const context = createMockContext({
			obj: { a: 1 },
		});

		const result = inspector.inspect(context, { maxDepth: 1 });
		const varRef = result[0].variableReference;

		expect(varRef).toBeDefined();

		inspector.clearReferences();

		const children = inspector.getVariableChildren(varRef!);
		expect(children).toHaveLength(0);
	});
});

// ============================================================================
// Call Stack Frame Tests
// ============================================================================

describe('VariableInspector - Call Stack Frames', () => {
	let inspector: VariableInspector;

	beforeEach(() => {
		inspector = new VariableInspector();
	});

	it('should inspect frame variables', () => {
		const frame = {
			id: 1,
			name: 'test-frame',
			source: 'test-node',
			variables: {
				local1: 'value1',
				local2: 42,
			},
		};

		const result = inspector.inspectFrame(frame);

		expect(result).toHaveLength(2);
		expect(result.find((v) => v.name === 'local1')?.value).toBe('value1');
		expect(result.find((v) => v.name === 'local2')?.value).toBe(42);
	});

	it('should inspect variables from specific frame ID', () => {
		const context: DebugContext = {
			workflowName: 'test',
			currentNode: 'node',
			variables: { workflow: 'var' },
			callStack: [
				{
					id: 1,
					name: 'frame1',
					source: 'node1',
					variables: { frame1var: 'value1' },
				},
				{
					id: 2,
					name: 'frame2',
					source: 'node2',
					variables: { frame2var: 'value2' },
				},
			],
		};

		const result = inspector.inspect(context, { frameId: 2 });

		expect(result).toHaveLength(1);
		expect(result[0].name).toBe('frame2var');
		expect(result[0].value).toBe('value2');
	});

	it('should return empty array for non-existent frame', () => {
		const context = createMockContext({ workflow: 'var' });

		const result = inspector.inspect(context, { frameId: 999 });

		expect(result).toHaveLength(0);
	});
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe('formatValueForDisplay', () => {
	it('should format null', () => {
		expect(formatValueForDisplay(null)).toBe('null');
	});

	it('should format undefined', () => {
		expect(formatValueForDisplay(undefined)).toBe('undefined');
	});

	it('should format short string', () => {
		expect(formatValueForDisplay('hello')).toBe('"hello"');
	});

	it('should truncate long string', () => {
		const longStr = 'a'.repeat(150);
		const result = formatValueForDisplay(longStr, 100);
		expect(result).toMatch(/^"a+\.\.\."/);
		expect(result.length).toBeLessThan(110);
	});

	it('should format array', () => {
		expect(formatValueForDisplay([1, 2, 3])).toBe('Array(3)');
	});

	it('should format object', () => {
		expect(formatValueForDisplay({ a: 1, b: 2 })).toBe('Object {2 properties}');
	});

	it('should format Map', () => {
		const map = new Map([['a', 1]]);
		expect(formatValueForDisplay(map)).toBe('Map(1)');
	});

	it('should format Set', () => {
		const set = new Set([1, 2, 3]);
		expect(formatValueForDisplay(set)).toBe('Set(3)');
	});

	it('should format Date', () => {
		const date = new Date('2024-01-01T00:00:00Z');
		expect(formatValueForDisplay(date)).toBe('2024-01-01T00:00:00.000Z');
	});

	it('should format RegExp', () => {
		expect(formatValueForDisplay(/test/gi)).toBe('/test/gi');
	});

	it('should format Error', () => {
		const err = new Error('test error');
		expect(formatValueForDisplay(err)).toBe('test error');
	});

	it('should format number', () => {
		expect(formatValueForDisplay(42)).toBe('42');
	});

	it('should format boolean', () => {
		expect(formatValueForDisplay(true)).toBe('true');
	});
});

describe('createSimpleVariableInfo', () => {
	it('should create simple variable info', () => {
		const info = createSimpleVariableInfo('test', 'value');

		expect(info.name).toBe('test');
		expect(info.value).toBe('value');
		expect(info.type).toBe('string');
		expect(info.scope).toBe('workflow');
		expect(info.readonly).toBe(false);
	});

	it('should support custom scope', () => {
		const info = createSimpleVariableInfo('test', 'value', 'local');

		expect(info.scope).toBe('local');
	});

	it('should include child count for objects', () => {
		const info = createSimpleVariableInfo('obj', { a: 1, b: 2 });

		expect(info.childCount).toBe(2);
	});
});

// ============================================================================
// Lifecycle Tests
// ============================================================================

describe('VariableInspector - Lifecycle', () => {
	it('should dispose properly', () => {
		const inspector = new VariableInspector();

		expect(inspector.isDisposed()).toBe(false);

		inspector.dispose();

		expect(inspector.isDisposed()).toBe(true);
	});

	it('should throw error when using disposed inspector', () => {
		const inspector = new VariableInspector();
		const context = createMockContext({ test: 'value' });

		inspector.dispose();

		expect(() => inspector.inspect(context)).toThrow('VariableInspector has been disposed');
	});

	it('should handle multiple dispose calls', () => {
		const inspector = new VariableInspector();

		inspector.dispose();
		inspector.dispose(); // Should not throw

		expect(inspector.isDisposed()).toBe(true);
	});
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('VariableInspector - Edge Cases', () => {
	let inspector: VariableInspector;

	beforeEach(() => {
		inspector = new VariableInspector();
	});

	it('should handle empty object', () => {
		const context = createMockContext({ empty: {} });
		const result = inspector.inspectVariable(context, 'empty');

		expect(result?.type).toBe('object');
		expect(result?.childCount).toBe(0);
		expect(result?.variableReference).toBeUndefined();
	});

	it('should handle empty array', () => {
		const context = createMockContext({ empty: [] });
		const result = inspector.inspectVariable(context, 'empty');

		expect(result?.type).toBe('array');
		expect(result?.childCount).toBe(0);
		expect(result?.variableReference).toBeUndefined();
	});

	it('should handle circular references', () => {
		const circular: Record<string, unknown> = { name: 'test' };
		circular.self = circular;

		const context = createMockContext({ circular });

		// Should not throw, even with circular reference
		expect(() => inspector.inspect(context, { maxDepth: 2 })).not.toThrow();
	});

	it('should handle variables with special characters in names', () => {
		const context = createMockContext({
			'var-name': 1,
			'var.name': 2,
			'var$name': 3,
		});

		const result = inspector.inspect(context);

		expect(result).toHaveLength(3);
	});

	it('should handle numeric object keys', () => {
		const context = createMockContext({
			obj: { 0: 'zero', 1: 'one', 2: 'two' },
		});

		const result = inspector.inspect(context, { maxDepth: 2 });
		const objVar = result.find((v) => v.name === 'obj');

		expect(objVar?.children).toHaveLength(3);
		expect(objVar?.children?.find((c) => c.name === '0')?.value).toBe('zero');
	});
});
