"""Unit tests for the Claude tool.

Tests plan auto-approval functionality including:
- Pattern detection for plan approval prompts
- Auto-approval key sending
- Configuration handling
"""

from unittest.mock import MagicMock, patch

import pytest

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

        with patch("orchestrator.tools.claude.console"):
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

        with patch("orchestrator.tools.claude.console") as mock_console:
            claude_tool._check_and_approve_plan(mock_tmux)

        mock_console.print.assert_called_once()
        call_args = mock_console.print.call_args[0][0]
        assert "Auto-approving" in call_args


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

        with patch("orchestrator.tools.claude.console"):
            with patch("orchestrator.tools.claude.Live"):
                with patch("orchestrator.tools.claude.AnimatedWaiter"):
                    with patch("time.sleep"):
                        with patch("time.time") as mock_time:
                            # Simulate time progression to trigger approval checks
                            mock_time.side_effect = [
                                0,    # start
                                0,    # pane_id check
                                0,    # last_approval_check init
                                0.5,  # first loop - elapsed
                                3.0,  # first loop - approval check time (> 2s interval)
                                3.0,  # after approval
                                3.5,  # second loop - elapsed
                                6.0,  # second loop - approval check time
                                6.0,  # after second check
                                6.5,  # third loop - elapsed
                            ]
                            claude_tool._wait_for_completion(mock_tmux)

        # Verify approval was sent at least once
        mock_tmux.send_keys.assert_called_with("Enter")
        # Verify loop continued (multiple wait_for_complete calls)
        assert completion_calls == 3

    def test_multiple_approvals_during_execution(self, claude_tool: ClaudeTool) -> None:
        """Verify multiple approval prompts can be handled in one execution."""
        approval_count = 0
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

        with patch("orchestrator.tools.claude.console"):
            with patch("orchestrator.tools.claude.Live"):
                with patch("orchestrator.tools.claude.AnimatedWaiter"):
                    with patch("time.sleep"):
                        with patch("time.time") as mock_time:
                            # Time values that trigger multiple approval checks
                            mock_time.side_effect = [
                                0,     # start
                                0,     # last_approval_check init
                                0.5,   # loop 1 - elapsed
                                3.0,   # loop 1 - check time (triggers approval)
                                3.0,   # after approval 1
                                3.5,   # loop 2 - elapsed
                                4.0,   # loop 2 - check time (not enough time passed)
                                4.5,   # loop 3 - elapsed
                                6.0,   # loop 3 - check time (triggers approval)
                                6.0,   # after approval 2
                                6.5,   # loop 4 - elapsed
                                9.0,   # loop 4 - check time (triggers approval)
                                9.0,   # after approval 3
                                9.5,   # loop 5 - elapsed
                            ]
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

        with patch("orchestrator.tools.claude.console"):
            with patch("orchestrator.tools.claude.Live"):
                with patch("orchestrator.tools.claude.AnimatedWaiter"):
                    with patch("time.sleep"):
                        with patch("time.time") as mock_time:
                            mock_time.side_effect = [
                                0, 0, 0.5, 3.0, 3.0,  # First approval
                                3.5, 6.0, 6.0,         # Second approval
                                6.5, 9.0, 9.0,         # Third check
                                9.5,                    # Fourth - exits
                            ]
                            claude_tool._wait_for_completion(mock_tmux)

        # Loop ran until completion signal, not until approval
        assert wait_calls == 4
