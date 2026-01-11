"""Claude Code Workflow Orchestrator package."""

from .cli import main
from .config import (
    ClaudeConfig,
    Step,
    TmuxConfig,
    WorkflowConfig,
    WorkflowInfo,
    discover_workflows,
    find_workflow_by_name,
    load_config,
    validate_workflow_file,
)
from .context import ExecutionContext
from .display import ICONS, console
from .hooks import (
    HookCheckResult,
    HookStatus,
    check_curl_hooks_configured,
    check_hooks_status,
    install_hooks,
    prompt_hook_installation,
    prompt_hook_update,
    workflow_uses_claude_tool,
)
from .selector import format_workflow_list, select_workflow_interactive
from .server import OrchestratorServer, ServerManager
from .tmux import TmuxManager
from .tools import BaseTool, BashTool, ClaudeTool, ToolRegistry, ToolResult
from .workflow import StepError, WorkflowRunner

__all__ = [
    # CLI
    "main",
    # Config
    "ClaudeConfig",
    "Step",
    "TmuxConfig",
    "WorkflowConfig",
    "WorkflowInfo",
    "discover_workflows",
    "find_workflow_by_name",
    "load_config",
    "validate_workflow_file",
    # Context
    "ExecutionContext",
    # Display
    "ICONS",
    "console",
    # Hooks
    "HookCheckResult",
    "HookStatus",
    "check_curl_hooks_configured",
    "check_hooks_status",
    "install_hooks",
    "prompt_hook_installation",
    "prompt_hook_update",
    "workflow_uses_claude_tool",
    # Selector
    "format_workflow_list",
    "select_workflow_interactive",
    # Server
    "OrchestratorServer",
    "ServerManager",
    # Tmux
    "TmuxManager",
    # Tools
    "BaseTool",
    "BashTool",
    "ClaudeTool",
    "ToolRegistry",
    "ToolResult",
    # Workflow
    "StepError",
    "WorkflowRunner",
]
