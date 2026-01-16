/**
 * Run workflow command.
 */

import { mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import * as p from "@clack/prompts";
import {
	discoverWorkflows,
	loadWorkflow,
	loadLangGraphWorkflow,
	selectWorkflow,
	type DiscoveredWorkflow,
} from "../discovery.ts";
import { WorkflowRunner } from "../../core/workflow/runner.ts";
import { WorkflowGraph } from "../../core/graph/workflowGraph.ts";
import {
	checkHooksQuiet,
	installHooks,
	hasGlobalHooks,
	cleanupGlobalHooks,
} from "./hooks.ts";
import {
	createEmitter,
	ConsoleRenderer,
	JsonRenderer,
	type WorkflowRenderer,
} from "../../core/events/index.ts";

/**
 * Options for the run command.
 */
export interface RunOptions {
	workflow?: string;
	verbose?: boolean;
	/** Force color output even in non-TTY environments */
	color?: boolean;
	/** Use JSON renderer for structured output */
	json?: boolean;
}

/**
 * Run a workflow in the specified project.
 */
export async function runWorkflow(
	projectPath: string,
	options: RunOptions,
): Promise<void> {
	const absoluteProjectPath = resolve(projectPath);

	// Check hooks before workflow execution
	const hooksInstalled = checkHooksQuiet(absoluteProjectPath);
	if (!hooksInstalled) {
		const shouldInstall = await p.confirm({
			message: "Workflow hooks not configured. Install them now?",
			initialValue: true,
		});

		if (p.isCancel(shouldInstall)) {
			process.exit(0);
		}

		if (shouldInstall) {
			installHooks(absoluteProjectPath);
			console.log("");
		} else {
			console.log(
				"Warning: Workflow may not function correctly without hooks\n",
			);
		}
	}

	// Check for legacy global hooks
	if (hasGlobalHooks()) {
		const shouldCleanup = await p.confirm({
			message: "Legacy global hooks found at ~/.claude/hooks/. Remove them?",
			initialValue: true,
		});
		if (!p.isCancel(shouldCleanup) && shouldCleanup) {
			cleanupGlobalHooks();
			console.log("");
		}
	}

	// Create temp directory for this run
	const tempDir = join(
		absoluteProjectPath,
		".cw",
		"tmp",
		randomUUID().slice(0, 8),
	);
	if (!existsSync(tempDir)) {
		mkdirSync(tempDir, { recursive: true });
	}

	// Discover workflows
	const workflows = await discoverWorkflows(absoluteProjectPath);

	if (workflows.length === 0) {
		console.error("No workflows found in .cw/workflows/");
		console.error(
			"Create a workflow file like: .cw/workflows/my-workflow.workflow.ts",
		);
		process.exit(1);
	}

	// Select workflow
	let selectedWorkflow: DiscoveredWorkflow | null | undefined;
	if (options.workflow) {
		selectedWorkflow = workflows.find((w) => w.name === options.workflow);
		if (!selectedWorkflow) {
			console.error(`Workflow not found: ${options.workflow}`);
			console.error("Available workflows:");
			for (const w of workflows) {
				console.error(`  - ${w.name}`);
			}
			process.exit(1);
		}
	} else {
		selectedWorkflow = await selectWorkflow(workflows);
		if (!selectedWorkflow) {
			console.error("No workflow selected");
			process.exit(1);
		}
	}

	// Handle based on workflow format
	if (selectedWorkflow.format === "langgraph") {
		await runLangGraphWorkflow(
			selectedWorkflow.path,
			absoluteProjectPath,
			tempDir,
			options,
		);
	} else {
		await runLegacyWorkflow(
			selectedWorkflow.path,
			absoluteProjectPath,
			tempDir,
			options,
		);
	}
}

/**
 * Run a legacy workflow.
 */
async function runLegacyWorkflow(
	workflowPath: string,
	projectPath: string,
	tempDir: string,
	options: RunOptions,
): Promise<void> {
	// Load workflow definition
	const definition = await loadWorkflow(workflowPath);

	console.log(`Workflow: ${definition.name}`);
	console.log(`Steps: ${definition.steps.length}`);

	// Create runner
	const runner = new WorkflowRunner(definition, {
		projectPath,
		tempDir,
		verbose: options.verbose,
	});

	// Run workflow
	const result = await runner.run();

	if (!result.success) {
		console.error(`\nWorkflow failed: ${result.error}`);
		process.exit(1);
	}

	console.log("\nWorkflow completed successfully!");
}

/**
 * Create the appropriate renderer based on environment.
 */
interface RendererOptions {
	verbose: boolean;
	forceColor?: boolean;
	useJson?: boolean;
}

function createRenderer(options: RendererOptions): WorkflowRenderer {
	const { verbose, forceColor, useJson } = options;

	// Use JSON renderer if explicitly requested or in CI environments
	const isCI = Boolean(process.env.CI);
	if (useJson || (isCI && !forceColor)) {
		return new JsonRenderer({
			verbose,
			includePayload: true,
			includeMetadata: verbose,
		});
	}

	// Check for FORCE_COLOR environment variable (common convention)
	const envForceColor = Boolean(process.env.FORCE_COLOR);
	const noColor = forceColor || envForceColor ? false : undefined;

	return new ConsoleRenderer({
		verbose,
		showNodeSeparators: true,
		noColor,
	});
}

/**
 * Run a LangGraph-based workflow.
 */
async function runLangGraphWorkflow(
	workflowPath: string,
	projectPath: string,
	tempDir: string,
	options: RunOptions,
): Promise<void> {
	// Load workflow definition
	const definition = await loadLangGraphWorkflow(workflowPath);

	// Create event emitter and connect renderer
	const emitter = createEmitter({ asyncByDefault: true });
	const renderer = createRenderer({
		verbose: options.verbose ?? false,
		forceColor: options.color,
		useJson: options.json,
	});
	const rendererSubscription = renderer.connect(emitter);

	// Create WorkflowGraph with emitter
	const graph = new WorkflowGraph({
		projectPath,
		tempDir,
		claudeConfig: definition.claude,
		claudeSdkConfig: definition.claudeSdk,
		tmuxConfig: definition.tmux,
		verbose: options.verbose,
		emitter,
		workflowName: definition.name,
	});

	try {
		// Build the graph using the definition's build function
		definition.build(graph);

		// Run the workflow with initial variables
		const result = await graph.run(definition.vars);

		if (result.error) {
			// Error already displayed via workflow:error event
			process.exit(1);
		}

	} finally {
		// Flush any pending events before cleanup
		await emitter.flush();

		// Cleanup renderer subscription
		rendererSubscription.unsubscribe();
		renderer.dispose();

		// Always cleanup graph resources
		await graph.cleanup();
	}
}
