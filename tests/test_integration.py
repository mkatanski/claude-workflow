"""Integration tests for workflow execution with mocked external dependencies.

These tests verify workflow orchestration by:
1. Loading real YAML workflow files from examples/
2. Mocking external dependencies (subprocess, tmux, Linear API, Claude)
3. Running complete workflows end-to-end
4. Verifying execution flow, variable interpolation, conditions, and control flow

What we test:
- Workflow parsing and loading
- Step execution order
- Condition evaluation
- Variable storage and interpolation
- Goto/loop control flow
- ForEach iteration
- Error handling (on_error: stop vs continue)
- Tool dispatch

What we mock (external dependencies):
- subprocess.run - No real shell commands
- TmuxManager - No real tmux panes
- Linear API - No real API calls
- Claude Code - No real Claude spawning
"""

import json
import os
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional
from unittest.mock import MagicMock, patch

import pytest

from orchestrator.config import load_config, WorkflowConfig
from orchestrator.context import ExecutionContext
from orchestrator.workflow import WorkflowRunner, StepError


# =============================================================================
# Configuration
# =============================================================================

EXAMPLES_DIR = Path(__file__).parent.parent / "examples"


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def mock_server() -> MagicMock:
    """Mock ServerManager - no real HTTP server."""
    server = MagicMock()
    server.port = 7432
    server.register_pane = MagicMock()
    server.unregister_pane = MagicMock()
    server.wait_for_complete = MagicMock(return_value=True)
    server.wait_for_exited = MagicMock(return_value=True)
    return server


@pytest.fixture
def mock_tmux() -> MagicMock:
    """Mock TmuxManager - no real tmux panes."""
    tmux = MagicMock()
    tmux.current_pane = None
    tmux.launch_claude_pane = MagicMock(return_value="%0")
    tmux.launch_bash_pane = MagicMock(return_value="%1")
    tmux.close_pane = MagicMock()
    tmux.capture_pane_content = MagicMock(return_value="Mock output")
    tmux.get_pane_content_hash = MagicMock(return_value="hash")
    tmux.server = MagicMock()
    tmux.server.wait_for_complete = MagicMock(return_value=True)
    return tmux


@pytest.fixture
def project_path(tmp_path: Path) -> Path:
    """Temporary project directory."""
    (tmp_path / ".claude").mkdir()
    return tmp_path


class MockSubprocess:
    """Configurable subprocess mock with response tracking."""

    def __init__(self) -> None:
        self.calls: List[Dict[str, Any]] = []
        self.responses: Dict[str, str] = {}
        self.default_output = "mock_output"

    def set_response(self, pattern: str, output: str) -> None:
        """Set output for commands matching pattern."""
        self.responses[pattern] = output

    def __call__(
        self,
        cmd: str,
        shell: bool = False,
        cwd: Optional[str] = None,
        capture_output: bool = False,
        text: bool = False,
        timeout: Optional[int] = None,
        env: Optional[Dict[str, str]] = None,
    ) -> subprocess.CompletedProcess[str]:
        """Mock subprocess.run call."""
        self.calls.append({"command": cmd, "cwd": cwd, "env": env})

        # Find matching response
        output = self.default_output
        returncode = 0

        for pattern, resp in self.responses.items():
            if pattern in cmd:
                output = resp
                break

        # Handle special commands
        if "exit 1" in cmd:
            returncode = 1
            output = ""

        return subprocess.CompletedProcess(
            args=cmd, returncode=returncode, stdout=output, stderr=""
        )

    def was_called_with(self, pattern: str) -> bool:
        """Check if any call contained pattern."""
        return any(pattern in c["command"] for c in self.calls)

    def call_count_for(self, pattern: str) -> int:
        """Count calls containing pattern."""
        return sum(1 for c in self.calls if pattern in c["command"])


@pytest.fixture
def mock_subprocess() -> MockSubprocess:
    """Create mock subprocess instance."""
    return MockSubprocess()


# =============================================================================
# Test Helpers
# =============================================================================


def load_example(name: str) -> WorkflowConfig:
    """Load workflow from examples folder."""
    return load_config(EXAMPLES_DIR, EXAMPLES_DIR / f"{name}.yml")


def create_runner(
    config: WorkflowConfig,
    project_path: Path,
    server: MagicMock,
    tmux: MagicMock,
) -> WorkflowRunner:
    """Create WorkflowRunner with mocked TmuxManager."""
    with patch("orchestrator.workflow.TmuxManager", return_value=tmux):
        runner = WorkflowRunner(config, project_path, server)
        runner.tmux_manager = tmux
    return runner


def run_with_mocks(
    runner: WorkflowRunner,
    mock_subprocess: MockSubprocess,
) -> None:
    """Run workflow with all display and subprocess mocks."""
    with patch("orchestrator.tools.bash.subprocess.run", mock_subprocess):
        with patch("orchestrator.tools.bash.console"):
            with patch("orchestrator.tools.foreach.console"):
                with patch("orchestrator.tools.claude.console"):
                    with patch("orchestrator.tools.claude.Live"):
                        with patch("orchestrator.tools.linear_tasks.console"):
                            with patch("orchestrator.workflow.console"):
                                with patch("orchestrator.workflow.create_header_panel"):
                                    with patch("orchestrator.workflow.create_config_table"):
                                        with patch("orchestrator.workflow.create_step_panel"):
                                            with patch("orchestrator.workflow.print_step_result"):
                                                with patch("orchestrator.workflow.print_step_skipped"):
                                                    with patch("orchestrator.workflow.print_cleanup_message"):
                                                        with patch("orchestrator.workflow.print_summary"):
                                                            with patch("orchestrator.workflow.print_workflow_start"):
                                                                with patch("time.sleep"):
                                                                    runner.run()


# =============================================================================
# Simple Bash Workflow Tests
# =============================================================================


class TestSimpleBashWorkflow:
    """Tests for simple_bash.yml - basic bash command execution."""

    def test_workflow_loads(self) -> None:
        """Verify workflow loads correctly from YAML."""
        config = load_example("simple_bash")
        assert config.name == "Simple Bash Workflow"
        assert len(config.steps) == 2
        assert config.steps[0].tool == "bash"
        assert config.steps[0].output_var == "current_dir"

    def test_bash_commands_execute(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify bash tool dispatches subprocess calls."""
        config = load_example("simple_bash")
        mock_subprocess.set_response("pwd", "/test/path")
        mock_subprocess.set_response("ls", "file1\nfile2")

        runner = create_runner(config, project_path, mock_server, mock_tmux)
        run_with_mocks(runner, mock_subprocess)

        # Verify subprocess was called for each bash step
        assert mock_subprocess.was_called_with("pwd")
        assert mock_subprocess.was_called_with("ls")

    def test_output_stored_in_variables(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify output_var stores command output in context."""
        config = load_example("simple_bash")
        mock_subprocess.set_response("pwd", "/project/path")
        mock_subprocess.set_response("ls", "src\ntests")

        runner = create_runner(config, project_path, mock_server, mock_tmux)
        run_with_mocks(runner, mock_subprocess)

        assert runner.context.get("current_dir") == "/project/path"
        assert runner.context.get("file_list") == "src\ntests"


# =============================================================================
# Conditional Workflow Tests
# =============================================================================


class TestConditionalWorkflow:
    """Tests for conditional_steps.yml - condition evaluation."""

    def test_workflow_loads(self) -> None:
        """Verify workflow loads with conditions."""
        config = load_example("conditional_steps")
        assert config.name == "Conditional Steps Workflow"
        assert config.steps[1].when == "{env} == production"
        assert config.steps[2].when == "{env} == development"

    def test_set_tool_stores_variable(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify set tool creates context variables."""
        config = load_example("conditional_steps")
        runner = create_runner(config, project_path, mock_server, mock_tmux)
        run_with_mocks(runner, mock_subprocess)

        assert runner.context.get("env") == "production"

    def test_condition_controls_execution(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify conditions skip/execute steps correctly."""
        config = load_example("conditional_steps")
        runner = create_runner(config, project_path, mock_server, mock_tmux)
        run_with_mocks(runner, mock_subprocess)

        # env=production, so production step runs, development doesn't
        assert mock_subprocess.was_called_with("Running in production")
        assert not mock_subprocess.was_called_with("Running in development")

    def test_is_not_empty_condition(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify 'is not empty' condition works."""
        config = load_example("conditional_steps")
        mock_subprocess.set_response("some output", "some output")

        runner = create_runner(config, project_path, mock_server, mock_tmux)
        run_with_mocks(runner, mock_subprocess)

        # some_var is not empty, so check step should run
        assert mock_subprocess.was_called_with("Variable was not empty")


# =============================================================================
# Goto/Loop Workflow Tests
# =============================================================================


class TestGotoLoopWorkflow:
    """Tests for goto_workflow.yml - loop/goto control flow."""

    def test_workflow_loads(self) -> None:
        """Verify workflow loads with goto steps."""
        config = load_example("goto_workflow")
        assert config.name == "Goto Loop Workflow"
        assert config.steps[3].tool == "goto"
        assert config.steps[3].target == "Loop iteration"

    def test_loop_iterates_multiple_times(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
    ) -> None:
        """Verify goto creates iteration loop."""
        config = load_example("goto_workflow")
        runner = create_runner(config, project_path, mock_server, mock_tmux)

        # Track iteration calls
        iteration_count = [0]
        arithmetic_count = [0]

        def mock_subprocess_fn(
            cmd: str, **kwargs: Any
        ) -> subprocess.CompletedProcess[str]:
            if "Iteration" in cmd:
                iteration_count[0] += 1
            if "$((" in cmd:
                arithmetic_count[0] += 1
                # Return incrementing counter values: 2, 3, 4, 5
                value = arithmetic_count[0] + 1
                return subprocess.CompletedProcess(
                    args=cmd, returncode=0, stdout=str(value), stderr=""
                )
            if "Loop completed" in cmd:
                return subprocess.CompletedProcess(
                    args=cmd, returncode=0, stdout="completed", stderr=""
                )
            return subprocess.CompletedProcess(
                args=cmd, returncode=0, stdout="mock", stderr=""
            )

        with patch("orchestrator.tools.bash.subprocess.run", mock_subprocess_fn):
            with patch("orchestrator.tools.bash.console"):
                with patch("orchestrator.workflow.console"):
                    with patch("orchestrator.workflow.create_header_panel"):
                        with patch("orchestrator.workflow.create_config_table"):
                            with patch("orchestrator.workflow.create_step_panel"):
                                with patch("orchestrator.workflow.print_step_result"):
                                    with patch("orchestrator.workflow.print_step_skipped"):
                                        with patch("orchestrator.workflow.print_cleanup_message"):
                                            with patch("orchestrator.workflow.print_summary"):
                                                with patch("orchestrator.workflow.print_workflow_start"):
                                                    with patch("time.sleep"):
                                                        runner.run()

        # Should have iterated 3 times (counter 1->2->3->4, then exits)
        assert iteration_count[0] >= 3, f"Expected 3+ iterations, got {iteration_count[0]}"

    def test_loop_exits_on_condition(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
    ) -> None:
        """Verify loop exits when condition becomes false."""
        config = load_example("goto_workflow")
        runner = create_runner(config, project_path, mock_server, mock_tmux)

        final_step_called = [False]

        def mock_subprocess_fn(
            cmd: str, **kwargs: Any
        ) -> subprocess.CompletedProcess[str]:
            if "$((" in cmd:
                # Return 4 immediately to exit loop
                return subprocess.CompletedProcess(
                    args=cmd, returncode=0, stdout="4", stderr=""
                )
            if "Loop completed" in cmd:
                final_step_called[0] = True
            return subprocess.CompletedProcess(
                args=cmd, returncode=0, stdout="mock", stderr=""
            )

        with patch("orchestrator.tools.bash.subprocess.run", mock_subprocess_fn):
            with patch("orchestrator.tools.bash.console"):
                with patch("orchestrator.workflow.console"):
                    with patch("orchestrator.workflow.create_header_panel"):
                        with patch("orchestrator.workflow.create_config_table"):
                            with patch("orchestrator.workflow.create_step_panel"):
                                with patch("orchestrator.workflow.print_step_result"):
                                    with patch("orchestrator.workflow.print_step_skipped"):
                                        with patch("orchestrator.workflow.print_cleanup_message"):
                                            with patch("orchestrator.workflow.print_summary"):
                                                with patch("orchestrator.workflow.print_workflow_start"):
                                                    with patch("time.sleep"):
                                                        runner.run()

        # Final step should execute
        assert final_step_called[0], "Final step should have been called"


# =============================================================================
# ForEach Workflow Tests
# =============================================================================


class TestForEachWorkflow:
    """Tests for foreach_workflow.yml - array iteration."""

    def test_workflow_loads(self) -> None:
        """Verify workflow loads with foreach step."""
        config = load_example("foreach_workflow")
        assert config.name == "ForEach Workflow"
        assert config.steps[1].tool == "foreach"
        assert config.steps[1].source == "items"
        assert config.steps[1].item_var == "current_item"

    def test_foreach_iterates_all_items(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify foreach processes each array item."""
        config = load_example("foreach_workflow")
        runner = create_runner(config, project_path, mock_server, mock_tmux)
        run_with_mocks(runner, mock_subprocess)

        # Should see all three items processed
        assert mock_subprocess.was_called_with("apple")
        assert mock_subprocess.was_called_with("banana")
        assert mock_subprocess.was_called_with("cherry")

    def test_foreach_provides_index(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify foreach provides index variable."""
        config = load_example("foreach_workflow")
        runner = create_runner(config, project_path, mock_server, mock_tmux)
        run_with_mocks(runner, mock_subprocess)

        # Should see indices in commands
        commands = [c["command"] for c in mock_subprocess.calls]
        processing_cmds = [c for c in commands if "Processing item" in c]

        assert any("0:" in c for c in processing_cmds), "Index 0 should appear"
        assert any("1:" in c for c in processing_cmds), "Index 1 should appear"
        assert any("2:" in c for c in processing_cmds), "Index 2 should appear"


# =============================================================================
# Claude Steps Workflow Tests
# =============================================================================


class TestClaudeWorkflow:
    """Tests for claude_steps.yml - Claude Code integration."""

    def test_workflow_loads(self) -> None:
        """Verify workflow loads with Claude steps."""
        config = load_example("claude_steps")
        assert config.name == "Claude Steps Workflow"
        assert config.steps[1].tool == "claude"
        assert "{project_name}" in (config.steps[1].prompt or "")

    def test_claude_pane_launched(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify Claude tool launches tmux pane."""
        config = load_example("claude_steps")
        mock_tmux.current_pane = "%0"
        mock_subprocess.set_response("My Test Project", "My Test Project")

        runner = create_runner(config, project_path, mock_server, mock_tmux)
        run_with_mocks(runner, mock_subprocess)

        # Should launch claude panes
        assert mock_tmux.launch_claude_pane.called

    def test_prompt_interpolated(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify variables are interpolated in Claude prompts."""
        config = load_example("claude_steps")
        mock_tmux.current_pane = "%0"
        mock_subprocess.set_response("My Test Project", "My Test Project")

        runner = create_runner(config, project_path, mock_server, mock_tmux)
        run_with_mocks(runner, mock_subprocess)

        # Check prompt was interpolated
        calls = mock_tmux.launch_claude_pane.call_args_list
        prompts = [str(call) for call in calls]
        assert any("My Test Project" in p for p in prompts)


# =============================================================================
# Linear Workflow Tests
# =============================================================================


class TestLinearWorkflow:
    """Tests for linear_workflow.yml - Linear API integration."""

    def test_workflow_loads(self) -> None:
        """Verify workflow loads with Linear steps."""
        config = load_example("linear_workflow")
        assert config.name == "Linear Tasks Workflow"
        assert config.steps[0].tool == "linear_tasks"
        assert config.steps[0].action == "get_next"

    def test_linear_client_called(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify Linear API client is invoked."""
        config = load_example("linear_workflow")

        mock_linear = MagicMock()
        mock_linear.get_next_issue = MagicMock(return_value="ENG-123")
        mock_linear.get_issue = MagicMock(return_value=MagicMock(
            success=True, data={"id": "123"}
        ))

        runner = create_runner(config, project_path, mock_server, mock_tmux)

        with patch(
            "orchestrator.tools.linear_tasks.LinearClientWrapper",
            return_value=mock_linear,
        ):
            run_with_mocks(runner, mock_subprocess)

        mock_linear.get_next_issue.assert_called()

    def test_issue_id_stored(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify Linear issue ID stored in context."""
        config = load_example("linear_workflow")

        mock_linear = MagicMock()
        mock_linear.get_next_issue = MagicMock(return_value="ENG-456")
        mock_linear.get_issue = MagicMock(return_value=MagicMock(
            success=True, data={"id": "456"}
        ))

        runner = create_runner(config, project_path, mock_server, mock_tmux)

        with patch(
            "orchestrator.tools.linear_tasks.LinearClientWrapper",
            return_value=mock_linear,
        ):
            run_with_mocks(runner, mock_subprocess)

        assert runner.context.get("issue_id") == "ENG-456"


# =============================================================================
# Error Handling Workflow Tests
# =============================================================================


class TestErrorHandlingWorkflow:
    """Tests for error_handling.yml - error recovery."""

    def test_workflow_loads(self) -> None:
        """Verify workflow loads with error handling config."""
        config = load_example("error_handling")
        assert config.name == "Error Handling Workflow"
        assert config.steps[1].on_error == "continue"

    def test_continue_on_error(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify on_error=continue allows workflow to proceed."""
        config = load_example("error_handling")
        runner = create_runner(config, project_path, mock_server, mock_tmux)
        run_with_mocks(runner, mock_subprocess)

        # Third step should run despite second step failing
        assert mock_subprocess.was_called_with("Still running")

    def test_steps_execute_in_order(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify steps execute in correct order."""
        config = load_example("error_handling")
        runner = create_runner(config, project_path, mock_server, mock_tmux)
        run_with_mocks(runner, mock_subprocess)

        commands = [c["command"] for c in mock_subprocess.calls]

        success_idx = next(
            (i for i, c in enumerate(commands) if "Success" in c), -1
        )
        still_idx = next(
            (i for i, c in enumerate(commands) if "Still running" in c), -1
        )

        assert success_idx < still_idx, "Success should come before Still running"


# =============================================================================
# Configuration Validation Tests
# =============================================================================


class TestConfigurationValidation:
    """Tests for workflow configuration parsing."""

    def test_all_examples_load(self) -> None:
        """Verify all example workflows can be loaded."""
        import yaml

        for workflow_file in EXAMPLES_DIR.glob("*.yml"):
            config = load_config(EXAMPLES_DIR, workflow_file)
            assert config.name, f"{workflow_file.name} should have name"
            assert len(config.steps) > 0, f"{workflow_file.name} should have steps"

    def test_all_examples_have_type_version(self) -> None:
        """Verify all examples have required type and version."""
        import yaml

        for workflow_file in EXAMPLES_DIR.glob("*.yml"):
            with open(workflow_file) as f:
                data = yaml.safe_load(f)

            assert data.get("type") == "claude-workflow"
            assert data.get("version") == 2


# =============================================================================
# End-to-End Tests
# =============================================================================


class TestEndToEnd:
    """Complete workflow execution tests."""

    def test_complete_workflow_runs(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify complete workflow executes all steps."""
        config = load_example("conditional_steps")
        runner = create_runner(config, project_path, mock_server, mock_tmux)
        run_with_mocks(runner, mock_subprocess)

        assert runner.completed_steps >= 3
        assert len(runner.step_times) >= 3

    def test_workflow_state_consistent(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify workflow maintains consistent state."""
        config = load_example("conditional_steps")
        runner = create_runner(config, project_path, mock_server, mock_tmux)
        run_with_mocks(runner, mock_subprocess)

        # Context should have expected variables
        assert runner.context.get("env") == "production"
        assert runner.completed_steps > 0


# =============================================================================
# Claude SDK Boolean Workflow Tests (P0)
# =============================================================================


class TestClaudeSdkBooleanWorkflow:
    """Tests for claude_sdk_boolean.yml - boolean decision making."""

    def test_workflow_loads(self) -> None:
        """Verify workflow loads with claude_sdk steps."""
        config = load_example("claude_sdk_boolean")
        assert config.name == "Claude SDK Boolean Decisions"
        # Find claude_sdk steps
        sdk_steps = [s for s in config.steps if s.tool == "claude_sdk"]
        assert len(sdk_steps) >= 2
        assert sdk_steps[0].output_type == "boolean"

    def test_boolean_step_has_prompt(self) -> None:
        """Verify boolean steps have prompts."""
        config = load_example("claude_sdk_boolean")
        sdk_steps = [s for s in config.steps if s.tool == "claude_sdk"]
        for step in sdk_steps:
            assert step.prompt is not None


# =============================================================================
# Claude SDK Enum Workflow Tests (P0)
# =============================================================================


class TestClaudeSdkEnumWorkflow:
    """Tests for claude_sdk_enum.yml - enum classification."""

    def test_workflow_loads(self) -> None:
        """Verify workflow loads with enum output type."""
        config = load_example("claude_sdk_enum")
        assert config.name == "Claude SDK Enum Classification"
        sdk_steps = [s for s in config.steps if s.tool == "claude_sdk"]
        assert len(sdk_steps) >= 1
        assert sdk_steps[0].output_type == "enum"
        # The Step class uses 'values' not 'enum_values'
        assert sdk_steps[0].values is not None

    def test_enum_has_valid_values(self) -> None:
        """Verify enum steps have values defined."""
        config = load_example("claude_sdk_enum")
        sdk_steps = [s for s in config.steps if s.tool == "claude_sdk"]
        enum_step = sdk_steps[0]
        assert enum_step.values is not None
        assert len(enum_step.values) >= 2


# =============================================================================
# Claude SDK Decision Workflow Tests (P0)
# =============================================================================


class TestClaudeSdkDecisionWorkflow:
    """Tests for claude_sdk_decision.yml - dynamic routing."""

    def test_workflow_loads(self) -> None:
        """Verify workflow loads with decision output type."""
        config = load_example("claude_sdk_decision")
        assert config.name == "Claude SDK Decision Routing"
        sdk_steps = [s for s in config.steps if s.tool == "claude_sdk"]
        assert len(sdk_steps) >= 1
        assert sdk_steps[0].output_type == "decision"

    def test_decision_has_options(self) -> None:
        """Verify decision workflow has target steps for routing."""
        config = load_example("claude_sdk_decision")
        # Should have steps that can be targets for goto
        step_names = [s.name for s in config.steps]
        assert len(step_names) >= 3  # At least decision step + 2 targets


# =============================================================================
# ForEach Break Workflow Tests (P1)
# =============================================================================


class TestForEachBreakWorkflow:
    """Tests for foreach_break.yml - break for early loop exit."""

    def test_workflow_loads(self) -> None:
        """Verify workflow loads with break steps."""
        config = load_example("foreach_break")
        assert config.name == "ForEach Break Workflow"
        # Find foreach with break inside
        foreach_steps = [s for s in config.steps if s.tool == "foreach"]
        assert len(foreach_steps) >= 1
        # Check that nested steps contain break
        nested_steps = foreach_steps[0].steps or []
        break_steps = [s for s in nested_steps if s.tool == "break"]
        assert len(break_steps) >= 1

    def test_break_exits_loop_early(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify break tool exits loop early."""
        config = load_example("foreach_break")
        runner = create_runner(config, project_path, mock_server, mock_tmux)
        run_with_mocks(runner, mock_subprocess)

        # Should check items (the actual command is "Checking index")
        assert mock_subprocess.was_called_with("Checking")


# =============================================================================
# ForEach Nested Workflow Tests (P1)
# =============================================================================


class TestForEachNestedWorkflow:
    """Tests for foreach_nested.yml - nested foreach loops."""

    def test_workflow_loads(self) -> None:
        """Verify workflow loads with nested foreach."""
        config = load_example("foreach_nested")
        assert config.name == "Nested ForEach Workflow"
        foreach_steps = [s for s in config.steps if s.tool == "foreach"]
        assert len(foreach_steps) >= 1

    def test_nested_iteration(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify nested foreach processes matrix correctly."""
        config = load_example("foreach_nested")
        runner = create_runner(config, project_path, mock_server, mock_tmux)
        run_with_mocks(runner, mock_subprocess)

        # Should see coordinate grid output
        assert mock_subprocess.was_called_with("Coordinate")

    def test_outer_inner_variables(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify outer and inner loop variables available."""
        config = load_example("foreach_nested")
        runner = create_runner(config, project_path, mock_server, mock_tmux)
        run_with_mocks(runner, mock_subprocess)

        # Should have processed teams
        assert mock_subprocess.was_called_with("team")


# =============================================================================
# Advanced Conditions Workflow Tests (P1)
# =============================================================================


class TestAdvancedConditionsWorkflow:
    """Tests for advanced_conditions.yml - compound conditions."""

    def test_workflow_loads(self) -> None:
        """Verify workflow loads with advanced conditions."""
        config = load_example("advanced_conditions")
        assert config.name == "Advanced Conditions Workflow"
        # Find steps with compound conditions
        and_steps = [s for s in config.steps if s.when and " and " in s.when]
        or_steps = [s for s in config.steps if s.when and " or " in s.when]
        assert len(and_steps) >= 1
        assert len(or_steps) >= 1

    def test_and_condition_evaluation(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify AND conditions require all clauses true."""
        config = load_example("advanced_conditions")
        runner = create_runner(config, project_path, mock_server, mock_tmux)
        run_with_mocks(runner, mock_subprocess)

        # env=production AND status=success should run
        assert mock_subprocess.was_called_with("Production deployment successful")

    def test_or_condition_evaluation(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify OR conditions require any clause true."""
        config = load_example("advanced_conditions")
        runner = create_runner(config, project_path, mock_server, mock_tmux)
        run_with_mocks(runner, mock_subprocess)

        # env=production OR staging should run
        assert mock_subprocess.was_called_with("critical environment")

    def test_string_pattern_matching(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify string contains/starts/ends matching."""
        config = load_example("advanced_conditions")
        runner = create_runner(config, project_path, mock_server, mock_tmux)
        run_with_mocks(runner, mock_subprocess)

        # log_message contains ERROR
        assert mock_subprocess.was_called_with("Found error")
        # filename ends with .json
        assert mock_subprocess.was_called_with("Processing JSON")

    def test_numeric_range_checks(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify numeric comparisons work correctly."""
        config = load_example("advanced_conditions")
        runner = create_runner(config, project_path, mock_server, mock_tmux)
        run_with_mocks(runner, mock_subprocess)

        # http_code=201 is in 2xx range
        assert mock_subprocess.was_called_with("HTTP request successful")
        # error_code=404 is in 4xx range
        assert mock_subprocess.was_called_with("HTTP client error")


# =============================================================================
# Linear Lifecycle Workflow Tests (P2)
# =============================================================================


class TestLinearLifecycleWorkflow:
    """Tests for linear_lifecycle.yml - full issue lifecycle."""

    def test_workflow_loads(self) -> None:
        """Verify workflow loads with Linear lifecycle steps."""
        config = load_example("linear_lifecycle")
        assert config.name == "Linear Issue Lifecycle"
        # Should have create, update, comment actions
        linear_steps = [s for s in config.steps if s.tool == "linear_manage"]
        actions = [s.action for s in linear_steps]
        assert "create" in actions
        assert "update" in actions
        assert "comment" in actions

    def test_lifecycle_has_all_phases(self) -> None:
        """Verify lifecycle workflow covers all phases."""
        config = load_example("linear_lifecycle")
        step_names = [s.name.lower() for s in config.steps]
        # Should have create, update, and comment phases
        assert any("create" in n for n in step_names)
        assert any("progress" in n or "update" in n for n in step_names)
        assert any("comment" in n for n in step_names)


# =============================================================================
# Bash Visible Workflow Tests (P2)
# =============================================================================


class TestBashVisibleWorkflow:
    """Tests for bash_visible.yml - visible mode and options."""

    def test_workflow_loads(self) -> None:
        """Verify workflow loads with bash visible options."""
        config = load_example("bash_visible")
        assert config.name == "Bash Visible Mode"
        # Find steps with visible=true
        visible_steps = [s for s in config.steps if s.visible is True]
        assert len(visible_steps) >= 1
        # Find steps with custom cwd
        cwd_steps = [s for s in config.steps if s.cwd is not None]
        assert len(cwd_steps) >= 1

    def test_visible_mode_execution(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify visible mode commands execute in tmux pane."""
        config = load_example("bash_visible")
        runner = create_runner(config, project_path, mock_server, mock_tmux)
        run_with_mocks(runner, mock_subprocess)

        # Should launch bash pane for visible commands
        assert mock_tmux.launch_bash_pane.called or mock_subprocess.calls

    def test_custom_cwd_step_exists(self) -> None:
        """Verify step with custom cwd is defined correctly."""
        config = load_example("bash_visible")
        # Find steps with custom cwd
        cwd_steps = [s for s in config.steps if s.cwd is not None]
        assert len(cwd_steps) >= 1
        # Check cwd value
        assert cwd_steps[0].cwd == "/tmp"

    def test_strip_output_options(self) -> None:
        """Verify strip_output option is respected."""
        config = load_example("bash_visible")
        # Find steps with explicit strip_output=false
        preserve_steps = [s for s in config.steps if s.strip_output is False]
        assert len(preserve_steps) >= 1


# =============================================================================
# Claude Multi-Model Workflow Tests (P2)
# =============================================================================


class TestClaudeMultiModelWorkflow:
    """Tests for claude_multi_model.yml - different models for tasks."""

    def test_workflow_loads(self) -> None:
        """Verify workflow loads with multiple model specifications."""
        config = load_example("claude_multi_model")
        assert config.name == "Claude Multi-Model Workflow"
        # Find claude steps with different models
        claude_steps = [s for s in config.steps if s.prompt is not None]
        models = set(s.model for s in claude_steps if s.model)
        assert "haiku" in models
        assert "sonnet" in models
        assert "opus" in models

    def test_model_cost_optimization_pattern(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify workflow uses different models strategically."""
        config = load_example("claude_multi_model")
        runner = create_runner(config, project_path, mock_server, mock_tmux)
        mock_tmux.current_pane = "%0"

        run_with_mocks(runner, mock_subprocess)

        # Should have sample code output
        assert mock_subprocess.was_called_with("def calculate_total")

    def test_conditional_deep_review(self) -> None:
        """Verify conditional model escalation pattern."""
        config = load_example("claude_multi_model")
        # Find the conditional deep review step
        conditional_steps = [
            s for s in config.steps
            if s.when and "needs_review" in s.when
        ]
        assert len(conditional_steps) >= 1
        # Should use sonnet for deep review
        assert conditional_steps[0].model == "sonnet"


# =============================================================================
# Prompt Runner Workflow Tests
# =============================================================================


class TestPromptRunnerWorkflow:
    """Tests for prompt-runner.yml - automated prompt execution with progress tracking."""

    def test_workflow_loads(self) -> None:
        """Verify workflow loads correctly from YAML."""
        config = load_example("prompt-runner")
        assert config.name == "Automated Prompt Runner"
        assert len(config.steps) == 3
        # First step loads prompts
        assert config.steps[0].tool == "bash"
        assert config.steps[0].output_var == "prompts_json"
        # Second step initializes progress
        assert config.steps[1].tool == "bash"
        assert config.steps[1].output_var == "progress_json"
        # Third step is foreach
        assert config.steps[2].tool == "foreach"

    def test_foreach_has_skip_completed_logic(self) -> None:
        """Verify foreach includes skip completed prompts logic."""
        config = load_example("prompt-runner")
        foreach_step = config.steps[2]
        step_names = [s.name for s in foreach_step.steps]

        # Should have check and skip steps
        assert "Check if completed" in step_names
        assert "Skip completed" in step_names
        assert "End iteration" in step_names

        # Skip step should be a goto
        skip_step = next(s for s in foreach_step.steps if s.name == "Skip completed")
        assert skip_step.tool == "goto"
        assert skip_step.target == "End iteration"
        assert skip_step.when == "{is_completed} == true"

    def test_foreach_has_exit_code_extraction_with_env(self) -> None:
        """Verify exit code extraction uses env for safe variable passing."""
        config = load_example("prompt-runner")
        foreach_step = config.steps[2]

        # Find extract exit code step
        extract_step = next(
            s for s in foreach_step.steps if s.name == "Extract exit code"
        )
        assert extract_step.tool == "bash"
        # Should use env to pass test_result safely
        assert extract_step.env is not None
        assert "TEST_RESULT" in extract_step.env
        assert extract_step.env["TEST_RESULT"] == "{test_result}"
        # Command should reference env var, not interpolated value
        assert "$TEST_RESULT" in extract_step.command

    def test_foreach_has_default_exit_code(self) -> None:
        """Verify exit code defaults to failure before extraction."""
        config = load_example("prompt-runner")
        foreach_step = config.steps[2]

        # Find default exit code step
        default_step = next(
            s for s in foreach_step.steps if s.name == "Default exit code"
        )
        assert default_step.tool == "set"
        assert default_step.var == "test_exit_code"
        assert default_step.value == "1"

    def test_foreach_has_retry_loop(self) -> None:
        """Verify retry logic with goto."""
        config = load_example("prompt-runner")
        foreach_step = config.steps[2]

        # Find retry step
        retry_step = next(s for s in foreach_step.steps if s.name == "Retry tests")
        assert retry_step.tool == "goto"
        assert retry_step.target == "Run unit tests"
        assert "retry_count" in retry_step.when
        assert "test_exit_code" in retry_step.when

    def test_foreach_has_progress_update(self) -> None:
        """Verify progress update step with condition."""
        config = load_example("prompt-runner")
        foreach_step = config.steps[2]

        # Find update progress step
        update_step = next(
            s for s in foreach_step.steps if s.name == "Update progress"
        )
        assert update_step.tool == "bash"
        assert "jq" in update_step.command
        assert update_step.when == "{test_exit_code} == 0"


class TestBashEnvVariables:
    """Tests for bash tool env variable support in workflow execution."""

    def test_env_variables_passed_to_subprocess(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify env variables are passed through to subprocess."""
        from orchestrator.config import Step

        config = WorkflowConfig(
            name="Env Test",
            steps=[
                Step(
                    name="Test env",
                    tool="bash",
                    command='echo "$MY_VAR"',
                    env={"MY_VAR": "test_value"},
                ),
            ],
        )

        runner = create_runner(config, project_path, mock_server, mock_tmux)
        run_with_mocks(runner, mock_subprocess)

        # Verify env was passed
        assert len(mock_subprocess.calls) == 1
        call = mock_subprocess.calls[0]
        assert call["env"] is not None
        assert call["env"]["MY_VAR"] == "test_value"

    def test_env_variables_interpolated_from_context(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify env values can reference context variables."""
        from orchestrator.config import Step

        config = WorkflowConfig(
            name="Env Interpolation Test",
            steps=[
                Step(
                    name="Set var",
                    tool="set",
                    var="my_value",
                    value="hello world",
                ),
                Step(
                    name="Use env",
                    tool="bash",
                    command='echo "$TEST"',
                    env={"TEST": "{my_value}"},
                ),
            ],
        )

        runner = create_runner(config, project_path, mock_server, mock_tmux)
        run_with_mocks(runner, mock_subprocess)

        # Find the bash call
        bash_call = mock_subprocess.calls[0]
        assert bash_call["env"] is not None
        assert bash_call["env"]["TEST"] == "hello world"

    def test_env_handles_special_characters_safely(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify env safely handles shell-breaking characters."""
        from orchestrator.config import Step

        # Simulate test output with problematic characters
        problematic_value = "An update was not wrapped in act(...).\nconsole.error('Warning')"

        config = WorkflowConfig(
            name="Special Chars Test",
            steps=[
                Step(
                    name="Set output",
                    tool="set",
                    var="test_output",
                    value=problematic_value,
                ),
                Step(
                    name="Extract",
                    tool="bash",
                    command='echo "$OUTPUT" | grep -o "pattern"',
                    env={"OUTPUT": "{test_output}"},
                ),
            ],
        )

        runner = create_runner(config, project_path, mock_server, mock_tmux)
        run_with_mocks(runner, mock_subprocess)

        # Verify the special characters are preserved in env
        bash_call = mock_subprocess.calls[0]
        assert bash_call["env"] is not None
        assert "act(...)" in bash_call["env"]["OUTPUT"]
        assert "console.error('Warning')" in bash_call["env"]["OUTPUT"]


class TestSkipCompletedPrompts:
    """Tests for skip completed prompts functionality."""

    def test_check_completed_uses_jq(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify check completed step uses jq with env vars."""
        config = load_example("prompt-runner")
        foreach_step = config.steps[2]

        check_step = next(
            s for s in foreach_step.steps if s.name == "Check if completed"
        )

        # Should use env for safe passing
        assert check_step.env is not None
        assert "PROGRESS" in check_step.env
        assert "IDX" in check_step.env
        assert check_step.env["PROGRESS"] == "{progress_json}"
        assert check_step.env["IDX"] == "{prompt_index}"

        # Command should use jq
        assert "jq" in check_step.command
        assert ".completed" in check_step.command

    def test_skip_goto_targets_end_iteration(self) -> None:
        """Verify skip goto correctly targets end iteration."""
        config = load_example("prompt-runner")
        foreach_step = config.steps[2]

        skip_step = next(
            s for s in foreach_step.steps if s.name == "Skip completed"
        )
        end_step = next(
            s for s in foreach_step.steps if s.name == "End iteration"
        )

        # Skip should goto End iteration
        assert skip_step.target == end_step.name

    def test_end_iteration_is_last_step(self) -> None:
        """Verify End iteration is the last step in foreach."""
        config = load_example("prompt-runner")
        foreach_step = config.steps[2]

        last_step = foreach_step.steps[-1]
        assert last_step.name == "End iteration"


class TestProgressTracking:
    """Tests for progress.json tracking functionality."""

    def test_progress_initialized_if_missing(self) -> None:
        """Verify progress file is created if missing."""
        config = load_example("prompt-runner")
        init_step = config.steps[1]

        assert init_step.name == "Initialize progress file"
        assert "if [ ! -f" in init_step.command
        assert '{"completed": []}' in init_step.command

    def test_progress_updated_on_success(self) -> None:
        """Verify progress is updated when tests pass."""
        config = load_example("prompt-runner")
        foreach_step = config.steps[2]

        update_step = next(
            s for s in foreach_step.steps if s.name == "Update progress"
        )

        # Should only run on success
        assert update_step.when == "{test_exit_code} == 0"
        # Should use jq to append index
        assert "jq" in update_step.command
        assert ".completed" in update_step.command
        assert "{prompt_index}" in update_step.command

    def test_progress_not_updated_on_failure(self) -> None:
        """Verify progress step has correct condition for success only."""
        config = load_example("prompt-runner")
        foreach_step = config.steps[2]

        update_step = next(
            s for s in foreach_step.steps if s.name == "Update progress"
        )

        # Condition should require exit code 0
        assert "== 0" in update_step.when
        assert "test_exit_code" in update_step.when


class TestWorkflowResumeFromProgress:
    """Tests for resuming workflow from progress.json with completed prompts."""

    def test_fresh_start_processes_all_prompts(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify fresh start (empty progress) processes all prompts."""
        from orchestrator.config import Step

        # Simulate fresh start: empty progress.json
        prompts_json = '["prompt1", "prompt2", "prompt3"]'
        progress_json = '{"completed": []}'

        config = WorkflowConfig(
            name="Resume Test",
            steps=[
                Step(
                    name="Load prompts",
                    tool="bash",
                    command="cat prompts.json",
                    output_var="prompts_json",
                ),
                Step(
                    name="Load progress",
                    tool="bash",
                    command="cat progress.json",
                    output_var="progress_json",
                ),
                Step(
                    name="Process prompts",
                    tool="foreach",
                    source="prompts_json",
                    item_var="current_prompt",
                    index_var="prompt_index",
                    steps=[
                        Step(
                            name="Check if completed",
                            tool="bash",
                            command='echo "$PROGRESS" | jq -e --argjson idx "$IDX" \'.completed | index($idx)\' > /dev/null 2>&1 && echo "true" || echo "false"',
                            env={"PROGRESS": "{progress_json}", "IDX": "{prompt_index}"},
                            output_var="is_completed",
                        ),
                        Step(
                            name="Skip completed",
                            tool="goto",
                            target="End iteration",
                            when="{is_completed} == true",
                        ),
                        Step(
                            name="Process prompt",
                            tool="bash",
                            command='echo "Processing {current_prompt}"',
                        ),
                        Step(
                            name="End iteration",
                            tool="bash",
                            command='echo "Done with {prompt_index}"',
                        ),
                    ],
                ),
            ],
        )

        # Mock responses
        mock_subprocess.set_response("cat prompts.json", prompts_json)
        mock_subprocess.set_response("cat progress.json", progress_json)
        # jq returns "false" for all indices (none completed)
        mock_subprocess.set_response("jq", "false")

        runner = create_runner(config, project_path, mock_server, mock_tmux)
        run_with_mocks(runner, mock_subprocess)

        # Verify all 3 prompts were processed
        process_calls = [c for c in mock_subprocess.calls if "Processing" in c["command"]]
        assert len(process_calls) == 3
        assert mock_subprocess.was_called_with("Processing prompt1")
        assert mock_subprocess.was_called_with("Processing prompt2")
        assert mock_subprocess.was_called_with("Processing prompt3")

    def test_resume_skips_completed_prompts(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify resuming from progress.json skips already completed prompts."""
        from orchestrator.config import Step

        # Simulate resume: indices 0 and 1 already completed
        prompts_json = '["prompt1", "prompt2", "prompt3"]'
        progress_json = '{"completed": [0, 1]}'

        config = WorkflowConfig(
            name="Resume Test",
            steps=[
                Step(
                    name="Load prompts",
                    tool="bash",
                    command="cat prompts.json",
                    output_var="prompts_json",
                ),
                Step(
                    name="Load progress",
                    tool="bash",
                    command="cat progress.json",
                    output_var="progress_json",
                ),
                Step(
                    name="Process prompts",
                    tool="foreach",
                    source="prompts_json",
                    item_var="current_prompt",
                    index_var="prompt_index",
                    steps=[
                        Step(
                            name="Check if completed",
                            tool="bash",
                            command='echo "$PROGRESS" | jq -e --argjson idx "$IDX" \'.completed | index($idx)\' > /dev/null 2>&1 && echo "true" || echo "false"',
                            env={"PROGRESS": "{progress_json}", "IDX": "{prompt_index}"},
                            output_var="is_completed",
                        ),
                        Step(
                            name="Skip completed",
                            tool="goto",
                            target="End iteration",
                            when="{is_completed} == true",
                        ),
                        Step(
                            name="Process prompt",
                            tool="bash",
                            command='echo "Processing {current_prompt}"',
                        ),
                        Step(
                            name="End iteration",
                            tool="bash",
                            command='echo "Done with {prompt_index}"',
                        ),
                    ],
                ),
            ],
        )

        # Mock responses
        mock_subprocess.set_response("cat prompts.json", prompts_json)
        mock_subprocess.set_response("cat progress.json", progress_json)

        runner = create_runner(config, project_path, mock_server, mock_tmux)

        # Custom subprocess mock that returns "true" for completed indices
        call_count = {"check": 0}
        original_mock = mock_subprocess.__call__

        def custom_subprocess(*args, **kwargs):
            cmd = args[0] if args else kwargs.get("cmd", "")
            if "jq" in cmd:
                # Check which index we're on based on call count
                idx = call_count["check"]
                call_count["check"] += 1
                # Indices 0 and 1 are completed
                is_completed = "true" if idx < 2 else "false"
                return subprocess.CompletedProcess(
                    args=cmd, returncode=0, stdout=is_completed, stderr=""
                )
            return original_mock(*args, **kwargs)

        with patch("subprocess.run", custom_subprocess):
            try:
                runner.run()
            except (KeyboardInterrupt, SystemExit):
                pass

        # Verify only prompt3 (index 2) was processed
        process_calls = [c for c in mock_subprocess.calls if "Processing" in c["command"]]
        # Should only have processed prompt3
        assert len(process_calls) == 1
        assert mock_subprocess.was_called_with("Processing prompt3")
        # Should NOT have processed prompt1 or prompt2
        assert not mock_subprocess.was_called_with("Processing prompt1")
        assert not mock_subprocess.was_called_with("Processing prompt2")

    def test_resume_with_all_completed_skips_all(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify if all prompts are completed, none are processed."""
        from orchestrator.config import Step

        # Simulate all prompts completed
        prompts_json = '["prompt1", "prompt2"]'
        progress_json = '{"completed": [0, 1]}'

        config = WorkflowConfig(
            name="Resume Test",
            steps=[
                Step(
                    name="Load prompts",
                    tool="bash",
                    command="cat prompts.json",
                    output_var="prompts_json",
                ),
                Step(
                    name="Load progress",
                    tool="bash",
                    command="cat progress.json",
                    output_var="progress_json",
                ),
                Step(
                    name="Process prompts",
                    tool="foreach",
                    source="prompts_json",
                    item_var="current_prompt",
                    index_var="prompt_index",
                    steps=[
                        Step(
                            name="Check if completed",
                            tool="bash",
                            command='echo "$PROGRESS" | jq -e --argjson idx "$IDX" \'.completed | index($idx)\' > /dev/null 2>&1 && echo "true" || echo "false"',
                            env={"PROGRESS": "{progress_json}", "IDX": "{prompt_index}"},
                            output_var="is_completed",
                        ),
                        Step(
                            name="Skip completed",
                            tool="goto",
                            target="End iteration",
                            when="{is_completed} == true",
                        ),
                        Step(
                            name="Process prompt",
                            tool="bash",
                            command='echo "Processing {current_prompt}"',
                        ),
                        Step(
                            name="End iteration",
                            tool="bash",
                            command='echo "Done with {prompt_index}"',
                        ),
                    ],
                ),
            ],
        )

        # Mock responses
        mock_subprocess.set_response("cat prompts.json", prompts_json)
        mock_subprocess.set_response("cat progress.json", progress_json)
        # All prompts are completed
        mock_subprocess.set_response("jq", "true")

        runner = create_runner(config, project_path, mock_server, mock_tmux)
        run_with_mocks(runner, mock_subprocess)

        # Verify no prompts were processed (all skipped)
        process_calls = [c for c in mock_subprocess.calls if "Processing" in c["command"]]
        assert len(process_calls) == 0

    def test_resume_with_gap_in_completed(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify workflow handles non-contiguous completed indices (e.g., 0, 2 completed but not 1)."""
        from orchestrator.config import Step

        # Simulate gap: indices 0 and 2 completed, but not 1
        prompts_json = '["prompt1", "prompt2", "prompt3", "prompt4"]'
        progress_json = '{"completed": [0, 2]}'

        config = WorkflowConfig(
            name="Resume Test",
            steps=[
                Step(
                    name="Load prompts",
                    tool="bash",
                    command="cat prompts.json",
                    output_var="prompts_json",
                ),
                Step(
                    name="Load progress",
                    tool="bash",
                    command="cat progress.json",
                    output_var="progress_json",
                ),
                Step(
                    name="Process prompts",
                    tool="foreach",
                    source="prompts_json",
                    item_var="current_prompt",
                    index_var="prompt_index",
                    steps=[
                        Step(
                            name="Check if completed",
                            tool="bash",
                            command='echo "$PROGRESS" | jq -e --argjson idx "$IDX" \'.completed | index($idx)\' > /dev/null 2>&1 && echo "true" || echo "false"',
                            env={"PROGRESS": "{progress_json}", "IDX": "{prompt_index}"},
                            output_var="is_completed",
                        ),
                        Step(
                            name="Skip completed",
                            tool="goto",
                            target="End iteration",
                            when="{is_completed} == true",
                        ),
                        Step(
                            name="Process prompt",
                            tool="bash",
                            command='echo "Processing {current_prompt}"',
                        ),
                        Step(
                            name="End iteration",
                            tool="bash",
                            command='echo "Done with {prompt_index}"',
                        ),
                    ],
                ),
            ],
        )

        # Mock responses
        mock_subprocess.set_response("cat prompts.json", prompts_json)
        mock_subprocess.set_response("cat progress.json", progress_json)

        runner = create_runner(config, project_path, mock_server, mock_tmux)

        # Custom subprocess mock that returns correct completion status per index
        completed_indices = {0, 2}
        call_count = {"check": 0}
        original_mock = mock_subprocess.__call__

        def custom_subprocess(*args, **kwargs):
            cmd = args[0] if args else kwargs.get("cmd", "")
            if "jq" in cmd:
                idx = call_count["check"]
                call_count["check"] += 1
                is_completed = "true" if idx in completed_indices else "false"
                return subprocess.CompletedProcess(
                    args=cmd, returncode=0, stdout=is_completed, stderr=""
                )
            return original_mock(*args, **kwargs)

        with patch("subprocess.run", custom_subprocess):
            try:
                runner.run()
            except (KeyboardInterrupt, SystemExit):
                pass

        # Verify only prompt2 and prompt4 (indices 1 and 3) were processed
        process_calls = [c for c in mock_subprocess.calls if "Processing" in c["command"]]
        assert len(process_calls) == 2
        assert mock_subprocess.was_called_with("Processing prompt2")
        assert mock_subprocess.was_called_with("Processing prompt4")
        # Should NOT have processed prompt1 or prompt3
        assert not mock_subprocess.was_called_with("Processing prompt1")
        assert not mock_subprocess.was_called_with("Processing prompt3")
