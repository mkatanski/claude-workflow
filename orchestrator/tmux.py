"""Tmux pane management for workflow orchestrator."""

import hashlib
import shlex
import subprocess
import time
from pathlib import Path
from typing import TYPE_CHECKING, Optional

# Maximum prompt length before raising an error
# macOS shell has ~262K limit, we use a conservative threshold
MAX_PROMPT_LENGTH = 100_000

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

    def _build_claude_command(
        self,
        prompt: Optional[str] = None,
        model_override: Optional[str] = None,
    ) -> str:
        """Build the Claude Code command with all options.

        Args:
            prompt: The prompt to send to Claude Code
            model_override: Step-level model override. Takes precedence over
                           workflow-level model configuration.
        """
        cwd = self.claude_config.cwd or str(self.project_path.resolve())

        # Start with ORCHESTRATOR_PORT env var for hooks
        # Use shlex.quote() to prevent command injection via cwd
        parts = [f"cd {shlex.quote(cwd)} && ORCHESTRATOR_PORT={self.server.port} claude"]

        # Add model if specified (step override takes precedence)
        model = model_override or self.claude_config.model
        if model:
            parts.append(f"--model {model}")

        # Add permission bypass if enabled
        if self.claude_config.dangerously_skip_permissions:
            parts.append("--dangerously-skip-permissions")

        # Add permission mode if specified
        if self.claude_config.permission_mode:
            parts.append(f"--permission-mode {self.claude_config.permission_mode}")

        # Add allowed tools if specified
        if self.claude_config.allowed_tools:
            tools = " ".join(self.claude_config.allowed_tools)
            parts.append(f'--allowed-tools "{tools}"')

        # Add prompt as positional argument (interactive mode with initial prompt)
        if prompt:
            escaped_prompt = prompt.replace("'", "'\\''")
            parts.append(f"'{escaped_prompt}'")

        return " ".join(parts)

    def launch_claude_pane(
        self,
        prompt: str,
        model_override: Optional[str] = None,
    ) -> str:
        """Launch Claude Code in a new tmux pane with the given prompt.

        The ORCHESTRATOR_PORT environment variable is set so that hooks
        can send completion signals to the correct server instance.

        Args:
            prompt: The prompt to send to Claude Code
            model_override: Step-level model override. Takes precedence over
                           workflow-level model configuration.

        Raises:
            RuntimeError: If prompt is too large for shell command line limits
                or if pane creation fails.
        """
        # Check if prompt is too large for shell command line
        if len(prompt) > MAX_PROMPT_LENGTH:
            console.print(
                f"[bold red]{ICONS['cross']} Prompt too large ({len(prompt):,} chars)[/bold red]"
            )
            console.print(
                f"[yellow]  ⚠ Maximum allowed: {MAX_PROMPT_LENGTH:,} chars[/yellow]"
            )
            console.print(
                "[dim]  Tip: Save large data to a file and tell Claude to read it[/dim]"
            )
            raise RuntimeError(
                f"Prompt too large ({len(prompt):,} chars). "
                f"Maximum: {MAX_PROMPT_LENGTH:,} chars. "
                "Save large data to a file and reference it in the prompt instead."
            )

        cmd = self._build_claude_command(prompt=prompt, model_override=model_override)

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

        # Check if pane creation failed
        if pane_id is None:
            console.print(
                f"[bold red]{ICONS['cross']} Failed to create Claude pane[/bold red]"
            )
            console.print("[dim]  Check if tmux is available and running[/dim]")
            raise RuntimeError(
                "Failed to create tmux pane. "
                "Check if tmux is available and running."
            )

        from rich.text import Text

        status_text = Text()
        status_text.append(f"{ICONS['check']} ", style="bold green")
        status_text.append("Claude started: ", style="white")
        status_text.append(str(pane_id), style="bold cyan")
        console.print(status_text)

        # Register pane with server for completion tracking
        self.server.register_pane(pane_id)
        self.current_pane = pane_id
        return pane_id

    def launch_bash_pane(self, command: str, cwd: Optional[str] = None) -> str:
        """Launch a bash command in a new tmux pane."""
        working_dir = cwd or self.claude_config.cwd or str(self.project_path.resolve())
        # Use shlex.quote() to prevent command injection via working_dir
        full_cmd = f"cd {shlex.quote(working_dir)} && {command}"

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
        status_text.append(str(pane_id), style="bold cyan")
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

    def send_keys(self, keys: str) -> None:
        """Send keystrokes to the current tmux pane.

        Used for auto-approving plan mode prompts.

        Args:
            keys: Keys to send (e.g., "y", "Enter")
        """
        if not self.current_pane:
            return
        try:
            subprocess.run(
                ["tmux", "send-keys", "-t", self.current_pane, keys],
                capture_output=True,
                timeout=5,
            )
        except (subprocess.TimeoutExpired, subprocess.SubprocessError):
            pass  # Ignore errors, non-critical operation

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
