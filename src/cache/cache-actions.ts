import { cache$, createEmptyResourceMeta } from './cache-store';
import type {
  DocumentResource,
  IndexResource,
  ResourceMeta,
} from './cache-types';

const resourceChangeVersions = new Map<string, number>();

function getResourceMeta(key: string): ResourceMeta {
  return cache$.resources[key].get() ?? createEmptyResourceMeta();
}

export function setResourceLoading(key: string) {
  const current = getResourceMeta(key);
  cache$.resources[key].set({
    ...current,
    status: 'loading',
    error: null,
  });
}

export function setResourceSuccess(key: string, fetchedAt = Date.now()) {
  const current = getResourceMeta(key);
  cache$.resources[key].set({
    ...current,
    status: 'success',
    error: null,
    lastFetchedAt: fetchedAt,
    stale: false,
  });
}

export function setResourceError(key: string, error: unknown) {
  const current = getResourceMeta(key);
  cache$.resources[key].set({
    ...current,
    status: 'error',
    error: error instanceof Error ? error.message : String(error),
    stale: false,
  });
}

export function markResourceStale(key: string) {
  markResourceChanged(key);
  const current = getResourceMeta(key);
  cache$.resources[key].set({
    ...current,
    stale: true,
  });
}

export function markResourceChanged(key: string) {
  resourceChangeVersions.set(key, getResourceChangeVersion(key) + 1);
}

export function getResourceChangeVersion(key: string) {
  return resourceChangeVersions.get(key) ?? 0;
}

export function retainResource(key: string) {
  const current = getResourceMeta(key);
  cache$.resources[key].set({
    ...current,
    observerCount: current.observerCount + 1,
    lastUnusedAt: null,
  });
}

export function releaseResource(key: string, now = Date.now()) {
  const current = getResourceMeta(key);
  const observerCount = Math.max(0, current.observerCount - 1);
  cache$.resources[key].set({
    ...current,
    observerCount,
    lastUnusedAt: observerCount === 0 ? now : null,
  });
}

export function isResourceFresh(
  meta: ResourceMeta | undefined,
  staleTime: number,
  now = Date.now(),
) {
  if (!meta || meta.status !== 'success' || meta.stale) {
    return false;
  }

  if (meta.lastFetchedAt === null) {
    return false;
  }

  return staleTime === Infinity || now - meta.lastFetchedAt < staleTime;
}

export function setIndexResource(
  key: string,
  ids: string[],
  fetchedAt = Date.now(),
) {
  const current = {
    ...getResourceMeta(key),
    ids: cache$.indexes[key].ids.get() ?? [],
  };
  const next: IndexResource = {
    ...current,
    status: 'success',
    error: null,
    lastFetchedAt: fetchedAt,
    stale: false,
    ids,
  };
  cache$.indexes[key].set(next);
  setResourceSuccess(key, fetchedAt);
}

export function setDocumentResource<T>(
  key: string,
  data: T,
  fetchedAt = Date.now(),
) {
  const current = {
    ...getResourceMeta(key),
    data: cache$.documents[key].data.get() as T | undefined,
  };
  const next: DocumentResource<T> = {
    ...current,
    status: 'success',
    error: null,
    lastFetchedAt: fetchedAt,
    stale: false,
    data,
  };
  cache$.documents[key].set(next);
  setResourceSuccess(key, fetchedAt);
}

export function markDocumentStale(key: string) {
  const current = cache$.documents[key].get();
  if (current) {
    cache$.documents[key].assign({ stale: true });
  }
  markResourceStale(key);
}
