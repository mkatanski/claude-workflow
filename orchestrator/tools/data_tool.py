"""Data tool for writing managed temp files."""

import json
from pathlib import Path
from typing import TYPE_CHECKING, Any, Dict
from uuid import uuid4

from .base import BaseTool, ToolResult

if TYPE_CHECKING:
    from ..context import ExecutionContext
    from ..tmux import TmuxManager


class DataTool(BaseTool):
    """Write data to managed temp files for Claude to read.

    Writes content to the workflow temp directory and returns the file path.
    Files are automatically cleaned up when the workflow ends.

    Supports formats:
    - json: Pretty-printed JSON
    - text: Plain text
    - markdown: Markdown formatted text
    """

    @property
    def name(self) -> str:
        return "data"

    def validate_step(self, step: Dict[str, Any]) -> None:
        """Validate data step configuration."""
        if "content" not in step:
            raise ValueError("Data step requires 'content' field")

        fmt = step.get("format", "text")
        valid_formats = {"json", "text", "markdown"}
        if fmt not in valid_formats:
            raise ValueError(
                f"Invalid format '{fmt}'. Valid: {', '.join(sorted(valid_formats))}"
            )

    def execute(
        self,
        step: Dict[str, Any],
        context: "ExecutionContext",
        tmux_manager: "TmuxManager",
    ) -> ToolResult:
        """Write data to temp file and return path."""
        # Get content and interpolate variables
        raw_content = step["content"]
        content = context.interpolate(str(raw_content))

        # Get format
        fmt = step.get("format", "text")

        # Get or generate filename
        filename = step.get("filename")
        if filename:
            filename = context.interpolate(filename)
        else:
            ext = self._get_extension(fmt)
            filename = f"data_{uuid4().hex[:8]}.{ext}"

        # Get temp directory from context
        temp_dir = context.get("_temp_dir")
        if not temp_dir:
            return ToolResult(
                success=False,
                error="No temp directory available. "
                "The data tool requires workflow temp directory support.",
            )

        # Create the file
        file_path = Path(temp_dir) / filename

        try:
            # Format content if needed
            formatted_content = self._format_content(content, fmt)

            # Write to file
            with open(file_path, "w") as f:
                f.write(formatted_content)

            return ToolResult(
                success=True,
                output=str(file_path),
            )
        except json.JSONDecodeError as e:
            return ToolResult(
                success=False,
                error=f"Invalid JSON content: {e}",
            )
        except OSError as e:
            return ToolResult(
                success=False,
                error=f"Failed to write file: {e}",
            )

    def _get_extension(self, fmt: str) -> str:
        """Get file extension for format."""
        extensions = {
            "json": "json",
            "text": "txt",
            "markdown": "md",
        }
        return extensions.get(fmt, "txt")

    def _format_content(self, content: str, fmt: str) -> str:
        """Format content based on format type."""
        if fmt == "json":
            # Try to parse and pretty-print JSON
            try:
                data = json.loads(content)
                return json.dumps(data, indent=2)
            except json.JSONDecodeError:
                # If it's not valid JSON, raise to let caller handle
                raise

        # For text and markdown, return as-is
        return content
