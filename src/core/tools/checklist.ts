/**
 * Checklist tool for running validation checks in workflows.
 *
 * Supports three check types:
 * - bash: Run shell commands and compare output
 * - regex: Pattern matching in files using ripgrep
 * - model: LLM-based judgment using Claude haiku
 *
 * All checks run in parallel for faster execution.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import type { StepConfig } from "../../types/index.ts";
import { LoopSignal } from "../../types/index.ts";
import type { ExecutionContext } from "../context/execution.ts";
import type { TmuxManager } from "../tmux/manager.ts";
import type { ToolResult } from "./types.ts";
import { BaseTool, errorResult } from "./types.ts";

/**
 * Result of a single check.
 */
interface CheckResult {
	name: string;
	passed: boolean;
	severity: CheckSeverity;
	message: string;
	details?: string;
}

/**
 * Check item configuration.
 */
interface CheckItem {
	name: string;
	type: "bash" | "regex" | "model";
	severity?: CheckSeverity;
	// bash type
	command?: string;
	expect?: string;
	expectNot?: string;
	expectRegex?: string;
	// regex type
	pattern?: string;
	files?: string;
	exclude?: string;
	// model type
	prompt?: string;
	passPattern?: string;
	contextVars?: string[];
}

/**
 * Checklist configuration (from file or inline).
 */
interface ChecklistConfig {
	name: string;
	items: CheckItem[];
	onFail?: OnFailMode;
}

type CheckSeverity = "error" | "warning" | "info";
type OnFailMode = "stop" | "warn" | "continue";

const MODEL_ALIASES: Record<string, string> = {
	haiku: "claude-haiku-4-5-20250514",
};

/**
 * Execute validation checklists with bash, regex, and model checks.
 */
export class ChecklistTool extends BaseTool {
	private client: Anthropic | null = null;

	get name(): string {
		return "checklist";
	}

	validateStep(step: StepConfig): void {
		const items = step.items as CheckItem[] | undefined;
		const checklistName = step.checklist as string | undefined;

		if (!checklistName && !items) {
			throw new Error(
				"Checklist step requires either 'checklist' (file name) " +
					"or 'items' (inline check definitions)",
			);
		}

		// Validate inline items if provided
		if (items) {
			if (!Array.isArray(items)) {
				throw new Error("'items' must be a list of check definitions");
			}
			for (let i = 0; i < items.length; i++) {
				const item = items[i];
				if (!item.name) {
					throw new Error(`Check item ${i} missing required 'name' field`);
				}
				if (!item.type) {
					throw new Error(`Check item ${i} missing required 'type' field`);
				}
				if (!["bash", "regex", "model"].includes(item.type)) {
					throw new Error(
						`Check item ${i} has invalid type '${item.type}'. ` +
							"Valid types: bash, regex, model",
					);
				}
			}
		}
	}

	async execute(
		step: StepConfig,
		context: ExecutionContext,
		_tmuxManager: TmuxManager,
	): Promise<ToolResult> {
		const startTime = Date.now();

		// Load checklist configuration
		const checklistConfig = this.loadChecklist(step, context);
		if (!checklistConfig) {
			return errorResult("Failed to load checklist configuration");
		}

		const checklistName = checklistConfig.name;
		const items = checklistConfig.items;
		const onFail: OnFailMode =
			(step.onFail as OnFailMode) ?? checklistConfig.onFail ?? "warn";

		// Run all checks in parallel
		const results = await Promise.all(
			items.map((item) => this.runCheck(item, context)),
		);

		// Calculate stats for success determination
		const hasErrors = results.some((r) => !r.passed && r.severity === "error");
		const hasWarnings = results.some(
			(r) => !r.passed && r.severity === "warning",
		);

		// Format output
		const duration = (Date.now() - startTime) / 1000;
		const output = this.formatResults(checklistName, results, duration);

		// Success depends on onFail mode
		let success: boolean;
		if (onFail === "stop") {
			success = !hasErrors && !hasWarnings;
		} else if (onFail === "warn") {
			success = !hasErrors; // Warnings don't fail
		} else {
			success = true; // continue: always succeed
		}

		return {
			success,
			output,
			error: success ? undefined : "Checklist validation failed",
			loopSignal: LoopSignal.NONE,
		};
	}

	private loadChecklist(
		step: StepConfig,
		context: ExecutionContext,
	): ChecklistConfig | null {
		const items = step.items as CheckItem[] | undefined;
		const checklistName = step.checklist as string | undefined;

		// Inline items take precedence
		if (items) {
			return {
				name: step.name ?? "inline-checklist",
				items: items,
				onFail: (step.onFail as OnFailMode) ?? "warn",
			};
		}

		// Load from file
		if (!checklistName) {
			return null;
		}

		const interpolatedName = context.interpolate(checklistName);
		const checklistDir = join(context.projectPath, ".cw", "checklists");

		// Try different extensions
		const extensions = ["", ".json"];
		for (const ext of extensions) {
			const checklistPath = join(checklistDir, `${interpolatedName}${ext}`);
			if (existsSync(checklistPath)) {
				try {
					const content = readFileSync(checklistPath, "utf-8");
					const config = JSON.parse(content) as ChecklistConfig;
					return config;
				} catch (e) {
					const message = e instanceof Error ? e.message : String(e);
					throw new Error(`Failed to parse checklist file: ${message}`);
				}
			}
		}

		return null;
	}

	private async runCheck(
		item: CheckItem,
		context: ExecutionContext,
	): Promise<CheckResult> {
		const checkType = item.type;
		const checkName = item.name;
		const severity = item.severity ?? "warning";

		try {
			switch (checkType) {
				case "bash":
					return await this.runBashCheck(item, context, severity);
				case "regex":
					return await this.runRegexCheck(item, context, severity);
				case "model":
					return await this.runModelCheck(item, context, severity);
				default:
					return {
						name: checkName,
						passed: false,
						severity: "error",
						message: `Unknown check type: ${checkType}`,
					};
			}
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			return {
				name: checkName,
				passed: false,
				severity,
				message: `Check execution failed: ${message}`,
			};
		}
	}

	private async runBashCheck(
		item: CheckItem,
		context: ExecutionContext,
		severity: CheckSeverity,
	): Promise<CheckResult> {
		const name = item.name;
		const command = context.interpolate(item.command ?? "");

		return new Promise((resolve) => {
			const proc = spawn("bash", ["-c", command], {
				cwd: context.projectPath,
				timeout: 60000,
				env: process.env,
			});

			let stdout = "";
			let stderr = "";

			proc.stdout?.on("data", (data: Buffer) => {
				stdout += data.toString();
			});

			proc.stderr?.on("data", (data: Buffer) => {
				stderr += data.toString();
			});

			proc.on("close", (code) => {
				const output = stdout.trim();

				// Check expectations
				let passed = true;
				let message = "";

				if (item.expect !== undefined) {
					const expected = String(item.expect);
					if (output !== expected) {
						passed = false;
						message = `Expected '${expected}', got '${output}'`;
					} else {
						message = "Output matches expected value";
					}
				} else if (item.expectNot !== undefined) {
					const forbidden = String(item.expectNot);
					if (output.includes(forbidden)) {
						passed = false;
						message = `Output contains forbidden value: ${forbidden}`;
					} else {
						message = "Output does not contain forbidden value";
					}
				} else if (item.expectRegex !== undefined) {
					const pattern = item.expectRegex;
					try {
						const regex = new RegExp(pattern);
						if (!regex.test(output)) {
							passed = false;
							message = `Output does not match pattern: ${pattern}`;
						} else {
							message = "Output matches pattern";
						}
					} catch {
						passed = false;
						message = `Invalid regex pattern: ${pattern}`;
					}
				} else {
					// No expectation, just check exit code
					passed = code === 0;
					message = passed
						? "Command succeeded"
						: `Command failed with exit code ${code}`;
				}

				resolve({
					name,
					passed,
					severity,
					message,
					details: !passed ? output || stderr : undefined,
				});
			});

			proc.on("error", (err) => {
				resolve({
					name,
					passed: false,
					severity,
					message: `Command execution failed: ${err.message}`,
				});
			});
		});
	}

	private async runRegexCheck(
		item: CheckItem,
		context: ExecutionContext,
		severity: CheckSeverity,
	): Promise<CheckResult> {
		const name = item.name;
		const pattern = item.pattern ?? "";
		const files = item.files ?? "**/*.ts";
		const exclude = item.exclude ?? "";
		const expectCount = typeof item.expect === "number" ? item.expect : 0;

		// Build ripgrep command
		const cmdParts = ["rg", "--count-matches", "-e", pattern];

		// Add file glob
		cmdParts.push("--glob", files);

		// Add exclude patterns
		if (exclude) {
			for (const excl of exclude.split(",")) {
				cmdParts.push("--glob", `!${excl.trim()}`);
			}
		}

		// Add path
		cmdParts.push(".");

		return new Promise((resolve) => {
			const proc = spawn(cmdParts[0], cmdParts.slice(1), {
				cwd: context.projectPath,
				timeout: 60000,
				env: process.env,
			});

			let stdout = "";

			proc.stdout?.on("data", (data: Buffer) => {
				stdout += data.toString();
			});

			proc.on("close", () => {
				// Parse ripgrep output to count matches
				// Format: file:count per line
				let totalMatches = 0;
				const matchDetails: string[] = [];
				for (const line of stdout.trim().split("\n")) {
					if (line?.includes(":")) {
						const parts = line.split(":");
						const countStr = parts[parts.length - 1];
						const count = Number.parseInt(countStr, 10);
						if (!Number.isNaN(count)) {
							totalMatches += count;
							if (count > 0) {
								matchDetails.push(
									`${parts.slice(0, -1).join(":")}: ${count} matches`,
								);
							}
						}
					}
				}

				const passed = totalMatches === expectCount;
				const message = passed
					? `Found ${totalMatches} matches (expected ${expectCount})`
					: `Found ${totalMatches} matches, expected ${expectCount}`;

				resolve({
					name,
					passed,
					severity,
					message,
					details:
						!passed && matchDetails.length > 0
							? matchDetails.slice(0, 10).join("\n")
							: undefined,
				});
			});

			proc.on("error", (err) => {
				if (err.message.includes("ENOENT")) {
					resolve({
						name,
						passed: false,
						severity,
						message: "ripgrep (rg) not found - please install it",
					});
				} else {
					resolve({
						name,
						passed: false,
						severity,
						message: `Pattern search failed: ${err.message}`,
					});
				}
			});
		});
	}

	private async runModelCheck(
		item: CheckItem,
		context: ExecutionContext,
		severity: CheckSeverity,
	): Promise<CheckResult> {
		const name = item.name;
		const promptTemplate = item.prompt ?? "";
		const passPattern = item.passPattern ?? "(?i)(PASS|pass|yes|ok|true)";

		// Interpolate variables in prompt
		let prompt = context.interpolate(promptTemplate);

		// Include any specified context variables
		const contextVars = item.contextVars ?? [];
		if (contextVars.length > 0) {
			const varContext: string[] = [];
			for (const varName of contextVars) {
				const value = context.get(varName);
				if (value) {
					varContext.push(`## ${varName}\n${String(value)}`);
				}
			}
			if (varContext.length > 0) {
				prompt = `${varContext.join("\n\n")}\n\n${prompt}`;
			}
		}

		try {
			const response = await this.callHaiku(prompt);

			// Check if response indicates pass
			const regex = new RegExp(passPattern, "i");
			const passed = regex.test(response);

			return {
				name,
				passed,
				severity,
				message: passed ? "Check passed" : "Check failed",
				details: !passed ? response : undefined,
			};
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			return {
				name,
				passed: false,
				severity,
				message: `Model check failed: ${message}`,
			};
		}
	}

	private async callHaiku(prompt: string): Promise<string> {
		// Lazy initialize Anthropic client
		if (!this.client) {
			this.client = new Anthropic();
		}

		const model = MODEL_ALIASES.haiku;

		const response = await this.client.messages.create({
			model,
			max_tokens: 1024,
			messages: [{ role: "user", content: prompt }],
		});

		// Extract text content
		const textContent = response.content.find((c) => c.type === "text");
		return textContent?.type === "text" ? textContent.text : "No response";
	}

	private formatResults(
		checklistName: string,
		results: CheckResult[],
		duration: number,
	): string {
		const lines: string[] = [`## Checklist: ${checklistName}`];

		const passedCount = results.filter((r) => r.passed).length;
		const totalCount = results.length;
		const warningCount = results.filter(
			(r) => !r.passed && r.severity === "warning",
		).length;
		const errorCount = results.filter(
			(r) => !r.passed && r.severity === "error",
		).length;

		let status: string;
		if (errorCount > 0) {
			status = "FAILED";
		} else if (warningCount > 0) {
			status = "PASSED with warnings";
		} else {
			status = "PASSED";
		}

		lines.push(
			`Status: ${status} (${passedCount}/${totalCount} checks passed)`,
		);
		if (warningCount > 0) {
			lines.push(`Warnings: ${warningCount}`);
		}
		if (errorCount > 0) {
			lines.push(`Errors: ${errorCount}`);
		}
		lines.push(`Duration: ${duration.toFixed(2)}s`);
		lines.push("");

		// Individual results
		for (const r of results) {
			let icon: string;
			if (r.passed) {
				icon = "\u2713"; // checkmark
			} else if (r.severity === "error") {
				icon = "\u2717"; // X
			} else if (r.severity === "warning") {
				icon = "\u26a0"; // warning sign
			} else {
				icon = "\u2139"; // info
			}

			lines.push(`${icon} ${r.name}`);
			if (!r.passed) {
				lines.push(`  ${r.message}`);
				if (r.details) {
					for (const detailLine of r.details.split("\n").slice(0, 5)) {
						lines.push(`    ${detailLine}`);
					}
				}
			}
		}

		return lines.join("\n");
	}
}
