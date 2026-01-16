/**
 * Silent Renderer - Event capture for testing
 *
 * Captures events without producing output.
 * Useful for testing workflows and assertions on event sequences.
 */

import { BaseRenderer, type RendererConfig } from '../renderer';
import type { WorkflowEvent, WorkflowEventType, WorkflowStartEvent, WorkflowCompleteEvent } from '../types';

// ============================================================================
// Silent Renderer Configuration
// ============================================================================

export interface SilentRendererConfig extends RendererConfig {
  /** Maximum number of events to store (0 = unlimited) */
  maxEvents?: number;
  /** Event types to capture (empty = all) */
  captureTypes?: WorkflowEventType[];
}

// ============================================================================
// Silent Renderer Class
// ============================================================================

export class SilentRenderer extends BaseRenderer {
  readonly name = 'silent';

  private events: WorkflowEvent[] = [];
  private silentConfig: Required<SilentRendererConfig>;

  constructor(config: SilentRendererConfig = {}) {
    super(config);
    this.silentConfig = {
      ...this.config,
      maxEvents: config.maxEvents ?? 0,
      captureTypes: config.captureTypes ?? [],
    };
  }

  /**
   * Capture an event silently
   */
  render(event: WorkflowEvent): void {
    // Check if we should capture this event type
    if (
      this.silentConfig.captureTypes.length > 0 &&
      !this.silentConfig.captureTypes.includes(event.type)
    ) {
      return;
    }

    // Add event to captured list
    this.events.push(event);

    // Enforce max events limit
    if (this.silentConfig.maxEvents > 0 && this.events.length > this.silentConfig.maxEvents) {
      this.events.shift();
    }
  }

  /**
   * Called when workflow starts
   */
  onWorkflowStart(event: WorkflowStartEvent): void {
    this.render(event);
  }

  /**
   * Called when workflow completes
   */
  onWorkflowComplete(event: WorkflowCompleteEvent): void {
    this.render(event);
  }

  // ==========================================================================
  // Event Access Methods
  // ==========================================================================

  /**
   * Get all captured events
   */
  getEvents(): WorkflowEvent[] {
    return [...this.events];
  }

  /**
   * Get events of a specific type
   */
  getEventsByType<T extends WorkflowEventType>(type: T): WorkflowEvent[] {
    return this.events.filter((e) => e.type === type);
  }

  /**
   * Get events matching a pattern
   */
  getEventsByPattern(pattern: string): WorkflowEvent[] {
    if (pattern === '*') {
      return [...this.events];
    }

    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return this.events.filter((e) => e.type.startsWith(prefix));
    }

    return this.events.filter((e) => e.type === pattern);
  }

  /**
   * Get the count of captured events
   */
  getEventCount(): number {
    return this.events.length;
  }

  /**
   * Get the count of events of a specific type
   */
  getEventCountByType(type: WorkflowEventType): number {
    return this.events.filter((e) => e.type === type).length;
  }

  /**
   * Get the first event of a specific type
   */
  getFirstEvent<T extends WorkflowEventType>(type: T): WorkflowEvent | undefined {
    return this.events.find((e) => e.type === type);
  }

  /**
   * Get the last event of a specific type
   */
  getLastEvent<T extends WorkflowEventType>(type: T): WorkflowEvent | undefined {
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (this.events[i].type === type) {
        return this.events[i];
      }
    }
    return undefined;
  }

  /**
   * Check if an event of a specific type was captured
   */
  hasEvent(type: WorkflowEventType): boolean {
    return this.events.some((e) => e.type === type);
  }

  /**
   * Check if events were captured in a specific order
   */
  hasEventSequence(types: WorkflowEventType[]): boolean {
    let typeIndex = 0;

    for (const event of this.events) {
      if (event.type === types[typeIndex]) {
        typeIndex++;
        if (typeIndex === types.length) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Find events matching a predicate
   */
  findEvents(predicate: (event: WorkflowEvent) => boolean): WorkflowEvent[] {
    return this.events.filter(predicate);
  }

  /**
   * Clear all captured events
   */
  clear(): void {
    this.events = [];
  }

  /**
   * Override setConfig to handle capture types
   */
  setConfig(config: Partial<SilentRendererConfig>): void {
    super.setConfig(config);

    if (config.maxEvents !== undefined) {
      this.silentConfig.maxEvents = config.maxEvents;
    }
    if (config.captureTypes !== undefined) {
      this.silentConfig.captureTypes = config.captureTypes;
    }
  }

  // ==========================================================================
  // Assertion Helpers for Testing
  // ==========================================================================

  /**
   * Assert that an event of a specific type was captured
   * Throws if assertion fails
   */
  assertHasEvent(type: WorkflowEventType, message?: string): void {
    if (!this.hasEvent(type)) {
      throw new Error(message ?? `Expected event '${type}' was not captured`);
    }
  }

  /**
   * Assert that a specific number of events of a type were captured
   * Throws if assertion fails
   */
  assertEventCount(type: WorkflowEventType, count: number, message?: string): void {
    const actual = this.getEventCountByType(type);
    if (actual !== count) {
      throw new Error(
        message ?? `Expected ${count} events of type '${type}', but found ${actual}`
      );
    }
  }

  /**
   * Assert that events occurred in a specific sequence
   * Throws if assertion fails
   */
  assertEventSequence(types: WorkflowEventType[], message?: string): void {
    if (!this.hasEventSequence(types)) {
      const actual = this.events.map((e) => e.type).join(' -> ');
      throw new Error(
        message ??
          `Expected event sequence [${types.join(' -> ')}] not found in [${actual}]`
      );
    }
  }

  /**
   * Assert that no errors were captured
   * Throws if assertion fails
   */
  assertNoErrors(message?: string): void {
    const errorEvents = this.getEventsByPattern('*:error');
    if (errorEvents.length > 0) {
      const types = errorEvents.map((e) => e.type).join(', ');
      throw new Error(
        message ?? `Expected no error events, but found: ${types}`
      );
    }
  }

  /**
   * Get a summary of captured events for debugging
   */
  getSummary(): string {
    const typeCounts = new Map<string, number>();

    for (const event of this.events) {
      typeCounts.set(event.type, (typeCounts.get(event.type) ?? 0) + 1);
    }

    const lines = [`Captured ${this.events.length} events:`];
    for (const [type, count] of typeCounts) {
      lines.push(`  ${type}: ${count}`);
    }

    return lines.join('\n');
  }
}
