"""Workflow runner that orchestrates step execution."""

import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from .conditions import ConditionError, ConditionEvaluator
from .config import Step, WorkflowConfig
from .context import ExecutionContext
from .display import (
    console,
    create_config_table,
    create_header_panel,
    create_step_panel,
    print_cleanup_message,
    print_hook_setup_instructions,
    print_step_result,
    print_step_skipped,
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
    ) -> Optional[str]:
        """Execute a single workflow step.

        Returns:
            Target step name if goto was executed, None otherwise.
        """
        # Check condition first if present
        if step.when:
            try:
                evaluator = ConditionEvaluator(self.context)
                result = evaluator.evaluate(step.when)

                if not result.satisfied:
                    print_step_skipped(
                        step, self.context, step_num, total_steps, result.reason
                    )
                    return None  # Skip this step
            except ConditionError as e:
                console.print(f"[yellow]Warning: Condition error: {e}. Skipping step.[/yellow]")
                return None

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

        # Return goto target if present
        return result.goto_step

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
            "when": step.when,
            "target": step.target,
            "var": step.var,
            "value": step.value,
            "strip_output": step.strip_output,
            # claude_sdk tool fields
            "model": step.model,
            "system_prompt": step.system_prompt,
            "output_type": step.output_type,
            "values": step.values,
            "schema": step.schema,
            "max_retries": step.max_retries,
            "max_turns": step.max_turns,
            "timeout": step.timeout,
            "verbose": step.verbose,
            # Workflow-level claude_sdk config for fallback
            "_workflow_claude_sdk": {
                "system_prompt": self.config.claude_sdk.system_prompt,
                "model": self.config.claude_sdk.model,
            },
        }

    def _run_steps(self) -> None:
        """Run all steps with goto support."""
        step_index_map = {step.name: idx for idx, step in enumerate(self.config.steps)}

        step_idx = 0
        total_steps = len(self.config.steps)

        while step_idx < total_steps:
            step = self.config.steps[step_idx]
            goto_target = self.run_step(step, step_idx + 1, total_steps)

            if goto_target:
                # Handle goto: find target step index
                if goto_target not in step_index_map:
                    available_steps = list(step_index_map.keys())
                    raise StepError(
                        f"Goto target step '{goto_target}' not found. "
                        f"Available steps: {available_steps}"
                    )
                step_idx = step_index_map[goto_target]
            else:
                # Normal sequential execution
                step_idx += 1

            time.sleep(0.5)

    def run(self) -> None:
        """Run the complete workflow."""
        self.print_header()

        if not self.tmux_manager.hook_configured:
            print_hook_setup_instructions(self.project_path)

        print_workflow_start()

        self.workflow_start_time = time.time()

        try:
            self._run_steps()
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
            self.step_times,
        )
