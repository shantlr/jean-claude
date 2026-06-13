import type { AgentBackendType } from '@shared/agent-backend-types';
import type { ModelPreference } from '@shared/types';

const DEFAULT_CONTEXT_WINDOW = 200_000;

const CLAUDE_CONTEXT_WINDOWS: Record<string, number> = {
  default: 200_000,
  opus: 200_000,
  sonnet: 200_000,
  haiku: 200_000,
};

export function getContextWindowForModel({
  backend,
  model,
  dynamicContextWindow,
}: {
  backend: AgentBackendType;
  model: ModelPreference;
  dynamicContextWindow?: number;
}): number {
  if (dynamicContextWindow && dynamicContextWindow > 0) {
    return dynamicContextWindow;
  }

  if (backend === 'claude-code') {
    return CLAUDE_CONTEXT_WINDOWS[model] ?? DEFAULT_CONTEXT_WINDOW;
  }

  return DEFAULT_CONTEXT_WINDOW;
}
