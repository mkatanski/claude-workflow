"""Tests for variable externalization in interpolate_for_claude().

This module tests the automatic externalization of large variables to temp files
when interpolating prompts for Claude Code execution.
"""

import json
import tempfile
from pathlib import Path

import pytest

from orchestrator.context import ExecutionContext, LARGE_VARIABLE_THRESHOLD


class TestVariablePathToFilename:
    """Tests for _variable_path_to_filename helper method."""

    def test_simple_variable_name(self) -> None:
        """Test simple variable name conversion."""
        ctx = ExecutionContext()
        assert ctx._variable_path_to_filename("data") == "data.txt"

    def test_nested_path_with_dots(self) -> None:
        """Test nested path with dots converted to underscores."""
        ctx = ExecutionContext()
        assert ctx._variable_path_to_filename("result.data.content") == "result_data_content.txt"

    def test_path_with_array_index(self) -> None:
        """Test path with array index."""
        ctx = ExecutionContext()
        assert ctx._variable_path_to_filename("items.0.name") == "items_0_name.txt"


class TestResolveVariableValue:
    """Tests for _resolve_variable_value helper method."""

    def test_simple_string_variable(self) -> None:
        """Test resolving a simple string variable."""
        ctx = ExecutionContext()
        ctx.set("name", "Alice")
        assert ctx._resolve_variable_value("name") == "Alice"

    def test_nested_dict_path(self) -> None:
        """Test resolving a nested dictionary path."""
        ctx = ExecutionContext()
        ctx.set("user", {"name": "Bob", "age": 30})
        assert ctx._resolve_variable_value("user.name") == "Bob"
        assert ctx._resolve_variable_value("user.age") == "30"

    def test_json_string_parsed(self) -> None:
        """Test that JSON strings are parsed for path resolution."""
        ctx = ExecutionContext()
        ctx.set("data", '{"key": "value"}')
        assert ctx._resolve_variable_value("data.key") == "value"

    def test_missing_variable_returns_none(self) -> None:
        """Test that missing variable returns None."""
        ctx = ExecutionContext()
        assert ctx._resolve_variable_value("unknown") is None

    def test_missing_path_returns_none(self) -> None:
        """Test that missing path in existing variable returns None."""
        ctx = ExecutionContext()
        ctx.set("data", {"a": 1})
        assert ctx._resolve_variable_value("data.b.c") is None

    def test_dict_value_serialized_to_json(self) -> None:
        """Test that dict values are serialized to JSON."""
        ctx = ExecutionContext()
        ctx.set("obj", {"nested": {"key": "value"}})
        result = ctx._resolve_variable_value("obj.nested")
        assert result == '{"key": "value"}'

    def test_list_value_serialized_to_json(self) -> None:
        """Test that list values are serialized to JSON."""
        ctx = ExecutionContext()
        ctx.set("items", {"list": [1, 2, 3]})
        result = ctx._resolve_variable_value("items.list")
        assert result == "[1, 2, 3]"


class TestInterpolateForClaude:
    """Tests for interpolate_for_claude method."""

    def test_small_variable_inline(self) -> None:
        """Test that small variables are replaced inline."""
        ctx = ExecutionContext()
        ctx.set("name", "Alice")
        result = ctx.interpolate_for_claude("Hello {name}!")
        assert result == "Hello Alice!"

    def test_small_variable_no_temp_dir_needed(self) -> None:
        """Test that small variables don't need temp_dir."""
        ctx = ExecutionContext()
        ctx.set("data", "small content")
        # No temp_dir set, but should work for small variables
        result = ctx.interpolate_for_claude("Data: {data}")
        assert result == "Data: small content"

    def test_large_variable_externalized(self) -> None:
        """Test that large variables are written to temp files."""
        with tempfile.TemporaryDirectory() as temp_dir:
            ctx = ExecutionContext()
            large_content = "x" * (LARGE_VARIABLE_THRESHOLD + 100)
            ctx.set("large_data", large_content)
            ctx.set("_temp_dir", temp_dir)

            result = ctx.interpolate_for_claude("Content: {large_data}")

            # Should contain @filepath reference
            assert result.startswith("Content: @")
            assert "large_data.txt" in result

            # File should exist and contain the content
            file_path = Path(temp_dir) / "large_data.txt"
            assert file_path.exists()
            assert file_path.read_text() == large_content

    def test_large_variable_uses_absolute_path(self) -> None:
        """Test that externalized variables use absolute paths."""
        with tempfile.TemporaryDirectory() as temp_dir:
            ctx = ExecutionContext()
            large_content = "x" * (LARGE_VARIABLE_THRESHOLD + 100)
            ctx.set("data", large_content)
            ctx.set("_temp_dir", temp_dir)

            result = ctx.interpolate_for_claude("{data}")

            # Extract the path after @
            file_path = result[1:]  # Remove @
            assert Path(file_path).is_absolute()

    def test_duplicate_large_variable_single_file(self) -> None:
        """Test that duplicate references to same large variable share one file."""
        with tempfile.TemporaryDirectory() as temp_dir:
            ctx = ExecutionContext()
            large_content = "x" * (LARGE_VARIABLE_THRESHOLD + 100)
            ctx.set("data", large_content)
            ctx.set("_temp_dir", temp_dir)

            result = ctx.interpolate_for_claude("First: {data}\nSecond: {data}")

            # Both should reference the same file
            lines = result.split("\n")
            first_ref = lines[0].replace("First: @", "")
            second_ref = lines[1].replace("Second: @", "")
            assert first_ref == second_ref

            # Only one file should exist
            files = list(Path(temp_dir).glob("*.txt"))
            assert len(files) == 1

    def test_nested_path_externalized(self) -> None:
        """Test that nested paths create correctly named files."""
        with tempfile.TemporaryDirectory() as temp_dir:
            ctx = ExecutionContext()
            large_content = "x" * (LARGE_VARIABLE_THRESHOLD + 100)
            ctx.set("result", {"data": {"content": large_content}})
            ctx.set("_temp_dir", temp_dir)

            result = ctx.interpolate_for_claude("{result.data.content}")

            # File should be named with underscores
            file_path = Path(temp_dir) / "result_data_content.txt"
            assert file_path.exists()
            assert "result_data_content.txt" in result

    def test_missing_variable_unchanged(self) -> None:
        """Test that missing variables remain unchanged."""
        with tempfile.TemporaryDirectory() as temp_dir:
            ctx = ExecutionContext()
            ctx.set("_temp_dir", temp_dir)

            result = ctx.interpolate_for_claude("Value: {unknown}")
            assert result == "Value: {unknown}"

    def test_no_temp_dir_raises_for_large_variable(self) -> None:
        """Test that missing temp_dir raises error for large variables."""
        ctx = ExecutionContext()
        large_content = "x" * (LARGE_VARIABLE_THRESHOLD + 100)
        ctx.set("data", large_content)
        # No _temp_dir set

        with pytest.raises(ValueError, match="no temp directory available"):
            ctx.interpolate_for_claude("{data}")

    def test_mixed_small_and_large_variables(self) -> None:
        """Test template with both small and large variables."""
        with tempfile.TemporaryDirectory() as temp_dir:
            ctx = ExecutionContext()
            ctx.set("name", "Alice")
            ctx.set("large_data", "x" * (LARGE_VARIABLE_THRESHOLD + 100))
            ctx.set("_temp_dir", temp_dir)

            result = ctx.interpolate_for_claude("Name: {name}, Data: {large_data}")

            assert "Name: Alice" in result
            assert "@" in result  # Large variable externalized
            assert "{large_data}" not in result  # Placeholder replaced

    def test_exactly_at_threshold_not_externalized(self) -> None:
        """Test that variable exactly at threshold is NOT externalized."""
        with tempfile.TemporaryDirectory() as temp_dir:
            ctx = ExecutionContext()
            exact_content = "x" * LARGE_VARIABLE_THRESHOLD
            ctx.set("data", exact_content)
            ctx.set("_temp_dir", temp_dir)

            result = ctx.interpolate_for_claude("{data}")

            # Should be inline, not @reference
            assert not result.startswith("@")
            assert result == exact_content

            # No file should be created
            files = list(Path(temp_dir).glob("*.txt"))
            assert len(files) == 0

    def test_custom_temp_dir_parameter(self) -> None:
        """Test that temp_dir parameter overrides context variable."""
        with tempfile.TemporaryDirectory() as temp_dir1:
            with tempfile.TemporaryDirectory() as temp_dir2:
                ctx = ExecutionContext()
                large_content = "x" * (LARGE_VARIABLE_THRESHOLD + 100)
                ctx.set("data", large_content)
                ctx.set("_temp_dir", temp_dir1)

                # Use temp_dir parameter to override
                result = ctx.interpolate_for_claude("{data}", temp_dir=temp_dir2)

                # File should be in temp_dir2, not temp_dir1
                assert temp_dir2 in result
                assert not (Path(temp_dir1) / "data.txt").exists()
                assert (Path(temp_dir2) / "data.txt").exists()

    def test_fresh_file_on_each_call(self) -> None:
        """Test that each call writes fresh content to files."""
        with tempfile.TemporaryDirectory() as temp_dir:
            ctx = ExecutionContext()
            ctx.set("_temp_dir", temp_dir)

            # First call with initial content
            content1 = "a" * (LARGE_VARIABLE_THRESHOLD + 100)
            ctx.set("data", content1)
            ctx.interpolate_for_claude("{data}")

            file_path = Path(temp_dir) / "data.txt"
            assert file_path.read_text() == content1

            # Second call with different content
            content2 = "b" * (LARGE_VARIABLE_THRESHOLD + 100)
            ctx.set("data", content2)
            ctx.interpolate_for_claude("{data}")

            # File should have new content
            assert file_path.read_text() == content2

    def test_json_content_in_file(self) -> None:
        """Test that dict/list values are written as JSON to files."""
        with tempfile.TemporaryDirectory() as temp_dir:
            ctx = ExecutionContext()
            # Create a large dict that when serialized exceeds threshold
            large_dict = {"items": ["x" * 1000 for _ in range(20)]}
            ctx.set("data", large_dict)
            ctx.set("_temp_dir", temp_dir)

            # The serialized JSON should exceed threshold
            serialized = json.dumps(large_dict)
            assert len(serialized) > LARGE_VARIABLE_THRESHOLD

            result = ctx.interpolate_for_claude("{data}")

            # Should be externalized
            assert result.startswith("@")

            # File content should be valid JSON
            file_path = Path(temp_dir) / "data.txt"
            file_content = file_path.read_text()
            assert json.loads(file_content) == large_dict
