import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { api } from '@/lib/api';

function rangeToSince(range: 'today' | '7d' | '30d' | 'all'): string {
  if (range === 'all') return '1970-01-01T00:00:00.000Z';
  const now = new Date();
  if (range === 'today') {
    now.setHours(0, 0, 0, 0);
    return now.toISOString();
  }
  now.setDate(now.getDate() - (range === '7d' ? 7 : 30));
  return now.toISOString();
}

export function useAiUsageDashboard(range: 'today' | '7d' | '30d' | 'all') {
  const since = useMemo(() => rangeToSince(range), [range]);
  return useQuery({
    queryKey: ['ai-usage-dashboard', range, since],
    queryFn: () => api.usage.getDashboard({ since }),
    refetchInterval: range === 'all' ? false : 30_000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}
