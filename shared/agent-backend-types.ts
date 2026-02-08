// Common types for the agent backend abstraction layer.
// All agent backends (Claude Code, OpenCode, etc.) normalize to these types.
// The rest of the app (IPC, database, UI) only sees these types.

import type { InteractionMode } from './types';

// --- Backend identification ---

export type AgentBackendType = 'claude-code' | 'opencode';

// --- Backend interface ---

export interface AgentBackendConfig {
  type: AgentBackendType;
  cwd: string;
  interactionMode: InteractionMode;
  model?: string;
  sessionId?: string; // for session resumption
  sessionAllowedTools?: string[];
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

export interface AgentBackend {
  start(config: AgentBackendConfig, prompt: string): Promise<AgentSession>;
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
  | {
      type: 'tool-state-update';
      messageId: string;
      toolId: string;
      state: ToolState;
      result?: string;
      error?: string;
    }

  // Completion and errors
  | { type: 'complete'; result: NormalizedResult }
  | { type: 'error'; error: string }
  | { type: 'rate-limit'; retryAfterMs?: number };

// --- Normalized message model ---

export interface NormalizedMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'result';
  parts: NormalizedPart[];
  timestamp: string;

  // Cost and usage
  cost?: CostInfo;
  usage?: TokenUsage;

  // Identity and context
  model?: string;
  parentToolUseId?: string; // Sub-agent grouping
  isSynthetic?: boolean; // SDK-generated message (skill merging)
  isError?: boolean; // Error indicator (result messages)

  // Result-specific (only when role === 'result')
  result?: string; // Completion text
  durationMs?: number;
  totalCost?: CostInfo;
  modelUsage?: Record<string, NormalizedModelUsage>;

  // Opaque SDK-specific data preserved for debugging/reprocessing
  metadata?: Record<string, unknown>;
}

// --- Normalized parts ---

export type NormalizedPart =
  // Content
  | NormalizedTextPart
  | NormalizedReasoningPart
  | NormalizedFilePart
  // Tool execution
  | NormalizedToolUsePart
  | NormalizedToolResultPart
  // Session management
  | NormalizedCompactPart
  | NormalizedSystemStatusPart
  // Fallback for unrecognized data
  | NormalizedUnknownPart;

export interface NormalizedTextPart {
  type: 'text';
  text: string;
}

export interface NormalizedReasoningPart {
  type: 'reasoning';
  text: string;
}

export interface NormalizedFilePart {
  type: 'file';
  path: string;
  content?: string;
  mime?: string;
}

export interface NormalizedToolUsePart {
  type: 'tool-use';
  toolId: string;
  toolName: string;
  input: unknown;
}

export interface NormalizedToolResultPart {
  type: 'tool-result';
  toolId: string;
  content: string | NormalizedPart[];
  isError?: boolean;
  title?: string; // Display title (OpenCode)
  attachments?: unknown[]; // Tool attachments (OpenCode)
  structuredResult?: StructuredToolResult;
}

export interface NormalizedCompactPart {
  type: 'compact';
  trigger: 'auto' | 'manual';
  preTokens: number;
}

export interface NormalizedSystemStatusPart {
  type: 'system-status';
  subtype: string;
  status?: string;
}

export interface NormalizedUnknownPart {
  type: 'unknown';
  /** The original type string that wasn't recognized. */
  originalType: string;
  /** The raw data, preserved for debugging. */
  data: unknown;
}

export type ToolState = 'pending' | 'running' | 'completed' | 'error';

// --- Structured tool results for rich UI rendering ---

export type StructuredToolResult =
  | StructuredTodoResult
  | StructuredWriteResult
  | StructuredSkillResult;

export interface StructuredTodoResult {
  kind: 'todo';
  oldTodos: TodoItem[];
  newTodos: TodoItem[];
}

export interface StructuredWriteResult {
  kind: 'write';
  filePath: string;
  content: string;
  originalFile: string;
  structuredPatch: PatchHunk[];
}

export interface StructuredSkillResult {
  kind: 'skill';
  success: boolean;
  commandName: string;
}

// Re-export from agent-types for convenience (these are SDK-agnostic shapes)
export interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm: string;
}

export interface PatchHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

// --- Interactive request types ---

export interface NormalizedPermissionRequest {
  requestId: string;
  toolName: string;
  input: unknown;
  description?: string;
  // Session-level allow button (Claude Code specific, preserved for UI)
  sessionAllowButton?: {
    label: string;
    toolsToAllow: string[];
    setModeOnAllow?: InteractionMode;
  };
}

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

// --- Result and cost types ---

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

// --- Normalization versioning ---

/**
 * Current version of the normalization logic.
 * Bump this when the mapping changes, so stored messages can be re-normalized.
 */
export const CURRENT_NORMALIZATION_VERSION = 1;

// --- IPC event payloads (backend-agnostic) ---

export interface NormalizedMessageEvent {
  taskId: string;
  message: NormalizedMessage;
}

export interface NormalizedStatusEvent {
  taskId: string;
  status: 'running' | 'waiting' | 'completed' | 'errored' | 'interrupted';
  error?: string;
}

export interface NormalizedPermissionEvent {
  taskId: string;
  requestId: string;
  toolName: string;
  input: unknown;
  sessionAllowButton?: NormalizedPermissionRequest['sessionAllowButton'];
}

export interface NormalizedQuestionEvent {
  taskId: string;
  requestId: string;
  questions: NormalizedQuestion[];
}

// --- Type guards ---

export function isNormalizedTextPart(
  part: NormalizedPart,
): part is NormalizedTextPart {
  return part.type === 'text';
}

export function isNormalizedToolUsePart(
  part: NormalizedPart,
): part is NormalizedToolUsePart {
  return part.type === 'tool-use';
}

export function isNormalizedToolResultPart(
  part: NormalizedPart,
): part is NormalizedToolResultPart {
  return part.type === 'tool-result';
}

export function isNormalizedUnknownPart(
  part: NormalizedPart,
): part is NormalizedUnknownPart {
  return part.type === 'unknown';
}

export function isStructuredTodoResult(
  result: StructuredToolResult,
): result is StructuredTodoResult {
  return result.kind === 'todo';
}

export function isStructuredWriteResult(
  result: StructuredToolResult,
): result is StructuredWriteResult {
  return result.kind === 'write';
}

export function isStructuredSkillResult(
  result: StructuredToolResult,
): result is StructuredSkillResult {
  return result.kind === 'skill';
}
