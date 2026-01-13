"""Linear tasks tool for workflow-focused issue operations."""

import json
from typing import TYPE_CHECKING, Any, Dict, List

from ..display_adapter import get_display
from ..linear import IssueFilters, LinearClientWrapper
from .base import BaseTool, ToolResult

if TYPE_CHECKING:
    from ..context import ExecutionContext
    from ..tmux import TmuxManager


class LinearTasksTool(BaseTool):
    """Fetch and query Linear issues for workflow automation.

    Actions:
        - get_next: Get next available issue ID with filters
        - get: Fetch full issue details by ID
        - assign: Assign issue to a user
    """

    @property
    def name(self) -> str:
        return "linear_tasks"

    def validate_step(self, step: Dict[str, Any]) -> None:
        """Validate linear_tasks step configuration."""
        action = step.get("action")
        if not action:
            raise ValueError("linear_tasks step requires 'action' field")

        valid_actions = ("get_next", "get", "assign")
        if action not in valid_actions:
            raise ValueError(
                f"Invalid action '{action}'. Must be one of: {valid_actions}"
            )

        if action == "get_next":
            if not step.get("team"):
                raise ValueError("get_next action requires 'team' field")

        elif action == "get":
            if not step.get("issue_id"):
                raise ValueError("get action requires 'issue_id' field")

        elif action == "assign":
            if not step.get("issue_id"):
                raise ValueError("assign action requires 'issue_id' field")
            if not step.get("assignee"):
                raise ValueError("assign action requires 'assignee' field")

    def execute(
        self,
        step: Dict[str, Any],
        context: "ExecutionContext",
        tmux_manager: "TmuxManager",
    ) -> ToolResult:
        """Execute linear_tasks action."""
        action = step["action"]
        api_key = step.get("api_key")  # Optional override

        try:
            client = LinearClientWrapper(api_key=api_key)
        except ValueError as e:
            return ToolResult(success=False, error=str(e))

        display = get_display()
        display.console.print(f"[bold cyan]⌨[/bold cyan] [white]Linear: {action}[/white]")

        if action == "get_next":
            return self._action_get_next(step, context, client)
        elif action == "get":
            return self._action_get(step, context, client)
        elif action == "assign":
            return self._action_assign(step, context, client)

        return ToolResult(success=False, error=f"Unknown action: {action}")

    def _action_get_next(
        self,
        step: Dict[str, Any],
        context: "ExecutionContext",
        client: LinearClientWrapper,
    ) -> ToolResult:
        """Get next available issue matching filters."""
        labels_raw = step.get("labels")
        labels: List[str] | None = None
        if labels_raw is not None:
            if isinstance(labels_raw, list):
                labels = labels_raw
            elif isinstance(labels_raw, str):
                labels = [labels_raw]

        filters = IssueFilters(
            team=context.interpolate(step["team"]),
            project=context.interpolate_optional(step.get("project")),
            priority=step.get("priority"),
            labels=labels,
            status=context.interpolate_optional(step.get("status")),
            assignee=context.interpolate_optional(step.get("assignee")),
            custom_filter=step.get("filter"),
        )

        skip_blocked = step.get("skip_blocked", True)

        try:
            issue_id = client.get_next_issue(filters, skip_blocked=skip_blocked)

            if issue_id:
                return ToolResult(success=True, output=issue_id)
            else:
                return ToolResult(success=True, output="")
        except Exception as e:
            return ToolResult(success=False, error=str(e))

    def _action_get(
        self,
        step: Dict[str, Any],
        context: "ExecutionContext",
        client: LinearClientWrapper,
    ) -> ToolResult:
        """Fetch full issue details."""
        issue_id = context.interpolate(step["issue_id"])

        response = client.get_issue(issue_id)

        if response.success:
            return ToolResult(
                success=True,
                output=json.dumps(response.data, indent=2, default=str),
            )
        else:
            return ToolResult(success=False, error=response.error)

    def _action_assign(
        self,
        step: Dict[str, Any],
        context: "ExecutionContext",
        client: LinearClientWrapper,
    ) -> ToolResult:
        """Assign issue to a user."""
        issue_id = context.interpolate(step["issue_id"])
        assignee = context.interpolate(step["assignee"])

        response = client.assign_issue(issue_id, assignee)

        if response.success:
            return ToolResult(
                success=True,
                output=json.dumps(response.data, indent=2, default=str),
            )
        else:
            return ToolResult(success=False, error=response.error)
