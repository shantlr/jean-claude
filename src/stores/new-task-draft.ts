import { useCallback } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { InteractionMode, ModelPreference } from '../../shared/types';

export type InputMode = 'search' | 'prompt';
export type SearchStep = 'select' | 'compose';

export interface NewTaskDraft {
  inputMode: InputMode;
  interactionMode: InteractionMode;
  modelPreference: ModelPreference;
  // Search mode state
  workItemIds: string[]; // Changed from workItemId: string | null
  workItemsFilter: string;
  searchStep: SearchStep; // NEW: which step in search mode
  // Prompt mode state
  prompt: string;
  // Shared state
  createWorktree: boolean;
  sourceBranch: string | null;
}

interface NewTaskDraftState {
  // Currently selected project tab (null = "all")
  selectedProjectId: string | null;
  // Per-project drafts keyed by projectId or 'all'
  drafts: Record<string, NewTaskDraft>;

  // Actions
  setSelectedProjectId: (projectId: string | null) => void;
  setDraft: (key: string, update: Partial<NewTaskDraft>) => void;
  clearDraft: (key: string) => void;
  clearAllDrafts: () => void;
}

const defaultDraft: NewTaskDraft = {
  inputMode: 'search',
  interactionMode: 'ask',
  modelPreference: 'default',
  workItemIds: [],
  workItemsFilter: '',
  searchStep: 'select',
  prompt: '',
  createWorktree: true,
  sourceBranch: null,
};

const useStore = create<NewTaskDraftState>()(
  persist(
    (set) => ({
      selectedProjectId: null,
      drafts: {},

      setSelectedProjectId: (projectId) =>
        set({ selectedProjectId: projectId }),

      setDraft: (key, update) =>
        set((state) => ({
          drafts: {
            ...state.drafts,
            [key]: {
              ...defaultDraft,
              ...state.drafts[key],
              ...update,
            },
          },
        })),

      clearDraft: (key) =>
        set((state) => {
          const { [key]: _, ...rest } = state.drafts;
          return { drafts: rest };
        }),

      clearAllDrafts: () => set({ drafts: {}, selectedProjectId: null }),
    }),
    { name: 'new-task-draft' },
  ),
);

// Direct store access for non-React contexts
export const useNewTaskDraftStore = useStore;

// Hook for managing the new task draft
export function useNewTaskDraft() {
  const selectedProjectId = useStore((state) => state.selectedProjectId);
  const key = selectedProjectId ?? 'all';
  const draft = useStore((state) => state.drafts[key] ?? defaultDraft);
  const setSelectedProjectIdAction = useStore(
    (state) => state.setSelectedProjectId,
  );
  const setDraftAction = useStore((state) => state.setDraft);
  const clearDraftAction = useStore((state) => state.clearDraft);
  const clearAllDraftsAction = useStore((state) => state.clearAllDrafts);

  const setSelectedProjectId = useCallback(
    (projectId: string | null) => setSelectedProjectIdAction(projectId),
    [setSelectedProjectIdAction],
  );

  const updateDraft = useCallback(
    (update: Partial<NewTaskDraft>) => setDraftAction(key, update),
    [key, setDraftAction],
  );

  const clearDraft = useCallback(
    () => clearDraftAction(key),
    [key, clearDraftAction],
  );

  const discardDraft = useCallback(
    () => clearAllDraftsAction(),
    [clearAllDraftsAction],
  );

  return {
    selectedProjectId,
    draft,
    setSelectedProjectId,
    updateDraft,
    clearDraft,
    discardDraft,
  };
}
