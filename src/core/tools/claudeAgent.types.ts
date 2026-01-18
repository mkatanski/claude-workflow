/**
 * Type definitions for Claude Agent SDK integration.
 *
 * This module provides type definitions for agent sessions, hooks, subagents,
 * and configuration options for the ClaudeAgentTool.
 */

/**
 * Model alias short names for convenience.
 */
export type ModelAlias = "sonnet" | "opus" | "haiku";

/**
 * Model specification - either an alias or a full model ID string.
 */
export type ModelSpec = ModelAlias | string;

/**
 * Built-in tools available in the Claude Agent SDK.
 */
export type BuiltInTool =
	| "Read"
	| "Write"
	| "Edit"
	| "Bash"
	| "Glob"
	| "Grep"
	| "WebFetch"
	| "WebSearch"
	| "NotebookEdit";

/**
 * Tools configuration options.
 * - Array of specific tools to allow
 * - Preset configuration (e.g., claude_code preset)
 * - Empty array to disable all tools
 */
export type ToolsConfig =
	| BuiltInTool[]
	| { type: "preset"; preset: "claude_code" }
	| never[];

/**
 * Permission mode for tool execution.
 * - default: Standard permission prompts
 * - acceptEdits: Auto-accept file edits
 * - bypassPermissions: Bypass all permission prompts (use with caution)
 */
export type PermissionMode = "default" | "acceptEdits" | "bypassPermissions";

/**
 * Definition for a specialized subagent.
 */
export interface SubagentDefinition {
	/** Human-readable description of the subagent's purpose */
	description: string;
	/** System prompt for the subagent */
	prompt: string;
	/** Tools available to the subagent */
	tools: BuiltInTool[];
	/** Model to use for the subagent */
	model: ModelSpec;
}

/**
 * Result from a PreToolUse or CanUseTool hook.
 */
export interface AgentHookResult {
	/** Behavior to apply to the tool call */
	behavior: "allow" | "deny" | "modify";
	/** Optional message explaining the decision */
	message?: string;
	/** Modified input when behavior is "modify" */
	modifiedInput?: unknown;
}

/**
 * Hook function called before a tool is used.
 * Can allow, deny, or modify the tool call.
 */
export type PreToolUseHook = (
	toolName: string,
	toolInput: unknown,
	sessionId: string,
) => Promise<AgentHookResult> | AgentHookResult;

/**
 * Hook function called after a tool is used.
 * Used for logging, auditing, or side effects.
 */
export type PostToolUseHook = (
	toolName: string,
	toolInput: unknown,
	toolResponse: unknown,
	sessionId: string,
) => Promise<void> | void;

/**
 * Function to determine if a tool can be used.
 * Similar to PreToolUseHook but without session context.
 */
export type CanUseToolFn = (
	toolName: string,
	input: unknown,
) => Promise<AgentHookResult> | AgentHookResult;

/**
 * Configuration for the Claude Agent Tool.
 */
export interface ClaudeAgentConfig {
	/** Model to use (alias or full ID) */
	model?: ModelSpec;
	/** Working directory for file operations */
	workingDirectory?: string;
	/** System prompt to prepend to conversations */
	systemPrompt?: string;
	/** Tools configuration (allowlist or preset) */
	tools?: ToolsConfig;
	/** Tools to explicitly disallow */
	disallowedTools?: BuiltInTool[];
	/** Permission mode for tool execution */
	permissionMode?: PermissionMode;
	/** Maximum budget in USD for the session */
	maxBudgetUsd?: number;
	/** Subagent definitions by name */
	agents?: Record<string, SubagentDefinition>;
	/** Hooks called before tool use */
	preToolUseHooks?: PreToolUseHook[];
	/** Hooks called after tool use */
	postToolUseHooks?: PostToolUseHook[];
	/** Function to determine if a tool can be used */
	canUseTool?: CanUseToolFn;
	/** Session ID to resume an existing session */
	resume?: string;
}

/**
 * Model alias mappings to full model IDs.
 * Updated to latest model versions.
 */
export const MODEL_ALIASES: Record<ModelAlias, string> = {
	sonnet: "claude-sonnet-4-20250514",
	opus: "claude-opus-4-20250514",
	haiku: "claude-haiku-4-20250514",
};

/**
 * Resolve a model specification to a full model ID.
 *
 * @param model - Model alias or full model ID
 * @returns Full model ID string
 */
export function resolveModel(model: ModelSpec): string {
	if (model in MODEL_ALIASES) {
		return MODEL_ALIASES[model as ModelAlias];
	}
	return model;
}

/**
 * Error types that can occur during agent session execution.
 */
export type AgentErrorType =
	| "AUTHENTICATION_FAILED"
	| "RATE_LIMIT_EXCEEDED"
	| "CONTEXT_LENGTH_EXCEEDED"
	| "PERMISSION_DENIED"
	| "BUDGET_EXCEEDED"
	| "SESSION_NOT_FOUND"
	| "UNKNOWN";

/**
 * Message types in an agent conversation.
 */
export type AgentMessageType =
	| "assistant"
	| "tool_call"
	| "tool_result"
	| "error"
	| "system";

/**
 * Subtypes for system messages.
 */
export type AgentMessageSubtype =
	| "init"
	| "completion"
	| "subagent_start"
	| "subagent_end";
