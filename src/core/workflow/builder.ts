/**
 * Fluent builder API for defining workflows.
 */

import type {
	ChecklistItem,
	ClaudeSdkToolConfig,
	JsonToolConfig,
	LinearToolConfig,
	LoopDefinition,
	RetryConfig,
	StepConfig,
	StepDefinition,
	StepOptions,
	ToolDefinition,
	WorkflowBuilder,
	WorkflowDefinition,
} from "../../types/index.ts";

/**
 * Convert a step definition to a StepConfig.
 */
function toStepConfig(stepDef: StepDefinition): StepConfig {
	if ("type" in stepDef) {
		// This is a loop definition, convert to appropriate step config
		const loop = stepDef as LoopDefinition;
		return {
			name: `${loop.type}_loop`,
			tool: loop.type,
			...loop.config,
			steps: loop.steps.map(toStepConfig),
		} as StepConfig;
	}
	return stepDef as StepConfig;
}

/**
 * Implementation of the WorkflowBuilder interface.
 */
class WorkflowBuilderImpl implements WorkflowBuilder {
	/**
	 * Create a step with a tool and optional configuration.
	 */
	step(
		name: string,
		tool: ToolDefinition,
		options?: StepOptions,
	): StepDefinition {
		const stepConfig: StepConfig = {
			name,
			tool: tool.tool,
			...tool.config,
		};

		if (options) {
			if (options.output) stepConfig.outputVar = options.output;
			if (options.when) stepConfig.when = options.when;
			if (options.onError) stepConfig.onError = options.onError;
			if (options.visible !== undefined) stepConfig.visible = options.visible;
			if (options.cwd) stepConfig.cwd = options.cwd;
			if (options.model) stepConfig.model = options.model;
		}

		return stepConfig;
	}

	/**
	 * Create a bash tool definition.
	 */
	bash(command: string): ToolDefinition {
		return {
			tool: "bash",
			config: { command },
		};
	}

	/**
	 * Create a Claude Code tool definition.
	 */
	claude(prompt: string): ToolDefinition {
		return {
			tool: "claude",
			config: { prompt },
		};
	}

	/**
	 * Create a set tool definition for setting context variables.
	 */
	set(varName: string, value: string): ToolDefinition {
		return {
			tool: "set",
			config: { var: varName, value },
		};
	}

	/**
	 * Create a Claude SDK tool definition.
	 */
	claudeSdk(config: ClaudeSdkToolConfig): ToolDefinition {
		return {
			tool: "claude_sdk",
			config: {
				prompt: config.prompt,
				schema: config.schema,
				systemPrompt: config.systemPrompt,
				model: config.model,
				maxRetries: config.maxRetries,
				timeout: config.timeout,
			},
		};
	}

	/**
	 * Create a JSON tool definition.
	 */
	json(action: string, config: JsonToolConfig): ToolDefinition {
		return {
			tool: "json",
			config: {
				action,
				input: config.input,
				query: config.query,
				path: config.path,
				newValue: config.value,
			},
		};
	}

	/**
	 * Create a data tool definition.
	 */
	data(content: string, format: string): ToolDefinition {
		return {
			tool: "data",
			config: { content, format },
		};
	}

	/**
	 * Create a checklist tool definition.
	 */
	checklist(items: ChecklistItem[]): ToolDefinition {
		return {
			tool: "checklist",
			config: { items },
		};
	}

	/**
	 * Create a Linear tool definition.
	 */
	linear(action: string, config: LinearToolConfig): ToolDefinition {
		return {
			tool: "linear",
			config: {
				action,
				...config,
			},
		};
	}

	/**
	 * Create a hook tool definition.
	 *
	 * Hooks are optional project-specific scripts in .cw/hooks/{name}.ts
	 * If the hook file doesn't exist, the step silently succeeds.
	 */
	hook(name: string): ToolDefinition {
		return {
			tool: "hook",
			config: { hookName: name },
		};
	}

	/**
	 * Create a forEach loop definition.
	 */
	forEach(
		source: string,
		itemVar: string,
		steps: StepDefinition[],
	): LoopDefinition {
		return {
			type: "forEach",
			config: { source, itemVar },
			steps,
		};
	}

	/**
	 * Create a while loop definition.
	 */
	while(condition: string, steps: StepDefinition[]): LoopDefinition {
		return {
			type: "while",
			config: { condition },
			steps,
		};
	}

	/**
	 * Create a range loop definition.
	 */
	range(from: number, to: number, steps: StepDefinition[]): LoopDefinition {
		return {
			type: "range",
			config: { from, to },
			steps,
		};
	}

	/**
	 * Create a retry loop definition.
	 */
	retry(config: RetryConfig, steps: StepDefinition[]): LoopDefinition {
		return {
			type: "retry",
			config: {
				maxAttempts: config.maxAttempts,
				until: config.until,
				backoff: config.backoff,
			},
			steps,
		};
	}
}

/**
 * Create a workflow builder instance.
 */
export function createBuilder(): WorkflowBuilder {
	return new WorkflowBuilderImpl();
}

/**
 * Convert a workflow definition to step configs.
 */
export function convertToStepConfigs(
	definition: WorkflowDefinition,
): StepConfig[] {
	return definition.steps.map(toStepConfig);
}
