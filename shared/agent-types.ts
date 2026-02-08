// Agent-related types shared between main and renderer processes

import type { InteractionMode } from './types';

// SDK message types (simplified for our use case)
// System message subtypes that should be hidden in the message stream
export const HIDDEN_SYSTEM_SUBTYPES = [
  'init',
  'hook_started',
  'hook_completed',
  'hook_response',
  'status', // Handled via compacting merge
  'compact_boundary', // Handled via compacting merge
] as const;

export type HiddenSystemSubtype = (typeof HIDDEN_SYSTEM_SUBTYPES)[number];

// Compacting metadata from compact_boundary message
export interface CompactMetadata {
  trigger: 'auto' | 'manual';
  pre_tokens: number;
}

export interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm: string;
}

export interface TodoToolUseResult {
  oldTodos: TodoItem[];
  newTodos: TodoItem[];
}

export interface SkillToolUseResult {
  success: boolean;
  commandName: string;
}

// Structured patch hunk from Write/Edit tool results
export interface PatchHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

// Result from Write/Edit tools with structured diff data
export interface WriteToolUseResult {
  type: 'update';
  filePath: string;
  content: string;
  structuredPatch: PatchHunk[];
  originalFile: string;
}

// Per-model usage statistics from SDK result messages
export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  webSearchRequests: number;
  costUSD: number;
  contextWindow: number;
}

export interface AgentMessage {
  type: 'system' | 'assistant' | 'user' | 'result';
  subtype?: string; // SDK provides various subtypes like 'init', 'hook_started', 'hook_completed', etc.
  status?: string; // For system/status messages (e.g., 'compacting')
  session_id?: string;
  parent_tool_use_id?: string | null; // Links sub-agent messages to parent Task tool_use
  message?: AssistantMessage | UserMessage;
  result?: string;
  cost_usd?: number;
  duration_ms?: number;
  duration_api_ms?: number;
  total_cost_usd?: number;
  is_error?: boolean;
  // SDK-provided fields for skill messages and todo updates
  isSynthetic?: boolean;
  tool_use_result?: SkillToolUseResult | TodoToolUseResult | WriteToolUseResult;
  // SDK-provided fields for compact_boundary messages
  compact_metadata?: CompactMetadata;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_creation?: {
      ephemeral_1h_input_tokens?: number;
      ephemeral_5m_input_tokens?: number;
    };
    server_tool_use?: {
      web_fetch_requests?: number;
      web_search_requests?: number;
    };
  };
  // SDK-provided per-model usage stats (available on result messages)
  modelUsage?: Record<string, ModelUsage>;
}

export interface AssistantMessage {
  role: 'assistant';
  content: ContentBlock[];
  model?: string;
  stop_reason?: string;
}

export interface UserMessage {
  role: 'user';
  content: string | ContentBlock[];
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string | ContentBlock[];
  is_error?: boolean;
}

// Permission request from agent
export interface PermissionRequest {
  requestId: string;
  taskId: string;
  toolName: string;
  input: Record<string, unknown>;
}

// Question from agent (AskUserQuestion tool)
export interface QuestionOption {
  label: string;
  description: string;
}

export interface AgentQuestion {
  question: string;
  header: string;
  options: QuestionOption[];
  multiSelect: boolean;
}

export interface QuestionRequest {
  requestId: string;
  taskId: string;
  questions: AgentQuestion[];
}

// Response types
export interface PermissionResponse {
  behavior: 'allow' | 'deny';
  updatedInput?: Record<string, unknown>;
  message?: string;
}

export interface QuestionResponse {
  answers: Record<string, string>;
}

// IPC event payloads
export interface AgentMessageEvent {
  taskId: string;
  message: AgentMessage;
}

export interface AgentStatusEvent {
  taskId: string;
  status: 'running' | 'waiting' | 'completed' | 'errored';
  error?: string;
}

export interface SessionAllowButton {
  label: string;
  toolsToAllow: string[];
  setModeOnAllow?: InteractionMode;
}

export interface AgentPermissionEvent {
  taskId: string;
  requestId: string;
  toolName: string;
  input: Record<string, unknown>;
  sessionAllowButton?: SessionAllowButton;
}

export interface AgentQuestionEvent {
  taskId: string;
  requestId: string;
  questions: AgentQuestion[];
}

export interface AgentNameUpdatedEvent {
  taskId: string;
  name: string;
}

// Queued prompt types
export interface QueuedPrompt {
  id: string;
  content: string;
  createdAt: number;
}

export interface AgentQueueUpdateEvent {
  taskId: string;
  queuedPrompts: QueuedPrompt[];
}

export function isSkillToolUseResult(
  result: SkillToolUseResult | TodoToolUseResult | WriteToolUseResult,
): result is SkillToolUseResult {
  return !!result && typeof result === 'object' && 'commandName' in result;
}

export function isTodoToolUseResult(
  result: SkillToolUseResult | TodoToolUseResult | WriteToolUseResult,
): result is TodoToolUseResult {
  return !!result && typeof result === 'object' && 'newTodos' in result;
}

export function isWriteToolUseResult(
  result: SkillToolUseResult | TodoToolUseResult | WriteToolUseResult,
): result is WriteToolUseResult {
  return (
    !!result &&
    typeof result === 'object' &&
    'type' in result &&
    result.type === 'update' &&
    'originalFile' in result
  );
}

// IPC channel names
export const AGENT_CHANNELS = {
  // Events (main -> renderer)
  MESSAGE: 'agent:message',
  STATUS: 'agent:status',
  PERMISSION: 'agent:permission',
  QUESTION: 'agent:question',
  NAME_UPDATED: 'agent:nameUpdated',
  QUEUE_UPDATE: 'agent:queueUpdate',
  // Invoke (renderer -> main)
  START: 'agent:start',
  STOP: 'agent:stop',
  RESPOND: 'agent:respond',
  SEND_MESSAGE: 'agent:sendMessage',
  GET_MESSAGES: 'agent:getMessages',
  GET_MESSAGE_COUNT: 'agent:getMessageCount',
  QUEUE_PROMPT: 'agent:queuePrompt',
  CANCEL_QUEUED_PROMPT: 'agent:cancelQueuedPrompt',
  GET_PENDING_REQUEST: 'agent:getPendingRequest',
  GET_RAW_MESSAGES: 'agent:getRawMessages',
} as const;
