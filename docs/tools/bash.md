# Bash Tool

The Bash tool executes shell commands during workflow execution. It supports two execution modes: background subprocess (default) for fast, non-interactive commands, and visible tmux pane for commands that need user observation.

## Basic Usage

```yaml
steps:
  - name: "Run tests"
    tool: bash
    command: "npm test"
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `command` | string | *required* | The shell command to execute |
| `cwd` | string | project path | Working directory for the command |
| `visible` | boolean | `false` | Run in visible tmux pane instead of background |
| `strip_output` | boolean | `true` | Remove leading/trailing whitespace from output |
| `output_var` | string | - | Variable name to store command output |

### Required Fields

- `tool: bash` - Identifies this as a bash step
- `command` - The shell command to run

### Optional Fields

#### `cwd`

Override the working directory. Defaults to the project path specified when running the workflow.

```yaml
- name: "Build frontend"
  tool: bash
  command: "npm run build"
  cwd: "{project_path}/frontend"
```

#### `visible`

When `true`, the command runs in a visible tmux pane that you can observe. Useful for long-running commands or when you need to see real-time output.

```yaml
- name: "Run dev server"
  tool: bash
  command: "npm run dev"
  visible: true
```

#### `strip_output`

Controls whether whitespace is trimmed from captured output. Set to `false` if you need to preserve exact formatting.

```yaml
- name: "Get formatted output"
  tool: bash
  command: "cat config.json"
  strip_output: false
  output_var: config
```

#### `output_var`

Captures the command's stdout into a variable for use in later steps.

```yaml
- name: "Get current branch"
  tool: bash
  command: "git branch --show-current"
  output_var: branch_name

- name: "Use the branch"
  prompt: "Create a PR for the {branch_name} branch"
```

## Output Capture

### How Output is Captured

**Background mode** (`visible: false`):
- Stdout is captured directly from the subprocess
- Stderr is appended with a `[STDERR]` prefix if present
- Exit code determines success (0 = success)

**Visible mode** (`visible: true`):
- Output is captured from the tmux pane after command completes
- Completion is detected using hash-based idle detection (waits for pane content to stop changing)
- Success is always `true` (exit code detection not available in this mode)

### Accessing Output

Use `output_var` to store output in a variable:

```yaml
- name: "List files"
  tool: bash
  command: "ls -la"
  output_var: file_list

- name: "Process files"
  prompt: "Analyze these files:\n{file_list}"
```

## Variable Interpolation

Commands support variable interpolation using `{variable_name}` syntax.

### Simple Variables

```yaml
- name: "Set version"
  tool: set
  var: version
  value: "1.2.3"

- name: "Tag release"
  tool: bash
  command: "git tag v{version}"
```

### Nested Object Access

Access nested fields using dot notation:

```yaml
- name: "Get package info"
  tool: bash
  command: "cat package.json"
  output_var: pkg

# Access nested fields (JSON is auto-parsed)
- name: "Show package name"
  tool: bash
  command: "echo Package: {pkg.name}, Version: {pkg.version}"
```

### Array Index Access

Access array elements using numeric indices:

```yaml
- name: "Get files"
  tool: bash
  command: "ls -1 | head -3"
  output_var: files

# If output is JSON array
- name: "First file"
  tool: bash
  command: "echo {files.0}"
```

### Using in cwd

The `cwd` option also supports interpolation:

```yaml
- name: "Build in custom dir"
  tool: bash
  command: "make build"
  cwd: "{build_directory}"
```

## Execution Modes

### Background Mode (Default)

Commands run in a subprocess without visible output. Best for:
- Quick commands (status checks, file operations)
- Commands where only the output matters
- Automated steps that don't need monitoring

```yaml
- name: "Check status"
  tool: bash
  command: "git status --porcelain"
  output_var: changes
```

Characteristics:
- 10-minute timeout
- Exit code determines success/failure
- Stderr is captured and included in output
- No visual feedback during execution

### Visible Mode

Commands run in a new tmux pane visible to the user. Best for:
- Long-running builds or tests
- Commands with streaming output
- Debugging when you need to see what's happening

```yaml
- name: "Run tests with coverage"
  tool: bash
  command: "npm test -- --coverage"
  visible: true
```

Characteristics:
- No timeout (waits for completion via idle detection)
- Pane closes automatically when command finishes
- Uses hash-based idle detection (10 seconds of no output = done)
- Always reports success (exit code not detected)

## Example Workflow Steps

### Check and Build Pattern

```yaml
steps:
  - name: "Check dependencies"
    tool: bash
    command: "npm outdated || true"
    output_var: outdated

  - name: "Install dependencies"
    tool: bash
    command: "npm ci"

  - name: "Build project"
    tool: bash
    command: "npm run build"
    visible: true
```

### Conditional Execution

```yaml
steps:
  - name: "Check for changes"
    tool: bash
    command: "git status --porcelain"
    output_var: git_status

  - name: "Commit if changed"
    prompt: "Commit all changes"
    when: "{git_status} is not empty"
```

### Environment Detection

```yaml
steps:
  - name: "Get environment"
    tool: bash
    command: "echo $NODE_ENV"
    output_var: env

  - name: "Production build"
    tool: bash
    command: "npm run build:prod"
    visible: true
    when: "{env} == production"

  - name: "Development build"
    tool: bash
    command: "npm run build:dev"
    when: "{env} != production"
```

### Arithmetic with Loop

```yaml
steps:
  - name: "Initialize counter"
    tool: set
    var: count
    value: "1"

  - name: "Process batch"
    prompt: "Process batch {count}"

  - name: "Increment"
    tool: bash
    command: "echo $(( {count} + 1 ))"
    output_var: count

  - name: "Loop"
    tool: goto
    target: "Process batch"
    when: "{count} <= 5"
```

### Multi-Command Chains

```yaml
- name: "Setup and build"
  tool: bash
  command: "npm install && npm run lint && npm run build"
```

### Capturing JSON Output

```yaml
- name: "Get package info"
  tool: bash
  command: "cat package.json"
  output_var: package

- name: "Show info"
  tool: bash
  command: "echo 'Building {package.name} v{package.version}'"
```

## Security Considerations

### Command Injection

Variables are interpolated directly into commands. If variable values come from untrusted sources, they could inject malicious commands.

**Vulnerable pattern:**
```yaml
# If user_input contains "; rm -rf /"
- name: "Search"
  tool: bash
  command: "grep {user_input} file.txt"
```

**Safer approach:**
- Validate/sanitize variables before use
- Use fixed commands when possible
- Avoid building commands from user input

### Shell Execution

Commands run with `shell=True`, meaning:
- Full shell syntax is available (pipes, redirects, etc.)
- Shell expansions and substitutions work
- Command chaining (`;`, `&&`, `||`) is possible

### Working Directory

The `cwd` parameter defaults to the project path, not the system root. This limits scope but doesn't prevent access to parent directories.

### Timeout Protection

Background commands have a 10-minute timeout to prevent runaway processes. Visible commands do not have a timeout.

### Exit Code Handling

- Background mode: Non-zero exit codes are treated as failures
- Visible mode: Exit codes are not detected; success is always reported

## Tips and Common Patterns

### Always Use output_var for Values You Need

```yaml
- name: "Get version"
  tool: bash
  command: "node -v"
  output_var: node_version
```

### Use visible: true for Long Operations

```yaml
- name: "Run full test suite"
  tool: bash
  command: "npm test"
  visible: true  # See progress in real-time
```

### Combine with || true for Non-Critical Commands

```yaml
- name: "Check outdated (don't fail)"
  tool: bash
  command: "npm outdated || true"
```

### Use Here-Documents for Multi-Line Scripts

```yaml
- name: "Complex script"
  tool: bash
  command: |
    for file in *.txt; do
      echo "Processing $file"
      wc -l "$file"
    done
```

### Prefer && Over Multiple Steps for Related Commands

```yaml
# Better: Single atomic operation
- name: "Build and test"
  tool: bash
  command: "npm run build && npm test"

# Worse: Separate steps continue even if build fails
- name: "Build"
  tool: bash
  command: "npm run build"

- name: "Test"
  tool: bash
  command: "npm test"
```

### Debug with echo

```yaml
- name: "Debug variables"
  tool: bash
  command: "echo 'Current value: {my_var}'"
```

### Store Complex Output for Later

```yaml
- name: "Capture git log"
  tool: bash
  command: "git log --oneline -10"
  output_var: recent_commits

- name: "Analyze commits"
  prompt: |
    Review these recent commits and summarize the changes:
    {recent_commits}
```
