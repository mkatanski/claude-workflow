"""Shared steps module for reusable workflow step definitions.

This module provides functionality similar to GitHub Actions composite actions,
allowing users to define reusable step sequences with inputs and outputs.

Usage:
    Shared steps can be referenced in workflows using the 'uses' field:

    ```yaml
    steps:
      - name: Checkout code
        uses: builtin:git-checkout
        with:
          repository: "https://github.com/user/repo"
          branch: "main"
        outputs:
          sha: commit_sha
    ```

Resolution Strategies:
    - builtin:name  - Steps shipped with the orchestrator package
    - project:name  - Steps in the user's .claude/workflows/steps/ directory
    - path:./path   - Relative path from the workflow file
"""

from orchestrator.shared_steps.errors import (
    CircularDependencyError,
    InputSchemaValidationError,
    InputValidationError,
    MaxDepthExceededError,
    RequiredInputMissingError,
    SharedStepError,
    SharedStepExecutionError,
    SharedStepNotFoundError,
    SharedStepParseError,
)
from orchestrator.shared_steps.executor import (
    SharedStepExecutor,
    get_executor,
)
from orchestrator.shared_steps.resolver import SharedStepResolver
from orchestrator.shared_steps.types import (
    InputDefinition,
    OutputDefinition,
    SharedStepConfig,
    SharedStepExecutionState,
)
from orchestrator.shared_steps.validator import (
    InputValidator,
    get_validator,
    validate_inputs,
)

__all__ = [
    # Types
    "InputDefinition",
    "OutputDefinition",
    "SharedStepConfig",
    "SharedStepExecutionState",
    # Resolver
    "SharedStepResolver",
    # Validator
    "InputValidator",
    "get_validator",
    "validate_inputs",
    # Executor
    "SharedStepExecutor",
    "get_executor",
    # Errors
    "SharedStepError",
    "SharedStepNotFoundError",
    "CircularDependencyError",
    "MaxDepthExceededError",
    "InputValidationError",
    "RequiredInputMissingError",
    "InputSchemaValidationError",
    "SharedStepParseError",
    "SharedStepExecutionError",
]
