"""Custom exceptions for shared steps."""

from typing import Any, Dict, List, Optional


class SharedStepError(Exception):
    """Base exception for all shared step errors."""

    pass


class SharedStepNotFoundError(SharedStepError):
    """Raised when a shared step definition cannot be found.

    Attributes:
        uses: The 'uses' reference that failed to resolve
        searched_paths: List of paths that were searched
    """

    def __init__(
        self,
        uses: str,
        searched_paths: Optional[List[str]] = None,
        message: Optional[str] = None,
    ):
        self.uses = uses
        self.searched_paths = searched_paths or []

        if message:
            super().__init__(message)
        else:
            paths_info = ""
            if self.searched_paths:
                paths_info = f"\nSearched paths:\n  " + "\n  ".join(self.searched_paths)
            super().__init__(f"Shared step not found: {uses}{paths_info}")


class CircularDependencyError(SharedStepError):
    """Raised when a circular dependency is detected in shared steps.

    Attributes:
        chain: The dependency chain that forms the cycle
    """

    def __init__(self, message: str, chain: Optional[List[str]] = None):
        self.chain = chain or []
        super().__init__(message)


class MaxDepthExceededError(SharedStepError):
    """Raised when shared step nesting exceeds the maximum depth.

    Attributes:
        depth: The depth at which the error occurred
        max_depth: The maximum allowed depth
    """

    def __init__(
        self,
        message: str,
        depth: Optional[int] = None,
        max_depth: Optional[int] = None,
    ):
        self.depth = depth
        self.max_depth = max_depth
        super().__init__(message)


class InputValidationError(SharedStepError):
    """Base class for input validation errors.

    Attributes:
        input_name: Name of the input that failed validation
        step_id: Identifier of the shared step
    """

    def __init__(
        self,
        message: str,
        input_name: Optional[str] = None,
        step_id: Optional[str] = None,
    ):
        self.input_name = input_name
        self.step_id = step_id
        super().__init__(message)


class RequiredInputMissingError(InputValidationError):
    """Raised when a required input is not provided.

    Attributes:
        input_name: Name of the missing required input
        step_id: Identifier of the shared step
    """

    def __init__(self, input_name: str, step_id: str):
        message = f"Required input '{input_name}' not provided for step '{step_id}'"
        super().__init__(message, input_name=input_name, step_id=step_id)


class InputSchemaValidationError(InputValidationError):
    """Raised when an input value fails JSON Schema validation.

    Attributes:
        input_name: Name of the input that failed validation
        step_id: Identifier of the shared step
        value: The value that failed validation
        schema: The JSON Schema that was violated
        validation_errors: List of specific validation error messages
    """

    def __init__(
        self,
        input_name: str,
        step_id: str,
        value: Any,
        schema: Dict[str, Any],
        validation_errors: List[str],
    ):
        self.value = value
        self.schema = schema
        self.validation_errors = validation_errors

        errors_str = "\n  - ".join(validation_errors)
        message = (
            f"Input '{input_name}' for step '{step_id}' failed schema validation:\n"
            f"  Value: {value!r}\n"
            f"  Errors:\n  - {errors_str}"
        )
        super().__init__(message, input_name=input_name, step_id=step_id)


class SharedStepParseError(SharedStepError):
    """Raised when a shared step definition file cannot be parsed.

    Attributes:
        file_path: Path to the file that failed to parse
        parse_error: The underlying parse error message
    """

    def __init__(self, file_path: str, parse_error: str):
        self.file_path = file_path
        self.parse_error = parse_error
        super().__init__(f"Failed to parse shared step at {file_path}: {parse_error}")


class SharedStepExecutionError(SharedStepError):
    """Raised when a shared step fails during execution.

    Attributes:
        step_id: Identifier of the shared step that failed
        internal_step_name: Name of the internal step that caused the failure
        internal_step_index: Index of the failing step (0-based)
        total_steps: Total number of internal steps
        error: The underlying error message
    """

    def __init__(
        self,
        step_id: str,
        internal_step_name: str,
        internal_step_index: int,
        total_steps: int,
        error: str,
    ):
        self.step_id = step_id
        self.internal_step_name = internal_step_name
        self.internal_step_index = internal_step_index
        self.total_steps = total_steps
        self.error = error

        message = (
            f"Shared step '{step_id}' failed at internal step "
            f"'{internal_step_name}' ({internal_step_index + 1}/{total_steps}): {error}"
        )
        super().__init__(message)
