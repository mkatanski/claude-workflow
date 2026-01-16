/**
 * Data tool for writing data to temp files.
 */

import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { ExecutionContext } from "../context/execution.ts";
import type { TmuxManager } from "../tmux/manager.ts";
import type { StepConfig } from "../../types/index.ts";
import type { ToolResult } from "./types.ts";
import { BaseTool, successResult, errorResult } from "./types.ts";

/**
 * Data tool for writing content to temp files.
 */
export class DataTool extends BaseTool {
	get name(): string {
		return "data";
	}

	validateStep(_step: StepConfig): void {
		// Content can be empty, so no validation needed
	}

	async execute(
		step: StepConfig,
		context: ExecutionContext,
		_tmuxManager: TmuxManager,
	): Promise<ToolResult> {
		// Get temp directory
		const tempDir = context.get<string>("_temp_dir");
		if (!tempDir) {
			return errorResult(
				"No temp directory available. Ensure workflow temp directory is set up.",
			);
		}

		// Get and interpolate content
		const content = context.interpolate(
			(step as unknown as { content?: string }).content ?? "",
		);

		// Determine file extension from format
		const format = (step as unknown as { format?: string }).format ?? "txt";
		const extension = this.getExtension(format);

		// Generate unique filename
		const filename = `data_${randomUUID().slice(0, 8)}${extension}`;
		const filePath = join(tempDir, filename);

		try {
			// Write content to file
			writeFileSync(filePath, content);

			const absolutePath = resolve(filePath);
			return successResult(absolutePath);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return errorResult(`Failed to write data: ${message}`);
		}
	}

	private getExtension(format: string): string {
		const extensions: Record<string, string> = {
			txt: ".txt",
			text: ".txt",
			json: ".json",
			yaml: ".yaml",
			yml: ".yaml",
			md: ".md",
			markdown: ".md",
			csv: ".csv",
			xml: ".xml",
			html: ".html",
		};

		return extensions[format.toLowerCase()] ?? ".txt";
	}
}
