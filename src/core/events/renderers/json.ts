/**
 * JSON Renderer - Structured JSON output for CI environments
 *
 * Outputs each event as a single JSON line (NDJSON format).
 * Suitable for CI pipelines, log aggregation, and machine processing.
 */

import { BaseRenderer, type RendererConfig } from '../renderer';
import type { WorkflowEvent, WorkflowStartEvent, WorkflowCompleteEvent } from '../types';

// ============================================================================
// JSON Renderer Configuration
// ============================================================================

export interface JsonRendererConfig extends RendererConfig {
  /** Include full payload in output */
  includePayload?: boolean;
  /** Include metadata in output */
  includeMetadata?: boolean;
  /** Pretty print JSON (multi-line) */
  prettyPrint?: boolean;
  /** Output stream (defaults to stdout) */
  stream?: NodeJS.WritableStream;
}

// ============================================================================
// JSON Output Format
// ============================================================================

interface JsonEventOutput {
  type: string;
  timestamp: string;
  eventId?: string;
  correlationId?: string;
  parentEventId?: string;
  context?: Record<string, unknown>;
  payload?: unknown;
}

// ============================================================================
// JSON Renderer Class
// ============================================================================

export class JsonRenderer extends BaseRenderer {
  readonly name = 'json';

  private jsonConfig: Required<JsonRendererConfig>;
  private stream: NodeJS.WritableStream;

  constructor(config: JsonRendererConfig = {}) {
    super(config);
    this.stream = config.stream ?? process.stdout;
    this.jsonConfig = {
      ...this.config,
      includePayload: config.includePayload ?? true,
      includeMetadata: config.includeMetadata ?? true,
      prettyPrint: config.prettyPrint ?? false,
      stream: this.stream,
    };
  }

  /**
   * Render an event as JSON
   */
  render(event: WorkflowEvent): void {
    const output = this.formatEvent(event);
    this.write(output);
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

  /**
   * Override setConfig to update stream
   */
  setConfig(config: Partial<JsonRendererConfig>): void {
    super.setConfig(config);

    if (config.stream) {
      this.stream = config.stream;
      this.jsonConfig.stream = config.stream;
    }

    if (config.includePayload !== undefined) {
      this.jsonConfig.includePayload = config.includePayload;
    }
    if (config.includeMetadata !== undefined) {
      this.jsonConfig.includeMetadata = config.includeMetadata;
    }
    if (config.prettyPrint !== undefined) {
      this.jsonConfig.prettyPrint = config.prettyPrint;
    }
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private formatEvent(event: WorkflowEvent): JsonEventOutput {
    const output: JsonEventOutput = {
      type: event.type,
      timestamp: event.metadata.timestamp,
    };

    if (this.jsonConfig.includeMetadata) {
      output.eventId = event.metadata.eventId;
      output.correlationId = event.metadata.correlationId;

      if (event.metadata.parentEventId) {
        output.parentEventId = event.metadata.parentEventId;
      }

      if (Object.keys(event.metadata.context).length > 0) {
        output.context = { ...event.metadata.context };
      }
    }

    if (this.jsonConfig.includePayload) {
      output.payload = this.sanitizePayload(event.payload);
    }

    return output;
  }

  private sanitizePayload(payload: unknown): unknown {
    // Handle circular references and large data
    try {
      // Test if it can be serialized
      JSON.stringify(payload);
      return payload;
    } catch {
      // If serialization fails, return a simplified version
      if (typeof payload === 'object' && payload !== null) {
        const simplified: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(payload)) {
          if (typeof value === 'string') {
            // Truncate very long strings
            simplified[key] = value.length > 1000 ? value.slice(0, 1000) + '...' : value;
          } else if (typeof value === 'number' || typeof value === 'boolean') {
            simplified[key] = value;
          } else if (value === null || value === undefined) {
            simplified[key] = value;
          } else if (Array.isArray(value)) {
            simplified[key] = `[Array(${value.length})]`;
          } else {
            simplified[key] = '[Object]';
          }
        }
        return simplified;
      }
      return String(payload);
    }
  }

  private write(output: JsonEventOutput): void {
    const json = this.jsonConfig.prettyPrint
      ? JSON.stringify(output, null, 2)
      : JSON.stringify(output);

    this.stream.write(json + '\n');
  }
}
