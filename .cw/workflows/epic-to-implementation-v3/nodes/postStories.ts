/**
 * Post-Stories Nodes
 *
 * Handles drift checking and architecture updates after stories:
 * - checkDrift: Run drift check against architecture
 * - fixDrift: Fix architectural violations
 * - updateArchitecture: Update architecture with valid improvements
 */

import type { WorkflowStateType } from "../../../../src/core/graph/state.ts";
import type { WorkflowTools } from "../../../../src/core/graph/tools.ts";
import type { WorkflowStateUpdate } from "../../../../src/core/graph/state.ts";
import {
	StateKeys,
	DEFAULT_CONFIG,
	getArchitecture,
	getDrift,
} from "../state.ts";
import { driftCheckSchema } from "../schemas/index.ts";
import type {
	DriftState,
	DriftIssue,
	ArchitectureState,
	WorkflowConfig,
} from "../types.ts";

/**
 * Check drift node: Run drift check against architecture.
 *
 * - Runs /check-drift skill
 * - Categorizes issues (keep, fix, defer, remove)
 * - Updates drift state
 */
export async function checkDrift(
	_state: WorkflowStateType,
	tools: WorkflowTools,
): Promise<WorkflowStateUpdate> {
	const config = tools.getVar<WorkflowConfig>(StateKeys.config) ?? DEFAULT_CONFIG;
	const architecture = getArchitecture(tools);

	tools.log("Checking for architectural drift...");

	if (!architecture) {
		tools.log("No architecture document, skipping drift check", "debug");
		return {
			variables: {
				[StateKeys.drift]: {
					fixCount: 0,
					aligned: true,
					issues: [],
					keepImprovements: [],
				},
				[StateKeys.phase]: "post_stories",
			},
		};
	}

	// Run check-drift skill
	const driftResult = await tools.claude(
		`Use the /check-drift skill to check implementation against the architecture document.

The architecture document is at: ${config.outputDir}/architecture.md

Categorize any deviations found as:
- **keep**: Valid improvements to preserve
- **fix**: Violations that need correction
- **defer**: Future work to address later
- **remove**: Unnecessary code to remove

Save the drift analysis to: ${config.outputDir}/drift-analysis.json

Output only "SAVED" when done.`,
	);

	// Try to read the drift analysis file
	const readResult = await tools.bash(
		`cat "${config.outputDir}/drift-analysis.json" 2>/dev/null || echo "{}"`,
		{ stripOutput: false },
	);

	let driftData: { aligned: boolean; issues: DriftIssue[] };

	try {
		driftData = JSON.parse(readResult.output) as typeof driftData;
	} catch {
		// Fallback: Use claudeSdk to analyze
		const sdkResult = await tools.claudeSdk<{ aligned: boolean; issues: DriftIssue[] }>(
			`Analyze the current implementation for architectural drift.

Architecture summary (first 2000 chars):
${architecture.document.slice(0, 2000)}

Check for:
1. Deviations from defined patterns
2. Missing implementations
3. Improvements that should be kept
4. Unnecessary code to remove

Provide your analysis.`,
			{
				outputType: "schema",
				schema: driftCheckSchema,
			},
		);

		driftData = sdkResult.data ?? { aligned: true, issues: [] };
	}

	// Categorize issues
	const fixIssues = driftData.issues.filter((i) => i.category === "fix");
	const keepIssues = driftData.issues.filter((i) => i.category === "keep");
	const deferIssues = driftData.issues.filter((i) => i.category === "defer");
	const removeIssues = driftData.issues.filter((i) => i.category === "remove");

	tools.log(`Drift Analysis: ${driftData.aligned ? "aligned" : "needs fixes"}`);
	tools.log(`Fix: ${fixIssues.length}, Keep: ${keepIssues.length}, Defer: ${deferIssues.length}, Remove: ${removeIssues.length}`, "debug");

	const drift: DriftState = {
		fixCount: 0,
		aligned: driftData.aligned && fixIssues.length === 0,
		issues: driftData.issues,
		keepImprovements: keepIssues,
	};

	return {
		variables: {
			[StateKeys.drift]: drift,
			[StateKeys.phase]: "post_stories",
		},
	};
}

/**
 * Fix drift node: Correct architectural violations.
 *
 * - Runs /fix-drift skill
 * - Re-runs tests
 * - Increments fix count
 */
export async function fixDrift(
	_state: WorkflowStateType,
	tools: WorkflowTools,
): Promise<WorkflowStateUpdate> {
	const drift = getDrift(tools);
	const config = tools.getVar<WorkflowConfig>(StateKeys.config) ?? DEFAULT_CONFIG;

	const fixIssues = drift.issues.filter((i) => i.category === "fix");

	tools.log(`Fixing drift issues (attempt ${drift.fixCount + 1}): ${fixIssues.length} issues`);

	// Run fix-drift skill
	const fixResult = await tools.claude(
		`Use the /fix-drift skill to fix the following architectural drift issues:

${fixIssues.map((i) => `- ${i.description}: ${i.recommendation}`).join("\n")}

The architecture document is at: ${config.outputDir}/architecture.md

Fix each issue according to its recommendation.

Output "FIXED" when done.`,
	);

	if (!fixResult.success) {
		tools.log("Fix attempt completed with issues", "warn");
	}

	// Re-run tests after fixes
	tools.log("Re-running tests...", "debug");
	const testResult = await tools.bash(
		'npm test 2>&1 || bun test 2>&1 || pytest 2>&1 || echo "TEST_FAILED"',
		{ stripOutput: false },
	);

	const testsPassed =
		!testResult.output.includes("TEST_FAILED") &&
		!testResult.output.includes("FAILED");

	if (testsPassed) {
		tools.log("Tests still passing", "debug");
	} else {
		tools.log("Tests may have regressed", "warn");
	}

	// Update drift state
	const updatedDrift: DriftState = {
		...drift,
		fixCount: drift.fixCount + 1,
	};

	return {
		variables: {
			[StateKeys.drift]: updatedDrift,
		},
	};
}

/**
 * Update architecture node: Incorporate valid improvements.
 *
 * - Runs /update-architecture skill if improvements found
 * - Saves updated architecture document
 */
export async function updateArchitecture(
	_state: WorkflowStateType,
	tools: WorkflowTools,
): Promise<WorkflowStateUpdate> {
	const config = tools.getVar<WorkflowConfig>(StateKeys.config) ?? DEFAULT_CONFIG;
	const architecture = getArchitecture(tools);
	const drift = getDrift(tools);

	if (!architecture) {
		return {
			variables: {
				[StateKeys.phase]: "post_stories",
			},
		};
	}

	const keepImprovements = drift.keepImprovements;

	if (keepImprovements.length === 0) {
		tools.log("No architecture updates needed", "debug");
		return {
			variables: {
				[StateKeys.phase]: "post_stories",
			},
		};
	}

	tools.log(`Updating architecture with ${keepImprovements.length} improvements...`);

	// Run update-architecture skill
	const updateResult = await tools.claude(
		`Use the /update-architecture skill to incorporate these valid improvements into the architecture:

${keepImprovements.map((i) => `- ${i.description}: ${i.recommendation}`).join("\n")}

The architecture document is at: ${config.outputDir}/architecture.md

Update the document to reflect these improvements while maintaining its overall structure.

Output "UPDATED" when done.`,
	);

	if (!updateResult.success) {
		tools.log("Architecture update completed with issues", "warn");
	}

	// Read updated architecture
	const readResult = await tools.bash(
		`cat "${config.outputDir}/architecture.md"`,
		{ stripOutput: false },
	);

	const updatedArchitecture: ArchitectureState = {
		document: readResult.output || architecture.document,
		version: architecture.version + 1,
		pendingUpdates: [],
	};

	tools.log(`Architecture updated to v${updatedArchitecture.version}`);

	return {
		variables: {
			[StateKeys.architecture]: updatedArchitecture,
			[StateKeys.phase]: "post_stories",
		},
	};
}
