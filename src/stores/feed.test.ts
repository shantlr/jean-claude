import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function createLocalStorage(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

describe('feed store', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('localStorage', createLocalStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('marks low priority idempotently', async () => {
    const { useFeedStore } = await import('./feed');

    useFeedStore.getState().markLowPriority('pr:project-1:1');
    useFeedStore.getState().markLowPriority('pr:project-1:1');

    expect(useFeedStore.getState().lowPriority).toEqual(['pr:project-1:1']);
  });
});
