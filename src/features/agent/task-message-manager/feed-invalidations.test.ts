import { beforeEach, describe, expect, it, vi } from 'vitest';

import { cache$, resetCache } from '@/cache/cache-store';
import { feedQueryKeys } from '@/lib/feed-query-keys';
import { setResourceSuccess } from '@/cache/cache-actions';

import { invalidateTaskFeed } from './feed-invalidations';

describe('invalidateTaskFeed', () => {
  beforeEach(() => {
    resetCache();
  });

  it('marks the Legend task feed resource stale and invalidates React Query', () => {
    const queryClient = { invalidateQueries: vi.fn() };
    setResourceSuccess('feed:tasks');

    invalidateTaskFeed(queryClient);

    expect(cache$.resources['feed:tasks'].get()?.stale).toBe(true);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: feedQueryKeys.tasks,
    });
  });
});
