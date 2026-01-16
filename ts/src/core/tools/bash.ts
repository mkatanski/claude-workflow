/**
 * Bash tool implementation.
 */

import type { ExecutionContext } from "../context/execution.ts";
import type { TmuxManager } from "../tmux/manager.ts";
import type { StepConfig } from "../../types/index.ts";
import { LoopSignal } from "../../types/index.ts";
import type { ToolResult } from "./types.ts";
import { BaseTool, successResult, errorResult } from "./types.ts";

/**
 * Execute bash commands in subprocess or tmux pane.
 */
export class BashTool extends BaseTool {
  get name(): string {
    return "bash";
  }

  validateStep(step: StepConfig): void {
    if (!step.command) {
      throw new Error("Bash step requires 'command' field");
    }
  }

  async execute(
    step: StepConfig,
    context: ExecutionContext,
    tmuxManager: TmuxManager
  ): Promise<ToolResult> {
    const command = context.interpolate(step.command!);
    const cwd = context.interpolateOptional(step.cwd) ?? context.projectPath;
    const visible = step.visible ?? false;
    const stripOutput = step.stripOutput ?? true;

    // Build environment variables if specified
    const env = this.buildEnv(step.env, context);

    if (visible) {
      return this.executeVisible(command, cwd, tmuxManager, stripOutput, env);
    }
    return this.executeSubprocess(command, cwd, stripOutput, env);
  }

  private buildEnv(
    envConfig: Record<string, string> | undefined,
    context: ExecutionContext
  ): Record<string, string> | undefined {
    if (!envConfig) {
      return undefined;
    }

    // Start with copy of current environment
    const env: Record<string, string> = { ...process.env } as Record<string, string>;

    // Add/override with custom variables (interpolated)
    for (const [key, value] of Object.entries(envConfig)) {
      env[key] = context.interpolate(String(value));
    }

    return env;
  }

  private async executeSubprocess(
    command: string,
    cwd: string,
    stripOutput: boolean,
    env?: Record<string, string>
  ): Promise<ToolResult> {
    console.log(`Running: ${command}`);

    try {
      const proc = Bun.spawn(["sh", "-c", command], {
        cwd,
        env,
        stdout: "pipe",
        stderr: "pipe",
      });

      // Set up timeout
      const timeout = 600_000; // 10 minutes
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          proc.kill();
          reject(new Error("Command timed out after 10 minutes"));
        }, timeout);
      });

      const [stdout, stderr] = await Promise.race([
        Promise.all([
          new Response(proc.stdout).text(),
          new Response(proc.stderr).text(),
        ]),
        timeoutPromise,
      ]);

      const exitCode = await proc.exited;

      let output = stdout || "";
      if (stderr) {
        output += `\n[STDERR]\n${stderr}`;
      }

      if (stripOutput) {
        output = output.trim();
      }

      const success = exitCode === 0;

      return {
        success,
        output,
        error: success ? undefined : stderr || undefined,
        loopSignal: LoopSignal.NONE,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      return errorResult(message);
    }
  }

  private async executeVisible(
    command: string,
    cwd: string,
    tmuxManager: TmuxManager,
    stripOutput: boolean,
    env?: Record<string, string>
  ): Promise<ToolResult> {
    // For visible mode with custom env vars, wrap the command with exports
    let finalCommand = command;
    if (env) {
      const exports: string[] = [];
      for (const [key, value] of Object.entries(env)) {
        // Skip system env vars that are already set with same value
        if (process.env[key] !== value) {
          const escapedValue = value.replace(/'/g, "'\\''");
          exports.push(`export ${key}='${escapedValue}'`);
        }
      }
      if (exports.length > 0) {
        finalCommand = `${exports.join(" && ")} && ${command}`;
      }
    }

    // Launch bash pane
    await tmuxManager.launchBashPane(finalCommand, cwd);

    try {
      // Wait for completion using idle detection
      const output = await this.waitForCompletion(tmuxManager);
      const finalOutput = stripOutput ? output.trim() : output;

      return successResult(finalOutput);
    } finally {
      await tmuxManager.closePane();
    }
  }

  private async waitForCompletion(tmuxManager: TmuxManager): Promise<string> {
    const startTime = Date.now();

    // Hash-based idle detection state
    let lastHash = "";
    let lastHashChangeTime = Date.now();
    let lastHashCheckTime = 0;
    const hashCheckInterval = 2000; // Check every 2 seconds
    const idleTimeout = 10000; // 10 seconds idle = done

    while (true) {
      const currentTime = Date.now();
      const elapsed = currentTime - startTime;

      // Update display periodically
      if (elapsed % 5000 < 200) {
        console.log(`Waiting... ${Math.floor(elapsed / 1000)}s`);
      }

      // Hash-based idle detection
      if (currentTime - lastHashCheckTime >= hashCheckInterval) {
        lastHashCheckTime = currentTime;
        const currentHash = await tmuxManager.getPaneContentHash();

        if (currentHash !== lastHash) {
          // Content changed, reset timer
          lastHash = currentHash;
          lastHashChangeTime = currentTime;
        } else if (currentTime - lastHashChangeTime >= idleTimeout) {
          // No change for idle timeout, consider done
          break;
        }
      }

      await Bun.sleep(200);
    }

    // Capture final output
    return tmuxManager.capturePaneContent();
  }
}
