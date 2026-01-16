/**
 * Events Module - Renderer-agnostic event system for workflow execution
 *
 * This module provides a comprehensive event system for tracking workflow execution.
 * It supports multiple renderers (console, JSON, silent) for different output formats.
 *
 * @example
 * ```typescript
 * import { createEmitter, ConsoleRenderer } from './core/events';
 *
 * const emitter = createEmitter();
 * const renderer = new ConsoleRenderer({ verbose: true });
 * renderer.connect(emitter);
 *
 * emitter.emit('workflow:start', { workflowName: 'my-workflow', initialVariables: {} });
 * ```
 */

// Types
export * from './types';

// Emitter
export { WorkflowEmitter, createEmitter, type EmitterConfig } from './emitter';

// Renderer
export {
  type WorkflowRenderer,
  type RendererConfig,
  BaseRenderer,
  CompositeRenderer,
} from './renderer';

// Renderers
export { ConsoleRenderer, type ConsoleRendererConfig } from './renderers/console';
export { JsonRenderer, type JsonRendererConfig } from './renderers/json';
export { SilentRenderer, type SilentRendererConfig } from './renderers/silent';

// Helpers
export { createEventHelpers, createTimer, withEventTiming, type EventHelpers } from './helpers';
