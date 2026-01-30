import { useCallback } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { InteractionMode } from '../../shared/types';

interface NewTaskFormDraft {
  name: string;
  prompt: string;
  useWorktree: boolean;
  sourceBranch: string | null; // null means use project's default branch
  interactionMode: InteractionMode;
  workItemId: string | null;
  workItemUrl: string | null;
}

const defaultDraft: NewTaskFormDraft = {
  name: '',
  prompt: '',
  useWorktree: false,
  sourceBranch: null,
  interactionMode: 'ask',
  workItemId: null,
  workItemUrl: null,
};

interface NewTaskFormState {
  drafts: Record<string, NewTaskFormDraft>;
  setDraft: (projectId: string, draft: Partial<NewTaskFormDraft>) => void;
  clearDraft: (projectId: string) => void;
}

const useStore = create<NewTaskFormState>()(
  persist(
    (set) => ({
      drafts: {},

      setDraft: (projectId, draft) => {
        set((state) => ({
          drafts: {
            ...state.drafts,
            [projectId]: {
              ...defaultDraft,
              ...state.drafts[projectId],
              ...draft,
            },
          },
        }));
      },

      clearDraft: (projectId) => {
        set((state) => {
          const { [projectId]: _, ...rest } = state.drafts;
          return { drafts: rest };
        });
      },
    }),
    { name: 'new-task-form' },
  ),
);

export function useNewTaskFormStore(projectId: string) {
  const draft = useStore((state) => state.drafts[projectId] ?? defaultDraft);
  const setDraftAction = useStore((state) => state.setDraft);
  const clearDraftAction = useStore((state) => state.clearDraft);

  const setDraft = useCallback(
    (update: Partial<NewTaskFormDraft>) => setDraftAction(projectId, update),
    [projectId, setDraftAction],
  );

  const clearDraft = useCallback(
    () => clearDraftAction(projectId),
    [projectId, clearDraftAction],
  );

  return { draft, setDraft, clearDraft };
}
