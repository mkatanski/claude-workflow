/**
 * Console Renderer - Colored terminal output for workflow events
 *
 * Displays workflow events with ANSI colors and formatting for human readability.
 * Suitable for interactive terminal use.
 */

import { BaseRenderer, type RendererConfig } from '../renderer';
import type {
  WorkflowEvent,
  WorkflowStartEvent,
  WorkflowCompleteEvent,
  NodeStartEvent,
  NodeCompleteEvent,
  NodeErrorEvent,
  RouterDecisionEvent,
  ToolBashStartEvent,
  ToolBashCompleteEvent,
  ToolBashErrorEvent,
  ToolClaudeStartEvent,
  ToolClaudeCompleteEvent,
  ToolClaudeErrorEvent,
  ToolClaudePlanApprovalEvent,
  ToolClaudeSdkStartEvent,
  ToolClaudeSdkCompleteEvent,
  ToolClaudeSdkErrorEvent,
  ToolClaudeSdkRetryEvent,
  ToolHookStartEvent,
  ToolHookCompleteEvent,
  ToolChecklistStartEvent,
  ToolChecklistCompleteEvent,
  ToolChecklistItemCompleteEvent,
  CleanupStartEvent,
  CleanupCompleteEvent,
  LogEvent,
  CustomEvent,
} from '../types';

// ============================================================================
// ANSI Color Codes
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',

  // Foreground colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',

  // Bright foreground colors
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m',

  // Background colors
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',
};

// ============================================================================
// Nerd Font Icons (MesloLGS Nerd Font Mono compatible)
// Reference: https://www.nerdfonts.com/cheat-sheet
// ============================================================================

const icons = {
  // Status indicators
  success: '\uf00c',      //  (fa-check)
  error: '\udb82\udfc9',  //  (nf-md-close_circle_outline)
  warning: '\uf071',      //  (fa-warning)
  info: '\uf075',         //  (fa-comment) speech bubble
  debug: '\uf188',        //  (fa-bug)
  skip: '\uf05e',         //  (fa-ban)

  // Actions
  play: '\uf04b',         //  (fa-play)
  stop: '\uf04d',         //  (fa-stop)
  retry: '\uf021',        //  (fa-refresh)
  arrow: '\uf061',        //  (fa-arrow-right)

  // Tools
  terminal: '\uf120',     //  (nf-fa-terminal)
  code: '\uf121',         //  (fa-code)
  brain: '\uf5dc',        //  (fa-brain)
  cog: '\uf013',          //  (fa-cog)
  plug: '\uf1e6',         //  (fa-plug)
  list: '\uf03a',         //  (fa-list)
  cube: '\uf1b2',         //  (fa-cube)

  // Workflow
  rocket: '\ueb44',       //  (nf-cod-rocket)
  flow: '\uf542',         //  (mdi-source-branch)
  node: '\uf0c8',         //  (fa-square)
  event: '\uf0e7',        //  (fa-bolt)

  // Misc
  clock: '\uf017',        //  (fa-clock-o)
  trash: '\uf1f8',        //  (fa-trash)
  file: '\uf15b',         //  (fa-file)
  folder: '\uf07b',       //  (fa-folder)

  // Box drawing (fallback for simpler look)
  pipe: '│',
  corner: '└',
  tee: '├',
  line: '─',
};

// Indentation for node content
const INDENT = '   ';

// ============================================================================
// Console Renderer Configuration
// ============================================================================

export interface ConsoleRendererConfig extends RendererConfig {
  /** Disable colors in output */
  noColor?: boolean;
  /** Show node separators */
  showNodeSeparators?: boolean;
  /** Separator width */
  separatorWidth?: number;
}

// ============================================================================
// Console Renderer Class
// ============================================================================

export class ConsoleRenderer extends BaseRenderer {
  readonly name = 'console';

  private consoleConfig: Required<ConsoleRendererConfig>;
  private isCI: boolean;

  constructor(config: ConsoleRendererConfig = {}) {
    super(config);
    this.isCI = Boolean(process.env.CI);
    this.consoleConfig = {
      ...this.config,
      noColor: config.noColor ?? this.isCI ?? !process.stdout.isTTY,
      showNodeSeparators: config.showNodeSeparators ?? true,
      separatorWidth: config.separatorWidth ?? 60,
    };
  }

  /**
   * Render an event to the console
   */
  render(event: WorkflowEvent): void {
    switch (event.type) {
      // Workflow lifecycle
      case 'workflow:start':
        this.renderWorkflowStart(event);
        break;
      case 'workflow:complete':
        this.renderWorkflowComplete(event);
        break;
      case 'workflow:error':
        this.renderError('Workflow', event.payload.error);
        break;

      // Node execution
      case 'node:start':
        this.renderNodeStart(event);
        break;
      case 'node:complete':
        this.renderNodeComplete(event);
        break;
      case 'node:error':
        this.renderNodeError(event);
        break;

      // Routing
      case 'router:decision':
        this.renderRouterDecision(event);
        break;

      // Tool: Bash
      case 'tool:bash:start':
        this.renderBashStart(event);
        break;
      case 'tool:bash:complete':
        this.renderBashComplete(event);
        break;
      case 'tool:bash:error':
        this.renderBashError(event);
        break;

      // Tool: Claude
      case 'tool:claude:start':
        this.renderClaudeStart(event);
        break;
      case 'tool:claude:complete':
        this.renderClaudeComplete(event);
        break;
      case 'tool:claude:error':
        this.renderClaudeError(event);
        break;
      case 'tool:claude:plan:approval':
        this.renderClaudePlanApproval(event);
        break;

      // Tool: ClaudeSdk
      case 'tool:claudeSdk:start':
        this.renderClaudeSdkStart(event);
        break;
      case 'tool:claudeSdk:complete':
        this.renderClaudeSdkComplete(event);
        break;
      case 'tool:claudeSdk:error':
        this.renderClaudeSdkError(event);
        break;
      case 'tool:claudeSdk:retry':
        this.renderClaudeSdkRetry(event);
        break;

      // Tool: Hook
      case 'tool:hook:start':
        this.renderHookStart(event);
        break;
      case 'tool:hook:complete':
        this.renderHookComplete(event);
        break;

      // Tool: Checklist
      case 'tool:checklist:start':
        this.renderChecklistStart(event);
        break;
      case 'tool:checklist:complete':
        this.renderChecklistComplete(event);
        break;
      case 'tool:checklist:item:complete':
        this.renderChecklistItemComplete(event);
        break;

      // Cleanup
      case 'cleanup:start':
        this.renderCleanupStart(event);
        break;
      case 'cleanup:complete':
        this.renderCleanupComplete(event);
        break;

      // Log events
      case 'log':
        this.renderLog(event);
        break;

      // Custom events
      case 'workflow:custom':
        this.renderCustomEvent(event);
        break;

      // Verbose-only events
      default:
        if (this.config.verbose) {
          this.renderVerbose(event);
        }
    }
  }

  // ==========================================================================
  // Workflow Lifecycle Rendering
  // ==========================================================================

  private renderWorkflowStart(event: WorkflowStartEvent): void {
    const { workflowName } = event.payload;
    console.log('');
    console.log(this.colorize(this.separator('heavy'), 'gray'));
    console.log(this.colorize(`${icons.rocket} WORKFLOW: ${workflowName}`, 'brightCyan', 'bold'));
    console.log(this.colorize(this.separator('heavy'), 'gray'));
    console.log('');
  }

  onWorkflowStart(event: WorkflowStartEvent): void {
    this.renderWorkflowStart(event);
  }

  private renderWorkflowComplete(event: WorkflowCompleteEvent): void {
    const { workflowName, duration, success } = event.payload;
    console.log('');
    console.log(this.colorize(this.separator('heavy'), 'gray'));

    if (success) {
      console.log(
        this.colorize(`${icons.success} WORKFLOW COMPLETE: ${workflowName}`, 'brightGreen', 'bold')
      );
    } else {
      console.log(
        this.colorize(`${icons.error} WORKFLOW FAILED: ${workflowName}`, 'brightRed', 'bold')
      );
    }

    console.log(this.colorize(`${icons.clock} Duration: ${this.formatDuration(duration)}`, 'dim'));
    console.log(this.colorize(this.separator('heavy'), 'gray'));
    console.log('');
  }

  onWorkflowComplete(event: WorkflowCompleteEvent): void {
    this.renderWorkflowComplete(event);
  }

  // ==========================================================================
  // Node Rendering
  // ==========================================================================

  private renderNodeStart(event: NodeStartEvent): void {
    if (!this.consoleConfig.showNodeSeparators) {
      return;
    }

    const { nodeName } = event.payload;
    console.log(this.colorize(`${icons.cube} ${nodeName}`, 'brightYellow', 'bold'));
  }

  private renderNodeComplete(event: NodeCompleteEvent): void {
    if (!this.config.verbose) {
      return;
    }

    const { nodeName, duration } = event.payload;
    console.log(
      this.colorize(`${INDENT}${icons.success} Node '${nodeName}' completed in ${this.formatDuration(duration)}`, 'dim')
    );
  }

  private renderNodeError(event: NodeErrorEvent): void {
    const { nodeName, error } = event.payload;
    this.renderError(`Node '${nodeName}'`, error);
  }

  // ==========================================================================
  // Router Rendering
  // ==========================================================================

  private renderRouterDecision(event: RouterDecisionEvent): void {
    const { sourceNode, decision, targetNode } = event.payload;

    if (this.config.verbose) {
      console.log(
        this.colorize(`${INDENT}${icons.arrow} Router: ${sourceNode} ${icons.arrow} ${decision} ${icons.arrow} ${targetNode}`, 'cyan')
      );
    }
  }

  // ==========================================================================
  // Tool: Bash Rendering
  // ==========================================================================

  private renderBashStart(event: ToolBashStartEvent): void {
    const { label, command } = event.payload;
    const displayText = label || command;

    console.log(this.colorize(`${INDENT}${icons.terminal} ${displayText}`, 'blue'));
  }

  private renderBashComplete(event: ToolBashCompleteEvent): void {
    // Only show completion in verbose mode or on failure
    const { success, duration } = event.payload;

    if (!success) {
      // Error will be shown by renderBashError
      return;
    }

    // Show duration only in verbose mode
    if (this.config.verbose) {
      console.log(this.colorize(`${INDENT}  ${icons.success} completed (${this.formatDuration(duration)})`, 'dim'));
    }
  }

  private renderBashError(event: ToolBashErrorEvent): void {
    const { command, error } = event.payload;

    console.log('');
    console.log(this.colorize(`${INDENT}${icons.error} BASH ERROR`, 'brightRed', 'bold'));
    console.log(this.colorize(`${INDENT}  Command: ${command}`, 'red'));
    console.log(this.colorize(`${INDENT}  Error: ${error}`, 'red'));
    console.log('');
  }

  // ==========================================================================
  // Tool: Claude Rendering
  // ==========================================================================

  private renderClaudeStart(event: ToolClaudeStartEvent): void {
    const { label, prompt } = event.payload;
    const displayText = label || this.truncate(prompt, 50);
    console.log(this.colorize(`${INDENT}${icons.code} [claude] ${displayText}`, 'magenta'));
  }

  private renderClaudeComplete(event: ToolClaudeCompleteEvent): void {
    const { success, duration } = event.payload;

    if (!success) {
      return;
    }

    if (this.config.verbose) {
      console.log(this.colorize(`${INDENT}  ${icons.success} completed (${this.formatDuration(duration)})`, 'dim'));
    }
  }

  private renderClaudeError(event: ToolClaudeErrorEvent): void {
    const { prompt, error } = event.payload;

    console.log('');
    console.log(this.colorize(`${INDENT}${icons.error} CLAUDE ERROR`, 'brightRed', 'bold'));
    console.log(this.colorize(`${INDENT}  Prompt: ${this.truncate(prompt, 100)}`, 'red'));
    console.log(this.colorize(`${INDENT}  Error: ${error}`, 'red'));
    console.log('');
  }

  private renderClaudePlanApproval(event: ToolClaudePlanApprovalEvent): void {
    const { approved, approvalCount } = event.payload;

    if (approved) {
      console.log(this.colorize(`${INDENT}  ${icons.success} auto-approved plan (#${approvalCount})`, 'cyan'));
    }
  }

  // ==========================================================================
  // Tool: ClaudeSdk Rendering
  // ==========================================================================

  private renderClaudeSdkStart(event: ToolClaudeSdkStartEvent): void {
    const { label, prompt, model, outputType } = event.payload;
    const displayText = label || this.truncate(prompt, 50);

    if (this.config.verbose) {
      console.log(this.colorize(`${INDENT}${icons.brain} [sdk:${model}] ${displayText} (${outputType})`, 'brightMagenta'));
    } else {
      console.log(this.colorize(`${INDENT}${icons.brain} [sdk] ${displayText}`, 'brightMagenta'));
    }
  }

  private renderClaudeSdkComplete(event: ToolClaudeSdkCompleteEvent): void {
    const { success, duration, attempts } = event.payload;

    if (!success) {
      return;
    }

    if (this.config.verbose) {
      const attemptsStr = attempts > 1 ? `, ${attempts} attempts` : '';
      console.log(this.colorize(`${INDENT}  ${icons.success} completed (${this.formatDuration(duration)}${attemptsStr})`, 'dim'));
    }
  }

  private renderClaudeSdkError(event: ToolClaudeSdkErrorEvent): void {
    const { prompt, error, attempts } = event.payload;

    console.log('');
    console.log(this.colorize(`${INDENT}${icons.error} CLAUDE SDK ERROR`, 'brightRed', 'bold'));
    console.log(this.colorize(`${INDENT}  Prompt: ${this.truncate(prompt, 100)}`, 'red'));
    console.log(this.colorize(`${INDENT}  Error: ${error}`, 'red'));
    console.log(this.colorize(`${INDENT}  Attempts: ${attempts}`, 'red'));
    console.log('');
  }

  private renderClaudeSdkRetry(event: ToolClaudeSdkRetryEvent): void {
    if (!this.config.verbose) {
      return;
    }

    const { attempt, maxAttempts, validationError } = event.payload;
    const errorMsg = validationError ? `: ${validationError}` : '';
    console.log(this.colorize(`${INDENT}  ${icons.retry} retry ${attempt}/${maxAttempts}${errorMsg}`, 'yellow'));
  }

  // ==========================================================================
  // Tool: Hook Rendering
  // ==========================================================================

  private renderHookStart(event: ToolHookStartEvent): void {
    const { hookName, label } = event.payload;
    const displayText = label || hookName;
    console.log(this.colorize(`${INDENT}${icons.plug} [hook] ${displayText}`, 'cyan'));
  }

  private renderHookComplete(event: ToolHookCompleteEvent): void {
    const { hookName, success, hookExists, duration } = event.payload;

    if (!hookExists) {
      if (this.config.verbose) {
        console.log(this.colorize(`${INDENT}  ${icons.skip} hook '${hookName}' not found, skipped`, 'dim'));
      }
      return;
    }

    if (!success) {
      return;
    }

    if (this.config.verbose) {
      console.log(this.colorize(`${INDENT}  ${icons.success} completed (${this.formatDuration(duration)})`, 'dim'));
    }
  }

  // ==========================================================================
  // Tool: Checklist Rendering
  // ==========================================================================

  private renderChecklistStart(event: ToolChecklistStartEvent): void {
    const { label, itemCount } = event.payload;
    const displayText = label || 'checklist';
    console.log(this.colorize(`${INDENT}${icons.list} [checklist] ${displayText} (${itemCount} items)`, 'cyan'));
  }

  private renderChecklistComplete(event: ToolChecklistCompleteEvent): void {
    const { passed, failed, total, success, duration } = event.payload;
    const status = success ? icons.success : icons.error;
    const durationStr = this.config.verbose ? ` (${this.formatDuration(duration)})` : '';

    console.log(
      this.colorize(
        `${INDENT}  ${status} ${passed}/${total} passed${durationStr}`,
        success ? 'green' : 'red'
      )
    );

    if (failed > 0 && this.config.verbose) {
      console.log(this.colorize(`${INDENT}  ${icons.warning} ${failed} items failed`, 'yellow'));
    }
  }

  private renderChecklistItemComplete(event: ToolChecklistItemCompleteEvent): void {
    if (!this.config.verbose) {
      return;
    }

    const { itemName, passed, message } = event.payload;
    const status = passed ? icons.success : icons.error;
    const messageStr = message ? `: ${message}` : '';

    console.log(
      this.colorize(`${INDENT}    ${status} ${itemName}${messageStr}`, passed ? 'green' : 'red')
    );
  }

  // ==========================================================================
  // Cleanup Rendering
  // ==========================================================================

  private renderCleanupStart(event: CleanupStartEvent): void {
    if (!this.config.verbose) {
      return;
    }

    const { resourceCount } = event.payload;
    console.log(this.colorize(`${INDENT}${icons.trash} [cleanup] ${resourceCount} resources`, 'dim'));
  }

  private renderCleanupComplete(event: CleanupCompleteEvent): void {
    if (!this.config.verbose) {
      return;
    }

    const { closedPanes, cleanedFiles, duration } = event.payload;
    console.log(
      this.colorize(
        `${INDENT}  ${icons.success} done (${closedPanes} panes, ${cleanedFiles} files) [${this.formatDuration(duration)}]`,
        'dim'
      )
    );
  }

  // ==========================================================================
  // Log & Custom Event Rendering
  // ==========================================================================

  private renderLog(event: LogEvent): void {
    const { message, level, data } = event.payload;

    // Skip debug logs unless in verbose mode
    if (level === 'debug' && !this.config.verbose) {
      return;
    }

    // Choose color and icon based on level
    const levelConfig: Record<string, { color: keyof typeof colors; icon: string }> = {
      debug: { color: 'gray', icon: icons.debug },
      info: { color: 'white', icon: icons.info },
      warn: { color: 'yellow', icon: icons.warning },
      error: { color: 'red', icon: icons.error },
    };

    const { color, icon } = levelConfig[level] ?? levelConfig.info;

    // Handle multiline messages - indent subsequent lines
    const indentedMessage = message.replace(/\n/g, `\n${INDENT}  `);

    // Format the message
    let output = `${INDENT}${icon} ${indentedMessage}`;

    // Add data if present and verbose
    if (data && this.config.verbose && Object.keys(data).length > 0) {
      const dataStr = JSON.stringify(data);
      if (dataStr.length < 100) {
        output += ` ${this.colorize(dataStr, 'dim')}`;
      }
    }

    console.log(this.colorize(output, color));
  }

  private renderCustomEvent(event: CustomEvent): void {
    const { name, data } = event.payload;

    // Always show custom events (they're explicitly emitted by workflows)
    let output = `${INDENT}${icons.event} ${name}`;

    // Add key data fields
    if (data && Object.keys(data).length > 0) {
      const keys = Object.keys(data).slice(0, 3);
      const summary = keys.map(k => `${k}: ${this.formatValue(data[k])}`).join(', ');
      output += `: ${summary}`;
      if (Object.keys(data).length > 3) {
        output += `, ...`;
      }
    }

    console.log(this.colorize(output, 'brightMagenta'));
  }

  private formatValue(value: unknown): string {
    if (typeof value === 'string') {
      return value.length > 30 ? `${value.slice(0, 30)}...` : value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (Array.isArray(value)) {
      return `[${value.length}]`;
    }
    if (value && typeof value === 'object') {
      return '{...}';
    }
    return String(value);
  }

  // ==========================================================================
  // Utility Rendering
  // ==========================================================================

  private renderError(context: string, error: string): void {
    console.log('');
    console.log(this.colorize(`${INDENT}${icons.error} ERROR in ${context}:`, 'brightRed', 'bold'));
    console.log(this.colorize(`${INDENT}   ${error}`, 'red'));
    console.log('');
  }

  private renderVerbose(event: WorkflowEvent): void {
    const timestamp = this.consoleConfig.showTimestamps
      ? `[${this.formatTimestamp(event.metadata.timestamp)}] `
      : '';
    const eventId = this.consoleConfig.showEventIds
      ? ` (${event.metadata.eventId.slice(0, 8)})`
      : '';

    console.log(this.colorize(`${timestamp}${event.type}${eventId}`, 'dim'));
  }

  // ==========================================================================
  // Formatting Helpers
  // ==========================================================================

  private colorize(
    text: string,
    color: keyof typeof colors,
    style?: keyof typeof colors
  ): string {
    if (this.consoleConfig.noColor) {
      return text;
    }

    const colorCode = colors[color] || '';
    const styleCode = style ? colors[style] || '' : '';

    return `${styleCode}${colorCode}${text}${colors.reset}`;
  }

  private separator(style: 'heavy' | 'light' = 'light'): string {
    const char = style === 'heavy' ? '━' : '─';
    return char.repeat(this.consoleConfig.separatorWidth);
  }
}
