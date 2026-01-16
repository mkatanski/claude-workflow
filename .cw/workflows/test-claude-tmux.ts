/**
 * Test workflow: Claude Code via tmux
 *
 * Tests Claude Code execution in tmux pane (interactive mode).
 * This requires running in tmux and will open a visible pane.
 */

import type { LangGraphWorkflowDefinition } from "../../src/core/graph/types.ts";
import { START, END } from "../../src/core/graph/workflowGraph.ts";

const workflow: LangGraphWorkflowDefinition = {
  name: "Test Claude Tmux",
  description: "Test Claude Code execution via tmux (interactive)",

  claude: {
    model: "sonnet",
    dangerouslySkipPermissions: true,
  },

  tmux: {
    split: "horizontal",
  },

  build(graph) {
    // Node 1: Run a simple Claude Code prompt
    graph.addNode("claude-prompt", async (state, tools) => {
      console.log("Starting Claude Code in tmux...");
      console.log("This will open a visible pane.");

      const result = await tools.claude(
        "Create a file called test-output.txt in the current directory " +
        "containing the text 'Hello from Claude Code!'. Then read the file " +
        "back and confirm the content."
      );

      if (!result.success) {
        console.error("Claude prompt failed:", result.error);
        return { error: result.error };
      }

      console.log("Claude output captured.");

      return {
        variables: {
          claudeOutput: result.output,
        },
      };
    });

    // Node 2: Verify the file was created
    graph.addNode("verify", async (state, tools) => {
      console.log("Verifying file creation...");

      const result = await tools.bash("cat test-output.txt 2>/dev/null || echo 'FILE_NOT_FOUND'");

      const fileContent = result.output;
      const fileExists = !fileContent.includes("FILE_NOT_FOUND");

      console.log(`File exists: ${fileExists}`);
      if (fileExists) {
        console.log(`File content: ${fileContent}`);
      }

      return {
        variables: {
          fileExists,
          fileContent,
        },
      };
    });

    // Node 3: Cleanup and summary
    graph.addNode("cleanup", async (state, tools) => {
      // Clean up test file
      await tools.bash("rm -f test-output.txt");

      const claudeOutput = tools.getVar<string>("claudeOutput");
      const fileExists = tools.getVar<boolean>("fileExists");
      const fileContent = tools.getVar<string>("fileContent");

      console.log("\n=== Test Results ===");
      console.log(`File was created: ${fileExists}`);
      console.log(`File content: ${fileContent}`);
      console.log(`Claude output length: ${claudeOutput?.length ?? 0} chars`);

      const testPassed = fileExists && fileContent?.includes("Hello");
      console.log(`Test passed: ${testPassed}`);
      console.log("====================\n");

      return {
        variables: { testPassed },
      };
    });

    // Wire up edges
    graph.addEdge(START, "claude-prompt");
    graph.addEdge("claude-prompt", "verify");
    graph.addEdge("verify", "cleanup");
    graph.addEdge("cleanup", END);
  },
};

export default () => workflow;
