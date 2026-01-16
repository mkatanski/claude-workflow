/**
 * Test workflow: Bash tool execution
 *
 * Tests basic bash command execution and state passing.
 */

import type { LangGraphWorkflowDefinition } from "../../src/core/graph/types.ts";
import { START, END } from "../../src/core/graph/workflowGraph.ts";

const workflow: LangGraphWorkflowDefinition = {
  name: "Test Bash",
  description: "Test bash tool execution and output capture",

  build(graph) {
    // Node 1: Run a simple echo command
    graph.addNode("echo", async (state, tools) => {
      const result = await tools.bash("echo 'Hello from bash!'");

      if (!result.success) {
        return { error: result.error };
      }

      return {
        variables: { echoOutput: result.output },
      };
    });

    // Node 2: Run a command that uses the previous output
    graph.addNode("verify", async (state, tools) => {
      const echoOutput = tools.getVar<string>("echoOutput");
      console.log(`Captured output: ${echoOutput}`);

      // Run another command to verify we can chain
      const result = await tools.bash("date +%Y-%m-%d");

      if (!result.success) {
        return { error: result.error };
      }

      return {
        variables: {
          date: result.output,
          verified: echoOutput?.includes("Hello"),
        },
      };
    });

    // Node 3: Final output
    graph.addNode("summary", async (state, tools) => {
      const echoOutput = tools.getVar<string>("echoOutput");
      const date = tools.getVar<string>("date");
      const verified = tools.getVar<boolean>("verified");

      console.log("\n=== Test Results ===");
      console.log(`Echo output: ${echoOutput}`);
      console.log(`Date: ${date}`);
      console.log(`Verified: ${verified}`);
      console.log("====================\n");

      return {
        variables: { testPassed: verified === true },
      };
    });

    // Wire up edges
    graph.addEdge(START, "echo");
    graph.addEdge("echo", "verify");
    graph.addEdge("verify", "summary");
    graph.addEdge("summary", END);
  },
};

export default () => workflow;
