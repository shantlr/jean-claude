import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { api } from '@/lib/api';

interface CalendarIgnoredState {
  ignoredIds: string[];
  toggleIgnored: (id: string) => void;
  addIgnored: (ids: string[]) => void;
  removeIgnored: (id: string) => void;
}

export const useCalendarIgnoredStore = create<CalendarIgnoredState>()(
  persist(
    (set) => ({
      ignoredIds: [],
      toggleIgnored: (id: string) =>
        set((state) => ({
          ignoredIds: state.ignoredIds.includes(id)
            ? state.ignoredIds.filter((x) => x !== id)
            : [...state.ignoredIds, id],
        })),
      addIgnored: (ids: string[]) =>
        set((state) => ({
          ignoredIds: Array.from(new Set([...state.ignoredIds, ...ids])),
        })),
      removeIgnored: (id: string) =>
        set((state) => ({
          ignoredIds: state.ignoredIds.filter((x) => x !== id),
        })),
    }),
    { name: 'jean-claude-calendar-ignored' },
  ),
);

function syncIgnoredIds(ids: string[]) {
  api.calendar.setIgnoredMeetingIds(ids).catch(() => {
    // Main process may be unavailable in renderer tests or web fallback.
  });
}

syncIgnoredIds(useCalendarIgnoredStore.getState().ignoredIds);
useCalendarIgnoredStore.subscribe((state) => syncIgnoredIds(state.ignoredIds));
