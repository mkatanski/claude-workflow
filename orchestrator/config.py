"""Configuration dataclasses and YAML loading for workflow orchestrator."""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

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


@dataclass
class WorkflowConfig:
    """Complete workflow configuration."""

    name: str
    variables: Dict[str, List[Any]]
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
        variables=data.get("variables", {}),
        steps=steps,
        tmux=tmux_config,
        claude=claude_config,
    )
