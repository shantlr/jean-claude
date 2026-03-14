import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';

const RAM_POLL_INTERVAL_MS = 60_000;

export function useMemoryUsage() {
  return useQuery({
    queryKey: ['system-memory-usage'],
    queryFn: () => api.system.getMemoryUsage(),
    refetchInterval: RAM_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    staleTime: RAM_POLL_INTERVAL_MS,
  });
}
