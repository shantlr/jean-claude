import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useCallback } from 'react';


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

/** Imperative cleanup — call outside React to clear a task's prompt draft */
export function clearTaskPromptDraft(taskId: string) {
  useStore.getState().clearDraft(taskId);
}

/** Remove persisted prompt drafts for tasks that no longer exist or are completed. */
export function pruneOrphanedTaskPrompts(activeTaskIds: Set<string>) {
  const state = useStore.getState();
  for (const taskId of Object.keys(state.drafts)) {
    if (!activeTaskIds.has(taskId)) {
      state.clearDraft(taskId);
    }
  }
}

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
