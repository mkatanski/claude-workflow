"""Comprehensive unit tests for the selector module.

This module tests the interactive workflow selection functionality including:
- Interactive workflow selection with questionary
- Workflow list formatting for display
- Edge cases like empty lists, single workflows, and special characters
"""

from pathlib import Path
from typing import List
from unittest.mock import MagicMock, patch

import pytest
import questionary

from orchestrator.config import WorkflowInfo
from orchestrator.selector import format_workflow_list, select_workflow_interactive


class TestSelectWorkflowInteractive:
    """Tests for the select_workflow_interactive function."""

    @pytest.fixture
    def sample_workflows(self) -> List[WorkflowInfo]:
        """Create a list of sample workflows for testing."""
        return [
            WorkflowInfo(name="Build Project", file_path=Path("/project/.claude/build.yml")),
            WorkflowInfo(name="Deploy App", file_path=Path("/project/.claude/deploy.yml")),
            WorkflowInfo(name="Run Tests", file_path=Path("/project/.claude/tests.yml")),
        ]

    @pytest.fixture
    def single_workflow(self) -> List[WorkflowInfo]:
        """Create a single workflow for testing."""
        return [
            WorkflowInfo(name="Simple Workflow", file_path=Path("/project/.claude/simple.yml")),
        ]

    def test_select_workflow_interactive_returns_none_for_empty_list(self) -> None:
        """Test that an empty workflow list returns None immediately."""
        result = select_workflow_interactive([])
        assert result is None

    @patch("orchestrator.selector.questionary.select")
    @patch("orchestrator.selector.console")
    def test_select_workflow_interactive_returns_selected_workflow(
        self,
        mock_console: MagicMock,
        mock_select: MagicMock,
        sample_workflows: List[WorkflowInfo],
    ) -> None:
        """Test that the selected workflow is returned correctly."""
        expected_workflow = sample_workflows[1]  # Deploy App

        mock_question = MagicMock()
        mock_question.ask.return_value = expected_workflow
        mock_select.return_value = mock_question

        result = select_workflow_interactive(sample_workflows)

        assert result == expected_workflow
        mock_select.assert_called_once()

    @patch("orchestrator.selector.questionary.select")
    @patch("orchestrator.selector.console")
    def test_select_workflow_interactive_returns_none_when_cancelled(
        self,
        mock_console: MagicMock,
        mock_select: MagicMock,
        sample_workflows: List[WorkflowInfo],
    ) -> None:
        """Test that cancelling selection returns None."""
        mock_question = MagicMock()
        mock_question.ask.return_value = None
        mock_select.return_value = mock_question

        result = select_workflow_interactive(sample_workflows)

        assert result is None

    @patch("orchestrator.selector.questionary.select")
    @patch("orchestrator.selector.console")
    def test_select_workflow_interactive_builds_correct_choices(
        self,
        mock_console: MagicMock,
        mock_select: MagicMock,
        sample_workflows: List[WorkflowInfo],
    ) -> None:
        """Test that choices are built correctly with display names."""
        mock_question = MagicMock()
        mock_question.ask.return_value = None
        mock_select.return_value = mock_question

        select_workflow_interactive(sample_workflows)

        # Get the choices passed to questionary.select
        call_kwargs = mock_select.call_args[1]
        choices = call_kwargs["choices"]

        # Should have workflows + cancel option
        assert len(choices) == len(sample_workflows) + 1

        # Verify workflow choices have correct titles
        assert choices[0].title == "Build Project (build.yml)"
        assert choices[1].title == "Deploy App (deploy.yml)"
        assert choices[2].title == "Run Tests (tests.yml)"

        # Verify cancel option title is present
        assert choices[-1].title == "Cancel"

    @patch("orchestrator.selector.questionary.select")
    @patch("orchestrator.selector.console")
    def test_select_workflow_interactive_with_single_workflow(
        self,
        mock_console: MagicMock,
        mock_select: MagicMock,
        single_workflow: List[WorkflowInfo],
    ) -> None:
        """Test selection with only one workflow available."""
        expected_workflow = single_workflow[0]
        mock_question = MagicMock()
        mock_question.ask.return_value = expected_workflow
        mock_select.return_value = mock_question

        result = select_workflow_interactive(single_workflow)

        assert result == expected_workflow
        call_kwargs = mock_select.call_args[1]
        choices = call_kwargs["choices"]
        assert len(choices) == 2  # One workflow + Cancel

    @patch("orchestrator.selector.questionary.select")
    @patch("orchestrator.selector.console")
    def test_select_workflow_interactive_prints_header(
        self,
        mock_console: MagicMock,
        mock_select: MagicMock,
        sample_workflows: List[WorkflowInfo],
    ) -> None:
        """Test that header messages are printed before selection."""
        mock_question = MagicMock()
        mock_question.ask.return_value = None
        mock_select.return_value = mock_question

        select_workflow_interactive(sample_workflows)

        # Verify console.print was called multiple times for header
        assert mock_console.print.call_count >= 2

    @patch("orchestrator.selector.questionary.select")
    @patch("orchestrator.selector.console")
    def test_select_workflow_interactive_uses_correct_questionary_options(
        self,
        mock_console: MagicMock,
        mock_select: MagicMock,
        sample_workflows: List[WorkflowInfo],
    ) -> None:
        """Test that questionary is called with correct configuration options."""
        mock_question = MagicMock()
        mock_question.ask.return_value = None
        mock_select.return_value = mock_question

        select_workflow_interactive(sample_workflows)

        call_args = mock_select.call_args
        assert call_args[0][0] == "Select a workflow to run:"  # First positional arg
        assert call_args[1]["use_arrow_keys"] is True
        assert call_args[1]["use_shortcuts"] is False

    @patch("orchestrator.selector.questionary.select")
    @patch("orchestrator.selector.console")
    def test_select_workflow_interactive_with_special_characters_in_name(
        self,
        mock_console: MagicMock,
        mock_select: MagicMock,
    ) -> None:
        """Test selection with special characters in workflow names."""
        workflows_with_special_chars = [
            WorkflowInfo(
                name="Build & Deploy (v2.0)",
                file_path=Path("/project/.claude/build-deploy.yml"),
            ),
            WorkflowInfo(
                name="Test <Integration>",
                file_path=Path("/project/.claude/test-integration.yml"),
            ),
            WorkflowInfo(
                name="Deploy: Production",
                file_path=Path("/project/.claude/deploy-prod.yaml"),
            ),
        ]

        mock_question = MagicMock()
        mock_question.ask.return_value = workflows_with_special_chars[0]
        mock_select.return_value = mock_question

        result = select_workflow_interactive(workflows_with_special_chars)

        assert result == workflows_with_special_chars[0]
        call_kwargs = mock_select.call_args[1]
        choices = call_kwargs["choices"]

        assert choices[0].title == "Build & Deploy (v2.0) (build-deploy.yml)"
        assert choices[1].title == "Test <Integration> (test-integration.yml)"
        assert choices[2].title == "Deploy: Production (deploy-prod.yaml)"

    @patch("orchestrator.selector.questionary.select")
    @patch("orchestrator.selector.console")
    def test_select_workflow_interactive_with_unicode_in_name(
        self,
        mock_console: MagicMock,
        mock_select: MagicMock,
    ) -> None:
        """Test selection with unicode characters in workflow names."""
        workflows_with_unicode = [
            WorkflowInfo(
                name="Deploy to Production",
                file_path=Path("/project/.claude/deploy.yml"),
            ),
            WorkflowInfo(
                name="Build Project",
                file_path=Path("/project/.claude/build.yml"),
            ),
        ]

        mock_question = MagicMock()
        mock_question.ask.return_value = workflows_with_unicode[0]
        mock_select.return_value = mock_question

        result = select_workflow_interactive(workflows_with_unicode)

        assert result == workflows_with_unicode[0]

    @patch("orchestrator.selector.questionary.select")
    @patch("orchestrator.selector.console")
    def test_select_workflow_interactive_with_long_workflow_name(
        self,
        mock_console: MagicMock,
        mock_select: MagicMock,
    ) -> None:
        """Test selection with very long workflow names."""
        long_name = "This is a very long workflow name that might cause display issues " * 3
        workflows_with_long_name = [
            WorkflowInfo(
                name=long_name,
                file_path=Path("/project/.claude/long-name-workflow.yml"),
            ),
        ]

        mock_question = MagicMock()
        mock_question.ask.return_value = workflows_with_long_name[0]
        mock_select.return_value = mock_question

        result = select_workflow_interactive(workflows_with_long_name)

        assert result == workflows_with_long_name[0]
        call_kwargs = mock_select.call_args[1]
        choices = call_kwargs["choices"]

        expected_title = f"{long_name} (long-name-workflow.yml)"
        assert choices[0].title == expected_title

    @patch("orchestrator.selector.questionary.select")
    @patch("orchestrator.selector.console")
    def test_select_workflow_interactive_preserves_workflow_object_reference(
        self,
        mock_console: MagicMock,
        mock_select: MagicMock,
        sample_workflows: List[WorkflowInfo],
    ) -> None:
        """Test that the returned workflow is the same object instance."""
        expected_workflow = sample_workflows[2]
        mock_question = MagicMock()
        mock_question.ask.return_value = expected_workflow
        mock_select.return_value = mock_question

        result = select_workflow_interactive(sample_workflows)

        # Should be the exact same object, not a copy
        assert result is expected_workflow


class TestFormatWorkflowList:
    """Tests for the format_workflow_list function."""

    @pytest.fixture
    def sample_workflows(self) -> List[WorkflowInfo]:
        """Create a list of sample workflows for testing."""
        return [
            WorkflowInfo(name="Build Project", file_path=Path("/project/.claude/build.yml")),
            WorkflowInfo(name="Deploy App", file_path=Path("/project/.claude/deploy.yml")),
            WorkflowInfo(name="Run Tests", file_path=Path("/project/.claude/tests.yml")),
        ]

    def test_format_workflow_list_with_empty_list(self) -> None:
        """Test formatting an empty workflow list returns empty string."""
        result = format_workflow_list([])
        assert result == ""

    def test_format_workflow_list_with_single_workflow(self) -> None:
        """Test formatting a single workflow."""
        workflows = [
            WorkflowInfo(name="Build Project", file_path=Path("/project/.claude/build.yml")),
        ]

        result = format_workflow_list(workflows)

        assert result == "  - Build Project (build.yml)"

    def test_format_workflow_list_with_multiple_workflows(
        self,
        sample_workflows: List[WorkflowInfo],
    ) -> None:
        """Test formatting multiple workflows."""
        result = format_workflow_list(sample_workflows)

        expected_lines = [
            "  - Build Project (build.yml)",
            "  - Deploy App (deploy.yml)",
            "  - Run Tests (tests.yml)",
        ]
        assert result == "\n".join(expected_lines)

    def test_format_workflow_list_includes_filename_only(self) -> None:
        """Test that only the filename is included, not the full path."""
        workflows = [
            WorkflowInfo(
                name="Test Workflow",
                file_path=Path("/very/long/path/to/project/.claude/workflow.yml"),
            ),
        ]

        result = format_workflow_list(workflows)

        assert result == "  - Test Workflow (workflow.yml)"
        assert "/very/long/path" not in result

    def test_format_workflow_list_with_special_characters(self) -> None:
        """Test formatting workflows with special characters in names."""
        workflows = [
            WorkflowInfo(
                name="Build & Deploy (v2.0)",
                file_path=Path("/project/.claude/build-deploy.yml"),
            ),
            WorkflowInfo(
                name="Test <Integration>",
                file_path=Path("/project/.claude/test-integration.yml"),
            ),
        ]

        result = format_workflow_list(workflows)

        expected_lines = [
            "  - Build & Deploy (v2.0) (build-deploy.yml)",
            "  - Test <Integration> (test-integration.yml)",
        ]
        assert result == "\n".join(expected_lines)

    def test_format_workflow_list_with_yaml_extension(self) -> None:
        """Test formatting workflows with .yaml extension."""
        workflows = [
            WorkflowInfo(
                name="YAML Workflow",
                file_path=Path("/project/.claude/workflow.yaml"),
            ),
        ]

        result = format_workflow_list(workflows)

        assert result == "  - YAML Workflow (workflow.yaml)"

    def test_format_workflow_list_with_mixed_extensions(self) -> None:
        """Test formatting workflows with mixed .yml and .yaml extensions."""
        workflows = [
            WorkflowInfo(name="First", file_path=Path("/project/.claude/first.yml")),
            WorkflowInfo(name="Second", file_path=Path("/project/.claude/second.yaml")),
            WorkflowInfo(name="Third", file_path=Path("/project/.claude/third.yml")),
        ]

        result = format_workflow_list(workflows)

        expected_lines = [
            "  - First (first.yml)",
            "  - Second (second.yaml)",
            "  - Third (third.yml)",
        ]
        assert result == "\n".join(expected_lines)

    def test_format_workflow_list_preserves_order(self) -> None:
        """Test that workflow order is preserved in output."""
        workflows = [
            WorkflowInfo(name="Zulu", file_path=Path("/project/.claude/zulu.yml")),
            WorkflowInfo(name="Alpha", file_path=Path("/project/.claude/alpha.yml")),
            WorkflowInfo(name="Mike", file_path=Path("/project/.claude/mike.yml")),
        ]

        result = format_workflow_list(workflows)

        lines = result.split("\n")
        assert "Zulu" in lines[0]
        assert "Alpha" in lines[1]
        assert "Mike" in lines[2]

    def test_format_workflow_list_with_unicode_characters(self) -> None:
        """Test formatting workflows with unicode characters."""
        workflows = [
            WorkflowInfo(name="Deploy", file_path=Path("/project/.claude/deploy.yml")),
            WorkflowInfo(name="Test", file_path=Path("/project/.claude/test.yml")),
        ]

        result = format_workflow_list(workflows)

        assert "Deploy" in result
        assert "Test" in result

    def test_format_workflow_list_with_whitespace_in_name(self) -> None:
        """Test formatting workflows with leading/trailing whitespace in names."""
        workflows = [
            WorkflowInfo(
                name="  Spaced Workflow  ",
                file_path=Path("/project/.claude/spaced.yml"),
            ),
        ]

        result = format_workflow_list(workflows)

        # The function preserves whitespace in names as-is
        assert "  Spaced Workflow  " in result

    def test_format_workflow_list_line_format_consistency(
        self,
        sample_workflows: List[WorkflowInfo],
    ) -> None:
        """Test that each line follows the expected format pattern."""
        result = format_workflow_list(sample_workflows)

        for line in result.split("\n"):
            # Each line should start with "  - "
            assert line.startswith("  - ")
            # Each line should end with filename in parentheses
            assert line.endswith(".yml)") or line.endswith(".yaml)")
            # Each line should contain workflow name and filename
            assert "(" in line
            assert ")" in line

    def test_format_workflow_list_with_empty_name(self) -> None:
        """Test formatting workflow with empty name."""
        workflows = [
            WorkflowInfo(name="", file_path=Path("/project/.claude/unnamed.yml")),
        ]

        result = format_workflow_list(workflows)

        assert result == "  -  (unnamed.yml)"

    def test_format_workflow_list_with_many_workflows(self) -> None:
        """Test formatting a large number of workflows."""
        workflows = [
            WorkflowInfo(
                name=f"Workflow {i}",
                file_path=Path(f"/project/.claude/workflow-{i}.yml"),
            )
            for i in range(100)
        ]

        result = format_workflow_list(workflows)

        lines = result.split("\n")
        assert len(lines) == 100
        assert "Workflow 0" in lines[0]
        assert "Workflow 99" in lines[-1]


class TestSelectorIntegration:
    """Integration tests for selector module functions working together."""

    @patch("orchestrator.selector.questionary.select")
    @patch("orchestrator.selector.console")
    def test_format_and_select_workflow_consistency(
        self,
        mock_console: MagicMock,
        mock_select: MagicMock,
    ) -> None:
        """Test that format and select functions handle the same data consistently."""
        workflows = [
            WorkflowInfo(name="Build", file_path=Path("/project/.claude/build.yml")),
            WorkflowInfo(name="Test", file_path=Path("/project/.claude/test.yml")),
        ]

        mock_question = MagicMock()
        mock_question.ask.return_value = workflows[0]
        mock_select.return_value = mock_question

        # Both functions should handle the same workflow list
        formatted = format_workflow_list(workflows)
        selected = select_workflow_interactive(workflows)

        # format_workflow_list should include both workflows
        assert "Build" in formatted
        assert "Test" in formatted

        # select_workflow_interactive should return valid workflow
        assert selected in workflows

    def test_empty_list_handling_consistency(self) -> None:
        """Test that both functions handle empty lists gracefully."""
        empty_list: List[WorkflowInfo] = []

        formatted = format_workflow_list(empty_list)
        selected = select_workflow_interactive(empty_list)

        assert formatted == ""
        assert selected is None


class TestWorkflowInfoDataclass:
    """Tests for WorkflowInfo dataclass usage in selector functions."""

    def test_workflow_info_with_absolute_path(self) -> None:
        """Test WorkflowInfo with absolute path."""
        workflow = WorkflowInfo(
            name="Absolute Path Workflow",
            file_path=Path("/absolute/path/to/workflow.yml"),
        )

        result = format_workflow_list([workflow])

        assert "workflow.yml" in result
        assert "/absolute/path" not in result

    def test_workflow_info_with_relative_path(self) -> None:
        """Test WorkflowInfo with relative path (converted to absolute internally)."""
        workflow = WorkflowInfo(
            name="Relative Path Workflow",
            file_path=Path("./relative/path/workflow.yml"),
        )

        result = format_workflow_list([workflow])

        assert "workflow.yml" in result

    def test_workflow_info_equality_in_selection(self) -> None:
        """Test that WorkflowInfo objects maintain identity through selection."""
        workflow = WorkflowInfo(
            name="Test Workflow",
            file_path=Path("/project/.claude/test.yml"),
        )

        # Create another workflow with same values
        workflow_copy = WorkflowInfo(
            name="Test Workflow",
            file_path=Path("/project/.claude/test.yml"),
        )

        # Should be equal by value but different objects
        assert workflow.name == workflow_copy.name
        assert workflow.file_path == workflow_copy.file_path


class TestEdgeCases:
    """Tests for edge cases and boundary conditions."""

    def test_format_workflow_list_with_newlines_in_name(self) -> None:
        """Test handling of workflow names containing newlines."""
        workflows = [
            WorkflowInfo(
                name="Line1\nLine2",
                file_path=Path("/project/.claude/multiline.yml"),
            ),
        ]

        result = format_workflow_list(workflows)

        # The function doesn't sanitize names, so newline is preserved
        assert "Line1\nLine2" in result

    def test_format_workflow_list_with_tabs_in_name(self) -> None:
        """Test handling of workflow names containing tabs."""
        workflows = [
            WorkflowInfo(
                name="Tab\tSeparated",
                file_path=Path("/project/.claude/tabbed.yml"),
            ),
        ]

        result = format_workflow_list(workflows)

        assert "Tab\tSeparated" in result

    @patch("orchestrator.selector.questionary.select")
    @patch("orchestrator.selector.console")
    def test_select_workflow_interactive_with_keyboard_interrupt(
        self,
        mock_console: MagicMock,
        mock_select: MagicMock,
    ) -> None:
        """Test behavior when user presses Ctrl+C during selection."""
        mock_question = MagicMock()
        mock_question.ask.return_value = None  # questionary returns None on Ctrl+C
        mock_select.return_value = mock_question

        workflows = [
            WorkflowInfo(name="Test", file_path=Path("/project/.claude/test.yml")),
        ]

        result = select_workflow_interactive(workflows)

        assert result is None

    @patch("orchestrator.selector.questionary.select")
    @patch("orchestrator.selector.console")
    def test_select_workflow_interactive_choice_values_are_workflow_objects(
        self,
        mock_console: MagicMock,
        mock_select: MagicMock,
    ) -> None:
        """Test that choice values are actual WorkflowInfo objects."""
        workflows = [
            WorkflowInfo(name="Build", file_path=Path("/project/.claude/build.yml")),
            WorkflowInfo(name="Test", file_path=Path("/project/.claude/test.yml")),
        ]

        mock_question = MagicMock()
        mock_question.ask.return_value = None
        mock_select.return_value = mock_question

        select_workflow_interactive(workflows)

        call_kwargs = mock_select.call_args[1]
        choices = call_kwargs["choices"]

        # Verify workflow choices have WorkflowInfo objects as values
        for i, workflow in enumerate(workflows):
            assert choices[i].value is workflow

        # Verify cancel option is present (questionary defaults value to title when None is passed)
        assert choices[-1].title == "Cancel"

    def test_format_workflow_list_with_path_containing_spaces(self) -> None:
        """Test formatting workflow with spaces in file path."""
        workflows = [
            WorkflowInfo(
                name="Spaced Path Workflow",
                file_path=Path("/project/my folder/.claude/work flow.yml"),
            ),
        ]

        result = format_workflow_list(workflows)

        assert "work flow.yml" in result
        assert "my folder" not in result  # Only filename should be shown
