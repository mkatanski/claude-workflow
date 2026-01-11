"""Rich UI components for workflow display."""

import json
import time
from pathlib import Path
from typing import Optional

from rich import box
from rich.console import Console, Group
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from .config import Step, WorkflowConfig
from .context import ExecutionContext

console = Console()

# Icons and symbols for beautiful output
ICONS = {
    "rocket": "\U0001F680",
    "check": "\u2713",
    "cross": "\u2717",
    "arrow": "\u27A4",
    "star": "\u2605",
    "clock": "\u23F1",
    "gear": "\u2699",
    "lightning": "\u26A1",
    "brain": "\U0001F9E0",
    "robot": "\U0001F916",
    "fire": "\U0001F525",
    "sparkles": "\u2728",
    "hourglass": "\u23F3",
    "play": "\u25B6",
    "pause": "\u23F8",
    "stop": "\u23F9",
    "skip": "\u23ED",
    "loop": "\U0001F501",
    "package": "\U0001F4E6",
    "folder": "\U0001F4C1",
    "file": "\U0001F4C4",
    "terminal": "\U0001F4BB",
    "wave": "\U0001F44B",
    "thumbsup": "\U0001F44D",
    "warning": "\u26A0",
    "info": "\u2139",
    "diamond": "\U0001F48E",
    "target": "\U0001F3AF",
    "lock": "\U0001F512",
    "unlock": "\U0001F513",
    "bash": "\U0001F4BB",
    "spinner": [
        "\u280B",
        "\u2819",
        "\u2839",
        "\u2838",
        "\u283C",
        "\u2834",
        "\u2826",
        "\u2827",
        "\u2807",
        "\u280F",
    ],
}

# Required hook configuration for ~/.claude/settings.json
# Uses environment variable $ORCHESTRATOR_PORT to support multiple concurrent instances
# Uses --data-urlencode to properly handle tmux pane IDs (which start with %)
REQUIRED_HOOK_CONFIG = {
    "hooks": {
        "Stop": [
            {
                "matcher": "",
                "hooks": [
                    {
                        "type": "command",
                        "command": (
                            "curl -s -X POST "
                            '"http://localhost:$ORCHESTRATOR_PORT/complete" '
                            '--data-urlencode "pane=$TMUX_PANE" '
                            "2>/dev/null || true"
                        ),
                    }
                ],
            }
        ],
        "SessionEnd": [
            {
                "matcher": "",
                "hooks": [
                    {
                        "type": "command",
                        "command": (
                            "curl -s -X POST "
                            '"http://localhost:$ORCHESTRATOR_PORT/exited" '
                            '--data-urlencode "pane=$TMUX_PANE" '
                            "2>/dev/null || true"
                        ),
                    }
                ],
            }
        ],
    }
}


def format_duration(seconds: float) -> str:
    """Format duration in human-readable format."""
    if seconds < 60:
        return f"{seconds:.1f}s"
    elif seconds < 3600:
        minutes = int(seconds // 60)
        secs = int(seconds % 60)
        return f"{minutes}m {secs}s"
    else:
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        return f"{hours}h {minutes}m"


def create_header_panel(workflow_name: str) -> Panel:
    """Create a beautiful header panel."""
    title_text = Text(justify="center")
    title_text.append(f"{ICONS['robot']} ", style="bold cyan")
    title_text.append("Claude Code Orchestrator", style="bold white")
    title_text.append(f" {ICONS['robot']}\n", style="bold cyan")
    title_text.append(f"{ICONS['diamond']} ", style="magenta")
    title_text.append(workflow_name, style="bold magenta")
    title_text.append(f" {ICONS['diamond']}", style="magenta")

    return Panel(
        title_text,
        box=box.ROUNDED,
        border_style="bright_blue",
        padding=(0, 1),
        expand=False,
    )


def create_config_table(
    config: WorkflowConfig, project_path: Path, hook_configured: bool = False
) -> Table:
    """Create a configuration summary table."""
    table = Table(
        show_header=False,
        box=box.ROUNDED,
        border_style="dim cyan",
        padding=(0, 1),
    )
    table.add_column("Icon", style="cyan", width=2, no_wrap=True)
    table.add_column("Key", style="bold white", no_wrap=True)
    table.add_column("Value", style="bright_white")

    table.add_row(ICONS["folder"], "Project Path", str(project_path.resolve()))
    table.add_row(ICONS["target"], "Steps", str(len(config.steps)))
    table.add_row(
        ICONS["terminal"],
        "Tmux Mode",
        "New window"
        if config.tmux.new_window
        else f"Split pane ({config.tmux.split})",
    )

    # Completion detection method
    if hook_configured:
        table.add_row(ICONS["check"], "Detection", "[green]Hook-based (reliable)[/green]")
    else:
        table.add_row(
            ICONS["clock"],
            "Detection",
            f"[yellow]Idle-based ({config.tmux.idle_time}s)[/yellow]",
        )

    # Model info
    model_display = config.claude.model or "default"
    table.add_row(ICONS["brain"], "Model", model_display)

    # Permission info
    if config.claude.dangerously_skip_permissions:
        table.add_row(ICONS["unlock"], "Permissions", "[yellow]BYPASSED[/yellow]")
    else:
        table.add_row(ICONS["lock"], "Permissions", "[green]Normal[/green]")

    # Allowed tools
    if config.claude.allowed_tools:
        tools_display = ", ".join(config.claude.allowed_tools)
        table.add_row(ICONS["gear"], "Allowed Tools", tools_display)

    return table


def create_step_panel(
    step: Step, context: ExecutionContext, step_num: int, total_steps: int
) -> Panel:
    """Create a panel for displaying a step."""
    step_name = context.interpolate(step.name)
    tool_icon = ICONS["brain"] if step.tool == "claude" else ICONS["bash"]

    content = Text()

    if step.tool == "claude" and step.prompt:
        prompt = context.interpolate(step.prompt)
        content.append(prompt, style="white")
    elif step.tool == "bash" and step.command:
        command = context.interpolate(step.command)
        content.append("$ ", style="green bold")
        content.append(command, style="white")

    tool_label = f"[dim]({step.tool})[/dim]"

    return Panel(
        content,
        title=f"[bold cyan]{ICONS['play']} Step {step_num}/{total_steps}: {step_name} {tool_label}[/bold cyan]",
        title_align="left",
        border_style="cyan",
        box=box.ROUNDED,
        padding=(0, 1),
        expand=False,
    )


def print_hook_setup_instructions(project_path: Optional[Path] = None) -> None:
    """Print instructions for setting up the hooks manually."""
    global_path = Path.home() / ".claude" / "settings.json"
    project_settings = (
        f"{project_path}/.claude/settings.json" if project_path else None
    )

    location_text = f"  [cyan]{global_path}[/cyan] (global)"
    if project_settings:
        location_text = (
            f"  [cyan]{project_settings}[/cyan] (project)\n  [dim]or[/dim]\n"
            + location_text
        )

    console.print()
    warning_panel = Panel(
        Text.from_markup(
            f"[bold yellow]{ICONS['warning']} Hooks not configured![/bold yellow]\n\n"
            f"[white]Hooks are required for the orchestrator to detect when Claude finishes.[/white]\n"
            f"[white]Add this to one of these files:[/white]\n"
            f"{location_text}\n\n"
            f"[white]Add or merge into your settings:[/white]\n"
            f'[dim]{json.dumps(REQUIRED_HOOK_CONFIG, indent=2)}[/dim]\n\n'
            f"[white]Then restart Claude Code for changes to take effect.[/white]"
        ),
        title="[bold yellow]Manual Hook Configuration[/bold yellow]",
        border_style="yellow",
        box=box.ROUNDED,
        expand=False,
    )
    console.print(warning_panel)
    console.print()


class AnimatedWaiter:
    """Animated waiting display for Claude processing."""

    def __init__(self, tool_name: str = "claude") -> None:
        self.start_time = time.time()
        self.frame = 0
        self.tool_name = tool_name

    def get_spinner_frame(self) -> str:
        """Get current spinner animation frame."""
        frames = ICONS["spinner"]
        return frames[self.frame % len(frames)]

    def create_display(self, elapsed: float) -> Group:
        """Create the animated display."""
        self.frame += 1

        # Brain animation with thinking dots
        dots_count = (self.frame // 3) % 4
        dots = "." * dots_count + " " * (3 - dots_count)

        # Status line
        status = Text()
        status.append(f"  {self.get_spinner_frame()} ", style="cyan")

        if self.tool_name == "claude":
            status.append(f"{ICONS['brain']} Claude is thinking{dots}", style="bold cyan")
        else:
            status.append(
                f"{ICONS['terminal']} Running {self.tool_name}{dots}", style="bold cyan"
            )

        status.append(f"   [{elapsed:.1f}s]", style="dim")

        # Animated hint
        if self.tool_name == "claude":
            hints = [
                f"{ICONS['terminal']} Watch the Claude pane for real-time output",
                f"{ICONS['lightning']} Claude is processing your request",
                f"{ICONS['gear']} Running workflow step",
                f"{ICONS['sparkles']} AI magic in progress",
            ]
        else:
            hints = [
                f"{ICONS['terminal']} Command is executing",
                f"{ICONS['gear']} Running {self.tool_name} command",
                f"{ICONS['lightning']} Processing output",
            ]

        current_hint = hints[(self.frame // 20) % len(hints)]
        hint_text = Text(f"  {current_hint}", style="dim italic")

        return Group(status, hint_text)


def print_step_result(success: bool, duration: float, output_var: Optional[str] = None) -> None:
    """Print step completion result."""
    result_text = Text()
    if success:
        result_text.append(f"\n{ICONS['check']} ", style="bold green")
        result_text.append("Step completed", style="green")
    else:
        result_text.append(f"\n{ICONS['cross']} ", style="bold red")
        result_text.append("Step failed", style="red")

    result_text.append(f" ({format_duration(duration)})", style="dim")

    if output_var:
        result_text.append(f" -> {output_var}", style="dim cyan")

    console.print(result_text)


def print_step_skipped(
    step: Step,
    context: ExecutionContext,
    step_num: int,
    total_steps: int,
    reason: str,
) -> None:
    """Print step skipped message."""
    step_name = context.interpolate(step.name)

    skip_text = Text()
    skip_text.append(f"\n{ICONS['skip']} ", style="bold yellow")
    skip_text.append(f"Step {step_num}/{total_steps} skipped: ", style="yellow")
    skip_text.append(step_name, style="bold yellow")
    skip_text.append(f"\n   Condition not met: ", style="dim")
    skip_text.append(reason, style="dim italic")
    console.print(skip_text)


def print_workflow_start() -> None:
    """Print workflow start message."""
    console.print()
    start_text = Text()
    start_text.append(f"{ICONS['rocket']} ", style="bold green")
    start_text.append("Starting workflow...", style="bold green")
    console.print(start_text)

    hint_text = Text()
    hint_text.append(f"  {ICONS['info']} ", style="dim cyan")
    hint_text.append("Watch the Claude pane for full TUI output", style="dim")
    console.print(hint_text)


def print_workflow_interrupted() -> None:
    """Print workflow interrupted message."""
    console.print()
    interrupt_text = Text()
    interrupt_text.append(f"\n{ICONS['stop']} ", style="bold yellow")
    interrupt_text.append("Workflow interrupted by user", style="yellow")
    console.print(interrupt_text)


def print_cleanup_message() -> None:
    """Print cleanup message."""
    cleanup_text = Text()
    cleanup_text.append(f"{ICONS['gear']} ", style="dim")
    cleanup_text.append("Cleaning up Claude pane...", style="dim")
    console.print(cleanup_text)


def print_summary(
    completed_steps: int,
    total_elapsed: float,
    step_times: list[float],
) -> None:
    """Print workflow completion summary."""
    console.print()

    summary = Text()
    summary.append(f"{ICONS['sparkles']} ", style="bold green")
    summary.append("Workflow Complete!", style="bold green")
    summary.append(f" {ICONS['sparkles']}\n", style="bold green")

    stats_table = Table(show_header=False, box=None, padding=(0, 1), expand=False)
    stats_table.add_column("Metric", style="dim", no_wrap=True)
    stats_table.add_column("Value", style="bold white", no_wrap=True)

    stats_table.add_row(
        f"{ICONS['check']} Completed steps",
        f"[green]{completed_steps}[/green]",
    )
    stats_table.add_row(
        f"{ICONS['clock']} Total time",
        format_duration(total_elapsed),
    )

    if step_times:
        avg_step = sum(step_times) / len(step_times)
        stats_table.add_row(
            f"{ICONS['target']} Avg step time", format_duration(avg_step)
        )

    summary_panel = Panel(
        Group(summary, stats_table),
        box=box.ROUNDED,
        border_style="green",
        expand=False,
        padding=(0, 1),
    )

    console.print(summary_panel)
    console.print()
