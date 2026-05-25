import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface CalendarIgnoredState {
  ignoredIds: string[];
  toggleIgnored: (id: string) => void;
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
    }),
    { name: 'jean-claude-calendar-ignored' },
  ),
);
