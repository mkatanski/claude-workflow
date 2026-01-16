/**
 * Tmux pane management for workflow runner.
 */

import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { ClaudeConfig, TmuxConfig } from "../../types/index.ts";
import type { ServerManager } from "../server/manager.ts";

/**
 * Maximum prompt length before raising an error.
 * macOS shell has ~262K limit, we use a conservative threshold.
 */
const MAX_PROMPT_LENGTH = 100_000;

/**
 * Maximum shell command length before externalizing prompt to file.
 * Conservative limit to avoid "Argument list too long" errors.
 */
const MAX_COMMAND_LENGTH = 50_000;

/**
 * Shell-escape a string for safe use in shell commands.
 */
function shellQuote(str: string): string {
  // Wrap in single quotes and escape any internal single quotes
  return `'${str.replace(/'/g, "'\\''")}'`;
}

/**
 * Run a shell command and capture output.
 */
async function runCommand(
  cmd: string[],
  options: { timeout?: number; cwd?: string } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(cmd, {
    cwd: options.cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  const timeout = options.timeout ?? 5000;
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Command timed out")), timeout);
  });

  try {
    const [stdout, stderr] = await Promise.race([
      Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]),
      timeoutPromise,
    ]);

    const exitCode = await proc.exited;
    return { stdout, stderr, exitCode };
  } catch (error) {
    proc.kill();
    throw error;
  }
}

/**
 * Manages tmux panes for workflow execution.
 */
export class TmuxManager {
  private tmuxConfig: TmuxConfig;
  private claudeConfig: ClaudeConfig;
  private projectPath: string;
  private server: ServerManager;
  private tempDir?: string;
  private _currentPane: string | null = null;

  constructor(
    tmuxConfig: TmuxConfig,
    claudeConfig: ClaudeConfig,
    projectPath: string,
    server: ServerManager,
    tempDir?: string
  ) {
    this.tmuxConfig = tmuxConfig;
    this.claudeConfig = claudeConfig;
    this.projectPath = projectPath;
    this.server = server;
    this.tempDir = tempDir;
  }

  get currentPane(): string | null {
    return this._currentPane;
  }

  /**
   * Check if a tmux pane still exists.
   */
  private async paneExists(paneId: string): Promise<boolean> {
    try {
      const { stdout } = await runCommand([
        "tmux",
        "list-panes",
        "-a",
        "-F",
        "#{pane_id}",
      ]);
      return stdout.split("\n").includes(paneId);
    } catch {
      return false;
    }
  }

  /**
   * Wait for a pane to be closed.
   */
  private async waitForPaneClose(
    paneId: string,
    timeout: number = 10000
  ): Promise<boolean> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      if (!(await this.paneExists(paneId))) {
        return true;
      }
      await Bun.sleep(200);
    }
    return false;
  }

  /**
   * Create a tmux pane with stderr capture for better error reporting.
   */
  private async createPaneWithErrorCapture(
    vertical: boolean,
    size: number,
    startCommand: string
  ): Promise<{ paneId: string | null; error: string | null }> {
    // Get current window ID for targeting
    const currentPane = process.env.TMUX_PANE;
    let windowId: string | undefined;

    if (currentPane) {
      const result = await runCommand([
        "tmux",
        "display-message",
        "-t",
        currentPane,
        "-p",
        "#{window_id}",
      ]);
      if (result.exitCode === 0) {
        windowId = result.stdout.trim();
      }
    } else {
      const result = await runCommand([
        "tmux",
        "display-message",
        "-p",
        "#{window_id}",
      ]);
      if (result.exitCode === 0) {
        windowId = result.stdout.trim();
      }
    }

    // Build command
    const cmd = ["tmux", "split-window"];
    if (windowId) {
      cmd.push("-t", windowId);
    }
    cmd.push(vertical ? "-h" : "-v");
    cmd.push("-l", `${size}%`, "-P", "-F", "#{pane_id}");
    cmd.push(startCommand);

    const result = await runCommand(cmd);

    if (result.exitCode === 0 && result.stdout.trim().startsWith("%")) {
      return { paneId: result.stdout.trim(), error: null };
    }

    return {
      paneId: null,
      error: result.stderr.trim() || "Unknown error",
    };
  }

  /**
   * Write prompt to a temp file and return the file reference.
   */
  private externalizePromptToFile(prompt: string): string {
    if (!this.tempDir) {
      throw new Error(
        "Cannot externalize prompt: tempDir not set. " +
          "This is required for large prompts."
      );
    }

    const promptFile = join(this.tempDir, `prompt_${randomUUID().slice(0, 8)}.md`);
    writeFileSync(promptFile, prompt);

    return `Read the prompt from @${resolve(promptFile)} and execute it.`;
  }

  /**
   * Build the Claude Code command with all options.
   */
  private buildClaudeCommand(
    prompt?: string,
    modelOverride?: string
  ): string {
    const cwd = this.claudeConfig.cwd ?? resolve(this.projectPath);

    // Start with WORKFLOW_PORT env var for hooks
    const parts = [
      `cd ${shellQuote(cwd)} && WORKFLOW_PORT=${this.server.port} claude`,
    ];

    // Add model if specified (step override takes precedence)
    const model = modelOverride ?? this.claudeConfig.model;
    if (model) {
      parts.push(`--model ${model}`);
    }

    // Add permission bypass if enabled
    if (this.claudeConfig.dangerouslySkipPermissions) {
      parts.push("--dangerously-skip-permissions");
    }

    // Add permission mode if specified
    if (this.claudeConfig.permissionMode) {
      parts.push(`--permission-mode ${this.claudeConfig.permissionMode}`);
    }

    // Add allowed tools if specified
    if (this.claudeConfig.allowedTools?.length) {
      const tools = this.claudeConfig.allowedTools.join(" ");
      parts.push(`--allowed-tools "${tools}"`);
    }

    // Add prompt as positional argument
    if (prompt) {
      const escapedPrompt = prompt.replace(/'/g, "'\\''");
      parts.push(`'${escapedPrompt}'`);
    }

    return parts.join(" ");
  }

  /**
   * Launch Claude Code in a new tmux pane with the given prompt.
   */
  async launchClaudePane(
    prompt: string,
    modelOverride?: string
  ): Promise<string> {
    // Check if prompt is too large
    if (prompt.length > MAX_PROMPT_LENGTH) {
      console.error(`Prompt too large (${prompt.length.toLocaleString()} chars)`);
      console.error(`Maximum allowed: ${MAX_PROMPT_LENGTH.toLocaleString()} chars`);
      throw new Error(
        `Prompt too large (${prompt.length.toLocaleString()} chars). ` +
          `Maximum: ${MAX_PROMPT_LENGTH.toLocaleString()} chars. ` +
          "Save large data to a file and reference it in the prompt instead."
      );
    }

    // Build command and check total length
    let cmd = this.buildClaudeCommand(prompt, modelOverride);

    // If command is too long, externalize the entire prompt to a file
    if (cmd.length > MAX_COMMAND_LENGTH) {
      console.log(
        `Command too long (${cmd.length.toLocaleString()} chars), ` +
          "externalizing prompt to file..."
      );
      const externalizedPrompt = this.externalizePromptToFile(prompt);
      cmd = this.buildClaudeCommand(externalizedPrompt, modelOverride);
    }

    const vertical = this.tmuxConfig.split === "vertical";
    const { paneId, error } = await this.createPaneWithErrorCapture(
      vertical,
      50,
      cmd
    );

    // Brief pause for pane to initialize
    await Bun.sleep(1000);

    if (!paneId) {
      console.error(`Failed to create Claude pane: ${error}`);
      throw new Error(`Failed to create tmux pane. tmux error: ${error ?? "unknown"}`);
    }

    console.log(`Claude started: ${paneId}`);

    // Register pane with server for completion tracking
    this.server.registerPane(paneId);
    this._currentPane = paneId;
    return paneId;
  }

  /**
   * Launch a bash command in a new tmux pane.
   */
  async launchBashPane(command: string, cwd?: string): Promise<string> {
    const workingDir = cwd ?? this.claudeConfig.cwd ?? resolve(this.projectPath);
    const fullCmd = `cd ${shellQuote(workingDir)} && ${command}`;

    const vertical = this.tmuxConfig.split === "vertical";
    const { paneId, error } = await this.createPaneWithErrorCapture(
      vertical,
      50,
      fullCmd
    );

    await Bun.sleep(500);

    if (!paneId) {
      throw new Error(`Failed to create bash pane: ${error}`);
    }

    console.log(`Command started: ${paneId}`);
    this._currentPane = paneId;
    return paneId;
  }

  /**
   * Send Ctrl+D (EOT) to a tmux pane.
   */
  private async sendCtrlD(paneId: string): Promise<void> {
    await runCommand(["tmux", "send-keys", "-t", paneId, "C-d"]).catch(
      () => {}
    );
  }

  /**
   * Attempt to kill a tmux pane, ignoring errors if already closed.
   */
  private async killPaneSafely(paneId: string): Promise<void> {
    try {
      await runCommand(["tmux", "kill-pane", "-t", paneId]);
    } catch {
      // Ignore errors
    }
  }

  /**
   * Close the current pane and wait for it to be fully closed.
   */
  async closePane(): Promise<void> {
    if (!this._currentPane) {
      return;
    }

    const paneToClose = this._currentPane;
    this._currentPane = null;

    try {
      // Send Ctrl+C to interrupt
      await runCommand([
        "tmux",
        "send-keys",
        "-t",
        paneToClose,
        "C-c",
      ]).catch(() => {});
      await Bun.sleep(300);

      // Send Ctrl+D twice to force exit
      await this.sendCtrlD(paneToClose);
      await Bun.sleep(200);
      await this.sendCtrlD(paneToClose);
      await Bun.sleep(300);

      // Wait for session end signal from server
      await this.server.waitForExited(paneToClose, 30_000);

      await this.killPaneSafely(paneToClose);
    } catch {
      await this.killPaneSafely(paneToClose);
    }

    if (!(await this.waitForPaneClose(paneToClose, 10000))) {
      await this.killPaneSafely(paneToClose);
      await this.waitForPaneClose(paneToClose, 5000);
    }

    // Unregister pane from server
    this.server.unregisterPane(paneToClose);
  }

  /**
   * Send keystrokes to the current tmux pane.
   */
  async sendKeys(keys: string): Promise<void> {
    if (!this._currentPane) {
      return;
    }
    try {
      await runCommand(["tmux", "send-keys", "-t", this._currentPane, keys]);
    } catch {
      // Ignore errors, non-critical operation
    }
  }

  /**
   * Get hash of current pane content.
   */
  async getPaneContentHash(): Promise<string> {
    if (!this._currentPane) {
      return "";
    }
    try {
      const content = await this.capturePaneContent();
      return createHash("md5").update(content).digest("hex");
    } catch {
      return "";
    }
  }

  /**
   * Capture the current content of the pane.
   */
  async capturePaneContent(): Promise<string> {
    if (!this._currentPane) {
      return "";
    }
    try {
      const { stdout } = await runCommand([
        "tmux",
        "capture-pane",
        "-t",
        this._currentPane,
        "-p",
        "-S",
        "-1000",
      ]);
      return stdout;
    } catch {
      return "";
    }
  }
}
