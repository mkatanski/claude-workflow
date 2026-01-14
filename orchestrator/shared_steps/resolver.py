"""Resolver for shared step references."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml

from orchestrator.shared_steps.errors import (
    SharedStepNotFoundError,
    SharedStepParseError,
)
from orchestrator.shared_steps.types import (
    InputDefinition,
    OutputDefinition,
    SharedStepConfig,
)


class SharedStepResolver:
    """Resolves 'uses:' references to SharedStepConfig objects.

    Supports three resolution strategies:
    - builtin: Steps shipped with the orchestrator package
    - project: Steps in the user's .claude/workflows/steps/ directory
    - path: Relative path from the workflow file

    Attributes:
        project_path: Root path of the user's project
        workflow_dir: Directory containing the current workflow file
    """

    def __init__(
        self,
        project_path: Path,
        workflow_dir: Optional[Path] = None,
    ):
        """Initialize the resolver.

        Args:
            project_path: Root path of the user's project
            workflow_dir: Directory of the current workflow file (for path: resolution)
        """
        self.project_path = project_path
        self.workflow_dir = workflow_dir or project_path / ".claude"
        self._cache: Dict[str, SharedStepConfig] = {}

    @property
    def project_steps_dir(self) -> Path:
        """Directory containing project-specific shared steps."""
        return self.project_path / ".claude" / "workflows" / "steps"

    @property
    def builtin_steps_dir(self) -> Path:
        """Directory containing builtin shared steps."""
        return Path(__file__).parent / "builtin"

    def resolve(self, uses: str) -> SharedStepConfig:
        """Resolve a 'uses:' reference to a SharedStepConfig.

        Args:
            uses: Reference string in format "prefix:name"
                - builtin:name - From orchestrator/shared_steps/builtin/
                - project:name - From .claude/workflows/steps/
                - path:./relative/path - Relative to workflow file

        Returns:
            Parsed SharedStepConfig

        Raises:
            SharedStepNotFoundError: If step definition not found
            SharedStepParseError: If step definition is invalid
            ValueError: If uses format is invalid
        """
        # Check cache first
        if uses in self._cache:
            return self._cache[uses]

        # Parse the uses reference
        if ":" not in uses:
            raise ValueError(
                f"Invalid 'uses' format: '{uses}'. "
                f"Expected 'prefix:name' (e.g., 'builtin:git-checkout')"
            )

        prefix, name = uses.split(":", 1)
        prefix = prefix.lower()

        # Resolve based on prefix
        searched_paths: List[str] = []

        if prefix == "builtin":
            step_file = self.builtin_steps_dir / name / "step.yml"
            searched_paths.append(str(step_file))
            if not step_file.exists():
                # Also try .yaml extension
                step_file = self.builtin_steps_dir / name / "step.yaml"
                searched_paths.append(str(step_file))

        elif prefix == "project":
            step_file = self.project_steps_dir / name / "step.yml"
            searched_paths.append(str(step_file))
            if not step_file.exists():
                step_file = self.project_steps_dir / name / "step.yaml"
                searched_paths.append(str(step_file))

        elif prefix == "path":
            # Relative path from workflow directory
            step_file = self.workflow_dir / name / "step.yml"
            searched_paths.append(str(step_file))
            if not step_file.exists():
                step_file = self.workflow_dir / name / "step.yaml"
                searched_paths.append(str(step_file))
            # Also try the name directly as a file path
            if not step_file.exists():
                step_file = self.workflow_dir / name
                if step_file.suffix not in (".yml", ".yaml"):
                    step_file = step_file / "step.yml"
                searched_paths.append(str(step_file))

        else:
            raise ValueError(
                f"Unknown step source prefix: '{prefix}'. "
                f"Valid prefixes: builtin, project, path"
            )

        if not step_file.exists():
            raise SharedStepNotFoundError(uses, searched_paths)

        # Parse and cache the step config
        config = self._parse_step_file(step_file, prefix, uses)
        self._cache[uses] = config
        return config

    def _parse_step_file(
        self,
        file_path: Path,
        source_type: str,
        identifier: str,
    ) -> SharedStepConfig:
        """Parse a step.yml file into SharedStepConfig.

        Args:
            file_path: Path to the step.yml file
            source_type: One of 'builtin', 'project', 'path'
            identifier: Full identifier string (e.g., 'builtin:git-checkout')

        Returns:
            Parsed SharedStepConfig

        Raises:
            SharedStepParseError: If file cannot be parsed or is invalid
        """
        try:
            with open(file_path, "r") as f:
                data = yaml.safe_load(f)
        except yaml.YAMLError as e:
            raise SharedStepParseError(str(file_path), f"YAML parse error: {e}")
        except OSError as e:
            raise SharedStepParseError(str(file_path), f"File read error: {e}")

        if not isinstance(data, dict):
            raise SharedStepParseError(
                str(file_path),
                "Step file must contain a YAML dictionary",
            )

        # Validate type and version
        if data.get("type") != "claude-step":
            raise SharedStepParseError(
                str(file_path),
                f"Invalid or missing 'type' field. Expected 'claude-step', got: {data.get('type')!r}",
            )

        version = data.get("version")
        if version != 1:
            raise SharedStepParseError(
                str(file_path),
                f"Unsupported version: {version}. Only version 1 is supported.",
            )

        # Parse inputs
        inputs = self._parse_inputs(data.get("inputs", []), file_path)

        # Parse outputs
        outputs = self._parse_outputs(data.get("outputs", []), file_path)

        # Get steps (required)
        steps = data.get("steps", [])
        if not steps:
            raise SharedStepParseError(
                str(file_path),
                "Shared step must define at least one step in 'steps' field",
            )

        # Validate steps are all dicts (not None or other types)
        for idx, step in enumerate(steps):
            if step is None:
                raise SharedStepParseError(
                    str(file_path),
                    f"Step at index {idx} is null/empty",
                )
            if not isinstance(step, dict):
                raise SharedStepParseError(
                    str(file_path),
                    f"Step at index {idx} must be a dictionary, got: {type(step).__name__}",
                )

        return SharedStepConfig(
            name=data.get("name", file_path.parent.name),
            description=data.get("description", ""),
            version=version,
            inputs=inputs,
            outputs=outputs,
            steps=steps,
            source_path=file_path,
            source_type=source_type,  # type: ignore
            identifier=identifier,
        )

    def _parse_inputs(
        self,
        inputs_data: List[Any],
        file_path: Path,
    ) -> List[InputDefinition]:
        """Parse input definitions from YAML data.

        Args:
            inputs_data: List of input definitions from YAML
            file_path: Path to the step file (for error messages)

        Returns:
            List of InputDefinition objects
        """
        inputs: List[InputDefinition] = []

        for idx, inp in enumerate(inputs_data):
            if isinstance(inp, str):
                # Simple string format: just the name (required, no default)
                inputs.append(InputDefinition(name=inp))
            elif isinstance(inp, dict):
                if "name" not in inp:
                    raise SharedStepParseError(
                        str(file_path),
                        f"Input at index {idx} missing required 'name' field",
                    )
                inputs.append(
                    InputDefinition(
                        name=inp["name"],
                        description=inp.get("description", ""),
                        required=inp.get("required", True),
                        default=inp.get("default"),
                        schema=inp.get("schema"),
                    )
                )
            else:
                raise SharedStepParseError(
                    str(file_path),
                    f"Input at index {idx} must be a string or dictionary, got: {type(inp).__name__}",
                )

        return inputs

    def _parse_outputs(
        self,
        outputs_data: List[Any],
        file_path: Path,
    ) -> List[OutputDefinition]:
        """Parse output definitions from YAML data.

        Args:
            outputs_data: List of output definitions from YAML
            file_path: Path to the step file (for error messages)

        Returns:
            List of OutputDefinition objects
        """
        outputs: List[OutputDefinition] = []

        for idx, out in enumerate(outputs_data):
            if isinstance(out, str):
                # Simple string format: name equals from_var
                outputs.append(OutputDefinition(name=out, from_var=out))
            elif isinstance(out, dict):
                if "name" not in out:
                    raise SharedStepParseError(
                        str(file_path),
                        f"Output at index {idx} missing required 'name' field",
                    )
                outputs.append(
                    OutputDefinition(
                        name=out["name"],
                        description=out.get("description", ""),
                        from_var=out.get("from", out.get("from_var", out["name"])),
                    )
                )
            else:
                raise SharedStepParseError(
                    str(file_path),
                    f"Output at index {idx} must be a string or dictionary, got: {type(out).__name__}",
                )

        return outputs

    def clear_cache(self) -> None:
        """Clear the resolution cache."""
        self._cache.clear()

    def list_builtin_steps(self) -> List[str]:
        """List available builtin shared steps.

        Returns:
            List of builtin step names (without 'builtin:' prefix)
        """
        steps: List[str] = []
        if self.builtin_steps_dir.exists():
            for path in self.builtin_steps_dir.iterdir():
                if path.is_dir():
                    step_file = path / "step.yml"
                    if not step_file.exists():
                        step_file = path / "step.yaml"
                    if step_file.exists():
                        steps.append(path.name)
        return sorted(steps)

    def list_project_steps(self) -> List[str]:
        """List available project-specific shared steps.

        Returns:
            List of project step names (without 'project:' prefix)
        """
        steps: List[str] = []
        if self.project_steps_dir.exists():
            for path in self.project_steps_dir.iterdir():
                if path.is_dir():
                    step_file = path / "step.yml"
                    if not step_file.exists():
                        step_file = path / "step.yaml"
                    if step_file.exists():
                        steps.append(path.name)
        return sorted(steps)
