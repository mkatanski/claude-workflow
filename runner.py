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

from orchestrator import ICONS, WorkflowRunner, console, load_config


def main() -> None:
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Run Claude Code workflows via tmux",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=f"""
{ICONS['rocket']} Examples:
    python runner.py /path/to/project
    python runner.py .

{ICONS['info']} Note: Must be run inside a tmux session!
    tmux new -s workflow
    python runner.py /path/to/project

{ICONS['file']} The workflow file should be at:
    <project>/.claude/workflow.yml
        """,
    )
    parser.add_argument(
        "project_path",
        nargs="?",
        default=".",
        help="Path to the project containing .claude/workflow.yml (default: current directory)",
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

    # Check workflow file exists
    workflow_yml = project_path / ".claude" / "workflow.yml"
    workflow_yaml = project_path / ".claude" / "workflow.yaml"

    if not workflow_yml.exists() and not workflow_yaml.exists():
        console.print()
        error_panel = Panel(
            Text.from_markup(
                f"[bold red]{ICONS['cross']} Workflow file not found![/bold red]\n\n"
                f"[white]Expected location:[/white]\n"
                f"  [cyan]{workflow_yml}[/cyan]\n"
                f"  [dim]or[/dim]\n"
                f"  [cyan]{workflow_yaml}[/cyan]\n\n"
                f"[white]Create a workflow.yml file with your workflow configuration.[/white]"
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
        config = load_config(project_path)
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
