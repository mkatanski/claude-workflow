"""Shared test fixtures and configuration."""

import pytest
from unittest.mock import MagicMock, patch


@pytest.fixture(autouse=True)
def mock_display_adapter():
    """Auto-mock the display adapter for all tests.

    This prevents actual terminal output during tests and provides
    a consistent mock interface for display operations.
    """
    mock_display = MagicMock()
    mock_display.console = MagicMock()

    with patch("orchestrator.display_adapter.DisplayAdapter.get_instance", return_value=mock_display):
        with patch("orchestrator.display_adapter.get_display", return_value=mock_display):
            # Also patch in workflow module
            with patch("orchestrator.workflow.get_display", return_value=mock_display):
                # And in tools
                with patch("orchestrator.tools.claude.get_display", return_value=mock_display):
                    with patch("orchestrator.tools.bash.get_display", return_value=mock_display):
                        with patch("orchestrator.tools.foreach.get_display", return_value=mock_display):
                            yield mock_display
