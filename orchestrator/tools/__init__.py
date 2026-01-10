"""Tool registry and exports for workflow tools."""

from typing import Dict, List

from .base import BaseTool, ToolResult
from .bash import BashTool
from .claude import ClaudeTool
from .goto import GotoTool
from .linear_manage import LinearManageTool
from .linear_tasks import LinearTasksTool
from .set import SetTool


class ToolRegistry:
    """Registry for available workflow tools.

    Use this registry to register and retrieve tools by name.
    Tools are registered at module load time.
    """

    _tools: Dict[str, BaseTool] = {}

    @classmethod
    def register(cls, tool: BaseTool) -> None:
        """Register a tool instance."""
        cls._tools[tool.name] = tool

    @classmethod
    def get(cls, name: str) -> BaseTool:
        """Get a tool by name.

        Args:
            name: Tool identifier (e.g., 'bash', 'claude')

        Returns:
            The registered tool instance

        Raises:
            ValueError: If tool is not registered
        """
        if name not in cls._tools:
            available = ", ".join(cls._tools.keys())
            raise ValueError(f"Unknown tool: {name}. Available: {available}")
        return cls._tools[name]

    @classmethod
    def available(cls) -> List[str]:
        """List all registered tool names."""
        return list(cls._tools.keys())


# Auto-register built-in tools
ToolRegistry.register(ClaudeTool())
ToolRegistry.register(BashTool())
ToolRegistry.register(GotoTool())
ToolRegistry.register(SetTool())
ToolRegistry.register(LinearTasksTool())
ToolRegistry.register(LinearManageTool())


__all__ = [
    "BaseTool",
    "ToolResult",
    "ToolRegistry",
    "ClaudeTool",
    "BashTool",
    "GotoTool",
    "SetTool",
    "LinearTasksTool",
    "LinearManageTool",
]
