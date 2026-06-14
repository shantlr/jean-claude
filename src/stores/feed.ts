import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { FeedItemAttention } from '@shared/feed-types';

interface PinnedItem {
  id: string;
  order: number;
}

interface FeedFilterPreset {
  id: string;
  name: string;
  hiddenProjectIds: string[];
}

interface FeedOverridesState {
  pinned: PinnedItem[];
  dismissed: string[];
  lowPriority: string[];
  hiddenProjectIds: string[];
  filterPresets: FeedFilterPreset[];
  lastAttention: Record<string, FeedItemAttention>;

  pin: (id: string) => void;
  unpin: (id: string) => void;
  reorderPinned: (orderedIds: string[]) => void;
  dismiss: (id: string) => void;
  undismiss: (id: string) => void;
  markLowPriority: (id: string) => void;
  toggleLowPriority: (id: string) => void;
  toggleProjectHidden: (projectId: string) => void;
  clearHiddenProjects: () => void;
  saveFilterPreset: (name: string) => void;
  applyFilterPreset: (id: string) => void;
  deleteFilterPreset: (id: string) => void;
  reconcile: (items: { id: string; attention: FeedItemAttention }[]) => void;
}

export const useFeedStore = create<FeedOverridesState>()(
  persist(
    (set) => ({
      pinned: [],
      dismissed: [],
      lowPriority: [],
      hiddenProjectIds: [],
      filterPresets: [],
      lastAttention: {},

      pin: (id) =>
        set((state) => {
          if (state.pinned.some((p) => p.id === id)) return state;
          const maxOrder = state.pinned.reduce(
            (max, p) => Math.max(max, p.order),
            -1,
          );
          return {
            pinned: [...state.pinned, { id, order: maxOrder + 1 }],
          };
        }),

      unpin: (id) =>
        set((state) => ({
          pinned: state.pinned.filter((p) => p.id !== id),
        })),

      reorderPinned: (orderedIds) =>
        set(() => ({
          pinned: orderedIds.map((id, i) => ({ id, order: i })),
        })),

      dismiss: (id) =>
        set((state) => ({
          dismissed: state.dismissed.includes(id)
            ? state.dismissed
            : [...state.dismissed, id],
        })),

      undismiss: (id) =>
        set((state) => ({
          dismissed: state.dismissed.filter((d) => d !== id),
        })),

      markLowPriority: (id) =>
        set((state) => {
          if (state.lowPriority.includes(id)) return state;
          return { lowPriority: [...state.lowPriority, id] };
        }),

      toggleLowPriority: (id) =>
        set((state) => {
          const isLow = state.lowPriority.includes(id);
          return {
            lowPriority: isLow
              ? state.lowPriority.filter((l) => l !== id)
              : [...state.lowPriority, id],
          };
        }),

      toggleProjectHidden: (projectId) =>
        set((state) => {
          const isHidden = state.hiddenProjectIds.includes(projectId);
          return {
            hiddenProjectIds: isHidden
              ? state.hiddenProjectIds.filter((id) => id !== projectId)
              : [...state.hiddenProjectIds, projectId],
          };
        }),

      clearHiddenProjects: () => set({ hiddenProjectIds: [] }),

      saveFilterPreset: (name) =>
        set((state) => {
          const trimmed = name.trim();
          if (!trimmed) return state;

          const preset = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            name: trimmed,
            hiddenProjectIds: [...state.hiddenProjectIds],
          };

          return {
            filterPresets: [
              preset,
              ...state.filterPresets.filter((p) => p.name !== trimmed),
            ],
          };
        }),

      applyFilterPreset: (id) =>
        set((state) => {
          const preset = state.filterPresets.find((p) => p.id === id);
          if (!preset) return state;
          return { hiddenProjectIds: [...preset.hiddenProjectIds] };
        }),

      deleteFilterPreset: (id) =>
        set((state) => ({
          filterPresets: state.filterPresets.filter((p) => p.id !== id),
        })),

      reconcile: (items) =>
        set((state) => {
          const prev = state.lastAttention;
          const nextAttention: Record<string, FeedItemAttention> = {};
          let dismissedChanged = false;
          let lowPrioChanged = false;
          const newDismissed = [...state.dismissed];
          const newLowPriority = [...state.lowPriority];

          for (const item of items) {
            nextAttention[item.id] = item.attention;
            const prevAttention = prev[item.id];
            if (prevAttention && prevAttention !== item.attention) {
              const dIdx = newDismissed.indexOf(item.id);
              if (dIdx !== -1) {
                newDismissed.splice(dIdx, 1);
                dismissedChanged = true;
              }
              const lIdx = newLowPriority.indexOf(item.id);
              if (lIdx !== -1) {
                newLowPriority.splice(lIdx, 1);
                lowPrioChanged = true;
              }
            }
          }

          const prevKeys = Object.keys(prev);
          const nextKeys = Object.keys(nextAttention);
          const attentionChanged =
            prevKeys.length !== nextKeys.length ||
            nextKeys.some((key) => prev[key] !== nextAttention[key]);

          if (!attentionChanged && !dismissedChanged && !lowPrioChanged) {
            return state;
          }

          return {
            ...(attentionChanged ? { lastAttention: nextAttention } : {}),
            ...(dismissedChanged ? { dismissed: newDismissed } : {}),
            ...(lowPrioChanged ? { lowPriority: newLowPriority } : {}),
          };
        }),
    }),
    {
      name: 'jean-claude-feed-overrides',
      partialize: (state) => ({
        pinned: state.pinned,
        dismissed: state.dismissed,
        lowPriority: state.lowPriority,
        hiddenProjectIds: state.hiddenProjectIds,
        filterPresets: state.filterPresets,
        lastAttention: state.lastAttention,
      }),
    },
  ),
);
