"""Tmux pane management for workflow orchestrator."""

import hashlib
import subprocess
import time
from pathlib import Path
from typing import TYPE_CHECKING, Optional

from claude_code_tools.tmux_cli_controller import TmuxCLIController

from .config import ClaudeConfig, TmuxConfig
from .display import ICONS, console

if TYPE_CHECKING:
    from .server import ServerManager


class TmuxManager:
    """Manages tmux panes for workflow execution."""

    def __init__(
        self,
        tmux_config: TmuxConfig,
        claude_config: ClaudeConfig,
        project_path: Path,
        server: "ServerManager",
    ) -> None:
        self.tmux_config = tmux_config
        self.claude_config = claude_config
        self.project_path = project_path
        self.server = server
        self.controller = TmuxCLIController()
        self.current_pane: Optional[str] = None

    def _pane_exists(self, pane_id: str) -> bool:
        """Check if a tmux pane still exists."""
        try:
            result = subprocess.run(
                ["tmux", "list-panes", "-a", "-F", "#{pane_id}"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            return pane_id in result.stdout.split("\n")
        except (subprocess.TimeoutExpired, subprocess.SubprocessError):
            return False

    def _wait_for_pane_close(self, pane_id: str, timeout: float = 10.0) -> bool:
        """Wait for a pane to be closed."""
        start_time = time.time()
        while time.time() - start_time < timeout:
            if not self._pane_exists(pane_id):
                return True
            time.sleep(0.2)
        return False

    def _build_claude_command(self, prompt: Optional[str] = None) -> str:
        """Build the Claude Code command with all options."""
        cwd = self.claude_config.cwd or str(self.project_path.resolve())

        # Start with ORCHESTRATOR_PORT env var for hooks
        parts = [f"cd {cwd} && ORCHESTRATOR_PORT={self.server.port} claude"]

        # Add model if specified
        if self.claude_config.model:
            parts.append(f"--model {self.claude_config.model}")

        # Add permission bypass if enabled
        if self.claude_config.dangerously_skip_permissions:
            parts.append("--dangerously-skip-permissions")

        # Add allowed tools if specified
        if self.claude_config.allowed_tools:
            tools = " ".join(self.claude_config.allowed_tools)
            parts.append(f'--allowed-tools "{tools}"')

        # Add prompt as positional argument (interactive mode with initial prompt)
        if prompt:
            escaped_prompt = prompt.replace("'", "'\\''")
            parts.append(f"'{escaped_prompt}'")

        return " ".join(parts)

    def launch_claude_pane(self, prompt: str) -> str:
        """Launch Claude Code in a new tmux pane with the given prompt.

        The ORCHESTRATOR_PORT environment variable is set so that hooks
        can send completion signals to the correct server instance.
        """
        cmd = self._build_claude_command(prompt)

        with console.status(
            f"[cyan]{ICONS['lightning']} Launching Claude Code...[/cyan]",
            spinner="dots12",
        ):
            vertical = self.tmux_config.split == "vertical"
            pane_id = self.controller.create_pane(
                vertical=vertical,
                size=50,
                start_command=cmd,
            )
            # Brief pause for pane to initialize
            time.sleep(1)

        from rich.text import Text

        status_text = Text()
        status_text.append(f"{ICONS['check']} ", style="bold green")
        status_text.append("Claude started: ", style="white")
        status_text.append(pane_id, style="bold cyan")
        console.print(status_text)

        # Register pane with server for completion tracking
        self.server.register_pane(pane_id)
        self.current_pane = pane_id
        return pane_id

    def launch_bash_pane(self, command: str, cwd: Optional[str] = None) -> str:
        """Launch a bash command in a new tmux pane."""
        working_dir = cwd or self.claude_config.cwd or str(self.project_path.resolve())
        full_cmd = f"cd {working_dir} && {command}"

        with console.status(
            f"[cyan]{ICONS['terminal']} Running command...[/cyan]",
            spinner="dots12",
        ):
            vertical = self.tmux_config.split == "vertical"
            pane_id = self.controller.create_pane(
                vertical=vertical,
                size=50,
                start_command=full_cmd,
            )
            time.sleep(0.5)

        from rich.text import Text

        status_text = Text()
        status_text.append(f"{ICONS['check']} ", style="bold green")
        status_text.append("Command started: ", style="white")
        status_text.append(pane_id, style="bold cyan")
        console.print(status_text)

        self.current_pane = pane_id
        return pane_id

    def _send_ctrl_d(self, pane_id: str) -> None:
        """Send Ctrl+D (EOT) to a tmux pane."""
        subprocess.run(
            ["tmux", "send-keys", "-t", pane_id, "C-d"],
            capture_output=True,
            timeout=5,
        )

    def _kill_pane_safely(self, pane_id: str) -> None:
        """Attempt to kill a tmux pane, ignoring errors if already closed."""
        try:
            self.controller.kill_pane(pane_id)
        except Exception:
            pass

    def close_pane(self) -> None:
        """Close the current pane and wait for it to be fully closed.

        Flow:
        1. Send Ctrl+C to interrupt, then Ctrl+D twice to force exit
        2. Wait for SessionEnd signal via server (or timeout)
        3. Kill the tmux pane and wait for closure
        """
        if not self.current_pane:
            return

        pane_to_close = self.current_pane
        self.current_pane = None

        try:
            self.controller.send_interrupt(pane_to_close)
            time.sleep(0.3)

            self._send_ctrl_d(pane_to_close)
            time.sleep(0.2)
            self._send_ctrl_d(pane_to_close)
            time.sleep(0.3)

            # Wait for session end signal from server (with timeout)
            self.server.wait_for_exited(pane_to_close, timeout=30.0)

            self._kill_pane_safely(pane_to_close)
        except Exception:
            self._kill_pane_safely(pane_to_close)

        if not self._wait_for_pane_close(pane_to_close, timeout=10.0):
            self._kill_pane_safely(pane_to_close)
            self._wait_for_pane_close(pane_to_close, timeout=5.0)

        # Unregister pane from server
        self.server.unregister_pane(pane_to_close)

    def get_pane_content_hash(self) -> str:
        """Get hash of current pane content."""
        if not self.current_pane:
            return ""
        try:
            content = self.controller.capture_pane(self.current_pane)
            return hashlib.md5(content.encode()).hexdigest()
        except Exception:
            return ""

    def capture_pane_content(self) -> str:
        """Capture the current content of the pane."""
        if not self.current_pane:
            return ""
        try:
            return self.controller.capture_pane(self.current_pane)
        except Exception:
            return ""
