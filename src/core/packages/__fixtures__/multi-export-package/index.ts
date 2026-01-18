/**
 * Multi-Export Workflow Package
 *
 * A workflow package with multiple exports for integration testing.
 * Demonstrates the multi-export pattern with default and named exports.
 *
 * EXPORTS:
 * - default: Main deployment workflow
 * - createStagingWorkflow: Staging deployment workflow
 * - createRollbackWorkflow: Rollback workflow for recovery
 */

import type { LangGraphWorkflowDefinition } from "../../../graph/types.ts";

// ============================================================================
// Default Workflow - Production Deployment
// ============================================================================

/**
 * Production Deployment Workflow Definition
 *
 * The default workflow for production deployments.
 */
const productionWorkflow: LangGraphWorkflowDefinition = {
	name: "Production Deployment",
	version: "2.1.0",
	description: "Deploy to production environment",
	vars: {
		environment: "production",
		dryRun: false,
	},
	build(graph) {
		graph.addNode("validate", async (state, _tools) => {
			return {
				variables: {
					validated: true,
					environment: state.environment,
				},
			};
		});

		graph.addNode("deploy", async (state, _tools) => {
			return {
				variables: {
					deployed: !state.dryRun,
					deploymentId: `deploy-${Date.now()}`,
				},
			};
		});

		graph.addNode("notify", async (_state, _tools) => {
			return {
				variables: {
					notified: true,
				},
			};
		});

		graph.addEdge("__start__", "validate");
		graph.addEdge("validate", "deploy");
		graph.addEdge("deploy", "notify");
		graph.addEdge("notify", "__end__");
	},
};

/**
 * Default export - Production deployment workflow factory.
 */
export default () => productionWorkflow;

// ============================================================================
// Named Export - Staging Deployment
// ============================================================================

/**
 * Staging Deployment Workflow Definition
 *
 * A workflow for deploying to the staging environment.
 */
const stagingWorkflow: LangGraphWorkflowDefinition = {
	name: "Staging Deployment",
	version: "2.1.0",
	description: "Deploy to staging environment for testing",
	vars: {
		environment: "staging",
		runTests: true,
	},
	build(graph) {
		graph.addNode("build", async (_state, _tools) => {
			return {
				variables: {
					buildId: `build-${Date.now()}`,
				},
			};
		});

		graph.addNode("test", async (state, _tools) => {
			return {
				variables: {
					testsPassed: state.runTests,
				},
			};
		});

		graph.addNode("deploy", async (state, _tools) => {
			return {
				variables: {
					deployed: true,
					environment: state.environment,
				},
			};
		});

		graph.addEdge("__start__", "build");
		graph.addEdge("build", "test");
		graph.addEdge("test", "deploy");
		graph.addEdge("deploy", "__end__");
	},
};

/**
 * Named export - Staging deployment workflow factory.
 */
export function createStagingWorkflow(): LangGraphWorkflowDefinition {
	return stagingWorkflow;
}

// ============================================================================
// Named Export - Rollback Workflow
// ============================================================================

/**
 * Rollback Workflow Definition
 *
 * A workflow for rolling back failed deployments.
 */
const rollbackWorkflow: LangGraphWorkflowDefinition = {
	name: "Rollback Deployment",
	version: "2.1.0",
	description: "Rollback a failed deployment to the previous version",
	vars: {
		targetVersion: "previous",
		notifyTeam: true,
	},
	build(graph) {
		graph.addNode("identify", async (state, _tools) => {
			return {
				variables: {
					previousVersion:
						state.targetVersion === "previous" ? "v1.0.0" : state.targetVersion,
				},
			};
		});

		graph.addNode("rollback", async (state, _tools) => {
			return {
				variables: {
					rolledBack: true,
					version: state.previousVersion,
				},
			};
		});

		graph.addNode("verify", async (_state, _tools) => {
			return {
				variables: {
					healthy: true,
				},
			};
		});

		graph.addNode("notify", async (state, _tools) => {
			return {
				variables: {
					notified: state.notifyTeam,
				},
			};
		});

		graph.addEdge("__start__", "identify");
		graph.addEdge("identify", "rollback");
		graph.addEdge("rollback", "verify");
		graph.addEdge("verify", "notify");
		graph.addEdge("notify", "__end__");
	},
};

/**
 * Named export - Rollback workflow factory.
 */
export function createRollbackWorkflow(): LangGraphWorkflowDefinition {
	return rollbackWorkflow;
}
