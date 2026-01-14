"""Range tool implementation for counting loops."""

import time
from typing import TYPE_CHECKING, Any, Dict, List, Optional

from ..conditions import ConditionError, ConditionEvaluator
from ..display_adapter import get_display
from .base import BaseTool, LoopSignal, ToolResult

if TYPE_CHECKING:
    from ..context import ExecutionContext
    from ..tmux import TmuxManager


class RangeTool(BaseTool):
    """Execute nested steps for a range of numbers.

    A simple counting loop that iterates from a start value to an end value.

    Example YAML:
        - name: 'Process 5 batches'
          tool: range
          from: 1
          to: 5
          var: batch_num
          steps:
            - name: 'Process batch {batch_num}'
              tool: bash
              command: 'process-batch.sh {batch_num}'
    """

    @property
    def name(self) -> str:
        """Return tool name."""
        return "range"

    def validate_step(self, step: Dict[str, Any]) -> None:
        """Validate range step configuration."""
        if step.get("from") is None:
            raise ValueError("Range step requires 'from' field (start value)")
        if step.get("to") is None:
            raise ValueError("Range step requires 'to' field (end value)")
        if "var" not in step or not step["var"]:
            raise ValueError("Range step requires 'var' field (variable name for current value)")
        if "steps" not in step or not step["steps"]:
            raise ValueError("Range step requires 'steps' field with at least one step")

        # Validate types
        from_val = step["from"]
        to_val = step["to"]
        step_val = step.get("step", 1)

        if not isinstance(from_val, int):
            raise ValueError(f"'from' must be an integer, got {type(from_val).__name__}")
        if not isinstance(to_val, int):
            raise ValueError(f"'to' must be an integer, got {type(to_val).__name__}")
        if not isinstance(step_val, int):
            raise ValueError(f"'step' must be an integer, got {type(step_val).__name__}")
        if step_val == 0:
            raise ValueError("'step' cannot be zero (would cause infinite loop)")

    def execute(
        self,
        step: Dict[str, Any],
        context: "ExecutionContext",
        tmux_manager: "TmuxManager",
    ) -> ToolResult:
        """Execute range loop."""
        from_val: int = step["from"]
        to_val: int = step["to"]
        step_val: int = step.get("step", 1)
        var_name: str = step["var"]
        nested_steps: List[Dict[str, Any]] = step["steps"]

        # Generate the range of values
        # Range is inclusive of both from and to
        if step_val > 0:
            values = list(range(from_val, to_val + 1, step_val))
        else:
            # For negative step, we need to go from from_val down to to_val
            values = list(range(from_val, to_val - 1, step_val))

        if len(values) == 0:
            return ToolResult(success=True, output="Empty range, no iterations performed")

        # Print loop header
        display = get_display()
        self._print_loop_header(step["name"], len(values))

        # Store original values to restore after loop
        original_var = context.get(var_name)
        original_iteration = context.get("_iteration")

        completed_count = 0
        errors: List[str] = []

        try:
            with display.indent():
                for idx, value in enumerate(values):
                    # Set iteration variables
                    context.set(var_name, str(value))
                    context.set("_iteration", str(idx))

                    self._print_iteration_header(idx, len(values), value)

                    try:
                        with display.indent():
                            result = self._execute_nested_steps(
                                nested_steps, context, tmux_manager, idx, len(values)
                            )

                        if result.loop_signal == LoopSignal.BREAK:
                            self._print_loop_break(idx)
                            break
                        elif result.loop_signal == LoopSignal.CONTINUE:
                            self._print_loop_continue(idx)
                            continue

                        if not result.success:
                            raise RuntimeError(result.error or "Nested step failed")

                        completed_count += 1

                    except RuntimeError as e:
                        error_msg = f"Value {value}: {e!s}"
                        errors.append(error_msg)
                        # Range tool uses "stop" behavior by default (stop loop AND workflow)
                        return ToolResult(
                            success=False, error=f"Range failed at value {value}: {e}"
                        )

        finally:
            # Restore original values
            if original_var is not None:
                context.set(var_name, original_var)
            elif var_name in context.variables:
                del context.variables[var_name]

            if original_iteration is not None:
                context.set("_iteration", original_iteration)
            elif "_iteration" in context.variables:
                del context.variables["_iteration"]

        # Build summary output
        output = f"Completed {completed_count}/{len(values)} iterations"
        if errors:
            output += f" ({len(errors)} errors)"

        return ToolResult(success=True, output=output)

    def _execute_nested_steps(
        self,
        steps: List[Dict[str, Any]],
        context: "ExecutionContext",
        tmux_manager: "TmuxManager",
        iteration_idx: int,
        total_iterations: int,
    ) -> ToolResult:
        """Execute nested steps within a range iteration.

        Returns ToolResult with loop_signal if break/continue encountered.
        """
        from . import ToolRegistry

        # Build step index map, skipping invalid steps (validation happens in the loop)
        step_index_map = {
            s["name"]: idx
            for idx, s in enumerate(steps)
            if isinstance(s, dict) and "name" in s
        }
        step_idx = 0
        total_steps = len(steps)

        while step_idx < total_steps:
            nested_step = steps[step_idx]

            # Defensive check: ensure step is a dict before accessing
            if not isinstance(nested_step, dict):
                return ToolResult(
                    success=False,
                    error=f"Nested step at index {step_idx} is invalid (expected dict, got {type(nested_step).__name__})",
                )

            # Check condition if present
            if nested_step.get("when"):
                try:
                    evaluator = ConditionEvaluator(context)
                    result = evaluator.evaluate(nested_step["when"])

                    if not result.satisfied:
                        self._print_nested_step_skipped(
                            nested_step, step_idx, total_steps, result.reason
                        )
                        step_idx += 1
                        continue
                except ConditionError as e:
                    get_display().console.print(
                        f"[yellow]Warning: Condition error: {e}. Skipping step.[/yellow]"
                    )
                    step_idx += 1
                    continue

            # Print step info
            step_start_time = time.time()
            self._print_nested_step(
                nested_step, step_idx, total_steps, iteration_idx, total_iterations
            )

            # Get and execute tool
            tool = ToolRegistry.get(nested_step["tool"])
            tool.validate_step(nested_step)
            result = tool.execute(nested_step, context, tmux_manager)

            # Print step completion
            step_duration = time.time() - step_start_time
            step_name = nested_step.get("name", "Unnamed")
            output_var = nested_step.get("output_var")
            self._print_nested_step_result(
                step_name, result.success, step_duration, output_var
            )

            # Store output if requested
            if nested_step.get("output_var") and result.output:
                context.set(nested_step["output_var"], result.output)

            # Check for loop signals
            if result.loop_signal != LoopSignal.NONE:
                return result

            # Handle errors
            if not result.success:
                on_error = nested_step.get("on_error", "stop")
                if on_error == "stop":
                    return ToolResult(success=False, error=result.error)
                # on_error == "continue": proceed to next step

            # Handle goto within nested steps
            if result.goto_step:
                if result.goto_step in step_index_map:
                    step_idx = step_index_map[result.goto_step]
                else:
                    return ToolResult(
                        success=False,
                        error=f"Goto target '{result.goto_step}' not found in range steps",
                    )
            else:
                step_idx += 1

            time.sleep(0.1)  # Small delay between nested steps

        return ToolResult(success=True)

    def _print_loop_header(self, name: str, count: int) -> None:
        """Print range loop header."""
        display = get_display()
        display.print_group_start(name, count)

    def _print_iteration_header(self, idx: int, total: int, value: int) -> None:
        """Print iteration header."""
        display = get_display()
        display.print_iteration_header(idx, total, str(value))

    def _print_nested_step(
        self,
        step: Dict[str, Any],
        step_idx: int,
        total_steps: int,
        iteration_idx: int,
        total_iterations: int,
    ) -> None:
        """Print nested step info using display adapter."""
        step_name = step.get("name", "Unnamed")
        tool_name = step.get("tool", "claude")
        display = get_display()
        display.print_nested_step_start(step_name, step_idx + 1, total_steps, tool_name)

    def _print_nested_step_result(
        self,
        step_name: str,
        success: bool,
        duration: float,
        output_var: Optional[str] = None,
    ) -> None:
        """Print nested step completion result."""
        display = get_display()
        if success:
            display.print_nested_step_complete(step_name, duration, output_var)
        else:
            display.print_nested_step_failed(step_name, duration)

    def _print_nested_step_skipped(
        self, step: Dict[str, Any], step_idx: int, total_steps: int, reason: str
    ) -> None:
        """Print nested step skipped message using display adapter."""
        step_name = step.get("name", "Unnamed")
        display = get_display()
        display.print_nested_step_skipped(step_name, reason)

    def _print_loop_break(self, idx: int) -> None:
        """Print break message."""
        display = get_display()
        display.print_loop_message("break", idx)

    def _print_loop_continue(self, idx: int) -> None:
        """Print continue message."""
        display = get_display()
        display.print_loop_message("continue", idx)
