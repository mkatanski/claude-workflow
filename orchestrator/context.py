"""Execution context for variable storage and interpolation."""

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional


# Pattern matches {var_name} or {var.path.to.field} or {var.0.field}
_INTERPOLATION_PATTERN = re.compile(r"\{([\w_][\w_\d]*(?:\.[\w_\d]+)*)\}")


@dataclass
class ExecutionContext:
    """Holds variables and state during workflow execution.

    Manages both static variables from YAML configuration and
    dynamic variables captured from tool outputs.
    """

    project_path: Path = field(default_factory=lambda: Path.cwd())
    variables: Dict[str, Any] = field(default_factory=dict)

    def set(self, name: str, value: Any) -> None:
        """Set a variable value."""
        self.variables[name] = value

    def get(self, name: str, default: Optional[Any] = None) -> Any:
        """Get a variable value with optional default."""
        return self.variables.get(name, default)

    def update(self, variables: Dict[str, Any]) -> None:
        """Update multiple variables at once."""
        self.variables.update(variables)

    def _parse_json_if_string(self, value: Any) -> Any:
        """Parse JSON string to object if applicable.

        Args:
            value: Any value, potentially a JSON string

        Returns:
            Parsed object if JSON string, otherwise original value
        """
        if isinstance(value, str):
            try:
                return json.loads(value)
            except (json.JSONDecodeError, ValueError):
                return value
        return value

    def _resolve_path(self, obj: Any, path: List[str]) -> Optional[Any]:
        """Resolve a dot-separated path through nested objects.

        Args:
            obj: The root object (dict, list, or primitive)
            path: List of path segments to traverse

        Returns:
            The value at the path, or None if not found
        """
        current = obj
        for segment in path:
            if current is None:
                return None

            # Handle dict access
            if isinstance(current, dict):
                current = current.get(segment)
            # Handle list access with numeric index
            elif isinstance(current, list):
                try:
                    idx = int(segment)
                    if 0 <= idx < len(current):
                        current = current[idx]
                    else:
                        return None
                except (ValueError, IndexError):
                    return None
            else:
                # Try attribute access for objects
                current = getattr(current, segment, None)

        return current

    def interpolate(self, template: str) -> str:
        """Replace {var} and {var.field.subfield} placeholders with values.

        Supports:
        - Simple variables: {var_name}
        - Dot notation: {obj.field.nested}
        - Array indexing: {array.0.field}

        Args:
            template: String containing {var} placeholders

        Returns:
            String with placeholders replaced by variable values
        """

        def replace_match(match: re.Match[str]) -> str:
            full_path = match.group(1)
            parts = full_path.split(".")
            var_name = parts[0]

            # Get base variable
            value = self.variables.get(var_name)
            if value is None:
                return match.group(0)  # Return original if not found

            # If there are additional path segments, resolve them
            if len(parts) > 1:
                # Parse JSON if the value is a JSON string
                parsed_value = self._parse_json_if_string(value)
                resolved = self._resolve_path(parsed_value, parts[1:])
                if resolved is None:
                    return match.group(0)  # Return original if path not found
                # If resolved value is a dict or list, serialize it
                if isinstance(resolved, (dict, list)):
                    return json.dumps(resolved)
                return str(resolved)

            return str(value)

        return _INTERPOLATION_PATTERN.sub(replace_match, template)

    def interpolate_optional(self, template: Optional[str]) -> Optional[str]:
        """Interpolate a template that may be None."""
        if template is None:
            return None
        return self.interpolate(template)
