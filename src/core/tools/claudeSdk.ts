/**
 * Claude SDK tool for AI-powered decision making.
 *
 * This tool uses the Anthropic SDK to analyze context and make decisions,
 * with support for structured outputs (boolean, enum, decision, custom schema).
 */

import Anthropic from "@anthropic-ai/sdk";
import type { ExecutionContext } from "../context/execution.ts";
import type { TmuxManager } from "../tmux/manager.ts";
import type { ClaudeSdkConfig, StepConfig } from "../../types/index.ts";
import { LoopSignal } from "../../types/index.ts";
import type { ToolResult } from "./types.ts";
import { BaseTool, errorResult } from "./types.ts";

/**
 * Model alias to full model ID mapping.
 */
const MODEL_ALIASES: Record<string, string> = {
  sonnet: "claude-sonnet-4-5-20250514",
  opus: "claude-opus-4-5-20250514",
  haiku: "claude-haiku-4-5-20250514",
};

/**
 * Default system prompt for decision-making.
 */
const DEFAULT_SYSTEM_PROMPT = `You are a decision-making assistant integrated into an automated workflow.
Your role is to analyze the provided context and make precise decisions.

Guidelines:
- Be concise and direct in your analysis
- Your output must strictly follow the requested format
- Focus on the key information needed to make the decision`;

/**
 * Output validation error.
 */
class OutputValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutputValidationError";
  }
}

/**
 * Tool for AI-powered decision making using Anthropic SDK.
 */
export class ClaudeSdkTool extends BaseTool {
  private sdkConfig?: ClaudeSdkConfig;
  private client: Anthropic;

  constructor(sdkConfig?: ClaudeSdkConfig) {
    super();
    this.sdkConfig = sdkConfig;
    this.client = new Anthropic();
  }

  get name(): string {
    return "claude_sdk";
  }

  validateStep(step: StepConfig): void {
    if (!step.prompt) {
      throw new Error("claude_sdk tool requires 'prompt' field");
    }

    const outputType = step.outputType;
    if (outputType === "enum" && !step.schema?.values) {
      throw new Error("enum output_type requires 'values' in schema");
    }
    if (outputType === "schema" && !step.schema) {
      throw new Error("schema output_type requires 'schema' field");
    }

    const validOutputTypes = new Set([
      "boolean",
      "enum",
      "decision",
      "schema",
      undefined,
    ]);
    if (!validOutputTypes.has(outputType)) {
      throw new Error(
        `Invalid output_type: ${outputType}. Valid types: boolean, enum, decision, schema`
      );
    }
  }

  async execute(
    step: StepConfig,
    context: ExecutionContext,
    _tmuxManager: TmuxManager
  ): Promise<ToolResult> {
    try {
      return await this.executeAsync(step, context);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(message);
    }
  }

  private async executeAsync(
    step: StepConfig,
    context: ExecutionContext
  ): Promise<ToolResult> {
    // Interpolate prompt template with variables
    const prompt = context.interpolateForClaude(step.prompt!);

    // Build system prompt
    const systemPrompt = this.buildSystemPrompt(step);

    // Resolve model
    const modelAlias = step.model ?? this.sdkConfig?.model ?? "sonnet";
    const model = MODEL_ALIASES[modelAlias] ?? modelAlias;

    // Execute with retry logic for schema validation
    const maxRetries = step.maxRetries ?? 3;
    let lastError: string | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Add retry feedback to prompt if not first attempt
        let currentPrompt = prompt;
        if (attempt > 0 && lastError) {
          currentPrompt = `${prompt}\n\n[Previous attempt failed validation: ${lastError}. Please try again with valid output.]`;
        }

        // Run the query
        const response = await this.client.messages.create({
          model,
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: "user", content: currentPrompt }],
        });

        // Extract text content
        const textContent = response.content.find((c) => c.type === "text");
        const resultText = textContent?.type === "text" ? textContent.text : "";

        // Parse and validate output
        const parsed = this.parseOutput(resultText, step);

        // Build output string
        const output = this.formatOutput(parsed, step);

        // Extract goto if decision type
        let gotoStep: string | undefined;
        if (
          typeof parsed === "object" &&
          parsed !== null &&
          "goto" in parsed
        ) {
          gotoStep = (parsed as Record<string, unknown>).goto as string;
        }

        return {
          success: true,
          output,
          gotoStep,
          loopSignal: LoopSignal.NONE,
        };
      } catch (error) {
        if (error instanceof OutputValidationError) {
          lastError = error.message;
          if (attempt === maxRetries - 1) {
            return errorResult(
              `Output validation failed after ${maxRetries} attempts: ${error.message}`
            );
          }
        } else {
          throw error;
        }
      }
    }

    return errorResult("Max retries exceeded");
  }

  private buildSystemPrompt(step: StepConfig): string {
    // Resolve system prompt: step -> workflow config -> default
    let systemPrompt =
      step.systemPrompt ?? this.sdkConfig?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;

    // Add output format instructions
    const outputType = step.outputType;
    if (outputType) {
      systemPrompt = this.appendOutputInstructions(systemPrompt, outputType, step);
    }

    return systemPrompt;
  }

  private appendOutputInstructions(
    systemPrompt: string,
    outputType: string,
    step: StepConfig
  ): string {
    let instructions = "\n\n## Required Output Format\n";

    if (outputType === "boolean") {
      instructions +=
        'You must respond with a JSON object containing a single \'result\' field ' +
        "with a boolean value (true or false).\n" +
        'Example: {"result": true}';
    } else if (outputType === "enum") {
      const values = (step.schema?.values as string[]) ?? [];
      instructions +=
        `You must respond with a JSON object containing a single 'result' field ` +
        `with one of these exact values: ${JSON.stringify(values)}\n` +
        `Example: {"result": "${values[0] ?? "value"}"}`;
    } else if (outputType === "decision") {
      instructions +=
        "You must respond with a JSON object containing:\n" +
        "- 'goto': the name of the next step to execute\n" +
        "- 'reason': a brief explanation for your decision\n" +
        'Example: {"goto": "step_name", "reason": "explanation"}';
    } else if (outputType === "schema") {
      const schema = step.schema ?? {};
      instructions +=
        `You must respond with a JSON object matching this schema:\n` +
        JSON.stringify(schema, null, 2);
    }

    return systemPrompt + instructions;
  }

  private parseOutput(
    resultText: string,
    step: StepConfig
  ): Record<string, unknown> | string | boolean {
    const outputType = step.outputType;

    // If no output_type, return raw text
    if (!outputType) {
      return resultText;
    }

    // Check for empty result
    if (!resultText.trim()) {
      throw new OutputValidationError(
        `Expected ${outputType} output but received empty response.`
      );
    }

    // Try to parse JSON from result text
    try {
      const parsed = this.extractJson(resultText);
      return this.validateStructuredOutput(parsed, step);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new OutputValidationError(
          `Failed to parse JSON from output: ${error.message}. Output was: ${resultText.slice(0, 200)}`
        );
      }
      throw error;
    }
  }

  private extractJson(text: string): Record<string, unknown> {
    let cleanText = text.trim();

    // Try to find JSON in code blocks
    if (cleanText.includes("```json")) {
      const start = cleanText.indexOf("```json") + 7;
      const end = cleanText.indexOf("```", start);
      if (end > start) {
        cleanText = cleanText.slice(start, end).trim();
      }
    } else if (cleanText.includes("```")) {
      const start = cleanText.indexOf("```") + 3;
      const end = cleanText.indexOf("```", start);
      if (end > start) {
        cleanText = cleanText.slice(start, end).trim();
      }
    }

    return JSON.parse(cleanText);
  }

  private validateStructuredOutput(
    output: unknown,
    step: StepConfig
  ): Record<string, unknown> | string | boolean {
    const outputType = step.outputType;

    if (outputType === "boolean") {
      if (
        typeof output === "object" &&
        output !== null &&
        "result" in output
      ) {
        const result = (output as Record<string, unknown>).result;
        if (typeof result === "boolean") {
          return output as Record<string, unknown>;
        }
        throw new OutputValidationError(
          `Expected boolean result, got: ${typeof result}`
        );
      }
      throw new OutputValidationError(
        `Expected object with 'result' boolean field, got: ${JSON.stringify(output)}`
      );
    }

    if (outputType === "enum") {
      const values = (step.schema?.values as string[]) ?? [];
      if (
        typeof output === "object" &&
        output !== null &&
        "result" in output
      ) {
        const result = (output as Record<string, unknown>).result;
        if (values.includes(result as string)) {
          return output as Record<string, unknown>;
        }
        throw new OutputValidationError(
          `Result '${result}' not in allowed values: ${JSON.stringify(values)}`
        );
      }
      throw new OutputValidationError(
        `Expected object with 'result' field, got: ${JSON.stringify(output)}`
      );
    }

    if (outputType === "decision") {
      if (typeof output === "object" && output !== null) {
        const obj = output as Record<string, unknown>;
        if ("goto" in obj && "reason" in obj) {
          return obj;
        }
        throw new OutputValidationError(
          "Decision output must have 'goto' and 'reason' fields"
        );
      }
      throw new OutputValidationError(
        `Expected decision object, got: ${typeof output}`
      );
    }

    if (outputType === "schema") {
      if (typeof output === "object" && output !== null) {
        return output as Record<string, unknown>;
      }
      throw new OutputValidationError(
        `Expected object matching schema, got: ${typeof output}`
      );
    }

    return output as Record<string, unknown> | string | boolean;
  }

  private formatOutput(
    parsed: Record<string, unknown> | string | boolean,
    step: StepConfig
  ): string {
    const outputType = step.outputType;

    if (typeof parsed === "object" && parsed !== null) {
      // For enum/boolean with result field, extract the value for simpler usage
      if (
        (outputType === "boolean" || outputType === "enum") &&
        "result" in parsed
      ) {
        return String(parsed.result);
      }
      return JSON.stringify(parsed);
    }

    return String(parsed);
  }
}
