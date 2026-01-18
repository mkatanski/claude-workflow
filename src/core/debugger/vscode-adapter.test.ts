/**
 * Tests for VsCodeDebugAdapter - Debug Adapter Protocol implementation
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Readable, Writable } from 'stream';
import {
	VsCodeDebugAdapter,
	createVsCodeDebugAdapter,
	type LaunchConfiguration,
	type VsCodeAdapterConfig,
} from './vscode-adapter';
import type {
	DapRequestType,
	StoppedReason,
} from './types';

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Mock input stream for testing
 */
class MockInputStream extends Readable {
	_read(): void {
		// No-op
	}

	sendMessage(message: unknown): void {
		const json = JSON.stringify(message);
		const data = `Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}`;
		this.push(data);
	}
}

/**
 * Mock output stream for testing
 */
class MockOutputStream extends Writable {
	public messages: unknown[] = [];

	_write(
		chunk: Buffer | string,
		_encoding: string,
		callback: (error?: Error | null) => void
	): void {
		const text = chunk.toString();
		const headerMatch = text.match(/Content-Length: (\d+)\r?\n\r?\n/);

		if (headerMatch) {
			const contentLength = parseInt(headerMatch[1], 10);
			const headerLength = headerMatch[0].length;
			const messageText = text.substring(headerLength, headerLength + contentLength);

			try {
				const message = JSON.parse(messageText);
				this.messages.push(message);
			} catch {
				// Ignore parse errors
			}
		}

		callback();
	}

	getLastMessage(): unknown {
		return this.messages[this.messages.length - 1];
	}

	getMessageOfType(type: 'request' | 'response' | 'event'): unknown {
		for (let i = this.messages.length - 1; i >= 0; i--) {
			const msg = this.messages[i] as { type: string };
			if (msg.type === type) {
				return msg;
			}
		}
		return null;
	}

	getEventOfType(eventType: string): unknown {
		for (let i = this.messages.length - 1; i >= 0; i--) {
			const msg = this.messages[i] as { type: string; event?: string };
			if (msg.type === 'event' && msg.event === eventType) {
				return msg;
			}
		}
		return null;
	}

	clear(): void {
		this.messages = [];
	}
}

/**
 * Create test adapter with mock streams
 */
function createTestAdapter(): {
	adapter: VsCodeDebugAdapter;
	inputStream: MockInputStream;
	outputStream: MockOutputStream;
} {
	const inputStream = new MockInputStream();
	const outputStream = new MockOutputStream();

	const adapter = createVsCodeDebugAdapter({
		inputStream,
		outputStream,
		debug: false,
	});

	return { adapter, inputStream, outputStream };
}

/**
 * Send a DAP request
 */
function sendRequest(
	inputStream: MockInputStream,
	seq: number,
	command: DapRequestType,
	args?: Record<string, unknown>
): void {
	const request = {
		seq,
		type: 'request',
		command,
		arguments: args,
	};

	inputStream.sendMessage(request);
}

/**
 * Wait for a short time to allow async operations to complete
 */
async function wait(ms = 10): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Adapter Creation and Lifecycle
// ============================================================================

describe('VsCodeDebugAdapter - Creation and Lifecycle', () => {
	it('should create adapter instance', () => {
		const { adapter } = createTestAdapter();

		expect(adapter).toBeDefined();
		expect(adapter.isDisposed()).toBe(false);

		adapter.dispose();
	});

	it('should start adapter', () => {
		const { adapter } = createTestAdapter();

		expect(() => adapter.start()).not.toThrow();

		adapter.dispose();
	});

	it('should stop adapter', async () => {
		const { adapter } = createTestAdapter();

		adapter.start();
		await adapter.stop();

		expect(adapter.isDisposed()).toBe(false);

		adapter.dispose();
	});

	it('should dispose adapter', () => {
		const { adapter } = createTestAdapter();

		adapter.dispose();

		expect(adapter.isDisposed()).toBe(true);
		expect(() => adapter.start()).toThrow();
	});

	it('should handle multiple dispose calls', () => {
		const { adapter } = createTestAdapter();

		adapter.dispose();
		adapter.dispose();

		expect(adapter.isDisposed()).toBe(true);
	});
});

// ============================================================================
// Protocol Communication
// ============================================================================

describe('VsCodeDebugAdapter - Protocol Communication', () => {
	let adapter: VsCodeDebugAdapter;
	let inputStream: MockInputStream;
	let outputStream: MockOutputStream;

	beforeEach(() => {
		const setup = createTestAdapter();
		adapter = setup.adapter;
		inputStream = setup.inputStream;
		outputStream = setup.outputStream;
		adapter.start();
	});

	afterEach(() => {
		adapter.dispose();
	});

	it('should receive and parse DAP messages', async () => {
		sendRequest(inputStream, 1, 'initialize', {});
		await wait();

		const response = outputStream.getMessageOfType('response');
		expect(response).toBeDefined();
	});

	it('should send responses with correct format', async () => {
		sendRequest(inputStream, 1, 'initialize', {});
		await wait();

		const response = outputStream.getMessageOfType('response') as {
			seq: number;
			type: string;
			request_seq: number;
			success: boolean;
			command: string;
		};

		expect(response.type).toBe('response');
		expect(response.request_seq).toBe(1);
		expect(response.success).toBe(true);
		expect(response.command).toBe('initialize');
	});

	it('should send events', async () => {
		sendRequest(inputStream, 1, 'initialize', {});
		await wait();

		const event = outputStream.getEventOfType('initialized');
		expect(event).toBeDefined();
	});

	it('should handle multiple messages in sequence', async () => {
		sendRequest(inputStream, 1, 'initialize', {});
		await wait();

		sendRequest(inputStream, 2, 'launch', {
			workflowPath: 'test.ts',
			workflowName: 'test',
		});
		await wait();

		expect(outputStream.messages.length).toBeGreaterThanOrEqual(2);
	});

	it('should handle incomplete messages', async () => {
		// Send partial message
		const json = JSON.stringify({ seq: 1, type: 'request', command: 'initialize' });
		const partial = `Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json.substring(0, 10)}`;

		inputStream.push(partial);
		await wait();

		// Should not crash
		expect(adapter.isDisposed()).toBe(false);
	});
});

// ============================================================================
// Initialize Request
// ============================================================================

describe('VsCodeDebugAdapter - Initialize Request', () => {
	let adapter: VsCodeDebugAdapter;
	let inputStream: MockInputStream;
	let outputStream: MockOutputStream;

	beforeEach(() => {
		const setup = createTestAdapter();
		adapter = setup.adapter;
		inputStream = setup.inputStream;
		outputStream = setup.outputStream;
		adapter.start();
	});

	afterEach(() => {
		adapter.dispose();
	});

	it('should handle initialize request', async () => {
		sendRequest(inputStream, 1, 'initialize', {});
		await wait();

		const response = outputStream.getMessageOfType('response') as {
			success: boolean;
			body: Record<string, boolean>;
		};

		expect(response.success).toBe(true);
		expect(response.body).toBeDefined();
		expect(response.body.supportsConfigurationDoneRequest).toBe(true);
	});

	it('should send initialized event', async () => {
		sendRequest(inputStream, 1, 'initialize', {});
		await wait();

		const event = outputStream.getEventOfType('initialized');
		expect(event).toBeDefined();
	});

	it('should report correct capabilities', async () => {
		sendRequest(inputStream, 1, 'initialize', {});
		await wait();

		const response = outputStream.getMessageOfType('response') as {
			body: {
				supportsConfigurationDoneRequest: boolean;
				supportsEvaluateForHovers: boolean;
				supportsLogPoints: boolean;
				supportsConditionalBreakpoints?: boolean;
			};
		};

		expect(response.body.supportsEvaluateForHovers).toBe(true);
		expect(response.body.supportsLogPoints).toBe(true);
	});
});

// ============================================================================
// Launch Request
// ============================================================================

describe('VsCodeDebugAdapter - Launch Request', () => {
	let adapter: VsCodeDebugAdapter;
	let inputStream: MockInputStream;
	let outputStream: MockOutputStream;

	beforeEach(() => {
		const setup = createTestAdapter();
		adapter = setup.adapter;
		inputStream = setup.inputStream;
		outputStream = setup.outputStream;
		adapter.start();
	});

	afterEach(() => {
		adapter.dispose();
	});

	it('should handle launch request', async () => {
		const launchConfig: LaunchConfiguration = {
			workflowPath: 'test-workflow.ts',
			workflowName: 'test',
			variables: { x: 1 },
		};

		sendRequest(inputStream, 1, 'launch', launchConfig as unknown as Record<string, unknown>);
		await wait();

		const response = outputStream.getMessageOfType('response') as {
			success: boolean;
		};

		expect(response.success).toBe(true);
	});

	it('should reject launch without workflowPath', async () => {
		sendRequest(inputStream, 1, 'launch', {});
		await wait();

		const response = outputStream.getMessageOfType('response') as {
			success: boolean;
			message?: string;
		};

		expect(response.success).toBe(false);
		expect(response.message).toContain('workflowPath');
	});

	it('should send stopped event when stopOnEntry is true', async () => {
		const launchConfig: LaunchConfiguration = {
			workflowPath: 'test.ts',
			stopOnEntry: true,
		};

		sendRequest(inputStream, 1, 'launch', launchConfig as unknown as Record<string, unknown>);
		await wait(50);

		const event = outputStream.getEventOfType('stopped') as {
			body: { reason: StoppedReason };
		};

		expect(event).toBeDefined();
		expect(event?.body?.reason).toBe('entry');
	});

	it('should initialize debugger with workflow variables', async () => {
		const launchConfig: LaunchConfiguration = {
			workflowPath: 'test.ts',
			variables: { x: 1, y: 2 },
		};

		sendRequest(inputStream, 1, 'launch', launchConfig as unknown as Record<string, unknown>);
		await wait();

		const dbg = adapter.getDebugger();
		expect(dbg.context?.variables).toEqual({ x: 1, y: 2 });
	});
});

// ============================================================================
// Breakpoint Requests
// ============================================================================

describe('VsCodeDebugAdapter - Breakpoint Requests', () => {
	let adapter: VsCodeDebugAdapter;
	let inputStream: MockInputStream;
	let outputStream: MockOutputStream;

	beforeEach(() => {
		const setup = createTestAdapter();
		adapter = setup.adapter;
		inputStream = setup.inputStream;
		outputStream = setup.outputStream;
		adapter.start();
	});

	afterEach(() => {
		adapter.dispose();
	});

	it('should handle setBreakpoints request', async () => {
		const args = {
			source: { path: 'test.ts' },
			breakpoints: [
				{ line: 10 },
				{ line: 20, condition: 'x > 5' },
			],
		};

		sendRequest(inputStream, 1, 'setBreakpoints', args);
		await wait();

		const response = outputStream.getMessageOfType('response') as {
			success: boolean;
			body: { breakpoints: Array<{ id: number; verified: boolean }> };
		};

		expect(response.success).toBe(true);
		expect(response.body.breakpoints).toHaveLength(2);
		expect(response.body.breakpoints[0].verified).toBe(true);
	});

	it('should handle conditional breakpoints', async () => {
		const args = {
			source: { path: 'test.ts' },
			breakpoints: [
				{ line: 10, condition: 'x > 5' },
			],
		};

		sendRequest(inputStream, 1, 'setBreakpoints', args);
		await wait();

		const dbg = adapter.getDebugger();
		const breakpoints = dbg.getBreakpoints();

		expect(breakpoints.length).toBeGreaterThan(0);
		expect(breakpoints[0].condition).toBe('x > 5');
	});

	it('should handle logpoints', async () => {
		const args = {
			source: { path: 'test.ts' },
			breakpoints: [
				{ line: 10, logMessage: 'Value of x: {x}' },
			],
		};

		sendRequest(inputStream, 1, 'setBreakpoints', args);
		await wait();

		const dbg = adapter.getDebugger();
		const breakpoints = dbg.getBreakpoints();

		expect(breakpoints[0].logMessage).toBe('Value of x: {x}');
	});

	it('should handle setExceptionBreakpoints request', async () => {
		const args = {
			filters: ['all', 'uncaught'],
		};

		sendRequest(inputStream, 1, 'setExceptionBreakpoints', args);
		await wait();

		const response = outputStream.getMessageOfType('response') as {
			success: boolean;
		};

		expect(response.success).toBe(true);
	});

	it('should clear breakpoints when setting empty array', async () => {
		// Set breakpoints first
		sendRequest(inputStream, 1, 'setBreakpoints', {
			source: { path: 'test.ts' },
			breakpoints: [{ line: 10 }],
		});
		await wait();

		// Clear breakpoints
		sendRequest(inputStream, 2, 'setBreakpoints', {
			source: { path: 'test.ts' },
			breakpoints: [],
		});
		await wait();

		const response = outputStream.getMessageOfType('response') as {
			body: { breakpoints: unknown[] };
		};

		expect(response.body.breakpoints).toHaveLength(0);
	});
});

// ============================================================================
// Execution Control Requests
// ============================================================================

describe('VsCodeDebugAdapter - Execution Control', () => {
	let adapter: VsCodeDebugAdapter;
	let inputStream: MockInputStream;
	let outputStream: MockOutputStream;

	beforeEach(() => {
		const setup = createTestAdapter();
		adapter = setup.adapter;
		inputStream = setup.inputStream;
		outputStream = setup.outputStream;
		adapter.start();
	});

	afterEach(() => {
		adapter.dispose();
	});

	it('should handle continue request', async () => {
		sendRequest(inputStream, 1, 'continue', { threadId: 1 });
		await wait();

		const response = outputStream.getMessageOfType('response') as {
			success: boolean;
			body: { allThreadsContinued: boolean };
		};

		expect(response.success).toBe(true);
		expect(response.body.allThreadsContinued).toBe(true);
	});

	it('should handle next (step over) request', async () => {
		sendRequest(inputStream, 1, 'next', { threadId: 1 });
		await wait();

		const response = outputStream.getMessageOfType('response') as {
			success: boolean;
		};

		expect(response.success).toBe(true);
	});

	it('should handle stepIn request', async () => {
		sendRequest(inputStream, 1, 'stepIn', { threadId: 1 });
		await wait();

		const response = outputStream.getMessageOfType('response') as {
			success: boolean;
		};

		expect(response.success).toBe(true);
	});

	it('should handle stepOut request', async () => {
		sendRequest(inputStream, 1, 'stepOut', { threadId: 1 });
		await wait();

		const response = outputStream.getMessageOfType('response') as {
			success: boolean;
		};

		expect(response.success).toBe(true);
	});

	it('should handle pause request', async () => {
		sendRequest(inputStream, 1, 'pause', { threadId: 1 });
		await wait();

		const response = outputStream.getMessageOfType('response') as {
			success: boolean;
		};

		expect(response.success).toBe(true);
	});
});

// ============================================================================
// Stack Trace and Scopes
// ============================================================================

describe('VsCodeDebugAdapter - Stack Trace and Scopes', () => {
	let adapter: VsCodeDebugAdapter;
	let inputStream: MockInputStream;
	let outputStream: MockOutputStream;

	beforeEach(async () => {
		const setup = createTestAdapter();
		adapter = setup.adapter;
		inputStream = setup.inputStream;
		outputStream = setup.outputStream;
		adapter.start();

		// Launch workflow
		sendRequest(inputStream, 1, 'launch', {
			workflowPath: 'test.ts',
			workflowName: 'test',
		});
		await wait();
	});

	afterEach(() => {
		adapter.dispose();
	});

	it('should handle stackTrace request with no context', async () => {
		sendRequest(inputStream, 1, 'stackTrace', { threadId: 1 });
		await wait();

		const response = outputStream.getMessageOfType('response') as {
			success: boolean;
			body: { stackFrames: unknown[]; totalFrames: number };
		};

		expect(response.success).toBe(true);
		expect(response.body.stackFrames).toBeDefined();
		expect(response.body.totalFrames).toBe(0);
	});

	it('should handle scopes request', async () => {
		sendRequest(inputStream, 1, 'scopes', { frameId: 0 });
		await wait();

		const response = outputStream.getMessageOfType('response') as {
			success: boolean;
			body: { scopes: Array<{ name: string; variablesReference: number }> };
		};

		expect(response.success).toBe(true);
		expect(response.body.scopes).toBeDefined();
		expect(response.body.scopes.length).toBeGreaterThan(0);
		expect(response.body.scopes[0].name).toBe('Workflow');
	});

	it('should create separate scopes for workflow, node, and local', async () => {
		sendRequest(inputStream, 1, 'scopes', { frameId: 0 });
		await wait();

		const response = outputStream.getMessageOfType('response') as {
			body: { scopes: Array<{ name: string }> };
		};

		const scopeNames = response.body.scopes.map((s) => s.name);
		expect(scopeNames).toContain('Workflow');
		expect(scopeNames).toContain('Node');
		expect(scopeNames).toContain('Local');
	});
});

// ============================================================================
// Variables
// ============================================================================

describe('VsCodeDebugAdapter - Variables', () => {
	let adapter: VsCodeDebugAdapter;
	let inputStream: MockInputStream;
	let outputStream: MockOutputStream;

	beforeEach(async () => {
		const setup = createTestAdapter();
		adapter = setup.adapter;
		inputStream = setup.inputStream;
		outputStream = setup.outputStream;
		adapter.start();

		// Launch workflow
		sendRequest(inputStream, 1, 'launch', {
			workflowPath: 'test.ts',
			workflowName: 'test',
		});
		await wait();
	});

	afterEach(() => {
		adapter.dispose();
	});

	it('should handle variables request', async () => {
		sendRequest(inputStream, 1, 'variables', { variablesReference: 1 });
		await wait();

		const response = outputStream.getMessageOfType('response') as {
			success: boolean;
			body: { variables: unknown[] };
		};

		expect(response.success).toBe(true);
		expect(response.body.variables).toBeDefined();
	});

	it('should return empty array for invalid reference', async () => {
		sendRequest(inputStream, 1, 'variables', { variablesReference: 99999 });
		await wait();

		const response = outputStream.getMessageOfType('response') as {
			success: boolean;
			body: { variables: unknown[] };
		};

		expect(response.success).toBe(true);
		expect(response.body.variables).toHaveLength(0);
	});
});

// ============================================================================
// Evaluate Request
// ============================================================================

describe('VsCodeDebugAdapter - Evaluate', () => {
	let adapter: VsCodeDebugAdapter;
	let inputStream: MockInputStream;
	let outputStream: MockOutputStream;

	beforeEach(async () => {
		const setup = createTestAdapter();
		adapter = setup.adapter;
		inputStream = setup.inputStream;
		outputStream = setup.outputStream;
		adapter.start();

		// Launch workflow
		sendRequest(inputStream, 1, 'launch', {
			workflowPath: 'test.ts',
			workflowName: 'test',
			variables: { x: 42, y: 'hello' },
		});
		await wait();
	});

	afterEach(() => {
		adapter.dispose();
	});

	it('should handle evaluate request', async () => {
		sendRequest(inputStream, 1, 'evaluate', { expression: 'x' });
		await wait();

		const response = outputStream.getMessageOfType('response') as {
			success: boolean;
			body: { result: string };
		};

		expect(response.success).toBe(true);
		expect(response.body.result).toBe('42');
	});

	it('should return undefined for missing variable', async () => {
		sendRequest(inputStream, 1, 'evaluate', { expression: 'missing' });
		await wait();

		const response = outputStream.getMessageOfType('response') as {
			success: boolean;
			body: { result: string };
		};

		expect(response.success).toBe(true);
		expect(response.body.result).toBe('undefined');
	});

	it('should fail when no context available', async () => {
		// Stop debugger first
		await adapter.getDebugger().stop();

		sendRequest(inputStream, 1, 'evaluate', { expression: 'x' });
		await wait();

		const response = outputStream.getMessageOfType('response') as {
			success: boolean;
		};

		expect(response.success).toBe(false);
	});
});

// ============================================================================
// Disconnect Request
// ============================================================================

describe('VsCodeDebugAdapter - Disconnect', () => {
	let adapter: VsCodeDebugAdapter;
	let inputStream: MockInputStream;
	let outputStream: MockOutputStream;

	beforeEach(() => {
		const setup = createTestAdapter();
		adapter = setup.adapter;
		inputStream = setup.inputStream;
		outputStream = setup.outputStream;
		adapter.start();
	});

	afterEach(() => {
		if (!adapter.isDisposed()) {
			adapter.dispose();
		}
	});

	it('should handle disconnect request', async () => {
		sendRequest(inputStream, 1, 'disconnect', {});
		await wait();

		const response = outputStream.getMessageOfType('response') as {
			success: boolean;
		};

		expect(response.success).toBe(true);
	});

	it('should send terminated event on disconnect', async () => {
		sendRequest(inputStream, 1, 'disconnect', {});
		await wait(50);

		const event = outputStream.getEventOfType('terminated');
		expect(event).toBeDefined();
	});
});

// ============================================================================
// Error Handling
// ============================================================================

describe('VsCodeDebugAdapter - Error Handling', () => {
	let adapter: VsCodeDebugAdapter;
	let inputStream: MockInputStream;
	let outputStream: MockOutputStream;

	beforeEach(() => {
		const setup = createTestAdapter();
		adapter = setup.adapter;
		inputStream = setup.inputStream;
		outputStream = setup.outputStream;
		adapter.start();
	});

	afterEach(() => {
		adapter.dispose();
	});

	it('should handle unknown command gracefully', async () => {
		sendRequest(inputStream, 1, 'unknownCommand' as DapRequestType, {});
		await wait();

		const response = outputStream.getMessageOfType('response') as {
			success: boolean;
			message?: string;
		};

		expect(response.success).toBe(false);
		expect(response.message).toContain('Unknown command');
	});

	it('should handle attach request (not supported)', async () => {
		sendRequest(inputStream, 1, 'attach', {});
		await wait();

		const response = outputStream.getMessageOfType('response') as {
			success: boolean;
			message?: string;
		};

		expect(response.success).toBe(false);
		expect(response.message).toContain('not supported');
	});

	it('should handle malformed JSON gracefully', async () => {
		// Send invalid JSON
		inputStream.push('Content-Length: 20\r\n\r\n{invalid json}');
		await wait();

		// Should not crash
		expect(adapter.isDisposed()).toBe(false);
	});
});

// ============================================================================
// Factory Function
// ============================================================================

describe('VsCodeDebugAdapter - Factory Function', () => {
	it('should create adapter with factory', () => {
		const adapter = createVsCodeDebugAdapter();

		expect(adapter).toBeDefined();
		expect(adapter.isDisposed()).toBe(false);

		adapter.dispose();
	});

	it('should create adapter with custom config', () => {
		const config: VsCodeAdapterConfig = {
			port: 8080,
			debug: true,
		};

		const adapter = createVsCodeDebugAdapter(config);

		expect(adapter).toBeDefined();

		adapter.dispose();
	});
});
