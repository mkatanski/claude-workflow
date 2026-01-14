"""JSON tool for native JSON manipulation without bash + jq."""

import json
import os
import tempfile
from pathlib import Path
from typing import TYPE_CHECKING, Any, Dict, List, Optional, Union

from .base import BaseTool, ToolResult

if TYPE_CHECKING:
    from ..context import ExecutionContext
    from ..tmux import TmuxManager


class JsonTool(BaseTool):
    """Native JSON manipulation tool.

    Supports query, set, update, and delete operations on JSON files
    or in-memory variables.
    """

    @property
    def name(self) -> str:
        """Return tool name."""
        return "json"

    def validate_step(self, step: Dict[str, Any]) -> None:
        """Validate json step configuration."""
        action = step.get("action")
        if not action:
            raise ValueError("JSON step requires 'action' field")

        valid_actions = ("query", "set", "update", "delete")
        if action not in valid_actions:
            raise ValueError(
                f"Invalid action '{action}'. Must be one of: {', '.join(valid_actions)}"
            )

        # Must have either file or source (variable name)
        if not step.get("file") and not step.get("source"):
            raise ValueError(
                "JSON step requires either 'file' (path) or 'source' (variable name)"
            )

        # Action-specific validation
        if action == "query":
            if not step.get("query"):
                raise ValueError("JSON query action requires 'query' field")

        elif action == "set":
            if not step.get("path"):
                raise ValueError("JSON set action requires 'path' field")
            if "value" not in step:
                raise ValueError("JSON set action requires 'value' field")

        elif action == "update":
            if not step.get("path"):
                raise ValueError("JSON update action requires 'path' field")
            if not step.get("operation"):
                raise ValueError("JSON update action requires 'operation' field")
            valid_operations = ("append", "prepend", "increment", "merge")
            if step.get("operation") not in valid_operations:
                raise ValueError(
                    f"Invalid operation '{step.get('operation')}'. "
                    f"Must be one of: {', '.join(valid_operations)}"
                )
            if "value" not in step:
                raise ValueError("JSON update action requires 'value' field")

        elif action == "delete":
            if not step.get("path"):
                raise ValueError("JSON delete action requires 'path' field")

    def execute(
        self,
        step: Dict[str, Any],
        context: "ExecutionContext",
        tmux_manager: "TmuxManager",
    ) -> ToolResult:
        """Execute JSON operation."""
        action = step["action"]
        file_path = step.get("file")
        source_var = step.get("source")
        create_if_missing = step.get("create_if_missing", False)

        # Load JSON data
        try:
            data, is_file_source = self._load_data(
                file_path, source_var, context, create_if_missing
            )
        except (FileNotFoundError, json.JSONDecodeError, ValueError) as e:
            return ToolResult(success=False, error=str(e))

        # Execute action
        try:
            if action == "query":
                result = self._action_query(data, step, context)
            elif action == "set":
                result = self._action_set(data, step, context)
            elif action == "update":
                result = self._action_update(data, step, context)
            elif action == "delete":
                result = self._action_delete(data, step, context)
            else:
                return ToolResult(success=False, error=f"Unknown action: {action}")
        except (KeyError, IndexError, TypeError, ValueError) as e:
            return ToolResult(success=False, error=f"JSON operation failed: {e}")

        # For query, just return the result
        if action == "query":
            return result

        # For mutations, save back to source
        if result.success and action in ("set", "update", "delete"):
            try:
                self._save_data(
                    data,
                    file_path,
                    source_var,
                    context,
                    is_file_source,
                )
            except (OSError, IOError) as e:
                return ToolResult(success=False, error=f"Failed to save JSON: {e}")

        return result

    def _load_data(
        self,
        file_path: Optional[str],
        source_var: Optional[str],
        context: "ExecutionContext",
        create_if_missing: bool,
    ) -> tuple[Any, bool]:
        """Load JSON data from file or variable.

        Returns (data, is_file_source).
        """
        if file_path:
            # Interpolate file path
            resolved_path = context.interpolate(file_path)
            path = Path(resolved_path)

            if not path.is_absolute():
                path = context.project_path / path

            if not path.exists():
                if create_if_missing:
                    return {}, True
                raise FileNotFoundError(f"File not found: {path}")

            with open(path, "r") as f:
                return json.load(f), True

        if source_var:
            value = context.get(source_var)
            if value is None:
                if create_if_missing:
                    return {}, False
                raise ValueError(f"Variable '{source_var}' not found in context")

            if isinstance(value, str):
                return json.loads(value), False
            return value, False

        raise ValueError("No source specified")

    def _save_data(
        self,
        data: Any,
        file_path: Optional[str],
        source_var: Optional[str],
        context: "ExecutionContext",
        is_file_source: bool,
    ) -> None:
        """Save JSON data back to file or variable."""
        if is_file_source and file_path:
            resolved_path = context.interpolate(file_path)
            path = Path(resolved_path)

            if not path.is_absolute():
                path = context.project_path / path

            # Atomic write: write to temp file, then rename
            path.parent.mkdir(parents=True, exist_ok=True)
            fd, temp_path = tempfile.mkstemp(
                dir=path.parent, suffix=".tmp", prefix=path.name
            )
            try:
                with os.fdopen(fd, "w") as f:
                    json.dump(data, f, indent=2)
                os.replace(temp_path, path)
            except Exception:
                if os.path.exists(temp_path):
                    os.unlink(temp_path)
                raise

        elif source_var:
            # Store back to variable as JSON string
            context.set(source_var, json.dumps(data))

    def _action_query(
        self,
        data: Any,
        step: Dict[str, Any],
        context: "ExecutionContext",
    ) -> ToolResult:
        """Query data using path expression."""
        query = context.interpolate(step["query"])

        try:
            result = self._query_path(data, query)
        except (KeyError, IndexError, TypeError) as e:
            return ToolResult(
                success=False,
                error=f"Query '{query}' failed: {e}",
            )

        # Convert result to string for output
        if isinstance(result, (dict, list)):
            output = json.dumps(result)
        elif result is None:
            output = ""
        else:
            output = str(result)

        return ToolResult(success=True, output=output)

    def _action_set(
        self,
        data: Any,
        step: Dict[str, Any],
        context: "ExecutionContext",
    ) -> ToolResult:
        """Set value at path."""
        path = context.interpolate(step["path"])
        value = step["value"]

        # Interpolate value if it's a string
        if isinstance(value, str):
            interpolated = context.interpolate(value)
            # Try to parse as JSON if it looks like JSON
            value = self._parse_value(interpolated)
        elif isinstance(value, dict):
            # Deep interpolate dict values
            value = self._interpolate_dict(value, context)

        self._set_at_path(data, path, value)

        return ToolResult(success=True, output=f"Set {path}")

    def _action_update(
        self,
        data: Any,
        step: Dict[str, Any],
        context: "ExecutionContext",
    ) -> ToolResult:
        """Update value at path with operation."""
        path = context.interpolate(step["path"])
        operation = step["operation"]
        value = step["value"]

        # Interpolate value if string
        if isinstance(value, str):
            interpolated = context.interpolate(value)
            value = self._parse_value(interpolated)
        elif isinstance(value, dict):
            value = self._interpolate_dict(value, context)

        # Get current value at path
        try:
            current = self._query_path(data, path)
        except (KeyError, IndexError):
            # Initialize based on operation
            if operation in ("append", "prepend"):
                current = []
            elif operation == "increment":
                current = 0
            elif operation == "merge":
                current = {}
            else:
                return ToolResult(
                    success=False,
                    error=f"Path '{path}' does not exist",
                )

        # Apply operation
        if operation == "append":
            if not isinstance(current, list):
                return ToolResult(
                    success=False,
                    error=f"Cannot append to non-array at '{path}'",
                )
            current.append(value)
            new_value = current

        elif operation == "prepend":
            if not isinstance(current, list):
                return ToolResult(
                    success=False,
                    error=f"Cannot prepend to non-array at '{path}'",
                )
            current.insert(0, value)
            new_value = current

        elif operation == "increment":
            try:
                current_num = float(current) if current else 0
                increment_num = float(value)
                new_value = current_num + increment_num
                # Keep as int if both were ints
                if isinstance(current, int) and isinstance(value, int):
                    new_value = int(new_value)
            except (ValueError, TypeError):
                return ToolResult(
                    success=False,
                    error=f"Cannot increment non-numeric value at '{path}'",
                )

        elif operation == "merge":
            if not isinstance(current, dict) or not isinstance(value, dict):
                return ToolResult(
                    success=False,
                    error=f"Merge requires objects at '{path}'",
                )
            current.update(value)
            new_value = current

        else:
            return ToolResult(success=False, error=f"Unknown operation: {operation}")

        self._set_at_path(data, path, new_value)

        return ToolResult(success=True, output=f"Updated {path} ({operation})")

    def _action_delete(
        self,
        data: Any,
        step: Dict[str, Any],
        context: "ExecutionContext",
    ) -> ToolResult:
        """Delete key/element at path."""
        path = context.interpolate(step["path"])

        try:
            self._delete_at_path(data, path)
        except (KeyError, IndexError) as e:
            return ToolResult(
                success=False,
                error=f"Delete at '{path}' failed: {e}",
            )

        return ToolResult(success=True, output=f"Deleted {path}")

    def _query_path(self, data: Any, path: str) -> Any:
        """Query data using path expression.

        Supports:
        - Dot notation: .field.nested
        - Array indexing: .array[0]
        - Root access: .
        """
        if path == "." or path == "":
            return data

        # Normalize path
        if path.startswith("."):
            path = path[1:]

        current = data
        parts = self._parse_path(path)

        for part in parts:
            if isinstance(part, int):
                # Array index
                if not isinstance(current, list):
                    raise TypeError(f"Cannot index non-array with [{part}]")
                current = current[part]
            else:
                # Object key
                if isinstance(current, dict):
                    if part not in current:
                        raise KeyError(f"Key '{part}' not found")
                    current = current[part]
                elif isinstance(current, list):
                    # Try numeric index
                    try:
                        idx = int(part)
                        current = current[idx]
                    except ValueError:
                        raise TypeError(f"Cannot access '{part}' on array")
                else:
                    raise TypeError(f"Cannot access '{part}' on {type(current)}")

        return current

    def _set_at_path(self, data: Any, path: str, value: Any) -> None:
        """Set value at path, creating intermediate objects/arrays as needed."""
        if path == "." or path == "":
            raise ValueError("Cannot set root")

        if path.startswith("."):
            path = path[1:]

        parts = self._parse_path(path)
        current = data

        # Navigate to parent
        for i, part in enumerate(parts[:-1]):
            next_part = parts[i + 1]
            next_is_index = isinstance(next_part, int)

            if isinstance(part, int):
                # Ensure array is large enough
                while len(current) <= part:
                    current.append({} if not next_is_index else [])
                if current[part] is None:
                    current[part] = [] if next_is_index else {}
                current = current[part]
            else:
                if part not in current or current[part] is None:
                    current[part] = [] if next_is_index else {}
                current = current[part]

        # Set final value
        last_part = parts[-1]
        if isinstance(last_part, int):
            while len(current) <= last_part:
                current.append(None)
            current[last_part] = value
        else:
            current[last_part] = value

    def _delete_at_path(self, data: Any, path: str) -> None:
        """Delete value at path."""
        if path == "." or path == "":
            raise ValueError("Cannot delete root")

        if path.startswith("."):
            path = path[1:]

        parts = self._parse_path(path)
        current = data

        # Navigate to parent
        for part in parts[:-1]:
            if isinstance(part, int):
                current = current[part]
            else:
                current = current[part]

        # Delete final key/index
        last_part = parts[-1]
        if isinstance(last_part, int):
            del current[last_part]
        else:
            del current[last_part]

    def _parse_path(self, path: str) -> List[Union[str, int]]:
        """Parse path into list of keys and indices.

        Examples:
        - "field.nested" -> ["field", "nested"]
        - "array[0]" -> ["array", 0]
        - "obj.arr[1].field" -> ["obj", "arr", 1, "field"]
        """
        parts: List[Union[str, int]] = []
        current = ""
        i = 0

        while i < len(path):
            char = path[i]

            if char == ".":
                if current:
                    parts.append(current)
                    current = ""
                i += 1

            elif char == "[":
                if current:
                    parts.append(current)
                    current = ""
                # Find closing bracket
                end = path.find("]", i)
                if end == -1:
                    raise ValueError(f"Unclosed bracket in path: {path}")
                index_str = path[i + 1 : end]
                try:
                    parts.append(int(index_str))
                except ValueError:
                    # Could be a string key in brackets
                    parts.append(index_str.strip("'\""))
                i = end + 1

            else:
                current += char
                i += 1

        if current:
            parts.append(current)

        return parts

    def _parse_value(self, value: str) -> Any:
        """Try to parse a string value as JSON, otherwise return as-is."""
        if not value:
            return value

        # Try JSON parsing for arrays, objects, and primitives
        if value.startswith(("{", "[", '"')) or value in ("true", "false", "null"):
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                pass

        # Try numeric
        try:
            if "." in value:
                return float(value)
            return int(value)
        except ValueError:
            pass

        return value

    def _interpolate_dict(
        self, d: Dict[str, Any], context: "ExecutionContext"
    ) -> Dict[str, Any]:
        """Recursively interpolate string values in a dict."""
        result = {}
        for key, value in d.items():
            if isinstance(value, str):
                interpolated = context.interpolate(value)
                result[key] = self._parse_value(interpolated)
            elif isinstance(value, dict):
                result[key] = self._interpolate_dict(value, context)
            elif isinstance(value, list):
                result[key] = self._interpolate_list(value, context)
            else:
                result[key] = value
        return result

    def _interpolate_list(
        self, lst: List[Any], context: "ExecutionContext"
    ) -> List[Any]:
        """Recursively interpolate string values in a list."""
        result = []
        for item in lst:
            if isinstance(item, str):
                interpolated = context.interpolate(item)
                result.append(self._parse_value(interpolated))
            elif isinstance(item, dict):
                result.append(self._interpolate_dict(item, context))
            elif isinstance(item, list):
                result.append(self._interpolate_list(item, context))
            else:
                result.append(item)
        return result
