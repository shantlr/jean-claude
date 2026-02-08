// Global overlay state - only one overlay can be open at a time
// Opening an overlay automatically closes any other open overlay

import { create } from 'zustand';

export type OverlayType =
  | 'new-task'
  | 'command-palette'
  | 'project-switcher'
  | 'keyboard-help'
  | 'background-jobs';

interface OverlaysState {
  // Current active overlay (null = none open)
  activeOverlay: OverlayType | null;

  // Actions
  open: (overlay: OverlayType) => void;
  close: (overlay: OverlayType) => void;
  toggle: (overlay: OverlayType) => void;
  closeAll: () => void;
}

export const useOverlaysStore = create<OverlaysState>((set) => ({
  activeOverlay: null,

  open: (overlay) => set({ activeOverlay: overlay }),
  close: (overlay) =>
    set((s) => (s.activeOverlay === overlay ? { activeOverlay: null } : s)),
  toggle: (overlay) =>
    set((s) => ({
      activeOverlay: s.activeOverlay === overlay ? null : overlay,
    })),
  closeAll: () => set({ activeOverlay: null }),
}));
