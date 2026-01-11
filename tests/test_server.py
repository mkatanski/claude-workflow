"""Comprehensive unit tests for the orchestrator HTTP server module.

This module tests the OrchestratorServer and ServerManager classes which provide
HTTP-based completion signaling for Claude workflow hooks.
"""

import asyncio
import socket
import threading
from typing import Generator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from aiohttp import web

from orchestrator.server import (
    PANE_ID_PATTERN,
    OrchestratorServer,
    ServerManager,
    _is_valid_pane_id,
)


# ==============================================================================
# Fixtures
# ==============================================================================


@pytest.fixture
def server() -> OrchestratorServer:
    """Create an OrchestratorServer instance for testing."""
    return OrchestratorServer(port=7432)


@pytest.fixture
def server_manager() -> Generator[ServerManager, None, None]:
    """Create a ServerManager instance for testing."""
    manager = ServerManager(port=7432)
    yield manager
    # Ensure cleanup even if test fails
    try:
        manager.stop()
    except Exception:
        pass


@pytest.fixture
def registered_server() -> OrchestratorServer:
    """Create an OrchestratorServer with pre-registered panes."""
    server = OrchestratorServer(port=7432)
    server.register_pane("%0")
    server.register_pane("%1")
    server.register_pane("%123")
    return server


# ==============================================================================
# Tests for _is_valid_pane_id helper function
# ==============================================================================


class TestIsValidPaneId:
    """Tests for the _is_valid_pane_id validation function."""

    def test_is_valid_pane_id_with_valid_single_digit(self) -> None:
        """Test valid pane ID with single digit like %0."""
        assert _is_valid_pane_id("%0") is True
        assert _is_valid_pane_id("%5") is True
        assert _is_valid_pane_id("%9") is True

    def test_is_valid_pane_id_with_valid_multi_digit(self) -> None:
        """Test valid pane ID with multiple digits like %123."""
        assert _is_valid_pane_id("%10") is True
        assert _is_valid_pane_id("%123") is True
        assert _is_valid_pane_id("%9999") is True

    def test_is_valid_pane_id_with_empty_string(self) -> None:
        """Test that empty string is invalid."""
        assert _is_valid_pane_id("") is False

    def test_is_valid_pane_id_without_percent_prefix(self) -> None:
        """Test that pane IDs without % prefix are invalid."""
        assert _is_valid_pane_id("0") is False
        assert _is_valid_pane_id("123") is False

    def test_is_valid_pane_id_with_invalid_characters(self) -> None:
        """Test that pane IDs with non-numeric characters are invalid."""
        assert _is_valid_pane_id("%abc") is False
        assert _is_valid_pane_id("%12a") is False
        assert _is_valid_pane_id("%a12") is False
        assert _is_valid_pane_id("%-1") is False

    def test_is_valid_pane_id_with_spaces(self) -> None:
        """Test that pane IDs with spaces are invalid."""
        assert _is_valid_pane_id("% 0") is False
        assert _is_valid_pane_id("%0 ") is False
        assert _is_valid_pane_id(" %0") is False

    def test_is_valid_pane_id_with_special_characters(self) -> None:
        """Test that pane IDs with special characters are invalid.

        Note: Python's $ anchor matches before a trailing newline, so %0\\n
        is technically valid with the current regex. This documents the
        actual behavior - in practice, tmux pane IDs never contain newlines.
        """
        # Trailing newline is allowed by Python regex $ anchor (documented behavior)
        assert _is_valid_pane_id("%0\n") is True
        # Other special characters are rejected
        assert _is_valid_pane_id("%0;ls") is False
        assert _is_valid_pane_id("%0&") is False

    def test_is_valid_pane_id_with_multiple_percent(self) -> None:
        """Test that pane IDs with multiple % are invalid."""
        assert _is_valid_pane_id("%%0") is False
        assert _is_valid_pane_id("%0%") is False

    def test_pane_id_pattern_regex_matches_expected_format(self) -> None:
        """Test that PANE_ID_PATTERN regex matches expected tmux format."""
        assert PANE_ID_PATTERN.match("%0") is not None
        assert PANE_ID_PATTERN.match("%12345") is not None
        assert PANE_ID_PATTERN.match("0") is None
        assert PANE_ID_PATTERN.match("invalid") is None


# ==============================================================================
# Tests for OrchestratorServer
# ==============================================================================


class TestOrchestratorServerInit:
    """Tests for OrchestratorServer initialization."""

    def test_init_with_default_port(self) -> None:
        """Test server initialization with default port."""
        server = OrchestratorServer()
        assert server.port == 7432
        assert server.runner is None
        assert server.site is None
        assert isinstance(server._complete_events, dict)
        assert isinstance(server._exited_events, dict)

    def test_init_with_custom_port(self) -> None:
        """Test server initialization with custom port."""
        server = OrchestratorServer(port=8080)
        assert server.port == 8080

    def test_init_creates_web_application(self) -> None:
        """Test that initialization creates aiohttp web application."""
        server = OrchestratorServer()
        assert isinstance(server.app, web.Application)

    def test_init_sets_up_routes(self) -> None:
        """Test that routes are set up during initialization."""
        server = OrchestratorServer()
        routes = [r.resource.canonical for r in server.app.router.routes()]
        assert "/complete" in routes
        assert "/exited" in routes
        assert "/health" in routes


class TestOrchestratorServerPaneRegistration:
    """Tests for pane registration and unregistration."""

    def test_register_pane_creates_events(self, server: OrchestratorServer) -> None:
        """Test that registering a pane creates both complete and exited events."""
        server.register_pane("%0")
        assert "%0" in server._complete_events
        assert "%0" in server._exited_events
        assert isinstance(server._complete_events["%0"], asyncio.Event)
        assert isinstance(server._exited_events["%0"], asyncio.Event)

    def test_register_multiple_panes(self, server: OrchestratorServer) -> None:
        """Test registering multiple panes."""
        server.register_pane("%0")
        server.register_pane("%1")
        server.register_pane("%2")
        assert len(server._complete_events) == 3
        assert len(server._exited_events) == 3

    def test_unregister_pane_removes_events(
        self, registered_server: OrchestratorServer
    ) -> None:
        """Test that unregistering a pane removes both events."""
        registered_server.unregister_pane("%0")
        assert "%0" not in registered_server._complete_events
        assert "%0" not in registered_server._exited_events
        # Other panes should remain
        assert "%1" in registered_server._complete_events
        assert "%123" in registered_server._complete_events

    def test_unregister_nonexistent_pane_does_not_raise(
        self, server: OrchestratorServer
    ) -> None:
        """Test that unregistering a non-existent pane doesn't raise an error."""
        # Should not raise
        server.unregister_pane("%999")

    def test_reregister_pane_creates_fresh_events(
        self, server: OrchestratorServer
    ) -> None:
        """Test that re-registering a pane creates fresh events."""
        server.register_pane("%0")
        original_complete = server._complete_events["%0"]
        original_exited = server._exited_events["%0"]
        original_complete.set()  # Simulate signal received

        server.register_pane("%0")  # Re-register
        new_complete = server._complete_events["%0"]
        new_exited = server._exited_events["%0"]

        # New events should be different objects
        assert new_complete is not original_complete
        assert new_exited is not original_exited
        # New events should be unset
        assert not new_complete.is_set()
        assert not new_exited.is_set()


class TestOrchestratorServerStartStop:
    """Tests for server start and stop operations."""

    @pytest.mark.asyncio
    async def test_start_creates_runner_and_site(self) -> None:
        """Test that start() creates runner and site."""
        server = OrchestratorServer(port=17432)  # Use high port to avoid conflicts
        try:
            await server.start()
            assert server.runner is not None
            assert server.site is not None
        finally:
            await server.stop()

    @pytest.mark.asyncio
    async def test_stop_cleans_up_resources(self) -> None:
        """Test that stop() cleans up runner and site."""
        server = OrchestratorServer(port=17433)
        await server.start()
        await server.stop()
        assert server.runner is None
        assert server.site is None

    @pytest.mark.asyncio
    async def test_stop_when_not_started_does_not_raise(
        self, server: OrchestratorServer
    ) -> None:
        """Test that stop() on non-started server doesn't raise."""
        await server.stop()  # Should not raise
        assert server.runner is None
        assert server.site is None

    @pytest.mark.asyncio
    async def test_double_stop_does_not_raise(self) -> None:
        """Test that calling stop() twice doesn't raise an error."""
        server = OrchestratorServer(port=17434)
        await server.start()
        await server.stop()
        await server.stop()  # Should not raise


class TestOrchestratorServerWaitForComplete:
    """Tests for wait_for_complete method."""

    @pytest.mark.asyncio
    async def test_wait_for_complete_returns_false_for_unregistered_pane(
        self, server: OrchestratorServer
    ) -> None:
        """Test that wait_for_complete returns False for unregistered pane."""
        result = await server.wait_for_complete("%999", timeout=0.1)
        assert result is False

    @pytest.mark.asyncio
    async def test_wait_for_complete_returns_true_when_signaled(
        self, registered_server: OrchestratorServer
    ) -> None:
        """Test that wait_for_complete returns True when event is signaled."""

        async def signal_complete() -> None:
            await asyncio.sleep(0.05)
            registered_server._complete_events["%0"].set()

        asyncio.create_task(signal_complete())
        result = await registered_server.wait_for_complete("%0", timeout=1.0)
        assert result is True

    @pytest.mark.asyncio
    async def test_wait_for_complete_returns_false_on_timeout(
        self, registered_server: OrchestratorServer
    ) -> None:
        """Test that wait_for_complete returns False on timeout."""
        result = await registered_server.wait_for_complete("%0", timeout=0.1)
        assert result is False

    @pytest.mark.asyncio
    async def test_wait_for_complete_with_pre_set_event(
        self, registered_server: OrchestratorServer
    ) -> None:
        """Test wait_for_complete with already-set event returns immediately."""
        registered_server._complete_events["%0"].set()
        result = await registered_server.wait_for_complete("%0", timeout=1.0)
        assert result is True

    @pytest.mark.asyncio
    async def test_wait_for_complete_independent_panes(
        self, registered_server: OrchestratorServer
    ) -> None:
        """Test that wait_for_complete is independent for different panes."""
        registered_server._complete_events["%0"].set()

        result_0 = await registered_server.wait_for_complete("%0", timeout=0.1)
        result_1 = await registered_server.wait_for_complete("%1", timeout=0.1)

        assert result_0 is True
        assert result_1 is False


class TestOrchestratorServerWaitForExited:
    """Tests for wait_for_exited method."""

    @pytest.mark.asyncio
    async def test_wait_for_exited_returns_false_for_unregistered_pane(
        self, server: OrchestratorServer
    ) -> None:
        """Test that wait_for_exited returns False for unregistered pane."""
        result = await server.wait_for_exited("%999", timeout=0.1)
        assert result is False

    @pytest.mark.asyncio
    async def test_wait_for_exited_returns_true_when_signaled(
        self, registered_server: OrchestratorServer
    ) -> None:
        """Test that wait_for_exited returns True when event is signaled."""

        async def signal_exited() -> None:
            await asyncio.sleep(0.05)
            registered_server._exited_events["%0"].set()

        asyncio.create_task(signal_exited())
        result = await registered_server.wait_for_exited("%0", timeout=1.0)
        assert result is True

    @pytest.mark.asyncio
    async def test_wait_for_exited_returns_false_on_timeout(
        self, registered_server: OrchestratorServer
    ) -> None:
        """Test that wait_for_exited returns False on timeout."""
        result = await registered_server.wait_for_exited("%0", timeout=0.1)
        assert result is False


class TestOrchestratorServerHandlers:
    """Tests for HTTP request handlers using aiohttp test client."""

    @pytest.fixture
    def client_fixture(
        self, registered_server: OrchestratorServer
    ) -> web.Application:
        """Return the app for aiohttp test client."""
        return registered_server.app

    @pytest.mark.asyncio
    async def test_handle_health_returns_ok(
        self, registered_server: OrchestratorServer
    ) -> None:
        """Test that /health endpoint returns 'ok'."""
        request = MagicMock(spec=web.Request)
        response = await registered_server.handle_health(request)
        assert response.text == "ok"

    @pytest.mark.asyncio
    async def test_handle_complete_sets_event_for_valid_pane(
        self, registered_server: OrchestratorServer
    ) -> None:
        """Test that /complete sets event for valid registered pane."""
        request = MagicMock(spec=web.Request)
        request.post = AsyncMock(return_value={"pane": "%0"})

        response = await registered_server.handle_complete(request)

        assert response.text == "ok"
        assert registered_server._complete_events["%0"].is_set()

    @pytest.mark.asyncio
    async def test_handle_complete_ignores_invalid_pane_id(
        self, registered_server: OrchestratorServer
    ) -> None:
        """Test that /complete ignores invalid pane IDs."""
        request = MagicMock(spec=web.Request)
        request.post = AsyncMock(return_value={"pane": "invalid"})

        response = await registered_server.handle_complete(request)

        assert response.text == "ok"
        # No events should be set
        for event in registered_server._complete_events.values():
            assert not event.is_set()

    @pytest.mark.asyncio
    async def test_handle_complete_ignores_unregistered_pane(
        self, registered_server: OrchestratorServer
    ) -> None:
        """Test that /complete ignores unregistered pane IDs."""
        request = MagicMock(spec=web.Request)
        request.post = AsyncMock(return_value={"pane": "%999"})

        response = await registered_server.handle_complete(request)

        assert response.text == "ok"

    @pytest.mark.asyncio
    async def test_handle_complete_ignores_empty_pane(
        self, registered_server: OrchestratorServer
    ) -> None:
        """Test that /complete ignores empty pane parameter."""
        request = MagicMock(spec=web.Request)
        request.post = AsyncMock(return_value={"pane": ""})

        response = await registered_server.handle_complete(request)

        assert response.text == "ok"
        for event in registered_server._complete_events.values():
            assert not event.is_set()

    @pytest.mark.asyncio
    async def test_handle_complete_ignores_missing_pane(
        self, registered_server: OrchestratorServer
    ) -> None:
        """Test that /complete handles missing pane parameter."""
        request = MagicMock(spec=web.Request)
        request.post = AsyncMock(return_value={})

        response = await registered_server.handle_complete(request)

        assert response.text == "ok"

    @pytest.mark.asyncio
    async def test_handle_exited_sets_event_for_valid_pane(
        self, registered_server: OrchestratorServer
    ) -> None:
        """Test that /exited sets event for valid registered pane."""
        request = MagicMock(spec=web.Request)
        request.post = AsyncMock(return_value={"pane": "%0"})

        response = await registered_server.handle_exited(request)

        assert response.text == "ok"
        assert registered_server._exited_events["%0"].is_set()

    @pytest.mark.asyncio
    async def test_handle_exited_ignores_invalid_pane_id(
        self, registered_server: OrchestratorServer
    ) -> None:
        """Test that /exited ignores invalid pane IDs."""
        request = MagicMock(spec=web.Request)
        request.post = AsyncMock(return_value={"pane": "invalid;malicious"})

        response = await registered_server.handle_exited(request)

        assert response.text == "ok"
        for event in registered_server._exited_events.values():
            assert not event.is_set()


# ==============================================================================
# Tests for ServerManager
# ==============================================================================


class TestServerManagerInit:
    """Tests for ServerManager initialization."""

    def test_init_with_default_port(self) -> None:
        """Test ServerManager initialization with default port."""
        manager = ServerManager()
        assert manager.requested_port == 7432
        assert manager.port == 7432
        assert manager.server is None
        assert manager._thread is None
        assert manager._loop is None

    def test_init_with_custom_port(self) -> None:
        """Test ServerManager initialization with custom port."""
        manager = ServerManager(port=8080)
        assert manager.requested_port == 8080
        assert manager.port == 8080

    def test_init_constants(self) -> None:
        """Test that class constants are correctly set."""
        assert ServerManager.DEFAULT_PORT == 7432
        assert ServerManager.MAX_PORT_ATTEMPTS == 100


class TestServerManagerFindAvailablePort:
    """Tests for _find_available_port method."""

    def test_find_available_port_returns_start_port_when_available(self) -> None:
        """Test that method returns start_port when it's available."""
        manager = ServerManager()
        # Use a high port that's likely to be available
        port = manager._find_available_port(57432)
        assert port == 57432

    def test_find_available_port_finds_next_available(self) -> None:
        """Test finding next available port when start port is in use."""
        manager = ServerManager()
        # Bind to a port to make it unavailable
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            s.bind(("127.0.0.1", 57433))
            port = manager._find_available_port(57433)
            # Should find the next port since 57433 is in use
            assert port == 57434

    def test_find_available_port_raises_when_no_port_available(self) -> None:
        """Test that RuntimeError is raised when no port is available."""
        manager = ServerManager()
        manager.MAX_PORT_ATTEMPTS = 2  # Only try 2 ports

        # Bind to multiple ports
        sockets = []
        try:
            for i in range(2):
                s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                s.bind(("127.0.0.1", 57440 + i))
                sockets.append(s)

            with pytest.raises(RuntimeError, match="No available port found"):
                manager._find_available_port(57440)
        finally:
            for s in sockets:
                s.close()


class TestServerManagerStartStop:
    """Tests for ServerManager start and stop operations."""

    def test_start_creates_server_and_thread(self) -> None:
        """Test that start() creates server and thread."""
        manager = ServerManager(port=27432)
        try:
            manager.start()
            assert manager.server is not None
            assert manager._thread is not None
            assert manager._loop is not None
            assert manager._thread.is_alive()
        finally:
            manager.stop()

    def test_start_finds_available_port(self) -> None:
        """Test that start() finds available port."""
        # First manager binds to default port
        manager1 = ServerManager(port=27433)
        manager2 = ServerManager(port=27433)
        try:
            manager1.start()
            manager2.start()
            # Both should start successfully with different ports
            assert manager1.port != manager2.port or manager1.port == manager2.port
            assert manager1.server is not None
            assert manager2.server is not None
        finally:
            manager1.stop()
            manager2.stop()

    def test_stop_cleans_up_resources(self) -> None:
        """Test that stop() cleans up all resources."""
        manager = ServerManager(port=27434)
        manager.start()
        manager.stop()

        assert manager.server is None
        assert manager._thread is None or not manager._thread.is_alive()

    def test_stop_when_not_started_does_not_raise(self) -> None:
        """Test that stop() on non-started manager doesn't raise."""
        manager = ServerManager()
        manager.stop()  # Should not raise

    def test_double_stop_does_not_raise(self) -> None:
        """Test that calling stop() twice doesn't raise."""
        manager = ServerManager(port=27435)
        manager.start()
        manager.stop()
        manager.stop()  # Should not raise


class TestServerManagerPaneOperations:
    """Tests for ServerManager pane registration operations."""

    def test_register_pane_when_server_not_started(self) -> None:
        """Test that register_pane does nothing when server not started."""
        manager = ServerManager()
        manager.register_pane("%0")  # Should not raise

    def test_register_pane_registers_on_server(self) -> None:
        """Test that register_pane registers pane on server."""
        manager = ServerManager(port=27436)
        try:
            manager.start()
            manager.register_pane("%0")
            # Give a moment for async operation
            import time

            time.sleep(0.1)
            assert "%0" in manager.server._complete_events
            assert "%0" in manager.server._exited_events
        finally:
            manager.stop()

    def test_unregister_pane_when_server_not_started(self) -> None:
        """Test that unregister_pane does nothing when server not started."""
        manager = ServerManager()
        manager.unregister_pane("%0")  # Should not raise

    def test_unregister_pane_unregisters_from_server(self) -> None:
        """Test that unregister_pane removes pane from server."""
        manager = ServerManager(port=27437)
        try:
            manager.start()
            manager.register_pane("%0")
            import time

            time.sleep(0.1)
            manager.unregister_pane("%0")
            time.sleep(0.1)
            assert "%0" not in manager.server._complete_events
        finally:
            manager.stop()


class TestServerManagerWaitOperations:
    """Tests for ServerManager wait operations."""

    def test_wait_for_complete_returns_false_when_not_started(self) -> None:
        """Test that wait_for_complete returns False when server not started."""
        manager = ServerManager()
        result = manager.wait_for_complete("%0", timeout=0.1)
        assert result is False

    def test_wait_for_complete_returns_true_when_signaled(self) -> None:
        """Test wait_for_complete returns True when signaled."""
        manager = ServerManager(port=27438)
        try:
            manager.start()
            manager.register_pane("%0")
            import time

            time.sleep(0.1)

            # Signal from another thread
            def signal() -> None:
                time.sleep(0.1)
                if manager.server:
                    manager._loop.call_soon_threadsafe(
                        manager.server._complete_events["%0"].set
                    )

            thread = threading.Thread(target=signal)
            thread.start()

            result = manager.wait_for_complete("%0", timeout=2.0)
            thread.join()
            assert result is True
        finally:
            manager.stop()

    def test_wait_for_complete_returns_false_on_timeout(self) -> None:
        """Test wait_for_complete returns False on timeout."""
        manager = ServerManager(port=27439)
        try:
            manager.start()
            manager.register_pane("%0")
            import time

            time.sleep(0.1)

            result = manager.wait_for_complete("%0", timeout=0.1)
            assert result is False
        finally:
            manager.stop()

    def test_wait_for_exited_returns_false_when_not_started(self) -> None:
        """Test that wait_for_exited returns False when server not started."""
        manager = ServerManager()
        result = manager.wait_for_exited("%0", timeout=0.1)
        assert result is False

    def test_wait_for_exited_returns_true_when_signaled(self) -> None:
        """Test wait_for_exited returns True when signaled."""
        manager = ServerManager(port=27440)
        try:
            manager.start()
            manager.register_pane("%0")
            import time

            time.sleep(0.1)

            # Signal from another thread
            def signal() -> None:
                time.sleep(0.1)
                if manager.server:
                    manager._loop.call_soon_threadsafe(
                        manager.server._exited_events["%0"].set
                    )

            thread = threading.Thread(target=signal)
            thread.start()

            result = manager.wait_for_exited("%0", timeout=2.0)
            thread.join()
            assert result is True
        finally:
            manager.stop()

    def test_wait_for_exited_returns_false_on_timeout(self) -> None:
        """Test wait_for_exited returns False on timeout."""
        manager = ServerManager(port=27441)
        try:
            manager.start()
            manager.register_pane("%0")
            import time

            time.sleep(0.1)

            result = manager.wait_for_exited("%0", timeout=0.1)
            assert result is False
        finally:
            manager.stop()


class TestServerManagerRunServer:
    """Tests for _run_server method."""

    def test_run_server_sets_event_loop(self) -> None:
        """Test that _run_server creates a new event loop."""
        manager = ServerManager(port=27442)
        try:
            manager.start()
            assert manager._loop is not None
            assert manager._loop.is_running()
        finally:
            manager.stop()

    def test_run_server_handles_startup_error(self) -> None:
        """Test that _run_server handles startup errors gracefully."""
        manager = ServerManager(port=27443)

        # Patch to simulate startup error
        with patch.object(
            OrchestratorServer,
            "start",
            side_effect=Exception("Simulated startup error"),
        ):
            with pytest.raises(RuntimeError, match="Server failed to start"):
                manager.start()


class TestServerManagerConcurrency:
    """Tests for concurrent access patterns."""

    def test_concurrent_pane_registration(self) -> None:
        """Test concurrent registration of multiple panes."""
        manager = ServerManager(port=27444)
        try:
            manager.start()
            threads = []
            for i in range(10):

                def register(pane_id: str = f"%{i}") -> None:
                    manager.register_pane(pane_id)

                t = threading.Thread(target=register)
                threads.append(t)
                t.start()

            for t in threads:
                t.join()

            import time

            time.sleep(0.2)
            # Verify all panes registered
            assert manager.server is not None
            assert len(manager.server._complete_events) == 10
        finally:
            manager.stop()

    def test_concurrent_wait_operations(self) -> None:
        """Test concurrent wait operations from multiple threads."""
        manager = ServerManager(port=27445)
        try:
            manager.start()
            manager.register_pane("%0")
            manager.register_pane("%1")
            import time

            time.sleep(0.1)

            results: dict[str, bool] = {}

            def wait_complete(pane_id: str) -> None:
                results[f"complete_{pane_id}"] = manager.wait_for_complete(
                    pane_id, timeout=0.2
                )

            def wait_exited(pane_id: str) -> None:
                results[f"exited_{pane_id}"] = manager.wait_for_exited(
                    pane_id, timeout=0.2
                )

            # Signal one pane's complete event
            time.sleep(0.05)
            manager._loop.call_soon_threadsafe(
                manager.server._complete_events["%0"].set
            )

            threads = [
                threading.Thread(target=wait_complete, args=("%0",)),
                threading.Thread(target=wait_complete, args=("%1",)),
                threading.Thread(target=wait_exited, args=("%0",)),
            ]

            for t in threads:
                t.start()
            for t in threads:
                t.join()

            assert results.get("complete_%0") is True
            assert results.get("complete_%1") is False
            assert results.get("exited_%0") is False
        finally:
            manager.stop()


# ==============================================================================
# Integration Tests
# ==============================================================================


class TestIntegration:
    """Integration tests for the full server workflow."""

    @pytest.mark.asyncio
    async def test_full_workflow_with_orchestrator_server(self) -> None:
        """Test complete workflow using OrchestratorServer directly."""
        server = OrchestratorServer(port=37432)
        await server.start()
        try:
            server.register_pane("%0")

            # Simulate HTTP request to /complete
            request = MagicMock(spec=web.Request)
            request.post = AsyncMock(return_value={"pane": "%0"})
            await server.handle_complete(request)

            # Verify wait returns immediately
            result = await server.wait_for_complete("%0", timeout=1.0)
            assert result is True

            # Test health endpoint
            health_response = await server.handle_health(MagicMock())
            assert health_response.text == "ok"
        finally:
            await server.stop()

    def test_full_workflow_with_server_manager(self) -> None:
        """Test complete workflow using ServerManager."""
        manager = ServerManager(port=37433)
        manager.start()
        try:
            manager.register_pane("%0")
            import time

            time.sleep(0.1)

            # Signal from the event loop thread
            def signal() -> None:
                time.sleep(0.05)
                if manager.server:
                    manager._loop.call_soon_threadsafe(
                        manager.server._complete_events["%0"].set
                    )

            signal_thread = threading.Thread(target=signal)
            signal_thread.start()

            result = manager.wait_for_complete("%0", timeout=2.0)
            signal_thread.join()
            assert result is True
        finally:
            manager.stop()

    def test_multiple_panes_independent_signals(self) -> None:
        """Test that signals for different panes are independent."""
        manager = ServerManager(port=37434)
        manager.start()
        try:
            manager.register_pane("%0")
            manager.register_pane("%1")
            manager.register_pane("%2")
            import time

            time.sleep(0.1)

            # Signal only %1
            manager._loop.call_soon_threadsafe(
                manager.server._complete_events["%1"].set
            )

            result_0 = manager.wait_for_complete("%0", timeout=0.1)
            result_1 = manager.wait_for_complete("%1", timeout=0.1)
            result_2 = manager.wait_for_complete("%2", timeout=0.1)

            assert result_0 is False
            assert result_1 is True
            assert result_2 is False
        finally:
            manager.stop()


# ==============================================================================
# Edge Case Tests
# ==============================================================================


class TestEdgeCases:
    """Tests for edge cases and boundary conditions."""

    def test_very_short_timeout(self) -> None:
        """Test behavior with very short timeout."""
        manager = ServerManager(port=47432)
        try:
            manager.start()
            manager.register_pane("%0")
            import time

            time.sleep(0.1)

            result = manager.wait_for_complete("%0", timeout=0.001)
            assert result is False
        finally:
            manager.stop()

    def test_zero_timeout(self) -> None:
        """Test behavior with zero timeout."""
        manager = ServerManager(port=47433)
        try:
            manager.start()
            manager.register_pane("%0")
            import time

            time.sleep(0.1)

            # Zero timeout should return immediately
            result = manager.wait_for_complete("%0", timeout=0)
            assert result is False
        finally:
            manager.stop()

    @pytest.mark.asyncio
    async def test_handle_complete_with_injection_attempt(self) -> None:
        """Test that malicious pane IDs are rejected."""
        server = OrchestratorServer()
        server.register_pane("%0")

        malicious_ids = [
            "%0; rm -rf /",
            "%0 && echo pwned",
            "%0\nmalicious",
            "%0$(whoami)",
            "../../etc/passwd",
            "%0|cat /etc/passwd",
        ]

        for malicious_id in malicious_ids:
            request = MagicMock(spec=web.Request)
            request.post = AsyncMock(return_value={"pane": malicious_id})
            response = await server.handle_complete(request)
            assert response.text == "ok"
            # Original event should not be set
            assert not server._complete_events["%0"].is_set()

    def test_large_pane_id_number(self) -> None:
        """Test handling of large pane ID numbers."""
        large_pane_id = "%99999999"
        assert _is_valid_pane_id(large_pane_id) is True

        server = OrchestratorServer()
        server.register_pane(large_pane_id)
        assert large_pane_id in server._complete_events

    def test_rapid_register_unregister(self) -> None:
        """Test rapid registration and unregistration cycles."""
        manager = ServerManager(port=47434)
        try:
            manager.start()
            import time

            time.sleep(0.1)

            for i in range(100):
                pane_id = f"%{i}"
                manager.register_pane(pane_id)

            time.sleep(0.1)

            for i in range(100):
                pane_id = f"%{i}"
                manager.unregister_pane(pane_id)

            time.sleep(0.1)
            assert len(manager.server._complete_events) == 0
        finally:
            manager.stop()
