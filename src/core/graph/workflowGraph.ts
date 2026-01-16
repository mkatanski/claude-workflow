/**
 * WorkflowGraph wrapper class for LangGraph StateGraph.
 *
 * This class wraps LangGraph's StateGraph and provides a simpler API
 * for building workflows. It handles tool injection into node functions
 * via the closure pattern at compile time.
 */

import { StateGraph, START, END } from "@langchain/langgraph";
import {
	WorkflowState,
	type WorkflowStateType,
	type WorkflowStateUpdate,
} from "./state.ts";
import type { WorkflowTools } from "./tools.ts";
import {
	createWorkflowTools,
	type WorkflowToolsConfig,
} from "./workflowTools.ts";
import type { TmuxManager } from "../tmux/manager.ts";
import type {
	ClaudeConfig,
	ClaudeSdkConfig,
	TmuxConfig,
} from "../../types/index.ts";
import { ServerManager } from "../server/manager.ts";
import { TmuxManager as TmuxManagerImpl } from "../tmux/manager.ts";

/**
 * Type for compiled workflow graph.
 */
type CompiledWorkflowGraph = Awaited<
	ReturnType<StateGraph<typeof WorkflowState>["compile"]>
>;

/**
 * Node function signature with tools injection.
 *
 * Node functions receive the current state and tools instance,
 * and return a partial state update.
 */
export type NodeFunction = (
	state: WorkflowStateType,
	tools: WorkflowTools,
) => Promise<WorkflowStateUpdate> | WorkflowStateUpdate;

/**
 * Routing function signature for conditional edges.
 *
 * Routing functions receive the current state and tools instance,
 * and return the name of the next node to transition to.
 */
export type RoutingFunction = (
	state: WorkflowStateType,
	tools: WorkflowTools,
) => Promise<string> | string;

/**
 * Configuration for WorkflowGraph.
 */
export interface WorkflowGraphConfig {
	/** Project root path */
	projectPath: string;
	/** Temporary directory for workflow files */
	tempDir: string;
	/** Claude Code configuration */
	claudeConfig?: ClaudeConfig;
	/** Claude SDK configuration */
	claudeSdkConfig?: ClaudeSdkConfig;
	/** Tmux configuration */
	tmuxConfig?: TmuxConfig;
	/** Whether to run in verbose mode */
	verbose?: boolean;
}

/**
 * Internal storage for node registration before compilation.
 */
interface NodeRegistration {
	name: string;
	fn: NodeFunction;
}

/**
 * Internal storage for edge registration.
 */
interface EdgeRegistration {
	from: string;
	to: string;
}

/**
 * Internal storage for conditional edge registration.
 */
interface ConditionalEdgeRegistration {
	source: string;
	router: RoutingFunction;
	paths?: Record<string, string>;
}

/**
 * WorkflowGraph wraps LangGraph StateGraph and provides:
 * - Simplified API for node and edge registration
 * - Automatic tool injection into node functions
 * - TmuxManager lifecycle management
 */
export class WorkflowGraph {
	private config: WorkflowGraphConfig;
	private toolsConfig: WorkflowToolsConfig;
	private nodes: Map<string, NodeRegistration>;
	private edges: EdgeRegistration[];
	private conditionalEdges: ConditionalEdgeRegistration[];
	private serverManager: ServerManager | null = null;
	private tmuxManager: TmuxManager | null = null;
	private compiled: CompiledWorkflowGraph | null = null;

	constructor(config: WorkflowGraphConfig) {
		this.config = config;
		this.toolsConfig = {
			projectPath: config.projectPath,
			tempDir: config.tempDir,
			claudeConfig: config.claudeConfig,
			claudeSdkConfig: config.claudeSdkConfig,
		};
		this.nodes = new Map();
		this.edges = [];
		this.conditionalEdges = [];
	}

	/**
	 * Add a node to the graph.
	 *
	 * @param name - Node name (must be unique)
	 * @param fn - Node function with signature (state, tools) => Partial<state>
	 */
	addNode(name: string, fn: NodeFunction): this {
		if (this.compiled) {
			throw new Error("Cannot add nodes after compilation");
		}

		if (this.nodes.has(name)) {
			throw new Error(`Node "${name}" already exists`);
		}

		this.nodes.set(name, { name, fn });
		return this;
	}

	/**
	 * Add an edge between two nodes.
	 *
	 * @param from - Source node name (use START for entry point)
	 * @param to - Target node name (use END for exit point)
	 */
	addEdge(from: string, to: string): this {
		if (this.compiled) {
			throw new Error("Cannot add edges after compilation");
		}

		this.edges.push({ from, to });
		return this;
	}

	/**
	 * Add conditional edges from a source node.
	 *
	 * @param source - Source node name
	 * @param router - Routing function that returns the next node name
	 * @param paths - Optional mapping of router return values to node names
	 */
	addConditionalEdges(
		source: string,
		router: RoutingFunction,
		paths?: Record<string, string>,
	): this {
		if (this.compiled) {
			throw new Error("Cannot add conditional edges after compilation");
		}

		this.conditionalEdges.push({ source, router, paths });
		return this;
	}

	/**
	 * Initialize tmux and server managers for interactive mode.
	 */
	private async initializeTmux(): Promise<void> {
		if (this.tmuxManager) {
			return; // Already initialized
		}

		// Start server for hook communication
		this.serverManager = new ServerManager();
		await this.serverManager.start();

		// Create TmuxManager
		const tmuxConfig: TmuxConfig = this.config.tmuxConfig ?? {
			split: "horizontal",
		};
		const claudeConfig: ClaudeConfig = this.config.claudeConfig ?? {};

		this.tmuxManager = new TmuxManagerImpl(
			tmuxConfig,
			claudeConfig,
			this.config.projectPath,
			this.serverManager,
			this.config.tempDir,
		);
	}

	/**
	 * Wrap a node function with tools injection.
	 */
	private wrapNode(registration: NodeRegistration) {
		return async (state: WorkflowStateType): Promise<WorkflowStateUpdate> => {
			const { tools, getVariableUpdates } = createWorkflowTools(
				state,
				this.toolsConfig,
				this.tmuxManager ?? undefined,
			);

			try {
				// Execute the node function with tools
				const result = await registration.fn(state, tools);

				// Merge any variable updates made via tools.setVar
				const varUpdates = getVariableUpdates();
				if (Object.keys(varUpdates).length > 0) {
					const existingVars = result.variables ?? {};
					return {
						...result,
						variables: { ...existingVars, ...varUpdates },
					};
				}

				return result;
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.error(`Node "${registration.name}" failed:`, message);
				return {
					error: message,
				};
			}
		};
	}

	/**
	 * Wrap a routing function with tools injection.
	 */
	private wrapRouter(router: RoutingFunction) {
		return async (state: WorkflowStateType): Promise<string> => {
			const { tools } = createWorkflowTools(
				state,
				this.toolsConfig,
				this.tmuxManager ?? undefined,
			);

			return router(state, tools);
		};
	}

	/**
	 * Ensure tmux manager is initialized (lazy initialization).
	 * This is called when a tool that needs tmux is used.
	 */
	async ensureTmuxInitialized(): Promise<TmuxManager> {
		await this.initializeTmux();
		if (!this.tmuxManager) {
			throw new Error("Failed to initialize TmuxManager");
		}
		return this.tmuxManager;
	}

	/**
	 * Compile the graph for execution.
	 *
	 * This method:
	 * 1. Creates the LangGraph StateGraph
	 * 2. Adds all registered nodes with tool injection
	 * 3. Adds all registered edges
	 * 4. Compiles the graph
	 *
	 * @returns Compiled graph ready for invocation
	 */
	async compile(): Promise<CompiledWorkflowGraph> {
		if (this.compiled) {
			return this.compiled;
		}

		// Note: tmux initialization is now lazy - it will be initialized
		// when a tool that needs it is first called

		// Create the StateGraph with explicit typing
		// Using 'any' here because LangGraph's StateGraph has complex generic constraints
		// that make it difficult to add dynamic nodes and edges with proper typing
		// biome-ignore lint/suspicious/noExplicitAny: LangGraph dynamic graph building requires any
		const graph = new StateGraph(WorkflowState) as any;

		// Add all nodes with wrapped functions
		for (const [name, registration] of this.nodes) {
			graph.addNode(name, this.wrapNode(registration));
		}

		// Add all regular edges
		for (const edge of this.edges) {
			if (edge.from === START) {
				graph.addEdge(START, edge.to);
			} else if (edge.to === END) {
				graph.addEdge(edge.from, END);
			} else {
				graph.addEdge(edge.from, edge.to);
			}
		}

		// Add all conditional edges
		for (const condEdge of this.conditionalEdges) {
			const wrappedRouter = this.wrapRouter(condEdge.router);
			if (condEdge.paths) {
				graph.addConditionalEdges(
					condEdge.source,
					wrappedRouter,
					condEdge.paths,
				);
			} else {
				graph.addConditionalEdges(condEdge.source, wrappedRouter);
			}
		}

		// Compile the graph
		this.compiled = graph.compile() as CompiledWorkflowGraph;
		return this.compiled;
	}

	/**
	 * Run the workflow with initial variables.
	 *
	 * @param initialVars - Initial workflow variables
	 * @returns Final workflow state
	 */
	async run(initialVars?: Record<string, unknown>): Promise<WorkflowStateType> {
		const compiled = await this.compile();

		const initialState: WorkflowStateType = {
			variables: initialVars ?? {},
			error: null,
			completed: false,
		};

		try {
			const result = (await compiled.invoke(initialState)) as WorkflowStateType;
			return {
				variables: result.variables,
				error: result.error,
				completed: true,
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return {
				variables: initialVars ?? {},
				error: message,
				completed: false,
			};
		}
	}

	/**
	 * Clean up resources (server, tmux, etc.).
	 */
	async cleanup(): Promise<void> {
		if (this.tmuxManager?.currentPane) {
			await this.tmuxManager.closePane();
		}

		if (this.serverManager) {
			await this.serverManager.stop();
			this.serverManager = null;
		}

		this.tmuxManager = null;
		this.compiled = null;
	}
}

// Re-export START and END for convenience
export { START, END } from "@langchain/langgraph";
