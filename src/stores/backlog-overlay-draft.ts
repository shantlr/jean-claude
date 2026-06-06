import { useCallback } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface BacklogOverlayDraftState {
  selectedProjectId?: string;
  drafts: Record<string, string>;
  setSelectedProjectId: (projectId: string) => void;
  setDraft: (projectId: string, value: string) => void;
  clearDraft: (projectId: string) => void;
}

const useStore = create<BacklogOverlayDraftState>()(
  persist(
    (set) => ({
      selectedProjectId: undefined,
      drafts: {},

      setSelectedProjectId: (projectId) => {
        set({ selectedProjectId: projectId });
      },

      setDraft: (projectId, value) => {
        set((state) => ({
          drafts: {
            ...state.drafts,
            [projectId]: value,
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
    { name: 'backlog-overlay-draft' },
  ),
);

export const useBacklogSelectedProjectId = () =>
  useStore((state) => state.selectedProjectId);

export const useSetBacklogSelectedProjectId = () =>
  useStore((state) => state.setSelectedProjectId);

export function useBacklogOverlayDraftStore(projectId: string) {
  const draft = useStore((state) => state.drafts[projectId] ?? '');
  const setDraftAction = useStore((state) => state.setDraft);
  const clearDraftAction = useStore((state) => state.clearDraft);

  const setDraft = useCallback(
    (value: string) => setDraftAction(projectId, value),
    [projectId, setDraftAction],
  );

  const clearDraft = useCallback(
    () => clearDraftAction(projectId),
    [projectId, clearDraftAction],
  );

  return { draft, setDraft, clearDraft };
}
