#!/usr/bin/env python3
"""
Claude Code Workflow Orchestrator

Backward-compatible entry point. For new installations, use:
    claude-workflow /path/to/project

Or install with:
    uvx claude-workflow
"""

from orchestrator.cli import main

if __name__ == "__main__":
    main()
