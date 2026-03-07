import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { api } from '@/lib/api';

import { useUsageDisplaySetting } from './use-settings';

const USAGE_POLL_INTERVAL_MS = 120_000;
const USAGE_STALE_TIME_MS = 60_000;

export function useBackendUsage() {
  const { data: usageSettings } = useUsageDisplaySetting();
  const enabledProviders = useMemo(
    () => usageSettings?.enabledProviders ?? [],
    [usageSettings?.enabledProviders],
  );

  return useQuery({
    queryKey: ['backend-usage', enabledProviders],
    queryFn: () => api.usage.getAll(enabledProviders),
    enabled: enabledProviders.length > 0,
    refetchInterval: USAGE_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    staleTime: USAGE_STALE_TIME_MS,
    retry: 2,
    refetchOnWindowFocus: true,
  });
}
