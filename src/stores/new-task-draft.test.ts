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

describe('new task draft store', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('localStorage', createLocalStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('preserves the per-project iteration filter when clearing a draft', async () => {
    const { useNewTaskDraftStore } = await import('./new-task-draft');

    useNewTaskDraftStore.getState().setDraft('project-1', {
      prompt: 'draft prompt',
      workItemIds: ['123'],
      workItemsIterationFilter: 'Project\\Iteration 1',
    });

    useNewTaskDraftStore.getState().clearDraft('project-1');

    expect(useNewTaskDraftStore.getState().drafts['project-1']).toEqual({
      workItemsIterationFilter: 'Project\\Iteration 1',
    });
  });
});
