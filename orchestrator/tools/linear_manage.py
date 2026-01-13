"""Linear manage tool for issue lifecycle operations."""

import json
from typing import TYPE_CHECKING, Any, Dict, List

from ..display_adapter import get_display
from ..linear import IssueData, LinearClientWrapper
from .base import BaseTool, ToolResult

if TYPE_CHECKING:
    from ..context import ExecutionContext
    from ..tmux import TmuxManager


class LinearManageTool(BaseTool):
    """Create, update, and manage Linear issues.

    Actions:
        - create: Create new issue
        - update: Update issue fields
        - comment: Add comment to issue
    """

    @property
    def name(self) -> str:
        return "linear_manage"

    def validate_step(self, step: Dict[str, Any]) -> None:
        """Validate linear_manage step configuration."""
        action = step.get("action")
        if not action:
            raise ValueError("linear_manage step requires 'action' field")

        valid_actions = ("create", "update", "comment")
        if action not in valid_actions:
            raise ValueError(
                f"Invalid action '{action}'. Must be one of: {valid_actions}"
            )

        if action == "create":
            if not step.get("title"):
                raise ValueError("create action requires 'title' field")
            if not step.get("team"):
                raise ValueError("create action requires 'team' field")

        elif action == "update":
            if not step.get("issue_id"):
                raise ValueError("update action requires 'issue_id' field")

        elif action == "comment":
            if not step.get("issue_id"):
                raise ValueError("comment action requires 'issue_id' field")
            if not step.get("body"):
                raise ValueError("comment action requires 'body' field")

    def execute(
        self,
        step: Dict[str, Any],
        context: "ExecutionContext",
        tmux_manager: "TmuxManager",
    ) -> ToolResult:
        """Execute linear_manage action."""
        action = step["action"]
        api_key = step.get("api_key")  # Optional override

        try:
            client = LinearClientWrapper(api_key=api_key)
        except ValueError as e:
            return ToolResult(success=False, error=str(e))

        display = get_display()
        display.console.print(f"[bold cyan]⌨[/bold cyan] [white]Linear: {action}[/white]")

        if action == "create":
            return self._action_create(step, context, client)
        elif action == "update":
            return self._action_update(step, context, client)
        elif action == "comment":
            return self._action_comment(step, context, client)

        return ToolResult(success=False, error=f"Unknown action: {action}")

    def _action_create(
        self,
        step: Dict[str, Any],
        context: "ExecutionContext",
        client: LinearClientWrapper,
    ) -> ToolResult:
        """Create a new issue."""
        labels_raw = step.get("labels")
        labels: List[str] | None = None
        if labels_raw is not None:
            if isinstance(labels_raw, list):
                labels = labels_raw
            elif isinstance(labels_raw, str):
                labels = [labels_raw]

        data = IssueData(
            title=context.interpolate(step["title"]),
            team=context.interpolate(step["team"]),
            description=context.interpolate_optional(step.get("description")),
            project=context.interpolate_optional(step.get("project")),
            priority=step.get("priority"),
            labels=labels,
            status=context.interpolate_optional(step.get("status")),
            assignee=context.interpolate_optional(step.get("assignee")),
            parent_id=context.interpolate_optional(step.get("parent_id")),
        )

        try:
            response = client.create_issue(data)

            if response.success:
                return ToolResult(
                    success=True,
                    output=json.dumps(response.data, indent=2, default=str),
                )
            else:
                return ToolResult(success=False, error=response.error)
        except Exception as e:
            return ToolResult(success=False, error=str(e))

    def _action_update(
        self,
        step: Dict[str, Any],
        context: "ExecutionContext",
        client: LinearClientWrapper,
    ) -> ToolResult:
        """Update an existing issue."""
        issue_id = context.interpolate(step["issue_id"])

        labels_raw = step.get("labels")
        labels: List[str] | None = None
        if labels_raw is not None:
            if isinstance(labels_raw, list):
                labels = labels_raw
            elif isinstance(labels_raw, str):
                labels = [labels_raw]

        data = IssueData(
            title=context.interpolate_optional(step.get("title")),
            description=context.interpolate_optional(step.get("description")),
            project=context.interpolate_optional(step.get("project")),
            priority=step.get("priority"),
            labels=labels,
            status=context.interpolate_optional(step.get("status")),
            assignee=context.interpolate_optional(step.get("assignee")),
        )

        try:
            response = client.update_issue(issue_id, data)

            if response.success:
                return ToolResult(
                    success=True,
                    output=json.dumps(response.data, indent=2, default=str),
                )
            else:
                return ToolResult(success=False, error=response.error)
        except Exception as e:
            return ToolResult(success=False, error=str(e))

    def _action_comment(
        self,
        step: Dict[str, Any],
        context: "ExecutionContext",
        client: LinearClientWrapper,
    ) -> ToolResult:
        """Add a comment to an issue."""
        issue_id = context.interpolate(step["issue_id"])
        body = context.interpolate(step["body"])

        try:
            response = client.add_comment(issue_id, body)

            if response.success:
                return ToolResult(
                    success=True,
                    output=json.dumps(response.data, indent=2, default=str),
                )
            else:
                return ToolResult(success=False, error=response.error)
        except Exception as e:
            return ToolResult(success=False, error=str(e))
