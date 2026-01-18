/**
 * Debug Renderer - Interactive debugging output for workflow execution
 *
 * Displays debug events with interactive prompts for step-through debugging.
 * Suitable for development and debugging workflows.
 */

import { BaseRenderer, type RendererConfig } from "../renderer";
import type {
	WorkflowEvent,
	DebugBreakpointHitEvent,
	DebugStepBeforeEvent,
	DebugStepAfterEvent,
	DebugVariableInspectEvent,
	DebugExecutionPauseEvent,
	DebugExecutionResumeEvent,
} from "../types";
import * as readline from "readline";

// ============================================================================
// Debug Renderer Configuration
// ============================================================================

export interface DebugRendererConfig extends RendererConfig {
	/** Show variable values in output */
	showVariables?: boolean;
	/** Show call stack in output */
	showCallStack?: boolean;
	/** Interactive mode (prompts for user input) */
	interactive?: boolean;
	/** Output stream for non-interactive mode */
	output?: NodeJS.WriteStream;
}

// ============================================================================
// Debug Command Types
// ============================================================================

export type DebugCommand =
	| "continue" // Continue execution until next breakpoint
	| "step-over" // Execute current node and pause at next
	| "step-in" // Step into node execution
	| "step-out" // Step out of current node
	| "inspect" // Inspect variables
	| "quit"; // Stop debugging

export interface DebugCommandHandler {
	(command: DebugCommand, args?: string[]): void | Promise<void>;
}

// ============================================================================
// Debug Renderer Class
// ============================================================================

export class DebugRenderer extends BaseRenderer {
	readonly name = "debug";

	private debugConfig: Required<DebugRendererConfig>;
	private rl?: readline.Interface;
	private isWaitingForInput = false;
	private commandHandler?: DebugCommandHandler;
	private isPaused = false;

	constructor(config: DebugRendererConfig = {}) {
		super(config);
		this.debugConfig = {
			...this.config,
			showVariables: config.showVariables ?? true,
			showCallStack: config.showCallStack ?? true,
			interactive: config.interactive ?? true,
			output: config.output ?? process.stdout,
		};

		if (this.debugConfig.interactive && process.stdin.isTTY) {
			this.rl = readline.createInterface({
				input: process.stdin,
				output: this.debugConfig.output,
				prompt: "debug> ",
			});
		}
	}

	/**
	 * Set the command handler for debug commands
	 */
	setCommandHandler(handler: DebugCommandHandler): void {
		this.commandHandler = handler;
	}

	/**
	 * Render a debug event
	 */
	render(event: WorkflowEvent): void {
		switch (event.type) {
			case "debug:breakpoint:hit":
				this.renderBreakpointHit(event as DebugBreakpointHitEvent);
				break;
			case "debug:step:before":
				this.renderStepBefore(event as DebugStepBeforeEvent);
				break;
			case "debug:step:after":
				this.renderStepAfter(event as DebugStepAfterEvent);
				break;
			case "debug:variable:inspect":
				this.renderVariableInspect(event as DebugVariableInspectEvent);
				break;
			case "debug:execution:pause":
				this.renderExecutionPause(event as DebugExecutionPauseEvent);
				break;
			case "debug:execution:resume":
				this.renderExecutionResume(event as DebugExecutionResumeEvent);
				break;
			default:
				// Ignore non-debug events
				break;
		}
	}

	/**
	 * Render breakpoint hit event
	 */
	private renderBreakpointHit(event: DebugBreakpointHitEvent): void {
		const { breakpointId, nodeName, condition, hitCount, variables } =
			event.payload;

		this.writeLine("");
		this.writeLine("═══════════════════════════════════════════════════════");
		this.writeLine(`🔴 BREAKPOINT HIT: ${breakpointId}`);
		this.writeLine(`   Node: ${nodeName}`);
		if (condition) {
			this.writeLine(`   Condition: ${condition}`);
		}
		this.writeLine(`   Hit count: ${hitCount}`);

		if (this.debugConfig.showVariables && Object.keys(variables).length > 0) {
			this.writeLine("");
			this.writeLine("   Variables:");
			this.renderVariables(variables, "      ");
		}

		this.writeLine("═══════════════════════════════════════════════════════");
		this.writeLine("");

		this.isPaused = true;
		this.promptForCommand();
	}

	/**
	 * Render step before event
	 */
	private renderStepBefore(event: DebugStepBeforeEvent): void {
		const { nodeName, stepType, variables } = event.payload;

		this.writeLine(`⏸️  Step ${stepType}: ${nodeName}`);

		if (
			this.debugConfig.showVariables &&
			this.config.verbose &&
			Object.keys(variables).length > 0
		) {
			this.writeLine("   Variables:");
			this.renderVariables(variables, "      ");
		}
	}

	/**
	 * Render step after event
	 */
	private renderStepAfter(event: DebugStepAfterEvent): void {
		const { nodeName, stepType, duration, variableChanges } = event.payload;

		this.writeLine(
			`✓ Step ${stepType} completed: ${nodeName} (${this.formatDuration(duration)})`,
		);

		if (
			this.debugConfig.showVariables &&
			Object.keys(variableChanges).length > 0
		) {
			this.writeLine("   Changed variables:");
			this.renderVariables(variableChanges, "      ");
		}
	}

	/**
	 * Render variable inspect event
	 */
	private renderVariableInspect(event: DebugVariableInspectEvent): void {
		const { variableName, value, scope, path } = event.payload;

		this.writeLine("");
		this.writeLine(`🔍 Variable: ${variableName}`);
		this.writeLine(`   Scope: ${scope}`);
		if (path) {
			this.writeLine(`   Path: ${path}`);
		}
		this.writeLine(`   Value:`);
		this.renderVariables({ [variableName]: value }, "      ");
		this.writeLine("");
	}

	/**
	 * Render execution pause event
	 */
	private renderExecutionPause(event: DebugExecutionPauseEvent): void {
		const { nodeName, reason, variables, callStack } = event.payload;

		this.writeLine("");
		this.writeLine("═══════════════════════════════════════════════════════");
		this.writeLine(`⏸️  EXECUTION PAUSED: ${reason}`);
		this.writeLine(`   Node: ${nodeName}`);

		if (this.debugConfig.showCallStack && callStack && callStack.length > 0) {
			this.writeLine("");
			this.writeLine("   Call Stack:");
			callStack.forEach((frame, index) => {
				this.writeLine(`      ${index}: ${frame}`);
			});
		}

		if (this.debugConfig.showVariables && Object.keys(variables).length > 0) {
			this.writeLine("");
			this.writeLine("   Variables:");
			this.renderVariables(variables, "      ");
		}

		this.writeLine("═══════════════════════════════════════════════════════");
		this.writeLine("");

		this.isPaused = true;
		this.promptForCommand();
	}

	/**
	 * Render execution resume event
	 */
	private renderExecutionResume(event: DebugExecutionResumeEvent): void {
		const { nodeName, resumeMode, duration } = event.payload;

		this.writeLine(
			`▶️  Resumed (${resumeMode}): ${nodeName} (paused for ${this.formatDuration(duration)})`,
		);
		this.writeLine("");
		this.isPaused = false;
	}

	/**
	 * Render variables with proper formatting
	 */
	private renderVariables(
		variables: Record<string, unknown>,
		indent: string = "",
	): void {
		for (const [key, value] of Object.entries(variables)) {
			const formattedValue = this.formatValue(value);
			this.writeLine(`${indent}${key}: ${formattedValue}`);
		}
	}

	/**
	 * Format a value for display
	 */
	private formatValue(value: unknown): string {
		if (value === null) return "null";
		if (value === undefined) return "undefined";

		const type = typeof value;

		if (type === "string") {
			return `"${value}"`;
		}

		if (type === "number" || type === "boolean") {
			return String(value);
		}

		if (type === "function") {
			return "[Function]";
		}

		if (Array.isArray(value)) {
			if (value.length === 0) return "[]";
			if (value.length > 3) {
				return `[Array(${value.length})]`;
			}
			return `[${value.map((v) => this.formatValue(v)).join(", ")}]`;
		}

		if (type === "object") {
			const keys = Object.keys(value as object);
			if (keys.length === 0) return "{}";
			if (keys.length > 3) {
				return `{Object with ${keys.length} properties}`;
			}
			const entries = keys.map(
				(k) =>
					`${k}: ${this.formatValue((value as Record<string, unknown>)[k])}`,
			);
			return `{ ${entries.join(", ")} }`;
		}

		return String(value);
	}

	/**
	 * Prompt for debug command
	 */
	private promptForCommand(): void {
		if (!this.debugConfig.interactive || !this.rl || this.isWaitingForInput) {
			return;
		}

		this.isWaitingForInput = true;
		this.writeLine(
			"Commands: (c)ontinue, (s)tep-over, step-(i)n, step-(o)ut, in(s)pect <var>, (q)uit",
		);
		this.rl.prompt();

		// Set up one-time listener for command
		const onLine = (line: string): void => {
			this.rl?.off("line", onLine);
			this.isWaitingForInput = false;
			this.handleCommand(line.trim());
		};

		this.rl.on("line", onLine);
	}

	/**
	 * Handle a debug command
	 */
	private handleCommand(input: string): void {
		if (!input) {
			this.promptForCommand();
			return;
		}

		const parts = input.split(/\s+/);
		const cmd = parts[0].toLowerCase();
		const args = parts.slice(1);

		let command: DebugCommand | null = null;

		// Parse command shortcuts
		switch (cmd) {
			case "c":
			case "continue":
				command = "continue";
				break;
			case "s":
			case "step":
			case "step-over":
				command = "step-over";
				break;
			case "i":
			case "step-in":
				command = "step-in";
				break;
			case "o":
			case "step-out":
				command = "step-out";
				break;
			case "inspect":
				command = "inspect";
				break;
			case "q":
			case "quit":
			case "exit":
				command = "quit";
				break;
			default:
				this.writeLine(`Unknown command: ${cmd}`);
				this.promptForCommand();
				return;
		}

		// Call command handler if set
		if (this.commandHandler) {
			this.commandHandler(command, args);
		}
	}

	/**
	 * Write a line to output
	 */
	private writeLine(message: string): void {
		this.debugConfig.output.write(message + "\n");
	}

	/**
	 * Check if debugger is currently paused
	 */
	isPausedState(): boolean {
		return this.isPaused;
	}

	/**
	 * Get the readline interface (for testing)
	 */
	getReadlineInterface(): readline.Interface | undefined {
		return this.rl;
	}

	/**
	 * Dispose of the renderer
	 */
	dispose(): void {
		super.dispose();

		if (this.rl) {
			this.rl.close();
			this.rl = undefined;
		}

		this.isWaitingForInput = false;
		this.isPaused = false;
		this.commandHandler = undefined;
	}
}
