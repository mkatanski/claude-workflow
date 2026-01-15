"""Tool registry and exports for workflow tools."""

from typing import Dict, List

from .base import BaseTool, LoopSignal, ToolResult
from .bash import BashTool
from .break_tool import BreakTool
from .checklist import ChecklistTool
from .claude import ClaudeTool
from .claude_sdk import ClaudeSdkTool
from .context_tool import ContextTool
from .continue_tool import ContinueTool
from .data_tool import DataTool
from .foreach import ForEachTool
from .json_tool import JsonTool
from .goto import GotoTool
from .linear_manage import LinearManageTool
from .linear_tasks import LinearTasksTool
from .range_tool import RangeTool
from .retry_tool import RetryTool
from .set import SetTool
from .while_tool import WhileTool


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
ToolRegistry.register(ClaudeSdkTool())
ToolRegistry.register(BashTool())
ToolRegistry.register(GotoTool())
ToolRegistry.register(SetTool())
ToolRegistry.register(LinearTasksTool())
ToolRegistry.register(LinearManageTool())
ToolRegistry.register(ForEachTool())
ToolRegistry.register(BreakTool())
ToolRegistry.register(ContinueTool())
ToolRegistry.register(RangeTool())
ToolRegistry.register(WhileTool())
ToolRegistry.register(RetryTool())
ToolRegistry.register(ContextTool())
ToolRegistry.register(DataTool())
ToolRegistry.register(JsonTool())
ToolRegistry.register(ChecklistTool())


__all__ = [
    "BaseTool",
    "LoopSignal",
    "ToolResult",
    "ToolRegistry",
    "ChecklistTool",
    "ClaudeTool",
    "ClaudeSdkTool",
    "BashTool",
    "GotoTool",
    "SetTool",
    "LinearTasksTool",
    "LinearManageTool",
    "ForEachTool",
    "BreakTool",
    "ContinueTool",
    "RangeTool",
    "WhileTool",
    "RetryTool",
    "ContextTool",
    "DataTool",
    "JsonTool",
]
