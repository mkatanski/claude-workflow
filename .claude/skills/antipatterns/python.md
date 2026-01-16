# Python Antipatterns

Patterns to avoid when writing Python code.

---

## Never use Any type
**Don't:** `def process(data: Any) -> Any`
**Do:** Use specific types, generics, or `Unknown` as last resort
**Why:** Explicit types improve maintainability and catch errors at type-check time
**Source:** Project CLAUDE.md

## Avoid mutable default arguments
**Don't:** `def func(items: list[str] = [])`
**Do:** `def func(items: list[str] | None = None)` then `items = items or []`
**Why:** Mutable defaults are shared across calls, causing subtle bugs
**Source:** Python best practice

## Use pathlib over os.path
**Don't:** `os.path.join(base, "subdir", "file.txt")`
**Do:** `Path(base) / "subdir" / "file.txt"`
**Why:** pathlib is more readable and provides better type safety
**Source:** Modern Python convention

## Don't use bare except
**Don't:** `except:` or `except Exception:`
**Do:** `except SpecificError as e:` and handle appropriately
**Why:** Bare except catches everything including KeyboardInterrupt and SystemExit
**Source:** Python error handling

## Avoid string formatting with +
**Don't:** `"Hello " + name + "!"`
**Do:** `f"Hello {name}!"` or `"Hello {}!".format(name)`
**Why:** f-strings are more readable, faster, and less error-prone
**Source:** Modern Python convention

## Don't use `type()` for type checking
**Don't:** `if type(x) == list:`
**Do:** `if isinstance(x, list):`
**Why:** `isinstance` handles inheritance properly
**Source:** Python best practice

## Use context managers for resources
**Don't:**
```python
f = open("file.txt")
data = f.read()
f.close()
```
**Do:**
```python
with open("file.txt") as f:
    data = f.read()
```
**Why:** Context managers ensure proper cleanup even if exceptions occur
**Source:** Python resource handling

## Avoid deeply nested comprehensions
**Don't:** `[[y for y in x if y > 0] for x in data if len(x) > 2]`
**Do:** Use explicit loops for complex logic, or break into multiple steps
**Why:** Complex comprehensions are hard to read and debug
**Source:** Code readability

---

# Claude Agent SDK Antipatterns

Python SDK-specific patterns for Claude API usage.

---

## Use correct model name format
**Don't:** `model="claude-haiku-3-5-20241022"`
**Do:** `model="claude-3-5-haiku-20241022"`
**Why:** Model names follow pattern `claude-{version}-{variant}-{date}` not `claude-{variant}-{version}-{date}`
**Source:** API error 404 when using incorrect format

## query() returns async generator - must iterate
**Don't:**
```python
result = await query(prompt="Hello", options=options)
print(result.text)  # Won't work
```
**Do:**
```python
async for message in query(prompt="Hello", options=options):
    if hasattr(message, "content"):
        for block in message.content:
            if hasattr(block, "text"):
                print(block.text)
```
**Why:** `query()` yields multiple message types (SystemMessage, AssistantMessage, ResultMessage)
**Source:** SDK documentation and runtime testing

## Use allowed_tools=[] to disable tools
**Don't:** `ClaudeAgentOptions(max_tool_uses=0)`
**Do:** `ClaudeAgentOptions(allowed_tools=[])`
**Why:** `max_tool_uses` parameter doesn't exist in ClaudeAgentOptions
**Source:** SDK API error

## Handle nested asyncio contexts
**Don't:**
```python
async def my_async_function():
    result = asyncio.run(some_coroutine())  # Fails!
```
**Do:**
```python
def my_sync_function():
    try:
        loop = asyncio.get_running_loop()
        # Already in async - use thread pool
        with concurrent.futures.ThreadPoolExecutor() as pool:
            future = pool.submit(asyncio.run, some_coroutine())
            result = future.result()
    except RuntimeError:
        # No running loop - safe to use asyncio.run
        result = asyncio.run(some_coroutine())
```
**Why:** `asyncio.run()` cannot be called from within a running event loop
**Source:** RuntimeError during testing
