/**
 * Hook management commands - project-level installation.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

/**
 * Hook configuration structure for Claude settings.
 */
interface HookConfig {
  matcher: string;
  hooks: Array<{ type: "command"; command: string }>;
}

/**
 * Claude settings.json structure (partial).
 */
interface ClaudeSettings {
  hooks?: {
    Stop?: HookConfig[];
    SessionEnd?: HookConfig[];
    [key: string]: HookConfig[] | undefined;
  };
  [key: string]: unknown;
}

/**
 * Create stop hook command - signals task completion.
 * Includes project path for server-side routing/logging.
 */
function createStopHookCommand(projectPath: string): string {
  const escapedPath = projectPath.replace(/"/g, '\\"');
  return `PORT="\${WORKFLOW_PORT:-7432}"; PANE_ID="$(tmux display-message -p '#{pane_id}' 2>/dev/null || echo '')"; [ -n "$PANE_ID" ] && curl -s -X POST "http://127.0.0.1:$PORT/complete" -d "pane=$PANE_ID" -d "project=${escapedPath}" >/dev/null 2>&1 || true`;
}

/**
 * Create exit hook command - signals session end.
 * Includes project path for server-side routing/logging.
 */
function createExitHookCommand(projectPath: string): string {
  const escapedPath = projectPath.replace(/"/g, '\\"');
  return `PORT="\${WORKFLOW_PORT:-7432}"; PANE_ID="$(tmux display-message -p '#{pane_id}' 2>/dev/null || echo '')"; [ -n "$PANE_ID" ] && curl -s -X POST "http://127.0.0.1:$PORT/exited" -d "pane=$PANE_ID" -d "project=${escapedPath}" >/dev/null 2>&1 || true`;
}

/**
 * Get the path to the project's .claude/settings.json file.
 */
function getSettingsPath(projectPath: string): string {
  return join(resolve(projectPath), ".claude", "settings.json");
}

/**
 * Get the global hooks directory path.
 */
function getGlobalHooksDir(): string {
  return join(homedir(), ".claude", "hooks");
}

/**
 * Read the current settings from the project.
 */
function readSettings(projectPath: string): ClaudeSettings {
  const settingsPath = getSettingsPath(projectPath);

  if (!existsSync(settingsPath)) {
    return {};
  }

  try {
    const content = readFileSync(settingsPath, "utf-8");
    return JSON.parse(content) as ClaudeSettings;
  } catch {
    return {};
  }
}

/**
 * Write settings to the project.
 */
function writeSettings(projectPath: string, settings: ClaudeSettings): void {
  const settingsPath = getSettingsPath(projectPath);
  const claudeDir = join(resolve(projectPath), ".claude");

  // Ensure .claude directory exists
  if (!existsSync(claudeDir)) {
    mkdirSync(claudeDir, { recursive: true });
  }

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
}

/**
 * Create the workflow hooks configuration.
 * @param projectPath - Absolute path to the project, embedded in hook commands
 */
function createHooksConfig(projectPath: string): ClaudeSettings["hooks"] {
  return {
    Stop: [
      {
        matcher: "",
        hooks: [{ type: "command", command: createStopHookCommand(projectPath) }],
      },
    ],
    SessionEnd: [
      {
        matcher: "",
        hooks: [{ type: "command", command: createExitHookCommand(projectPath) }],
      },
    ],
  };
}

/**
 * Check if hooks are already installed in settings.
 */
function hooksExistInSettings(settings: ClaudeSettings): boolean {
  const hooks = settings.hooks;
  if (!hooks) return false;

  const hasStopHook = hooks.Stop?.some((h) =>
    h.hooks?.some((hook) => hook.command?.includes("WORKFLOW_PORT"))
  );
  const hasSessionEndHook = hooks.SessionEnd?.some((h) =>
    h.hooks?.some((hook) => hook.command?.includes("WORKFLOW_PORT"))
  );

  return Boolean(hasStopHook && hasSessionEndHook);
}

/**
 * Install workflow hooks to project settings.
 */
export function installHooks(projectPath: string): void {
  const absolutePath = resolve(projectPath);
  const settingsPath = getSettingsPath(absolutePath);

  // Read existing settings
  const settings = readSettings(absolutePath);

  // Check if already installed
  if (hooksExistInSettings(settings)) {
    console.log("Hooks are already installed in this project.");
    console.log(`Settings: ${settingsPath}`);
    return;
  }

  // Merge hooks with existing settings
  const newHooks = createHooksConfig(absolutePath);

  if (!settings.hooks) {
    settings.hooks = newHooks;
  } else {
    // Merge Stop hooks
    if (!settings.hooks.Stop) {
      settings.hooks.Stop = newHooks!.Stop;
    } else {
      settings.hooks.Stop = [...settings.hooks.Stop, ...newHooks!.Stop!];
    }

    // Merge SessionEnd hooks
    if (!settings.hooks.SessionEnd) {
      settings.hooks.SessionEnd = newHooks!.SessionEnd;
    } else {
      settings.hooks.SessionEnd = [...settings.hooks.SessionEnd, ...newHooks!.SessionEnd!];
    }
  }

  // Write updated settings
  writeSettings(absolutePath, settings);

  console.log(`Installed hooks to: ${settingsPath}`);
  console.log("These hooks will signal task completion to the workflow runner.");
}

/**
 * Check if hooks are installed in project (with console output).
 */
export function checkHooks(projectPath: string): boolean {
  const absolutePath = resolve(projectPath);
  const settingsPath = getSettingsPath(absolutePath);
  const settings = readSettings(absolutePath);

  if (hooksExistInSettings(settings)) {
    console.log("Hooks are installed:");
    console.log(`  ${settingsPath}`);
    return true;
  }

  console.log("Hooks are not installed.");
  console.log(`\nRun 'claude-workflow hooks install ${projectPath}' to install hooks.`);
  return false;
}

/**
 * Check if hooks are installed in project (without console output).
 * Used by runner for detection.
 */
export function checkHooksQuiet(projectPath: string): boolean {
  const settings = readSettings(resolve(projectPath));
  return hooksExistInSettings(settings);
}

/**
 * Uninstall workflow hooks from project settings.
 */
export function uninstallHooks(projectPath: string): void {
  const absolutePath = resolve(projectPath);
  const settingsPath = getSettingsPath(absolutePath);
  const settings = readSettings(absolutePath);

  if (!settings.hooks) {
    console.log("No hooks found in project settings.");
    return;
  }

  // Remove workflow hooks from Stop
  if (settings.hooks.Stop) {
    settings.hooks.Stop = settings.hooks.Stop.filter(
      (h) => !h.hooks?.some((hook) => hook.command?.includes("WORKFLOW_PORT"))
    );
    if (settings.hooks.Stop.length === 0) {
      delete settings.hooks.Stop;
    }
  }

  // Remove workflow hooks from SessionEnd
  if (settings.hooks.SessionEnd) {
    settings.hooks.SessionEnd = settings.hooks.SessionEnd.filter(
      (h) => !h.hooks?.some((hook) => hook.command?.includes("WORKFLOW_PORT"))
    );
    if (settings.hooks.SessionEnd.length === 0) {
      delete settings.hooks.SessionEnd;
    }
  }

  // Remove hooks object if empty
  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  // Write updated settings
  writeSettings(absolutePath, settings);

  console.log(`Removed workflow hooks from: ${settingsPath}`);
}

/**
 * Check if legacy global hooks exist.
 */
export function hasGlobalHooks(): boolean {
  const hooksDir = getGlobalHooksDir();
  const stopHookPath = join(hooksDir, "Stop");
  const exitHookPath = join(hooksDir, "SessionEnd");

  return existsSync(stopHookPath) || existsSync(exitHookPath);
}

/**
 * Remove legacy global hooks from ~/.claude/hooks/.
 */
export function cleanupGlobalHooks(): void {
  const hooksDir = getGlobalHooksDir();
  const stopHookPath = join(hooksDir, "Stop");
  const exitHookPath = join(hooksDir, "SessionEnd");

  let removed = false;

  if (existsSync(stopHookPath)) {
    unlinkSync(stopHookPath);
    console.log(`Removed: ${stopHookPath}`);
    removed = true;
  }

  if (existsSync(exitHookPath)) {
    unlinkSync(exitHookPath);
    console.log(`Removed: ${exitHookPath}`);
    removed = true;
  }

  // Try to remove hooks directory if empty
  if (existsSync(hooksDir)) {
    try {
      rmSync(hooksDir, { recursive: false });
      console.log(`Removed empty directory: ${hooksDir}`);
    } catch {
      // Directory not empty or other error, ignore
    }
  }

  if (removed) {
    console.log("\nLegacy global hooks removed.");
  } else {
    console.log("No legacy global hooks found.");
  }
}
