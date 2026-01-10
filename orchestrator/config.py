"""Configuration dataclasses and YAML loading for workflow orchestrator."""

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


@dataclass
class WorkflowConfig:
    """Complete workflow configuration."""

    name: str
    steps: List[Step]
    tmux: TmuxConfig = field(default_factory=TmuxConfig)
    claude: ClaudeConfig = field(default_factory=ClaudeConfig)


def _parse_step(step_data: Dict[str, Any]) -> Step:
    """Parse a step dictionary into a Step dataclass."""
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
    )


def load_config(project_path: Path) -> WorkflowConfig:
    """Load and parse workflow YAML configuration from .claude/workflow.yml."""
    workflow_path = project_path / ".claude" / "workflow.yml"

    if not workflow_path.exists():
        workflow_path = project_path / ".claude" / "workflow.yaml"

    if not workflow_path.exists():
        raise FileNotFoundError(
            f"Workflow file not found at:\n"
            f"  {project_path / '.claude' / 'workflow.yml'}\n"
            f"  {project_path / '.claude' / 'workflow.yaml'}"
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

    return WorkflowConfig(
        name=data.get("name", "Workflow"),
        steps=steps,
        tmux=tmux_config,
        claude=claude_config,
    )
