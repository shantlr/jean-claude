import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface LastVisitedState {
  projectId: string | null;
  setProjectId: (id: string) => void;
}

export const useLastVisitedStore = create<LastVisitedState>()(
  persist(
    (set) => ({
      projectId: null,
      setProjectId: (id) => set({ projectId: id }),
    }),
    { name: 'last-visited' },
  ),
);
