/**
 * Execution context for variable storage and interpolation.
 */

import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Threshold for variable externalization in Claude prompts.
 * Variables larger than this are written to temp files and replaced with @filepath.
 */
const LARGE_VARIABLE_THRESHOLD = 10_000;

/**
 * Pattern matches {var_name} or {var.path.to.field} or {var.0.field}
 */
const INTERPOLATION_PATTERN = /\{([\w_][\w\d_]*(?:\.[\w\d_]+)*)\}/g;

/**
 * Holds variables and state during workflow execution.
 *
 * Manages both static variables from workflow configuration and
 * dynamic variables captured from tool outputs.
 */
export class ExecutionContext {
  private variables: Record<string, unknown>;
  readonly projectPath: string;

  constructor(projectPath: string = process.cwd()) {
    this.projectPath = projectPath;
    this.variables = {};
  }

  /**
   * Set a variable value.
   */
  set(name: string, value: unknown): void {
    this.variables[name] = value;
  }

  /**
   * Get a variable value with optional default.
   */
  get<T = unknown>(name: string, defaultValue?: T): T | undefined {
    return (this.variables[name] as T) ?? defaultValue;
  }

  /**
   * Update multiple variables at once.
   */
  update(variables: Record<string, unknown>): void {
    Object.assign(this.variables, variables);
  }

  /**
   * Get all variables.
   */
  getAll(): Record<string, unknown> {
    return { ...this.variables };
  }

  /**
   * Parse JSON string to object if applicable.
   */
  private parseJsonIfString(value: unknown): unknown {
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  }

  /**
   * Resolve a dot-separated path through nested objects.
   */
  private resolvePath(obj: unknown, path: string[]): unknown {
    let current: unknown = obj;

    for (const segment of path) {
      if (current === null || current === undefined) {
        return undefined;
      }

      // Handle dict/object access
      if (typeof current === "object" && !Array.isArray(current)) {
        current = (current as Record<string, unknown>)[segment];
      }
      // Handle array access with numeric index
      else if (Array.isArray(current)) {
        const idx = Number.parseInt(segment, 10);
        if (Number.isNaN(idx) || idx < 0 || idx >= current.length) {
          return undefined;
        }
        current = current[idx];
      } else {
        return undefined;
      }
    }

    return current;
  }

  /**
   * Replace {var} and {var.field.subfield} placeholders with values.
   *
   * Supports:
   * - Simple variables: {var_name}
   * - Dot notation: {obj.field.nested}
   * - Array indexing: {array.0.field}
   */
  interpolate(template: string): string {
    return template.replace(INTERPOLATION_PATTERN, (match, fullPath: string) => {
      const parts = fullPath.split(".");
      const varName = parts[0];

      // Get base variable
      const value = this.variables[varName];
      if (value === undefined) {
        return match; // Return original if not found
      }

      // If there are additional path segments, resolve them
      if (parts.length > 1) {
        const parsedValue = this.parseJsonIfString(value);
        const resolved = this.resolvePath(parsedValue, parts.slice(1));
        if (resolved === undefined) {
          return match; // Return original if path not found
        }
        // If resolved value is an object or array, serialize it
        if (typeof resolved === "object" && resolved !== null) {
          return JSON.stringify(resolved);
        }
        return String(resolved);
      }

      return String(value);
    });
  }

  /**
   * Interpolate a template that may be undefined.
   */
  interpolateOptional(template: string | undefined): string | undefined {
    if (template === undefined) {
      return undefined;
    }
    return this.interpolate(template);
  }

  /**
   * Convert variable path to safe filename.
   */
  private variablePathToFilename(varPath: string): string {
    const safeName = varPath.replace(/\./g, "_");
    return `${safeName}.txt`;
  }

  /**
   * Resolve a variable path to its string value.
   */
  private resolveVariableValue(fullPath: string): string | undefined {
    const parts = fullPath.split(".");
    const varName = parts[0];

    // Get base variable
    const value = this.variables[varName];
    if (value === undefined) {
      return undefined;
    }

    // If there are additional path segments, resolve them
    if (parts.length > 1) {
      const parsedValue = this.parseJsonIfString(value);
      const resolved = this.resolvePath(parsedValue, parts.slice(1));
      if (resolved === undefined) {
        return undefined;
      }
      // If resolved value is an object or array, serialize as JSON
      if (typeof resolved === "object" && resolved !== null) {
        return JSON.stringify(resolved);
      }
      return String(resolved);
    }

    // For direct object/array values, serialize as JSON for consistency
    if (typeof value === "object" && value !== null) {
      return JSON.stringify(value);
    }

    return String(value);
  }

  /**
   * Replace {var} placeholders, externalizing large variables to files.
   *
   * For variables exceeding LARGE_VARIABLE_THRESHOLD characters, writes
   * content to a temp file and replaces the placeholder with @filepath.
   * Claude Code understands @filepath syntax for file references.
   *
   * Each call writes files fresh with current variable values - no caching
   * across calls. This ensures variables that change between steps always
   * have the correct value in their files.
   */
  interpolateForClaude(template: string, tempDir?: string): string {
    // Get temp directory
    const effectiveTempDir =
      tempDir ?? (this.get<string>("_temp_dir") as string | undefined);

    // Track externalized files within this call to avoid duplicates
    const externalized: Map<string, string> = new Map();

    return template.replace(INTERPOLATION_PATTERN, (match, fullPath: string) => {
      // Check if already externalized in this call
      const existingPath = externalized.get(fullPath);
      if (existingPath) {
        return `@${existingPath}`;
      }

      // Resolve the variable value
      const strValue = this.resolveVariableValue(fullPath);
      if (strValue === undefined) {
        return match; // Return original if not found
      }

      // Check if value is large enough to externalize
      if (strValue.length > LARGE_VARIABLE_THRESHOLD) {
        // Need temp directory for externalization
        if (!effectiveTempDir) {
          throw new Error(
            `Variable '${fullPath}' exceeds size threshold ` +
              `(${strValue.length.toLocaleString()} chars > ${LARGE_VARIABLE_THRESHOLD.toLocaleString()}) ` +
              "but no temp directory available for externalization. " +
              "Ensure workflow temp directory is set up."
          );
        }

        // Write to temp file
        const filename = this.variablePathToFilename(fullPath);
        const filePath = join(effectiveTempDir, filename);
        writeFileSync(filePath, strValue);

        // Store absolute path and return @reference
        const absPath = resolve(filePath);
        externalized.set(fullPath, absPath);
        return `@${absPath}`;
      }

      // Small variable - return inline
      return strValue;
    });
  }
}
