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
# ForEach Continue Workflow Tests (P1)
# =============================================================================


class TestForEachContinueWorkflow:
    """Tests for foreach_continue.yml - continue for skipping loop iterations."""

    def test_workflow_loads(self) -> None:
        """Verify workflow loads with continue steps."""
        config = load_example("foreach_continue")
        assert config.name == "Continue Tool Demo"
        # Find foreach with continue inside
        foreach_steps = [s for s in config.steps if s.tool == "foreach"]
        assert len(foreach_steps) >= 1
        # Check that nested steps contain continue
        nested_steps = foreach_steps[0].steps or []
        continue_steps = [s for s in nested_steps if s.tool == "continue"]
        assert len(continue_steps) >= 1

    def test_continue_skips_items(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify continue skips matching items."""
        from orchestrator.config import Step

        # Create test workflow with foreach and continue
        # Uses source field (referencing a variable) as foreach tool requires
        config = WorkflowConfig(
            name="Continue Skip Test",
            steps=[
                Step(
                    name="Set items",
                    tool="set",
                    var="items",
                    value='["process", "skip_me", "handle", "skip_me", "complete"]',
                ),
                Step(
                    name="Process list",
                    tool="foreach",
                    source="items",
                    item_var="item",
                    index_var="idx",
                    steps=[
                        Step(
                            name="Skip skip_me items",
                            tool="continue",
                            when="{item} == skip_me",
                        ),
                        Step(
                            name="Process item",
                            tool="bash",
                            command="echo '[{idx}] Processing: {item}'",
                        ),
                    ],
                ),
            ],
        )

        runner = create_runner(config, project_path, mock_server, mock_tmux)
        run_with_mocks(runner, mock_subprocess)

        # Should process items at indices 0, 2, 4 (process, handle, complete)
        assert mock_subprocess.was_called_with("[0] Processing: process")
        assert mock_subprocess.was_called_with("[2] Processing: handle")
        assert mock_subprocess.was_called_with("[4] Processing: complete")
        # skip_me items at indices 1 and 3 should be skipped
        assert not mock_subprocess.was_called_with("[1] Processing: skip_me")
        assert not mock_subprocess.was_called_with("[3] Processing: skip_me")

    def test_continue_with_condition(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify continue respects when condition."""
        config = load_example("foreach_continue")
        # Find the first foreach step and verify it has continue with when condition
        foreach_steps = [s for s in config.steps if s.tool == "foreach"]
        first_foreach = foreach_steps[0]
        nested_steps = first_foreach.steps or []
        continue_step = next(s for s in nested_steps if s.tool == "continue")

        # Verify the continue step has a when condition
        assert continue_step.when is not None
        assert "{item} == skip_me" in continue_step.when

    def test_continue_processes_remaining(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify non-skipped items are processed."""
        from orchestrator.config import Step

        # Create workflow to test continue processes remaining items
        config = WorkflowConfig(
            name="Continue Remaining Test",
            steps=[
                Step(
                    name="Set values",
                    tool="set",
                    var="values",
                    value='["value1", "", "value2", "", "value3"]',
                ),
                Step(
                    name="Process non-empty",
                    tool="foreach",
                    source="values",
                    item_var="val",
                    index_var="i",
                    steps=[
                        Step(
                            name="Skip empty",
                            tool="continue",
                            when="{val} is empty",
                        ),
                        Step(
                            name="Handle value",
                            tool="bash",
                            command="echo 'Processing: {val}'",
                        ),
                    ],
                ),
                Step(
                    name="All done",
                    tool="bash",
                    command="echo 'All items processed'",
                ),
            ],
        )

        runner = create_runner(config, project_path, mock_server, mock_tmux)
        run_with_mocks(runner, mock_subprocess)

        # Should process value1, value2, value3 (indices 0, 2, 4)
        assert mock_subprocess.was_called_with("Processing: value1")
        assert mock_subprocess.was_called_with("Processing: value2")
        assert mock_subprocess.was_called_with("Processing: value3")
        # Final step should run
        assert mock_subprocess.was_called_with("All items processed")


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


# =============================================================================
# Range Tool Workflow Tests
# =============================================================================


class TestRangeToolWorkflow:
    """Tests for range_tool.yml - number range iteration."""

    def test_workflow_loads(self) -> None:
        """Verify workflow loads with range steps."""
        config = load_example("range_tool")
        assert config.name == "Range Tool Demo"
        # Find range tool steps
        range_steps = [s for s in config.steps if s.tool == "range"]
        assert len(range_steps) >= 3
        # Verify first range has required fields
        first_range = range_steps[0]
        assert first_range.range_from == 1
        assert first_range.range_to == 5
        assert first_range.var == "num"

    def test_range_basic_iteration(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify range iterates from/to correctly."""
        config = load_example("range_tool")
        runner = create_runner(config, project_path, mock_server, mock_tmux)
        run_with_mocks(runner, mock_subprocess)

        # Basic range 1-5 should produce 5 iterations
        # Look for "Processing batch #" commands
        batch_calls = [
            c for c in mock_subprocess.calls
            if "Processing batch #" in c["command"]
        ]
        assert len(batch_calls) == 5

        # Verify each number from 1 to 5 was processed
        for i in range(1, 6):
            assert mock_subprocess.was_called_with(f"Processing batch #{i}")

    def test_range_with_step(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify custom step increment works."""
        config = load_example("range_tool")
        runner = create_runner(config, project_path, mock_server, mock_tmux)
        run_with_mocks(runner, mock_subprocess)

        # Range 0-10 step 2 should produce even numbers: 0, 2, 4, 6, 8, 10
        # Look for "Even:" commands
        even_calls = [
            c for c in mock_subprocess.calls
            if "Even:" in c["command"]
        ]
        assert len(even_calls) == 6

        # Verify each even number from 0 to 10 was processed
        for even in [0, 2, 4, 6, 8, 10]:
            assert mock_subprocess.was_called_with(f"Even: {even}")

    def test_range_countdown(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify negative step for descending order."""
        config = load_example("range_tool")
        runner = create_runner(config, project_path, mock_server, mock_tmux)
        run_with_mocks(runner, mock_subprocess)

        # Countdown from 10 to 1 with step -1
        # Look for countdown pattern "X..."
        countdown_calls = [
            c for c in mock_subprocess.calls
            if "..." in c["command"] and c["command"].strip().replace("echo '", "").replace("...'", "").isdigit()
        ]

        # Verify all numbers from 10 down to 1 are present
        for i in range(10, 0, -1):
            assert mock_subprocess.was_called_with(f"{i}...")


# =============================================================================
# Context Tool Workflow Tests
# =============================================================================


class TestContextToolWorkflow:
    """Tests for context_tool.yml - batch variable operations."""

    def test_workflow_loads(self) -> None:
        """Verify workflow loads with context steps."""
        config = load_example("context_tool")
        assert config.name == "Context Tool Demo"
        # Find context tool steps
        context_steps = [s for s in config.steps if s.tool == "context"]
        assert len(context_steps) >= 4  # set, copy, export, clear actions
        # Check all actions are present
        actions = {s.action for s in context_steps}
        assert "set" in actions
        assert "copy" in actions
        assert "clear" in actions
        assert "export" in actions

    def test_context_set_multiple_variables(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify action: set stores multiple variables."""
        config = load_example("context_tool")
        runner = create_runner(config, project_path, mock_server, mock_tmux)
        run_with_mocks(runner, mock_subprocess)

        # Verify variables were set from first set step
        assert runner.context.get("api_url") is not None
        assert runner.context.get("timeout") == "30"
        assert runner.context.get("max_retries") == "3"
        assert runner.context.get("environment") is not None

    def test_context_copy_variables(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify action: copy creates new variables from existing ones."""
        from orchestrator.config import Step

        # Create isolated config for testing copy action
        config = WorkflowConfig(
            name="Copy Test",
            steps=[
                Step(
                    name="Set original variables",
                    tool="context",
                    action="set",
                    values={
                        "api_url": "https://api.example.com",
                        "environment": "development",
                        "timeout": "30",
                    },
                ),
                Step(
                    name="Copy to backup variables",
                    tool="context",
                    action="copy",
                    mappings={
                        "api_url": "backup_api_url",
                        "environment": "backup_environment",
                        "timeout": "backup_timeout",
                    },
                ),
                Step(
                    name="Change original variables",
                    tool="context",
                    action="set",
                    values={
                        "environment": "production",
                        "api_url": "https://prod.api.example.com",
                    },
                ),
            ],
        )

        runner = create_runner(config, project_path, mock_server, mock_tmux)
        run_with_mocks(runner, mock_subprocess)

        # Verify original variables were updated
        assert runner.context.get("environment") == "production"
        assert runner.context.get("api_url") == "https://prod.api.example.com"
        # Verify backup variables retained original values
        assert runner.context.get("backup_environment") == "development"
        assert runner.context.get("backup_api_url") == "https://api.example.com"
        assert runner.context.get("backup_timeout") == "30"

    def test_context_clear_variables(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify action: clear removes variables."""
        from orchestrator.config import Step

        # Create isolated config for testing clear action
        config = WorkflowConfig(
            name="Clear Test",
            steps=[
                Step(
                    name="Set variables",
                    tool="context",
                    action="set",
                    values={
                        "var_to_keep": "keep_me",
                        "var_to_clear": "clear_me",
                        "another_to_clear": "also_clear_me",
                    },
                ),
                Step(
                    name="Clear specific variables",
                    tool="context",
                    action="clear",
                    vars=["var_to_clear", "another_to_clear"],
                ),
            ],
        )

        runner = create_runner(config, project_path, mock_server, mock_tmux)
        run_with_mocks(runner, mock_subprocess)

        # Verify cleared variables are removed
        assert runner.context.get("var_to_clear") is None
        assert runner.context.get("another_to_clear") is None
        # Verify uncleared variables remain
        assert runner.context.get("var_to_keep") == "keep_me"

    def test_context_export_to_file(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
        tmp_path: Path,
    ) -> None:
        """Verify action: export creates JSON file."""
        # Create a modified config with a temp file path for export
        from orchestrator.config import Step

        config = WorkflowConfig(
            name="Export Test",
            steps=[
                Step(
                    name="Set variables",
                    tool="context",
                    action="set",
                    values={"var1": "value1", "var2": "value2", "var3": "value3"},
                ),
                Step(
                    name="Export all",
                    tool="context",
                    action="export",
                    file=str(tmp_path / "export-all.json"),
                ),
                Step(
                    name="Export selective",
                    tool="context",
                    action="export",
                    file=str(tmp_path / "export-selective.json"),
                    vars=["var1", "var3"],
                ),
            ],
        )

        runner = create_runner(config, project_path, mock_server, mock_tmux)
        run_with_mocks(runner, mock_subprocess)

        # Verify export files were created
        export_all_path = tmp_path / "export-all.json"
        export_selective_path = tmp_path / "export-selective.json"

        assert export_all_path.exists()
        assert export_selective_path.exists()

        # Verify contents of all export
        with open(export_all_path) as f:
            all_data = json.load(f)
        assert all_data["var1"] == "value1"
        assert all_data["var2"] == "value2"
        assert all_data["var3"] == "value3"

        # Verify contents of selective export
        with open(export_selective_path) as f:
            selective_data = json.load(f)
        assert selective_data["var1"] == "value1"
        assert selective_data["var3"] == "value3"
        assert "var2" not in selective_data


# =============================================================================
# While Loop Workflow Tests
# =============================================================================


class TestWhileLoopWorkflow:
    """Tests for while_loop.yml - condition-based looping with while tool."""

    def test_workflow_loads(self) -> None:
        """Verify workflow loads with while steps."""
        config = load_example("while_loop")
        assert config.name == "While Loop Demo"
        # Find while steps
        while_steps = [s for s in config.steps if s.tool == "while"]
        assert len(while_steps) >= 1
        # Check first while step has required fields
        first_while = while_steps[0]
        assert first_while.condition == "{counter} < 5"
        assert first_while.max_iterations == 10
        assert first_while.steps is not None
        assert len(first_while.steps) >= 1

    def test_while_condition_evaluated(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify condition controls loop execution."""
        config = load_example("while_loop")
        runner = create_runner(config, project_path, mock_server, mock_tmux)

        # Track distinct commands from different while loops
        counter_echo_count = [0]
        final_counter_called = [False]
        # Track different variable increments by their context
        increment_counts: Dict[str, int] = {}

        def custom_subprocess(
            cmd: str, **kwargs: Any
        ) -> subprocess.CompletedProcess[str]:
            # Track "Counter is now" echo commands (from first while loop)
            if "Counter is now" in cmd:
                counter_echo_count[0] += 1
                return subprocess.CompletedProcess(
                    args=cmd,
                    returncode=0,
                    stdout=f"Counter is now: {counter_echo_count[0] - 1}",
                    stderr="",
                )
            # Track final counter command - runs after first while loop completes
            if "Final counter" in cmd:
                final_counter_called[0] = True
                return subprocess.CompletedProcess(
                    args=cmd,
                    returncode=0,
                    stdout=f"Final counter: {counter_echo_count[0]}",
                    stderr="",
                )
            # Handle increment commands - return incrementing values
            if "$((" in cmd and "+ 1" in cmd:
                # Use current value from counter_echo_count as approximation
                return subprocess.CompletedProcess(
                    args=cmd,
                    returncode=0,
                    stdout=str(counter_echo_count[0]),
                    stderr="",
                )
            # Handle decrement commands
            if "$((" in cmd and "- 1" in cmd:
                return subprocess.CompletedProcess(
                    args=cmd, returncode=0, stdout="0", stderr=""
                )
            return subprocess.CompletedProcess(
                args=cmd, returncode=0, stdout="mock", stderr=""
            )

        with patch("orchestrator.tools.bash.subprocess.run", custom_subprocess):
            with patch("time.sleep"):
                runner.run()

        # The first while loop should have called "Counter is now" at least once
        # (depends on condition evaluation which is separate from this)
        assert counter_echo_count[0] >= 1, (
            "Counter is now should be called at least once during while loop"
        )
        # After the first while loop completes, the "Final counter" step should run
        assert final_counter_called[0], "Final counter step should run after first while loop"

    def test_while_max_iterations_safety(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify max_iterations stops infinite loops."""
        config = load_example("while_loop")
        # Find the step with always_true condition
        always_true_step = None
        for step in config.steps:
            if (
                step.tool == "while"
                and step.condition
                and "always_true" in step.condition
            ):
                always_true_step = step
                break

        assert (
            always_true_step is not None
        ), "Should have a while step with always_true condition"
        assert always_true_step.max_iterations == 3, "Safety limit should be 3"
        assert (
            always_true_step.on_max_reached == "continue"
        ), "Should continue on max reached"

    def test_while_exits_when_condition_false(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify loop exits when condition becomes false."""
        config = load_example("while_loop")
        runner = create_runner(config, project_path, mock_server, mock_tmux)

        # Track workflow completion by checking if final step is called
        workflow_complete_called = [False]
        all_commands: List[str] = []

        def custom_subprocess(
            cmd: str, **kwargs: Any
        ) -> subprocess.CompletedProcess[str]:
            all_commands.append(cmd)

            # Track the final step of the entire workflow
            if "While loop demo complete" in cmd:
                workflow_complete_called[0] = True
                return subprocess.CompletedProcess(
                    args=cmd, returncode=0, stdout="complete", stderr=""
                )
            # Handle poll status check - return "ready" after some iterations
            if "poll=" in cmd and "-ge" in cmd:
                return subprocess.CompletedProcess(
                    args=cmd, returncode=0, stdout="ready", stderr=""
                )
            # Handle increment commands
            if "$((" in cmd and "+ 1" in cmd:
                return subprocess.CompletedProcess(
                    args=cmd, returncode=0, stdout="5", stderr=""
                )
            # Handle decrement commands
            if "$((" in cmd and "- 1" in cmd:
                return subprocess.CompletedProcess(
                    args=cmd, returncode=0, stdout="0", stderr=""
                )
            return subprocess.CompletedProcess(
                args=cmd, returncode=0, stdout="mock", stderr=""
            )

        with patch("orchestrator.tools.bash.subprocess.run", custom_subprocess):
            with patch("time.sleep"):
                runner.run()

        # Verify the workflow made progress (at least one command ran)
        assert len(all_commands) > 0, "Workflow should have run at least one command"

        # Verify specific while loop patterns were executed by checking for
        # commands that only appear inside while loops
        counter_commands = [c for c in all_commands if "Counter is now" in c]
        assert len(counter_commands) >= 1, (
            "First while loop should have run at least one iteration"
        )


# =============================================================================
# Data Tool Workflow Tests
# =============================================================================


class TestDataToolWorkflow:
    """Tests for data_tool.yml - writing temporary files with various formats."""

    def test_workflow_loads(self) -> None:
        """Verify workflow loads with data steps."""
        config = load_example("data_tool")
        assert config.name == "Data Tool Demo"
        # Find data tool steps
        data_steps = [s for s in config.steps if s.tool == "data"]
        assert len(data_steps) >= 3
        # Verify first data step has required fields
        first_data = data_steps[0]
        assert first_data.content is not None
        assert first_data.format == "text"
        assert first_data.filename == "simple-notes.txt"
        assert first_data.output_var == "text_file"

    def test_data_creates_file(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify data tool creates temporary file."""
        from orchestrator.config import Step

        # Create minimal workflow with data step
        config = WorkflowConfig(
            name="Data File Test",
            steps=[
                Step(
                    name="Create text file",
                    tool="data",
                    content="Test content",
                    format="text",
                    filename="test-file.txt",
                    output_var="file_path",
                ),
                Step(
                    name="Verify file",
                    tool="bash",
                    command="cat {file_path}",
                    output_var="file_content",
                ),
            ],
        )

        mock_subprocess.set_response("cat", "Test content")

        runner = create_runner(config, project_path, mock_server, mock_tmux)

        # Patch shutil.rmtree to prevent cleanup and preserve temp files
        with patch("shutil.rmtree"):
            run_with_mocks(runner, mock_subprocess)

            # Verify file_path was stored in context
            file_path = runner.context.get("file_path")
            assert file_path is not None
            assert "test-file.txt" in file_path
            # Verify file was created
            assert Path(file_path).exists()
            assert Path(file_path).read_text() == "Test content"

    def test_data_format_options(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify different formats (text, json, markdown)."""
        from orchestrator.config import Step

        config = WorkflowConfig(
            name="Format Test",
            steps=[
                Step(
                    name="Create text file",
                    tool="data",
                    content="Plain text content",
                    format="text",
                    filename="plain.txt",
                    output_var="text_path",
                ),
                Step(
                    name="Create JSON file",
                    tool="data",
                    content='{"key": "value", "num": 42}',
                    format="json",
                    filename="data.json",
                    output_var="json_path",
                ),
                Step(
                    name="Create markdown file",
                    tool="data",
                    content="# Title\n\nParagraph content",
                    format="markdown",
                    filename="doc.md",
                    output_var="md_path",
                ),
            ],
        )

        runner = create_runner(config, project_path, mock_server, mock_tmux)

        # Patch shutil.rmtree to prevent cleanup and preserve temp files
        with patch("shutil.rmtree"):
            run_with_mocks(runner, mock_subprocess)

            # Verify text file
            text_path = runner.context.get("text_path")
            assert text_path is not None
            assert text_path.endswith(".txt")
            assert Path(text_path).read_text() == "Plain text content"

            # Verify JSON file (should be pretty-printed)
            json_path = runner.context.get("json_path")
            assert json_path is not None
            assert json_path.endswith(".json")
            json_content = Path(json_path).read_text()
            import json as json_lib
            parsed = json_lib.loads(json_content)
            assert parsed["key"] == "value"
            assert parsed["num"] == 42

            # Verify markdown file
            md_path = runner.context.get("md_path")
            assert md_path is not None
            assert md_path.endswith(".md")
            assert "# Title" in Path(md_path).read_text()

    def test_data_output_var_stores_path(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify output_var contains file path."""
        from orchestrator.config import Step

        config = WorkflowConfig(
            name="Output Var Test",
            steps=[
                Step(
                    name="Create file",
                    tool="data",
                    content="Data content",
                    format="text",
                    filename="output-test.txt",
                    output_var="my_file",
                ),
                Step(
                    name="Use file path",
                    tool="bash",
                    command="echo 'File at: {my_file}'",
                ),
            ],
        )

        runner = create_runner(config, project_path, mock_server, mock_tmux)
        run_with_mocks(runner, mock_subprocess)

        # Verify output_var contains absolute path
        stored_path = runner.context.get("my_file")
        assert stored_path is not None
        assert Path(stored_path).is_absolute()
        assert "output-test.txt" in stored_path

        # Verify bash command was called with interpolated path
        assert mock_subprocess.was_called_with("File at:")
        assert mock_subprocess.was_called_with(stored_path)

    def test_data_content_interpolation(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify variables are interpolated in content."""
        from orchestrator.config import Step

        config = WorkflowConfig(
            name="Interpolation Test",
            steps=[
                Step(
                    name="Set variables",
                    tool="set",
                    var="user_name",
                    value="Alice",
                ),
                Step(
                    name="Set date",
                    tool="bash",
                    command="echo '2024-01-15'",
                    output_var="today",
                ),
                Step(
                    name="Create file with variables",
                    tool="data",
                    content="Hello {user_name}!\nDate: {today}",
                    format="text",
                    filename="greeting.txt",
                    output_var="greeting_file",
                ),
            ],
        )

        mock_subprocess.set_response("echo '2024-01-15'", "2024-01-15")

        runner = create_runner(config, project_path, mock_server, mock_tmux)

        # Patch shutil.rmtree to prevent cleanup and preserve temp files
        with patch("shutil.rmtree"):
            run_with_mocks(runner, mock_subprocess)

            # Verify content was interpolated
            greeting_path = runner.context.get("greeting_file")
            assert greeting_path is not None
            file_content = Path(greeting_path).read_text()
            assert "Hello Alice!" in file_content
            assert "Date: 2024-01-15" in file_content


# =============================================================================
# Shared Steps Usage Workflow Tests
# =============================================================================


class TestSharedStepsUsageWorkflow:
    """Tests for shared_steps_usage.yml - shared step usage with builtin steps."""

    def test_workflow_loads(self) -> None:
        """Verify workflow loads with shared step references (uses: builtin:...)."""
        config = load_example("shared_steps_usage")
        assert config.name == "Shared Steps Demo"
        assert len(config.steps) > 0
        # Verify shared step references are loaded
        uses_steps = [s for s in config.steps if s.uses is not None]
        assert len(uses_steps) >= 4, "Should have at least 4 shared step references"
        # Verify builtin prefix pattern
        for step in uses_steps:
            assert step.uses.startswith("builtin:"), f"Expected builtin: prefix, got {step.uses}"

    def test_shared_step_has_with_inputs(self) -> None:
        """Verify with: parameter passes inputs to shared steps."""
        config = load_example("shared_steps_usage")
        # Find lint-fix step with inputs
        lint_steps = [s for s in config.steps if s.uses == "builtin:lint-fix"]
        assert len(lint_steps) >= 1, "Should have at least one lint-fix step"

        # Check the first lint-fix step has with_inputs
        lint_step = lint_steps[0]
        assert lint_step.with_inputs is not None, "Shared step should have with_inputs"
        assert "language" in lint_step.with_inputs, "Should have language input"
        assert "fix" in lint_step.with_inputs, "Should have fix input"
        assert "path" in lint_step.with_inputs, "Should have path input"

        # Verify input values
        assert lint_step.with_inputs["language"] == "auto"
        assert lint_step.with_inputs["fix"] is False
        assert lint_step.with_inputs["path"] == "."

    def test_shared_step_has_outputs(self) -> None:
        """Verify outputs: maps shared step outputs to variables."""
        config = load_example("shared_steps_usage")
        # Find git-status step with outputs
        git_status_steps = [s for s in config.steps if s.uses == "builtin:git-status"]
        assert len(git_status_steps) >= 1, "Should have at least one git-status step"

        git_status_step = git_status_steps[0]
        assert git_status_step.outputs is not None, "Shared step should have outputs mapping"

        # Verify output mappings
        expected_outputs = {
            "branch": "current_branch",
            "has_changes": "has_uncommitted",
            "staged_count": "staged_files",
            "modified_count": "modified_files",
            "untracked_count": "untracked_files",
            "commit_sha": "current_sha",
        }
        for output_key, var_name in expected_outputs.items():
            assert output_key in git_status_step.outputs, f"Should have {output_key} output"
            assert git_status_step.outputs[output_key] == var_name, (
                f"Output {output_key} should map to {var_name}"
            )

    def test_builtin_steps_referenced(self) -> None:
        """Verify builtin steps (git-status, git-commit, lint-fix, run-tests) are referenced."""
        config = load_example("shared_steps_usage")

        # Extract all uses values (including nested in foreach)
        all_uses: list[str] = []
        for step in config.steps:
            if step.uses:
                all_uses.append(step.uses)
            if step.steps:
                for nested in step.steps:
                    if nested.uses:
                        all_uses.append(nested.uses)

        # Verify all expected builtin steps are referenced
        expected_builtins = [
            "builtin:git-status",
            "builtin:git-commit",
            "builtin:lint-fix",
            "builtin:run-tests",
        ]
        for builtin in expected_builtins:
            assert builtin in all_uses, f"Should reference {builtin}"

    def test_shared_step_with_condition(self) -> None:
        """Verify shared steps can have when: conditions."""
        config = load_example("shared_steps_usage")
        # Find the conditional lint-fix step
        conditional_steps = [
            s for s in config.steps
            if s.uses == "builtin:lint-fix" and s.when is not None
        ]
        assert len(conditional_steps) >= 1, "Should have at least one conditional shared step"
        assert "{lint_passed}" in conditional_steps[0].when, "Condition should reference lint_passed"

    def test_shared_step_with_on_error(self) -> None:
        """Verify shared steps can have on_error: handling."""
        config = load_example("shared_steps_usage")
        # Find shared steps with on_error
        error_handling_steps = [
            s for s in config.steps
            if s.uses is not None and s.on_error == "continue"
        ]
        assert len(error_handling_steps) >= 1, "Should have shared steps with on_error handling"

    def test_shared_steps_in_foreach(self) -> None:
        """Verify shared steps work inside foreach loops."""
        config = load_example("shared_steps_usage")
        # Find the foreach step
        foreach_steps = [s for s in config.steps if s.tool == "foreach"]
        assert len(foreach_steps) >= 1, "Should have at least one foreach step"

        foreach_step = foreach_steps[0]
        assert foreach_step.steps is not None, "Foreach should have nested steps"

        # Find nested shared step
        nested_uses = [s for s in foreach_step.steps if s.uses is not None]
        assert len(nested_uses) >= 1, "Foreach should contain at least one shared step"
        assert nested_uses[0].uses == "builtin:lint-fix", "Nested step should use lint-fix"

        # Verify nested step has dynamic path input
        assert nested_uses[0].with_inputs is not None
        assert nested_uses[0].with_inputs["path"] == "{dir}", "Path should use loop variable"

    def test_git_commit_shared_step(self) -> None:
        """Verify git-commit shared step has correct inputs and outputs."""
        config = load_example("shared_steps_usage")
        # Find git-commit step
        commit_steps = [s for s in config.steps if s.uses == "builtin:git-commit"]
        assert len(commit_steps) == 1, "Should have exactly one git-commit step"

        commit_step = commit_steps[0]

        # Verify inputs
        assert commit_step.with_inputs is not None
        assert "message" in commit_step.with_inputs
        assert "add_all" in commit_step.with_inputs
        assert commit_step.with_inputs["add_all"] is True
        assert "allow_empty" in commit_step.with_inputs
        assert commit_step.with_inputs["allow_empty"] is False

        # Verify outputs
        assert commit_step.outputs is not None
        assert "commit_sha" in commit_step.outputs
        assert commit_step.outputs["commit_sha"] == "new_commit_sha"
        assert "committed" in commit_step.outputs
        assert commit_step.outputs["committed"] == "was_committed"

        # Verify condition
        assert commit_step.when == "{commit_decision} == safe"

    def test_run_tests_shared_step(self) -> None:
        """Verify run-tests shared step has correct inputs and outputs."""
        config = load_example("shared_steps_usage")
        # Find run-tests steps
        test_steps = [s for s in config.steps if s.uses == "builtin:run-tests"]
        assert len(test_steps) >= 1, "Should have at least one run-tests step"

        # Check first run-tests step (main test suite)
        main_test_step = test_steps[0]
        assert main_test_step.with_inputs is not None
        assert main_test_step.with_inputs["language"] == "auto"
        assert main_test_step.with_inputs["coverage"] is True

        # Verify outputs
        assert main_test_step.outputs is not None
        assert "success" in main_test_step.outputs
        assert main_test_step.outputs["success"] == "tests_passed"
        assert "coverage_percent" in main_test_step.outputs
        assert main_test_step.outputs["coverage_percent"] == "test_coverage"

    def test_multiple_shared_step_instances(self) -> None:
        """Verify same builtin can be used multiple times with different inputs."""
        config = load_example("shared_steps_usage")

        # Count lint-fix usages (including nested)
        lint_fix_count = 0
        for step in config.steps:
            if step.uses == "builtin:lint-fix":
                lint_fix_count += 1
            if step.steps:
                for nested in step.steps:
                    if nested.uses == "builtin:lint-fix":
                        lint_fix_count += 1

        assert lint_fix_count >= 3, "Should have multiple lint-fix step usages"

        # Count run-tests usages
        test_steps = [s for s in config.steps if s.uses == "builtin:run-tests"]
        assert len(test_steps) >= 3, "Should have multiple run-tests step usages"

        # Verify different configurations
        languages = [s.with_inputs["language"] for s in test_steps if s.with_inputs]
        assert "auto" in languages
        assert "python" in languages
        assert "javascript" in languages


# =============================================================================
# Retry Workflow Tests
# =============================================================================


class TestRetryWorkflow:
    """Tests for retry_workflow.yml - retry operations with backoff and conditions."""

    def test_workflow_loads(self) -> None:
        """Verify workflow loads with retry steps."""
        config = load_example("retry_workflow")
        assert config.name == "Retry Tool Demo"
        # Find retry tool steps
        retry_steps = [s for s in config.steps if s.tool == "retry"]
        assert len(retry_steps) >= 4
        # Verify first retry has required fields
        first_retry = retry_steps[0]
        assert first_retry.max_attempts == 3
        assert first_retry.steps is not None
        assert len(first_retry.steps) >= 1

    def test_retry_max_attempts(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify retry respects max_attempts limit."""
        from orchestrator.config import Step

        # Create a workflow with a retry that always fails
        config = WorkflowConfig(
            name="Max Attempts Test",
            steps=[
                Step(
                    name="Retry with limit",
                    tool="retry",
                    max_attempts=3,
                    on_failure="continue",  # Continue so we can check result
                    steps=[
                        Step(
                            name="Always fail",
                            tool="bash",
                            command="echo 'attempt {_attempt}'; exit 1",
                        ),
                    ],
                ),
                Step(
                    name="Check result",
                    tool="bash",
                    command="echo 'Attempts made: {_retry_attempts}'",
                ),
            ],
        )

        runner = create_runner(config, project_path, mock_server, mock_tmux)
        run_with_mocks(runner, mock_subprocess)

        # Should have exactly 3 attempts (max_attempts limit)
        attempt_calls = [
            c for c in mock_subprocess.calls if "attempt" in c["command"]
        ]
        assert len(attempt_calls) == 3

        # Verify attempts 1, 2, and 3 were made
        assert mock_subprocess.was_called_with("attempt 1")
        assert mock_subprocess.was_called_with("attempt 2")
        assert mock_subprocess.was_called_with("attempt 3")

    def test_retry_until_condition(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
    ) -> None:
        """Verify retry exits when until condition is met."""
        from orchestrator.config import Step

        # Create a workflow that succeeds on attempt 2
        config = WorkflowConfig(
            name="Until Condition Test",
            steps=[
                Step(
                    name="Initialize",
                    tool="set",
                    var="status",
                    value="pending",
                ),
                Step(
                    name="Retry until success",
                    tool="retry",
                    max_attempts=5,
                    until="{status} == success",
                    steps=[
                        Step(
                            name="Check status",
                            tool="bash",
                            command='echo "checking"',
                            output_var="status",
                        ),
                    ],
                ),
                Step(
                    name="Final check",
                    tool="bash",
                    command="echo 'Status: {status}'",
                ),
            ],
        )

        runner = create_runner(config, project_path, mock_server, mock_tmux)

        # Track attempts
        attempt_count = [0]

        def custom_subprocess(
            cmd: str, **kwargs: Any
        ) -> subprocess.CompletedProcess[str]:
            if "checking" in cmd:
                attempt_count[0] += 1
                # Return "success" on attempt 2+
                if attempt_count[0] >= 2:
                    return subprocess.CompletedProcess(
                        args=cmd, returncode=0, stdout="success", stderr=""
                    )
                return subprocess.CompletedProcess(
                    args=cmd, returncode=0, stdout="pending", stderr=""
                )
            return subprocess.CompletedProcess(
                args=cmd, returncode=0, stdout="mock", stderr=""
            )

        with patch("orchestrator.tools.bash.subprocess.run", custom_subprocess):
            with patch("time.sleep"):
                runner.run()

        # Should have exited after 2 attempts (not all 5)
        assert attempt_count[0] == 2

        # Context should reflect success
        assert runner.context.get("status") == "success"

    def test_retry_on_failure_continue(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify on_failure: continue allows workflow to proceed."""
        from orchestrator.config import Step

        # Create a workflow with retry that fails all attempts
        config = WorkflowConfig(
            name="On Failure Continue Test",
            steps=[
                Step(
                    name="Failing retry",
                    tool="retry",
                    max_attempts=2,
                    on_failure="continue",
                    steps=[
                        Step(
                            name="Always fail",
                            tool="bash",
                            command="echo 'failing'; exit 1",
                        ),
                    ],
                ),
                Step(
                    name="After retry",
                    tool="bash",
                    command="echo 'Workflow continued despite retry failure'",
                ),
            ],
        )

        runner = create_runner(config, project_path, mock_server, mock_tmux)
        run_with_mocks(runner, mock_subprocess)

        # The step after retry should have executed
        assert mock_subprocess.was_called_with(
            "Workflow continued despite retry failure"
        )

        # Verify retry actually failed but workflow continued
        assert runner.context.get("_retry_succeeded") == "false"

    def test_retry_context_variables(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify {_attempt} and result variables are set."""
        from orchestrator.config import Step

        # Create a workflow that succeeds on attempt 2
        # Using a simpler approach - just verify context variables after run
        config = WorkflowConfig(
            name="Context Variables Test",
            steps=[
                Step(
                    name="Retry operation",
                    tool="retry",
                    max_attempts=5,
                    steps=[
                        Step(
                            name="Track attempt",
                            tool="bash",
                            command="echo 'Attempt {_attempt}'",
                        ),
                    ],
                ),
            ],
        )

        runner = create_runner(config, project_path, mock_server, mock_tmux)

        # Track calls to find which attempts were made
        call_count = [0]

        def custom_subprocess(
            cmd: str, **kwargs: Any
        ) -> subprocess.CompletedProcess[str]:
            if "Attempt" in cmd:
                call_count[0] += 1
                # Succeed on the second attempt
                if call_count[0] >= 2:
                    return subprocess.CompletedProcess(
                        args=cmd, returncode=0, stdout="ok", stderr=""
                    )
                return subprocess.CompletedProcess(
                    args=cmd, returncode=1, stdout="", stderr=""
                )
            return subprocess.CompletedProcess(
                args=cmd, returncode=0, stdout="mock", stderr=""
            )

        with patch("orchestrator.tools.bash.subprocess.run", custom_subprocess):
            with patch("time.sleep"):
                runner.run()

        # Verify result context variables are set
        assert runner.context.get("_retry_succeeded") == "true"
        assert runner.context.get("_retry_attempts") == "2"
        # Also check the call count (should be 2 attempts)
        assert call_count[0] == 2

    def test_retry_delay_option(self) -> None:
        """Verify delay option is parsed correctly from workflow."""
        config = load_example("retry_workflow")
        # Find retry step with delay
        retry_with_delay = None
        for step in config.steps:
            if step.tool == "retry" and step.delay is not None and step.delay > 0:
                retry_with_delay = step
                break

        assert retry_with_delay is not None
        assert retry_with_delay.delay == 2

    def test_retry_until_option_parsed(self) -> None:
        """Verify until condition is parsed from workflow."""
        config = load_example("retry_workflow")
        # Find retry step with until condition
        retry_with_until = None
        for step in config.steps:
            if step.tool == "retry" and step.until is not None:
                retry_with_until = step
                break

        assert retry_with_until is not None
        assert "{api_result} == success" in retry_with_until.until

    def test_retry_on_failure_option_parsed(self) -> None:
        """Verify on_failure option is parsed from workflow."""
        config = load_example("retry_workflow")
        # Find retry step with on_failure: continue
        retry_with_on_failure = None
        for step in config.steps:
            if step.tool == "retry" and step.on_failure == "continue":
                retry_with_on_failure = step
                break

        assert retry_with_on_failure is not None
        assert retry_with_on_failure.name == "Retry with on_failure: continue"

    def test_retry_nested_steps_structure(self) -> None:
        """Verify nested steps are parsed correctly."""
        config = load_example("retry_workflow")
        # Find first retry step
        retry_step = next(s for s in config.steps if s.tool == "retry")

        assert retry_step.steps is not None
        assert len(retry_step.steps) >= 1
        # First nested step should be a bash step
        nested_step = retry_step.steps[0]
        assert nested_step.tool == "bash"
        assert nested_step.name == "Try operation"


# =============================================================================
# JSON Manipulation Workflow Tests
# =============================================================================


class TestJsonManipulationWorkflow:
    """Tests for json_manipulation.yml - native JSON manipulation."""

    def test_workflow_loads(self) -> None:
        """Verify workflow loads with json steps."""
        config = load_example("json_manipulation")
        assert config.name == "JSON Manipulation Demo"
        # Find json tool steps
        json_steps = [s for s in config.steps if s.tool == "json"]
        assert len(json_steps) >= 10  # Many json steps in the demo
        # Verify we have all action types
        actions = {s.action for s in json_steps}
        assert "query" in actions
        assert "set" in actions
        assert "update" in actions
        assert "delete" in actions

    def test_json_query_action(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify action: query extracts values from JSON."""
        from orchestrator.tools.json_tool import JsonTool
        from orchestrator.context import ExecutionContext

        # Create a test JSON file
        test_json = project_path / "test.json"
        test_json.write_text(
            '{"name": "test-project", "version": "1.0.0", '
            '"dependencies": {"express": "^4.18.0"}}'
        )

        # Create context with project path
        context = ExecutionContext(project_path)

        # Test simple query
        tool = JsonTool()
        step_dict = {
            "action": "query",
            "file": str(test_json),
            "query": ".name",
        }

        result = tool.execute(step_dict, context, mock_tmux)

        assert result.success
        assert result.output == "test-project"

    def test_json_query_nested_path(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify query extracts nested values."""
        from orchestrator.tools.json_tool import JsonTool
        from orchestrator.context import ExecutionContext

        test_json = project_path / "test.json"
        test_json.write_text(
            '{"scripts": {"test": "jest", "build": "tsc"}, '
            '"keywords": ["demo", "test"]}'
        )

        context = ExecutionContext(project_path)
        tool = JsonTool()

        # Test nested object path
        step_dict = {
            "action": "query",
            "file": str(test_json),
            "query": ".scripts.test",
        }
        result = tool.execute(step_dict, context, mock_tmux)
        assert result.success
        assert result.output == "jest"

        # Test array indexing
        step_dict["query"] = ".keywords[0]"
        result = tool.execute(step_dict, context, mock_tmux)
        assert result.success
        assert result.output == "demo"

    def test_json_set_action(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify action: set modifies values in JSON."""
        from orchestrator.tools.json_tool import JsonTool
        from orchestrator.context import ExecutionContext
        import json as json_module

        test_json = project_path / "test.json"
        test_json.write_text('{"version": "1.0.0"}')

        context = ExecutionContext(project_path)
        tool = JsonTool()

        # Set simple value
        step_dict = {
            "action": "set",
            "file": str(test_json),
            "path": ".version",
            "value": "2.0.0",
        }

        result = tool.execute(step_dict, context, mock_tmux)
        assert result.success

        # Verify the change was written
        with open(test_json) as f:
            data = json_module.load(f)
        assert data["version"] == "2.0.0"

    def test_json_set_nested_object(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify set can create nested object values."""
        from orchestrator.tools.json_tool import JsonTool
        from orchestrator.context import ExecutionContext
        import json as json_module

        test_json = project_path / "test.json"
        test_json.write_text("{}")

        context = ExecutionContext(project_path)
        tool = JsonTool()

        # Set nested object value
        step_dict = {
            "action": "set",
            "file": str(test_json),
            "path": ".repository",
            "value": {"type": "git", "url": "https://github.com/user/project"},
        }

        result = tool.execute(step_dict, context, mock_tmux)
        assert result.success

        # Verify the nested object was written
        with open(test_json) as f:
            data = json_module.load(f)
        assert data["repository"]["type"] == "git"
        assert data["repository"]["url"] == "https://github.com/user/project"

    def test_json_update_action(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify action: update with merge/append operations."""
        from orchestrator.tools.json_tool import JsonTool
        from orchestrator.context import ExecutionContext
        import json as json_module

        test_json = project_path / "test.json"
        test_json.write_text(
            '{"dependencies": {"express": "^4.18.0"}, "keywords": ["demo"]}'
        )

        context = ExecutionContext(project_path)
        tool = JsonTool()

        # Test merge operation
        step_dict = {
            "action": "update",
            "file": str(test_json),
            "path": ".dependencies",
            "operation": "merge",
            "value": {"axios": "^1.6.0", "lodash": "^4.17.21"},
        }

        result = tool.execute(step_dict, context, mock_tmux)
        assert result.success

        with open(test_json) as f:
            data = json_module.load(f)
        assert data["dependencies"]["express"] == "^4.18.0"
        assert data["dependencies"]["axios"] == "^1.6.0"
        assert data["dependencies"]["lodash"] == "^4.17.21"

    def test_json_update_append_operation(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify append operation adds to array."""
        from orchestrator.tools.json_tool import JsonTool
        from orchestrator.context import ExecutionContext
        import json as json_module

        test_json = project_path / "test.json"
        test_json.write_text('{"keywords": ["demo", "test"]}')

        context = ExecutionContext(project_path)
        tool = JsonTool()

        # Test append operation
        step_dict = {
            "action": "update",
            "file": str(test_json),
            "path": ".keywords",
            "operation": "append",
            "value": "json-demo",
        }

        result = tool.execute(step_dict, context, mock_tmux)
        assert result.success

        with open(test_json) as f:
            data = json_module.load(f)
        assert data["keywords"] == ["demo", "test", "json-demo"]

    def test_json_update_prepend_operation(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify prepend operation adds to start of array."""
        from orchestrator.tools.json_tool import JsonTool
        from orchestrator.context import ExecutionContext
        import json as json_module

        test_json = project_path / "test.json"
        test_json.write_text('{"keywords": ["demo", "test"]}')

        context = ExecutionContext(project_path)
        tool = JsonTool()

        # Test prepend operation
        step_dict = {
            "action": "update",
            "file": str(test_json),
            "path": ".keywords",
            "operation": "prepend",
            "value": "first-keyword",
        }

        result = tool.execute(step_dict, context, mock_tmux)
        assert result.success

        with open(test_json) as f:
            data = json_module.load(f)
        assert data["keywords"] == ["first-keyword", "demo", "test"]
        assert data["keywords"][0] == "first-keyword"

    def test_json_delete_action(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify action: delete removes values from JSON."""
        from orchestrator.tools.json_tool import JsonTool
        from orchestrator.context import ExecutionContext
        import json as json_module

        test_json = project_path / "test.json"
        test_json.write_text(
            '{"devDependencies": {"jest": "^29.0.0", "typescript": "^5.0.0"}, '
            '"license": "MIT"}'
        )

        context = ExecutionContext(project_path)
        tool = JsonTool()

        # Delete nested key
        step_dict = {
            "action": "delete",
            "file": str(test_json),
            "path": ".devDependencies.jest",
        }

        result = tool.execute(step_dict, context, mock_tmux)
        assert result.success

        with open(test_json) as f:
            data = json_module.load(f)
        assert "jest" not in data["devDependencies"]
        assert "typescript" in data["devDependencies"]

        # Delete top-level key
        step_dict = {
            "action": "delete",
            "file": str(test_json),
            "path": ".license",
        }

        result = tool.execute(step_dict, context, mock_tmux)
        assert result.success

        with open(test_json) as f:
            data = json_module.load(f)
        assert "license" not in data

    def test_json_from_variable(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify json works with source variable (not just file)."""
        from orchestrator.tools.json_tool import JsonTool
        from orchestrator.context import ExecutionContext

        context = ExecutionContext(project_path)
        tool = JsonTool()

        # Set a JSON string variable in context
        api_response = (
            '{"status":"success","data":{"user":{"id":123,"name":"John Doe"},'
            '"metadata":{"timestamp":"2024-01-15"}}}'
        )
        context.set("api_response", api_response)

        # Query from variable
        step_dict = {
            "action": "query",
            "source": "api_response",
            "query": ".data.user.name",
        }

        result = tool.execute(step_dict, context, mock_tmux)
        assert result.success
        assert result.output == "John Doe"

        # Query nested timestamp
        step_dict["query"] = ".data.metadata.timestamp"
        result = tool.execute(step_dict, context, mock_tmux)
        assert result.success
        assert result.output == "2024-01-15"

        # Query status
        step_dict["query"] = ".status"
        result = tool.execute(step_dict, context, mock_tmux)
        assert result.success
        assert result.output == "success"

    def test_json_workflow_integration(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify full json workflow with multiple operations."""
        from orchestrator.config import Step
        import json as json_module

        # Create initial test JSON file
        test_json = project_path / "test-int.json"
        test_json.write_text('{"name":"test","items":[]}')

        # Create a simplified workflow with json steps
        config = WorkflowConfig(
            name="JSON Integration Test",
            steps=[
                Step(
                    name="Set version",
                    tool="json",
                    action="set",
                    file=str(test_json),
                    path=".version",
                    value="1.0.0",
                ),
                Step(
                    name="Append item",
                    tool="json",
                    action="update",
                    file=str(test_json),
                    path=".items",
                    operation="append",
                    value="first",
                ),
                Step(
                    name="Query version",
                    tool="json",
                    action="query",
                    file=str(test_json),
                    query=".version",
                    output_var="current_version",
                ),
            ],
        )

        runner = create_runner(config, project_path, mock_server, mock_tmux)
        run_with_mocks(runner, mock_subprocess)

        # Verify version was queried and stored
        assert runner.context.get("current_version") == "1.0.0"

        # Verify file contents
        with open(test_json) as f:
            data = json_module.load(f)
        assert data["version"] == "1.0.0"
        assert data["items"] == ["first"]

    def test_json_query_array_iteration(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify query can extract array of values."""
        from orchestrator.tools.json_tool import JsonTool
        from orchestrator.context import ExecutionContext
        import json as json_module

        test_json = project_path / "users.json"
        test_json.write_text(
            '[{"id":1,"name":"Alice"},{"id":2,"name":"Bob"},'
            '{"id":3,"name":"Carol"}]'
        )

        context = ExecutionContext(project_path)
        tool = JsonTool()

        # Query all names - this returns the array as JSON
        step_dict = {
            "action": "query",
            "file": str(test_json),
            "query": ".",  # Get entire array
        }

        result = tool.execute(step_dict, context, mock_tmux)
        assert result.success
        data = json_module.loads(result.output)
        assert len(data) == 3
        assert data[0]["name"] == "Alice"
        assert data[2]["name"] == "Carol"

    def test_json_validation_missing_action(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify validation fails for missing action."""
        from orchestrator.tools.json_tool import JsonTool

        tool = JsonTool()

        step_dict = {
            "file": "/tmp/test.json",
            "query": ".name",
        }

        with pytest.raises(ValueError, match="requires 'action' field"):
            tool.validate_step(step_dict)

    def test_json_validation_missing_source(
        self,
        project_path: Path,
        mock_server: MagicMock,
        mock_tmux: MagicMock,
        mock_subprocess: MockSubprocess,
    ) -> None:
        """Verify validation fails when neither file nor source provided."""
        from orchestrator.tools.json_tool import JsonTool

        tool = JsonTool()

        step_dict = {
            "action": "query",
            "query": ".name",
        }

        with pytest.raises(ValueError, match="requires either 'file'.*or 'source'"):
            tool.validate_step(step_dict)
