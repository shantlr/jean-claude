import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { AgentBackendType } from '@shared/agent-backend-types';

export interface BackendModel {
  id: string;
  label: string;
}

/**
 * Fetch available models for a given agent backend.
 * Returns { id, label } pairs. 'default' is always prepended client-side.
 */
export function useBackendModels(backend: AgentBackendType) {
  return useQuery<BackendModel[]>({
    queryKey: ['backendModels', backend],
    queryFn: () => api.agent.getBackendModels(backend),
    staleTime: 5 * 60 * 1000, // match server-side cache TTL
  });
}
