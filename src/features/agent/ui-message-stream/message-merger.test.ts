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

  it('hides file-edited entries already covered by edit tools', () => {
    const entries: NormalizedEntry[] = [
      {
        id: 'file-edited-1',
        date: '2026-05-23T10:00:00.000Z',
        type: 'file-edited',
        filePath: '/tmp/project/src/index.tsx',
      },
      {
        id: 'tool-1',
        date: '2026-05-23T10:00:01.000Z',
        type: 'tool-use',
        toolId: 'call-1',
        name: 'edit',
        input: {
          filePath: 'src/index.tsx',
          oldString: 'old',
          newString: 'new',
        },
        result: { changes: [] },
      },
    ];

    const merged = mergeSkillMessages(entries);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      kind: 'entry',
      entry: { id: 'tool-1', type: 'tool-use', name: 'edit' },
    });
  });

  it('keeps file-edited entries without matching edit tools', () => {
    const entries: NormalizedEntry[] = [
      {
        id: 'file-edited-1',
        date: '2026-05-23T10:00:00.000Z',
        type: 'file-edited',
        filePath: '/tmp/project/src/generated.ts',
      },
      {
        id: 'tool-1',
        date: '2026-05-23T10:00:01.000Z',
        type: 'tool-use',
        toolId: 'call-1',
        name: 'edit',
        input: {
          filePath: 'src/index.tsx',
          oldString: 'old',
          newString: 'new',
        },
        result: { changes: [] },
      },
    ];

    const merged = mergeSkillMessages(entries);

    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({
      kind: 'entry',
      entry: { id: 'file-edited-1', type: 'file-edited' },
    });
  });

  it('groups fetched OpenCode child-session entries under their completed task tool', () => {
    const entries: NormalizedEntry[] = [
      {
        id: 'prompt-1',
        date: '2026-05-23T10:00:00.000Z',
        type: 'user-prompt',
        value: 'Summarize repo',
      },
      {
        id: 'tool-entry-1',
        date: '2026-05-23T10:00:01.000Z',
        model: 'opencode/gpt-5.1',
        type: 'tool-use',
        toolId: 'call_subagent_1',
        name: 'sub-agent',
        input: {
          agentType: 'explore',
          description: 'Explore project',
          prompt: 'Explore this repo',
        },
        result: { output: 'Done' },
      },
      {
        id: 'result-1',
        date: '2026-05-23T10:00:02.000Z',
        isSynthetic: true,
        type: 'result',
        isError: false,
        durationMs: 2_000,
      },
      {
        id: 'child-prompt-1',
        date: '2026-05-23T10:00:03.000Z',
        model: 'opencode/gpt-5.1',
        parentToolId: 'call_subagent_1',
        type: 'user-prompt',
        value: 'Explore this repo',
      },
      {
        id: 'child-assistant-1',
        date: '2026-05-23T10:00:04.000Z',
        model: 'opencode/gpt-5.1',
        parentToolId: 'call_subagent_1',
        type: 'assistant-message',
        value: 'Project is an Electron app.',
      },
    ];

    const merged = mergeSkillMessages(entries);
    const groups = groupByPrompts(merged, false);

    expect(merged).toHaveLength(3);
    expect(merged[1]).toMatchObject({
      kind: 'subagent',
      toolUse: { toolId: 'call_subagent_1' },
      childEntries: [
        { id: 'child-prompt-1', parentToolId: 'call_subagent_1' },
        { id: 'child-assistant-1', parentToolId: 'call_subagent_1' },
      ],
    });
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      kind: 'prompt-group',
      childMessages: [
        {
          kind: 'subagent',
          childEntries: [{ id: 'child-prompt-1' }, { id: 'child-assistant-1' }],
        },
      ],
    });
  });

  it('does not create prompt groups for SDK synthetic prompts', () => {
    const entries: NormalizedEntry[] = [
      {
        id: 'synthetic-summary-prompt',
        date: '2026-06-13T09:56:30.555Z',
        isSynthetic: true,
        type: 'user-prompt',
        value: 'Summarize the prior step context for continuation.',
        isSDKSynthetic: true,
      },
    ];

    const merged = mergeSkillMessages(entries);
    const groups = groupByPrompts(merged, true);

    expect(merged).toHaveLength(0);
    expect(groups).toHaveLength(0);
  });
});
