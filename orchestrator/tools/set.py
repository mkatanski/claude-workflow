"""Set tool implementation for variable assignment."""

from typing import TYPE_CHECKING, Any, Dict

from ..expressions import ExpressionError, ExpressionEvaluator
from .base import BaseTool, ToolResult

if TYPE_CHECKING:
    from ..context import ExecutionContext
    from ..tmux import TmuxManager


class SetTool(BaseTool):
    """Set a variable value in the execution context.

    Supports two modes:
    - value: Simple value assignment with variable interpolation
    - expr: Expression evaluation with arithmetic, comparisons, conditionals
    """

    @property
    def name(self) -> str:
        return "set"

    def validate_step(self, step: Dict[str, Any]) -> None:
        """Validate set step configuration."""
        if "var" not in step:
            raise ValueError("Set step requires 'var' field")

        has_value = step.get("value") is not None
        has_expr = step.get("expr") is not None

        if not has_value and not has_expr:
            raise ValueError("Set step requires either 'value' or 'expr' field")

        if has_value and has_expr:
            raise ValueError("Set step cannot have both 'value' and 'expr' fields")

    def execute(
        self,
        step: Dict[str, Any],
        context: "ExecutionContext",
        tmux_manager: "TmuxManager",
    ) -> ToolResult:
        """Execute variable assignment."""
        var_name = step["var"]

        if step.get("expr") is not None:
            # Expression mode
            try:
                evaluator = ExpressionEvaluator(context)
                result_value = evaluator.evaluate(str(step["expr"]))
            except ExpressionError as e:
                return ToolResult(
                    success=False,
                    error=f"Expression error: {e}",
                )
        else:
            # Simple value mode
            raw_value = step["value"]
            result_value = context.interpolate(str(raw_value))

        context.set(var_name, result_value)

        return ToolResult(
            success=True,
            output=f"Set {var_name}={result_value}",
        )
