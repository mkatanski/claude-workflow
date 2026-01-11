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


@dataclass
class ClaudeSdkConfig:
    """Claude SDK tool configuration at workflow level."""

    system_prompt: Optional[str] = None  # Default system prompt for all claude_sdk steps
    model: Optional[str] = None  # Default model alias (sonnet, opus, haiku)


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
    # Fields for bash tool
    strip_output: bool = True     # Strip whitespace from output
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


@dataclass
class WorkflowConfig:
    """Complete workflow configuration."""

    name: str
    steps: List[Step]
    tmux: TmuxConfig = field(default_factory=TmuxConfig)
    claude: ClaudeConfig = field(default_factory=ClaudeConfig)
    claude_sdk: ClaudeSdkConfig = field(default_factory=ClaudeSdkConfig)


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
        strip_output=step_data.get("strip_output", True),
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
    )

    claude_sdk_data = data.get("claude_sdk", {})
    claude_sdk_config = ClaudeSdkConfig(
        system_prompt=claude_sdk_data.get("system_prompt"),
        model=claude_sdk_data.get("model"),
    )

    return WorkflowConfig(
        name=data.get("name", "Workflow"),
        steps=steps,
        tmux=tmux_config,
        claude=claude_config,
        claude_sdk=claude_sdk_config,
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
