"""CI-style terminal display for workflow orchestration.

This module provides a clean, single-line based display system similar to
CI pipelines like GitHub Actions. Features:
- Single-line step format with status icons
- In-place line updates during execution
- Indented tree structure for nested iterations
- Colored status icons for quick visual scanning
- Humanized skip reasons
"""

from __future__ import annotations

import re
import sys
import time
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any, Generator, Optional

from rich.console import Console
from rich.text import Text

if TYPE_CHECKING:
    from .config import ClaudeConfig, WorkflowConfig


# Shared console instance
console = Console()


@dataclass
class StatusIcons:
    """Status icons with colors for CI-style display."""

    RUNNING = "[cyan][bold]•[/bold][/cyan]"
    SUCCESS = "[green][bold]✓[/bold][/green]"
    FAILED = "[red][bold]✗[/bold][/red]"
    SKIPPED = "[yellow]⏭[/yellow]"
    GROUP = "[white]▶[/white]"
    PENDING = "[dim]○[/dim]"


@dataclass
class DisplayState:
    """Tracks current display state for proper indentation and updates."""

    indent_level: int = 0
    current_line_length: int = 0
    step_start_time: float = 0.0
    last_status_line: str = ""


# Global display state
_state = DisplayState()


def _get_indent() -> str:
    """Get current indentation string."""
    return "    " * _state.indent_level


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


def humanize_skip_reason(reason: str) -> str:
    """Convert condition evaluation reason to human-readable text.

    The reason string shows evaluated VALUES, not the condition itself.
    For example, if condition is "{exit_code} != 0 AND {retry} < 3":
    - When exit_code=0, retry=1, we see: "0 != 0 AND 1 < 3"
    - 0 != 0 is FALSE, so the whole condition is FALSE -> step skipped

    Examples:
        "'false' == 'true'" -> "condition not met"
        "0 != 0 AND 1 < 3" -> "tests passed" (0 != 0 is FALSE)
        "1 != 0 AND 1 < 3" -> "retrying (1/3)" (1 != 0 is TRUE)
        "'true' == 'true'" -> "already completed"
    """
    # Pattern: compound conditions with AND - most common case
    # These are typically: "{exit_code} != 0 AND {retry} < max"
    if " AND " in reason:
        parts = reason.split(" AND ")

        # Check for exit_code pattern: "X != 0 AND Y < Z"
        if len(parts) >= 2:
            first_part = parts[0].strip()
            second_part = parts[1].strip()

            # Check if first part is "N != 0" pattern (exit code check)
            exit_match = re.match(r"^(\d+)\s*!=\s*0$", first_part)
            retry_match = re.match(r"^(\d+)\s*[<>=]+\s*(\d+)$", second_part)

            if exit_match and retry_match:
                exit_code = int(exit_match.group(1))
                retry_num = int(retry_match.group(1))
                max_retry = int(retry_match.group(2))

                # exit_code == 0 means tests passed (the != 0 condition is FALSE)
                if exit_code == 0:
                    # But also check if retry limit was reached
                    if ">=" in second_part and retry_num >= max_retry:
                        return "tests passed, max retries reached"
                    return "tests passed"
                # exit_code != 0 means tests failed
                elif ">=" in second_part:
                    return "max retries reached"
                else:
                    return f"retrying ({retry_num}/{max_retry})"

            # Check if first part is "N >= Z" (max retries check)
            max_retry_match = re.match(r"^(\d+)\s*>=\s*(\d+)$", first_part)
            if max_retry_match:
                return "max retries reached"

    # Pattern: standalone "N >= M" (retry limit check)
    ge_match = re.match(r"^(\d+)\s*>=\s*(\d+)$", reason.strip())
    if ge_match:
        left, right = int(ge_match.group(1)), int(ge_match.group(2))
        if left >= right:
            return "limit reached"
        return "within limit"

    # Pattern: simple "N != 0" (exit code check, step condition)
    simple_exit = re.match(r"^(\d+)\s*!=\s*0$", reason.strip())
    if simple_exit:
        exit_code = int(simple_exit.group(1))
        if exit_code == 0:
            return "command succeeded"
        return "command failed"

    # Pattern: simple "N == 0" check
    if re.match(r"^0\s*==\s*0$", reason.strip()):
        return "success"

    # Pattern: boolean string checks
    if "'false' == 'true'" in reason or "'true' == 'false'" in reason:
        return "condition not met"

    if "'true' == 'true'" in reason:
        return "already completed"

    if "'false' == 'false'" in reason:
        return "not yet completed"

    # Pattern: string equality showing empty/non-empty
    if reason.strip() in ["'' == ''", "'' != ''"]:
        return "empty value"

    # Pattern: numeric equality with same values
    eq_match = re.match(r"^(\d+)\s*==\s*(\d+)$", reason.strip())
    if eq_match:
        left, right = eq_match.groups()
        if left == right:
            return "condition met"
        return "condition not met"

    neq_match = re.match(r"^(\d+)\s*!=\s*(\d+)$", reason.strip())
    if neq_match:
        left, right = neq_match.groups()
        if left == right:
            return "values equal"
        return "values differ"

    # Pattern: compound conditions with OR
    if " OR " in reason:
        return "one condition met"

    # Default: clean up quotes and return shortened version
    cleaned = reason.replace("'", "").strip()
    if len(cleaned) > 30:
        cleaned = cleaned[:27] + "..."
    return cleaned


# =============================================================================
# Header Display
# =============================================================================


def print_header(
    config: "WorkflowConfig",
    project_path: Path,
    server_port: int,
) -> None:
    """Print simplified workflow header with key configuration."""
    console.print()

    # Project and workflow info
    console.print(f"[bold]Project:[/bold] {project_path}")
    console.print(f"[bold]Workflow:[/bold] {config.name}")

    # Config summary line
    parts = [
        f"Steps: {len(config.steps)}",
        f"Model: {config.claude.model or 'default'}",
        f"Server: :{server_port}",
    ]

    # Permissions
    if config.claude.dangerously_skip_permissions:
        parts.append("[yellow]Permissions: BYPASSED[/yellow]")
    else:
        parts.append("[green]Permissions: Normal[/green]")

    console.print(" | ".join(parts))

    # Plan auto-approval
    if config.claude.auto_approve_plan:
        console.print("[dim]Plan auto-approval: enabled[/dim]")

    console.print()


# =============================================================================
# Step Display - Single Line Format
# =============================================================================


def print_step_start(
    step_name: str,
    step_num: int,
    total_steps: int,
    tool: str = "claude",
) -> None:
    """Print step start with running status icon.

    Format: [•] Step name (tool)                          running...
    """
    _state.step_start_time = time.time()

    indent = _get_indent()
    tool_label = f"[dim]({tool})[/dim]" if tool else ""

    line = f"{indent}[{StatusIcons.RUNNING}] {step_name} {tool_label}"

    # Store for later update
    _state.last_status_line = line

    # Print with running indicator
    console.print(f"{line}  [dim]running...[/dim]")


def update_step_status(elapsed: float) -> None:
    """Update the current step's elapsed time in place.

    This clears the current line and reprints with updated time.
    """
    if not _state.last_status_line:
        return

    # Move cursor up one line and clear
    sys.stdout.write("\033[1A\033[2K")

    # Reprint with updated time
    duration_str = _format_duration(elapsed)
    console.print(f"{_state.last_status_line}  [dim]{duration_str}...[/dim]")


def print_step_complete(
    step_name: str,
    duration: float,
    output_var: Optional[str] = None,
) -> None:
    """Transform step line to completed status.

    Format: [✓] Step name                                    1m 23s
    """
    # Move cursor up one line and clear
    sys.stdout.write("\033[1A\033[2K")

    indent = _get_indent()
    duration_str = _format_duration(duration)

    line = f"{indent}[{StatusIcons.SUCCESS}] {step_name}"

    if output_var:
        line += f" [dim]-> {output_var}[/dim]"

    # Right-align duration
    console.print(f"{line}  [dim]{duration_str}[/dim]")

    _state.last_status_line = ""


def print_step_failed(
    step_name: str,
    duration: float,
    error: Optional[str] = None,
) -> None:
    """Transform step line to failed status.

    Format: [✗] Step name                                    1m 23s
            Error: message
    """
    # Move cursor up one line and clear
    sys.stdout.write("\033[1A\033[2K")

    indent = _get_indent()
    duration_str = _format_duration(duration)

    console.print(f"{indent}[{StatusIcons.FAILED}] {step_name}  [dim]{duration_str}[/dim]")

    if error:
        console.print(f"{indent}    [red]Error: {error}[/red]")

    _state.last_status_line = ""


def print_step_skipped(
    step_name: str,
    reason: str,
    step_num: Optional[int] = None,
    total_steps: Optional[int] = None,
) -> None:
    """Print skipped step with humanized reason.

    Format: [⏭] Step name — reason
    """
    indent = _get_indent()
    human_reason = humanize_skip_reason(reason)

    console.print(f"{indent}[{StatusIcons.SKIPPED}] {step_name} [dim]— {human_reason}[/dim]")


# =============================================================================
# Group/Iteration Display
# =============================================================================


def print_group_start(
    name: str,
    item_count: Optional[int] = None,
) -> None:
    """Print a group header (foreach, iteration parent).

    Format: [▶] Process prompts (4 items)
    """
    indent = _get_indent()
    count_label = f" ({item_count} items)" if item_count else ""

    console.print(f"{indent}[{StatusIcons.GROUP}] {name}{count_label}")


def print_iteration_header(
    index: int,
    total: int,
    item_preview: str,
) -> None:
    """Print iteration header with item preview.

    Format: [▶] Iteration 1/4: The new button...
    """
    indent = _get_indent()

    # Truncate preview if too long
    if len(item_preview) > 50:
        item_preview = item_preview[:47] + "..."

    console.print(
        f"{indent}[{StatusIcons.GROUP}] [cyan]Iteration {index + 1}/{total}:[/cyan] {item_preview}"
    )


def print_iteration_complete(
    index: int,
    total: int,
    duration: float,
) -> None:
    """Print iteration completion.

    Format: [✓] Iteration 1/4                               10m 15s
    """
    indent = _get_indent()
    duration_str = _format_duration(duration)

    console.print(
        f"{indent}[{StatusIcons.SUCCESS}] Iteration {index + 1}/{total}  [dim]{duration_str}[/dim]"
    )


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
    """Print compact workflow summary.

    Format: ────────────────────────────────────
            ✓ Workflow complete | 3 steps | 56m 57s
    """
    console.print()
    console.print("─" * 40)

    duration_str = _format_duration(total_elapsed)
    console.print(
        f"[green]✓ Workflow complete[/green] | {completed_steps} steps | {duration_str}"
    )
    console.print()


# =============================================================================
# Special Status Messages
# =============================================================================


def print_auto_approve_plan() -> None:
    """Print plan auto-approval message."""
    indent = _get_indent()
    console.print(f"{indent}[yellow]⚡ Auto-approving plan...[/yellow]")


def print_bash_running(command: str) -> None:
    """Print bash command running message (truncated)."""
    indent = _get_indent()
    cmd_preview = command[:40] + "..." if len(command) > 40 else command
    console.print(f"{indent}[dim]$ {cmd_preview}[/dim]")


# =============================================================================
# Animated Status Line (for Claude waiting)
# =============================================================================


class StatusLine:
    """Manages an in-place updating status line for long-running operations."""

    def __init__(self, step_name: str, tool_name: str = "claude") -> None:
        self.step_name = step_name
        self.tool_name = tool_name
        self.start_time = time.time()
        self._last_printed = False

    def update(self, extra_status: Optional[str] = None) -> None:
        """Update the status line with current elapsed time."""
        elapsed = time.time() - self.start_time
        duration_str = _format_duration(elapsed)

        # Clear previous line if we printed one
        if self._last_printed:
            sys.stdout.write("\033[1A\033[2K")

        indent = _get_indent()
        status = extra_status or "running"

        console.print(
            f"{indent}[{StatusIcons.RUNNING}] {self.step_name}  [dim]{duration_str} ({status})[/dim]"
        )
        self._last_printed = True

    def complete(self, success: bool = True, output_var: Optional[str] = None) -> None:
        """Complete the status line with final status."""
        elapsed = time.time() - self.start_time

        # Clear the running line
        if self._last_printed:
            sys.stdout.write("\033[1A\033[2K")

        if success:
            print_step_complete(self.step_name, elapsed, output_var)
        else:
            print_step_failed(self.step_name, elapsed)
