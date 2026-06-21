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

describe('navigation store', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('localStorage', createLocalStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps add-step draft updates out of task state', async () => {
    const { useNavigationStore } = await import('./navigation');

    useNavigationStore.getState().setActiveStepId('task-1', 'step-1');
    const taskState = useNavigationStore.getState().taskState['task-1'];

    useNavigationStore.getState().setAddStepDraft('task-1', {
      promptTemplate: 'next step',
    });

    expect(useNavigationStore.getState().taskState['task-1']).toBe(taskState);
    expect(useNavigationStore.getState().addStepDrafts['task-1']).toEqual({
      promptTemplate: 'next step',
      presetType: 'new-session',
    });
  });
});
