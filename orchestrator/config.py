"""Configuration dataclasses and YAML loading for workflow orchestrator."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

import yaml


@dataclass
class TmuxConfig:
    """Tmux pane configuration."""

    new_window: bool = False
    split: str = "vertical"
    idle_time: float = 3.0


@dataclass
class ClaudeConfig:
    """Claude Code configuration."""

    interactive: bool = True
    cwd: Optional[str] = None
    model: Optional[str] = None
    dangerously_skip_permissions: bool = False
    allowed_tools: Optional[List[str]] = None
    permission_mode: Optional[str] = None  # plan, acceptEdits, bypassPermissions, etc.
    auto_approve_plan: bool = True  # Auto-approve ExitPlanMode prompts via tmux
    append_system_prompt: Optional[str] = None  # Prepended to all claude prompts


@dataclass
class ClaudeSdkConfig:
    """Claude SDK tool configuration at workflow level."""

    system_prompt: Optional[str] = None  # Default system prompt for all claude_sdk steps
    model: Optional[str] = None  # Default model alias (sonnet, opus, haiku)


@dataclass
class OnErrorConfig:
    """Workflow-level error handling configuration."""

    capture_context: bool = False  # Whether to capture debug info on failure
    save_to: str = ".claude/workflow_debug/"  # Directory for debug files


@dataclass
class WorkflowInfo:
    """Metadata about a discovered workflow file."""

    name: str  # From the 'name' field in YAML
    file_path: Path  # Absolute path to the workflow file


@dataclass
class Step:
    """A single workflow step."""

    name: str
    tool: str = "claude"
    prompt: Optional[str] = None
    command: Optional[str] = None
    output_var: Optional[str] = None
    on_error: str = "stop"
    visible: bool = False
    cwd: Optional[str] = None
    when: Optional[str] = None
    # Fields for goto and set tools
    target: Optional[str] = None  # For goto: target step name
    var: Optional[str] = None     # For set: variable name
    value: Optional[str] = None   # For set: variable value
    expr: Optional[str] = None    # For set: expression to evaluate
    # Fields for bash tool
    strip_output: bool = True     # Strip whitespace from output
    env: Optional[Dict[str, str]] = None  # Environment variables for bash
    # Fields for linear tools
    action: Optional[str] = None  # Linear action type
    team: Optional[str] = None  # Team key or name
    project: Optional[str] = None  # Project name
    issue_id: Optional[str] = None  # Issue identifier
    title: Optional[str] = None  # Issue title
    description: Optional[str] = None  # Issue description
    priority: Optional[int] = None  # Priority level (0-4)
    labels: Optional[Union[List[str], str]] = None  # Label names
    status: Optional[str] = None  # Workflow state name
    assignee: Optional[str] = None  # User identifier
    body: Optional[str] = None  # Comment body
    skip_blocked: bool = True  # Skip blocked issues in get_next
    filter: Optional[Dict[str, Any]] = None  # Custom GraphQL filter
    api_key: Optional[str] = None  # Optional API key override
    # Fields for claude_sdk tool
    model: Optional[str] = None  # Model alias: sonnet, opus, haiku
    system_prompt: Optional[str] = None  # Override workflow-level system prompt
    output_type: Optional[str] = None  # boolean, enum, decision, schema
    values: Optional[List[str]] = None  # For enum output_type
    schema: Optional[Dict[str, Any]] = None  # For schema output_type
    max_retries: int = 3  # Schema validation retries
    max_turns: int = 10  # Max SDK agentic turns
    timeout: int = 60000  # Timeout in milliseconds
    verbose: bool = False  # Capture full transcript in output
    # Fields for foreach tool
    source: Optional[str] = None  # Variable name containing JSON array
    item_var: Optional[str] = None  # Current item variable name
    index_var: Optional[str] = None  # Current index variable name (optional)
    on_item_error: str = "stop"  # Error handling: stop | stop_loop | continue
    steps: Optional[List[Step]] = None  # Nested steps for foreach
    # Foreach enhancements (filter, order_by, break_when)
    foreach_filter: Optional[str] = None  # jq-style expression to filter items
    order_by: Optional[str] = None  # jq-style expression to sort items
    break_when: Optional[str] = None  # Condition to break loop early
    # Fields for shared steps (uses tool)
    uses: Optional[str] = None  # Shared step reference (e.g., "builtin:git-checkout")
    with_inputs: Optional[Dict[str, Any]] = None  # Input values for shared step
    outputs: Optional[Dict[str, str]] = None  # Output mapping {parent_var: output_name}
    # Fields for while tool
    condition: Optional[str] = None  # Condition to evaluate before each iteration
    max_iterations: Optional[int] = None  # Safety limit for while loops
    on_max_reached: str = "error"  # Action when max_iterations reached: error | continue
    # Fields for retry tool
    max_attempts: Optional[int] = None  # Max retry attempts
    until: Optional[str] = None  # Early success condition
    delay: float = 0  # Seconds between retry attempts
    on_failure: str = "error"  # Action when all retries fail: error | continue
    # Fields for range tool
    range_from: Optional[int] = None  # Start value (inclusive)
    range_to: Optional[int] = None  # End value (inclusive)
    range_step: int = 1  # Step increment (can be negative)
    # Fields for context tool
    mappings: Optional[Dict[str, str]] = None  # For copy action: source -> target
    vars: Optional[List[str]] = None  # For clear action: variables to clear
    file: Optional[str] = None  # For export action: output file path
    # Fields for data tool
    content: Optional[str] = None  # Content to write
    format: Optional[str] = None  # Format: json, text, markdown
    filename: Optional[str] = None  # Optional filename
    # Fields for json tool
    query: Optional[str] = None  # JSON path query expression
    path: Optional[str] = None  # JSON path for set/update/delete
    operation: Optional[str] = None  # Update operation: append, prepend, increment, merge
    create_if_missing: bool = False  # Create file/object if not exists


@dataclass
class WorkflowConfig:
    """Complete workflow configuration."""

    name: str
    steps: List[Step]
    tmux: TmuxConfig = field(default_factory=TmuxConfig)
    claude: ClaudeConfig = field(default_factory=ClaudeConfig)
    claude_sdk: ClaudeSdkConfig = field(default_factory=ClaudeSdkConfig)
    on_error: OnErrorConfig = field(default_factory=OnErrorConfig)


def _parse_step(step_data: Dict[str, Any]) -> Step:
    """Parse a step dictionary into a Step dataclass.

    Handles recursive parsing for nested steps (foreach).
    """
    # Parse nested steps recursively if present
    nested_steps: Optional[List[Step]] = None
    if "steps" in step_data and step_data["steps"]:
        nested_steps = [_parse_step(s) for s in step_data["steps"]]

    return Step(
        name=step_data["name"],
        tool=step_data.get("tool", "claude"),
        prompt=step_data.get("prompt"),
        command=step_data.get("command"),
        output_var=step_data.get("output_var"),
        on_error=step_data.get("on_error", "stop"),
        visible=step_data.get("visible", False),
        cwd=step_data.get("cwd"),
        when=step_data.get("when"),
        target=step_data.get("target"),
        var=step_data.get("var"),
        value=step_data.get("value"),
        expr=step_data.get("expr"),
        strip_output=step_data.get("strip_output", True),
        env=step_data.get("env"),
        # Linear tool fields
        action=step_data.get("action"),
        team=step_data.get("team"),
        project=step_data.get("project"),
        issue_id=step_data.get("issue_id"),
        title=step_data.get("title"),
        description=step_data.get("description"),
        priority=step_data.get("priority"),
        labels=step_data.get("labels"),
        status=step_data.get("status"),
        assignee=step_data.get("assignee"),
        body=step_data.get("body"),
        skip_blocked=step_data.get("skip_blocked", True),
        filter=step_data.get("filter"),
        api_key=step_data.get("api_key"),
        # claude_sdk tool fields
        model=step_data.get("model"),
        system_prompt=step_data.get("system_prompt"),
        output_type=step_data.get("output_type"),
        values=step_data.get("values"),
        schema=step_data.get("schema"),
        max_retries=step_data.get("max_retries", 3),
        max_turns=step_data.get("max_turns", 10),
        timeout=step_data.get("timeout", 60000),
        verbose=step_data.get("verbose", False),
        # foreach tool fields
        source=step_data.get("source"),
        item_var=step_data.get("item_var"),
        index_var=step_data.get("index_var"),
        on_item_error=step_data.get("on_item_error", "stop"),
        steps=nested_steps,
        # foreach enhancements
        foreach_filter=step_data.get("filter"),
        order_by=step_data.get("order_by"),
        break_when=step_data.get("break_when"),
        # shared steps (uses) fields - note: 'with' in YAML maps to 'with_inputs'
        uses=step_data.get("uses"),
        with_inputs=step_data.get("with"),
        outputs=step_data.get("outputs"),
        # while tool fields
        condition=step_data.get("condition"),
        max_iterations=step_data.get("max_iterations"),
        on_max_reached=step_data.get("on_max_reached", "error"),
        # retry tool fields
        max_attempts=step_data.get("max_attempts"),
        until=step_data.get("until"),
        delay=step_data.get("delay", 0),
        on_failure=step_data.get("on_failure", "error"),
        # range tool fields - note: 'from'/'to'/'step' in YAML map to range_*
        range_from=step_data.get("from"),
        range_to=step_data.get("to"),
        range_step=step_data.get("step", 1),
        # context tool fields
        mappings=step_data.get("mappings"),
        vars=step_data.get("vars"),
        file=step_data.get("file"),
        # data tool fields
        content=step_data.get("content"),
        format=step_data.get("format"),
        filename=step_data.get("filename"),
        # json tool fields
        query=step_data.get("query"),
        path=step_data.get("path"),
        operation=step_data.get("operation"),
        create_if_missing=step_data.get("create_if_missing", False),
    )


def load_config(
    project_path: Path,
    workflow_file: Optional[Path] = None,
) -> WorkflowConfig:
    """Load and parse workflow YAML configuration.

    Args:
        project_path: Path to the project root
        workflow_file: Optional specific workflow file to load.
                      If None, falls back to legacy behavior (workflow.yml)
    """
    if workflow_file is not None:
        workflow_path = workflow_file
    else:
        # Legacy fallback for backward compatibility
        workflow_path = project_path / ".claude" / "workflow.yml"
        if not workflow_path.exists():
            workflow_path = project_path / ".claude" / "workflow.yaml"

    if not workflow_path.exists():
        raise FileNotFoundError(
            f"Workflow file not found at:\n  {workflow_path}"
        )

    with open(workflow_path, "r") as f:
        data = yaml.safe_load(f)

    steps = [_parse_step(s) for s in data.get("steps", [])]

    tmux_data = data.get("tmux", {})
    tmux_config = TmuxConfig(
        new_window=tmux_data.get("new_window", False),
        split=tmux_data.get("split", "vertical"),
        idle_time=tmux_data.get("idle_time", 3.0),
    )

    claude_data = data.get("claude", {})
    allowed_tools = claude_data.get("allowed_tools")
    if isinstance(allowed_tools, str):
        allowed_tools = [allowed_tools]

    claude_config = ClaudeConfig(
        interactive=claude_data.get("interactive", True),
        cwd=claude_data.get("cwd"),
        model=claude_data.get("model"),
        dangerously_skip_permissions=claude_data.get(
            "dangerously_skip_permissions", False
        ),
        allowed_tools=allowed_tools,
        permission_mode=claude_data.get("permission_mode"),
        auto_approve_plan=claude_data.get("auto_approve_plan", True),
        append_system_prompt=claude_data.get("append_system_prompt"),
    )

    claude_sdk_data = data.get("claude_sdk", {})
    claude_sdk_config = ClaudeSdkConfig(
        system_prompt=claude_sdk_data.get("system_prompt"),
        model=claude_sdk_data.get("model"),
    )

    on_error_data = data.get("on_error", {})
    on_error_config = OnErrorConfig(
        capture_context=on_error_data.get("capture_context", False),
        save_to=on_error_data.get("save_to", ".claude/workflow_debug/"),
    )

    return WorkflowConfig(
        name=data.get("name", "Workflow"),
        steps=steps,
        tmux=tmux_config,
        claude=claude_config,
        claude_sdk=claude_sdk_config,
        on_error=on_error_config,
    )


def discover_workflows(project_path: Path) -> List[WorkflowInfo]:
    """Discover all workflow files with 'type: claude-workflow' marker.

    Scans the .claude/ directory for YAML files containing the marker.

    Args:
        project_path: Path to the project root

    Returns:
        List of WorkflowInfo sorted by name
    """
    claude_dir = project_path / ".claude"

    if not claude_dir.exists():
        return []

    workflows: List[WorkflowInfo] = []

    # Scan for .yml and .yaml files
    for pattern in ("*.yml", "*.yaml"):
        for file_path in claude_dir.glob(pattern):
            if not file_path.is_file():
                continue

            try:
                with open(file_path, "r") as f:
                    data = yaml.safe_load(f)

                if not isinstance(data, dict):
                    continue

                # Check for workflow marker and version
                if data.get("type") == "claude-workflow" and data.get("version") == 2:
                    workflow_name = data.get("name", file_path.stem)
                    workflows.append(
                        WorkflowInfo(
                            name=workflow_name,
                            file_path=file_path,
                        )
                    )
            except (yaml.YAMLError, OSError):
                continue

    # Sort by name for consistent ordering
    workflows.sort(key=lambda w: w.name.lower())

    return workflows


def validate_workflow_file(file_path: Path) -> tuple[bool, Optional[str]]:
    """Validate that a file is a valid workflow with required type and version.

    Args:
        file_path: Path to the workflow file

    Returns:
        Tuple of (is_valid, error_message). If valid, error_message is None.
    """
    if not file_path.exists():
        return False, f"File not found: {file_path}"

    if not file_path.is_file():
        return False, f"Not a file: {file_path}"

    try:
        with open(file_path, "r") as f:
            data = yaml.safe_load(f)
    except yaml.YAMLError as e:
        return False, f"Invalid YAML: {e}"

    if not isinstance(data, dict):
        return False, "Workflow file must contain a YAML dictionary"

    if data.get("type") != "claude-workflow":
        return False, "Missing or invalid 'type' field (must be 'claude-workflow')"

    if data.get("version") != 2:
        return False, "Missing or invalid 'version' field (must be 2)"

    return True, None


def find_workflow_by_name(
    workflows: List[WorkflowInfo],
    name: str,
) -> Optional[WorkflowInfo]:
    """Find a workflow by name (case-insensitive).

    Args:
        workflows: List of discovered workflows
        name: Workflow name to search for

    Returns:
        Matching WorkflowInfo or None if not found
    """
    name_lower = name.lower()

    # First try exact match
    for workflow in workflows:
        if workflow.name.lower() == name_lower:
            return workflow

    # Then try partial match (single match only)
    matches = [w for w in workflows if name_lower in w.name.lower()]

    if len(matches) == 1:
        return matches[0]

    return None
