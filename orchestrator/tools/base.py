"""Base tool abstraction for workflow steps."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Dict, Optional

if TYPE_CHECKING:
    from ..context import ExecutionContext
    from ..tmux import TmuxManager


@dataclass
class ToolResult:
    """Result of tool execution."""

    success: bool
    output: Optional[str] = None
    error: Optional[str] = None


class BaseTool(ABC):
    """Abstract base class for all workflow tools.

    To add a new tool:
    1. Create a new class inheriting from BaseTool
    2. Implement the name property, execute method, and validate_step method
    3. Register the tool in tools/__init__.py
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """Tool identifier used in YAML (e.g., 'bash', 'claude')."""
        pass

    @abstractmethod
    def validate_step(self, step: Dict[str, Any]) -> None:
        """Validate step configuration.

        Args:
            step: Step configuration dictionary from YAML

        Raises:
            ValueError: If configuration is invalid
        """
        pass

    @abstractmethod
    def execute(
        self,
        step: Dict[str, Any],
        context: "ExecutionContext",
        tmux_manager: "TmuxManager",
    ) -> ToolResult:
        """Execute the tool with given step config and context.

        Args:
            step: Step configuration dictionary from YAML
            context: Execution context with variables
            tmux_manager: Tmux manager for pane operations

        Returns:
            ToolResult with success status and optional output/error
        """
        pass
