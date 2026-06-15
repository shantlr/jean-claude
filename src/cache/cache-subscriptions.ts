import { api } from '@/lib/api';
import {
  getCacheEventResourceKeys,
  matchesCacheSubscription,
  type CacheEvent,
  type CacheSubscription,
} from '@shared/cache-events';

import { cache$ } from './cache-store';

const subscriptionCounts = new Map<
  string,
  { subscription: CacheSubscription; count: number }
>();
let subscriptionRevision = 0;

function subscriptionId(subscription: CacheSubscription) {
  return `${subscription.resourceKey}:${subscription.includeChildren === true ? 'children' : 'exact'}`;
}

function flushSubscriptions() {
  subscriptionRevision += 1;
  void api.cache.setSubscriptions({
    revision: subscriptionRevision,
    subscriptions: Array.from(subscriptionCounts.values()).map(
      ({ subscription }) => subscription,
    ),
  });
}

export function subscribeCacheResources(subscriptions: CacheSubscription[]) {
  for (const subscription of subscriptions) {
    const id = subscriptionId(subscription);
    const current = subscriptionCounts.get(id);

    if (current) {
      current.count += 1;
    } else {
      subscriptionCounts.set(id, { subscription, count: 1 });
    }
  }

  flushSubscriptions();

  return () => {
    for (const subscription of subscriptions) {
      const id = subscriptionId(subscription);
      const current = subscriptionCounts.get(id);

      if (!current) {
        continue;
      }

      if (current.count <= 1) {
        subscriptionCounts.delete(id);
      } else {
        current.count -= 1;
      }
    }

    flushSubscriptions();
  };
}

export function shouldApplyCacheEvent(event: CacheEvent) {
  const resourceKeys = getCacheEventResourceKeys(event);
  const subscriptions = Array.from(subscriptionCounts.values()).map(
    ({ subscription }) => subscription,
  );

  return resourceKeys.some((resourceKey) => {
    const retainedResource = cache$.resources[resourceKey].get();

    return (
      (retainedResource?.observerCount ?? 0) > 0 ||
      subscriptions.some((subscription) =>
        matchesCacheSubscription(subscription, resourceKey),
      )
    );
  });
}

export function resetCacheResourceSubscriptionsForTests() {
  subscriptionCounts.clear();
  subscriptionRevision = 0;
  flushSubscriptions();
}
