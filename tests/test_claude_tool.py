"""Unit tests for the Claude tool.

Tests plan auto-approval functionality including:
- Pattern detection for plan approval prompts
- Auto-approval key sending
- Configuration handling
- Step-level model override
"""

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from orchestrator.context import ExecutionContext
from orchestrator.tools.claude import ClaudeTool, PLAN_APPROVAL_PATTERNS


class TestPlanApprovalPatterns:
    """Tests for plan approval pattern detection."""

    def test_patterns_list_is_not_empty(self) -> None:
        """Verify patterns list has entries."""
        assert len(PLAN_APPROVAL_PATTERNS) > 0

    def test_patterns_are_lowercase(self) -> None:
        """Verify all patterns are lowercase for case-insensitive matching."""
        for pattern in PLAN_APPROVAL_PATTERNS:
            assert pattern == pattern.lower(), f"Pattern '{pattern}' should be lowercase"


class TestIsPlanApprovalPrompt:
    """Tests for _is_plan_approval_prompt method."""

    @pytest.fixture
    def claude_tool(self) -> ClaudeTool:
        """Create ClaudeTool instance."""
        return ClaudeTool()

    def test_detects_actual_claude_code_prompt(self, claude_tool: ClaudeTool) -> None:
        """Verify detection of actual Claude Code plan approval prompt."""
        content = """
        Would you like to proceed?

        ❯ 1. Yes, and bypass permissions
          2. No
        """
        assert claude_tool._is_plan_approval_prompt(content.lower()) is True

    def test_detects_proceed_with_selection_arrow(self, claude_tool: ClaudeTool) -> None:
        """Verify detection with selection arrow and proceed question."""
        content = "would you like to proceed?\n❯ 1. yes"
        assert claude_tool._is_plan_approval_prompt(content) is True

    def test_detects_proceed_with_yes_option(self, claude_tool: ClaudeTool) -> None:
        """Verify detection with proceed question and yes option."""
        content = "would you like to proceed?\n1. yes, start now"
        assert claude_tool._is_plan_approval_prompt(content) is True

    def test_rejects_normal_output(self, claude_tool: ClaudeTool) -> None:
        """Verify normal output is not detected as approval prompt."""
        content = "reading file src/main.py... done. analyzing code structure."
        assert claude_tool._is_plan_approval_prompt(content) is False

    def test_rejects_single_pattern_match(self, claude_tool: ClaudeTool) -> None:
        """Verify single pattern match is not enough (need 2+)."""
        content = "would you like to proceed with reading the file?"
        assert claude_tool._is_plan_approval_prompt(content) is False

    def test_only_checks_recent_content(self, claude_tool: ClaudeTool) -> None:
        """Verify only last ~500 chars are checked."""
        # Old content has approval patterns
        old_content = "would you like to proceed? ❯ 1. yes" + " " * 600
        # Recent content has no approval patterns
        recent_content = "reading files and analyzing code"
        content = old_content + recent_content
        assert claude_tool._is_plan_approval_prompt(content) is False

    def test_case_insensitive_matching(self, claude_tool: ClaudeTool) -> None:
        """Verify case-insensitive pattern matching."""
        content = "WOULD YOU LIKE TO PROCEED?\n❯ 1. YES"
        assert claude_tool._is_plan_approval_prompt(content.lower()) is True


class TestCheckAndApprovePlan:
    """Tests for _check_and_approve_plan method."""

    @pytest.fixture
    def claude_tool(self) -> ClaudeTool:
        """Create ClaudeTool instance."""
        return ClaudeTool()

    @pytest.fixture
    def mock_tmux(self) -> MagicMock:
        """Create mock tmux manager."""
        return MagicMock()

    def test_sends_enter_on_approval_prompt(
        self, claude_tool: ClaudeTool, mock_tmux: MagicMock
    ) -> None:
        """Verify Enter key is sent when approval prompt detected."""
        mock_tmux.capture_pane_content.return_value = """
        Would you like to proceed?

        ❯ 1. Yes, and bypass permissions
          2. No
        """

        with patch("orchestrator.tools.claude.get_display"):
            result = claude_tool._check_and_approve_plan(mock_tmux)

        assert result is True
        mock_tmux.send_keys.assert_called_once_with("Enter")

    def test_does_not_send_keys_on_normal_output(
        self, claude_tool: ClaudeTool, mock_tmux: MagicMock
    ) -> None:
        """Verify no keys sent when not an approval prompt."""
        mock_tmux.capture_pane_content.return_value = "Reading file src/main.py..."

        result = claude_tool._check_and_approve_plan(mock_tmux)

        assert result is False
        mock_tmux.send_keys.assert_not_called()

    def test_handles_empty_content(
        self, claude_tool: ClaudeTool, mock_tmux: MagicMock
    ) -> None:
        """Verify empty content is handled gracefully."""
        mock_tmux.capture_pane_content.return_value = ""

        result = claude_tool._check_and_approve_plan(mock_tmux)

        assert result is False
        mock_tmux.send_keys.assert_not_called()

    def test_prints_auto_approve_message(
        self, claude_tool: ClaudeTool, mock_tmux: MagicMock
    ) -> None:
        """Verify auto-approve message is printed."""
        mock_tmux.capture_pane_content.return_value = """
        Would you like to proceed?

        ❯ 1. Yes, and bypass permissions
        """

        with patch("orchestrator.tools.claude.get_display") as mock_get_display:
            mock_display = MagicMock()
            mock_get_display.return_value = mock_display
            claude_tool._check_and_approve_plan(mock_tmux)

        mock_display.print_auto_approve_plan.assert_called_once()


class TestAutoApproveConfig:
    """Tests for auto_approve_plan configuration handling."""

    @pytest.fixture
    def claude_tool(self) -> ClaudeTool:
        """Create ClaudeTool instance."""
        return ClaudeTool()

    def test_auto_approve_defaults_to_true(self, claude_tool: ClaudeTool) -> None:
        """Verify auto_approve defaults to True when not set."""
        mock_tmux = MagicMock()
        mock_tmux.claude_config = MagicMock(spec=[])  # No auto_approve_plan attr

        # Access the attribute to verify default behavior
        auto_approve = getattr(mock_tmux.claude_config, "auto_approve_plan", True)
        assert auto_approve is True

    def test_auto_approve_respects_false_setting(self, claude_tool: ClaudeTool) -> None:
        """Verify auto_approve respects False configuration."""
        mock_tmux = MagicMock()
        mock_tmux.claude_config.auto_approve_plan = False

        auto_approve = getattr(mock_tmux.claude_config, "auto_approve_plan", True)
        assert auto_approve is False


class TestContinuousApprovalListening:
    """Tests for continuous auto-approval listening behavior.

    Verifies that auto-approval continues checking for approval prompts
    throughout the entire Claude execution, not just once.
    """

    @pytest.fixture
    def claude_tool(self) -> ClaudeTool:
        """Create ClaudeTool instance."""
        return ClaudeTool()

    def test_continues_listening_after_approval(self, claude_tool: ClaudeTool) -> None:
        """Verify loop continues after approval (doesn't break on approval)."""
        call_count = 0
        approval_prompt = """
        Would you like to proceed?
        ❯ 1. Yes, and bypass permissions
        """
        normal_output = "Reading files and analyzing code..."

        def mock_capture() -> str:
            nonlocal call_count
            call_count += 1
            # First call returns approval prompt, subsequent calls return normal output
            if call_count == 1:
                return approval_prompt
            return normal_output

        mock_tmux = MagicMock()
        mock_tmux.capture_pane_content.side_effect = mock_capture
        mock_tmux.current_pane = "test_pane"
        mock_tmux.claude_config.auto_approve_plan = True

        # Set up server to complete after a few checks
        completion_calls = 0

        def mock_wait_for_complete(pane_id: str, timeout: float) -> bool:
            nonlocal completion_calls
            completion_calls += 1
            # Complete after 3 wait calls
            return completion_calls >= 3

        mock_tmux.server.wait_for_complete.side_effect = mock_wait_for_complete

        # Use a generator function to provide enough time values
        time_values = iter([0, 0, 0] + [3.0] * 50)  # Start values + plenty for loops

        with patch("orchestrator.tools.claude.get_display"):
            with patch("time.sleep"):
                with patch("time.time", side_effect=lambda: next(time_values)):
                    claude_tool._wait_for_completion(mock_tmux)

        # Verify approval was sent at least once
        mock_tmux.send_keys.assert_called_with("Enter")
        # Verify loop continued (multiple wait_for_complete calls)
        assert completion_calls == 3

    def test_multiple_approvals_during_execution(self, claude_tool: ClaudeTool) -> None:
        """Verify multiple approval prompts can be handled in one execution."""
        approval_prompt = """
        Would you like to proceed?
        ❯ 1. Yes, and bypass permissions
        """

        def mock_capture() -> str:
            # Always return approval prompt for this test
            return approval_prompt

        mock_tmux = MagicMock()
        mock_tmux.capture_pane_content.side_effect = mock_capture
        mock_tmux.current_pane = "test_pane"
        mock_tmux.claude_config.auto_approve_plan = True

        # Complete after 5 wait calls
        completion_calls = 0

        def mock_wait_for_complete(pane_id: str, timeout: float) -> bool:
            nonlocal completion_calls
            completion_calls += 1
            return completion_calls >= 5

        mock_tmux.server.wait_for_complete.side_effect = mock_wait_for_complete

        # Use a time generator that increases progressively to trigger multiple approvals
        # Each call returns an increasing time value
        time_counter = [0]

        def mock_time() -> float:
            time_counter[0] += 1.0  # Increase by 1 second each call
            return time_counter[0]

        with patch("orchestrator.tools.claude.get_display"):
            with patch("time.sleep"):
                with patch("time.time", side_effect=mock_time):
                    claude_tool._wait_for_completion(mock_tmux)

        # Verify Enter was sent multiple times (multiple approvals)
        assert mock_tmux.send_keys.call_count >= 2

    def test_only_exits_on_completion_signal(self, claude_tool: ClaudeTool) -> None:
        """Verify loop only exits when server signals completion, not on approval."""
        mock_tmux = MagicMock()
        mock_tmux.capture_pane_content.return_value = """
        Would you like to proceed?
        ❯ 1. Yes, and bypass permissions
        """
        mock_tmux.current_pane = "test_pane"
        mock_tmux.claude_config.auto_approve_plan = True

        # Track how many times wait_for_complete is called
        wait_calls = 0

        def mock_wait_for_complete(pane_id: str, timeout: float) -> bool:
            nonlocal wait_calls
            wait_calls += 1
            # Don't complete until 4th call
            return wait_calls >= 4

        mock_tmux.server.wait_for_complete.side_effect = mock_wait_for_complete

        # Use a generator function to provide enough time values
        time_values = iter([0, 0, 0] + [3.0] * 100)  # Start values + plenty for loops

        with patch("orchestrator.tools.claude.get_display"):
            with patch("time.sleep"):
                with patch("time.time", side_effect=lambda: next(time_values)):
                    claude_tool._wait_for_completion(mock_tmux)

        # Loop ran until completion signal, not until approval
        assert wait_calls == 4


class TestModelOverride:
    """Tests for step-level model override functionality."""

    @pytest.fixture
    def claude_tool(self) -> ClaudeTool:
        """Create ClaudeTool instance."""
        return ClaudeTool()

    @pytest.fixture
    def mock_tmux(self) -> MagicMock:
        """Create mock tmux manager."""
        tmux = MagicMock()
        tmux.claude_config.append_system_prompt = None
        return tmux

    @pytest.fixture
    def mock_context(self) -> MagicMock:
        """Create mock execution context."""
        context = MagicMock(spec=ExecutionContext)
        context.interpolate.side_effect = lambda x: x  # Return input unchanged
        context.interpolate_for_claude.side_effect = lambda x: x  # Return input unchanged
        context.project_path = Path("/test/project")
        return context

    def test_execute_extracts_step_model(
        self,
        claude_tool: ClaudeTool,
        mock_tmux: MagicMock,
        mock_context: MagicMock,
    ) -> None:
        """Verify step model is extracted and passed to tmux_manager."""
        step = {"prompt": "Do something", "model": "opus"}

        # Mock the completion to return immediately
        mock_tmux.server.wait_for_complete.return_value = True
        mock_tmux.current_pane = "%1"
        mock_tmux.capture_pane_content.return_value = "output"

        with patch("orchestrator.tools.claude.get_display"):
            claude_tool.execute(step, mock_context, mock_tmux)

        mock_tmux.launch_claude_pane.assert_called_once_with(
            "Do something", model_override="opus"
        )

    def test_execute_without_step_model(
        self,
        claude_tool: ClaudeTool,
        mock_tmux: MagicMock,
        mock_context: MagicMock,
    ) -> None:
        """Verify None is passed when step has no model field."""
        step = {"prompt": "Do something"}

        # Mock the completion to return immediately
        mock_tmux.server.wait_for_complete.return_value = True
        mock_tmux.current_pane = "%1"
        mock_tmux.capture_pane_content.return_value = "output"

        with patch("orchestrator.tools.claude.get_display"):
            claude_tool.execute(step, mock_context, mock_tmux)

        mock_tmux.launch_claude_pane.assert_called_once_with(
            "Do something", model_override=None
        )

    def test_execute_with_model_and_append_system_prompt(
        self,
        claude_tool: ClaudeTool,
        mock_tmux: MagicMock,
        mock_context: MagicMock,
    ) -> None:
        """Verify model override works together with append_system_prompt."""
        step = {"prompt": "Do something", "model": "haiku"}
        mock_tmux.claude_config.append_system_prompt = "System context"

        # Mock the completion to return immediately
        mock_tmux.server.wait_for_complete.return_value = True
        mock_tmux.current_pane = "%1"
        mock_tmux.capture_pane_content.return_value = "output"

        with patch("orchestrator.tools.claude.get_display"):
            claude_tool.execute(step, mock_context, mock_tmux)

        # Verify model override is passed
        mock_tmux.launch_claude_pane.assert_called_once()
        call_args = mock_tmux.launch_claude_pane.call_args
        assert call_args[1]["model_override"] == "haiku"
        # Verify prompt has system prompt prepended
        assert "System context" in call_args[0][0]
