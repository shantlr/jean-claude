import type { QueryClient } from '@tanstack/react-query';

import { invalidateFeedResource } from '@/cache/feed-cache';

export function invalidateTaskFeed(
  queryClient: Pick<QueryClient, 'invalidateQueries'>,
) {
  invalidateFeedResource(queryClient, 'tasks');
}
