"""JSON tool for native JSON manipulation without bash + jq.

Supports jq-style query syntax including:
- Pipelines: .field | length
- Array iteration: .items[]
- Transforms: to_entries, keys, values, length, from_entries
- Filtering: select(.field >= 3)
- String interpolation: "prefix: \\(.field)"
- Array construction: [.items[] | select(...)]
"""

import json
import os
import re
import tempfile
from pathlib import Path
from typing import TYPE_CHECKING, Any, Callable, Dict, List, Optional, Union

from .base import BaseTool, ToolResult

if TYPE_CHECKING:
    from ..context import ExecutionContext
    from ..tmux import TmuxManager


# Sentinel for array iteration
class _IterateMarker:
    """Marker for array iteration in path parsing."""

    pass


ITERATE = _IterateMarker()


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
        """Query data using jq-style path expression.

        Supports:
        - Pipelines: .field | length
        - Array iteration: .items[]
        - Transforms: to_entries, keys, values, length, from_entries
        - Filtering: select(.field >= 3)
        - String interpolation: "prefix: \\(.field)"
        - Array construction: [.items[] | select(...)]
        """
        query = context.interpolate(step["query"])

        try:
            result = self._execute_query(data, query)
        except (KeyError, IndexError, TypeError, ValueError) as e:
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
        """Query data using simple path expression (backward compatible).

        Supports:
        - Dot notation: .field.nested
        - Array indexing: .array[0]
        - Root access: .

        For advanced queries (pipelines, iteration, etc.), use _execute_query.
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
            elif isinstance(part, _IterateMarker):
                # Array iteration - return all elements
                if not isinstance(current, list):
                    raise TypeError("Cannot iterate over non-array")
                return current  # Return list as-is for simple iteration
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

    # =========================================================================
    # Enhanced Query Engine (jq-style support)
    # =========================================================================

    def _execute_query(self, data: Any, query: str) -> Any:
        """Execute a jq-style query expression.

        Handles:
        - Pipelines: .field | length
        - Array iteration: .items[]
        - Array construction: [.items[] | ...]
        - Transforms: length, to_entries, keys, values, from_entries
        - Filtering: select(.field >= 3)
        - String interpolation: "text \\(.field)"
        """
        query = query.strip()

        # Handle array constructor: [...]
        if query.startswith("[") and query.endswith("]"):
            inner = query[1:-1].strip()
            result = self._execute_query(data, inner)
            # Ensure result is a list
            if not isinstance(result, list):
                return [result]
            return result

        # Split into pipeline stages
        stages = self._split_pipeline(query)

        current = data
        for stage in stages:
            current = self._execute_stage(current, stage.strip())

        return current

    def _split_pipeline(self, query: str) -> List[str]:
        """Split query on pipe operators, respecting parentheses and quotes."""
        stages: List[str] = []
        current = ""
        depth = 0
        in_string = False
        string_char = None
        i = 0

        while i < len(query):
            char = query[i]

            # Handle string delimiters
            if char in ('"', "'") and (i == 0 or query[i - 1] != "\\"):
                if not in_string:
                    in_string = True
                    string_char = char
                elif char == string_char:
                    in_string = False
                    string_char = None

            elif not in_string:
                if char in "([":
                    depth += 1
                elif char in ")]":
                    depth -= 1
                elif char == "|" and depth == 0:
                    if current.strip():
                        stages.append(current.strip())
                    current = ""
                    i += 1
                    continue

            current += char
            i += 1

        if current.strip():
            stages.append(current.strip())

        return stages

    def _execute_stage(self, data: Any, stage: str) -> Any:
        """Execute a single pipeline stage."""
        stage = stage.strip()

        # Check for array constructor [...]
        if stage.startswith("[") and stage.endswith("]"):
            inner = stage[1:-1].strip()
            result = self._execute_query(data, inner)
            # Ensure result is a list
            if not isinstance(result, list):
                return [result]
            return result

        # Check for string interpolation (starts and ends with quotes)
        if (stage.startswith('"') and stage.endswith('"')) or (
            stage.startswith("'") and stage.endswith("'")
        ):
            return self._string_interpolation(data, stage)

        # Check for select(...)
        if stage.startswith("select(") and stage.endswith(")"):
            expr = stage[7:-1]  # Extract expression inside select()
            return self._select_filter(data, expr)

        # Check for built-in transforms
        transform = self._get_transform(stage)
        if transform is not None:
            return transform(data)

        # Otherwise, treat as path expression with possible iteration
        return self._traverse_with_iteration(data, stage)

    def _traverse_with_iteration(self, data: Any, path: str) -> Any:
        """Traverse path, handling array iteration.

        When [] is encountered, iterate over all array elements and
        continue traversal for each element.
        """
        if path == "." or path == "":
            return data

        # Normalize path
        if path.startswith("."):
            path = path[1:]

        if not path:
            return data

        parts = self._parse_path(path)
        return self._traverse_parts(data, parts)

    def _traverse_parts(self, data: Any, parts: List[Union[str, int, _IterateMarker]]) -> Any:
        """Recursively traverse path parts, handling iteration."""
        if not parts:
            return data

        part = parts[0]
        remaining = parts[1:]

        if isinstance(part, _IterateMarker):
            # Array iteration
            if not isinstance(data, list):
                raise TypeError("Cannot iterate over non-array")

            results = []
            for item in data:
                if remaining:
                    result = self._traverse_parts(item, remaining)
                    # Flatten nested iterations
                    if isinstance(result, list) and remaining and self._has_iteration(remaining):
                        results.extend(result)
                    else:
                        results.append(result)
                else:
                    results.append(item)
            return results

        elif isinstance(part, int):
            # Array index
            if not isinstance(data, list):
                raise TypeError(f"Cannot index non-array with [{part}]")
            return self._traverse_parts(data[part], remaining)

        else:
            # Object key
            if isinstance(data, dict):
                if part not in data:
                    raise KeyError(f"Key '{part}' not found")
                return self._traverse_parts(data[part], remaining)
            elif isinstance(data, list):
                # Apply to each element
                try:
                    idx = int(part)
                    return self._traverse_parts(data[idx], remaining)
                except ValueError:
                    # Apply field access to each list element
                    results = []
                    for item in data:
                        if isinstance(item, dict) and part in item:
                            result = self._traverse_parts(item[part], remaining)
                            results.append(result)
                    return results
            else:
                raise TypeError(f"Cannot access '{part}' on {type(data).__name__}")

    def _has_iteration(self, parts: List[Union[str, int, _IterateMarker]]) -> bool:
        """Check if parts list contains any iteration markers."""
        return any(isinstance(p, _IterateMarker) for p in parts)

    # =========================================================================
    # Built-in Transforms
    # =========================================================================

    def _get_transform(self, name: str) -> Optional[Callable[[Any], Any]]:
        """Get a built-in transform function by name."""
        transforms: Dict[str, Callable[[Any], Any]] = {
            "length": self._transform_length,
            "to_entries": self._transform_to_entries,
            "from_entries": self._transform_from_entries,
            "keys": self._transform_keys,
            "values": self._transform_values,
            "type": self._transform_type,
            "sort": self._transform_sort,
            "reverse": self._transform_reverse,
            "unique": self._transform_unique,
            "flatten": self._transform_flatten,
            "first": self._transform_first,
            "last": self._transform_last,
            "min": self._transform_min,
            "max": self._transform_max,
            "add": self._transform_add,
        }
        return transforms.get(name)

    def _transform_length(self, data: Any) -> int:
        """Return length of array, object (key count), or string."""
        if isinstance(data, (list, dict, str)):
            return len(data)
        raise TypeError(f"Cannot get length of {type(data).__name__}")

    def _transform_to_entries(self, data: Any) -> List[Dict[str, Any]]:
        """Convert object to array of {key, value} pairs."""
        if not isinstance(data, dict):
            raise TypeError("to_entries requires an object")
        return [{"key": k, "value": v} for k, v in data.items()]

    def _transform_from_entries(self, data: Any) -> Dict[str, Any]:
        """Convert array of {key, value} pairs to object."""
        if not isinstance(data, list):
            raise TypeError("from_entries requires an array")
        result: Dict[str, Any] = {}
        for item in data:
            if isinstance(item, dict) and "key" in item:
                result[item["key"]] = item.get("value")
        return result

    def _transform_keys(self, data: Any) -> List[str]:
        """Return keys of an object."""
        if not isinstance(data, dict):
            raise TypeError("keys requires an object")
        return list(data.keys())

    def _transform_values(self, data: Any) -> List[Any]:
        """Return values of an object."""
        if not isinstance(data, dict):
            raise TypeError("values requires an object")
        return list(data.values())

    def _transform_type(self, data: Any) -> str:
        """Return the jq-style type name."""
        if data is None:
            return "null"
        if isinstance(data, bool):
            return "boolean"
        if isinstance(data, int):
            return "number"
        if isinstance(data, float):
            return "number"
        if isinstance(data, str):
            return "string"
        if isinstance(data, list):
            return "array"
        if isinstance(data, dict):
            return "object"
        return "unknown"

    def _transform_sort(self, data: Any) -> List[Any]:
        """Sort array elements."""
        if not isinstance(data, list):
            raise TypeError("sort requires an array")
        return sorted(data, key=lambda x: (x is None, x))

    def _transform_reverse(self, data: Any) -> List[Any]:
        """Reverse array elements."""
        if not isinstance(data, list):
            raise TypeError("reverse requires an array")
        return list(reversed(data))

    def _transform_unique(self, data: Any) -> List[Any]:
        """Return unique elements from array."""
        if not isinstance(data, list):
            raise TypeError("unique requires an array")
        seen: List[Any] = []
        for item in data:
            if item not in seen:
                seen.append(item)
        return seen

    def _transform_flatten(self, data: Any) -> List[Any]:
        """Flatten one level of array nesting."""
        if not isinstance(data, list):
            raise TypeError("flatten requires an array")
        result: List[Any] = []
        for item in data:
            if isinstance(item, list):
                result.extend(item)
            else:
                result.append(item)
        return result

    def _transform_first(self, data: Any) -> Any:
        """Return first element of array."""
        if not isinstance(data, list):
            raise TypeError("first requires an array")
        if not data:
            return None
        return data[0]

    def _transform_last(self, data: Any) -> Any:
        """Return last element of array."""
        if not isinstance(data, list):
            raise TypeError("last requires an array")
        if not data:
            return None
        return data[-1]

    def _transform_min(self, data: Any) -> Any:
        """Return minimum value from array."""
        if not isinstance(data, list):
            raise TypeError("min requires an array")
        if not data:
            return None
        return min(data)

    def _transform_max(self, data: Any) -> Any:
        """Return maximum value from array."""
        if not isinstance(data, list):
            raise TypeError("max requires an array")
        if not data:
            return None
        return max(data)

    def _transform_add(self, data: Any) -> Any:
        """Sum array of numbers or concatenate strings."""
        if not isinstance(data, list):
            raise TypeError("add requires an array")
        if not data:
            return None
        if all(isinstance(x, (int, float)) for x in data):
            return sum(data)
        if all(isinstance(x, str) for x in data):
            return "".join(data)
        if all(isinstance(x, list) for x in data):
            result: List[Any] = []
            for item in data:
                result.extend(item)
            return result
        raise TypeError("add requires array of numbers, strings, or arrays")

    # =========================================================================
    # Select Filter
    # =========================================================================

    def _select_filter(self, data: Any, expression: str) -> Any:
        """Filter items based on a condition expression.

        Supports operators: ==, !=, >, >=, <, <=, contains, starts_with, ends_with
        """
        # If data is a single item, check if it matches
        if not isinstance(data, list):
            if self._evaluate_filter_item(data, expression):
                return data
            return []  # Return empty if doesn't match

        # Filter list items
        return [item for item in data if self._evaluate_filter_item(item, expression)]

    def _evaluate_filter_item(self, item: Any, expression: str) -> bool:
        """Evaluate filter expression against a single item."""
        expression = expression.strip()

        # Pattern for comparison operators
        pattern = re.compile(
            r"^\.?([\w_][\w_\d.]*)\s*(==|!=|>=|<=|>|<|contains|starts_with|ends_with)\s*(.+)$",
            re.IGNORECASE,
        )

        match = pattern.match(expression)
        if not match:
            raise ValueError(f"Invalid select expression: {expression}")

        field_path = match.group(1)
        operator = match.group(2).lower()
        value_str = match.group(3).strip()

        # Get field value from item
        item_value = self._get_field_value_from_item(item, field_path)

        # Parse comparison value
        compare_value = self._parse_filter_value(value_str)

        # Perform comparison
        return self._compare_filter_values(item_value, operator, compare_value)

    def _get_field_value_from_item(self, item: Any, field_path: str) -> Any:
        """Get field value from an item using dot notation."""
        if not isinstance(item, dict):
            # For non-dict items, check if field_path is 'key' or 'value' (for to_entries)
            if hasattr(item, "__getitem__"):
                try:
                    return item[field_path]
                except (KeyError, TypeError):
                    pass
            return None

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
        """Parse a filter value string into Python type."""
        value_str = value_str.strip()

        # Remove quotes for strings
        if (value_str.startswith('"') and value_str.endswith('"')) or (
            value_str.startswith("'") and value_str.endswith("'")
        ):
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

    def _compare_filter_values(self, item_value: Any, operator: str, compare_value: Any) -> bool:
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
        """Safely compare numeric values."""
        try:
            a_num = float(a) if a is not None else 0
            b_num = float(b) if b is not None else 0
            return op(a_num, b_num)
        except (ValueError, TypeError):
            return False

    # =========================================================================
    # String Interpolation
    # =========================================================================

    def _string_interpolation(self, data: Any, template: str) -> Any:
        """Handle jq-style string interpolation.

        Pattern: "text \\(.field) more text"
        """
        # Remove outer quotes
        if template.startswith('"') and template.endswith('"'):
            template = template[1:-1]
        elif template.startswith("'") and template.endswith("'"):
            template = template[1:-1]

        # If data is a list, apply interpolation to each item
        if isinstance(data, list):
            return [self._interpolate_string_item(item, template) for item in data]

        return self._interpolate_string_item(data, template)

    def _interpolate_string_item(self, item: Any, template: str) -> str:
        """Apply string interpolation to a single item."""
        # Pattern for \(...) interpolation
        pattern = re.compile(r"\\?\(([^)]+)\)")

        def replacer(match: re.Match[str]) -> str:
            path = match.group(1).strip()
            try:
                value = self._get_field_value_from_item(item, path.lstrip("."))
                if value is None:
                    return ""
                if isinstance(value, (dict, list)):
                    return json.dumps(value)
                return str(value)
            except (KeyError, TypeError):
                return ""

        return pattern.sub(replacer, template)

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

    def _parse_path(self, path: str) -> List[Union[str, int, _IterateMarker]]:
        """Parse path into list of keys, indices, and iteration markers.

        Examples:
        - "field.nested" -> ["field", "nested"]
        - "array[0]" -> ["array", 0]
        - "obj.arr[1].field" -> ["obj", "arr", 1, "field"]
        - "items[]" -> ["items", ITERATE]
        - "items[].name" -> ["items", ITERATE, "name"]
        """
        parts: List[Union[str, int, _IterateMarker]] = []
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

                # Check for empty brackets (iteration marker)
                if index_str.strip() == "":
                    parts.append(ITERATE)
                else:
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
