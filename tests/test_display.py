"""Unit tests for display module.

Tests defensive string conversion for Text.append() calls
to prevent "Only str or Text can be appended to Text" errors.
"""

from unittest.mock import MagicMock, patch

import pytest

from orchestrator.config import Step
from orchestrator.context import ExecutionContext
from orchestrator.display import (
    create_header_panel,
    create_step_panel,
    print_step_result,
    print_step_skipped,
)


class TestCreateHeaderPanel:
    """Tests for create_header_panel function."""

    def test_handles_string_workflow_name(self) -> None:
        """Verify string workflow name works correctly."""
        panel = create_header_panel("Test Workflow")
        assert panel is not None

    def test_handles_non_string_workflow_name(self) -> None:
        """Verify non-string workflow name is converted to string."""
        # Pass an integer - should be converted to string
        panel = create_header_panel(12345)  # type: ignore[arg-type]
        assert panel is not None

    def test_handles_none_workflow_name(self) -> None:
        """Verify None workflow name is converted to string."""
        panel = create_header_panel(None)  # type: ignore[arg-type]
        assert panel is not None


class TestCreateStepPanel:
    """Tests for create_step_panel function."""

    @pytest.fixture
    def context(self) -> ExecutionContext:
        """Create execution context."""
        return ExecutionContext()

    def test_handles_claude_step_with_string_prompt(self, context: ExecutionContext) -> None:
        """Verify string prompt works correctly."""
        step = Step(name="Test Step", tool="claude", prompt="Test prompt")
        panel = create_step_panel(step, context, 1, 5)
        assert panel is not None

    def test_handles_bash_step_with_string_command(self, context: ExecutionContext) -> None:
        """Verify string command works correctly."""
        step = Step(name="Test Step", tool="bash", command="echo hello")
        panel = create_step_panel(step, context, 1, 5)
        assert panel is not None

    def test_handles_interpolated_prompt_with_special_chars(
        self, context: ExecutionContext
    ) -> None:
        """Verify interpolated prompt with special characters works."""
        context.set("test_var", "Value with\nspecial\tchars")
        step = Step(name="Test Step", tool="claude", prompt="Prompt: {test_var}")
        panel = create_step_panel(step, context, 1, 5)
        assert panel is not None


class TestPrintStepSkipped:
    """Tests for print_step_skipped function."""

    @pytest.fixture
    def context(self) -> ExecutionContext:
        """Create execution context."""
        return ExecutionContext()

    def test_handles_string_reason(self, context: ExecutionContext) -> None:
        """Verify string reason works correctly."""
        step = Step(name="Test Step", tool="bash", command="echo test")
        with patch("orchestrator.display.console"):
            print_step_skipped(step, context, 1, 5, "Condition not met")

    def test_handles_non_string_reason(self, context: ExecutionContext) -> None:
        """Verify non-string reason is converted to string."""
        step = Step(name="Test Step", tool="bash", command="echo test")
        # Pass something that's not a string
        with patch("orchestrator.display.console"):
            # This should not raise an error even if reason isn't a string
            print_step_skipped(step, context, 1, 5, 12345)  # type: ignore[arg-type]

    def test_handles_interpolated_step_name(self, context: ExecutionContext) -> None:
        """Verify step name is properly interpolated."""
        context.set("task_name", "Dynamic Task")
        step = Step(name="Step: {task_name}", tool="bash", command="echo test")
        with patch("orchestrator.display.console"):
            print_step_skipped(step, context, 1, 5, "Skipping")


class TestPrintStepResult:
    """Tests for print_step_result function."""

    def test_handles_success_without_output_var(self) -> None:
        """Verify success without output var works."""
        with patch("orchestrator.display.console"):
            print_step_result(True, 1.5)

    def test_handles_success_with_output_var(self) -> None:
        """Verify success with output var works."""
        with patch("orchestrator.display.console"):
            print_step_result(True, 1.5, "result_var")

    def test_handles_failure(self) -> None:
        """Verify failure case works."""
        with patch("orchestrator.display.console"):
            print_step_result(False, 2.0)

    def test_handles_non_string_output_var(self) -> None:
        """Verify non-string output var is handled."""
        with patch("orchestrator.display.console"):
            # The output_var is only used in f-string, so this should work
            print_step_result(True, 1.5, 12345)  # type: ignore[arg-type]
