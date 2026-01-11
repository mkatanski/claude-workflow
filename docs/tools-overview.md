# Tools Overview

This document explains the tool system in claude-workflow - the building blocks that make workflows actually do things.

## Philosophy: Why Tools Exist

Workflows in claude-workflow are declarative YAML files that describe *what* should happen. But YAML alone cannot execute shell commands, call AI models, or interact with external services. This is where tools come in.

**Tools are the execution layer.** Each tool encapsulates a specific capability - running bash commands, invoking Claude, managing Linear issues, or controlling workflow logic. This separation provides several benefits:

1. **Composability** - Complex workflows are built from simple, focused tools
2. **Testability** - Each tool can be tested in isolation
3. **Extensibility** - New capabilities are added by creating new tools, not modifying core workflow logic
4. **Consistency** - All tools follow the same interface, making workflows predictable

Think of tools like functions in a programming language. Your workflow is the program, and tools are the standard library functions you call to get work done.

## How the Tool Registry Works

The `ToolRegistry` is the central lookup table for all available tools. When the workflow engine encounters a step with `tool: bash`, it asks the registry for the `bash` tool implementation.

```python
from orchestrator.tools import ToolRegistry

# Get a tool by name
bash_tool = ToolRegistry.get("bash")

# List all available tools
available = ToolRegistry.available()  # ["claude", "claude_sdk", "bash", ...]
```

### Registration

Tools are registered at module load time in `orchestrator/tools/__init__.py`:

```python
ToolRegistry.register(ClaudeTool())
ToolRegistry.register(BashTool())
ToolRegistry.register(GotoTool())
# ... and so on
```

This happens automatically when the orchestrator module is imported. You never need to manually register built-in tools.

### Error Handling

If you reference a tool that does not exist, the registry raises a helpful error:

```
ValueError: Unknown tool: my_typo. Available: claude, claude_sdk, bash, goto, set, ...
```

## The Common Tool Interface

Every tool inherits from `BaseTool` and implements three methods:

### 1. `name` Property

Returns the tool's identifier used in YAML files:

```python
@property
def name(self) -> str:
    return "bash"
```

This string is what you write in `tool: bash` in your workflow.

### 2. `validate_step(step)` Method

Validates the step configuration before execution. Called during workflow validation, not execution:

```python
def validate_step(self, step: Dict[str, Any]) -> None:
    if "command" not in step:
        raise ValueError("Bash step requires 'command' field")
```

Validation catches configuration errors early, before any work is done.

### 3. `execute(step, context, tmux_manager)` Method

The actual work happens here. Every tool receives:

- `step` - The parsed YAML configuration for this step
- `context` - The `ExecutionContext` with variables and project info
- `tmux_manager` - For tools that need visible terminal panes

```python
def execute(
    self,
    step: Dict[str, Any],
    context: ExecutionContext,
    tmux_manager: TmuxManager,
) -> ToolResult:
    command = context.interpolate(step["command"])
    # ... execute the command ...
    return ToolResult(success=True, output=result)
```

## ToolResult: What Tools Return

Every tool execution returns a `ToolResult` with these fields:

| Field | Type | Purpose |
|-------|------|---------|
| `success` | `bool` | Did the tool complete successfully? |
| `output` | `str \| None` | Captured output (stored in `output_var` if specified) |
| `error` | `str \| None` | Error message if `success` is False |
| `goto_step` | `str \| None` | Target step name for control flow jumps |
| `loop_signal` | `LoopSignal` | Signal for loop control (`NONE`, `BREAK`, `CONTINUE`) |

Example results:

```python
# Successful bash command
ToolResult(success=True, output="file1.txt\nfile2.txt")

# Failed with error
ToolResult(success=False, error="Command timed out after 10 minutes")

# Goto control flow
ToolResult(success=True, goto_step="handle_error")

# Loop break signal
ToolResult(success=True, loop_signal=LoopSignal.BREAK)
```

## Available Tools

### Execution Tools

| Tool | Purpose |
|------|---------|
| `bash` | Execute shell commands in subprocess or visible tmux pane |
| `claude` | Run Claude Code prompts in a visible tmux pane with auto-completion detection |
| `claude_sdk` | AI-powered decision making with structured outputs (boolean, enum, decision, custom schema) |

### Control Flow Tools

| Tool | Purpose |
|------|---------|
| `goto` | Jump to a named step in the workflow |
| `foreach` | Iterate over arrays and execute nested steps for each item |
| `break` | Exit the current foreach loop early |
| `continue` | Skip to the next iteration of the current foreach loop |

### Variable Tools

| Tool | Purpose |
|------|---------|
| `set` | Assign a value to a variable in the execution context |

### Integration Tools

| Tool | Purpose |
|------|---------|
| `linear_tasks` | Query Linear issues (get next issue, fetch details, assign) |
| `linear_manage` | Create, update, and comment on Linear issues |

## How Tools Interact with ExecutionContext

The `ExecutionContext` is the shared state that flows through every step. Tools interact with it in two main ways:

### Reading Variables (Interpolation)

Tools use `context.interpolate()` to resolve `{variable}` placeholders in their configuration:

```python
# In YAML:
#   command: "echo {message}"
#
# In tool:
command = context.interpolate(step["command"])
# If message="hello", command becomes "echo hello"
```

Interpolation supports:
- Simple variables: `{var_name}`
- Nested paths: `{issue.title}` or `{items.0.name}`
- JSON parsing: Automatically parses JSON strings to access nested fields

### Writing Variables

Tools can store their output for later steps:

```yaml
- name: list_files
  tool: bash
  command: ls -la
  output_var: file_list  # Tool output stored here
```

The workflow engine handles `output_var` automatically - tools just return `output` in their `ToolResult`.

### Project Path

Every context has a `project_path` that tools use as the default working directory. The bash tool, for example, uses it unless a specific `cwd` is provided:

```python
cwd = context.interpolate_optional(step.get("cwd")) or str(context.project_path)
```

## Choosing the Right Tool

### Need to run a shell command?

Use `bash`. Set `visible: true` if you want to watch the output in real-time.

```yaml
- name: install_deps
  tool: bash
  command: npm install
```

### Need Claude to analyze code or make changes?

Use `claude`. It runs Claude Code in a tmux pane and waits for completion.

```yaml
- name: refactor_code
  tool: claude
  prompt: "Refactor the authentication module to use async/await"
```

### Need an AI decision without full Claude Code?

Use `claude_sdk`. It is faster, uses the SDK directly, and supports structured outputs.

```yaml
- name: should_deploy
  tool: claude_sdk
  prompt: "Based on the test results in {test_output}, should we deploy?"
  output_type: boolean
```

### Need to branch your workflow based on conditions?

Use `goto` to jump to a specific step, or combine with `claude_sdk` decision type:

```yaml
- name: decide_path
  tool: claude_sdk
  prompt: "Analyze the error and decide next step"
  output_type: decision
  # Returns { "goto": "step_name", "reason": "..." }
```

### Need to process a list of items?

Use `foreach` to iterate with full nested step support:

```yaml
- name: process_all_files
  tool: foreach
  source: file_list
  item_var: current_file
  steps:
    - name: process_file
      tool: bash
      command: "process {current_file}"
```

### Need to set or transform a variable?

Use `set` for explicit variable assignment:

```yaml
- name: set_default
  tool: set
  var: api_url
  value: "https://api.example.com"
```

### Need to work with Linear issues?

Use `linear_tasks` for querying and `linear_manage` for mutations:

```yaml
- name: get_next_task
  tool: linear_tasks
  action: get_next
  team: engineering
  output_var: issue_id

- name: mark_in_progress
  tool: linear_manage
  action: update
  issue_id: "{issue_id}"
  status: "In Progress"
```

## Further Reading

For detailed configuration options and examples for each tool, see:

- [bash Tool Reference](./tools/bash.md)
- [claude Tool Reference](./tools/claude.md)
- [claude_sdk Tool Reference](./tools/claude-sdk.md)
- [Control Flow Tools](./tools/control-flow.md)
- [Linear Integration Tools](./tools/linear.md)
- [Creating Custom Tools](./creating-tools.md)
