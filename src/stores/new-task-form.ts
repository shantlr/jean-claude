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
  workItemIds: string[] | null;
  workItemUrls: string[] | null;
}

interface WorkItemsFilters {
  states: string[];
  types: string[];
  searchText: string;
}

const defaultDraft: NewTaskFormDraft = {
  name: '',
  prompt: '',
  useWorktree: false,
  sourceBranch: null,
  interactionMode: 'ask',
  workItemIds: null,
  workItemUrls: null,
};

const defaultWorkItemsFilters: WorkItemsFilters = {
  states: ['Active'],
  types: [],
  searchText: '',
};

interface NewTaskFormState {
  drafts: Record<string, NewTaskFormDraft>;
  workItemsFilters: Record<string, WorkItemsFilters>;
  setDraft: (projectId: string, draft: Partial<NewTaskFormDraft>) => void;
  clearDraft: (projectId: string) => void;
  setWorkItemsFilters: (
    projectId: string,
    filters: Partial<WorkItemsFilters>,
  ) => void;
}

const useStore = create<NewTaskFormState>()(
  persist(
    (set) => ({
      drafts: {},
      workItemsFilters: {},

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

      setWorkItemsFilters: (projectId, filters) => {
        set((state) => ({
          workItemsFilters: {
            ...state.workItemsFilters,
            [projectId]: {
              ...defaultWorkItemsFilters,
              ...state.workItemsFilters[projectId],
              ...filters,
            },
          },
        }));
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

export function useWorkItemsFiltersStore(projectId: string) {
  const filters = useStore(
    (state) => state.workItemsFilters[projectId] ?? defaultWorkItemsFilters,
  );
  const setFiltersAction = useStore((state) => state.setWorkItemsFilters);

  const setFilters = useCallback(
    (update: Partial<WorkItemsFilters>) => setFiltersAction(projectId, update),
    [projectId, setFiltersAction],
  );

  return { filters, setFilters };
}
