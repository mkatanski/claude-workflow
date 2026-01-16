/**
 * Claude Code tool implementation.
 */

import type { ExecutionContext } from "../context/execution.ts";
import type { TmuxManager } from "../tmux/manager.ts";
import type { ClaudeConfig, StepConfig } from "../../types/index.ts";
import type { ToolResult } from "./types.ts";
import { BaseTool, successResult } from "./types.ts";

/**
 * Patterns that indicate Claude is waiting for plan approval.
 * These are lowercased for comparison.
 */
const PLAN_APPROVAL_PATTERNS: string[] = [
  "would you like to proceed", // Main question text
  "❯", // Selection arrow indicator
  "1. yes", // First option (yes)
];

/**
 * Execute Claude Code prompts in tmux pane.
 */
export class ClaudeTool extends BaseTool {
  private claudeConfig?: ClaudeConfig;

  constructor(claudeConfig?: ClaudeConfig) {
    super();
    this.claudeConfig = claudeConfig;
  }

  get name(): string {
    return "claude";
  }

  validateStep(step: StepConfig): void {
    if (!step.prompt) {
      throw new Error("Claude step requires 'prompt' field");
    }
  }

  async execute(
    step: StepConfig,
    context: ExecutionContext,
    tmuxManager: TmuxManager
  ): Promise<ToolResult> {
    // Use interpolate_for_claude to automatically externalize large variables
    const prompt = context.interpolateForClaude(step.prompt!);

    // Apply append_system_prompt if configured
    let finalPrompt = prompt;
    const appendPrompt = this.claudeConfig?.appendSystemPrompt;
    if (appendPrompt && typeof appendPrompt === "string") {
      const extension = context.interpolateForClaude(appendPrompt);
      finalPrompt = `${extension}\n\n${prompt}`;
    }

    // Extract step-level model override
    const modelOverride = step.model;

    // Launch Claude pane
    await tmuxManager.launchClaudePane(finalPrompt, modelOverride);

    try {
      // Wait for completion via server signal
      const output = await this.waitForCompletion(tmuxManager);

      console.log(`Claude output: ${output.slice(0, 500)}...`);

      return successResult(output);
    } finally {
      await tmuxManager.closePane();
    }
  }

  /**
   * Wait for Claude to finish via server completion signal.
   */
  private async waitForCompletion(tmuxManager: TmuxManager): Promise<string> {
    const startTime = Date.now();
    const paneId = tmuxManager.currentPane;
    const autoApprove = this.claudeConfig?.autoApprovePlan ?? true;
    let lastApprovalCheck = Date.now();
    const approvalCheckInterval = 2000; // Check every 2 seconds
    let lastUpdateTime = Date.now();
    const updateInterval = 1000; // Update display every 1 second

    if (!paneId) {
      return "";
    }

    while (true) {
      const elapsed = Date.now() - startTime;

      // Update elapsed time display periodically
      if (Date.now() - lastUpdateTime > updateInterval) {
        console.log(`Waiting for Claude... ${Math.floor(elapsed / 1000)}s`);
        lastUpdateTime = Date.now();
      }

      // Wait for completion signal (short timeout for UI updates)
      // Get server from tmuxManager (we need to access it through the manager)
      const completed = await this.checkCompletion(tmuxManager, paneId, 500);
      if (completed) {
        break;
      }

      // Check for plan approval prompt periodically
      if (autoApprove && Date.now() - lastApprovalCheck > approvalCheckInterval) {
        if (await this.checkAndApprovePlan(tmuxManager)) {
          // Give Claude time to process approval
          await Bun.sleep(1000);
        }
        lastApprovalCheck = Date.now();
      }
    }

    // Capture final output
    return tmuxManager.capturePaneContent();
  }

  /**
   * Check for completion signal from server.
   * This is a workaround since we need server access - ideally this would be refactored.
   */
  private async checkCompletion(
    tmuxManager: TmuxManager,
    _paneId: string,
    timeout: number
  ): Promise<boolean> {
    // Access the server through a method we'll add to TmuxManager
    // For now, we'll use a polling approach based on content
    // The actual implementation will use the server's waitForComplete

    // This requires the TmuxManager to expose the server or we inject it
    // For now, we'll just return false and rely on idle detection as fallback
    // The proper implementation will be done when we wire things together

    // Poll for completion - check if content has stabilized
    const content = await tmuxManager.capturePaneContent();
    const lowerContent = content.toLowerCase();

    // Check if Claude seems to have finished (basic heuristic)
    if (
      lowerContent.includes("task completed") ||
      lowerContent.includes("finished") ||
      lowerContent.endsWith(">") ||
      lowerContent.endsWith("$")
    ) {
      return true;
    }

    await Bun.sleep(timeout);
    return false;
  }

  /**
   * Check if Claude is waiting for plan approval and auto-approve if so.
   */
  private async checkAndApprovePlan(tmuxManager: TmuxManager): Promise<boolean> {
    const content = (await tmuxManager.capturePaneContent()).toLowerCase();
    if (!content) {
      return false;
    }

    if (this.isPlanApprovalPrompt(content)) {
      console.log("Auto-approving plan...");
      // Just press Enter - the default option "Yes" is already selected
      await tmuxManager.sendKeys("Enter");
      return true;
    }

    return false;
  }

  /**
   * Check if content contains plan approval prompt indicators.
   *
   * Requires at least 2 pattern matches in the last 500 characters
   * for confidence that this is actually an approval prompt.
   */
  private isPlanApprovalPrompt(content: string): boolean {
    // Check last ~500 chars for approval patterns
    const recentContent =
      content.length > 500 ? content.slice(-500) : content;
    const patternMatches = PLAN_APPROVAL_PATTERNS.filter((p) =>
      recentContent.includes(p)
    ).length;
    return patternMatches >= 2;
  }
}
