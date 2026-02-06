# Agent Integration Abstraction Layer

## Goal

Abstract Jean-Claude's agent integration so multiple agent backends can run side-by-side. Users pick a backend per-project (with per-task override). The first two backends are **Claude Code** (existing) and **OpenCode**.

## Architecture

### Adapter Pattern

Each agent SDK gets an adapter class implementing a common `AgentBackend` interface. The rest of the app (IPC, database, UI) only sees the common types.

```
┌──────────────────────────────────────────────────────────────┐
│  agent-service.ts  (orchestration - backend agnostic)        │
│                                                              │
│  ┌─────────────────┐          ┌──────────────────┐          │
│  │ ClaudeCodeBackend│          │ OpencodeBackend   │          │
│  │ (in-process SDK) │          │ (client→server)   │          │
│  └────────┬────────┘          └────────┬─────────┘          │
│           │                            │                     │
│   query() async gen            SSE event stream              │
│           │                            │                     │
│           └──────────┬─────────────────┘                     │
│                      ▼                                       │
│            AgentEvent stream                                 │
│            (AsyncIterable<AgentEvent>)                        │
│                      │                                       │
│                      ▼                                       │
│            Persist NormalizedMessage                          │
│            Emit to renderer via IPC                           │
└──────────────────────────────────────────────────────────────┘
```

### File Structure

```
shared/
  agent-backend-types.ts          # Common types: AgentBackend, AgentEvent, NormalizedMessage, etc.
  agent-types.ts                  # KEPT - Claude SDK raw types (used by Claude adapter internally)

electron/services/
  agent-service.ts                # Refactored: backend-agnostic orchestration
  agent-backends/
    index.ts                      # AgentBackendRegistry (factory/lookup)
    claude-code-backend.ts        # Claude Code SDK adapter
    opencode-backend.ts           # OpenCode SDK adapter
    normalize-claude-message.ts   # Claude AgentMessage → NormalizedMessage
    normalize-opencode-message.ts # OpenCode MessageV2 → NormalizedMessage
```

---

## Common Interface

```typescript
// shared/agent-backend-types.ts

export type AgentBackendType = 'claude-code' | 'opencode';

export interface AgentBackendConfig {
  type: AgentBackendType;
  cwd: string;
  interactionMode: InteractionMode;
  model?: string;
  sessionId?: string;                    // for resumption
  sessionAllowedTools?: string[];
}

export interface AgentBackend {
  start(config: AgentBackendConfig, prompt: string): Promise<AgentSession>;
  stop(sessionId: string): Promise<void>;
  sendMessage(sessionId: string, message: string): Promise<void>;
  respondToPermission(sessionId: string, requestId: string, response: PermissionResponse): Promise<void>;
  respondToQuestion(sessionId: string, requestId: string, answer: string): Promise<void>;
  setMode(sessionId: string, mode: InteractionMode): Promise<void>;
  dispose(): Promise<void>;
}

export interface AgentSession {
  sessionId: string;
  events: AsyncIterable<AgentEvent>;
}
```

---

## Normalized Event Model

```typescript
export type AgentEvent =
  // Core message flow
  | { type: 'message'; message: NormalizedMessage }
  | { type: 'message-removed'; messageId: string }

  // Interactive requests
  | { type: 'permission-request'; request: NormalizedPermissionRequest }
  | { type: 'question'; request: NormalizedQuestionRequest }

  // Session lifecycle
  | { type: 'session-id'; sessionId: string }
  | { type: 'session-updated'; title?: string; summary?: string }

  // State changes
  | { type: 'mode-change'; mode: InteractionMode }
  | { type: 'tool-state-update'; messageId: string; toolId: string;
      state: ToolState; result?: string; error?: string }

  // Completion and errors
  | { type: 'complete'; result: NormalizedResult }
  | { type: 'error'; error: string }
  | { type: 'rate-limit'; retryAfterMs?: number };
```

---

## Normalized Message Model

```typescript
export interface NormalizedMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'result';
  parts: NormalizedPart[];
  timestamp: string;

  // Cost and usage
  cost?: CostInfo;
  usage?: TokenUsage;

  // Identity and context
  model?: string;                        // Which model produced this message
  parentToolUseId?: string;              // Sub-agent grouping (child messages reference parent)
  isSynthetic?: boolean;                 // SDK-generated message (used for skill merging)
  isError?: boolean;                     // Error indicator on result messages

  // Result-specific (only when role === 'result')
  result?: string;                       // Completion text
  durationMs?: number;                   // Total session duration
  totalCost?: CostInfo;                  // Cumulative session cost
  modelUsage?: Record<string, NormalizedModelUsage>;  // Per-model token stats

  // Opaque SDK-specific data preserved for debugging/reprocessing
  metadata?: Record<string, unknown>;
}
```

### Parts

```typescript
export type NormalizedPart =
  // Content
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'file'; path: string; content?: string; mime?: string }

  // Tool execution
  | { type: 'tool-use'; toolId: string; toolName: string; input: unknown }
  | { type: 'tool-result'; toolId: string;
      content: string | NormalizedPart[];
      isError?: boolean;
      title?: string;                    // Display title (OpenCode)
      attachments?: unknown[];           // Tool attachments (OpenCode)
      structuredResult?: StructuredToolResult }

  // Session management
  | { type: 'compact'; trigger: 'auto' | 'manual'; preTokens: number }
  | { type: 'system-status'; subtype: string; status?: string };

export type ToolState = 'pending' | 'running' | 'completed' | 'error';
```

### Structured Tool Results

Rich data for specific tools that need custom UI rendering:

```typescript
export type StructuredToolResult =
  | { kind: 'todo'; oldTodos: TodoItem[]; newTodos: TodoItem[] }
  | { kind: 'write'; filePath: string; content: string;
      originalFile: string; structuredPatch: PatchHunk[] }
  | { kind: 'skill'; success: boolean; commandName: string };
```

### Supporting Types

```typescript
export interface NormalizedPermissionRequest {
  requestId: string;
  toolName: string;
  input: unknown;
  description?: string;
}

export interface NormalizedQuestionRequest {
  requestId: string;
  question: string;
  options?: Array<{ id: string; label: string; placeholder?: string }>;
}

export interface NormalizedResult {
  text?: string;
  isError: boolean;
  cost?: CostInfo;
  durationMs?: number;
  usage?: TokenUsage;
  modelUsage?: Record<string, NormalizedModelUsage>;
}

export interface CostInfo {
  costUsd: number;
  totalCostUsd?: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}

export interface NormalizedModelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  contextWindow?: number;
  costUsd?: number;
}
```

---

## Exhaustive Message Mapping

### Claude Code SDK → Normalized

#### Message Types

| Claude Code `type` | `subtype` | Normalized `role` | Notes |
|--------------------|-----------|--------------------|-------|
| `'system'` | `'init'` | Hidden (not emitted) | Session initialization, filtered |
| `'system'` | `'hook_started'` | Hidden | Pre/post hook starting |
| `'system'` | `'hook_completed'` | Hidden | Hook completed |
| `'system'` | `'hook_response'` | Hidden | Hook output |
| `'system'` | `'status'` (status=`'compacting'`) | `'system'` | Part: `{ type: 'compact', trigger, preTokens }` |
| `'system'` | `'compact_boundary'` | `'system'` | Paired with compacting start, `compact_metadata` extracted |
| `'system'` | other | `'system'` | Part: `{ type: 'system-status', subtype, status }` |
| `'assistant'` | — | `'assistant'` | Content blocks mapped to parts |
| `'user'` | — | `'user'` | Content mapped to parts |
| `'result'` | — | `'result'` | Completion summary with cost/duration/usage |

#### Content Block Types

| Claude `ContentBlock.type` | Normalized `NormalizedPart.type` | Field Mapping |
|---------------------------|----------------------------------|---------------|
| `'text'` | `'text'` | `text` → `text` |
| `'thinking'` | `'reasoning'` | `thinking` → `text` |
| `'tool_use'` | `'tool-use'` | `id` → `toolId`, `name` → `toolName`, `input` → `input` |
| `'tool_result'` | `'tool-result'` | `tool_use_id` → `toolId`, `content` → `content`, `is_error` → `isError` |

#### Special Fields

| Claude Field | Normalized Field | Notes |
|-------------|-----------------|-------|
| `session_id` | Event: `{ type: 'session-id' }` | Extracted from first message that has it |
| `parent_tool_use_id` | `parentToolUseId` | Sub-agent message grouping |
| `isSynthetic` | `isSynthetic` | Skill message merging |
| `is_error` | `isError` | Error status on result messages |
| `cost_usd` | `cost.costUsd` | Per-message cost |
| `total_cost_usd` | `totalCost.costUsd` (on result) | Cumulative session cost |
| `duration_ms` | `durationMs` (on result) | Session duration |
| `message.model` | `model` | Model that produced the message |
| `compact_metadata` | `compact` part `{ trigger, preTokens }` | Compaction metadata |
| `tool_use_result` (Skill) | `structuredResult: { kind: 'skill' }` | Skill invocation result |
| `tool_use_result` (Todo) | `structuredResult: { kind: 'todo' }` | Todo list before/after |
| `tool_use_result` (Write) | `structuredResult: { kind: 'write' }` | File write with diff data |
| `usage.*` | `usage.*` | Token counts mapped field by field |
| `modelUsage` | `modelUsage` | Per-model stats (context window, tokens, cost) |

#### Permission Flow

| Claude Mechanism | Normalized |
|-----------------|------------|
| `canUseTool(toolName, input)` callback | Event: `{ type: 'permission-request', request: { requestId, toolName, input } }` |
| Callback returns `PermissionResult` | `backend.respondToPermission(sessionId, requestId, response)` |
| `AskUserQuestion` tool use | Event: `{ type: 'question', request: { requestId, question, options } }` |

#### Hidden System Subtypes (Not Emitted as Events)

These Claude system messages are filtered and never reach the normalized model:
- `init`, `hook_started`, `hook_completed`, `hook_response`
- `status` (when not compacting-related)

---

### OpenCode SDK → Normalized

#### Events

| OpenCode Event | Normalized Event | Notes |
|---------------|-----------------|-------|
| `EventMessageUpdated` | `{ type: 'message' }` | Full message with parts |
| `EventPartUpdated` | `{ type: 'tool-state-update' }` or `{ type: 'message' }` | Tool state changes get dedicated event; text/reasoning get message update |
| `EventSessionCreated` | `{ type: 'session-id' }` | Extract session ID |
| `EventSessionUpdated` | `{ type: 'session-updated' }` | Title/summary changes |
| `EventSessionDeleted` | Not mapped | Jean-Claude manages its own session lifecycle |
| `EventPermissionAsked` | `{ type: 'permission-request' }` | Tool permission request |
| `EventQuestionAsked` | `{ type: 'question' }` | Interactive user input request |
| `EventToolStateChanged` | `{ type: 'tool-state-update' }` | Tool pending→running→completed/error |
| `EventMessageRemoved` | `{ type: 'message-removed' }` | Session forking / undo |

#### Message Types

| OpenCode `role` | Normalized `role` | Field Mapping |
|----------------|-------------------|---------------|
| `'user'` | `'user'` | `parts` → mapped parts, `model` → `model`, `agent` → `metadata.agent` |
| `'assistant'` | `'assistant'` | `parts` → mapped parts, `modelID` → `model`, `tokens` → `usage`, `cost` → `cost`, `parentID` → `parentToolUseId` |
| (session complete) | `'result'` | Synthesized from final assistant message + session metadata |

#### Part Types

| OpenCode Part | Normalized Part | Field Mapping |
|--------------|----------------|---------------|
| `TextPart` | `{ type: 'text' }` | `text` → `text` |
| `ReasoningPart` | `{ type: 'reasoning' }` | `text` → `text` |
| `FilePart` | `{ type: 'file' }` | `url` → `path`, `mime` → `mime`, `source` → `metadata` |
| `ToolPart` (state=pending) | `{ type: 'tool-use' }` | `tool` → `toolName`, generate `toolId` |
| `ToolPart` (state=completed) | `{ type: 'tool-result' }` | `result` → `content`, `tool` → match `toolId` |
| `ToolPart` (state=error) | `{ type: 'tool-result', isError: true }` | `error` → `content` |
| `SnapshotPart` | Not emitted as part | Stored in `metadata.snapshot` |
| `StepStartPart` | Not emitted as part | Stored in `metadata` |
| `AgentPart` | Not emitted as part | Stored in `metadata.agent` |

#### Tool State Machine

OpenCode tracks tool state on the `ToolPart` itself (pending → running → completed/error). Claude emits separate `tool_use` and `tool_result` messages. Normalization:

- **OpenCode**: `ToolPart` state transitions emit `tool-state-update` events. The adapter also emits `tool-use` part on pending, and `tool-result` part on completed/error.
- **Claude**: `ToolUseBlock` in assistant message → `tool-use` part. `ToolResultBlock` in user message → `tool-result` part. No `tool-state-update` events (state inferred from message order).

#### Permission Flow

| OpenCode Mechanism | Normalized |
|-------------------|------------|
| `EventPermissionAsked` with `{id, sessionID, permission, patterns}` | Event: `{ type: 'permission-request', request: { requestId: id, toolName, input } }` |
| `permission.reply(requestID, 'once' \| 'always' \| 'reject')` | `backend.respondToPermission(sessionId, requestId, response)` |
| `EventQuestionAsked` with `{id, sessionID, questions, tool}` | Event: `{ type: 'question', request: { requestId: id, question, options } }` |
| `question.reply(requestID, answers)` | `backend.respondToQuestion(sessionId, requestId, answer)` |

#### OpenCode-Specific Data Preserved in Metadata

| OpenCode Field | Metadata Key | Notes |
|---------------|-------------|-------|
| `AssistantMessage.parentID` | `parentToolUseId` (first-class) | Sub-agent linking |
| `UserMessage.agent` | `metadata.agent` | Which agent created the message |
| `AssistantMessage.finish` | `metadata.finish` | Finish reason (`stop`, `length`, `tool-calls`, `unknown`) |
| `ToolPart` completed `.metadata` | `metadata.toolMetadata` | Tool execution metadata |
| `ToolPart` completed `.attachments` | `attachments` on `tool-result` | Tool file attachments |
| `ToolPart` completed `.title` | `title` on `tool-result` | Display title |
| `SnapshotPart.snapshot` | `metadata.snapshot` | Execution context snapshot |

---

## Backend Registry

```typescript
// electron/services/agent-backends/index.ts

const backends = new Map<AgentBackendType, () => AgentBackend>();

export function registerBackend(type: AgentBackendType, factory: () => AgentBackend): void {
  backends.set(type, factory);
}

export function getBackend(type: AgentBackendType): AgentBackend {
  const factory = backends.get(type);
  if (!factory) throw new Error(`Unknown agent backend: ${type}`);
  return factory();
}
```

Registered on app startup:
```typescript
registerBackend('claude-code', () => new ClaudeCodeBackend());
registerBackend('opencode', () => new OpencodeBackend());
```

---

## Database Changes

### New Columns

```sql
-- Migration 026: Agent backend abstraction

ALTER TABLE projects ADD COLUMN defaultAgentBackend TEXT DEFAULT 'claude-code';
ALTER TABLE tasks ADD COLUMN agentBackend TEXT DEFAULT 'claude-code';

-- Agent messages: add normalized format + keep raw for reprocessing
ALTER TABLE agent_messages ADD COLUMN normalizedData TEXT;
ALTER TABLE agent_messages ADD COLUMN rawData TEXT;
ALTER TABLE agent_messages ADD COLUMN rawFormat TEXT DEFAULT 'claude-code';
ALTER TABLE agent_messages ADD COLUMN normalizedVersion INTEGER DEFAULT 1;
```

### Eager Migration

All existing `agent_messages.messageData` rows are processed:
1. Copy `messageData` → `rawData`
2. Run `normalizeClaude(JSON.parse(messageData))` → serialize to `normalizedData`
3. Set `rawFormat = 'claude-code'`, `normalizedVersion = CURRENT_NORMALIZATION_VERSION`

### Versioned Re-normalization

A constant `CURRENT_NORMALIZATION_VERSION` (starts at `1`) tracks the mapping logic version. When the normalization logic changes:
1. Bump `CURRENT_NORMALIZATION_VERSION`
2. On app startup (or via new migration), re-normalize rows where `normalizedVersion < CURRENT_NORMALIZATION_VERSION` using `rawData` + `rawFormat`

This preserves original SDK data while keeping normalized data up-to-date.

---

## Refactored agent-service.ts

The orchestration layer becomes backend-agnostic. Core event loop:

```typescript
private async processSession(taskId: string, session: AgentSession) {
  for await (const event of session.events) {
    switch (event.type) {
      case 'message':
        await this.persistMessage(taskId, event.message);
        this.emitToRenderer('agent:message', taskId, event.message);
        break;
      case 'message-removed':
        await this.removeMessage(taskId, event.messageId);
        this.emitToRenderer('agent:message-removed', taskId, event.messageId);
        break;
      case 'permission-request':
        this.emitToRenderer('agent:permission', taskId, event.request);
        break;
      case 'question':
        this.emitToRenderer('agent:question', taskId, event.request);
        break;
      case 'session-id':
        await this.updateSessionId(taskId, event.sessionId);
        break;
      case 'session-updated':
        this.emitToRenderer('agent:session-updated', taskId, event);
        break;
      case 'tool-state-update':
        await this.updateToolState(taskId, event);
        this.emitToRenderer('agent:tool-state', taskId, event);
        break;
      case 'complete':
        await this.handleCompletion(taskId, event.result);
        break;
      case 'error':
        await this.handleError(taskId, event.error);
        break;
      case 'rate-limit':
        this.emitToRenderer('agent:rate-limit', taskId, event);
        break;
    }
  }
}
```

Existing features preserved:
- **Message queue**: Backend-agnostic (queue prompts, send via `backend.sendMessage()`)
- **Permission management**: `backend.respondToPermission()` with allow modes
- **Mode switching**: `backend.setMode()`
- **Session resumption**: Pass `sessionId` in config
- **Task recovery**: Detect stale tasks on startup (backend-agnostic)
- **Notifications**: Desktop notifications for completion/error/permission/question

---

## One-Shot Services (No Change)

`name-generation-service.ts` and `summary-generation-service.ts` stay as direct Claude API calls. They don't go through the agent abstraction — they're cheap utility calls that don't need agent capabilities.

---

## OpenCode Backend Specifics

The OpenCode adapter has unique requirements:

### Server Lifecycle
OpenCode requires a running server process. The adapter manages this:
- `createOpencode()` spawns a server + client on first use
- Server runs on a dynamic port (default 4096)
- Shared across sessions (one server per app instance)
- Cleaned up on `dispose()`

### Session Model Differences
- OpenCode sessions are created explicitly (`session.create()`)
- Messages sent via `session.prompt()` with typed parts
- Permissions handled via `permission.reply(requestId, 'once' | 'always' | 'reject')`
- Questions handled via `question.reply(requestId, answers)`
- Events received via SSE subscription, filtered by session ID

### Result Synthesis
OpenCode does not emit a distinct "result" message like Claude does. The adapter synthesizes a `role: 'result'` normalized message when:
- The agent's finish reason is `'stop'` or `'length'`
- The session is aborted
- An error terminates the session

### Provider/Model Configuration
OpenCode supports multiple providers. The adapter maps Jean-Claude's model preference to OpenCode's `providerID` + `modelID` pair.

### Context Compaction
OpenCode has its own `MessageV2.filterCompacted()` mechanism. The adapter detects compaction events and emits `compact` parts to match Claude's compacting behavior.

---

## UI Changes

### Message Rendering
All components in `src/features/agent/` update to use `NormalizedMessage` / `NormalizedPart`:
- `ui-message-stream`: Renders normalized messages
- `ui-timeline-entry`: Switches on `NormalizedPart.type` instead of `ContentBlock.type`
- `ui-subagent-entry`: Groups by `parentToolUseId` (unchanged concept, new field name)
- `ui-skill-entry`: Uses `structuredResult.kind === 'skill'` + `isSynthetic`
- `ui-todo-list-entry`: Uses `structuredResult.kind === 'todo'`
- `ui-tool-use-card`: Renders `tool-use` parts with matched `tool-result`
- Permission/question UI: Driven by `NormalizedPermissionRequest` / `NormalizedQuestionRequest`
- `ui-context-usage-display`: Uses `modelUsage` from result messages

### Message Merger Adaptations
The `message-merger.ts` logic adapts to normalized types:
- Skill detection: `isSynthetic` + `structuredResult.kind === 'skill'` (same concept, new field paths)
- Sub-agent detection: `parentToolUseId` (same concept, new field name)
- Compacting detection: `{ type: 'compact' }` parts (new part type, replaces subtype checks)
- Tool result mapping: `tool-use` + `tool-result` matched by `toolId` (same concept, new type names)

### Backend Selection
- **Project settings** (`/projects/:projectId/details`): Dropdown for `defaultAgentBackend`
- **Task creation** (`/projects/:projectId/tasks/new`): Optional override dropdown, defaults to project setting

### Backend Indicator
Small badge/icon on task list items showing which backend is running (Claude vs OpenCode).

---

## Implementation Phases

### Phase 1: Define the Abstraction (no behavior change)
1. Create `shared/agent-backend-types.ts` with all common types
2. Create `electron/services/agent-backends/` with interface, registry
3. Write `normalize-claude-message.ts` (testable in isolation)

### Phase 2: Database Migration
4. Create migration 026: add columns to `projects`, `tasks`, `agent_messages`
5. Eager-migrate existing messages (normalize + preserve raw)
6. Update repositories to read `normalizedData`, write both columns

### Phase 3: Claude Code Adapter
7. Extract Claude-specific logic from `agent-service.ts` → `claude-code-backend.ts`
8. Refactor `agent-service.ts` to use `AgentBackend` interface
9. Verify identical behavior (this is the riskiest step)

### Phase 4: UI Updates
10. Update message rendering components to use `NormalizedMessage` / `NormalizedPart`
11. Move `agent-types.ts` to be Claude-adapter-internal (or keep for raw data reference)
12. Add backend selection UI (project settings + task creation)

### Phase 5: OpenCode Adapter
13. Add `@opencode-ai/sdk` dependency
14. Implement `opencode-backend.ts` with server lifecycle management
15. Implement `normalize-opencode-message.ts`
16. End-to-end testing with OpenCode backend

Each phase produces working code. Phase 3 is the critical refactor.
