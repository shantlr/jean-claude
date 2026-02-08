import { useMemo } from 'react';

import type { NormalizedMessage } from '@shared/agent-backend-types';

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
 * Check if a normalized message contains a compact part (compact boundary).
 */
function hasCompactPart(msg: NormalizedMessage): boolean {
  return msg.parts.some((p) => p.type === 'compact');
}

/**
 * Calculate context usage from normalized agent messages.
 *
 * Strategy:
 * - Track cumulative input/output tokens from result messages
 * - Get context window size from modelUsage in result messages
 * - Reset token count after messages with compact parts
 */
export function useContextUsage(messages: NormalizedMessage[]): ContextUsage {
  return useMemo(() => {
    let contextTokens = 0;
    let contextWindow = 0;
    let lastCompactIndex = -1;

    // Find the last compact message
    for (let i = messages.length - 1; i >= 0; i--) {
      if (hasCompactPart(messages[i])) {
        lastCompactIndex = i;
        break;
      }
    }

    // Sum tokens from result messages after the last compaction
    for (let i = lastCompactIndex + 1; i < messages.length; i++) {
      const msg = messages[i];

      if (msg.role === 'result' && msg.modelUsage) {
        // Get context window and token counts from first model in modelUsage
        const modelNames = Object.keys(msg.modelUsage);
        if (modelNames.length > 0) {
          const usage = msg.modelUsage[modelNames[0]];
          if (usage.contextWindow && usage.contextWindow > 0) {
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
