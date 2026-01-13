"""Comprehensive unit tests for TmuxManager class.

This module tests the TmuxManager which handles tmux pane management
for workflow execution, including launching Claude Code and bash panes,
pane lifecycle management, and content capturing.
"""

import hashlib
import subprocess
from pathlib import Path
from typing import Generator
from unittest.mock import MagicMock, patch, call

import pytest

from orchestrator.config import ClaudeConfig, TmuxConfig
from orchestrator.tmux import TmuxManager


class TestTmuxManagerInit:
    """Tests for TmuxManager initialization."""

    def test_init_stores_configs_correctly(
        self,
        tmux_manager: TmuxManager,
        tmux_config: TmuxConfig,
        claude_config: ClaudeConfig,
    ) -> None:
        """Test that TmuxManager correctly stores all initialization parameters."""
        assert tmux_manager.tmux_config == tmux_config
        assert tmux_manager.claude_config == claude_config
        assert tmux_manager.project_path == Path("/test/project")
        assert tmux_manager.current_pane is None

    def test_init_creates_controller(self, tmux_manager: TmuxManager) -> None:
        """Test that TmuxManager creates a TmuxCLIController instance."""
        assert tmux_manager.controller is not None


class TestBuildClaudeCommand:
    """Tests for _build_claude_command method."""

    def test_build_claude_command_basic_command_structure(
        self, tmux_manager: TmuxManager
    ) -> None:
        """Test basic claude command without any optional parameters."""
        cmd = tmux_manager._build_claude_command()

        # shlex.quote only adds quotes when necessary (path has no special chars)
        assert "cd /test/project" in cmd
        assert "ORCHESTRATOR_PORT=" in cmd
        assert "claude" in cmd

    def test_build_claude_command_with_prompt(
        self, tmux_manager: TmuxManager
    ) -> None:
        """Test command building with a prompt argument."""
        cmd = tmux_manager._build_claude_command(prompt="Test prompt")

        assert "'Test prompt'" in cmd

    def test_build_claude_command_with_prompt_containing_single_quotes(
        self, tmux_manager: TmuxManager
    ) -> None:
        """Test command building properly escapes single quotes in prompt."""
        cmd = tmux_manager._build_claude_command(prompt="It's a test")

        assert "'It'\\''s a test'" in cmd

    def test_build_claude_command_with_model(
        self, mock_server: MagicMock
    ) -> None:
        """Test command building includes model flag when specified."""
        claude_config = ClaudeConfig(model="claude-3-opus")
        tmux_config = TmuxConfig()
        manager = TmuxManager(
            tmux_config=tmux_config,
            claude_config=claude_config,
            project_path=Path("/test/project"),
            server=mock_server,
        )

        cmd = manager._build_claude_command()

        assert "--model claude-3-opus" in cmd

    def test_build_claude_command_with_skip_permissions(
        self, mock_server: MagicMock
    ) -> None:
        """Test command building includes skip permissions flag when enabled."""
        claude_config = ClaudeConfig(dangerously_skip_permissions=True)
        tmux_config = TmuxConfig()
        manager = TmuxManager(
            tmux_config=tmux_config,
            claude_config=claude_config,
            project_path=Path("/test/project"),
            server=mock_server,
        )

        cmd = manager._build_claude_command()

        assert "--dangerously-skip-permissions" in cmd

    def test_build_claude_command_without_skip_permissions(
        self, tmux_manager: TmuxManager
    ) -> None:
        """Test command building excludes skip permissions flag when disabled."""
        cmd = tmux_manager._build_claude_command()

        assert "--dangerously-skip-permissions" not in cmd

    def test_build_claude_command_with_allowed_tools(
        self, mock_server: MagicMock
    ) -> None:
        """Test command building includes allowed tools when specified."""
        claude_config = ClaudeConfig(allowed_tools=["Read", "Write", "Bash"])
        tmux_config = TmuxConfig()
        manager = TmuxManager(
            tmux_config=tmux_config,
            claude_config=claude_config,
            project_path=Path("/test/project"),
            server=mock_server,
        )

        cmd = manager._build_claude_command()

        assert '--allowed-tools "Read Write Bash"' in cmd

    def test_build_claude_command_with_custom_cwd(
        self, mock_server: MagicMock
    ) -> None:
        """Test command building uses custom cwd when specified."""
        claude_config = ClaudeConfig(cwd="/custom/working/dir")
        tmux_config = TmuxConfig()
        manager = TmuxManager(
            tmux_config=tmux_config,
            claude_config=claude_config,
            project_path=Path("/test/project"),
            server=mock_server,
        )

        cmd = manager._build_claude_command()

        # shlex.quote only adds quotes when necessary
        assert "cd /custom/working/dir" in cmd

    def test_build_claude_command_uses_project_path_when_no_cwd(
        self, tmux_manager: TmuxManager
    ) -> None:
        """Test command building uses project path when cwd not specified."""
        cmd = tmux_manager._build_claude_command()

        # shlex.quote only adds quotes when necessary
        assert "cd /test/project" in cmd

    def test_build_claude_command_with_all_options(
        self, mock_server: MagicMock
    ) -> None:
        """Test command building with all optional parameters enabled."""
        claude_config = ClaudeConfig(
            cwd="/custom/cwd",
            model="claude-3-sonnet",
            dangerously_skip_permissions=True,
            allowed_tools=["Read", "Bash"],
        )
        tmux_config = TmuxConfig()
        manager = TmuxManager(
            tmux_config=tmux_config,
            claude_config=claude_config,
            project_path=Path("/test/project"),
            server=mock_server,
        )

        cmd = manager._build_claude_command(prompt="Do something")

        # shlex.quote only adds quotes when necessary
        assert "cd /custom/cwd" in cmd
        assert "--model claude-3-sonnet" in cmd
        assert "--dangerously-skip-permissions" in cmd
        assert '--allowed-tools "Read Bash"' in cmd
        assert "'Do something'" in cmd

    def test_build_claude_command_escapes_cwd_path_with_spaces(
        self, mock_server: MagicMock
    ) -> None:
        """Test command building properly quotes cwd paths with spaces."""
        claude_config = ClaudeConfig(cwd="/path/with spaces/in it")
        tmux_config = TmuxConfig()
        manager = TmuxManager(
            tmux_config=tmux_config,
            claude_config=claude_config,
            project_path=Path("/test/project"),
            server=mock_server,
        )

        cmd = manager._build_claude_command()

        assert "cd '/path/with spaces/in it'" in cmd


class TestPaneExists:
    """Tests for _pane_exists method."""

    def test_pane_exists_returns_true_when_pane_found(
        self, tmux_manager: TmuxManager
    ) -> None:
        """Test _pane_exists returns True when pane ID is in tmux output."""
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(
                stdout="%0\n%1\n%2\n", returncode=0
            )

            result = tmux_manager._pane_exists("%1")

            assert result is True
            mock_run.assert_called_once_with(
                ["tmux", "list-panes", "-a", "-F", "#{pane_id}"],
                capture_output=True,
                text=True,
                timeout=5,
            )

    def test_pane_exists_returns_false_when_pane_not_found(
        self, tmux_manager: TmuxManager
    ) -> None:
        """Test _pane_exists returns False when pane ID is not in tmux output."""
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(
                stdout="%0\n%2\n%3\n", returncode=0
            )

            result = tmux_manager._pane_exists("%1")

            assert result is False

    def test_pane_exists_returns_false_on_timeout(
        self, tmux_manager: TmuxManager
    ) -> None:
        """Test _pane_exists returns False when subprocess times out."""
        with patch("subprocess.run") as mock_run:
            mock_run.side_effect = subprocess.TimeoutExpired(cmd="tmux", timeout=5)

            result = tmux_manager._pane_exists("%1")

            assert result is False

    def test_pane_exists_returns_false_on_subprocess_error(
        self, tmux_manager: TmuxManager
    ) -> None:
        """Test _pane_exists returns False on subprocess errors."""
        with patch("subprocess.run") as mock_run:
            mock_run.side_effect = subprocess.SubprocessError("tmux not found")

            result = tmux_manager._pane_exists("%1")

            assert result is False

    def test_pane_exists_returns_false_on_empty_output(
        self, tmux_manager: TmuxManager
    ) -> None:
        """Test _pane_exists returns False when tmux returns empty output."""
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(stdout="", returncode=0)

            result = tmux_manager._pane_exists("%1")

            assert result is False


class TestWaitForPaneClose:
    """Tests for _wait_for_pane_close method."""

    def test_wait_for_pane_close_returns_true_when_pane_closes(
        self, tmux_manager: TmuxManager
    ) -> None:
        """Test _wait_for_pane_close returns True when pane is no longer found."""
        with patch.object(tmux_manager, "_pane_exists") as mock_exists:
            # Pane exists initially, then doesn't
            mock_exists.side_effect = [True, True, False]

            result = tmux_manager._wait_for_pane_close("%1", timeout=5.0)

            assert result is True
            assert mock_exists.call_count == 3

    def test_wait_for_pane_close_returns_false_on_timeout(
        self, tmux_manager: TmuxManager
    ) -> None:
        """Test _wait_for_pane_close returns False when timeout is reached."""
        with patch.object(tmux_manager, "_pane_exists") as mock_exists:
            with patch("time.time") as mock_time:
                with patch("time.sleep"):
                    # Simulate time passing beyond timeout
                    mock_time.side_effect = [0, 0.1, 0.2, 0.3, 11.0]
                    mock_exists.return_value = True

                    result = tmux_manager._wait_for_pane_close("%1", timeout=10.0)

                    assert result is False

    def test_wait_for_pane_close_returns_true_immediately_if_pane_gone(
        self, tmux_manager: TmuxManager
    ) -> None:
        """Test _wait_for_pane_close returns True immediately if pane doesn't exist."""
        with patch.object(tmux_manager, "_pane_exists") as mock_exists:
            mock_exists.return_value = False

            result = tmux_manager._wait_for_pane_close("%1", timeout=10.0)

            assert result is True
            mock_exists.assert_called_once_with("%1")


class TestLaunchClaudePane:
    """Tests for launch_claude_pane method."""

    @patch("time.sleep")
    @patch("orchestrator.tmux.console")
    def test_launch_claude_pane_creates_pane_and_returns_id(
        self,
        mock_console: MagicMock,
        mock_sleep: MagicMock,
        tmux_manager: TmuxManager,
    ) -> None:
        """Test launch_claude_pane creates a pane and returns its ID."""
        tmux_manager.controller.create_pane = MagicMock(return_value="%5")

        result = tmux_manager.launch_claude_pane("Test prompt")

        assert result == "%5"
        assert tmux_manager.current_pane == "%5"
        tmux_manager.server.register_pane.assert_called_once_with("%5")

    @patch("time.sleep")
    @patch("orchestrator.tmux.console")
    def test_launch_claude_pane_uses_vertical_split_by_default(
        self,
        mock_console: MagicMock,
        mock_sleep: MagicMock,
        tmux_manager: TmuxManager,
    ) -> None:
        """Test launch_claude_pane uses vertical split with default config."""
        tmux_manager.controller.create_pane = MagicMock(return_value="%5")

        tmux_manager.launch_claude_pane("Test prompt")

        tmux_manager.controller.create_pane.assert_called_once()
        call_kwargs = tmux_manager.controller.create_pane.call_args[1]
        assert call_kwargs["vertical"] is True
        assert call_kwargs["size"] == 50

    @patch("time.sleep")
    @patch("orchestrator.tmux.console")
    def test_launch_claude_pane_uses_horizontal_split_when_configured(
        self,
        mock_console: MagicMock,
        mock_sleep: MagicMock,
        mock_server: MagicMock,
    ) -> None:
        """Test launch_claude_pane uses horizontal split when configured."""
        tmux_config = TmuxConfig(split="horizontal")
        claude_config = ClaudeConfig()
        manager = TmuxManager(
            tmux_config=tmux_config,
            claude_config=claude_config,
            project_path=Path("/test/project"),
            server=mock_server,
        )
        manager.controller.create_pane = MagicMock(return_value="%5")

        manager.launch_claude_pane("Test prompt")

        call_kwargs = manager.controller.create_pane.call_args[1]
        assert call_kwargs["vertical"] is False

    @patch("time.sleep")
    @patch("orchestrator.tmux.console")
    def test_launch_claude_pane_passes_command_to_controller(
        self,
        mock_console: MagicMock,
        mock_sleep: MagicMock,
        tmux_manager: TmuxManager,
    ) -> None:
        """Test launch_claude_pane passes built command to controller."""
        tmux_manager.controller.create_pane = MagicMock(return_value="%5")

        tmux_manager.launch_claude_pane("Test prompt")

        call_kwargs = tmux_manager.controller.create_pane.call_args[1]
        assert "start_command" in call_kwargs
        assert "claude" in call_kwargs["start_command"]
        assert "'Test prompt'" in call_kwargs["start_command"]

    @patch("time.sleep")
    @patch("orchestrator.tmux.console")
    def test_launch_claude_pane_handles_non_string_pane_id(
        self,
        mock_console: MagicMock,
        mock_sleep: MagicMock,
        tmux_manager: TmuxManager,
    ) -> None:
        """Test launch_claude_pane converts non-string pane_id to string.

        This prevents 'Only str or Text can be appended to Text' error
        when the pane_id is not a string.
        """
        # Mock controller to return an integer (unusual but possible)
        tmux_manager.controller.create_pane = MagicMock(return_value=12345)

        # This should not raise an error
        pane_id = tmux_manager.launch_claude_pane("Test prompt")

        # pane_id should be converted to string for internal use
        assert tmux_manager.current_pane == 12345  # Internal storage keeps original

    @patch("time.sleep")
    @patch("orchestrator.tmux.console")
    def test_launch_claude_pane_raises_on_none_pane_id(
        self,
        mock_console: MagicMock,
        mock_sleep: MagicMock,
        tmux_manager: TmuxManager,
    ) -> None:
        """Test launch_claude_pane raises RuntimeError when pane_id is None."""
        tmux_manager.controller.create_pane = MagicMock(return_value=None)

        with pytest.raises(RuntimeError) as exc_info:
            tmux_manager.launch_claude_pane("Test prompt")

        assert "Failed to create tmux pane" in str(exc_info.value)

    @patch("time.sleep")
    @patch("orchestrator.tmux.console")
    def test_launch_claude_pane_raises_on_large_prompt(
        self,
        mock_console: MagicMock,
        mock_sleep: MagicMock,
        tmux_manager: TmuxManager,
    ) -> None:
        """Test large prompts raise RuntimeError with helpful message."""
        from orchestrator.tmux import MAX_PROMPT_LENGTH

        # Create a prompt larger than the threshold
        large_prompt = "x" * (MAX_PROMPT_LENGTH + 1000)

        with pytest.raises(RuntimeError) as exc_info:
            tmux_manager.launch_claude_pane(large_prompt)

        assert "Prompt too large" in str(exc_info.value)
        assert "100,000" in str(exc_info.value)  # Formatted number in message


class TestLaunchBashPane:
    """Tests for launch_bash_pane method."""

    @patch("time.sleep")
    @patch("orchestrator.tmux.console")
    def test_launch_bash_pane_creates_pane_with_command(
        self,
        mock_console: MagicMock,
        mock_sleep: MagicMock,
        tmux_manager: TmuxManager,
    ) -> None:
        """Test launch_bash_pane creates a pane with the specified command."""
        tmux_manager.controller.create_pane = MagicMock(return_value="%7")

        result = tmux_manager.launch_bash_pane("echo hello")

        assert result == "%7"
        assert tmux_manager.current_pane == "%7"

    @patch("time.sleep")
    @patch("orchestrator.tmux.console")
    def test_launch_bash_pane_uses_default_cwd(
        self,
        mock_console: MagicMock,
        mock_sleep: MagicMock,
        tmux_manager: TmuxManager,
    ) -> None:
        """Test launch_bash_pane uses project path when no cwd specified."""
        tmux_manager.controller.create_pane = MagicMock(return_value="%7")

        tmux_manager.launch_bash_pane("ls -la")

        call_kwargs = tmux_manager.controller.create_pane.call_args[1]
        # shlex.quote only adds quotes when necessary
        assert "cd /test/project" in call_kwargs["start_command"]
        assert "ls -la" in call_kwargs["start_command"]

    @patch("time.sleep")
    @patch("orchestrator.tmux.console")
    def test_launch_bash_pane_uses_provided_cwd(
        self,
        mock_console: MagicMock,
        mock_sleep: MagicMock,
        tmux_manager: TmuxManager,
    ) -> None:
        """Test launch_bash_pane uses provided cwd parameter."""
        tmux_manager.controller.create_pane = MagicMock(return_value="%7")

        tmux_manager.launch_bash_pane("ls -la", cwd="/custom/dir")

        call_kwargs = tmux_manager.controller.create_pane.call_args[1]
        # shlex.quote only adds quotes when necessary
        assert "cd /custom/dir" in call_kwargs["start_command"]

    @patch("time.sleep")
    @patch("orchestrator.tmux.console")
    def test_launch_bash_pane_uses_claude_config_cwd(
        self,
        mock_console: MagicMock,
        mock_sleep: MagicMock,
        mock_server: MagicMock,
    ) -> None:
        """Test launch_bash_pane uses claude config cwd when no explicit cwd."""
        claude_config = ClaudeConfig(cwd="/config/cwd")
        tmux_config = TmuxConfig()
        manager = TmuxManager(
            tmux_config=tmux_config,
            claude_config=claude_config,
            project_path=Path("/test/project"),
            server=mock_server,
        )
        manager.controller.create_pane = MagicMock(return_value="%7")

        manager.launch_bash_pane("pwd")

        call_kwargs = manager.controller.create_pane.call_args[1]
        # shlex.quote only adds quotes when necessary
        assert "cd /config/cwd" in call_kwargs["start_command"]

    @patch("time.sleep")
    @patch("orchestrator.tmux.console")
    def test_launch_bash_pane_escapes_cwd_with_spaces(
        self,
        mock_console: MagicMock,
        mock_sleep: MagicMock,
        tmux_manager: TmuxManager,
    ) -> None:
        """Test launch_bash_pane properly quotes cwd with spaces."""
        tmux_manager.controller.create_pane = MagicMock(return_value="%7")

        tmux_manager.launch_bash_pane("ls", cwd="/path/with spaces")

        call_kwargs = tmux_manager.controller.create_pane.call_args[1]
        assert "cd '/path/with spaces'" in call_kwargs["start_command"]

    @patch("time.sleep")
    @patch("orchestrator.tmux.console")
    def test_launch_bash_pane_does_not_register_with_server(
        self,
        mock_console: MagicMock,
        mock_sleep: MagicMock,
        tmux_manager: TmuxManager,
    ) -> None:
        """Test launch_bash_pane does not register pane with server."""
        tmux_manager.controller.create_pane = MagicMock(return_value="%7")

        tmux_manager.launch_bash_pane("echo test")

        # Unlike launch_claude_pane, bash pane should not be registered
        tmux_manager.server.register_pane.assert_not_called()


class TestClosePane:
    """Tests for close_pane method."""

    @patch("time.sleep")
    def test_close_pane_does_nothing_when_no_current_pane(
        self,
        mock_sleep: MagicMock,
        tmux_manager: TmuxManager,
    ) -> None:
        """Test close_pane returns early when current_pane is None."""
        tmux_manager.current_pane = None

        tmux_manager.close_pane()

        tmux_manager.controller.send_interrupt.assert_not_called()

    @patch("time.sleep")
    @patch("subprocess.run")
    def test_close_pane_sends_interrupt_and_ctrl_d(
        self,
        mock_subprocess_run: MagicMock,
        mock_sleep: MagicMock,
        tmux_manager: TmuxManager,
    ) -> None:
        """Test close_pane sends interrupt and Ctrl+D to close gracefully."""
        tmux_manager.current_pane = "%5"
        tmux_manager._wait_for_pane_close = MagicMock(return_value=True)

        tmux_manager.close_pane()

        tmux_manager.controller.send_interrupt.assert_called_once_with("%5")
        # Verify Ctrl+D was sent twice
        assert mock_subprocess_run.call_count == 2

    @patch("time.sleep")
    @patch("subprocess.run")
    def test_close_pane_waits_for_server_exited_signal(
        self,
        mock_subprocess_run: MagicMock,
        mock_sleep: MagicMock,
        tmux_manager: TmuxManager,
    ) -> None:
        """Test close_pane waits for server exited signal."""
        tmux_manager.current_pane = "%5"
        tmux_manager._wait_for_pane_close = MagicMock(return_value=True)

        tmux_manager.close_pane()

        tmux_manager.server.wait_for_exited.assert_called_once_with("%5", timeout=30.0)

    @patch("time.sleep")
    @patch("subprocess.run")
    def test_close_pane_kills_pane_after_graceful_close(
        self,
        mock_subprocess_run: MagicMock,
        mock_sleep: MagicMock,
        tmux_manager: TmuxManager,
    ) -> None:
        """Test close_pane kills pane after graceful close sequence."""
        tmux_manager.current_pane = "%5"
        tmux_manager._wait_for_pane_close = MagicMock(return_value=True)

        tmux_manager.close_pane()

        tmux_manager.controller.kill_pane.assert_called_with("%5")

    @patch("time.sleep")
    @patch("subprocess.run")
    def test_close_pane_clears_current_pane(
        self,
        mock_subprocess_run: MagicMock,
        mock_sleep: MagicMock,
        tmux_manager: TmuxManager,
    ) -> None:
        """Test close_pane sets current_pane to None."""
        tmux_manager.current_pane = "%5"
        tmux_manager._wait_for_pane_close = MagicMock(return_value=True)

        tmux_manager.close_pane()

        assert tmux_manager.current_pane is None

    @patch("time.sleep")
    @patch("subprocess.run")
    def test_close_pane_unregisters_from_server(
        self,
        mock_subprocess_run: MagicMock,
        mock_sleep: MagicMock,
        tmux_manager: TmuxManager,
    ) -> None:
        """Test close_pane unregisters pane from server."""
        tmux_manager.current_pane = "%5"
        tmux_manager._wait_for_pane_close = MagicMock(return_value=True)

        tmux_manager.close_pane()

        tmux_manager.server.unregister_pane.assert_called_once_with("%5")

    @patch("time.sleep")
    @patch("subprocess.run")
    def test_close_pane_force_kills_on_timeout(
        self,
        mock_subprocess_run: MagicMock,
        mock_sleep: MagicMock,
        tmux_manager: TmuxManager,
    ) -> None:
        """Test close_pane force kills if pane doesn't close within timeout."""
        tmux_manager.current_pane = "%5"
        # First wait returns False (timeout), second returns True
        tmux_manager._wait_for_pane_close = MagicMock(side_effect=[False, True])

        tmux_manager.close_pane()

        # Should have called kill_pane twice (once normally, once after timeout)
        assert tmux_manager.controller.kill_pane.call_count >= 2

    @patch("time.sleep")
    @patch("subprocess.run")
    def test_close_pane_handles_exception_gracefully(
        self,
        mock_subprocess_run: MagicMock,
        mock_sleep: MagicMock,
        tmux_manager: TmuxManager,
    ) -> None:
        """Test close_pane handles exceptions and still tries to kill pane."""
        tmux_manager.current_pane = "%5"
        tmux_manager.controller.send_interrupt = MagicMock(
            side_effect=Exception("tmux error")
        )
        tmux_manager._wait_for_pane_close = MagicMock(return_value=True)

        # Should not raise
        tmux_manager.close_pane()

        # Should still try to kill pane
        tmux_manager.controller.kill_pane.assert_called()


class TestSendCtrlD:
    """Tests for _send_ctrl_d method."""

    def test_send_ctrl_d_sends_correct_command(
        self, tmux_manager: TmuxManager
    ) -> None:
        """Test _send_ctrl_d sends C-d key to tmux."""
        with patch("subprocess.run") as mock_run:
            tmux_manager._send_ctrl_d("%5")

            mock_run.assert_called_once_with(
                ["tmux", "send-keys", "-t", "%5", "C-d"],
                capture_output=True,
                timeout=5,
            )


class TestKillPaneSafely:
    """Tests for _kill_pane_safely method."""

    def test_kill_pane_safely_calls_controller(
        self, tmux_manager: TmuxManager
    ) -> None:
        """Test _kill_pane_safely calls controller kill_pane."""
        tmux_manager._kill_pane_safely("%5")

        tmux_manager.controller.kill_pane.assert_called_once_with("%5")

    def test_kill_pane_safely_ignores_exceptions(
        self, tmux_manager: TmuxManager
    ) -> None:
        """Test _kill_pane_safely swallows exceptions."""
        tmux_manager.controller.kill_pane = MagicMock(
            side_effect=Exception("pane not found")
        )

        # Should not raise
        tmux_manager._kill_pane_safely("%5")


class TestGetPaneContentHash:
    """Tests for get_pane_content_hash method."""

    def test_get_pane_content_hash_returns_empty_when_no_pane(
        self, tmux_manager: TmuxManager
    ) -> None:
        """Test get_pane_content_hash returns empty string when no current pane."""
        tmux_manager.current_pane = None

        result = tmux_manager.get_pane_content_hash()

        assert result == ""

    def test_get_pane_content_hash_returns_md5_hash(
        self, tmux_manager: TmuxManager
    ) -> None:
        """Test get_pane_content_hash returns MD5 hash of pane content."""
        tmux_manager.current_pane = "%5"
        tmux_manager.controller.capture_pane = MagicMock(return_value="test content")

        result = tmux_manager.get_pane_content_hash()

        expected_hash = hashlib.md5("test content".encode()).hexdigest()
        assert result == expected_hash
        tmux_manager.controller.capture_pane.assert_called_once_with("%5")

    def test_get_pane_content_hash_returns_empty_on_exception(
        self, tmux_manager: TmuxManager
    ) -> None:
        """Test get_pane_content_hash returns empty string on exception."""
        tmux_manager.current_pane = "%5"
        tmux_manager.controller.capture_pane = MagicMock(
            side_effect=Exception("capture failed")
        )

        result = tmux_manager.get_pane_content_hash()

        assert result == ""

    def test_get_pane_content_hash_handles_empty_content(
        self, tmux_manager: TmuxManager
    ) -> None:
        """Test get_pane_content_hash handles empty pane content."""
        tmux_manager.current_pane = "%5"
        tmux_manager.controller.capture_pane = MagicMock(return_value="")

        result = tmux_manager.get_pane_content_hash()

        expected_hash = hashlib.md5("".encode()).hexdigest()
        assert result == expected_hash


class TestCapturePaneContent:
    """Tests for capture_pane_content method."""

    def test_capture_pane_content_returns_empty_when_no_pane(
        self, tmux_manager: TmuxManager
    ) -> None:
        """Test capture_pane_content returns empty string when no current pane."""
        tmux_manager.current_pane = None

        result = tmux_manager.capture_pane_content()

        assert result == ""

    def test_capture_pane_content_returns_pane_content(
        self, tmux_manager: TmuxManager
    ) -> None:
        """Test capture_pane_content returns content from controller."""
        tmux_manager.current_pane = "%5"
        tmux_manager.controller.capture_pane = MagicMock(
            return_value="pane content here"
        )

        result = tmux_manager.capture_pane_content()

        assert result == "pane content here"
        tmux_manager.controller.capture_pane.assert_called_once_with("%5")

    def test_capture_pane_content_returns_empty_on_exception(
        self, tmux_manager: TmuxManager
    ) -> None:
        """Test capture_pane_content returns empty string on exception."""
        tmux_manager.current_pane = "%5"
        tmux_manager.controller.capture_pane = MagicMock(
            side_effect=Exception("capture failed")
        )

        result = tmux_manager.capture_pane_content()

        assert result == ""

    def test_capture_pane_content_preserves_multiline_content(
        self, tmux_manager: TmuxManager
    ) -> None:
        """Test capture_pane_content preserves multiline content."""
        tmux_manager.current_pane = "%5"
        multiline_content = "line 1\nline 2\nline 3"
        tmux_manager.controller.capture_pane = MagicMock(return_value=multiline_content)

        result = tmux_manager.capture_pane_content()

        assert result == multiline_content


class TestIntegration:
    """Integration-style tests for TmuxManager workflows."""

    @patch("time.sleep")
    @patch("subprocess.run")
    @patch("orchestrator.tmux.console")
    def test_launch_and_close_workflow(
        self,
        mock_console: MagicMock,
        mock_subprocess_run: MagicMock,
        mock_sleep: MagicMock,
        tmux_manager: TmuxManager,
    ) -> None:
        """Test complete workflow of launching and closing a pane."""
        tmux_manager.controller.create_pane = MagicMock(return_value="%10")
        tmux_manager._wait_for_pane_close = MagicMock(return_value=True)

        # Launch pane
        pane_id = tmux_manager.launch_claude_pane("Do something")
        assert pane_id == "%10"
        assert tmux_manager.current_pane == "%10"

        # Close pane
        tmux_manager.close_pane()
        assert tmux_manager.current_pane is None
        tmux_manager.server.unregister_pane.assert_called_with("%10")

    @patch("time.sleep")
    @patch("subprocess.run")
    @patch("orchestrator.tmux.console")
    def test_multiple_pane_launches(
        self,
        mock_console: MagicMock,
        mock_subprocess_run: MagicMock,
        mock_sleep: MagicMock,
        tmux_manager: TmuxManager,
    ) -> None:
        """Test launching multiple panes updates current_pane correctly."""
        tmux_manager.controller.create_pane = MagicMock(
            side_effect=["%10", "%11", "%12"]
        )
        tmux_manager._wait_for_pane_close = MagicMock(return_value=True)

        # Launch first pane
        pane1 = tmux_manager.launch_claude_pane("Task 1")
        assert tmux_manager.current_pane == "%10"

        # Close first pane
        tmux_manager.close_pane()

        # Launch second pane
        pane2 = tmux_manager.launch_bash_pane("ls")
        assert tmux_manager.current_pane == "%11"

        # Close second pane
        tmux_manager.close_pane()

        # Launch third pane
        pane3 = tmux_manager.launch_claude_pane("Task 2")
        assert tmux_manager.current_pane == "%12"


# Fixtures

@pytest.fixture
def mock_server() -> MagicMock:
    """Create a mock ServerManager instance."""
    server = MagicMock()
    server.port = 7432
    return server


@pytest.fixture
def tmux_config() -> TmuxConfig:
    """Create a default TmuxConfig for testing."""
    return TmuxConfig(
        new_window=False,
        split="vertical",
        idle_time=3.0,
    )


@pytest.fixture
def claude_config() -> ClaudeConfig:
    """Create a default ClaudeConfig for testing."""
    return ClaudeConfig(
        interactive=True,
        cwd=None,
        model=None,
        dangerously_skip_permissions=False,
        allowed_tools=None,
    )


@pytest.fixture
def tmux_manager(
    tmux_config: TmuxConfig,
    claude_config: ClaudeConfig,
    mock_server: MagicMock,
) -> Generator[TmuxManager, None, None]:
    """Create a TmuxManager instance with mocked controller."""
    manager = TmuxManager(
        tmux_config=tmux_config,
        claude_config=claude_config,
        project_path=Path("/test/project"),
        server=mock_server,
    )
    # Mock the controller methods
    manager.controller = MagicMock()
    yield manager
