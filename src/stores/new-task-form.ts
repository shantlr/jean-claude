import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useCallback } from 'react';


import type {
  InteractionMode,
  ModelPreference,
  ThinkingEffort,
} from '@shared/types';
import type { AgentBackendType } from '@shared/agent-backend-types';


interface NewTaskFormDraft {
  name: string;
  prompt: string;
  useWorktree: boolean;
  sourceBranch: string | null; // null means use project's default branch
  interactionMode: InteractionMode;
  modelPreference: ModelPreference;
  thinkingEffort: ThinkingEffort;
  backendModelPresetId: string | null;
  shouldAutoSelectBackendModelPreset: boolean;
  agentBackend?: AgentBackendType;
  workItemIds: string[] | null;
  workItemUrls: string[] | null;
  updateWorkItemStatus: boolean;
  parentTaskId: string | null;
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
  modelPreference: 'default',
  thinkingEffort: 'default',
  backendModelPresetId: null,
  shouldAutoSelectBackendModelPreset: true,
  workItemIds: null,
  workItemUrls: null,
  updateWorkItemStatus: true,
  parentTaskId: null,
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
  const hasDraft = useStore((state) => !!state.drafts[projectId]);
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

  return { draft, hasDraft, setDraft, clearDraft };
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
