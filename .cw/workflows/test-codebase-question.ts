/**
 * Test workflow: Ask Claude about the codebase using agentSession
 *
 * Simple workflow that uses agentSession (Claude Code) to answer a question about the project.
 * Uses your Max plan subscription - no API key needed.
 */

import type { LangGraphWorkflowDefinition } from "../../src/core/graph/types.ts";
import { START, END } from "../../src/core/graph/workflowGraph.ts";

const workflow: LangGraphWorkflowDefinition = {
  name: "Test Codebase Question",
  description: "Ask Claude about the codebase using agentSession",

  build(graph) {
    // Single node: Ask Claude about the project
    graph.addNode("ask-claude", async (state, tools) => {
      tools.log("Asking Claude about the project...");

      const result = await tools.agentSession(
        `Read the package.json file and tell me:
1. What is this project called?
2. What does it do (1-2 sentences)?
3. What are the main technologies used?

Keep your response brief and to the point.`,
        {
          label: "Analyze codebase",
          model: "sonnet",
          permissionMode: "bypassPermissions",
        }
      );

      if (!result.success) {
        tools.log(`Agent session failed: ${result.error}`, "error");
        return { variables: { error: result.error } };
      }

      return {
        variables: {
          analysis: result.output,
          messageCount: result.messages.length,
          duration: result.duration,
        },
      };
    });

    // Wire up edges
    graph.addEdge(START, "ask-claude");
    graph.addEdge("ask-claude", END);
  },
};

export default () => workflow;
