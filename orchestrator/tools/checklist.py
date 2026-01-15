"""Checklist tool for running validation checks in workflows.

Supports three check types:
- bash: Run shell commands and compare output
- regex: Pattern matching in files using ripgrep
- model: LLM-based judgment using Claude haiku

All checks run in parallel for faster execution.
"""

import asyncio
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any, Dict, List, Optional

import yaml

from .base import BaseTool, ToolResult
from ..display_adapter import get_display

if TYPE_CHECKING:
    from ..context import ExecutionContext
    from ..tmux import TmuxManager


@dataclass
class CheckResult:
    """Result of a single check."""

    name: str
    passed: bool
    severity: str  # error, warning, info
    message: str
    details: Optional[str] = None


class ChecklistTool(BaseTool):
    """Execute validation checklists with bash, regex, and model checks."""

    @property
    def name(self) -> str:
        return "checklist"

    def validate_step(self, step: Dict[str, Any]) -> None:
        """Validate checklist step configuration."""
        if "checklist" not in step and "items" not in step:
            raise ValueError(
                "Checklist step requires either 'checklist' (file name) "
                "or 'items' (inline check definitions)"
            )

        # Validate inline items if provided
        if "items" in step:
            items = step["items"]
            if not isinstance(items, list):
                raise ValueError("'items' must be a list of check definitions")
            for i, item in enumerate(items):
                if "name" not in item:
                    raise ValueError(f"Check item {i} missing required 'name' field")
                if "type" not in item:
                    raise ValueError(f"Check item {i} missing required 'type' field")
                if item["type"] not in ("bash", "regex", "model"):
                    raise ValueError(
                        f"Check item {i} has invalid type '{item['type']}'. "
                        "Valid types: bash, regex, model"
                    )

    def execute(
        self,
        step: Dict[str, Any],
        context: "ExecutionContext",
        tmux_manager: "TmuxManager",
    ) -> ToolResult:
        """Execute checklist and return aggregated results."""
        import time

        start_time = time.time()
        display = get_display()

        # Load checklist configuration
        checklist_config = self._load_checklist(step, context)
        if checklist_config is None:
            return ToolResult(
                success=False,
                error="Failed to load checklist configuration",
            )

        checklist_name = checklist_config.get("name", "unnamed")
        items = checklist_config.get("items", [])
        on_fail = step.get("on_fail", checklist_config.get("on_fail", "warn"))

        # Show checklist start
        display.print_checklist_start(checklist_name, len(items))

        # Run all checks in parallel
        # Handle both sync and async contexts
        try:
            loop = asyncio.get_running_loop()
            # Already in async context - create task
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                future = pool.submit(
                    asyncio.run,
                    self._run_checks_parallel(items, context)
                )
                results = future.result()
        except RuntimeError:
            # No running loop - use asyncio.run directly
            results = asyncio.run(self._run_checks_parallel(items, context))

        # Display each check result
        for result in results:
            display.print_checklist_item(
                name=result.name,
                passed=result.passed,
                severity=result.severity,
                message=result.message if not result.passed else None,
                details=result.details,
            )

        # Calculate stats
        passed_count = sum(1 for r in results if r.passed)
        total_count = len(results)
        has_errors = any(
            not r.passed and r.severity == "error" for r in results
        )
        has_warnings = any(
            not r.passed and r.severity == "warning" for r in results
        )

        # Display completion summary
        duration = time.time() - start_time
        display.print_checklist_complete(
            checklist_name=checklist_name,
            passed_count=passed_count,
            total_count=total_count,
            has_errors=has_errors,
            has_warnings=has_warnings,
            duration=duration,
        )

        # Aggregate results for output
        output = self._format_results(checklist_name, results)

        # Success depends on on_fail mode
        if on_fail == "stop":
            success = not has_errors and not has_warnings
        elif on_fail == "warn":
            success = not has_errors  # Warnings don't fail
        else:  # continue
            success = True  # Always succeed

        return ToolResult(
            success=success,
            output=output,
            error=None if success else "Checklist validation failed",
        )

    def _load_checklist(
        self,
        step: Dict[str, Any],
        context: "ExecutionContext",
    ) -> Optional[Dict[str, Any]]:
        """Load checklist from file or inline items."""
        # Inline items take precedence
        if "items" in step:
            return {
                "name": step.get("name", "inline-checklist"),
                "items": step["items"],
                "on_fail": step.get("on_fail", "warn"),
            }

        # Load from file
        checklist_name = context.interpolate(step["checklist"])
        checklist_dir = context.project_path / ".claude" / "checklists"

        # Try with and without .yaml extension
        for ext in ("", ".yaml", ".yml"):
            checklist_path = checklist_dir / f"{checklist_name}{ext}"
            if checklist_path.exists():
                with open(checklist_path, "r") as f:
                    return yaml.safe_load(f)

        # Checklist file not found
        return None

    async def _run_checks_parallel(
        self,
        items: List[Dict[str, Any]],
        context: "ExecutionContext",
    ) -> List[CheckResult]:
        """Run all checks in parallel and return results."""
        tasks = [self._run_check_async(item, context) for item in items]
        return await asyncio.gather(*tasks)

    async def _run_check_async(
        self,
        item: Dict[str, Any],
        context: "ExecutionContext",
    ) -> CheckResult:
        """Run a single check asynchronously and return result."""
        check_type = item["type"]
        check_name = item["name"]
        severity = item.get("severity", "warning")

        try:
            if check_type == "bash":
                return await self._run_bash_check_async(item, context, severity)
            elif check_type == "regex":
                return await self._run_regex_check_async(item, context, severity)
            elif check_type == "model":
                return await self._run_model_check_async(item, context, severity)
            else:
                return CheckResult(
                    name=check_name,
                    passed=False,
                    severity="error",
                    message=f"Unknown check type: {check_type}",
                )
        except Exception as e:
            return CheckResult(
                name=check_name,
                passed=False,
                severity=severity,
                message=f"Check execution failed: {str(e)}",
            )

    async def _run_bash_check_async(
        self,
        item: Dict[str, Any],
        context: "ExecutionContext",
        severity: str,
    ) -> CheckResult:
        """Run a bash command check asynchronously."""
        name = item["name"]
        command = context.interpolate(item["command"])

        try:
            # Run subprocess in thread pool to avoid blocking
            result = await asyncio.to_thread(
                subprocess.run,
                command,
                shell=True,
                cwd=str(context.project_path),
                capture_output=True,
                text=True,
                timeout=60,
            )
            output = result.stdout.strip()

            # Check expectations
            passed = True
            message = ""

            if "expect" in item:
                expected = str(item["expect"])
                if output != expected:
                    passed = False
                    message = f"Expected '{expected}', got '{output}'"
                else:
                    message = "Output matches expected value"

            elif "expect_not" in item:
                forbidden = str(item["expect_not"])
                if forbidden in output:
                    passed = False
                    message = f"Output contains forbidden value: {forbidden}"
                else:
                    message = "Output does not contain forbidden value"

            elif "expect_regex" in item:
                pattern = item["expect_regex"]
                if not re.search(pattern, output):
                    passed = False
                    message = f"Output does not match pattern: {pattern}"
                else:
                    message = "Output matches pattern"

            else:
                # No expectation, just check exit code
                passed = result.returncode == 0
                message = "Command succeeded" if passed else f"Command failed with exit code {result.returncode}"

            return CheckResult(
                name=name,
                passed=passed,
                severity=severity,
                message=message,
                details=output if not passed else None,
            )

        except subprocess.TimeoutExpired:
            return CheckResult(
                name=name,
                passed=False,
                severity=severity,
                message="Command timed out after 60 seconds",
            )

    async def _run_regex_check_async(
        self,
        item: Dict[str, Any],
        context: "ExecutionContext",
        severity: str,
    ) -> CheckResult:
        """Run a regex pattern matching check using ripgrep asynchronously."""
        name = item["name"]
        pattern = item["pattern"]
        files = item.get("files", "**/*.py")
        exclude = item.get("exclude", "")
        expect_count = item.get("expect", 0)

        # Build ripgrep command
        cmd_parts = ["rg", "--count-matches", "-e", pattern]

        # Add file glob
        cmd_parts.extend(["--glob", files])

        # Add exclude patterns
        if exclude:
            for excl in exclude.split(","):
                cmd_parts.extend(["--glob", f"!{excl.strip()}"])

        # Add path
        cmd_parts.append(".")

        try:
            # Run subprocess in thread pool to avoid blocking
            result = await asyncio.to_thread(
                subprocess.run,
                cmd_parts,
                cwd=str(context.project_path),
                capture_output=True,
                text=True,
                timeout=60,
            )

            # Parse ripgrep output to count matches
            # Format: file:count per line
            total_matches = 0
            match_details = []
            for line in result.stdout.strip().split("\n"):
                if line and ":" in line:
                    parts = line.rsplit(":", 1)
                    if len(parts) == 2:
                        try:
                            count = int(parts[1])
                            total_matches += count
                            if count > 0:
                                match_details.append(f"{parts[0]}: {count} matches")
                        except ValueError:
                            pass

            passed = total_matches == expect_count
            if passed:
                message = f"Found {total_matches} matches (expected {expect_count})"
            else:
                message = f"Found {total_matches} matches, expected {expect_count}"

            return CheckResult(
                name=name,
                passed=passed,
                severity=severity,
                message=message,
                details="\n".join(match_details[:10]) if not passed and match_details else None,
            )

        except FileNotFoundError:
            return CheckResult(
                name=name,
                passed=False,
                severity=severity,
                message="ripgrep (rg) not found - please install it",
            )
        except subprocess.TimeoutExpired:
            return CheckResult(
                name=name,
                passed=False,
                severity=severity,
                message="Pattern search timed out after 60 seconds",
            )

    async def _run_model_check_async(
        self,
        item: Dict[str, Any],
        context: "ExecutionContext",
        severity: str,
    ) -> CheckResult:
        """Run an LLM-based check using Claude haiku asynchronously."""
        name = item["name"]
        prompt_template = item["prompt"]
        pass_pattern = item.get("pass_pattern", r"(?i)(PASS|pass|yes|ok|true)")

        # Interpolate variables in prompt
        prompt = context.interpolate(prompt_template)

        # Include any specified context variables
        context_vars = item.get("context_vars", [])
        if context_vars:
            var_context = []
            for var_name in context_vars:
                value = context.get(var_name)
                if value:
                    var_context.append(f"## {var_name}\n{value}")
            if var_context:
                prompt = "\n\n".join(var_context) + "\n\n" + prompt

        try:
            # Already async - no need for asyncio.run
            response = await self._call_haiku(prompt, context)

            # Check if response indicates pass
            passed = bool(re.search(pass_pattern, response))

            return CheckResult(
                name=name,
                passed=passed,
                severity=severity,
                message="Check passed" if passed else "Check failed",
                details=response if not passed else None,
            )

        except Exception as e:
            return CheckResult(
                name=name,
                passed=False,
                severity=severity,
                message=f"Model check failed: {str(e)}",
            )

    async def _call_haiku(
        self,
        prompt: str,
        context: "ExecutionContext",
    ) -> str:
        """Call Claude haiku for model-based checks."""
        try:
            from claude_agent_sdk import ClaudeAgentOptions, query
        except ImportError:
            raise RuntimeError(
                "claude-agent-sdk not installed. Run: pip install claude-agent-sdk"
            )

        options = ClaudeAgentOptions(
            model="claude-3-5-haiku-20241022",
            max_turns=1,
            allowed_tools=[],  # No tools for simple checks
            cwd=str(context.project_path),
        )

        # query() returns an async generator - iterate to get messages
        response_text = ""
        async for message in query(prompt=prompt, options=options):
            # Look for AssistantMessage with text content
            if hasattr(message, "content"):
                for block in message.content:
                    if hasattr(block, "text"):
                        response_text += block.text

        return response_text or "No response"

    def _format_results(
        self,
        checklist_name: str,
        results: List[CheckResult],
    ) -> str:
        """Format check results for output."""
        lines = [f"## Checklist: {checklist_name}"]

        passed_count = sum(1 for r in results if r.passed)
        total_count = len(results)
        warning_count = sum(1 for r in results if not r.passed and r.severity == "warning")
        error_count = sum(1 for r in results if not r.passed and r.severity == "error")

        if error_count > 0:
            status = "FAILED"
        elif warning_count > 0:
            status = "PASSED with warnings"
        else:
            status = "PASSED"

        lines.append(f"Status: {status} ({passed_count}/{total_count} checks passed)")
        if warning_count > 0:
            lines.append(f"Warnings: {warning_count}")
        if error_count > 0:
            lines.append(f"Errors: {error_count}")
        lines.append("")

        # Individual results
        for r in results:
            if r.passed:
                icon = "✓"
            elif r.severity == "error":
                icon = "✗"
            elif r.severity == "warning":
                icon = "⚠"
            else:
                icon = "ℹ"

            lines.append(f"{icon} {r.name}")
            if not r.passed:
                lines.append(f"  {r.message}")
                if r.details:
                    for detail_line in r.details.split("\n")[:5]:
                        lines.append(f"    {detail_line}")

        return "\n".join(lines)
