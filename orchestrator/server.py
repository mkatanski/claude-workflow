"""HTTP server for receiving completion signals from Claude hooks.

This module provides a local HTTP server that receives completion signals
via curl from Claude hooks, replacing the filesystem-based marker file system.
"""

import asyncio
import re
import socket
import threading
from typing import Optional

from aiohttp import web

# Tmux pane IDs follow the pattern %<number> (e.g., %0, %123)
PANE_ID_PATTERN = re.compile(r"^%\d+$")


def _is_valid_pane_id(pane_id: str) -> bool:
    """Validate that a pane ID matches the expected tmux format."""
    return bool(PANE_ID_PATTERN.match(pane_id))


class OrchestratorServer:
    """Async HTTP server for handling completion signals from Claude hooks."""

    def __init__(self, port: int = 7432) -> None:
        self.port = port
        self.app = web.Application()
        self.runner: Optional[web.AppRunner] = None
        self.site: Optional[web.TCPSite] = None

        # Per-pane completion events
        self._complete_events: dict[str, asyncio.Event] = {}
        self._exited_events: dict[str, asyncio.Event] = {}

        self._setup_routes()

    def _setup_routes(self) -> None:
        """Configure HTTP routes.

        Note: We use query parameters (?pane=xxx) instead of path parameters
        because tmux pane IDs start with '%' which causes URL encoding issues.
        """
        self.app.router.add_post("/complete", self.handle_complete)
        self.app.router.add_post("/exited", self.handle_exited)
        self.app.router.add_get("/health", self.handle_health)

    async def start(self) -> None:
        """Start the HTTP server."""
        self.runner = web.AppRunner(self.app)
        await self.runner.setup()
        self.site = web.TCPSite(self.runner, "127.0.0.1", self.port)
        await self.site.start()

    async def stop(self) -> None:
        """Stop the HTTP server."""
        if self.runner:
            await self.runner.cleanup()
            self.runner = None
            self.site = None

    async def handle_complete(self, request: web.Request) -> web.Response:
        """Handle POST /complete - signal task completion.

        Reads pane ID from POST body (application/x-www-form-urlencoded).
        Validates pane ID format before processing.
        """
        data = await request.post()
        pane_id = data.get("pane", "")
        if pane_id and _is_valid_pane_id(pane_id) and pane_id in self._complete_events:
            self._complete_events[pane_id].set()
        return web.Response(text="ok")

    async def handle_exited(self, request: web.Request) -> web.Response:
        """Handle POST /exited - signal session end.

        Reads pane ID from POST body (application/x-www-form-urlencoded).
        Validates pane ID format before processing.
        """
        data = await request.post()
        pane_id = data.get("pane", "")
        if pane_id and _is_valid_pane_id(pane_id) and pane_id in self._exited_events:
            self._exited_events[pane_id].set()
        return web.Response(text="ok")

    async def handle_health(self, request: web.Request) -> web.Response:
        """Handle GET /health - health check endpoint."""
        return web.Response(text="ok")

    def register_pane(self, pane_id: str) -> None:
        """Register a pane for completion tracking."""
        self._complete_events[pane_id] = asyncio.Event()
        self._exited_events[pane_id] = asyncio.Event()

    def unregister_pane(self, pane_id: str) -> None:
        """Unregister a pane from completion tracking."""
        self._complete_events.pop(pane_id, None)
        self._exited_events.pop(pane_id, None)

    async def wait_for_complete(self, pane_id: str, timeout: float) -> bool:
        """Wait for completion signal for a pane.

        Args:
            pane_id: The tmux pane ID to wait for
            timeout: Maximum time to wait in seconds

        Returns:
            True if completion signal received, False if timeout
        """
        if pane_id not in self._complete_events:
            return False

        try:
            await asyncio.wait_for(
                self._complete_events[pane_id].wait(), timeout=timeout
            )
            return True
        except asyncio.TimeoutError:
            return False

    async def wait_for_exited(self, pane_id: str, timeout: float) -> bool:
        """Wait for session end signal for a pane.

        Args:
            pane_id: The tmux pane ID to wait for
            timeout: Maximum time to wait in seconds

        Returns:
            True if exit signal received, False if timeout
        """
        if pane_id not in self._exited_events:
            return False

        try:
            await asyncio.wait_for(
                self._exited_events[pane_id].wait(), timeout=timeout
            )
            return True
        except asyncio.TimeoutError:
            return False


class ServerManager:
    """Manages server lifecycle from synchronous code.

    Bridges synchronous workflow code with the async HTTP server by running
    the server in a background thread with its own event loop.
    """

    DEFAULT_PORT = 7432
    MAX_PORT_ATTEMPTS = 100  # Try ports 7432-7531

    def __init__(self, port: int = DEFAULT_PORT) -> None:
        self.requested_port = port
        self.port: int = port  # Actual port (may differ if auto-found)
        self.server: Optional[OrchestratorServer] = None
        self._thread: Optional[threading.Thread] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._started = threading.Event()
        self._start_error: Optional[Exception] = None

    def _find_available_port(self, start_port: int) -> int:
        """Find first available port starting from start_port.

        Args:
            start_port: Port number to start searching from

        Returns:
            First available port number

        Raises:
            RuntimeError: If no port available within MAX_PORT_ATTEMPTS
        """
        for port in range(start_port, start_port + self.MAX_PORT_ATTEMPTS):
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                try:
                    s.bind(("127.0.0.1", port))
                    return port
                except OSError:
                    continue
        raise RuntimeError(
            f"No available port found in range {start_port}-"
            f"{start_port + self.MAX_PORT_ATTEMPTS}"
        )

    def _run_server(self) -> None:
        """Run the server in a background thread."""
        try:
            # Find available port
            self.port = self._find_available_port(self.requested_port)

            # Create new event loop for this thread
            self._loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self._loop)

            # Create and start server
            self.server = OrchestratorServer(self.port)
            self._loop.run_until_complete(self.server.start())

            # Signal that server is ready
            self._started.set()

            # Run forever until stopped
            self._loop.run_forever()

        except Exception as e:
            self._start_error = e
            self._started.set()
        finally:
            if self._loop:
                self._loop.close()
                self._loop = None

    def start(self) -> None:
        """Start server in background thread.

        Automatically finds an available port starting from requested_port.
        Updates self.port with the actual port used.

        Raises:
            RuntimeError: If server fails to start or no port available
        """
        self._thread = threading.Thread(target=self._run_server, daemon=True)
        self._thread.start()

        # Wait for server to be ready
        self._started.wait(timeout=10)

        if self._start_error:
            raise RuntimeError(f"Server failed to start: {self._start_error}")

    def stop(self) -> None:
        """Stop server and cleanup thread."""
        if self._loop and self.server:
            # Schedule server stop on the event loop
            future = asyncio.run_coroutine_threadsafe(
                self.server.stop(), self._loop
            )
            try:
                future.result(timeout=5)
            except Exception:
                pass

            # Stop the event loop
            self._loop.call_soon_threadsafe(self._loop.stop)

        if self._thread:
            self._thread.join(timeout=5)
            self._thread = None

        self.server = None

    def register_pane(self, pane_id: str) -> None:
        """Register a pane for completion tracking.

        This method blocks until the pane is registered.
        """
        if self.server and self._loop:
            # Use a thread-safe way to register and wait for completion
            future = asyncio.run_coroutine_threadsafe(
                self._async_register_pane(pane_id), self._loop
            )
            try:
                future.result(timeout=5)
            except Exception:
                pass

    async def _async_register_pane(self, pane_id: str) -> None:
        """Async helper to register pane."""
        if self.server:
            self.server.register_pane(pane_id)

    def unregister_pane(self, pane_id: str) -> None:
        """Unregister a pane from completion tracking."""
        if self.server and self._loop:
            self._loop.call_soon_threadsafe(
                self.server.unregister_pane, pane_id
            )

    def wait_for_complete(self, pane_id: str, timeout: float = 300) -> bool:
        """Synchronous wrapper for async wait_for_complete.

        Args:
            pane_id: The tmux pane ID to wait for
            timeout: Maximum time to wait in seconds

        Returns:
            True if completion signal received, False if timeout
        """
        if not self.server or not self._loop:
            return False

        future = asyncio.run_coroutine_threadsafe(
            self.server.wait_for_complete(pane_id, timeout), self._loop
        )
        try:
            return future.result(timeout=timeout + 1)
        except Exception:
            return False

    def wait_for_exited(self, pane_id: str, timeout: float = 30) -> bool:
        """Synchronous wrapper for async wait_for_exited.

        Args:
            pane_id: The tmux pane ID to wait for
            timeout: Maximum time to wait in seconds

        Returns:
            True if exit signal received, False if timeout
        """
        if not self.server or not self._loop:
            return False

        future = asyncio.run_coroutine_threadsafe(
            self.server.wait_for_exited(pane_id, timeout), self._loop
        )
        try:
            return future.result(timeout=timeout + 1)
        except Exception:
            return False
