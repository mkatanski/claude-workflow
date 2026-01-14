"""Tests for Phase 1 tools: expressions, context, and data.

These tests cover the foundation tools from Phase 1 of the improvements roadmap.
"""

import json
from pathlib import Path
from typing import Any, Dict
from unittest.mock import MagicMock

import pytest

from orchestrator.context import ExecutionContext
from orchestrator.expressions import ExpressionError, ExpressionEvaluator
from orchestrator.tools import ToolRegistry
from orchestrator.tools.context_tool import ContextTool
from orchestrator.tools.data_tool import DataTool
from orchestrator.tools.set import SetTool


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def context(tmp_path: Path) -> ExecutionContext:
    """Create execution context with temp project path."""
    return ExecutionContext(project_path=tmp_path)


@pytest.fixture
def context_with_temp_dir(tmp_path: Path) -> ExecutionContext:
    """Create execution context with temp directory set."""
    ctx = ExecutionContext(project_path=tmp_path)
    temp_dir = tmp_path / "workflow_temp"
    temp_dir.mkdir()
    ctx.set("_temp_dir", str(temp_dir))
    return ctx


@pytest.fixture
def mock_tmux() -> MagicMock:
    """Create mock tmux manager."""
    return MagicMock()


# =============================================================================
# ExpressionEvaluator Tests
# =============================================================================


class TestExpressionEvaluatorArithmetic:
    """Tests for arithmetic expressions."""

    def test_addition(self, context: ExecutionContext) -> None:
        """Test simple addition."""
        evaluator = ExpressionEvaluator(context)
        assert evaluator.evaluate("1 + 2") == "3"

    def test_subtraction(self, context: ExecutionContext) -> None:
        """Test simple subtraction."""
        evaluator = ExpressionEvaluator(context)
        assert evaluator.evaluate("5 - 3") == "2"

    def test_multiplication(self, context: ExecutionContext) -> None:
        """Test simple multiplication."""
        evaluator = ExpressionEvaluator(context)
        assert evaluator.evaluate("3 * 4") == "12"

    def test_division(self, context: ExecutionContext) -> None:
        """Test simple division."""
        evaluator = ExpressionEvaluator(context)
        assert evaluator.evaluate("10 / 4") == "2.5"

    def test_integer_division_result(self, context: ExecutionContext) -> None:
        """Test division that results in integer."""
        evaluator = ExpressionEvaluator(context)
        assert evaluator.evaluate("10 / 2") == "5"

    def test_modulo(self, context: ExecutionContext) -> None:
        """Test modulo operation."""
        evaluator = ExpressionEvaluator(context)
        assert evaluator.evaluate("10 % 3") == "1"

    def test_operator_precedence(self, context: ExecutionContext) -> None:
        """Test that multiplication has higher precedence than addition."""
        evaluator = ExpressionEvaluator(context)
        assert evaluator.evaluate("2 + 3 * 4") == "14"

    def test_parentheses(self, context: ExecutionContext) -> None:
        """Test parentheses change evaluation order."""
        evaluator = ExpressionEvaluator(context)
        assert evaluator.evaluate("(2 + 3) * 4") == "20"

    def test_negative_numbers(self, context: ExecutionContext) -> None:
        """Test negative numbers."""
        evaluator = ExpressionEvaluator(context)
        assert evaluator.evaluate("-5 + 3") == "-2"

    def test_float_numbers(self, context: ExecutionContext) -> None:
        """Test float numbers."""
        evaluator = ExpressionEvaluator(context)
        assert evaluator.evaluate("1.5 + 2.5") == "4"

    def test_division_by_zero(self, context: ExecutionContext) -> None:
        """Test division by zero raises error."""
        evaluator = ExpressionEvaluator(context)
        with pytest.raises(ExpressionError, match="Division by zero"):
            evaluator.evaluate("10 / 0")


class TestExpressionEvaluatorComparison:
    """Tests for comparison expressions."""

    def test_equals(self, context: ExecutionContext) -> None:
        """Test equality comparison."""
        evaluator = ExpressionEvaluator(context)
        assert evaluator.evaluate("5 == 5") == "true"
        assert evaluator.evaluate("5 == 6") == "false"

    def test_not_equals(self, context: ExecutionContext) -> None:
        """Test inequality comparison."""
        evaluator = ExpressionEvaluator(context)
        assert evaluator.evaluate("5 != 6") == "true"
        assert evaluator.evaluate("5 != 5") == "false"

    def test_greater_than(self, context: ExecutionContext) -> None:
        """Test greater than comparison."""
        evaluator = ExpressionEvaluator(context)
        assert evaluator.evaluate("6 > 5") == "true"
        assert evaluator.evaluate("5 > 5") == "false"

    def test_less_than(self, context: ExecutionContext) -> None:
        """Test less than comparison."""
        evaluator = ExpressionEvaluator(context)
        assert evaluator.evaluate("5 < 6") == "true"
        assert evaluator.evaluate("5 < 5") == "false"

    def test_greater_equal(self, context: ExecutionContext) -> None:
        """Test greater than or equal comparison."""
        evaluator = ExpressionEvaluator(context)
        assert evaluator.evaluate("5 >= 5") == "true"
        assert evaluator.evaluate("6 >= 5") == "true"
        assert evaluator.evaluate("4 >= 5") == "false"

    def test_less_equal(self, context: ExecutionContext) -> None:
        """Test less than or equal comparison."""
        evaluator = ExpressionEvaluator(context)
        assert evaluator.evaluate("5 <= 5") == "true"
        assert evaluator.evaluate("4 <= 5") == "true"
        assert evaluator.evaluate("6 <= 5") == "false"

    def test_string_comparison(self, context: ExecutionContext) -> None:
        """Test string comparison."""
        evaluator = ExpressionEvaluator(context)
        assert evaluator.evaluate('"abc" == "abc"') == "true"
        assert evaluator.evaluate('"abc" != "def"') == "true"


class TestExpressionEvaluatorBoolean:
    """Tests for boolean expressions."""

    def test_and_operator(self, context: ExecutionContext) -> None:
        """Test and operator."""
        evaluator = ExpressionEvaluator(context)
        assert evaluator.evaluate("true and true") == "true"
        assert evaluator.evaluate("true and false") == "false"
        assert evaluator.evaluate("false and true") == "false"

    def test_or_operator(self, context: ExecutionContext) -> None:
        """Test or operator."""
        evaluator = ExpressionEvaluator(context)
        assert evaluator.evaluate("true or false") == "true"
        assert evaluator.evaluate("false or true") == "true"
        assert evaluator.evaluate("false or false") == "false"

    def test_not_operator(self, context: ExecutionContext) -> None:
        """Test not operator."""
        evaluator = ExpressionEvaluator(context)
        assert evaluator.evaluate("not true") == "false"
        assert evaluator.evaluate("not false") == "true"

    def test_combined_boolean(self, context: ExecutionContext) -> None:
        """Test combined boolean operations."""
        evaluator = ExpressionEvaluator(context)
        assert evaluator.evaluate("true and not false") == "true"
        assert evaluator.evaluate("(true or false) and true") == "true"


class TestExpressionEvaluatorConditional:
    """Tests for conditional expressions."""

    def test_if_then_else_true(self, context: ExecutionContext) -> None:
        """Test conditional with true condition."""
        evaluator = ExpressionEvaluator(context)
        assert evaluator.evaluate("if true then 1 else 2") == "1"

    def test_if_then_else_false(self, context: ExecutionContext) -> None:
        """Test conditional with false condition."""
        evaluator = ExpressionEvaluator(context)
        assert evaluator.evaluate("if false then 1 else 2") == "2"

    def test_if_with_comparison(self, context: ExecutionContext) -> None:
        """Test conditional with comparison."""
        evaluator = ExpressionEvaluator(context)
        assert evaluator.evaluate("if 5 > 3 then 'yes' else 'no'") == "yes"
        assert evaluator.evaluate("if 3 > 5 then 'yes' else 'no'") == "no"

    def test_if_with_string_result(self, context: ExecutionContext) -> None:
        """Test conditional with string results."""
        evaluator = ExpressionEvaluator(context)
        result = evaluator.evaluate('if true then "success" else "failed"')
        assert result == "success"


class TestExpressionEvaluatorStrings:
    """Tests for string expressions."""

    def test_string_concatenation(self, context: ExecutionContext) -> None:
        """Test string concatenation."""
        evaluator = ExpressionEvaluator(context)
        assert evaluator.evaluate('"hello" + " " + "world"') == "hello world"

    def test_string_number_concatenation(self, context: ExecutionContext) -> None:
        """Test string and number concatenation."""
        evaluator = ExpressionEvaluator(context)
        assert evaluator.evaluate('"value: " + 42') == "value: 42"


class TestExpressionEvaluatorVariables:
    """Tests for variable interpolation in expressions."""

    def test_variable_arithmetic(self, context: ExecutionContext) -> None:
        """Test arithmetic with variables."""
        context.set("x", "10")
        evaluator = ExpressionEvaluator(context)
        assert evaluator.evaluate("{x} + 5") == "15"

    def test_variable_comparison(self, context: ExecutionContext) -> None:
        """Test comparison with variables."""
        context.set("count", "5")
        evaluator = ExpressionEvaluator(context)
        assert evaluator.evaluate("{count} > 3") == "true"
        assert evaluator.evaluate("{count} < 3") == "false"

    def test_variable_string(self, context: ExecutionContext) -> None:
        """Test string operations with variables."""
        context.set("name", "World")
        evaluator = ExpressionEvaluator(context)
        assert evaluator.evaluate('"Hello " + {name}') == "Hello World"

    def test_variable_conditional(self, context: ExecutionContext) -> None:
        """Test conditional with variables."""
        context.set("status", "success")
        evaluator = ExpressionEvaluator(context)
        result = evaluator.evaluate(
            'if {status} == "success" then "passed" else "failed"'
        )
        assert result == "passed"


# =============================================================================
# SetTool Expression Tests
# =============================================================================


class TestSetToolExpression:
    """Tests for SetTool expression support."""

    def test_expr_arithmetic(
        self, context: ExecutionContext, mock_tmux: MagicMock
    ) -> None:
        """Test set with arithmetic expression."""
        tool = SetTool()
        context.set("counter", "5")

        step: Dict[str, Any] = {
            "var": "result",
            "expr": "{counter} + 1",
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        assert context.get("result") == "6"

    def test_expr_conditional(
        self, context: ExecutionContext, mock_tmux: MagicMock
    ) -> None:
        """Test set with conditional expression."""
        tool = SetTool()
        context.set("passed", "true")

        step: Dict[str, Any] = {
            "var": "status",
            "expr": 'if {passed} == "true" then "success" else "failed"',
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        assert context.get("status") == "success"

    def test_expr_string_concat(
        self, context: ExecutionContext, mock_tmux: MagicMock
    ) -> None:
        """Test set with string concatenation expression."""
        tool = SetTool()
        context.set("step_name", "build")
        context.set("error_code", "E001")

        step: Dict[str, Any] = {
            "var": "message",
            "expr": '"Error in " + {step_name} + ": " + {error_code}',
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        assert context.get("message") == "Error in build: E001"

    def test_validate_requires_value_or_expr(
        self, context: ExecutionContext
    ) -> None:
        """Test validation requires either value or expr."""
        tool = SetTool()

        step: Dict[str, Any] = {"var": "x"}

        with pytest.raises(ValueError, match="either 'value' or 'expr'"):
            tool.validate_step(step)

    def test_validate_rejects_both_value_and_expr(
        self, context: ExecutionContext
    ) -> None:
        """Test validation rejects both value and expr."""
        tool = SetTool()

        step: Dict[str, Any] = {"var": "x", "value": "1", "expr": "2"}

        with pytest.raises(ValueError, match="cannot have both"):
            tool.validate_step(step)

    def test_expr_error_returns_failure(
        self, context: ExecutionContext, mock_tmux: MagicMock
    ) -> None:
        """Test that expression error returns failure result."""
        tool = SetTool()

        step: Dict[str, Any] = {
            "var": "result",
            "expr": "10 / 0",
        }

        result = tool.execute(step, context, mock_tmux)

        assert not result.success
        assert "Expression error" in (result.error or "")


# =============================================================================
# ContextTool Tests
# =============================================================================


class TestContextToolValidation:
    """Tests for ContextTool validation."""

    def test_validate_requires_action(self) -> None:
        """Test that action field is required."""
        tool = ContextTool()

        with pytest.raises(ValueError, match="requires 'action' field"):
            tool.validate_step({})

    def test_validate_invalid_action(self) -> None:
        """Test that invalid action is rejected."""
        tool = ContextTool()

        with pytest.raises(ValueError, match="Invalid action"):
            tool.validate_step({"action": "invalid"})

    def test_validate_set_requires_values(self) -> None:
        """Test that set action requires values."""
        tool = ContextTool()

        with pytest.raises(ValueError, match="requires 'values' field"):
            tool.validate_step({"action": "set"})

    def test_validate_copy_requires_mappings(self) -> None:
        """Test that copy action requires mappings."""
        tool = ContextTool()

        with pytest.raises(ValueError, match="requires 'mappings' field"):
            tool.validate_step({"action": "copy"})

    def test_validate_clear_requires_vars(self) -> None:
        """Test that clear action requires vars."""
        tool = ContextTool()

        with pytest.raises(ValueError, match="requires 'vars' field"):
            tool.validate_step({"action": "clear"})

    def test_validate_export_requires_file(self) -> None:
        """Test that export action requires file."""
        tool = ContextTool()

        with pytest.raises(ValueError, match="requires 'file' field"):
            tool.validate_step({"action": "export"})


class TestContextToolSet:
    """Tests for ContextTool set action."""

    def test_set_multiple_variables(
        self, context: ExecutionContext, mock_tmux: MagicMock
    ) -> None:
        """Test setting multiple variables at once."""
        tool = ContextTool()

        step: Dict[str, Any] = {
            "action": "set",
            "values": {
                "status": "pending",
                "retry_count": "0",
                "errors": "[]",
            },
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        assert context.get("status") == "pending"
        assert context.get("retry_count") == "0"
        assert context.get("errors") == "[]"
        assert "3 variable(s)" in (result.output or "")

    def test_set_with_interpolation(
        self, context: ExecutionContext, mock_tmux: MagicMock
    ) -> None:
        """Test set action interpolates values."""
        tool = ContextTool()
        context.set("name", "workflow1")

        step: Dict[str, Any] = {
            "action": "set",
            "values": {
                "message": "Running {name}",
            },
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        assert context.get("message") == "Running workflow1"


class TestContextToolCopy:
    """Tests for ContextTool copy action."""

    def test_copy_variables(
        self, context: ExecutionContext, mock_tmux: MagicMock
    ) -> None:
        """Test copying variables."""
        tool = ContextTool()
        context.set("source_var", "value123")

        step: Dict[str, Any] = {
            "action": "copy",
            "mappings": {
                "source_var": "target_var",
            },
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        assert context.get("target_var") == "value123"
        assert context.get("source_var") == "value123"  # Source unchanged

    def test_copy_missing_source(
        self, context: ExecutionContext, mock_tmux: MagicMock
    ) -> None:
        """Test copying with missing source variable."""
        tool = ContextTool()

        step: Dict[str, Any] = {
            "action": "copy",
            "mappings": {
                "nonexistent": "target",
            },
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        assert "Not found" in (result.output or "")


class TestContextToolClear:
    """Tests for ContextTool clear action."""

    def test_clear_variables(
        self, context: ExecutionContext, mock_tmux: MagicMock
    ) -> None:
        """Test clearing variables."""
        tool = ContextTool()
        context.set("temp_var", "value")
        context.set("other_var", "other")

        step: Dict[str, Any] = {
            "action": "clear",
            "vars": ["temp_var"],
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        assert context.get("temp_var") is None
        assert context.get("other_var") == "other"  # Unchanged

    def test_clear_nonexistent_variable(
        self, context: ExecutionContext, mock_tmux: MagicMock
    ) -> None:
        """Test clearing nonexistent variable."""
        tool = ContextTool()

        step: Dict[str, Any] = {
            "action": "clear",
            "vars": ["nonexistent"],
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        assert "0 variable(s)" in (result.output or "")


class TestContextToolExport:
    """Tests for ContextTool export action."""

    def test_export_to_file(
        self, context: ExecutionContext, mock_tmux: MagicMock, tmp_path: Path
    ) -> None:
        """Test exporting context to file."""
        tool = ContextTool()
        context.set("var1", "value1")
        context.set("var2", "value2")

        export_file = tmp_path / "context.json"

        step: Dict[str, Any] = {
            "action": "export",
            "file": str(export_file),
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success
        assert export_file.exists()

        with open(export_file) as f:
            exported = json.load(f)

        assert exported["var1"] == "value1"
        assert exported["var2"] == "value2"

    def test_export_filtered_vars(
        self, context: ExecutionContext, mock_tmux: MagicMock, tmp_path: Path
    ) -> None:
        """Test exporting filtered variables."""
        tool = ContextTool()
        context.set("var1", "value1")
        context.set("var2", "value2")
        context.set("var3", "value3")

        export_file = tmp_path / "context.json"

        step: Dict[str, Any] = {
            "action": "export",
            "file": str(export_file),
            "vars": ["var1", "var3"],
        }

        result = tool.execute(step, context, mock_tmux)

        assert result.success

        with open(export_file) as f:
            exported = json.load(f)

        assert "var1" in exported
        assert "var2" not in exported
        assert "var3" in exported


# =============================================================================
# DataTool Tests
# =============================================================================


class TestDataToolValidation:
    """Tests for DataTool validation."""

    def test_validate_requires_content(self) -> None:
        """Test that content field is required."""
        tool = DataTool()

        with pytest.raises(ValueError, match="requires 'content' field"):
            tool.validate_step({})

    def test_validate_invalid_format(self) -> None:
        """Test that invalid format is rejected."""
        tool = DataTool()

        with pytest.raises(ValueError, match="Invalid format"):
            tool.validate_step({"content": "data", "format": "invalid"})

    def test_validate_valid_formats(self) -> None:
        """Test that valid formats pass validation."""
        tool = DataTool()

        for fmt in ["json", "text", "markdown"]:
            tool.validate_step({"content": "data", "format": fmt})


class TestDataToolExecution:
    """Tests for DataTool execution."""

    def test_write_text_file(
        self, context_with_temp_dir: ExecutionContext, mock_tmux: MagicMock
    ) -> None:
        """Test writing text file."""
        tool = DataTool()

        step: Dict[str, Any] = {
            "content": "Hello, World!",
            "format": "text",
        }

        result = tool.execute(step, context_with_temp_dir, mock_tmux)

        assert result.success
        assert result.output is not None

        file_path = Path(result.output)
        assert file_path.exists()
        assert file_path.suffix == ".txt"
        assert file_path.read_text() == "Hello, World!"

    def test_write_json_file(
        self, context_with_temp_dir: ExecutionContext, mock_tmux: MagicMock
    ) -> None:
        """Test writing JSON file."""
        tool = DataTool()

        step: Dict[str, Any] = {
            "content": '{"key": "value"}',
            "format": "json",
        }

        result = tool.execute(step, context_with_temp_dir, mock_tmux)

        assert result.success
        assert result.output is not None

        file_path = Path(result.output)
        assert file_path.exists()
        assert file_path.suffix == ".json"

        with open(file_path) as f:
            data = json.load(f)

        assert data == {"key": "value"}

    def test_write_markdown_file(
        self, context_with_temp_dir: ExecutionContext, mock_tmux: MagicMock
    ) -> None:
        """Test writing markdown file."""
        tool = DataTool()

        step: Dict[str, Any] = {
            "content": "# Title\n\nContent here",
            "format": "markdown",
        }

        result = tool.execute(step, context_with_temp_dir, mock_tmux)

        assert result.success
        assert result.output is not None

        file_path = Path(result.output)
        assert file_path.exists()
        assert file_path.suffix == ".md"

    def test_custom_filename(
        self, context_with_temp_dir: ExecutionContext, mock_tmux: MagicMock
    ) -> None:
        """Test custom filename."""
        tool = DataTool()

        step: Dict[str, Any] = {
            "content": "data",
            "filename": "custom-name.txt",
        }

        result = tool.execute(step, context_with_temp_dir, mock_tmux)

        assert result.success
        assert result.output is not None
        assert "custom-name.txt" in result.output

    def test_variable_interpolation(
        self, context_with_temp_dir: ExecutionContext, mock_tmux: MagicMock
    ) -> None:
        """Test variable interpolation in content."""
        tool = DataTool()
        context_with_temp_dir.set("name", "John")

        step: Dict[str, Any] = {
            "content": "Hello, {name}!",
            "format": "text",
        }

        result = tool.execute(step, context_with_temp_dir, mock_tmux)

        assert result.success
        file_path = Path(result.output or "")
        assert file_path.read_text() == "Hello, John!"

    def test_no_temp_dir_fails(
        self, context: ExecutionContext, mock_tmux: MagicMock
    ) -> None:
        """Test that missing temp directory returns error."""
        tool = DataTool()

        step: Dict[str, Any] = {
            "content": "data",
        }

        result = tool.execute(step, context, mock_tmux)

        assert not result.success
        assert "temp directory" in (result.error or "").lower()

    def test_invalid_json_fails(
        self, context_with_temp_dir: ExecutionContext, mock_tmux: MagicMock
    ) -> None:
        """Test that invalid JSON returns error."""
        tool = DataTool()

        step: Dict[str, Any] = {
            "content": "{invalid json}",
            "format": "json",
        }

        result = tool.execute(step, context_with_temp_dir, mock_tmux)

        assert not result.success
        assert "Invalid JSON" in (result.error or "")


# =============================================================================
# Tool Registration Tests
# =============================================================================


class TestToolRegistration:
    """Tests for new tool registration."""

    def test_context_tool_is_registered(self) -> None:
        """Test that ContextTool is registered."""
        tool = ToolRegistry.get("context")
        assert isinstance(tool, ContextTool)

    def test_data_tool_is_registered(self) -> None:
        """Test that DataTool is registered."""
        tool = ToolRegistry.get("data")
        assert isinstance(tool, DataTool)


# =============================================================================
# Tool Name Tests
# =============================================================================


class TestToolNames:
    """Tests for tool name properties."""

    def test_context_tool_name(self) -> None:
        """Test that ContextTool has correct name."""
        tool = ContextTool()
        assert tool.name == "context"

    def test_data_tool_name(self) -> None:
        """Test that DataTool has correct name."""
        tool = DataTool()
        assert tool.name == "data"
