"""Tmux pane management for workflow orchestrator."""

import hashlib
import json
import subprocess
import time
from pathlib import Path
from typing import Any, Dict, Optional

from claude_code_tools.tmux_cli_controller import TmuxCLIController

from .config import ClaudeConfig, TmuxConfig
from .display import ICONS, console

# Marker directory for completion detection
MARKER_DIR = Path("/tmp/claude-orchestrator")


def _check_hook_exists(
    settings: Dict[str, Any], hook_name: str, marker_extension: str
) -> bool:
    """Check if a specific hook with our marker command exists in settings."""
    hook_list = settings.get("hooks", {}).get(hook_name, [])

    return any(
        "/tmp/claude-orchestrator" in hook.get("command", "")
        and marker_extension in hook.get("command", "")
        for hook_group in hook_list
        for hook in hook_group.get("hooks", [])
        if hook.get("type") == "command"
    )


def check_hook_configuration(project_path: Optional[Path] = None) -> bool:
    """Check if both Stop and SessionEnd hooks are configured in Claude settings.

    Checks both global (~/.claude/settings.json) and project-level
    (<project>/.claude/settings.json) settings.

    Returns True only if BOTH hooks are properly configured.
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

            has_stop_hook = _check_hook_exists(settings, "Stop", ".done")
            has_session_end_hook = _check_hook_exists(settings, "SessionEnd", ".exited")

            if has_stop_hook and has_session_end_hook:
                return True
        except (json.JSONDecodeError, KeyError):
            continue

    return False


class TmuxManager:
    """Manages tmux panes for workflow execution."""

    def __init__(
        self,
        tmux_config: TmuxConfig,
        claude_config: ClaudeConfig,
        project_path: Path,
    ) -> None:
        self.tmux_config = tmux_config
        self.claude_config = claude_config
        self.project_path = project_path
        self.controller = TmuxCLIController()
        self.current_pane: Optional[str] = None
        self.hook_configured = check_hook_configuration(project_path)

        # Ensure marker directory exists and clean up old markers
        MARKER_DIR.mkdir(parents=True, exist_ok=True)
        self._cleanup_all_marker_files()

    def _get_marker_file(
        self, pane_id: Optional[str] = None, extension: str = ".done"
    ) -> Optional[Path]:
        """Get the marker file path for the given or current pane."""
        pane = pane_id or self.current_pane
        if not pane:
            return None
        return MARKER_DIR / f"{pane}{extension}"

    def _cleanup_marker_file(
        self, pane_id: Optional[str] = None, extension: str = ".done"
    ) -> None:
        """Remove a marker file if it exists."""
        marker_file = self._get_marker_file(pane_id, extension)
        if marker_file and marker_file.exists():
            try:
                marker_file.unlink()
            except OSError:
                pass

    def _cleanup_all_marker_files(self) -> None:
        """Remove all marker files in the marker directory (.done and .exited)."""
        try:
            for pattern in ["*.done", "*.exited"]:
                for marker_file in MARKER_DIR.glob(pattern):
                    try:
                        marker_file.unlink()
                    except OSError:
                        pass
        except OSError:
            pass

    def _wait_for_session_end_marker(self, pane_id: str, timeout: float = 30.0) -> bool:
        """Wait for the session end marker file to appear."""
        marker_file = self._get_marker_file(pane_id, ".exited")
        if not marker_file:
            return False

        start_time = time.time()
        while time.time() - start_time < timeout:
            if marker_file.exists():
                return True
            time.sleep(0.2)
        return False

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
        parts = [f"cd {cwd} && claude"]

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
        """Launch Claude Code in a new tmux pane with the given prompt."""
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
        2. Wait for SessionEnd hook marker (confirms session terminated)
        3. Kill the tmux pane and wait for closure
        """
        if not self.current_pane:
            return

        pane_to_close = self.current_pane
        self.current_pane = None

        self._cleanup_marker_file(pane_to_close, ".exited")

        try:
            self.controller.send_interrupt(pane_to_close)
            time.sleep(0.3)

            self._send_ctrl_d(pane_to_close)
            time.sleep(0.2)
            self._send_ctrl_d(pane_to_close)
            time.sleep(0.3)

            if self.hook_configured:
                self._wait_for_session_end_marker(pane_to_close, timeout=30.0)

            self._kill_pane_safely(pane_to_close)
        except Exception:
            self._kill_pane_safely(pane_to_close)

        if not self._wait_for_pane_close(pane_to_close, timeout=10.0):
            self._kill_pane_safely(pane_to_close)
            self._wait_for_pane_close(pane_to_close, timeout=5.0)

        self._cleanup_marker_file(pane_to_close, ".exited")

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

    def check_marker_exists(self) -> bool:
        """Check if the completion marker file exists."""
        if not self.hook_configured:
            return False
        marker_file = self._get_marker_file()
        return marker_file is not None and marker_file.exists()

    def cleanup_markers(self) -> None:
        """Clean up all marker files for current pane."""
        self._cleanup_marker_file()
        self._cleanup_marker_file(extension=".exited")

    def cleanup_all(self) -> None:
        """Clean up all marker files."""
        self._cleanup_all_marker_files()
