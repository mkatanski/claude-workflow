"""Bash tool implementation."""

import os
import subprocess
import time
from typing import TYPE_CHECKING, Any, Dict, Optional

from rich.live import Live
from rich.text import Text

from ..display import ICONS, AnimatedWaiter
from ..display_adapter import get_display
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

        Supports 'env' option to pass variables as environment variables,
        which safely handles shell-breaking characters in variable values.
        """
        command = context.interpolate(step["command"])
        # Always default to project_path for cwd
        cwd = context.interpolate_optional(step.get("cwd")) or str(context.project_path)
        visible = step.get("visible", False)
        strip_output = step.get("strip_output", True)

        # Build environment variables if specified
        env = self._build_env(step.get("env"), context)

        if visible:
            return self._execute_visible(command, cwd, tmux_manager, strip_output, env)
        else:
            return self._execute_subprocess(command, cwd, strip_output, env)

    def _build_env(
        self,
        env_config: Optional[Dict[str, str]],
        context: "ExecutionContext",
    ) -> Optional[Dict[str, str]]:
        """Build environment variables dict from step config.

        Args:
            env_config: Dict of env var names to values (may contain {var} placeholders)
            context: Execution context for interpolation

        Returns:
            Combined environment (system + custom) or None if no custom env specified
        """
        if env_config is None:
            return None

        # Start with copy of current environment
        env = os.environ.copy()

        # Add/override with custom variables (interpolated)
        for key, value in env_config.items():
            env[key] = context.interpolate(str(value))

        return env

    def _execute_subprocess(
        self,
        command: str,
        cwd: str | None,
        strip_output: bool,
        env: Optional[Dict[str, str]] = None,
    ) -> ToolResult:
        """Execute command in background subprocess.

        Args:
            command: Shell command to execute
            cwd: Working directory for command
            strip_output: Whether to strip whitespace from output
            env: Environment variables (None = inherit system env)
        """
        display = get_display()
        display.print_bash_running(command)

        try:
            process = subprocess.run(
                command,
                shell=True,
                cwd=cwd,
                capture_output=True,
                text=True,
                timeout=600,  # 10 minute timeout
                env=env,
            )

            output = process.stdout or ""
            if process.stderr:
                output += f"\n[STDERR]\n{process.stderr}"

            if strip_output:
                output = output.strip()

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
        strip_output: bool,
        env: Optional[Dict[str, str]] = None,
    ) -> ToolResult:
        """Execute command in visible tmux pane.

        Args:
            command: Shell command to execute
            cwd: Working directory for command
            tmux_manager: Tmux pane manager
            strip_output: Whether to strip whitespace from output
            env: Environment variables (currently not supported in visible mode)
        """
        # For visible mode with custom env vars, wrap the command with exports
        if env:
            # Build export statements for custom env vars
            exports = []
            for key, value in env.items():
                # Skip system env vars that are already set
                if key not in os.environ or os.environ[key] != value:
                    # Escape single quotes in value for shell safety
                    escaped_value = value.replace("'", "'\\''")
                    exports.append(f"export {key}='{escaped_value}'")
            if exports:
                command = " && ".join(exports) + " && " + command

        # Launch bash pane
        tmux_manager.launch_bash_pane(command, cwd)

        try:
            # Wait for completion using idle detection
            output = self._wait_for_completion(tmux_manager)

            if strip_output:
                output = output.strip()

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

        with Live(console=get_display().console, refresh_per_second=10) as live:
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
