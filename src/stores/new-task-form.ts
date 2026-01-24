import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { InteractionMode } from '../../shared/types';

interface NewTaskFormDraft {
  name: string;
  prompt: string;
  useWorktree: boolean;
  interactionMode: InteractionMode;
}

const defaultDraft: NewTaskFormDraft = {
  name: '',
  prompt: '',
  useWorktree: true,
  interactionMode: 'plan',
};

interface NewTaskFormState {
  drafts: Record<string, NewTaskFormDraft>;
  getDraft: (projectId: string) => NewTaskFormDraft;
  setDraft: (projectId: string, draft: Partial<NewTaskFormDraft>) => void;
  clearDraft: (projectId: string) => void;
}

export const useNewTaskFormStore = create<NewTaskFormState>()(
  persist(
    (set, get) => ({
      drafts: {},

      getDraft: (projectId) => {
        return get().drafts[projectId] ?? defaultDraft;
      },

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
