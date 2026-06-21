import { useQuery } from '@tanstack/react-query';

import type { AgentBackendType } from '@shared/agent-backend-types';
import { api } from '@/lib/api';


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
  enabled: _enabled = true,
}: {
  backend: AgentBackendType;
  model: string;
  thinkingEffort: string;
  enabled?: boolean;
}) {
  return { backend, model, thinkingEffort };
}

export function RateLimitSwapPreview({
  requestedBackend,
  model,
  thinkingEffort,
  onApplySuggestion,
}: {
  requestedBackend: AgentBackendType;
  model?: string | null;
  thinkingEffort?: string | null;
  onApplySuggestion?: (selection: {
    backend: AgentBackendType;
    model: string;
    thinkingEffort: string;
  }) => void;
}) {
  const { data } = useRateLimitSwapPreview(requestedBackend);
  if (!data?.swapped) return null;

  const backendChanged = data.backend !== requestedBackend;
  const effectiveModel = data.model ?? (backendChanged ? 'default' : model);
  const effectiveThinking =
    data.thinkingEffort ?? (backendChanged ? 'default' : thinkingEffort);
  const selectionAlreadyMatchesSuggestion =
    !backendChanged &&
    effectiveModel === model &&
    effectiveThinking === thinkingEffort;
  if (selectionAlreadyMatchesSuggestion) return null;

  const details = [
    effectiveModel && effectiveModel !== 'default' ? effectiveModel : null,
    effectiveThinking && effectiveThinking !== 'default'
      ? `${effectiveThinking} thinking`
      : null,
  ].filter(Boolean);

  return (
    <button
      type="button"
      onClick={() =>
        onApplySuggestion?.({
          backend: data.backend,
          model: effectiveModel ?? 'default',
          thinkingEffort: effectiveThinking ?? 'default',
        })
      }
      className="flex cursor-pointer items-center gap-1.5 rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-xs whitespace-nowrap text-amber-300 transition-colors hover:border-amber-400/40 hover:bg-amber-500/15"
    >
      <span className="text-ink-3">Rate limit swapper suggests</span>
      <span className="font-medium">{BACKEND_LABELS[data.backend]}</span>
      {details.length > 0 && (
        <span className="text-ink-3">({details.join(', ')})</span>
      )}
      <span className="text-ink-3">- click to use</span>
    </button>
  );
}
