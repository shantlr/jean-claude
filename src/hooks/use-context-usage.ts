import { useMemo } from 'react';

import { calculateContextUsage, type ContextUsage } from '@/lib/context-usage';
import type { AgentBackendType } from '@shared/agent-backend-types';
import type { NormalizedEntry } from '@shared/normalized-message-v2';

export type { ContextUsage } from '@/lib/context-usage';

export function useContextUsage({
  entries,
  backend,
  contextWindow,
}: {
  entries: NormalizedEntry[];
  backend: AgentBackendType;
  contextWindow: number;
}): ContextUsage {
  return useMemo(
    () => calculateContextUsage({ entries, backend, contextWindow }),
    [entries, backend, contextWindow],
  );
}
