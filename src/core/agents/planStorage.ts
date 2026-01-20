/**
 * Plan file storage for persisting and retrieving plans.
 *
 * Plans are stored in the system temp directory and are transient.
 * They are automatically cleaned up when the session ends or manually.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { ensureDir, getPlansDir } from "../utils/paths/index.js";
import { ResultBox } from "../utils/result/index.js";
import type { ParsedPlan, PlanFile, PlanStatus, PlanSummary } from "./types.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Error type for plan storage operations.
 */
export interface PlanStorageError {
	code:
		| "PLAN_NOT_FOUND"
		| "PLAN_PARSE_ERROR"
		| "PLAN_WRITE_ERROR"
		| "PLAN_DELETE_ERROR"
		| "INVALID_PLAN";
	message: string;
	cause?: string;
}

/**
 * Result type for plan storage operations.
 */
export type PlanStorageResult<T> = ResultBox<T, PlanStorageError>;

// ============================================================================
// Constants
// ============================================================================

/** File extension for plan files */
const PLAN_FILE_EXT = ".json";

/** Prefix for plan file names */
const PLAN_FILE_PREFIX = "plan-";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a plan storage error.
 */
function createError(
	code: PlanStorageError["code"],
	message: string,
	cause?: string,
): PlanStorageError {
	return { code, message, cause };
}

/**
 * Get the file path for a plan by session ID.
 *
 * @param sessionId - Session ID
 * @returns Full path to the plan file
 */
export function getPlanFilePath(sessionId: string): string {
	return join(getPlansDir(), `${PLAN_FILE_PREFIX}${sessionId}${PLAN_FILE_EXT}`);
}

/**
 * Extract session ID from a plan file name.
 *
 * @param fileName - Plan file name
 * @returns Session ID or null if invalid format
 */
function extractSessionId(fileName: string): string | null {
	if (
		!fileName.startsWith(PLAN_FILE_PREFIX) ||
		!fileName.endsWith(PLAN_FILE_EXT)
	) {
		return null;
	}
	return fileName.slice(PLAN_FILE_PREFIX.length, -PLAN_FILE_EXT.length);
}

// ============================================================================
// Plan Parsing
// ============================================================================

/**
 * Parse critical files from plan content.
 * Looks for patterns like:
 * - CREATE: path/to/file.ts
 * - MODIFY: path/to/file.ts
 * - `path/to/file.ts`
 *
 * @param content - Plan content to parse
 * @returns Array of extracted file paths
 */
export function parseCriticalFiles(content: string): string[] {
	const files: Set<string> = new Set();

	// Match CREATE: or MODIFY: patterns
	const actionPattern = /(?:CREATE|MODIFY):\s*([^\s-]+)/gi;
	for (const match of content.matchAll(actionPattern)) {
		files.add(match[1]);
	}

	// Match backtick paths (common in markdown)
	const backtickPattern = /`([^`]+\.[a-z]{2,4})`/gi;
	for (const match of content.matchAll(backtickPattern)) {
		const filePath = match[1];
		// Filter out code snippets and keep only file paths
		if (
			filePath.includes("/") &&
			!filePath.includes(" ") &&
			!filePath.startsWith("http")
		) {
			files.add(filePath);
		}
	}

	return Array.from(files);
}

/**
 * Parse implementation steps from plan content.
 * Looks for numbered list patterns.
 *
 * @param content - Plan content to parse
 * @returns Array of extracted steps
 */
export function parseImplementationSteps(content: string): string[] {
	const steps: string[] = [];
	const lines = content.split("\n");

	// Match numbered steps with various formats (line by line to avoid multiline regex issues)
	const boldStepPattern = /^\s*(\d+)\.\s+\*\*([^*]+)\*\*:?\s*(.*)$/;
	const simpleStepPattern = /^\s*(\d+)\.\s+(.+)$/;

	for (const line of lines) {
		const boldMatch = line.match(boldStepPattern);
		if (boldMatch) {
			const stepTitle = boldMatch[2].trim();
			const stepDesc = boldMatch[3].trim();
			steps.push(stepDesc ? `${stepTitle}: ${stepDesc}` : stepTitle);
		}
	}

	// If no bold steps found, try simpler pattern
	if (steps.length === 0) {
		for (const line of lines) {
			const simpleMatch = line.match(simpleStepPattern);
			if (simpleMatch) {
				steps.push(simpleMatch[2].trim());
			}
		}
	}

	return steps;
}

/**
 * Parse a plan from agent output content.
 *
 * @param content - Raw plan content from agent
 * @returns Parsed plan structure
 */
export function parsePlanContent(content: string): ParsedPlan {
	const warnings: string[] = [];

	// Extract critical files
	const criticalFiles = parseCriticalFiles(content);
	if (criticalFiles.length === 0) {
		warnings.push("No critical files identified in the plan");
	}

	// Extract implementation steps
	const steps = parseImplementationSteps(content);
	if (steps.length === 0) {
		warnings.push("No implementation steps identified in the plan");
	}

	return {
		content,
		criticalFiles,
		steps,
		warnings: warnings.length > 0 ? warnings : undefined,
	};
}

// ============================================================================
// Storage Operations
// ============================================================================

/**
 * Save a plan to storage.
 *
 * @param plan - Plan to save
 * @returns Result with the file path or error
 */
export function savePlan(plan: PlanFile): PlanStorageResult<string> {
	try {
		const plansDir = getPlansDir();
		ensureDir(plansDir);

		const filePath = getPlanFilePath(plan.sessionId);
		const json = JSON.stringify(plan, null, 2);
		writeFileSync(filePath, json, "utf-8");

		return ResultBox.ok(filePath);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return ResultBox.err(
			createError(
				"PLAN_WRITE_ERROR",
				`Failed to save plan: ${message}`,
				message,
			),
		);
	}
}

/**
 * Load a plan from storage.
 *
 * @param sessionId - Session ID of the plan to load
 * @returns Result with the plan or error
 */
export function loadPlan(sessionId: string): PlanStorageResult<PlanFile> {
	const filePath = getPlanFilePath(sessionId);

	if (!existsSync(filePath)) {
		return ResultBox.err(
			createError("PLAN_NOT_FOUND", `Plan not found for session: ${sessionId}`),
		);
	}

	try {
		const content = readFileSync(filePath, "utf-8");
		const plan = JSON.parse(content) as PlanFile;

		// Validate required fields
		if (!plan.sessionId || !plan.content || !plan.status) {
			return ResultBox.err(
				createError("INVALID_PLAN", "Plan file is missing required fields"),
			);
		}

		return ResultBox.ok(plan);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return ResultBox.err(
			createError(
				"PLAN_PARSE_ERROR",
				`Failed to parse plan: ${message}`,
				message,
			),
		);
	}
}

/**
 * Update the status of a plan.
 *
 * @param sessionId - Session ID of the plan
 * @param status - New status to set
 * @returns Result with the updated plan or error
 */
export function updatePlanStatus(
	sessionId: string,
	status: PlanStatus,
): PlanStorageResult<PlanFile> {
	const loadResult = loadPlan(sessionId);
	if (loadResult.isErr()) {
		return loadResult;
	}

	const plan = loadResult.unwrap();
	plan.status = status;
	plan.updatedAt = new Date().toISOString();

	if (status === "approved") {
		plan.approvedAt = plan.updatedAt;
	}

	const saveResult = savePlan(plan);
	if (saveResult.isErr()) {
		return ResultBox.err(saveResult.unwrapErr());
	}

	return ResultBox.ok(plan);
}

/**
 * Delete a plan from storage.
 *
 * @param sessionId - Session ID of the plan to delete
 * @returns Result indicating success or error
 */
export async function deletePlan(
	sessionId: string,
): Promise<PlanStorageResult<void>> {
	const filePath = getPlanFilePath(sessionId);

	if (!existsSync(filePath)) {
		// Not found is not an error for delete
		return ResultBox.ok(undefined);
	}

	try {
		await rm(filePath);
		return ResultBox.ok(undefined);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return ResultBox.err(
			createError(
				"PLAN_DELETE_ERROR",
				`Failed to delete plan: ${message}`,
				message,
			),
		);
	}
}

/**
 * List all plans in storage.
 *
 * @returns Result with array of plan summaries or error
 */
export function listPlans(): PlanStorageResult<PlanSummary[]> {
	const plansDir = getPlansDir();

	if (!existsSync(plansDir)) {
		return ResultBox.ok([]);
	}

	try {
		const files = readdirSync(plansDir);
		const summaries: PlanSummary[] = [];

		for (const file of files) {
			const sessionId = extractSessionId(file);
			if (!sessionId) continue;

			const loadResult = loadPlan(sessionId);
			if (loadResult.isErr()) continue;

			const plan = loadResult.unwrap();
			summaries.push({
				sessionId: plan.sessionId,
				stepCount: parseImplementationSteps(plan.content).length,
				criticalFileCount: plan.criticalFiles.length,
				status: plan.status,
				createdAt: plan.createdAt,
			});
		}

		// Sort by creation date, newest first
		summaries.sort(
			(a, b) =>
				new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
		);

		return ResultBox.ok(summaries);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return ResultBox.err(
			createError(
				"PLAN_PARSE_ERROR",
				`Failed to list plans: ${message}`,
				message,
			),
		);
	}
}

/**
 * Create a new plan file from agent output.
 *
 * @param sessionId - Session ID for the plan
 * @param content - Raw plan content from agent
 * @param autoApprove - Whether to auto-approve the plan
 * @returns The created plan file
 */
export function createPlanFromOutput(
	sessionId: string,
	content: string,
	autoApprove: boolean = true,
): PlanFile {
	const now = new Date().toISOString();
	const parsed = parsePlanContent(content);

	const plan: PlanFile = {
		sessionId,
		createdAt: now,
		updatedAt: now,
		content,
		criticalFiles: parsed.criticalFiles,
		status: autoApprove ? "approved" : "pending",
		approvedAt: autoApprove ? now : undefined,
		metadata: {
			stepCount: parsed.steps.length,
			parseWarnings: parsed.warnings,
		},
	};

	return plan;
}
