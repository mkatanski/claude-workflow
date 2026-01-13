"""Claude Code tool implementation."""

import time
from typing import TYPE_CHECKING, Any, Dict, List

from rich.live import Live

from ..display import AnimatedWaiter
from ..display_adapter import get_display
from .base import BaseTool, ToolResult

if TYPE_CHECKING:
    from ..config import ClaudeConfig
    from ..context import ExecutionContext
    from ..tmux import TmuxManager


# Patterns that indicate Claude is waiting for plan approval
# These are lowercased for comparison
PLAN_APPROVAL_PATTERNS: List[str] = [
    "would you like to proceed",  # Main question text
    "❯",                          # Selection arrow indicator
    "1. yes",                     # First option (yes)
]


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

        # Apply append_system_prompt if configured
        append_prompt = getattr(tmux_manager.claude_config, "append_system_prompt", None)
        if append_prompt and isinstance(append_prompt, str):
            extension = context.interpolate(append_prompt)
            prompt = f"{extension}\n\n{prompt}"

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

        If auto_approve_plan is enabled, monitors for plan approval prompts
        and automatically sends approval.

        Returns:
            Captured pane content after completion
        """
        start = time.time()
        waiter = AnimatedWaiter(tool_name="claude")
        pane_id = tmux_manager.current_pane
        auto_approve = getattr(tmux_manager.claude_config, "auto_approve_plan", True)
        # Ensure auto_approve is a boolean (handle MagicMock in tests)
        if not isinstance(auto_approve, bool):
            auto_approve = True
        last_approval_check = time.time()
        approval_check_interval = 2.0  # Check every 2 seconds

        if not pane_id:
            return ""

        with Live(console=get_display().console, refresh_per_second=10) as live:
            while True:
                elapsed = time.time() - start
                live.update(waiter.create_display(elapsed))

                # Wait for completion signal (short timeout for UI updates)
                if tmux_manager.server.wait_for_complete(pane_id, timeout=0.5):
                    break

                # Check for plan approval prompt periodically
                if auto_approve and (time.time() - last_approval_check) > approval_check_interval:
                    if self._check_and_approve_plan(tmux_manager):
                        # Give Claude time to process approval
                        time.sleep(1.0)
                    last_approval_check = time.time()

        # Capture final output
        return tmux_manager.capture_pane_content()

    def _check_and_approve_plan(self, tmux_manager: "TmuxManager") -> bool:
        """Check if Claude is waiting for plan approval and auto-approve if so.

        Args:
            tmux_manager: The tmux manager instance

        Returns:
            True if approval was sent, False otherwise
        """
        content = tmux_manager.capture_pane_content().lower()
        if not content:
            return False

        if self._is_plan_approval_prompt(content):
            get_display().print_auto_approve_plan()
            # Just press Enter - the default option "Yes" is already selected
            tmux_manager.send_keys("Enter")
            return True

        return False

    def _is_plan_approval_prompt(self, content: str) -> bool:
        """Check if content contains plan approval prompt indicators.

        Requires at least 2 pattern matches in the last 500 characters
        for confidence that this is actually an approval prompt.

        Args:
            content: Lowercased pane content

        Returns:
            True if plan approval prompt detected
        """
        # Check last ~500 chars for approval patterns
        recent_content = content[-500:] if len(content) > 500 else content
        pattern_matches = sum(1 for p in PLAN_APPROVAL_PATTERNS if p in recent_content)
        return pattern_matches >= 2
