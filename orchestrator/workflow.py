"""Workflow runner that orchestrates step execution."""

import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from .config import Step, WorkflowConfig
from .context import ExecutionContext
from .display import (
    console,
    create_config_table,
    create_header_panel,
    create_iteration_header,
    create_step_panel,
    print_cleanup_message,
    print_hook_setup_instructions,
    print_phase_complete,
    print_step_result,
    print_summary,
    print_workflow_interrupted,
    print_workflow_start,
)
from .tmux import TmuxManager
from .tools import ToolRegistry


class StepError(Exception):
    """Raised when a step fails and on_error is 'stop'."""

    pass


class WorkflowRunner:
    """Orchestrates workflow execution with tool dispatch."""

    def __init__(self, config: WorkflowConfig, project_path: Path) -> None:
        self.config = config
        self.project_path = project_path
        self.tmux_manager = TmuxManager(
            config.tmux,
            config.claude,
            project_path,
        )
        self.context = ExecutionContext(project_path=project_path)

        # Time tracking
        self.workflow_start_time: Optional[float] = None
        self.step_times: List[float] = []
        self.phase_times: List[float] = []

        # Progress tracking
        self.completed_steps = 0

    def print_header(self) -> None:
        """Print workflow header with configuration summary."""
        console.print()
        console.print(create_header_panel(self.config.name))
        console.print()
        console.print(
            create_config_table(
                self.config, self.project_path, self.tmux_manager.hook_configured
            )
        )
        console.print()

    def run_step(
        self, step: Step, step_num: int, total_steps: int
    ) -> None:
        """Execute a single workflow step."""
        step_start_time = time.time()

        console.print()
        console.print(create_step_panel(step, self.context, step_num, total_steps))

        # Get the tool for this step
        tool = ToolRegistry.get(step.tool)

        # Validate step configuration
        step_dict = self._step_to_dict(step)
        tool.validate_step(step_dict)

        # Execute the tool
        result = tool.execute(step_dict, self.context, self.tmux_manager)

        step_duration = time.time() - step_start_time
        self.step_times.append(step_duration)

        # Store output in variable if requested
        if step.output_var and result.output:
            self.context.set(step.output_var, result.output)

        # Print result
        print_step_result(result.success, step_duration, step.output_var)

        if result.success:
            self.completed_steps += 1
        else:
            # Handle error based on on_error setting
            if step.on_error == "stop":
                error_msg = result.error or "Step failed"
                raise StepError(f"Step '{step.name}' failed: {error_msg}")
            # on_error == "continue": just proceed to next step

    def _step_to_dict(self, step: Step) -> Dict[str, Any]:
        """Convert Step dataclass to dict for tool execution."""
        return {
            "name": step.name,
            "tool": step.tool,
            "prompt": step.prompt,
            "command": step.command,
            "output_var": step.output_var,
            "on_error": step.on_error,
            "visible": step.visible,
            "cwd": step.cwd,
        }

    def run_iteration(
        self, iter_key: str, iter_value: Any, iter_num: int, total_iters: int
    ) -> None:
        """Run all steps for a single iteration (phase)."""
        phase_start_time = time.time()

        # Set iteration variable in context
        self.context.set(iter_key, iter_value)

        console.print()
        console.print(create_iteration_header(iter_key, iter_value, iter_num, total_iters))

        for step_num, step in enumerate(self.config.steps, 1):
            self.run_step(step, step_num, len(self.config.steps))
            time.sleep(0.5)

        phase_duration = time.time() - phase_start_time
        self.phase_times.append(phase_duration)

        print_phase_complete(iter_num, total_iters, phase_duration)

    def _get_iteration_config(self) -> tuple[str, List[Any]]:
        """Get the iteration key and values from config, with defaults."""
        if self.config.variables:
            iter_key = list(self.config.variables.keys())[0]
            return iter_key, self.config.variables[iter_key]
        return "step", [1]

    def run(self) -> None:
        """Run the complete workflow."""
        self.print_header()

        if not self.tmux_manager.hook_configured:
            print_hook_setup_instructions(self.project_path)

        iter_key, iter_values = self._get_iteration_config()

        print_workflow_start()

        self.workflow_start_time = time.time()

        try:
            for iter_num, iter_value in enumerate(iter_values, 1):
                self.run_iteration(iter_key, iter_value, iter_num, len(iter_values))
        except StepError as e:
            console.print(f"\n[bold red]Error: {e}[/bold red]")
        except KeyboardInterrupt:
            print_workflow_interrupted()
        finally:
            self._cleanup()
            self._print_summary()

    def _cleanup(self) -> None:
        """Clean up resources on exit."""
        if self.tmux_manager.current_pane:
            print_cleanup_message()
            self.tmux_manager.close_pane()

        self.tmux_manager.cleanup_all()

    def _print_summary(self) -> None:
        """Print workflow completion summary."""
        total_elapsed = time.time() - (self.workflow_start_time or time.time())
        print_summary(
            self.completed_steps,
            total_elapsed,
            self.phase_times,
            self.step_times,
        )
