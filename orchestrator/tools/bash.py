"""Bash tool implementation."""

import subprocess
import time
from typing import TYPE_CHECKING, Any, Dict

from rich.live import Live
from rich.text import Text

from ..display import ICONS, AnimatedWaiter, console
from .base import BaseTool, ToolResult

if TYPE_CHECKING:
    from ..context import ExecutionContext
    from ..tmux import TmuxManager


class BashTool(BaseTool):
    """Execute bash commands in subprocess or tmux pane."""

    @property
    def name(self) -> str:
        return "bash"

    def validate_step(self, step: Dict[str, Any]) -> None:
        """Validate bash step configuration."""
        if "command" not in step:
            raise ValueError("Bash step requires 'command' field")

    def execute(
        self,
        step: Dict[str, Any],
        context: "ExecutionContext",
        tmux_manager: "TmuxManager",
    ) -> ToolResult:
        """Execute bash command.

        If visible=True, runs in tmux pane.
        If visible=False (default), runs in background subprocess.
        """
        command = context.interpolate(step["command"])
        # Always default to project_path for cwd
        cwd = context.interpolate_optional(step.get("cwd")) or str(context.project_path)
        visible = step.get("visible", False)

        if visible:
            return self._execute_visible(command, cwd, tmux_manager)
        else:
            return self._execute_subprocess(command, cwd)

    def _execute_subprocess(
        self, command: str, cwd: str | None
    ) -> ToolResult:
        """Execute command in background subprocess."""
        status_text = Text()
        status_text.append(f"{ICONS['terminal']} ", style="bold cyan")
        status_text.append("Running in background: ", style="white")
        status_text.append(command[:50] + ("..." if len(command) > 50 else ""), style="dim")
        console.print(status_text)

        try:
            process = subprocess.run(
                command,
                shell=True,
                cwd=cwd,
                capture_output=True,
                text=True,
                timeout=600,  # 10 minute timeout
            )

            output = process.stdout or ""
            if process.stderr:
                output += f"\n[STDERR]\n{process.stderr}"

            success = process.returncode == 0

            return ToolResult(
                success=success,
                output=output,
                error=process.stderr if not success else None,
            )
        except subprocess.TimeoutExpired:
            return ToolResult(
                success=False,
                error="Command timed out after 10 minutes",
            )
        except Exception as e:
            return ToolResult(
                success=False,
                error=str(e),
            )

    def _execute_visible(
        self,
        command: str,
        cwd: str | None,
        tmux_manager: "TmuxManager",
    ) -> ToolResult:
        """Execute command in visible tmux pane."""
        # Launch bash pane
        tmux_manager.launch_bash_pane(command, cwd)

        try:
            # Wait for completion using idle detection
            output = self._wait_for_completion(tmux_manager)

            return ToolResult(
                success=True,  # Can't easily determine exit code in tmux
                output=output,
            )
        finally:
            tmux_manager.close_pane()

    def _wait_for_completion(self, tmux_manager: "TmuxManager") -> str:
        """Wait for bash command to finish using idle detection.

        Uses hash-based idle detection since bash commands don't use
        the Claude hook system.
        """
        start = time.time()
        waiter = AnimatedWaiter(tool_name="bash")

        # Hash-based idle detection state
        last_hash = ""
        last_hash_change_time = time.time()
        last_hash_check_time = 0.0
        hash_check_interval = 2.0  # Check more frequently for bash
        idle_timeout = 10.0  # Shorter timeout for bash commands

        with Live(console=console, refresh_per_second=10) as live:
            while True:
                elapsed = time.time() - start
                live.update(waiter.create_display(elapsed))

                # Hash-based idle detection
                current_time = time.time()
                if current_time - last_hash_check_time >= hash_check_interval:
                    last_hash_check_time = current_time
                    current_hash = tmux_manager.get_pane_content_hash()

                    if current_hash != last_hash:
                        # Content changed, reset timer
                        last_hash = current_hash
                        last_hash_change_time = current_time
                    elif current_time - last_hash_change_time >= idle_timeout:
                        # No change for idle_timeout seconds, consider done
                        break

                # Brief sleep before next iteration
                time.sleep(0.2)

        # Capture final output
        return tmux_manager.capture_pane_content()
