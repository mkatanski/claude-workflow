/**
 * Centralized path utilities for workflow operations.
 *
 * Provides functions for managing system temp directories, session directories,
 * and global configuration paths. This module consolidates path management
 * to ensure consistent directory structures across the codebase.
 */

import { existsSync, mkdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

/** Application name for directory naming */
const APP_NAME = "claude-workflow";

/**
 * Get the system temp directory for transient session data.
 * Used for plans, session artifacts, etc.
 *
 * @returns Path like /tmp/claude-workflow/ or C:\Users\...\Temp\claude-workflow\
 */
export function getSystemTempDir(): string {
	return join(tmpdir(), APP_NAME);
}

/**
 * Get directory for a specific session's temp files.
 *
 * @param sessionId - Unique session identifier
 * @returns Path like /tmp/claude-workflow/sessions/<sessionId>/
 */
export function getSessionTempDir(sessionId: string): string {
	return join(getSystemTempDir(), "sessions", sessionId);
}

/**
 * Get the plans directory within system temp.
 *
 * @returns Path like /tmp/claude-workflow/plans/
 */
export function getPlansDir(): string {
	return join(getSystemTempDir(), "plans");
}

/**
 * Get the global user config directory.
 * For persistent user-level data (not plans - those are transient).
 *
 * @returns Path like ~/.cw/
 */
export function getGlobalConfigDir(): string {
	return join(homedir(), ".cw");
}

/**
 * Get the global workflows directory.
 *
 * @returns Path like ~/.cw/workflows/
 */
export function getGlobalWorkflowsDir(): string {
	return join(getGlobalConfigDir(), "workflows");
}

/**
 * Ensure a directory exists, creating it if necessary.
 *
 * @param dir - Directory path to ensure exists
 */
export function ensureDir(dir: string): void {
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
}

/**
 * Check if a directory exists.
 *
 * @param dir - Directory path to check
 * @returns True if directory exists
 */
export function directoryExists(dir: string): boolean {
	return existsSync(dir);
}

/**
 * Get the agent artifacts directory within system temp.
 * Used for agent session outputs, logs, etc.
 *
 * @param sessionId - Optional session ID to scope the directory
 * @returns Path like /tmp/claude-workflow/agents/ or /tmp/claude-workflow/agents/<sessionId>/
 */
export function getAgentArtifactsDir(sessionId?: string): string {
	const baseDir = join(getSystemTempDir(), "agents");
	return sessionId ? join(baseDir, sessionId) : baseDir;
}
