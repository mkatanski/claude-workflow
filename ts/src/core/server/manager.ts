/**
 * HTTP server for receiving completion signals from Claude hooks.
 *
 * This module provides a local HTTP server that receives completion signals
 * via curl from Claude hooks, replacing the filesystem-based marker file system.
 */

// Server type from Bun - use unknown for WebSocketData generic
type BunServer = ReturnType<typeof Bun.serve>;

/**
 * Tmux pane IDs follow the pattern %<number> (e.g., %0, %123)
 */
const PANE_ID_PATTERN = /^%\d+$/;

function isValidPaneId(paneId: string): boolean {
  return PANE_ID_PATTERN.test(paneId);
}

/**
 * Promise-based event that can be awaited and resolved from external code.
 */
class AsyncEvent {
  private _resolve: (() => void) | null = null;
  private _promise: Promise<void>;
  private _isSet = false;

  constructor() {
    this._promise = new Promise<void>((resolve) => {
      this._resolve = resolve;
    });
  }

  set(): void {
    if (this._resolve && !this._isSet) {
      this._isSet = true;
      this._resolve();
    }
  }

  isSet(): boolean {
    return this._isSet;
  }

  async wait(timeout?: number): Promise<boolean> {
    if (timeout === undefined) {
      await this._promise;
      return true;
    }

    return Promise.race([
      this._promise.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeout)),
    ]);
  }

  reset(): void {
    if (this._isSet) {
      this._isSet = false;
      this._promise = new Promise<void>((resolve) => {
        this._resolve = resolve;
      });
    }
  }
}

/**
 * HTTP server for handling completion signals from Claude hooks.
 */
export class OrchestratorServer {
  private port: number;
  private server: BunServer | null = null;

  // Per-pane completion events
  private completeEvents: Map<string, AsyncEvent> = new Map();
  private exitedEvents: Map<string, AsyncEvent> = new Map();

  constructor(port: number = 7432) {
    this.port = port;
  }

  getPort(): number {
    return this.port;
  }

  /**
   * Start the HTTP server.
   */
  async start(): Promise<void> {
    this.server = Bun.serve({
      port: this.port,
      hostname: "127.0.0.1",
      fetch: async (req) => {
        const url = new URL(req.url);
        const method = req.method;

        // Health check endpoint
        if (url.pathname === "/health" && method === "GET") {
          return new Response("ok");
        }

        // Complete endpoint - signal task completion
        if (url.pathname === "/complete" && method === "POST") {
          const formData = await req.formData().catch(() => new FormData());
          const paneId = formData.get("pane")?.toString() ?? "";
          const project = formData.get("project")?.toString() ?? "";

          if (!paneId || !isValidPaneId(paneId) || !project) {
            return new Response("Bad Request: pane and project required", { status: 400 });
          }

          const event = this.completeEvents.get(paneId);
          if (event) {
            event.set();
          }
          return new Response("ok");
        }

        // Exited endpoint - signal session end
        if (url.pathname === "/exited" && method === "POST") {
          const formData = await req.formData().catch(() => new FormData());
          const paneId = formData.get("pane")?.toString() ?? "";
          const project = formData.get("project")?.toString() ?? "";

          if (!paneId || !isValidPaneId(paneId) || !project) {
            return new Response("Bad Request: pane and project required", { status: 400 });
          }

          const event = this.exitedEvents.get(paneId);
          if (event) {
            event.set();
          }
          return new Response("ok");
        }

        return new Response("Not Found", { status: 404 });
      },
    });
  }

  /**
   * Stop the HTTP server.
   */
  async stop(): Promise<void> {
    if (this.server) {
      this.server.stop(true);
      this.server = null;
    }
  }

  /**
   * Register a pane for completion tracking.
   */
  registerPane(paneId: string): void {
    this.completeEvents.set(paneId, new AsyncEvent());
    this.exitedEvents.set(paneId, new AsyncEvent());
  }

  /**
   * Unregister a pane from completion tracking.
   */
  unregisterPane(paneId: string): void {
    this.completeEvents.delete(paneId);
    this.exitedEvents.delete(paneId);
  }

  /**
   * Wait for completion signal for a pane.
   *
   * @param paneId - The tmux pane ID to wait for
   * @param timeout - Maximum time to wait in milliseconds
   * @returns True if completion signal received, false if timeout
   */
  async waitForComplete(paneId: string, timeout: number): Promise<boolean> {
    const event = this.completeEvents.get(paneId);
    if (!event) {
      return false;
    }
    return event.wait(timeout);
  }

  /**
   * Wait for session end signal for a pane.
   *
   * @param paneId - The tmux pane ID to wait for
   * @param timeout - Maximum time to wait in milliseconds
   * @returns True if exit signal received, false if timeout
   */
  async waitForExited(paneId: string, timeout: number): Promise<boolean> {
    const event = this.exitedEvents.get(paneId);
    if (!event) {
      return false;
    }
    return event.wait(timeout);
  }

  /**
   * Reset completion event for a pane (for reuse).
   */
  resetComplete(paneId: string): void {
    const event = this.completeEvents.get(paneId);
    if (event) {
      event.reset();
    }
  }
}

/**
 * Manages server lifecycle.
 *
 * In Bun, we don't need a separate thread since Bun.serve is non-blocking.
 */
export class ServerManager {
  static readonly DEFAULT_PORT = 7432;
  static readonly MAX_PORT_ATTEMPTS = 100;

  private requestedPort: number;
  private _port: number;
  private server: OrchestratorServer | null = null;

  constructor(port: number = ServerManager.DEFAULT_PORT) {
    this.requestedPort = port;
    this._port = port;
  }

  get port(): number {
    return this._port;
  }

  /**
   * Find first available port starting from startPort.
   */
  private async findAvailablePort(startPort: number): Promise<number> {
    for (
      let port = startPort;
      port < startPort + ServerManager.MAX_PORT_ATTEMPTS;
      port++
    ) {
      try {
        // Try to bind to the port
        const testServer = Bun.serve({
          port,
          hostname: "127.0.0.1",
          fetch: () => new Response("test"),
        });
        testServer.stop(true);
        return port;
      } catch {
        // Port is in use, try next
        continue;
      }
    }
    throw new Error(
      `No available port found in range ${startPort}-${startPort + ServerManager.MAX_PORT_ATTEMPTS}`
    );
  }

  /**
   * Start server.
   *
   * Automatically finds an available port starting from requestedPort.
   * Updates port with the actual port used.
   */
  async start(): Promise<void> {
    this._port = await this.findAvailablePort(this.requestedPort);
    this.server = new OrchestratorServer(this._port);
    await this.server.start();
  }

  /**
   * Stop server and cleanup.
   */
  async stop(): Promise<void> {
    if (this.server) {
      await this.server.stop();
      this.server = null;
    }
  }

  /**
   * Register a pane for completion tracking.
   */
  registerPane(paneId: string): void {
    if (this.server) {
      this.server.registerPane(paneId);
    }
  }

  /**
   * Unregister a pane from completion tracking.
   */
  unregisterPane(paneId: string): void {
    if (this.server) {
      this.server.unregisterPane(paneId);
    }
  }

  /**
   * Wait for completion signal for a pane.
   *
   * @param paneId - The tmux pane ID to wait for
   * @param timeout - Maximum time to wait in milliseconds (default: 300000 = 5 min)
   * @returns True if completion signal received, false if timeout
   */
  async waitForComplete(
    paneId: string,
    timeout: number = 300_000
  ): Promise<boolean> {
    if (!this.server) {
      return false;
    }
    return this.server.waitForComplete(paneId, timeout);
  }

  /**
   * Wait for session end signal for a pane.
   *
   * @param paneId - The tmux pane ID to wait for
   * @param timeout - Maximum time to wait in milliseconds (default: 30000 = 30 sec)
   * @returns True if exit signal received, false if timeout
   */
  async waitForExited(paneId: string, timeout: number = 30_000): Promise<boolean> {
    if (!this.server) {
      return false;
    }
    return this.server.waitForExited(paneId, timeout);
  }

  /**
   * Reset completion event for a pane.
   */
  resetComplete(paneId: string): void {
    if (this.server) {
      this.server.resetComplete(paneId);
    }
  }
}
