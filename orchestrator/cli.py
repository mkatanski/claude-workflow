"""
Claude Code Workflow Orchestrator CLI

A beautiful terminal-based orchestrator that runs Claude Code workflows
defined in .claude/workflow.yml files.

Usage:
    claude-workflow /path/to/project
    claude-workflow .  # current directory

Requirements:
    - tmux must be running (start with: tmux new -s workflow)
"""

import argparse
import os
import sys
from pathlib import Path

import yaml
from rich import box
from rich.panel import Panel
from rich.text import Text

from orchestrator.config import (
    discover_workflows,
    find_workflow_by_name,
    load_config,
    validate_workflow_file,
)
from orchestrator.display import ICONS
from orchestrator.display_adapter import DisplayAdapter, get_display
from orchestrator.hooks import (
    HookStatus,
    check_hooks_status,
    install_hooks,
    print_manual_hook_instructions,
    prompt_hook_installation,
    prompt_hook_update,
    workflow_uses_claude_tool,
)
from orchestrator.selector import format_workflow_list, select_workflow_interactive
from orchestrator.server import ServerManager
from orchestrator.workflow import WorkflowRunner


def main() -> None:
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Run Claude Code workflows via tmux",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=f"""
{ICONS['rocket']} Examples:
    claude-workflow /path/to/project
    claude-workflow .
    claude-workflow . -w "Build and Test"
    claude-workflow . --workflow "Portfolio CMS"
    claude-workflow . -f /path/to/custom-workflow.yml

{ICONS['info']} Note: Must be run inside a tmux session!
    tmux new -s workflow
    claude-workflow /path/to/project

{ICONS['file']} Workflow files:
    - Located in: <project>/.claude/
    - Required: type: claude-workflow
    - Required: version: 2
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
        help="Name of the workflow to run (from 'name' field in workflow file)",
    )
    parser.add_argument(
        "-f",
        "--file",
        dest="workflow_file",
        default=None,
        help="Direct path to a workflow file (must have valid type and version)",
    )
    parser.add_argument(
        "-p",
        "--port",
        type=int,
        default=7432,
        help="Port for completion signal server (default: 7432)",
    )
    parser.add_argument(
        "--classic",
        action="store_true",
        default=False,
        help="Use classic panel-based display instead of CI-style (default: CI-style)",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        default=False,
        help="Use verbose output mode with full step output (overrides --classic)",
    )

    args = parser.parse_args()

    # Configure display mode (must be done before any display calls)
    # Verbose mode takes precedence over classic mode
    if args.verbose:
        DisplayAdapter.use_verbose = True
        DisplayAdapter.use_v2 = False
    else:
        DisplayAdapter.use_verbose = False
        DisplayAdapter.use_v2 = not args.classic
    DisplayAdapter.reset()  # Reset singleton to pick up new setting

    # Convert to Path and resolve
    project_path = Path(args.project_path).resolve()

    # Check if inside tmux
    if not os.environ.get("TMUX"):
        get_display().console.print()
        error_panel = Panel(
            Text.from_markup(
                f"[bold red]{ICONS['cross']} Must run inside a tmux session![/bold red]\n\n"
                f"[white]Start tmux first:[/white]\n"
                f"  [cyan]tmux new -s workflow[/cyan]\n\n"
                f"[white]Then run this script:[/white]\n"
                f"  [cyan]claude-workflow {args.project_path}[/cyan]"
            ),
            title="[bold red]Error[/bold red]",
            border_style="red",
            box=box.ROUNDED,
            expand=False,
        )
        get_display().console.print(error_panel)
        get_display().console.print()
        sys.exit(1)

    # Check project path exists
    if not project_path.exists():
        get_display().console.print()
        get_display().console.print(
            f"[bold red]{ICONS['cross']} Project path not found: {project_path}[/bold red]"
        )
        get_display().console.print()
        sys.exit(1)

    # Check for mutually exclusive flags
    if args.workflow_name and args.workflow_file:
        get_display().console.print()
        get_display().console.print(
            f"[bold red]{ICONS['cross']} Cannot use both -w/--workflow and "
            f"-f/--file flags together[/bold red]"
        )
        get_display().console.print()
        sys.exit(1)

    workflow_file = None

    if args.workflow_file:
        # User specified a direct file path
        workflow_file = Path(args.workflow_file).resolve()

        # Security warning: workflow file outside project directory
        try:
            workflow_file.relative_to(project_path)
        except ValueError:
            get_display().console.print()
            get_display().console.print(
                f"[yellow]{ICONS['warning']} Warning: Loading workflow from outside "
                f"project directory[/yellow]"
            )
            get_display().console.print(f"  [dim]File: {workflow_file}[/dim]")
            get_display().console.print(f"  [dim]Project: {project_path}[/dim]")
            get_display().console.print()

        # Validate the workflow file
        is_valid, error_msg = validate_workflow_file(workflow_file)
        if not is_valid:
            get_display().console.print()
            error_panel = Panel(
                Text.from_markup(
                    f"[bold red]{ICONS['cross']} Invalid workflow file![/bold red]\n\n"
                    f"[white]File:[/white] [cyan]{workflow_file}[/cyan]\n\n"
                    f"[white]Error:[/white] {error_msg}\n\n"
                    f"[white]Required fields:[/white]\n"
                    f"  [cyan]type: claude-workflow[/cyan]\n"
                    f"  [cyan]version: 2[/cyan]"
                ),
                title="[bold red]Error[/bold red]",
                border_style="red",
                box=box.ROUNDED,
                expand=False,
            )
            get_display().console.print(error_panel)
            get_display().console.print()
            sys.exit(1)

    elif args.workflow_name:
        # User specified a workflow name - discover and find by name
        workflows = discover_workflows(project_path)
        found = find_workflow_by_name(workflows, args.workflow_name)

        if found is None:
            get_display().console.print()
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
                    f"[white]Required fields:[/white]\n"
                    f"  [cyan]type: claude-workflow[/cyan]\n"
                    f"  [cyan]version: 2[/cyan]"
                )

            error_panel = Panel(
                Text.from_markup(error_msg),
                title="[bold red]Error[/bold red]",
                border_style="red",
                box=box.ROUNDED,
                expand=False,
            )
            get_display().console.print(error_panel)
            get_display().console.print()
            sys.exit(1)

        workflow_file = found.file_path

    else:
        # No workflow specified - discover and show interactive picker
        workflows = discover_workflows(project_path)

        if workflows:
            selected = select_workflow_interactive(workflows)
            if selected is None:
                get_display().console.print(f"[yellow]{ICONS['stop']} Cancelled[/yellow]")
                sys.exit(0)
            workflow_file = selected.file_path
        else:
            # No valid workflows found
            get_display().console.print()
            error_panel = Panel(
                Text.from_markup(
                    f"[bold red]{ICONS['cross']} No workflow files found![/bold red]\n\n"
                    f"[white]Create a workflow file at:[/white]\n"
                    f"  [cyan]{project_path / '.claude' / 'workflow.yml'}[/cyan]\n\n"
                    f"[white]Required fields:[/white]\n"
                    f"  [cyan]type: claude-workflow[/cyan]\n"
                    f"  [cyan]version: 2[/cyan]\n"
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
            get_display().console.print(error_panel)
            get_display().console.print()
            sys.exit(1)

    # Load config
    try:
        config = load_config(project_path, workflow_file)
    except yaml.YAMLError as e:
        get_display().console.print()
        get_display().console.print(
            f"[bold red]{ICONS['cross']} Invalid YAML in workflow file:[/bold red]"
        )
        get_display().console.print(f"  {e}")
        get_display().console.print()
        sys.exit(1)

    # Check hooks only if workflow uses claude tool
    if workflow_uses_claude_tool(config):
        hook_result = check_hooks_status(project_path)

        if hook_result.status == HookStatus.MISSING:
            # No hooks found - ask user where to install
            settings_path = prompt_hook_installation(project_path)
            if settings_path:
                if install_hooks(settings_path):
                    get_display().console.print()
                    get_display().console.print(
                        f"[green]{ICONS['check']} Hooks installed to {settings_path}[/green]"
                    )
                    get_display().console.print(
                        "[yellow]Please restart Claude Code for hooks to take effect.[/yellow]"
                    )
                    get_display().console.print()
                else:
                    print_manual_hook_instructions()
                    sys.exit(1)
            else:
                get_display().console.print()
                get_display().console.print(
                    f"[red]{ICONS['cross']} Cannot run without hooks configured.[/red]"
                )
                get_display().console.print()
                sys.exit(1)

        elif hook_result.status == HookStatus.OUTDATED:
            # Hooks exist but are outdated - ask user to update
            if prompt_hook_update(hook_result.settings_path):
                if install_hooks(hook_result.settings_path, update=True):
                    get_display().console.print()
                    get_display().console.print(
                        f"[green]{ICONS['check']} Hooks updated in {hook_result.settings_path}[/green]"
                    )
                    get_display().console.print(
                        "[yellow]Please restart Claude Code for hooks to take effect.[/yellow]"
                    )
                    get_display().console.print()
                else:
                    print_manual_hook_instructions()
                    sys.exit(1)
            else:
                get_display().console.print()
                get_display().console.print(
                    f"[red]{ICONS['cross']} Cannot run with outdated hooks.[/red]"
                )
                get_display().console.print()
                sys.exit(1)

        # HookStatus.CURRENT - hooks are up-to-date, continue normally

    # Start server (auto-finds available port if needed)
    server = ServerManager(port=args.port)
    try:
        server.start()
    except RuntimeError as e:
        get_display().console.print()
        get_display().console.print(f"[bold red]{ICONS['cross']} Server failed to start: {e}[/bold red]")
        get_display().console.print()
        sys.exit(1)

    # Show actual port (may differ from requested if auto-found)
    if server.port != args.port:
        get_display().console.print(f"[dim]Port {args.port} busy, using {server.port}[/dim]")

    # Run workflow
    try:
        workflow_dir = workflow_file.parent if workflow_file else None
        runner = WorkflowRunner(config, project_path, server, workflow_dir=workflow_dir)
        runner.run()
    except KeyboardInterrupt:
        get_display().console.print()
        get_display().console.print(f"\n[yellow]{ICONS['stop']} Aborted[/yellow]")
        sys.exit(130)
    except Exception as e:
        get_display().console.print()
        get_display().console.print(f"[bold red]{ICONS['cross']} Error: {e}[/bold red]")
        get_display().console.print()
        sys.exit(1)
    finally:
        server.stop()


if __name__ == "__main__":
    main()
