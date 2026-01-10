"""Continue tool implementation for loop control."""

from typing import TYPE_CHECKING, Any, Dict

from .base import BaseTool, LoopSignal, ToolResult

if TYPE_CHECKING:
    from ..context import ExecutionContext
    from ..tmux import TmuxManager


class ContinueTool(BaseTool):
    """Continue to the next iteration of the current foreach loop."""

    @property
    def name(self) -> str:
        """Return tool name."""
        return "continue"

    def validate_step(self, step: Dict[str, Any]) -> None:
        """No specific validation needed for continue."""
        pass

    def execute(
        self,
        step: Dict[str, Any],
        context: "ExecutionContext",
        tmux_manager: "TmuxManager",
    ) -> ToolResult:
        """Signal a continue to the next loop iteration."""
        return ToolResult(
            success=True,
            output="Continuing to next iteration",
            loop_signal=LoopSignal.CONTINUE,
        )
