// Agent-related types shared between main and renderer processes

import type { InteractionMode } from './types';

// SDK message types (simplified for our use case)
// System message subtypes that should be hidden in the message stream
export const HIDDEN_SYSTEM_SUBTYPES = [
  'init',
  'hook_started',
  'hook_completed',
] as const;

export type HiddenSystemSubtype = (typeof HIDDEN_SYSTEM_SUBTYPES)[number];

export interface AgentMessage {
  type: 'system' | 'assistant' | 'user' | 'result';
  subtype?: string; // SDK provides various subtypes like 'init', 'hook_started', 'hook_completed', etc.
  session_id?: string;
  message?: AssistantMessage | UserMessage;
  result?: string;
  cost_usd?: number;
  duration_ms?: number;
  duration_api_ms?: number;
  total_cost_usd?: number;
  is_error?: boolean;
  // SDK-provided fields for skill messages
  isSynthetic?: boolean;
  tool_use_result?: {
    success: boolean;
    commandName: string;
  };
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
} as const;
