import type { NormalizedEntry } from '@shared/normalized-message-v2';

import type { DisplayMessage } from './message-merger';

function parseDateMs(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? undefined : ms;
}

function normalizeDurationMs(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value < 0) return undefined;
  return value;
}

function getPromptDateMs(message: DisplayMessage): number | undefined {
  if (message.kind === 'entry' && message.entry.type === 'user-prompt') {
    return parseDateMs(message.entry.date);
  }
  if (message.kind === 'skill') {
    if (message.promptEntry?.type === 'user-prompt') {
      return parseDateMs(message.promptEntry.date);
    }
    return undefined;
  }
  return undefined;
}

function isDisplayPrompt(message: DisplayMessage): boolean {
  return (
    (message.kind === 'entry' &&
      message.entry.type === 'user-prompt' &&
      message.entry.value.trim() !== '') ||
    message.kind === 'skill'
  );
}

function getResultDurationMs({
  resultEntry,
  activePromptStartedAtMs,
}: {
  resultEntry: Extract<NormalizedEntry, { type: 'result' }>;
  activePromptStartedAtMs: number | undefined;
}): number | undefined {
  if (resultEntry.durationMs !== undefined) {
    return normalizeDurationMs(resultEntry.durationMs);
  }

  const resultDateMs = parseDateMs(resultEntry.date);
  if (activePromptStartedAtMs === undefined || resultDateMs === undefined) {
    return undefined;
  }
  if (resultDateMs < activePromptStartedAtMs) {
    return undefined;
  }

  return normalizeDurationMs(resultDateMs - activePromptStartedAtMs);
}

export function computePromptAndResultDurations(
  displayMessages: DisplayMessage[],
): {
  promptDurationMsByPromptIndex: Map<number, number>;
  resultDurationMsByEntryId: Map<string, number>;
} {
  const promptDurationMsByPromptIndex = new Map<number, number>();
  const resultDurationMsByEntryId = new Map<string, number>();

  let currentPromptIndex = -1;
  let activePromptIndex: number | undefined;
  let activePromptStartedAtMs: number | undefined;

  for (const message of displayMessages) {
    if (isDisplayPrompt(message)) {
      currentPromptIndex += 1;
      activePromptIndex = currentPromptIndex;
      activePromptStartedAtMs = getPromptDateMs(message);
      continue;
    }

    if (
      message.kind === 'entry' &&
      message.entry.type === 'result' &&
      activePromptIndex !== undefined
    ) {
      const durationMs = getResultDurationMs({
        resultEntry: message.entry,
        activePromptStartedAtMs,
      });

      if (durationMs !== undefined) {
        if (!promptDurationMsByPromptIndex.has(activePromptIndex)) {
          promptDurationMsByPromptIndex.set(activePromptIndex, durationMs);
        }
        resultDurationMsByEntryId.set(message.entry.id, durationMs);
      }
    }
  }

  return {
    promptDurationMsByPromptIndex,
    resultDurationMsByEntryId,
  };
}
