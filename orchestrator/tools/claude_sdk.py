"""Claude SDK tool for AI-powered decision making.

This tool uses the Claude Agent SDK to analyze context and make decisions,
with support for structured outputs (boolean, enum, decision, custom schema).
"""

import asyncio
import json
from typing import Any, Dict, List, Optional, Union

from ..context import ExecutionContext
from ..tmux import TmuxManager
from .base import BaseTool, ToolResult


# Read-only tools only for safety
READ_ONLY_TOOLS = ["Read", "Glob", "Grep", "WebFetch", "WebSearch"]

# Model alias to full model ID mapping
MODEL_ALIASES: Dict[str, str] = {
    "sonnet": "claude-sonnet-4-20250514",
    "opus": "claude-opus-4-5-20251101",
    "haiku": "claude-haiku-3-5-20241022",
}

# Default system prompt for decision-making
DEFAULT_SYSTEM_PROMPT = """You are a decision-making assistant integrated into an automated workflow.
Your role is to analyze the provided context and make precise decisions.

Guidelines:
- Be concise and direct in your analysis
- Your output must strictly follow the requested format
- Focus on the key information needed to make the decision
- If you need to explore files for context, use the available read-only tools"""


class OutputValidationError(Exception):
    """Raised when output doesn't match expected schema."""

    pass


class ClaudeSdkTool(BaseTool):
    """Tool for AI-powered decision making using Claude Agent SDK."""

    @property
    def name(self) -> str:
        return "claude_sdk"

    def validate_step(self, step: Dict[str, Any]) -> None:
        """Validate step configuration."""
        if not step.get("prompt"):
            raise ValueError("claude_sdk tool requires 'prompt' field")

        output_type = step.get("output_type")
        if output_type == "enum" and not step.get("values"):
            raise ValueError("enum output_type requires 'values' field")
        if output_type == "schema" and not step.get("schema"):
            raise ValueError("schema output_type requires 'schema' field")

        # Validate output_type value
        valid_output_types = {"boolean", "enum", "decision", "schema", None}
        if output_type not in valid_output_types:
            raise ValueError(
                f"Invalid output_type: {output_type}. "
                f"Valid types: boolean, enum, decision, schema"
            )

    def execute(
        self,
        step: Dict[str, Any],
        context: ExecutionContext,
        tmux_manager: TmuxManager,
    ) -> ToolResult:
        """Execute the claude_sdk tool."""
        try:
            return asyncio.run(self._execute_async(step, context))
        except Exception as e:
            return ToolResult(success=False, error=str(e))

    async def _execute_async(
        self,
        step: Dict[str, Any],
        context: ExecutionContext,
    ) -> ToolResult:
        """Async implementation of tool execution."""
        try:
            from claude_agent_sdk import ClaudeAgentOptions, query
            from claude_agent_sdk.types import ResultMessage
        except ImportError:
            return ToolResult(
                success=False,
                error="claude-agent-sdk not installed. Run: pip install claude-agent-sdk",
            )

        # Interpolate prompt template with variables
        prompt = context.interpolate(step["prompt"])

        # Build SDK options
        options = self._build_options(step, context)

        # Execute with retry logic for schema validation
        max_retries = step.get("max_retries", 3)
        last_error: Optional[str] = None
        transcript: List[str] = []

        for attempt in range(max_retries):
            try:
                # Add retry feedback to prompt if not first attempt
                current_prompt = prompt
                if attempt > 0 and last_error:
                    current_prompt = (
                        f"{prompt}\n\n"
                        f"[Previous attempt failed validation: {last_error}. "
                        f"Please try again with valid output.]"
                    )

                # Run the query
                result_text = ""
                structured_output = None

                async for message in query(prompt=current_prompt, options=options):
                    # Capture transcript if verbose
                    if step.get("verbose", False):
                        transcript.append(str(message))

                    # Extract result from ResultMessage
                    if isinstance(message, ResultMessage):
                        if hasattr(message, "result") and message.result:
                            result_text = message.result
                        if hasattr(message, "structured_output"):
                            structured_output = getattr(
                                message, "structured_output", None
                            )
                        if message.is_error:
                            return ToolResult(
                                success=False,
                                error=f"SDK error: {result_text}",
                            )

                # Parse and validate output
                parsed = self._parse_output(
                    result_text, structured_output, step
                )

                # Build output string
                output = self._format_output(parsed, transcript, step)

                # Extract goto if decision type
                goto_step = None
                if isinstance(parsed, dict) and "goto" in parsed:
                    goto_step = parsed["goto"]

                return ToolResult(
                    success=True,
                    output=output,
                    goto_step=goto_step,
                )

            except OutputValidationError as e:
                last_error = str(e)
                if attempt == max_retries - 1:
                    return ToolResult(
                        success=False,
                        error=f"Output validation failed after {max_retries} attempts: {e}",
                    )

        return ToolResult(success=False, error="Max retries exceeded")

    def _build_options(
        self, step: Dict[str, Any], context: ExecutionContext
    ) -> "ClaudeAgentOptions":
        """Build ClaudeAgentOptions from step configuration."""
        from claude_agent_sdk import ClaudeAgentOptions

        # Get workflow-level defaults
        workflow_defaults = step.get("_workflow_claude_sdk", {})

        # Resolve model: step -> workflow -> default
        model_alias = step.get("model") or workflow_defaults.get("model") or "sonnet"
        model = MODEL_ALIASES.get(model_alias, model_alias)

        # Resolve system prompt: step -> workflow -> default
        system_prompt = (
            step.get("system_prompt")
            or workflow_defaults.get("system_prompt")
            or DEFAULT_SYSTEM_PROMPT
        )

        # Add output format instructions to system prompt
        output_type = step.get("output_type")
        if output_type:
            system_prompt = self._append_output_instructions(
                system_prompt, output_type, step
            )

        # Build output format for SDK structured outputs
        output_format = self._build_output_format(step)

        return ClaudeAgentOptions(
            model=model,
            system_prompt=system_prompt,
            allowed_tools=READ_ONLY_TOOLS,
            permission_mode="bypassPermissions",
            max_turns=step.get("max_turns", 10),
            cwd=str(context.project_path),
            output_format=output_format,
        )

    def _append_output_instructions(
        self, system_prompt: str, output_type: str, step: Dict[str, Any]
    ) -> str:
        """Append output format instructions to system prompt."""
        instructions = "\n\n## Required Output Format\n"

        if output_type == "boolean":
            instructions += (
                "You must respond with a JSON object containing a single 'result' field "
                "with a boolean value (true or false).\n"
                "Example: {\"result\": true}"
            )
        elif output_type == "enum":
            values = step.get("values", [])
            instructions += (
                f"You must respond with a JSON object containing a single 'result' field "
                f"with one of these exact values: {values}\n"
                f"Example: {{\"result\": \"{values[0] if values else 'value'}\"}}"
            )
        elif output_type == "decision":
            instructions += (
                "You must respond with a JSON object containing:\n"
                "- 'goto': the name of the next step to execute\n"
                "- 'reason': a brief explanation for your decision\n"
                "Example: {\"goto\": \"step_name\", \"reason\": \"explanation\"}"
            )
        elif output_type == "schema":
            schema = step.get("schema", {})
            instructions += (
                f"You must respond with a JSON object matching this schema:\n"
                f"{json.dumps(schema, indent=2)}"
            )

        return system_prompt + instructions

    def _build_output_format(self, step: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Build SDK output_format for structured outputs."""
        output_type = step.get("output_type")
        if not output_type:
            return None

        if output_type == "boolean":
            return {
                "type": "json_schema",
                "schema": {
                    "type": "object",
                    "properties": {"result": {"type": "boolean"}},
                    "required": ["result"],
                },
            }
        elif output_type == "enum":
            values = step.get("values", [])
            return {
                "type": "json_schema",
                "schema": {
                    "type": "object",
                    "properties": {"result": {"type": "string", "enum": values}},
                    "required": ["result"],
                },
            }
        elif output_type == "decision":
            return {
                "type": "json_schema",
                "schema": {
                    "type": "object",
                    "properties": {
                        "goto": {"type": "string"},
                        "reason": {"type": "string"},
                    },
                    "required": ["goto", "reason"],
                },
            }
        elif output_type == "schema":
            return {
                "type": "json_schema",
                "schema": step.get("schema", {}),
            }

        return None

    def _parse_output(
        self,
        result_text: str,
        structured_output: Optional[Any],
        step: Dict[str, Any],
    ) -> Union[Dict[str, Any], str, bool]:
        """Parse and validate tool output."""
        output_type = step.get("output_type")

        # If SDK provided structured output, use it directly
        if structured_output is not None:
            return self._validate_structured_output(structured_output, step)

        # If no output_type, return raw text
        if not output_type:
            return result_text

        # Try to parse JSON from result text
        try:
            # Try to extract JSON from the text
            parsed = self._extract_json(result_text)
            return self._validate_structured_output(parsed, step)
        except json.JSONDecodeError as e:
            raise OutputValidationError(
                f"Failed to parse JSON from output: {e}. Output was: {result_text[:200]}"
            )

    def _extract_json(self, text: str) -> Dict[str, Any]:
        """Extract JSON from text, handling markdown code blocks."""
        text = text.strip()

        # Try to find JSON in code blocks
        if "```json" in text:
            start = text.find("```json") + 7
            end = text.find("```", start)
            if end > start:
                text = text[start:end].strip()
        elif "```" in text:
            start = text.find("```") + 3
            end = text.find("```", start)
            if end > start:
                text = text[start:end].strip()

        # Try direct JSON parse
        return json.loads(text)

    def _validate_structured_output(
        self, output: Any, step: Dict[str, Any]
    ) -> Union[Dict[str, Any], str, bool]:
        """Validate structured output against expected type."""
        output_type = step.get("output_type")

        if output_type == "boolean":
            if isinstance(output, dict) and "result" in output:
                result = output["result"]
                if isinstance(result, bool):
                    return output
                raise OutputValidationError(
                    f"Expected boolean result, got: {type(result).__name__}"
                )
            raise OutputValidationError(
                f"Expected object with 'result' boolean field, got: {output}"
            )

        elif output_type == "enum":
            values = step.get("values", [])
            if isinstance(output, dict) and "result" in output:
                result = output["result"]
                if result in values:
                    return output
                raise OutputValidationError(
                    f"Result '{result}' not in allowed values: {values}"
                )
            raise OutputValidationError(
                f"Expected object with 'result' field, got: {output}"
            )

        elif output_type == "decision":
            if isinstance(output, dict):
                if "goto" in output and "reason" in output:
                    return output
                raise OutputValidationError(
                    "Decision output must have 'goto' and 'reason' fields"
                )
            raise OutputValidationError(
                f"Expected decision object, got: {type(output).__name__}"
            )

        elif output_type == "schema":
            # For custom schema, just ensure it's a dict
            if isinstance(output, dict):
                return output
            raise OutputValidationError(
                f"Expected object matching schema, got: {type(output).__name__}"
            )

        return output

    def _format_output(
        self,
        parsed: Union[Dict[str, Any], str, bool],
        transcript: List[str],
        step: Dict[str, Any],
    ) -> str:
        """Format the output for storage in variables."""
        output_type = step.get("output_type")

        # Build main output
        if isinstance(parsed, dict):
            # For enum/boolean with result field, extract the value for simpler usage
            if output_type in ("boolean", "enum") and "result" in parsed:
                main_output = str(parsed["result"])
            else:
                main_output = json.dumps(parsed)
        else:
            main_output = str(parsed)

        # Add transcript if verbose
        if step.get("verbose", False) and transcript:
            return f"{main_output}\n\n--- Transcript ---\n" + "\n".join(transcript)

        return main_output
