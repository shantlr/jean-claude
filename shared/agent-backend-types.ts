// Common types for the agent backend abstraction layer.
// All agent backends (Claude Code, OpenCode, etc.) normalize to these types.
// The rest of the app (IPC, database, UI) only sees these types.

import type { NormalizationEvent } from './normalized-message-v2';
import type {
  PermissionScope,
  ResolvedPermissionRule,
} from './permission-types';
import type { InteractionMode } from './types';

// Re-export shared types that live in normalized-message-v2
export type {
  CostInfo,
  TokenUsage,
  NormalizedResult,
  NormalizedPermissionRequest,
  NormalizationEvent,
} from './normalized-message-v2';

// --- Backend identification ---

export type AgentBackendType = 'claude-code' | 'opencode';

// --- Prompt content parts ---

export type PromptTextPart = {
  type: 'text';
  text: string;
};

export type PromptImagePart = {
  type: 'image';
  /** base64-encoded image data (no data URI prefix) */
  data: string;
  /** MIME type, e.g. "image/webp", "image/jpeg" */
  mimeType: string;
  /** Optional original filename */
  filename?: string;
  /** AVIF-compressed base64 for storage (set by UI before IPC) */
  storageData?: string;
  /** MIME type of the storage version */
  storageMimeType?: string;
};

export type PromptPart = PromptTextPart | PromptImagePart;

// --- Backend interface ---

export interface AgentBackendConfig {
  type: AgentBackendType;
  cwd: string;
  interactionMode: InteractionMode;
  model?: string;
  sessionId?: string; // for session resumption
  /** Session-allowed tools persisted from prior runs (PermissionScope format) */
  persistedSessionRules?: PermissionScope;
  /** Backend-agnostic permission rules for runtime evaluation */
  permissionRules?: ResolvedPermissionRule[];
  /** Runtime MCP server configurations (stdio-based) passed directly to the agent SDK */
  mcpServers?: Record<
    string,
    { command: string; args?: string[]; env?: Record<string, string> }
  >;
}

export interface AgentSession {
  sessionId: string;
  events: AsyncIterable<AgentEvent>;
}

/**
 * Permission response from the UI back to the backend.
 * Maps to SDK-specific permission formats in each adapter.
 */
export interface NormalizedPermissionResponse {
  behavior: 'allow' | 'deny';
  updatedInput?: Record<string, unknown>;
  message?: string;
  // Allow-mode scope for permission persistence
  allowMode?: 'session' | 'project' | 'worktree';
  toolsToAllow?: string[];
  setModeOnAllow?: InteractionMode;
}

/**
 * Per-task context passed to the backend constructor.
 *
 * A new backend instance is created for each task. The agent service provides
 * the state the backend needs for raw message persistence:
 *
 * - `taskId` — identifies the task this backend instance serves.
 * - `sessionStartIndex` — message index offset so resumed sessions
 *    continue numbering where they left off.
 * - `persistRaw` — callback to store each raw SDK message in the database;
 *    returns the stored row ID (used as `rawMessageId` in AgentEvent).
 */
export interface AgentTaskContext {
  taskId: string;
  sessionStartIndex: number;
  persistRaw: (params: {
    messageIndex: number;
    backendSessionId: string | null;
    rawData: unknown;
  }) => Promise<string>;
}

export interface AgentBackend {
  start(config: AgentBackendConfig, parts: PromptPart[]): Promise<AgentSession>;
  summarizeSession(params: {
    sessionId: string;
    cwd: string;
    model?: string;
  }): Promise<string>;
  stop(sessionId: string): Promise<void>;
  respondToPermission(
    sessionId: string,
    requestId: string,
    response: NormalizedPermissionResponse,
  ): Promise<void>;
  respondToQuestion(
    sessionId: string,
    requestId: string,
    answer: Record<string, string>,
  ): Promise<void>;
  setMode(sessionId: string, mode: InteractionMode): Promise<void>;
  getSessionAllowedTools?(sessionId: string): string[];
  dispose(): Promise<void>;
}

// --- Normalized events emitted by backends ---
//
// AgentEvent extends NormalizationEvent:
// - Replaces 'entry' variant to add rawMessageId
// - Adds backend-only variants: 'question', 'mode-change'

export type AgentEvent =
  | Exclude<NormalizationEvent, { type: 'entry' }>
  | (Extract<NormalizationEvent, { type: 'entry' }> & {
      rawMessageId: string | null;
    })
  | { type: 'question'; request: NormalizedQuestionRequest }
  | { type: 'mode-change'; mode: InteractionMode };

// --- Question types (backend-only, not produced by normalizers) ---

export interface NormalizedQuestionOption {
  label: string;
  description: string;
}

export interface NormalizedQuestion {
  question: string;
  header: string;
  options: NormalizedQuestionOption[];
  multiSelect: boolean;
}

export interface NormalizedQuestionRequest {
  requestId: string;
  questions: NormalizedQuestion[];
}
