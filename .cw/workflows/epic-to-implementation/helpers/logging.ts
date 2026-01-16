/**
 * Logging helper factories for workflow steps.
 */

import type {
	StepDefinition,
	WorkflowBuilder,
} from "../../../../src/types/index.ts";

/**
 * Options for log phase step.
 */
export interface LogPhaseOptions {
	visible?: boolean;
}

/**
 * Log a phase header with separator lines.
 */
export function logPhase(
	t: WorkflowBuilder,
	phaseName: string,
	options: LogPhaseOptions = {},
): StepDefinition {
	const { visible = true } = options;
	return t.step(
		`Log phase: ${phaseName}`,
		t.bash(`echo ""
echo "========================================"
echo "${phaseName}"
echo "========================================"
echo ""`),
		{ visible },
	);
}

/**
 * Options for log message step.
 */
export interface LogMessageOptions {
	visible?: boolean;
}

/**
 * Log a simple message.
 */
export function logMessage(
	t: WorkflowBuilder,
	message: string,
	options: LogMessageOptions = {},
): StepDefinition {
	const { visible = true } = options;
	return t.step(`Log: ${message}`, t.bash(`echo "${message}"`), { visible });
}

/**
 * Key-value pair for logging.
 */
export interface LogKeyValue {
	key: string;
	varName: string;
}

/**
 * Options for log key-values step.
 */
export interface LogKeyValuesOptions {
	visible?: boolean;
}

/**
 * Log key-value pairs.
 */
export function logKeyValues(
	t: WorkflowBuilder,
	label: string,
	pairs: LogKeyValue[],
	options: LogKeyValuesOptions = {},
): StepDefinition {
	const { visible = true } = options;
	const echoLines = pairs
		.map((p) => `echo "${p.key}: {${p.varName}}"`)
		.join("\n");
	return t.step(
		`Log ${label}`,
		t.bash(`echo ""
echo "=== ${label} ==="
${echoLines}
echo ""`),
		{ visible },
	);
}

/**
 * Options for log completion step.
 */
export interface LogCompletionOptions {
	visible?: boolean;
}

/**
 * Log completion with summary lines.
 */
export function logCompletion(
	t: WorkflowBuilder,
	title: string,
	summaryLines: string[],
	options: LogCompletionOptions = {},
): StepDefinition {
	const { visible = true } = options;
	const lines = summaryLines.map((l) => `echo "${l}"`).join("\n");
	return t.step(
		`Log completion: ${title}`,
		t.bash(`echo ""
echo "=========================================="
echo "${title}"
echo "=========================================="
echo ""
${lines}
echo ""`),
		{ visible },
	);
}

/**
 * Log a separator line.
 */
export function logSeparator(
	t: WorkflowBuilder,
	char = "=",
	length = 40,
): StepDefinition {
	const line = char.repeat(length);
	return t.step(`Log separator`, t.bash(`echo "${line}"`), { visible: true });
}
