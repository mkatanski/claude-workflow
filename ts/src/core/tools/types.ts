/**
 * Base tool types and interfaces.
 */

import type { ExecutionContext } from "../context/execution.ts";
import type { TmuxManager } from "../tmux/manager.ts";
import type { LoopSignal, StepConfig } from "../../types/index.ts";

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
 * Create a successful tool result.
 */
export function successResult(output?: string): ToolResult {
  return {
    success: true,
    output,
    loopSignal: "none" as unknown as LoopSignal,
  };
}

/**
 * Create an error tool result.
 */
export function errorResult(error: string): ToolResult {
  return {
    success: false,
    error,
    loopSignal: "none" as unknown as LoopSignal,
  };
}

/**
 * Abstract base class for all workflow tools.
 */
export abstract class BaseTool {
  /**
   * Tool identifier used in workflow (e.g., 'bash', 'claude').
   */
  abstract get name(): string;

  /**
   * Validate step configuration.
   */
  abstract validateStep(step: StepConfig): void;

  /**
   * Execute the tool with given step config and context.
   */
  abstract execute(
    step: StepConfig,
    context: ExecutionContext,
    tmuxManager: TmuxManager
  ): Promise<ToolResult>;
}
