"""Break tool implementation for loop control."""

from typing import TYPE_CHECKING, Any, Dict

from .base import BaseTool, LoopSignal, ToolResult

if TYPE_CHECKING:
    from ..context import ExecutionContext
    from ..tmux import TmuxManager


class BreakTool(BaseTool):
    """Break out of the current foreach loop."""

    @property
    def name(self) -> str:
        """Return tool name."""
        return "break"

    def validate_step(self, step: Dict[str, Any]) -> None:
        """No specific validation needed for break."""
        pass

    def execute(
        self,
        step: Dict[str, Any],
        context: "ExecutionContext",
        tmux_manager: "TmuxManager",
    ) -> ToolResult:
        """Signal a break from the current loop."""
        return ToolResult(
            success=True,
            output="Breaking from loop",
            loop_signal=LoopSignal.BREAK,
        )
