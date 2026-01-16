export { BaseTool, successResult, errorResult, type ToolResult } from "./types.ts";
export { ToolRegistry } from "./registry.ts";
export { BashTool } from "./bash.ts";
export { ClaudeTool } from "./claude.ts";
export { ClaudeSdkTool } from "./claudeSdk.ts";
export { JsonTool } from "./json.ts";
export { DataTool } from "./data.ts";

// Import and register all tools
import { ToolRegistry } from "./registry.ts";
import { BashTool } from "./bash.ts";
import { ClaudeTool } from "./claude.ts";
import { ClaudeSdkTool } from "./claudeSdk.ts";
import { JsonTool } from "./json.ts";
import { DataTool } from "./data.ts";

/**
 * Register all built-in tools.
 */
export function registerBuiltinTools(): void {
  ToolRegistry.register(new BashTool());
  ToolRegistry.register(new ClaudeTool());
  ToolRegistry.register(new ClaudeSdkTool());
  ToolRegistry.register(new JsonTool());
  ToolRegistry.register(new DataTool());
}
