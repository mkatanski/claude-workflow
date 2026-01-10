"""Claude Code tool implementation."""

import time
from typing import TYPE_CHECKING, Any, Dict

from rich.live import Live

from ..display import AnimatedWaiter, console
from .base import BaseTool, ToolResult

if TYPE_CHECKING:
    from ..context import ExecutionContext
    from ..tmux import TmuxManager


class ClaudeTool(BaseTool):
    """Execute Claude Code prompts in tmux pane."""

    @property
    def name(self) -> str:
        return "claude"

    def validate_step(self, step: Dict[str, Any]) -> None:
        """Validate Claude step configuration."""
        if "prompt" not in step:
            raise ValueError("Claude step requires 'prompt' field")

    def execute(
        self,
        step: Dict[str, Any],
        context: "ExecutionContext",
        tmux_manager: "TmuxManager",
    ) -> ToolResult:
        """Execute Claude Code with the given prompt."""
        prompt = context.interpolate(step["prompt"])

        # Clean up any existing markers
        tmux_manager.cleanup_all()

        # Launch Claude pane
        tmux_manager.launch_claude_pane(prompt)
        tmux_manager.cleanup_markers()

        try:
            # Wait for completion
            output = self._wait_for_completion(tmux_manager)

            return ToolResult(
                success=True,
                output=output,
            )
        finally:
            # Clean up markers
            tmux_manager.cleanup_markers()
            tmux_manager.close_pane()

    def _wait_for_completion(self, tmux_manager: "TmuxManager") -> str:
        """Wait for Claude to finish processing with animated output.

        Uses two detection methods:
        1. Primary: Marker file from Stop hook (if configured)
        2. Fallback: Hash-based idle detection (60s of no output change)

        Returns:
            Captured pane content after completion
        """
        start = time.time()
        waiter = AnimatedWaiter(tool_name="claude")

        # Hash-based idle detection state
        last_hash = ""
        last_hash_change_time = time.time()
        last_hash_check_time = 0.0
        hash_check_interval = 10.0  # Check hash every 10 seconds
        idle_timeout = 60.0  # Consider done after 60s of no change

        with Live(console=console, refresh_per_second=10) as live:
            while True:
                elapsed = time.time() - start
                live.update(waiter.create_display(elapsed))

                # Primary: Check for marker file (most reliable)
                if tmux_manager.check_marker_exists():
                    break

                # Fallback: Hash-based idle detection
                current_time = time.time()
                if current_time - last_hash_check_time >= hash_check_interval:
                    last_hash_check_time = current_time
                    current_hash = tmux_manager.get_pane_content_hash()

                    if current_hash != last_hash:
                        # Content changed, reset timer
                        last_hash = current_hash
                        last_hash_change_time = current_time
                    elif current_time - last_hash_change_time >= idle_timeout:
                        # No change for idle_timeout seconds, consider done
                        break

                # Brief sleep before next iteration
                time.sleep(0.5)

        # Capture final output
        return tmux_manager.capture_pane_content()
