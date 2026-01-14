"""Retry tool implementation for retrying steps until success."""

import time
from typing import TYPE_CHECKING, Any, Dict, List, Optional

from ..conditions import ConditionError, ConditionEvaluator
from ..display_adapter import get_display
from .base import BaseTool, LoopSignal, ToolResult

if TYPE_CHECKING:
    from ..context import ExecutionContext
    from ..tmux import TmuxManager


class RetryTool(BaseTool):
    """Retry steps until success or max attempts reached.

    A retry loop that executes nested steps repeatedly until either:
    - An 'until' condition becomes true (early success)
    - Max attempts is reached

    Example YAML:
        - name: 'Run tests with retry'
          tool: retry
          max_attempts: 3
          until: '{test_exit_code} == 0'
          delay: 2
          steps:
            - name: 'Run tests'
              tool: bash
              command: 'npm test'
              output_var: test_exit_code
            - name: 'Fix if failed'
              tool: claude
              prompt: 'Fix test failures...'
              when: '{test_exit_code} != 0'
    """

    @property
    def name(self) -> str:
        """Return tool name."""
        return "retry"

    def validate_step(self, step: Dict[str, Any]) -> None:
        """Validate retry step configuration."""
        if "max_attempts" not in step or step["max_attempts"] is None:
            raise ValueError("Retry step requires 'max_attempts' field")
        if "steps" not in step or not step["steps"]:
            raise ValueError("Retry step requires 'steps' field with at least one step")

        max_attempts = step["max_attempts"]
        if not isinstance(max_attempts, int) or max_attempts <= 0:
            raise ValueError(
                f"'max_attempts' must be a positive integer, got {max_attempts}"
            )

        delay = step.get("delay", 0)
        if not isinstance(delay, (int, float)) or delay < 0:
            raise ValueError(f"'delay' must be a non-negative number, got {delay}")

        on_failure = step.get("on_failure", "error")
        if on_failure not in ("error", "continue"):
            raise ValueError(
                f"Invalid on_failure value: {on_failure}. "
                "Must be 'error' or 'continue'"
            )

    def execute(
        self,
        step: Dict[str, Any],
        context: "ExecutionContext",
        tmux_manager: "TmuxManager",
    ) -> ToolResult:
        """Execute retry loop."""
        max_attempts: int = step["max_attempts"]
        until_condition: Optional[str] = step.get("until")
        delay: float = step.get("delay", 0)
        on_failure: str = step.get("on_failure", "error")
        nested_steps: List[Dict[str, Any]] = step["steps"]

        # Print loop header
        display = get_display()
        self._print_loop_header(step["name"], max_attempts)

        # Store original values to restore after loop
        original_attempt = context.get("_attempt")
        original_retry_succeeded = context.get("_retry_succeeded")
        original_retry_attempts = context.get("_retry_attempts")

        succeeded = False
        attempt = 1
        last_error: Optional[str] = None

        try:
            with display.indent():
                while attempt <= max_attempts:
                    # Set attempt variable (1-indexed)
                    context.set("_attempt", str(attempt))

                    self._print_attempt_header(attempt, max_attempts)

                    try:
                        with display.indent():
                            result = self._execute_nested_steps(
                                nested_steps, context, tmux_manager, attempt, max_attempts
                            )

                        if result.loop_signal == LoopSignal.BREAK:
                            self._print_loop_break(attempt)
                            # BREAK with success=True means successful completion
                            if result.success:
                                succeeded = True
                            break
                        elif result.loop_signal == LoopSignal.CONTINUE:
                            self._print_loop_continue(attempt)
                            if attempt < max_attempts and delay > 0:
                                self._print_delay(delay)
                                time.sleep(delay)
                            attempt += 1
                            continue

                        if not result.success:
                            last_error = result.error or "Nested step failed"
                            raise RuntimeError(last_error)

                        # Check success condition if provided
                        if until_condition:
                            try:
                                evaluator = ConditionEvaluator(context)
                                cond_result = evaluator.evaluate(until_condition)

                                if cond_result.satisfied:
                                    self._print_success_condition_met(attempt, cond_result.reason)
                                    succeeded = True
                                    break
                                else:
                                    self._print_success_condition_not_met(
                                        attempt, cond_result.reason
                                    )
                            except ConditionError as e:
                                return ToolResult(
                                    success=False,
                                    error=f"Retry 'until' condition evaluation error: {e}",
                                )
                        else:
                            # No until condition - success means steps completed without error
                            succeeded = True
                            break

                    except RuntimeError as e:
                        last_error = str(e)
                        self._print_attempt_failed(attempt, last_error)

                    # Delay before next attempt (if not last attempt)
                    if attempt < max_attempts and delay > 0:
                        self._print_delay(delay)
                        time.sleep(delay)

                    attempt += 1

                # Set result variables
                context.set("_retry_succeeded", "true" if succeeded else "false")
                context.set("_retry_attempts", str(attempt if attempt <= max_attempts else max_attempts))

                # Handle final result
                if not succeeded:
                    self._print_all_attempts_failed(max_attempts)
                    if on_failure == "error":
                        return ToolResult(
                            success=False,
                            error=f"Retry failed after {max_attempts} attempts. Last error: {last_error}",
                        )
                    # on_failure == "continue": proceed with warning

        finally:
            # Note: We don't restore _attempt, _retry_succeeded, _retry_attempts
            # because they are output variables that the workflow may want to use.
            # We only restore if they existed before.
            pass

        # Build summary output
        if succeeded:
            output = f"Succeeded on attempt {attempt}"
        else:
            output = f"Failed after {max_attempts} attempts"

        return ToolResult(success=True, output=output)

    def _execute_nested_steps(
        self,
        steps: List[Dict[str, Any]],
        context: "ExecutionContext",
        tmux_manager: "TmuxManager",
        attempt: int,
        max_attempts: int,
    ) -> ToolResult:
        """Execute nested steps within a retry attempt.

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
                nested_step, step_idx, total_steps, attempt, max_attempts
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

            # Handle errors - in retry context, step errors mean retry
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
                        error=f"Goto target '{result.goto_step}' not found in retry steps",
                    )
            else:
                step_idx += 1

            time.sleep(0.1)  # Small delay between nested steps

        return ToolResult(success=True)

    def _print_loop_header(self, name: str, max_attempts: int) -> None:
        """Print retry loop header."""
        display = get_display()
        display.print_group_start(f"{name} (max: {max_attempts} attempts)", max_attempts)

    def _print_attempt_header(self, attempt: int, max_attempts: int) -> None:
        """Print attempt header."""
        display = get_display()
        display.print_iteration_header(attempt - 1, max_attempts, f"attempt {attempt}")

    def _print_delay(self, delay: float) -> None:
        """Print delay message."""
        display = get_display()
        display.console.print(f"  [dim]Waiting {delay}s before next attempt...[/dim]")

    def _print_attempt_failed(self, attempt: int, error: str) -> None:
        """Print attempt failed message."""
        display = get_display()
        display.console.print(f"  [yellow]Attempt {attempt} failed: {error}[/yellow]")

    def _print_success_condition_met(self, attempt: int, reason: str) -> None:
        """Print success condition met message."""
        display = get_display()
        display.console.print(
            f"  [green]Success condition met on attempt {attempt}: {reason}[/green]"
        )

    def _print_success_condition_not_met(self, attempt: int, reason: str) -> None:
        """Print success condition not met message."""
        display = get_display()
        display.console.print(
            f"  [dim]Success condition not met on attempt {attempt}: {reason}[/dim]"
        )

    def _print_all_attempts_failed(self, max_attempts: int) -> None:
        """Print all attempts failed message."""
        display = get_display()
        display.console.print(
            f"  [red]All {max_attempts} attempts failed[/red]"
        )

    def _print_nested_step(
        self,
        step: Dict[str, Any],
        step_idx: int,
        total_steps: int,
        attempt: int,
        max_attempts: int,
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

    def _print_loop_break(self, attempt: int) -> None:
        """Print break message."""
        display = get_display()
        display.print_loop_message("break", attempt - 1)

    def _print_loop_continue(self, attempt: int) -> None:
        """Print continue message."""
        display = get_display()
        display.print_loop_message("continue", attempt - 1)
