/**
 * Core types for the workflow runner.
 */

/**
 * Signal for loop control flow.
 */
export enum LoopSignal {
  NONE = "none",
  BREAK = "break",
  CONTINUE = "continue",
}

/**
 * Result of tool execution.
 */
export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
  gotoStep?: string;
  loopSignal: LoopSignal;
}

/**
 * Result of condition evaluation.
 */
export interface ConditionResult {
  satisfied: boolean;
  reason: string;
}

/**
 * Claude Code configuration.
 */
export interface ClaudeConfig {
  interactive?: boolean;
  cwd?: string;
  model?: string;
  dangerouslySkipPermissions?: boolean;
  permissionMode?: string;
  allowedTools?: string[];
  autoApprovePlan?: boolean;
  appendSystemPrompt?: string;
}

/**
 * Tmux configuration.
 */
export interface TmuxConfig {
  newWindow?: boolean;
  split?: "vertical" | "horizontal";
  idleTime?: number;
}

/**
 * Claude SDK configuration.
 */
export interface ClaudeSdkConfig {
  systemPrompt?: string;
  model?: string;
}

/**
 * Error handling configuration.
 */
export interface OnErrorConfig {
  captureContext?: boolean;
  saveTo?: string;
}

/**
 * Step configuration for workflow steps.
 */
export interface StepConfig {
  name: string;
  tool: string;
  outputVar?: string;
  onError?: "stop" | "continue";
  visible?: boolean;
  cwd?: string;
  when?: string;

  // Claude tool
  prompt?: string;
  model?: string;

  // Bash tool
  command?: string;
  stripOutput?: boolean;
  env?: Record<string, string>;

  // Claude SDK tool
  systemPrompt?: string;
  outputType?: string;
  schema?: Record<string, unknown>;
  maxRetries?: number;
  timeout?: number;

  // Loop tools
  source?: string;
  itemVar?: string;
  indexVar?: string;
  steps?: StepConfig[];
  foreachFilter?: string;
  orderBy?: string;
  breakWhen?: string;

  // Control flow
  target?: string;
  condition?: string;
  maxAttempts?: number;

  // JSON tool
  action?: string;
  input?: string;
  query?: string;
  path?: string;
  newValue?: string;
}

/**
 * Workflow configuration.
 */
export interface WorkflowConfig {
  type: "claude-workflow";
  version: number;
  name: string;
  vars?: Record<string, unknown>;
  tmux?: TmuxConfig;
  claude?: ClaudeConfig;
  claudeSdk?: ClaudeSdkConfig;
  onError?: OnErrorConfig;
  steps: StepConfig[];
}

/**
 * Builder types for fluent API.
 */
export type StepDefinition = StepConfig | LoopDefinition;

export interface LoopDefinition {
  type: "forEach" | "while" | "range" | "retry";
  config: Record<string, unknown>;
  steps: StepDefinition[];
}

/**
 * Workflow builder interface for fluent API.
 */
export interface WorkflowBuilder {
  step(
    name: string,
    tool: ToolDefinition,
    options?: StepOptions
  ): StepDefinition;

  bash(command: string): ToolDefinition;
  claude(prompt: string): ToolDefinition;
  claudeSdk(config: ClaudeSdkToolConfig): ToolDefinition;
  json(action: string, config: JsonToolConfig): ToolDefinition;
  data(content: string, format: string): ToolDefinition;
  checklist(items: ChecklistItem[]): ToolDefinition;
  linear(action: string, config: LinearToolConfig): ToolDefinition;

  forEach(
    source: string,
    itemVar: string,
    steps: StepDefinition[]
  ): LoopDefinition;
  while(condition: string, steps: StepDefinition[]): LoopDefinition;
  range(from: number, to: number, steps: StepDefinition[]): LoopDefinition;
  retry(config: RetryConfig, steps: StepDefinition[]): LoopDefinition;
}

export interface ToolDefinition {
  tool: string;
  config: Record<string, unknown>;
}

export interface StepOptions {
  output?: string;
  when?: string;
  onError?: "stop" | "continue";
  visible?: boolean;
  cwd?: string;
  model?: string;
}

export interface ClaudeSdkToolConfig {
  prompt: string;
  schema?: Record<string, unknown>;
  systemPrompt?: string;
  model?: string;
  maxRetries?: number;
  timeout?: number;
}

export interface JsonToolConfig {
  input?: string;
  query?: string;
  path?: string;
  value?: string;
}

export interface ChecklistItem {
  name: string;
  command: string;
  expectedPattern?: string;
}

export interface LinearToolConfig {
  team?: string;
  project?: string;
  issueId?: string;
  title?: string;
  priority?: number;
  labels?: string[];
}

export interface RetryConfig {
  maxAttempts: number;
  until?: string;
  backoff?: number;
}

/**
 * Workflow definition from a .workflow.ts file.
 */
export interface WorkflowDefinition {
  name: string;
  vars?: Record<string, unknown>;
  claude?: ClaudeConfig;
  claudeSdk?: ClaudeSdkConfig;
  tmux?: TmuxConfig;
  onError?: OnErrorConfig;
  steps: StepDefinition[];
}

/**
 * Exported function signature for workflow files.
 */
export type WorkflowFactory = (t: WorkflowBuilder) => WorkflowDefinition;
