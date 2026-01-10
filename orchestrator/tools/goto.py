"""Goto tool implementation for control flow."""

from typing import TYPE_CHECKING, Any, Dict

from .base import BaseTool, ToolResult

if TYPE_CHECKING:
    from ..context import ExecutionContext
    from ..tmux import TmuxManager


class GotoTool(BaseTool):
    """Jump to a named step in the workflow."""

    @property
    def name(self) -> str:
        return "goto"

    def validate_step(self, step: Dict[str, Any]) -> None:
        """Validate goto step configuration."""
        if "target" not in step:
            raise ValueError("Goto step requires 'target' field")

    def execute(
        self,
        step: Dict[str, Any],
        context: "ExecutionContext",
        tmux_manager: "TmuxManager",
    ) -> ToolResult:
        """Signal a jump to the target step."""
        target = step["target"]
        interpolated_target = context.interpolate(target)

        return ToolResult(
            success=True,
            output=f"Jumping to step: {interpolated_target}",
            goto_step=interpolated_target,
        )
