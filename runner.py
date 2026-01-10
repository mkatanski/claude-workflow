#!/usr/bin/env python3
"""
Claude Code Workflow Orchestrator

A beautiful terminal-based orchestrator that runs Claude Code workflows
defined in .claude/workflow.yml files.

Usage:
    python runner.py /path/to/project
    python runner.py .  # current directory

Requirements:
    - tmux must be running (start with: tmux new -s workflow)
    - uv tool install git+https://github.com/pchalasani/claude-code-tools
    - pip install pyyaml rich
"""

import argparse
import os
import sys
from pathlib import Path

import yaml
from rich import box
from rich.panel import Panel
from rich.text import Text

from orchestrator import (
    ICONS,
    WorkflowRunner,
    console,
    discover_workflows,
    find_workflow_by_name,
    format_workflow_list,
    load_config,
    select_workflow_interactive,
)


def main() -> None:
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Run Claude Code workflows via tmux",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=f"""
{ICONS['rocket']} Examples:
    python runner.py /path/to/project
    python runner.py .
    python runner.py . -w "Build and Test"
    python runner.py . --workflow "Portfolio CMS"

{ICONS['info']} Note: Must be run inside a tmux session!
    tmux new -s workflow
    python runner.py /path/to/project

{ICONS['file']} Workflow files:
    - Located in: <project>/.claude/
    - Must have: type: claude-workflow
    - Extensions: .yml or .yaml
        """,
    )
    parser.add_argument(
        "project_path",
        nargs="?",
        default=".",
        help="Path to the project containing .claude/ workflows (default: current directory)",
    )
    parser.add_argument(
        "-w",
        "--workflow",
        dest="workflow_name",
        default=None,
        help="Name of the workflow to run (interactive picker if not specified)",
    )

    args = parser.parse_args()

    # Convert to Path and resolve
    project_path = Path(args.project_path).resolve()

    # Check if inside tmux
    if not os.environ.get("TMUX"):
        console.print()
        error_panel = Panel(
            Text.from_markup(
                f"[bold red]{ICONS['cross']} Must run inside a tmux session![/bold red]\n\n"
                f"[white]Start tmux first:[/white]\n"
                f"  [cyan]tmux new -s workflow[/cyan]\n\n"
                f"[white]Then run this script:[/white]\n"
                f"  [cyan]python {sys.argv[0]} {args.project_path}[/cyan]"
            ),
            title="[bold red]Error[/bold red]",
            border_style="red",
            box=box.ROUNDED,
            expand=False,
        )
        console.print(error_panel)
        console.print()
        sys.exit(1)

    # Check project path exists
    if not project_path.exists():
        console.print()
        console.print(
            f"[bold red]{ICONS['cross']} Project path not found: {project_path}[/bold red]"
        )
        console.print()
        sys.exit(1)

    # Discover available workflows
    workflows = discover_workflows(project_path)
    workflow_file = None

    if args.workflow_name:
        # User specified a workflow name
        found = find_workflow_by_name(workflows, args.workflow_name)

        if found is None:
            console.print()
            if workflows:
                error_msg = (
                    f"[bold red]{ICONS['cross']} Workflow '{args.workflow_name}' "
                    f"not found![/bold red]\n\n"
                    f"[white]Available workflows:[/white]\n"
                    f"{format_workflow_list(workflows)}"
                )
            else:
                error_msg = (
                    f"[bold red]{ICONS['cross']} No workflows found![/bold red]\n\n"
                    f"[white]Create workflow files in:[/white]\n"
                    f"  [cyan]{project_path / '.claude'}[/cyan]\n\n"
                    f"[white]Workflow files must have:[/white]\n"
                    f"  [cyan]type: claude-workflow[/cyan]"
                )

            error_panel = Panel(
                Text.from_markup(error_msg),
                title="[bold red]Error[/bold red]",
                border_style="red",
                box=box.ROUNDED,
                expand=False,
            )
            console.print(error_panel)
            console.print()
            sys.exit(1)

        workflow_file = found.file_path

    elif workflows:
        # No workflow specified, but workflows exist
        if len(workflows) == 1:
            # Only one workflow, use it directly
            workflow_file = workflows[0].file_path
            console.print(f"[dim]Using workflow: {workflows[0].name}[/dim]")
        else:
            # Multiple workflows, show picker
            selected = select_workflow_interactive(workflows)
            if selected is None:
                console.print(f"[yellow]{ICONS['stop']} Cancelled[/yellow]")
                sys.exit(0)
            workflow_file = selected.file_path

    else:
        # No workflows found - try legacy fallback
        legacy_yml = project_path / ".claude" / "workflow.yml"
        legacy_yaml = project_path / ".claude" / "workflow.yaml"

        if legacy_yml.exists():
            workflow_file = legacy_yml
            console.print(
                f"[yellow]{ICONS['warning']} Using legacy workflow file "
                f"(add 'type: claude-workflow' marker)[/yellow]"
            )
        elif legacy_yaml.exists():
            workflow_file = legacy_yaml
            console.print(
                f"[yellow]{ICONS['warning']} Using legacy workflow file "
                f"(add 'type: claude-workflow' marker)[/yellow]"
            )
        else:
            # No workflows at all
            console.print()
            error_panel = Panel(
                Text.from_markup(
                    f"[bold red]{ICONS['cross']} No workflow files found![/bold red]\n\n"
                    f"[white]Create a workflow file at:[/white]\n"
                    f"  [cyan]{project_path / '.claude' / 'workflow.yml'}[/cyan]\n\n"
                    f"[white]With the marker:[/white]\n"
                    f"  [cyan]type: claude-workflow[/cyan]\n"
                    f"  [cyan]name: My Workflow[/cyan]\n"
                    f"  [cyan]steps:[/cyan]\n"
                    f"  [cyan]  - name: First Step[/cyan]\n"
                    f"  [cyan]    prompt: ...[/cyan]"
                ),
                title="[bold red]Error[/bold red]",
                border_style="red",
                box=box.ROUNDED,
                expand=False,
            )
            console.print(error_panel)
            console.print()
            sys.exit(1)

    # Load and run
    try:
        config = load_config(project_path, workflow_file)
        runner = WorkflowRunner(config, project_path)
        runner.run()
    except yaml.YAMLError as e:
        console.print()
        console.print(f"[bold red]{ICONS['cross']} Invalid YAML in workflow file:[/bold red]")
        console.print(f"  {e}")
        console.print()
        sys.exit(1)
    except KeyboardInterrupt:
        console.print()
        console.print(f"\n[yellow]{ICONS['stop']} Aborted[/yellow]")
        sys.exit(130)
    except Exception as e:
        console.print()
        console.print(f"[bold red]{ICONS['cross']} Error: {e}[/bold red]")
        console.print()
        sys.exit(1)


if __name__ == "__main__":
    main()
