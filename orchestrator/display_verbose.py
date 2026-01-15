"""Verbose display for workflow orchestration.

Append-only log output with full visibility into step execution.
Uses background colors instead of borders for clean visual hierarchy.
No line rewriting - works in CI, log files, piped output.
"""

from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
from typing import TYPE_CHECKING, Generator, Optional

from rich.console import Console
from rich.padding import Padding
from rich.text import Text

if TYPE_CHECKING:
    from .config import WorkflowConfig


# Console instance
console = Console()


class VerboseState:
    """Tracks display state for verbose mode."""

    def __init__(self) -> None:
        self.indent_level: int = 0
        self.step_start_time: float = 0.0


# Global state
_state = VerboseState()


def _get_indent() -> str:
    """Get current indentation string."""
    return "  " * _state.indent_level


def _format_duration(seconds: float) -> str:
    """Format duration in human-readable format."""
    if seconds < 60:
        return f"{seconds:.1f}s"
    elif seconds < 3600:
        minutes = int(seconds // 60)
        secs = int(seconds % 60)
        return f"{minutes}m {secs:02d}s"
    else:
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        return f"{hours}h {minutes:02d}m"


def _trim_output(output: str, max_lines: int) -> str:
    """Trim output to last N lines."""
    lines = output.strip().split("\n")
    if len(lines) <= max_lines:
        return output.strip()
    return "\n".join(lines[-max_lines:])


def _print_output_block(
    output: str,
    title: str,
    style: str = "on grey15",
    title_style: str = "dim",
) -> None:
    """Print output in a styled block with background."""
    if not output or not output.strip():
        return

    indent = _get_indent()

    # Print title
    console.print(f"{indent}[{title_style}]{title}[/{title_style}]")

    # Print output with background
    for line in output.split("\n"):
        padded_line = f"  {line}"
        console.print(Padding(Text(padded_line), (0, 0)), style=style)

    console.print()  # Empty line after block


# =============================================================================
# Header Display
# =============================================================================


def print_header(
    config: "WorkflowConfig",
    project_path: Path,
    server_port: int,
) -> None:
    """Print workflow header with background color."""
    console.print()

    # Header block with blue background
    header_text = f"  WORKFLOW: {config.name}  "
    console.print(header_text, style="bold white on blue")

    # Config info
    config_parts = [
        f"Project: {project_path}",
        f"Steps: {len(config.steps)}",
        f"Model: {config.claude.model or 'default'}",
    ]
    console.print(f"  {' | '.join(config_parts)}", style="dim")

    # Permissions and server
    if config.claude.dangerously_skip_permissions:
        console.print("  [yellow]Permissions: BYPASSED[/yellow]")
    else:
        console.print("  [dim]Permissions: Normal[/dim]")

    if config.claude.auto_approve_plan:
        console.print("  [dim]Plan auto-approval: enabled[/dim]")

    console.print()


# =============================================================================
# Step Display
# =============================================================================


def print_step_start(
    step_name: str,
    step_num: int,
    total_steps: int,
    tool: str = "claude",
    command: Optional[str] = None,
    prompt: Optional[str] = None,
) -> None:
    """Print step header with step info including command/prompt."""
    import time

    _state.step_start_time = time.time()
    indent = _get_indent()

    console.print()
    console.print(
        f"{indent}[cyan bold]>>> STEP {step_num}/{total_steps}: {step_name}[/cyan bold]"
    )
    console.print(f"{indent}  [dim]Tool: {tool}[/dim]")

    # Show command for bash or prompt preview for claude
    if command:
        console.print(f"{indent}  [dim]Command: {command}[/dim]")
    elif prompt:
        # Truncate long prompts
        prompt_preview = prompt[:100] + ("..." if len(prompt) > 100 else "")
        # Replace newlines with spaces for preview
        prompt_preview = prompt_preview.replace("\n", " ")
        console.print(f"{indent}  [dim]Prompt: {prompt_preview}[/dim]")


def print_step_header(
    step_name: str,
    step_num: int,
    total_steps: int,
    tool: str,
    command: Optional[str] = None,
    prompt: Optional[str] = None,
) -> None:
    """Print step header with full details including command/prompt."""
    import time

    _state.step_start_time = time.time()
    indent = _get_indent()

    console.print()
    console.print(
        f"{indent}[cyan bold]>>> STEP {step_num}/{total_steps}: {step_name}[/cyan bold]"
    )
    console.print(f"{indent}  [dim]Tool: {tool}[/dim]")

    if command:
        console.print(f"{indent}  [dim]Command: {command}[/dim]")
    elif prompt:
        # Truncate long prompts
        prompt_preview = prompt[:100] + ("..." if len(prompt) > 100 else "")
        console.print(f"{indent}  [dim]Prompt: {prompt_preview}[/dim]")

    console.print()


def print_step_output(
    output: str,
    tool: str,
    max_lines: Optional[int] = None,
) -> None:
    """Print step output with appropriate trimming.

    For claude: last 20 lines by default
    For bash: full output by default
    """
    if not output or not output.strip():
        return

    # Determine max lines if not specified
    if max_lines is None:
        max_lines = 20 if tool == "claude" else 0  # 0 = no limit

    # Trim output if needed
    if max_lines > 0:
        trimmed = _trim_output(output, max_lines)
        title = f"{tool.capitalize()} Output (last {max_lines} lines)"
    else:
        trimmed = output.strip()
        title = "Output"

    _print_output_block(trimmed, title)


def print_step_complete(
    step_name: str,
    duration: float,
    output_var: Optional[str] = None,
) -> None:
    """Print step completion status in green."""
    indent = _get_indent()
    duration_str = _format_duration(duration)

    line = f"{indent}[green bold]+++ COMPLETED[/green bold] in {duration_str}"
    if output_var:
        line += f" [dim]-> {output_var}[/dim]"

    console.print(line)
    console.print()


def print_step_failed(
    step_name: str,
    duration: float,
    error: Optional[str] = None,
) -> None:
    """Print step failure with error block."""
    indent = _get_indent()
    duration_str = _format_duration(duration)

    console.print(f"{indent}[red bold]--- FAILED[/red bold] after {duration_str}")

    if error:
        # Error block with red background
        console.print()
        console.print(f"{indent}[bold white on red]  ERROR  [/bold white on red]")
        for line in error.strip().split("\n"):
            console.print(f"{indent}  [red]{line}[/red]")

    console.print()


def print_step_skipped(
    step_name: str,
    reason: str,
    step_num: Optional[int] = None,
    total_steps: Optional[int] = None,
) -> None:
    """Print skipped step in yellow."""
    indent = _get_indent()

    if step_num and total_steps:
        console.print()
        console.print(
            f"{indent}[yellow]~~~ STEP {step_num}/{total_steps}: {step_name} (SKIPPED)[/yellow]"
        )
    else:
        console.print(f"{indent}[yellow]~~~ {step_name} (SKIPPED)[/yellow]")

    console.print(f"{indent}  [dim]Reason: {reason}[/dim]")
    console.print()


# =============================================================================
# Group/Iteration Display
# =============================================================================


def print_group_start(
    name: str,
    item_count: Optional[int] = None,
) -> None:
    """Print foreach/group header."""
    indent = _get_indent()
    count_label = f" ({item_count} items)" if item_count else ""

    console.print()
    console.print(f"{indent}[white bold]>>> FOREACH: {name}{count_label}[/white bold]")
    console.print()


def print_iteration_header(
    index: int,
    total: int,
    item_preview: str,
) -> None:
    """Print iteration header with cyan background strip."""
    indent = _get_indent()

    # Truncate preview if too long
    if len(item_preview) > 50:
        item_preview = item_preview[:47] + "..."

    console.print()
    header = f"  ITERATION {index + 1}/{total}: {item_preview}  "
    console.print(f"{indent}{header}", style="bold white on cyan")


def print_iteration_complete(
    index: int,
    total: int,
    duration: float,
) -> None:
    """Print iteration completion."""
    indent = _get_indent()
    duration_str = _format_duration(duration)

    console.print(
        f"{indent}[green]+++ ITERATION {index + 1}/{total} COMPLETE[/green] ({duration_str})"
    )
    console.print()


@contextmanager
def indent() -> Generator[None, None, None]:
    """Context manager for increasing indentation level."""
    _state.indent_level += 1
    try:
        yield
    finally:
        _state.indent_level -= 1


# =============================================================================
# Workflow Lifecycle
# =============================================================================


def print_workflow_start() -> None:
    """Print workflow start message."""
    console.print("[green]Starting workflow...[/green]")
    console.print()


def print_workflow_interrupted() -> None:
    """Print workflow interrupted message."""
    console.print()
    console.print("[yellow]Workflow interrupted by user[/yellow]")


def print_cleanup_message() -> None:
    """Print cleanup message."""
    console.print("[dim]Cleaning up...[/dim]")


def print_summary(
    completed_steps: int,
    total_elapsed: float,
    step_times: list[float],
) -> None:
    """Print workflow summary with green/red background."""
    console.print()

    duration_str = _format_duration(total_elapsed)

    # Determine if successful (all steps completed)
    total_steps = len(step_times) if step_times else completed_steps
    all_completed = completed_steps >= total_steps if total_steps > 0 else True

    if all_completed:
        style = "bold white on green"
        status = "+++ WORKFLOW COMPLETE"
    else:
        style = "bold white on red"
        status = "--- WORKFLOW INCOMPLETE"

    console.print(f"  {status}  ", style=style)
    console.print(
        f"  Steps: {completed_steps}/{total_steps} | Duration: {duration_str}"
    )
    console.print()


# =============================================================================
# Special Messages
# =============================================================================


def print_auto_approve_plan() -> None:
    """Print plan auto-approval message."""
    indent = _get_indent()
    console.print(f"{indent}[yellow]>>> Auto-approving plan...[/yellow]")


def print_bash_running(command: str) -> None:
    """Print bash command - shown in step header, so no-op here."""
    pass


# =============================================================================
# Status Updates (No-op in verbose mode)
# =============================================================================


def update_step_status(elapsed: float) -> None:
    """No-op - verbose mode doesn't update lines in place."""
    pass


# =============================================================================
# Checklist Display
# =============================================================================


def print_checklist_start(checklist_name: str, item_count: int) -> None:
    """Print checklist header."""
    indent = _get_indent()
    console.print()
    console.print(
        f"{indent}[cyan bold]>>> CHECKLIST: {checklist_name} ({item_count} checks)[/cyan bold]"
    )
    console.print()


def print_checklist_item(
    name: str,
    passed: bool,
    severity: str,
    message: Optional[str] = None,
    details: Optional[str] = None,
) -> None:
    """Print checklist item result."""
    indent = _get_indent()

    if passed:
        icon = "[green]+[/green]"
    elif severity == "error":
        icon = "[red]-[/red]"
    elif severity == "warning":
        icon = "[yellow]![/yellow]"
    else:
        icon = "[dim]i[/dim]"

    console.print(f"{indent}  [{icon}] {name}")

    if not passed and message:
        console.print(f"{indent}      [dim]{message}[/dim]")

    if not passed and details:
        for line in details.split("\n")[:3]:
            console.print(f"{indent}      [dim]{line}[/dim]")


def print_checklist_complete(
    checklist_name: str,
    passed_count: int,
    total_count: int,
    has_errors: bool,
    has_warnings: bool,
    duration: float,
) -> None:
    """Print checklist completion summary."""
    indent = _get_indent()
    duration_str = _format_duration(duration)

    if has_errors:
        status = "[red bold]--- FAILED[/red bold]"
    elif has_warnings:
        status = "[yellow]+++ PASSED with warnings[/yellow]"
    else:
        status = "[green bold]+++ PASSED[/green bold]"

    console.print()
    console.print(
        f"{indent}{status}: {passed_count}/{total_count} checks ({duration_str})"
    )
    console.print()


# =============================================================================
# StatusLine class (for compatibility with tools)
# =============================================================================


class StatusLine:
    """Status line that prints updates as separate lines (no rewriting)."""

    def __init__(self, step_name: str, tool_name: str = "claude") -> None:
        self.step_name = step_name
        self.tool_name = tool_name
        import time

        self.start_time = time.time()

    def update(self, extra_status: Optional[str] = None) -> None:
        """Update prints a new line instead of rewriting."""
        # In verbose mode, we don't print updates during execution
        # The final output will be shown when complete
        pass

    def complete(self, success: bool = True, output_var: Optional[str] = None) -> None:
        """Complete the status line with final status."""
        import time

        elapsed = time.time() - self.start_time

        if success:
            print_step_complete(self.step_name, elapsed, output_var)
        else:
            print_step_failed(self.step_name, elapsed)


# =============================================================================
# AnimatedWaiter compatibility class
# =============================================================================


class AnimatedWaiter:
    """Compatibility class for tools that expect AnimatedWaiter.

    In verbose mode, this doesn't animate - just provides display output.
    """

    def __init__(self, tool_name: str = "claude") -> None:
        self.tool_name = tool_name

    def create_display(self, elapsed: float) -> Text:
        """Create a simple status text (no animation)."""
        duration_str = _format_duration(elapsed)
        return Text(f"  {self.tool_name} running... {duration_str}")
