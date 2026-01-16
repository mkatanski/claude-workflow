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
      tools.log("Initializing workflow...");
      const counter = tools.getVar<number>("counter", 0);
      const max = tools.getVar<number>("maxIterations", 3);

      tools.log(`Starting with counter=${counter}, max=${max}`, "debug");

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
      tools.log(`Incrementing counter: ${counter} -> ${newCounter}`, "debug");

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

      tools.log(`Checking: counter=${counter}, max=${max}`, "debug");

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

      const passed = counter === 3 && history.length === 3;

      tools.log("Test Results", "info", {
        finalCounter: counter,
        history,
        expected: { counter: 3, history: [1, 2, 3] },
        passed,
      });

      // Emit custom event for test summary
      tools.emit("test:summary", {
        name: "test-state-flow",
        passed,
        counter,
        history,
      });

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
