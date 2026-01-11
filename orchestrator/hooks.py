"""Hook detection and installation for Claude orchestrator.

This module provides functionality to check if curl-based hooks are configured
in Claude settings, and to install or update them if needed.
"""

import json
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Any, Optional

import questionary

from .config import WorkflowConfig
from .display import ICONS, console


# Identifier used to recognize our hooks (present in all our hook commands)
ORCHESTRATOR_HOOK_IDENTIFIER = "$ORCHESTRATOR_PORT"

# Expected hook commands - these are the current correct versions
EXPECTED_STOP_COMMAND = (
    "curl -s -X POST "
    '"http://localhost:$ORCHESTRATOR_PORT/complete" '
    '--data-urlencode "pane=$TMUX_PANE" '
    "2>/dev/null || true"
)

EXPECTED_SESSION_END_COMMAND = (
    "curl -s -X POST "
    '"http://localhost:$ORCHESTRATOR_PORT/exited" '
    '--data-urlencode "pane=$TMUX_PANE" '
    "2>/dev/null || true"
)

# Hook configuration that uses environment variable for port
# Uses --data-urlencode to properly handle tmux pane IDs (which start with %)
HOOK_CONFIG = {
    "hooks": {
        "Stop": [
            {
                "matcher": "",
                "hooks": [
                    {
                        "type": "command",
                        "command": EXPECTED_STOP_COMMAND,
                    }
                ],
            }
        ],
        "SessionEnd": [
            {
                "matcher": "",
                "hooks": [
                    {
                        "type": "command",
                        "command": EXPECTED_SESSION_END_COMMAND,
                    }
                ],
            }
        ],
    }
}


class HookStatus(Enum):
    """Status of orchestrator hooks in settings."""

    MISSING = "missing"  # No orchestrator hooks found
    OUTDATED = "outdated"  # Hooks found but don't match current expected commands
    CURRENT = "current"  # Hooks are up-to-date


@dataclass
class HookCheckResult:
    """Result of checking hook configuration."""

    status: HookStatus
    settings_path: Optional[Path] = None  # Path where hooks were found (if any)


def _find_orchestrator_hooks(
    hook_list: list[dict[str, Any]],
) -> list[tuple[int, int, dict[str, Any]]]:
    """Find all orchestrator hooks in a hook list.

    Args:
        hook_list: List of hook groups from settings

    Returns:
        List of tuples (group_index, hook_index, hook_dict) for orchestrator hooks
    """
    found = []
    for group_idx, hook_group in enumerate(hook_list):
        for hook_idx, hook in enumerate(hook_group.get("hooks", [])):
            if (
                hook.get("type") == "command"
                and ORCHESTRATOR_HOOK_IDENTIFIER in hook.get("command", "")
            ):
                found.append((group_idx, hook_idx, hook))
    return found


def _check_hook_status(
    settings: dict[str, Any], hook_name: str, expected_command: str
) -> HookStatus:
    """Check the status of a specific hook type.

    Args:
        settings: Parsed settings.json content
        hook_name: Name of the hook (e.g., "Stop", "SessionEnd")
        expected_command: The expected hook command

    Returns:
        HookStatus indicating if hook is missing, outdated, or current
    """
    hook_list = settings.get("hooks", {}).get(hook_name, [])
    orchestrator_hooks = _find_orchestrator_hooks(hook_list)

    if not orchestrator_hooks:
        return HookStatus.MISSING

    # Check if any orchestrator hook matches the expected command
    for _, _, hook in orchestrator_hooks:
        if hook.get("command", "").strip() == expected_command.strip():
            return HookStatus.CURRENT

    # Hooks exist but don't match expected command
    return HookStatus.OUTDATED


def check_hooks_status(project_path: Optional[Path] = None) -> HookCheckResult:
    """Check the status of orchestrator hooks in settings.

    Checks both global (~/.claude/settings.json) and project-level
    (<project>/.claude/settings.json) settings. Returns the status from
    whichever file contains orchestrator hooks (project takes priority).

    Args:
        project_path: Optional path to the project directory

    Returns:
        HookCheckResult with status and path where hooks were found
    """
    settings_paths = [Path.home() / ".claude" / "settings.json"]
    if project_path:
        settings_paths.insert(0, project_path / ".claude" / "settings.json")

    for settings_path in settings_paths:
        if not settings_path.exists():
            continue

        try:
            with open(settings_path, "r") as f:
                settings = json.load(f)

            stop_status = _check_hook_status(
                settings, "Stop", EXPECTED_STOP_COMMAND
            )
            session_end_status = _check_hook_status(
                settings, "SessionEnd", EXPECTED_SESSION_END_COMMAND
            )

            # If both hooks are current, we're good
            if (
                stop_status == HookStatus.CURRENT
                and session_end_status == HookStatus.CURRENT
            ):
                return HookCheckResult(HookStatus.CURRENT, settings_path)

            # If any hook exists (even outdated), report from this file
            if (
                stop_status != HookStatus.MISSING
                or session_end_status != HookStatus.MISSING
            ):
                # At least one hook exists but not both are current
                if (
                    stop_status == HookStatus.OUTDATED
                    or session_end_status == HookStatus.OUTDATED
                ):
                    return HookCheckResult(HookStatus.OUTDATED, settings_path)
                # One is current, one is missing - treat as outdated
                return HookCheckResult(HookStatus.OUTDATED, settings_path)

        except (json.JSONDecodeError, KeyError):
            continue

    return HookCheckResult(HookStatus.MISSING, None)


def check_curl_hooks_configured(project_path: Optional[Path] = None) -> bool:
    """Check if curl-based hooks are properly configured and up-to-date.

    This is a convenience wrapper around check_hooks_status for simple checks.

    Args:
        project_path: Optional path to the project directory

    Returns:
        True only if hooks are configured AND up-to-date
    """
    result = check_hooks_status(project_path)
    return result.status == HookStatus.CURRENT


def generate_hook_config() -> dict[str, Any]:
    """Generate the required hook configuration.

    Returns:
        Dictionary with the hook configuration
    """
    return HOOK_CONFIG.copy()


def _remove_orchestrator_hooks(hook_list: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Remove all orchestrator hooks from a hook list, preserving user hooks.

    Args:
        hook_list: List of hook groups from settings

    Returns:
        New list with orchestrator hooks removed (empty groups are also removed)
    """
    result = []
    for hook_group in hook_list:
        # Filter out orchestrator hooks from this group
        filtered_hooks = [
            hook
            for hook in hook_group.get("hooks", [])
            if not (
                hook.get("type") == "command"
                and ORCHESTRATOR_HOOK_IDENTIFIER in hook.get("command", "")
            )
        ]

        # Only keep the group if it still has hooks
        if filtered_hooks:
            new_group = hook_group.copy()
            new_group["hooks"] = filtered_hooks
            result.append(new_group)

    return result


def install_hooks(settings_path: Path, update: bool = False) -> bool:
    """Install, update, or merge hooks into settings.json.

    If the file doesn't exist, creates it with just the hooks.
    If it exists and update=False, adds hooks to the existing configuration.
    If it exists and update=True, removes old orchestrator hooks first,
    then adds the new ones (preserves user's other hooks).

    Args:
        settings_path: Path to the settings.json file
        update: If True, remove outdated orchestrator hooks before installing

    Returns:
        True if installation succeeded
    """
    try:
        # Ensure parent directory exists
        settings_path.parent.mkdir(parents=True, exist_ok=True)

        # Load existing settings or start fresh
        if settings_path.exists():
            with open(settings_path, "r") as f:
                settings = json.load(f)
        else:
            settings = {}

        # Initialize hooks section if needed
        if "hooks" not in settings:
            settings["hooks"] = {}

        # If updating, remove old orchestrator hooks first
        if update:
            for hook_name in HOOK_CONFIG["hooks"].keys():
                if hook_name in settings["hooks"]:
                    settings["hooks"][hook_name] = _remove_orchestrator_hooks(
                        settings["hooks"][hook_name]
                    )

        # Add new hooks
        for hook_name, hook_config in HOOK_CONFIG["hooks"].items():
            if hook_name not in settings["hooks"]:
                settings["hooks"][hook_name] = []
            # Add our hooks to the existing list
            settings["hooks"][hook_name].extend(hook_config)

        # Write back
        with open(settings_path, "w") as f:
            json.dump(settings, f, indent=2)

        return True

    except Exception as e:
        console.print(f"[red]Failed to install hooks: {e}[/red]")
        return False


def prompt_hook_installation(project_path: Path) -> Optional[Path]:
    """Ask user where to install hooks: global or project-level.

    Args:
        project_path: Path to the project directory

    Returns:
        Path to the settings file to use, or None if cancelled
    """
    global_path = Path.home() / ".claude" / "settings.json"
    project_settings_path = project_path / ".claude" / "settings.json"

    console.print()
    console.print(
        f"[bold yellow]{ICONS['warning']} Claude hooks not configured![/bold yellow]"
    )
    console.print()
    console.print(
        "[white]Hooks are required for reliable completion detection.[/white]"
    )
    console.print()

    choices = [
        questionary.Choice(
            title=f"Global ({global_path})",
            value=global_path,
        ),
        questionary.Choice(
            title=f"Project ({project_settings_path})",
            value=project_settings_path,
        ),
        questionary.Choice(
            title="Cancel",
            value=None,
        ),
    ]

    selected = questionary.select(
        "Where should hooks be installed?",
        choices=choices,
        use_arrow_keys=True,
        use_shortcuts=False,
        pointer=ICONS["arrow"],
        qmark=ICONS["diamond"],
    ).ask()

    return selected


def prompt_hook_update(settings_path: Path) -> bool:
    """Ask user if they want to update outdated hooks.

    Args:
        settings_path: Path where outdated hooks were found

    Returns:
        True if user wants to update, False otherwise
    """
    console.print()
    console.print(
        f"[bold yellow]{ICONS['warning']} Claude hooks are outdated![/bold yellow]"
    )
    console.print()
    console.print(
        f"[white]Hooks in [cyan]{settings_path}[/cyan] need to be updated.[/white]"
    )
    console.print(
        "[dim]Your other custom hooks will be preserved.[/dim]"
    )
    console.print()

    return questionary.confirm(
        "Update hooks now?",
        default=True,
        qmark=ICONS["diamond"],
    ).ask()


def workflow_uses_claude_tool(config: WorkflowConfig) -> bool:
    """Check if any step uses the 'claude' tool (not claude_sdk).

    This recursively checks steps including nested steps in foreach loops.

    Args:
        config: The workflow configuration

    Returns:
        True if any step uses the 'claude' tool
    """

    def check_steps(steps: list[Any]) -> bool:
        for step in steps:
            if step.tool == "claude":
                return True
            # Check nested steps (for foreach loops)
            if step.steps:
                if check_steps(step.steps):
                    return True
        return False

    return check_steps(config.steps)


def print_manual_hook_instructions() -> None:
    """Print manual instructions for hook installation."""
    console.print()
    console.print(
        f"[bold yellow]{ICONS['warning']} Manual Hook Installation[/bold yellow]"
    )
    console.print()
    console.print("[white]Add the following to your Claude settings.json:[/white]")
    console.print()
    console.print(f"[dim]{json.dumps(HOOK_CONFIG, indent=2)}[/dim]")
    console.print()
    console.print("[white]Settings file locations:[/white]")
    console.print(f"  Global: [cyan]~/.claude/settings.json[/cyan]")
    console.print(f"  Project: [cyan].claude/settings.json[/cyan]")
    console.print()
