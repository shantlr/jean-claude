import type {
  AgentBackend,
  AgentBackendType,
  AgentTaskContext,
} from '@shared/agent-backend-types';
import type { ModelPreference } from '@shared/types';

import { AGENT_BACKEND_CLASSES } from './agent-backends';

/**
 * Shared prompt used by all backends when summarizing a forked session.
 * Kept here as the single source of truth so updates apply to every backend.
 */
export const SESSION_SUMMARY_PROMPT = [
  'Summarize the prior session context for continuation.',
  'Return concise markdown with:',
  '- What was done',
  '- Key decisions',
  '- Files/components touched (if known)',
  '- Open risks or TODOs',
  '',
  'Keep it short and focused for an engineer continuing the task.',
].join('\n');

const summaryBackends = new Map<AgentBackendType, AgentBackend>();

/**
 * Cross-backend summary behavior note:
 * - Claude Code backend can fork with non-persistent sessions.
 * - OpenCode backend currently does not expose a non-persistent fork flag,
 *   so it must explicitly delete the forked summary session after use.
 *
 * Safety: `summarizeSession()` is stateless — it does not use the backend's
 * `this.sessions` map or `this.taskContext`. The singleton instances cached
 * in `summaryBackends` are safe for concurrent use. The dummy taskContext
 * below is never invoked by the summarization flow.
 */

const SUMMARY_TASK_CONTEXT: AgentTaskContext = {
  taskId: '__session-summary__',
  sessionStartIndex: 0,
  persistRaw: async () => '__session-summary-raw__',
};

function getSummaryBackend(backendType: AgentBackendType): AgentBackend {
  const existing = summaryBackends.get(backendType);
  if (existing) return existing;

  const BackendClass = AGENT_BACKEND_CLASSES[backendType];
  const created = new BackendClass(SUMMARY_TASK_CONTEXT);
  summaryBackends.set(backendType, created);
  return created;
}

export async function summarizeForkedSession({
  backend,
  sessionId,
  cwd,
  model,
}: {
  backend: AgentBackendType;
  sessionId: string;
  cwd: string;
  model: ModelPreference;
}): Promise<string> {
  const backendAdapter = getSummaryBackend(backend);

  return backendAdapter.summarizeSession({
    sessionId,
    cwd,
    model: model !== 'default' ? model : undefined,
  });
}
