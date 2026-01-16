/**
 * Testing and linting helper factories for workflow steps.
 */

import type {
	StepDefinition,
	WorkflowBuilder,
} from "../../../../src/types/index.ts";

/**
 * Options for lint step.
 */
export interface LintOptions {
	output?: string;
	onError?: "stop" | "continue";
}

/**
 * Run lint with auto-fix.
 */
export function runLint(
	t: WorkflowBuilder,
	options: LintOptions = {},
): StepDefinition {
	return t.step(
		"Run lint",
		t.bash("npx eslint . --fix 2>&1 || bun lint --fix 2>&1 || true"),
		{
			output: options.output ?? "lint_output",
			onError: options.onError ?? "continue",
		},
	);
}

/**
 * Check if lint output indicates errors.
 */
export function checkLintPassed(
	t: WorkflowBuilder,
	outputVar: string,
	lintOutputVar = "lint_output",
): StepDefinition {
	return t.step(
		"Check lint passed",
		t.bash(
			`echo "{${lintOutputVar}}" | grep -qiE "error" && echo false || echo true`,
		),
		{ output: outputVar },
	);
}

/**
 * Options for test step.
 */
export interface TestOptions {
	output?: string;
	onError?: "stop" | "continue";
}

/**
 * Run tests using available test runner.
 */
export function runTests(
	t: WorkflowBuilder,
	options: TestOptions = {},
): StepDefinition {
	return t.step(
		"Run tests",
		t.bash("bun test 2>&1 || npm test 2>&1 || echo 'No tests found'"),
		{
			output: options.output ?? "test_output",
			onError: options.onError ?? "continue",
		},
	);
}

/**
 * Check if test output indicates failures.
 */
export function checkTestsPassed(
	t: WorkflowBuilder,
	outputVar: string,
	testOutputVar = "test_output",
): StepDefinition {
	return t.step(
		"Check tests passed",
		t.bash(
			`echo "{${testOutputVar}}" | grep -qiE "failed|error|FAIL" && echo false || echo true`,
		),
		{ output: outputVar },
	);
}

/**
 * Evaluate overall test status (passed/failed string).
 */
export function evaluateTestStatus(
	t: WorkflowBuilder,
	testPassedVar: string,
	outputVar = "test_status",
): StepDefinition {
	return t.step(
		"Evaluate test results",
		t.bash(`if [ "{${testPassedVar}}" = "true" ]; then
  echo "passed"
else
  echo "failed"
fi`),
		{ output: outputVar },
	);
}

/**
 * Complete lint and test cycle with all steps.
 */
export function lintAndTestCycle(
	t: WorkflowBuilder,
	prefix = "",
): StepDefinition[] {
	const lintOutput = prefix ? `${prefix}_lint_output` : "lint_output";
	const lintPassed = prefix ? `${prefix}_lint_passed` : "lint_passed";
	const testOutput = prefix ? `${prefix}_test_output` : "test_output";
	const testsPassed = prefix ? `${prefix}_tests_passed` : "tests_passed";

	return [
		runLint(t, { output: lintOutput }),
		checkLintPassed(t, lintPassed, lintOutput),
		runTests(t, { output: testOutput }),
		checkTestsPassed(t, testsPassed, testOutput),
	];
}

/**
 * Log test attempt header.
 */
export function logTestAttempt(
	t: WorkflowBuilder,
	retryCountVar = "test_retry_count",
): StepDefinition {
	return t.step(
		"Log test attempt",
		t.bash(`echo '--- Test Run (attempt {${retryCountVar}}) ---'`),
		{ visible: true },
	);
}

/**
 * Increment test retry counter.
 */
export function incrementTestRetry(
	t: WorkflowBuilder,
	retryCountVar = "test_retry_count",
): StepDefinition {
	return t.step(
		"Increment test retry",
		t.bash(`echo $(( {${retryCountVar}} + 1 ))`),
		{ output: retryCountVar },
	);
}
