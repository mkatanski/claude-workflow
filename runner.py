#!/usr/bin/env python3
"""
Claude Code Workflow Orchestrator

A beautiful terminal-based orchestrator that runs Claude Code workflows
defined in .claude/workflow.yml files.

Usage:
    python runner.py /path/to/project
    python runner.py .  # current directory

Requirements:
    - tmux must be running (start with: tmux new -s workflow)
    - uv tool install git+https://github.com/pchalasani/claude-code-tools
    - pip install pyyaml rich
"""

import sys
import os
import time
import json
import uuid
import argparse
from pathlib import Path
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, field

import yaml
from rich.console import Console, Group
from rich.panel import Panel
from rich.table import Table
from rich.live import Live
from rich.text import Text
from rich.align import Align
from rich import box

from claude_code_tools.tmux_cli_controller import TmuxCLIController

console = Console()

# Marker directory for completion detection
MARKER_DIR = Path("/tmp/claude-orchestrator")

# Required hook configuration for ~/.claude/settings.json
REQUIRED_HOOK_CONFIG = {
    "hooks": {
        "Stop": [
            {
                "matcher": "",
                "hooks": [
                    {
                        "type": "command",
                        "command": "/bin/bash -c 'mkdir -p /tmp/claude-orchestrator && echo \"$(date -Iseconds)\" > \"/tmp/claude-orchestrator/$(tmux display-message -p \"#{pane_id}\" 2>/dev/null || echo \"unknown\").done\"'"
                    }
                ]
            }
        ]
    }
}


def check_hook_configuration(project_path: Optional[Path] = None) -> bool:
    """Check if the stop hook is configured in Claude settings.

    Checks both global (~/.claude/settings.json) and project-level
    (<project>/.claude/settings.json) settings.
    """
    settings_paths = [Path.home() / ".claude" / "settings.json"]

    if project_path:
        settings_paths.insert(0, project_path / ".claude" / "settings.json")

    for settings_path in settings_paths:
        if not settings_path.exists():
            continue

        try:
            with open(settings_path, "r") as f:
                settings = json.load(f)

            # Check if Stop hook exists with our marker command
            hooks = settings.get("hooks", {})
            stop_hooks = hooks.get("Stop", [])

            for hook_group in stop_hooks:
                for hook in hook_group.get("hooks", []):
                    if hook.get("type") == "command":
                        cmd = hook.get("command", "")
                        if "/tmp/claude-orchestrator" in cmd and ".done" in cmd:
                            return True
        except (json.JSONDecodeError, KeyError):
            continue

    return False


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
    "spinner": ["\u280B", "\u2819", "\u2839", "\u2838", "\u283C", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F"],
}


def print_hook_setup_instructions(project_path: Optional[Path] = None) -> None:
    """Print instructions for setting up the stop hook."""
    global_path = Path.home() / ".claude" / "settings.json"
    project_settings = f"{project_path}/.claude/settings.json" if project_path else None

    location_text = f"  [cyan]{global_path}[/cyan] (global)"
    if project_settings:
        location_text = f"  [cyan]{project_settings}[/cyan] (project)\n  [dim]or[/dim]\n" + location_text

    console.print()
    warning_panel = Panel(
        Text.from_markup(
            f"[bold yellow]{ICONS['warning']} Stop hook not configured![/bold yellow]\n\n"
            f"[white]For reliable completion detection, add this to:[/white]\n"
            f"{location_text}\n\n"
            f"[white]Add or merge into your settings:[/white]\n"
            f'[dim]{json.dumps(REQUIRED_HOOK_CONFIG, indent=2)}[/dim]\n\n'
            f"[white]Then restart Claude Code for changes to take effect.[/white]\n\n"
            f"[dim]Falling back to idle-based detection (less reliable).[/dim]"
        ),
        title="[bold yellow]Configuration Required[/bold yellow]",
        border_style="yellow",
        box=box.ROUNDED,
        expand=False,
    )
    console.print(warning_panel)
    console.print()


@dataclass
class TmuxConfig:
    """Tmux pane configuration."""
    new_window: bool = False
    split: str = "vertical"
    idle_time: float = 3.0


@dataclass
class ClaudeConfig:
    """Claude Code configuration."""
    interactive: bool = True
    cwd: Optional[str] = None
    model: Optional[str] = None
    dangerously_skip_permissions: bool = False
    allowed_tools: Optional[List[str]] = None


@dataclass
class Step:
    """A single workflow step."""
    name: str
    prompt: str


@dataclass
class WorkflowConfig:
    """Complete workflow configuration."""
    name: str
    variables: Dict[str, List[Any]]
    steps: List[Step]
    tmux: TmuxConfig = field(default_factory=TmuxConfig)
    claude: ClaudeConfig = field(default_factory=ClaudeConfig)


def load_config(project_path: Path) -> WorkflowConfig:
    """Load and parse workflow YAML configuration from .claude/workflow.yml."""
    workflow_path = project_path / ".claude" / "workflow.yml"

    if not workflow_path.exists():
        workflow_path = project_path / ".claude" / "workflow.yaml"

    if not workflow_path.exists():
        raise FileNotFoundError(
            f"Workflow file not found at:\n"
            f"  {project_path / '.claude' / 'workflow.yml'}\n"
            f"  {project_path / '.claude' / 'workflow.yaml'}"
        )

    with open(workflow_path, "r") as f:
        data = yaml.safe_load(f)

    steps = [Step(name=s["name"], prompt=s["prompt"]) for s in data.get("steps", [])]

    tmux_data = data.get("tmux", {})
    tmux_config = TmuxConfig(
        new_window=tmux_data.get("new_window", False),
        split=tmux_data.get("split", "vertical"),
        idle_time=tmux_data.get("idle_time", 3.0),
    )

    claude_data = data.get("claude", {})
    allowed_tools = claude_data.get("allowed_tools")
    if isinstance(allowed_tools, str):
        allowed_tools = [allowed_tools]

    claude_config = ClaudeConfig(
        interactive=claude_data.get("interactive", True),
        cwd=claude_data.get("cwd"),
        model=claude_data.get("model"),
        dangerously_skip_permissions=claude_data.get("dangerously_skip_permissions", False),
        allowed_tools=allowed_tools,
    )

    return WorkflowConfig(
        name=data.get("name", "Workflow"),
        variables=data.get("variables", {}),
        steps=steps,
        tmux=tmux_config,
        claude=claude_config,
    )


def interpolate(template: str, variables: Dict[str, Any]) -> str:
    """Replace {var} placeholders with values."""
    result = template
    for key, value in variables.items():
        result = result.replace(f"{{{key}}}", str(value))
    return result


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


def create_config_table(config: WorkflowConfig, project_path: Path, hook_configured: bool = False) -> Table:
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

    # Get iteration info
    if config.variables:
        iter_key = list(config.variables.keys())[0]
        iter_values = config.variables[iter_key]
        iter_display = f"{len(iter_values)} ({iter_key}: {iter_values})"
        total_steps = len(iter_values) * len(config.steps)
    else:
        iter_display = "1 (no variables)"
        total_steps = len(config.steps)

    table.add_row(ICONS["folder"], "Project Path", str(project_path.resolve()))
    table.add_row(ICONS["loop"], "Iterations", iter_display)
    table.add_row(ICONS["target"], "Steps per Iteration", str(len(config.steps)))
    table.add_row(ICONS["fire"], "Total Steps", str(total_steps))
    table.add_row(
        ICONS["terminal"],
        "Tmux Mode",
        "New window" if config.tmux.new_window else f"Split pane ({config.tmux.split})",
    )

    # Completion detection method
    if hook_configured:
        table.add_row(ICONS["check"], "Detection", "[green]Hook-based (reliable)[/green]")
    else:
        table.add_row(ICONS["clock"], "Detection", f"[yellow]Idle-based ({config.tmux.idle_time}s)[/yellow]")

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
    step: Step, variables: Dict[str, Any], step_num: int, total_steps: int
) -> Panel:
    """Create a panel for displaying a step."""
    prompt = interpolate(step.prompt, variables)
    step_name = interpolate(step.name, variables)

    content = Text()
    content.append(prompt, style="white")

    return Panel(
        content,
        title=f"[bold cyan]{ICONS['play']} Step {step_num}/{total_steps}: {step_name}[/bold cyan]",
        title_align="left",
        border_style="cyan",
        box=box.ROUNDED,
        padding=(0, 1),
        expand=False,
    )


def create_iteration_header(
    iter_key: str, iter_value: Any, iter_num: int, total_iters: int
) -> Text:
    """Create an iteration header."""
    text = Text()
    text.append(f"{ICONS['rocket']} ", style="bold yellow")
    text.append(f"{iter_key.upper()} ", style="bold white")
    text.append(str(iter_value), style="bold yellow")
    text.append(f" ({iter_num}/{total_iters})", style="dim white")
    return text


class AnimatedWaiter:
    """Animated waiting display for Claude processing."""

    def __init__(self) -> None:
        self.start_time = time.time()
        self.frame = 0

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
        status.append(f"{ICONS['brain']} Claude is thinking{dots}", style="bold cyan")
        status.append(f"   [{elapsed:.1f}s]", style="dim")

        # Animated hint
        hints = [
            f"{ICONS['terminal']} Watch the Claude pane for real-time output",
            f"{ICONS['lightning']} Claude is processing your request",
            f"{ICONS['gear']} Running workflow step",
            f"{ICONS['sparkles']} AI magic in progress",
        ]
        current_hint = hints[(self.frame // 20) % len(hints)]
        hint_text = Text(f"  {current_hint}", style="dim italic")

        return Group(status, hint_text)


class WorkflowRunner:
    """Orchestrates Claude Code execution via tmux with beautiful output."""

    def __init__(self, config: WorkflowConfig, project_path: Path) -> None:
        self.config = config
        self.project_path = project_path
        self.controller = TmuxCLIController()
        self.claude_pane: Optional[str] = None
        self.hook_configured = check_hook_configuration(project_path)

        # Time tracking
        self.workflow_start_time: Optional[float] = None
        self.phase_start_time: Optional[float] = None
        self.step_times: List[float] = []
        self.phase_times: List[float] = []

        # Progress tracking
        self.completed_steps = 0

        # Unique step identifier for marker files (changes each step)
        self.current_step_id: Optional[str] = None

        # Ensure marker directory exists and clean up old markers
        MARKER_DIR.mkdir(parents=True, exist_ok=True)
        self._cleanup_all_marker_files()

    def _get_marker_file(self) -> Optional[Path]:
        """Get the marker file path for the current pane."""
        if not self.claude_pane:
            return None
        # Pane ID is like %123, use it as filename
        return MARKER_DIR / f"{self.claude_pane}.done"

    def _cleanup_marker_file(self) -> None:
        """Remove the marker file if it exists."""
        marker_file = self._get_marker_file()
        if marker_file and marker_file.exists():
            try:
                marker_file.unlink()
            except OSError:
                pass

    def _cleanup_all_marker_files(self) -> None:
        """Remove all marker files in the marker directory."""
        try:
            for marker_file in MARKER_DIR.glob("*.done"):
                try:
                    marker_file.unlink()
                except OSError:
                    pass
        except OSError:
            pass

    def _wait_for_marker_file(self, timeout: Optional[float] = None) -> bool:
        """
        Wait for the marker file to appear.

        Args:
            timeout: Maximum seconds to wait (None for no timeout)

        Returns:
            True if marker file appeared, False if timeout
        """
        marker_file = self._get_marker_file()
        if not marker_file:
            return False

        start_time = time.time()
        while True:
            if marker_file.exists():
                return True

            if timeout and (time.time() - start_time > timeout):
                return False

            time.sleep(0.5)

    def _build_claude_command(self, prompt: Optional[str] = None) -> str:
        """Build the Claude Code command with all options."""
        cwd = self.config.claude.cwd or str(self.project_path.resolve())
        parts = [f"cd {cwd} && claude"]

        # Add model if specified
        if self.config.claude.model:
            parts.append(f"--model {self.config.claude.model}")

        # Add permission bypass if enabled
        if self.config.claude.dangerously_skip_permissions:
            parts.append("--dangerously-skip-permissions")

        # Add allowed tools if specified
        if self.config.claude.allowed_tools:
            tools = " ".join(self.config.claude.allowed_tools)
            parts.append(f'--allowed-tools "{tools}"')

        # Add prompt as positional argument (interactive mode with initial prompt)
        if prompt:
            escaped_prompt = prompt.replace("'", "'\\''")
            parts.append(f"'{escaped_prompt}'")

        return " ".join(parts)

    def print_header(self) -> None:
        """Print workflow header with configuration summary."""
        console.print()
        console.print(create_header_panel(self.config.name))
        console.print()
        console.print(create_config_table(self.config, self.project_path, self.hook_configured))
        console.print()

    def launch_claude_pane(self, prompt: str) -> str:
        """Launch Claude Code in a new tmux pane with the given prompt."""
        cmd = self._build_claude_command(prompt)

        with console.status(
            f"[cyan]{ICONS['lightning']} Launching Claude Code...[/cyan]",
            spinner="dots12",
        ):
            vertical = self.config.tmux.split == "vertical"
            pane_id = self.controller.create_pane(
                vertical=vertical,
                size=50,
                start_command=cmd,
            )
            # Brief pause for pane to initialize
            time.sleep(1)

        status_text = Text()
        status_text.append(f"{ICONS['check']} ", style="bold green")
        status_text.append("Claude started: ", style="white")
        status_text.append(pane_id, style="bold cyan")
        console.print(status_text)

        return pane_id

    def close_claude_pane(self) -> None:
        """Close the current Claude pane."""
        if not self.claude_pane:
            return

        pane_to_kill = self.claude_pane
        self.claude_pane = None  # Clear reference first

        try:
            # Send Ctrl+C to interrupt any running process
            self.controller.send_interrupt(pane_to_kill)
            time.sleep(0.3)

            # Send exit command
            self.controller.send_keys(
                pane_id=pane_to_kill,
                text="exit",
                enter=True,
                delay_enter=0.2,
            )
            time.sleep(0.3)

            # Force kill the pane
            self.controller.kill_pane(pane_to_kill)
        except Exception:
            # Try one more time to force kill
            try:
                self.controller.kill_pane(pane_to_kill)
            except Exception:
                pass  # Pane might already be closed

        # Wait for tmux to clean up the pane
        time.sleep(0.5)

    def wait_for_completion(self) -> None:
        """Wait for Claude to finish processing with animated output."""
        if not self.claude_pane:
            raise RuntimeError("Claude pane not initialized")

        start = time.time()
        waiter = AnimatedWaiter()

        with Live(console=console, refresh_per_second=10) as live:
            while True:
                elapsed = time.time() - start
                live.update(waiter.create_display(elapsed))

                if self.hook_configured:
                    # Primary: Check for marker file (most reliable)
                    marker_file = self._get_marker_file()
                    if marker_file and marker_file.exists():
                        return
                    # Brief sleep before next check
                    time.sleep(0.5)
                else:
                    # Fallback: Check if idle (less reliable)
                    is_idle = self.controller.wait_for_idle(
                        pane_id=self.claude_pane,
                        idle_time=self.config.tmux.idle_time,
                        timeout=1,
                    )
                    if is_idle:
                        return

    def run_step(
        self, step: Step, variables: Dict[str, Any], step_num: int, total_steps: int
    ) -> None:
        """Execute a single workflow step."""
        step_start_time = time.time()

        console.print()
        console.print(create_step_panel(step, variables, step_num, total_steps))

        prompt = interpolate(step.prompt, variables)

        # Clean up ALL marker files before launching new pane
        # This ensures no stale markers from previous steps with same pane ID
        self._cleanup_all_marker_files()

        # Launch a fresh Claude pane with the prompt
        self.claude_pane = self.launch_claude_pane(prompt)

        # Double-check: clean up marker file for this specific pane
        self._cleanup_marker_file()

        try:
            # Wait for completion (no timeout)
            self.wait_for_completion()

            # Calculate step duration
            step_duration = time.time() - step_start_time
            self.step_times.append(step_duration)

            # Display result with timing
            result_text = Text()
            result_text.append(f"\n{ICONS['check']} ", style="bold green")
            result_text.append("Step completed", style="green")
            result_text.append(f" ({format_duration(step_duration)})", style="dim")
            console.print(result_text)
            self.completed_steps += 1
        finally:
            # Clean up marker file
            self._cleanup_marker_file()
            # Close the Claude pane after step completion
            self.close_claude_pane()

    def run_iteration(
        self, iter_key: str, iter_value: Any, iter_num: int, total_iters: int
    ) -> None:
        """Run all steps for a single iteration (phase)."""
        phase_start_time = time.time()
        variables = {iter_key: iter_value}

        console.print()
        console.print(create_iteration_header(iter_key, iter_value, iter_num, total_iters))

        total_steps = len(self.config.steps)

        for step_num, step in enumerate(self.config.steps, 1):
            self.run_step(step, variables, step_num, total_steps)
            time.sleep(0.5)

        # Calculate and store phase duration
        phase_duration = time.time() - phase_start_time
        self.phase_times.append(phase_duration)

        # Display phase completion with timing
        phase_text = Text()
        phase_text.append(f"{ICONS['check']} ", style="bold green")
        phase_text.append(f"Phase {iter_num}/{total_iters} completed", style="green")
        phase_text.append(f" ({format_duration(phase_duration)})", style="dim")
        console.print()
        console.print(phase_text)

    def run(self) -> None:
        """Run the complete workflow."""
        self.print_header()

        # Check hook configuration and warn if not set up
        if not self.hook_configured:
            print_hook_setup_instructions(self.project_path)

        # Get iteration variable
        if self.config.variables:
            iter_key = list(self.config.variables.keys())[0]
            iter_values = self.config.variables[iter_key]
        else:
            iter_key = "step"
            iter_values = [1]

        total_iters = len(iter_values)

        console.print()
        start_text = Text()
        start_text.append(f"{ICONS['rocket']} ", style="bold green")
        start_text.append("Starting workflow...", style="bold green")
        console.print(start_text)

        hint_text = Text()
        hint_text.append(f"  {ICONS['info']} ", style="dim cyan")
        hint_text.append("Watch the Claude pane for full TUI output", style="dim")
        console.print(hint_text)

        self.workflow_start_time = time.time()

        try:
            for iter_num, iter_value in enumerate(iter_values, 1):
                self.run_iteration(iter_key, iter_value, iter_num, total_iters)
        except KeyboardInterrupt:
            console.print()
            interrupt_text = Text()
            interrupt_text.append(f"\n{ICONS['stop']} ", style="bold yellow")
            interrupt_text.append("Workflow interrupted by user", style="yellow")
            console.print(interrupt_text)
        finally:
            # Clean up any running Claude pane
            self._cleanup()
            self._print_summary()

    def _cleanup(self) -> None:
        """Clean up resources on exit."""
        # Kill any running Claude pane
        if self.claude_pane:
            cleanup_text = Text()
            cleanup_text.append(f"{ICONS['gear']} ", style="dim")
            cleanup_text.append("Cleaning up Claude pane...", style="dim")
            console.print(cleanup_text)
            self.close_claude_pane()

        # Clean up all marker files
        self._cleanup_all_marker_files()

    def _print_summary(self) -> None:
        """Print workflow completion summary."""
        total_elapsed = time.time() - (self.workflow_start_time or time.time())

        console.print()

        # Create summary content
        summary = Text()
        summary.append(f"{ICONS['sparkles']} ", style="bold green")
        summary.append("Workflow Complete!", style="bold green")
        summary.append(f" {ICONS['sparkles']}\n", style="bold green")

        # Stats table
        stats_table = Table(show_header=False, box=None, padding=(0, 1), expand=False)
        stats_table.add_column("Metric", style="dim", no_wrap=True)
        stats_table.add_column("Value", style="bold white", no_wrap=True)

        # Completed steps
        stats_table.add_row(
            f"{ICONS['check']} Completed steps",
            f"[green]{self.completed_steps}[/green]",
        )

        # Total workflow time
        stats_table.add_row(
            f"{ICONS['clock']} Total time",
            format_duration(total_elapsed),
        )

        # Average phase time
        if self.phase_times:
            avg_phase = sum(self.phase_times) / len(self.phase_times)
            stats_table.add_row(
                f"{ICONS['loop']} Avg phase time",
                format_duration(avg_phase),
            )

        # Average step time
        if self.step_times:
            avg_step = sum(self.step_times) / len(self.step_times)
            stats_table.add_row(
                f"{ICONS['target']} Avg step time",
                format_duration(avg_step),
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


def main() -> None:
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Run Claude Code workflows via tmux",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=f"""
{ICONS['rocket']} Examples:
    python runner.py /path/to/project
    python runner.py .

{ICONS['info']} Note: Must be run inside a tmux session!
    tmux new -s workflow
    python runner.py /path/to/project

{ICONS['file']} The workflow file should be at:
    <project>/.claude/workflow.yml
        """,
    )
    parser.add_argument(
        "project_path",
        nargs="?",
        default=".",
        help="Path to the project containing .claude/workflow.yml (default: current directory)",
    )

    args = parser.parse_args()

    # Convert to Path and resolve
    project_path = Path(args.project_path).resolve()

    # Check if inside tmux
    if not os.environ.get("TMUX"):
        console.print()
        error_panel = Panel(
            Text.from_markup(
                f"[bold red]{ICONS['cross']} Must run inside a tmux session![/bold red]\n\n"
                f"[white]Start tmux first:[/white]\n"
                f"  [cyan]tmux new -s workflow[/cyan]\n\n"
                f"[white]Then run this script:[/white]\n"
                f"  [cyan]python {sys.argv[0]} {args.project_path}[/cyan]"
            ),
            title="[bold red]Error[/bold red]",
            border_style="red",
            box=box.ROUNDED,
            expand=False,
        )
        console.print(error_panel)
        console.print()
        sys.exit(1)

    # Check project path exists
    if not project_path.exists():
        console.print()
        console.print(
            f"[bold red]{ICONS['cross']} Project path not found: {project_path}[/bold red]"
        )
        console.print()
        sys.exit(1)

    # Check workflow file exists
    workflow_yml = project_path / ".claude" / "workflow.yml"
    workflow_yaml = project_path / ".claude" / "workflow.yaml"

    if not workflow_yml.exists() and not workflow_yaml.exists():
        console.print()
        error_panel = Panel(
            Text.from_markup(
                f"[bold red]{ICONS['cross']} Workflow file not found![/bold red]\n\n"
                f"[white]Expected location:[/white]\n"
                f"  [cyan]{workflow_yml}[/cyan]\n"
                f"  [dim]or[/dim]\n"
                f"  [cyan]{workflow_yaml}[/cyan]\n\n"
                f"[white]Create a workflow.yml file with your workflow configuration.[/white]"
            ),
            title="[bold red]Error[/bold red]",
            border_style="red",
            box=box.ROUNDED,
            expand=False,
        )
        console.print(error_panel)
        console.print()
        sys.exit(1)

    # Load and run
    try:
        config = load_config(project_path)
        runner = WorkflowRunner(config, project_path)
        runner.run()
    except yaml.YAMLError as e:
        console.print()
        console.print(f"[bold red]{ICONS['cross']} Invalid YAML in workflow file:[/bold red]")
        console.print(f"  {e}")
        console.print()
        sys.exit(1)
    except KeyboardInterrupt:
        console.print()
        console.print(f"\n[yellow]{ICONS['stop']} Aborted[/yellow]")
        sys.exit(130)
    except Exception as e:
        console.print()
        console.print(f"[bold red]{ICONS['cross']} Error: {e}[/bold red]")
        console.print()
        sys.exit(1)


if __name__ == "__main__":
    main()
