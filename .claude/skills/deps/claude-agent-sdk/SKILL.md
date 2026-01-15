---
name: claude-agent-sdk
description: Build AI agents with Claude Agent SDK. Use when making programmatic Claude API calls, running model checks, or building agent workflows. Covers query(), ClaudeAgentOptions, message handling, and async patterns.
---

# Claude Agent SDK

Python SDK for building AI agents with Claude. Used for programmatic model interactions in workflows and tools.

## When to Use

- Running model-based checks (like in checklist tool)
- Building autonomous agent workflows
- Programmatic Claude API interactions
- One-shot queries or multi-turn conversations

## Authentication

The SDK uses Claude Code CLI authentication. For Claude Max subscribers:

```bash
# Authenticate once via CLI
claude

# SDK automatically uses this authentication
# No ANTHROPIC_API_KEY needed
```

For API key authentication:
```bash
export ANTHROPIC_API_KEY=your-api-key
```

## Basic Usage

### One-Shot Query

```python
import asyncio
from claude_agent_sdk import query, ClaudeAgentOptions

async def ask_claude():
    options = ClaudeAgentOptions(
        model="claude-3-5-haiku-20241022",  # Note: correct format!
        max_turns=1,
        allowed_tools=[],  # No tools for simple queries
    )

    # query() returns async generator - MUST iterate
    async for message in query(prompt="What is 2+2?", options=options):
        if hasattr(message, "content"):
            for block in message.content:
                if hasattr(block, "text"):
                    print(block.text)

asyncio.run(ask_claude())
```

### Extract Response Text

```python
async def get_response(prompt: str) -> str:
    """Get text response from Claude."""
    options = ClaudeAgentOptions(
        model="claude-3-5-haiku-20241022",
        max_turns=1,
        allowed_tools=[],
    )

    response_text = ""
    async for message in query(prompt=prompt, options=options):
        if hasattr(message, "content"):
            for block in message.content:
                if hasattr(block, "text"):
                    response_text += block.text

    return response_text or "No response"
```

### With Tools Enabled

```python
options = ClaudeAgentOptions(
    model="claude-sonnet-4-5",
    max_turns=10,
    allowed_tools=["Read", "Write", "Bash", "Glob", "Grep"],
    permission_mode="acceptEdits",  # Auto-accept file edits
    cwd="/path/to/project",
)
```

## Model Names

Correct format: `claude-{version}-{variant}-{date}`

| Model | ID |
|-------|-----|
| Haiku 3.5 | `claude-3-5-haiku-20241022` |
| Sonnet 4.5 | `claude-sonnet-4-5` |
| Opus 4 | `claude-opus-4` |

**Common mistake:** `claude-haiku-3-5-20241022` (wrong order)

## Message Types

The `query()` generator yields different message types:

```python
from claude_agent_sdk import (
    AssistantMessage,  # Claude's responses
    SystemMessage,     # System info
    ResultMessage,     # Final result with cost
    TextBlock,         # Text content
    ToolUseBlock,      # Tool invocations
)

async for message in query(prompt="...", options=options):
    if isinstance(message, AssistantMessage):
        for block in message.content:
            if isinstance(block, TextBlock):
                print(f"Text: {block.text}")
            elif isinstance(block, ToolUseBlock):
                print(f"Tool: {block.name}")
    elif isinstance(message, ResultMessage):
        print(f"Cost: ${message.total_cost_usd:.4f}")
```

## Handling Async Contexts

When calling from sync code that might be in an async context:

```python
import asyncio
import concurrent.futures

def run_query_safe(coro):
    """Run coroutine safely from any context."""
    try:
        loop = asyncio.get_running_loop()
        # Already in async - use thread pool
        with concurrent.futures.ThreadPoolExecutor() as pool:
            future = pool.submit(asyncio.run, coro)
            return future.result()
    except RuntimeError:
        # No running loop - safe to use asyncio.run
        return asyncio.run(coro)
```

## ClaudeAgentOptions Reference

Key options:

```python
ClaudeAgentOptions(
    # Model selection
    model="claude-3-5-haiku-20241022",

    # Tools
    allowed_tools=["Read", "Write"],  # Or [] for no tools
    disallowed_tools=["Bash"],        # Block specific tools

    # Permissions
    permission_mode="acceptEdits",    # "default" | "acceptEdits" | "bypassPermissions"

    # Limits
    max_turns=10,
    max_budget_usd=5.0,

    # Context
    cwd="/path/to/project",
    system_prompt="You are a helpful assistant.",

    # Environment
    env={"CUSTOM_VAR": "value"},
)
```

## Common Pitfalls

1. **Wrong model name format** - Use `claude-3-5-haiku-20241022` not `claude-haiku-3-5-20241022`
2. **Awaiting query() directly** - It's an async generator, use `async for`
3. **Using max_tool_uses** - Doesn't exist, use `allowed_tools=[]`
4. **Nested asyncio.run()** - Fails in async context, use thread pool workaround

## Project Usage

In this project, the SDK is used for:
- Model-based checklist checks (`orchestrator/tools/checklist.py`)
- The `_call_haiku()` method for quick LLM judgments

## Reference

- [Claude Agent SDK Docs](https://platform.claude.com/docs/en/agent-sdk)
- [Python SDK GitHub](https://github.com/anthropics/claude-agent-sdk-python)
