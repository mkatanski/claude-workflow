"""Workflow runner that orchestrates step execution."""

import json
import shutil
import time
from pathlib import Path
from typing import TYPE_CHECKING, Any, Dict, List, Optional
from uuid import uuid4

from .conditions import ConditionError, ConditionEvaluator
from .config import Step, WorkflowConfig
from .context import ExecutionContext
from .display_adapter import get_display
from .shared_steps.executor import SharedStepExecutor
from .tmux import TmuxManager
from .tools import ToolRegistry

if TYPE_CHECKING:
    from .server import ServerManager


class StepError(Exception):
    """Raised when a step fails and on_error is 'stop'."""

    pass


class WorkflowRunner:
    """Orchestrates workflow execution with tool dispatch."""

    def __init__(
        self,
        config: WorkflowConfig,
        project_path: Path,
        server: "ServerManager",
        workflow_dir: Optional[Path] = None,
        persist_temp_on_error: bool = False,
    ) -> None:
        self.config = config
        self.project_path = project_path
        self.server = server
        self.persist_temp_on_error = persist_temp_on_error
        self._workflow_failed = False
        self.tmux_manager = TmuxManager(
            config.tmux,
            config.claude,
            project_path,
            server,
        )
        self.context = ExecutionContext(project_path=project_path)

        # Load workflow variables from config
        self.context.update(config.vars)

        # Workflow temp directory
        self.session_id = f"{int(time.time())}_{uuid4().hex[:8]}"
        self.temp_dir = project_path / ".claude" / "workflow_temp" / self.session_id
        self.temp_dir.mkdir(parents=True, exist_ok=True)
        self.context.set("_temp_dir", str(self.temp_dir))

        # Shared step executor
        self.shared_step_executor = SharedStepExecutor(
            project_path=project_path,
            workflow_dir=workflow_dir,
        )

        # Time tracking
        self.workflow_start_time: Optional[float] = None
        self.step_times: List[float] = []

        # Progress tracking
        self.completed_steps = 0

        # Display adapter
        self._display = get_display()

    def print_header(self) -> None:
        """Print workflow header with configuration summary."""
        self._display.print_header(
            self.config, self.project_path, self.server.port, hook_configured=True
        )

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
                    self._display.print_step_skipped(
                        step, self.context, step_num, total_steps, result.reason
                    )
                    return None  # Skip this step
            except ConditionError as e:
                self._display.console.print(
                    f"[yellow]Warning: Condition error: {e}. Skipping step.[/yellow]"
                )
                return None

        step_start_time = time.time()
        step_name = self.context.interpolate(step.name)

        # Print step start
        self._display.print_step_start(step, self.context, step_num, total_steps)

        # Check if this is a shared step (has 'uses' field)
        if step.uses:
            result = self._run_shared_step(step)
        else:
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
        # Always update the variable, even with empty output, to avoid stale values
        if step.output_var:
            self.context.set(step.output_var, result.output or "")

        # Print result
        self._display.print_step_result(
            result.success,
            step_duration,
            step.output_var,
            step_name=step_name,
            error=result.error,
        )

        if result.success:
            self.completed_steps += 1
        else:
            # Capture error context if configured
            pane_content = None
            if self.tmux_manager.current_pane:
                pane_content = self.tmux_manager.capture_pane_content()

            debug_dir = self._capture_error_context(
                step=step,
                error=result.error or "Step failed",
                pane_content=pane_content,
            )

            if debug_dir:
                self._display.console.print(
                    f"[dim]Debug info saved to: {debug_dir}[/dim]"
                )

            # Handle error based on on_error setting
            if step.on_error == "stop":
                error_msg = result.error or "Step failed"
                raise StepError(f"Step '{step.name}' failed: {error_msg}")
            # on_error == "continue": just proceed to next step

        # Return goto target if present
        return result.goto_step

    def _run_shared_step(self, step: Step) -> "ToolResult":
        """Execute a shared step using the SharedStepExecutor.

        Args:
            step: The step containing 'uses' field

        Returns:
            ToolResult from the shared step execution
        """
        from .tools.base import ToolResult

        if not step.uses:
            return ToolResult(
                success=False,
                error="Step has no 'uses' field",
            )

        # Prepare workflow config for the executor
        workflow_config = {
            "_workflow_claude_sdk": {
                "system_prompt": self.config.claude_sdk.system_prompt,
                "model": self.config.claude_sdk.model,
            },
        }

        return self.shared_step_executor.execute(
            uses=step.uses,
            with_inputs=step.with_inputs or {},
            output_mapping=step.outputs or {},
            parent_context=self.context,
            tmux_manager=self.tmux_manager,
            workflow_config=workflow_config,
        )

    def _step_to_dict(self, step: Step) -> Dict[str, Any]:
        """Convert Step dataclass to dict for tool execution.

        Handles recursive conversion for nested steps (foreach).
        """
        result: Dict[str, Any] = {
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
            "expr": step.expr,
            "strip_output": step.strip_output,
            "env": step.env,
            # Linear tool fields
            "action": step.action,
            "team": step.team,
            "project": step.project,
            "issue_id": step.issue_id,
            "title": step.title,
            "description": step.description,
            "priority": step.priority,
            "labels": step.labels,
            "status": step.status,
            "assignee": step.assignee,
            "body": step.body,
            "skip_blocked": step.skip_blocked,
            "filter": step.filter,
            "api_key": step.api_key,
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
            # foreach tool fields
            "source": step.source,
            "item_var": step.item_var,
            "index_var": step.index_var,
            "on_item_error": step.on_item_error,
            # foreach enhancements
            "foreach_filter": step.foreach_filter,
            "order_by": step.order_by,
            "break_when": step.break_when,
            # shared steps (uses) fields
            "uses": step.uses,
            "with": step.with_inputs,  # Keep as 'with' for internal use
            "outputs": step.outputs,
            # while tool fields
            "condition": step.condition,
            "max_iterations": step.max_iterations,
            "on_max_reached": step.on_max_reached,
            # retry tool fields
            "max_attempts": step.max_attempts,
            "until": step.until,
            "delay": step.delay,
            "on_failure": step.on_failure,
            # range tool fields - use original YAML names for tools
            "from": step.range_from,
            "to": step.range_to,
            "step": step.range_step,
            # context tool fields
            "mappings": step.mappings,
            "vars": step.vars,
            "file": step.file,
            # data tool fields
            "content": step.content,
            "format": step.format,
            "filename": step.filename,
            # json tool fields
            "query": step.query,
            "path": step.path,
            "operation": step.operation,
            "create_if_missing": step.create_if_missing,
            # checklist tool fields
            "checklist": step.checklist,
            # Workflow-level claude_sdk config for fallback
            "_workflow_claude_sdk": {
                "system_prompt": self.config.claude_sdk.system_prompt,
                "model": self.config.claude_sdk.model,
            },
        }

        # Recursively convert nested steps for foreach
        if step.steps:
            result["steps"] = [self._step_to_dict(s) for s in step.steps]

        return result

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
        self._display.print_workflow_start()

        self.workflow_start_time = time.time()

        try:
            self._run_steps()
        except StepError as e:
            self._workflow_failed = True
            self._display.console.print(f"\n[bold red]Error: {e}[/bold red]")
        except KeyboardInterrupt:
            self._workflow_failed = True
            self._display.print_workflow_interrupted()
        except Exception as e:
            self._workflow_failed = True
            self._display.console.print(f"\n[bold red]Unexpected error: {e}[/bold red]")
        finally:
            self._cleanup()
            self._print_summary()

    def _capture_error_context(
        self,
        step: Step,
        error: str,
        pane_content: Optional[str] = None,
    ) -> Optional[Path]:
        """Capture debugging context when a step fails.

        Saves context variables, step information, and optionally pane content
        to the debug directory for post-mortem analysis.

        Args:
            step: The step that failed
            error: The error message
            pane_content: Optional tmux pane content

        Returns:
            The path to the debug directory if capture was successful, None otherwise.
        """
        if not self.config.on_error.capture_context:
            return None

        # Create debug directory
        debug_dir = self.project_path / self.config.on_error.save_to / self.session_id
        try:
            debug_dir.mkdir(parents=True, exist_ok=True)
        except OSError:
            return None

        # Capture timestamp
        timestamp = time.strftime("%Y-%m-%d_%H-%M-%S")

        # Build debug data
        debug_data = {
            "timestamp": timestamp,
            "session_id": self.session_id,
            "step": {
                "name": step.name,
                "tool": step.tool,
                "prompt": step.prompt,
                "command": step.command,
            },
            "error": error,
            "variables": dict(self.context.variables),
        }

        # Write context JSON
        context_file = debug_dir / "context.json"
        try:
            with open(context_file, "w") as f:
                json.dump(debug_data, f, indent=2, default=str)
        except OSError:
            return None

        # Write pane content if available
        if pane_content:
            pane_file = debug_dir / "pane_content.txt"
            try:
                with open(pane_file, "w") as f:
                    f.write(pane_content)
            except OSError:
                pass  # Non-critical, context.json is the main artifact

        return debug_dir

    def _cleanup(self) -> None:
        """Clean up resources on exit."""
        if self.tmux_manager.current_pane:
            self._display.print_cleanup_message()
            self.tmux_manager.close_pane()

        # Clean up temp directory
        should_keep_temp = self.persist_temp_on_error and self._workflow_failed
        if self.temp_dir.exists() and not should_keep_temp:
            shutil.rmtree(self.temp_dir, ignore_errors=True)
        elif should_keep_temp:
            self._display.console.print(
                f"[dim]Temp directory preserved for debugging: {self.temp_dir}[/dim]"
            )

    def _print_summary(self) -> None:
        """Print workflow completion summary."""
        total_elapsed = time.time() - (self.workflow_start_time or time.time())
        self._display.print_summary(
            self.completed_steps,
            total_elapsed,
            self.step_times,
        )
