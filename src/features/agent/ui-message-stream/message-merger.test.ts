import { describe, expect, it } from 'vitest';

import type { NormalizedEntry } from '@shared/normalized-message-v2';

import { groupByPrompts, mergeSkillMessages } from './message-merger';

describe('message-merger', () => {
  it('marks prompt groups completed when a success result entry is present', () => {
    const entries: NormalizedEntry[] = [
      {
        id: 'prompt-1',
        date: '2026-05-23T10:00:00.000Z',
        type: 'user-prompt',
        value: 'Inspect mapping',
      },
      {
        id: 'assistant-1',
        date: '2026-05-23T10:00:01.000Z',
        type: 'assistant-message',
        value: 'Done',
      },
      {
        id: 'result-1',
        date: '2026-05-23T10:00:02.000Z',
        isSynthetic: true,
        type: 'result',
        isError: false,
        durationMs: 2_000,
      },
    ];

    const merged = mergeSkillMessages(entries);
    const groups = groupByPrompts(merged, false);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      kind: 'prompt-group',
      status: 'completed',
      durationMs: 2_000,
      resultEntry: {
        id: 'result-1',
        type: 'result',
        isError: false,
      },
    });
  });

  it('keeps completed groups without a synthetic result entry', () => {
    const entries: NormalizedEntry[] = [
      {
        id: 'prompt-2',
        date: '2026-05-23T10:00:00.000Z',
        type: 'user-prompt',
        value: 'Do thing',
      },
      {
        id: 'assistant-2',
        date: '2026-05-23T10:00:01.000Z',
        type: 'assistant-message',
        value: 'Done',
      },
    ];

    const merged = mergeSkillMessages(entries);
    const groups = groupByPrompts(merged, false);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      kind: 'prompt-group',
      status: 'completed',
    });
    expect(
      groups[0]?.kind === 'prompt-group' ? groups[0].resultEntry : undefined,
    ).toBeUndefined();
  });
});
