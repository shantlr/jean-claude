import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UIState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  workItemsPanelWidth: number;
  setWorkItemsPanelWidth: (width: number) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      workItemsPanelWidth: 50,
      setWorkItemsPanelWidth: (width: number) =>
        set({ workItemsPanelWidth: Math.min(80, Math.max(20, width)) }),
    }),
    { name: 'ui-store' },
  ),
);
