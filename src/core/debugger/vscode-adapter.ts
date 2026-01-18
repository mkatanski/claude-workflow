/**
 * VS Code Debug Adapter - Debug Adapter Protocol (DAP) implementation
 *
 * This class implements the Debug Adapter Protocol to enable VS Code debugging integration.
 *
 * Features:
 * - JSON-RPC based protocol communication via stdin/stdout
 * - Request handling for all core DAP commands
 * - Event emission for debugger state changes
 * - Integration with Debugger class
 * - Variable reference management for DAP scopes/variables
 * - Stack frame tracking and inspection
 *
 * Supported DAP Requests:
 * - initialize: Initialize debug adapter capabilities
 * - launch: Start debugging session with workflow
 * - attach: Attach to running workflow (not implemented)
 * - disconnect: End debugging session
 * - setBreakpoints: Set/update breakpoints
 * - setExceptionBreakpoints: Configure exception breakpoints
 * - continue: Resume execution
 * - next: Step over (execute current node, pause at next)
 * - stepIn: Step into (for nested workflows)
 * - stepOut: Step out of current scope
 * - pause: Pause execution
 * - stackTrace: Get current call stack
 * - scopes: Get variable scopes for a stack frame
 * - variables: Get variables in a scope
 * - evaluate: Evaluate expression in current context
 *
 * DAP Events Emitted:
 * - initialized: Adapter is ready
 * - stopped: Execution paused (breakpoint, step, pause, exception, entry)
 * - continued: Execution resumed
 * - exited: Workflow completed
 * - terminated: Debugging session ended
 * - output: Log/console output
 * - breakpoint: Breakpoint changed (verified/unverified)
 */

import { randomUUID } from "crypto";
import type {
	DebuggerConfig,
	NodeBreakpoint,
	ExceptionBreakpoint,
	VariableInfo,
	DebugExecutionState,
	DapRequestType,
	DapEventType,
	StoppedReason,
} from "./types";
import { Debugger, createDebugger } from "./debugger";
import type { DebugEventCallbacks } from "./debugger";

// ============================================================================
// DAP Protocol Types
// ============================================================================

/**
 * DAP message base
 */
interface DapMessage {
	seq: number;
	type: "request" | "response" | "event";
}

/**
 * DAP request message
 */
interface DapRequest extends DapMessage {
	type: "request";
	command: DapRequestType;
	arguments?: Record<string, unknown>;
}

/**
 * DAP response message
 */
interface DapResponseMessage extends DapMessage {
	type: "response";
	request_seq: number;
	success: boolean;
	command: string;
	body?: unknown;
	message?: string;
}

/**
 * DAP event message
 */
interface DapEvent extends DapMessage {
	type: "event";
	event: DapEventType;
	body?: unknown;
}

/**
 * Source location for DAP
 */
interface DapSource {
	name?: string;
	path?: string;
	sourceReference?: number;
}

/**
 * Source breakpoint for DAP setBreakpoints request
 */
interface DapSourceBreakpoint {
	line: number;
	column?: number;
	condition?: string;
	hitCondition?: string;
	logMessage?: string;
}

/**
 * Breakpoint in DAP response
 */
interface DapBreakpoint {
	id: number;
	verified: boolean;
	line?: number;
	column?: number;
	message?: string;
}

/**
 * Stack frame for DAP
 */
interface DapStackFrame {
	id: number;
	name: string;
	source?: DapSource;
	line: number;
	column: number;
}

/**
 * Scope for DAP
 */
interface DapScope {
	name: string;
	variablesReference: number;
	expensive: boolean;
}

/**
 * Variable for DAP
 */
interface DapVariable {
	name: string;
	value: string;
	type?: string;
	variablesReference: number;
	indexedVariables?: number;
	namedVariables?: number;
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for VS Code Debug Adapter
 */
export interface VsCodeAdapterConfig {
	/** Port to listen on (default: 4711) */
	port?: number;

	/** Enable debug logging */
	debug?: boolean;

	/** Input stream (default: process.stdin) */
	inputStream?: NodeJS.ReadableStream;

	/** Output stream (default: process.stdout) */
	outputStream?: NodeJS.WritableStream;
}

/**
 * Launch configuration arguments (passed from VS Code)
 */
export interface LaunchConfiguration {
	/** Workflow file path */
	workflowPath: string;

	/** Workflow name */
	workflowName?: string;

	/** Initial variables */
	variables?: Record<string, unknown>;

	/** Break on start */
	stopOnEntry?: boolean;

	/** Trace output path */
	trace?: string;
}

// ============================================================================
// VS Code Debug Adapter
// ============================================================================

export class VsCodeDebugAdapter {
	private config: VsCodeAdapterConfig;
	private debugger: Debugger;
	private sequenceNumber = 1;
	private disposed = false;
	private pendingOutput: string = "";
	private variableReferences = new Map<number, VariableInfo>();
	private nextVariableReference = 1;
	private breakpointMap = new Map<string, DapBreakpoint>();
	private nextBreakpointId = 1;
	private threadId = 1; // Single thread for workflow execution
	private inputStream: NodeJS.ReadableStream;
	private outputStream: NodeJS.WritableStream;

	constructor(config: VsCodeAdapterConfig = {}) {
		this.config = {
			port: 4711,
			debug: false,
			...config,
		};

		this.inputStream = config.inputStream ?? process.stdin;
		this.outputStream = config.outputStream ?? process.stdout;

		// Create debugger with event callbacks
		const callbacks: DebugEventCallbacks = {
			onPause: this.handlePause.bind(this),
			onResume: this.handleResume.bind(this),
			onBreakpointHit: this.handleBreakpointHit.bind(this),
			onStateChange: this.handleStateChange.bind(this),
		};

		this.debugger = createDebugger(callbacks);
	}

	// ==========================================================================
	// Lifecycle
	// ==========================================================================

	/**
	 * Start the debug adapter
	 */
	start(): void {
		this.checkDisposed();

		// Set up protocol communication
		this.inputStream.on("data", this.handleInput.bind(this));

		this.debug("Debug adapter started");
	}

	/**
	 * Stop the debug adapter
	 */
	async stop(): Promise<void> {
		if (this.disposed) return;

		await this.debugger.stop();
		this.sendEvent("terminated", {});

		this.debug("Debug adapter stopped");
	}

	/**
	 * Dispose of the debug adapter
	 */
	dispose(): void {
		if (this.disposed) return;

		void this.stop();
		this.debugger.dispose();

		this.disposed = true;
		this.debug("Debug adapter disposed");
	}

	// ==========================================================================
	// Protocol Communication
	// ==========================================================================

	/**
	 * Handle incoming data from input stream
	 */
	private handleInput(data: Buffer): void {
		this.pendingOutput += data.toString();

		// Process complete messages (Content-Length protocol)
		while (true) {
			const headerMatch = this.pendingOutput.match(
				/Content-Length: (\d+)\r?\n\r?\n/,
			);
			if (!headerMatch) break;

			const contentLength = parseInt(headerMatch[1], 10);
			const headerLength = headerMatch[0].length;
			const messageStart = headerLength;
			const messageEnd = messageStart + contentLength;

			if (this.pendingOutput.length < messageEnd) {
				// Incomplete message, wait for more data
				break;
			}

			// Extract complete message
			const messageText = this.pendingOutput.substring(
				messageStart,
				messageEnd,
			);
			this.pendingOutput = this.pendingOutput.substring(messageEnd);

			// Parse and handle message
			try {
				const message = JSON.parse(messageText) as DapRequest;
				void this.handleRequest(message);
			} catch (error) {
				this.debug(`Failed to parse message: ${error}`);
			}
		}
	}

	/**
	 * Send a response
	 */
	private sendResponse(
		request: DapRequest,
		success: boolean,
		body?: unknown,
		message?: string,
	): void {
		const response: DapResponseMessage = {
			seq: this.sequenceNumber++,
			type: "response",
			request_seq: request.seq,
			success,
			command: request.command,
			body,
			message,
		};

		this.sendMessage(response);
	}

	/**
	 * Send an event
	 */
	private sendEvent(event: DapEventType, body: unknown): void {
		const eventMessage: DapEvent = {
			seq: this.sequenceNumber++,
			type: "event",
			event,
			body,
		};

		this.sendMessage(eventMessage);
	}

	/**
	 * Send a message to the output stream
	 */
	private sendMessage(message: DapMessage): void {
		const json = JSON.stringify(message);
		const data = `Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`;

		this.outputStream.write(data);
		this.debug(`Sent ${message.type}: ${json.substring(0, 100)}`);
	}

	// ==========================================================================
	// Request Handlers
	// ==========================================================================

	/**
	 * Handle incoming DAP request
	 */
	private async handleRequest(request: DapRequest): Promise<void> {
		this.debug(`Received request: ${request.command}`);

		try {
			switch (request.command) {
				case "initialize":
					this.handleInitialize(request);
					break;

				case "launch":
					await this.handleLaunch(request);
					break;

				case "attach":
					this.sendResponse(request, false, undefined, "Attach not supported");
					break;

				case "disconnect":
					await this.handleDisconnect(request);
					break;

				case "setBreakpoints":
					this.handleSetBreakpoints(request);
					break;

				case "setExceptionBreakpoints":
					this.handleSetExceptionBreakpoints(request);
					break;

				case "continue":
					this.handleContinue(request);
					break;

				case "next":
					this.handleNext(request);
					break;

				case "stepIn":
					this.handleStepIn(request);
					break;

				case "stepOut":
					this.handleStepOut(request);
					break;

				case "pause":
					this.handlePauseRequest(request);
					break;

				case "stackTrace":
					this.handleStackTrace(request);
					break;

				case "scopes":
					this.handleScopes(request);
					break;

				case "variables":
					this.handleVariables(request);
					break;

				case "evaluate":
					this.handleEvaluate(request);
					break;

				default:
					this.sendResponse(
						request,
						false,
						undefined,
						`Unknown command: ${request.command}`,
					);
			}
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			this.sendResponse(request, false, undefined, errorMessage);
		}
	}

	/**
	 * Handle initialize request
	 */
	private handleInitialize(request: DapRequest): void {
		// Send capabilities
		const capabilities = {
			supportsConfigurationDoneRequest: true,
			supportsEvaluateForHovers: true,
			supportsStepBack: false,
			supportsSetVariable: false,
			supportsRestartFrame: false,
			supportsGotoTargetsRequest: false,
			supportsStepInTargetsRequest: false,
			supportsCompletionsRequest: false,
			supportsModulesRequest: false,
			supportsRestartRequest: false,
			supportsExceptionOptions: false,
			supportsValueFormattingOptions: true,
			supportsExceptionInfoRequest: false,
			supportTerminateDebuggee: true,
			supportsDelayedStackTraceLoading: false,
			supportsLoadedSourcesRequest: false,
			supportsLogPoints: true,
			supportsTerminateThreadsRequest: false,
			supportsSetExpression: false,
			supportsTerminateRequest: true,
			supportsDataBreakpoints: false,
			supportsReadMemoryRequest: false,
			supportsDisassembleRequest: false,
			supportsCancelRequest: false,
			supportsBreakpointLocationsRequest: false,
			supportsClipboardContext: false,
			supportsExceptionFilterOptions: true,
		};

		this.sendResponse(request, true, capabilities);
		this.sendEvent("initialized", {});
	}

	/**
	 * Handle launch request
	 */
	private async handleLaunch(request: DapRequest): Promise<void> {
		const args = request.arguments as unknown as LaunchConfiguration;

		if (!args?.workflowPath) {
			this.sendResponse(request, false, undefined, "Missing workflowPath");
			return;
		}

		// Configure debugger
		const debugConfig: DebuggerConfig = {
			enabled: true,
			breakOnStart: args.stopOnEntry ?? false,
			traceOutputPath: args.trace,
		};

		// Start debugger
		await this.debugger.start(debugConfig);

		// Initialize workflow
		this.debugger.initializeWorkflow(
			args.workflowName ?? args.workflowPath,
			args.variables ?? {},
		);

		this.sendResponse(request, true);

		// If stopOnEntry, send stopped event
		if (args.stopOnEntry) {
			this.sendEvent("stopped", {
				reason: "entry" as StoppedReason,
				threadId: this.threadId,
				allThreadsStopped: true,
			});
		}
	}

	/**
	 * Handle disconnect request
	 */
	private async handleDisconnect(request: DapRequest): Promise<void> {
		await this.stop();
		this.sendResponse(request, true);
	}

	/**
	 * Handle setBreakpoints request
	 */
	private handleSetBreakpoints(request: DapRequest): void {
		const args = request.arguments as {
			source: DapSource;
			breakpoints?: DapSourceBreakpoint[];
		};

		const dapBreakpoints: DapBreakpoint[] = [];

		// Clear existing breakpoints for this source
		this.debugger.clearBreakpoints();

		// Set new breakpoints
		if (args.breakpoints) {
			for (const sourceBreakpoint of args.breakpoints) {
				const breakpointId = randomUUID();
				const breakpoint: NodeBreakpoint = {
					id: breakpointId,
					type: "node",
					enabled: true,
					nodeName: `line_${sourceBreakpoint.line}`, // Map line to node name
					when: "before",
					condition: sourceBreakpoint.condition,
					logMessage: sourceBreakpoint.logMessage,
				};

				this.debugger.setBreakpoint(breakpoint);

				const dapBreakpoint: DapBreakpoint = {
					id: this.nextBreakpointId++,
					verified: true,
					line: sourceBreakpoint.line,
					column: sourceBreakpoint.column,
				};

				this.breakpointMap.set(breakpointId, dapBreakpoint);
				dapBreakpoints.push(dapBreakpoint);
			}
		}

		this.sendResponse(request, true, { breakpoints: dapBreakpoints });
	}

	/**
	 * Handle setExceptionBreakpoints request
	 */
	private handleSetExceptionBreakpoints(request: DapRequest): void {
		const args = request.arguments as {
			filters: string[];
		};

		// Clear existing exception breakpoints
		const allBreakpoints = this.debugger.getBreakpoints();
		for (const bp of allBreakpoints) {
			if (bp.type === "exception") {
				this.debugger.removeBreakpoint(bp.id);
			}
		}

		// Set new exception breakpoints
		for (const filter of args.filters) {
			const breakpoint: ExceptionBreakpoint = {
				id: randomUUID(),
				type: "exception",
				enabled: true,
				mode: filter === "uncaught" ? "uncaught" : "all",
			};

			this.debugger.setBreakpoint(breakpoint);
		}

		this.sendResponse(request, true);
	}

	/**
	 * Handle continue request
	 */
	private handleContinue(request: DapRequest): void {
		this.debugger.continue();
		this.sendResponse(request, true, { allThreadsContinued: true });
	}

	/**
	 * Handle next (step over) request
	 */
	private handleNext(request: DapRequest): void {
		this.debugger.stepOver();
		this.sendResponse(request, true);
	}

	/**
	 * Handle stepIn request
	 */
	private handleStepIn(request: DapRequest): void {
		this.debugger.stepIn();
		this.sendResponse(request, true);
	}

	/**
	 * Handle stepOut request
	 */
	private handleStepOut(request: DapRequest): void {
		this.debugger.stepOut();
		this.sendResponse(request, true);
	}

	/**
	 * Handle pause request
	 */
	private handlePauseRequest(request: DapRequest): void {
		this.debugger.pause();
		this.sendResponse(request, true);
	}

	/**
	 * Handle stackTrace request
	 */
	private handleStackTrace(request: DapRequest): void {
		const context = this.debugger.context;
		if (!context) {
			this.sendResponse(request, true, { stackFrames: [], totalFrames: 0 });
			return;
		}

		const stackFrames: DapStackFrame[] = [];

		// Add current frame
		if (context.currentNode) {
			stackFrames.push({
				id: 0,
				name: context.currentNode,
				source: {
					name: context.workflowName,
					path: context.workflowName,
				},
				line: 1,
				column: 0,
			});
		}

		// Add call stack frames
		for (let i = 0; i < context.callStack.length; i++) {
			const frame = context.callStack[i];
			stackFrames.push({
				id: frame.id,
				name: frame.name,
				source: {
					name: frame.source,
					path: frame.source,
				},
				line: 1,
				column: 0,
			});
		}

		this.sendResponse(request, true, {
			stackFrames,
			totalFrames: stackFrames.length,
		});
	}

	/**
	 * Handle scopes request
	 */
	private handleScopes(request: DapRequest): void {
		const args = request.arguments as { frameId: number };

		const scopes: DapScope[] = [
			{
				name: "Workflow",
				variablesReference: this.getVariableReference("workflow", args.frameId),
				expensive: false,
			},
			{
				name: "Node",
				variablesReference: this.getVariableReference("node", args.frameId),
				expensive: false,
			},
			{
				name: "Local",
				variablesReference: this.getVariableReference("local", args.frameId),
				expensive: false,
			},
		];

		this.sendResponse(request, true, { scopes });
	}

	/**
	 * Handle variables request
	 */
	private handleVariables(request: DapRequest): void {
		const args = request.arguments as { variablesReference: number };

		const variableInfo = this.variableReferences.get(args.variablesReference);
		if (!variableInfo) {
			this.sendResponse(request, true, { variables: [] });
			return;
		}

		const variables: DapVariable[] = [];

		// If this is a scope reference, get variables from debugger
		if (variableInfo.scope) {
			const inspectedVars = this.debugger.inspectVariables({
				scope: variableInfo.scope,
			});

			for (const varInfo of inspectedVars) {
				variables.push(this.variableInfoToDapVariable(varInfo));
			}
		}
		// If this has children, return them
		else if (variableInfo.children) {
			for (const child of variableInfo.children) {
				variables.push(this.variableInfoToDapVariable(child));
			}
		}

		this.sendResponse(request, true, { variables });
	}

	/**
	 * Handle evaluate request
	 */
	private handleEvaluate(request: DapRequest): void {
		const args = request.arguments as { expression: string; frameId?: number };

		// For now, simple variable lookup
		const context = this.debugger.context;
		if (!context) {
			this.sendResponse(request, false, undefined, "No active context");
			return;
		}

		const value = context.variables[args.expression];
		const result = value !== undefined ? String(value) : "undefined";

		this.sendResponse(request, true, {
			result,
			variablesReference: 0,
		});
	}

	// ==========================================================================
	// Event Handlers (from Debugger callbacks)
	// ==========================================================================

	/**
	 * Handle pause event from debugger
	 */
	private handlePause(): void {
		// Stopped event is sent by handleBreakpointHit or handleStateChange
	}

	/**
	 * Handle resume event from debugger
	 */
	private handleResume(): void {
		this.sendEvent("continued", {
			threadId: this.threadId,
			allThreadsContinued: true,
		});
	}

	/**
	 * Handle breakpoint hit event from debugger
	 */
	private handleBreakpointHit(): void {
		this.sendEvent("stopped", {
			reason: "breakpoint" as StoppedReason,
			threadId: this.threadId,
			allThreadsStopped: true,
		});
	}

	/**
	 * Handle state change event from debugger
	 */
	private handleStateChange(state: DebugExecutionState): void {
		switch (state) {
			case "paused":
			case "stepping":
				this.sendEvent("stopped", {
					reason: "step" as StoppedReason,
					threadId: this.threadId,
					allThreadsStopped: true,
				});
				break;

			case "stopped":
				this.sendEvent("exited", { exitCode: 0 });
				break;

			case "error":
				this.sendEvent("stopped", {
					reason: "exception" as StoppedReason,
					threadId: this.threadId,
					allThreadsStopped: true,
				});
				break;

			// No event for 'running'
		}
	}

	// ==========================================================================
	// Utilities
	// ==========================================================================

	/**
	 * Get or create a variable reference for a scope
	 */
	private getVariableReference(
		scope: "workflow" | "node" | "local",
		_frameId: number,
	): number {
		const ref = this.nextVariableReference++;
		const varInfo: VariableInfo = {
			name: scope,
			value: null,
			type: "scope",
			scope,
			readonly: true,
		};

		this.variableReferences.set(ref, varInfo);
		return ref;
	}

	/**
	 * Convert VariableInfo to DAP Variable
	 */
	private variableInfoToDapVariable(varInfo: VariableInfo): DapVariable {
		let variablesReference = 0;

		// If has children, create reference
		if (varInfo.childCount && varInfo.childCount > 0) {
			variablesReference = this.nextVariableReference++;
			this.variableReferences.set(variablesReference, varInfo);
		}

		return {
			name: varInfo.name,
			value: this.formatValue(varInfo.value),
			type: varInfo.type,
			variablesReference,
			namedVariables: varInfo.childCount,
		};
	}

	/**
	 * Format a value for display
	 */
	private formatValue(value: unknown): string {
		if (value === null) return "null";
		if (value === undefined) return "undefined";
		if (typeof value === "string") return `"${value}"`;
		if (typeof value === "object") {
			if (Array.isArray(value)) return `Array(${value.length})`;
			return Object.prototype.toString.call(value);
		}
		return String(value);
	}

	/**
	 * Check if disposed
	 */
	private checkDisposed(): void {
		if (this.disposed) {
			throw new Error("Debug adapter has been disposed");
		}
	}

	/**
	 * Debug logging
	 */
	private debug(message: string): void {
		if (this.config.debug) {
			// eslint-disable-next-line no-console
			console.error(`[DAP] ${message}`);
		}
	}

	// ==========================================================================
	// Getters
	// ==========================================================================

	/**
	 * Get the underlying debugger
	 */
	getDebugger(): Debugger {
		return this.debugger;
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
 * Create a VS Code debug adapter
 */
export function createVsCodeDebugAdapter(
	config?: VsCodeAdapterConfig,
): VsCodeDebugAdapter {
	return new VsCodeDebugAdapter(config);
}
