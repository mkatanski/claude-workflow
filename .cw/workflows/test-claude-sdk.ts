/**
 * Test workflow: Claude SDK structured output
 *
 * Tests Claude SDK tool with various output types.
 */

import type { LangGraphWorkflowDefinition } from "../../src/core/graph/types.ts";
import { START, END } from "../../src/core/graph/workflowGraph.ts";

const workflow: LangGraphWorkflowDefinition = {
  name: "Test Claude SDK",
  description: "Test Claude SDK structured output capabilities",

  claudeSdk: {
    model: "haiku",
  },

  build(graph) {
    // Node 1: Boolean output
    graph.addNode("boolean-test", async (state, tools) => {
      console.log("Testing boolean output...");

      const result = await tools.claudeSdk<{ result: boolean }>(
        "Is 2 + 2 equal to 4? Respond with true or false.",
        {
          outputType: "boolean",
        }
      );

      if (!result.success) {
        console.error("Boolean test failed:", result.error);
        return { error: result.error };
      }

      console.log(`Boolean result: ${result.output}`);

      return {
        variables: { booleanResult: result.output },
      };
    });

    // Node 2: Enum output
    graph.addNode("enum-test", async (state, tools) => {
      console.log("Testing enum output...");

      const result = await tools.claudeSdk<{ result: string }>(
        "What color is the sky on a clear day? Choose from the options.",
        {
          outputType: "enum",
          schema: {
            values: ["red", "blue", "green", "yellow"],
          },
        }
      );

      if (!result.success) {
        console.error("Enum test failed:", result.error);
        return { error: result.error };
      }

      console.log(`Enum result: ${result.output}`);

      return {
        variables: { enumResult: result.output },
      };
    });

    // Node 3: Schema output
    graph.addNode("schema-test", async (state, tools) => {
      console.log("Testing schema output...");

      const result = await tools.claudeSdk<{
        name: string;
        age: number;
        isHuman: boolean;
      }>(
        "Generate a fictional person with a name, age, and whether they are human.",
        {
          outputType: "schema",
          schema: {
            type: "object",
            properties: {
              name: { type: "string" },
              age: { type: "number" },
              isHuman: { type: "boolean" },
            },
            required: ["name", "age", "isHuman"],
          },
        }
      );

      if (!result.success) {
        console.error("Schema test failed:", result.error);
        return { error: result.error };
      }

      console.log(`Schema result: ${result.output}`);

      return {
        variables: { schemaResult: result.data },
      };
    });

    // Node 4: Summary
    graph.addNode("summary", async (state, tools) => {
      const booleanResult = tools.getVar<string>("booleanResult");
      const enumResult = tools.getVar<string>("enumResult");
      const schemaResult = tools.getVar<Record<string, unknown>>("schemaResult");

      console.log("\n=== Test Results ===");
      console.log(`Boolean result: ${booleanResult}`);
      console.log(`Enum result: ${enumResult}`);
      console.log(`Schema result: ${JSON.stringify(schemaResult, null, 2)}`);

      const testPassed =
        booleanResult === "true" &&
        enumResult === "blue" &&
        schemaResult !== undefined;

      console.log(`Test passed: ${testPassed}`);
      console.log("====================\n");

      return {
        variables: { testPassed },
      };
    });

    // Wire up edges
    graph.addEdge(START, "boolean-test");
    graph.addEdge("boolean-test", "enum-test");
    graph.addEdge("enum-test", "schema-test");
    graph.addEdge("schema-test", "summary");
    graph.addEdge("summary", END);
  },
};

export default () => workflow;
