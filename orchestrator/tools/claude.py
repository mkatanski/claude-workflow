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

        # Launch Claude pane (also registers with server)
        tmux_manager.launch_claude_pane(prompt)

        try:
            # Wait for completion via server signal
            output = self._wait_for_completion(tmux_manager)

            return ToolResult(
                success=True,
                output=output,
            )
        finally:
            tmux_manager.close_pane()

    def _wait_for_completion(self, tmux_manager: "TmuxManager") -> str:
        """Wait for Claude to finish via server completion signal.

        The server receives a signal from the Claude Stop hook via curl.
        This provides instant, reliable completion detection.

        Returns:
            Captured pane content after completion
        """
        start = time.time()
        waiter = AnimatedWaiter(tool_name="claude")
        pane_id = tmux_manager.current_pane

        if not pane_id:
            return ""

        with Live(console=console, refresh_per_second=10) as live:
            while True:
                elapsed = time.time() - start
                live.update(waiter.create_display(elapsed))

                # Wait for completion signal (short timeout for UI updates)
                if tmux_manager.server.wait_for_complete(pane_id, timeout=0.5):
                    break

        # Capture final output
        return tmux_manager.capture_pane_content()
