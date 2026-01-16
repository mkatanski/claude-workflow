/**
 * Workflow runner that executes workflow definitions.
 *
 * Note: This is a simplified runner that executes steps sequentially.
 * The full LangGraph integration with subgraphs for loops will be added later.
 */

import { ExecutionContext } from "../context/execution.ts";
import { TmuxManager } from "../tmux/manager.ts";
import { ServerManager } from "../server/manager.ts";
import { ToolRegistry, registerBuiltinTools } from "../tools/index.ts";
import { ConditionEvaluator } from "../conditions/evaluator.ts";
import type {
  StepConfig,
  WorkflowDefinition,
  ClaudeConfig,
  TmuxConfig,
  LoopSignal,
} from "../../types/index.ts";
import { convertToStepConfigs } from "./builder.ts";

/**
 * Options for running a workflow.
 */
export interface RunnerOptions {
  projectPath: string;
  tempDir?: string;
  verbose?: boolean;
}

/**
 * Workflow runner that executes workflow definitions.
 */
export class WorkflowRunner {
  private definition: WorkflowDefinition;
  private steps: StepConfig[];
  private context: ExecutionContext;
  private serverManager: ServerManager;
  private tmuxManager: TmuxManager;
  private conditionEvaluator: ConditionEvaluator;
  private verbose: boolean;

  constructor(definition: WorkflowDefinition, options: RunnerOptions) {
    this.definition = definition;
    this.steps = convertToStepConfigs(definition);
    this.verbose = options.verbose ?? false;

    // Initialize execution context
    this.context = new ExecutionContext(options.projectPath);

    // Set initial variables from definition
    if (definition.vars) {
      this.context.update(definition.vars);
    }

    // Set temp directory if provided
    if (options.tempDir) {
      this.context.set("_temp_dir", options.tempDir);
    }

    // Initialize server manager
    this.serverManager = new ServerManager();

    // Initialize tmux manager
    const tmuxConfig: TmuxConfig = definition.tmux ?? { split: "vertical" };
    const claudeConfig: ClaudeConfig = definition.claude ?? {};

    this.tmuxManager = new TmuxManager(
      tmuxConfig,
      claudeConfig,
      options.projectPath,
      this.serverManager,
      options.tempDir
    );

    // Initialize condition evaluator
    this.conditionEvaluator = new ConditionEvaluator(this.context);

    // Register built-in tools
    registerBuiltinTools();
  }

  /**
   * Run the workflow.
   */
  async run(): Promise<{ success: boolean; error?: string }> {
    console.log(`Starting workflow: ${this.definition.name}`);

    // Start server
    await this.serverManager.start();
    console.log(`Server started on port ${this.serverManager.port}`);

    try {
      // Execute steps sequentially
      for (let i = 0; i < this.steps.length; i++) {
        const step = this.steps[i];

        console.log(`\n--- Step ${i + 1}/${this.steps.length}: ${step.name} ---`);

        // Evaluate 'when' condition if present
        if (step.when) {
          const result = this.conditionEvaluator.evaluate(step.when);
          if (!result.satisfied) {
            console.log(`Skipping: condition not satisfied (${result.reason})`);
            continue;
          }
        }

        // Execute the step
        const result = await this.executeStep(step);

        if (!result.success) {
          const onError = step.onError ?? "stop";
          if (onError === "stop") {
            console.error(`Step failed: ${result.error}`);
            return { success: false, error: result.error };
          }
          console.warn(`Step failed but continuing: ${result.error}`);
        }

        // Store output in variable if configured
        if (step.outputVar && result.output !== undefined) {
          this.context.set(step.outputVar, result.output);
          if (this.verbose) {
            console.log(`Set ${step.outputVar} = ${result.output.slice(0, 100)}...`);
          }
        }

        // Handle goto (jump to named step)
        if (result.gotoStep) {
          const targetIndex = this.steps.findIndex((s) => s.name === result.gotoStep);
          if (targetIndex === -1) {
            return { success: false, error: `Goto target not found: ${result.gotoStep}` };
          }
          i = targetIndex - 1; // Will be incremented by loop
        }
      }

      console.log("\nWorkflow completed successfully!");
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Workflow error: ${message}`);
      return { success: false, error: message };
    } finally {
      // Stop server
      await this.serverManager.stop();
    }
  }

  /**
   * Execute a single step.
   */
  private async executeStep(
    step: StepConfig
  ): Promise<{
    success: boolean;
    output?: string;
    error?: string;
    gotoStep?: string;
    loopSignal?: LoopSignal;
  }> {
    // Get the tool
    const tool = ToolRegistry.get(step.tool);
    if (!tool) {
      return { success: false, error: `Unknown tool: ${step.tool}` };
    }

    // Validate step
    try {
      tool.validateStep(step);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `Step validation failed: ${message}` };
    }

    // Execute the tool
    try {
      const result = await tool.execute(step, this.context, this.tmuxManager);
      return {
        success: result.success,
        output: result.output,
        error: result.error,
        gotoStep: result.gotoStep,
        loopSignal: result.loopSignal,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }
}
