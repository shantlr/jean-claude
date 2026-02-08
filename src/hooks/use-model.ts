import { useMemo } from 'react';

import type { NormalizedMessage } from '@shared/agent-backend-types';

/**
 * Format a model name for display.
 * Extracts the model name part and optionally shows date suffix.
 * e.g., "claude-sonnet-4-20250514" -> "claude-sonnet-4"
 */
export function formatModelName(model: string): string {
  // Match pattern: model-name-YYYYMMDD
  const match = model.match(/^(.+)-(\d{8})$/);
  if (match) {
    return match[1];
  }
  return model;
}

/**
 * Extract the model name from a single normalized message.
 */
export function getModelFromMessage(
  message: NormalizedMessage,
): string | undefined {
  if (message.role === 'assistant' && message.model) {
    return message.model;
  }
  return undefined;
}

/**
 * Extract the model name used in a set of messages.
 * Returns the most recent model name found in assistant messages.
 */
export function useModel(messages: NormalizedMessage[]): string | undefined {
  return useMemo(() => {
    // Find the most recent assistant message with a model field
    for (let i = messages.length - 1; i >= 0; i--) {
      const model = getModelFromMessage(messages[i]);
      if (model) {
        return model;
      }
    }
    return undefined;
  }, [messages]);
}
