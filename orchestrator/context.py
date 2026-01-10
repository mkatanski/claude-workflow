"""Execution context for variable storage and interpolation."""

from dataclasses import dataclass, field
from typing import Any, Dict, Optional


@dataclass
class ExecutionContext:
    """Holds variables and state during workflow execution.

    Manages both static variables from YAML configuration and
    dynamic variables captured from tool outputs.
    """

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

    def interpolate(self, template: str) -> str:
        """Replace {var} placeholders with values.

        Args:
            template: String containing {var} placeholders

        Returns:
            String with placeholders replaced by variable values
        """
        result = template
        for key, value in self.variables.items():
            result = result.replace(f"{{{key}}}", str(value))
        return result

    def interpolate_optional(self, template: Optional[str]) -> Optional[str]:
        """Interpolate a template that may be None."""
        if template is None:
            return None
        return self.interpolate(template)
