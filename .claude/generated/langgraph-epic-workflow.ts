/**
 * Epic to Implementation Pipeline V2 - LangGraph TypeScript Version
 *
 * This is a conversion of the YAML workflow to LangGraph, demonstrating
 * how the same logic maps to a graph-based execution model.
 */

import { StateGraph, START, END, Annotation, MemorySaver } from "@langchain/langgraph";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";

const execAsync = promisify(exec);

// =============================================================================
// STATE DEFINITION
// =============================================================================

const WorkflowState = Annotation.Root({
  // Input configuration
  promptFile: Annotation<string>({ default: () => ".claude/epic-prompt.md" }),
  outputDir: Annotation<string>({ default: () => ".claude/generated" }),

  // Limits and configuration
  maxTestRetries: Annotation<number>({ default: () => 3 }),
  maxDriftFixAttempts: Annotation<number>({ default: () => 5 }),
  simpleEpicThreshold: Annotation<number>({ default: () => 15 }),

  // Epic scope analysis results
  needsMilestones: Annotation<boolean>({ default: () => false }),
  estimatedStoryCount: Annotation<number>({ default: () => 0 }),
  complexityScore: Annotation<number>({ default: () => 0 }),

  // Workflow mode
  workflowMode: Annotation<"simple" | "milestone" | "unknown">({ default: () => "unknown" }),
  workflowPhase: Annotation<string>({ default: () => "init" }),

  // Epic data
  epicPromptContent: Annotation<string>({ default: () => "" }),
  epicDescription: Annotation<string>({ default: () => "" }),
  epicTitle: Annotation<string>({ default: () => "" }),
  codebaseStructure: Annotation<string>({ default: () => "" }),

  // Git state
  branchName: Annotation<string>({ default: () => "" }),
  originalBranch: Annotation<string>({ default: () => "" }),
  hasUncommittedChanges: Annotation<boolean>({ default: () => false }),

  // Architecture
  architectureDocument: Annotation<string>({ default: () => "" }),
  architectureVersion: Annotation<number>({ default: () => 1 }),
  architectureUpdates: Annotation<string>({ default: () => "" }),

  // Milestones (for milestone mode)
  milestones: Annotation<Milestone[]>({ default: () => [] }),
  currentMilestoneIndex: Annotation<number>({ default: () => 0 }),

  // Stories
  stories: Annotation<Story[]>({ default: () => [] }),
  currentStoryIndex: Annotation<number>({ default: () => 0 }),

  // Test loop
  testRetryCount: Annotation<number>({ default: () => 0 }),
  testsOutput: Annotation<string>({ default: () => "" }),
  testsPassed: Annotation<boolean>({ default: () => false }),
  testFailureOccurred: Annotation<boolean>({ default: () => false }),

  // Drift check
  driftFixCount: Annotation<number>({ default: () => 0 }),
  architectureAligned: Annotation<boolean>({ default: () => true }),
  driftFixIssues: Annotation<DriftIssue[]>({ default: () => [] }),

  // Cross-milestone state
  cumulativeImplementationSummary: Annotation<string>({ default: () => "" }),

  // Learning tracking
  depsBefore: Annotation<string>({ default: () => "" }),
  depsAfter: Annotation<string>({ default: () => "" }),

  // Temp file management
  workflowId: Annotation<string>({ default: () => "" }),
  tempDir: Annotation<string>({ default: () => "" }),

  // Results
  implementationResult: Annotation<string>({ default: () => "" }),
  finalCommitSha: Annotation<string>({ default: () => "" }),
});

type WorkflowStateType = typeof WorkflowState.State;

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface Milestone {
  id: string;
  title: string;
  goals: string[];
  phase: "foundation" | "core" | "features" | "integration";
}

interface Story {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  implementationHints: string[];
}

interface DriftIssue {
  type: "keep" | "fix" | "defer" | "remove";
  description: string;
  file?: string;
}

// =============================================================================
// UTILITY FUNCTIONS (Replace your bash/tools)
// =============================================================================

async function bash(command: string): Promise<string> {
  try {
    const { stdout } = await execAsync(command);
    return stdout.trim();
  } catch (error) {
    if (error instanceof Error && "stderr" in error) {
      throw new Error(`Command failed: ${(error as { stderr: string }).stderr}`);
    }
    throw error;
  }
}

async function readFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf-8");
}

async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf-8");
}

// Placeholder for Claude SDK integration - implement with your preferred method
async function claudeQuery(prompt: string, options?: { model?: string }): Promise<string> {
  // This would integrate with Claude Code or claude-agent-sdk
  // For now, return a placeholder
  console.log(`[Claude ${options?.model ?? "sonnet"}]: ${prompt.slice(0, 100)}...`);
  return "RESPONSE_PLACEHOLDER";
}

async function claudeSdkQuery<T>(
  prompt: string,
  schema: object,
  options?: { model?: string }
): Promise<T> {
  // This would use claude-agent-sdk with structured output
  console.log(`[Claude SDK ${options?.model ?? "haiku"}]: ${prompt.slice(0, 100)}...`);
  return {} as T;
}

// =============================================================================
// NODE DEFINITIONS
// =============================================================================

// --- PHASE 0: SCOPE ANALYSIS ---

async function setupWorkflow(state: WorkflowStateType): Promise<Partial<WorkflowStateType>> {
  console.log("\n========================================");
  console.log("PHASE 0: EPIC SCOPE ANALYSIS");
  console.log("========================================\n");

  const workflowId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const tempDir = `.temp/orchestrator-${workflowId}`;
  await bash(`mkdir -p ${tempDir}`);
  await bash(`mkdir -p ${state.outputDir}`);

  const epicPromptContent = await readFile(state.promptFile).catch(() => "");
  if (!epicPromptContent) {
    throw new Error(`Epic prompt file is empty or missing: ${state.promptFile}`);
  }

  const depsBefore = await bash("cat pyproject.toml 2>/dev/null || cat requirements.txt 2>/dev/null || echo ''");

  const codebaseStructure = await bash(`
    echo "=== Project Files ===" &&
    find . -type f \\( -name "*.ts" -o -name "*.py" -o -name "*.go" \\) \
      ! -path "*/node_modules/*" ! -path "*/.venv/*" 2>/dev/null | head -100
  `);

  return {
    workflowPhase: "scope_analysis",
    workflowId,
    tempDir,
    epicPromptContent,
    depsBefore,
    codebaseStructure,
  };
}

async function analyzeScopeNode(state: WorkflowStateType): Promise<Partial<WorkflowStateType>> {
  // Use Claude to analyze epic scope
  const scopeAnalysis = await claudeSdkQuery<{
    needsMilestones: boolean;
    estimatedStoryCount: number;
    complexityScore: number;
  }>(
    `Analyze this epic prompt and determine its scope:

    ${state.epicPromptContent}

    Codebase structure:
    ${state.codebaseStructure}

    Return: needsMilestones (true if >15 stories), estimatedStoryCount, complexityScore (1-10)`,
    {
      type: "object",
      properties: {
        needsMilestones: { type: "boolean" },
        estimatedStoryCount: { type: "number" },
        complexityScore: { type: "number" },
      },
    },
    { model: "opus" }
  );

  const workflowMode = scopeAnalysis.needsMilestones ? "milestone" : "simple";

  console.log(`\n=== Scope Analysis Results ===`);
  console.log(`Estimated stories: ${scopeAnalysis.estimatedStoryCount}`);
  console.log(`Complexity: ${scopeAnalysis.complexityScore}`);
  console.log(`Mode: ${workflowMode}\n`);

  return {
    needsMilestones: scopeAnalysis.needsMilestones,
    estimatedStoryCount: scopeAnalysis.estimatedStoryCount,
    complexityScore: scopeAnalysis.complexityScore,
    workflowMode,
  };
}

// --- Route: simple vs milestone ---
function routeByMode(state: WorkflowStateType): "simple_mode" | "milestone_mode" {
  return state.workflowMode === "milestone" ? "milestone_mode" : "simple_mode";
}

// --- SIMPLE MODE ---

async function simpleModeSetup(state: WorkflowStateType): Promise<Partial<WorkflowStateType>> {
  console.log("\n========================================");
  console.log("SIMPLE MODE: Single-pass execution");
  console.log("========================================\n");

  // Analyze epic
  const epicDescription = await claudeQuery(
    `Analyze this feature request and create a structured epic description:
    ${state.epicPromptContent}`,
    { model: "opus" }
  );

  // Extract title
  const { title } = await claudeSdkQuery<{ title: string }>(
    `Extract a short branch-safe title (max 25 chars, lowercase, hyphens) from: ${epicDescription}`,
    { type: "object", properties: { title: { type: "string" } } },
    { model: "haiku" }
  );

  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const branchName = `feature/${timestamp}-${title}`;

  // Create architecture
  const architectureDocument = await claudeQuery(
    `Create an architectural document for this epic:
    ${epicDescription}

    Codebase: ${state.codebaseStructure}`,
    { model: "opus" }
  );

  // Generate stories
  const storiesJson = await claudeQuery(
    `Generate implementation stories as JSON array for:
    Epic: ${epicDescription}
    Architecture: ${architectureDocument}`,
    { model: "opus" }
  );
  const stories: Story[] = JSON.parse(storiesJson);

  // Save artifacts
  await writeFile(`${state.outputDir}/epic-description.md`, epicDescription);
  await writeFile(`${state.outputDir}/architecture.md`, architectureDocument);
  await writeFile(`${state.outputDir}/stories.json`, JSON.stringify(stories, null, 2));

  return {
    epicDescription,
    epicTitle: title,
    branchName,
    architectureDocument,
    stories,
  };
}

// --- MILESTONE MODE ---

async function milestoneModeSetup(state: WorkflowStateType): Promise<Partial<WorkflowStateType>> {
  console.log("\n========================================");
  console.log("MILESTONE MODE: Multi-pass execution");
  console.log("========================================\n");

  // Analyze and create milestones
  const epicDescription = await claudeQuery(
    `Analyze this epic: ${state.epicPromptContent}`,
    { model: "opus" }
  );

  const milestonesJson = await claudeQuery(
    `Create risk-based milestones (foundation, core, features, integration) for:
    ${epicDescription}`,
    { model: "opus" }
  );
  const milestones: Milestone[] = JSON.parse(milestonesJson);

  const { title } = await claudeSdkQuery<{ title: string }>(
    `Extract branch-safe title from: ${epicDescription}`,
    { type: "object", properties: { title: { type: "string" } } },
    { model: "haiku" }
  );

  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const branchName = `feature/${timestamp}-${title}`;

  const architectureDocument = await claudeQuery(
    `Create HIGH-LEVEL architecture for: ${epicDescription}
    Milestones: ${JSON.stringify(milestones)}`,
    { model: "opus" }
  );

  await writeFile(`${state.outputDir}/epic-description.md`, epicDescription);
  await writeFile(`${state.outputDir}/milestones.json`, JSON.stringify(milestones, null, 2));
  await writeFile(`${state.outputDir}/architecture.md`, architectureDocument);

  return {
    epicDescription,
    epicTitle: title,
    branchName,
    milestones,
    architectureDocument,
    currentMilestoneIndex: 0,
  };
}

// --- GIT SETUP (shared) ---

async function gitSetup(state: WorkflowStateType): Promise<Partial<WorkflowStateType>> {
  const originalBranch = await bash("git branch --show-current");
  const statusOutput = await bash("git status --porcelain");
  const hasUncommittedChanges = statusOutput.length > 0;

  if (hasUncommittedChanges) {
    await bash(`git stash push -m "epic-workflow-auto-stash-${Date.now()}"`);
  }

  await bash(`git checkout -b ${state.branchName}`);
  console.log(`Created branch: ${state.branchName}`);

  return { originalBranch, hasUncommittedChanges };
}

// --- MILESTONE LOOP ---

function shouldContinueMilestones(state: WorkflowStateType): "process_milestone" | "finalization" {
  if (state.currentMilestoneIndex >= state.milestones.length) {
    return "finalization";
  }
  return "process_milestone";
}

async function processMilestone(state: WorkflowStateType): Promise<Partial<WorkflowStateType>> {
  const milestone = state.milestones[state.currentMilestoneIndex];
  console.log(`\n=== MILESTONE: ${milestone.id} - ${milestone.title} ===`);
  console.log(`Goals: ${milestone.goals.join(", ")}\n`);

  // Refine architecture for this milestone
  const architectureDocument = await claudeQuery(
    `Refine architecture for milestone ${milestone.id}:
    Current: ${state.architectureDocument}
    Milestone: ${JSON.stringify(milestone)}
    Previous work: ${state.cumulativeImplementationSummary}`,
    { model: "opus" }
  );

  // Generate stories for this milestone
  const storiesJson = await claudeQuery(
    `Generate 8-15 stories for milestone ${milestone.id}:
    ${JSON.stringify(milestone)}
    Architecture: ${architectureDocument}`,
    { model: "opus" }
  );
  const stories: Story[] = JSON.parse(storiesJson);

  await writeFile(`${state.outputDir}/stories-${milestone.id}.json`, JSON.stringify(stories, null, 2));

  return {
    architectureDocument,
    architectureVersion: state.architectureVersion + 1,
    stories,
    currentStoryIndex: 0,
  };
}

// --- STORY LOOP ---

function shouldContinueStories(state: WorkflowStateType): "implement_story" | "post_stories" {
  if (state.currentStoryIndex >= state.stories.length) {
    return "post_stories";
  }
  return "implement_story";
}

async function implementStory(state: WorkflowStateType): Promise<Partial<WorkflowStateType>> {
  const story = state.stories[state.currentStoryIndex];
  console.log(`\n=== IMPLEMENTING: ${story.id} ===`);
  console.log(`${story.title}\n`);

  // Plan and implement
  const implementationResult = await claudeQuery(
    `Implement story ${story.id}: ${story.title}
    Details: ${JSON.stringify(story)}
    Architecture: ${state.architectureDocument}

    1. Review antipatterns
    2. Create plan
    3. Implement with tests`,
    { model: "opus" }
  );

  // Code review
  await claudeQuery(
    `Review and fix issues for ${story.id}:
    ${implementationResult}`,
    { model: "opus" }
  );

  return {
    implementationResult,
    testRetryCount: 0,
  };
}

// --- TEST LOOP ---

async function runTests(state: WorkflowStateType): Promise<Partial<WorkflowStateType>> {
  console.log(`--- Test Run (attempt ${state.testRetryCount}) ---`);

  // Run lint
  await bash("npm run lint --fix 2>/dev/null || python -m ruff check --fix . 2>/dev/null || true");

  // Run tests
  let testsPassed = false;
  let testsOutput = "";
  try {
    testsOutput = await bash("npm test 2>&1 || pytest 2>&1 || go test ./... 2>&1");
    testsPassed = true;
  } catch (error) {
    testsOutput = error instanceof Error ? error.message : String(error);
    testsPassed = false;
  }

  return { testsPassed, testsOutput };
}

function routeTestResult(state: WorkflowStateType): "story_complete" | "fix_tests" | "story_complete_failed" {
  if (state.testsPassed) {
    return "story_complete";
  }
  if (state.testRetryCount >= state.maxTestRetries) {
    console.log("Max test retries exceeded");
    return "story_complete_failed";
  }
  return "fix_tests";
}

async function fixTests(state: WorkflowStateType): Promise<Partial<WorkflowStateType>> {
  await claudeQuery(
    `Fix failing tests:
    ${state.testsOutput}

    Do NOT disable tests.`,
    { model: "opus" }
  );

  // Learn from failure
  if (state.testFailureOccurred) {
    await claudeQuery(
      `Extract learnings from this test failure and update antipatterns:
      ${state.testsOutput}`,
      { model: "haiku" }
    );
  }

  return {
    testRetryCount: state.testRetryCount + 1,
    testFailureOccurred: true,
  };
}

async function storyComplete(state: WorkflowStateType): Promise<Partial<WorkflowStateType>> {
  const story = state.stories[state.currentStoryIndex];
  console.log(`\nStory ${story.id} complete (tests: ${state.testsPassed ? "passed" : "failed"})`);

  return {
    currentStoryIndex: state.currentStoryIndex + 1,
    testFailureOccurred: false,
  };
}

// --- POST-STORIES: DRIFT CHECK ---

async function checkDrift(state: WorkflowStateType): Promise<Partial<WorkflowStateType>> {
  console.log("\n=== POST-STORIES: Drift Check ===");

  const driftResult = await claudeSdkQuery<{
    aligned: boolean;
    architectureUpdates: string;
    issues: DriftIssue[];
  }>(
    `Check drift between implementation and architecture:
    Architecture: ${state.architectureDocument}

    Return: aligned, architectureUpdates, issues (type: keep|fix|defer|remove)`,
    {
      type: "object",
      properties: {
        aligned: { type: "boolean" },
        architectureUpdates: { type: "string" },
        issues: { type: "array" },
      },
    },
    { model: "opus" }
  );

  const driftFixIssues = driftResult.issues.filter((i) => i.type === "fix");

  return {
    architectureAligned: driftResult.aligned,
    architectureUpdates: driftResult.architectureUpdates,
    driftFixIssues,
  };
}

function routeDriftResult(
  state: WorkflowStateType
): "fix_drift" | "update_architecture" {
  if (state.driftFixIssues.length > 0 && state.driftFixCount < state.maxDriftFixAttempts) {
    return "fix_drift";
  }
  return "update_architecture";
}

async function fixDrift(state: WorkflowStateType): Promise<Partial<WorkflowStateType>> {
  await claudeQuery(
    `Fix drift issues:
    ${JSON.stringify(state.driftFixIssues)}
    Architecture: ${state.architectureDocument}`,
    { model: "opus" }
  );

  // Re-run tests after drift fix
  await bash("npm test 2>/dev/null || pytest 2>/dev/null || true");

  return {
    driftFixCount: state.driftFixCount + 1,
  };
}

async function updateArchitecture(state: WorkflowStateType): Promise<Partial<WorkflowStateType>> {
  if (!state.architectureUpdates) {
    return {};
  }

  console.log("Updating architecture with learnings...");
  const updatedArchitecture = await claudeQuery(
    `Update architecture with learnings:
    Current: ${state.architectureDocument}
    Updates: ${state.architectureUpdates}`,
    { model: "opus" }
  );

  await writeFile(`${state.outputDir}/architecture.md`, updatedArchitecture);

  return { architectureDocument: updatedArchitecture };
}

// --- MILESTONE COMMIT (milestone mode only) ---

function routeAfterPostStories(state: WorkflowStateType): "milestone_commit" | "finalization" {
  return state.workflowMode === "milestone" ? "milestone_commit" : "finalization";
}

async function milestoneCommit(state: WorkflowStateType): Promise<Partial<WorkflowStateType>> {
  const milestone = state.milestones[state.currentMilestoneIndex];
  console.log(`\n=== Committing Milestone ${milestone.id} ===`);

  await bash("git add -A");

  const { message } = await claudeSdkQuery<{ message: string }>(
    `Generate commit message for milestone ${milestone.id}: ${milestone.title}`,
    { type: "object", properties: { message: { type: "string" } } },
    { model: "haiku" }
  );

  await bash(`git commit -m "${message}" || echo "Nothing to commit"`);
  await bash(`git tag -a "milestone-${milestone.id}" -m "Milestone ${milestone.id}" 2>/dev/null || true`);

  // Generate summary
  const { summary } = await claudeSdkQuery<{ summary: string }>(
    `Summarize what was built in milestone ${milestone.id}`,
    { type: "object", properties: { summary: { type: "string" } } },
    { model: "haiku" }
  );

  const cumulativeSummary =
    state.cumulativeImplementationSummary +
    `\n## Milestone ${milestone.id}: ${milestone.title}\n${summary}\n`;

  return {
    currentMilestoneIndex: state.currentMilestoneIndex + 1,
    cumulativeImplementationSummary: cumulativeSummary,
  };
}

// --- FINALIZATION ---

async function finalization(state: WorkflowStateType): Promise<Partial<WorkflowStateType>> {
  console.log("\n========================================");
  console.log("FINALIZATION PHASE");
  console.log("========================================\n");

  // Final lint & tests
  await bash("npm run lint --fix 2>/dev/null || true");
  const finalTestsPassed = await bash("npm test 2>/dev/null && echo 'true' || echo 'false'") === "true";

  // Consolidate antipatterns
  await claudeQuery("Consolidate and deduplicate antipattern entries", { model: "haiku" });

  // Check for new dependencies
  const depsAfter = await bash("cat pyproject.toml 2>/dev/null || cat requirements.txt 2>/dev/null || echo ''");

  if (depsAfter !== state.depsBefore) {
    await claudeQuery(
      `Create skills for new dependencies:
      Before: ${state.depsBefore}
      After: ${depsAfter}`,
      { model: "sonnet" }
    );
  }

  // Final commit
  await bash("git add -A");
  const { message } = await claudeSdkQuery<{ message: string }>(
    `Generate final commit message for epic: ${state.epicTitle}`,
    { type: "object", properties: { message: { type: "string" } } },
    { model: "haiku" }
  );

  await bash(`git commit -m "${message}" || echo "Nothing to commit"`);
  const finalCommitSha = await bash("git rev-parse --short HEAD 2>/dev/null || echo 'unknown'");

  console.log("\n==========================================");
  console.log("WORKFLOW COMPLETE");
  console.log("==========================================");
  console.log(`Epic: ${state.epicTitle}`);
  console.log(`Mode: ${state.workflowMode}`);
  console.log(`Branch: ${state.branchName}`);
  console.log(`Tests: ${finalTestsPassed ? "passed" : "failed"}`);
  console.log(`Commit: ${finalCommitSha}`);
  console.log("==========================================\n");

  // Cleanup temp dir
  await bash(`rm -rf ${state.tempDir}`).catch(() => {});

  return {
    finalCommitSha,
    depsAfter,
    testsPassed: finalTestsPassed,
  };
}

// =============================================================================
// GRAPH DEFINITION
// =============================================================================

export function createEpicWorkflow() {
  const workflow = new StateGraph(WorkflowState)
    // --- Phase 0: Setup & Scope Analysis ---
    .addNode("setup", setupWorkflow)
    .addNode("analyze_scope", analyzeScopeNode)

    // --- Mode branching ---
    .addNode("simple_mode", simpleModeSetup)
    .addNode("milestone_mode", milestoneModeSetup)

    // --- Git setup (shared) ---
    .addNode("git_setup", gitSetup)

    // --- Milestone processing ---
    .addNode("process_milestone", processMilestone)

    // --- Story implementation ---
    .addNode("implement_story", implementStory)
    .addNode("run_tests", runTests)
    .addNode("fix_tests", fixTests)
    .addNode("story_complete", storyComplete)

    // --- Post-stories ---
    .addNode("check_drift", checkDrift)
    .addNode("fix_drift", fixDrift)
    .addNode("update_architecture", updateArchitecture)

    // --- Milestone commit ---
    .addNode("milestone_commit", milestoneCommit)

    // --- Finalization ---
    .addNode("finalization", finalization)

    // ===================
    // EDGES (control flow)
    // ===================

    // Start → Setup → Analyze
    .addEdge(START, "setup")
    .addEdge("setup", "analyze_scope")

    // Analyze → Branch by mode
    .addConditionalEdges("analyze_scope", routeByMode, {
      simple_mode: "simple_mode",
      milestone_mode: "milestone_mode",
    })

    // Both modes → git setup
    .addEdge("simple_mode", "git_setup")
    .addEdge("milestone_mode", "git_setup")

    // Git setup → diverge by mode
    .addConditionalEdges(
      "git_setup",
      (state) => (state.workflowMode === "milestone" ? "milestone_loop" : "story_loop"),
      {
        milestone_loop: "process_milestone", // Will check if done first
        story_loop: "implement_story", // Will check if done first
      }
    )

    // === MILESTONE LOOP ===
    // After milestone processing → story loop
    .addConditionalEdges("process_milestone", shouldContinueStories, {
      implement_story: "implement_story",
      post_stories: "check_drift",
    })

    // === STORY LOOP ===
    .addEdge("implement_story", "run_tests")

    // Test results routing
    .addConditionalEdges("run_tests", routeTestResult, {
      story_complete: "story_complete",
      fix_tests: "fix_tests",
      story_complete_failed: "story_complete",
    })

    // Fix tests → retry tests
    .addEdge("fix_tests", "run_tests")

    // Story complete → check if more stories
    .addConditionalEdges("story_complete", shouldContinueStories, {
      implement_story: "implement_story",
      post_stories: "check_drift",
    })

    // === DRIFT CHECK LOOP ===
    .addConditionalEdges("check_drift", routeDriftResult, {
      fix_drift: "fix_drift",
      update_architecture: "update_architecture",
    })

    // Fix drift → re-check drift
    .addEdge("fix_drift", "check_drift")

    // Update architecture → route based on mode
    .addConditionalEdges("update_architecture", routeAfterPostStories, {
      milestone_commit: "milestone_commit",
      finalization: "finalization",
    })

    // Milestone commit → check if more milestones
    .addConditionalEdges("milestone_commit", shouldContinueMilestones, {
      process_milestone: "process_milestone",
      finalization: "finalization",
    })

    // Finalization → END
    .addEdge("finalization", END);

  // Compile with memory checkpoint
  const checkpointer = new MemorySaver();
  return workflow.compile({ checkpointer });
}

// =============================================================================
// EXECUTION
// =============================================================================

export async function runEpicWorkflow(options?: {
  promptFile?: string;
  outputDir?: string;
}) {
  const app = createEpicWorkflow();

  const initialState = {
    promptFile: options?.promptFile ?? ".claude/epic-prompt.md",
    outputDir: options?.outputDir ?? ".claude/generated",
  };

  // Run with thread ID for checkpointing
  const threadId = `epic-${Date.now()}`;
  const config = { configurable: { thread_id: threadId } };

  console.log("Starting Epic Implementation Workflow...");
  console.log(`Thread ID: ${threadId}`);
  console.log(`Prompt file: ${initialState.promptFile}`);
  console.log(`Output dir: ${initialState.outputDir}\n`);

  const result = await app.invoke(initialState, config);

  return result;
}

// CLI entry point
if (require.main === module) {
  runEpicWorkflow()
    .then((result) => {
      console.log("\nWorkflow completed successfully!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\nWorkflow failed:", error);
      process.exit(1);
    });
}
