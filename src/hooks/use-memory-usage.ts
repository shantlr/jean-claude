import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';


import { api } from '@/lib/api';

const RAM_POLL_INTERVAL_MS = 10_000;
const MEMORY_USAGE_HISTORY_WINDOW_MS = 20 * 60 * 1000;
const MAX_MEMORY_USAGE_SAMPLE_GAP_MS = RAM_POLL_INTERVAL_MS * 2;
export const MAX_MEMORY_USAGE_SAMPLES = Math.ceil(
  MEMORY_USAGE_HISTORY_WINDOW_MS / RAM_POLL_INTERVAL_MS,
);

type MemoryUsageSnapshot = Awaited<
  ReturnType<typeof api.system.getMemoryUsage>
>;

export type MemoryUsageSample = MemoryUsageSnapshot & {
  sampledAt: number;
};

let memoryUsageHistory: MemoryUsageSample[] = [];

export function useMemoryUsage() {
  const [history, setHistory] = useState(memoryUsageHistory);
  const mutation = useMutation({
    mutationFn: () => api.system.getMemoryUsage(),
    onSuccess: (data) => {
      const sampledAt = Date.now();
      const lastSample = memoryUsageHistory[memoryUsageHistory.length - 1];

      if (
        lastSample &&
        sampledAt - lastSample.sampledAt > MAX_MEMORY_USAGE_SAMPLE_GAP_MS
      ) {
        memoryUsageHistory.splice(0);
      }

      memoryUsageHistory.push({ ...data, sampledAt });

      if (memoryUsageHistory.length > MAX_MEMORY_USAGE_SAMPLES) {
        memoryUsageHistory.splice(
          0,
          memoryUsageHistory.length - MAX_MEMORY_USAGE_SAMPLES,
        );
      }

      setHistory([...memoryUsageHistory]);
    },
  });
  const { mutate } = mutation;

  useEffect(() => {
    mutate();

    const interval = window.setInterval(() => {
      mutate();
    }, RAM_POLL_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [mutate]);

  return {
    ...mutation,
    data: history[history.length - 1] ?? mutation.data,
    history,
  };
}
