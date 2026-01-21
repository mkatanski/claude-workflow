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
import {
	WorkflowGraph,
	saveCheckpoint,
	loadCheckpoint,
	deleteCheckpoint,
	saveLatestThread,
	loadLatestThread,
	clearLatestThread,
} from "../../core/graph/index.ts";
import type { PersistedCheckpoint } from "../../core/graph/index.ts";
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
	DebugRenderer,
	type WorkflowRenderer,
} from "../../core/events/index.ts";
import { Debugger, createDebugger } from "../../core/debugger/index.ts";

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
	/** Enable debug mode with enhanced logging */
	debug?: boolean;
	/** Enable checkpointing for resumable execution */
	checkpoint?: boolean;
	/** Thread ID for checkpoint tracking */
	threadId?: string;
	/** Resume from existing checkpoint */
	resume?: boolean;
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
	debug?: boolean;
}

function createRenderer(options: RendererOptions): WorkflowRenderer {
	const { verbose, forceColor, useJson, debug } = options;

	// Use DebugRenderer in debug mode for interactive debugging
	if (debug) {
		return new DebugRenderer({
			verbose: true, // Always verbose in debug mode
			showVariables: true,
			showCallStack: true,
			interactive: true,
		});
	}

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

	// Handle resume from checkpoint
	// Note: When resuming, LangGraph's SqliteSaver automatically restores state
	// We only use our custom checkpoint file for metadata (workflow name validation, user feedback)
	const initialVars = definition.vars ?? {};
	let existingCheckpoint: PersistedCheckpoint | null = null;
	let resolvedThreadId = options.threadId;

	if (options.resume) {
		// If no thread ID provided, try to load the latest one
		if (!resolvedThreadId) {
			const latestThread = loadLatestThread(projectPath);
			if (!latestThread) {
				console.error("No checkpoint found to resume. Use --thread-id to specify one.");
				process.exit(1);
			}
			resolvedThreadId = latestThread.threadId;
			console.log(`Using latest thread: ${resolvedThreadId}`);
		}

		existingCheckpoint = loadCheckpoint(projectPath, resolvedThreadId);
		if (!existingCheckpoint) {
			console.error(`No checkpoint found for thread: ${resolvedThreadId}`);
			process.exit(1);
		}
		if (existingCheckpoint.workflowName !== definition.name) {
			console.error(
				`Checkpoint workflow "${existingCheckpoint.workflowName}" does not match current workflow "${definition.name}"`,
			);
			process.exit(1);
		}
		console.log(
			`Resuming from checkpoint (last completed node: ${existingCheckpoint.lastCompletedNode ?? "none"})`,
		);
		// Note: We don't override initialVars - LangGraph's SqliteSaver will restore state automatically
	}

	// Create event emitter and connect renderer
	const emitter = createEmitter({ asyncByDefault: true });
	const renderer = createRenderer({
		verbose: options.verbose ?? false,
		forceColor: options.color,
		useJson: options.json,
		debug: options.debug,
	});
	const rendererSubscription = renderer.connect(emitter);

	// Create debugger if in debug mode
	let workflowDebugger: Debugger | undefined;
	if (options.debug) {
		workflowDebugger = createDebugger({
			onBreakpointHit: (_hit) => {
				// Breakpoint handling is done through event system
				// The debug renderer will handle the interactive prompt
			},
			onStateChange: (_state) => {
				// State change handling is done through event system
			},
		});

		// Start debugger with initial configuration
		await workflowDebugger.start({
			enabled: true,
			breakpoints: [], // Breakpoints can be set interactively
			breakOnStart: false,
		});
	}

	// Create WorkflowGraph with emitter, debugger, and checkpointer
	const graph = new WorkflowGraph({
		projectPath,
		tempDir,
		claudeConfig: definition.claude,
		claudeSdkConfig: definition.claudeSdk,
		tmuxConfig: definition.tmux,
		verbose: options.verbose,
		emitter,
		workflowName: definition.name,
		debugger: workflowDebugger,
		checkpointer: options.checkpoint
			? {
					enabled: true,
					threadId: resolvedThreadId,
					resume: options.resume,
				}
			: undefined,
	});

	// Track checkpoint state for SIGINT handling
	// Using explicit type annotation to ensure TypeScript tracks mutations in callbacks
	let checkpointState: { current: PersistedCheckpoint | null } = { current: null };
	let interrupted = false;

	// Helper to save checkpoint and print resume command
	const saveAndPrintResume = (reason: string): void => {
		if (checkpointState.current && options.checkpoint) {
			console.log(`\n${reason}. Saving checkpoint...`);
			saveCheckpoint(projectPath, checkpointState.current);
			// Save as latest thread for easy resume
			saveLatestThread(projectPath, checkpointState.current.threadId, definition.name);
			console.log(`Resume with: cw run --resume -w ${definition.name}`);
		}
	};

	// Handle Ctrl+C
	const sigintHandler = (): void => {
		interrupted = true;
		saveAndPrintResume("Interrupted");
		process.exit(130);
	};

	// Only register SIGINT handler if checkpointing is enabled
	if (options.checkpoint) {
		process.on("SIGINT", sigintHandler);
	}

	try {
		// Build the graph using the definition's build function
		definition.build(graph);

		// Print thread ID if checkpointing is enabled
		if (options.checkpoint && !options.resume) {
			console.log(`Thread ID: ${graph.getThreadId()}`);
		}

		// Run the workflow with initial variables and checkpoint callback
		const result = await graph.run(initialVars, {
			onNodeComplete: (nodeName, variables) => {
				// Update checkpoint state after each node
				const threadId = graph.getThreadId();
				if (threadId && options.checkpoint) {
					checkpointState.current = {
						threadId,
						workflowName: definition.name,
						variables,
						lastCompletedNode: nodeName,
						timestamp: new Date().toISOString(),
					};
				}
			},
		});

		if (result.state.error) {
			// Workflow completed with error - save checkpoint
			saveAndPrintResume("Workflow failed");
			process.exit(1);
		}

		// Success - delete checkpoint and clear latest thread
		if (checkpointState.current && options.checkpoint) {
			deleteCheckpoint(projectPath, checkpointState.current.threadId);
			clearLatestThread(projectPath);
			if (options.verbose) {
				console.log("Checkpoint cleaned up.");
			}
		}
	} catch (error) {
		// Unexpected error - save checkpoint
		if (!interrupted) {
			const message = error instanceof Error ? error.message : String(error);
			saveAndPrintResume(`Error: ${message}`);
		}
		throw error;
	} finally {
		// Remove SIGINT handler
		if (options.checkpoint) {
			process.off("SIGINT", sigintHandler);
		}

		// Flush any pending events before cleanup
		await emitter.flush();

		// Cleanup renderer subscription
		rendererSubscription.unsubscribe();
		renderer.dispose();

		// Cleanup debugger if it was created
		if (workflowDebugger) {
			await workflowDebugger.stop();
			workflowDebugger.dispose();
		}

		// Always cleanup graph resources
		await graph.cleanup();
	}
}
