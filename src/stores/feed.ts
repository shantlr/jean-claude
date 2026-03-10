import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { FeedItemAttention } from '@shared/feed-types';

interface PinnedItem {
  id: string;
  order: number;
}

interface FeedOverridesState {
  pinned: PinnedItem[];
  dismissed: string[];
  lowPriority: string[];
  lastAttention: Record<string, FeedItemAttention>;

  pin: (id: string) => void;
  unpin: (id: string) => void;
  reorderPinned: (orderedIds: string[]) => void;
  dismiss: (id: string) => void;
  undismiss: (id: string) => void;
  toggleLowPriority: (id: string) => void;
  reconcile: (items: { id: string; attention: FeedItemAttention }[]) => void;
}

export const useFeedStore = create<FeedOverridesState>()(
  persist(
    (set) => ({
      pinned: [],
      dismissed: [],
      lowPriority: [],
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

      toggleLowPriority: (id) =>
        set((state) => {
          const isLow = state.lowPriority.includes(id);
          return {
            lowPriority: isLow
              ? state.lowPriority.filter((l) => l !== id)
              : [...state.lowPriority, id],
          };
        }),

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
        lastAttention: state.lastAttention,
      }),
    },
  ),
);
