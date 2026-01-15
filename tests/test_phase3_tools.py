"""Tests for Phase 3 tools: json tool and foreach enhancements.

These tests cover the JSON manipulation tool and the new foreach
features (filter, order_by, break_when).
"""

import json
from pathlib import Path
from typing import Any, Dict
from unittest.mock import MagicMock, patch

import pytest

from orchestrator.context import ExecutionContext
from orchestrator.tools import ToolRegistry
from orchestrator.tools.base import LoopSignal, ToolResult
from orchestrator.tools.foreach import ForEachTool
from orchestrator.tools.json_tool import JsonTool


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
# JsonTool Validation Tests
# =============================================================================


class TestJsonToolValidation:
    """Tests for JsonTool validation."""

    def test_validate_requires_action(self) -> None:
        """Test that 'action' field is required."""
        tool = JsonTool()
        step: Dict[str, Any] = {"file": "test.json"}

        with pytest.raises(ValueError, match="requires 'action' field"):
            tool.validate_step(step)

    def test_validate_invalid_action(self) -> None:
        """Test that invalid action is rejected."""
        tool = JsonTool()
        step: Dict[str, Any] = {"action": "invalid", "file": "test.json"}

        with pytest.raises(ValueError, match="Invalid action"):
            tool.validate_step(step)

    def test_validate_requires_file_or_source(self) -> None:
        """Test that either 'file' or 'source' is required."""
        tool = JsonTool()
        step: Dict[str, Any] = {"action": "query", "query": ".field"}

        with pytest.raises(ValueError, match="requires either 'file'"):
            tool.validate_step(step)

    def test_validate_query_requires_query_field(self) -> None:
        """Test that query action requires 'query' field."""
        tool = JsonTool()
        step: Dict[str, Any] = {"action": "query", "file": "test.json"}

        with pytest.raises(ValueError, match="requires 'query' field"):
            tool.validate_step(step)

    def test_validate_set_requires_path_and_value(self) -> None:
        """Test that set action requires 'path' and 'value'."""
        tool = JsonTool()

        # Missing path
        step: Dict[str, Any] = {"action": "set", "file": "test.json", "value": "test"}
        with pytest.raises(ValueError, match="requires 'path' field"):
            tool.validate_step(step)

        # Missing value
        step = {"action": "set", "file": "test.json", "path": ".field"}
        with pytest.raises(ValueError, match="requires 'value' field"):
            tool.validate_step(step)

    def test_validate_update_requires_operation(self) -> None:
        """Test that update action requires 'operation' field."""
        tool = JsonTool()
        step: Dict[str, Any] = {
            "action": "update",
            "file": "test.json",
            "path": ".field",
            "value": "test",
        }

        with pytest.raises(ValueError, match="requires 'operation' field"):
            tool.validate_step(step)

    def test_validate_update_invalid_operation(self) -> None:
        """Test that invalid update operation is rejected."""
        tool = JsonTool()
        step: Dict[str, Any] = {
            "action": "update",
            "file": "test.json",
            "path": ".field",
            "operation": "invalid",
            "value": "test",
        }

        with pytest.raises(ValueError, match="Invalid operation"):
            tool.validate_step(step)

    def test_validate_delete_requires_path(self) -> None:
        """Test that delete action requires 'path' field."""
        tool = JsonTool()
        step: Dict[str, Any] = {"action": "delete", "file": "test.json"}

        with pytest.raises(ValueError, match="requires 'path' field"):
            tool.validate_step(step)

    def test_validate_accepts_valid_steps(self) -> None:
        """Test that valid configurations pass validation."""
        tool = JsonTool()

        # Valid query
        tool.validate_step({"action": "query", "file": "test.json", "query": ".field"})

        # Valid set
        tool.validate_step(
            {"action": "set", "file": "test.json", "path": ".field", "value": "test"}
        )

        # Valid update
        tool.validate_step(
            {
                "action": "update",
                "file": "test.json",
                "path": ".arr",
                "operation": "append",
                "value": "item",
            }
        )

        # Valid delete
        tool.validate_step({"action": "delete", "file": "test.json", "path": ".field"})


# =============================================================================
# JsonTool Query Tests
# =============================================================================


class TestJsonToolQuery:
    """Tests for JsonTool query action."""

    def test_query_simple_field(
        self, context: ExecutionContext, mock_tmux: MagicMock, tmp_path: Path
    ) -> None:
        """Test querying a simple field."""
        tool = JsonTool()
        json_file = tmp_path / "test.json"
        json_file.write_text('{"name": "John", "age": 30}')

        step: Dict[str, Any] = {
            "action": "query",
            "file": str(json_file),
            "query": ".name",
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        assert result.output == "John"

    def test_query_nested_field(
        self, context: ExecutionContext, mock_tmux: MagicMock, tmp_path: Path
    ) -> None:
        """Test querying a nested field."""
        tool = JsonTool()
        json_file = tmp_path / "test.json"
        json_file.write_text('{"user": {"profile": {"name": "Jane"}}}')

        step: Dict[str, Any] = {
            "action": "query",
            "file": str(json_file),
            "query": ".user.profile.name",
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        assert result.output == "Jane"

    def test_query_array_index(
        self, context: ExecutionContext, mock_tmux: MagicMock, tmp_path: Path
    ) -> None:
        """Test querying an array element."""
        tool = JsonTool()
        json_file = tmp_path / "test.json"
        json_file.write_text('{"items": ["a", "b", "c"]}')

        step: Dict[str, Any] = {
            "action": "query",
            "file": str(json_file),
            "query": ".items[1]",
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        assert result.output == "b"

    def test_query_returns_json_for_object(
        self, context: ExecutionContext, mock_tmux: MagicMock, tmp_path: Path
    ) -> None:
        """Test that querying an object returns JSON string."""
        tool = JsonTool()
        json_file = tmp_path / "test.json"
        json_file.write_text('{"user": {"name": "John", "age": 30}}')

        step: Dict[str, Any] = {
            "action": "query",
            "file": str(json_file),
            "query": ".user",
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        parsed = json.loads(result.output or "")
        assert parsed == {"name": "John", "age": 30}

    def test_query_from_variable(
        self, context: ExecutionContext, mock_tmux: MagicMock
    ) -> None:
        """Test querying from a context variable."""
        tool = JsonTool()
        context.set("data", '{"items": [1, 2, 3]}')

        step: Dict[str, Any] = {
            "action": "query",
            "source": "data",
            "query": ".items[0]",
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        assert result.output == "1"

    def test_query_nonexistent_path_fails(
        self, context: ExecutionContext, mock_tmux: MagicMock, tmp_path: Path
    ) -> None:
        """Test that querying a nonexistent path fails."""
        tool = JsonTool()
        json_file = tmp_path / "test.json"
        json_file.write_text('{"name": "John"}')

        step: Dict[str, Any] = {
            "action": "query",
            "file": str(json_file),
            "query": ".nonexistent",
        }

        result = tool.execute(step, context, mock_tmux)

        assert not result.success
        assert "not found" in (result.error or "").lower()


# =============================================================================
# JsonTool Set Tests
# =============================================================================


class TestJsonToolSet:
    """Tests for JsonTool set action."""

    def test_set_simple_field(
        self, context: ExecutionContext, mock_tmux: MagicMock, tmp_path: Path
    ) -> None:
        """Test setting a simple field."""
        tool = JsonTool()
        json_file = tmp_path / "test.json"
        json_file.write_text('{"name": "John"}')

        step: Dict[str, Any] = {
            "action": "set",
            "file": str(json_file),
            "path": ".name",
            "value": "Jane",
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        data = json.loads(json_file.read_text())
        assert data["name"] == "Jane"

    def test_set_nested_field(
        self, context: ExecutionContext, mock_tmux: MagicMock, tmp_path: Path
    ) -> None:
        """Test setting a nested field."""
        tool = JsonTool()
        json_file = tmp_path / "test.json"
        json_file.write_text('{"user": {"name": "John"}}')

        step: Dict[str, Any] = {
            "action": "set",
            "file": str(json_file),
            "path": ".user.name",
            "value": "Jane",
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        data = json.loads(json_file.read_text())
        assert data["user"]["name"] == "Jane"

    def test_set_creates_intermediate_objects(
        self, context: ExecutionContext, mock_tmux: MagicMock, tmp_path: Path
    ) -> None:
        """Test that set creates intermediate objects if needed."""
        tool = JsonTool()
        json_file = tmp_path / "test.json"
        json_file.write_text("{}")

        step: Dict[str, Any] = {
            "action": "set",
            "file": str(json_file),
            "path": ".a.b.c",
            "value": "deep",
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        data = json.loads(json_file.read_text())
        assert data["a"]["b"]["c"] == "deep"

    def test_set_array_element(
        self, context: ExecutionContext, mock_tmux: MagicMock, tmp_path: Path
    ) -> None:
        """Test setting an array element."""
        tool = JsonTool()
        json_file = tmp_path / "test.json"
        json_file.write_text('{"items": ["a", "b", "c"]}')

        step: Dict[str, Any] = {
            "action": "set",
            "file": str(json_file),
            "path": ".items[1]",
            "value": "modified",
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        data = json.loads(json_file.read_text())
        assert data["items"] == ["a", "modified", "c"]

    def test_set_with_variable_interpolation(
        self, context: ExecutionContext, mock_tmux: MagicMock, tmp_path: Path
    ) -> None:
        """Test setting a value with variable interpolation."""
        tool = JsonTool()
        json_file = tmp_path / "test.json"
        json_file.write_text('{"status": "pending"}')
        context.set("new_status", "completed")

        step: Dict[str, Any] = {
            "action": "set",
            "file": str(json_file),
            "path": ".status",
            "value": "{new_status}",
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        data = json.loads(json_file.read_text())
        assert data["status"] == "completed"


# =============================================================================
# JsonTool Update Tests
# =============================================================================


class TestJsonToolUpdate:
    """Tests for JsonTool update action."""

    def test_update_append_to_array(
        self, context: ExecutionContext, mock_tmux: MagicMock, tmp_path: Path
    ) -> None:
        """Test appending to an array."""
        tool = JsonTool()
        json_file = tmp_path / "test.json"
        json_file.write_text('{"items": [1, 2, 3]}')

        step: Dict[str, Any] = {
            "action": "update",
            "file": str(json_file),
            "path": ".items",
            "operation": "append",
            "value": 4,
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        data = json.loads(json_file.read_text())
        assert data["items"] == [1, 2, 3, 4]

    def test_update_prepend_to_array(
        self, context: ExecutionContext, mock_tmux: MagicMock, tmp_path: Path
    ) -> None:
        """Test prepending to an array."""
        tool = JsonTool()
        json_file = tmp_path / "test.json"
        json_file.write_text('{"items": [2, 3]}')

        step: Dict[str, Any] = {
            "action": "update",
            "file": str(json_file),
            "path": ".items",
            "operation": "prepend",
            "value": 1,
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        data = json.loads(json_file.read_text())
        assert data["items"] == [1, 2, 3]

    def test_update_increment(
        self, context: ExecutionContext, mock_tmux: MagicMock, tmp_path: Path
    ) -> None:
        """Test incrementing a numeric value."""
        tool = JsonTool()
        json_file = tmp_path / "test.json"
        json_file.write_text('{"count": 5}')

        step: Dict[str, Any] = {
            "action": "update",
            "file": str(json_file),
            "path": ".count",
            "operation": "increment",
            "value": 3,
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        data = json.loads(json_file.read_text())
        assert data["count"] == 8

    def test_update_merge_objects(
        self, context: ExecutionContext, mock_tmux: MagicMock, tmp_path: Path
    ) -> None:
        """Test merging objects."""
        tool = JsonTool()
        json_file = tmp_path / "test.json"
        json_file.write_text('{"user": {"name": "John"}}')

        step: Dict[str, Any] = {
            "action": "update",
            "file": str(json_file),
            "path": ".user",
            "operation": "merge",
            "value": {"age": 30, "city": "NYC"},
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        data = json.loads(json_file.read_text())
        assert data["user"] == {"name": "John", "age": 30, "city": "NYC"}

    def test_update_creates_array_for_append(
        self, context: ExecutionContext, mock_tmux: MagicMock, tmp_path: Path
    ) -> None:
        """Test that append creates array if it doesn't exist."""
        tool = JsonTool()
        json_file = tmp_path / "test.json"
        json_file.write_text("{}")

        step: Dict[str, Any] = {
            "action": "update",
            "file": str(json_file),
            "path": ".items",
            "operation": "append",
            "value": "first",
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        data = json.loads(json_file.read_text())
        assert data["items"] == ["first"]


# =============================================================================
# JsonTool Delete Tests
# =============================================================================


class TestJsonToolDelete:
    """Tests for JsonTool delete action."""

    def test_delete_field(
        self, context: ExecutionContext, mock_tmux: MagicMock, tmp_path: Path
    ) -> None:
        """Test deleting a field."""
        tool = JsonTool()
        json_file = tmp_path / "test.json"
        json_file.write_text('{"name": "John", "age": 30}')

        step: Dict[str, Any] = {
            "action": "delete",
            "file": str(json_file),
            "path": ".age",
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        data = json.loads(json_file.read_text())
        assert "age" not in data
        assert data["name"] == "John"

    def test_delete_array_element(
        self, context: ExecutionContext, mock_tmux: MagicMock, tmp_path: Path
    ) -> None:
        """Test deleting an array element."""
        tool = JsonTool()
        json_file = tmp_path / "test.json"
        json_file.write_text('{"items": ["a", "b", "c"]}')

        step: Dict[str, Any] = {
            "action": "delete",
            "file": str(json_file),
            "path": ".items[1]",
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        data = json.loads(json_file.read_text())
        assert data["items"] == ["a", "c"]

    def test_delete_nested_field(
        self, context: ExecutionContext, mock_tmux: MagicMock, tmp_path: Path
    ) -> None:
        """Test deleting a nested field."""
        tool = JsonTool()
        json_file = tmp_path / "test.json"
        json_file.write_text('{"user": {"name": "John", "age": 30}}')

        step: Dict[str, Any] = {
            "action": "delete",
            "file": str(json_file),
            "path": ".user.age",
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        data = json.loads(json_file.read_text())
        assert data["user"] == {"name": "John"}


# =============================================================================
# JsonTool File Operations Tests
# =============================================================================


class TestJsonToolFileOps:
    """Tests for JsonTool file operations."""

    def test_create_if_missing_file(
        self, context: ExecutionContext, mock_tmux: MagicMock, tmp_path: Path
    ) -> None:
        """Test creating file if it doesn't exist."""
        tool = JsonTool()
        json_file = tmp_path / "new.json"

        step: Dict[str, Any] = {
            "action": "set",
            "file": str(json_file),
            "path": ".name",
            "value": "Created",
            "create_if_missing": True,
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        assert json_file.exists()
        data = json.loads(json_file.read_text())
        assert data["name"] == "Created"

    def test_file_not_found_error(
        self, context: ExecutionContext, mock_tmux: MagicMock, tmp_path: Path
    ) -> None:
        """Test that missing file causes error without create_if_missing."""
        tool = JsonTool()
        json_file = tmp_path / "nonexistent.json"

        step: Dict[str, Any] = {
            "action": "query",
            "file": str(json_file),
            "query": ".field",
        }

        result = tool.execute(step, context, mock_tmux)

        assert not result.success
        assert "not found" in (result.error or "").lower()

    def test_relative_path(
        self, context: ExecutionContext, mock_tmux: MagicMock, tmp_path: Path
    ) -> None:
        """Test that relative paths are resolved from project path."""
        tool = JsonTool()
        json_file = tmp_path / "data.json"
        json_file.write_text('{"key": "value"}')

        step: Dict[str, Any] = {
            "action": "query",
            "file": "data.json",  # Relative path
            "query": ".key",
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        assert result.output == "value"


# =============================================================================
# JsonTool Advanced Query Tests (jq-style features)
# =============================================================================


class TestJsonToolArrayIteration:
    """Tests for array iteration syntax (.items[])."""

    def test_iteration_all_elements(self) -> None:
        """Test iterating over all array elements."""
        tool = JsonTool()
        data = {"items": [1, 2, 3]}

        result = tool._execute_query(data, ".items[]")

        assert result == [1, 2, 3]

    def test_iteration_with_field_access(self) -> None:
        """Test iterating and accessing field from each element."""
        tool = JsonTool()
        data = {
            "users": [
                {"name": "Alice", "age": 30},
                {"name": "Bob", "age": 25},
            ]
        }

        result = tool._execute_query(data, ".users[].name")

        assert result == ["Alice", "Bob"]

    def test_nested_iteration(self) -> None:
        """Test nested array iteration."""
        tool = JsonTool()
        data = {
            "groups": [
                {"items": [1, 2]},
                {"items": [3, 4]},
            ]
        }

        result = tool._execute_query(data, ".groups[].items[]")

        assert result == [1, 2, 3, 4]

    def test_iteration_empty_array(self) -> None:
        """Test iterating over empty array."""
        tool = JsonTool()
        data = {"items": []}

        result = tool._execute_query(data, ".items[]")

        assert result == []

    def test_iteration_on_non_array_fails(self) -> None:
        """Test that iterating over non-array raises error."""
        tool = JsonTool()
        data = {"value": "not an array"}

        with pytest.raises(TypeError):
            tool._execute_query(data, ".value[]")


class TestJsonToolPipeline:
    """Tests for pipeline operator (|)."""

    def test_simple_pipeline(self) -> None:
        """Test basic pipeline with two stages."""
        tool = JsonTool()
        data = {"items": [1, 2, 3]}

        result = tool._execute_query(data, ".items | length")

        assert result == 3

    def test_multi_stage_pipeline(self) -> None:
        """Test pipeline with multiple stages."""
        tool = JsonTool()
        data = {"items": [3, 1, 2]}

        result = tool._execute_query(data, ".items | sort | first")

        assert result == 1

    def test_pipeline_with_iteration(self) -> None:
        """Test pipeline combining iteration and transforms."""
        tool = JsonTool()
        data = {
            "users": [
                {"name": "Alice"},
                {"name": "Bob"},
            ]
        }

        result = tool._execute_query(data, ".users[] | .name")

        assert result == ["Alice", "Bob"]


class TestJsonToolTransforms:
    """Tests for built-in transform functions."""

    def test_length_array(self) -> None:
        """Test length on array."""
        tool = JsonTool()
        data = {"items": [1, 2, 3, 4, 5]}

        result = tool._execute_query(data, ".items | length")

        assert result == 5

    def test_length_object(self) -> None:
        """Test length on object (key count)."""
        tool = JsonTool()
        data = {"config": {"a": 1, "b": 2, "c": 3}}

        result = tool._execute_query(data, ".config | length")

        assert result == 3

    def test_length_string(self) -> None:
        """Test length on string."""
        tool = JsonTool()
        data = {"text": "hello"}

        result = tool._execute_query(data, ".text | length")

        assert result == 5

    def test_to_entries(self) -> None:
        """Test to_entries transform."""
        tool = JsonTool()
        data = {"counts": {"a": 1, "b": 2}}

        result = tool._execute_query(data, ".counts | to_entries")

        assert len(result) == 2
        assert {"key": "a", "value": 1} in result
        assert {"key": "b", "value": 2} in result

    def test_from_entries(self) -> None:
        """Test from_entries transform."""
        tool = JsonTool()
        data = {"entries": [{"key": "x", "value": 10}, {"key": "y", "value": 20}]}

        result = tool._execute_query(data, ".entries | from_entries")

        assert result == {"x": 10, "y": 20}

    def test_keys(self) -> None:
        """Test keys transform."""
        tool = JsonTool()
        data = {"config": {"host": "localhost", "port": 8080}}

        result = tool._execute_query(data, ".config | keys")

        assert set(result) == {"host", "port"}

    def test_values(self) -> None:
        """Test values transform."""
        tool = JsonTool()
        data = {"config": {"a": 1, "b": 2}}

        result = tool._execute_query(data, ".config | values")

        assert set(result) == {1, 2}

    def test_sort(self) -> None:
        """Test sort transform."""
        tool = JsonTool()
        data = {"nums": [3, 1, 4, 1, 5]}

        result = tool._execute_query(data, ".nums | sort")

        assert result == [1, 1, 3, 4, 5]

    def test_reverse(self) -> None:
        """Test reverse transform."""
        tool = JsonTool()
        data = {"items": [1, 2, 3]}

        result = tool._execute_query(data, ".items | reverse")

        assert result == [3, 2, 1]

    def test_unique(self) -> None:
        """Test unique transform."""
        tool = JsonTool()
        data = {"nums": [1, 2, 2, 3, 1]}

        result = tool._execute_query(data, ".nums | unique")

        assert result == [1, 2, 3]

    def test_first_and_last(self) -> None:
        """Test first and last transforms."""
        tool = JsonTool()
        data = {"items": [10, 20, 30]}

        assert tool._execute_query(data, ".items | first") == 10
        assert tool._execute_query(data, ".items | last") == 30

    def test_min_max(self) -> None:
        """Test min and max transforms."""
        tool = JsonTool()
        data = {"nums": [5, 2, 8, 1, 9]}

        assert tool._execute_query(data, ".nums | min") == 1
        assert tool._execute_query(data, ".nums | max") == 9

    def test_add_numbers(self) -> None:
        """Test add transform on numbers."""
        tool = JsonTool()
        data = {"nums": [1, 2, 3, 4]}

        result = tool._execute_query(data, ".nums | add")

        assert result == 10

    def test_add_strings(self) -> None:
        """Test add transform on strings."""
        tool = JsonTool()
        data = {"parts": ["hello", " ", "world"]}

        result = tool._execute_query(data, ".parts | add")

        assert result == "hello world"

    def test_flatten(self) -> None:
        """Test flatten transform."""
        tool = JsonTool()
        data = {"nested": [[1, 2], [3, 4], [5]]}

        result = tool._execute_query(data, ".nested | flatten")

        assert result == [1, 2, 3, 4, 5]


class TestJsonToolSelect:
    """Tests for select() filter function."""

    def test_select_equality(self) -> None:
        """Test select with equality."""
        tool = JsonTool()
        data = {
            "items": [
                {"status": "active", "name": "A"},
                {"status": "inactive", "name": "B"},
                {"status": "active", "name": "C"},
            ]
        }

        result = tool._execute_query(data, '.items[] | select(.status == "active")')

        assert len(result) == 2
        assert all(item["status"] == "active" for item in result)

    def test_select_numeric_comparison(self) -> None:
        """Test select with numeric comparison."""
        tool = JsonTool()
        data = {"items": [{"value": 1}, {"value": 5}, {"value": 3}]}

        result = tool._execute_query(data, ".items[] | select(.value >= 3)")

        assert len(result) == 2

    def test_select_with_to_entries(self) -> None:
        """Test select on to_entries output (story-executor pattern)."""
        tool = JsonTool()
        data = {"retry_counts": {"story_1": 3, "story_2": 1, "story_3": 5}}

        result = tool._execute_query(
            data, ".retry_counts | to_entries | select(.value >= 3)"
        )

        assert len(result) == 2
        keys = [item["key"] for item in result]
        assert "story_1" in keys
        assert "story_3" in keys

    def test_select_contains(self) -> None:
        """Test select with contains operator."""
        tool = JsonTool()
        data = {
            "files": [
                {"name": "test_foo.py"},
                {"name": "bar.js"},
                {"name": "test_bar.py"},
            ]
        }

        result = tool._execute_query(data, '.files[] | select(.name contains "test")')

        assert len(result) == 2

    def test_select_starts_with(self) -> None:
        """Test select with starts_with operator."""
        tool = JsonTool()
        data = {"items": [{"id": "user_1"}, {"id": "admin_1"}, {"id": "user_2"}]}

        result = tool._execute_query(data, '.items[] | select(.id starts_with "user")')

        assert len(result) == 2


class TestJsonToolStringInterpolation:
    """Tests for string interpolation feature."""

    def test_simple_interpolation(self) -> None:
        """Test basic string interpolation."""
        tool = JsonTool()
        data = {"name": "Alice", "age": 30}

        result = tool._execute_query(data, '"Name: (.name)"')

        assert result == "Name: Alice"

    def test_multiple_fields(self) -> None:
        """Test interpolation with multiple fields."""
        tool = JsonTool()
        data = {"first": "John", "last": "Doe"}

        result = tool._execute_query(data, '"(.first) (.last)"')

        assert result == "John Doe"

    def test_interpolation_with_iteration(self) -> None:
        """Test string interpolation over array (story-executor pattern)."""
        tool = JsonTool()
        data = {
            "stories": [
                {"id": "story_1", "title": "Fix bug"},
                {"id": "story_2", "title": "Add feature"},
            ]
        }

        result = tool._execute_query(data, '.stories[] | "  - (.id): (.title)"')

        assert len(result) == 2
        assert "  - story_1: Fix bug" in result
        assert "  - story_2: Add feature" in result


class TestJsonToolArrayConstruction:
    """Tests for array construction [...] syntax."""

    def test_basic_array_construction(self) -> None:
        """Test basic array construction."""
        tool = JsonTool()
        data = {"items": [1, 2, 3]}

        result = tool._execute_query(data, "[.items[]]")

        assert result == [1, 2, 3]

    def test_array_construction_with_select(self) -> None:
        """Test array construction with select filter on objects."""
        tool = JsonTool()
        data = {"items": [{"v": 1}, {"v": 2}, {"v": 3}, {"v": 4}, {"v": 5}]}

        result = tool._execute_query(data, "[.items[] | select(.v >= 3)]")

        assert len(result) == 3
        assert all(item["v"] >= 3 for item in result)

    def test_array_construction_with_length(self) -> None:
        """Test array construction followed by length (story-executor pattern)."""
        tool = JsonTool()
        data = {"retry_counts": {"story_1": 3, "story_2": 1, "story_3": 5}}

        result = tool._execute_query(
            data, "[.retry_counts | to_entries | select(.value >= 3)] | length"
        )

        assert result == 2


class TestJsonToolComplexQueries:
    """Tests for complex query patterns from real workflows."""

    def test_story_executor_failed_count(self) -> None:
        """Test the pattern used in story-executor for counting failed stories."""
        tool = JsonTool()
        data = {
            "retry_counts": {
                "story_1": 3,
                "story_2": 1,
                "story_3": 5,
                "story_4": 0,
            }
        }

        # This is the exact pattern from story-executor
        result = tool._execute_query(
            data, "[.retry_counts | to_entries | select(.value >= 3)] | length"
        )

        assert result == 2  # story_1 and story_3

    def test_story_executor_story_list(self) -> None:
        """Test the pattern used to format story list."""
        tool = JsonTool()
        data = {
            "stories": [
                {"id": "story_1", "title": "Fix bug"},
                {"id": "story_2", "title": "Add feature"},
                {"id": "story_3", "title": "Refactor"},
            ]
        }

        # Pattern from story-executor for listing stories
        result = tool._execute_query(data, '.stories[] | "  - (.id): (.title)"')

        assert len(result) == 3
        assert "  - story_1: Fix bug" in result

    def test_story_count(self) -> None:
        """Test simple story count."""
        tool = JsonTool()
        data = {"stories": [{}, {}, {}], "completed": [{}]}

        stories_count = tool._execute_query(data, ".stories | length")
        completed_count = tool._execute_query(data, ".completed | length")

        assert stories_count == 3
        assert completed_count == 1


# =============================================================================
# ForEach Filter Tests
# =============================================================================


class TestForEachFilter:
    """Tests for ForEach filter enhancement."""

    def test_filter_equality(
        self, context: ExecutionContext, mock_tmux: MagicMock
    ) -> None:
        """Test filtering with equality check."""
        tool = ForEachTool()
        context.set(
            "items",
            json.dumps(
                [
                    {"status": "pending", "name": "A"},
                    {"status": "completed", "name": "B"},
                    {"status": "pending", "name": "C"},
                ]
            ),
        )

        captured_items: list[str] = []

        def mock_execute(
            step_dict: Dict[str, Any], ctx: ExecutionContext, tmux: MagicMock
        ) -> ToolResult:
            item_json = ctx.get("item") or "{}"
            item = json.loads(item_json)
            captured_items.append(item.get("name", ""))
            return ToolResult(success=True)

        mock_inner_tool = MagicMock()
        mock_inner_tool.validate_step = MagicMock()
        mock_inner_tool.execute = MagicMock(side_effect=mock_execute)

        step: Dict[str, Any] = {
            "name": "Filter Test",
            "source": "items",
            "item_var": "item",
            "foreach_filter": '.status == "pending"',
            "steps": [{"name": "inner", "tool": "bash", "command": "echo"}],
        }

        with patch.object(ToolRegistry, "get", return_value=mock_inner_tool):
            result = tool.execute(step, context, mock_tmux)

        assert result.success
        assert captured_items == ["A", "C"]

    def test_filter_numeric_comparison(
        self, context: ExecutionContext, mock_tmux: MagicMock
    ) -> None:
        """Test filtering with numeric comparison."""
        tool = ForEachTool()
        context.set(
            "items",
            json.dumps(
                [
                    {"value": 5, "name": "A"},
                    {"value": 15, "name": "B"},
                    {"value": 8, "name": "C"},
                ]
            ),
        )

        captured_items: list[str] = []

        def mock_execute(
            step_dict: Dict[str, Any], ctx: ExecutionContext, tmux: MagicMock
        ) -> ToolResult:
            item_json = ctx.get("item") or "{}"
            item = json.loads(item_json)
            captured_items.append(item.get("name", ""))
            return ToolResult(success=True)

        mock_inner_tool = MagicMock()
        mock_inner_tool.validate_step = MagicMock()
        mock_inner_tool.execute = MagicMock(side_effect=mock_execute)

        step: Dict[str, Any] = {
            "name": "Filter Test",
            "source": "items",
            "item_var": "item",
            "foreach_filter": ".value > 7",
            "steps": [{"name": "inner", "tool": "bash", "command": "echo"}],
        }

        with patch.object(ToolRegistry, "get", return_value=mock_inner_tool):
            result = tool.execute(step, context, mock_tmux)

        assert result.success
        assert captured_items == ["B", "C"]

    def test_filter_contains(
        self, context: ExecutionContext, mock_tmux: MagicMock
    ) -> None:
        """Test filtering with contains operator."""
        tool = ForEachTool()
        context.set(
            "items",
            json.dumps(
                [
                    {"name": "Apple Pie"},
                    {"name": "Banana Split"},
                    {"name": "Apple Crisp"},
                ]
            ),
        )

        captured_items: list[str] = []

        def mock_execute(
            step_dict: Dict[str, Any], ctx: ExecutionContext, tmux: MagicMock
        ) -> ToolResult:
            item_json = ctx.get("item") or "{}"
            item = json.loads(item_json)
            captured_items.append(item.get("name", ""))
            return ToolResult(success=True)

        mock_inner_tool = MagicMock()
        mock_inner_tool.validate_step = MagicMock()
        mock_inner_tool.execute = MagicMock(side_effect=mock_execute)

        step: Dict[str, Any] = {
            "name": "Filter Test",
            "source": "items",
            "item_var": "item",
            "foreach_filter": '.name contains "Apple"',
            "steps": [{"name": "inner", "tool": "bash", "command": "echo"}],
        }

        with patch.object(ToolRegistry, "get", return_value=mock_inner_tool):
            result = tool.execute(step, context, mock_tmux)

        assert result.success
        assert captured_items == ["Apple Pie", "Apple Crisp"]

    def test_filter_nested_field(
        self, context: ExecutionContext, mock_tmux: MagicMock
    ) -> None:
        """Test filtering on nested field."""
        tool = ForEachTool()
        context.set(
            "items",
            json.dumps(
                [
                    {"user": {"role": "admin"}, "name": "A"},
                    {"user": {"role": "user"}, "name": "B"},
                    {"user": {"role": "admin"}, "name": "C"},
                ]
            ),
        )

        captured_items: list[str] = []

        def mock_execute(
            step_dict: Dict[str, Any], ctx: ExecutionContext, tmux: MagicMock
        ) -> ToolResult:
            item_json = ctx.get("item") or "{}"
            item = json.loads(item_json)
            captured_items.append(item.get("name", ""))
            return ToolResult(success=True)

        mock_inner_tool = MagicMock()
        mock_inner_tool.validate_step = MagicMock()
        mock_inner_tool.execute = MagicMock(side_effect=mock_execute)

        step: Dict[str, Any] = {
            "name": "Filter Test",
            "source": "items",
            "item_var": "item",
            "foreach_filter": '.user.role == "admin"',
            "steps": [{"name": "inner", "tool": "bash", "command": "echo"}],
        }

        with patch.object(ToolRegistry, "get", return_value=mock_inner_tool):
            result = tool.execute(step, context, mock_tmux)

        assert result.success
        assert captured_items == ["A", "C"]


# =============================================================================
# ForEach OrderBy Tests
# =============================================================================


class TestForEachOrderBy:
    """Tests for ForEach order_by enhancement."""

    def test_order_by_ascending(
        self, context: ExecutionContext, mock_tmux: MagicMock
    ) -> None:
        """Test sorting in ascending order."""
        tool = ForEachTool()
        context.set(
            "items",
            json.dumps(
                [
                    {"priority": 3, "name": "C"},
                    {"priority": 1, "name": "A"},
                    {"priority": 2, "name": "B"},
                ]
            ),
        )

        captured_items: list[str] = []

        def mock_execute(
            step_dict: Dict[str, Any], ctx: ExecutionContext, tmux: MagicMock
        ) -> ToolResult:
            item_json = ctx.get("item") or "{}"
            item = json.loads(item_json)
            captured_items.append(item.get("name", ""))
            return ToolResult(success=True)

        mock_inner_tool = MagicMock()
        mock_inner_tool.validate_step = MagicMock()
        mock_inner_tool.execute = MagicMock(side_effect=mock_execute)

        step: Dict[str, Any] = {
            "name": "OrderBy Test",
            "source": "items",
            "item_var": "item",
            "order_by": ".priority",
            "steps": [{"name": "inner", "tool": "bash", "command": "echo"}],
        }

        with patch.object(ToolRegistry, "get", return_value=mock_inner_tool):
            result = tool.execute(step, context, mock_tmux)

        assert result.success
        assert captured_items == ["A", "B", "C"]

    def test_order_by_descending(
        self, context: ExecutionContext, mock_tmux: MagicMock
    ) -> None:
        """Test sorting in descending order."""
        tool = ForEachTool()
        context.set(
            "items",
            json.dumps(
                [
                    {"priority": 1, "name": "A"},
                    {"priority": 3, "name": "C"},
                    {"priority": 2, "name": "B"},
                ]
            ),
        )

        captured_items: list[str] = []

        def mock_execute(
            step_dict: Dict[str, Any], ctx: ExecutionContext, tmux: MagicMock
        ) -> ToolResult:
            item_json = ctx.get("item") or "{}"
            item = json.loads(item_json)
            captured_items.append(item.get("name", ""))
            return ToolResult(success=True)

        mock_inner_tool = MagicMock()
        mock_inner_tool.validate_step = MagicMock()
        mock_inner_tool.execute = MagicMock(side_effect=mock_execute)

        step: Dict[str, Any] = {
            "name": "OrderBy Test",
            "source": "items",
            "item_var": "item",
            "order_by": ".priority desc",
            "steps": [{"name": "inner", "tool": "bash", "command": "echo"}],
        }

        with patch.object(ToolRegistry, "get", return_value=mock_inner_tool):
            result = tool.execute(step, context, mock_tmux)

        assert result.success
        assert captured_items == ["C", "B", "A"]

    def test_order_by_string_field(
        self, context: ExecutionContext, mock_tmux: MagicMock
    ) -> None:
        """Test sorting by string field."""
        tool = ForEachTool()
        context.set(
            "items",
            json.dumps(
                [
                    {"name": "Zebra"},
                    {"name": "Apple"},
                    {"name": "Mango"},
                ]
            ),
        )

        captured_items: list[str] = []

        def mock_execute(
            step_dict: Dict[str, Any], ctx: ExecutionContext, tmux: MagicMock
        ) -> ToolResult:
            item_json = ctx.get("item") or "{}"
            item = json.loads(item_json)
            captured_items.append(item.get("name", ""))
            return ToolResult(success=True)

        mock_inner_tool = MagicMock()
        mock_inner_tool.validate_step = MagicMock()
        mock_inner_tool.execute = MagicMock(side_effect=mock_execute)

        step: Dict[str, Any] = {
            "name": "OrderBy Test",
            "source": "items",
            "item_var": "item",
            "order_by": ".name",
            "steps": [{"name": "inner", "tool": "bash", "command": "echo"}],
        }

        with patch.object(ToolRegistry, "get", return_value=mock_inner_tool):
            result = tool.execute(step, context, mock_tmux)

        assert result.success
        assert captured_items == ["Apple", "Mango", "Zebra"]


# =============================================================================
# ForEach BreakWhen Tests
# =============================================================================


class TestForEachBreakWhen:
    """Tests for ForEach break_when enhancement."""

    def test_break_when_condition_met(
        self, context: ExecutionContext, mock_tmux: MagicMock
    ) -> None:
        """Test that loop breaks when condition is met."""
        tool = ForEachTool()
        context.set(
            "items",
            json.dumps([{"name": "A"}, {"name": "B"}, {"name": "C"}, {"name": "D"}]),
        )
        context.set("found", "false")

        captured_items: list[str] = []

        def mock_execute(
            step_dict: Dict[str, Any], ctx: ExecutionContext, tmux: MagicMock
        ) -> ToolResult:
            item_json = ctx.get("item") or "{}"
            item = json.loads(item_json)
            name = item.get("name", "")
            captured_items.append(name)
            if name == "B":
                ctx.set("found", "true")
            return ToolResult(success=True)

        mock_inner_tool = MagicMock()
        mock_inner_tool.validate_step = MagicMock()
        mock_inner_tool.execute = MagicMock(side_effect=mock_execute)

        step: Dict[str, Any] = {
            "name": "BreakWhen Test",
            "source": "items",
            "item_var": "item",
            "break_when": "{found} == true",
            "steps": [{"name": "inner", "tool": "bash", "command": "echo"}],
        }

        with patch.object(ToolRegistry, "get", return_value=mock_inner_tool):
            result = tool.execute(step, context, mock_tmux)

        assert result.success
        # Should stop after B because break_when is checked after each iteration
        assert captured_items == ["A", "B"]

    def test_break_when_condition_never_met(
        self, context: ExecutionContext, mock_tmux: MagicMock
    ) -> None:
        """Test that all items are processed when condition is never met."""
        tool = ForEachTool()
        context.set(
            "items",
            json.dumps([{"name": "A"}, {"name": "B"}, {"name": "C"}]),
        )
        context.set("should_stop", "false")

        captured_items: list[str] = []

        def mock_execute(
            step_dict: Dict[str, Any], ctx: ExecutionContext, tmux: MagicMock
        ) -> ToolResult:
            item_json = ctx.get("item") or "{}"
            item = json.loads(item_json)
            captured_items.append(item.get("name", ""))
            return ToolResult(success=True)

        mock_inner_tool = MagicMock()
        mock_inner_tool.validate_step = MagicMock()
        mock_inner_tool.execute = MagicMock(side_effect=mock_execute)

        step: Dict[str, Any] = {
            "name": "BreakWhen Test",
            "source": "items",
            "item_var": "item",
            "break_when": "{should_stop} == true",
            "steps": [{"name": "inner", "tool": "bash", "command": "echo"}],
        }

        with patch.object(ToolRegistry, "get", return_value=mock_inner_tool):
            result = tool.execute(step, context, mock_tmux)

        assert result.success
        assert captured_items == ["A", "B", "C"]


# =============================================================================
# ForEach Combined Features Tests
# =============================================================================


class TestForEachCombined:
    """Tests for combined ForEach features."""

    def test_filter_and_order_by(
        self, context: ExecutionContext, mock_tmux: MagicMock
    ) -> None:
        """Test using filter and order_by together."""
        tool = ForEachTool()
        context.set(
            "items",
            json.dumps(
                [
                    {"status": "pending", "priority": 3, "name": "C"},
                    {"status": "done", "priority": 1, "name": "A"},
                    {"status": "pending", "priority": 1, "name": "D"},
                    {"status": "pending", "priority": 2, "name": "B"},
                ]
            ),
        )

        captured_items: list[str] = []

        def mock_execute(
            step_dict: Dict[str, Any], ctx: ExecutionContext, tmux: MagicMock
        ) -> ToolResult:
            item_json = ctx.get("item") or "{}"
            item = json.loads(item_json)
            captured_items.append(item.get("name", ""))
            return ToolResult(success=True)

        mock_inner_tool = MagicMock()
        mock_inner_tool.validate_step = MagicMock()
        mock_inner_tool.execute = MagicMock(side_effect=mock_execute)

        step: Dict[str, Any] = {
            "name": "Combined Test",
            "source": "items",
            "item_var": "item",
            "foreach_filter": '.status == "pending"',
            "order_by": ".priority",
            "steps": [{"name": "inner", "tool": "bash", "command": "echo"}],
        }

        with patch.object(ToolRegistry, "get", return_value=mock_inner_tool):
            result = tool.execute(step, context, mock_tmux)

        assert result.success
        # Filtered to pending items, then sorted by priority
        assert captured_items == ["D", "B", "C"]

    def test_filter_order_by_and_break_when(
        self, context: ExecutionContext, mock_tmux: MagicMock
    ) -> None:
        """Test using filter, order_by, and break_when together."""
        tool = ForEachTool()
        context.set(
            "items",
            json.dumps(
                [
                    {"active": True, "priority": 5, "name": "E"},
                    {"active": False, "priority": 2, "name": "B"},
                    {"active": True, "priority": 1, "name": "A"},
                    {"active": True, "priority": 3, "name": "C"},
                    {"active": True, "priority": 4, "name": "D"},
                ]
            ),
        )
        context.set("processed_count", "0")

        captured_items: list[str] = []

        def mock_execute(
            step_dict: Dict[str, Any], ctx: ExecutionContext, tmux: MagicMock
        ) -> ToolResult:
            item_json = ctx.get("item") or "{}"
            item = json.loads(item_json)
            captured_items.append(item.get("name", ""))
            count = int(ctx.get("processed_count") or "0") + 1
            ctx.set("processed_count", str(count))
            return ToolResult(success=True)

        mock_inner_tool = MagicMock()
        mock_inner_tool.validate_step = MagicMock()
        mock_inner_tool.execute = MagicMock(side_effect=mock_execute)

        step: Dict[str, Any] = {
            "name": "Combined Test",
            "source": "items",
            "item_var": "item",
            "foreach_filter": ".active == true",
            "order_by": ".priority",
            "break_when": "{processed_count} >= 3",
            "steps": [{"name": "inner", "tool": "bash", "command": "echo"}],
        }

        with patch.object(ToolRegistry, "get", return_value=mock_inner_tool):
            result = tool.execute(step, context, mock_tmux)

        assert result.success
        # Filtered to active, sorted by priority, stopped after 3
        assert captured_items == ["A", "C", "D"]


# =============================================================================
# Tool Registration Tests
# =============================================================================


class TestToolRegistration:
    """Tests for tool registration in the registry."""

    def test_json_tool_is_registered(self) -> None:
        """Test that JsonTool is registered."""
        tool = ToolRegistry.get("json")
        assert isinstance(tool, JsonTool)

    def test_json_tool_name(self) -> None:
        """Test that JsonTool has correct name."""
        tool = JsonTool()
        assert tool.name == "json"
