"""Tests for Phase 3 tools: json/yaml tool and foreach enhancements.

These tests cover the JSON/YAML manipulation tool (with JMESPath queries)
and the foreach features (filter, order_by, break_when).
"""

import json
from pathlib import Path
from typing import Any, Dict
from unittest.mock import MagicMock, patch

import pytest
import yaml

from orchestrator.context import ExecutionContext
from orchestrator.tools import ToolRegistry
from orchestrator.tools.base import ToolResult
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
        step: Dict[str, Any] = {"action": "query", "query": "field"}

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
        tool.validate_step({"action": "query", "file": "test.json", "query": "field"})

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
# JsonTool Query Tests (JMESPath syntax)
# =============================================================================


class TestJsonToolQuery:
    """Tests for JsonTool query action using JMESPath."""

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
            "query": "name",  # JMESPath: no leading dot
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
            "query": "user.profile.name",  # JMESPath nested access
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
            "query": "items[1]",  # JMESPath array indexing
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
            "query": "user",
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
            "query": "items[0]",
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        assert result.output == "1"

    def test_query_nonexistent_path_returns_empty(
        self, context: ExecutionContext, mock_tmux: MagicMock, tmp_path: Path
    ) -> None:
        """Test that querying a nonexistent path returns empty (JMESPath behavior)."""
        tool = JsonTool()
        json_file = tmp_path / "test.json"
        json_file.write_text('{"name": "John"}')

        step: Dict[str, Any] = {
            "action": "query",
            "file": str(json_file),
            "query": "nonexistent",
        }

        result = tool.execute(step, context, mock_tmux)

        # JMESPath returns null for missing keys, which we convert to empty string
        assert result.success
        assert result.output == ""

    def test_query_array_projection(
        self, context: ExecutionContext, mock_tmux: MagicMock, tmp_path: Path
    ) -> None:
        """Test JMESPath array projection with [*]."""
        tool = JsonTool()
        json_file = tmp_path / "test.json"
        json_file.write_text(
            '{"users": [{"name": "Alice"}, {"name": "Bob"}, {"name": "Carol"}]}'
        )

        step: Dict[str, Any] = {
            "action": "query",
            "file": str(json_file),
            "query": "users[*].name",  # JMESPath projection
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        parsed = json.loads(result.output or "")
        assert parsed == ["Alice", "Bob", "Carol"]

    def test_query_filter_expression(
        self, context: ExecutionContext, mock_tmux: MagicMock, tmp_path: Path
    ) -> None:
        """Test JMESPath filter expression."""
        tool = JsonTool()
        json_file = tmp_path / "test.json"
        json_file.write_text(
            '{"items": [{"status": "active", "v": 1}, {"status": "inactive", "v": 2}, {"status": "active", "v": 3}]}'
        )

        step: Dict[str, Any] = {
            "action": "query",
            "file": str(json_file),
            "query": "items[?status == 'active']",  # JMESPath filter
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        parsed = json.loads(result.output or "")
        assert len(parsed) == 2
        assert all(item["status"] == "active" for item in parsed)

    def test_query_length_function(
        self, context: ExecutionContext, mock_tmux: MagicMock, tmp_path: Path
    ) -> None:
        """Test JMESPath length function."""
        tool = JsonTool()
        json_file = tmp_path / "test.json"
        json_file.write_text('{"items": [1, 2, 3, 4, 5]}')

        step: Dict[str, Any] = {
            "action": "query",
            "file": str(json_file),
            "query": "length(items)",  # JMESPath function
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        assert result.output == "5"

    def test_query_sort_function(
        self, context: ExecutionContext, mock_tmux: MagicMock, tmp_path: Path
    ) -> None:
        """Test JMESPath sort function."""
        tool = JsonTool()
        json_file = tmp_path / "test.json"
        json_file.write_text('{"nums": [3, 1, 4, 1, 5]}')

        step: Dict[str, Any] = {
            "action": "query",
            "file": str(json_file),
            "query": "sort(nums)",
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        parsed = json.loads(result.output or "")
        assert parsed == [1, 1, 3, 4, 5]

    def test_query_keys_function(
        self, context: ExecutionContext, mock_tmux: MagicMock, tmp_path: Path
    ) -> None:
        """Test JMESPath keys function."""
        tool = JsonTool()
        json_file = tmp_path / "test.json"
        json_file.write_text('{"config": {"host": "localhost", "port": 8080}}')

        step: Dict[str, Any] = {
            "action": "query",
            "file": str(json_file),
            "query": "keys(config)",
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        parsed = json.loads(result.output or "")
        assert set(parsed) == {"host", "port"}

    def test_query_custom_to_entries_function(
        self, context: ExecutionContext, mock_tmux: MagicMock, tmp_path: Path
    ) -> None:
        """Test custom to_entries function."""
        tool = JsonTool()
        json_file = tmp_path / "test.json"
        json_file.write_text('{"counts": {"a": 1, "b": 2}}')

        step: Dict[str, Any] = {
            "action": "query",
            "file": str(json_file),
            "query": "to_entries(counts)",
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        parsed = json.loads(result.output or "")
        assert len(parsed) == 2
        assert {"key": "a", "value": 1} in parsed
        assert {"key": "b", "value": 2} in parsed

    def test_query_custom_from_entries_function(
        self, context: ExecutionContext, mock_tmux: MagicMock, tmp_path: Path
    ) -> None:
        """Test custom from_entries function."""
        tool = JsonTool()
        json_file = tmp_path / "test.json"
        json_file.write_text(
            '{"entries": [{"key": "x", "value": 10}, {"key": "y", "value": 20}]}'
        )

        step: Dict[str, Any] = {
            "action": "query",
            "file": str(json_file),
            "query": "from_entries(entries)",
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        parsed = json.loads(result.output or "")
        assert parsed == {"x": 10, "y": 20}

    def test_query_custom_unique_function(
        self, context: ExecutionContext, mock_tmux: MagicMock, tmp_path: Path
    ) -> None:
        """Test custom unique function."""
        tool = JsonTool()
        json_file = tmp_path / "test.json"
        json_file.write_text('{"nums": [1, 2, 2, 3, 1]}')

        step: Dict[str, Any] = {
            "action": "query",
            "file": str(json_file),
            "query": "unique(nums)",
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        parsed = json.loads(result.output or "")
        assert parsed == [1, 2, 3]

    def test_query_custom_flatten_function(
        self, context: ExecutionContext, mock_tmux: MagicMock, tmp_path: Path
    ) -> None:
        """Test custom flatten function."""
        tool = JsonTool()
        json_file = tmp_path / "test.json"
        json_file.write_text('{"nested": [[1, 2], [3, 4], [5]]}')

        step: Dict[str, Any] = {
            "action": "query",
            "file": str(json_file),
            "query": "flatten(nested)",
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        parsed = json.loads(result.output or "")
        assert parsed == [1, 2, 3, 4, 5]

    def test_query_custom_add_function(
        self, context: ExecutionContext, mock_tmux: MagicMock, tmp_path: Path
    ) -> None:
        """Test custom add function for numbers."""
        tool = JsonTool()
        json_file = tmp_path / "test.json"
        json_file.write_text('{"nums": [1, 2, 3, 4]}')

        step: Dict[str, Any] = {
            "action": "query",
            "file": str(json_file),
            "query": "add(nums)",
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        assert result.output == "10"

    def test_query_multiselect_hash(
        self, context: ExecutionContext, mock_tmux: MagicMock, tmp_path: Path
    ) -> None:
        """Test JMESPath multiselect hash."""
        tool = JsonTool()
        json_file = tmp_path / "test.json"
        json_file.write_text('{"user": {"name": "John", "age": 30, "city": "NYC"}}')

        step: Dict[str, Any] = {
            "action": "query",
            "file": str(json_file),
            "query": "{name: user.name, age: user.age}",
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        parsed = json.loads(result.output or "")
        assert parsed == {"name": "John", "age": 30}

    def test_query_negative_index(
        self, context: ExecutionContext, mock_tmux: MagicMock, tmp_path: Path
    ) -> None:
        """Test JMESPath negative array indexing."""
        tool = JsonTool()
        json_file = tmp_path / "test.json"
        json_file.write_text('{"items": [1, 2, 3, 4, 5]}')

        step: Dict[str, Any] = {
            "action": "query",
            "file": str(json_file),
            "query": "items[-1]",  # Last element
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        assert result.output == "5"


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
            "query": "field",
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
            "query": "key",
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        assert result.output == "value"


# =============================================================================
# JsonTool YAML Support Tests
# =============================================================================


class TestJsonToolYamlSupport:
    """Tests for JsonTool YAML file support."""

    def test_query_yaml_file(
        self, context: ExecutionContext, mock_tmux: MagicMock, tmp_path: Path
    ) -> None:
        """Test querying a YAML file."""
        tool = JsonTool()
        yaml_file = tmp_path / "test.yaml"
        yaml_file.write_text("name: John\nage: 30\n")

        step: Dict[str, Any] = {
            "action": "query",
            "file": str(yaml_file),
            "query": "name",
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        assert result.output == "John"

    def test_query_yaml_file_yml_extension(
        self, context: ExecutionContext, mock_tmux: MagicMock, tmp_path: Path
    ) -> None:
        """Test querying a .yml file."""
        tool = JsonTool()
        yaml_file = tmp_path / "config.yml"
        yaml_file.write_text("database:\n  host: localhost\n  port: 5432\n")

        step: Dict[str, Any] = {
            "action": "query",
            "file": str(yaml_file),
            "query": "database.host",
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        assert result.output == "localhost"

    def test_set_yaml_file(
        self, context: ExecutionContext, mock_tmux: MagicMock, tmp_path: Path
    ) -> None:
        """Test setting a value in a YAML file."""
        tool = JsonTool()
        yaml_file = tmp_path / "config.yaml"
        yaml_file.write_text("version: 1.0.0\n")

        step: Dict[str, Any] = {
            "action": "set",
            "file": str(yaml_file),
            "path": ".version",
            "value": "2.0.0",
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        data = yaml.safe_load(yaml_file.read_text())
        assert data["version"] == "2.0.0"

    def test_update_yaml_file(
        self, context: ExecutionContext, mock_tmux: MagicMock, tmp_path: Path
    ) -> None:
        """Test updating a value in a YAML file."""
        tool = JsonTool()
        yaml_file = tmp_path / "config.yml"
        yaml_file.write_text("items:\n  - one\n  - two\n")

        step: Dict[str, Any] = {
            "action": "update",
            "file": str(yaml_file),
            "path": ".items",
            "operation": "append",
            "value": "three",
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        data = yaml.safe_load(yaml_file.read_text())
        assert data["items"] == ["one", "two", "three"]

    def test_delete_yaml_file(
        self, context: ExecutionContext, mock_tmux: MagicMock, tmp_path: Path
    ) -> None:
        """Test deleting a key from a YAML file."""
        tool = JsonTool()
        yaml_file = tmp_path / "config.yaml"
        yaml_file.write_text("name: test\nversion: 1.0.0\ndebug: true\n")

        step: Dict[str, Any] = {
            "action": "delete",
            "file": str(yaml_file),
            "path": ".debug",
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        data = yaml.safe_load(yaml_file.read_text())
        assert "debug" not in data
        assert data["name"] == "test"
        assert data["version"] == "1.0.0"

    def test_yaml_nested_structure(
        self, context: ExecutionContext, mock_tmux: MagicMock, tmp_path: Path
    ) -> None:
        """Test querying nested YAML structure with JMESPath."""
        tool = JsonTool()
        yaml_file = tmp_path / "nested.yaml"
        yaml_file.write_text(
            """
servers:
  - name: web1
    port: 80
  - name: web2
    port: 8080
  - name: db1
    port: 5432
"""
        )

        step: Dict[str, Any] = {
            "action": "query",
            "file": str(yaml_file),
            "query": "servers[*].name",
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        parsed = json.loads(result.output or "")
        assert parsed == ["web1", "web2", "db1"]

    def test_yaml_filter_query(
        self, context: ExecutionContext, mock_tmux: MagicMock, tmp_path: Path
    ) -> None:
        """Test JMESPath filter on YAML data."""
        tool = JsonTool()
        yaml_file = tmp_path / "data.yml"
        yaml_file.write_text(
            """
tasks:
  - name: task1
    status: pending
  - name: task2
    status: done
  - name: task3
    status: pending
"""
        )

        step: Dict[str, Any] = {
            "action": "query",
            "file": str(yaml_file),
            "query": "tasks[?status == 'pending'].name",
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        parsed = json.loads(result.output or "")
        assert parsed == ["task1", "task3"]

    def test_create_yaml_file(
        self, context: ExecutionContext, mock_tmux: MagicMock, tmp_path: Path
    ) -> None:
        """Test creating a new YAML file."""
        tool = JsonTool()
        yaml_file = tmp_path / "new.yaml"

        step: Dict[str, Any] = {
            "action": "set",
            "file": str(yaml_file),
            "path": ".config.name",
            "value": "myapp",
            "create_if_missing": True,
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        assert yaml_file.exists()
        data = yaml.safe_load(yaml_file.read_text())
        assert data["config"]["name"] == "myapp"

    def test_empty_yaml_file(
        self, context: ExecutionContext, mock_tmux: MagicMock, tmp_path: Path
    ) -> None:
        """Test handling empty YAML file."""
        tool = JsonTool()
        yaml_file = tmp_path / "empty.yaml"
        yaml_file.write_text("")  # Empty file

        step: Dict[str, Any] = {
            "action": "set",
            "file": str(yaml_file),
            "path": ".name",
            "value": "test",
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        data = yaml.safe_load(yaml_file.read_text())
        assert data["name"] == "test"


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
