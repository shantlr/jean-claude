import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { AgentBackendType } from '@shared/agent-backend-types';

const BACKEND_LABELS: Record<AgentBackendType, string> = {
  'claude-code': 'Claude Code',
  opencode: 'OpenCode',
  codex: 'Codex',
};

export function useRateLimitSwapPreview(
  backend: AgentBackendType,
  enabled = true,
) {
  return useQuery({
    queryKey: ['rate-limit-swap-preview', backend],
    queryFn: () => api.rateLimitSwap.resolve(backend),
    enabled,
    staleTime: 15_000,
  });
}

export async function resolveRateLimitSwapSelection({
  backend,
  model,
  thinkingEffort,
  enabled = true,
}: {
  backend: AgentBackendType;
  model: string;
  thinkingEffort: string;
  enabled?: boolean;
}) {
  if (!enabled) {
    return { backend, model, thinkingEffort };
  }

  const result = await api.rateLimitSwap.resolve(backend);
  if (!result.swapped) {
    return { backend, model, thinkingEffort };
  }

  const backendChanged = result.backend !== backend;
  return {
    backend: result.backend,
    model: result.model ?? (backendChanged ? 'default' : model),
    thinkingEffort:
      result.thinkingEffort ?? (backendChanged ? 'default' : thinkingEffort),
  };
}

export function RateLimitSwapPreview({
  requestedBackend,
  model,
  thinkingEffort,
}: {
  requestedBackend: AgentBackendType;
  model?: string | null;
  thinkingEffort?: string | null;
}) {
  const { data } = useRateLimitSwapPreview(requestedBackend);
  if (!data?.swapped) return null;

  const backendChanged = data.backend !== requestedBackend;
  const effectiveModel = data.model ?? (backendChanged ? 'default' : model);
  const effectiveThinking =
    data.thinkingEffort ?? (backendChanged ? 'default' : thinkingEffort);
  const details = [
    effectiveModel && effectiveModel !== 'default' ? effectiveModel : null,
    effectiveThinking && effectiveThinking !== 'default'
      ? `${effectiveThinking} thinking`
      : null,
  ].filter(Boolean);

  return (
    <div className="border-acc/25 bg-acc/10 text-acc flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs whitespace-nowrap">
      <span className="text-ink-3">Uses</span>
      <span className="font-medium">{BACKEND_LABELS[data.backend]}</span>
      {details.length > 0 && (
        <span className="text-ink-3">({details.join(', ')})</span>
      )}
    </div>
  );
}
