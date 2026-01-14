"""Comprehensive unit tests for orchestrator/config.py.

This module tests the configuration loading, parsing, and workflow discovery
functionality of the claude-orchestrator project.
"""

from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Optional
from unittest.mock import mock_open, patch

import pytest
import yaml

from orchestrator.config import (
    ClaudeConfig,
    ClaudeSdkConfig,
    OnErrorConfig,
    Step,
    TmuxConfig,
    WorkflowConfig,
    WorkflowInfo,
    _parse_step,
    discover_workflows,
    find_workflow_by_name,
    load_config,
    validate_workflow_file,
)


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def tmp_project(tmp_path: Path) -> Path:
    """Create a temporary project directory with .claude folder."""
    claude_dir = tmp_path / ".claude"
    claude_dir.mkdir()
    return tmp_path


@pytest.fixture
def minimal_workflow_yaml() -> str:
    """Return minimal valid workflow YAML content."""
    return """
type: claude-workflow
version: 2
name: Minimal Workflow
steps:
  - name: step1
    prompt: "Hello"
"""


@pytest.fixture
def full_workflow_yaml() -> str:
    """Return a complete workflow YAML with all configuration options."""
    return """
type: claude-workflow
version: 2
name: Full Workflow
tmux:
  new_window: true
  split: horizontal
  idle_time: 5.0
claude:
  interactive: false
  cwd: /custom/path
  model: claude-3-opus
  dangerously_skip_permissions: true
  allowed_tools:
    - bash
    - edit
claude_sdk:
  system_prompt: "You are a helpful assistant"
  model: opus
steps:
  - name: step1
    tool: bash
    command: echo "Hello"
    output_var: result
    on_error: continue
    visible: true
    cwd: /step/cwd
    when: "{{ condition }}"
    strip_output: false
"""


@pytest.fixture
def step_data_minimal() -> Dict[str, str]:
    """Return minimal step data dictionary."""
    return {"name": "test_step"}


@pytest.fixture
def step_data_full() -> Dict[str, object]:
    """Return complete step data dictionary with all fields."""
    return {
        "name": "full_step",
        "tool": "bash",
        "prompt": "Test prompt",
        "command": "echo test",
        "output_var": "output",
        "on_error": "continue",
        "visible": True,
        "cwd": "/test/cwd",
        "when": "{{ condition }}",
        "target": "target_step",
        "var": "my_var",
        "value": "my_value",
        "strip_output": False,
        "action": "create_issue",
        "team": "engineering",
        "project": "backend",
        "issue_id": "ISSUE-123",
        "title": "Test Issue",
        "description": "Test description",
        "priority": 2,
        "labels": ["bug", "urgent"],
        "status": "in_progress",
        "assignee": "user@example.com",
        "body": "Comment body",
        "skip_blocked": False,
        "filter": {"state": "open"},
        "api_key": "test-api-key",
        "model": "opus",
        "system_prompt": "Custom system prompt",
        "output_type": "boolean",
        "values": ["option1", "option2"],
        "schema": {"type": "object"},
        "max_retries": 5,
        "max_turns": 20,
        "timeout": 120000,
        "verbose": True,
        "source": "items",
        "item_var": "item",
        "index_var": "idx",
        "on_item_error": "continue",
    }


@pytest.fixture
def workflow_with_foreach_yaml() -> str:
    """Return workflow YAML with nested foreach steps."""
    return """
type: claude-workflow
version: 2
name: Foreach Workflow
steps:
  - name: process_items
    tool: foreach
    source: items
    item_var: item
    index_var: idx
    on_item_error: continue
    steps:
      - name: process_single
        tool: claude
        prompt: "Process {{ item }}"
      - name: nested_loop
        tool: foreach
        source: sub_items
        item_var: sub
        steps:
          - name: process_nested
            tool: bash
            command: "echo {{ sub }}"
"""


@pytest.fixture
def multiple_workflows_dir(tmp_project: Path) -> Path:
    """Create a project with multiple workflow files."""
    claude_dir = tmp_project / ".claude"

    # Valid workflow 1
    workflow1 = claude_dir / "build.yml"
    workflow1.write_text("""
type: claude-workflow
version: 2
name: Build Workflow
steps:
  - name: build
    prompt: "Build the project"
""")

    # Valid workflow 2
    workflow2 = claude_dir / "deploy.yaml"
    workflow2.write_text("""
type: claude-workflow
version: 2
name: Deploy Workflow
steps:
  - name: deploy
    prompt: "Deploy the project"
""")

    # Invalid workflow (wrong type)
    invalid1 = claude_dir / "not_workflow.yml"
    invalid1.write_text("""
type: other-type
name: Not a Workflow
""")

    # Invalid workflow (wrong version)
    invalid2 = claude_dir / "old_version.yml"
    invalid2.write_text("""
type: claude-workflow
version: 1
name: Old Version
""")

    # Not a valid YAML
    invalid3 = claude_dir / "broken.yml"
    invalid3.write_text("this: is: broken: yaml: [")

    # Not a dict
    invalid4 = claude_dir / "list.yml"
    invalid4.write_text("- item1\n- item2\n")

    return tmp_project


# =============================================================================
# Tests for _parse_step()
# =============================================================================


class TestParseStep:
    """Tests for the _parse_step function."""

    def test_parse_step_minimal_returns_step_with_defaults(
        self, step_data_minimal: Dict[str, str]
    ) -> None:
        """Test that minimal step data produces correct defaults."""
        step = _parse_step(step_data_minimal)

        assert step.name == "test_step"
        assert step.tool == "claude"
        assert step.prompt is None
        assert step.command is None
        assert step.output_var is None
        assert step.on_error == "stop"
        assert step.visible is False
        assert step.cwd is None
        assert step.when is None
        assert step.strip_output is True
        assert step.max_retries == 3
        assert step.max_turns == 10
        assert step.timeout == 60000
        assert step.verbose is False
        assert step.skip_blocked is True
        assert step.on_item_error == "stop"
        assert step.steps is None

    def test_parse_step_full_returns_all_fields(
        self, step_data_full: Dict[str, object]
    ) -> None:
        """Test that full step data is parsed correctly."""
        step = _parse_step(step_data_full)

        assert step.name == "full_step"
        assert step.tool == "bash"
        assert step.prompt == "Test prompt"
        assert step.command == "echo test"
        assert step.output_var == "output"
        assert step.on_error == "continue"
        assert step.visible is True
        assert step.cwd == "/test/cwd"
        assert step.when == "{{ condition }}"
        assert step.target == "target_step"
        assert step.var == "my_var"
        assert step.value == "my_value"
        assert step.strip_output is False
        # Linear fields
        assert step.action == "create_issue"
        assert step.team == "engineering"
        assert step.project == "backend"
        assert step.issue_id == "ISSUE-123"
        assert step.title == "Test Issue"
        assert step.description == "Test description"
        assert step.priority == 2
        assert step.labels == ["bug", "urgent"]
        assert step.status == "in_progress"
        assert step.assignee == "user@example.com"
        assert step.body == "Comment body"
        assert step.skip_blocked is False
        assert step.filter == {"state": "open"}
        assert step.api_key == "test-api-key"
        # Claude SDK fields
        assert step.model == "opus"
        assert step.system_prompt == "Custom system prompt"
        assert step.output_type == "boolean"
        assert step.values == ["option1", "option2"]
        assert step.schema == {"type": "object"}
        assert step.max_retries == 5
        assert step.max_turns == 20
        assert step.timeout == 120000
        assert step.verbose is True
        # Foreach fields
        assert step.source == "items"
        assert step.item_var == "item"
        assert step.index_var == "idx"
        assert step.on_item_error == "continue"

    def test_parse_step_with_nested_steps_parses_recursively(self) -> None:
        """Test that nested steps (foreach) are parsed recursively."""
        step_data = {
            "name": "parent",
            "tool": "foreach",
            "source": "items",
            "item_var": "item",
            "steps": [
                {"name": "child1", "prompt": "Do something"},
                {"name": "child2", "tool": "bash", "command": "echo hello"},
            ],
        }

        step = _parse_step(step_data)

        assert step.name == "parent"
        assert step.tool == "foreach"
        assert step.steps is not None
        assert len(step.steps) == 2
        assert step.steps[0].name == "child1"
        assert step.steps[0].prompt == "Do something"
        assert step.steps[1].name == "child2"
        assert step.steps[1].tool == "bash"
        assert step.steps[1].command == "echo hello"

    def test_parse_step_with_deeply_nested_steps(self) -> None:
        """Test parsing of deeply nested foreach structures."""
        step_data = {
            "name": "level1",
            "tool": "foreach",
            "source": "list1",
            "steps": [
                {
                    "name": "level2",
                    "tool": "foreach",
                    "source": "list2",
                    "steps": [
                        {
                            "name": "level3",
                            "tool": "foreach",
                            "source": "list3",
                            "steps": [{"name": "deepest", "prompt": "deep"}],
                        }
                    ],
                }
            ],
        }

        step = _parse_step(step_data)

        assert step.name == "level1"
        assert step.steps is not None
        level2 = step.steps[0]
        assert level2.name == "level2"
        assert level2.steps is not None
        level3 = level2.steps[0]
        assert level3.name == "level3"
        assert level3.steps is not None
        deepest = level3.steps[0]
        assert deepest.name == "deepest"
        assert deepest.prompt == "deep"

    def test_parse_step_with_empty_steps_list_returns_none(self) -> None:
        """Test that empty steps list results in None."""
        step_data = {"name": "parent", "steps": []}

        step = _parse_step(step_data)

        assert step.steps is None

    def test_parse_step_labels_as_string(self) -> None:
        """Test that labels can be a string (single label)."""
        step_data = {"name": "test", "labels": "single-label"}

        step = _parse_step(step_data)

        assert step.labels == "single-label"

    def test_parse_step_labels_as_list(self) -> None:
        """Test that labels can be a list of strings."""
        step_data = {"name": "test", "labels": ["label1", "label2"]}

        step = _parse_step(step_data)

        assert step.labels == ["label1", "label2"]


# =============================================================================
# Tests for load_config()
# =============================================================================


class TestLoadConfig:
    """Tests for the load_config function."""

    def test_load_config_with_explicit_workflow_file_loads_correctly(
        self, tmp_project: Path, minimal_workflow_yaml: str
    ) -> None:
        """Test loading config with explicitly specified workflow file."""
        workflow_file = tmp_project / ".claude" / "test.yml"
        workflow_file.write_text(minimal_workflow_yaml)

        config = load_config(tmp_project, workflow_file=workflow_file)

        assert config.name == "Minimal Workflow"
        assert len(config.steps) == 1
        assert config.steps[0].name == "step1"
        assert config.steps[0].prompt == "Hello"

    def test_load_config_legacy_fallback_yml(
        self, tmp_project: Path, minimal_workflow_yaml: str
    ) -> None:
        """Test legacy fallback to workflow.yml."""
        workflow_file = tmp_project / ".claude" / "workflow.yml"
        workflow_file.write_text(minimal_workflow_yaml)

        config = load_config(tmp_project)

        assert config.name == "Minimal Workflow"

    def test_load_config_legacy_fallback_yaml(
        self, tmp_project: Path, minimal_workflow_yaml: str
    ) -> None:
        """Test legacy fallback to workflow.yaml when .yml doesn't exist."""
        workflow_file = tmp_project / ".claude" / "workflow.yaml"
        workflow_file.write_text(minimal_workflow_yaml)

        config = load_config(tmp_project)

        assert config.name == "Minimal Workflow"

    def test_load_config_missing_file_raises_file_not_found(
        self, tmp_project: Path
    ) -> None:
        """Test that missing workflow file raises FileNotFoundError."""
        with pytest.raises(FileNotFoundError) as exc_info:
            load_config(tmp_project)

        assert "Workflow file not found" in str(exc_info.value)

    def test_load_config_explicit_missing_file_raises_file_not_found(
        self, tmp_project: Path
    ) -> None:
        """Test that explicitly specified missing file raises FileNotFoundError."""
        missing_file = tmp_project / "nonexistent.yml"

        with pytest.raises(FileNotFoundError) as exc_info:
            load_config(tmp_project, workflow_file=missing_file)

        assert "Workflow file not found" in str(exc_info.value)

    def test_load_config_full_workflow_parses_all_sections(
        self, tmp_project: Path, full_workflow_yaml: str
    ) -> None:
        """Test that all configuration sections are parsed correctly."""
        workflow_file = tmp_project / ".claude" / "workflow.yml"
        workflow_file.write_text(full_workflow_yaml)

        config = load_config(tmp_project)

        # Check workflow name
        assert config.name == "Full Workflow"

        # Check tmux config
        assert config.tmux.new_window is True
        assert config.tmux.split == "horizontal"
        assert config.tmux.idle_time == 5.0

        # Check claude config
        assert config.claude.interactive is False
        assert config.claude.cwd == "/custom/path"
        assert config.claude.model == "claude-3-opus"
        assert config.claude.dangerously_skip_permissions is True
        assert config.claude.allowed_tools == ["bash", "edit"]

        # Check claude_sdk config
        assert config.claude_sdk.system_prompt == "You are a helpful assistant"
        assert config.claude_sdk.model == "opus"

        # Check step
        assert len(config.steps) == 1
        step = config.steps[0]
        assert step.name == "step1"
        assert step.tool == "bash"
        assert step.command == 'echo "Hello"'
        assert step.output_var == "result"
        assert step.on_error == "continue"
        assert step.visible is True
        assert step.cwd == "/step/cwd"
        assert step.when == "{{ condition }}"
        assert step.strip_output is False

    def test_load_config_defaults_when_sections_missing(
        self, tmp_project: Path
    ) -> None:
        """Test that defaults are applied when optional sections are missing."""
        workflow_content = """
type: claude-workflow
version: 2
steps:
  - name: step1
    prompt: "Test"
"""
        workflow_file = tmp_project / ".claude" / "workflow.yml"
        workflow_file.write_text(workflow_content)

        config = load_config(tmp_project)

        # Check defaults
        assert config.name == "Workflow"
        assert config.tmux.new_window is False
        assert config.tmux.split == "vertical"
        assert config.tmux.idle_time == 3.0
        assert config.claude.interactive is True
        assert config.claude.cwd is None
        assert config.claude.model is None
        assert config.claude.dangerously_skip_permissions is False
        assert config.claude.allowed_tools is None
        assert config.claude_sdk.system_prompt is None
        assert config.claude_sdk.model is None

    def test_load_config_allowed_tools_string_converts_to_list(
        self, tmp_project: Path
    ) -> None:
        """Test that a single allowed_tools string is converted to a list."""
        workflow_content = """
type: claude-workflow
version: 2
name: Test
claude:
  allowed_tools: bash
steps:
  - name: step1
    prompt: "Test"
"""
        workflow_file = tmp_project / ".claude" / "workflow.yml"
        workflow_file.write_text(workflow_content)

        config = load_config(tmp_project)

        assert config.claude.allowed_tools == ["bash"]

    def test_load_config_empty_steps_returns_empty_list(
        self, tmp_project: Path
    ) -> None:
        """Test that empty or missing steps returns empty list."""
        workflow_content = """
type: claude-workflow
version: 2
name: Empty Workflow
"""
        workflow_file = tmp_project / ".claude" / "workflow.yml"
        workflow_file.write_text(workflow_content)

        config = load_config(tmp_project)

        assert config.steps == []

    def test_load_config_with_foreach_nested_steps(
        self, tmp_project: Path, workflow_with_foreach_yaml: str
    ) -> None:
        """Test loading workflow with nested foreach steps."""
        workflow_file = tmp_project / ".claude" / "workflow.yml"
        workflow_file.write_text(workflow_with_foreach_yaml)

        config = load_config(tmp_project)

        assert config.name == "Foreach Workflow"
        assert len(config.steps) == 1

        foreach_step = config.steps[0]
        assert foreach_step.name == "process_items"
        assert foreach_step.tool == "foreach"
        assert foreach_step.source == "items"
        assert foreach_step.item_var == "item"
        assert foreach_step.index_var == "idx"
        assert foreach_step.on_item_error == "continue"
        assert foreach_step.steps is not None
        assert len(foreach_step.steps) == 2

        # Check nested loop
        nested_loop = foreach_step.steps[1]
        assert nested_loop.name == "nested_loop"
        assert nested_loop.tool == "foreach"
        assert nested_loop.steps is not None
        assert len(nested_loop.steps) == 1

    def test_load_config_with_on_error_config(self, tmp_project: Path) -> None:
        """Test loading workflow with on_error configuration."""
        workflow_content = """
type: claude-workflow
version: 2
name: Error Capture Test
on_error:
  capture_context: true
  save_to: ".debug/errors/"
steps:
  - name: step1
    prompt: "Test"
"""
        workflow_file = tmp_project / ".claude" / "workflow.yml"
        workflow_file.write_text(workflow_content)

        config = load_config(tmp_project)

        assert config.on_error.capture_context is True
        assert config.on_error.save_to == ".debug/errors/"

    def test_load_config_on_error_defaults_when_missing(
        self, tmp_project: Path
    ) -> None:
        """Test that on_error defaults are applied when section is missing."""
        workflow_content = """
type: claude-workflow
version: 2
name: No OnError Config
steps:
  - name: step1
    prompt: "Test"
"""
        workflow_file = tmp_project / ".claude" / "workflow.yml"
        workflow_file.write_text(workflow_content)

        config = load_config(tmp_project)

        assert config.on_error.capture_context is False
        assert config.on_error.save_to == ".claude/workflow_debug/"

    def test_load_config_invalid_yaml_raises_yaml_error(
        self, tmp_project: Path
    ) -> None:
        """Test that invalid YAML raises yaml.YAMLError."""
        workflow_content = "this: is: broken: yaml: ["
        workflow_file = tmp_project / ".claude" / "workflow.yml"
        workflow_file.write_text(workflow_content)

        with pytest.raises(yaml.YAMLError):
            load_config(tmp_project)


# =============================================================================
# Tests for discover_workflows()
# =============================================================================


class TestDiscoverWorkflows:
    """Tests for the discover_workflows function."""

    def test_discover_workflows_finds_valid_workflows(
        self, multiple_workflows_dir: Path
    ) -> None:
        """Test that valid workflows are discovered."""
        workflows = discover_workflows(multiple_workflows_dir)

        assert len(workflows) == 2
        names = [w.name for w in workflows]
        assert "Build Workflow" in names
        assert "Deploy Workflow" in names

    def test_discover_workflows_sorted_by_name(
        self, multiple_workflows_dir: Path
    ) -> None:
        """Test that workflows are sorted by name (case-insensitive)."""
        workflows = discover_workflows(multiple_workflows_dir)

        assert workflows[0].name == "Build Workflow"
        assert workflows[1].name == "Deploy Workflow"

    def test_discover_workflows_ignores_invalid_type(
        self, multiple_workflows_dir: Path
    ) -> None:
        """Test that files with wrong type are ignored."""
        workflows = discover_workflows(multiple_workflows_dir)

        names = [w.name for w in workflows]
        assert "Not a Workflow" not in names

    def test_discover_workflows_ignores_invalid_version(
        self, multiple_workflows_dir: Path
    ) -> None:
        """Test that files with wrong version are ignored."""
        workflows = discover_workflows(multiple_workflows_dir)

        names = [w.name for w in workflows]
        assert "Old Version" not in names

    def test_discover_workflows_ignores_broken_yaml(
        self, multiple_workflows_dir: Path
    ) -> None:
        """Test that files with broken YAML are silently ignored."""
        workflows = discover_workflows(multiple_workflows_dir)

        # Should still find the valid workflows
        assert len(workflows) == 2

    def test_discover_workflows_ignores_non_dict_yaml(
        self, multiple_workflows_dir: Path
    ) -> None:
        """Test that YAML files that don't contain a dict are ignored."""
        workflows = discover_workflows(multiple_workflows_dir)

        # Should still find the valid workflows
        assert len(workflows) == 2

    def test_discover_workflows_no_claude_dir_returns_empty(
        self, tmp_path: Path
    ) -> None:
        """Test that missing .claude directory returns empty list."""
        workflows = discover_workflows(tmp_path)

        assert workflows == []

    def test_discover_workflows_empty_claude_dir_returns_empty(
        self, tmp_project: Path
    ) -> None:
        """Test that empty .claude directory returns empty list."""
        workflows = discover_workflows(tmp_project)

        assert workflows == []

    def test_discover_workflows_uses_filename_stem_when_no_name(
        self, tmp_project: Path
    ) -> None:
        """Test that filename stem is used when name field is missing."""
        workflow_content = """
type: claude-workflow
version: 2
steps:
  - name: step1
    prompt: "Test"
"""
        workflow_file = tmp_project / ".claude" / "my_workflow.yml"
        workflow_file.write_text(workflow_content)

        workflows = discover_workflows(tmp_project)

        assert len(workflows) == 1
        assert workflows[0].name == "my_workflow"

    def test_discover_workflows_returns_absolute_paths(
        self, tmp_project: Path, minimal_workflow_yaml: str
    ) -> None:
        """Test that file_path in WorkflowInfo is absolute."""
        workflow_file = tmp_project / ".claude" / "test.yml"
        workflow_file.write_text(minimal_workflow_yaml)

        workflows = discover_workflows(tmp_project)

        assert len(workflows) == 1
        assert workflows[0].file_path.is_absolute()

    def test_discover_workflows_handles_both_yml_and_yaml_extensions(
        self, tmp_project: Path
    ) -> None:
        """Test that both .yml and .yaml extensions are discovered."""
        yml_content = """
type: claude-workflow
version: 2
name: YML Workflow
steps: []
"""
        yaml_content = """
type: claude-workflow
version: 2
name: YAML Workflow
steps: []
"""
        (tmp_project / ".claude" / "test1.yml").write_text(yml_content)
        (tmp_project / ".claude" / "test2.yaml").write_text(yaml_content)

        workflows = discover_workflows(tmp_project)

        assert len(workflows) == 2
        names = [w.name for w in workflows]
        assert "YML Workflow" in names
        assert "YAML Workflow" in names

    def test_discover_workflows_ignores_directories_matching_pattern(
        self, tmp_project: Path, minimal_workflow_yaml: str
    ) -> None:
        """Test that directories with .yml/.yaml names are ignored."""
        # Create a directory with .yml extension (unusual but possible)
        dir_path = tmp_project / ".claude" / "fake.yml"
        dir_path.mkdir()

        # Create a valid workflow file
        workflow_file = tmp_project / ".claude" / "valid.yml"
        workflow_file.write_text(minimal_workflow_yaml)

        workflows = discover_workflows(tmp_project)

        assert len(workflows) == 1
        assert workflows[0].name == "Minimal Workflow"


# =============================================================================
# Tests for validate_workflow_file()
# =============================================================================


class TestValidateWorkflowFile:
    """Tests for the validate_workflow_file function."""

    def test_validate_workflow_file_valid_returns_true(
        self, tmp_project: Path, minimal_workflow_yaml: str
    ) -> None:
        """Test that valid workflow file returns (True, None)."""
        workflow_file = tmp_project / ".claude" / "valid.yml"
        workflow_file.write_text(minimal_workflow_yaml)

        is_valid, error = validate_workflow_file(workflow_file)

        assert is_valid is True
        assert error is None

    def test_validate_workflow_file_not_exists_returns_false(
        self, tmp_project: Path
    ) -> None:
        """Test that non-existent file returns appropriate error."""
        missing_file = tmp_project / "nonexistent.yml"

        is_valid, error = validate_workflow_file(missing_file)

        assert is_valid is False
        assert error is not None
        assert "File not found" in error

    def test_validate_workflow_file_not_a_file_returns_false(
        self, tmp_project: Path
    ) -> None:
        """Test that directory path returns appropriate error."""
        is_valid, error = validate_workflow_file(tmp_project)

        assert is_valid is False
        assert error is not None
        assert "Not a file" in error

    def test_validate_workflow_file_invalid_yaml_returns_false(
        self, tmp_project: Path
    ) -> None:
        """Test that invalid YAML returns appropriate error."""
        invalid_file = tmp_project / ".claude" / "invalid.yml"
        invalid_file.write_text("this: is: broken: [")

        is_valid, error = validate_workflow_file(invalid_file)

        assert is_valid is False
        assert error is not None
        assert "Invalid YAML" in error

    def test_validate_workflow_file_not_dict_returns_false(
        self, tmp_project: Path
    ) -> None:
        """Test that non-dict YAML returns appropriate error."""
        list_file = tmp_project / ".claude" / "list.yml"
        list_file.write_text("- item1\n- item2\n")

        is_valid, error = validate_workflow_file(list_file)

        assert is_valid is False
        assert error is not None
        assert "YAML dictionary" in error

    def test_validate_workflow_file_missing_type_returns_false(
        self, tmp_project: Path
    ) -> None:
        """Test that missing type field returns appropriate error."""
        no_type_file = tmp_project / ".claude" / "no_type.yml"
        no_type_file.write_text("""
version: 2
name: No Type
steps: []
""")

        is_valid, error = validate_workflow_file(no_type_file)

        assert is_valid is False
        assert error is not None
        assert "type" in error

    def test_validate_workflow_file_wrong_type_returns_false(
        self, tmp_project: Path
    ) -> None:
        """Test that wrong type value returns appropriate error."""
        wrong_type_file = tmp_project / ".claude" / "wrong_type.yml"
        wrong_type_file.write_text("""
type: other-workflow
version: 2
name: Wrong Type
steps: []
""")

        is_valid, error = validate_workflow_file(wrong_type_file)

        assert is_valid is False
        assert error is not None
        assert "type" in error
        assert "claude-workflow" in error

    def test_validate_workflow_file_missing_version_returns_false(
        self, tmp_project: Path
    ) -> None:
        """Test that missing version field returns appropriate error."""
        no_version_file = tmp_project / ".claude" / "no_version.yml"
        no_version_file.write_text("""
type: claude-workflow
name: No Version
steps: []
""")

        is_valid, error = validate_workflow_file(no_version_file)

        assert is_valid is False
        assert error is not None
        assert "version" in error

    def test_validate_workflow_file_wrong_version_returns_false(
        self, tmp_project: Path
    ) -> None:
        """Test that wrong version value returns appropriate error."""
        wrong_version_file = tmp_project / ".claude" / "wrong_version.yml"
        wrong_version_file.write_text("""
type: claude-workflow
version: 1
name: Wrong Version
steps: []
""")

        is_valid, error = validate_workflow_file(wrong_version_file)

        assert is_valid is False
        assert error is not None
        assert "version" in error
        assert "2" in error


# =============================================================================
# Tests for find_workflow_by_name()
# =============================================================================


class TestFindWorkflowByName:
    """Tests for the find_workflow_by_name function."""

    @pytest.fixture
    def sample_workflows(self) -> List[WorkflowInfo]:
        """Create sample workflow list for testing."""
        return [
            WorkflowInfo(name="Build Project", file_path=Path("/build.yml")),
            WorkflowInfo(name="Deploy Application", file_path=Path("/deploy.yml")),
            WorkflowInfo(name="Test Suite", file_path=Path("/test.yml")),
            WorkflowInfo(name="Code Review", file_path=Path("/review.yml")),
        ]

    def test_find_workflow_by_name_exact_match(
        self, sample_workflows: List[WorkflowInfo]
    ) -> None:
        """Test exact name match (case-insensitive)."""
        result = find_workflow_by_name(sample_workflows, "Build Project")

        assert result is not None
        assert result.name == "Build Project"

    def test_find_workflow_by_name_exact_match_case_insensitive(
        self, sample_workflows: List[WorkflowInfo]
    ) -> None:
        """Test case-insensitive exact match."""
        result = find_workflow_by_name(sample_workflows, "build project")

        assert result is not None
        assert result.name == "Build Project"

    def test_find_workflow_by_name_exact_match_mixed_case(
        self, sample_workflows: List[WorkflowInfo]
    ) -> None:
        """Test mixed case exact match."""
        result = find_workflow_by_name(sample_workflows, "BUILD PROJECT")

        assert result is not None
        assert result.name == "Build Project"

    def test_find_workflow_by_name_partial_match_single(
        self, sample_workflows: List[WorkflowInfo]
    ) -> None:
        """Test partial match when only one workflow contains the substring."""
        result = find_workflow_by_name(sample_workflows, "Deploy")

        assert result is not None
        assert result.name == "Deploy Application"

    def test_find_workflow_by_name_partial_match_case_insensitive(
        self, sample_workflows: List[WorkflowInfo]
    ) -> None:
        """Test case-insensitive partial match."""
        result = find_workflow_by_name(sample_workflows, "deploy")

        assert result is not None
        assert result.name == "Deploy Application"

    def test_find_workflow_by_name_partial_match_multiple_returns_none(
        self, sample_workflows: List[WorkflowInfo]
    ) -> None:
        """Test that multiple partial matches return None."""
        # Both "Build Project" and "Code Review" contain common letters
        # Let's use a substring that matches multiple
        workflows = [
            WorkflowInfo(name="Build Pipeline", file_path=Path("/build.yml")),
            WorkflowInfo(name="Build Test", file_path=Path("/build_test.yml")),
        ]

        result = find_workflow_by_name(workflows, "Build")

        # Multiple matches, so should return None
        assert result is None

    def test_find_workflow_by_name_no_match_returns_none(
        self, sample_workflows: List[WorkflowInfo]
    ) -> None:
        """Test that no match returns None."""
        result = find_workflow_by_name(sample_workflows, "Nonexistent")

        assert result is None

    def test_find_workflow_by_name_empty_list_returns_none(self) -> None:
        """Test that empty workflow list returns None."""
        result = find_workflow_by_name([], "Any")

        assert result is None

    def test_find_workflow_by_name_exact_match_preferred_over_partial(self) -> None:
        """Test that exact match is preferred over partial match."""
        workflows = [
            WorkflowInfo(name="Build", file_path=Path("/build.yml")),
            WorkflowInfo(name="Build Pipeline", file_path=Path("/build_pipeline.yml")),
        ]

        result = find_workflow_by_name(workflows, "Build")

        assert result is not None
        assert result.name == "Build"


# =============================================================================
# Tests for Dataclass Defaults
# =============================================================================


class TestDataclassDefaults:
    """Tests to verify dataclass default values."""

    def test_tmux_config_defaults(self) -> None:
        """Test TmuxConfig default values."""
        config = TmuxConfig()

        assert config.new_window is False
        assert config.split == "vertical"
        assert config.idle_time == 3.0

    def test_claude_config_defaults(self) -> None:
        """Test ClaudeConfig default values."""
        config = ClaudeConfig()

        assert config.interactive is True
        assert config.cwd is None
        assert config.model is None
        assert config.dangerously_skip_permissions is False
        assert config.allowed_tools is None

    def test_claude_sdk_config_defaults(self) -> None:
        """Test ClaudeSdkConfig default values."""
        config = ClaudeSdkConfig()

        assert config.system_prompt is None
        assert config.model is None

    def test_on_error_config_defaults(self) -> None:
        """Test OnErrorConfig default values."""
        config = OnErrorConfig()

        assert config.capture_context is False
        assert config.save_to == ".claude/workflow_debug/"

    def test_step_defaults(self) -> None:
        """Test Step default values."""
        step = Step(name="test")

        assert step.name == "test"
        assert step.tool == "claude"
        assert step.prompt is None
        assert step.command is None
        assert step.output_var is None
        assert step.on_error == "stop"
        assert step.visible is False
        assert step.cwd is None
        assert step.when is None
        assert step.target is None
        assert step.var is None
        assert step.value is None
        assert step.strip_output is True
        assert step.action is None
        assert step.team is None
        assert step.project is None
        assert step.issue_id is None
        assert step.title is None
        assert step.description is None
        assert step.priority is None
        assert step.labels is None
        assert step.status is None
        assert step.assignee is None
        assert step.body is None
        assert step.skip_blocked is True
        assert step.filter is None
        assert step.api_key is None
        assert step.model is None
        assert step.system_prompt is None
        assert step.output_type is None
        assert step.values is None
        assert step.schema is None
        assert step.max_retries == 3
        assert step.max_turns == 10
        assert step.timeout == 60000
        assert step.verbose is False
        assert step.source is None
        assert step.item_var is None
        assert step.index_var is None
        assert step.on_item_error == "stop"
        assert step.steps is None

    def test_workflow_config_defaults(self) -> None:
        """Test WorkflowConfig default values."""
        config = WorkflowConfig(name="Test", steps=[])

        assert config.name == "Test"
        assert config.steps == []
        assert isinstance(config.tmux, TmuxConfig)
        assert isinstance(config.claude, ClaudeConfig)
        assert isinstance(config.claude_sdk, ClaudeSdkConfig)
        assert isinstance(config.on_error, OnErrorConfig)


# =============================================================================
# Tests for Edge Cases
# =============================================================================


class TestEdgeCases:
    """Tests for edge cases and unusual inputs."""

    def test_load_config_with_null_values_in_yaml(self, tmp_project: Path) -> None:
        """Test handling of explicit null values in YAML."""
        workflow_content = """
type: claude-workflow
version: 2
name: Null Test
claude:
  cwd: null
  model: null
steps:
  - name: step1
    prompt: null
    command: "echo test"
"""
        workflow_file = tmp_project / ".claude" / "workflow.yml"
        workflow_file.write_text(workflow_content)

        config = load_config(tmp_project)

        assert config.claude.cwd is None
        assert config.claude.model is None
        assert config.steps[0].prompt is None

    def test_load_config_with_empty_string_values(self, tmp_project: Path) -> None:
        """Test handling of empty string values in YAML."""
        workflow_content = """
type: claude-workflow
version: 2
name: ""
steps:
  - name: step1
    prompt: ""
"""
        workflow_file = tmp_project / ".claude" / "workflow.yml"
        workflow_file.write_text(workflow_content)

        config = load_config(tmp_project)

        assert config.name == ""
        assert config.steps[0].prompt == ""

    def test_parse_step_with_special_characters_in_name(self) -> None:
        """Test parsing step with special characters in name."""
        step_data = {"name": "step-with-special_chars.123"}

        step = _parse_step(step_data)

        assert step.name == "step-with-special_chars.123"

    def test_parse_step_with_unicode_in_prompt(self) -> None:
        """Test parsing step with unicode characters in prompt."""
        step_data = {"name": "unicode", "prompt": "Process \u2713 \ud83d\ude80 data"}

        step = _parse_step(step_data)

        assert step.prompt == "Process \u2713 \ud83d\ude80 data"

    def test_load_config_with_multiline_prompt(self, tmp_project: Path) -> None:
        """Test loading workflow with multiline prompt string."""
        workflow_content = """
type: claude-workflow
version: 2
name: Multiline Test
steps:
  - name: step1
    prompt: |
      This is a multiline
      prompt with multiple
      lines of text.
"""
        workflow_file = tmp_project / ".claude" / "workflow.yml"
        workflow_file.write_text(workflow_content)

        config = load_config(tmp_project)

        assert "multiline" in config.steps[0].prompt
        assert "\n" in config.steps[0].prompt

    def test_load_config_with_large_number_of_steps(self, tmp_project: Path) -> None:
        """Test loading workflow with many steps."""
        steps_yaml = "\n".join(
            [f"  - name: step{i}\n    prompt: 'Step {i}'" for i in range(100)]
        )
        workflow_content = f"""
type: claude-workflow
version: 2
name: Many Steps
steps:
{steps_yaml}
"""
        workflow_file = tmp_project / ".claude" / "workflow.yml"
        workflow_file.write_text(workflow_content)

        config = load_config(tmp_project)

        assert len(config.steps) == 100
        assert config.steps[0].name == "step0"
        assert config.steps[99].name == "step99"

    def test_workflow_info_with_absolute_path(self) -> None:
        """Test WorkflowInfo stores path correctly."""
        path = Path("/absolute/path/to/workflow.yml")
        info = WorkflowInfo(name="Test", file_path=path)

        assert info.name == "Test"
        assert info.file_path == path

    def test_parse_step_priority_zero(self) -> None:
        """Test that priority can be zero (valid Linear priority)."""
        step_data = {"name": "test", "priority": 0}

        step = _parse_step(step_data)

        assert step.priority == 0

    def test_parse_step_empty_schema(self) -> None:
        """Test parsing step with empty schema dict."""
        step_data = {"name": "test", "schema": {}}

        step = _parse_step(step_data)

        assert step.schema == {}

    def test_parse_step_complex_filter(self) -> None:
        """Test parsing step with complex nested filter."""
        step_data = {
            "name": "test",
            "filter": {
                "and": [
                    {"state": {"name": {"eq": "In Progress"}}},
                    {"priority": {"gte": 2}},
                    {"or": [{"labels": {"name": {"eq": "bug"}}}, {"team": {"key": {"eq": "ENG"}}}]},
                ]
            },
        }

        step = _parse_step(step_data)

        assert step.filter is not None
        assert "and" in step.filter
        assert len(step.filter["and"]) == 3

    def test_discover_workflows_with_symlinks(self, tmp_project: Path) -> None:
        """Test workflow discovery handles symlinks correctly."""
        # Create actual workflow file
        real_workflow = tmp_project / ".claude" / "real.yml"
        real_workflow.write_text("""
type: claude-workflow
version: 2
name: Real Workflow
steps: []
""")

        # Create symlink to it
        symlink = tmp_project / ".claude" / "linked.yml"
        try:
            symlink.symlink_to(real_workflow)
        except OSError:
            pytest.skip("Symlinks not supported on this platform")

        workflows = discover_workflows(tmp_project)

        # Both should be discovered (symlink is a file)
        assert len(workflows) == 2
