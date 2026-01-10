"""Condition evaluation for conditional step execution."""

import re
from dataclasses import dataclass
from typing import Optional, Union

from .context import ExecutionContext


@dataclass
class ConditionResult:
    """Result of condition evaluation."""

    satisfied: bool
    reason: str


class ConditionError(Exception):
    """Raised when condition evaluation fails."""

    pass


class ConditionEvaluator:
    """Evaluates condition expressions safely using regex-based parsing."""

    # Operators in order of matching (longer operators first to avoid partial matches)
    OPERATORS = [
        "is not empty",
        "is empty",
        "not contains",
        "contains",
        "starts with",
        "ends with",
        ">=",
        "<=",
        "!=",
        "==",
        ">",
        "<",
    ]

    # Build pattern dynamically from operators
    OPERATOR_PATTERN = "|".join(re.escape(op) for op in OPERATORS)

    # Pattern to extract variable reference like {var_name} or {var.field.nested}
    VAR_PATTERN = re.compile(r"\{([\w_][\w_\d]*(?:\.[\w_\d]+)*)\}")

    # Pattern for simple conditions: {var} operator value
    SIMPLE_PATTERN = re.compile(
        rf"^\s*(.+?)\s+({OPERATOR_PATTERN})\s*(.*?)\s*$",
        re.IGNORECASE,
    )

    # Pattern for compound conditions (and/or)
    COMPOUND_PATTERN = re.compile(r"\s+(and|or)\s+", re.IGNORECASE)

    def __init__(self, context: ExecutionContext) -> None:
        self.context = context

    def evaluate(self, condition: str) -> ConditionResult:
        """Evaluate a condition expression.

        Args:
            condition: The condition string from YAML

        Returns:
            ConditionResult with satisfied bool and explanation

        Raises:
            ConditionError: If condition syntax is invalid
        """
        if not condition or not condition.strip():
            return ConditionResult(True, "No condition specified")

        # Check for compound conditions (and/or)
        if self.COMPOUND_PATTERN.search(condition):
            return self._evaluate_compound(condition)

        return self._evaluate_simple(condition)

    def _evaluate_simple(self, condition: str) -> ConditionResult:
        """Evaluate a simple condition (no and/or)."""
        # Parse the condition BEFORE interpolating to preserve structure
        match = self.SIMPLE_PATTERN.match(condition)
        if not match:
            raise ConditionError(
                f"Invalid condition syntax: '{condition}'. "
                f"Expected format: '{{var}} operator value' or '{{var}} is empty'"
            )

        left_raw, operator_str, right_raw = match.groups()
        operator = operator_str.lower().strip()

        # Resolve left side - check if it's a variable reference
        left_value = self._resolve_value(left_raw.strip())

        # Resolve right side (may also contain variables)
        right_value = self._resolve_value((right_raw or "").strip())

        return self._compare(left_value, operator, right_value)

    def _resolve_value(self, value: str) -> str:
        """Resolve a value, interpolating any variable references."""
        # Strip quotes first
        value = self._strip_quotes(value)

        # Check if this is a variable reference like {var_name} or {var.field.nested}
        var_match = self.VAR_PATTERN.fullmatch(value)
        if var_match:
            # Use interpolate which handles both simple vars and dot notation
            result = self.context.interpolate(value)
            # If interpolation returned the original placeholder, treat as empty
            if result == value:
                return ""
            return result

        # Otherwise interpolate any embedded variables
        return self.context.interpolate(value)

    def _strip_quotes(self, value: str) -> str:
        """Remove surrounding quotes from a value."""
        if len(value) >= 2:
            if (value.startswith("'") and value.endswith("'")) or (
                value.startswith('"') and value.endswith('"')
            ):
                return value[1:-1]
        return value

    def _compare(self, left: str, operator: str, right: str) -> ConditionResult:
        """Perform the actual comparison."""
        # Unary operators (is empty, is not empty)
        if operator == "is empty":
            result = not left or left.strip() == ""
            return ConditionResult(
                result,
                f"value is {'empty' if result else 'not empty'}",
            )

        if operator == "is not empty":
            result = bool(left and left.strip())
            return ConditionResult(
                result,
                f"value is {'not empty' if result else 'empty'}",
            )

        # String operators
        if operator == "contains":
            result = right.lower() in left.lower()
            return ConditionResult(
                result,
                f"{'contains' if result else 'does not contain'} '{right}'",
            )

        if operator == "not contains":
            result = right.lower() not in left.lower()
            return ConditionResult(
                result,
                f"{'does not contain' if result else 'contains'} '{right}'",
            )

        if operator == "starts with":
            result = left.lower().startswith(right.lower())
            return ConditionResult(
                result,
                f"{'starts with' if result else 'does not start with'} '{right}'",
            )

        if operator == "ends with":
            result = left.lower().endswith(right.lower())
            return ConditionResult(
                result,
                f"{'ends with' if result else 'does not end with'} '{right}'",
            )

        # Try numeric comparison first
        left_num = self._try_numeric(left)
        right_num = self._try_numeric(right)

        if left_num is not None and right_num is not None:
            return self._numeric_compare(left_num, operator, right_num)

        # Fall back to string comparison
        return self._string_compare(left, operator, right)

    def _try_numeric(self, value: str) -> Optional[Union[int, float]]:
        """Try to convert string to number."""
        try:
            if "." in value:
                return float(value)
            return int(value)
        except (ValueError, TypeError):
            return None

    def _numeric_compare(
        self,
        left: Union[int, float],
        operator: str,
        right: Union[int, float],
    ) -> ConditionResult:
        """Compare numeric values."""
        ops = {
            "==": left == right,
            "!=": left != right,
            ">": left > right,
            ">=": left >= right,
            "<": left < right,
            "<=": left <= right,
        }

        if operator not in ops:
            raise ConditionError(
                f"Unsupported operator for numeric comparison: {operator}"
            )

        result = ops[operator]
        return ConditionResult(result, f"{left} {operator} {right}")

    def _string_compare(self, left: str, operator: str, right: str) -> ConditionResult:
        """Compare string values."""
        if operator == "==":
            result = left == right
        elif operator == "!=":
            result = left != right
        else:
            raise ConditionError(
                f"Operator '{operator}' not supported for string comparison. "
                f"Use '==' or '!=' for strings, or numeric operators for numbers."
            )

        return ConditionResult(
            result,
            f"'{left}' {operator} '{right}'",
        )

    def _evaluate_compound(self, condition: str) -> ConditionResult:
        """Evaluate compound conditions with and/or."""
        # Split by 'and' and 'or' while preserving the operator
        parts = self.COMPOUND_PATTERN.split(condition)

        if len(parts) < 3:
            raise ConditionError(f"Invalid compound condition: {condition}")

        # Evaluate first condition
        current_result = self._evaluate_simple(parts[0])
        reasons = [current_result.reason]

        i = 1
        while i < len(parts):
            logical_op = parts[i].lower()
            next_condition = parts[i + 1]
            next_result = self._evaluate_simple(next_condition)
            reasons.append(next_result.reason)

            if logical_op == "and":
                current_result = ConditionResult(
                    current_result.satisfied and next_result.satisfied,
                    " AND ".join(reasons),
                )
            elif logical_op == "or":
                current_result = ConditionResult(
                    current_result.satisfied or next_result.satisfied,
                    " OR ".join(reasons),
                )

            i += 2

        return current_result
