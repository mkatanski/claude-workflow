"""Execution context for variable storage and interpolation."""

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

# Threshold for variable externalization in Claude prompts
# Variables larger than this are written to temp files and replaced with @filepath
LARGE_VARIABLE_THRESHOLD = 10_000  # Characters per variable

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

    def _variable_path_to_filename(self, var_path: str) -> str:
        """Convert variable path to safe filename.

        Args:
            var_path: Variable path like 'var' or 'result.data.content'

        Returns:
            Safe filename like 'result_data_content.txt'
        """
        safe_name = var_path.replace(".", "_")
        return f"{safe_name}.txt"

    def _resolve_variable_value(self, full_path: str) -> Optional[str]:
        """Resolve a variable path to its string value.

        Args:
            full_path: Full variable path like 'var' or 'var.field.nested'

        Returns:
            String representation of value, or None if not found.
            Dict/list values are serialized as JSON.
        """
        parts = full_path.split(".")
        var_name = parts[0]

        # Get base variable
        value = self.variables.get(var_name)
        if value is None:
            return None

        # If there are additional path segments, resolve them
        if len(parts) > 1:
            parsed_value = self._parse_json_if_string(value)
            resolved = self._resolve_path(parsed_value, parts[1:])
            if resolved is None:
                return None
            # If resolved value is a dict or list, serialize it
            if isinstance(resolved, (dict, list)):
                return json.dumps(resolved)
            return str(resolved)

        # For direct dict/list values, serialize as JSON for consistency
        if isinstance(value, (dict, list)):
            return json.dumps(value)

        return str(value)

    def interpolate_for_claude(
        self,
        template: str,
        temp_dir: Optional[str] = None,
    ) -> str:
        """Replace {var} placeholders, externalizing large variables to files.

        For variables exceeding LARGE_VARIABLE_THRESHOLD characters, writes
        content to a temp file and replaces the placeholder with @filepath.
        Claude Code understands @filepath syntax for file references.

        Each call writes files fresh with current variable values - no caching
        across calls. This ensures variables that change between steps always
        have the correct value in their files.

        Args:
            template: String containing {var} placeholders
            temp_dir: Path to temp directory for large files. If None,
                      attempts to get from context._temp_dir variable.

        Returns:
            String with placeholders replaced. Large variables become @filepath.

        Raises:
            ValueError: If temp_dir is None and _temp_dir not in context,
                       and there are large variables that need externalization.
        """
        # Get temp directory
        effective_temp_dir = temp_dir or self.get("_temp_dir")

        # Track externalized files within this call to avoid duplicates
        # Maps var_path -> absolute filepath
        externalized: Dict[str, str] = {}

        def replace_match(match: re.Match[str]) -> str:
            full_path = match.group(1)

            # Check if already externalized in this call
            if full_path in externalized:
                return f"@{externalized[full_path]}"

            # Resolve the variable value
            str_value = self._resolve_variable_value(full_path)
            if str_value is None:
                return match.group(0)  # Return original if not found

            # Check if value is large enough to externalize
            if len(str_value) > LARGE_VARIABLE_THRESHOLD:
                # Need temp directory for externalization
                if not effective_temp_dir:
                    raise ValueError(
                        f"Variable '{full_path}' exceeds size threshold "
                        f"({len(str_value):,} chars > {LARGE_VARIABLE_THRESHOLD:,}) "
                        "but no temp directory available for externalization. "
                        "Ensure workflow temp directory is set up."
                    )

                # Write to temp file
                filename = self._variable_path_to_filename(full_path)
                file_path = Path(effective_temp_dir) / filename
                file_path.write_text(str_value)

                # Store absolute path and return @reference
                abs_path = str(file_path.resolve())
                externalized[full_path] = abs_path
                return f"@{abs_path}"

            # Small variable - return inline
            return str_value

        return _INTERPOLATION_PATTERN.sub(replace_match, template)
