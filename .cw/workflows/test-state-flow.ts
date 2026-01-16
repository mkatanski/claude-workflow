/**
 * Test workflow: State flow and conditional edges
 *
 * Tests state passing between nodes and conditional routing.
 */

import type { LangGraphWorkflowDefinition } from "../../src/core/graph/types.ts";
import { START, END } from "../../src/core/graph/workflowGraph.ts";

const workflow: LangGraphWorkflowDefinition = {
  name: "Test State Flow",
  description: "Test state passing and conditional edges",

  vars: {
    counter: 0,
    maxIterations: 3,
  },

  build(graph) {
    // Node 1: Initialize
    graph.addNode("init", async (state, tools) => {
      console.log("Initializing workflow...");
      const counter = tools.getVar<number>("counter", 0);
      const max = tools.getVar<number>("maxIterations", 3);

      console.log(`Starting with counter=${counter}, max=${max}`);

      return {
        variables: {
          initialized: true,
          history: [] as number[],
        },
      };
    });

    // Node 2: Increment counter
    graph.addNode("increment", async (state, tools) => {
      const counter = tools.getVar<number>("counter", 0);
      const history = tools.getVar<number[]>("history", []);

      const newCounter = counter + 1;
      console.log(`Incrementing counter: ${counter} -> ${newCounter}`);

      return {
        variables: {
          counter: newCounter,
          history: [...history, newCounter],
        },
      };
    });

    // Node 3: Check if we should continue
    graph.addNode("check", async (state, tools) => {
      const counter = tools.getVar<number>("counter", 0);
      const max = tools.getVar<number>("maxIterations", 3);

      console.log(`Checking: counter=${counter}, max=${max}`);

      return {
        variables: {
          shouldContinue: counter < max,
        },
      };
    });

    // Node 4: Finalize
    graph.addNode("finalize", async (state, tools) => {
      const counter = tools.getVar<number>("counter", 0);
      const history = tools.getVar<number[]>("history", []);

      console.log("\n=== Test Results ===");
      console.log(`Final counter: ${counter}`);
      console.log(`History: ${JSON.stringify(history)}`);
      console.log(`Expected: counter=3, history=[1,2,3]`);

      const passed = counter === 3 && history.length === 3;
      console.log(`Test passed: ${passed}`);
      console.log("====================\n");

      return {
        variables: { testPassed: passed },
      };
    });

    // Wire up edges
    graph.addEdge(START, "init");
    graph.addEdge("init", "increment");
    graph.addEdge("increment", "check");

    // Conditional edge from check
    graph.addConditionalEdges("check", async (state, tools) => {
      const shouldContinue = tools.getVar<boolean>("shouldContinue", false);
      return shouldContinue ? "increment" : "finalize";
    });

    graph.addEdge("finalize", END);
  },
};

export default () => workflow;
