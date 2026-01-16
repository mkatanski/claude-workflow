/**
 * WorkflowEmitter - Core event emitter for workflow execution
 *
 * Features:
 * - Type-safe event emission and subscription
 * - Pattern-based subscriptions (e.g., 'tool:*', 'node:*')
 * - Async and sync emission modes
 * - Event correlation and hierarchy tracking
 * - Scoped contexts for contextual event emission
 * - Child emitters for sub-component isolation
 */

import { randomUUID } from 'crypto';
import type {
  WorkflowEvent,
  WorkflowEventType,
  EventByType,
  PayloadByType,
  EventHandler,
  EventPattern,
  EventContext,
  EventMetadata,
  Subscription,
} from './types';

// ============================================================================
// Types
// ============================================================================

interface HandlerEntry<T extends WorkflowEventType = WorkflowEventType> {
  id: string;
  handler: EventHandler<T>;
  once: boolean;
}

interface PatternHandlerEntry {
  id: string;
  pattern: EventPattern;
  regex: RegExp;
  handler: EventHandler;
  once: boolean;
}

interface ScopedEmission {
  eventId: string;
  endScope: () => void;
}

export interface EmitterConfig {
  /** Whether to use async (non-blocking) emission by default */
  asyncByDefault?: boolean;
  /** Maximum number of listeners per event type (0 = unlimited) */
  maxListeners?: number;
  /** Enable debug logging */
  debug?: boolean;
}

// ============================================================================
// Pattern Matching Utilities
// ============================================================================

function patternToRegex(pattern: EventPattern): RegExp {
  if (pattern === '*') {
    return /^.+$/;
  }

  // Convert glob-like pattern to regex
  // e.g., 'tool:*' -> /^tool:[^:]+$/
  // e.g., 'tool:bash:*' -> /^tool:bash:[^:]+$/
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const regexStr = escaped.replace(/\*/g, '[^:]+');
  return new RegExp(`^${regexStr}$`);
}

function matchesPattern(eventType: string, pattern: EventPattern): boolean {
  if (pattern === '*') {
    return true;
  }

  const regex = patternToRegex(pattern);
  return regex.test(eventType);
}

// ============================================================================
// WorkflowEmitter Class
// ============================================================================

export class WorkflowEmitter {
  private handlers: Map<WorkflowEventType, HandlerEntry[]> = new Map();
  private patternHandlers: PatternHandlerEntry[] = [];
  private context: EventContext = {};
  private correlationId: string;
  private parent?: WorkflowEmitter;
  private children: Set<WorkflowEmitter> = new Set();
  private config: Required<EmitterConfig>;
  private scopeStack: string[] = [];
  private disposed = false;
  private pendingEvents = 0;
  private flushResolvers: Array<() => void> = [];

  constructor(config: EmitterConfig = {}) {
    this.config = {
      asyncByDefault: config.asyncByDefault ?? true,
      maxListeners: config.maxListeners ?? 0,
      debug: config.debug ?? false,
    };
    this.correlationId = randomUUID();
  }

  // ==========================================================================
  // Context Management
  // ==========================================================================

  /**
   * Set context that will be included in all emitted events
   */
  setContext(context: Partial<EventContext>): void {
    this.context = { ...this.context, ...context };
  }

  /**
   * Get the current context
   */
  getContext(): EventContext {
    return { ...this.context };
  }

  /**
   * Clear the context
   */
  clearContext(): void {
    this.context = {};
  }

  /**
   * Get the correlation ID for this emitter
   */
  getCorrelationId(): string {
    return this.correlationId;
  }

  /**
   * Set the correlation ID (useful when resuming workflows)
   */
  setCorrelationId(id: string): void {
    this.correlationId = id;
  }

  // ==========================================================================
  // Subscription Methods
  // ==========================================================================

  /**
   * Subscribe to a specific event type
   */
  on<T extends WorkflowEventType>(
    eventType: T,
    handler: EventHandler<T>
  ): Subscription {
    this.checkDisposed();
    this.checkMaxListeners(eventType);

    const entry: HandlerEntry = {
      id: randomUUID(),
      handler: handler as unknown as EventHandler,
      once: false,
    };

    const handlers = this.handlers.get(eventType) ?? [];
    handlers.push(entry);
    this.handlers.set(eventType, handlers);

    this.debug(`Subscribed to '${eventType}' (id: ${entry.id})`);

    return {
      unsubscribe: () => this.removeHandler(eventType, entry.id),
    };
  }

  /**
   * Subscribe to a specific event type, handler fires only once
   */
  once<T extends WorkflowEventType>(
    eventType: T,
    handler: EventHandler<T>
  ): Subscription {
    this.checkDisposed();
    this.checkMaxListeners(eventType);

    const entry: HandlerEntry = {
      id: randomUUID(),
      handler: handler as unknown as EventHandler,
      once: true,
    };

    const handlers = this.handlers.get(eventType) ?? [];
    handlers.push(entry);
    this.handlers.set(eventType, handlers);

    this.debug(`Subscribed once to '${eventType}' (id: ${entry.id})`);

    return {
      unsubscribe: () => this.removeHandler(eventType, entry.id),
    };
  }

  /**
   * Subscribe to events matching a pattern
   */
  onPattern(pattern: EventPattern, handler: EventHandler): Subscription {
    this.checkDisposed();

    const entry: PatternHandlerEntry = {
      id: randomUUID(),
      pattern,
      regex: patternToRegex(pattern),
      handler,
      once: false,
    };

    this.patternHandlers.push(entry);
    this.debug(`Subscribed to pattern '${pattern}' (id: ${entry.id})`);

    return {
      unsubscribe: () => this.removePatternHandler(entry.id),
    };
  }

  /**
   * Subscribe to events matching a pattern, handler fires only once
   */
  oncePattern(pattern: EventPattern, handler: EventHandler): Subscription {
    this.checkDisposed();

    const entry: PatternHandlerEntry = {
      id: randomUUID(),
      pattern,
      regex: patternToRegex(pattern),
      handler,
      once: true,
    };

    this.patternHandlers.push(entry);
    this.debug(`Subscribed once to pattern '${pattern}' (id: ${entry.id})`);

    return {
      unsubscribe: () => this.removePatternHandler(entry.id),
    };
  }

  /**
   * Remove all handlers for an event type
   */
  off(eventType: WorkflowEventType): void {
    this.handlers.delete(eventType);
    this.debug(`Removed all handlers for '${eventType}'`);
  }

  /**
   * Remove all handlers
   */
  removeAllListeners(): void {
    this.handlers.clear();
    this.patternHandlers = [];
    this.debug('Removed all handlers');
  }

  // ==========================================================================
  // Emission Methods
  // ==========================================================================

  /**
   * Emit an event (non-blocking by default based on config)
   * Returns the event ID
   */
  emit<T extends WorkflowEventType>(
    type: T,
    payload: PayloadByType<T>
  ): string {
    this.checkDisposed();

    const event = this.createEvent(type, payload);

    if (this.config.asyncByDefault) {
      // Track pending event
      this.pendingEvents++;

      // Use setImmediate for non-blocking emission
      setImmediate(() => {
        this.dispatchEvent(event);

        // Decrement pending and resolve flush promises if done
        this.pendingEvents--;
        if (this.pendingEvents === 0) {
          for (const resolve of this.flushResolvers) {
            resolve();
          }
          this.flushResolvers = [];
        }
      });
    } else {
      this.dispatchEvent(event);
    }

    // Forward to parent if this is a child emitter
    if (this.parent) {
      this.parent.forwardEvent(event);
    }

    return event.metadata.eventId;
  }

  /**
   * Emit an event and wait for all handlers to complete
   * Returns the event ID
   */
  async emitSync<T extends WorkflowEventType>(
    type: T,
    payload: PayloadByType<T>
  ): Promise<string> {
    this.checkDisposed();

    const event = this.createEvent(type, payload);
    await this.dispatchEventAsync(event);

    // Forward to parent if this is a child emitter
    if (this.parent) {
      await this.parent.forwardEventAsync(event);
    }

    return event.metadata.eventId;
  }

  /**
   * Emit an event with scoped context, returns handle to end the scope
   */
  emitScoped<T extends WorkflowEventType>(
    type: T,
    payload: PayloadByType<T>
  ): ScopedEmission {
    const eventId = this.emit(type, payload);
    this.scopeStack.push(eventId);

    return {
      eventId,
      endScope: () => {
        const index = this.scopeStack.indexOf(eventId);
        if (index !== -1) {
          this.scopeStack.splice(index, 1);
        }
      },
    };
  }

  /**
   * Emit a custom event with arbitrary data
   */
  emitCustom(name: string, data: Record<string, unknown>): string {
    return this.emit('workflow:custom', { name, data });
  }

  // ==========================================================================
  // Child Emitters
  // ==========================================================================

  /**
   * Create a child emitter that forwards events to this parent
   */
  createChild(): WorkflowEmitter {
    const child = new WorkflowEmitter(this.config);
    child.parent = this;
    child.correlationId = this.correlationId;
    child.context = { ...this.context };
    this.children.add(child);

    return child;
  }

  /**
   * Detach a child emitter
   */
  detachChild(child: WorkflowEmitter): void {
    this.children.delete(child);
    child.parent = undefined;
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Get the count of listeners for a specific event type
   */
  listenerCount(eventType: WorkflowEventType): number {
    const direct = this.handlers.get(eventType)?.length ?? 0;
    const pattern = this.patternHandlers.filter((h) =>
      matchesPattern(eventType, h.pattern)
    ).length;
    return direct + pattern;
  }

  /**
   * Get all registered event types
   */
  eventTypes(): WorkflowEventType[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Check if there are any listeners for an event type (including patterns)
   */
  hasListeners(eventType: WorkflowEventType): boolean {
    if (this.handlers.has(eventType) && (this.handlers.get(eventType)?.length ?? 0) > 0) {
      return true;
    }
    return this.patternHandlers.some((h) => matchesPattern(eventType, h.pattern));
  }

  /**
   * Wait for all pending async events to be dispatched.
   * Call this before process exit to ensure all events are rendered.
   */
  async flush(): Promise<void> {
    if (this.pendingEvents === 0) {
      return;
    }

    return new Promise((resolve) => {
      this.flushResolvers.push(resolve);
    });
  }

  /**
   * Dispose of the emitter and clean up resources
   */
  dispose(): void {
    this.disposed = true;
    this.removeAllListeners();

    // Dispose all children
    for (const child of this.children) {
      child.dispose();
    }
    this.children.clear();

    // Detach from parent
    if (this.parent) {
      this.parent.detachChild(this);
    }

    this.debug('Emitter disposed');
  }

  /**
   * Check if the emitter has been disposed
   */
  isDisposed(): boolean {
    return this.disposed;
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private createEvent<T extends WorkflowEventType>(
    type: T,
    payload: PayloadByType<T>
  ): EventByType<T> {
    const metadata: EventMetadata = {
      eventId: randomUUID(),
      timestamp: new Date().toISOString(),
      correlationId: this.correlationId,
      parentEventId: this.scopeStack[this.scopeStack.length - 1],
      context: { ...this.context },
    };

    return {
      type,
      payload,
      metadata,
    } as EventByType<T>;
  }

  private dispatchEvent(event: WorkflowEvent): void {
    this.debug(`Dispatching event '${event.type}' (id: ${event.metadata.eventId})`);

    // Call direct handlers
    const handlers = this.handlers.get(event.type as WorkflowEventType) ?? [];
    const onceHandlerIds: string[] = [];

    for (const entry of handlers) {
      try {
        entry.handler(event as EventByType<typeof event.type>);
        if (entry.once) {
          onceHandlerIds.push(entry.id);
        }
      } catch (error) {
        console.error(`Error in event handler for '${event.type}':`, error);
      }
    }

    // Remove once handlers
    for (const id of onceHandlerIds) {
      this.removeHandler(event.type as WorkflowEventType, id);
    }

    // Call pattern handlers
    const patternOnceIds: string[] = [];

    for (const entry of this.patternHandlers) {
      if (entry.regex.test(event.type)) {
        try {
          entry.handler(event);
          if (entry.once) {
            patternOnceIds.push(entry.id);
          }
        } catch (error) {
          console.error(`Error in pattern handler for '${entry.pattern}':`, error);
        }
      }
    }

    // Remove once pattern handlers
    for (const id of patternOnceIds) {
      this.removePatternHandler(id);
    }
  }

  private async dispatchEventAsync(event: WorkflowEvent): Promise<void> {
    this.debug(`Dispatching event async '${event.type}' (id: ${event.metadata.eventId})`);

    // Call direct handlers
    const handlers = this.handlers.get(event.type as WorkflowEventType) ?? [];
    const onceHandlerIds: string[] = [];

    for (const entry of handlers) {
      try {
        await entry.handler(event as EventByType<typeof event.type>);
        if (entry.once) {
          onceHandlerIds.push(entry.id);
        }
      } catch (error) {
        console.error(`Error in event handler for '${event.type}':`, error);
      }
    }

    // Remove once handlers
    for (const id of onceHandlerIds) {
      this.removeHandler(event.type as WorkflowEventType, id);
    }

    // Call pattern handlers
    const patternOnceIds: string[] = [];

    for (const entry of this.patternHandlers) {
      if (entry.regex.test(event.type)) {
        try {
          await entry.handler(event);
          if (entry.once) {
            patternOnceIds.push(entry.id);
          }
        } catch (error) {
          console.error(`Error in pattern handler for '${entry.pattern}':`, error);
        }
      }
    }

    // Remove once pattern handlers
    for (const id of patternOnceIds) {
      this.removePatternHandler(id);
    }
  }

  private forwardEvent(event: WorkflowEvent): void {
    // Forward without creating a new event, just dispatch to handlers
    this.dispatchEvent(event);

    // Continue forwarding up the chain
    if (this.parent) {
      this.parent.forwardEvent(event);
    }
  }

  private async forwardEventAsync(event: WorkflowEvent): Promise<void> {
    await this.dispatchEventAsync(event);

    if (this.parent) {
      await this.parent.forwardEventAsync(event);
    }
  }

  private removeHandler(eventType: WorkflowEventType, handlerId: string): void {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      const index = handlers.findIndex((h) => h.id === handlerId);
      if (index !== -1) {
        handlers.splice(index, 1);
        this.debug(`Removed handler '${handlerId}' from '${eventType}'`);
      }
    }
  }

  private removePatternHandler(handlerId: string): void {
    const index = this.patternHandlers.findIndex((h) => h.id === handlerId);
    if (index !== -1) {
      this.patternHandlers.splice(index, 1);
      this.debug(`Removed pattern handler '${handlerId}'`);
    }
  }

  private checkDisposed(): void {
    if (this.disposed) {
      throw new Error('Cannot use disposed emitter');
    }
  }

  private checkMaxListeners(eventType: WorkflowEventType): void {
    if (this.config.maxListeners > 0) {
      const count = this.listenerCount(eventType);
      if (count >= this.config.maxListeners) {
        console.warn(
          `Warning: Maximum listeners (${this.config.maxListeners}) exceeded for '${eventType}'`
        );
      }
    }
  }

  private debug(message: string): void {
    if (this.config.debug) {
      console.debug(`[WorkflowEmitter] ${message}`);
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new WorkflowEmitter instance
 */
export function createEmitter(config?: EmitterConfig): WorkflowEmitter {
  return new WorkflowEmitter(config);
}
