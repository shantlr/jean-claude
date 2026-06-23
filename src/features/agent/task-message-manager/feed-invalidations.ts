import type { QueryClient } from '@tanstack/react-query';

import { feedQueryKeys } from '@/lib/feed-query-keys';
import { markResourceStale } from '@/cache/cache-actions';

export function invalidateTaskFeed(
  queryClient: Pick<QueryClient, 'invalidateQueries'>,
) {
  markResourceStale('feed:tasks');
  void queryClient.invalidateQueries({
    queryKey: feedQueryKeys.tasks,
  });
}
