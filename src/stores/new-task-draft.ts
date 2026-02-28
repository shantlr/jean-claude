import { useCallback } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type {
  AgentBackendType,
  PromptImagePart,
} from '@shared/agent-backend-types';
import type { InteractionMode, ModelPreference } from '@shared/types';

export type InputMode = 'search' | 'prompt';
export type SearchStep = 'select' | 'compose';
export type WorkItemsViewMode = 'list' | 'board';

export interface NewTaskDraft {
  inputMode: InputMode;
  interactionMode: InteractionMode;
  modelPreference: ModelPreference;
  agentBackend: AgentBackendType;
  // Search mode state
  workItemIds: string[]; // Changed from workItemId: string | null
  workItemsFilter: string;
  searchStep: SearchStep; // NEW: which step in search mode
  workItemsViewMode: WorkItemsViewMode;
  // Prompt mode state
  prompt: string;
  /** Image attachments for the initial prompt (transient, not persisted) */
  images: PromptImagePart[];
  // Shared state
  createWorktree: boolean;
  sourceBranch: string | null;
  // Backlog conversion tracking
  backlogTodoId: string | null;
}

interface NewTaskDraftState {
  // Currently selected project tab (null = "all")
  selectedProjectId: string | null;
  // Per-project drafts keyed by projectId or 'all'
  drafts: Record<string, Partial<NewTaskDraft>>;

  // Actions
  setSelectedProjectId: (projectId: string | null) => void;
  setDraft: (key: string, update: Partial<NewTaskDraft>) => void;
  clearDraft: (key: string) => void;
  clearAllDrafts: () => void;
}

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
    {
      name: 'new-task-draft',
      partialize: (state) => ({
        ...state,
        // Strip images (large base64 blobs) from persisted drafts
        drafts: Object.fromEntries(
          Object.entries(state.drafts).map(([key, draft]) => [
            key,
            draft ? { ...draft, images: undefined } : draft,
          ]),
        ),
      }),
    },
  ),
);

// Direct store access for non-React contexts
export const useNewTaskDraftStore = useStore;

// Hook for managing the new task draft
export function useNewTaskDraft() {
  const selectedProjectId = useStore((state) => state.selectedProjectId);
  const key = selectedProjectId ?? 'all';
  const draft = useStore((state) => state.drafts[key]);
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
