import { useMemo } from 'react';

import type { NormalizedEntry } from '@shared/normalized-message-v2';

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
 * Extract the model name from a single normalized entry.
 */
export function getModelFromEntry(entry: NormalizedEntry): string | undefined {
  return entry.model;
}

/**
 * Extract the model name used in a set of entries.
 * Returns the most recent model name found.
 */
export function useModel(entries: NormalizedEntry[]): string | undefined {
  return useMemo(() => {
    for (let i = entries.length - 1; i >= 0; i--) {
      const model = getModelFromEntry(entries[i]);
      if (model) {
        return model;
      }
    }
    return undefined;
  }, [entries]);
}
