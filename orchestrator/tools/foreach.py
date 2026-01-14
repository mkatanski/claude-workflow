"""ForEach tool implementation for iterating over arrays."""

import json
import re
import time
from typing import TYPE_CHECKING, Any, Callable, Dict, List, Optional, Union

from ..conditions import ConditionError, ConditionEvaluator
from ..display_adapter import get_display
from .base import BaseTool, LoopSignal, ToolResult

if TYPE_CHECKING:
    from ..context import ExecutionContext
    from ..shared_steps.executor import SharedStepExecutor
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

        # Validate filter expression if provided (basic syntax check)
        if step.get("filter"):
            filter_expr = step["filter"]
            if not isinstance(filter_expr, str):
                raise ValueError("'filter' must be a string expression")

        # Validate order_by expression if provided
        if step.get("order_by"):
            order_by = step["order_by"]
            if not isinstance(order_by, str):
                raise ValueError("'order_by' must be a string expression")

        # Validate break_when condition if provided
        if step.get("break_when"):
            break_when = step["break_when"]
            if not isinstance(break_when, str):
                raise ValueError("'break_when' must be a condition string")

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
        # Note: we use "foreach_filter" to avoid conflict with Linear tool's "filter"
        filter_expr = step.get("foreach_filter") or step.get("filter")
        order_by_expr = step.get("order_by")
        break_when = step.get("break_when")

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

        # Apply filter if specified
        if filter_expr and items:
            try:
                items = self._apply_filter(items, filter_expr, context)
            except (ValueError, KeyError, TypeError) as e:
                return ToolResult(
                    success=False,
                    error=f"Filter expression failed: {e}",
                )

        # Apply order_by if specified
        if order_by_expr and items:
            try:
                items = self._apply_order_by(items, order_by_expr, context)
            except (ValueError, KeyError, TypeError) as e:
                return ToolResult(
                    success=False,
                    error=f"Order by expression failed: {e}",
                )

        if len(items) == 0:
            return ToolResult(success=True, output="Empty array, no iterations performed")

        # Print loop header
        display = get_display()
        self._print_loop_header(step["name"], len(items))

        # Create shared step executor for nested steps that use 'uses' field
        from ..shared_steps.executor import SharedStepExecutor

        shared_step_executor = SharedStepExecutor(
            project_path=context.project_path,
        )
        workflow_config = step.get("_workflow_claude_sdk")

        # Store original values to restore after loop
        original_item = context.get(item_var)
        original_index = context.get(index_var) if index_var else None

        completed_count = 0
        errors: List[str] = []

        try:
            # Use indent context for all iteration content
            with display.indent():
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
                        # Execute nested steps with additional indent
                        with display.indent():
                            result = self._execute_nested_steps(
                                nested_steps,
                                context,
                                tmux_manager,
                                idx,
                                len(items),
                                shared_step_executor,
                                workflow_config,
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

                        # Check break_when condition after successful iteration
                        if break_when:
                            try:
                                evaluator = ConditionEvaluator(context)
                                break_result = evaluator.evaluate(break_when)
                                if break_result.satisfied:
                                    self._print_break_when(idx, break_when)
                                    break
                            except ConditionError as e:
                                get_display().console.print(
                                    f"[yellow]Warning: break_when error: {e}. "
                                    "Continuing loop.[/yellow]"
                                )

                    except Exception as e:
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
        shared_step_executor: "SharedStepExecutor",
        workflow_config: Optional[Dict[str, Any]] = None,
    ) -> ToolResult:
        """Execute nested steps within a foreach iteration.

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
            step = steps[step_idx]

            # Defensive check: ensure step is a dict before accessing
            if not isinstance(step, dict):
                return ToolResult(
                    success=False,
                    error=f"Nested step at index {step_idx} is invalid (expected dict, got {type(step).__name__})",
                )

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
            step_start_time = time.time()
            self._print_nested_step(
                step, step_idx, total_steps, iteration_idx, total_iterations
            )

            # Check if this is a shared step (has 'uses' field)
            uses = step.get("uses")
            if uses:
                # Execute shared step
                result = shared_step_executor.execute(
                    uses=uses,
                    with_inputs=step.get("with") or {},
                    output_mapping=step.get("outputs") or {},
                    parent_context=context,
                    tmux_manager=tmux_manager,
                    workflow_config={"_workflow_claude_sdk": workflow_config}
                    if workflow_config
                    else None,
                )
            else:
                # Get and execute regular tool
                tool = ToolRegistry.get(step["tool"])
                tool.validate_step(step)
                result = tool.execute(step, context, tmux_manager)

            # Print step completion
            step_duration = time.time() - step_start_time
            step_name = step.get("name", "Unnamed")
            output_var = step.get("output_var")
            self._print_nested_step_result(
                step_name, result.success, step_duration, output_var
            )

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
        """Print nested step info using display adapter."""
        step_name = step.get("name", "Unnamed")
        # Check for shared step (uses) vs regular tool
        uses = step.get("uses")
        if uses:
            tool_name = "shared"
        else:
            tool_name = step.get("tool", "claude")
        display = get_display()

        # Use adapter method (handles v1/v2 internally)
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

        # Use adapter methods (handles v1/v2 internally)
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

        # Use adapter method (handles v1/v2 internally)
        display.print_nested_step_skipped(step_name, reason)

    def _print_loop_break(self, idx: int) -> None:
        """Print break message."""
        display = get_display()
        # Use adapter method (handles v1/v2 internally)
        display.print_loop_message("break", idx)

    def _print_loop_continue(self, idx: int) -> None:
        """Print continue message."""
        display = get_display()
        # Use adapter method (handles v1/v2 internally)
        display.print_loop_message("continue", idx)

    def _print_item_error(self, idx: int, error: str, action: str) -> None:
        """Print item error message."""
        display = get_display()
        # Use adapter method (handles v1/v2 internally)
        display.print_loop_message("error", idx, error, action)

    def _print_break_when(self, idx: int, condition: str) -> None:
        """Print break_when triggered message."""
        display = get_display()
        display.console.print(
            f"[cyan]  ↳ break_when triggered at iteration {idx}: {condition}[/cyan]"
        )

    def _apply_filter(
        self,
        items: List[Any],
        filter_expr: str,
        context: "ExecutionContext",
    ) -> List[Any]:
        """Apply filter expression to items.

        Supports jq-like expressions:
        - .field == "value" - equality check
        - .field != "value" - inequality check
        - .field > N, .field < N, etc - numeric comparisons
        - .field contains "str" - string contains
        - .field starts_with "str" - string starts with
        - .field ends_with "str" - string ends with
        """
        # Interpolate any variables in the filter expression
        filter_expr = context.interpolate(filter_expr)

        filtered: List[Any] = []
        for item in items:
            if self._evaluate_item_filter(item, filter_expr):
                filtered.append(item)
        return filtered

    def _evaluate_item_filter(self, item: Any, filter_expr: str) -> bool:
        """Evaluate filter expression against a single item."""
        # Parse the filter expression
        # Supported patterns:
        # .field == "value" or .field == value
        # .field != "value"
        # .field > N, .field >= N, .field < N, .field <= N
        # .field contains "str"
        # .field starts_with "str"
        # .field ends_with "str"

        filter_expr = filter_expr.strip()

        # Pattern for comparison operators
        comparison_pattern = re.compile(
            r'^\.?([\w_][\w_\d.]*)\s*(==|!=|>=|<=|>|<|contains|starts_with|ends_with)\s*(.+)$',
            re.IGNORECASE
        )

        match = comparison_pattern.match(filter_expr)
        if not match:
            raise ValueError(f"Invalid filter expression: {filter_expr}")

        field_path = match.group(1)
        operator = match.group(2).lower()
        value_str = match.group(3).strip()

        # Get the field value from item
        item_value = self._get_field_value(item, field_path)

        # Parse the comparison value
        compare_value = self._parse_filter_value(value_str)

        # Perform comparison
        return self._compare_values(item_value, operator, compare_value)

    def _get_field_value(self, item: Any, field_path: str) -> Any:
        """Get a field value from an item using dot notation."""
        if not isinstance(item, dict):
            raise TypeError(f"Cannot access field '{field_path}' on non-object")

        parts = field_path.split(".")
        current = item

        for part in parts:
            if isinstance(current, dict):
                if part not in current:
                    return None
                current = current[part]
            elif isinstance(current, list):
                try:
                    idx = int(part)
                    current = current[idx]
                except (ValueError, IndexError):
                    return None
            else:
                return None

        return current

    def _parse_filter_value(self, value_str: str) -> Any:
        """Parse a filter value string into its Python type."""
        value_str = value_str.strip()

        # Remove quotes for strings
        if (value_str.startswith('"') and value_str.endswith('"')) or \
           (value_str.startswith("'") and value_str.endswith("'")):
            return value_str[1:-1]

        # Try boolean
        if value_str.lower() == "true":
            return True
        if value_str.lower() == "false":
            return False

        # Try null
        if value_str.lower() in ("null", "none"):
            return None

        # Try numeric
        try:
            if "." in value_str:
                return float(value_str)
            return int(value_str)
        except ValueError:
            pass

        # Return as string
        return value_str

    def _compare_values(self, item_value: Any, operator: str, compare_value: Any) -> bool:
        """Compare values using the specified operator."""
        if operator == "==":
            return item_value == compare_value
        elif operator == "!=":
            return item_value != compare_value
        elif operator == ">":
            return self._safe_numeric_compare(item_value, compare_value, lambda a, b: a > b)
        elif operator == ">=":
            return self._safe_numeric_compare(item_value, compare_value, lambda a, b: a >= b)
        elif operator == "<":
            return self._safe_numeric_compare(item_value, compare_value, lambda a, b: a < b)
        elif operator == "<=":
            return self._safe_numeric_compare(item_value, compare_value, lambda a, b: a <= b)
        elif operator == "contains":
            if item_value is None:
                return False
            return str(compare_value).lower() in str(item_value).lower()
        elif operator == "starts_with":
            if item_value is None:
                return False
            return str(item_value).lower().startswith(str(compare_value).lower())
        elif operator == "ends_with":
            if item_value is None:
                return False
            return str(item_value).lower().endswith(str(compare_value).lower())
        else:
            raise ValueError(f"Unknown operator: {operator}")

    def _safe_numeric_compare(
        self,
        a: Any,
        b: Any,
        op: Callable[[Union[int, float], Union[int, float]], bool],
    ) -> bool:
        """Safely compare two values numerically."""
        try:
            num_a = float(a) if a is not None else 0
            num_b = float(b) if b is not None else 0
            return op(num_a, num_b)
        except (ValueError, TypeError):
            # Fall back to string comparison
            return op(str(a), str(b))

    def _apply_order_by(
        self,
        items: List[Any],
        order_by_expr: str,
        context: "ExecutionContext",
    ) -> List[Any]:
        """Apply order_by expression to sort items.

        Supports:
        - .field - ascending sort by field
        - .field desc - descending sort by field
        - .field asc - explicit ascending sort
        """
        # Interpolate any variables
        order_by_expr = context.interpolate(order_by_expr).strip()

        # Parse the expression
        descending = False
        if order_by_expr.lower().endswith(" desc"):
            descending = True
            order_by_expr = order_by_expr[:-5].strip()
        elif order_by_expr.lower().endswith(" asc"):
            order_by_expr = order_by_expr[:-4].strip()

        # Remove leading dot if present
        if order_by_expr.startswith("."):
            order_by_expr = order_by_expr[1:]

        field_path = order_by_expr

        def sort_key(item: Any) -> Any:
            value = self._get_field_value(item, field_path)
            # Handle None values - put them at the end
            if value is None:
                return (1, "")
            # Try numeric comparison
            try:
                return (0, float(value))
            except (ValueError, TypeError):
                return (0, str(value).lower())

        return sorted(items, key=sort_key, reverse=descending)
