"""Input validation for shared steps."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from orchestrator.shared_steps.errors import (
    InputSchemaValidationError,
    RequiredInputMissingError,
)
from orchestrator.shared_steps.types import InputDefinition, SharedStepConfig


class InputValidator:
    """Validates inputs for shared steps.

    Handles required input checking and optional JSON Schema validation.
    """

    def __init__(self) -> None:
        """Initialize the validator."""
        self._jsonschema_available: Optional[bool] = None

    def _check_jsonschema_available(self) -> bool:
        """Check if jsonschema library is available."""
        if self._jsonschema_available is None:
            try:
                import jsonschema  # noqa: F401

                self._jsonschema_available = True
            except ImportError:
                self._jsonschema_available = False
        return self._jsonschema_available

    def validate(
        self,
        config: SharedStepConfig,
        provided_inputs: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Validate and prepare inputs for a shared step.

        This method:
        1. Checks that all required inputs are provided
        2. Applies default values for missing optional inputs
        3. Validates values against JSON Schema (if defined)

        Args:
            config: The shared step configuration
            provided_inputs: Input values provided by the caller

        Returns:
            Complete input dictionary with defaults applied

        Raises:
            RequiredInputMissingError: If a required input is missing
            InputSchemaValidationError: If an input fails schema validation
        """
        result: Dict[str, Any] = {}

        for input_def in config.inputs:
            value = provided_inputs.get(input_def.name)

            # Check required inputs
            if value is None:
                if input_def.required:
                    raise RequiredInputMissingError(
                        input_name=input_def.name,
                        step_id=config.identifier,
                    )
                # Apply default value
                value = input_def.default

            # Validate against schema if provided
            if value is not None and input_def.schema is not None:
                self._validate_schema(
                    input_def=input_def,
                    value=value,
                    step_id=config.identifier,
                )

            result[input_def.name] = value

        return result

    def _validate_schema(
        self,
        input_def: InputDefinition,
        value: Any,
        step_id: str,
    ) -> None:
        """Validate a value against a JSON Schema.

        Args:
            input_def: The input definition containing the schema
            value: The value to validate
            step_id: Identifier of the shared step (for error messages)

        Raises:
            InputSchemaValidationError: If validation fails
        """
        if input_def.schema is None:
            return

        if not self._check_jsonschema_available():
            # Skip schema validation if jsonschema not installed
            return

        import jsonschema
        from jsonschema import Draft7Validator, ValidationError

        validator = Draft7Validator(input_def.schema)
        errors: List[str] = []

        for error in validator.iter_errors(value):
            errors.append(self._format_validation_error(error))

        if errors:
            raise InputSchemaValidationError(
                input_name=input_def.name,
                step_id=step_id,
                value=value,
                schema=input_def.schema,
                validation_errors=errors,
            )

    def _format_validation_error(self, error: Any) -> str:
        """Format a jsonschema ValidationError into a readable message.

        Args:
            error: The ValidationError from jsonschema

        Returns:
            Formatted error message
        """
        path = ".".join(str(p) for p in error.absolute_path) if error.absolute_path else "root"
        return f"{path}: {error.message}"

    def get_input_summary(
        self,
        config: SharedStepConfig,
        provided_inputs: Dict[str, Any],
    ) -> Dict[str, Dict[str, Any]]:
        """Get a summary of inputs for display purposes.

        Args:
            config: The shared step configuration
            provided_inputs: Input values provided by the caller

        Returns:
            Dictionary mapping input names to their details:
            {
                "input_name": {
                    "value": <actual value>,
                    "source": "provided" | "default" | "missing",
                    "required": bool,
                }
            }
        """
        summary: Dict[str, Dict[str, Any]] = {}

        for input_def in config.inputs:
            value = provided_inputs.get(input_def.name)
            source: str

            if value is not None:
                source = "provided"
            elif input_def.default is not None:
                value = input_def.default
                source = "default"
            else:
                source = "missing"

            summary[input_def.name] = {
                "value": value,
                "source": source,
                "required": input_def.required,
            }

        return summary


# Global validator instance
_validator: Optional[InputValidator] = None


def get_validator() -> InputValidator:
    """Get the global InputValidator instance."""
    global _validator
    if _validator is None:
        _validator = InputValidator()
    return _validator


def validate_inputs(
    config: SharedStepConfig,
    provided_inputs: Dict[str, Any],
) -> Dict[str, Any]:
    """Validate and prepare inputs for a shared step.

    Convenience function that uses the global validator.

    Args:
        config: The shared step configuration
        provided_inputs: Input values provided by the caller

    Returns:
        Complete input dictionary with defaults applied

    Raises:
        RequiredInputMissingError: If a required input is missing
        InputSchemaValidationError: If an input fails schema validation
    """
    return get_validator().validate(config, provided_inputs)
