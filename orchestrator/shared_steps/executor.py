"""Executor for shared steps."""

from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING, Any, Dict, List, Optional, Tuple

from orchestrator.context import ExecutionContext
from orchestrator.shared_steps.errors import SharedStepExecutionError
from orchestrator.shared_steps.resolver import SharedStepResolver
from orchestrator.shared_steps.types import (
    SharedStepConfig,
    SharedStepExecutionState,
)
from orchestrator.shared_steps.validator import validate_inputs

if TYPE_CHECKING:
    from orchestrator.tools.base import ToolResult
    from orchestrator.tmux import TmuxManager


class SharedStepExecutor:
    """Executes shared steps with scoped context and output mapping.

    The executor:
    1. Resolves the shared step definition
    2. Validates and prepares inputs
    3. Creates an isolated execution context
    4. Executes internal steps sequentially
    5. Maps outputs back to the parent context
    """

    def __init__(
        self,
        project_path: Path,
        workflow_dir: Optional[Path] = None,
    ):
        """Initialize the executor.

        Args:
            project_path: Root path of the user's project
            workflow_dir: Directory containing the current workflow file
        """
        self.project_path = project_path
        self.resolver = SharedStepResolver(project_path, workflow_dir)
        self.execution_state = SharedStepExecutionState()

    def execute(
        self,
        uses: str,
        with_inputs: Dict[str, Any],
        output_mapping: Dict[str, str],
        parent_context: ExecutionContext,
        tmux_manager: "TmuxManager",
        workflow_config: Optional[Dict[str, Any]] = None,
    ) -> "ToolResult":
        """Execute a shared step.

        Args:
            uses: The shared step reference (e.g., "builtin:git-checkout")
            with_inputs: Input values from the workflow
            output_mapping: Mapping of output names to parent context variables
            parent_context: The parent workflow's execution context
            tmux_manager: Tmux manager for pane operations
            workflow_config: Optional workflow-level configuration

        Returns:
            ToolResult with success status and summary output
        """
        from orchestrator.tools.base import ToolResult

        # Resolve the shared step definition
        config = self.resolver.resolve(uses)

        # Validate and prepare inputs (with interpolation from parent context)
        interpolated_inputs = self._interpolate_inputs(with_inputs, parent_context)
        validated_inputs = validate_inputs(config, interpolated_inputs)

        # Push onto execution stack (circular dependency check)
        self.execution_state.push(config.identifier)

        try:
            # Create scoped context with only inputs
            scoped_context = self._create_scoped_context(
                validated_inputs, parent_context.project_path
            )

            # Execute internal steps
            success, output, error, step_info = self._execute_internal_steps(
                config, scoped_context, tmux_manager, workflow_config
            )

            # Map outputs to parent context
            if success:
                self._map_outputs(config, output_mapping, scoped_context, parent_context)

            # Build result output
            result_output = self._build_result_output(
                config, success, step_info, scoped_context, output_mapping
            )

            return ToolResult(
                success=success,
                output=result_output,
                error=error,
            )

        finally:
            # Pop from execution stack
            self.execution_state.pop()

    def _interpolate_inputs(
        self,
        with_inputs: Dict[str, Any],
        context: ExecutionContext,
    ) -> Dict[str, Any]:
        """Interpolate input values using parent context.

        Args:
            with_inputs: Raw input values from workflow
            context: Parent context for variable interpolation

        Returns:
            Inputs with string values interpolated
        """
        result: Dict[str, Any] = {}
        for key, value in with_inputs.items():
            if isinstance(value, str):
                result[key] = context.interpolate(value)
            else:
                result[key] = value
        return result

    def _create_scoped_context(
        self,
        inputs: Dict[str, Any],
        project_path: Path,
    ) -> ExecutionContext:
        """Create an isolated execution context with only inputs.

        The scoped context provides:
        - inputs.* namespace for accessing input values
        - Fresh variable space for internal step outputs

        Args:
            inputs: Validated input values
            project_path: Project path for the context

        Returns:
            New ExecutionContext with inputs accessible via inputs.* namespace
        """
        scoped = ExecutionContext(project_path=project_path)

        # Store inputs as a nested object for {inputs.name} access
        scoped.set("inputs", inputs)

        # Also set each input as a direct variable for convenience
        for name, value in inputs.items():
            scoped.set(f"inputs.{name}", value)

        return scoped

    def _execute_internal_steps(
        self,
        config: SharedStepConfig,
        context: ExecutionContext,
        tmux_manager: "TmuxManager",
        workflow_config: Optional[Dict[str, Any]],
    ) -> Tuple[bool, Optional[str], Optional[str], Dict[str, Any]]:
        """Execute internal steps of a shared step.

        Args:
            config: The shared step configuration
            context: Scoped execution context
            tmux_manager: Tmux manager for pane operations
            workflow_config: Optional workflow-level configuration

        Returns:
            Tuple of (success, output, error, step_info)
        """
        from orchestrator.tools import ToolRegistry

        total_steps = len(config.steps)
        completed_steps = 0
        last_output: Optional[str] = None

        for idx, step_dict in enumerate(config.steps):
            # Defensive check: ensure step is a dict before accessing
            if not isinstance(step_dict, dict):
                return (
                    False,
                    None,
                    f"Step at index {idx} is invalid (expected dict, got {type(step_dict).__name__})",
                    {
                        "failed_step": f"Step {idx + 1}",
                        "failed_step_index": idx,
                        "total_steps": total_steps,
                        "completed_steps": completed_steps,
                    },
                )

            step_name = step_dict.get("name", f"Step {idx + 1}")
            tool_name = step_dict.get("tool", "claude")

            # Check 'when' condition
            when_condition = step_dict.get("when")
            if when_condition:
                from orchestrator.conditions import ConditionEvaluator, ConditionError

                try:
                    evaluator = ConditionEvaluator(context)
                    result = evaluator.evaluate(when_condition)
                    if not result.satisfied:
                        continue  # Skip this step
                except ConditionError:
                    continue  # Skip on condition error

            # Check if this is a nested shared step
            uses = step_dict.get("uses")
            if uses:
                # Recursively execute nested shared step
                nested_result = self.execute(
                    uses=uses,
                    with_inputs=step_dict.get("with", {}),
                    output_mapping=step_dict.get("outputs", {}),
                    parent_context=context,
                    tmux_manager=tmux_manager,
                    workflow_config=workflow_config,
                )

                if not nested_result.success:
                    return (
                        False,
                        None,
                        f"Nested step '{step_name}' failed: {nested_result.error}",
                        {
                            "failed_step": step_name,
                            "failed_step_index": idx,
                            "total_steps": total_steps,
                            "completed_steps": completed_steps,
                        },
                    )

                if nested_result.output:
                    last_output = nested_result.output
                    if step_dict.get("output_var"):
                        context.set(step_dict["output_var"], nested_result.output)

                completed_steps += 1
                continue

            # Execute regular tool
            try:
                tool = ToolRegistry.get(tool_name)
            except KeyError:
                return (
                    False,
                    None,
                    f"Unknown tool '{tool_name}' in step '{step_name}'",
                    {
                        "failed_step": step_name,
                        "failed_step_index": idx,
                        "total_steps": total_steps,
                        "completed_steps": completed_steps,
                    },
                )

            # Interpolate step values
            interpolated_step = self._interpolate_step_dict(step_dict, context)

            # Add workflow config if available
            if workflow_config:
                interpolated_step["_workflow_claude_sdk"] = workflow_config.get(
                    "_workflow_claude_sdk", {}
                )

            try:
                tool.validate_step(interpolated_step)
                result = tool.execute(interpolated_step, context, tmux_manager)
            except Exception as e:
                return (
                    False,
                    None,
                    str(e),
                    {
                        "failed_step": step_name,
                        "failed_step_index": idx,
                        "total_steps": total_steps,
                        "completed_steps": completed_steps,
                    },
                )

            if not result.success:
                error_msg = result.error or "Step failed"
                on_error = step_dict.get("on_error", "stop")

                if on_error == "stop":
                    return (
                        False,
                        None,
                        error_msg,
                        {
                            "failed_step": step_name,
                            "failed_step_index": idx,
                            "total_steps": total_steps,
                            "completed_steps": completed_steps,
                        },
                    )
                # on_error == "continue": proceed to next step

            # Store output variable
            output_var = step_dict.get("output_var")
            if output_var and result.output:
                context.set(output_var, result.output)
                last_output = result.output

            completed_steps += 1

        return (
            True,
            last_output,
            None,
            {
                "total_steps": total_steps,
                "completed_steps": completed_steps,
            },
        )

    def _interpolate_step_dict(
        self,
        step_dict: Dict[str, Any],
        context: ExecutionContext,
    ) -> Dict[str, Any]:
        """Interpolate all string values in a step dictionary.

        Args:
            step_dict: Raw step dictionary
            context: Context for interpolation

        Returns:
            Step dictionary with interpolated values
        """
        result: Dict[str, Any] = {}

        for key, value in step_dict.items():
            if isinstance(value, str):
                result[key] = context.interpolate(value)
            elif isinstance(value, dict):
                result[key] = self._interpolate_step_dict(value, context)
            elif isinstance(value, list):
                result[key] = [
                    context.interpolate(item) if isinstance(item, str) else item
                    for item in value
                ]
            else:
                result[key] = value

        return result

    def _map_outputs(
        self,
        config: SharedStepConfig,
        output_mapping: Dict[str, str],
        scoped_context: ExecutionContext,
        parent_context: ExecutionContext,
    ) -> None:
        """Map outputs from scoped context to parent context.

        Args:
            config: Shared step configuration
            output_mapping: Mapping from parent var names to output names
            scoped_context: The shared step's execution context
            parent_context: The parent workflow's context
        """
        # First, map outputs defined in the shared step config
        for output_def in config.outputs:
            internal_value = scoped_context.get(output_def.from_var)
            if internal_value is not None:
                # Check if this output is mapped to a different name
                parent_var = output_mapping.get(output_def.name, output_def.name)
                parent_context.set(parent_var, internal_value)

        # Then, handle any direct mappings from output_mapping that reference
        # internal variables not defined as outputs
        for parent_var, internal_var in output_mapping.items():
            if not any(o.name == internal_var for o in config.outputs):
                # This maps directly to an internal variable
                internal_value = scoped_context.get(internal_var)
                if internal_value is not None:
                    parent_context.set(parent_var, internal_value)

    def _build_result_output(
        self,
        config: SharedStepConfig,
        success: bool,
        step_info: Dict[str, Any],
        scoped_context: ExecutionContext,
        output_mapping: Dict[str, str],
    ) -> str:
        """Build a summary output string for the result.

        Args:
            config: Shared step configuration
            success: Whether execution succeeded
            step_info: Information about step execution
            scoped_context: The shared step's execution context
            output_mapping: Output variable mapping

        Returns:
            JSON string with execution summary
        """
        summary: Dict[str, Any] = {
            "step_id": config.identifier,
            "success": success,
            "steps_completed": step_info.get("completed_steps", 0),
            "steps_total": step_info.get("total_steps", 0),
        }

        if not success:
            summary["failed_step"] = step_info.get("failed_step")
            summary["failed_step_index"] = step_info.get("failed_step_index")

        # Include output values
        outputs: Dict[str, Any] = {}
        for output_def in config.outputs:
            value = scoped_context.get(output_def.from_var)
            if value is not None:
                outputs[output_def.name] = value

        if outputs:
            summary["outputs"] = outputs

        return json.dumps(summary)

    def reset_state(self) -> None:
        """Reset the execution state (useful for testing)."""
        self.execution_state = SharedStepExecutionState()
        self.resolver.clear_cache()


# Global executor instance factory
_executors: Dict[str, SharedStepExecutor] = {}


def get_executor(
    project_path: Path,
    workflow_dir: Optional[Path] = None,
) -> SharedStepExecutor:
    """Get or create a SharedStepExecutor for the given project.

    Args:
        project_path: Root path of the user's project
        workflow_dir: Directory containing the current workflow file

    Returns:
        SharedStepExecutor instance
    """
    key = str(project_path)
    if key not in _executors:
        _executors[key] = SharedStepExecutor(project_path, workflow_dir)
    return _executors[key]
