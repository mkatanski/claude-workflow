/**
 * Checkpoint storage for workflow persistence.
 *
 * This module provides disk-based persistence for workflow checkpoints,
 * enabling resume capability after Ctrl+C interrupts or failures.
 *
 * Storage location: {projectPath}/.cw/checkpoints/
 */

import {
	existsSync,
	mkdirSync,
	readdirSync,
	unlinkSync,
	writeFileSync,
	readFileSync,
} from "node:fs";
import { join } from "node:path";

/**
 * Checkpoint data persisted to disk for Ctrl+C resume.
 */
export interface PersistedCheckpoint {
	/** Unique identifier for this workflow execution */
	threadId: string;
	/** Name of the workflow being executed */
	workflowName: string;
	/** Current workflow variables at checkpoint time */
	variables: Record<string, unknown>;
	/** Last successfully completed node (null if no nodes completed yet) */
	lastCompletedNode: string | null;
	/** ISO timestamp of checkpoint creation */
	timestamp: string;
}

/**
 * Get the checkpoints directory path for a project.
 */
function getCheckpointsDir(projectPath: string): string {
	return join(projectPath, ".cw", "checkpoints");
}

/**
 * Get the checkpoint file path for a specific thread ID.
 */
function getCheckpointPath(projectPath: string, threadId: string): string {
	return join(getCheckpointsDir(projectPath), `${threadId}.json`);
}

/**
 * Ensure the checkpoints directory exists.
 */
function ensureCheckpointsDir(projectPath: string): void {
	const dir = getCheckpointsDir(projectPath);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
}

/**
 * Save a checkpoint to disk.
 *
 * @param projectPath - Project root path
 * @param checkpoint - Checkpoint data to persist
 */
export function saveCheckpoint(
	projectPath: string,
	checkpoint: PersistedCheckpoint,
): void {
	ensureCheckpointsDir(projectPath);
	const filePath = getCheckpointPath(projectPath, checkpoint.threadId);

	// Use synchronous write to ensure checkpoint is saved before process exits
	const content = JSON.stringify(checkpoint, null, 2);
	writeFileSync(filePath, content, "utf-8");
}

/**
 * Load a checkpoint from disk.
 *
 * @param projectPath - Project root path
 * @param threadId - Thread ID to load
 * @returns Checkpoint data or null if not found
 */
export function loadCheckpoint(
	projectPath: string,
	threadId: string,
): PersistedCheckpoint | null {
	const filePath = getCheckpointPath(projectPath, threadId);

	if (!existsSync(filePath)) {
		return null;
	}

	try {
		const data = readFileSync(filePath, "utf-8");
		return JSON.parse(data) as PersistedCheckpoint;
	} catch (error) {
		console.error(`Failed to load checkpoint ${threadId}:`, error);
		return null;
	}
}

/**
 * Delete a checkpoint from disk.
 *
 * @param projectPath - Project root path
 * @param threadId - Thread ID to delete
 */
export function deleteCheckpoint(projectPath: string, threadId: string): void {
	const filePath = getCheckpointPath(projectPath, threadId);

	if (existsSync(filePath)) {
		unlinkSync(filePath);
	}
}

/**
 * List all available checkpoints for a project.
 *
 * @param projectPath - Project root path
 * @returns Array of checkpoint data
 */
export function listCheckpoints(projectPath: string): PersistedCheckpoint[] {
	const dir = getCheckpointsDir(projectPath);

	if (!existsSync(dir)) {
		return [];
	}

	const checkpoints: PersistedCheckpoint[] = [];
	const files = readdirSync(dir);

	for (const file of files) {
		if (!file.endsWith(".json")) {
			continue;
		}

		const threadId = file.replace(".json", "");
		const checkpoint = loadCheckpoint(projectPath, threadId);

		if (checkpoint) {
			checkpoints.push(checkpoint);
		}
	}

	// Sort by timestamp (newest first)
	return checkpoints.sort(
		(a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
	);
}

/**
 * Check if a checkpoint exists for a thread ID.
 *
 * @param projectPath - Project root path
 * @param threadId - Thread ID to check
 * @returns True if checkpoint exists
 */
export function checkpointExists(
	projectPath: string,
	threadId: string,
): boolean {
	return existsSync(getCheckpointPath(projectPath, threadId));
}

/**
 * Latest thread info stored per project.
 */
export interface LatestThreadInfo {
	/** Thread ID of the most recent checkpoint */
	threadId: string;
	/** Workflow name for validation */
	workflowName: string;
	/** Timestamp when this was saved */
	timestamp: string;
}

/**
 * Get the path to the latest thread info file.
 */
function getLatestThreadPath(projectPath: string): string {
	return join(getCheckpointsDir(projectPath), "latest.json");
}

/**
 * Save the latest thread ID for a project.
 * Called when a new checkpoint is created.
 *
 * @param projectPath - Project root path
 * @param threadId - Thread ID to save as latest
 * @param workflowName - Workflow name for validation on resume
 */
export function saveLatestThread(
	projectPath: string,
	threadId: string,
	workflowName: string,
): void {
	ensureCheckpointsDir(projectPath);
	const filePath = getLatestThreadPath(projectPath);

	const info: LatestThreadInfo = {
		threadId,
		workflowName,
		timestamp: new Date().toISOString(),
	};

	writeFileSync(filePath, JSON.stringify(info, null, 2), "utf-8");
}

/**
 * Load the latest thread info for a project.
 *
 * @param projectPath - Project root path
 * @returns Latest thread info or null if not found
 */
export function loadLatestThread(projectPath: string): LatestThreadInfo | null {
	const filePath = getLatestThreadPath(projectPath);

	if (!existsSync(filePath)) {
		return null;
	}

	try {
		const data = readFileSync(filePath, "utf-8");
		return JSON.parse(data) as LatestThreadInfo;
	} catch {
		return null;
	}
}

/**
 * Clear the latest thread info for a project.
 * Called when a workflow completes successfully.
 *
 * @param projectPath - Project root path
 */
export function clearLatestThread(projectPath: string): void {
	const filePath = getLatestThreadPath(projectPath);

	if (existsSync(filePath)) {
		unlinkSync(filePath);
	}
}
