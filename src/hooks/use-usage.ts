import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';

import { useUsageDisplaySetting } from './use-settings';

export function useBackendUsage() {
  const { data: usageSettings } = useUsageDisplaySetting();
  const enabledProviders = usageSettings?.enabledProviders ?? [];

  return useQuery({
    queryKey: ['backend-usage', enabledProviders],
    queryFn: () => api.usage.getAll(enabledProviders),
    enabled: enabledProviders.length > 0,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
    retry: 2,
    refetchOnWindowFocus: true,
  });
}
