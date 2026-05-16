import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { UsageProviderType } from '@shared/usage-types';

export function useUsageHistory({
  provider,
  limitKey,
  since,
  until,
  enabled = true,
}: {
  provider: UsageProviderType;
  limitKey: string;
  since: string;
  until?: string;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: [
      'usage-history',
      provider,
      limitKey,
      since,
      ...(until ? [until] : []),
    ],
    queryFn: () => api.usage.getHistory({ provider, limitKey, since, until }),
    enabled,
    staleTime: 60_000,
  });
}
