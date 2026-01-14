"""While tool implementation for condition-based loops."""

import time
from typing import TYPE_CHECKING, Any, Dict, List, Optional

from ..conditions import ConditionError, ConditionEvaluator
from ..display_adapter import get_display
from .base import BaseTool, LoopSignal, ToolResult

if TYPE_CHECKING:
    from ..context import ExecutionContext
    from ..tmux import TmuxManager


class WhileTool(BaseTool):
    """Execute nested steps while a condition is true.

    A condition-based loop that continues executing until the condition becomes false
    or max_iterations is reached.

    Example YAML:
        - name: 'Process all pending items'
          tool: while
          condition: '{status} == has_next'
          max_iterations: 50
          steps:
            - name: 'Get next item'
              tool: bash
              command: '...'
              output_var: status
            - name: 'Process item'
              tool: claude
              prompt: '...'
    """

    @property
    def name(self) -> str:
        """Return tool name."""
        return "while"

    def validate_step(self, step: Dict[str, Any]) -> None:
        """Validate while step configuration."""
        if "condition" not in step or not step["condition"]:
            raise ValueError("While step requires 'condition' field")
        if "max_iterations" not in step or step["max_iterations"] is None:
            raise ValueError(
                "While step requires 'max_iterations' field (safety limit to prevent infinite loops)"
            )
        if "steps" not in step or not step["steps"]:
            raise ValueError("While step requires 'steps' field with at least one step")

        max_iterations = step["max_iterations"]
        if not isinstance(max_iterations, int) or max_iterations <= 0:
            raise ValueError(
                f"'max_iterations' must be a positive integer, got {max_iterations}"
            )

        on_max_reached = step.get("on_max_reached", "error")
        if on_max_reached not in ("error", "continue"):
            raise ValueError(
                f"Invalid on_max_reached value: {on_max_reached}. "
                "Must be 'error' or 'continue'"
            )

    def execute(
        self,
        step: Dict[str, Any],
        context: "ExecutionContext",
        tmux_manager: "TmuxManager",
    ) -> ToolResult:
        """Execute while loop."""
        condition: str = step["condition"]
        max_iterations: int = step["max_iterations"]
        on_max_reached: str = step.get("on_max_reached", "error")
        nested_steps: List[Dict[str, Any]] = step["steps"]

        # Print loop header
        display = get_display()
        self._print_loop_header(step["name"], max_iterations)

        # Store original _iteration value to restore after loop
        original_iteration = context.get("_iteration")

        completed_count = 0
        iteration = 0

        try:
            with display.indent():
                while iteration < max_iterations:
                    # Evaluate condition before each iteration
                    try:
                        evaluator = ConditionEvaluator(context)
                        cond_result = evaluator.evaluate(condition)

                        if not cond_result.satisfied:
                            self._print_condition_false(iteration, cond_result.reason)
                            break
                    except ConditionError as e:
                        return ToolResult(
                            success=False,
                            error=f"While condition evaluation error: {e}",
                        )

                    # Set iteration variable
                    context.set("_iteration", str(iteration))

                    self._print_iteration_header(iteration, max_iterations)

                    try:
                        with display.indent():
                            result = self._execute_nested_steps(
                                nested_steps, context, tmux_manager, iteration, max_iterations
                            )

                        if result.loop_signal == LoopSignal.BREAK:
                            self._print_loop_break(iteration)
                            break
                        elif result.loop_signal == LoopSignal.CONTINUE:
                            self._print_loop_continue(iteration)
                            iteration += 1
                            continue

                        if not result.success:
                            raise RuntimeError(result.error or "Nested step failed")

                        completed_count += 1

                    except RuntimeError as e:
                        # While tool uses "stop" behavior by default
                        return ToolResult(
                            success=False, error=f"While loop failed at iteration {iteration}: {e}"
                        )

                    iteration += 1

                # Check if we hit max_iterations
                if iteration >= max_iterations:
                    # Re-check condition to see if we exited due to max_iterations or condition
                    try:
                        evaluator = ConditionEvaluator(context)
                        cond_result = evaluator.evaluate(condition)
                        condition_still_true = cond_result.satisfied
                    except ConditionError:
                        condition_still_true = False

                    if condition_still_true:
                        # We hit max_iterations while condition was still true
                        self._print_max_reached(max_iterations)
                        if on_max_reached == "error":
                            return ToolResult(
                                success=False,
                                error=f"While loop reached max_iterations ({max_iterations}) "
                                "with condition still true",
                            )
                        # on_max_reached == "continue": proceed with warning

        finally:
            # Restore original _iteration value
            if original_iteration is not None:
                context.set("_iteration", original_iteration)
            elif "_iteration" in context.variables:
                del context.variables["_iteration"]

        # Build summary output
        output = f"Completed {completed_count} iterations"

        return ToolResult(success=True, output=output)

    def _execute_nested_steps(
        self,
        steps: List[Dict[str, Any]],
        context: "ExecutionContext",
        tmux_manager: "TmuxManager",
        iteration_idx: int,
        max_iterations: int,
    ) -> ToolResult:
        """Execute nested steps within a while iteration.

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
                nested_step, step_idx, total_steps, iteration_idx, max_iterations
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
                        error=f"Goto target '{result.goto_step}' not found in while steps",
                    )
            else:
                step_idx += 1

            time.sleep(0.1)  # Small delay between nested steps

        return ToolResult(success=True)

    def _print_loop_header(self, name: str, max_iterations: int) -> None:
        """Print while loop header."""
        display = get_display()
        # Use a modified message to indicate this is a while loop with max_iterations
        display.print_group_start(f"{name} (max: {max_iterations})", max_iterations)

    def _print_iteration_header(self, idx: int, max_iterations: int) -> None:
        """Print iteration header."""
        display = get_display()
        display.print_iteration_header(idx, max_iterations, f"iteration {idx}")

    def _print_condition_false(self, iteration: int, reason: str) -> None:
        """Print message when condition becomes false."""
        display = get_display()
        display.console.print(
            f"  [dim]Condition false after {iteration} iterations: {reason}[/dim]"
        )

    def _print_max_reached(self, max_iterations: int) -> None:
        """Print message when max_iterations is reached."""
        display = get_display()
        display.console.print(
            f"  [yellow]Warning: Reached max_iterations ({max_iterations})[/yellow]"
        )

    def _print_nested_step(
        self,
        step: Dict[str, Any],
        step_idx: int,
        total_steps: int,
        iteration_idx: int,
        max_iterations: int,
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
