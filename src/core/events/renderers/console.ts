/**
 * Console Renderer - Colored terminal output for workflow events
 *
 * Displays workflow events with ANSI colors and formatting for human readability.
 * Suitable for interactive terminal use.
 */

import { BaseRenderer, type RendererConfig } from "../renderer";
import type {
	AgentSessionFileInfo,
	AgentSessionUsage,
	CleanupCompleteEvent,
	CleanupStartEvent,
	CustomEvent,
	ImplementationPhaseCompleteEvent,
	ImplementationPhaseStartEvent,
	LogEvent,
	NodeCompleteEvent,
	NodeErrorEvent,
	NodeStartEvent,
	PlanningPhaseCompleteEvent,
	PlanningPhaseStartEvent,
	RouterDecisionEvent,
	ToolAgentSessionCompleteEvent,
	ToolAgentSessionErrorEvent,
	ToolAgentSessionMessageEvent,
	ToolAgentSessionStartEvent,
	ToolBashCompleteEvent,
	ToolBashErrorEvent,
	ToolBashStartEvent,
	ToolChecklistCompleteEvent,
	ToolChecklistItemCompleteEvent,
	ToolChecklistStartEvent,
	ToolClaudeCompleteEvent,
	ToolClaudeErrorEvent,
	ToolClaudePlanApprovalEvent,
	ToolClaudeSdkCompleteEvent,
	ToolClaudeSdkErrorEvent,
	ToolClaudeSdkRetryEvent,
	ToolClaudeSdkStartEvent,
	ToolClaudeStartEvent,
	ToolHookCompleteEvent,
	ToolHookStartEvent,
	ToolParallelBashCommandCompleteEvent,
	ToolParallelBashCompleteEvent,
	ToolParallelBashProgressEvent,
	ToolParallelBashStartEvent,
	WorkflowCompleteEvent,
	WorkflowEvent,
	WorkflowStartEvent,
} from "../types";

// ============================================================================
// ANSI Color Codes
// ============================================================================

const colors = {
	reset: "\x1b[0m",
	bold: "\x1b[1m",
	dim: "\x1b[2m",
	italic: "\x1b[3m",
	underline: "\x1b[4m",

	// Foreground colors
	black: "\x1b[30m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	magenta: "\x1b[35m",
	cyan: "\x1b[36m",
	white: "\x1b[37m",
	gray: "\x1b[90m",

	// Bright foreground colors
	brightRed: "\x1b[91m",
	brightGreen: "\x1b[92m",
	brightYellow: "\x1b[93m",
	brightBlue: "\x1b[94m",
	brightMagenta: "\x1b[95m",
	brightCyan: "\x1b[96m",
	brightWhite: "\x1b[97m",

	// Background colors
	bgBlack: "\x1b[40m",
	bgRed: "\x1b[41m",
	bgGreen: "\x1b[42m",
	bgYellow: "\x1b[43m",
	bgBlue: "\x1b[44m",
	bgMagenta: "\x1b[45m",
	bgCyan: "\x1b[46m",
	bgWhite: "\x1b[47m",
};

// ============================================================================
// Nerd Font Icons (MesloLGS Nerd Font Mono compatible)
// Reference: https://www.nerdfonts.com/cheat-sheet
// ============================================================================

const icons = {
	// Status indicators
	success: "\uf00c", //  (fa-check)
	error: "\udb82\udfc9", //  (nf-md-close_circle_outline)
	warning: "\uf071", //  (fa-warning)
	info: "\uf075", //  (fa-comment) speech bubble
	debug: "\uf188", //  (fa-bug)
	skip: "\uf05e", //  (fa-ban)

	// Actions
	play: "\uf04b", //  (fa-play)
	stop: "\uf04d", //  (fa-stop)
	retry: "\uf021", //  (fa-refresh)
	arrow: "\uf061", //  (fa-arrow-right)

	// Tools
	terminal: "\uf120", //  (nf-fa-terminal)
	code: "\uf121", //  (fa-code)
	brain: "\uf5dc", //  (fa-brain)
	cog: "\uf013", //  (fa-cog)
	plug: "\uf1e6", //  (fa-plug)
	list: "\uf03a", //  (fa-list)
	cube: "\uf1b2", //  (fa-cube)
	robot: "\uee0d", //  agent message
	hammer: "\uf0ad", //  (fa-wrench)
	thinking: "\udb85\ude9f", // 󱚟 thinking

	// Workflow
	rocket: "\ueb44", //  (nf-cod-rocket)
	flow: "\uf542", //  (mdi-source-branch)
	node: "\uf0c8", //  (fa-square)
	event: "\uf0e7", //  (fa-bolt)
	plan: "\uf0f6", //  (fa-file-text-o) planning/document

	// Misc
	clock: "\uf017", //  (fa-clock-o)
	trash: "\uf1f8", //  (fa-trash)
	file: "\uf15b", //  (fa-file)
	folder: "\uf07b", //  (fa-folder)

	// Box drawing (fallback for simpler look)
	pipe: "│",
	corner: "└",
	tee: "├",
	line: "─",
};

// Indentation for node content
const INDENT = "   ";

// ============================================================================
// Console Renderer Configuration
// ============================================================================

export interface ConsoleRendererConfig extends RendererConfig {
	/** Disable colors in output */
	noColor?: boolean;
	/** Show node separators */
	showNodeSeparators?: boolean;
	/** Separator width */
	separatorWidth?: number;
}

// ============================================================================
// Console Renderer Class
// ============================================================================

export class ConsoleRenderer extends BaseRenderer {
	readonly name = "console";

	private consoleConfig: Required<ConsoleRendererConfig>;
	private isCI: boolean;

	constructor(config: ConsoleRendererConfig = {}) {
		super(config);
		this.isCI = Boolean(process.env.CI);
		this.consoleConfig = {
			...this.config,
			noColor: config.noColor ?? this.isCI ?? !process.stdout.isTTY,
			showNodeSeparators: config.showNodeSeparators ?? true,
			separatorWidth: config.separatorWidth ?? 60,
		};
	}

	/**
	 * Render an event to the console
	 */
	render(event: WorkflowEvent): void {
		switch (event.type) {
			// Workflow lifecycle
			case "workflow:start":
				this.renderWorkflowStart(event);
				break;
			case "workflow:complete":
				this.renderWorkflowComplete(event);
				break;
			case "workflow:error":
				this.renderError("Workflow", event.payload.error);
				break;

			// Node execution
			case "node:start":
				this.renderNodeStart(event);
				break;
			case "node:complete":
				this.renderNodeComplete(event);
				break;
			case "node:error":
				this.renderNodeError(event);
				break;

			// Routing
			case "router:decision":
				this.renderRouterDecision(event);
				break;

			// Tool: Bash
			case "tool:bash:start":
				this.renderBashStart(event);
				break;
			case "tool:bash:complete":
				this.renderBashComplete(event);
				break;
			case "tool:bash:error":
				this.renderBashError(event);
				break;

			// Tool: Parallel Bash
			case "tool:parallel:bash:start":
				this.renderParallelBashStart(event);
				break;
			case "tool:parallel:bash:progress":
				this.renderParallelBashProgress(event);
				break;
			case "tool:parallel:bash:command:complete":
				this.renderParallelBashCommandComplete(event);
				break;
			case "tool:parallel:bash:complete":
				this.renderParallelBashComplete(event);
				break;

			// Tool: Claude
			case "tool:claude:start":
				this.renderClaudeStart(event);
				break;
			case "tool:claude:complete":
				this.renderClaudeComplete(event);
				break;
			case "tool:claude:error":
				this.renderClaudeError(event);
				break;
			case "tool:claude:plan:approval":
				this.renderClaudePlanApproval(event);
				break;

			// Tool: ClaudeSdk
			case "tool:claudeSdk:start":
				this.renderClaudeSdkStart(event);
				break;
			case "tool:claudeSdk:complete":
				this.renderClaudeSdkComplete(event);
				break;
			case "tool:claudeSdk:error":
				this.renderClaudeSdkError(event);
				break;
			case "tool:claudeSdk:retry":
				this.renderClaudeSdkRetry(event);
				break;

			// Tool: AgentSession
			case "tool:agentSession:start":
				this.renderAgentSessionStart(event);
				break;
			case "tool:agentSession:message":
				this.renderAgentSessionMessage(event);
				break;
			case "tool:agentSession:complete":
				this.renderAgentSessionComplete(event);
				break;
			case "tool:agentSession:error":
				this.renderAgentSessionError(event);
				break;

			// Planning Agent Session
			case "planning:phase:start":
				this.renderPlanningPhaseStart(event);
				break;
			case "planning:phase:complete":
				this.renderPlanningPhaseComplete(event);
				break;
			case "implementation:phase:start":
				this.renderImplementationPhaseStart(event);
				break;
			case "implementation:phase:complete":
				this.renderImplementationPhaseComplete(event);
				break;

			// Tool: Hook
			case "tool:hook:start":
				this.renderHookStart(event);
				break;
			case "tool:hook:complete":
				this.renderHookComplete(event);
				break;

			// Tool: Checklist
			case "tool:checklist:start":
				this.renderChecklistStart(event);
				break;
			case "tool:checklist:complete":
				this.renderChecklistComplete(event);
				break;
			case "tool:checklist:item:complete":
				this.renderChecklistItemComplete(event);
				break;

			// Cleanup
			case "cleanup:start":
				this.renderCleanupStart(event);
				break;
			case "cleanup:complete":
				this.renderCleanupComplete(event);
				break;

			// Log events
			case "log":
				this.renderLog(event);
				break;

			// Custom events
			case "workflow:custom":
				this.renderCustomEvent(event);
				break;

			// Verbose-only events
			default:
				if (this.config.verbose) {
					this.renderVerbose(event);
				}
		}
	}

	// ==========================================================================
	// Workflow Lifecycle Rendering
	// ==========================================================================

	private renderWorkflowStart(event: WorkflowStartEvent): void {
		const { workflowName } = event.payload;
		console.log("");
		console.log(this.colorize(this.separator("heavy"), "gray"));
		console.log(
			this.colorize(
				`${icons.rocket} WORKFLOW: ${workflowName}`,
				"brightCyan",
				"bold",
			),
		);
		console.log(this.colorize(this.separator("heavy"), "gray"));
		console.log("");
	}

	onWorkflowStart(event: WorkflowStartEvent): void {
		this.renderWorkflowStart(event);
	}

	private renderWorkflowComplete(event: WorkflowCompleteEvent): void {
		const { workflowName, duration, success } = event.payload;
		console.log("");
		console.log(this.colorize(this.separator("heavy"), "gray"));

		if (success) {
			console.log(
				this.colorize(
					`${icons.success} WORKFLOW COMPLETE: ${workflowName}`,
					"brightGreen",
					"bold",
				),
			);
		} else {
			console.log(
				this.colorize(
					`${icons.error} WORKFLOW FAILED: ${workflowName}`,
					"brightRed",
					"bold",
				),
			);
		}

		console.log(
			this.colorize(
				`${icons.clock} Duration: ${this.formatDuration(duration)}`,
				"dim",
			),
		);
		console.log(this.colorize(this.separator("heavy"), "gray"));
		console.log("");
	}

	onWorkflowComplete(event: WorkflowCompleteEvent): void {
		this.renderWorkflowComplete(event);
	}

	// ==========================================================================
	// Node Rendering
	// ==========================================================================

	private renderNodeStart(event: NodeStartEvent): void {
		if (!this.consoleConfig.showNodeSeparators) {
			return;
		}

		const { nodeName } = event.payload;
		console.log(
			this.colorize(`${icons.cube} ${nodeName}`, "brightYellow", "bold"),
		);
	}

	private renderNodeComplete(event: NodeCompleteEvent): void {
		if (!this.config.verbose) {
			return;
		}

		const { nodeName, duration } = event.payload;
		console.log(
			this.colorize(
				`${INDENT}${icons.success} Node '${nodeName}' completed in ${this.formatDuration(duration)}`,
				"dim",
			),
		);
	}

	private renderNodeError(event: NodeErrorEvent): void {
		const { nodeName, error } = event.payload;
		this.renderError(`Node '${nodeName}'`, error);
	}

	// ==========================================================================
	// Router Rendering
	// ==========================================================================

	private renderRouterDecision(event: RouterDecisionEvent): void {
		const { sourceNode, decision, targetNode } = event.payload;

		if (this.config.verbose) {
			console.log(
				this.colorize(
					`${INDENT}${icons.arrow} Router: ${sourceNode} ${icons.arrow} ${decision} ${icons.arrow} ${targetNode}`,
					"cyan",
				),
			);
		}
	}

	// ==========================================================================
	// Tool: Bash Rendering
	// ==========================================================================

	private renderBashStart(event: ToolBashStartEvent): void {
		const { label, command } = event.payload;
		const displayText = label || command;

		console.log(
			this.colorize(`${INDENT}${icons.terminal} ${displayText}`, "blue"),
		);
	}

	private renderBashComplete(event: ToolBashCompleteEvent): void {
		// Only show completion in verbose mode or on failure
		const { success, duration } = event.payload;

		if (!success) {
			// Error will be shown by renderBashError
			return;
		}

		// Show duration only in verbose mode
		if (this.config.verbose) {
			console.log(
				this.colorize(
					`${INDENT}  ${icons.success} completed (${this.formatDuration(duration)})`,
					"dim",
				),
			);
		}
	}

	private renderBashError(event: ToolBashErrorEvent): void {
		const { command, error } = event.payload;

		console.log("");
		console.log(
			this.colorize(`${INDENT}${icons.error} BASH ERROR`, "brightRed", "bold"),
		);
		console.log(this.colorize(`${INDENT}  Command: ${command}`, "red"));
		console.log(this.colorize(`${INDENT}  Error: ${error}`, "red"));
		console.log("");
	}

	// ==========================================================================
	// Tool: Parallel Bash Rendering
	// ==========================================================================

	private renderParallelBashStart(event: ToolParallelBashStartEvent): void {
		const { commands, maxConcurrency } = event.payload;

		console.log(
			this.colorize(
				`${INDENT}${icons.terminal} [parallel] ${commands.length} commands (max ${maxConcurrency} concurrent)`,
				"brightBlue",
			),
		);

		// In verbose mode, show the command list
		if (this.config.verbose) {
			for (const cmd of commands) {
				const label = cmd.label || this.truncate(cmd.command, 40);
				console.log(this.colorize(`${INDENT}  ${icons.tee} ${label}`, "dim"));
			}
		}
	}

	private renderParallelBashProgress(
		event: ToolParallelBashProgressEvent,
	): void {
		// Only show progress in verbose mode to avoid too much output
		if (!this.config.verbose) {
			return;
		}

		const { completed, total, running, succeeded, failed } = event.payload;
		const percent = Math.round((completed / total) * 100);

		console.log(
			this.colorize(
				`${INDENT}  ${icons.clock} ${percent}% (${completed}/${total}) - ${running} running, ${succeeded} ok, ${failed} failed`,
				"dim",
			),
		);
	}

	private renderParallelBashCommandComplete(
		event: ToolParallelBashCommandCompleteEvent,
	): void {
		const { id, label, success, duration, timedOut } = event.payload;
		const displayName = label || id;

		if (this.config.verbose) {
			// Show individual command results in verbose mode
			if (success) {
				console.log(
					this.colorize(
						`${INDENT}  ${icons.success} ${displayName} (${this.formatDuration(duration)})`,
						"green",
					),
				);
			} else if (timedOut) {
				console.log(
					this.colorize(
						`${INDENT}  ${icons.warning} ${displayName} timed out`,
						"yellow",
					),
				);
			} else {
				console.log(
					this.colorize(
						`${INDENT}  ${icons.error} ${displayName} failed`,
						"red",
					),
				);
			}
		}
	}

	private renderParallelBashComplete(
		event: ToolParallelBashCompleteEvent,
	): void {
		const { success, total, succeeded, failed, timedOut, duration, aborted } =
			event.payload;

		if (aborted) {
			console.log(
				this.colorize(
					`${INDENT}  ${icons.error} parallel execution aborted`,
					"brightRed",
				),
			);
			return;
		}

		const statusIcon = success ? icons.success : icons.error;
		const statusColor = success ? "green" : "red";

		let summary = `${succeeded}/${total} succeeded`;
		if (failed > 0) {
			summary += `, ${failed} failed`;
		}
		if (timedOut > 0) {
			summary += `, ${timedOut} timed out`;
		}

		console.log(
			this.colorize(
				`${INDENT}  ${statusIcon} ${summary} (${this.formatDuration(duration)})`,
				statusColor,
			),
		);
	}

	// ==========================================================================
	// Tool: Claude Rendering
	// ==========================================================================

	private renderClaudeStart(event: ToolClaudeStartEvent): void {
		const { label, prompt } = event.payload;
		const displayText = label || this.truncate(prompt, 50);
		console.log(
			this.colorize(
				`${INDENT}${icons.code} [claude] ${displayText}`,
				"magenta",
			),
		);
	}

	private renderClaudeComplete(event: ToolClaudeCompleteEvent): void {
		const { success, duration } = event.payload;

		if (!success) {
			return;
		}

		if (this.config.verbose) {
			console.log(
				this.colorize(
					`${INDENT}  ${icons.success} completed (${this.formatDuration(duration)})`,
					"dim",
				),
			);
		}
	}

	private renderClaudeError(event: ToolClaudeErrorEvent): void {
		const { prompt, error } = event.payload;

		console.log("");
		console.log(
			this.colorize(
				`${INDENT}${icons.error} CLAUDE ERROR`,
				"brightRed",
				"bold",
			),
		);
		console.log(
			this.colorize(`${INDENT}  Prompt: ${this.truncate(prompt, 100)}`, "red"),
		);
		console.log(this.colorize(`${INDENT}  Error: ${error}`, "red"));
		console.log("");
	}

	private renderClaudePlanApproval(event: ToolClaudePlanApprovalEvent): void {
		const { approved, approvalCount } = event.payload;

		if (approved) {
			console.log(
				this.colorize(
					`${INDENT}  ${icons.success} auto-approved plan (#${approvalCount})`,
					"cyan",
				),
			);
		}
	}

	// ==========================================================================
	// Tool: ClaudeSdk Rendering
	// ==========================================================================

	private renderClaudeSdkStart(event: ToolClaudeSdkStartEvent): void {
		const { label, prompt, model, outputType } = event.payload;
		const displayText = label || this.truncate(prompt, 50);

		if (this.config.verbose) {
			console.log(
				this.colorize(
					`${INDENT}${icons.brain} [sdk:${model}] ${displayText} (${outputType})`,
					"brightMagenta",
				),
			);
		} else {
			console.log(
				this.colorize(
					`${INDENT}${icons.brain} [sdk] ${displayText}`,
					"brightMagenta",
				),
			);
		}
	}

	private renderClaudeSdkComplete(event: ToolClaudeSdkCompleteEvent): void {
		const { success, duration, attempts } = event.payload;

		if (!success) {
			return;
		}

		if (this.config.verbose) {
			const attemptsStr = attempts > 1 ? `, ${attempts} attempts` : "";
			console.log(
				this.colorize(
					`${INDENT}  ${icons.success} completed (${this.formatDuration(duration)}${attemptsStr})`,
					"dim",
				),
			);
		}
	}

	private renderClaudeSdkError(event: ToolClaudeSdkErrorEvent): void {
		const { prompt, error, attempts } = event.payload;

		console.log("");
		console.log(
			this.colorize(
				`${INDENT}${icons.error} CLAUDE SDK ERROR`,
				"brightRed",
				"bold",
			),
		);
		console.log(
			this.colorize(`${INDENT}  Prompt: ${this.truncate(prompt, 100)}`, "red"),
		);
		console.log(this.colorize(`${INDENT}  Error: ${error}`, "red"));
		console.log(this.colorize(`${INDENT}  Attempts: ${attempts}`, "red"));
		console.log("");
	}

	private renderClaudeSdkRetry(event: ToolClaudeSdkRetryEvent): void {
		if (!this.config.verbose) {
			return;
		}

		const { attempt, maxAttempts, validationError } = event.payload;
		const errorMsg = validationError ? `: ${validationError}` : "";
		console.log(
			this.colorize(
				`${INDENT}  ${icons.retry} retry ${attempt}/${maxAttempts}${errorMsg}`,
				"yellow",
			),
		);
	}

	// ==========================================================================
	// Tool: AgentSession Rendering
	// ==========================================================================

	private renderAgentSessionStart(event: ToolAgentSessionStartEvent): void {
		const {
			label,
			prompt,
			model,
			hasSubagents,
			isResume,
			permissionMode,
			claudeCodeVersion,
		} = event.payload;
		const displayText = label || this.truncate(prompt, 60);
		const resumeTag = isResume ? " (resuming)" : "";
		const subagentTag = hasSubagents ? " +agents" : "";

		// Non-verbose: cleaner single line
		console.log(
			this.colorize(
				`${INDENT}${icons.robot}  ${model}${subagentTag}${resumeTag}`,
				"brightMagenta",
				"bold",
			),
		);
		console.log(this.colorize(`${INDENT}   ${displayText}`, "dim"));

		// Show additional info in verbose mode
		if (this.config.verbose) {
			if (claudeCodeVersion) {
				console.log(
					this.colorize(`${INDENT}   Claude Code v${claudeCodeVersion}`, "dim"),
				);
			}
			if (permissionMode && permissionMode !== "default") {
				console.log(
					this.colorize(
						`${INDENT}   ${icons.warning} Permission mode: ${permissionMode}`,
						"yellow",
					),
				);
			}
		}
	}

	private renderAgentSessionMessage(event: ToolAgentSessionMessageEvent): void {
		const { messageType, subtype, raw } = event.payload;

		// Render the parsed message content
		const wasRecognized = this.renderAgentMessageContent(event.payload);

		// Handle unrecognized events
		if (!wasRecognized) {
			const eventDesc = subtype ? `${messageType}:${subtype}` : messageType;
			console.log(
				this.colorize(
					`${INDENT}${icons.warning}  unrecognized event: ${eventDesc}${this.config.verbose ? "" : " (use --verbose to see raw JSON)"}`,
					"yellow",
				),
			);
		}

		// In verbose mode: always append raw JSON + empty line for readability
		if (this.config.verbose) {
			const rawJson = JSON.stringify(raw);
			console.log(this.colorize(`${INDENT}   ${rawJson}`, "dim"));
			console.log(""); // Empty line between messages
		}
	}

	/**
	 * Render the parsed content of an agent message.
	 * Returns true if the message was recognized and handled, false otherwise.
	 */
	private renderAgentMessageContent(
		payload: ToolAgentSessionMessageEvent["payload"],
	): boolean {
		const {
			messageType,
			subtype,
			content,
			toolName,
			toolInput,
			agentName,
			fileInfo,
			stopReason,
		} = payload;

		switch (messageType) {
			case "assistant":
				return this.renderAssistantMessage(subtype, content, stopReason);

			case "tool_call":
				return this.renderToolCallMessage(toolName, toolInput);

			case "tool_result":
				return this.renderToolResultMessage(fileInfo);

			case "error":
				return this.renderErrorMessage(content);

			case "system":
				return this.renderSystemMessage(subtype, agentName);

			default:
				return false;
		}
	}

	/**
	 * Render assistant message (text or thinking).
	 */
	private renderAssistantMessage(
		subtype: string | undefined,
		content: string | undefined,
		stopReason: string | undefined,
	): boolean {
		if (subtype === "thinking") {
			// Show thinking only in verbose mode
			if (this.config.verbose && content) {
				const indented = this.indentMultiline(content);
				console.log(
					this.colorize(`${INDENT}${icons.thinking}  ${indented}`, "dim"),
				);
			}
			return true; // Recognized even if not displayed
		}

		// Regular assistant text message
		if (content) {
			const indented = this.indentMultiline(content);
			console.log(
				this.colorize(`${INDENT}${icons.robot}  ${indented}`, "brightMagenta"),
			);
		}

		// Show warnings for stop reasons (always)
		if (stopReason === "max_tokens") {
			console.log(
				this.colorize(
					`${INDENT}   ${icons.warning} Output truncated (max_tokens)`,
					"yellow",
				),
			);
		} else if (stopReason === "refusal") {
			console.log(
				this.colorize(
					`${INDENT}   ${icons.warning} Model refused request`,
					"yellow",
				),
			);
		}

		return true;
	}

	/**
	 * Render tool call message.
	 */
	private renderToolCallMessage(
		toolName: string | undefined,
		toolInput: unknown,
	): boolean {
		if (!toolName) {
			return true;
		}

		// Format the tool input for display
		const inputSummary = this.formatToolInput(toolName, toolInput);

		// Display tool name with input summary
		console.log(
			this.colorize(`${INDENT}${icons.hammer}  ${toolName}`, "cyan"),
		);

		// Always show input summary if available (dimmed)
		if (inputSummary) {
			console.log(this.colorize(`${INDENT}   ${inputSummary}`, "dim"));
		}

		return true;
	}

	/**
	 * Format tool input for display based on tool type.
	 */
	private formatToolInput(toolName: string, toolInput: unknown): string {
		if (!toolInput || typeof toolInput !== "object") {
			return "";
		}

		const input = toolInput as Record<string, unknown>;

		switch (toolName) {
			case "Task": {
				// Show task description, subagent type, or prompt summary
				const parts: string[] = [];
				if (input.subagent_type) {
					parts.push(`[${input.subagent_type}]`);
				}
				if (input.description) {
					parts.push(String(input.description));
				} else if (input.prompt) {
					parts.push(this.truncate(String(input.prompt), 60));
				}
				return parts.join(" ");
			}

			case "Bash": {
				// Show command (truncated)
				if (input.command) {
					return this.truncate(String(input.command), 80);
				}
				return "";
			}

			case "Read": {
				// Show file path
				if (input.file_path) {
					const filePath = String(input.file_path);
					// Show just filename or short path
					const parts = filePath.split("/");
					if (parts.length > 3) {
						return `.../${parts.slice(-3).join("/")}`;
					}
					return filePath;
				}
				return "";
			}

			case "Write":
			case "Edit": {
				// Show file path
				if (input.file_path) {
					const filePath = String(input.file_path);
					const parts = filePath.split("/");
					if (parts.length > 3) {
						return `.../${parts.slice(-3).join("/")}`;
					}
					return filePath;
				}
				return "";
			}

			case "Glob": {
				// Show pattern
				if (input.pattern) {
					return String(input.pattern);
				}
				return "";
			}

			case "Grep": {
				// Show pattern and optional path
				const parts: string[] = [];
				if (input.pattern) {
					parts.push(`/${input.pattern}/`);
				}
				if (input.path) {
					const pathStr = String(input.path);
					const pathParts = pathStr.split("/");
					if (pathParts.length > 2) {
						parts.push(`.../${pathParts.slice(-2).join("/")}`);
					} else {
						parts.push(pathStr);
					}
				}
				return parts.join(" ");
			}

			case "WebFetch": {
				// Show URL
				if (input.url) {
					const url = String(input.url);
					// Show just domain and path
					try {
						const parsed = new URL(url);
						return `${parsed.hostname}${this.truncate(parsed.pathname, 40)}`;
					} catch {
						return this.truncate(url, 60);
					}
				}
				return "";
			}

			case "WebSearch": {
				// Show query
				if (input.query) {
					return this.truncate(String(input.query), 60);
				}
				return "";
			}

			default: {
				// For unknown tools, show a brief summary of input keys
				const keys = Object.keys(input);
				if (keys.length === 0) {
					return "";
				}
				// Show first meaningful value if simple
				const firstKey = keys[0];
				const firstValue = input[firstKey];
				if (typeof firstValue === "string" && firstValue.length < 80) {
					return this.truncate(firstValue, 60);
				}
				return "";
			}
		}
	}

	/**
	 * Render tool result message.
	 */
	private renderToolResultMessage(
		fileInfo: AgentSessionFileInfo | undefined,
	): boolean {
		if (fileInfo) {
			console.log(
				this.colorize(
					`${INDENT}   ${icons.file} ${this.formatFileInfo(fileInfo)}`,
					"dim",
				),
			);
		} else if (this.config.verbose) {
			// Show generic result only in verbose mode
			console.log(
				this.colorize(`${INDENT}   ${icons.success} result received`, "dim"),
			);
		}
		return true;
	}

	/**
	 * Render error message.
	 */
	private renderErrorMessage(content: string | undefined): boolean {
		const indented = this.indentMultiline(content ?? "unknown error");
		console.log(this.colorize(`${INDENT}${icons.error}  ${indented}`, "red"));
		return true;
	}

	/**
	 * Render system message (init, completion, subagent events).
	 */
	private renderSystemMessage(
		subtype: string | undefined,
		agentName: string | undefined,
	): boolean {
		switch (subtype) {
			case "init":
				// Show init only in verbose mode
				if (this.config.verbose) {
					console.log(
						this.colorize(`${INDENT}${icons.cog}  session initialized`, "dim"),
					);
				}
				return true;

			case "completion":
				// Show completion only in verbose mode (summary shown by complete event)
				if (this.config.verbose) {
					console.log(
						this.colorize(
							`${INDENT}${icons.success}  session completed`,
							"dim",
						),
					);
				}
				return true;

			case "subagent_start":
				if (agentName) {
					console.log(
						this.colorize(
							`${INDENT}${icons.cube}  ${icons.play} ${agentName}`,
							"cyan",
						),
					);
				}
				return true;

			case "subagent_end":
				// Show subagent end only in verbose mode
				if (this.config.verbose && agentName) {
					console.log(
						this.colorize(
							`${INDENT}${icons.cube}  ${icons.success} ${agentName}`,
							"dim",
						),
					);
				}
				return true;

			default:
				// Unknown system subtype
				return false;
		}
	}

	/**
	 * Format file info for display.
	 */
	private formatFileInfo(fileInfo: AgentSessionFileInfo): string {
		const fileName = fileInfo.filePath.split("/").pop() ?? fileInfo.filePath;
		return `${fileName} (${fileInfo.numLines} lines)`;
	}

	private renderAgentSessionComplete(
		event: ToolAgentSessionCompleteEvent,
	): void {
		const {
			success,
			duration,
			numTurns,
			costUsd,
			totalUsage,
			permissionDenials,
		} = event.payload;

		if (!success) {
			// Error will be shown by error handler
			return;
		}

		// Show permission denials warning (always visible)
		if (permissionDenials && permissionDenials.length > 0) {
			console.log(
				this.colorize(
					`${INDENT}${icons.warning}  ${permissionDenials.length} permission denied`,
					"yellow",
				),
			);
			// Show details in verbose mode
			if (this.config.verbose) {
				for (const denial of permissionDenials) {
					const reason = denial.reason ? `: ${denial.reason}` : "";
					console.log(
						this.colorize(
							`${INDENT}   - ${denial.toolName}${reason}`,
							"yellow",
						),
					);
				}
			}
		}

		// Build summary line - Claude Code CLI style
		const parts: string[] = [];

		// Duration
		parts.push(this.formatDuration(duration));

		// Turns (more meaningful than message count)
		if (numTurns !== undefined && numTurns > 0) {
			parts.push(`${numTurns} turn${numTurns > 1 ? "s" : ""}`);
		}

		// Token summary
		if (totalUsage) {
			const totalIn = totalUsage.inputTokens + totalUsage.cacheReadTokens;
			const totalOut = totalUsage.outputTokens;
			parts.push(
				`${this.formatTokens(totalIn)}↓ ${this.formatTokens(totalOut)}↑`,
			);

			// Cache efficiency
			if (totalUsage.cacheReadTokens > 0) {
				const cacheRate = Math.round(
					(totalUsage.cacheReadTokens / totalIn) * 100,
				);
				parts.push(`${cacheRate}% cached`);
			}
		}

		// Cost
		if (costUsd !== undefined && costUsd > 0) {
			parts.push(`$${costUsd.toFixed(4)}`);
		}

		console.log(
			this.colorize(`${INDENT}${icons.success}  ${parts.join(" · ")}`, "green"),
		);

		// Show detailed usage in verbose mode
		if (this.config.verbose && totalUsage) {
			this.renderUsageDetails(totalUsage);
		}
	}

	/**
	 * Format token count for display (e.g., 1.2k, 15k, 1.5M).
	 */
	private formatTokens(count: number): string {
		if (count >= 1_000_000) {
			return `${(count / 1_000_000).toFixed(1)}M`;
		}
		if (count >= 1_000) {
			return `${(count / 1_000).toFixed(1)}k`;
		}
		return count.toString();
	}

	/**
	 * Render detailed usage information.
	 */
	private renderUsageDetails(usage: AgentSessionUsage): void {
		const inTokens = usage.inputTokens + usage.cacheReadTokens;
		const outTokens = usage.outputTokens;

		let usageStr = `tokens: ${inTokens.toLocaleString()} in`;
		if (usage.cacheReadTokens > 0) {
			usageStr += ` (${usage.cacheReadTokens.toLocaleString()} cached)`;
		}
		usageStr += `, ${outTokens.toLocaleString()} out`;

		console.log(this.colorize(`${INDENT}   ${usageStr}`, "dim"));
	}

	private renderAgentSessionError(event: ToolAgentSessionErrorEvent): void {
		const { error, errorType } = event.payload;

		console.log("");
		console.log(
			this.colorize(
				`${INDENT}${icons.error}  AGENT SESSION ERROR`,
				"brightRed",
				"bold",
			),
		);
		if (errorType && errorType !== "UNKNOWN") {
			console.log(this.colorize(`${INDENT}   Type: ${errorType}`, "red"));
		}
		console.log(this.colorize(`${INDENT}   Error: ${error}`, "red"));
		console.log("");
	}

	// ==========================================================================
	// Planning Agent Session Rendering
	// ==========================================================================

	private renderPlanningPhaseStart(event: PlanningPhaseStartEvent): void {
		const { prompt, model, label, workingDirectory } = event.payload;
		const displayText = label || this.truncate(prompt, 60);

		console.log("");
		console.log(
			this.colorize(
				`${icons.plan}  PLANNING PHASE`,
				"brightCyan",
				"bold",
			),
		);
		console.log(
			this.colorize(`${INDENT}${icons.brain}  ${model}`, "brightMagenta"),
		);
		console.log(this.colorize(`${INDENT}   ${displayText}`, "dim"));

		if (this.config.verbose && workingDirectory) {
			console.log(
				this.colorize(`${INDENT}   ${icons.folder} ${workingDirectory}`, "dim"),
			);
		}
	}

	private renderPlanningPhaseComplete(
		event: PlanningPhaseCompleteEvent,
	): void {
		const { planPath, criticalFiles, duration, success, error } = event.payload;

		if (!success) {
			console.log(
				this.colorize(
					`${INDENT}${icons.error}  Planning failed: ${error}`,
					"brightRed",
				),
			);
			console.log("");
			return;
		}

		const fileName = planPath.split("/").pop() ?? planPath;

		console.log(
			this.colorize(
				`${INDENT}${icons.success}  Plan saved: ${fileName} (${this.formatDuration(duration)})`,
				"green",
			),
		);

		if (criticalFiles.length > 0) {
			console.log(
				this.colorize(
					`${INDENT}   ${icons.file} ${criticalFiles.length} critical file${criticalFiles.length > 1 ? "s" : ""} identified`,
					"dim",
				),
			);

			// Show file list in verbose mode
			if (this.config.verbose) {
				for (const file of criticalFiles.slice(0, 5)) {
					console.log(this.colorize(`${INDENT}     - ${file}`, "dim"));
				}
				if (criticalFiles.length > 5) {
					console.log(
						this.colorize(
							`${INDENT}     ... and ${criticalFiles.length - 5} more`,
							"dim",
						),
					);
				}
			}
		}

		console.log("");
	}

	private renderImplementationPhaseStart(
		event: ImplementationPhaseStartEvent,
	): void {
		const { planPath, model, workingDirectory, isResume, resumeSessionId } =
			event.payload;
		const fileName = planPath.split("/").pop() ?? planPath;
		const resumeTag = isResume ? " (resuming)" : "";

		console.log(
			this.colorize(
				`${icons.hammer}  IMPLEMENTATION PHASE${resumeTag}`,
				"brightYellow",
				"bold",
			),
		);
		console.log(
			this.colorize(`${INDENT}${icons.brain}  ${model}`, "brightMagenta"),
		);
		console.log(
			this.colorize(`${INDENT}   Plan: ${fileName}`, "dim"),
		);

		if (this.config.verbose) {
			if (workingDirectory) {
				console.log(
					this.colorize(
						`${INDENT}   ${icons.folder} ${workingDirectory}`,
						"dim",
					),
				);
			}
			if (isResume && resumeSessionId) {
				console.log(
					this.colorize(
						`${INDENT}   ${icons.retry} Resuming: ${resumeSessionId.slice(0, 8)}...`,
						"dim",
					),
				);
			}
		}
	}

	private renderImplementationPhaseComplete(
		event: ImplementationPhaseCompleteEvent,
	): void {
		const { duration, success, error, output } = event.payload;

		if (!success) {
			console.log(
				this.colorize(
					`${INDENT}${icons.error}  Implementation failed: ${error}`,
					"brightRed",
				),
			);
			console.log("");
			return;
		}

		console.log(
			this.colorize(
				`${INDENT}${icons.success}  Implementation complete (${this.formatDuration(duration)})`,
				"green",
			),
		);

		// Show output summary in verbose mode
		if (this.config.verbose && output) {
			const outputLines = output.split("\n").filter((line) => line.trim());
			if (outputLines.length > 0) {
				const preview = outputLines[0].slice(0, 80);
				console.log(
					this.colorize(
						`${INDENT}   ${preview}${outputLines[0].length > 80 ? "..." : ""}`,
						"dim",
					),
				);
			}
		}

		console.log("");
	}

	// ==========================================================================
	// Tool: Hook Rendering
	// ==========================================================================

	private renderHookStart(event: ToolHookStartEvent): void {
		const { hookName, label } = event.payload;
		const displayText = label || hookName;
		console.log(
			this.colorize(`${INDENT}${icons.plug} [hook] ${displayText}`, "cyan"),
		);
	}

	private renderHookComplete(event: ToolHookCompleteEvent): void {
		const { hookName, success, hookExists, duration } = event.payload;

		if (!hookExists) {
			if (this.config.verbose) {
				console.log(
					this.colorize(
						`${INDENT}  ${icons.skip} hook '${hookName}' not found, skipped`,
						"dim",
					),
				);
			}
			return;
		}

		if (!success) {
			return;
		}

		if (this.config.verbose) {
			console.log(
				this.colorize(
					`${INDENT}  ${icons.success} completed (${this.formatDuration(duration)})`,
					"dim",
				),
			);
		}
	}

	// ==========================================================================
	// Tool: Checklist Rendering
	// ==========================================================================

	private renderChecklistStart(event: ToolChecklistStartEvent): void {
		const { label, itemCount } = event.payload;
		const displayText = label || "checklist";
		console.log(
			this.colorize(
				`${INDENT}${icons.list} [checklist] ${displayText} (${itemCount} items)`,
				"cyan",
			),
		);
	}

	private renderChecklistComplete(event: ToolChecklistCompleteEvent): void {
		const { passed, failed, total, success, duration } = event.payload;
		const status = success ? icons.success : icons.error;
		const durationStr = this.config.verbose
			? ` (${this.formatDuration(duration)})`
			: "";

		console.log(
			this.colorize(
				`${INDENT}  ${status} ${passed}/${total} passed${durationStr}`,
				success ? "green" : "red",
			),
		);

		if (failed > 0 && this.config.verbose) {
			console.log(
				this.colorize(
					`${INDENT}  ${icons.warning} ${failed} items failed`,
					"yellow",
				),
			);
		}
	}

	private renderChecklistItemComplete(
		event: ToolChecklistItemCompleteEvent,
	): void {
		if (!this.config.verbose) {
			return;
		}

		const { itemName, passed, message } = event.payload;
		const status = passed ? icons.success : icons.error;
		const messageStr = message ? `: ${message}` : "";

		console.log(
			this.colorize(
				`${INDENT}    ${status} ${itemName}${messageStr}`,
				passed ? "green" : "red",
			),
		);
	}

	// ==========================================================================
	// Cleanup Rendering
	// ==========================================================================

	private renderCleanupStart(event: CleanupStartEvent): void {
		if (!this.config.verbose) {
			return;
		}

		const { resourceCount } = event.payload;
		console.log(
			this.colorize(
				`${INDENT}${icons.trash} [cleanup] ${resourceCount} resources`,
				"dim",
			),
		);
	}

	private renderCleanupComplete(event: CleanupCompleteEvent): void {
		if (!this.config.verbose) {
			return;
		}

		const { closedPanes, cleanedFiles, duration } = event.payload;
		console.log(
			this.colorize(
				`${INDENT}  ${icons.success} done (${closedPanes} panes, ${cleanedFiles} files) [${this.formatDuration(duration)}]`,
				"dim",
			),
		);
	}

	// ==========================================================================
	// Log & Custom Event Rendering
	// ==========================================================================

	private renderLog(event: LogEvent): void {
		const { message, level, data } = event.payload;

		// Skip debug logs unless in verbose mode
		if (level === "debug" && !this.config.verbose) {
			return;
		}

		// Choose color and icon based on level
		const levelConfig: Record<
			string,
			{ color: keyof typeof colors; icon: string }
		> = {
			debug: { color: "gray", icon: icons.debug },
			info: { color: "white", icon: icons.info },
			warn: { color: "yellow", icon: icons.warning },
			error: { color: "red", icon: icons.error },
		};

		const { color, icon } = levelConfig[level] ?? levelConfig.info;

		// Handle multiline messages - indent subsequent lines
		const indentedMessage = this.indentMultiline(message, `${INDENT}  `);

		// Format the message
		let output = `${INDENT}${icon} ${indentedMessage}`;

		// Add data if present and verbose
		if (data && this.config.verbose && Object.keys(data).length > 0) {
			const dataStr = JSON.stringify(data);
			if (dataStr.length < 100) {
				output += ` ${this.colorize(dataStr, "dim")}`;
			}
		}

		console.log(this.colorize(output, color));
	}

	private renderCustomEvent(event: CustomEvent): void {
		const { name, data } = event.payload;

		// Always show custom events (they're explicitly emitted by workflows)
		let output = `${INDENT}${icons.event} ${name}`;

		// Add key data fields
		if (data && Object.keys(data).length > 0) {
			const keys = Object.keys(data).slice(0, 3);
			const summary = keys
				.map((k) => `${k}: ${this.formatValue(data[k])}`)
				.join(", ");
			output += `: ${summary}`;
			if (Object.keys(data).length > 3) {
				output += `, ...`;
			}
		}

		console.log(this.colorize(output, "brightMagenta"));
	}

	private formatValue(value: unknown): string {
		if (typeof value === "string") {
			return value.length > 30 ? `${value.slice(0, 30)}...` : value;
		}
		if (typeof value === "number" || typeof value === "boolean") {
			return String(value);
		}
		if (Array.isArray(value)) {
			return `[${value.length}]`;
		}
		if (value && typeof value === "object") {
			return "{...}";
		}
		return String(value);
	}

	// ==========================================================================
	// Utility Rendering
	// ==========================================================================

	private renderError(context: string, error: string): void {
		console.log("");
		console.log(
			this.colorize(
				`${INDENT}${icons.error} ERROR in ${context}:`,
				"brightRed",
				"bold",
			),
		);
		console.log(this.colorize(`${INDENT}   ${error}`, "red"));
		console.log("");
	}

	private renderVerbose(event: WorkflowEvent): void {
		const timestamp = this.consoleConfig.showTimestamps
			? `[${this.formatTimestamp(event.metadata.timestamp)}] `
			: "";
		const eventId = this.consoleConfig.showEventIds
			? ` (${event.metadata.eventId.slice(0, 8)})`
			: "";

		console.log(this.colorize(`${timestamp}${event.type}${eventId}`, "dim"));
	}

	// ==========================================================================
	// Formatting Helpers
	// ==========================================================================

	private colorize(
		text: string,
		color: keyof typeof colors,
		style?: keyof typeof colors,
	): string {
		if (this.consoleConfig.noColor) {
			return text;
		}

		const colorCode = colors[color] || "";
		const styleCode = style ? colors[style] || "" : "";

		return `${styleCode}${colorCode}${text}${colors.reset}`;
	}

	private separator(style: "heavy" | "light" = "light"): string {
		const char = style === "heavy" ? "━" : "─";
		return char.repeat(this.consoleConfig.separatorWidth);
	}

	/**
	 * Indent multiline text - subsequent lines get the specified indent.
	 * @param text The text to indent
	 * @param indent The indentation string for subsequent lines (defaults to INDENT + 2 spaces for icon alignment)
	 */
	private indentMultiline(
		text: string,
		indent: string = `${INDENT}   `,
	): string {
		return text.replace(/\n/g, `\n${indent}`);
	}
}
