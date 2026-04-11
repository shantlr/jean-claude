import { useEffect } from 'react';
import { create } from 'zustand';

import { api } from '@/lib/api';
import type { DebugLogEntry } from '@shared/debug-log-types';

const MAX_LOGS = 500;

interface DebugLogsState {
  logs: DebugLogEntry[];
  addBatch: (entries: DebugLogEntry[]) => void;
  clear: () => void;
}

export const useDebugLogsStore = create<DebugLogsState>((set) => ({
  logs: [],
  addBatch: (entries) =>
    set((state) => {
      // entries are oldest-first from the main process; reverse to prepend newest-first
      const next = [...entries.reverse(), ...state.logs];
      if (next.length > MAX_LOGS) next.length = MAX_LOGS;
      return { logs: next };
    }),
  clear: () => set({ logs: [] }),
}));

export function useDebugLogsListener() {
  useEffect(() => {
    const unsubscribe = api.debugLogs.onBatch((entries) => {
      useDebugLogsStore.getState().addBatch(entries);
    });
    return unsubscribe;
  }, []);
}
