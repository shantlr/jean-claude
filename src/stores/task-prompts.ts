import { useCallback } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const MAX_TASKS = 100;

interface TaskPromptEntry {
  text: string;
  updatedAt: number;
}

interface TaskPromptsState {
  drafts: Record<string, TaskPromptEntry>;
  setDraft: (taskId: string, text: string) => void;
  clearDraft: (taskId: string) => void;
}

function evictOldest(
  drafts: Record<string, TaskPromptEntry>,
  limit: number,
): Record<string, TaskPromptEntry> {
  const entries = Object.entries(drafts);
  if (entries.length <= limit) return drafts;

  const sorted = entries.sort(([, a], [, b]) => b.updatedAt - a.updatedAt);
  return Object.fromEntries(sorted.slice(0, limit));
}

const useStore = create<TaskPromptsState>()(
  persist(
    (set) => ({
      drafts: {},

      setDraft: (taskId, text) =>
        set((state) => {
          const updated = {
            ...state.drafts,
            [taskId]: { text, updatedAt: Date.now() },
          };
          return { drafts: evictOldest(updated, MAX_TASKS) };
        }),

      clearDraft: (taskId) =>
        set((state) => {
          const { [taskId]: _, ...rest } = state.drafts;
          return { drafts: rest };
        }),
    }),
    { name: 'task-prompts' },
  ),
);

export function useTaskPrompt(taskId: string) {
  const text = useStore((state) => state.drafts[taskId]?.text ?? '');
  const setDraftAction = useStore((state) => state.setDraft);
  const clearDraftAction = useStore((state) => state.clearDraft);

  const setDraft = useCallback(
    (newText: string) => setDraftAction(taskId, newText),
    [taskId, setDraftAction],
  );

  const clearDraft = useCallback(
    () => clearDraftAction(taskId),
    [taskId, clearDraftAction],
  );

  return { text, setDraft, clearDraft };
}
