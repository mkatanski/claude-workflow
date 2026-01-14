"""Expression evaluator for set tool expressions.

Supports arithmetic, string operations, comparisons, and conditionals.
Uses safe token-based parsing.
"""

import re
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, List, Optional, Union

if TYPE_CHECKING:
    from .context import ExecutionContext


@dataclass
class ExpressionError(Exception):
    """Raised when expression evaluation fails."""

    message: str

    def __str__(self) -> str:
        return self.message


class ExpressionEvaluator:
    """Safely evaluates expressions using token-based parsing.

    Supported operations:
    - Arithmetic: +, -, *, /, % (modulo)
    - Comparison: ==, !=, >, <, >=, <=
    - Boolean: and, or, not
    - String: + (concatenation)
    - Conditional: if COND then VALUE else VALUE
    - Parentheses for grouping
    """

    # Token patterns
    _TOKEN_PATTERN = re.compile(
        r"""
        (?P<NUMBER>-?\d+(?:\.\d+)?)           |  # Numbers (int or float)
        (?P<STRING>"[^"]*"|'[^']*')           |  # Quoted strings
        (?P<BOOL>true|false)                  |  # Boolean literals
        (?P<KEYWORD>if|then|else|and|or|not)  |  # Keywords
        (?P<OP>==|!=|>=|<=|>|<|\+|-|\*|/|%)   |  # Operators
        (?P<PAREN>[()]) |                        # Parentheses
        (?P<IDENT>[a-zA-Z_][a-zA-Z0-9_]*) |      # Identifiers (unquoted strings)
        (?P<WS>\s+)                              # Whitespace
        """,
        re.VERBOSE | re.IGNORECASE,
    )

    def __init__(self, context: "ExecutionContext") -> None:
        self.context = context

    def evaluate(self, expression: str) -> str:
        """Evaluate an expression and return the result as a string.

        Args:
            expression: The expression to evaluate

        Returns:
            The result as a string

        Raises:
            ExpressionError: If the expression is invalid or cannot be evaluated
        """
        # First interpolate variables
        interpolated = self.context.interpolate(expression)

        # Tokenize
        tokens = self._tokenize(interpolated)
        if not tokens:
            return interpolated

        # Parse and evaluate
        result, remaining = self._parse_conditional(tokens)
        if remaining:
            raise ExpressionError(f"Unexpected tokens at end: {remaining}")

        return self._to_string(result)

    def _tokenize(self, expr: str) -> List[tuple[str, str]]:
        """Tokenize expression into (type, value) pairs."""
        tokens: List[tuple[str, str]] = []
        pos = 0

        while pos < len(expr):
            match = self._TOKEN_PATTERN.match(expr, pos)
            if not match:
                # Treat unmatched content as raw string
                remaining = expr[pos:]
                # Check if it's just unquoted text
                if remaining.strip():
                    tokens.append(("STRING", remaining.strip()))
                break

            pos = match.end()

            if match.lastgroup == "WS":
                continue

            if match.lastgroup == "NUMBER":
                tokens.append(("NUMBER", match.group()))
            elif match.lastgroup == "STRING":
                # Remove quotes
                s = match.group()
                tokens.append(("STRING", s[1:-1]))
            elif match.lastgroup == "BOOL":
                tokens.append(("BOOL", match.group().lower()))
            elif match.lastgroup == "KEYWORD":
                tokens.append(("KEYWORD", match.group().lower()))
            elif match.lastgroup == "OP":
                tokens.append(("OP", match.group()))
            elif match.lastgroup == "PAREN":
                tokens.append(("PAREN", match.group()))
            elif match.lastgroup == "IDENT":
                # Check if it's a keyword (shouldn't match here due to regex order)
                text = match.group()
                if text.lower() in ("true", "false"):
                    tokens.append(("BOOL", text.lower()))
                elif text.lower() in ("if", "then", "else", "and", "or", "not"):
                    tokens.append(("KEYWORD", text.lower()))
                else:
                    # Treat as unquoted string value
                    tokens.append(("STRING", text))

        return tokens

    def _parse_conditional(
        self, tokens: List[tuple[str, str]]
    ) -> tuple[Any, List[tuple[str, str]]]:
        """Parse conditional: if COND then VALUE else VALUE."""
        if tokens and tokens[0] == ("KEYWORD", "if"):
            tokens = tokens[1:]  # consume 'if'

            # Parse condition
            cond, tokens = self._parse_or(tokens)

            # Expect 'then'
            if not tokens or tokens[0] != ("KEYWORD", "then"):
                raise ExpressionError("Expected 'then' in conditional")
            tokens = tokens[1:]

            # Parse true value
            true_val, tokens = self._parse_or(tokens)

            # Expect 'else'
            if not tokens or tokens[0] != ("KEYWORD", "else"):
                raise ExpressionError("Expected 'else' in conditional")
            tokens = tokens[1:]

            # Parse false value
            false_val, tokens = self._parse_conditional(tokens)

            result = true_val if self._is_truthy(cond) else false_val
            return result, tokens

        return self._parse_or(tokens)

    def _parse_or(
        self, tokens: List[tuple[str, str]]
    ) -> tuple[Any, List[tuple[str, str]]]:
        """Parse: expr (or expr)*"""
        left, tokens = self._parse_and(tokens)

        while tokens and tokens[0] == ("KEYWORD", "or"):
            tokens = tokens[1:]
            right, tokens = self._parse_and(tokens)
            left = self._is_truthy(left) or self._is_truthy(right)

        return left, tokens

    def _parse_and(
        self, tokens: List[tuple[str, str]]
    ) -> tuple[Any, List[tuple[str, str]]]:
        """Parse: expr (and expr)*"""
        left, tokens = self._parse_not(tokens)

        while tokens and tokens[0] == ("KEYWORD", "and"):
            tokens = tokens[1:]
            right, tokens = self._parse_not(tokens)
            left = self._is_truthy(left) and self._is_truthy(right)

        return left, tokens

    def _parse_not(
        self, tokens: List[tuple[str, str]]
    ) -> tuple[Any, List[tuple[str, str]]]:
        """Parse: not expr | comparison"""
        if tokens and tokens[0] == ("KEYWORD", "not"):
            tokens = tokens[1:]
            val, tokens = self._parse_not(tokens)
            return not self._is_truthy(val), tokens

        return self._parse_comparison(tokens)

    def _parse_comparison(
        self, tokens: List[tuple[str, str]]
    ) -> tuple[Any, List[tuple[str, str]]]:
        """Parse: add ((==|!=|>|<|>=|<=) add)?"""
        left, tokens = self._parse_additive(tokens)

        if tokens and tokens[0][0] == "OP" and tokens[0][1] in (
            "==",
            "!=",
            ">",
            "<",
            ">=",
            "<=",
        ):
            op = tokens[0][1]
            tokens = tokens[1:]
            right, tokens = self._parse_additive(tokens)

            left_num = self._try_number(left)
            right_num = self._try_number(right)

            # If both are numbers, compare numerically
            if left_num is not None and right_num is not None:
                left_cmp: Union[float, str] = left_num
                right_cmp: Union[float, str] = right_num
            else:
                # String comparison - normalize bools to lowercase
                left_cmp = self._to_string(left)
                right_cmp = self._to_string(right)

            if op == "==":
                return left_cmp == right_cmp, tokens
            elif op == "!=":
                return left_cmp != right_cmp, tokens
            elif op == ">":
                return left_cmp > right_cmp, tokens
            elif op == "<":
                return left_cmp < right_cmp, tokens
            elif op == ">=":
                return left_cmp >= right_cmp, tokens
            elif op == "<=":
                return left_cmp <= right_cmp, tokens

        return left, tokens

    def _parse_additive(
        self, tokens: List[tuple[str, str]]
    ) -> tuple[Any, List[tuple[str, str]]]:
        """Parse: mult ((+|-) mult)*"""
        left, tokens = self._parse_multiplicative(tokens)

        while tokens and tokens[0][0] == "OP" and tokens[0][1] in ("+", "-"):
            op = tokens[0][1]
            tokens = tokens[1:]
            right, tokens = self._parse_multiplicative(tokens)

            left_num = self._try_number(left)
            right_num = self._try_number(right)

            if op == "+":
                if left_num is not None and right_num is not None:
                    left = left_num + right_num
                else:
                    # String concatenation
                    left = str(left) + str(right)
            else:  # -
                if left_num is not None and right_num is not None:
                    left = left_num - right_num
                else:
                    raise ExpressionError(
                        f"Cannot subtract non-numbers: {left} - {right}"
                    )

        return left, tokens

    def _parse_multiplicative(
        self, tokens: List[tuple[str, str]]
    ) -> tuple[Any, List[tuple[str, str]]]:
        """Parse: unary ((*|/|%) unary)*"""
        left, tokens = self._parse_unary(tokens)

        while tokens and tokens[0][0] == "OP" and tokens[0][1] in ("*", "/", "%"):
            op = tokens[0][1]
            tokens = tokens[1:]
            right, tokens = self._parse_unary(tokens)

            left_num = self._try_number(left)
            right_num = self._try_number(right)

            if left_num is None or right_num is None:
                raise ExpressionError(
                    f"Cannot perform {op} on non-numbers: {left} {op} {right}"
                )

            if op == "*":
                left = left_num * right_num
            elif op == "/":
                if right_num == 0:
                    raise ExpressionError("Division by zero")
                left = left_num / right_num
            else:  # %
                if right_num == 0:
                    raise ExpressionError("Modulo by zero")
                left = left_num % right_num

        return left, tokens

    def _parse_unary(
        self, tokens: List[tuple[str, str]]
    ) -> tuple[Any, List[tuple[str, str]]]:
        """Parse: -primary | primary"""
        if tokens and tokens[0] == ("OP", "-"):
            tokens = tokens[1:]
            val, tokens = self._parse_primary(tokens)
            num = self._try_number(val)
            if num is None:
                raise ExpressionError(f"Cannot negate non-number: {val}")
            return -num, tokens

        return self._parse_primary(tokens)

    def _parse_primary(
        self, tokens: List[tuple[str, str]]
    ) -> tuple[Any, List[tuple[str, str]]]:
        """Parse: NUMBER | STRING | BOOL | (expr)"""
        if not tokens:
            raise ExpressionError("Unexpected end of expression")

        token_type, token_val = tokens[0]

        if token_type == "NUMBER":
            val = float(token_val) if "." in token_val else int(token_val)
            return val, tokens[1:]

        if token_type == "STRING":
            return token_val, tokens[1:]

        if token_type == "BOOL":
            return token_val == "true", tokens[1:]

        if token_type == "PAREN" and token_val == "(":
            tokens = tokens[1:]
            val, tokens = self._parse_conditional(tokens)
            if not tokens or tokens[0] != ("PAREN", ")"):
                raise ExpressionError("Missing closing parenthesis")
            return val, tokens[1:]

        raise ExpressionError(f"Unexpected token: {token_type}={token_val}")

    def _try_number(self, val: Any) -> Optional[float]:
        """Try to convert value to number."""
        if isinstance(val, (int, float)):
            return float(val)
        if isinstance(val, str):
            try:
                return float(val)
            except ValueError:
                return None
        return None

    def _is_truthy(self, val: Any) -> bool:
        """Check if value is truthy."""
        if isinstance(val, bool):
            return val
        if isinstance(val, str):
            return val.lower() not in ("", "false", "0", "null", "none")
        if isinstance(val, (int, float)):
            return val != 0
        return bool(val)

    def _to_string(self, val: Any) -> str:
        """Convert value to string."""
        if isinstance(val, bool):
            return "true" if val else "false"
        if isinstance(val, float):
            # Remove trailing zeros for cleaner output
            if val == int(val):
                return str(int(val))
            return str(val)
        return str(val)
