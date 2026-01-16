/**
 * Renderer interface and base implementations for workflow events
 *
 * Renderers subscribe to events and display them in various formats:
 * - Console (colored terminal output)
 * - JSON (structured logging for CI)
 * - Silent (event capture for testing)
 */

import type { WorkflowEmitter } from './emitter';
import type {
  WorkflowEvent,
  WorkflowStartEvent,
  WorkflowCompleteEvent,
  Subscription,
} from './types';

// ============================================================================
// Renderer Configuration
// ============================================================================

export interface RendererConfig {
  /** Whether to show verbose output */
  verbose?: boolean;
  /** Whether to show timestamps */
  showTimestamps?: boolean;
  /** Whether to show event IDs */
  showEventIds?: boolean;
  /** Filter events by pattern (e.g., 'tool:*') */
  filterPattern?: string;
  /** Minimum log level */
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

// ============================================================================
// Renderer Interface
// ============================================================================

export interface WorkflowRenderer {
  /** Unique name for this renderer */
  readonly name: string;

  /**
   * Connect the renderer to an emitter
   * Returns a subscription that can be used to disconnect
   */
  connect(emitter: WorkflowEmitter): Subscription;

  /**
   * Render a single event
   */
  render(event: WorkflowEvent): void | Promise<void>;

  /**
   * Called when workflow starts (optional)
   */
  onWorkflowStart?(event: WorkflowStartEvent): void | Promise<void>;

  /**
   * Called when workflow completes (optional)
   */
  onWorkflowComplete?(event: WorkflowCompleteEvent): void | Promise<void>;

  /**
   * Get the current configuration
   */
  getConfig(): RendererConfig;

  /**
   * Update the configuration
   */
  setConfig(config: Partial<RendererConfig>): void;

  /**
   * Dispose of the renderer and clean up resources
   */
  dispose(): void;
}

// ============================================================================
// Base Renderer Class
// ============================================================================

export abstract class BaseRenderer implements WorkflowRenderer {
  abstract readonly name: string;

  protected config: Required<RendererConfig>;
  protected subscription?: Subscription;
  protected disposed = false;

  constructor(config: RendererConfig = {}) {
    this.config = {
      verbose: config.verbose ?? false,
      showTimestamps: config.showTimestamps ?? false,
      showEventIds: config.showEventIds ?? false,
      filterPattern: config.filterPattern ?? '',
      logLevel: config.logLevel ?? 'info',
    };
  }

  /**
   * Connect to an emitter and start receiving events
   */
  connect(emitter: WorkflowEmitter): Subscription {
    if (this.disposed) {
      throw new Error('Cannot connect disposed renderer');
    }

    // Disconnect from any previous emitter
    this.subscription?.unsubscribe();

    // Subscribe to all events
    this.subscription = emitter.onPattern('*', (event) => {
      if (this.shouldRender(event)) {
        this.render(event);
      }
    });

    return {
      unsubscribe: () => {
        this.subscription?.unsubscribe();
        this.subscription = undefined;
      },
    };
  }

  /**
   * Abstract render method - must be implemented by subclasses
   */
  abstract render(event: WorkflowEvent): void | Promise<void>;

  /**
   * Get current configuration
   */
  getConfig(): RendererConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<RendererConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Dispose of the renderer
   */
  dispose(): void {
    this.disposed = true;
    this.subscription?.unsubscribe();
    this.subscription = undefined;
  }

  /**
   * Check if the renderer has been disposed
   */
  isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Check if an event should be rendered based on config
   */
  protected shouldRender(event: WorkflowEvent): boolean {
    // Check filter pattern
    if (this.config.filterPattern) {
      const pattern = this.config.filterPattern;
      if (pattern.endsWith('*')) {
        const prefix = pattern.slice(0, -1);
        if (!event.type.startsWith(prefix)) {
          return false;
        }
      } else if (event.type !== pattern) {
        return false;
      }
    }

    // Check log level
    const eventLevel = this.getEventLogLevel(event);
    const levelPriority: Record<string, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
    };

    return levelPriority[eventLevel] >= levelPriority[this.config.logLevel];
  }

  /**
   * Get the log level for an event
   */
  protected getEventLogLevel(event: WorkflowEvent): 'debug' | 'info' | 'warn' | 'error' {
    // Error events
    if (event.type.endsWith(':error')) {
      return 'error';
    }

    // Progress events are typically debug level
    if (event.type.endsWith(':progress')) {
      return 'debug';
    }

    // Variable get/set are debug level
    if (event.type.startsWith('state:variable:')) {
      return 'debug';
    }

    // Node tools created is debug level
    if (event.type === 'node:tools:created') {
      return 'debug';
    }

    // Most events are info level
    return 'info';
  }

  /**
   * Format a timestamp for display
   */
  protected formatTimestamp(isoString: string): string {
    const date = new Date(isoString);
    return date.toISOString().split('T')[1].slice(0, 12);
  }

  /**
   * Format a duration in milliseconds
   */
  protected formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`;
    }
    if (ms < 60000) {
      return `${(ms / 1000).toFixed(1)}s`;
    }
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${mins}m ${secs}s`;
  }

  /**
   * Truncate a string to a maximum length
   */
  protected truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) {
      return str;
    }
    return str.slice(0, maxLength - 3) + '...';
  }
}

// ============================================================================
// Multi-Renderer Support
// ============================================================================

/**
 * Composite renderer that forwards events to multiple renderers
 */
export class CompositeRenderer implements WorkflowRenderer {
  readonly name = 'composite';

  private renderers: WorkflowRenderer[] = [];
  private subscription?: Subscription;
  private config: RendererConfig = {};

  constructor(renderers: WorkflowRenderer[] = []) {
    this.renderers = renderers;
  }

  /**
   * Add a renderer to the composite
   */
  add(renderer: WorkflowRenderer): void {
    this.renderers.push(renderer);
  }

  /**
   * Remove a renderer from the composite
   */
  remove(renderer: WorkflowRenderer): void {
    const index = this.renderers.indexOf(renderer);
    if (index !== -1) {
      this.renderers.splice(index, 1);
    }
  }

  /**
   * Connect all renderers to an emitter
   */
  connect(emitter: WorkflowEmitter): Subscription {
    const subscriptions = this.renderers.map((r) => r.connect(emitter));

    this.subscription = {
      unsubscribe: () => {
        for (const sub of subscriptions) {
          sub.unsubscribe();
        }
      },
    };

    return this.subscription;
  }

  /**
   * Render an event to all renderers
   */
  render(event: WorkflowEvent): void {
    for (const renderer of this.renderers) {
      renderer.render(event);
    }
  }

  onWorkflowStart(event: WorkflowStartEvent): void {
    for (const renderer of this.renderers) {
      renderer.onWorkflowStart?.(event);
    }
  }

  onWorkflowComplete(event: WorkflowCompleteEvent): void {
    for (const renderer of this.renderers) {
      renderer.onWorkflowComplete?.(event);
    }
  }

  getConfig(): RendererConfig {
    return this.config;
  }

  setConfig(config: Partial<RendererConfig>): void {
    this.config = { ...this.config, ...config };
    for (const renderer of this.renderers) {
      renderer.setConfig(config);
    }
  }

  dispose(): void {
    this.subscription?.unsubscribe();
    for (const renderer of this.renderers) {
      renderer.dispose();
    }
    this.renderers = [];
  }
}
