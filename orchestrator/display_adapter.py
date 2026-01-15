"""Display adapter that proxies between display (v1) and display_v2.

This module provides a unified interface that can switch between the original
Rich panel-based display and the new CI-style single-line display.

Usage:
    from orchestrator.display_adapter import DisplayAdapter

    # Get the adapter (uses v2 by default)
    display = DisplayAdapter.get_instance()

    # Use display functions
    display.print_header(config, project_path, server_port)
    display.print_step_start(step_name, step_num, total_steps, tool)
    display.print_step_complete(step_name, duration, output_var)

To switch versions:
    DisplayAdapter.use_v2 = False  # Use original display
    DisplayAdapter.use_v2 = True   # Use new CI-style display (default)
"""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from .config import Step, WorkflowConfig
    from .context import ExecutionContext


class DisplayAdapter:
    """Adapter that delegates to display, display_v2, or display_verbose based on configuration."""

    # Global switches - set before creating instances
    use_v2: bool = True
    use_verbose: bool = False  # Verbose mode takes precedence if enabled

    _instance: Optional["DisplayAdapter"] = None

    @classmethod
    def get_instance(cls) -> "DisplayAdapter":
        """Get or create the singleton adapter instance."""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @classmethod
    def reset(cls) -> None:
        """Reset the singleton instance (useful for testing)."""
        cls._instance = None

    def __init__(self) -> None:
        """Initialize adapter with appropriate display module."""
        self._init_display()

    def _init_display(self) -> None:
        """Initialize or reinitialize display module based on mode flags."""
        if self.use_verbose:
            from . import display_verbose as display_module

            self._display = display_module
            self._is_v2 = False
            self._is_verbose = True
        elif self.use_v2:
            from . import display_v2 as display_module

            self._display = display_module
            self._is_v2 = True
            self._is_verbose = False
        else:
            from . import display as display_module

            self._display = display_module
            self._is_v2 = False
            self._is_verbose = False

    @property
    def console(self):
        """Get the Rich console instance."""
        return self._display.console

    # =========================================================================
    # Header
    # =========================================================================

    def print_header(
        self,
        config: "WorkflowConfig",
        project_path: Path,
        server_port: int,
        hook_configured: bool = True,
    ) -> None:
        """Print workflow header."""
        if self._is_v2 or self._is_verbose:
            self._display.print_header(config, project_path, server_port)
        else:
            # V1 uses panels
            self.console.print()
            self.console.print(self._display.create_header_panel(config.name))
            self.console.print()
            self.console.print(
                self._display.create_config_table(config, project_path, hook_configured)
            )
            self.console.print()

    # =========================================================================
    # Step Display
    # =========================================================================

    def print_step_start(
        self,
        step: "Step",
        context: "ExecutionContext",
        step_num: int,
        total_steps: int,
    ) -> None:
        """Print step start indicator."""
        step_name = context.interpolate(step.name)

        if self._is_verbose:
            # Verbose mode shows command/prompt details
            command = context.interpolate(step.command) if step.command else None
            prompt = context.interpolate(step.prompt) if step.prompt else None
            self._display.print_step_start(
                step_name, step_num, total_steps, step.tool,
                command=command, prompt=prompt
            )
        elif self._is_v2:
            self._display.print_step_start(step_name, step_num, total_steps, step.tool)
        else:
            # V1 uses panel
            self.console.print()
            self.console.print(
                self._display.create_step_panel(step, context, step_num, total_steps)
            )

    def print_step_result(
        self,
        success: bool,
        duration: float,
        output_var: Optional[str] = None,
        step_name: Optional[str] = None,
        error: Optional[str] = None,
    ) -> None:
        """Print step completion result."""
        if self._is_v2 or self._is_verbose:
            if success:
                self._display.print_step_complete(
                    step_name or "Step", duration, output_var
                )
            else:
                self._display.print_step_failed(step_name or "Step", duration, error)
        else:
            self._display.print_step_result(success, duration, output_var)

    def print_step_skipped(
        self,
        step: "Step",
        context: "ExecutionContext",
        step_num: int,
        total_steps: int,
        reason: str,
    ) -> None:
        """Print step skipped message."""
        step_name = context.interpolate(step.name)

        if self._is_v2 or self._is_verbose:
            self._display.print_step_skipped(step_name, reason, step_num, total_steps)
        else:
            self._display.print_step_skipped(step, context, step_num, total_steps, reason)

    def update_step_status(self, elapsed: float) -> None:
        """Update the current step's elapsed time in-place (v2 only)."""
        if self._is_v2 or self._is_verbose:
            self._display.update_step_status(elapsed)
        # V1 doesn't support in-place updates - no-op

    def print_step_output(
        self,
        output: str,
        tool: str,
        max_lines: Optional[int] = None,
    ) -> None:
        """Print step output (verbose mode only).

        For claude: shows last 20 lines by default
        For bash: shows full output by default
        """
        if self._is_verbose:
            self._display.print_step_output(output, tool, max_lines)
        # V1 and V2 don't show step output inline

    # =========================================================================
    # Nested Step Display (for foreach and similar tools)
    # =========================================================================

    def print_nested_step_start(
        self,
        step_name: str,
        step_num: int,
        total_steps: int,
        tool: str = "claude",
    ) -> None:
        """Print nested step start indicator (string-based for tools)."""
        if self._is_v2 or self._is_verbose:
            self._display.print_step_start(step_name, step_num, total_steps, tool)
        else:
            from .display import ICONS
            self.console.print(
                f"     {ICONS['play']} Step {step_num}/{total_steps}: "
                f"{step_name} [dim]({tool})[/dim]"
            )

    def print_nested_step_complete(
        self,
        step_name: str,
        duration: float,
        output_var: Optional[str] = None,
    ) -> None:
        """Print nested step completion (string-based for tools)."""
        if self._is_v2 or self._is_verbose:
            self._display.print_step_complete(step_name, duration, output_var)
        else:
            self._display.print_step_result(True, duration, output_var)

    def print_nested_step_failed(
        self,
        step_name: str,
        duration: float,
        error: Optional[str] = None,
    ) -> None:
        """Print nested step failure (string-based for tools)."""
        if self._is_v2 or self._is_verbose:
            self._display.print_step_failed(step_name, duration, error)
        else:
            self._display.print_step_result(False, duration)

    def print_nested_step_skipped(
        self,
        step_name: str,
        reason: str,
    ) -> None:
        """Print nested step skipped message with humanized reason."""
        if self._is_verbose:
            # Verbose mode has its own skipped format
            self._display.print_step_skipped(step_name, reason)
        elif self._is_v2:
            human_reason = self.humanize_reason(reason)
            indent = self.get_current_indent()
            from .display_v2 import StatusIcons
            self.console.print(
                f"{indent}[{StatusIcons.SKIPPED}] {step_name} [dim]— {human_reason}[/dim]"
            )
        else:
            from .display import ICONS
            self.console.print(
                f"     {ICONS['skip']} [yellow]Skipped: {step_name}[/yellow]"
            )
            self.console.print(f"        [dim]Reason: {reason}[/dim]")

    def print_loop_message(
        self,
        msg_type: str,
        index: int,
        error: Optional[str] = None,
        action: Optional[str] = None,
    ) -> None:
        """Print loop control flow messages (break, continue, error)."""
        indent = self.get_current_indent()
        if msg_type == "break":
            self.console.print(f"{indent}[yellow]⏹ Break at iteration {index + 1}[/yellow]")
        elif msg_type == "continue":
            self.console.print(f"{indent}[yellow]⏭ Continue at iteration {index + 1}[/yellow]")
        elif msg_type == "error":
            action_text = f" [dim]({action})[/dim]" if action else ""
            self.console.print(
                f"{indent}[red]✗ Error at item {index}: {error}[/red]{action_text}"
            )

    def humanize_reason(self, reason: str) -> str:
        """Convert condition evaluation reason to human-readable text."""
        if self._is_v2:
            from .display_v2 import humanize_skip_reason
            return humanize_skip_reason(reason)
        else:
            # V1 and verbose don't humanize - return shortened reason
            if len(reason) > 30:
                return reason[:27] + "..."
            return reason

    def get_current_indent(self) -> str:
        """Get current indentation string."""
        if self._is_verbose:
            from .display_verbose import _get_indent
            return _get_indent()
        elif self._is_v2:
            from .display_v2 import _get_indent
            return _get_indent()
        else:
            return "     "  # V1 uses fixed 5-space indent

    # =========================================================================
    # Workflow Lifecycle
    # =========================================================================

    def print_workflow_start(self) -> None:
        """Print workflow start message."""
        self._display.print_workflow_start()

    def print_workflow_interrupted(self) -> None:
        """Print workflow interrupted message."""
        self._display.print_workflow_interrupted()

    def print_cleanup_message(self) -> None:
        """Print cleanup message."""
        self._display.print_cleanup_message()

    def print_summary(
        self,
        completed_steps: int,
        total_elapsed: float,
        step_times: list[float],
    ) -> None:
        """Print workflow completion summary."""
        self._display.print_summary(completed_steps, total_elapsed, step_times)

    # =========================================================================
    # Group/Iteration Display (v2 only, fallback for v1)
    # =========================================================================

    def print_group_start(
        self,
        name: str,
        item_count: Optional[int] = None,
    ) -> None:
        """Print group/foreach header."""
        if self._is_v2 or self._is_verbose:
            self._display.print_group_start(name, item_count)
        else:
            # V1 doesn't have this - print simple message
            self.console.print()
            self.console.print(f"  [cyan]ForEach Loop: {name}[/cyan]")
            if item_count:
                self.console.print(f"     [dim]Iterating over {item_count} items[/dim]")

    def print_iteration_header(
        self,
        index: int,
        total: int,
        item_preview: str,
    ) -> None:
        """Print iteration header."""
        if self._is_v2 or self._is_verbose:
            self._display.print_iteration_header(index, total, item_preview)
        else:
            # V1 style
            if len(item_preview) > 50:
                item_preview = item_preview[:47] + "..."
            self.console.print()
            self.console.print(
                f"  [cyan]Iteration {index + 1}/{total}[/cyan]: {item_preview}"
            )

    def print_iteration_complete(
        self,
        index: int,
        total: int,
        duration: float,
    ) -> None:
        """Print iteration completion."""
        if self._is_v2 or self._is_verbose:
            self._display.print_iteration_complete(index, total, duration)
        # V1 doesn't have explicit iteration complete message

    # =========================================================================
    # Indentation Context (v2 and verbose, no-op for v1)
    # =========================================================================

    def indent(self):
        """Context manager for indentation (v2 and verbose modes)."""
        if self._is_v2 or self._is_verbose:
            return self._display.indent()
        else:
            # Return a no-op context manager for v1
            from contextlib import nullcontext

            return nullcontext()

    # =========================================================================
    # Special Messages
    # =========================================================================

    def print_auto_approve_plan(self) -> None:
        """Print plan auto-approval message."""
        if self._is_v2 or self._is_verbose:
            self._display.print_auto_approve_plan()
        else:
            self.console.print("[yellow]  ⚡ Auto-approving plan...[/yellow]")

    def print_bash_running(self, command: str) -> None:
        """Print bash command running message."""
        if self._is_v2 or self._is_verbose:
            self._display.print_bash_running(command)
        else:
            from .display import ICONS

            cmd_preview = command[:50] + ("..." if len(command) > 50 else "")
            self.console.print(f"{ICONS['terminal']} Running in background: {cmd_preview}")

    # =========================================================================
    # Status Line (v2 only, fallback to AnimatedWaiter for v1)
    # =========================================================================

    def create_status_line(self, step_name: str, tool_name: str = "claude"):
        """Create a status line for tracking long-running operations.

        Returns:
            StatusLine (v2/verbose) or AnimatedWaiter (v1)
        """
        if self._is_v2 or self._is_verbose:
            return self._display.StatusLine(step_name, tool_name)
        else:
            return self._display.AnimatedWaiter(tool_name)

    # =========================================================================
    # Direct V1 access (for tools that need specific v1 features)
    # =========================================================================

    def get_animated_waiter(self, tool_name: str = "claude"):
        """Get an AnimatedWaiter (v1 style) regardless of version setting.

        This is for tools that still need the animated spinner display.
        """
        if self._is_verbose:
            # Verbose mode has its own AnimatedWaiter
            return self._display.AnimatedWaiter(tool_name)
        elif self._is_v2:
            # For v2, we still provide AnimatedWaiter from v1 for compatibility
            from .display import AnimatedWaiter

            return AnimatedWaiter(tool_name)
        return self._display.AnimatedWaiter(tool_name)


    # =========================================================================
    # Checklist Display
    # =========================================================================

    def print_checklist_start(self, checklist_name: str, item_count: int) -> None:
        """Print checklist start header."""
        if self._is_v2 or self._is_verbose:
            self._display.print_checklist_start(checklist_name, item_count)
        else:
            self.console.print(
                f"\n  [cyan]Checklist: {checklist_name}[/cyan] ({item_count} checks)"
            )

    def print_checklist_item(
        self,
        name: str,
        passed: bool,
        severity: str,
        message: Optional[str] = None,
        details: Optional[str] = None,
    ) -> None:
        """Print a single checklist item result."""
        if self._is_v2 or self._is_verbose:
            self._display.print_checklist_item(name, passed, severity, message, details)
        else:
            # V1 style
            if passed:
                icon = "[green]✓[/green]"
            elif severity == "error":
                icon = "[red]✗[/red]"
            elif severity == "warning":
                icon = "[yellow]⚠[/yellow]"
            else:
                icon = "[dim]ℹ[/dim]"
            self.console.print(f"     {icon} {name}")
            if not passed and message:
                self.console.print(f"        [dim]{message}[/dim]")

    def print_checklist_complete(
        self,
        checklist_name: str,
        passed_count: int,
        total_count: int,
        has_errors: bool,
        has_warnings: bool,
        duration: float,
    ) -> None:
        """Print checklist completion summary."""
        if self._is_v2 or self._is_verbose:
            self._display.print_checklist_complete(
                checklist_name, passed_count, total_count,
                has_errors, has_warnings, duration
            )
        else:
            # V1 style
            if has_errors:
                status = "[red]FAILED[/red]"
            elif has_warnings:
                status = "[yellow]PASSED with warnings[/yellow]"
            else:
                status = "[green]PASSED[/green]"
            self.console.print(
                f"\n     {status}: {passed_count}/{total_count} checks passed"
            )


# Convenience function to get display adapter
def get_display() -> DisplayAdapter:
    """Get the display adapter instance."""
    return DisplayAdapter.get_instance()
