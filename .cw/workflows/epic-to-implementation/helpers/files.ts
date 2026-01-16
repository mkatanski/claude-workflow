/**
 * File I/O helper factories for workflow steps.
 */

import type {
	StepDefinition,
	WorkflowBuilder,
} from "../../../../src/types/index.ts";

/**
 * Options for read file step.
 */
export interface ReadFileOptions {
	output: string;
	allowEmpty?: boolean;
	onError?: "stop" | "continue";
}

/**
 * Read a file into a variable.
 */
export function readFile(
	t: WorkflowBuilder,
	label: string,
	path: string,
	options: ReadFileOptions,
): StepDefinition {
	const { allowEmpty = false, output, onError } = options;
	const command = allowEmpty
		? `cat ${path} 2>/dev/null || echo ''`
		: `cat ${path}`;
	return t.step(`Read ${label}`, t.bash(command), { output, onError });
}

/**
 * Options for save file step.
 */
export interface SaveFileOptions {
	onError?: "stop" | "continue";
}

/**
 * Save content to a file using a heredoc.
 * Note: contentVar should be the variable name without braces.
 */
export function saveFile(
	t: WorkflowBuilder,
	label: string,
	path: string,
	contentVar: string,
	options: SaveFileOptions = {},
): StepDefinition {
	const delimiter = `${label.toUpperCase().replace(/[^A-Z]/g, "_")}_EOF`;
	return t.step(
		`Save ${label}`,
		t.bash(`cat > ${path} << '${delimiter}'
{${contentVar}}
${delimiter}
echo "${label} saved"`),
		{ onError: options.onError },
	);
}

/**
 * Options for append file step.
 */
export interface AppendFileOptions {
	onError?: "stop" | "continue";
}

/**
 * Append content to a file.
 */
export function appendFile(
	t: WorkflowBuilder,
	label: string,
	path: string,
	content: string,
	options: AppendFileOptions = {},
): StepDefinition {
	return t.step(
		`Append ${label}`,
		t.bash(`cat >> ${path} << 'EOF'
${content}
EOF`),
		{ onError: options.onError },
	);
}

/**
 * Ensure a directory exists.
 */
export function ensureDir(t: WorkflowBuilder, path: string): StepDefinition {
	return t.step(`Ensure dir: ${path}`, t.bash(`mkdir -p ${path}`));
}

/**
 * Create a file with initial content using heredoc.
 */
export function createFile(
	t: WorkflowBuilder,
	label: string,
	path: string,
	content: string,
): StepDefinition {
	return t.step(
		`Create ${label}`,
		t.bash(`cat > ${path} << 'EOF'
${content}
EOF
echo "${label} created"`),
	);
}

/**
 * Check if a file exists.
 */
export function fileExists(
	t: WorkflowBuilder,
	label: string,
	path: string,
	outputVar: string,
): StepDefinition {
	return t.step(
		`Check ${label} exists`,
		t.bash(`[ -f "${path}" ] && echo true || echo false`),
		{ output: outputVar },
	);
}

/**
 * Check if a file is non-empty.
 */
export function fileNotEmpty(
	t: WorkflowBuilder,
	label: string,
	path: string,
	outputVar: string,
): StepDefinition {
	return t.step(
		`Check ${label} not empty`,
		t.bash(`[ -s "${path}" ] && echo true || echo false`),
		{ output: outputVar },
	);
}
