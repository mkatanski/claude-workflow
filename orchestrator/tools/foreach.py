"""ForEach tool implementation for iterating over arrays."""

import json
import time
from typing import TYPE_CHECKING, Any, Dict, List, Optional

from rich.text import Text

from ..conditions import ConditionError, ConditionEvaluator
from ..display import ICONS
from ..display_adapter import get_display
from .base import BaseTool, LoopSignal, ToolResult

if TYPE_CHECKING:
    from ..context import ExecutionContext
    from ..tmux import TmuxManager


class ForEachTool(BaseTool):
    """Iterate over an array and execute nested steps for each item."""

    @property
    def name(self) -> str:
        """Return tool name."""
        return "foreach"

    def validate_step(self, step: Dict[str, Any]) -> None:
        """Validate foreach step configuration."""
        if "source" not in step or not step["source"]:
            raise ValueError(
                "ForEach step requires 'source' field (variable name containing array)"
            )
        if "item_var" not in step or not step["item_var"]:
            raise ValueError(
                "ForEach step requires 'item_var' field (name for current item)"
            )
        if "steps" not in step or not step["steps"]:
            raise ValueError(
                "ForEach step requires 'steps' field with at least one step"
            )

        on_item_error = step.get("on_item_error", "stop")
        if on_item_error not in ("stop", "stop_loop", "continue"):
            raise ValueError(
                f"Invalid on_item_error value: {on_item_error}. "
                "Must be 'stop', 'stop_loop', or 'continue'"
            )

    def execute(
        self,
        step: Dict[str, Any],
        context: "ExecutionContext",
        tmux_manager: "TmuxManager",
    ) -> ToolResult:
        """Execute foreach loop over array items."""
        source_var = step["source"]
        item_var = step["item_var"]
        index_var = step.get("index_var")
        on_item_error = step.get("on_item_error", "stop")
        nested_steps: List[Dict[str, Any]] = step["steps"]

        # Get the source array from context
        # Support dot notation in source (e.g., "team.members")
        if "." in source_var:
            # Use interpolation to resolve the path
            source_value = context.interpolate("{" + source_var + "}")
            # If interpolation returned the placeholder, the variable doesn't exist
            if source_value == "{" + source_var + "}":
                source_value = None
        else:
            source_value = context.get(source_var)

        if source_value is None:
            return ToolResult(
                success=False,
                error=f"Source variable '{source_var}' not found in context",
            )

        # Parse JSON if string
        items = self._parse_to_list(source_value)
        if items is None:
            return ToolResult(
                success=False,
                error=f"Source variable '{source_var}' is not a valid JSON array",
            )

        if len(items) == 0:
            return ToolResult(success=True, output="Empty array, no iterations performed")

        # Print loop header
        self._print_loop_header(step["name"], len(items))

        # Store original values to restore after loop
        original_item = context.get(item_var)
        original_index = context.get(index_var) if index_var else None

        completed_count = 0
        errors: List[str] = []

        try:
            for idx, item in enumerate(items):
                # Set iteration variables
                # Store item as JSON string if it's a dict/list, otherwise as string
                if isinstance(item, (dict, list)):
                    context.set(item_var, json.dumps(item))
                else:
                    context.set(item_var, str(item))

                if index_var:
                    context.set(index_var, str(idx))

                self._print_iteration_header(idx, len(items), item)

                try:
                    # Execute nested steps
                    result = self._execute_nested_steps(
                        nested_steps, context, tmux_manager, idx, len(items)
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
                    error_msg = f"Item {idx}: {e!s}"
                    errors.append(error_msg)

                    if on_item_error == "stop":
                        # Stop loop AND workflow
                        return ToolResult(
                            success=False, error=f"ForEach failed at item {idx}: {e}"
                        )
                    elif on_item_error == "stop_loop":
                        # Stop loop, but continue workflow
                        self._print_item_error(idx, str(e), "stopping loop")
                        break
                    else:  # continue
                        # Log error and continue to next item
                        self._print_item_error(idx, str(e), "continuing")
                        continue

        finally:
            # Restore original values
            if original_item is not None:
                context.set(item_var, original_item)
            elif item_var in context.variables:
                del context.variables[item_var]

            if index_var:
                if original_index is not None:
                    context.set(index_var, original_index)
                elif index_var in context.variables:
                    del context.variables[index_var]

        # Build summary output
        output = f"Completed {completed_count}/{len(items)} iterations"
        if errors:
            output += f" ({len(errors)} errors)"

        return ToolResult(success=True, output=output)

    def _parse_to_list(self, value: Any) -> Optional[List[Any]]:
        """Parse value to list, handling JSON strings."""
        if isinstance(value, list):
            return value
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
                if isinstance(parsed, list):
                    return parsed
            except (json.JSONDecodeError, ValueError):
                pass
        return None

    def _execute_nested_steps(
        self,
        steps: List[Dict[str, Any]],
        context: "ExecutionContext",
        tmux_manager: "TmuxManager",
        iteration_idx: int,
        total_iterations: int,
    ) -> ToolResult:
        """Execute nested steps within a foreach iteration.

        Returns ToolResult with loop_signal if break/continue encountered.
        """
        from . import ToolRegistry

        step_index_map = {s["name"]: idx for idx, s in enumerate(steps)}
        step_idx = 0
        total_steps = len(steps)

        while step_idx < total_steps:
            step = steps[step_idx]

            # Check condition if present
            if step.get("when"):
                try:
                    evaluator = ConditionEvaluator(context)
                    result = evaluator.evaluate(step["when"])

                    if not result.satisfied:
                        self._print_nested_step_skipped(
                            step, step_idx, total_steps, result.reason
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
            self._print_nested_step(
                step, step_idx, total_steps, iteration_idx, total_iterations
            )

            # Get and execute tool
            tool = ToolRegistry.get(step["tool"])
            tool.validate_step(step)
            result = tool.execute(step, context, tmux_manager)

            # Store output if requested
            if step.get("output_var") and result.output:
                context.set(step["output_var"], result.output)

            # Check for loop signals
            if result.loop_signal != LoopSignal.NONE:
                return result

            # Handle errors
            if not result.success:
                on_error = step.get("on_error", "stop")
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
                        error=f"Goto target '{result.goto_step}' not found in foreach steps",
                    )
            else:
                step_idx += 1

            time.sleep(0.1)  # Small delay between nested steps

        return ToolResult(success=True)

    def _print_loop_header(self, name: str, count: int) -> None:
        """Print foreach loop header."""
        display = get_display()
        display.print_group_start(name, count)

    def _print_iteration_header(self, idx: int, total: int, item: Any) -> None:
        """Print iteration header."""
        item_str = str(item)
        item_preview = item_str[:50] + ("..." if len(item_str) > 50 else "")
        display = get_display()
        display.print_iteration_header(idx, total, item_preview)

    def _print_nested_step(
        self,
        step: Dict[str, Any],
        step_idx: int,
        total_steps: int,
        iteration_idx: int,
        total_iterations: int,
    ) -> None:
        """Print nested step info."""
        step_name = step.get("name", "Unnamed")
        tool_name = step.get("tool", "claude")
        console = get_display().console
        console.print(
            f"     {ICONS['play']} Step {step_idx + 1}/{total_steps}: "
            f"{step_name} [dim]({tool_name})[/dim]"
        )

    def _print_nested_step_skipped(
        self, step: Dict[str, Any], step_idx: int, total_steps: int, reason: str
    ) -> None:
        """Print nested step skipped message."""
        from ..display_v2 import humanize_skip_reason

        step_name = step.get("name", "Unnamed")
        display = get_display()

        if display._is_v2:
            # Use humanized reason in v2
            human_reason = humanize_skip_reason(reason)
            display.console.print(
                f"     [yellow]⏭[/yellow] {step_name} [dim]— {human_reason}[/dim]"
            )
        else:
            display.console.print(
                f"     {ICONS['skip']} [yellow]Skipped {step_idx + 1}/{total_steps}: "
                f"{step_name}[/yellow]"
            )
            display.console.print(f"        [dim]Reason: {reason}[/dim]")

    def _print_loop_break(self, idx: int) -> None:
        """Print break message."""
        console = get_display().console
        console.print(f"     {ICONS['stop']} [yellow]Break at iteration {idx + 1}[/yellow]")

    def _print_loop_continue(self, idx: int) -> None:
        """Print continue message."""
        console = get_display().console
        console.print(
            f"     {ICONS['skip']} [yellow]Continue at iteration {idx + 1}[/yellow]"
        )

    def _print_item_error(self, idx: int, error: str, action: str) -> None:
        """Print item error message."""
        console = get_display().console
        console.print(
            f"     {ICONS['warning']} [red]Error at item {idx}: {error}[/red] ({action})"
        )
