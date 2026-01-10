"""Set tool implementation for variable assignment."""

from typing import TYPE_CHECKING, Any, Dict

from .base import BaseTool, ToolResult

if TYPE_CHECKING:
    from ..context import ExecutionContext
    from ..tmux import TmuxManager


class SetTool(BaseTool):
    """Set a variable value in the execution context."""

    @property
    def name(self) -> str:
        return "set"

    def validate_step(self, step: Dict[str, Any]) -> None:
        """Validate set step configuration."""
        if "var" not in step:
            raise ValueError("Set step requires 'var' field")
        if "value" not in step:
            raise ValueError("Set step requires 'value' field")

    def execute(
        self,
        step: Dict[str, Any],
        context: "ExecutionContext",
        tmux_manager: "TmuxManager",
    ) -> ToolResult:
        """Execute variable assignment."""
        var_name = step["var"]
        raw_value = step["value"]
        interpolated_value = context.interpolate(str(raw_value))

        context.set(var_name, interpolated_value)

        return ToolResult(
            success=True,
            output=f"Set {var_name}={interpolated_value}",
        )
