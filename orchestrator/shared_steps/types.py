"""Type definitions for shared steps."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional


@dataclass
class InputDefinition:
    """Definition of an input parameter for a shared step.

    Attributes:
        name: Parameter name (used in {inputs.name} interpolation)
        description: Human-readable description
        required: Whether this input must be provided
        default: Default value if not provided
        schema: Optional JSON Schema for validation
    """

    name: str
    description: str = ""
    required: bool = True
    default: Any = None
    schema: Optional[Dict[str, Any]] = None


@dataclass
class OutputDefinition:
    """Definition of an output from a shared step.

    Attributes:
        name: Output name (exposed to parent workflow)
        description: Human-readable description
        from_var: Name of internal variable to expose
    """

    name: str
    description: str = ""
    from_var: str = ""


@dataclass
class SharedStepConfig:
    """Complete configuration for a shared step.

    Attributes:
        name: Human-readable name of the shared step
        description: What this shared step does
        version: Schema version (currently 1)
        inputs: List of input parameter definitions
        outputs: List of output definitions
        steps: Raw step dictionaries (parsed by workflow runner)
        source_path: Path to the step.yml file
        source_type: How this step was resolved (builtin, project, path)
        identifier: Full identifier (e.g., "builtin:git-checkout")
    """

    name: str
    description: str
    version: int
    inputs: List[InputDefinition]
    outputs: List[OutputDefinition]
    steps: List[Dict[str, Any]]
    source_path: Path
    source_type: Literal["builtin", "project", "path"]
    identifier: str

    def get_input(self, name: str) -> Optional[InputDefinition]:
        """Get input definition by name."""
        for inp in self.inputs:
            if inp.name == name:
                return inp
        return None

    def get_required_inputs(self) -> List[InputDefinition]:
        """Get all required input definitions."""
        return [inp for inp in self.inputs if inp.required]

    def get_optional_inputs(self) -> List[InputDefinition]:
        """Get all optional input definitions."""
        return [inp for inp in self.inputs if not inp.required]


@dataclass
class SharedStepExecutionState:
    """Tracks state during shared step execution.

    Used for circular dependency detection and depth limiting.

    Attributes:
        resolution_stack: Stack of step identifiers being executed
        max_depth: Maximum allowed nesting depth
    """

    resolution_stack: List[str] = field(default_factory=list)
    max_depth: int = 10

    def push(self, step_id: str) -> None:
        """Push a step onto the resolution stack.

        Args:
            step_id: Identifier of step being executed

        Raises:
            CircularDependencyError: If step_id is already in stack
            MaxDepthExceededError: If max depth would be exceeded
        """
        # Import here to avoid circular imports
        from orchestrator.shared_steps.errors import (
            CircularDependencyError,
            MaxDepthExceededError,
        )

        if step_id in self.resolution_stack:
            chain = " → ".join(self.resolution_stack + [step_id])
            raise CircularDependencyError(
                f"Circular dependency detected: {chain}"
            )

        if len(self.resolution_stack) >= self.max_depth:
            raise MaxDepthExceededError(
                f"Maximum nesting depth ({self.max_depth}) exceeded. "
                f"Current stack: {' → '.join(self.resolution_stack)}"
            )

        self.resolution_stack.append(step_id)

    def pop(self) -> str:
        """Pop the most recent step from the resolution stack.

        Returns:
            The popped step identifier
        """
        return self.resolution_stack.pop()

    @property
    def depth(self) -> int:
        """Current nesting depth."""
        return len(self.resolution_stack)

    @property
    def current_step(self) -> Optional[str]:
        """Currently executing step identifier."""
        return self.resolution_stack[-1] if self.resolution_stack else None

    def copy(self) -> SharedStepExecutionState:
        """Create a copy of this state."""
        return SharedStepExecutionState(
            resolution_stack=self.resolution_stack.copy(),
            max_depth=self.max_depth,
        )
