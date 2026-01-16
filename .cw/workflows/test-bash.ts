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
      tools.log(`Global output: ${echoOutput}`, "debug");
      tools.log(`Captured output: ${echoOutput}`);

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

      tools.log("Test Results", "info", {
        echoOutput,
        date,
        verified,
      });

      // Examples of long text logs
      tools.log("This is a short message");

      tools.log("This is a longer message that spans multiple words and demonstrates how the renderer handles medium-length text content in the console output");

      tools.log("This is a very long message that contains a lot of text to test how the console renderer handles really long strings. It includes detailed information about the workflow execution, variable states, and other debugging information that might be useful during development. The message continues with even more text to ensure we can see the full content without any truncation issues. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.");

      tools.log("Multi-line example:\nLine 1: First line of output\nLine 2: Second line with more details\nLine 3: Third line with even more information\nLine 4: Final line of the multi-line message");

      tools.log("Warning: This is a long warning message that should be displayed in yellow to alert the user about potential issues in the workflow execution process", "warn");

      // Emit custom event for test summary
      tools.emit("test:summary", {
        name: "test-bash",
        passed: verified === true,
        echoOutput,
        date,
      });

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
