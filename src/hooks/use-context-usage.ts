import { useMemo } from 'react';

import type { NormalizedEntry } from '@shared/normalized-message-v2';

const DEFAULT_CONTEXT_WINDOW = 200_000;

export interface ContextUsage {
  /** Current estimated context tokens */
  contextTokens: number;
  /** Model's context window size */
  contextWindow: number;
  /** Percentage of context used (0-100) */
  percentage: number;
  /** Whether we have valid context data */
  hasData: boolean;
}

/**
 * Calculate context usage from flat normalized entries.
 *
 * Strategy:
 * - Track cumulative input/output tokens from result entries
 * - Reset token count after the last compact boundary (system-status with status === null)
 * - Use DEFAULT_CONTEXT_WINDOW since V2 doesn't carry contextWindow
 */
export function useContextUsage(entries: NormalizedEntry[]): ContextUsage {
  return useMemo(() => {
    let contextTokens = 0;
    let lastCompactIndex = -1;

    // Find the last compact entry (system-status with status === null)
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (entry.type === 'system-status' && entry.status === null) {
        lastCompactIndex = i;
        break;
      }
    }

    // Sum tokens from result entries after the last compaction
    for (let i = lastCompactIndex + 1; i < entries.length; i++) {
      const entry = entries[i];
      if (entry.type === 'result' && entry.usage) {
        contextTokens += entry.usage.inputTokens + entry.usage.outputTokens;
      }
    }

    const contextWindow = DEFAULT_CONTEXT_WINDOW;
    const hasData = contextTokens > 0;
    const percentage = hasData
      ? Math.min(100, (contextTokens / contextWindow) * 100)
      : 0;

    return {
      contextTokens,
      contextWindow,
      percentage,
      hasData,
    };
  }, [entries]);
}
