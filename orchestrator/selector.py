"""Interactive workflow selection using questionary."""

from typing import List, Optional

import questionary

from .config import WorkflowInfo
from .display import ICONS, console


def select_workflow_interactive(
    workflows: List[WorkflowInfo],
) -> Optional[WorkflowInfo]:
    """Show interactive picker for workflow selection.

    Args:
        workflows: List of discovered workflows

    Returns:
        Selected workflow or None if cancelled
    """
    if not workflows:
        return None

    # Build choices with display names
    choices: List[questionary.Choice] = []
    for workflow in workflows:
        # Format: "Workflow Name (filename.yml)"
        display_name = f"{workflow.name} ({workflow.file_path.name})"
        choices.append(
            questionary.Choice(
                title=display_name,
                value=workflow,
            )
        )

    # Add cancel option
    choices.append(
        questionary.Choice(
            title="Cancel",
            value=None,
        )
    )

    console.print()
    console.print(f"[bold cyan]{ICONS['file']} Multiple workflows found[/bold cyan]")
    console.print()

    selected = questionary.select(
        "Select a workflow to run:",
        choices=choices,
        use_arrow_keys=True,
        use_shortcuts=False,
        pointer=ICONS["arrow"],
        qmark=ICONS["diamond"],
    ).ask()

    return selected


def format_workflow_list(workflows: List[WorkflowInfo]) -> str:
    """Format workflow list for display in error messages.

    Args:
        workflows: List of workflows to format

    Returns:
        Formatted string with workflow names and filenames
    """
    lines = []
    for workflow in workflows:
        lines.append(f"  - {workflow.name} ({workflow.file_path.name})")
    return "\n".join(lines)
