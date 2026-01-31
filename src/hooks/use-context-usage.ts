import { useMemo } from 'react';

import type { AgentMessage } from '../../shared/agent-types';

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
 * Calculate context usage from agent messages.
 *
 * Strategy:
 * - Track cumulative input/output tokens from result messages
 * - Get context window size from modelUsage in result messages
 * - Reset token count after compact_boundary messages
 */
export function useContextUsage(messages: AgentMessage[]): ContextUsage {
  return useMemo(() => {
    let contextTokens = 0;
    let contextWindow = 0;
    let lastCompactIndex = -1;

    // Find the last compact_boundary message
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.type === 'system' && msg.subtype === 'compact_boundary') {
        lastCompactIndex = i;
        break;
      }
    }

    // Sum tokens from result messages after the last compaction
    for (let i = lastCompactIndex + 1; i < messages.length; i++) {
      const msg = messages[i];

      if (msg.type === 'result' && msg.modelUsage) {
        // Get context window and token counts from first model in modelUsage
        const modelNames = Object.keys(msg.modelUsage);
        if (modelNames.length > 0) {
          const usage = msg.modelUsage[modelNames[0]];
          if (usage.contextWindow > 0) {
            contextWindow = usage.contextWindow;
          }
          // Add this turn's tokens to the cumulative count
          contextTokens += usage.inputTokens + usage.outputTokens;
        }
      }
    }

    const hasData = contextWindow > 0;
    const percentage = hasData
      ? Math.min(100, (contextTokens / contextWindow) * 100)
      : 0;

    return {
      contextTokens,
      contextWindow,
      percentage,
      hasData,
    };
  }, [messages]);
}
