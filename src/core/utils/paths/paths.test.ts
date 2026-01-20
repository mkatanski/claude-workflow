/**
 * Unit tests for path utilities.
 */

import { describe, expect, it } from "bun:test";
import { homedir, tmpdir } from "node:os";
import {
	directoryExists,
	getAgentArtifactsDir,
	getGlobalConfigDir,
	getGlobalWorkflowsDir,
	getPlansDir,
	getSessionTempDir,
	getSystemTempDir,
} from "./paths.js";

describe("Path Utilities", () => {
	describe("getSystemTempDir", () => {
		it("should return path under system temp directory", () => {
			const result = getSystemTempDir();

			expect(result).toStartWith(tmpdir());
			expect(result).toContain("claude-workflow");
		});

		it("should return consistent path on multiple calls", () => {
			const result1 = getSystemTempDir();
			const result2 = getSystemTempDir();

			expect(result1).toBe(result2);
		});
	});

	describe("getSessionTempDir", () => {
		it("should return path including session ID", () => {
			const sessionId = "test-session-123";
			const result = getSessionTempDir(sessionId);

			expect(result).toContain("sessions");
			expect(result).toContain(sessionId);
			expect(result).toStartWith(getSystemTempDir());
		});

		it("should return different paths for different sessions", () => {
			const result1 = getSessionTempDir("session-1");
			const result2 = getSessionTempDir("session-2");

			expect(result1).not.toBe(result2);
		});
	});

	describe("getPlansDir", () => {
		it("should return path under system temp", () => {
			const result = getPlansDir();

			expect(result).toStartWith(getSystemTempDir());
			expect(result).toContain("plans");
		});

		it("should return consistent path", () => {
			const result1 = getPlansDir();
			const result2 = getPlansDir();

			expect(result1).toBe(result2);
		});
	});

	describe("getGlobalConfigDir", () => {
		it("should return path under home directory", () => {
			const result = getGlobalConfigDir();

			expect(result).toStartWith(homedir());
			expect(result).toContain(".cw");
		});
	});

	describe("getGlobalWorkflowsDir", () => {
		it("should return path under global config", () => {
			const result = getGlobalWorkflowsDir();

			expect(result).toStartWith(getGlobalConfigDir());
			expect(result).toContain("workflows");
		});
	});

	describe("getAgentArtifactsDir", () => {
		it("should return base agents directory when no session ID", () => {
			const result = getAgentArtifactsDir();

			expect(result).toStartWith(getSystemTempDir());
			expect(result).toContain("agents");
		});

		it("should return session-scoped directory when session ID provided", () => {
			const sessionId = "agent-session-456";
			const result = getAgentArtifactsDir(sessionId);

			expect(result).toContain("agents");
			expect(result).toContain(sessionId);
		});
	});

	describe("directoryExists", () => {
		it("should return true for existing directory", () => {
			// tmpdir always exists
			const result = directoryExists(tmpdir());

			expect(result).toBe(true);
		});

		it("should return false for non-existing directory", () => {
			const result = directoryExists("/non/existing/path/xyz123");

			expect(result).toBe(false);
		});
	});
});
