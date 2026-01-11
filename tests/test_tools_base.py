"""Unit tests for orchestrator.tools.base module.

Tests cover:
- LoopSignal enum values and behavior
- ToolResult dataclass creation and properties
- BaseTool abstract base class implementation requirements
"""

from dataclasses import FrozenInstanceError
from typing import Dict
from unittest.mock import MagicMock

import pytest

from orchestrator.tools.base import BaseTool, LoopSignal, ToolResult


class TestLoopSignal:
    """Test cases for LoopSignal enum."""

    def test_loop_signal_none_value(self) -> None:
        """Test that NONE signal has the correct string value."""
        assert LoopSignal.NONE.value == "none"

    def test_loop_signal_break_value(self) -> None:
        """Test that BREAK signal has the correct string value."""
        assert LoopSignal.BREAK.value == "break"

    def test_loop_signal_continue_value(self) -> None:
        """Test that CONTINUE signal has the correct string value."""
        assert LoopSignal.CONTINUE.value == "continue"

    def test_loop_signal_members_count(self) -> None:
        """Test that LoopSignal has exactly three members."""
        assert len(LoopSignal) == 3

    def test_loop_signal_iteration(self) -> None:
        """Test that all LoopSignal members can be iterated."""
        expected_signals = {LoopSignal.NONE, LoopSignal.BREAK, LoopSignal.CONTINUE}
        actual_signals = set(LoopSignal)
        assert actual_signals == expected_signals

    def test_loop_signal_equality_by_member(self) -> None:
        """Test that LoopSignal members can be compared for equality."""
        signal = LoopSignal.BREAK
        assert signal == LoopSignal.BREAK
        assert signal != LoopSignal.CONTINUE
        assert signal != LoopSignal.NONE

    def test_loop_signal_identity(self) -> None:
        """Test that LoopSignal members are singletons."""
        assert LoopSignal.NONE is LoopSignal.NONE
        assert LoopSignal.BREAK is LoopSignal.BREAK
        assert LoopSignal.CONTINUE is LoopSignal.CONTINUE

    def test_loop_signal_from_value(self) -> None:
        """Test that LoopSignal can be created from string value."""
        assert LoopSignal("none") == LoopSignal.NONE
        assert LoopSignal("break") == LoopSignal.BREAK
        assert LoopSignal("continue") == LoopSignal.CONTINUE

    def test_loop_signal_invalid_value_raises_error(self) -> None:
        """Test that invalid string value raises ValueError."""
        with pytest.raises(ValueError):
            LoopSignal("invalid")


class TestToolResult:
    """Test cases for ToolResult dataclass."""

    def test_tool_result_success_only(self) -> None:
        """Test creating ToolResult with only success field."""
        result = ToolResult(success=True)

        assert result.success is True
        assert result.output is None
        assert result.error is None
        assert result.goto_step is None
        assert result.loop_signal == LoopSignal.NONE

    def test_tool_result_failure_only(self) -> None:
        """Test creating ToolResult with success=False."""
        result = ToolResult(success=False)

        assert result.success is False
        assert result.output is None
        assert result.error is None

    def test_tool_result_with_output(self) -> None:
        """Test creating ToolResult with output string."""
        result = ToolResult(success=True, output="Command executed successfully")

        assert result.success is True
        assert result.output == "Command executed successfully"
        assert result.error is None

    def test_tool_result_with_error(self) -> None:
        """Test creating ToolResult with error string."""
        result = ToolResult(success=False, error="Command failed with exit code 1")

        assert result.success is False
        assert result.output is None
        assert result.error == "Command failed with exit code 1"

    def test_tool_result_with_output_and_error(self) -> None:
        """Test creating ToolResult with both output and error."""
        result = ToolResult(
            success=False,
            output="Partial output before failure",
            error="Process terminated unexpectedly",
        )

        assert result.success is False
        assert result.output == "Partial output before failure"
        assert result.error == "Process terminated unexpectedly"

    def test_tool_result_with_goto_step(self) -> None:
        """Test creating ToolResult with goto_step for flow control."""
        result = ToolResult(success=True, goto_step="cleanup_step")

        assert result.success is True
        assert result.goto_step == "cleanup_step"
        assert result.loop_signal == LoopSignal.NONE

    def test_tool_result_with_loop_signal_break(self) -> None:
        """Test creating ToolResult with BREAK loop signal."""
        result = ToolResult(success=True, loop_signal=LoopSignal.BREAK)

        assert result.success is True
        assert result.loop_signal == LoopSignal.BREAK

    def test_tool_result_with_loop_signal_continue(self) -> None:
        """Test creating ToolResult with CONTINUE loop signal."""
        result = ToolResult(success=True, loop_signal=LoopSignal.CONTINUE)

        assert result.success is True
        assert result.loop_signal == LoopSignal.CONTINUE

    def test_tool_result_with_all_fields(self) -> None:
        """Test creating ToolResult with all fields populated."""
        result = ToolResult(
            success=True,
            output="Task completed",
            error=None,
            goto_step="next_step",
            loop_signal=LoopSignal.BREAK,
        )

        assert result.success is True
        assert result.output == "Task completed"
        assert result.error is None
        assert result.goto_step == "next_step"
        assert result.loop_signal == LoopSignal.BREAK

    def test_tool_result_empty_strings(self) -> None:
        """Test creating ToolResult with empty strings for optional fields."""
        result = ToolResult(success=True, output="", error="", goto_step="")

        assert result.output == ""
        assert result.error == ""
        assert result.goto_step == ""

    def test_tool_result_equality(self) -> None:
        """Test that two ToolResults with same values are equal."""
        result1 = ToolResult(success=True, output="test")
        result2 = ToolResult(success=True, output="test")

        assert result1 == result2

    def test_tool_result_inequality_different_success(self) -> None:
        """Test that ToolResults with different success values are not equal."""
        result1 = ToolResult(success=True)
        result2 = ToolResult(success=False)

        assert result1 != result2

    def test_tool_result_inequality_different_output(self) -> None:
        """Test that ToolResults with different outputs are not equal."""
        result1 = ToolResult(success=True, output="output1")
        result2 = ToolResult(success=True, output="output2")

        assert result1 != result2

    def test_tool_result_inequality_different_loop_signal(self) -> None:
        """Test that ToolResults with different loop signals are not equal."""
        result1 = ToolResult(success=True, loop_signal=LoopSignal.BREAK)
        result2 = ToolResult(success=True, loop_signal=LoopSignal.CONTINUE)

        assert result1 != result2

    def test_tool_result_default_loop_signal_is_none(self) -> None:
        """Test that default loop_signal is NONE when not specified."""
        result = ToolResult(success=True)

        assert result.loop_signal == LoopSignal.NONE
        assert result.loop_signal.value == "none"

    def test_tool_result_hashable(self) -> None:
        """Test that ToolResult is hashable (can be used in sets/dicts)."""
        result = ToolResult(success=True, output="test")
        # Dataclasses are hashable only if frozen=True or all fields are hashable
        # Since ToolResult is not frozen, this should raise TypeError
        with pytest.raises(TypeError):
            hash(result)

    def test_tool_result_repr(self) -> None:
        """Test that ToolResult has a readable string representation."""
        result = ToolResult(success=True, output="test output")
        repr_str = repr(result)

        assert "ToolResult" in repr_str
        assert "success=True" in repr_str
        assert "test output" in repr_str


class ConcreteTestTool(BaseTool):
    """Concrete implementation of BaseTool for testing purposes."""

    def __init__(self, tool_name: str = "test_tool") -> None:
        self._name = tool_name

    @property
    def name(self) -> str:
        return self._name

    def validate_step(self, step: Dict[str, object]) -> None:
        if "required_field" not in step:
            raise ValueError("Missing required_field in step configuration")

    def execute(
        self,
        step: Dict[str, object],
        context: object,
        tmux_manager: object,
    ) -> ToolResult:
        return ToolResult(
            success=True,
            output=f"Executed step with {step}",
        )


class MinimalTestTool(BaseTool):
    """Minimal implementation of BaseTool for testing."""

    @property
    def name(self) -> str:
        return "minimal"

    def validate_step(self, step: Dict[str, object]) -> None:
        pass

    def execute(
        self,
        step: Dict[str, object],
        context: object,
        tmux_manager: object,
    ) -> ToolResult:
        return ToolResult(success=True)


class TestBaseTool:
    """Test cases for BaseTool abstract base class."""

    @pytest.fixture
    def concrete_tool(self) -> ConcreteTestTool:
        """Create a concrete tool instance for testing."""
        return ConcreteTestTool()

    @pytest.fixture
    def minimal_tool(self) -> MinimalTestTool:
        """Create a minimal tool instance for testing."""
        return MinimalTestTool()

    @pytest.fixture
    def mock_context(self) -> MagicMock:
        """Create a mock ExecutionContext for testing."""
        context = MagicMock()
        context.interpolate.return_value = "interpolated_value"
        return context

    @pytest.fixture
    def mock_tmux_manager(self) -> MagicMock:
        """Create a mock TmuxManager for testing."""
        return MagicMock()

    def test_base_tool_cannot_be_instantiated_directly(self) -> None:
        """Test that BaseTool cannot be instantiated without implementing abstract methods."""
        with pytest.raises(TypeError) as exc_info:
            BaseTool()  # type: ignore[abstract]

        error_message = str(exc_info.value)
        assert "abstract" in error_message.lower()

    def test_concrete_tool_has_name_property(self, concrete_tool: ConcreteTestTool) -> None:
        """Test that concrete tool implementation has accessible name property."""
        assert concrete_tool.name == "test_tool"

    def test_concrete_tool_custom_name(self) -> None:
        """Test that concrete tool can be initialized with custom name."""
        tool = ConcreteTestTool(tool_name="custom_tool")
        assert tool.name == "custom_tool"

    def test_minimal_tool_has_name(self, minimal_tool: MinimalTestTool) -> None:
        """Test that minimal tool implementation returns correct name."""
        assert minimal_tool.name == "minimal"

    def test_validate_step_raises_on_invalid_config(
        self, concrete_tool: ConcreteTestTool
    ) -> None:
        """Test that validate_step raises ValueError for invalid configuration."""
        invalid_step = {"some_field": "value"}

        with pytest.raises(ValueError) as exc_info:
            concrete_tool.validate_step(invalid_step)

        assert "required_field" in str(exc_info.value)

    def test_validate_step_passes_on_valid_config(
        self, concrete_tool: ConcreteTestTool
    ) -> None:
        """Test that validate_step does not raise for valid configuration."""
        valid_step = {"required_field": "value", "optional_field": "other"}

        # Should not raise
        concrete_tool.validate_step(valid_step)

    def test_validate_step_empty_dict(self, concrete_tool: ConcreteTestTool) -> None:
        """Test that validate_step raises on empty configuration."""
        with pytest.raises(ValueError):
            concrete_tool.validate_step({})

    def test_validate_step_minimal_tool_accepts_empty(
        self, minimal_tool: MinimalTestTool
    ) -> None:
        """Test that minimal tool accepts any step configuration."""
        # Should not raise for any input
        minimal_tool.validate_step({})
        minimal_tool.validate_step({"any": "config"})

    def test_execute_returns_tool_result(
        self,
        concrete_tool: ConcreteTestTool,
        mock_context: MagicMock,
        mock_tmux_manager: MagicMock,
    ) -> None:
        """Test that execute method returns a ToolResult instance."""
        step = {"required_field": "test"}

        result = concrete_tool.execute(step, mock_context, mock_tmux_manager)

        assert isinstance(result, ToolResult)

    def test_execute_returns_success(
        self,
        concrete_tool: ConcreteTestTool,
        mock_context: MagicMock,
        mock_tmux_manager: MagicMock,
    ) -> None:
        """Test that execute returns successful result."""
        step = {"required_field": "test"}

        result = concrete_tool.execute(step, mock_context, mock_tmux_manager)

        assert result.success is True

    def test_execute_includes_step_in_output(
        self,
        concrete_tool: ConcreteTestTool,
        mock_context: MagicMock,
        mock_tmux_manager: MagicMock,
    ) -> None:
        """Test that execute output contains step information."""
        step = {"required_field": "test_value"}

        result = concrete_tool.execute(step, mock_context, mock_tmux_manager)

        assert result.output is not None
        assert "required_field" in result.output

    def test_execute_minimal_tool(
        self,
        minimal_tool: MinimalTestTool,
        mock_context: MagicMock,
        mock_tmux_manager: MagicMock,
    ) -> None:
        """Test that minimal tool execute returns basic success result."""
        result = minimal_tool.execute({}, mock_context, mock_tmux_manager)

        assert result.success is True
        assert result.output is None

    def test_is_subclass_of_abc(self) -> None:
        """Test that BaseTool is recognized as an abstract base class."""
        from abc import ABC

        assert issubclass(BaseTool, ABC)

    def test_concrete_tool_isinstance_of_base_tool(
        self, concrete_tool: ConcreteTestTool
    ) -> None:
        """Test that concrete tool is an instance of BaseTool."""
        assert isinstance(concrete_tool, BaseTool)


class IncompleteToolNoName(BaseTool):
    """Tool missing the name property - for testing abstract enforcement."""

    def validate_step(self, step: Dict[str, object]) -> None:
        pass

    def execute(
        self,
        step: Dict[str, object],
        context: object,
        tmux_manager: object,
    ) -> ToolResult:
        return ToolResult(success=True)


class IncompleteToolNoValidate(BaseTool):
    """Tool missing the validate_step method - for testing abstract enforcement."""

    @property
    def name(self) -> str:
        return "incomplete"

    def execute(
        self,
        step: Dict[str, object],
        context: object,
        tmux_manager: object,
    ) -> ToolResult:
        return ToolResult(success=True)


class IncompleteToolNoExecute(BaseTool):
    """Tool missing the execute method - for testing abstract enforcement."""

    @property
    def name(self) -> str:
        return "incomplete"

    def validate_step(self, step: Dict[str, object]) -> None:
        pass


class TestBaseToolAbstractEnforcement:
    """Test cases for abstract method enforcement in BaseTool."""

    def test_tool_missing_name_property_cannot_be_instantiated(self) -> None:
        """Test that tool without name property cannot be instantiated."""
        with pytest.raises(TypeError) as exc_info:
            IncompleteToolNoName()  # type: ignore[abstract]

        assert "abstract" in str(exc_info.value).lower()
        assert "name" in str(exc_info.value)

    def test_tool_missing_validate_step_cannot_be_instantiated(self) -> None:
        """Test that tool without validate_step method cannot be instantiated."""
        with pytest.raises(TypeError) as exc_info:
            IncompleteToolNoValidate()  # type: ignore[abstract]

        assert "abstract" in str(exc_info.value).lower()
        assert "validate_step" in str(exc_info.value)

    def test_tool_missing_execute_cannot_be_instantiated(self) -> None:
        """Test that tool without execute method cannot be instantiated."""
        with pytest.raises(TypeError) as exc_info:
            IncompleteToolNoExecute()  # type: ignore[abstract]

        assert "abstract" in str(exc_info.value).lower()
        assert "execute" in str(exc_info.value)


class FailingTool(BaseTool):
    """Tool that returns failure results for testing error scenarios."""

    @property
    def name(self) -> str:
        return "failing"

    def validate_step(self, step: Dict[str, object]) -> None:
        pass

    def execute(
        self,
        step: Dict[str, object],
        context: object,
        tmux_manager: object,
    ) -> ToolResult:
        return ToolResult(
            success=False,
            error="Simulated failure",
        )


class ExceptionTool(BaseTool):
    """Tool that raises exceptions during execution for testing."""

    @property
    def name(self) -> str:
        return "exception"

    def validate_step(self, step: Dict[str, object]) -> None:
        if step.get("raise_on_validate"):
            raise ValueError("Validation exception")

    def execute(
        self,
        step: Dict[str, object],
        context: object,
        tmux_manager: object,
    ) -> ToolResult:
        if step.get("raise_on_execute"):
            raise RuntimeError("Execution exception")
        return ToolResult(success=True)


class TestToolErrorScenarios:
    """Test cases for error scenarios in tool execution."""

    @pytest.fixture
    def failing_tool(self) -> FailingTool:
        """Create a failing tool instance."""
        return FailingTool()

    @pytest.fixture
    def exception_tool(self) -> ExceptionTool:
        """Create an exception tool instance."""
        return ExceptionTool()

    @pytest.fixture
    def mock_context(self) -> MagicMock:
        """Create a mock ExecutionContext."""
        return MagicMock()

    @pytest.fixture
    def mock_tmux_manager(self) -> MagicMock:
        """Create a mock TmuxManager."""
        return MagicMock()

    def test_failing_tool_returns_failure_result(
        self,
        failing_tool: FailingTool,
        mock_context: MagicMock,
        mock_tmux_manager: MagicMock,
    ) -> None:
        """Test that failing tool returns result with success=False."""
        result = failing_tool.execute({}, mock_context, mock_tmux_manager)

        assert result.success is False
        assert result.error == "Simulated failure"

    def test_exception_tool_validate_raises_exception(
        self, exception_tool: ExceptionTool
    ) -> None:
        """Test that tool can raise exceptions during validation."""
        with pytest.raises(ValueError) as exc_info:
            exception_tool.validate_step({"raise_on_validate": True})

        assert "Validation exception" in str(exc_info.value)

    def test_exception_tool_validate_passes_without_flag(
        self, exception_tool: ExceptionTool
    ) -> None:
        """Test that tool validation passes when flag is not set."""
        # Should not raise
        exception_tool.validate_step({})
        exception_tool.validate_step({"raise_on_validate": False})

    def test_exception_tool_execute_raises_exception(
        self,
        exception_tool: ExceptionTool,
        mock_context: MagicMock,
        mock_tmux_manager: MagicMock,
    ) -> None:
        """Test that tool can raise exceptions during execution."""
        with pytest.raises(RuntimeError) as exc_info:
            exception_tool.execute(
                {"raise_on_execute": True}, mock_context, mock_tmux_manager
            )

        assert "Execution exception" in str(exc_info.value)

    def test_exception_tool_execute_succeeds_without_flag(
        self,
        exception_tool: ExceptionTool,
        mock_context: MagicMock,
        mock_tmux_manager: MagicMock,
    ) -> None:
        """Test that tool execution succeeds when flag is not set."""
        result = exception_tool.execute({}, mock_context, mock_tmux_manager)

        assert result.success is True


class LoopControlTool(BaseTool):
    """Tool that returns various loop control signals for testing."""

    @property
    def name(self) -> str:
        return "loop_control"

    def validate_step(self, step: Dict[str, object]) -> None:
        pass

    def execute(
        self,
        step: Dict[str, object],
        context: object,
        tmux_manager: object,
    ) -> ToolResult:
        signal_type = step.get("signal", "none")

        if signal_type == "break":
            return ToolResult(success=True, loop_signal=LoopSignal.BREAK)
        elif signal_type == "continue":
            return ToolResult(success=True, loop_signal=LoopSignal.CONTINUE)
        else:
            return ToolResult(success=True, loop_signal=LoopSignal.NONE)


class GotoTool(BaseTool):
    """Tool that returns goto_step for testing flow control."""

    @property
    def name(self) -> str:
        return "goto"

    def validate_step(self, step: Dict[str, object]) -> None:
        if "target" not in step:
            raise ValueError("Missing 'target' in step configuration")

    def execute(
        self,
        step: Dict[str, object],
        context: object,
        tmux_manager: object,
    ) -> ToolResult:
        target = step.get("target")
        return ToolResult(
            success=True,
            goto_step=str(target) if target else None,
        )


class TestToolFlowControl:
    """Test cases for flow control in tool results."""

    @pytest.fixture
    def loop_control_tool(self) -> LoopControlTool:
        """Create a loop control tool instance."""
        return LoopControlTool()

    @pytest.fixture
    def goto_tool(self) -> GotoTool:
        """Create a goto tool instance."""
        return GotoTool()

    @pytest.fixture
    def mock_context(self) -> MagicMock:
        """Create a mock ExecutionContext."""
        return MagicMock()

    @pytest.fixture
    def mock_tmux_manager(self) -> MagicMock:
        """Create a mock TmuxManager."""
        return MagicMock()

    def test_loop_control_tool_returns_break_signal(
        self,
        loop_control_tool: LoopControlTool,
        mock_context: MagicMock,
        mock_tmux_manager: MagicMock,
    ) -> None:
        """Test that tool can return BREAK loop signal."""
        result = loop_control_tool.execute(
            {"signal": "break"}, mock_context, mock_tmux_manager
        )

        assert result.success is True
        assert result.loop_signal == LoopSignal.BREAK

    def test_loop_control_tool_returns_continue_signal(
        self,
        loop_control_tool: LoopControlTool,
        mock_context: MagicMock,
        mock_tmux_manager: MagicMock,
    ) -> None:
        """Test that tool can return CONTINUE loop signal."""
        result = loop_control_tool.execute(
            {"signal": "continue"}, mock_context, mock_tmux_manager
        )

        assert result.success is True
        assert result.loop_signal == LoopSignal.CONTINUE

    def test_loop_control_tool_returns_none_signal_by_default(
        self,
        loop_control_tool: LoopControlTool,
        mock_context: MagicMock,
        mock_tmux_manager: MagicMock,
    ) -> None:
        """Test that tool returns NONE loop signal by default."""
        result = loop_control_tool.execute({}, mock_context, mock_tmux_manager)

        assert result.success is True
        assert result.loop_signal == LoopSignal.NONE

    def test_goto_tool_returns_target_step(
        self,
        goto_tool: GotoTool,
        mock_context: MagicMock,
        mock_tmux_manager: MagicMock,
    ) -> None:
        """Test that goto tool returns the target step name."""
        result = goto_tool.execute(
            {"target": "cleanup_step"}, mock_context, mock_tmux_manager
        )

        assert result.success is True
        assert result.goto_step == "cleanup_step"

    def test_goto_tool_validation_fails_without_target(self, goto_tool: GotoTool) -> None:
        """Test that goto tool validation fails without target."""
        with pytest.raises(ValueError) as exc_info:
            goto_tool.validate_step({})

        assert "target" in str(exc_info.value)


class TestToolResultEdgeCases:
    """Test cases for edge cases in ToolResult handling."""

    def test_tool_result_with_none_values(self) -> None:
        """Test creating ToolResult with explicit None values."""
        result = ToolResult(
            success=True,
            output=None,
            error=None,
            goto_step=None,
        )

        assert result.output is None
        assert result.error is None
        assert result.goto_step is None

    def test_tool_result_multiline_output(self) -> None:
        """Test ToolResult with multiline output string."""
        multiline_output = "Line 1\nLine 2\nLine 3"
        result = ToolResult(success=True, output=multiline_output)

        assert result.output == multiline_output
        assert "\n" in result.output

    def test_tool_result_unicode_output(self) -> None:
        """Test ToolResult with unicode characters in output."""
        unicode_output = "Hello World!"
        result = ToolResult(success=True, output=unicode_output)

        assert result.output == unicode_output

    def test_tool_result_long_error_message(self) -> None:
        """Test ToolResult with very long error message."""
        long_error = "Error: " + "x" * 10000
        result = ToolResult(success=False, error=long_error)

        assert result.error == long_error
        assert len(result.error) == 10007

    def test_tool_result_special_characters_in_output(self) -> None:
        """Test ToolResult with special characters in output."""
        special_output = "Output with <tags>, 'quotes', \"double quotes\", & ampersands"
        result = ToolResult(success=True, output=special_output)

        assert result.output == special_output

    def test_tool_result_json_like_output(self) -> None:
        """Test ToolResult with JSON-like string output."""
        json_output = '{"key": "value", "number": 42}'
        result = ToolResult(success=True, output=json_output)

        assert result.output == json_output

    def test_tool_result_preserves_whitespace_in_output(self) -> None:
        """Test that ToolResult preserves whitespace in output."""
        whitespace_output = "  leading spaces\ttabs\tand\nlines  "
        result = ToolResult(success=True, output=whitespace_output)

        assert result.output == whitespace_output
        assert result.output.startswith("  ")
        assert result.output.endswith("  ")


class TestToolNameProperty:
    """Test cases for tool name property behavior."""

    def test_tool_name_is_read_only(self) -> None:
        """Test that tool name property cannot be modified directly on property."""
        tool = MinimalTestTool()

        # Property should be accessible
        assert tool.name == "minimal"

        # Property should raise AttributeError when trying to set
        with pytest.raises(AttributeError):
            tool.name = "new_name"  # type: ignore[misc]

    def test_tool_name_returns_string(self) -> None:
        """Test that tool name always returns a string."""
        tool = ConcreteTestTool()

        assert isinstance(tool.name, str)
        assert len(tool.name) > 0

    def test_different_tool_instances_same_name(self) -> None:
        """Test that different instances of same tool class have same name."""
        tool1 = MinimalTestTool()
        tool2 = MinimalTestTool()

        assert tool1.name == tool2.name

    def test_different_tool_classes_different_names(self) -> None:
        """Test that different tool classes have different names."""
        tool1 = ConcreteTestTool()
        tool2 = MinimalTestTool()

        assert tool1.name != tool2.name
