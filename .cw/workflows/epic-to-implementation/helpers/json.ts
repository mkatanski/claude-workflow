/**
 * JSON parsing helper factories for workflow steps.
 */

import type {
	StepDefinition,
	WorkflowBuilder,
} from "../../../../src/types/index.ts";

/**
 * Options for extract field step.
 */
export interface ExtractFieldOptions {
	output?: string;
	onError?: "stop" | "continue";
}

/**
 * Extract a single field from a JSON variable.
 */
export function extractField(
	t: WorkflowBuilder,
	label: string,
	inputVar: string,
	field: string,
	options: ExtractFieldOptions = {},
): StepDefinition {
	const outputVar = options.output ?? field;
	return t.step(
		`Parse ${label}`,
		t.json("query", { input: `{${inputVar}}`, query: field }),
		{ output: outputVar, onError: options.onError },
	);
}

/**
 * Options for count array step.
 */
export interface CountArrayOptions {
	output: string;
	onError?: "stop" | "continue";
}

/**
 * Count the length of a JSON array.
 */
export function countArray(
	t: WorkflowBuilder,
	label: string,
	inputVar: string,
	options: CountArrayOptions,
): StepDefinition {
	return t.step(
		`Count ${label}`,
		t.json("query", { input: `{${inputVar}}`, query: "length(@)" }),
		{ output: options.output, onError: options.onError },
	);
}

/**
 * Options for query JSON step.
 */
export interface QueryJsonOptions {
	output: string;
	onError?: "stop" | "continue";
}

/**
 * Query JSON with a JMESPath expression.
 */
export function queryJson(
	t: WorkflowBuilder,
	label: string,
	inputVar: string,
	query: string,
	options: QueryJsonOptions,
): StepDefinition {
	return t.step(label, t.json("query", { input: `{${inputVar}}`, query }), {
		output: options.output,
		onError: options.onError,
	});
}

/**
 * Options for set default step.
 */
export interface SetDefaultOptions {
	when?: string;
}

/**
 * Set a default value if the variable is empty.
 */
export function setDefaultIfEmpty(
	t: WorkflowBuilder,
	varName: string,
	defaultValue: string,
	options: SetDefaultOptions = {},
): StepDefinition {
	return t.step(`Default ${varName}`, t.set(varName, defaultValue), {
		when: options.when ?? `{${varName}} is empty`,
	});
}

/**
 * Extract multiple fields from JSON into separate variables.
 */
export function extractFields(
	t: WorkflowBuilder,
	inputVar: string,
	fields: Array<{
		field: string;
		output?: string;
		onError?: "stop" | "continue";
	}>,
): StepDefinition[] {
	return fields.map((f) =>
		extractField(t, f.field, inputVar, f.field, {
			output: f.output ?? f.field,
			onError: f.onError,
		}),
	);
}
