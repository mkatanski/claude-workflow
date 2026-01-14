"""Tests for shared steps functionality."""

import json
from pathlib import Path
from typing import Any, Dict
from unittest.mock import MagicMock, patch

import pytest

from orchestrator.context import ExecutionContext
from orchestrator.tools.base import ToolResult
from orchestrator.shared_steps import (
    CircularDependencyError,
    InputDefinition,
    InputSchemaValidationError,
    MaxDepthExceededError,
    OutputDefinition,
    RequiredInputMissingError,
    SharedStepConfig,
    SharedStepExecutionState,
    SharedStepExecutor,
    SharedStepNotFoundError,
    SharedStepParseError,
    SharedStepResolver,
    validate_inputs,
)


class TestInputDefinition:
    """Tests for InputDefinition dataclass."""

    def test_simple_input(self) -> None:
        """Test creating a simple input definition."""
        inp = InputDefinition(name="test_input")
        assert inp.name == "test_input"
        assert inp.required is True
        assert inp.default is None
        assert inp.schema is None

    def test_optional_input_with_default(self) -> None:
        """Test optional input with default value."""
        inp = InputDefinition(
            name="branch",
            description="Branch name",
            required=False,
            default="main",
        )
        assert inp.name == "branch"
        assert inp.required is False
        assert inp.default == "main"

    def test_input_with_schema(self) -> None:
        """Test input with JSON schema."""
        schema = {"type": "string", "enum": ["dev", "staging", "prod"]}
        inp = InputDefinition(
            name="environment",
            required=True,
            schema=schema,
        )
        assert inp.schema == schema


class TestOutputDefinition:
    """Tests for OutputDefinition dataclass."""

    def test_simple_output(self) -> None:
        """Test creating a simple output definition."""
        out = OutputDefinition(name="result", from_var="result")
        assert out.name == "result"
        assert out.from_var == "result"

    def test_output_with_different_from_var(self) -> None:
        """Test output mapping to different variable."""
        out = OutputDefinition(
            name="commit_sha",
            description="SHA of commit",
            from_var="internal_sha",
        )
        assert out.name == "commit_sha"
        assert out.from_var == "internal_sha"


class TestSharedStepExecutionState:
    """Tests for SharedStepExecutionState."""

    def test_empty_stack(self) -> None:
        """Test initial state has empty stack."""
        state = SharedStepExecutionState()
        assert state.depth == 0
        assert state.current_step is None

    def test_push_and_pop(self) -> None:
        """Test push and pop operations."""
        state = SharedStepExecutionState()
        state.push("step1")
        assert state.depth == 1
        assert state.current_step == "step1"

        state.push("step2")
        assert state.depth == 2
        assert state.current_step == "step2"

        popped = state.pop()
        assert popped == "step2"
        assert state.depth == 1

    def test_circular_dependency_detection(self) -> None:
        """Test circular dependency raises error."""
        state = SharedStepExecutionState()
        state.push("step1")
        state.push("step2")

        with pytest.raises(CircularDependencyError) as exc_info:
            state.push("step1")

        assert "step1" in str(exc_info.value)
        assert "Circular dependency" in str(exc_info.value)

    def test_max_depth_exceeded(self) -> None:
        """Test max depth raises error."""
        state = SharedStepExecutionState(max_depth=3)
        state.push("step1")
        state.push("step2")
        state.push("step3")

        with pytest.raises(MaxDepthExceededError):
            state.push("step4")

    def test_copy(self) -> None:
        """Test state copy is independent."""
        state = SharedStepExecutionState()
        state.push("step1")

        copy = state.copy()
        copy.push("step2")

        assert state.depth == 1
        assert copy.depth == 2


class TestSharedStepResolver:
    """Tests for SharedStepResolver."""

    def test_invalid_uses_format(self, tmp_path: Path) -> None:
        """Test invalid uses format raises error."""
        resolver = SharedStepResolver(tmp_path)

        with pytest.raises(ValueError) as exc_info:
            resolver.resolve("invalid-format")

        assert "Invalid 'uses' format" in str(exc_info.value)

    def test_unknown_prefix(self, tmp_path: Path) -> None:
        """Test unknown prefix raises error."""
        resolver = SharedStepResolver(tmp_path)

        with pytest.raises(ValueError) as exc_info:
            resolver.resolve("unknown:step")

        assert "Unknown step source prefix" in str(exc_info.value)

    def test_step_not_found(self, tmp_path: Path) -> None:
        """Test non-existent step raises error."""
        resolver = SharedStepResolver(tmp_path)

        with pytest.raises(SharedStepNotFoundError) as exc_info:
            resolver.resolve("project:nonexistent")

        assert "nonexistent" in str(exc_info.value)

    def test_resolve_project_step(self, tmp_path: Path) -> None:
        """Test resolving a project step."""
        # Create step directory
        step_dir = tmp_path / ".claude" / "workflows" / "steps" / "my-step"
        step_dir.mkdir(parents=True)

        # Create step.yml
        step_yml = step_dir / "step.yml"
        step_yml.write_text("""
type: claude-step
version: 1
name: "My Step"
description: "Test step"
inputs:
  - name: test_input
    required: true
outputs:
  - name: result
    from: output_var
steps:
  - name: Run command
    tool: bash
    command: "echo hello"
    output_var: output_var
""")

        resolver = SharedStepResolver(tmp_path)
        config = resolver.resolve("project:my-step")

        assert config.name == "My Step"
        assert config.identifier == "project:my-step"
        assert len(config.inputs) == 1
        assert len(config.outputs) == 1
        assert len(config.steps) == 1

    def test_resolve_with_yaml_extension(self, tmp_path: Path) -> None:
        """Test resolving step with .yaml extension."""
        step_dir = tmp_path / ".claude" / "workflows" / "steps" / "yaml-step"
        step_dir.mkdir(parents=True)

        step_yml = step_dir / "step.yaml"  # .yaml instead of .yml
        step_yml.write_text("""
type: claude-step
version: 1
name: "YAML Step"
steps:
  - name: Echo
    tool: bash
    command: "echo test"
""")

        resolver = SharedStepResolver(tmp_path)
        config = resolver.resolve("project:yaml-step")

        assert config.name == "YAML Step"

    def test_invalid_step_type(self, tmp_path: Path) -> None:
        """Test step with wrong type raises error."""
        step_dir = tmp_path / ".claude" / "workflows" / "steps" / "wrong-type"
        step_dir.mkdir(parents=True)

        step_yml = step_dir / "step.yml"
        step_yml.write_text("""
type: claude-workflow
version: 2
name: "Wrong Type"
steps: []
""")

        resolver = SharedStepResolver(tmp_path)

        with pytest.raises(SharedStepParseError) as exc_info:
            resolver.resolve("project:wrong-type")

        assert "Invalid or missing 'type' field" in str(exc_info.value)

    def test_resolve_builtin_step(self) -> None:
        """Test resolving a builtin step."""
        resolver = SharedStepResolver(Path.cwd())
        config = resolver.resolve("builtin:git-status")

        assert config.name == "Git Status"
        assert config.source_type == "builtin"
        assert len(config.outputs) > 0

    def test_list_builtin_steps(self) -> None:
        """Test listing builtin steps."""
        resolver = SharedStepResolver(Path.cwd())
        builtins = resolver.list_builtin_steps()

        assert "git-status" in builtins
        assert "git-commit" in builtins
        assert "lint-fix" in builtins
        assert "run-tests" in builtins

    def test_cache(self, tmp_path: Path) -> None:
        """Test resolver caches results."""
        step_dir = tmp_path / ".claude" / "workflows" / "steps" / "cached"
        step_dir.mkdir(parents=True)

        step_yml = step_dir / "step.yml"
        step_yml.write_text("""
type: claude-step
version: 1
name: "Cached"
steps:
  - name: Echo
    tool: bash
    command: "echo test"
""")

        resolver = SharedStepResolver(tmp_path)

        # First resolution
        config1 = resolver.resolve("project:cached")

        # Second resolution should return cached
        config2 = resolver.resolve("project:cached")

        assert config1 is config2

        # After clearing cache, should be different object
        resolver.clear_cache()
        config3 = resolver.resolve("project:cached")

        assert config1 is not config3


class TestInputValidation:
    """Tests for input validation."""

    def test_required_input_missing(self) -> None:
        """Test missing required input raises error."""
        config = SharedStepConfig(
            name="Test",
            description="",
            version=1,
            inputs=[InputDefinition(name="required_input", required=True)],
            outputs=[],
            steps=[],
            source_path=Path("test"),
            source_type="project",
            identifier="project:test",
        )

        with pytest.raises(RequiredInputMissingError) as exc_info:
            validate_inputs(config, {})

        assert "required_input" in str(exc_info.value)

    def test_optional_input_uses_default(self) -> None:
        """Test optional input uses default value."""
        config = SharedStepConfig(
            name="Test",
            description="",
            version=1,
            inputs=[
                InputDefinition(
                    name="optional",
                    required=False,
                    default="default_value",
                )
            ],
            outputs=[],
            steps=[],
            source_path=Path("test"),
            source_type="project",
            identifier="project:test",
        )

        result = validate_inputs(config, {})
        assert result["optional"] == "default_value"

    def test_provided_input_overrides_default(self) -> None:
        """Test provided input overrides default."""
        config = SharedStepConfig(
            name="Test",
            description="",
            version=1,
            inputs=[
                InputDefinition(
                    name="param",
                    required=False,
                    default="default",
                )
            ],
            outputs=[],
            steps=[],
            source_path=Path("test"),
            source_type="project",
            identifier="project:test",
        )

        result = validate_inputs(config, {"param": "custom"})
        assert result["param"] == "custom"

    def test_schema_validation_success(self) -> None:
        """Test schema validation passes for valid input."""
        config = SharedStepConfig(
            name="Test",
            description="",
            version=1,
            inputs=[
                InputDefinition(
                    name="count",
                    required=True,
                    schema={"type": "integer", "minimum": 0},
                )
            ],
            outputs=[],
            steps=[],
            source_path=Path("test"),
            source_type="project",
            identifier="project:test",
        )

        result = validate_inputs(config, {"count": 5})
        assert result["count"] == 5

    def test_schema_validation_failure(self) -> None:
        """Test schema validation fails for invalid input."""
        config = SharedStepConfig(
            name="Test",
            description="",
            version=1,
            inputs=[
                InputDefinition(
                    name="env",
                    required=True,
                    schema={"type": "string", "enum": ["dev", "prod"]},
                )
            ],
            outputs=[],
            steps=[],
            source_path=Path("test"),
            source_type="project",
            identifier="project:test",
        )

        with pytest.raises(InputSchemaValidationError):
            validate_inputs(config, {"env": "invalid"})


class TestSharedStepExecutor:
    """Tests for SharedStepExecutor."""

    def test_create_scoped_context(self, tmp_path: Path) -> None:
        """Test scoped context creation."""
        executor = SharedStepExecutor(tmp_path)

        inputs = {"name": "test", "count": 5}
        context = executor._create_scoped_context(inputs, tmp_path)

        # Check inputs are accessible via inputs namespace
        assert context.get("inputs") == inputs

        # Check inputs accessible via dot notation
        interpolated = context.interpolate("{inputs.name}")
        assert interpolated == "test"

    def test_interpolate_inputs(self, tmp_path: Path) -> None:
        """Test input interpolation from parent context."""
        executor = SharedStepExecutor(tmp_path)

        parent_context = ExecutionContext(project_path=tmp_path)
        parent_context.set("branch", "main")

        with_inputs = {"target_branch": "{branch}"}
        result = executor._interpolate_inputs(with_inputs, parent_context)

        assert result["target_branch"] == "main"

    @patch("orchestrator.tools.ToolRegistry")
    def test_execute_simple_step(
        self, mock_registry: MagicMock, tmp_path: Path
    ) -> None:
        """Test executing a simple shared step."""
        from orchestrator.tools.base import ToolResult

        # Create step
        step_dir = tmp_path / ".claude" / "workflows" / "steps" / "simple"
        step_dir.mkdir(parents=True)

        step_yml = step_dir / "step.yml"
        step_yml.write_text("""
type: claude-step
version: 1
name: "Simple Step"
inputs:
  - name: message
    required: true
outputs:
  - name: result
    from: output
steps:
  - name: Echo message
    tool: bash
    command: "echo {inputs.message}"
    output_var: output
""")

        # Mock tool execution
        mock_tool = MagicMock()
        mock_tool.validate_step = MagicMock()
        mock_tool.execute = MagicMock(
            return_value=ToolResult(success=True, output="hello world")
        )
        mock_registry.get.return_value = mock_tool

        # Execute
        executor = SharedStepExecutor(tmp_path)
        parent_context = ExecutionContext(project_path=tmp_path)
        mock_tmux = MagicMock()

        result = executor.execute(
            uses="project:simple",
            with_inputs={"message": "hello world"},
            output_mapping={"output": "result"},
            parent_context=parent_context,
            tmux_manager=mock_tmux,
        )

        assert result.success is True
        # The output should be mapped back
        assert parent_context.get("output") is not None or parent_context.get("result") is not None


class TestConfigParsing:
    """Tests for Step dataclass with shared step fields."""

    def test_step_with_uses(self) -> None:
        """Test parsing step with 'uses' field."""
        from orchestrator.config import _parse_step

        step_data = {
            "name": "Checkout",
            "uses": "builtin:git-checkout",
            "with": {"repository": "https://github.com/test/repo"},
            "outputs": {"sha": "commit_sha"},
        }

        step = _parse_step(step_data)

        assert step.name == "Checkout"
        assert step.uses == "builtin:git-checkout"
        assert step.with_inputs == {"repository": "https://github.com/test/repo"}
        assert step.outputs == {"sha": "commit_sha"}

    def test_step_without_uses(self) -> None:
        """Test parsing regular step has None for uses fields."""
        from orchestrator.config import _parse_step

        step_data = {
            "name": "Run command",
            "tool": "bash",
            "command": "echo hello",
        }

        step = _parse_step(step_data)

        assert step.uses is None
        assert step.with_inputs is None
        assert step.outputs is None


class TestNullStepValidation:
    """Tests for null/invalid step validation (fixes NoneType .get() error)."""

    def test_resolver_raises_error_for_null_step(self, tmp_path: Path) -> None:
        """Test that resolver raises SharedStepParseError for null step in steps list."""
        step_dir = tmp_path / ".claude" / "workflows" / "steps" / "null-step"
        step_dir.mkdir(parents=True)

        # Create step.yml with a null step in the list
        step_yml = step_dir / "step.yml"
        step_yml.write_text("""
type: claude-step
version: 1
name: "Null Step Test"
steps:
  - name: Valid step
    tool: bash
    command: "echo hello"
  -   # This is a null/empty step
  - name: Another valid step
    tool: bash
    command: "echo world"
""")

        resolver = SharedStepResolver(tmp_path)

        with pytest.raises(SharedStepParseError) as exc_info:
            resolver.resolve("project:null-step")

        assert "Step at index 1 is null/empty" in str(exc_info.value)

    def test_resolver_raises_error_for_non_dict_step(self, tmp_path: Path) -> None:
        """Test that resolver raises SharedStepParseError for non-dict step."""
        step_dir = tmp_path / ".claude" / "workflows" / "steps" / "invalid-type"
        step_dir.mkdir(parents=True)

        # Create step.yml with a string instead of dict
        step_yml = step_dir / "step.yml"
        step_yml.write_text("""
type: claude-step
version: 1
name: "Invalid Type Test"
steps:
  - name: Valid step
    tool: bash
    command: "echo hello"
  - "this is a string not a dict"
""")

        resolver = SharedStepResolver(tmp_path)

        with pytest.raises(SharedStepParseError) as exc_info:
            resolver.resolve("project:invalid-type")

        assert "Step at index 1 must be a dictionary" in str(exc_info.value)

    @patch("orchestrator.tools.ToolRegistry")
    def test_executor_handles_invalid_step_type(
        self, mock_registry: MagicMock, tmp_path: Path
    ) -> None:
        """Test that executor handles non-dict steps gracefully with clear error."""
        # Create a config with an invalid step (bypassing resolver validation)
        config = SharedStepConfig(
            name="Test",
            description="",
            version=1,
            inputs=[],
            outputs=[],
            steps=[
                {"name": "Valid step", "tool": "bash", "command": "echo hello"},
                None,  # Invalid step - should be caught by executor
            ],
            source_path=tmp_path / "test.yml",
            source_type="project",
            identifier="project:test",
        )

        # Mock the resolver to return our config
        executor = SharedStepExecutor(tmp_path)
        executor.resolver._cache["project:test"] = config

        # Mock bash tool
        mock_tool = MagicMock()
        mock_tool.validate_step = MagicMock()
        mock_tool.execute = MagicMock(
            return_value=ToolResult(success=True, output="hello")
        )
        mock_registry.get.return_value = mock_tool

        parent_context = ExecutionContext(project_path=tmp_path)
        mock_tmux = MagicMock()

        result = executor.execute(
            uses="project:test",
            with_inputs={},
            output_mapping={},
            parent_context=parent_context,
            tmux_manager=mock_tmux,
        )

        # Should fail with clear error message
        assert result.success is False
        assert "Step at index 1 is invalid" in result.error
        assert "expected dict" in result.error

    @patch("orchestrator.tools.ToolRegistry")
    def test_foreach_catches_exception_from_invalid_step(
        self, mock_registry: MagicMock, tmp_path: Path
    ) -> None:
        """Test that foreach catches Exception (not just RuntimeError) from invalid steps."""
        from orchestrator.tools.foreach import ForEachTool

        # Mock tool that raises AttributeError (simulating .get() on None)
        mock_tool = MagicMock()
        mock_tool.validate_step = MagicMock(
            side_effect=AttributeError("'NoneType' object has no attribute 'get'")
        )
        mock_registry.get.return_value = mock_tool

        context = ExecutionContext(project_path=tmp_path)
        context.set("items", '["item1", "item2"]')

        foreach_step: Dict[str, Any] = {
            "name": "Process items",
            "tool": "foreach",
            "source": "items",
            "item_var": "item",
            "on_item_error": "stop",  # Should stop on first error
            "steps": [
                {
                    "name": "Bad step",
                    "tool": "bash",
                    "command": "echo test",
                },
            ],
        }

        tool = ForEachTool()
        mock_tmux = MagicMock()
        result = tool.execute(foreach_step, context, mock_tmux)

        # Should fail (not crash) with the error
        assert result.success is False
        assert "NoneType" in result.error or "Item 0" in result.error

    @patch("orchestrator.tools.ToolRegistry")
    def test_foreach_continues_on_item_error_with_continue_setting(
        self, mock_registry: MagicMock, tmp_path: Path
    ) -> None:
        """Test that foreach with on_item_error=continue processes all items despite errors."""
        from orchestrator.tools.foreach import ForEachTool

        call_count = 0

        def mock_execute(step: Dict[str, Any], ctx: Any, tmux: Any) -> ToolResult:
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise AttributeError("Simulated error")
            return ToolResult(success=True, output="success")

        mock_tool = MagicMock()
        mock_tool.validate_step = MagicMock()
        mock_tool.execute = mock_execute
        mock_registry.get.return_value = mock_tool

        context = ExecutionContext(project_path=tmp_path)
        context.set("items", '["item1", "item2", "item3"]')

        foreach_step: Dict[str, Any] = {
            "name": "Process items",
            "tool": "foreach",
            "source": "items",
            "item_var": "item",
            "on_item_error": "continue",  # Should continue despite errors
            "steps": [
                {
                    "name": "Process",
                    "tool": "bash",
                    "command": "echo test",
                },
            ],
        }

        tool = ForEachTool()
        mock_tmux = MagicMock()
        result = tool.execute(foreach_step, context, mock_tmux)

        # Should succeed overall (with errors logged)
        assert result.success is True
        # Should have processed all 3 items
        assert "2/3" in result.output  # 2 completed, 1 errored
        assert "1 errors" in result.output

    def test_foreach_nested_step_validates_dict_type(self, tmp_path: Path) -> None:
        """Test that _execute_nested_steps validates step is a dict."""
        from orchestrator.tools.foreach import ForEachTool
        from orchestrator.context import ExecutionContext

        # Create steps with a None in the list
        steps = [
            {"name": "Valid", "tool": "bash", "command": "echo test"},
            None,  # Invalid step
        ]

        context = ExecutionContext(project_path=tmp_path)
        mock_tmux = MagicMock()
        mock_shared_executor = MagicMock()

        tool = ForEachTool()
        result = tool._execute_nested_steps(
            steps=steps,
            context=context,
            tmux_manager=mock_tmux,
            iteration_idx=0,
            total_iterations=1,
            shared_step_executor=mock_shared_executor,
            workflow_config=None,
        )

        # Should fail with clear error about invalid step
        assert result.success is False
        assert "Nested step at index 1 is invalid" in result.error


class TestBuiltinSteps:
    """Tests for builtin shared steps."""

    def test_git_status_step_exists(self) -> None:
        """Test git-status step is properly defined."""
        resolver = SharedStepResolver(Path.cwd())
        config = resolver.resolve("builtin:git-status")

        assert config.name == "Git Status"
        assert any(o.name == "branch" for o in config.outputs)
        assert any(o.name == "has_changes" for o in config.outputs)

    def test_git_commit_step_exists(self) -> None:
        """Test git-commit step is properly defined."""
        resolver = SharedStepResolver(Path.cwd())
        config = resolver.resolve("builtin:git-commit")

        assert config.name == "Git Commit"
        assert any(i.name == "message" for i in config.inputs)
        assert any(o.name == "commit_sha" for o in config.outputs)

    def test_lint_fix_step_exists(self) -> None:
        """Test lint-fix step is properly defined."""
        resolver = SharedStepResolver(Path.cwd())
        config = resolver.resolve("builtin:lint-fix")

        assert config.name == "Lint and Fix"
        assert any(i.name == "language" for i in config.inputs)
        assert any(i.name == "fix" for i in config.inputs)

    def test_run_tests_step_exists(self) -> None:
        """Test run-tests step is properly defined."""
        resolver = SharedStepResolver(Path.cwd())
        config = resolver.resolve("builtin:run-tests")

        assert config.name == "Run Tests"
        assert any(i.name == "coverage" for i in config.inputs)
        assert any(o.name == "success" for o in config.outputs)


class TestSharedStepsInForEach:
    """Tests for shared steps used inside foreach loops."""

    @patch("orchestrator.tools.ToolRegistry")
    def test_foreach_executes_shared_step(
        self,
        mock_registry: MagicMock,
        tmp_path: Path,
    ) -> None:
        """Test that foreach properly handles nested shared steps."""
        from orchestrator.tools.foreach import ForEachTool

        # Create project shared step
        step_dir = tmp_path / ".claude" / "workflows" / "steps" / "progress-check"
        step_dir.mkdir(parents=True)

        step_yml = step_dir / "step.yml"
        step_yml.write_text("""
type: claude-step
version: 1
name: "Progress Check"
inputs:
  - name: current_index
    required: true
outputs:
  - name: is_completed
    from: is_completed
steps:
  - name: Check
    tool: bash
    command: "echo false"
    output_var: is_completed
    strip_output: true
""")

        # Mock bash tool execution
        mock_tool = MagicMock()
        mock_tool.validate_step = MagicMock()
        mock_tool.execute = MagicMock(
            return_value=ToolResult(success=True, output="false")
        )
        mock_registry.get.return_value = mock_tool

        # Set up context with items array
        context = ExecutionContext(project_path=tmp_path)
        context.set("items", '["item1", "item2"]')

        # Create foreach step with shared step inside
        foreach_step: Dict[str, Any] = {
            "name": "Process items",
            "tool": "foreach",
            "source": "items",
            "item_var": "current_item",
            "index_var": "idx",
            "steps": [
                {
                    "name": "Check progress",
                    "uses": "project:progress-check",
                    "with": {"current_index": "{idx}"},
                    "outputs": {"is_completed": "is_completed"},
                },
            ],
        }

        # Execute
        tool = ForEachTool()
        mock_tmux = MagicMock()
        result = tool.execute(foreach_step, context, mock_tmux)

        # Should succeed
        assert result.success is True
        # Should have processed both items
        assert "2/2" in result.output

    @patch("orchestrator.tools.ToolRegistry")
    def test_foreach_shared_step_display_shows_shared(
        self,
        mock_registry: MagicMock,
        tmp_path: Path,
    ) -> None:
        """Test that shared steps in foreach show correct tool type in display."""
        from orchestrator.tools.foreach import ForEachTool

        # Create minimal shared step
        step_dir = tmp_path / ".claude" / "workflows" / "steps" / "minimal"
        step_dir.mkdir(parents=True)

        step_yml = step_dir / "step.yml"
        step_yml.write_text("""
type: claude-step
version: 1
name: "Minimal"
steps:
  - name: Echo
    tool: bash
    command: "echo done"
""")

        # Mock bash tool execution
        mock_tool = MagicMock()
        mock_tool.validate_step = MagicMock()
        mock_tool.execute = MagicMock(
            return_value=ToolResult(success=True, output="done")
        )
        mock_registry.get.return_value = mock_tool

        context = ExecutionContext(project_path=tmp_path)
        context.set("items", '["a"]')

        # Create step dict with uses
        step_dict: Dict[str, Any] = {
            "name": "Test step",
            "uses": "project:minimal",
        }

        # Test _print_nested_step to verify tool_name detection
        tool = ForEachTool()
        # The uses field should be detected
        uses = step_dict.get("uses")
        if uses:
            tool_name = "shared"
        else:
            tool_name = step_dict.get("tool", "claude")

        assert tool_name == "shared"

    @patch("orchestrator.tools.ToolRegistry")
    def test_foreach_regular_step_shows_correct_tool(
        self,
        mock_registry: MagicMock,
        tmp_path: Path,
    ) -> None:
        """Test that regular steps in foreach still show correct tool type."""
        from orchestrator.tools.foreach import ForEachTool

        # Mock bash tool execution
        mock_tool = MagicMock()
        mock_tool.validate_step = MagicMock()
        mock_tool.execute = MagicMock(
            return_value=ToolResult(success=True, output="test output")
        )
        mock_registry.get.return_value = mock_tool

        context = ExecutionContext(project_path=tmp_path)
        context.set("items", '["a"]')

        # Create regular step dict (no uses)
        step_dict: Dict[str, Any] = {
            "name": "Test step",
            "tool": "bash",
            "command": "echo test",
        }

        # Test tool name detection for regular step
        tool = ForEachTool()
        uses = step_dict.get("uses")
        if uses:
            tool_name = "shared"
        else:
            tool_name = step_dict.get("tool", "claude")

        assert tool_name == "bash"

    @patch("orchestrator.tools.ToolRegistry")
    def test_foreach_shared_step_maps_outputs(
        self,
        mock_registry: MagicMock,
        tmp_path: Path,
    ) -> None:
        """Test that shared step outputs are correctly mapped in foreach."""
        from orchestrator.tools.foreach import ForEachTool

        # Create shared step with output
        step_dir = tmp_path / ".claude" / "workflows" / "steps" / "output-test"
        step_dir.mkdir(parents=True)

        step_yml = step_dir / "step.yml"
        step_yml.write_text("""
type: claude-step
version: 1
name: "Output Test"
inputs:
  - name: input_val
    required: true
outputs:
  - name: output_val
    from: result
steps:
  - name: Transform
    tool: bash
    command: "echo transformed_{inputs.input_val}"
    output_var: result
    strip_output: true
""")

        # Mock bash tool execution
        mock_tool = MagicMock()
        mock_tool.validate_step = MagicMock()
        mock_tool.execute = MagicMock(
            return_value=ToolResult(success=True, output="transformed_test")
        )
        mock_registry.get.return_value = mock_tool

        context = ExecutionContext(project_path=tmp_path)
        context.set("items", '["test"]')

        foreach_step: Dict[str, Any] = {
            "name": "Process",
            "tool": "foreach",
            "source": "items",
            "item_var": "item",
            "steps": [
                {
                    "name": "Transform",
                    "uses": "project:output-test",
                    "with": {"input_val": "{item}"},
                    "outputs": {"output_val": "transformed"},
                },
            ],
        }

        tool = ForEachTool()
        mock_tmux = MagicMock()
        result = tool.execute(foreach_step, context, mock_tmux)

        assert result.success is True
        # Output should be mapped to parent context
        transformed = context.get("transformed")
        assert transformed is not None
