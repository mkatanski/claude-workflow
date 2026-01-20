/**
 * Claude Agent SDK tool for multi-turn agentic sessions.
 *
 * This tool wraps the Claude Agent SDK's `query` function to enable
 * autonomous agent sessions with built-in tools, subagent support,
 * session resume capability, and comprehensive hook systems.
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import type { ExecutionContext } from "../context/execution.ts";
import type { TmuxManager } from "../tmux/manager.ts";
import type { StepConfig } from "../../types/index.ts";
import { LoopSignal } from "../../types/index.ts";
import type { ToolResult } from "./types.ts";
import { BaseTool, errorResult } from "./types.ts";
import {
	type ClaudeAgentConfig,
	type AgentMessageType,
	type AgentMessageSubtype,
	type AgentErrorType,
	type BuiltInTool,
	type PermissionMode,
	type SubagentDefinition,
	type PreToolUseHook,
	type PostToolUseHook,
	resolveModel,
} from "./claudeAgent.types.ts";

/**
 * Subtype for assistant messages to distinguish content types.
 */
export type AssistantMessageSubtype = "text" | "thinking" | "tool_use";

/**
 * Message from an agent session conversation.
 */
export interface AgentMessage {
	/** Type of the message */
	type: AgentMessageType;
	/** Subtype for more specific categorization */
	subtype?: AgentMessageSubtype | AssistantMessageSubtype;
	/** Text content (for assistant/error messages) */
	content?: string;
	/** Tool name (for tool_call/tool_result) */
	toolName?: string;
	/** Tool input parameters */
	toolInput?: unknown;
	/** Tool execution result */
	toolResult?: unknown;
	/** Error message */
	error?: string;
	/** Session ID for tracking */
	sessionId?: string;
	/** Agent name for subagent messages */
	agentName?: string;
	/** Raw SDK message for debugging - always present */
	raw: unknown;
}

/**
 * Result of an agent session execution.
 */
export interface AgentSessionResult {
	/** Whether the session completed successfully */
	success: boolean;
	/** Final output text from the session */
	output: string;
	/** All messages from the session */
	messages: AgentMessage[];
	/** Session ID for resume capability */
	sessionId?: string;
	/** Duration of the session in milliseconds */
	duration: number;
	/** Error message if session failed */
	error?: string;
	/** Error type category */
	errorType?: AgentErrorType;
}

/**
 * Callback for streaming messages during agent session.
 */
export type AgentMessageCallback = (message: AgentMessage) => void;

// Re-export types that are used by tools.ts
export type { AgentMessageType, AgentMessageSubtype, AgentErrorType } from "./claudeAgent.types.ts";

/**
 * Options for executing an agent session.
 */
export interface AgentSessionOptions {
	/** Model to use (alias or full ID) */
	model?: string;
	/** Tools to allow */
	tools?: BuiltInTool[];
	/** Tools to disallow */
	disallowedTools?: BuiltInTool[];
	/** System prompt to use */
	systemPrompt?: string;
	/** Permission mode for tool execution */
	permissionMode?: PermissionMode;
	/** Working directory for file operations */
	workingDirectory?: string;
	/** Subagent definitions */
	agents?: Record<string, SubagentDefinition>;
	/** Maximum budget in USD */
	maxBudgetUsd?: number;
	/** Session ID to resume */
	resume?: string;
	/** Label for observability */
	label?: string;
	/** Pre tool use hooks */
	preToolUseHooks?: PreToolUseHook[];
	/** Post tool use hooks */
	postToolUseHooks?: PostToolUseHook[];
	/** Callback for streaming messages in real-time */
	onMessage?: AgentMessageCallback;
}

/**
 * Tool for multi-turn agentic sessions using Claude Agent SDK.
 */
export class ClaudeAgentTool extends BaseTool {
	private config?: ClaudeAgentConfig;

	constructor(config?: ClaudeAgentConfig) {
		super();
		this.config = config;
	}

	get name(): string {
		return "claude_agent";
	}

	validateStep(step: StepConfig): void {
		if (!step.prompt) {
			throw new Error("claude_agent tool requires 'prompt' field");
		}
	}

	/**
	 * Execute the tool as part of a workflow step.
	 * This implements the BaseTool interface for legacy workflow compatibility.
	 */
	async execute(
		step: StepConfig,
		context: ExecutionContext,
		_tmuxManager: TmuxManager,
	): Promise<ToolResult> {
		try {
			// Interpolate prompt with context variables
			const prompt = context.interpolateForClaude(step.prompt!);

			// Execute the agent session
			const result = await this.executeSession(prompt, {
				model: step.model,
				systemPrompt: step.systemPrompt,
			});

			if (result.success) {
				return {
					success: true,
					output: result.output,
					loopSignal: LoopSignal.NONE,
				};
			}

			return errorResult(result.error ?? "Agent session failed");
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return errorResult(message);
		}
	}

	/**
	 * Execute a standalone agent session.
	 * This is the primary method for using the agent tool programmatically.
	 */
	async executeSession(
		prompt: string,
		options?: AgentSessionOptions,
	): Promise<AgentSessionResult> {
		const startTime = Date.now();
		const messages: AgentMessage[] = [];
		let sessionId: string | undefined;
		let finalOutput = "";

		try {
			// Validate prompt
			if (!prompt.trim()) {
				return {
					success: false,
					output: "",
					messages: [],
					duration: Date.now() - startTime,
					error: "Empty prompt provided",
					errorType: "UNKNOWN",
				};
			}

			// Resolve model
			const modelSpec = options?.model ?? this.config?.model ?? "sonnet";
			const model = resolveModel(modelSpec);

			// Build hooks configuration
			const hooks = this.buildHooks(options);

			// Build agents configuration
			const agents = this.buildAgents(options);

			// Create the query with SDK
			const queryResult = query({
				prompt,
				options: {
					model,
					cwd: options?.workingDirectory ?? this.config?.workingDirectory,
					systemPrompt: options?.systemPrompt ?? this.config?.systemPrompt,
					allowedTools:
						options?.tools ?? (this.config?.tools as string[] | undefined),
					disallowedTools:
						options?.disallowedTools ?? this.config?.disallowedTools,
					permissionMode:
						options?.permissionMode ?? this.config?.permissionMode,
					maxBudgetUsd: options?.maxBudgetUsd ?? this.config?.maxBudgetUsd,
					resume: options?.resume ?? this.config?.resume,
					agents,
					hooks,
					// Load CLAUDE.md project files
					settingSources: ["project"],
				},
			});

			// Iterate through all messages from the AsyncGenerator
			for await (const sdkMessage of queryResult) {
				const agentMessages = this.convertMessage(sdkMessage);

				for (const agentMessage of agentMessages) {
					messages.push(agentMessage);

					// Track session ID
					if (agentMessage.sessionId && !sessionId) {
						sessionId = agentMessage.sessionId;
					}

					// Call streaming callback if provided
					if (options?.onMessage) {
						options.onMessage(agentMessage);
					}
				}

				// Handle result message (final message in session)
				if (sdkMessage.type === "result") {
					sessionId = sdkMessage.session_id;

					if (sdkMessage.subtype === "success") {
						finalOutput = sdkMessage.result;
					} else {
						// Error result
						const errorType = this.categorizeError(
							sdkMessage.subtype,
							sdkMessage.errors,
						);
						return {
							success: false,
							output: "",
							messages,
							sessionId,
							duration: Date.now() - startTime,
							error: sdkMessage.errors?.join("; ") ?? "Session failed",
							errorType,
						};
					}
				}
			}

			return {
				success: true,
				output: finalOutput,
				messages,
				sessionId,
				duration: Date.now() - startTime,
			};
		} catch (error) {
			const { message, errorType } = this.parseError(error);

			return {
				success: false,
				output: "",
				messages,
				sessionId,
				duration: Date.now() - startTime,
				error: message,
				errorType,
			};
		}
	}

	/**
	 * Convert an SDK message to our AgentMessage format.
	 * Returns an array since one SDK message might produce multiple agent messages.
	 * Each message includes the raw SDK message for debugging.
	 */
	private convertMessage(sdkMessage: unknown): AgentMessage[] {
		const msg = sdkMessage as Record<string, unknown>;
		const type = msg.type as string;
		const sessionId = msg.session_id as string | undefined;
		const messages: AgentMessage[] = [];

		switch (type) {
			case "assistant": {
				// Extract content from assistant message
				const apiMessage = msg.message as Record<string, unknown> | undefined;
				const content = apiMessage?.content as unknown[] | undefined;

				if (Array.isArray(content)) {
					for (const block of content) {
						if (typeof block !== "object" || block === null) continue;

						const blockObj = block as Record<string, unknown>;
						const blockType = blockObj.type as string;

						// Handle text blocks
						if (blockType === "text") {
							const text = blockObj.text as string;
							if (text) {
								messages.push({
									type: "assistant",
									subtype: "text",
									content: text,
									sessionId,
									raw: sdkMessage,
								});
							}
						}

						// Handle thinking blocks
						if (blockType === "thinking") {
							const thinking = blockObj.thinking as string;
							if (thinking) {
								messages.push({
									type: "assistant",
									subtype: "thinking",
									content: thinking,
									sessionId,
									raw: sdkMessage,
								});
							}
						}

						// Handle tool_use blocks
						if (blockType === "tool_use") {
							messages.push({
								type: "tool_call",
								subtype: "tool_use",
								toolName: blockObj.name as string,
								toolInput: blockObj.input,
								sessionId,
								raw: sdkMessage,
							});
						}
					}
				}
				break;
			}

			case "user": {
				// Check if this is a tool result message
				const apiMessage = msg.message as Record<string, unknown> | undefined;
				const content = apiMessage?.content as unknown[] | undefined;

				if (Array.isArray(content)) {
					for (const block of content) {
						if (typeof block !== "object" || block === null) continue;

						const blockObj = block as Record<string, unknown>;
						const blockType = blockObj.type as string;

						// Handle tool_result blocks
						if (blockType === "tool_result") {
							const toolResult = blockObj.content as string | undefined;
							const toolUseId = blockObj.tool_use_id as string | undefined;
							const isError = blockObj.is_error as boolean | undefined;

							messages.push({
								type: "tool_result",
								toolResult: toolResult,
								toolName: toolUseId, // Use tool_use_id as identifier
								sessionId,
								error: isError ? toolResult : undefined,
								raw: sdkMessage,
							});
						}
					}
				}
				break;
			}

			case "system": {
				const subtype = msg.subtype as string | undefined;

				if (subtype === "init") {
					messages.push({
						type: "system",
						subtype: "init",
						sessionId,
						content: `Session initialized with model: ${msg.model as string}`,
						raw: sdkMessage,
					});
				} else if (subtype === "subagent_start") {
					const agentName = msg.agent_name as string | undefined;
					messages.push({
						type: "system",
						subtype: "subagent_start",
						sessionId,
						agentName,
						content: `Starting subagent: ${agentName}`,
						raw: sdkMessage,
					});
				} else if (subtype === "subagent_end") {
					const agentName = msg.agent_name as string | undefined;
					messages.push({
						type: "system",
						subtype: "subagent_end",
						sessionId,
						agentName,
						content: `Subagent completed: ${agentName}`,
						raw: sdkMessage,
					});
				} else {
					// Unknown system subtype - still capture it
					messages.push({
						type: "system",
						subtype: subtype as AgentMessageSubtype,
						sessionId,
						raw: sdkMessage,
					});
				}
				break;
			}

			case "result": {
				const subtype = msg.subtype as string | undefined;

				if (subtype === "success") {
					messages.push({
						type: "system",
						subtype: "completion",
						sessionId,
						content: msg.result as string,
						raw: sdkMessage,
					});
				} else {
					// Error result
					const errors = msg.errors as string[] | undefined;
					messages.push({
						type: "error",
						error: errors?.join("; ") ?? "Unknown error",
						sessionId,
						raw: sdkMessage,
					});
				}
				break;
			}

			default:
				// Unknown message type - still capture it with raw data
				messages.push({
					type: "system",
					content: `Unknown message type: ${type}`,
					sessionId,
					raw: sdkMessage,
				});
				break;
		}

		return messages;
	}

	/**
	 * Build hooks configuration from options.
	 */
	private buildHooks(
		options?: AgentSessionOptions,
	):
		| Record<
				string,
				Array<{
					hooks: Array<
						(
							input: unknown,
							toolUseId: string | undefined,
							opts: { signal: AbortSignal },
						) => Promise<unknown>
					>;
				}>
		  >
		| undefined {
		const preHooks = options?.preToolUseHooks ?? this.config?.preToolUseHooks;
		const postHooks =
			options?.postToolUseHooks ?? this.config?.postToolUseHooks;

		if (!preHooks?.length && !postHooks?.length) {
			return undefined;
		}

		const hooks: Record<
			string,
			Array<{
				hooks: Array<
					(
						input: unknown,
						toolUseId: string | undefined,
						opts: { signal: AbortSignal },
					) => Promise<unknown>
				>;
			}>
		> = {};

		if (preHooks?.length) {
			hooks.PreToolUse = [
				{
					hooks: preHooks.map(
						(hook) =>
							async (
								input: unknown,
								_toolUseId: string | undefined,
								_opts: { signal: AbortSignal },
							) => {
								const hookInput = input as {
									session_id: string;
									tool_name: string;
									tool_input: unknown;
								};
								const result = await hook(
									hookInput.tool_name,
									hookInput.tool_input,
									hookInput.session_id,
								);

								// Convert our hook result to SDK format
								if (result.behavior === "deny") {
									return {
										hookSpecificOutput: {
											hookEventName: "PreToolUse",
											permissionDecision: "deny",
											permissionDecisionReason: result.message,
										},
									};
								}

								if (result.behavior === "modify" && result.modifiedInput) {
									return {
										hookSpecificOutput: {
											hookEventName: "PreToolUse",
											permissionDecision: "allow",
											updatedInput: result.modifiedInput,
										},
									};
								}

								return {
									hookSpecificOutput: {
										hookEventName: "PreToolUse",
										permissionDecision: "allow",
									},
								};
							},
					),
				},
			];
		}

		if (postHooks?.length) {
			hooks.PostToolUse = [
				{
					hooks: postHooks.map(
						(hook) =>
							async (
								input: unknown,
								_toolUseId: string | undefined,
								_opts: { signal: AbortSignal },
							) => {
								const hookInput = input as {
									session_id: string;
									tool_name: string;
									tool_input: unknown;
									tool_response: unknown;
								};
								await hook(
									hookInput.tool_name,
									hookInput.tool_input,
									hookInput.tool_response,
									hookInput.session_id,
								);

								return {};
							},
					),
				},
			];
		}

		return hooks;
	}

	/**
	 * Build agents configuration from options.
	 */
	private buildAgents(
		options?: AgentSessionOptions,
	):
		| Record<
				string,
				{
					description: string;
					tools?: string[];
					prompt: string;
					model?: "sonnet" | "opus" | "haiku" | "inherit";
				}
		  >
		| undefined {
		const agents = options?.agents ?? this.config?.agents;

		if (!agents) {
			return undefined;
		}

		const result: Record<
			string,
			{
				description: string;
				tools?: string[];
				prompt: string;
				model?: "sonnet" | "opus" | "haiku" | "inherit";
			}
		> = {};

		for (const [name, definition] of Object.entries(agents)) {
			// Pass model alias directly to SDK - it expects short names like 'sonnet', 'opus', 'haiku', or 'inherit'
			const modelAlias = this.normalizeModelAlias(definition.model);
			result[name] = {
				description: definition.description,
				prompt: definition.prompt,
				tools: definition.tools,
				model: modelAlias,
			};
		}

		return result;
	}

	/**
	 * Normalize model spec to SDK-compatible alias.
	 * SDK expects 'sonnet' | 'opus' | 'haiku' | 'inherit'.
	 */
	private normalizeModelAlias(
		model: string | undefined,
	): "sonnet" | "opus" | "haiku" | "inherit" | undefined {
		if (!model) return undefined;

		// Check if it's already a valid alias
		const validAliases = ["sonnet", "opus", "haiku", "inherit"] as const;
		if (validAliases.includes(model as (typeof validAliases)[number])) {
			return model as "sonnet" | "opus" | "haiku" | "inherit";
		}

		// Map full model IDs back to aliases
		if (model.includes("sonnet")) return "sonnet";
		if (model.includes("opus")) return "opus";
		if (model.includes("haiku")) return "haiku";

		// Default to inherit for unknown models
		return "inherit";
	}

	/**
	 * Categorize an error result subtype to our error type.
	 */
	private categorizeError(subtype: string, errors?: string[]): AgentErrorType {
		switch (subtype) {
			case "error_max_budget_usd":
				return "BUDGET_EXCEEDED";
			case "error_max_turns":
				return "CONTEXT_LENGTH_EXCEEDED";
			default: {
				// Check error messages for specific types
				const errorText = errors?.join(" ").toLowerCase() ?? "";

				if (
					errorText.includes("authentication") ||
					errorText.includes("api key") ||
					errorText.includes("unauthorized")
				) {
					return "AUTHENTICATION_FAILED";
				}

				if (
					errorText.includes("rate limit") ||
					errorText.includes("too many requests")
				) {
					return "RATE_LIMIT_EXCEEDED";
				}

				if (
					errorText.includes("permission") ||
					errorText.includes("denied") ||
					errorText.includes("forbidden")
				) {
					return "PERMISSION_DENIED";
				}

				if (
					errorText.includes("context") ||
					errorText.includes("token limit")
				) {
					return "CONTEXT_LENGTH_EXCEEDED";
				}

				return "UNKNOWN";
			}
		}
	}

	/**
	 * Parse an error and extract message and type.
	 */
	private parseError(error: unknown): {
		message: string;
		errorType: AgentErrorType;
	} {
		const message = error instanceof Error ? error.message : String(error);
		const lowerMessage = message.toLowerCase();

		if (
			lowerMessage.includes("authentication") ||
			lowerMessage.includes("api key") ||
			lowerMessage.includes("unauthorized")
		) {
			return { message, errorType: "AUTHENTICATION_FAILED" };
		}

		if (
			lowerMessage.includes("rate limit") ||
			lowerMessage.includes("too many requests")
		) {
			return { message, errorType: "RATE_LIMIT_EXCEEDED" };
		}

		if (
			lowerMessage.includes("context") ||
			lowerMessage.includes("token limit")
		) {
			return { message, errorType: "CONTEXT_LENGTH_EXCEEDED" };
		}

		if (
			lowerMessage.includes("permission") ||
			lowerMessage.includes("denied") ||
			lowerMessage.includes("forbidden")
		) {
			return { message, errorType: "PERMISSION_DENIED" };
		}

		if (lowerMessage.includes("session not found")) {
			return { message, errorType: "SESSION_NOT_FOUND" };
		}

		if (lowerMessage.includes("budget")) {
			return { message, errorType: "BUDGET_EXCEEDED" };
		}

		return { message, errorType: "UNKNOWN" };
	}
}
