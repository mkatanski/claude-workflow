/**
 * Unit tests for plan storage and parsing.
 */

import { afterEach, describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import {
	createPlanFromOutput,
	deletePlan,
	getPlanFilePath,
	listPlans,
	loadPlan,
	parseCriticalFiles,
	parseImplementationSteps,
	parsePlanContent,
	savePlan,
	updatePlanStatus,
} from "./planStorage.js";
import type { PlanFile } from "./types.js";

describe("Plan Storage", () => {
	describe("parseCriticalFiles", () => {
		it("should extract CREATE: patterns", () => {
			const content = `
## Critical Files
CREATE: src/new/file.ts - New module
CREATE: src/another/module.ts - Another file
			`;

			const result = parseCriticalFiles(content);

			expect(result).toContain("src/new/file.ts");
			expect(result).toContain("src/another/module.ts");
		});

		it("should extract MODIFY: patterns", () => {
			const content = `
## Critical Files
MODIFY: src/existing/file.ts - Update imports
MODIFY: src/config.ts - Add configuration
			`;

			const result = parseCriticalFiles(content);

			expect(result).toContain("src/existing/file.ts");
			expect(result).toContain("src/config.ts");
		});

		it("should extract backtick file paths", () => {
			const content = `
The following files will be affected:
- \`src/core/module.ts\`
- \`src/utils/helper.ts\`
			`;

			const result = parseCriticalFiles(content);

			expect(result).toContain("src/core/module.ts");
			expect(result).toContain("src/utils/helper.ts");
		});

		it("should filter out http URLs in backticks", () => {
			const content = `
Check \`https://example.com/docs\` for more info.
File: \`src/module.ts\`
			`;

			const result = parseCriticalFiles(content);

			expect(result).not.toContain("https://example.com/docs");
			expect(result).toContain("src/module.ts");
		});

		it("should filter out code snippets without paths", () => {
			const content = `
Use \`const x = 1\` syntax.
File: \`src/file.ts\`
			`;

			const result = parseCriticalFiles(content);

			expect(result).not.toContain("const x = 1");
			expect(result).toContain("src/file.ts");
		});

		it("should deduplicate file paths", () => {
			const content = `
CREATE: src/file.ts
MODIFY: src/file.ts
\`src/file.ts\`
			`;

			const result = parseCriticalFiles(content);

			expect(result.filter((f) => f === "src/file.ts")).toHaveLength(1);
		});

		it("should return empty array for content with no files", () => {
			const content = "This is just some text without any file references.";

			const result = parseCriticalFiles(content);

			expect(result).toHaveLength(0);
		});
	});

	describe("parseImplementationSteps", () => {
		it("should extract bold numbered steps", () => {
			const content = `
## Implementation Steps
1. **Create module**: Set up the new module structure
2. **Add types**: Define TypeScript interfaces
3. **Implement logic**: Write the core functionality
			`;

			const result = parseImplementationSteps(content);

			expect(result).toHaveLength(3);
			expect(result[0]).toContain("Create module");
			expect(result[1]).toContain("Add types");
			expect(result[2]).toContain("Implement logic");
		});

		it("should include step descriptions", () => {
			const content = `
1. **Step one**: This is the description
			`;

			const result = parseImplementationSteps(content);

			expect(result[0]).toContain("Step one");
			expect(result[0]).toContain("This is the description");
		});

		it("should fall back to simple numbered steps", () => {
			const content = `
1. First step to do
2. Second step to do
3. Third step to do
			`;

			const result = parseImplementationSteps(content);

			expect(result).toHaveLength(3);
			expect(result[0]).toBe("First step to do");
			expect(result[1]).toBe("Second step to do");
		});

		it("should return empty array for content with no steps", () => {
			const content = "Just some text without numbered steps.";

			const result = parseImplementationSteps(content);

			expect(result).toHaveLength(0);
		});

		it("should handle steps without descriptions", () => {
			// Note: When steps don't have descriptions, they need to be on separate lines
			// with nothing following the closing **
			const content = `1. **Setup**
2. **Configure**
3. **Test**`;

			const result = parseImplementationSteps(content);

			expect(result).toHaveLength(3);
			expect(result[0]).toBe("Setup");
			expect(result[1]).toBe("Configure");
			expect(result[2]).toBe("Test");
		});
	});

	describe("parsePlanContent", () => {
		it("should extract critical files and steps", () => {
			const content = `
## Summary
Implementation plan for new feature.

## Critical Files
CREATE: src/feature.ts - Main feature file
MODIFY: src/index.ts - Export the feature

## Implementation Steps
1. **Create feature module**: Set up the structure
2. **Update exports**: Add to index file
			`;

			const result = parsePlanContent(content);

			expect(result.content).toBe(content);
			expect(result.criticalFiles).toContain("src/feature.ts");
			expect(result.criticalFiles).toContain("src/index.ts");
			expect(result.steps).toHaveLength(2);
		});

		it("should include warnings when no critical files found", () => {
			const content = "Just a plan without file references.";

			const result = parsePlanContent(content);

			expect(result.warnings).toBeDefined();
			expect(result.warnings).toContain(
				"No critical files identified in the plan",
			);
		});

		it("should include warnings when no steps found", () => {
			const content = `
CREATE: src/file.ts
No numbered steps here.
			`;

			const result = parsePlanContent(content);

			expect(result.warnings).toBeDefined();
			expect(result.warnings).toContain(
				"No implementation steps identified in the plan",
			);
		});

		it("should not include warnings when both files and steps present", () => {
			const content = `
CREATE: src/file.ts
1. **Step one**: Do something
			`;

			const result = parsePlanContent(content);

			expect(result.warnings).toBeUndefined();
		});
	});

	describe("createPlanFromOutput", () => {
		it("should create plan file with parsed content", () => {
			const sessionId = "test-session-123";
			const content = `
CREATE: src/file.ts
1. **Step**: Do something
			`;

			const result = createPlanFromOutput(sessionId, content);

			expect(result.sessionId).toBe(sessionId);
			expect(result.content).toBe(content);
			expect(result.criticalFiles).toContain("src/file.ts");
			expect(result.createdAt).toBeDefined();
			expect(result.updatedAt).toBeDefined();
		});

		it("should auto-approve by default", () => {
			const result = createPlanFromOutput("session", "content");

			expect(result.status).toBe("approved");
			expect(result.approvedAt).toBeDefined();
		});

		it("should not auto-approve when disabled", () => {
			const result = createPlanFromOutput("session", "content", false);

			expect(result.status).toBe("pending");
			expect(result.approvedAt).toBeUndefined();
		});

		it("should include metadata with step count", () => {
			const content = `
1. Step one
2. Step two
			`;
			const result = createPlanFromOutput("session", content);

			expect(result.metadata?.stepCount).toBe(2);
		});
	});

	describe("getPlanFilePath", () => {
		it("should generate path with session ID", () => {
			const sessionId = "my-session-id";
			const result = getPlanFilePath(sessionId);

			expect(result).toContain("plan-my-session-id.json");
			expect(result).toContain("plans");
		});

		it("should generate different paths for different sessions", () => {
			const path1 = getPlanFilePath("session-1");
			const path2 = getPlanFilePath("session-2");

			expect(path1).not.toBe(path2);
		});
	});

	describe("Plan Storage Operations", () => {
		// These tests interact with the file system

		const testPlan: PlanFile = {
			sessionId: "test-storage-session",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			content: "Test plan content\nCREATE: src/test.ts\n1. First step",
			criticalFiles: ["src/test.ts"],
			status: "pending",
		};

		afterEach(async () => {
			// Clean up test plan if it exists
			await deletePlan(testPlan.sessionId);
		});

		describe("savePlan and loadPlan", () => {
			it("should save and load a plan", () => {
				const saveResult = savePlan(testPlan);
				expect(saveResult.isOk()).toBe(true);

				const loadResult = loadPlan(testPlan.sessionId);
				expect(loadResult.isOk()).toBe(true);

				const loaded = loadResult.unwrap();
				expect(loaded.sessionId).toBe(testPlan.sessionId);
				expect(loaded.content).toBe(testPlan.content);
				expect(loaded.status).toBe(testPlan.status);
			});

			it("should return error when loading non-existent plan", () => {
				const result = loadPlan("non-existent-session");

				expect(result.isErr()).toBe(true);
				expect(result.unwrapErr().code).toBe("PLAN_NOT_FOUND");
			});
		});

		describe("updatePlanStatus", () => {
			it("should update plan status to approved", () => {
				savePlan(testPlan);

				const result = updatePlanStatus(testPlan.sessionId, "approved");

				expect(result.isOk()).toBe(true);
				const updated = result.unwrap();
				expect(updated.status).toBe("approved");
				expect(updated.approvedAt).toBeDefined();
			});

			it("should update updatedAt timestamp", () => {
				savePlan(testPlan);
				const originalUpdatedAt = testPlan.updatedAt;

				// Small delay to ensure timestamp difference
				const result = updatePlanStatus(testPlan.sessionId, "approved");

				expect(result.isOk()).toBe(true);
				const updated = result.unwrap();
				expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
					new Date(originalUpdatedAt).getTime(),
				);
			});

			it("should return error for non-existent plan", () => {
				const result = updatePlanStatus("non-existent", "approved");

				expect(result.isErr()).toBe(true);
				expect(result.unwrapErr().code).toBe("PLAN_NOT_FOUND");
			});
		});

		describe("deletePlan", () => {
			it("should delete existing plan", async () => {
				savePlan(testPlan);
				const filePath = getPlanFilePath(testPlan.sessionId);
				expect(existsSync(filePath)).toBe(true);

				const result = await deletePlan(testPlan.sessionId);

				expect(result.isOk()).toBe(true);
				expect(existsSync(filePath)).toBe(false);
			});

			it("should succeed for non-existent plan", async () => {
				const result = await deletePlan("non-existent-session");

				expect(result.isOk()).toBe(true);
			});
		});

		describe("listPlans", () => {
			it("should list saved plans", () => {
				// Save test plan
				savePlan(testPlan);

				const result = listPlans();

				expect(result.isOk()).toBe(true);
				const summaries = result.unwrap();
				const found = summaries.find((s) => s.sessionId === testPlan.sessionId);
				expect(found).toBeDefined();
				expect(found?.status).toBe("pending");
			});

			it("should sort plans by creation date descending", () => {
				const plan1: PlanFile = {
					...testPlan,
					sessionId: "list-test-1",
					createdAt: "2024-01-01T00:00:00.000Z",
				};
				const plan2: PlanFile = {
					...testPlan,
					sessionId: "list-test-2",
					createdAt: "2024-01-02T00:00:00.000Z",
				};

				savePlan(plan1);
				savePlan(plan2);

				const result = listPlans();
				expect(result.isOk()).toBe(true);

				const summaries = result.unwrap();
				const idx1 = summaries.findIndex((s) => s.sessionId === "list-test-1");
				const idx2 = summaries.findIndex((s) => s.sessionId === "list-test-2");

				// plan2 (newer) should come before plan1 (older)
				expect(idx2).toBeLessThan(idx1);

				// Cleanup
				deletePlan("list-test-1");
				deletePlan("list-test-2");
			});
		});
	});
});
