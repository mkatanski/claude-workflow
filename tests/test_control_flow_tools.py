"""Tests for control flow tools: range, while, and retry.

These tests cover the new control flow tools that provide
loop-based iteration patterns for workflows.
"""

from pathlib import Path
from typing import Any, Dict
from unittest.mock import MagicMock, patch

import pytest

from orchestrator.context import ExecutionContext
from orchestrator.tools import ToolRegistry
from orchestrator.tools.base import LoopSignal, ToolResult
from orchestrator.tools.range_tool import RangeTool
from orchestrator.tools.retry_tool import RetryTool
from orchestrator.tools.while_tool import WhileTool


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def context(tmp_path: Path) -> ExecutionContext:
    """Create execution context with temp project path."""
    return ExecutionContext(project_path=tmp_path)


@pytest.fixture
def mock_tmux() -> MagicMock:
    """Create mock tmux manager."""
    tmux = MagicMock()
    tmux.launch_bash_pane = MagicMock(return_value="%1")
    tmux.close_pane = MagicMock()
    tmux.capture_pane_content = MagicMock(return_value="Mock output")
    return tmux


# =============================================================================
# RangeTool Tests
# =============================================================================


class TestRangeToolValidation:
    """Tests for RangeTool validation."""

    def test_validate_requires_from(self) -> None:
        """Test that 'from' field is required."""
        tool = RangeTool()
        step: Dict[str, Any] = {
            "to": 5,
            "var": "i",
            "steps": [{"name": "step", "tool": "bash", "command": "echo"}],
        }

        with pytest.raises(ValueError, match="requires 'from' field"):
            tool.validate_step(step)

    def test_validate_requires_to(self) -> None:
        """Test that 'to' field is required."""
        tool = RangeTool()
        step: Dict[str, Any] = {
            "from": 1,
            "var": "i",
            "steps": [{"name": "step", "tool": "bash", "command": "echo"}],
        }

        with pytest.raises(ValueError, match="requires 'to' field"):
            tool.validate_step(step)

    def test_validate_requires_var(self) -> None:
        """Test that 'var' field is required."""
        tool = RangeTool()
        step: Dict[str, Any] = {
            "from": 1,
            "to": 5,
            "steps": [{"name": "step", "tool": "bash", "command": "echo"}],
        }

        with pytest.raises(ValueError, match="requires 'var' field"):
            tool.validate_step(step)

    def test_validate_requires_steps(self) -> None:
        """Test that 'steps' field is required."""
        tool = RangeTool()
        step: Dict[str, Any] = {"from": 1, "to": 5, "var": "i"}

        with pytest.raises(ValueError, match="requires 'steps' field"):
            tool.validate_step(step)

    def test_validate_from_must_be_int(self) -> None:
        """Test that 'from' must be an integer."""
        tool = RangeTool()
        step: Dict[str, Any] = {
            "from": "1",
            "to": 5,
            "var": "i",
            "steps": [{"name": "step", "tool": "bash", "command": "echo"}],
        }

        with pytest.raises(ValueError, match="'from' must be an integer"):
            tool.validate_step(step)

    def test_validate_step_cannot_be_zero(self) -> None:
        """Test that 'step' cannot be zero."""
        tool = RangeTool()
        step: Dict[str, Any] = {
            "from": 1,
            "to": 5,
            "var": "i",
            "step": 0,
            "steps": [{"name": "step", "tool": "bash", "command": "echo"}],
        }

        with pytest.raises(ValueError, match="'step' cannot be zero"):
            tool.validate_step(step)

    def test_validate_accepts_valid_step(self) -> None:
        """Test that valid configuration passes validation."""
        tool = RangeTool()
        step: Dict[str, Any] = {
            "from": 1,
            "to": 5,
            "var": "i",
            "steps": [{"name": "step", "tool": "bash", "command": "echo"}],
        }

        # Should not raise
        tool.validate_step(step)


class TestRangeToolExecution:
    """Tests for RangeTool execution."""

    def test_execute_iterates_over_range(
        self, context: ExecutionContext, mock_tmux: MagicMock
    ) -> None:
        """Test that range tool iterates from 'from' to 'to' inclusive."""
        tool = RangeTool()
        captured_values: list[str] = []

        def mock_execute(
            step_dict: Dict[str, Any],
            ctx: ExecutionContext,
            tmux: MagicMock,
        ) -> ToolResult:
            captured_values.append(ctx.get("i") or "")
            return ToolResult(success=True)

        mock_inner_tool = MagicMock()
        mock_inner_tool.validate_step = MagicMock()
        mock_inner_tool.execute = MagicMock(side_effect=mock_execute)

        step: Dict[str, Any] = {
            "name": "Range Test",
            "from": 1,
            "to": 3,
            "var": "i",
            "steps": [{"name": "inner", "tool": "bash", "command": "echo {i}"}],
        }

        with patch.object(ToolRegistry, "get", return_value=mock_inner_tool):
            result = tool.execute(step, context, mock_tmux)

        assert result.success
        assert captured_values == ["1", "2", "3"]

    def test_execute_sets_iteration_variable(
        self, context: ExecutionContext, mock_tmux: MagicMock
    ) -> None:
        """Test that _iteration variable is set during loop."""
        tool = RangeTool()
        captured_iterations: list[str] = []

        def mock_execute(
            step_dict: Dict[str, Any],
            ctx: ExecutionContext,
            tmux: MagicMock,
        ) -> ToolResult:
            captured_iterations.append(ctx.get("_iteration") or "")
            return ToolResult(success=True)

        mock_inner_tool = MagicMock()
        mock_inner_tool.validate_step = MagicMock()
        mock_inner_tool.execute = MagicMock(side_effect=mock_execute)

        step: Dict[str, Any] = {
            "name": "Range Test",
            "from": 1,
            "to": 3,
            "var": "i",
            "steps": [{"name": "inner", "tool": "bash", "command": "echo"}],
        }

        with patch.object(ToolRegistry, "get", return_value=mock_inner_tool):
            tool.execute(step, context, mock_tmux)

        # _iteration is 0-indexed
        assert captured_iterations == ["0", "1", "2"]

    def test_execute_with_negative_step(
        self, context: ExecutionContext, mock_tmux: MagicMock
    ) -> None:
        """Test that range tool works with negative step."""
        tool = RangeTool()
        captured_values: list[str] = []

        def mock_execute(
            step_dict: Dict[str, Any],
            ctx: ExecutionContext,
            tmux: MagicMock,
        ) -> ToolResult:
            captured_values.append(ctx.get("i") or "")
            return ToolResult(success=True)

        mock_inner_tool = MagicMock()
        mock_inner_tool.validate_step = MagicMock()
        mock_inner_tool.execute = MagicMock(side_effect=mock_execute)

        step: Dict[str, Any] = {
            "name": "Range Test",
            "from": 5,
            "to": 2,
            "step": -1,
            "var": "i",
            "steps": [{"name": "inner", "tool": "bash", "command": "echo"}],
        }

        with patch.object(ToolRegistry, "get", return_value=mock_inner_tool):
            result = tool.execute(step, context, mock_tmux)

        assert result.success
        assert captured_values == ["5", "4", "3", "2"]

    def test_execute_empty_range(
        self, context: ExecutionContext, mock_tmux: MagicMock
    ) -> None:
        """Test that empty range returns success with no iterations."""
        tool = RangeTool()

        step: Dict[str, Any] = {
            "name": "Range Test",
            "from": 5,
            "to": 2,
            "step": 1,  # Positive step with from > to = empty range
            "var": "i",
            "steps": [{"name": "inner", "tool": "bash", "command": "echo"}],
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        assert "Empty range" in (result.output or "")

    def test_execute_handles_break(
        self, context: ExecutionContext, mock_tmux: MagicMock
    ) -> None:
        """Test that break signal stops the loop."""
        tool = RangeTool()
        iteration_count = 0

        def mock_execute(
            step_dict: Dict[str, Any],
            ctx: ExecutionContext,
            tmux: MagicMock,
        ) -> ToolResult:
            nonlocal iteration_count
            iteration_count += 1
            if iteration_count >= 2:
                return ToolResult(success=True, loop_signal=LoopSignal.BREAK)
            return ToolResult(success=True)

        mock_inner_tool = MagicMock()
        mock_inner_tool.validate_step = MagicMock()
        mock_inner_tool.execute = MagicMock(side_effect=mock_execute)

        step: Dict[str, Any] = {
            "name": "Range Test",
            "from": 1,
            "to": 10,
            "var": "i",
            "steps": [{"name": "inner", "tool": "bash", "command": "echo"}],
        }

        with patch.object(ToolRegistry, "get", return_value=mock_inner_tool):
            result = tool.execute(step, context, mock_tmux)

        assert result.success
        assert iteration_count == 2  # Stopped at 2nd iteration

    def test_execute_handles_continue(
        self, context: ExecutionContext, mock_tmux: MagicMock
    ) -> None:
        """Test that continue signal skips to next iteration."""
        tool = RangeTool()
        captured_values: list[str] = []

        def mock_execute(
            step_dict: Dict[str, Any],
            ctx: ExecutionContext,
            tmux: MagicMock,
        ) -> ToolResult:
            value = ctx.get("i") or ""
            if value == "2":
                return ToolResult(success=True, loop_signal=LoopSignal.CONTINUE)
            captured_values.append(value)
            return ToolResult(success=True)

        mock_inner_tool = MagicMock()
        mock_inner_tool.validate_step = MagicMock()
        mock_inner_tool.execute = MagicMock(side_effect=mock_execute)

        step: Dict[str, Any] = {
            "name": "Range Test",
            "from": 1,
            "to": 4,
            "var": "i",
            "steps": [{"name": "inner", "tool": "bash", "command": "echo"}],
        }

        with patch.object(ToolRegistry, "get", return_value=mock_inner_tool):
            result = tool.execute(step, context, mock_tmux)

        assert result.success
        # 2 should be skipped
        assert captured_values == ["1", "3", "4"]


# =============================================================================
# WhileTool Tests
# =============================================================================


class TestWhileToolValidation:
    """Tests for WhileTool validation."""

    def test_validate_requires_condition(self) -> None:
        """Test that 'condition' field is required."""
        tool = WhileTool()
        step: Dict[str, Any] = {
            "max_iterations": 10,
            "steps": [{"name": "step", "tool": "bash", "command": "echo"}],
        }

        with pytest.raises(ValueError, match="requires 'condition' field"):
            tool.validate_step(step)

    def test_validate_requires_max_iterations(self) -> None:
        """Test that 'max_iterations' field is required."""
        tool = WhileTool()
        step: Dict[str, Any] = {
            "condition": "{x} == 1",
            "steps": [{"name": "step", "tool": "bash", "command": "echo"}],
        }

        with pytest.raises(ValueError, match="requires 'max_iterations' field"):
            tool.validate_step(step)

    def test_validate_requires_steps(self) -> None:
        """Test that 'steps' field is required."""
        tool = WhileTool()
        step: Dict[str, Any] = {"condition": "{x} == 1", "max_iterations": 10}

        with pytest.raises(ValueError, match="requires 'steps' field"):
            tool.validate_step(step)

    def test_validate_max_iterations_must_be_positive(self) -> None:
        """Test that 'max_iterations' must be positive."""
        tool = WhileTool()
        step: Dict[str, Any] = {
            "condition": "{x} == 1",
            "max_iterations": 0,
            "steps": [{"name": "step", "tool": "bash", "command": "echo"}],
        }

        with pytest.raises(ValueError, match="must be a positive integer"):
            tool.validate_step(step)

    def test_validate_on_max_reached_values(self) -> None:
        """Test that 'on_max_reached' must be valid value."""
        tool = WhileTool()
        step: Dict[str, Any] = {
            "condition": "{x} == 1",
            "max_iterations": 10,
            "on_max_reached": "invalid",
            "steps": [{"name": "step", "tool": "bash", "command": "echo"}],
        }

        with pytest.raises(ValueError, match="Invalid on_max_reached value"):
            tool.validate_step(step)

    def test_validate_accepts_valid_step(self) -> None:
        """Test that valid configuration passes validation."""
        tool = WhileTool()
        step: Dict[str, Any] = {
            "condition": "{x} == 1",
            "max_iterations": 10,
            "steps": [{"name": "step", "tool": "bash", "command": "echo"}],
        }

        # Should not raise
        tool.validate_step(step)


class TestWhileToolExecution:
    """Tests for WhileTool execution."""

    def test_execute_loops_while_condition_true(
        self, context: ExecutionContext, mock_tmux: MagicMock
    ) -> None:
        """Test that while loop continues while condition is true."""
        tool = WhileTool()
        context.set("counter", "0")
        iteration_count = 0

        def mock_execute(
            step_dict: Dict[str, Any],
            ctx: ExecutionContext,
            tmux: MagicMock,
        ) -> ToolResult:
            nonlocal iteration_count
            iteration_count += 1
            # Increment counter
            current = int(ctx.get("counter") or "0")
            ctx.set("counter", str(current + 1))
            return ToolResult(success=True)

        mock_inner_tool = MagicMock()
        mock_inner_tool.validate_step = MagicMock()
        mock_inner_tool.execute = MagicMock(side_effect=mock_execute)

        step: Dict[str, Any] = {
            "name": "While Test",
            "condition": "{counter} < 3",
            "max_iterations": 10,
            "steps": [{"name": "inner", "tool": "bash", "command": "echo"}],
        }

        with patch.object(ToolRegistry, "get", return_value=mock_inner_tool):
            result = tool.execute(step, context, mock_tmux)

        assert result.success
        assert iteration_count == 3
        assert context.get("counter") == "3"

    def test_execute_stops_at_max_iterations_with_error(
        self, context: ExecutionContext, mock_tmux: MagicMock
    ) -> None:
        """Test that while loop errors when max_iterations reached."""
        tool = WhileTool()
        context.set("always_true", "1")

        mock_inner_tool = MagicMock()
        mock_inner_tool.validate_step = MagicMock()
        mock_inner_tool.execute = MagicMock(return_value=ToolResult(success=True))

        step: Dict[str, Any] = {
            "name": "While Test",
            "condition": "{always_true} == 1",
            "max_iterations": 5,
            "on_max_reached": "error",
            "steps": [{"name": "inner", "tool": "bash", "command": "echo"}],
        }

        with patch.object(ToolRegistry, "get", return_value=mock_inner_tool):
            result = tool.execute(step, context, mock_tmux)

        assert not result.success
        assert "max_iterations" in (result.error or "").lower()

    def test_execute_continues_at_max_iterations(
        self, context: ExecutionContext, mock_tmux: MagicMock
    ) -> None:
        """Test that while loop continues when max_iterations reached with continue mode."""
        tool = WhileTool()
        context.set("always_true", "1")

        mock_inner_tool = MagicMock()
        mock_inner_tool.validate_step = MagicMock()
        mock_inner_tool.execute = MagicMock(return_value=ToolResult(success=True))

        step: Dict[str, Any] = {
            "name": "While Test",
            "condition": "{always_true} == 1",
            "max_iterations": 3,
            "on_max_reached": "continue",
            "steps": [{"name": "inner", "tool": "bash", "command": "echo"}],
        }

        with patch.object(ToolRegistry, "get", return_value=mock_inner_tool):
            result = tool.execute(step, context, mock_tmux)

        assert result.success
        assert mock_inner_tool.execute.call_count == 3

    def test_execute_sets_iteration_variable(
        self, context: ExecutionContext, mock_tmux: MagicMock
    ) -> None:
        """Test that _iteration variable is set during loop."""
        tool = WhileTool()
        captured_iterations: list[str] = []
        iteration_count = 0

        def mock_execute(
            step_dict: Dict[str, Any],
            ctx: ExecutionContext,
            tmux: MagicMock,
        ) -> ToolResult:
            nonlocal iteration_count
            iteration_count += 1
            captured_iterations.append(ctx.get("_iteration") or "")
            if iteration_count >= 3:
                ctx.set("done", "true")
            return ToolResult(success=True)

        context.set("done", "false")

        mock_inner_tool = MagicMock()
        mock_inner_tool.validate_step = MagicMock()
        mock_inner_tool.execute = MagicMock(side_effect=mock_execute)

        step: Dict[str, Any] = {
            "name": "While Test",
            "condition": "{done} == false",
            "max_iterations": 10,
            "steps": [{"name": "inner", "tool": "bash", "command": "echo"}],
        }

        with patch.object(ToolRegistry, "get", return_value=mock_inner_tool):
            tool.execute(step, context, mock_tmux)

        # _iteration is 0-indexed
        assert captured_iterations == ["0", "1", "2"]

    def test_execute_handles_break(
        self, context: ExecutionContext, mock_tmux: MagicMock
    ) -> None:
        """Test that break signal stops the loop."""
        tool = WhileTool()
        context.set("always_true", "1")
        iteration_count = 0

        def mock_execute(
            step_dict: Dict[str, Any],
            ctx: ExecutionContext,
            tmux: MagicMock,
        ) -> ToolResult:
            nonlocal iteration_count
            iteration_count += 1
            if iteration_count >= 2:
                return ToolResult(success=True, loop_signal=LoopSignal.BREAK)
            return ToolResult(success=True)

        mock_inner_tool = MagicMock()
        mock_inner_tool.validate_step = MagicMock()
        mock_inner_tool.execute = MagicMock(side_effect=mock_execute)

        step: Dict[str, Any] = {
            "name": "While Test",
            "condition": "{always_true} == 1",
            "max_iterations": 10,
            "steps": [{"name": "inner", "tool": "bash", "command": "echo"}],
        }

        with patch.object(ToolRegistry, "get", return_value=mock_inner_tool):
            result = tool.execute(step, context, mock_tmux)

        assert result.success
        assert iteration_count == 2


# =============================================================================
# RetryTool Tests
# =============================================================================


class TestRetryToolValidation:
    """Tests for RetryTool validation."""

    def test_validate_requires_max_attempts(self) -> None:
        """Test that 'max_attempts' field is required."""
        tool = RetryTool()
        step: Dict[str, Any] = {
            "steps": [{"name": "step", "tool": "bash", "command": "echo"}],
        }

        with pytest.raises(ValueError, match="requires 'max_attempts' field"):
            tool.validate_step(step)

    def test_validate_requires_steps(self) -> None:
        """Test that 'steps' field is required."""
        tool = RetryTool()
        step: Dict[str, Any] = {"max_attempts": 3}

        with pytest.raises(ValueError, match="requires 'steps' field"):
            tool.validate_step(step)

    def test_validate_max_attempts_must_be_positive(self) -> None:
        """Test that 'max_attempts' must be positive."""
        tool = RetryTool()
        step: Dict[str, Any] = {
            "max_attempts": 0,
            "steps": [{"name": "step", "tool": "bash", "command": "echo"}],
        }

        with pytest.raises(ValueError, match="must be a positive integer"):
            tool.validate_step(step)

    def test_validate_delay_must_be_non_negative(self) -> None:
        """Test that 'delay' must be non-negative."""
        tool = RetryTool()
        step: Dict[str, Any] = {
            "max_attempts": 3,
            "delay": -1,
            "steps": [{"name": "step", "tool": "bash", "command": "echo"}],
        }

        with pytest.raises(ValueError, match="must be a non-negative number"):
            tool.validate_step(step)

    def test_validate_on_failure_values(self) -> None:
        """Test that 'on_failure' must be valid value."""
        tool = RetryTool()
        step: Dict[str, Any] = {
            "max_attempts": 3,
            "on_failure": "invalid",
            "steps": [{"name": "step", "tool": "bash", "command": "echo"}],
        }

        with pytest.raises(ValueError, match="Invalid on_failure value"):
            tool.validate_step(step)

    def test_validate_accepts_valid_step(self) -> None:
        """Test that valid configuration passes validation."""
        tool = RetryTool()
        step: Dict[str, Any] = {
            "max_attempts": 3,
            "steps": [{"name": "step", "tool": "bash", "command": "echo"}],
        }

        # Should not raise
        tool.validate_step(step)


class TestRetryToolExecution:
    """Tests for RetryTool execution."""

    def test_execute_succeeds_on_first_try(
        self, context: ExecutionContext, mock_tmux: MagicMock
    ) -> None:
        """Test that retry succeeds immediately when steps succeed."""
        tool = RetryTool()

        mock_inner_tool = MagicMock()
        mock_inner_tool.validate_step = MagicMock()
        mock_inner_tool.execute = MagicMock(return_value=ToolResult(success=True))

        step: Dict[str, Any] = {
            "name": "Retry Test",
            "max_attempts": 3,
            "steps": [{"name": "inner", "tool": "bash", "command": "echo"}],
        }

        with patch.object(ToolRegistry, "get", return_value=mock_inner_tool):
            result = tool.execute(step, context, mock_tmux)

        assert result.success
        assert mock_inner_tool.execute.call_count == 1
        assert context.get("_retry_succeeded") == "true"
        assert context.get("_retry_attempts") == "1"

    def test_execute_retries_on_failure(
        self, context: ExecutionContext, mock_tmux: MagicMock
    ) -> None:
        """Test that retry retries when steps fail."""
        tool = RetryTool()
        attempt_count = 0

        def mock_execute(
            step_dict: Dict[str, Any],
            ctx: ExecutionContext,
            tmux: MagicMock,
        ) -> ToolResult:
            nonlocal attempt_count
            attempt_count += 1
            if attempt_count < 3:
                return ToolResult(success=False, error="Failed")
            return ToolResult(success=True)

        mock_inner_tool = MagicMock()
        mock_inner_tool.validate_step = MagicMock()
        mock_inner_tool.execute = MagicMock(side_effect=mock_execute)

        step: Dict[str, Any] = {
            "name": "Retry Test",
            "max_attempts": 5,
            "steps": [{"name": "inner", "tool": "bash", "command": "test"}],
        }

        with patch.object(ToolRegistry, "get", return_value=mock_inner_tool):
            result = tool.execute(step, context, mock_tmux)

        assert result.success
        assert attempt_count == 3
        assert context.get("_retry_succeeded") == "true"

    def test_execute_fails_after_max_attempts(
        self, context: ExecutionContext, mock_tmux: MagicMock
    ) -> None:
        """Test that retry fails when all attempts fail."""
        tool = RetryTool()

        mock_inner_tool = MagicMock()
        mock_inner_tool.validate_step = MagicMock()
        mock_inner_tool.execute = MagicMock(
            return_value=ToolResult(success=False, error="Always fails")
        )

        step: Dict[str, Any] = {
            "name": "Retry Test",
            "max_attempts": 3,
            "on_failure": "error",
            "steps": [{"name": "inner", "tool": "bash", "command": "test"}],
        }

        with patch.object(ToolRegistry, "get", return_value=mock_inner_tool):
            result = tool.execute(step, context, mock_tmux)

        assert not result.success
        assert "3 attempts" in (result.error or "")
        assert context.get("_retry_succeeded") == "false"

    def test_execute_continues_after_max_attempts(
        self, context: ExecutionContext, mock_tmux: MagicMock
    ) -> None:
        """Test that retry continues when on_failure is 'continue'."""
        tool = RetryTool()

        mock_inner_tool = MagicMock()
        mock_inner_tool.validate_step = MagicMock()
        mock_inner_tool.execute = MagicMock(
            return_value=ToolResult(success=False, error="Always fails")
        )

        step: Dict[str, Any] = {
            "name": "Retry Test",
            "max_attempts": 3,
            "on_failure": "continue",
            "steps": [{"name": "inner", "tool": "bash", "command": "test"}],
        }

        with patch.object(ToolRegistry, "get", return_value=mock_inner_tool):
            result = tool.execute(step, context, mock_tmux)

        assert result.success  # Continues despite failures
        assert context.get("_retry_succeeded") == "false"

    def test_execute_checks_until_condition(
        self, context: ExecutionContext, mock_tmux: MagicMock
    ) -> None:
        """Test that retry checks 'until' condition for early success."""
        tool = RetryTool()
        attempt_count = 0

        def mock_execute(
            step_dict: Dict[str, Any],
            ctx: ExecutionContext,
            tmux: MagicMock,
        ) -> ToolResult:
            nonlocal attempt_count
            attempt_count += 1
            # Set exit code based on attempt
            if attempt_count >= 2:
                ctx.set("exit_code", "0")
            else:
                ctx.set("exit_code", "1")
            return ToolResult(success=True)

        context.set("exit_code", "1")

        mock_inner_tool = MagicMock()
        mock_inner_tool.validate_step = MagicMock()
        mock_inner_tool.execute = MagicMock(side_effect=mock_execute)

        step: Dict[str, Any] = {
            "name": "Retry Test",
            "max_attempts": 5,
            "until": "{exit_code} == 0",
            "steps": [{"name": "inner", "tool": "bash", "command": "test"}],
        }

        with patch.object(ToolRegistry, "get", return_value=mock_inner_tool):
            result = tool.execute(step, context, mock_tmux)

        assert result.success
        assert attempt_count == 2  # Stopped when until condition was met
        assert context.get("_retry_succeeded") == "true"

    def test_execute_sets_attempt_variable(
        self, context: ExecutionContext, mock_tmux: MagicMock
    ) -> None:
        """Test that _attempt variable is set during retries."""
        tool = RetryTool()
        captured_attempts: list[str] = []

        def mock_execute(
            step_dict: Dict[str, Any],
            ctx: ExecutionContext,
            tmux: MagicMock,
        ) -> ToolResult:
            captured_attempts.append(ctx.get("_attempt") or "")
            if len(captured_attempts) < 3:
                return ToolResult(success=False, error="Not yet")
            return ToolResult(success=True)

        mock_inner_tool = MagicMock()
        mock_inner_tool.validate_step = MagicMock()
        mock_inner_tool.execute = MagicMock(side_effect=mock_execute)

        step: Dict[str, Any] = {
            "name": "Retry Test",
            "max_attempts": 5,
            "steps": [{"name": "inner", "tool": "bash", "command": "test"}],
        }

        with patch.object(ToolRegistry, "get", return_value=mock_inner_tool):
            tool.execute(step, context, mock_tmux)

        # _attempt is 1-indexed
        assert captured_attempts == ["1", "2", "3"]

    def test_execute_handles_break(
        self, context: ExecutionContext, mock_tmux: MagicMock
    ) -> None:
        """Test that break signal stops retries."""
        tool = RetryTool()
        attempt_count = 0

        def mock_execute(
            step_dict: Dict[str, Any],
            ctx: ExecutionContext,
            tmux: MagicMock,
        ) -> ToolResult:
            nonlocal attempt_count
            attempt_count += 1
            if attempt_count >= 2:
                return ToolResult(success=True, loop_signal=LoopSignal.BREAK)
            return ToolResult(success=False, error="Not yet")

        mock_inner_tool = MagicMock()
        mock_inner_tool.validate_step = MagicMock()
        mock_inner_tool.execute = MagicMock(side_effect=mock_execute)

        step: Dict[str, Any] = {
            "name": "Retry Test",
            "max_attempts": 10,
            "steps": [{"name": "inner", "tool": "bash", "command": "test"}],
        }

        with patch.object(ToolRegistry, "get", return_value=mock_inner_tool):
            result = tool.execute(step, context, mock_tmux)

        assert result.success
        assert attempt_count == 2


# =============================================================================
# Tool Name Tests
# =============================================================================


class TestToolNames:
    """Tests for tool name properties."""

    def test_range_tool_name(self) -> None:
        """Test that RangeTool has correct name."""
        tool = RangeTool()
        assert tool.name == "range"

    def test_while_tool_name(self) -> None:
        """Test that WhileTool has correct name."""
        tool = WhileTool()
        assert tool.name == "while"

    def test_retry_tool_name(self) -> None:
        """Test that RetryTool has correct name."""
        tool = RetryTool()
        assert tool.name == "retry"


# =============================================================================
# Tool Registry Tests
# =============================================================================


class TestToolRegistration:
    """Tests for tool registration in the registry."""

    def test_range_tool_is_registered(self) -> None:
        """Test that RangeTool is registered."""
        tool = ToolRegistry.get("range")
        assert isinstance(tool, RangeTool)

    def test_while_tool_is_registered(self) -> None:
        """Test that WhileTool is registered."""
        tool = ToolRegistry.get("while")
        assert isinstance(tool, WhileTool)

    def test_retry_tool_is_registered(self) -> None:
        """Test that RetryTool is registered."""
        tool = ToolRegistry.get("retry")
        assert isinstance(tool, RetryTool)
