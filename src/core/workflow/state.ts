/**
 * LangGraph state definitions for workflow execution.
 */

import { Annotation } from "@langchain/langgraph";
import type { LoopSignal } from "../../types/index.ts";

/**
 * Loop context for tracking nested loop state.
 */
export interface LoopContext {
	type: "forEach" | "while" | "range" | "retry";
	source?: unknown[];
	currentIndex: number;
	itemVar?: string;
	indexVar?: string;
	maxIndex?: number;
	condition?: string;
	maxAttempts?: number;
	attempt?: number;
	until?: string;
}

/**
 * Workflow execution state.
 */
export const WorkflowState = Annotation.Root({
	/**
	 * Variables stored during execution.
	 */
	variables: Annotation<Record<string, unknown>>({
		reducer: (current, update) => ({ ...current, ...update }),
		default: () => ({}),
	}),

	/**
	 * Current step index being executed.
	 */
	currentStepIndex: Annotation<number>({
		reducer: (_, update) => update,
		default: () => 0,
	}),

	/**
	 * Current step name for display.
	 */
	currentStepName: Annotation<string>({
		reducer: (_, update) => update,
		default: () => "",
	}),

	/**
	 * Stack of loop contexts for nested loops.
	 */
	loopStack: Annotation<LoopContext[]>({
		reducer: (_, update) => update,
		default: () => [],
	}),

	/**
	 * Signal for loop control flow.
	 */
	signal: Annotation<LoopSignal>({
		reducer: (_, update) => update,
		default: () => "none" as LoopSignal,
	}),

	/**
	 * Whether execution has completed.
	 */
	completed: Annotation<boolean>({
		reducer: (_, update) => update,
		default: () => false,
	}),

	/**
	 * Error message if execution failed.
	 */
	error: Annotation<string | null>({
		reducer: (_, update) => update,
		default: () => null,
	}),

	/**
	 * Goto target step name (for jump operations).
	 */
	gotoTarget: Annotation<string | null>({
		reducer: (_, update) => update,
		default: () => null,
	}),
});

/**
 * Type alias for the workflow state type.
 */
export type WorkflowStateType = typeof WorkflowState.State;
