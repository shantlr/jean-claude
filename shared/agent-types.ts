// Agent-related types shared between main and renderer processes

// SDK message types (simplified for our use case)
export interface AgentMessage {
  type: 'system' | 'assistant' | 'user' | 'result';
  subtype?: 'init';
  session_id?: string;
  message?: AssistantMessage | UserMessage;
  result?: string;
  cost_usd?: number;
  duration_ms?: number;
  duration_api_ms?: number;
  total_cost_usd?: number;
  is_error?: boolean;
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

export interface AgentPermissionEvent {
  taskId: string;
  requestId: string;
  toolName: string;
  input: Record<string, unknown>;
  canAllowForSession: boolean;
}

// Tools that can be allowed for the entire session
export const SESSION_ALLOWABLE_TOOLS = ['Edit'] as const;
export type SessionAllowableTool = (typeof SESSION_ALLOWABLE_TOOLS)[number];

export interface AgentQuestionEvent {
  taskId: string;
  requestId: string;
  questions: AgentQuestion[];
}

// IPC channel names
export const AGENT_CHANNELS = {
  // Events (main -> renderer)
  MESSAGE: 'agent:message',
  STATUS: 'agent:status',
  PERMISSION: 'agent:permission',
  QUESTION: 'agent:question',
  // Invoke (renderer -> main)
  START: 'agent:start',
  STOP: 'agent:stop',
  RESPOND: 'agent:respond',
  SEND_MESSAGE: 'agent:sendMessage',
  GET_MESSAGES: 'agent:getMessages',
  GET_MESSAGE_COUNT: 'agent:getMessageCount',
} as const;
