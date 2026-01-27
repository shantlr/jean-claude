import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';

export function useClaudeUsage() {
  return useQuery({
    queryKey: ['claude-usage'],
    queryFn: api.usage.get,
    refetchInterval: 60 * 1000, // Poll every 60 seconds
    refetchIntervalInBackground: false, // Don't poll when window is not focused
    staleTime: 30 * 1000, // Consider data stale after 30 seconds
    retry: 2, // Retry failed requests twice
    refetchOnWindowFocus: true, // Refresh when window regains focus
  });
}
