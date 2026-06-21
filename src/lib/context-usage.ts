import type {
  NormalizedEntry,
  TokenUsage,
} from '@shared/normalized-message-v2';
import type { AgentBackendType } from '@shared/agent-backend-types';


export type ContextUsageSource = 'latest-response' | 'opencode-estimate';

export interface ContextUsage {
  contextTokens: number;
  contextWindow: number;
  percentage: number;
  hasData: boolean;
  source?: ContextUsageSource;
  isEstimate: boolean;
}

export function calculateContextUsage({
  entries,
  backend,
  contextWindow,
}: {
  entries: NormalizedEntry[];
  backend: AgentBackendType;
  contextWindow: number;
}): ContextUsage {
  const isOpenCode = backend === 'opencode';
  const usage = findLatestUsageAfterCompact(entries, {
    requireContextUsage: isOpenCode,
  });

  if (!usage) {
    return {
      contextTokens: 0,
      contextWindow,
      percentage: 0,
      hasData: false,
      isEstimate: isOpenCode,
    };
  }

  const contextTokens = isOpenCode
    ? sumOpenCodeContextTokens(usage)
    : sumClaudeContextTokens(usage);

  return {
    contextTokens,
    contextWindow,
    percentage:
      contextWindow > 0
        ? Math.min(100, (contextTokens / contextWindow) * 100)
        : 0,
    hasData: true,
    source: isOpenCode ? 'opencode-estimate' : 'latest-response',
    isEstimate: isOpenCode,
  };
}

function findLatestUsageAfterCompact(
  entries: NormalizedEntry[],
  { requireContextUsage }: { requireContextUsage: boolean },
): TokenUsage | null {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i];
    if (entry.type === 'system-status' && entry.status === null) return null;
    if (entry.type === 'result') {
      if (entry.contextUsage) return entry.contextUsage;
      if (!requireContextUsage && entry.usage) return entry.usage;
    }
  }

  return null;
}

function sumClaudeContextTokens(usage: TokenUsage): number {
  return (
    usage.inputTokens +
    (usage.cacheReadTokens ?? 0) +
    (usage.cacheCreationTokens ?? 0)
  );
}

function sumOpenCodeContextTokens(usage: TokenUsage): number {
  return (
    usage.inputTokens +
    usage.outputTokens +
    (usage.reasoningTokens ?? 0) +
    (usage.cacheReadTokens ?? 0) +
    (usage.cacheCreationTokens ?? 0)
  );
}
