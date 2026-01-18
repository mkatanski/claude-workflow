import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { ReplayEngine, createCheckpointEvent, compareCheckpoints, findLastSuccessfulCheckpoint } from './replay';
import type { ExecutionTrace, ExecutionCheckpoint } from './types';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('ReplayEngine', () => {
	let engine: ReplayEngine;
	let testTraceFile: string;

	beforeEach(() => {
		engine = new ReplayEngine({ debug: false });
		testTraceFile = join(tmpdir(), `test-trace-${Date.now()}.json`);
	});

	afterEach(async () => {
		engine.dispose();
		// Clean up test file
		try {
			await unlink(testTraceFile);
		} catch {
			// Ignore if file doesn't exist
		}
	});

	describe('Trace Management', () => {
		it('should start a new trace', () => {
			const initialVars = { count: 0, name: 'test' };
			engine.startTrace('test-workflow', initialVars);

			const trace = engine.getTrace();
			expect(trace).not.toBeNull();
			expect(trace?.workflowName).toBe('test-workflow');
			expect(trace?.status).toBe('running');
			expect(trace?.initialVariables).toEqual(initialVars);
			expect(trace?.checkpoints).toEqual([]);
			expect(trace?.events).toEqual([]);
		});

		it('should complete a trace successfully', () => {
			const initialVars = { count: 0 };
			const finalVars = { count: 5 };

			engine.startTrace('test-workflow', initialVars);
			const trace = engine.completeTrace(finalVars, true);

			expect(trace.status).toBe('completed');
			expect(trace.finalVariables).toEqual(finalVars);
			expect(trace.endTime).toBeDefined();
			expect(trace.duration).toBeGreaterThanOrEqual(0);
		});

		it('should fail a trace with error', () => {
			engine.startTrace('test-workflow', {});

			const error = new Error('Test error');
			const trace = engine.failTrace(error, 'failing-node');

			expect(trace.status).toBe('failed');
			expect(trace.error).toBeDefined();
			expect(trace.error?.message).toBe('Test error');
			expect(trace.error?.nodeName).toBe('failing-node');
		});

		it('should check if trace is active', () => {
			expect(engine.isTraceActive()).toBe(false);

			engine.startTrace('test-workflow', {});
			expect(engine.isTraceActive()).toBe(true);

			engine.completeTrace({}, true);
			expect(engine.isTraceActive()).toBe(false);
		});

		it('should throw if completing trace without starting', () => {
			expect(() => engine.completeTrace({}, true)).toThrow('No active trace');
		});
	});

	describe('Checkpoint Management', () => {
		beforeEach(() => {
			engine.startTrace('test-workflow', { count: 0 });
		});

		it('should create a checkpoint', () => {
			const variables = { count: 1, name: 'test' };
			const checkpoint = engine.createCheckpoint(
				'test-workflow',
				'node1',
				variables
			);

			expect(checkpoint.id).toBeDefined();
			expect(checkpoint.workflowName).toBe('test-workflow');
			expect(checkpoint.nodeName).toBe('node1');
			expect(checkpoint.variables).toEqual(variables);
			expect(checkpoint.sequenceNumber).toBe(0);
			expect(checkpoint.events).toEqual([]);
		});

		it('should increment sequence number for each checkpoint', () => {
			const cp1 = engine.createCheckpoint('test-workflow', 'node1', {});
			const cp2 = engine.createCheckpoint('test-workflow', 'node2', {});
			const cp3 = engine.createCheckpoint('test-workflow', 'node3', {});

			expect(cp1.sequenceNumber).toBe(0);
			expect(cp2.sequenceNumber).toBe(1);
			expect(cp3.sequenceNumber).toBe(2);
		});

		it('should get checkpoint by ID', () => {
			const cp = engine.createCheckpoint('test-workflow', 'node1', {});

			const retrieved = engine.getCheckpoint(cp.id);
			expect(retrieved).toEqual(cp);
		});

		it('should get all checkpoints sorted by sequence', () => {
			const cp1 = engine.createCheckpoint('test-workflow', 'node1', {});
			const cp2 = engine.createCheckpoint('test-workflow', 'node2', {});
			const cp3 = engine.createCheckpoint('test-workflow', 'node3', {});

			const all = engine.getAllCheckpoints();
			expect(all).toHaveLength(3);
			expect(all[0]).toEqual(cp1);
			expect(all[1]).toEqual(cp2);
			expect(all[2]).toEqual(cp3);
		});

		it('should find checkpoint by node name', () => {
			engine.createCheckpoint('test-workflow', 'node1', { step: 1 });
			engine.createCheckpoint('test-workflow', 'node2', { step: 2 }); // Creates intermediate state
			const cp3 = engine.createCheckpoint('test-workflow', 'node2', { step: 3 });

			// Should return most recent checkpoint for node2
			const found = engine.findCheckpointByNode('node2');
			expect(found).toEqual(cp3);
		});

		it('should get last checkpoint', () => {
			engine.createCheckpoint('test-workflow', 'node1', {});
			engine.createCheckpoint('test-workflow', 'node2', {});
			const cp3 = engine.createCheckpoint('test-workflow', 'node3', {});

			const last = engine.getLastCheckpoint();
			expect(last).toEqual(cp3);
		});

		it('should include checkpoint metadata', () => {
			const metadata = { custom: 'data', tags: ['test'] };
			const cp = engine.createCheckpoint('test-workflow', 'node1', {}, { metadata });

			expect(cp.metadata).toEqual(metadata);
		});

		it('should store events in checkpoint', () => {
			engine.recordEvent('test:event', { data: 'test' }, 'node1');
			const cp = engine.createCheckpoint('test-workflow', 'node1', {});

			expect(cp.events).toHaveLength(1);
			expect(cp.events[0].type).toBe('test:event');
		});

		it('should throw if creating checkpoint without trace', () => {
			const engine2 = new ReplayEngine();
			expect(() =>
				engine2.createCheckpoint('test-workflow', 'node1', {})
			).toThrow('No active trace');
			engine2.dispose();
		});
	});

	describe('Event Recording', () => {
		beforeEach(() => {
			engine.startTrace('test-workflow', {});
		});

		it('should record an event', () => {
			const payload = { data: 'test' };
			const event = engine.recordEvent('test:event', payload, 'node1');

			expect(event.type).toBe('test:event');
			expect(event.payload).toEqual(payload);
			expect(event.nodeName).toBe('node1');
			expect(event.timestamp).toBeDefined();
		});

		it('should get all recorded events', () => {
			engine.recordEvent('event1', {}, 'node1');
			engine.recordEvent('event2', {}, 'node2');
			engine.recordEvent('event3', {}, 'node1');

			const events = engine.getEvents();
			expect(events).toHaveLength(3);
		});

		it('should get events for specific node', () => {
			engine.recordEvent('event1', {}, 'node1');
			engine.recordEvent('event2', {}, 'node2');
			engine.recordEvent('event3', {}, 'node1');

			const node1Events = engine.getEventsForNode('node1');
			expect(node1Events).toHaveLength(2);
			expect(node1Events[0].type).toBe('event1');
			expect(node1Events[1].type).toBe('event3');
		});

		it('should get events by type', () => {
			engine.recordEvent('test:start', {}, 'node1');
			engine.recordEvent('test:complete', {}, 'node1');
			engine.recordEvent('test:start', {}, 'node2');

			const startEvents = engine.getEventsByType('test:start');
			expect(startEvents).toHaveLength(2);
		});

		it('should record events without node name', () => {
			const event = engine.recordEvent('workflow:start', {});
			expect(event.nodeName).toBeUndefined();
		});

		it('should throw if recording event without trace', () => {
			const engine2 = new ReplayEngine();
			expect(() => engine2.recordEvent('test:event', {})).toThrow(
				'No active trace'
			);
			engine2.dispose();
		});
	});

	describe('Trace Persistence', () => {
		it('should save trace to file', async () => {
			engine.startTrace('test-workflow', { initial: true });
			engine.createCheckpoint('test-workflow', 'node1', { count: 1 });
			engine.recordEvent('test:event', { data: 'test' });
			engine.completeTrace({ final: true }, true);

			await engine.saveTrace(testTraceFile);

			// Verify file exists and can be read
			const { readFile } = await import('fs/promises');
			const content = await readFile(testTraceFile, 'utf-8');
			const parsed = JSON.parse(content) as ExecutionTrace;

			expect(parsed.workflowName).toBe('test-workflow');
			expect(parsed.checkpoints).toHaveLength(1);
			expect(parsed.events).toHaveLength(1);
		});

		it('should load trace from file', async () => {
			// Create and save a trace
			engine.startTrace('test-workflow', { initial: true });
			const cp = engine.createCheckpoint('test-workflow', 'node1', { count: 1 });
			engine.completeTrace({ final: true }, true);
			await engine.saveTrace(testTraceFile);

			// Create new engine and load trace
			const engine2 = new ReplayEngine();
			const loaded = await engine2.loadTrace(testTraceFile);

			expect(loaded.workflowName).toBe('test-workflow');
			expect(loaded.checkpoints).toHaveLength(1);
			expect(loaded.initialVariables).toEqual({ initial: true });

			// Verify checkpoint is accessible
			const checkpoint = engine2.getCheckpoint(cp.id);
			expect(checkpoint).toBeDefined();
			expect(checkpoint?.nodeName).toBe('node1');

			engine2.dispose();
		});

		it('should auto-save when configured', async () => {
			const engine2 = new ReplayEngine({
				autoSave: true,
				traceOutputPath: testTraceFile,
			});

			engine2.startTrace('test-workflow', {});
			engine2.completeTrace({}, true);

			// Give it a moment to save
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Verify file exists (access() resolves if file exists, throws if not)
			const { access } = await import('fs/promises');
			await access(testTraceFile); // Throws if file doesn't exist

			engine2.dispose();
		});

		it('should throw on invalid trace file', async () => {
			// Write invalid JSON
			await writeFile(testTraceFile, 'invalid json', 'utf-8');

			await expect(engine.loadTrace(testTraceFile)).rejects.toThrow(
				'Failed to load trace'
			);
		});

		it('should throw when saving without trace', async () => {
			await expect(engine.saveTrace(testTraceFile)).rejects.toThrow(
				'No trace to save'
			);
		});
	});

	describe('Replay Functionality', () => {
		let trace: ExecutionTrace;
		let checkpoint1: ExecutionCheckpoint;
		let checkpoint2: ExecutionCheckpoint;

		beforeEach(() => {
			// Create a trace with checkpoints
			engine.startTrace('test-workflow', { count: 0 });
			checkpoint1 = engine.createCheckpoint('test-workflow', 'node1', {
				count: 1,
			});
			engine.recordEvent('node:complete', { node: 'node1' });
			checkpoint2 = engine.createCheckpoint('test-workflow', 'node2', {
				count: 2,
			});
			engine.recordEvent('node:complete', { node: 'node2' });
			trace = engine.completeTrace({ count: 2 }, true);
		});

		it('should start replay from checkpoint', async () => {
			await engine.startReplay({
				fromCheckpoint: checkpoint1.id,
				trace,
			});

			expect(engine.isReplayActive()).toBe(true);
			const state = engine.getReplayState();
			expect(state.active).toBe(true);
			expect(state.currentCheckpoint?.id).toBe(checkpoint1.id);
			expect(state.checkpointIndex).toBe(0);
		});

		it('should stop replay', async () => {
			await engine.startReplay({
				fromCheckpoint: checkpoint1.id,
				trace,
			});

			engine.stopReplay();
			expect(engine.isReplayActive()).toBe(false);
		});

		it('should get current replay checkpoint', async () => {
			await engine.startReplay({
				fromCheckpoint: checkpoint1.id,
				trace,
			});

			const current = engine.getCurrentReplayCheckpoint();
			expect(current?.id).toBe(checkpoint1.id);
		});

		it('should get next replay checkpoint', async () => {
			await engine.startReplay({
				fromCheckpoint: checkpoint1.id,
				trace,
			});

			const next = engine.getNextReplayCheckpoint();
			expect(next?.id).toBe(checkpoint2.id);
		});

		it('should advance replay to next checkpoint', async () => {
			await engine.startReplay({
				fromCheckpoint: checkpoint1.id,
				trace,
			});

			const next = engine.advanceReplay();
			expect(next?.id).toBe(checkpoint2.id);

			const current = engine.getCurrentReplayCheckpoint();
			expect(current?.id).toBe(checkpoint2.id);
		});

		it('should return undefined when no more checkpoints', async () => {
			await engine.startReplay({
				fromCheckpoint: checkpoint2.id,
				trace,
			});

			const next = engine.getNextReplayCheckpoint();
			expect(next).toBeUndefined();

			const advanced = engine.advanceReplay();
			expect(advanced).toBeUndefined();
		});

		it('should support variable overrides', async () => {
			const overrides = { count: 100, custom: 'override' };

			await engine.startReplay({
				fromCheckpoint: checkpoint1.id,
				trace,
				variableOverrides: overrides,
			});

			const current = engine.getCurrentReplayCheckpoint();
			expect(current?.variables.count).toBe(100);
			expect(current?.variables.custom).toBe('override');
		});

		it('should support step-through replay', async () => {
			await engine.startReplay({
				fromCheckpoint: checkpoint1.id,
				trace,
				stepThroughReplay: true,
			});

			const state = engine.getReplayState();
			expect(state.stepThrough).toBe(true);
		});

		it('should get events to replay', async () => {
			// Start from checkpoint2 which has events recorded before it
			await engine.startReplay({
				fromCheckpoint: checkpoint2.id,
				trace,
			});

			const events = engine.getEventsToReplay();
			expect(events.length).toBeGreaterThan(0);
		});

		it('should mark events as replayed', async () => {
			await engine.startReplay({
				fromCheckpoint: checkpoint1.id,
				trace,
			});

			// Get events to verify replay state is set up
			const eventsBefore = engine.getEventsToReplay();
			expect(eventsBefore.length).toBeGreaterThanOrEqual(0);

			engine.markEventsReplayed(1);

			const state = engine.getReplayState();
			expect(state.eventsReplayed).toBe(1);
		});

		it('should throw if checkpoint not found', async () => {
			await expect(
				engine.startReplay({
					fromCheckpoint: 'non-existent',
					trace,
				})
			).rejects.toThrow('Checkpoint not found');
		});
	});

	describe('Utility Functions', () => {
		it('should create checkpoint event', () => {
			const event = createCheckpointEvent('test:event', { data: 'test' }, 'node1');

			expect(event.type).toBe('test:event');
			expect(event.payload).toEqual({ data: 'test' });
			expect(event.nodeName).toBe('node1');
			expect(event.timestamp).toBeDefined();
		});

		it('should compare checkpoints by sequence', () => {
			const cp1: ExecutionCheckpoint = {
				id: '1',
				timestamp: new Date().toISOString(),
				workflowName: 'test',
				nodeName: 'node1',
				variables: {},
				sequenceNumber: 0,
				events: [],
			};

			const cp2: ExecutionCheckpoint = {
				...cp1,
				id: '2',
				sequenceNumber: 1,
			};

			expect(compareCheckpoints(cp1, cp2)).toBeLessThan(0);
			expect(compareCheckpoints(cp2, cp1)).toBeGreaterThan(0);
			expect(compareCheckpoints(cp1, cp1)).toBe(0);
		});

		it('should find last successful checkpoint', () => {
			const cp1: ExecutionCheckpoint = {
				id: '1',
				timestamp: new Date().toISOString(),
				workflowName: 'test',
				nodeName: 'node1',
				variables: {},
				sequenceNumber: 0,
				events: [],
			};

			const cp2: ExecutionCheckpoint = {
				...cp1,
				id: '2',
				nodeName: 'node2',
				sequenceNumber: 1,
			};

			const cp3: ExecutionCheckpoint = {
				...cp1,
				id: '3',
				nodeName: 'failing-node',
				sequenceNumber: 2,
			};

			const trace: ExecutionTrace = {
				id: 'trace1',
				workflowName: 'test',
				startTime: new Date().toISOString(),
				status: 'failed',
				checkpoints: [cp1, cp2, cp3],
				events: [],
				initialVariables: {},
				error: {
					message: 'Test error',
					nodeName: 'failing-node',
				},
			};

			const last = findLastSuccessfulCheckpoint(trace);
			expect(last?.id).toBe('2'); // Should return cp2, before the failing node
		});

		it('should return last checkpoint if no error', () => {
			const cp1: ExecutionCheckpoint = {
				id: '1',
				timestamp: new Date().toISOString(),
				workflowName: 'test',
				nodeName: 'node1',
				variables: {},
				sequenceNumber: 0,
				events: [],
			};

			const trace: ExecutionTrace = {
				id: 'trace1',
				workflowName: 'test',
				startTime: new Date().toISOString(),
				status: 'completed',
				checkpoints: [cp1],
				events: [],
				initialVariables: {},
			};

			const last = findLastSuccessfulCheckpoint(trace);
			expect(last?.id).toBe('1');
		});
	});

	describe('Lifecycle', () => {
		it('should dispose properly', () => {
			engine.startTrace('test-workflow', {});
			engine.createCheckpoint('test-workflow', 'node1', {});

			engine.dispose();

			expect(engine.isDisposed()).toBe(true);
			expect(() => engine.startTrace('test', {})).toThrow('has been disposed');
		});

		it('should handle multiple dispose calls', () => {
			engine.dispose();
			engine.dispose(); // Should not throw

			expect(engine.isDisposed()).toBe(true);
		});

		it('should throw on operations after dispose', () => {
			engine.dispose();

			expect(() => engine.startTrace('test', {})).toThrow('has been disposed');
			expect(() => engine.getTrace()).toThrow('has been disposed');
			expect(() => engine.getAllCheckpoints()).toThrow('has been disposed');
		});
	});
});
