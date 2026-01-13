"""Unit tests for the bash tool.

Tests shell command execution with focus on:
- Environment variable support for safe variable passing
- Shell escaping and special character handling
- Variable interpolation edge cases
"""

import subprocess
from pathlib import Path
from typing import Any, Dict, Optional
from unittest.mock import MagicMock, patch

import pytest

from orchestrator.context import ExecutionContext
from orchestrator.tools.bash import BashTool


class MockSubprocessWithEnv:
    """Mock subprocess that captures environment variables."""

    def __init__(self) -> None:
        self.calls: list[Dict[str, Any]] = []
        self.responses: Dict[str, str] = {}
        self.default_output = "mock_output"

    def set_response(self, pattern: str, output: str) -> None:
        """Set output for commands matching pattern."""
        self.responses[pattern] = output

    def __call__(
        self,
        cmd: str,
        shell: bool = False,
        cwd: Optional[str] = None,
        capture_output: bool = False,
        text: bool = False,
        timeout: Optional[int] = None,
        env: Optional[Dict[str, str]] = None,
    ) -> subprocess.CompletedProcess[str]:
        """Mock subprocess.run call."""
        self.calls.append({"command": cmd, "cwd": cwd, "env": env})

        # Find matching response
        output = self.default_output
        for pattern, resp in self.responses.items():
            if pattern in cmd:
                output = resp
                break

        return subprocess.CompletedProcess(
            args=cmd, returncode=0, stdout=output, stderr=""
        )

    def get_last_env(self) -> Optional[Dict[str, str]]:
        """Get environment variables from last call."""
        if self.calls:
            return self.calls[-1].get("env")
        return None


@pytest.fixture
def mock_subprocess() -> MockSubprocessWithEnv:
    """Create mock subprocess instance."""
    return MockSubprocessWithEnv()


@pytest.fixture
def mock_tmux() -> MagicMock:
    """Create mock tmux manager."""
    tmux = MagicMock()
    tmux.launch_bash_pane = MagicMock(return_value="%1")
    tmux.close_pane = MagicMock()
    tmux.capture_pane_content = MagicMock(return_value="Mock output")
    return tmux


@pytest.fixture
def context(tmp_path: Path) -> ExecutionContext:
    """Create execution context with temp project path."""
    return ExecutionContext(project_path=tmp_path)


class TestBashToolEnvVariables:
    """Tests for passing variables as environment variables."""

    def test_env_variables_passed_to_subprocess(
        self,
        mock_subprocess: MockSubprocessWithEnv,
        mock_tmux: MagicMock,
        context: ExecutionContext,
    ) -> None:
        """Test that env dict values are passed as environment variables."""
        tool = BashTool()
        step = {
            "tool": "bash",
            "command": 'echo "$MY_VAR"',
            "env": {"MY_VAR": "test_value"},
        }

        with patch("subprocess.run", mock_subprocess):
            tool.execute(step, context, mock_tmux)

        env = mock_subprocess.get_last_env()
        assert env is not None
        assert "MY_VAR" in env
        assert env["MY_VAR"] == "test_value"

    def test_env_variables_interpolated_from_context(
        self,
        mock_subprocess: MockSubprocessWithEnv,
        mock_tmux: MagicMock,
        context: ExecutionContext,
    ) -> None:
        """Test that env values can use {var} interpolation."""
        context.set("test_output", "Hello World")

        tool = BashTool()
        step = {
            "tool": "bash",
            "command": 'echo "$TEST_OUTPUT"',
            "env": {"TEST_OUTPUT": "{test_output}"},
        }

        with patch("subprocess.run", mock_subprocess):
            tool.execute(step, context, mock_tmux)

        env = mock_subprocess.get_last_env()
        assert env is not None
        assert env["TEST_OUTPUT"] == "Hello World"

    def test_env_variables_handle_special_characters(
        self,
        mock_subprocess: MockSubprocessWithEnv,
        mock_tmux: MagicMock,
        context: ExecutionContext,
    ) -> None:
        """Test that env variables safely handle shell-breaking characters.

        This is the main bug fix - when test output contains parentheses,
        quotes, and other special characters, they should be passed safely
        via environment variables instead of command interpolation.
        """
        # Simulate test output with shell-breaking characters
        problematic_output = """FAIL src/components/Test.test.tsx
  ● Test suite failed to run

    An update to TestComponent inside a test was not wrapped in act(...).

    console.error('Warning: An update')

EXIT_CODE:1"""

        context.set("test_output", problematic_output)

        tool = BashTool()
        step = {
            "tool": "bash",
            "command": 'echo "$TEST_OUTPUT" | grep -o "EXIT_CODE:[0-9]*"',
            "env": {"TEST_OUTPUT": "{test_output}"},
        }

        with patch("subprocess.run", mock_subprocess):
            tool.execute(step, context, mock_tmux)

        env = mock_subprocess.get_last_env()
        assert env is not None
        # The special characters should be preserved as-is in the env var
        assert "act(...)" in env["TEST_OUTPUT"]
        assert "console.error('Warning" in env["TEST_OUTPUT"]

    def test_env_variables_inherit_system_env(
        self,
        mock_subprocess: MockSubprocessWithEnv,
        mock_tmux: MagicMock,
        context: ExecutionContext,
    ) -> None:
        """Test that system environment is inherited with additions."""
        tool = BashTool()
        step = {
            "tool": "bash",
            "command": 'echo "$MY_VAR"',
            "env": {"MY_VAR": "custom"},
        }

        with patch("subprocess.run", mock_subprocess):
            with patch.dict("os.environ", {"PATH": "/usr/bin", "HOME": "/home/test"}):
                tool.execute(step, context, mock_tmux)

        env = mock_subprocess.get_last_env()
        assert env is not None
        # Should have both system and custom vars
        assert env["MY_VAR"] == "custom"
        assert env["PATH"] == "/usr/bin"
        assert env["HOME"] == "/home/test"

    def test_env_variables_override_system_env(
        self,
        mock_subprocess: MockSubprocessWithEnv,
        mock_tmux: MagicMock,
        context: ExecutionContext,
    ) -> None:
        """Test that custom env vars can override system vars."""
        tool = BashTool()
        step = {
            "tool": "bash",
            "command": 'echo "$PATH"',
            "env": {"PATH": "/custom/path"},
        }

        with patch("subprocess.run", mock_subprocess):
            with patch.dict("os.environ", {"PATH": "/usr/bin"}):
                tool.execute(step, context, mock_tmux)

        env = mock_subprocess.get_last_env()
        assert env is not None
        assert env["PATH"] == "/custom/path"

    def test_multiple_env_variables(
        self,
        mock_subprocess: MockSubprocessWithEnv,
        mock_tmux: MagicMock,
        context: ExecutionContext,
    ) -> None:
        """Test passing multiple environment variables."""
        context.set("var1", "value1")
        context.set("var2", "value2")

        tool = BashTool()
        step = {
            "tool": "bash",
            "command": 'echo "$A $B $C"',
            "env": {
                "A": "{var1}",
                "B": "{var2}",
                "C": "literal",
            },
        }

        with patch("subprocess.run", mock_subprocess):
            tool.execute(step, context, mock_tmux)

        env = mock_subprocess.get_last_env()
        assert env is not None
        assert env["A"] == "value1"
        assert env["B"] == "value2"
        assert env["C"] == "literal"

    def test_empty_env_dict_uses_system_env(
        self,
        mock_subprocess: MockSubprocessWithEnv,
        mock_tmux: MagicMock,
        context: ExecutionContext,
    ) -> None:
        """Test that empty env dict still inherits system env."""
        tool = BashTool()
        step = {
            "tool": "bash",
            "command": 'echo "test"',
            "env": {},
        }

        with patch("subprocess.run", mock_subprocess):
            with patch.dict("os.environ", {"PATH": "/usr/bin"}, clear=True):
                tool.execute(step, context, mock_tmux)

        env = mock_subprocess.get_last_env()
        assert env is not None
        assert env["PATH"] == "/usr/bin"

    def test_no_env_key_passes_none_to_subprocess(
        self,
        mock_subprocess: MockSubprocessWithEnv,
        mock_tmux: MagicMock,
        context: ExecutionContext,
    ) -> None:
        """Test that without env key, subprocess.run gets env=None (inherit)."""
        tool = BashTool()
        step = {
            "tool": "bash",
            "command": 'echo "test"',
        }

        with patch("subprocess.run", mock_subprocess):
            tool.execute(step, context, mock_tmux)

        # When no env is specified, it should be None to inherit system env
        env = mock_subprocess.get_last_env()
        assert env is None


class TestBashToolValidation:
    """Tests for step validation."""

    def test_validate_requires_command(self) -> None:
        """Test that command field is required."""
        tool = BashTool()
        step = {"tool": "bash"}

        with pytest.raises(ValueError, match="requires 'command' field"):
            tool.validate_step(step)

    def test_validate_accepts_valid_step(self) -> None:
        """Test that valid step passes validation."""
        tool = BashTool()
        step = {"tool": "bash", "command": "echo test"}

        # Should not raise
        tool.validate_step(step)

    def test_validate_accepts_step_with_env(self) -> None:
        """Test that step with env passes validation."""
        tool = BashTool()
        step = {
            "tool": "bash",
            "command": "echo test",
            "env": {"VAR": "value"},
        }

        # Should not raise
        tool.validate_step(step)


class TestBashToolInterpolation:
    """Tests for command string interpolation."""

    def test_command_interpolation(
        self,
        mock_subprocess: MockSubprocessWithEnv,
        mock_tmux: MagicMock,
        context: ExecutionContext,
    ) -> None:
        """Test that command string is interpolated."""
        context.set("name", "world")

        tool = BashTool()
        step = {
            "tool": "bash",
            "command": "echo hello {name}",
        }

        with patch("subprocess.run", mock_subprocess):
            tool.execute(step, context, mock_tmux)

        assert mock_subprocess.calls[0]["command"] == "echo hello world"

    def test_cwd_interpolation(
        self,
        mock_subprocess: MockSubprocessWithEnv,
        mock_tmux: MagicMock,
        context: ExecutionContext,
    ) -> None:
        """Test that cwd is interpolated."""
        context.set("subdir", "src")

        tool = BashTool()
        step = {
            "tool": "bash",
            "command": "ls",
            "cwd": "{subdir}",
        }

        with patch("subprocess.run", mock_subprocess):
            tool.execute(step, context, mock_tmux)

        assert mock_subprocess.calls[0]["cwd"] == "src"
