import {
  getResourceChangeVersion,
  isResourceFresh,
  markResourceStale,
  releaseResource,
  retainResource,
  setResourceError,
  setResourceLoading,
  setResourceSuccess,
} from './cache-actions';
import type { ResourceMeta, ResourceResult } from './cache-types';
import { useCallback, useEffect } from 'react';
import { cache$ } from './cache-store';
import type { CacheSubscription } from '@shared/cache-events';
import { subscribeCacheResources } from './cache-subscriptions';
import { useLatestRef } from '@/hooks/use-latest-ref';
import { useValue } from '@legendapp/state/react';

// One pending promise per resource key prevents duplicate concurrent loads.
const pendingResources = new Map<string, Promise<unknown>>();

type SerializedCacheSubscription = [
  resourceKey: string,
  includeChildren: boolean,
];

export function getCacheSubscriptionKey(
  key: string,
  subscriptions?: CacheSubscription[],
) {
  const serializedSubscriptions: SerializedCacheSubscription[] = (
    subscriptions ?? [{ resourceKey: key }]
  )
    .map(
      (subscription): SerializedCacheSubscription => [
        subscription.resourceKey,
        subscription.includeChildren === true,
      ],
    )
    .sort(
      ([leftKey, leftIncludesChildren], [rightKey, rightIncludesChildren]) =>
        leftKey.localeCompare(rightKey) ||
        Number(leftIncludesChildren) - Number(rightIncludesChildren),
    );

  return JSON.stringify(serializedSubscriptions);
}

function getSubscriptionsFromKey(key: string): CacheSubscription[] {
  return (JSON.parse(key) as SerializedCacheSubscription[]).map(
    ([resourceKey, includeChildren]) => ({
      resourceKey,
      ...(includeChildren ? { includeChildren } : {}),
    }),
  );
}

function getRetainedResourceKeys(
  key: string,
  subscriptions?: CacheSubscription[],
) {
  return Array.from(
    new Set([
      key,
      ...(subscriptions ?? []).map((subscription) => subscription.resourceKey),
    ]),
  ).sort();
}

function getRetainedResourceKey(
  key: string,
  subscriptions?: CacheSubscription[],
) {
  return JSON.stringify(getRetainedResourceKeys(key, subscriptions));
}

export type EnsureResourceOptions<T> = {
  key: string;
  staleTime?: number;
  force?: boolean;
  load: () => Promise<T>;
  ingest?: (data: T) => void;
};

export function clearPendingResources() {
  pendingResources.clear();
}

export function shouldLoadChangedResource(meta: ResourceMeta | undefined) {
  return (
    meta?.stale === true &&
    (meta.status === 'success' || meta.status === 'error')
  );
}

export function isResourceInitialLoading(
  enabled: boolean,
  meta: ResourceMeta | undefined,
) {
  return (
    enabled &&
    meta?.lastFetchedAt == null &&
    (!meta || meta.status === 'idle' || meta.status === 'loading')
  );
}

export async function ensureResource<T>({
  key,
  staleTime = 0,
  force = false,
  load,
  ingest,
}: EnsureResourceOptions<T>): Promise<T | undefined> {
  const current = cache$.resources[key].get();
  if (!force && isResourceFresh(current, staleTime)) {
    return undefined;
  }

  const pending = pendingResources.get(key) as Promise<T> | undefined;
  if (pending) {
    return pending;
  }

  const changeVersionAtLoadStart = getResourceChangeVersion(key);

  const promise = Promise.resolve()
    .then(load)
    .then((data) => {
      setResourceSuccess(key);
      if (getResourceChangeVersion(key) !== changeVersionAtLoadStart) {
        markResourceStale(key);
      } else {
        ingest?.(data);
      }
      return data;
    })
    .catch((error: unknown) => {
      setResourceError(key, error);
      if (getResourceChangeVersion(key) !== changeVersionAtLoadStart) {
        markResourceStale(key);
      }
      throw error;
    })
    .finally(() => {
      pendingResources.delete(key);
    });

  pendingResources.set(key, promise);
  setResourceLoading(key);

  return promise;
}

export function useCacheResource<TData, TSelected = TData>({
  key,
  enabled = true,
  staleTime = 0,
  load,
  ingest,
  select,
  subscriptions,
}: {
  key: string;
  enabled?: boolean;
  staleTime?: number;
  load: () => Promise<TData>;
  ingest?: (data: TData) => void;
  select?: () => TSelected | undefined;
  subscriptions?: CacheSubscription[];
}): ResourceResult<TSelected> {
  const loadRef = useLatestRef(load);
  const ingestRef = useLatestRef(ingest);

  const subscriptionKey = getCacheSubscriptionKey(key, subscriptions);
  const retainedResourceKey = getRetainedResourceKey(key, subscriptions);

  const meta = useValue(() => cache$.resources[key].get());
  const metaStatus = meta?.status;
  const metaStale = meta?.stale;
  const data = useValue(() => {
    if (select) {
      return select();
    }

    return cache$.documents[key].data.get() as TSelected | undefined;
  });

  const loadResource = useCallback(() => {
    return ensureResource({
      key,
      staleTime,
      load: () => loadRef.current(),
      ingest: (loadedData) => ingestRef.current?.(loadedData),
    });
  }, [ingestRef, key, loadRef, staleTime]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const resourceKeys = JSON.parse(retainedResourceKey) as string[];
    for (const resourceKey of resourceKeys) {
      retainResource(resourceKey);
    }

    return () => {
      for (const resourceKey of resourceKeys) {
        releaseResource(resourceKey);
      }
    };
  }, [enabled, retainedResourceKey]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const unsubscribe = subscribeCacheResources(
      getSubscriptionsFromKey(subscriptionKey),
    );

    return unsubscribe;
  }, [enabled, subscriptionKey]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    void loadResource().catch(() => {});
  }, [enabled, loadResource]);

  useEffect(() => {
    if (!enabled || !shouldLoadChangedResource(meta)) {
      return;
    }

    void loadResource().catch(() => {});
  }, [enabled, loadResource, meta, metaStale, metaStatus]);

  const refetch = useCallback(async () => {
    await ensureResource({
      key,
      staleTime,
      force: true,
      load: () => loadRef.current(),
      ingest: (loadedData) => ingestRef.current?.(loadedData),
    });
  }, [ingestRef, key, loadRef, staleTime]);

  const error = meta?.error ? new Error(meta.error) : null;

  return {
    data,
    isLoading: isResourceInitialLoading(enabled, meta),
    isFetching: enabled && meta?.status === 'loading',
    isError: meta?.status === 'error',
    error,
    refetch,
  };
}
