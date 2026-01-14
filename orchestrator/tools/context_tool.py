"""Context tool for batch variable operations."""

import json
from typing import TYPE_CHECKING, Any, Dict, List, Optional

from .base import BaseTool, ToolResult

if TYPE_CHECKING:
    from ..context import ExecutionContext
    from ..tmux import TmuxManager


class ContextTool(BaseTool):
    """Batch variable operations to reduce boilerplate.

    Supports:
    - action: set - Set multiple variables at once
    - action: copy - Copy values between variables
    - action: clear - Remove variables from context
    - action: export - Save context to JSON file (for debugging)
    """

    @property
    def name(self) -> str:
        return "context"

    def validate_step(self, step: Dict[str, Any]) -> None:
        """Validate context step configuration."""
        action = step.get("action")
        if not action:
            raise ValueError("Context step requires 'action' field")

        valid_actions = {"set", "copy", "clear", "export"}
        if action not in valid_actions:
            raise ValueError(
                f"Invalid action '{action}'. Valid: {', '.join(sorted(valid_actions))}"
            )

        if action == "set":
            if "values" not in step:
                raise ValueError("Context 'set' action requires 'values' field")
            values = step.get("values")
            if not isinstance(values, dict):
                raise ValueError("Context 'set' action 'values' must be a dictionary")

        elif action == "copy":
            if "mappings" not in step:
                raise ValueError("Context 'copy' action requires 'mappings' field")
            mappings = step.get("mappings")
            if not isinstance(mappings, dict):
                raise ValueError(
                    "Context 'copy' action 'mappings' must be a dictionary"
                )

        elif action == "clear":
            if "vars" not in step:
                raise ValueError("Context 'clear' action requires 'vars' field")
            vars_list = step.get("vars")
            if not isinstance(vars_list, list):
                raise ValueError("Context 'clear' action 'vars' must be a list")

        elif action == "export":
            if "file" not in step:
                raise ValueError("Context 'export' action requires 'file' field")

    def execute(
        self,
        step: Dict[str, Any],
        context: "ExecutionContext",
        tmux_manager: "TmuxManager",
    ) -> ToolResult:
        """Execute batch variable operation."""
        action = step["action"]

        if action == "set":
            return self._execute_set(step, context)
        elif action == "copy":
            return self._execute_copy(step, context)
        elif action == "clear":
            return self._execute_clear(step, context)
        elif action == "export":
            return self._execute_export(step, context)

        return ToolResult(success=False, error=f"Unknown action: {action}")

    def _execute_set(
        self, step: Dict[str, Any], context: "ExecutionContext"
    ) -> ToolResult:
        """Set multiple variables at once."""
        values: Dict[str, Any] = step["values"]
        set_vars: List[str] = []

        for var_name, raw_value in values.items():
            # Interpolate the value
            interpolated = context.interpolate(str(raw_value))
            context.set(var_name, interpolated)
            set_vars.append(var_name)

        return ToolResult(
            success=True,
            output=f"Set {len(set_vars)} variable(s): {', '.join(set_vars)}",
        )

    def _execute_copy(
        self, step: Dict[str, Any], context: "ExecutionContext"
    ) -> ToolResult:
        """Copy values between variables."""
        mappings: Dict[str, str] = step["mappings"]
        copied: List[str] = []
        not_found: List[str] = []

        for source_var, target_var in mappings.items():
            value = context.get(source_var)
            if value is not None:
                context.set(target_var, value)
                copied.append(f"{source_var} -> {target_var}")
            else:
                not_found.append(source_var)

        if not_found:
            return ToolResult(
                success=True,
                output=f"Copied {len(copied)} variable(s). "
                f"Not found: {', '.join(not_found)}",
            )

        return ToolResult(
            success=True,
            output=f"Copied {len(copied)} variable(s): {'; '.join(copied)}",
        )

    def _execute_clear(
        self, step: Dict[str, Any], context: "ExecutionContext"
    ) -> ToolResult:
        """Remove variables from context."""
        vars_list: List[str] = step["vars"]
        cleared: List[str] = []

        for var_name in vars_list:
            if var_name in context.variables:
                del context.variables[var_name]
                cleared.append(var_name)

        return ToolResult(
            success=True,
            output=f"Cleared {len(cleared)} variable(s): {', '.join(cleared)}",
        )

    def _execute_export(
        self, step: Dict[str, Any], context: "ExecutionContext"
    ) -> ToolResult:
        """Export context to JSON file."""
        file_path = context.interpolate(step["file"])

        # Filter to specific vars if provided
        vars_filter: Optional[List[str]] = step.get("vars")

        if vars_filter:
            export_data = {k: context.get(k) for k in vars_filter if context.get(k)}
        else:
            export_data = dict(context.variables)

        try:
            with open(file_path, "w") as f:
                json.dump(export_data, f, indent=2, default=str)

            return ToolResult(
                success=True,
                output=f"Exported {len(export_data)} variable(s) to {file_path}",
            )
        except OSError as e:
            return ToolResult(
                success=False,
                error=f"Failed to export context: {e}",
            )
