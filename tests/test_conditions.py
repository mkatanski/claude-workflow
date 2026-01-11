"""Comprehensive unit tests for the conditions module.

Tests cover:
- ConditionResult dataclass
- ConditionError exception
- ConditionEvaluator class with all public methods:
  - evaluate()
  - _evaluate_simple()
  - _evaluate_compound()
  - _compare()
  - _resolve_value()
  - _strip_quotes()
  - _try_numeric()
  - _numeric_compare()
  - _string_compare()
"""

from pathlib import Path

import pytest

from orchestrator.conditions import (
    ConditionError,
    ConditionEvaluator,
    ConditionResult,
)
from orchestrator.context import ExecutionContext


class TestConditionResult:
    """Tests for the ConditionResult dataclass."""

    def test_condition_result_creation_satisfied(self) -> None:
        """Test creating a satisfied condition result."""
        result = ConditionResult(satisfied=True, reason="Test passed")
        assert result.satisfied is True
        assert result.reason == "Test passed"

    def test_condition_result_creation_not_satisfied(self) -> None:
        """Test creating a not satisfied condition result."""
        result = ConditionResult(satisfied=False, reason="Test failed")
        assert result.satisfied is False
        assert result.reason == "Test failed"

    def test_condition_result_equality(self) -> None:
        """Test ConditionResult equality comparison."""
        result1 = ConditionResult(satisfied=True, reason="same")
        result2 = ConditionResult(satisfied=True, reason="same")
        assert result1 == result2


class TestConditionError:
    """Tests for the ConditionError exception."""

    def test_condition_error_message(self) -> None:
        """Test ConditionError stores the error message correctly."""
        error = ConditionError("Invalid syntax")
        assert str(error) == "Invalid syntax"

    def test_condition_error_is_exception(self) -> None:
        """Test ConditionError is a proper exception."""
        with pytest.raises(ConditionError, match="test error"):
            raise ConditionError("test error")


class TestConditionEvaluatorFixtures:
    """Fixtures for ConditionEvaluator tests."""

    @pytest.fixture
    def context(self) -> ExecutionContext:
        """Create an ExecutionContext with test variables."""
        ctx = ExecutionContext(project_path=Path("/test/path"))
        ctx.set("status", "success")
        ctx.set("count", "10")
        ctx.set("empty_var", "")
        ctx.set("message", "Hello World")
        ctx.set("version", "1.0.0")
        ctx.set("float_val", "3.14")
        ctx.set("negative", "-5")
        return ctx

    @pytest.fixture
    def evaluator(self, context: ExecutionContext) -> ConditionEvaluator:
        """Create a ConditionEvaluator with test context."""
        return ConditionEvaluator(context)


class TestEvaluateEmptyConditions(TestConditionEvaluatorFixtures):
    """Tests for evaluate() with empty or no conditions."""

    def test_evaluate_empty_string_returns_satisfied(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Empty condition string should return satisfied=True."""
        result = evaluator.evaluate("")
        assert result.satisfied is True
        assert result.reason == "No condition specified"

    def test_evaluate_whitespace_only_returns_satisfied(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Whitespace-only condition should return satisfied=True."""
        result = evaluator.evaluate("   ")
        assert result.satisfied is True
        assert result.reason == "No condition specified"

    def test_evaluate_none_like_empty_string(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Test evaluating conditions that become empty after strip."""
        result = evaluator.evaluate("\t\n")
        assert result.satisfied is True


class TestEvaluateSimpleEquality(TestConditionEvaluatorFixtures):
    """Tests for simple equality conditions with == and != operators."""

    def test_evaluate_simple_equality_match(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Test {var} == value when values match."""
        result = evaluator.evaluate("{status} == success")
        assert result.satisfied is True

    def test_evaluate_simple_equality_no_match(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Test {var} == value when values don't match."""
        result = evaluator.evaluate("{status} == failure")
        assert result.satisfied is False

    def test_evaluate_simple_inequality_match(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Test {var} != value when values differ."""
        result = evaluator.evaluate("{status} != failure")
        assert result.satisfied is True

    def test_evaluate_simple_inequality_no_match(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Test {var} != value when values are same."""
        result = evaluator.evaluate("{status} != success")
        assert result.satisfied is False

    def test_evaluate_equality_with_quoted_value_single(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Test equality with single-quoted value."""
        result = evaluator.evaluate("{status} == 'success'")
        assert result.satisfied is True

    def test_evaluate_equality_with_quoted_value_double(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Test equality with double-quoted value."""
        result = evaluator.evaluate('{status} == "success"')
        assert result.satisfied is True


class TestEvaluateNumericComparisons(TestConditionEvaluatorFixtures):
    """Tests for numeric comparison operators."""

    def test_evaluate_numeric_greater_than_true(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Test {var} > value when left is greater."""
        result = evaluator.evaluate("{count} > 5")
        assert result.satisfied is True

    def test_evaluate_numeric_greater_than_false(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Test {var} > value when left is not greater."""
        result = evaluator.evaluate("{count} > 15")
        assert result.satisfied is False

    def test_evaluate_numeric_greater_than_equal_true(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Test {var} >= value when left is greater or equal."""
        result = evaluator.evaluate("{count} >= 10")
        assert result.satisfied is True

    def test_evaluate_numeric_greater_than_equal_false(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Test {var} >= value when left is less."""
        result = evaluator.evaluate("{count} >= 11")
        assert result.satisfied is False

    def test_evaluate_numeric_less_than_true(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Test {var} < value when left is less."""
        result = evaluator.evaluate("{count} < 15")
        assert result.satisfied is True

    def test_evaluate_numeric_less_than_false(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Test {var} < value when left is not less."""
        result = evaluator.evaluate("{count} < 5")
        assert result.satisfied is False

    def test_evaluate_numeric_less_than_equal_true(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Test {var} <= value when left is less or equal."""
        result = evaluator.evaluate("{count} <= 10")
        assert result.satisfied is True

    def test_evaluate_numeric_less_than_equal_false(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Test {var} <= value when left is greater."""
        result = evaluator.evaluate("{count} <= 9")
        assert result.satisfied is False

    def test_evaluate_numeric_equality_true(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Test {var} == value for numeric equality."""
        result = evaluator.evaluate("{count} == 10")
        assert result.satisfied is True

    def test_evaluate_numeric_inequality_true(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Test {var} != value for numeric inequality."""
        result = evaluator.evaluate("{count} != 5")
        assert result.satisfied is True

    def test_evaluate_float_comparison(self, evaluator: ConditionEvaluator) -> None:
        """Test comparison with floating point values."""
        result = evaluator.evaluate("{float_val} > 3.0")
        assert result.satisfied is True

    def test_evaluate_float_less_than(self, evaluator: ConditionEvaluator) -> None:
        """Test float less than comparison."""
        result = evaluator.evaluate("{float_val} < 4.0")
        assert result.satisfied is True

    def test_evaluate_negative_number(self, evaluator: ConditionEvaluator) -> None:
        """Test comparison with negative numbers."""
        result = evaluator.evaluate("{negative} < 0")
        assert result.satisfied is True


class TestEvaluateStringOperators(TestConditionEvaluatorFixtures):
    """Tests for string-specific operators."""

    def test_evaluate_contains_true(self, evaluator: ConditionEvaluator) -> None:
        """Test contains operator when substring exists."""
        result = evaluator.evaluate("{message} contains World")
        assert result.satisfied is True

    def test_evaluate_contains_false(self, evaluator: ConditionEvaluator) -> None:
        """Test contains operator when substring doesn't exist."""
        result = evaluator.evaluate("{message} contains Goodbye")
        assert result.satisfied is False

    def test_evaluate_contains_case_insensitive(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Test contains operator is case-insensitive."""
        result = evaluator.evaluate("{message} contains HELLO")
        assert result.satisfied is True

    def test_evaluate_not_contains_true(self, evaluator: ConditionEvaluator) -> None:
        """Test not contains operator when substring is absent."""
        result = evaluator.evaluate("{message} not contains Goodbye")
        assert result.satisfied is True

    def test_evaluate_not_contains_false(self, evaluator: ConditionEvaluator) -> None:
        """Test not contains operator when substring exists."""
        result = evaluator.evaluate("{message} not contains World")
        assert result.satisfied is False

    def test_evaluate_starts_with_true(self, evaluator: ConditionEvaluator) -> None:
        """Test starts with operator when string starts with value."""
        result = evaluator.evaluate("{message} starts with Hello")
        assert result.satisfied is True

    def test_evaluate_starts_with_false(self, evaluator: ConditionEvaluator) -> None:
        """Test starts with operator when string doesn't start with value."""
        result = evaluator.evaluate("{message} starts with World")
        assert result.satisfied is False

    def test_evaluate_starts_with_case_insensitive(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Test starts with operator is case-insensitive."""
        result = evaluator.evaluate("{message} starts with hello")
        assert result.satisfied is True

    def test_evaluate_ends_with_true(self, evaluator: ConditionEvaluator) -> None:
        """Test ends with operator when string ends with value."""
        result = evaluator.evaluate("{message} ends with World")
        assert result.satisfied is True

    def test_evaluate_ends_with_false(self, evaluator: ConditionEvaluator) -> None:
        """Test ends with operator when string doesn't end with value."""
        result = evaluator.evaluate("{message} ends with Hello")
        assert result.satisfied is False

    def test_evaluate_ends_with_case_insensitive(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Test ends with operator is case-insensitive."""
        result = evaluator.evaluate("{message} ends with WORLD")
        assert result.satisfied is True


class TestEvaluateEmptyOperators(TestConditionEvaluatorFixtures):
    """Tests for is empty and is not empty operators."""

    def test_evaluate_is_empty_true(self, evaluator: ConditionEvaluator) -> None:
        """Test is empty when variable is empty."""
        result = evaluator.evaluate("{empty_var} is empty")
        assert result.satisfied is True

    def test_evaluate_is_empty_false(self, evaluator: ConditionEvaluator) -> None:
        """Test is empty when variable has value."""
        result = evaluator.evaluate("{status} is empty")
        assert result.satisfied is False

    def test_evaluate_is_not_empty_true(self, evaluator: ConditionEvaluator) -> None:
        """Test is not empty when variable has value."""
        result = evaluator.evaluate("{status} is not empty")
        assert result.satisfied is True

    def test_evaluate_is_not_empty_false(self, evaluator: ConditionEvaluator) -> None:
        """Test is not empty when variable is empty."""
        result = evaluator.evaluate("{empty_var} is not empty")
        assert result.satisfied is False

    def test_evaluate_is_empty_undefined_var(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Test is empty for undefined variable (resolves to empty)."""
        result = evaluator.evaluate("{undefined_var} is empty")
        assert result.satisfied is True

    def test_evaluate_is_not_empty_undefined_var(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Test is not empty for undefined variable."""
        result = evaluator.evaluate("{undefined_var} is not empty")
        assert result.satisfied is False

    def test_evaluate_is_empty_whitespace_only(
        self, context: ExecutionContext
    ) -> None:
        """Test is empty when variable contains only whitespace."""
        context.set("whitespace_var", "   ")
        evaluator = ConditionEvaluator(context)
        result = evaluator.evaluate("{whitespace_var} is empty")
        assert result.satisfied is True


class TestEvaluateCompoundConditions(TestConditionEvaluatorFixtures):
    """Tests for compound conditions with and/or logic."""

    def test_evaluate_and_both_true(self, evaluator: ConditionEvaluator) -> None:
        """Test AND condition when both parts are true."""
        result = evaluator.evaluate("{status} == success and {count} > 5")
        assert result.satisfied is True

    def test_evaluate_and_first_false(self, evaluator: ConditionEvaluator) -> None:
        """Test AND condition when first part is false."""
        result = evaluator.evaluate("{status} == failure and {count} > 5")
        assert result.satisfied is False

    def test_evaluate_and_second_false(self, evaluator: ConditionEvaluator) -> None:
        """Test AND condition when second part is false."""
        result = evaluator.evaluate("{status} == success and {count} > 15")
        assert result.satisfied is False

    def test_evaluate_and_both_false(self, evaluator: ConditionEvaluator) -> None:
        """Test AND condition when both parts are false."""
        result = evaluator.evaluate("{status} == failure and {count} > 15")
        assert result.satisfied is False

    def test_evaluate_or_both_true(self, evaluator: ConditionEvaluator) -> None:
        """Test OR condition when both parts are true."""
        result = evaluator.evaluate("{status} == success or {count} > 5")
        assert result.satisfied is True

    def test_evaluate_or_first_true(self, evaluator: ConditionEvaluator) -> None:
        """Test OR condition when only first part is true."""
        result = evaluator.evaluate("{status} == success or {count} > 15")
        assert result.satisfied is True

    def test_evaluate_or_second_true(self, evaluator: ConditionEvaluator) -> None:
        """Test OR condition when only second part is true."""
        result = evaluator.evaluate("{status} == failure or {count} > 5")
        assert result.satisfied is True

    def test_evaluate_or_both_false(self, evaluator: ConditionEvaluator) -> None:
        """Test OR condition when both parts are false."""
        result = evaluator.evaluate("{status} == failure or {count} > 15")
        assert result.satisfied is False

    def test_evaluate_and_case_insensitive(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Test AND keyword is case-insensitive."""
        result = evaluator.evaluate("{status} == success AND {count} > 5")
        assert result.satisfied is True

    def test_evaluate_or_case_insensitive(self, evaluator: ConditionEvaluator) -> None:
        """Test OR keyword is case-insensitive."""
        result = evaluator.evaluate("{status} == failure OR {count} > 5")
        assert result.satisfied is True

    def test_evaluate_multiple_and_conditions(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Test multiple AND conditions chained."""
        result = evaluator.evaluate(
            "{status} == success and {count} > 5 and {message} contains Hello"
        )
        assert result.satisfied is True

    def test_evaluate_multiple_or_conditions(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Test multiple OR conditions chained."""
        result = evaluator.evaluate(
            "{status} == failure or {count} > 100 or {message} contains Hello"
        )
        assert result.satisfied is True

    def test_evaluate_compound_reason_includes_all_parts(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Test compound condition reason includes all sub-reasons."""
        result = evaluator.evaluate("{status} == success and {count} > 5")
        assert "AND" in result.reason


class TestEvaluateMalformedConditions(TestConditionEvaluatorFixtures):
    """Tests for malformed and invalid conditions."""

    def test_evaluate_invalid_syntax_raises_error(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Test that invalid syntax raises ConditionError."""
        with pytest.raises(ConditionError, match="Invalid condition syntax"):
            evaluator.evaluate("this is not valid")

    def test_evaluate_missing_operator_raises_error(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Test missing operator raises ConditionError."""
        with pytest.raises(ConditionError, match="Invalid condition syntax"):
            evaluator.evaluate("{status} success")

    def test_evaluate_unsupported_string_operator_raises_error(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Test unsupported operator for string comparison raises error."""
        with pytest.raises(ConditionError, match="not supported for string comparison"):
            evaluator.evaluate("{status} > failure")

    def test_evaluate_compound_with_empty_part_raises_error(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Test compound condition with empty part raises ConditionError.

        When a compound condition has spaces around 'and'/'or' but one part
        is empty (like ' and x'), the empty part fails in _evaluate_simple.
        """
        with pytest.raises(ConditionError, match="Invalid condition syntax"):
            evaluator.evaluate(" and {status} == success")


class TestEvaluateSimpleMethod(TestConditionEvaluatorFixtures):
    """Tests specifically for _evaluate_simple method."""

    def test_evaluate_simple_with_extra_whitespace(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Test _evaluate_simple handles extra whitespace."""
        result = evaluator._evaluate_simple("  {status}   ==   success  ")
        assert result.satisfied is True

    def test_evaluate_simple_operator_case_insensitive(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Test operators are case-insensitive in _evaluate_simple."""
        result = evaluator._evaluate_simple("{message} CONTAINS Hello")
        assert result.satisfied is True


class TestResolveValue(TestConditionEvaluatorFixtures):
    """Tests for _resolve_value method."""

    def test_resolve_value_simple_variable(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Test resolving a simple variable reference."""
        result = evaluator._resolve_value("{status}")
        assert result == "success"

    def test_resolve_value_undefined_variable(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Test resolving undefined variable returns empty string."""
        result = evaluator._resolve_value("{undefined}")
        assert result == ""

    def test_resolve_value_literal_string(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Test resolving a literal string value."""
        result = evaluator._resolve_value("literal")
        assert result == "literal"

    def test_resolve_value_quoted_string_single(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Test resolving single-quoted string."""
        result = evaluator._resolve_value("'quoted value'")
        assert result == "quoted value"

    def test_resolve_value_quoted_string_double(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Test resolving double-quoted string."""
        result = evaluator._resolve_value('"quoted value"')
        assert result == "quoted value"


class TestStripQuotes(TestConditionEvaluatorFixtures):
    """Tests for _strip_quotes method."""

    def test_strip_quotes_single(self, evaluator: ConditionEvaluator) -> None:
        """Test stripping single quotes."""
        result = evaluator._strip_quotes("'value'")
        assert result == "value"

    def test_strip_quotes_double(self, evaluator: ConditionEvaluator) -> None:
        """Test stripping double quotes."""
        result = evaluator._strip_quotes('"value"')
        assert result == "value"

    def test_strip_quotes_no_quotes(self, evaluator: ConditionEvaluator) -> None:
        """Test value without quotes is unchanged."""
        result = evaluator._strip_quotes("value")
        assert result == "value"

    def test_strip_quotes_mismatched(self, evaluator: ConditionEvaluator) -> None:
        """Test mismatched quotes are not stripped."""
        result = evaluator._strip_quotes("'value\"")
        assert result == "'value\""

    def test_strip_quotes_empty(self, evaluator: ConditionEvaluator) -> None:
        """Test empty string is unchanged."""
        result = evaluator._strip_quotes("")
        assert result == ""

    def test_strip_quotes_single_char(self, evaluator: ConditionEvaluator) -> None:
        """Test single character is unchanged."""
        result = evaluator._strip_quotes("a")
        assert result == "a"


class TestTryNumeric(TestConditionEvaluatorFixtures):
    """Tests for _try_numeric method."""

    def test_try_numeric_integer(self, evaluator: ConditionEvaluator) -> None:
        """Test converting integer string."""
        result = evaluator._try_numeric("42")
        assert result == 42
        assert isinstance(result, int)

    def test_try_numeric_float(self, evaluator: ConditionEvaluator) -> None:
        """Test converting float string."""
        result = evaluator._try_numeric("3.14")
        assert result == 3.14
        assert isinstance(result, float)

    def test_try_numeric_negative_integer(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Test converting negative integer string."""
        result = evaluator._try_numeric("-10")
        assert result == -10

    def test_try_numeric_negative_float(self, evaluator: ConditionEvaluator) -> None:
        """Test converting negative float string."""
        result = evaluator._try_numeric("-3.14")
        assert result == -3.14

    def test_try_numeric_non_numeric(self, evaluator: ConditionEvaluator) -> None:
        """Test non-numeric string returns None."""
        result = evaluator._try_numeric("not a number")
        assert result is None

    def test_try_numeric_empty_string(self, evaluator: ConditionEvaluator) -> None:
        """Test empty string returns None."""
        result = evaluator._try_numeric("")
        assert result is None


class TestNumericCompare(TestConditionEvaluatorFixtures):
    """Tests for _numeric_compare method."""

    def test_numeric_compare_equal_integers(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Test numeric equality comparison with integers."""
        result = evaluator._numeric_compare(10, "==", 10)
        assert result.satisfied is True

    def test_numeric_compare_not_equal(self, evaluator: ConditionEvaluator) -> None:
        """Test numeric inequality comparison."""
        result = evaluator._numeric_compare(10, "!=", 5)
        assert result.satisfied is True

    def test_numeric_compare_greater_than(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Test numeric greater than comparison."""
        result = evaluator._numeric_compare(10, ">", 5)
        assert result.satisfied is True

    def test_numeric_compare_greater_equal(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Test numeric greater or equal comparison."""
        result = evaluator._numeric_compare(10, ">=", 10)
        assert result.satisfied is True

    def test_numeric_compare_less_than(self, evaluator: ConditionEvaluator) -> None:
        """Test numeric less than comparison."""
        result = evaluator._numeric_compare(5, "<", 10)
        assert result.satisfied is True

    def test_numeric_compare_less_equal(self, evaluator: ConditionEvaluator) -> None:
        """Test numeric less or equal comparison."""
        result = evaluator._numeric_compare(10, "<=", 10)
        assert result.satisfied is True

    def test_numeric_compare_floats(self, evaluator: ConditionEvaluator) -> None:
        """Test numeric comparison with floats."""
        result = evaluator._numeric_compare(3.14, ">", 3.0)
        assert result.satisfied is True

    def test_numeric_compare_mixed_int_float(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Test numeric comparison with mixed int and float."""
        result = evaluator._numeric_compare(5, "==", 5.0)
        assert result.satisfied is True

    def test_numeric_compare_unsupported_operator(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Test unsupported operator raises ConditionError."""
        with pytest.raises(ConditionError, match="Unsupported operator"):
            evaluator._numeric_compare(5, "contains", 5)

    def test_numeric_compare_reason_format(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Test numeric comparison reason format."""
        result = evaluator._numeric_compare(10, ">", 5)
        assert result.reason == "10 > 5"


class TestStringCompare(TestConditionEvaluatorFixtures):
    """Tests for _string_compare method."""

    def test_string_compare_equal(self, evaluator: ConditionEvaluator) -> None:
        """Test string equality comparison."""
        result = evaluator._string_compare("hello", "==", "hello")
        assert result.satisfied is True

    def test_string_compare_not_equal(self, evaluator: ConditionEvaluator) -> None:
        """Test string inequality comparison."""
        result = evaluator._string_compare("hello", "!=", "world")
        assert result.satisfied is True

    def test_string_compare_equal_case_sensitive(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Test string equality is case-sensitive."""
        result = evaluator._string_compare("Hello", "==", "hello")
        assert result.satisfied is False

    def test_string_compare_unsupported_operator(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Test unsupported operator raises ConditionError."""
        with pytest.raises(ConditionError, match="not supported for string comparison"):
            evaluator._string_compare("a", ">", "b")

    def test_string_compare_reason_format(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Test string comparison reason format."""
        result = evaluator._string_compare("hello", "==", "hello")
        assert "'hello' == 'hello'" in result.reason


class TestCompareMethod(TestConditionEvaluatorFixtures):
    """Tests for _compare method covering all operator branches."""

    def test_compare_is_empty_true(self, evaluator: ConditionEvaluator) -> None:
        """Test _compare with is empty operator on empty value."""
        result = evaluator._compare("", "is empty", "")
        assert result.satisfied is True

    def test_compare_is_empty_false(self, evaluator: ConditionEvaluator) -> None:
        """Test _compare with is empty operator on non-empty value."""
        result = evaluator._compare("value", "is empty", "")
        assert result.satisfied is False

    def test_compare_is_not_empty_true(self, evaluator: ConditionEvaluator) -> None:
        """Test _compare with is not empty operator on non-empty value."""
        result = evaluator._compare("value", "is not empty", "")
        assert result.satisfied is True

    def test_compare_is_not_empty_false(self, evaluator: ConditionEvaluator) -> None:
        """Test _compare with is not empty operator on empty value."""
        result = evaluator._compare("", "is not empty", "")
        assert result.satisfied is False

    def test_compare_contains_true(self, evaluator: ConditionEvaluator) -> None:
        """Test _compare with contains operator."""
        result = evaluator._compare("Hello World", "contains", "World")
        assert result.satisfied is True

    def test_compare_not_contains_true(self, evaluator: ConditionEvaluator) -> None:
        """Test _compare with not contains operator."""
        result = evaluator._compare("Hello World", "not contains", "Goodbye")
        assert result.satisfied is True

    def test_compare_starts_with(self, evaluator: ConditionEvaluator) -> None:
        """Test _compare with starts with operator."""
        result = evaluator._compare("Hello World", "starts with", "Hello")
        assert result.satisfied is True

    def test_compare_ends_with(self, evaluator: ConditionEvaluator) -> None:
        """Test _compare with ends with operator."""
        result = evaluator._compare("Hello World", "ends with", "World")
        assert result.satisfied is True

    def test_compare_numeric_fallback(self, evaluator: ConditionEvaluator) -> None:
        """Test _compare falls back to numeric comparison when possible."""
        result = evaluator._compare("10", ">", "5")
        assert result.satisfied is True

    def test_compare_string_fallback(self, evaluator: ConditionEvaluator) -> None:
        """Test _compare falls back to string comparison for non-numerics."""
        result = evaluator._compare("abc", "==", "abc")
        assert result.satisfied is True


class TestEvaluateCompoundMethod(TestConditionEvaluatorFixtures):
    """Tests specifically for _evaluate_compound method."""

    def test_evaluate_compound_and_true(self, evaluator: ConditionEvaluator) -> None:
        """Test _evaluate_compound with AND returning true."""
        result = evaluator._evaluate_compound("{status} == success and {count} > 5")
        assert result.satisfied is True

    def test_evaluate_compound_or_true(self, evaluator: ConditionEvaluator) -> None:
        """Test _evaluate_compound with OR returning true."""
        result = evaluator._evaluate_compound(
            "{status} == failure or {count} > 5"
        )
        assert result.satisfied is True

    def test_evaluate_compound_preserves_reasons(
        self, evaluator: ConditionEvaluator
    ) -> None:
        """Test _evaluate_compound preserves individual reasons."""
        result = evaluator._evaluate_compound("{status} == success and {count} > 5")
        # The reason should contain both sub-condition results
        assert "AND" in result.reason


class TestNestedVariables(TestConditionEvaluatorFixtures):
    """Tests for nested/dot-notation variable access."""

    @pytest.fixture
    def context_with_nested(self) -> ExecutionContext:
        """Create context with nested object data."""
        ctx = ExecutionContext(project_path=Path("/test/path"))
        ctx.set("user", '{"name": "John", "age": 30}')
        ctx.set("items", '["a", "b", "c"]')
        return ctx

    def test_evaluate_nested_variable(
        self, context_with_nested: ExecutionContext
    ) -> None:
        """Test condition with nested variable access."""
        evaluator = ConditionEvaluator(context_with_nested)
        result = evaluator.evaluate("{user.name} == John")
        assert result.satisfied is True

    def test_evaluate_nested_numeric(
        self, context_with_nested: ExecutionContext
    ) -> None:
        """Test condition with nested numeric value."""
        evaluator = ConditionEvaluator(context_with_nested)
        result = evaluator.evaluate("{user.age} > 25")
        assert result.satisfied is True


class TestEdgeCases(TestConditionEvaluatorFixtures):
    """Tests for edge cases and boundary conditions."""

    def test_evaluate_special_characters_in_value(
        self, context: ExecutionContext
    ) -> None:
        """Test condition with special characters in value."""
        context.set("special", "hello@world.com")
        evaluator = ConditionEvaluator(context)
        result = evaluator.evaluate("{special} contains @")
        assert result.satisfied is True

    def test_evaluate_variable_in_right_side(
        self, context: ExecutionContext
    ) -> None:
        """Test condition with variable on right side of comparison."""
        context.set("expected", "success")
        evaluator = ConditionEvaluator(context)
        result = evaluator.evaluate("{status} == {expected}")
        assert result.satisfied is True

    def test_evaluate_both_sides_variables(
        self, context: ExecutionContext
    ) -> None:
        """Test condition with variables on both sides."""
        context.set("val1", "10")
        context.set("val2", "5")
        evaluator = ConditionEvaluator(context)
        result = evaluator.evaluate("{val1} > {val2}")
        assert result.satisfied is True

    def test_evaluate_whitespace_in_value(
        self, context: ExecutionContext
    ) -> None:
        """Test condition with whitespace in variable value."""
        context.set("phrase", "hello world")
        evaluator = ConditionEvaluator(context)
        result = evaluator.evaluate("{phrase} contains world")
        assert result.satisfied is True

    def test_evaluate_numeric_zero(self, context: ExecutionContext) -> None:
        """Test condition with zero value."""
        context.set("zero", "0")
        evaluator = ConditionEvaluator(context)
        result = evaluator.evaluate("{zero} == 0")
        assert result.satisfied is True

    def test_evaluate_large_numbers(self, context: ExecutionContext) -> None:
        """Test condition with large numbers."""
        context.set("big", "1000000000")
        evaluator = ConditionEvaluator(context)
        result = evaluator.evaluate("{big} > 999999999")
        assert result.satisfied is True


class TestOperatorPatterns:
    """Tests for operator pattern matching and parsing."""

    def test_operator_list_order(self) -> None:
        """Test that operators are in correct order for matching."""
        ops = ConditionEvaluator.OPERATORS
        # Longer operators should come before shorter ones
        assert ops.index("is not empty") < ops.index("is empty")
        assert ops.index("not contains") < ops.index("contains")
        assert ops.index(">=") < ops.index(">")
        assert ops.index("<=") < ops.index("<")

    def test_var_pattern_simple(self) -> None:
        """Test VAR_PATTERN matches simple variable."""
        match = ConditionEvaluator.VAR_PATTERN.fullmatch("{var}")
        assert match is not None
        assert match.group(1) == "var"

    def test_var_pattern_with_underscore(self) -> None:
        """Test VAR_PATTERN matches variable with underscore."""
        match = ConditionEvaluator.VAR_PATTERN.fullmatch("{var_name}")
        assert match is not None
        assert match.group(1) == "var_name"

    def test_var_pattern_nested(self) -> None:
        """Test VAR_PATTERN matches nested variable."""
        match = ConditionEvaluator.VAR_PATTERN.fullmatch("{obj.field.nested}")
        assert match is not None
        assert match.group(1) == "obj.field.nested"

    def test_var_pattern_with_numbers(self) -> None:
        """Test VAR_PATTERN matches variable with numbers."""
        match = ConditionEvaluator.VAR_PATTERN.fullmatch("{var1.field2}")
        assert match is not None

    def test_simple_pattern_matches_condition(self) -> None:
        """Test SIMPLE_PATTERN matches a basic condition."""
        match = ConditionEvaluator.SIMPLE_PATTERN.match("{var} == value")
        assert match is not None
        left, op, right = match.groups()
        assert left == "{var}"
        assert op == "=="
        assert right == "value"

    def test_compound_pattern_finds_and(self) -> None:
        """Test COMPOUND_PATTERN finds 'and' keyword."""
        match = ConditionEvaluator.COMPOUND_PATTERN.search("cond1 and cond2")
        assert match is not None
        assert match.group(1).lower() == "and"

    def test_compound_pattern_finds_or(self) -> None:
        """Test COMPOUND_PATTERN finds 'or' keyword."""
        match = ConditionEvaluator.COMPOUND_PATTERN.search("cond1 or cond2")
        assert match is not None
        assert match.group(1).lower() == "or"
