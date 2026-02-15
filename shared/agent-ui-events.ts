import type { AgentQuestion, QueuedPrompt } from './agent-types';
import type {
  NormalizedEntry,
  NormalizedPermissionRequest,
} from './normalized-message-v2';
import type { TaskStatus } from './types';

export type AgentUIEventPayload =
  | { type: 'entry'; entry: NormalizedEntry }
  | { type: 'entry-update'; entry: NormalizedEntry }
  | {
      type: 'tool-result';
      toolId: string;
      result?: string;
      isError: boolean;
      durationMs?: number;
    }
  | { type: 'status'; status: TaskStatus; error?: string }
  | ({ type: 'permission' } & NormalizedPermissionRequest)
  | { type: 'question'; requestId: string; questions: AgentQuestion[] }
  | { type: 'name-updated'; name: string }
  | { type: 'queue-update'; queuedPrompts: QueuedPrompt[] };

export type AgentUIEvent = { taskId: string } & AgentUIEventPayload;
