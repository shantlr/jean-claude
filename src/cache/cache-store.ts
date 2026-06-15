import { observable } from '@legendapp/state';

import type { CacheState, ResourceMeta } from './cache-types';

export function createEmptyResourceMeta(now = Date.now()): ResourceMeta {
  return {
    status: 'idle',
    error: null,
    lastFetchedAt: null,
    stale: true,
    observerCount: 0,
    lastUnusedAt: now,
  };
}

export function createInitialCacheState(): CacheState {
  return {
    projects: {},
    tasks: {},
    steps: {},
    providers: {},
    tokens: {},
    pullRequests: {},
    workItems: {},
    feedNotes: {},
    indexes: {},
    documents: {},
    resources: {},
  };
}

export const cache$ = observable<CacheState>(createInitialCacheState());

export function resetCache() {
  cache$.set(createInitialCacheState());
}
