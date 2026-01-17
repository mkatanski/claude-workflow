/**
 * Story Loop Nodes
 *
 * Handles story implementation with test retry loop:
 * - implementStory: Run antipatterns, implement, code review
 * - runTests: Execute lint and tests
 * - fixTests: Fix failing tests and learn from failure
 * - nextStory: Move to next story
 */

import type {
	WorkflowStateType,
	WorkflowStateUpdate,
} from "../../../../src/core/graph/state.ts";
import type { WorkflowTools } from "../../../../src/core/graph/tools.ts";
import {
	state,
	stateError,
	stateVars,
	updateAt,
} from "../../../../src/core/utils/index.js";
import {
	DEFAULT_CONFIG,
	getArchitecture,
	getCurrentStory,
	getCurrentStoryIndex,
	getStories,
	getTestLoop,
	StateKeys,
} from "../state.ts";
import type { Story, TestLoopState, WorkflowConfig } from "../types.ts";

/**
 * Implement story node: Run implementation for current story.
 *
 * - Runs /antipatterns review
 * - Runs /implement-story skill
 * - Runs /code-review skill
 * - Resets test retry count
 */
export async function implementStory(
	_state: WorkflowStateType,
	tools: WorkflowTools,
): Promise<WorkflowStateUpdate> {
	const story = getCurrentStory(tools);
	const storyIndex = getCurrentStoryIndex(tools);
	const architecture = getArchitecture(tools);
	const config =
		tools.getVar<WorkflowConfig>(StateKeys.config) ?? DEFAULT_CONFIG;

	if (!story) {
		return stateError("No current story found");
	}

	const storiesTotal = getStories(tools).length;

	tools.log(
		`STORY ${storyIndex + 1}/${storiesTotal}: ${story.id} - ${story.title}`,
	);

	// Step 1: Antipatterns review
	tools.log("Reviewing antipatterns...", "debug");
	const antipatResult = await tools.claude(
		`Use the /antipatterns skill to review known antipatterns before implementing story "${story.id}".

Focus on patterns relevant to:
- ${story.title}
- ${story.description}

Output a brief summary of relevant antipatterns to avoid.`,
	);

	if (!antipatResult.success) {
		tools.log("Antipatterns review skipped", "warn");
	}

	// Step 2: Implement story
	tools.log("Implementing story...");
	const storyJson = JSON.stringify(story, null, 2);
	const archDoc =
		architecture?.document ?? "No architecture document available";

	const implementResult = await tools.claude(
		`Use the /implement-story skill to implement this story.

## Story
\`\`\`json
${storyJson}
\`\`\`

## Architecture
${archDoc.slice(0, 5000)}

## Acceptance Criteria
${story.acceptanceCriteria.map((c) => `- ${c}`).join("\n")}

${story.implementationHints?.length ? `## Implementation Hints\n${story.implementationHints.map((h) => `- ${h}`).join("\n")}` : ""}

Focus on:
1. Following the architecture patterns
2. Meeting all acceptance criteria
3. Writing clean, testable code

Output "IMPLEMENTED" when done.`,
	);

	if (!implementResult.success) {
		return stateError(`Story implementation failed: ${implementResult.error}`);
	}

	// Step 3: Code review
	tools.log("Running code review...", "debug");
	const reviewResult = await tools.claude(
		`Use the /code-review skill to review the implementation of story "${story.id}".

Check:
1. Code correctness and completeness
2. Adherence to architecture patterns
3. Error handling
4. Test coverage
5. Security considerations

Fix any issues found automatically.

Output "REVIEWED" when done.`,
	);

	if (!reviewResult.success) {
		tools.log("Code review completed with issues", "warn");
	}

	// Update story status using updateAt helper and reset test loop
	const stories = getStories(tools);
	const updatedStories = updateAt(stories, storyIndex, {
		status: "in_progress" as const,
	});

	const testLoop: TestLoopState = {
		retryCount: 0,
		passed: false,
		lintPassed: false,
		lastOutput: "",
		lastLintOutput: "",
	};

	return stateVars({
		[StateKeys.stories]: updatedStories,
		[StateKeys.testLoop]: testLoop,
	});
}

/**
 * Run tests node: Execute lint and test suite.
 *
 * - Runs eslint with auto-fix
 * - Runs test suite
 * - Updates test loop state
 */
export async function runTests(
	_state: WorkflowStateType,
	tools: WorkflowTools,
): Promise<WorkflowStateUpdate> {
	const testLoop = getTestLoop(tools);
	const story = getCurrentStory(tools);

	tools.log(`Test attempt ${testLoop.retryCount + 1}...`);

	// Step 1: Run lint with auto-fix
	tools.log("Running lint...", "debug");
	const lintResult = await tools.bash(
		'npx eslint . --fix --ext .ts,.tsx,.js,.jsx 2>&1 || echo "LINT_ERRORS"',
		{ stripOutput: false },
	);

	const lintOutput = lintResult.output;
	const lintPassed =
		!lintOutput.includes("LINT_ERRORS") && !lintOutput.includes("error");

	if (lintPassed) {
		tools.log("Lint passed", "debug");
	} else {
		tools.log("Lint errors found", "warn");
	}

	// Step 2: Run tests
	tools.log("Running tests...", "debug");
	const testResult = await tools.bash(
		'npm test 2>&1 || bun test 2>&1 || pytest 2>&1 || echo "TEST_FAILED"',
		{ stripOutput: false },
	);

	const testOutput = testResult.output;
	const testsPassed =
		!testOutput.includes("TEST_FAILED") &&
		!testOutput.includes("FAILED") &&
		!testOutput.includes("Error:") &&
		(testOutput.includes("passed") ||
			testOutput.includes("✓") ||
			testOutput.includes("OK"));

	if (testsPassed && lintPassed) {
		tools.log("All tests passed");
	} else if (!testsPassed) {
		tools.log("Test failures detected", "warn");
	}

	const updatedTestLoop: TestLoopState = {
		...testLoop,
		passed: testsPassed && lintPassed,
		lintPassed,
		lastOutput: testOutput,
		lastLintOutput: lintOutput,
	};

	return stateVars({
		[StateKeys.testLoop]: updatedTestLoop,
	});
}

/**
 * Fix tests node: Attempt to fix failing tests.
 *
 * - Runs /fix-tests skill
 * - Runs /learn-from-failure skill
 * - Increments retry count
 */
export async function fixTests(
	_state: WorkflowStateType,
	tools: WorkflowTools,
): Promise<WorkflowStateUpdate> {
	const testLoop = getTestLoop(tools);
	const story = getCurrentStory(tools);

	tools.log("Attempting to fix tests...");

	// Run fix-tests skill
	const fixResult = await tools.claude(
		`Use the /fix-tests skill to analyze and fix the failing tests.

## Test Output
\`\`\`
${testLoop.lastOutput.slice(0, 3000)}
\`\`\`

## Lint Output
\`\`\`
${testLoop.lastLintOutput.slice(0, 1000)}
\`\`\`

Identify the root cause and fix either:
1. The implementation code if it has bugs
2. The test code if expectations are wrong

Output "FIXED" when done.`,
	);

	if (!fixResult.success) {
		tools.log("Fix attempt completed with issues", "warn");
	}

	// Run learn-from-failure skill
	tools.log("Learning from failure...", "debug");
	const learnResult = await tools.claude(
		`Use the /learn-from-failure skill to record this test failure pattern.

## Test Output
\`\`\`
${testLoop.lastOutput.slice(0, 2000)}
\`\`\`

Document the antipattern to prevent similar failures in the future.

Output "LEARNED" when done.`,
	);

	if (!learnResult.success) {
		tools.log("Learning step skipped", "warn");
	}

	// Increment retry count
	const updatedTestLoop: TestLoopState = {
		...testLoop,
		retryCount: testLoop.retryCount + 1,
	};

	return stateVars({
		[StateKeys.testLoop]: updatedTestLoop,
	});
}

/**
 * Next story node: Move to the next story.
 *
 * - Marks current story as completed/failed
 * - Increments story index
 * - Resets test loop state
 */
export async function nextStory(
	_state: WorkflowStateType,
	tools: WorkflowTools,
): Promise<WorkflowStateUpdate> {
	const stories = getStories(tools);
	const storyIndex = getCurrentStoryIndex(tools);
	const testLoop = getTestLoop(tools);

	const story = stories[storyIndex];
	if (!story) {
		return stateError("No current story found");
	}

	// Update story status
	const status = testLoop.passed ? "completed" : "failed";

	if (testLoop.passed) {
		tools.log(`Story ${story.id}: completed`);
	} else {
		tools.log(`Story ${story.id}: failed`, "warn");
	}

	// Update story using updateAt helper
	const updatedStories = updateAt(stories, storyIndex, {
		status: status as "completed" | "failed",
		testsPassed: testLoop.passed,
	});

	// Reset test loop for next story
	const resetTestLoop: TestLoopState = {
		retryCount: 0,
		passed: false,
		lintPassed: false,
		lastOutput: "",
		lastLintOutput: "",
	};

	return state()
		.set(StateKeys.stories, updatedStories)
		.set(StateKeys.currentStoryIndex, storyIndex + 1)
		.set(StateKeys.testLoop, resetTestLoop)
		.build();
}
