"""Unit tests for the checklist tool.

Tests validation checks with focus on:
- Bash command checks with expect/expect_not/expect_regex
- Regex pattern matching checks
- Inline vs file-based checklists
- Result aggregation and on_fail modes
"""

import subprocess
from pathlib import Path
from typing import Any, Dict, Optional
from unittest.mock import MagicMock, patch, mock_open

import pytest

from orchestrator.context import ExecutionContext
from orchestrator.tools.checklist import ChecklistTool, CheckResult


@pytest.fixture
def mock_tmux() -> MagicMock:
    """Create mock tmux manager."""
    return MagicMock()


@pytest.fixture
def context(tmp_path: Path) -> ExecutionContext:
    """Create execution context with temp project path."""
    return ExecutionContext(project_path=tmp_path)


@pytest.fixture
def checklist_tool() -> ChecklistTool:
    """Create checklist tool instance."""
    return ChecklistTool()


class TestChecklistToolValidation:
    """Tests for step validation."""

    def test_validate_requires_checklist_or_items(
        self, checklist_tool: ChecklistTool
    ) -> None:
        """Test that either checklist or items is required."""
        step: Dict[str, Any] = {"tool": "checklist"}

        with pytest.raises(ValueError, match="requires either 'checklist'"):
            checklist_tool.validate_step(step)

    def test_validate_accepts_checklist_file(
        self, checklist_tool: ChecklistTool
    ) -> None:
        """Test that checklist file reference is valid."""
        step = {"tool": "checklist", "checklist": "code-quality"}
        # Should not raise
        checklist_tool.validate_step(step)

    def test_validate_accepts_inline_items(
        self, checklist_tool: ChecklistTool
    ) -> None:
        """Test that inline items are valid."""
        step = {
            "tool": "checklist",
            "items": [
                {"name": "Check 1", "type": "bash", "command": "echo test"}
            ],
        }
        # Should not raise
        checklist_tool.validate_step(step)

    def test_validate_rejects_invalid_item_type(
        self, checklist_tool: ChecklistTool
    ) -> None:
        """Test that invalid check type is rejected."""
        step = {
            "tool": "checklist",
            "items": [
                {"name": "Check 1", "type": "invalid", "command": "echo test"}
            ],
        }

        with pytest.raises(ValueError, match="invalid type 'invalid'"):
            checklist_tool.validate_step(step)

    def test_validate_rejects_item_without_name(
        self, checklist_tool: ChecklistTool
    ) -> None:
        """Test that item without name is rejected."""
        step = {
            "tool": "checklist",
            "items": [{"type": "bash", "command": "echo test"}],
        }

        with pytest.raises(ValueError, match="missing required 'name' field"):
            checklist_tool.validate_step(step)


class TestBashChecks:
    """Tests for bash command checks."""

    def test_bash_check_with_expect_pass(
        self,
        checklist_tool: ChecklistTool,
        context: ExecutionContext,
        mock_tmux: MagicMock,
    ) -> None:
        """Test bash check passes when output matches expect."""
        step = {
            "tool": "checklist",
            "items": [
                {
                    "name": "Output check",
                    "type": "bash",
                    "command": "echo '0'",
                    "expect": "0",
                }
            ],
        }

        mock_result = subprocess.CompletedProcess(
            args="echo '0'", returncode=0, stdout="0\n", stderr=""
        )

        with patch("subprocess.run", return_value=mock_result):
            result = checklist_tool.execute(step, context, mock_tmux)

        assert result.success is True
        assert "PASSED" in result.output

    def test_bash_check_with_expect_fail(
        self,
        checklist_tool: ChecklistTool,
        context: ExecutionContext,
        mock_tmux: MagicMock,
    ) -> None:
        """Test bash check fails when output doesn't match expect."""
        step = {
            "tool": "checklist",
            "items": [
                {
                    "name": "Output check",
                    "type": "bash",
                    "command": "echo '5'",
                    "expect": "0",
                    "severity": "error",
                }
            ],
        }

        mock_result = subprocess.CompletedProcess(
            args="echo '5'", returncode=0, stdout="5\n", stderr=""
        )

        with patch("subprocess.run", return_value=mock_result):
            result = checklist_tool.execute(step, context, mock_tmux)

        assert result.success is False
        assert "Expected '0', got '5'" in result.output

    def test_bash_check_with_expect_not(
        self,
        checklist_tool: ChecklistTool,
        context: ExecutionContext,
        mock_tmux: MagicMock,
    ) -> None:
        """Test bash check with expect_not passes when value not present."""
        step = {
            "tool": "checklist",
            "items": [
                {
                    "name": "Forbidden check",
                    "type": "bash",
                    "command": "echo 'clean'",
                    "expect_not": "error",
                }
            ],
        }

        mock_result = subprocess.CompletedProcess(
            args="echo 'clean'", returncode=0, stdout="clean\n", stderr=""
        )

        with patch("subprocess.run", return_value=mock_result):
            result = checklist_tool.execute(step, context, mock_tmux)

        assert result.success is True

    def test_bash_check_with_expect_regex(
        self,
        checklist_tool: ChecklistTool,
        context: ExecutionContext,
        mock_tmux: MagicMock,
    ) -> None:
        """Test bash check with regex pattern matching."""
        step = {
            "tool": "checklist",
            "items": [
                {
                    "name": "Pattern check",
                    "type": "bash",
                    "command": "echo 'version 1.2.3'",
                    "expect_regex": r"version \d+\.\d+\.\d+",
                }
            ],
        }

        mock_result = subprocess.CompletedProcess(
            args="echo 'version 1.2.3'",
            returncode=0,
            stdout="version 1.2.3\n",
            stderr="",
        )

        with patch("subprocess.run", return_value=mock_result):
            result = checklist_tool.execute(step, context, mock_tmux)

        assert result.success is True


class TestRegexChecks:
    """Tests for regex pattern matching checks."""

    def test_regex_check_no_matches_pass(
        self,
        checklist_tool: ChecklistTool,
        context: ExecutionContext,
        mock_tmux: MagicMock,
    ) -> None:
        """Test regex check passes when no matches found (expect 0)."""
        step = {
            "tool": "checklist",
            "items": [
                {
                    "name": "No TODOs",
                    "type": "regex",
                    "pattern": "TODO",
                    "files": "**/*.py",
                    "expect": 0,
                }
            ],
        }

        # ripgrep returns empty when no matches
        mock_result = subprocess.CompletedProcess(
            args=["rg"], returncode=1, stdout="", stderr=""
        )

        with patch("subprocess.run", return_value=mock_result):
            result = checklist_tool.execute(step, context, mock_tmux)

        assert result.success is True
        assert "PASSED" in result.output
        assert "No TODOs" in result.output  # Check name should appear

    def test_regex_check_matches_found_fail(
        self,
        checklist_tool: ChecklistTool,
        context: ExecutionContext,
        mock_tmux: MagicMock,
    ) -> None:
        """Test regex check fails when matches found but expect 0."""
        step = {
            "tool": "checklist",
            "items": [
                {
                    "name": "No TODOs",
                    "type": "regex",
                    "pattern": "TODO",
                    "files": "**/*.py",
                    "expect": 0,
                    "severity": "error",
                }
            ],
        }

        # ripgrep returns counts per file
        mock_result = subprocess.CompletedProcess(
            args=["rg"],
            returncode=0,
            stdout="src/main.py:2\nsrc/utils.py:1\n",
            stderr="",
        )

        with patch("subprocess.run", return_value=mock_result):
            result = checklist_tool.execute(step, context, mock_tmux)

        assert result.success is False
        assert "Found 3 matches, expected 0" in result.output


class TestInlineVsFileChecklists:
    """Tests for inline vs file-based checklist loading."""

    def test_inline_checklist_used_directly(
        self,
        checklist_tool: ChecklistTool,
        context: ExecutionContext,
        mock_tmux: MagicMock,
    ) -> None:
        """Test that inline items are used without file lookup."""
        step = {
            "tool": "checklist",
            "items": [
                {
                    "name": "Inline check",
                    "type": "bash",
                    "command": "echo 'ok'",
                    "expect": "ok",
                }
            ],
        }

        mock_result = subprocess.CompletedProcess(
            args="echo 'ok'", returncode=0, stdout="ok\n", stderr=""
        )

        with patch("subprocess.run", return_value=mock_result):
            result = checklist_tool.execute(step, context, mock_tmux)

        assert result.success is True
        assert "inline-checklist" in result.output

    def test_file_checklist_loaded(
        self,
        checklist_tool: ChecklistTool,
        context: ExecutionContext,
        mock_tmux: MagicMock,
        tmp_path: Path,
    ) -> None:
        """Test that file-based checklist is loaded correctly."""
        # Create checklist directory and file
        checklist_dir = tmp_path / ".claude" / "checklists"
        checklist_dir.mkdir(parents=True)
        checklist_file = checklist_dir / "test-checklist.yaml"
        checklist_file.write_text("""
name: test-checklist
description: Test checklist
on_fail: warn
items:
  - name: "File check"
    type: bash
    command: "echo 'test'"
    expect: "test"
""")

        step = {"tool": "checklist", "checklist": "test-checklist"}

        mock_result = subprocess.CompletedProcess(
            args="echo 'test'", returncode=0, stdout="test\n", stderr=""
        )

        with patch("subprocess.run", return_value=mock_result):
            result = checklist_tool.execute(step, context, mock_tmux)

        assert result.success is True
        assert "test-checklist" in result.output

    def test_missing_checklist_file_fails(
        self,
        checklist_tool: ChecklistTool,
        context: ExecutionContext,
        mock_tmux: MagicMock,
    ) -> None:
        """Test that missing checklist file returns error."""
        step = {"tool": "checklist", "checklist": "nonexistent"}

        result = checklist_tool.execute(step, context, mock_tmux)

        assert result.success is False
        assert "Failed to load" in result.error


class TestOnFailModes:
    """Tests for on_fail behavior."""

    def test_on_fail_stop_fails_on_warning(
        self,
        checklist_tool: ChecklistTool,
        context: ExecutionContext,
        mock_tmux: MagicMock,
    ) -> None:
        """Test that on_fail=stop fails even on warnings."""
        step = {
            "tool": "checklist",
            "on_fail": "stop",
            "items": [
                {
                    "name": "Warning check",
                    "type": "bash",
                    "command": "echo '1'",
                    "expect": "0",
                    "severity": "warning",
                }
            ],
        }

        mock_result = subprocess.CompletedProcess(
            args="echo '1'", returncode=0, stdout="1\n", stderr=""
        )

        with patch("subprocess.run", return_value=mock_result):
            result = checklist_tool.execute(step, context, mock_tmux)

        assert result.success is False

    def test_on_fail_warn_passes_on_warning(
        self,
        checklist_tool: ChecklistTool,
        context: ExecutionContext,
        mock_tmux: MagicMock,
    ) -> None:
        """Test that on_fail=warn passes on warnings but fails on errors."""
        step = {
            "tool": "checklist",
            "on_fail": "warn",
            "items": [
                {
                    "name": "Warning check",
                    "type": "bash",
                    "command": "echo '1'",
                    "expect": "0",
                    "severity": "warning",
                }
            ],
        }

        mock_result = subprocess.CompletedProcess(
            args="echo '1'", returncode=0, stdout="1\n", stderr=""
        )

        with patch("subprocess.run", return_value=mock_result):
            result = checklist_tool.execute(step, context, mock_tmux)

        assert result.success is True  # Warnings don't fail with on_fail=warn

    def test_on_fail_continue_always_passes(
        self,
        checklist_tool: ChecklistTool,
        context: ExecutionContext,
        mock_tmux: MagicMock,
    ) -> None:
        """Test that on_fail=continue always passes."""
        step = {
            "tool": "checklist",
            "on_fail": "continue",
            "items": [
                {
                    "name": "Error check",
                    "type": "bash",
                    "command": "echo '1'",
                    "expect": "0",
                    "severity": "error",
                }
            ],
        }

        mock_result = subprocess.CompletedProcess(
            args="echo '1'", returncode=0, stdout="1\n", stderr=""
        )

        with patch("subprocess.run", return_value=mock_result):
            result = checklist_tool.execute(step, context, mock_tmux)

        assert result.success is True  # Always passes with on_fail=continue


class TestResultAggregation:
    """Tests for result aggregation and formatting."""

    def test_multiple_checks_aggregated(
        self,
        checklist_tool: ChecklistTool,
        context: ExecutionContext,
        mock_tmux: MagicMock,
    ) -> None:
        """Test that multiple check results are aggregated."""
        step = {
            "tool": "checklist",
            "items": [
                {
                    "name": "Check 1",
                    "type": "bash",
                    "command": "echo 'ok'",
                    "expect": "ok",
                },
                {
                    "name": "Check 2",
                    "type": "bash",
                    "command": "echo 'ok'",
                    "expect": "ok",
                },
                {
                    "name": "Check 3",
                    "type": "bash",
                    "command": "echo 'fail'",
                    "expect": "ok",
                    "severity": "warning",
                },
            ],
        }

        def mock_run(cmd, **kwargs):
            if "echo 'fail'" in cmd:
                return subprocess.CompletedProcess(
                    args=cmd, returncode=0, stdout="fail\n", stderr=""
                )
            return subprocess.CompletedProcess(
                args=cmd, returncode=0, stdout="ok\n", stderr=""
            )

        with patch("subprocess.run", side_effect=mock_run):
            result = checklist_tool.execute(step, context, mock_tmux)

        assert "2/3 checks passed" in result.output
        assert "Check 1" in result.output
        assert "Check 2" in result.output
        assert "Check 3" in result.output


class TestVariableInterpolation:
    """Tests for variable interpolation in checks."""

    def test_command_interpolation(
        self,
        checklist_tool: ChecklistTool,
        context: ExecutionContext,
        mock_tmux: MagicMock,
    ) -> None:
        """Test that commands are interpolated with context variables."""
        context.set("file_path", "src/main.py")

        step = {
            "tool": "checklist",
            "items": [
                {
                    "name": "File check",
                    "type": "bash",
                    "command": "ls {file_path}",
                    "expect": "src/main.py",
                }
            ],
        }

        captured_cmd = None

        def capture_run(cmd, **kwargs):
            nonlocal captured_cmd
            captured_cmd = cmd
            return subprocess.CompletedProcess(
                args=cmd, returncode=0, stdout="src/main.py\n", stderr=""
            )

        with patch("subprocess.run", side_effect=capture_run):
            checklist_tool.execute(step, context, mock_tmux)

        assert captured_cmd == "ls src/main.py"


class TestParallelExecution:
    """Tests for parallel check execution."""

    def test_checks_run_in_parallel(
        self,
        checklist_tool: ChecklistTool,
        context: ExecutionContext,
        mock_tmux: MagicMock,
    ) -> None:
        """Test that multiple checks run concurrently."""
        import time
        from threading import current_thread

        step = {
            "tool": "checklist",
            "items": [
                {"name": "Check 1", "type": "bash", "command": "echo '1'", "expect": "1"},
                {"name": "Check 2", "type": "bash", "command": "echo '2'", "expect": "2"},
                {"name": "Check 3", "type": "bash", "command": "echo '3'", "expect": "3"},
            ],
        }

        call_times: list[float] = []
        thread_ids: list[int] = []

        def slow_run(cmd, **kwargs):
            call_times.append(time.time())
            thread_ids.append(current_thread().ident)
            time.sleep(0.1)  # Simulate work
            output = cmd.split("'")[1] if "'" in cmd else "0"
            return subprocess.CompletedProcess(
                args=cmd, returncode=0, stdout=f"{output}\n", stderr=""
            )

        with patch("subprocess.run", side_effect=slow_run):
            start = time.time()
            result = checklist_tool.execute(step, context, mock_tmux)
            elapsed = time.time() - start

        # All 3 checks passed
        assert result.success is True
        assert "3/3 checks passed" in result.output

        # Parallel execution: 3 checks with 0.1s each should take ~0.1-0.2s
        # Sequential would take ~0.3s+
        assert elapsed < 0.3, f"Execution took {elapsed:.2f}s, expected <0.3s for parallel"

        # All checks should start at roughly the same time (within 50ms)
        if len(call_times) == 3:
            time_spread = max(call_times) - min(call_times)
            assert time_spread < 0.05, f"Call time spread {time_spread:.3f}s suggests sequential execution"
