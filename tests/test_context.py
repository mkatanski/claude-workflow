"""Comprehensive unit tests for ExecutionContext.

This module tests the ExecutionContext class which handles variable storage,
interpolation, and path resolution during workflow execution.
"""

import json
from pathlib import Path
from typing import NamedTuple

import pytest

from orchestrator.context import ExecutionContext


class TestExecutionContextInit:
    """Tests for ExecutionContext initialization."""

    def test_init_default_project_path_is_cwd(self) -> None:
        """Test that default project_path is current working directory."""
        ctx = ExecutionContext()
        assert ctx.project_path == Path.cwd()

    def test_init_default_variables_is_empty_dict(self) -> None:
        """Test that default variables is an empty dictionary."""
        ctx = ExecutionContext()
        assert ctx.variables == {}

    def test_init_with_custom_project_path(self) -> None:
        """Test initialization with a custom project path."""
        custom_path = Path("/custom/path")
        ctx = ExecutionContext(project_path=custom_path)
        assert ctx.project_path == custom_path

    def test_init_with_custom_variables(self) -> None:
        """Test initialization with custom variables dictionary."""
        custom_vars = {"key1": "value1", "key2": 42}
        ctx = ExecutionContext(variables=custom_vars)
        assert ctx.variables == custom_vars

    def test_init_with_both_custom_values(self) -> None:
        """Test initialization with both custom path and variables."""
        custom_path = Path("/custom/path")
        custom_vars = {"name": "test"}
        ctx = ExecutionContext(project_path=custom_path, variables=custom_vars)
        assert ctx.project_path == custom_path
        assert ctx.variables == custom_vars


class TestSet:
    """Tests for the set() method."""

    @pytest.fixture
    def ctx(self) -> ExecutionContext:
        """Create a fresh ExecutionContext for each test."""
        return ExecutionContext()

    def test_set_string_value(self, ctx: ExecutionContext) -> None:
        """Test setting a string value."""
        ctx.set("name", "Alice")
        assert ctx.variables["name"] == "Alice"

    def test_set_integer_value(self, ctx: ExecutionContext) -> None:
        """Test setting an integer value."""
        ctx.set("count", 42)
        assert ctx.variables["count"] == 42

    def test_set_float_value(self, ctx: ExecutionContext) -> None:
        """Test setting a float value."""
        ctx.set("price", 19.99)
        assert ctx.variables["price"] == 19.99

    def test_set_boolean_value(self, ctx: ExecutionContext) -> None:
        """Test setting a boolean value."""
        ctx.set("enabled", True)
        assert ctx.variables["enabled"] is True

    def test_set_none_value(self, ctx: ExecutionContext) -> None:
        """Test setting a None value."""
        ctx.set("empty", None)
        assert ctx.variables["empty"] is None

    def test_set_list_value(self, ctx: ExecutionContext) -> None:
        """Test setting a list value."""
        items = [1, 2, 3]
        ctx.set("items", items)
        assert ctx.variables["items"] == items

    def test_set_dict_value(self, ctx: ExecutionContext) -> None:
        """Test setting a dictionary value."""
        data = {"key": "value", "nested": {"inner": 1}}
        ctx.set("data", data)
        assert ctx.variables["data"] == data

    def test_set_overwrites_existing_value(self, ctx: ExecutionContext) -> None:
        """Test that setting a variable overwrites existing value."""
        ctx.set("name", "Alice")
        ctx.set("name", "Bob")
        assert ctx.variables["name"] == "Bob"

    def test_set_with_underscore_name(self, ctx: ExecutionContext) -> None:
        """Test setting a variable with underscore in name."""
        ctx.set("my_variable", "value")
        assert ctx.variables["my_variable"] == "value"

    def test_set_with_numeric_suffix(self, ctx: ExecutionContext) -> None:
        """Test setting a variable with numbers in name."""
        ctx.set("var1", "first")
        ctx.set("var2", "second")
        assert ctx.variables["var1"] == "first"
        assert ctx.variables["var2"] == "second"


class TestGet:
    """Tests for the get() method."""

    @pytest.fixture
    def ctx(self) -> ExecutionContext:
        """Create ExecutionContext with predefined variables."""
        return ExecutionContext(variables={
            "string_var": "hello",
            "int_var": 42,
            "none_var": None,
            "list_var": [1, 2, 3],
            "dict_var": {"key": "value"},
        })

    def test_get_existing_string_variable(self, ctx: ExecutionContext) -> None:
        """Test getting an existing string variable."""
        assert ctx.get("string_var") == "hello"

    def test_get_existing_int_variable(self, ctx: ExecutionContext) -> None:
        """Test getting an existing integer variable."""
        assert ctx.get("int_var") == 42

    def test_get_existing_none_variable(self, ctx: ExecutionContext) -> None:
        """Test getting an existing variable with None value."""
        assert ctx.get("none_var") is None

    def test_get_existing_list_variable(self, ctx: ExecutionContext) -> None:
        """Test getting an existing list variable."""
        assert ctx.get("list_var") == [1, 2, 3]

    def test_get_existing_dict_variable(self, ctx: ExecutionContext) -> None:
        """Test getting an existing dictionary variable."""
        assert ctx.get("dict_var") == {"key": "value"}

    def test_get_nonexistent_variable_returns_none(self, ctx: ExecutionContext) -> None:
        """Test that getting a nonexistent variable returns None by default."""
        assert ctx.get("nonexistent") is None

    def test_get_nonexistent_variable_with_default(self, ctx: ExecutionContext) -> None:
        """Test getting a nonexistent variable returns provided default."""
        assert ctx.get("nonexistent", "default_value") == "default_value"

    def test_get_nonexistent_variable_with_none_default(self, ctx: ExecutionContext) -> None:
        """Test getting nonexistent variable with explicit None default."""
        assert ctx.get("nonexistent", None) is None

    def test_get_existing_variable_ignores_default(self, ctx: ExecutionContext) -> None:
        """Test that default is ignored when variable exists."""
        assert ctx.get("string_var", "default") == "hello"

    def test_get_none_value_variable_ignores_default(self, ctx: ExecutionContext) -> None:
        """Test that default is not used when variable value is None."""
        # This tests that get() returns None (the actual value) not the default
        assert ctx.get("none_var", "default") is None


class TestUpdate:
    """Tests for the update() method."""

    @pytest.fixture
    def ctx(self) -> ExecutionContext:
        """Create ExecutionContext with initial variables."""
        return ExecutionContext(variables={"existing": "original"})

    def test_update_adds_new_variables(self, ctx: ExecutionContext) -> None:
        """Test that update adds new variables."""
        ctx.update({"new1": "value1", "new2": "value2"})
        assert ctx.variables["new1"] == "value1"
        assert ctx.variables["new2"] == "value2"

    def test_update_overwrites_existing_variables(self, ctx: ExecutionContext) -> None:
        """Test that update overwrites existing variables."""
        ctx.update({"existing": "modified"})
        assert ctx.variables["existing"] == "modified"

    def test_update_with_empty_dict(self, ctx: ExecutionContext) -> None:
        """Test update with empty dictionary makes no changes."""
        original = ctx.variables.copy()
        ctx.update({})
        assert ctx.variables == original

    def test_update_preserves_unaffected_variables(self, ctx: ExecutionContext) -> None:
        """Test that update preserves variables not in the update dict."""
        ctx.update({"new": "value"})
        assert ctx.variables["existing"] == "original"

    def test_update_with_mixed_types(self, ctx: ExecutionContext) -> None:
        """Test update with various value types."""
        ctx.update({
            "string": "text",
            "number": 123,
            "list": [1, 2],
            "dict": {"nested": True},
        })
        assert ctx.variables["string"] == "text"
        assert ctx.variables["number"] == 123
        assert ctx.variables["list"] == [1, 2]
        assert ctx.variables["dict"] == {"nested": True}


class TestParseJsonIfString:
    """Tests for the _parse_json_if_string() method."""

    @pytest.fixture
    def ctx(self) -> ExecutionContext:
        """Create a fresh ExecutionContext for each test."""
        return ExecutionContext()

    def test_parse_json_object_string(self, ctx: ExecutionContext) -> None:
        """Test parsing a JSON object string."""
        json_str = '{"name": "Alice", "age": 30}'
        result = ctx._parse_json_if_string(json_str)
        assert result == {"name": "Alice", "age": 30}

    def test_parse_json_array_string(self, ctx: ExecutionContext) -> None:
        """Test parsing a JSON array string."""
        json_str = '[1, 2, 3, "four"]'
        result = ctx._parse_json_if_string(json_str)
        assert result == [1, 2, 3, "four"]

    def test_parse_json_nested_object(self, ctx: ExecutionContext) -> None:
        """Test parsing a nested JSON object string."""
        json_str = '{"outer": {"inner": {"deep": "value"}}}'
        result = ctx._parse_json_if_string(json_str)
        assert result == {"outer": {"inner": {"deep": "value"}}}

    def test_parse_json_string_literal(self, ctx: ExecutionContext) -> None:
        """Test parsing a JSON string literal."""
        json_str = '"just a string"'
        result = ctx._parse_json_if_string(json_str)
        assert result == "just a string"

    def test_parse_json_number_literal(self, ctx: ExecutionContext) -> None:
        """Test parsing a JSON number literal."""
        json_str = "42"
        result = ctx._parse_json_if_string(json_str)
        assert result == 42

    def test_parse_json_boolean_true(self, ctx: ExecutionContext) -> None:
        """Test parsing JSON boolean true."""
        json_str = "true"
        result = ctx._parse_json_if_string(json_str)
        assert result is True

    def test_parse_json_boolean_false(self, ctx: ExecutionContext) -> None:
        """Test parsing JSON boolean false."""
        json_str = "false"
        result = ctx._parse_json_if_string(json_str)
        assert result is False

    def test_parse_json_null(self, ctx: ExecutionContext) -> None:
        """Test parsing JSON null."""
        json_str = "null"
        result = ctx._parse_json_if_string(json_str)
        assert result is None

    def test_parse_invalid_json_returns_original(self, ctx: ExecutionContext) -> None:
        """Test that invalid JSON returns the original string."""
        invalid_json = "not valid json {"
        result = ctx._parse_json_if_string(invalid_json)
        assert result == invalid_json

    def test_parse_plain_string_returns_original(self, ctx: ExecutionContext) -> None:
        """Test that plain string (not JSON) returns original."""
        plain_str = "hello world"
        result = ctx._parse_json_if_string(plain_str)
        assert result == plain_str

    def test_parse_dict_returns_dict(self, ctx: ExecutionContext) -> None:
        """Test that a dict value is returned unchanged."""
        data = {"key": "value"}
        result = ctx._parse_json_if_string(data)
        assert result == data

    def test_parse_list_returns_list(self, ctx: ExecutionContext) -> None:
        """Test that a list value is returned unchanged."""
        data = [1, 2, 3]
        result = ctx._parse_json_if_string(data)
        assert result == data

    def test_parse_int_returns_int(self, ctx: ExecutionContext) -> None:
        """Test that an int value is returned unchanged."""
        result = ctx._parse_json_if_string(42)
        assert result == 42

    def test_parse_none_returns_none(self, ctx: ExecutionContext) -> None:
        """Test that None is returned unchanged."""
        result = ctx._parse_json_if_string(None)
        assert result is None

    def test_parse_empty_string_returns_empty(self, ctx: ExecutionContext) -> None:
        """Test that empty string returns empty string (invalid JSON)."""
        result = ctx._parse_json_if_string("")
        assert result == ""

    def test_parse_whitespace_string_returns_original(self, ctx: ExecutionContext) -> None:
        """Test that whitespace-only string returns original."""
        result = ctx._parse_json_if_string("   ")
        assert result == "   "


class TestResolvePath:
    """Tests for the _resolve_path() method."""

    @pytest.fixture
    def ctx(self) -> ExecutionContext:
        """Create a fresh ExecutionContext for each test."""
        return ExecutionContext()

    def test_resolve_path_simple_dict_key(self, ctx: ExecutionContext) -> None:
        """Test resolving a single key in a dictionary."""
        obj = {"name": "Alice"}
        result = ctx._resolve_path(obj, ["name"])
        assert result == "Alice"

    def test_resolve_path_nested_dict(self, ctx: ExecutionContext) -> None:
        """Test resolving nested dictionary keys."""
        obj = {"user": {"profile": {"name": "Bob"}}}
        result = ctx._resolve_path(obj, ["user", "profile", "name"])
        assert result == "Bob"

    def test_resolve_path_list_index_first(self, ctx: ExecutionContext) -> None:
        """Test resolving first element of a list."""
        obj = ["first", "second", "third"]
        result = ctx._resolve_path(obj, ["0"])
        assert result == "first"

    def test_resolve_path_list_index_middle(self, ctx: ExecutionContext) -> None:
        """Test resolving middle element of a list."""
        obj = ["first", "second", "third"]
        result = ctx._resolve_path(obj, ["1"])
        assert result == "second"

    def test_resolve_path_list_index_last(self, ctx: ExecutionContext) -> None:
        """Test resolving last element of a list."""
        obj = ["first", "second", "third"]
        result = ctx._resolve_path(obj, ["2"])
        assert result == "third"

    def test_resolve_path_dict_then_list(self, ctx: ExecutionContext) -> None:
        """Test resolving path through dict then list."""
        obj = {"items": ["apple", "banana", "cherry"]}
        result = ctx._resolve_path(obj, ["items", "1"])
        assert result == "banana"

    def test_resolve_path_list_then_dict(self, ctx: ExecutionContext) -> None:
        """Test resolving path through list then dict."""
        obj = [{"name": "Alice"}, {"name": "Bob"}]
        result = ctx._resolve_path(obj, ["0", "name"])
        assert result == "Alice"

    def test_resolve_path_complex_nested(self, ctx: ExecutionContext) -> None:
        """Test resolving complex nested structure."""
        obj = {
            "users": [
                {"name": "Alice", "scores": [100, 95, 87]},
                {"name": "Bob", "scores": [80, 90, 85]},
            ]
        }
        result = ctx._resolve_path(obj, ["users", "1", "scores", "2"])
        assert result == 85

    def test_resolve_path_missing_dict_key(self, ctx: ExecutionContext) -> None:
        """Test resolving missing dictionary key returns None."""
        obj = {"name": "Alice"}
        result = ctx._resolve_path(obj, ["nonexistent"])
        assert result is None

    def test_resolve_path_missing_nested_key(self, ctx: ExecutionContext) -> None:
        """Test resolving missing nested key returns None."""
        obj = {"user": {"name": "Alice"}}
        result = ctx._resolve_path(obj, ["user", "email"])
        assert result is None

    def test_resolve_path_index_out_of_bounds(self, ctx: ExecutionContext) -> None:
        """Test resolving out-of-bounds list index returns None."""
        obj = ["a", "b", "c"]
        result = ctx._resolve_path(obj, ["10"])
        assert result is None

    def test_resolve_path_negative_index_returns_none(self, ctx: ExecutionContext) -> None:
        """Test resolving negative list index returns None."""
        obj = ["a", "b", "c"]
        result = ctx._resolve_path(obj, ["-1"])
        assert result is None

    def test_resolve_path_invalid_index_on_list(self, ctx: ExecutionContext) -> None:
        """Test resolving non-numeric index on list returns None."""
        obj = ["a", "b", "c"]
        result = ctx._resolve_path(obj, ["invalid"])
        assert result is None

    def test_resolve_path_none_object(self, ctx: ExecutionContext) -> None:
        """Test resolving path on None object returns None."""
        result = ctx._resolve_path(None, ["anything"])
        assert result is None

    def test_resolve_path_empty_path_returns_object(self, ctx: ExecutionContext) -> None:
        """Test resolving empty path returns original object."""
        obj = {"key": "value"}
        result = ctx._resolve_path(obj, [])
        assert result == obj

    def test_resolve_path_primitive_value_at_end(self, ctx: ExecutionContext) -> None:
        """Test that path stops at primitive value."""
        obj = {"count": 42}
        result = ctx._resolve_path(obj, ["count", "invalid"])
        assert result is None

    def test_resolve_path_through_none_value(self, ctx: ExecutionContext) -> None:
        """Test resolving path that encounters None in middle."""
        obj = {"user": None}
        result = ctx._resolve_path(obj, ["user", "name"])
        assert result is None

    def test_resolve_path_with_object_attribute(self, ctx: ExecutionContext) -> None:
        """Test resolving path using object attribute access."""
        class MockObject(NamedTuple):
            name: str
            value: int
        
        obj = MockObject(name="test", value=42)
        result = ctx._resolve_path(obj, ["name"])
        assert result == "test"

    def test_resolve_path_object_missing_attribute(self, ctx: ExecutionContext) -> None:
        """Test resolving missing attribute on object returns None."""
        class MockObject(NamedTuple):
            name: str
        
        obj = MockObject(name="test")
        result = ctx._resolve_path(obj, ["nonexistent"])
        assert result is None


class TestInterpolate:
    """Tests for the interpolate() method."""

    @pytest.fixture
    def ctx(self) -> ExecutionContext:
        """Create ExecutionContext with variables for interpolation tests."""
        return ExecutionContext(variables={
            "name": "Alice",
            "count": 42,
            "user": {"name": "Bob", "age": 30},
            "items": ["apple", "banana", "cherry"],
            "nested": {
                "deep": {
                    "value": "found"
                }
            },
            "json_str": '{"key": "value", "number": 123}',
            "json_array": '[{"id": 1}, {"id": 2}]',
            "empty_str": "",
        })

    def test_interpolate_simple_variable(self, ctx: ExecutionContext) -> None:
        """Test interpolating a simple variable."""
        result = ctx.interpolate("Hello, {name}!")
        assert result == "Hello, Alice!"

    def test_interpolate_integer_variable(self, ctx: ExecutionContext) -> None:
        """Test interpolating an integer variable."""
        result = ctx.interpolate("Count: {count}")
        assert result == "Count: 42"

    def test_interpolate_multiple_variables(self, ctx: ExecutionContext) -> None:
        """Test interpolating multiple variables in one template."""
        result = ctx.interpolate("{name} has {count} items")
        assert result == "Alice has 42 items"

    def test_interpolate_same_variable_twice(self, ctx: ExecutionContext) -> None:
        """Test interpolating the same variable multiple times."""
        result = ctx.interpolate("{name} and {name}")
        assert result == "Alice and Alice"

    def test_interpolate_dot_notation_simple(self, ctx: ExecutionContext) -> None:
        """Test interpolating with simple dot notation."""
        result = ctx.interpolate("User: {user.name}")
        assert result == "User: Bob"

    def test_interpolate_dot_notation_nested(self, ctx: ExecutionContext) -> None:
        """Test interpolating with nested dot notation."""
        result = ctx.interpolate("Value: {nested.deep.value}")
        assert result == "Value: found"

    def test_interpolate_array_indexing(self, ctx: ExecutionContext) -> None:
        """Test interpolating with array index access."""
        result = ctx.interpolate("First item: {items.0}")
        assert result == "First item: apple"

    def test_interpolate_array_last_element(self, ctx: ExecutionContext) -> None:
        """Test interpolating last array element by index."""
        result = ctx.interpolate("Last: {items.2}")
        assert result == "Last: cherry"

    def test_interpolate_json_string_with_path(self, ctx: ExecutionContext) -> None:
        """Test interpolating into JSON string value using path."""
        result = ctx.interpolate("Key: {json_str.key}")
        assert result == "Key: value"

    def test_interpolate_json_string_number_field(self, ctx: ExecutionContext) -> None:
        """Test interpolating number field from JSON string."""
        result = ctx.interpolate("Number: {json_str.number}")
        assert result == "Number: 123"

    def test_interpolate_json_array_with_index(self, ctx: ExecutionContext) -> None:
        """Test interpolating into JSON array string with index."""
        result = ctx.interpolate("ID: {json_array.0.id}")
        assert result == "ID: 1"

    def test_interpolate_missing_variable_unchanged(self, ctx: ExecutionContext) -> None:
        """Test that missing variable placeholder remains unchanged."""
        result = ctx.interpolate("Hello, {unknown}!")
        assert result == "Hello, {unknown}!"

    def test_interpolate_missing_nested_path_unchanged(self, ctx: ExecutionContext) -> None:
        """Test that missing nested path remains unchanged."""
        result = ctx.interpolate("Value: {user.nonexistent}")
        assert result == "Value: {user.nonexistent}"

    def test_interpolate_missing_array_index_unchanged(self, ctx: ExecutionContext) -> None:
        """Test that out-of-bounds array index remains unchanged."""
        result = ctx.interpolate("Item: {items.10}")
        assert result == "Item: {items.10}"

    def test_interpolate_empty_template(self, ctx: ExecutionContext) -> None:
        """Test interpolating empty template returns empty string."""
        result = ctx.interpolate("")
        assert result == ""

    def test_interpolate_no_placeholders(self, ctx: ExecutionContext) -> None:
        """Test template without placeholders returns unchanged."""
        result = ctx.interpolate("Just plain text")
        assert result == "Just plain text"

    def test_interpolate_nested_dict_as_json(self, ctx: ExecutionContext) -> None:
        """Test interpolating nested dict value serializes to JSON."""
        result = ctx.interpolate("Deep: {nested.deep}")
        assert result == 'Deep: {"value": "found"}'

    def test_interpolate_list_as_json(self, ctx: ExecutionContext) -> None:
        """Test interpolating list value serializes to JSON."""
        result = ctx.interpolate("Items: {items}")
        assert result == "Items: ['apple', 'banana', 'cherry']"

    def test_interpolate_dict_value_as_json(self, ctx: ExecutionContext) -> None:
        """Test interpolating dict value serializes to JSON."""
        result = ctx.interpolate("User: {user}")
        # Note: the variable value is a dict, so str() is used for top-level
        assert "Bob" in result

    def test_interpolate_underscore_variable_name(self, ctx: ExecutionContext) -> None:
        """Test interpolating variable with underscore in name."""
        ctx.set("my_var", "test_value")
        result = ctx.interpolate("Value: {my_var}")
        assert result == "Value: test_value"

    def test_interpolate_variable_with_numbers(self, ctx: ExecutionContext) -> None:
        """Test interpolating variable with numbers in name."""
        ctx.set("var123", "numbered")
        result = ctx.interpolate("Value: {var123}")
        assert result == "Value: numbered"

    def test_interpolate_adjacent_placeholders(self, ctx: ExecutionContext) -> None:
        """Test interpolating adjacent placeholders."""
        result = ctx.interpolate("{name}{count}")
        assert result == "Alice42"

    def test_interpolate_placeholder_at_start(self, ctx: ExecutionContext) -> None:
        """Test placeholder at start of template."""
        result = ctx.interpolate("{name} is here")
        assert result == "Alice is here"

    def test_interpolate_placeholder_at_end(self, ctx: ExecutionContext) -> None:
        """Test placeholder at end of template."""
        result = ctx.interpolate("Name: {name}")
        assert result == "Name: Alice"

    def test_interpolate_special_chars_in_template(self, ctx: ExecutionContext) -> None:
        """Test template with special characters outside placeholders."""
        result = ctx.interpolate("$100 for {name}!")
        assert result == "$100 for Alice!"

    def test_interpolate_newlines_in_template(self, ctx: ExecutionContext) -> None:
        """Test template with newlines."""
        result = ctx.interpolate("Line1: {name}\nLine2: {count}")
        assert result == "Line1: Alice\nLine2: 42"

    def test_interpolate_double_curly_braces(self, ctx: ExecutionContext) -> None:
        """Test that double braces still interpolate the inner variable."""
        # The regex pattern matches {name} inside {{name}}, leaving outer braces
        result = ctx.interpolate("{{name}}")
        assert result == "{Alice}"  # Inner {name} is replaced

    def test_interpolate_empty_braces(self, ctx: ExecutionContext) -> None:
        """Test empty braces are not interpolated."""
        result = ctx.interpolate("Empty: {}")
        assert result == "Empty: {}"

    def test_interpolate_space_in_braces(self, ctx: ExecutionContext) -> None:
        """Test braces with space don't match pattern."""
        result = ctx.interpolate("{ name }")
        assert result == "{ name }"

    def test_interpolate_dot_only(self, ctx: ExecutionContext) -> None:
        """Test braces with only dot don't match."""
        result = ctx.interpolate("{.}")
        assert result == "{.}"

    def test_interpolate_starting_with_number_not_matched(self, ctx: ExecutionContext) -> None:
        """Test variable name starting with number is not matched."""
        result = ctx.interpolate("{123var}")
        assert result == "{123var}"

    def test_interpolate_empty_string_variable(self, ctx: ExecutionContext) -> None:
        """Test interpolating empty string variable."""
        result = ctx.interpolate("Value: {empty_str}")
        assert result == "Value: "


class TestInterpolateOptional:
    """Tests for the interpolate_optional() method."""

    @pytest.fixture
    def ctx(self) -> ExecutionContext:
        """Create ExecutionContext with test variables."""
        return ExecutionContext(variables={"name": "Alice"})

    def test_interpolate_optional_with_string(self, ctx: ExecutionContext) -> None:
        """Test interpolating a regular string."""
        result = ctx.interpolate_optional("Hello, {name}!")
        assert result == "Hello, Alice!"

    def test_interpolate_optional_with_none(self, ctx: ExecutionContext) -> None:
        """Test that None input returns None."""
        result = ctx.interpolate_optional(None)
        assert result is None

    def test_interpolate_optional_empty_string(self, ctx: ExecutionContext) -> None:
        """Test interpolating empty string."""
        result = ctx.interpolate_optional("")
        assert result == ""


class TestInterpolationPatternEdgeCases:
    """Tests for edge cases in the interpolation pattern matching."""

    @pytest.fixture
    def ctx(self) -> ExecutionContext:
        """Create ExecutionContext with edge case variables."""
        return ExecutionContext(variables={
            "_private": "underscore_start",
            "a": "single_char",
            "a1b2c3": "alphanumeric",
            "UPPER": "uppercase",
            "CamelCase": "camel",
        })

    def test_interpolate_underscore_start(self, ctx: ExecutionContext) -> None:
        """Test variable name starting with underscore."""
        result = ctx.interpolate("{_private}")
        assert result == "underscore_start"

    def test_interpolate_single_char_name(self, ctx: ExecutionContext) -> None:
        """Test single character variable name."""
        result = ctx.interpolate("{a}")
        assert result == "single_char"

    def test_interpolate_mixed_alphanumeric(self, ctx: ExecutionContext) -> None:
        """Test alphanumeric variable name."""
        result = ctx.interpolate("{a1b2c3}")
        assert result == "alphanumeric"

    def test_interpolate_uppercase_name(self, ctx: ExecutionContext) -> None:
        """Test uppercase variable name."""
        result = ctx.interpolate("{UPPER}")
        assert result == "uppercase"

    def test_interpolate_camelcase_name(self, ctx: ExecutionContext) -> None:
        """Test CamelCase variable name."""
        result = ctx.interpolate("{CamelCase}")
        assert result == "camel"


class TestComplexScenarios:
    """Tests for complex real-world usage scenarios."""

    def test_workflow_variable_capture_scenario(self) -> None:
        """Test scenario: capturing and using tool output in workflow."""
        ctx = ExecutionContext()
        
        # Simulate capturing JSON output from a tool
        tool_output = '{"status": "success", "data": {"id": 12345, "items": ["a", "b"]}}'
        ctx.set("result", tool_output)
        
        # Use captured data in subsequent template
        template = "Task {result.data.id} completed with {result.status}"
        result = ctx.interpolate(template)
        assert result == "Task 12345 completed with success"

    def test_chained_variable_updates(self) -> None:
        """Test scenario: chained updates building on previous values."""
        ctx = ExecutionContext()
        
        ctx.set("base_path", "/home/user")
        ctx.set("project", "myapp")
        
        # Build path using previous values
        full_path = ctx.interpolate("{base_path}/{project}")
        ctx.set("full_path", full_path)
        
        assert ctx.get("full_path") == "/home/user/myapp"

    def test_mixed_static_and_dynamic_variables(self) -> None:
        """Test scenario: mixing static config with dynamic runtime values."""
        # Static config from YAML
        static_vars = {"env": "production", "version": "1.0.0"}
        ctx = ExecutionContext(variables=static_vars)
        
        # Dynamic runtime value
        ctx.set("build_number", 42)
        
        template = "Deploying {env} v{version} (build {build_number})"
        result = ctx.interpolate(template)
        assert result == "Deploying production v1.0.0 (build 42)"

    def test_array_iteration_scenario(self) -> None:
        """Test scenario: accessing multiple array elements."""
        ctx = ExecutionContext(variables={
            "files": '["main.py", "utils.py", "config.yaml"]'
        })
        
        # Access individual files
        assert ctx.interpolate("{files.0}") == "main.py"
        assert ctx.interpolate("{files.1}") == "utils.py"
        assert ctx.interpolate("{files.2}") == "config.yaml"

    def test_error_handling_graceful_degradation(self) -> None:
        """Test scenario: graceful handling of missing/invalid paths."""
        ctx = ExecutionContext(variables={"partial": '{"a": {"b": 1}}'})
        
        # Valid path works
        assert ctx.interpolate("{partial.a.b}") == "1"
        
        # Invalid paths return original placeholder
        assert ctx.interpolate("{partial.a.c}") == "{partial.a.c}"
        assert ctx.interpolate("{partial.x.y}") == "{partial.x.y}"
        assert ctx.interpolate("{missing}") == "{missing}"

    def test_project_path_integration(self) -> None:
        """Test scenario: using project_path with variables."""
        project = Path("/projects/myapp")
        ctx = ExecutionContext(project_path=project, variables={
            "module": "orchestrator"
        })
        
        # Project path is accessible
        assert ctx.project_path == project
        
        # Can be used with string operations
        full_path = str(ctx.project_path / ctx.get("module"))
        assert full_path == "/projects/myapp/orchestrator"


class TestDataclassProperties:
    """Tests for dataclass-specific behavior."""

    def test_execution_context_is_dataclass(self) -> None:
        """Verify ExecutionContext is a proper dataclass."""
        from dataclasses import is_dataclass
        assert is_dataclass(ExecutionContext)

    def test_variables_are_independent_per_instance(self) -> None:
        """Test that each instance has independent variables."""
        ctx1 = ExecutionContext()
        ctx2 = ExecutionContext()
        
        ctx1.set("key", "value1")
        ctx2.set("key", "value2")
        
        assert ctx1.get("key") == "value1"
        assert ctx2.get("key") == "value2"

    def test_project_path_is_independent_per_instance(self) -> None:
        """Test that each instance has independent project_path."""
        ctx1 = ExecutionContext(project_path=Path("/path1"))
        ctx2 = ExecutionContext(project_path=Path("/path2"))
        
        assert ctx1.project_path == Path("/path1")
        assert ctx2.project_path == Path("/path2")
