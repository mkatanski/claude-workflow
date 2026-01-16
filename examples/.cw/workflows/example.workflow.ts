/**
 * Example workflow demonstrating the builder API.
 *
 * Run with: bun run src/cli/main.ts examples
 */

import type { WorkflowBuilder } from "../../../src/types/index.ts";

export default (t: WorkflowBuilder) => ({
  name: "Example Workflow",

  vars: {
    greeting: "Hello",
    target: "World",
  },

  claude: {
    model: "sonnet",
    dangerouslySkipPermissions: true,
  },

  steps: [
    // Simple bash command
    t.step("Get current date", t.bash("date"), { output: "currentDate" }),

    // Set a variable
    t.step("Build message", t.set("message", "{greeting}, {target}! Today is {currentDate}")),

    // Conditional step
    t.step("Show message", t.bash("echo '{message}'"), {
      when: "{message} is not empty",
    }),

    // JSON manipulation
    t.step(
      "Create JSON",
      t.json("stringify", {
        input: '{"name": "{target}", "date": "{currentDate}"}',
      }),
      { output: "jsonData" }
    ),

    // Query JSON
    t.step(
      "Extract name",
      t.json("query", {
        input: "{jsonData}",
        query: "name",
      }),
      { output: "extractedName" }
    ),

    // Final output
    t.step("Show result", t.bash("echo 'Extracted: {extractedName}'")),
  ],
});
