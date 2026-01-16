# Workflow Examples

Real-world TypeScript workflow examples using the `WorkflowBuilder` API.

## Quick Templates

### Minimal Workflow

```typescript
import type { WorkflowBuilder, WorkflowDefinition } from "../../src/types/index.ts";

export default (t: WorkflowBuilder): WorkflowDefinition => ({
  name: "Minimal Example",
  steps: [
    t.step("Do task", t.claude("Complete the requested task")),
  ],
});
```

### With Variables

```typescript
import type { WorkflowBuilder, WorkflowDefinition } from "../../src/types/index.ts";

export default (t: WorkflowBuilder): WorkflowDefinition => ({
  name: "With Variables",
  vars: {
    default_branch: "main",
  },
  steps: [
    t.step("Get branch", t.bash("git branch --show-current"), { output: "current_branch" }),
    t.step("Work on branch", t.claude("You're on branch {current_branch}")),
  ],
});
```

---

## Feature Development

### Complete Feature Workflow

```typescript
import type { WorkflowBuilder, WorkflowDefinition, StepDefinition } from "../../src/types/index.ts";

function fetchIssue(t: WorkflowBuilder): StepDefinition[] {
  return [
    t.step("Get issue", t.linear("get", { issueId: "{issue_id}" }), { output: "issue" }),
    t.step("Start work", t.linear("update", { issueId: "{issue_id}", status: "In Progress" })),
  ];
}

function implementFeature(t: WorkflowBuilder): StepDefinition[] {
  return [
    t.step("Create branch", t.bash("git checkout -b feature/{issue_id}")),
    t.step(
      "Implement feature",
      t.claude(`Implement the following feature:

**Title:** {issue.title}
**Description:** {issue.description}

Requirements:
- Follow existing code patterns
- Add appropriate tests
- Update documentation if needed`),
      { model: "opus" },
    ),
  ];
}

function testAndCommit(t: WorkflowBuilder): StepDefinition[] {
  return [
    t.retry({ maxAttempts: 3, until: "{test_result} == passed" }, [
      t.step("Execute tests", t.bash("npm test && echo 'passed' || echo 'failed'"), {
        output: "test_result",
      }),
      t.step("Fix if failed", t.claude("Fix the failing tests"), {
        when: "{test_result} == failed",
      }),
    ]),

    t.step("Lint code", t.bash("npm run lint --fix"), { onError: "continue" }),
    t.step("Commit", t.bash('git add -A && git commit -m "{issue_id}: {issue.title}"')),
  ];
}

export default (t: WorkflowBuilder): WorkflowDefinition => ({
  name: "Feature Development",
  vars: {
    issue_id: "",
  },
  claude: {
    model: "sonnet",
    dangerouslySkipPermissions: true,
  },
  steps: [
    ...fetchIssue(t),
    ...implementFeature(t),
    ...testAndCommit(t),

    t.step("Comment", t.linear("comment", {
      issueId: "{issue_id}",
      body: "Implementation complete. Ready for review.",
    })),
    t.step("Ready for review", t.linear("update", { issueId: "{issue_id}", status: "In Review" })),
  ],
});
```

---

## Bug Fixing

### Bug Fix with Investigation

```typescript
import type { WorkflowBuilder, WorkflowDefinition } from "../../src/types/index.ts";

export default (t: WorkflowBuilder): WorkflowDefinition => ({
  name: "Bug Investigation and Fix",
  vars: {
    bug_description: "",
  },
  claude: {
    model: "sonnet",
    dangerouslySkipPermissions: true,
  },
  steps: [
    t.step(
      "Investigate",
      t.claude(`Investigate this bug:

{bug_description}

1. Search the codebase for related code
2. Identify the root cause
3. Propose a fix

Output a summary of findings and proposed solution.`),
      { output: "investigation", model: "opus" },
    ),

    t.step(
      "Implement fix",
      t.claude(`Based on this investigation:

{investigation}

Implement the fix. Make minimal, targeted changes.`),
    ),

    t.retry({ maxAttempts: 3, until: "{test_status} == 0" }, [
      t.step("Run tests", t.bash("npm test; echo $?"), { output: "test_status" }),
      t.step("Fix test failures", t.claude("Fix the test failures related to your changes"), {
        when: "{test_status} != 0",
      }),
    ]),

    t.step("Commit fix", t.bash('git add -A && git commit -m "fix: {bug_description}"')),
  ],
});
```

---

## Code Review

### Automated Code Review

```typescript
import type { WorkflowBuilder, WorkflowDefinition } from "../../src/types/index.ts";

export default (t: WorkflowBuilder): WorkflowDefinition => ({
  name: "Code Review",
  vars: {
    base_branch: "main",
  },
  claude: {
    model: "opus",
    dangerouslySkipPermissions: true,
    allowedTools: ["Read", "Grep", "Glob"],
  },
  steps: [
    t.step("Get diff", t.bash("git diff {base_branch}...HEAD"), { output: "diff" }),
    t.step("Get files", t.bash("git diff --name-only {base_branch}...HEAD"), {
      output: "changed_files",
    }),

    t.step(
      "Review code",
      t.claude(`Review these code changes:

**Changed files:**
{changed_files}

**Diff:**
{diff}

Analyze for:
1. **Bugs** - Logic errors, edge cases, null checks
2. **Security** - Injection, XSS, sensitive data exposure
3. **Performance** - N+1 queries, unnecessary loops, memory leaks
4. **Style** - Naming, structure, readability
5. **Tests** - Coverage, edge cases, assertions

Format as actionable feedback.`),
      { output: "review" },
    ),

    t.step("Save review", t.data(`# Code Review

{review}`, "markdown"), { output: "review_file" }),

    t.step("Report", t.bash("echo 'Review saved to {review_file}'"), { visible: true }),
  ],
});
```

---

## CI/CD Workflows

### Full CI Pipeline

```typescript
import type { WorkflowBuilder, WorkflowDefinition, StepDefinition } from "../../src/types/index.ts";

function lintPhase(t: WorkflowBuilder): StepDefinition[] {
  return [
    t.step("Lint", t.bash("npm run lint"), { output: "lint_output", onError: "continue" }),
    t.step("Check lint", t.bash('echo "{lint_output}" | grep -q "error" && echo fail || echo pass'), {
      output: "lint_passed",
    }),
  ];
}

function testPhase(t: WorkflowBuilder): StepDefinition[] {
  return [
    t.step("Test", t.bash("npm test -- --coverage"), { output: "test_output", onError: "continue" }),
    t.step("Extract coverage", t.bash("echo '{test_output}' | grep -oP 'Coverage: \\K[0-9]+' || echo 0"), {
      output: "coverage",
    }),
  ];
}

export default (t: WorkflowBuilder): WorkflowDefinition => ({
  name: "CI Pipeline",
  vars: {
    coverage_threshold: "80",
  },
  claude: {
    dangerouslySkipPermissions: true,
  },
  steps: [
    t.step("Get branch", t.bash("git branch --show-current"), { output: "branch" }),

    ...lintPhase(t),
    ...testPhase(t),

    t.step("Build", t.bash("npm run build"), { output: "build_output", onError: "continue" }),

    t.step(
      "Check results",
      t.bash(`echo "Branch: {branch}"
echo "Lint: {lint_passed}"
echo "Coverage: {coverage}%"
echo "Build: done"`),
      { visible: true },
    ),
  ],
});
```

### Deployment Workflow

```typescript
import type { WorkflowBuilder, WorkflowDefinition } from "../../src/types/index.ts";

export default (t: WorkflowBuilder): WorkflowDefinition => ({
  name: "Deploy to Environment",
  vars: {
    environment: "",
    version: "",
  },
  claude: {
    dangerouslySkipPermissions: true,
  },
  steps: [
    t.step("Pre-deploy", t.bash(`if [ "{environment}" = "production" ]; then
  echo "Deploying to PRODUCTION - extra caution"
fi`), { visible: true }),

    t.step("Build", t.bash("npm run build")),
    t.step("Deploy", t.bash("deploy --env {environment} --version {version}"), { output: "deploy_output" }),

    t.step("Init health", t.set("healthy", "false")),

    t.while("{healthy} != true", [
      t.step("Check health", t.bash(`curl -sf "https://{environment}.example.com/health" && echo "true" || echo "false"`), {
        output: "healthy",
      }),
      t.step("Wait", t.bash("sleep 10"), { when: "{healthy} != true" }),
    ]),

    t.step("Verify", t.bash(`curl -s "https://{environment}.example.com/version"`), { output: "deployed_version" }),

    t.step("Check version", t.bash(`if [ "{deployed_version}" = "{version}" ]; then
  echo "Deployment verified: {version}"
else
  echo "Version mismatch! Expected {version}, got {deployed_version}"
  exit 1
fi`), { visible: true }),
  ],
});
```

---

## Batch Processing

### Process Multiple Files

```typescript
import type { WorkflowBuilder, WorkflowDefinition } from "../../src/types/index.ts";

export default (t: WorkflowBuilder): WorkflowDefinition => ({
  name: "Process Files",
  vars: {
    processed_count: "0",
  },
  claude: {
    dangerouslySkipPermissions: true,
  },
  steps: [
    t.step("Find files", t.bash("find src -name '*.ts' -type f | head -20"), { output: "files" }),

    t.forEach("{files}", "file", [
      t.step("Analyze {file}", t.claude(`Analyze {file}:
1. Check for code smells
2. Suggest improvements
3. Note any security issues

Be concise.`), { output: "analysis" }),

      t.step("Increment", t.bash("echo $(( {processed_count} + 1 ))"), { output: "processed_count" }),
    ]),

    t.step("Summary", t.bash("echo 'Processed {processed_count} files'"), { visible: true }),
  ],
});
```

### Process Linear Tasks in Batch

```typescript
import type { WorkflowBuilder, WorkflowDefinition } from "../../src/types/index.ts";

export default (t: WorkflowBuilder): WorkflowDefinition => ({
  name: "Process Linear Backlog",
  vars: {
    completed: "0",
  },
  claude: {
    dangerouslySkipPermissions: true,
  },
  steps: [
    t.range(1, 5, [
      t.step("Get task {_index}", t.linear("getNext", { team: "ENG", status: "Todo", priority: 3 }), {
        output: "issue_id",
      }),

      // Would need break support here in practice

      t.step("Get details", t.linear("get", { issueId: "{issue_id}" }), { output: "issue" }),
      t.step("Assign", t.linear("update", { issueId: "{issue_id}", status: "In Progress" })),

      t.step("Implement {issue_id}", t.claude(`Implement: {issue.title}

{issue.description}`), { output: "implementation" }),

      t.step("Complete {issue_id}", t.linear("update", { issueId: "{issue_id}", status: "Done" })),
      t.step("Increment", t.bash("echo $(( {completed} + 1 ))"), { output: "completed" }),
    ]),

    t.step("Report", t.bash("echo 'Completed {completed} tasks'"), { visible: true }),
  ],
});
```

---

## Data Processing

### JSON Configuration Management

```typescript
import type { WorkflowBuilder, WorkflowDefinition } from "../../src/types/index.ts";

export default (t: WorkflowBuilder): WorkflowDefinition => ({
  name: "Update Configs",
  vars: {
    new_version: "",
  },
  steps: [
    t.step("Update version", t.json("set", { file: "package.json", path: ".version", value: "{new_version}" })),

    t.step("Get timestamp", t.bash("date -u +%Y-%m-%dT%H:%M:%SZ"), { output: "timestamp" }),
    t.step("Get commit", t.bash("git rev-parse --short HEAD"), { output: "commit" }),

    t.step("Add build info", t.json("update", {
      file: "package.json",
      path: ".build",
      operation: "merge",
      value: { timestamp: "{timestamp}", commit: "{commit}", version: "{new_version}" },
    })),

    t.step("Verify", t.json("query", { file: "package.json", query: "version" }), { output: "verified_version" }),

    t.step("Check", t.bash(`if [ "{verified_version}" = "{new_version}" ]; then
  echo "Version updated to {new_version}"
else
  echo "Update failed!"
  exit 1
fi`), { visible: true }),
  ],
});
```

---

## Patterns Reference

### Error Recovery Pattern

```typescript
t.step("Risky operation", t.bash("risky-command"), { output: "result", onError: "continue" }),
t.step("Handle error", t.claude("The operation failed. Analyze and fix the issue."), {
  when: "{result} is empty",
}),
t.step("Retry", t.bash("risky-command"), { when: "{result} is empty" }),
```

### Approval Gate Pattern

```typescript
t.step("Prepare changes", t.claude("Prepare the changes but don't commit yet"), { output: "changes" }),
t.step("Show changes", t.bash("git diff"), { visible: true }),
t.step("Get approval", t.claude(`Review the changes above.
If they look correct, respond with "APPROVED".
Otherwise, explain what needs to change.`), { output: "approval" }),
t.step("Commit if approved", t.bash('git add -A && git commit -m "Apply reviewed changes"'), {
  when: "{approval} contains APPROVED",
}),
```

### Parallel-ish Processing Pattern

```typescript
// Gather all info first
t.step("Get file list", t.bash("ls *.ts"), { output: "files" }),

// Process in loop with fast model
t.forEach("{files}", "file", [
  t.step("Quick analysis of {file}", t.claude("Quick review of {file}"), { model: "haiku" }),
]),
```

### Hooks Pattern

```typescript
// Optional hooks - skip silently if not found
t.step("Pre-build hook", t.hook("pre-build"), { onError: "continue" }),
t.step("Build", t.bash("npm run build")),
t.step("Post-build hook", t.hook("post-build"), { onError: "continue" }),
```
