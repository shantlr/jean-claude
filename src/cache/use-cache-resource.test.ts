import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  isResourceFresh,
  markResourceChanged,
  markResourceStale,
} from './cache-actions';
import { cache$, resetCache } from './cache-store';
import {
  clearPendingResources,
  ensureResource,
  getCacheSubscriptionKey,
  isResourceInitialLoading,
  shouldLoadChangedResource,
} from './use-cache-resource';

describe('ensureResource', () => {
  beforeEach(() => {
    resetCache();
    clearPendingResources();
  });

  it('dedupes concurrent loads for the same key', async () => {
    const load = vi.fn(async () => 'result');

    const first = ensureResource({ key: 'resource:1', load });
    const second = ensureResource({ key: 'resource:1', load });

    await expect(first).resolves.toBe('result');
    await expect(second).resolves.toBe('result');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not reload fresh resources', async () => {
    const load = vi.fn(async () => 'result');

    await ensureResource({ key: 'resource:1', load, staleTime: 60_000 });
    const secondResult = await ensureResource({
      key: 'resource:1',
      load,
      staleTime: 60_000,
    });

    expect(secondResult).toBeUndefined();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('reloads stale resources', async () => {
    const load = vi.fn(async () => 'result');

    await ensureResource({ key: 'resource:1', load, staleTime: 60_000 });
    markResourceStale('resource:1');
    await ensureResource({ key: 'resource:1', load, staleTime: 60_000 });

    expect(load).toHaveBeenCalledTimes(2);
  });

  it('keeps resources stale when invalidated during load', async () => {
    let resolveLoad: (value: string) => void = () => {};
    const load = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveLoad = resolve;
        }),
    );

    const promise = ensureResource({ key: 'resource:1', load });
    await Promise.resolve();

    markResourceStale('resource:1');
    resolveLoad('result');
    await expect(promise).resolves.toBe('result');

    expect(cache$.resources['resource:1'].get()).toMatchObject({
      status: 'success',
      stale: true,
    });
  });

  it('keeps resources stale when externally changed during load', async () => {
    let resolveLoad: (value: string) => void = () => {};
    const load = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveLoad = resolve;
        }),
    );

    const promise = ensureResource({ key: 'resource:1', load });
    await Promise.resolve();

    markResourceChanged('resource:1');
    resolveLoad('older-result');
    await expect(promise).resolves.toBe('older-result');

    expect(cache$.resources['resource:1'].get()).toMatchObject({
      status: 'success',
      stale: true,
    });
  });

  it('skips ingesting stale in-flight loads when resource changed during load', async () => {
    let resolveLoad: (value: string) => void = () => {};
    const load = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveLoad = resolve;
        }),
    );
    const ingest = vi.fn();

    const promise = ensureResource({ key: 'resource:1', load, ingest });
    await Promise.resolve();

    markResourceChanged('resource:1');
    resolveLoad('older-result');
    await expect(promise).resolves.toBe('older-result');

    expect(ingest).not.toHaveBeenCalled();
    expect(cache$.resources['resource:1'].get()).toMatchObject({
      status: 'success',
      stale: true,
    });
  });

  it('stores error metadata when loader throws', async () => {
    const load = vi.fn(async () => {
      throw new Error('load failed');
    });

    await expect(ensureResource({ key: 'resource:1', load })).rejects.toThrow(
      'load failed',
    );

    expect(cache$.resources['resource:1'].get()).toMatchObject({
      status: 'error',
      error: 'load failed',
      stale: false,
    });
  });

  it('keeps resources stale when invalidated during failed load', async () => {
    let rejectLoad: (error: Error) => void = () => {};
    const load = vi.fn(
      () =>
        new Promise<string>((_resolve, reject) => {
          rejectLoad = reject;
        }),
    );

    const promise = ensureResource({ key: 'resource:1', load });
    await Promise.resolve();

    markResourceStale('resource:1');
    rejectLoad(new Error('older load failed'));
    await expect(promise).rejects.toThrow('older load failed');

    expect(cache$.resources['resource:1'].get()).toMatchObject({
      status: 'error',
      error: 'older load failed',
      stale: true,
    });
  });

  it('stores error metadata when loader throws synchronously', async () => {
    const load = vi.fn(() => {
      throw new Error('sync load failed');
    });

    await expect(ensureResource({ key: 'resource:1', load })).rejects.toThrow(
      'sync load failed',
    );

    expect(cache$.resources['resource:1'].get()).toMatchObject({
      status: 'error',
      error: 'sync load failed',
      stale: false,
    });
  });
});

describe('shouldLoadChangedResource', () => {
  it('loads success resources marked stale by cache events', () => {
    expect(
      shouldLoadChangedResource({
        status: 'success',
        error: null,
        lastFetchedAt: 100,
        stale: true,
        observerCount: 1,
        lastUnusedAt: null,
      }),
    ).toBe(true);
  });

  it('loads error resources only after a later stale mark', () => {
    expect(
      shouldLoadChangedResource({
        status: 'error',
        error: 'load failed',
        lastFetchedAt: null,
        stale: false,
        observerCount: 1,
        lastUnusedAt: null,
      }),
    ).toBe(false);

    expect(
      shouldLoadChangedResource({
        status: 'error',
        error: 'load failed',
        lastFetchedAt: null,
        stale: true,
        observerCount: 1,
        lastUnusedAt: null,
      }),
    ).toBe(true);
  });

  it('does not react to loading resources that are stale mid-request', () => {
    expect(
      shouldLoadChangedResource({
        status: 'loading',
        error: null,
        lastFetchedAt: null,
        stale: true,
        observerCount: 1,
        lastUnusedAt: null,
      }),
    ).toBe(false);
  });
});

describe('isResourceInitialLoading', () => {
  it('treats a missing resource as initial loading when enabled', () => {
    expect(isResourceInitialLoading(true, undefined)).toBe(true);
  });

  it('keeps stale refetches out of initial loading after first fetch', () => {
    expect(
      isResourceInitialLoading(true, {
        status: 'loading',
        error: null,
        lastFetchedAt: 100,
        stale: true,
        observerCount: 1,
        lastUnusedAt: null,
      }),
    ).toBe(false);
  });

  it('does not show initial loading for failed first loads until retry starts', () => {
    expect(
      isResourceInitialLoading(true, {
        status: 'error',
        error: 'load failed',
        lastFetchedAt: null,
        stale: false,
        observerCount: 1,
        lastUnusedAt: null,
      }),
    ).toBe(false);
  });

  it('does not show initial loading when disabled', () => {
    expect(isResourceInitialLoading(false, undefined)).toBe(false);
  });
});

describe('isResourceFresh', () => {
  it('respects stale time and stale marker', () => {
    expect(
      isResourceFresh(
        {
          status: 'success',
          error: null,
          lastFetchedAt: 100,
          stale: false,
          observerCount: 0,
          lastUnusedAt: null,
        },
        50,
        120,
      ),
    ).toBe(true);

    expect(
      isResourceFresh(
        {
          status: 'success',
          error: null,
          lastFetchedAt: 100,
          stale: true,
          observerCount: 0,
          lastUnusedAt: null,
        },
        50,
        120,
      ),
    ).toBe(false);
  });
});

describe('getCacheSubscriptionKey', () => {
  it('is stable when subscription object fields or array order change', () => {
    const first = getCacheSubscriptionKey('projects', [
      { resourceKey: 'project:1', includeChildren: true },
      { resourceKey: 'projects' },
    ]);
    const second = getCacheSubscriptionKey('projects', [
      { resourceKey: 'projects' },
      { includeChildren: true, resourceKey: 'project:1' },
    ]);

    expect(second).toBe(first);
  });
});
