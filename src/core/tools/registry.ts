/**
 * Tool registry for managing workflow tools.
 */

import type { BaseTool } from "./types.ts";

/**
 * Singleton registry for workflow tools.
 */
class ToolRegistryClass {
	private tools: Map<string, BaseTool> = new Map();

	/**
	 * Register a tool in the registry.
	 */
	register(tool: BaseTool): void {
		this.tools.set(tool.name, tool);
	}

	/**
	 * Get a tool by name.
	 */
	get(name: string): BaseTool | undefined {
		return this.tools.get(name);
	}

	/**
	 * Get all registered tool names.
	 */
	getToolNames(): string[] {
		return Array.from(this.tools.keys());
	}

	/**
	 * Check if a tool is registered.
	 */
	has(name: string): boolean {
		return this.tools.has(name);
	}

	/**
	 * Clear all registered tools (mainly for testing).
	 */
	clear(): void {
		this.tools.clear();
	}
}

// Export singleton instance
export const ToolRegistry = new ToolRegistryClass();
