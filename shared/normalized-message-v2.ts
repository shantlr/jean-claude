import type { InteractionMode } from './types';
import type { TodoItem } from './agent-types';

export type NormalizedEntry = {
  id: string;
  date: string;
  model?: string;
  isSynthetic?: boolean;
  parentToolId?: string;
} & NormalizedEntryBody;

export type NormalizedEntryBody =
  | { type: 'user-prompt'; value: string; isSDKSynthetic?: boolean }
  | { type: 'assistant-message'; value: string }
  | { type: 'thinking'; value: string }
  | { type: 'todo-update'; oldTodos: TodoItem[]; newTodos: TodoItem[] }
  | { type: 'file-edited'; filePath: string }
  | {
      type: 'session-summary';
      title?: string;
      summary: { additions: number; deletions: number; files: number };
    }
  | { type: 'system-status'; status: 'compacting' | null }
  | {
      type: 'result';
      value?: string;
      isError: boolean;
      durationMs?: number;
      cost?: number;
      apiCost?: number;
      usage?: TokenUsage;
      contextUsage?: TokenUsage;
    }
  | NormalizedToolUse;

/**
 * Normalized representation of a tool use, with specific fields for different tool types.
 *
 * each tool should have a `name` field that identifies the tool type
 *
 * they should have a `result` field once the tool has completed, which can be used to determine if the tool is still running or has completed, and to show a preview of the result in the last activity summary
 */
export type NormalizedToolUse = {
  type: 'tool-use';
  toolId: string;
  parentToolId?: string;
  permission?: {
    allowedBy: 'agent' | 'system';
    rule?: {
      tool: string;
      pattern: string;
    };
  };
} & (
  | {
      name: 'sub-agent';
      input: {
        agentType: string;
        description: string;
        prompt: string;
      };
      result?: {
        output: string;
        // agentId?: string;
      };
    }
  | {
      name: 'read';
      input: {
        filePath: string;
      };
      result?: string;
    }
  | {
      name: 'glob';
      input: {
        pattern: string;
      };
      result?: string;
    }
  | {
      name: 'grep';
      input: {
        pattern: string;
      };
      result?: string;
    }
  | {
      name: 'mcp';
      toolName: string;
      input: Record<string, unknown>;
      result?: Record<string, unknown>;
    }
  | {
      name: 'ask-user-question';
      input: {
        questions: {
          question: string;
          header: string;
          multiSelect?: boolean;
          options: {
            label: string;
            description: string;
          }[];
        }[];
      };
      result?: {
        answers: {
          question: string;
          answer: string | string[];
        }[];
      };
    }
  | {
      name: 'write';
      input: {
        filePath: string;
        value: string;
        files?: {
          filePath: string;
          type: 'add' | 'update' | 'delete';
          patch?: string;
          additions?: number;
          deletions?: number;
          before?: string;
          after?: string;
        }[];
      };
      result?: {
        success: boolean;
      };
    }
  | {
      name: 'todo-write';
      input: {
        todos?: TodoItem[];
      };
      result?: {
        oldTodos: TodoItem[];
        newTodos: TodoItem[];
      };
    }
  | {
      name: 'bash';
      input: {
        command: string;
        description?: string;
      };
      result?: {
        content: string;
        isError?: boolean;
      };
    }
  | {
      name: 'edit';
      input: {
        filePath: string;
        oldString: string;
        newString: string;
        files?: {
          filePath: string;
          type: 'add' | 'update' | 'delete';
          patch?: string;
          additions?: number;
          deletions?: number;
          before?: string;
          after?: string;
        }[];
      };
      result?: {
        changes: {
          oldStart: number;
          newStart: number;
          lines: string[];
        }[];
      };
    }
  | {
      name: 'exit-plan-mode';
      input: {
        plan: string;
      };
      result?: {
        content: string;
      };
    }
  | {
      name: 'skill';
      skillName: string;
      input: {};
      result?: {};
    }
  | {
      name: 'web-fetch';
      input: {
        url: string;
        prompt: string;
      };
      result?: {
        content: string;
        code?: number;
      };
    }
  | {
      name: 'web-search';
      input: {
        query: string;
      };
      result?: {
        content: string;
      };
    }
  // Fallback
  | {
      name: string & {};
      input?: unknown;
      result?: unknown;
    }
);

/**
 * Helper to extract a specific tool-use variant by name.
 * Usage: `ToolUseByName<'bash'>` gives the full narrowed type for bash tool use.
 */
export type ToolUseByName<N extends string> = Extract<
  NormalizedToolUse,
  { name: N }
>;

// --- Shared sub-types used by NormalizationEvent and AgentEvent ---

export interface CostInfo {
  costUsd: number;
  apiCostUsd?: number;
  totalCostUsd?: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
}

export interface NormalizedResult {
  text?: string;
  isError: boolean;
  model?: string;
  cost?: CostInfo;
  durationMs?: number;
  usage?: TokenUsage;
  contextUsage?: TokenUsage;
}

export interface NormalizedPermissionRequest {
  requestId: string;
  toolName: string;
  input: Record<string, unknown>;
  description?: string;
  sessionAllowButton?: {
    label: string;
    toolsToAllow: string[];
    setModeOnAllow?: InteractionMode;
  };
}

// --- Normalization events (shared by all backend normalizers) ---
//
// The normalizer handles most raw SDK events, producing typed events that
// the backend can yield with minimal post-processing. This keeps event
// mapping logic centralised in the normalizer rather than spread across
// backend switch statements.

export type NormalizationEvent =
  | { type: 'entry'; entry: NormalizedEntry }
  | { type: 'entry-update'; entry: NormalizedEntry }
  | {
      type: 'tool-result';
      toolId: string;
      result?: string;
      isError: boolean;
      durationMs?: number;
    }
  | { type: 'session-id'; sessionId: string }
  | { type: 'session-updated'; title?: string; summary?: string }
  | { type: 'permission-request'; request: NormalizedPermissionRequest }
  | { type: 'complete'; result: NormalizedResult }
  | { type: 'error'; error: string }
  | { type: 'rate-limit'; retryAfterMs?: number; message?: string };

export const CURRENT_NORMALIZATION_VERSION = 3;
