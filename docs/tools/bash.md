# Bash Tool

The Bash tool executes shell commands during workflow execution. It supports two execution modes: background subprocess (default) for fast, non-interactive commands, and visible tmux pane for commands that need user observation.

## Basic Usage

```typescript
import type { WorkflowFactory } from "claude-workflow";

const workflow: WorkflowFactory = (t) => ({
  name: "my-workflow",
  steps: [
    t.step("Run tests", t.bash("npm test")),
  ],
});

export default workflow;
```

## Builder API

### `t.bash(command: string)`

Creates a bash tool definition with the specified command.

```typescript
t.step("Build project", t.bash("npm run build"))
```

### Step Options

When creating a step with `t.step()`, you can pass additional options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `output` | string | - | Variable name to store command output |
| `cwd` | string | project path | Working directory for the command |
| `visible` | boolean | `false` | Run in visible tmux pane instead of background |
| `when` | string | - | Conditional expression for step execution |
| `onError` | "stop" \| "continue" | "stop" | Error handling behavior |

## Configuration Options

### Output Capture

Store command output in a variable for use in later steps:

```typescript
t.step("Get current branch", t.bash("git branch --show-current"), {
  output: "branch_name",
})
```

### Working Directory

Override the working directory:

```typescript
t.step("Build frontend", t.bash("npm run build"), {
  cwd: "{project_path}/frontend",
})
```

### Visible Mode

When `visible: true`, the command runs in a visible tmux pane that you can observe. Useful for long-running commands or when you need to see real-time output:

```typescript
t.step("Run dev server", t.bash("npm run dev"), {
  visible: true,
})
```

## Variable Interpolation

Commands support variable interpolation using `{variableName}` syntax.

### Simple Variables

```typescript
const workflow: WorkflowFactory = (t) => ({
  name: "release",
  vars: {
    version: "1.2.3",
  },
  steps: [
    t.step("Tag release", t.bash("git tag v{version}")),
  ],
});
```

### Using Output from Previous Steps

```typescript
const workflow: WorkflowFactory = (t) => ({
  name: "analyze-branch",
  steps: [
    t.step("Get current branch", t.bash("git branch --show-current"), {
      output: "branch_name",
    }),
    t.step("Show branch info", t.bash("echo 'Working on branch: {branch_name}'")),
  ],
});
```

### Nested Object Access

Access nested fields using dot notation when working with JSON output:

```typescript
const workflow: WorkflowFactory = (t) => ({
  name: "package-info",
  steps: [
    t.step("Get package info", t.bash("cat package.json"), {
      output: "pkg",
    }),
    t.step("Show info", t.bash("echo 'Building {pkg.name} v{pkg.version}'")),
  ],
});
```

## Execution Modes

### Background Mode (Default)

Commands run in a subprocess without visible output. Best for:
- Quick commands (status checks, file operations)
- Commands where only the output matters
- Automated steps that don't need monitoring

```typescript
t.step("Check status", t.bash("git status --porcelain"), {
  output: "changes",
})
```

Characteristics:
- 10-minute timeout
- Exit code determines success/failure
- Stderr is captured and included in output with `[STDERR]` prefix
- No visual feedback during execution

### Visible Mode

Commands run in a new tmux pane visible to the user. Best for:
- Long-running builds or tests
- Commands with streaming output
- Debugging when you need to see what's happening

```typescript
t.step("Run tests with coverage", t.bash("npm test -- --coverage"), {
  visible: true,
})
```

Characteristics:
- No timeout (waits for completion via idle detection)
- Pane closes automatically when command finishes
- Uses hash-based idle detection (10 seconds of no output = done)
- Always reports success (exit code not detected)

## Output Handling

### How Output is Captured

**Background mode** (`visible: false`):
- Stdout is captured directly from the subprocess
- Stderr is appended with a `[STDERR]` prefix if present
- Exit code determines success (0 = success)
- Output is trimmed by default

**Visible mode** (`visible: true`):
- Output is captured from the tmux pane after command completes
- Completion is detected using hash-based idle detection
- Success is always `true` (exit code detection not available in this mode)

## Example Workflows

### Check and Build Pattern

```typescript
const workflow: WorkflowFactory = (t) => ({
  name: "build-project",
  steps: [
    t.step("Check dependencies", t.bash("npm outdated || true"), {
      output: "outdated",
    }),
    t.step("Install dependencies", t.bash("npm ci")),
    t.step("Build project", t.bash("npm run build"), {
      visible: true,
    }),
  ],
});
```

### Conditional Execution

```typescript
const workflow: WorkflowFactory = (t) => ({
  name: "conditional-commit",
  steps: [
    t.step("Check for changes", t.bash("git status --porcelain"), {
      output: "git_status",
    }),
    t.step("Commit if changed", t.claude("Commit all changes"), {
      when: "{git_status} is not empty",
    }),
  ],
});
```

### Multi-Command Chains

```typescript
t.step("Setup and build", t.bash("npm install && npm run lint && npm run build"))
```

### Error Handling

```typescript
t.step("Check outdated (don't fail)", t.bash("npm outdated || true"))

// Or use onError option
t.step("Optional check", t.bash("npm outdated"), {
  onError: "continue",
})
```

## Security Considerations

### Command Injection

Variables are interpolated directly into commands. If variable values come from untrusted sources, they could inject malicious commands.

**Safer approach:**
- Validate/sanitize variables before use
- Use fixed commands when possible
- Avoid building commands from user input

### Shell Execution

Commands run with shell=True, meaning:
- Full shell syntax is available (pipes, redirects, etc.)
- Shell expansions and substitutions work
- Command chaining (`;`, `&&`, `||`) is possible

### Timeout Protection

Background commands have a 10-minute timeout to prevent runaway processes. Visible commands do not have a timeout.

## Tips and Common Patterns

### Use Output for Values You Need

```typescript
t.step("Get version", t.bash("node -v"), {
  output: "node_version",
})
```

### Use Visible for Long Operations

```typescript
t.step("Run full test suite", t.bash("npm test"), {
  visible: true,
})
```

### Combine with || true for Non-Critical Commands

```typescript
t.step("Check outdated (don't fail)", t.bash("npm outdated || true"))
```

### Use && Over Multiple Steps for Related Commands

```typescript
// Better: Single atomic operation
t.step("Build and test", t.bash("npm run build && npm test"))

// Worse: Separate steps continue even if build fails
t.step("Build", t.bash("npm run build")),
t.step("Test", t.bash("npm test")),
```

### Debug with echo

```typescript
t.step("Debug variables", t.bash("echo 'Current value: {my_var}'"))
```
