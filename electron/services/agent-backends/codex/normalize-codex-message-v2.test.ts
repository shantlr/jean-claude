import { describe, expect, it } from 'vitest';

import {
  createCodexNormalizationContext,
  normalizeCodexNotification,
} from './normalize-codex-message-v2';

describe('normalizeCodexNotification', () => {
  it('emits a session id for thread started', () => {
    const ctx = createCodexNormalizationContext();

    expect(
      normalizeCodexNotification(
        { method: 'thread/started', params: { thread: { id: 'thr-1' } } },
        ctx,
      ),
    ).toEqual([{ type: 'session-id', sessionId: 'thr-1' }]);
  });

  it('deduplicates repeated thread started session ids', () => {
    const ctx = createCodexNormalizationContext();
    const notification = {
      method: 'thread/started',
      params: { thread: { id: 'thr-1' } },
    };

    normalizeCodexNotification(notification, ctx);

    expect(normalizeCodexNotification(notification, ctx)).toEqual([]);
  });

  it('emits a user prompt for user message items', () => {
    const ctx = createCodexNormalizationContext();

    expect(
      normalizeCodexNotification(
        {
          method: 'item/completed',
          params: {
            item: {
              id: 'item-user-1',
              type: 'message',
              role: 'user',
              text: 'Hi',
            },
          },
        },
        ctx,
      ),
    ).toEqual([
      {
        type: 'entry',
        entry: expect.objectContaining({
          id: 'item-user-1',
          type: 'user-prompt',
          value: 'Hi',
        }),
      },
    ]);
  });

  it('emits a user prompt for Codex userMessage items on start', () => {
    const ctx = createCodexNormalizationContext();

    expect(
      normalizeCodexNotification(
        {
          method: 'item/started',
          params: {
            item: {
              id: 'item-user-2',
              type: 'userMessage',
              content: [{ type: 'text', text: 'Clean debug logs' }],
            },
          },
        },
        ctx,
      ),
    ).toEqual([
      {
        type: 'entry',
        entry: expect.objectContaining({
          id: 'item-user-2',
          type: 'user-prompt',
          value: 'Clean debug logs',
        }),
      },
    ]);
  });

  it('updates repeated Codex userMessage completion instead of duplicating prompt', () => {
    const ctx = createCodexNormalizationContext();
    const notification = {
      method: 'item/started',
      params: {
        item: {
          id: 'item-user-repeat',
          type: 'userMessage',
          content: [{ type: 'text', text: 'Clean debug logs' }],
        },
      },
    };

    expect(normalizeCodexNotification(notification, ctx)[0]?.type).toBe(
      'entry',
    );
    expect(
      normalizeCodexNotification(
        { ...notification, method: 'item/completed' },
        ctx,
      ),
    ).toEqual([
      {
        type: 'entry-update',
        entry: expect.objectContaining({
          id: 'item-user-repeat',
          type: 'user-prompt',
          value: 'Clean debug logs',
        }),
      },
    ]);
  });

  it('streams assistant deltas into one entry', () => {
    const ctx = createCodexNormalizationContext();

    const started = normalizeCodexNotification(
      {
        method: 'item/started',
        params: { item: { id: 'item-1', type: 'agentMessage' } },
      },
      ctx,
    );
    const delta = normalizeCodexNotification(
      {
        method: 'item/agentMessage/delta',
        params: { itemId: 'item-1', delta: 'Hello' },
      },
      ctx,
    );
    const completed = normalizeCodexNotification(
      {
        method: 'item/completed',
        params: {
          item: { id: 'item-1', type: 'agentMessage', text: 'Hello!' },
        },
      },
      ctx,
    );

    expect(started).toHaveLength(1);
    expect(started[0]).toMatchObject({
      type: 'entry',
      entry: { id: 'item-1', type: 'assistant-message', value: '' },
    });
    expect(delta).toEqual([
      {
        type: 'entry-update',
        entry: expect.objectContaining({
          id: 'item-1',
          type: 'assistant-message',
          value: 'Hello',
        }),
      },
    ]);
    expect(completed).toEqual([
      {
        type: 'entry-update',
        entry: expect.objectContaining({
          id: 'item-1',
          type: 'assistant-message',
          value: 'Hello!',
        }),
      },
    ]);
  });

  it('emits a bash tool use for command items', () => {
    const ctx = createCodexNormalizationContext();

    expect(
      normalizeCodexNotification(
        {
          method: 'item/started',
          params: {
            item: {
              id: 'cmd-1',
              type: 'command',
              command: 'pnpm test',
              description: 'Run tests',
            },
          },
        },
        ctx,
      ),
    ).toEqual([
      {
        type: 'entry',
        entry: expect.objectContaining({
          id: 'cmd-1',
          type: 'tool-use',
          toolId: 'cmd-1',
          name: 'bash',
          input: { command: 'pnpm test', description: 'Run tests' },
        }),
      },
    ]);
  });

  it('emits a bash tool use for Codex commandExecution items', () => {
    const ctx = createCodexNormalizationContext();

    expect(
      normalizeCodexNotification(
        {
          method: 'item/started',
          params: {
            item: {
              id: 'cmd-codex',
              type: 'commandExecution',
              command: "/bin/zsh -lc 'rg debug .'",
            },
          },
        },
        ctx,
      ),
    ).toEqual([
      {
        type: 'entry',
        entry: expect.objectContaining({
          id: 'cmd-codex',
          type: 'tool-use',
          toolId: 'cmd-codex',
          name: 'bash',
          input: { command: "/bin/zsh -lc 'rg debug .'" },
        }),
      },
    ]);
  });

  it('attaches aggregated output for Codex commandExecution completion', () => {
    const ctx = createCodexNormalizationContext();

    normalizeCodexNotification(
      {
        method: 'item/started',
        params: {
          item: {
            id: 'cmd-codex-output',
            type: 'commandExecution',
            command: 'rg debug .',
          },
        },
      },
      ctx,
    );

    expect(
      normalizeCodexNotification(
        {
          method: 'item/completed',
          params: {
            item: {
              id: 'cmd-codex-output',
              type: 'commandExecution',
              aggregatedOutput: 'match\n',
              exitCode: 0,
            },
          },
        },
        ctx,
      ),
    ).toEqual([
      {
        type: 'entry-update',
        entry: expect.objectContaining({
          id: 'cmd-codex-output',
          result: { content: 'match\n', isError: false },
        }),
      },
    ]);
  });

  it('streams Codex commandExecution output deltas into bash result', () => {
    const ctx = createCodexNormalizationContext();

    normalizeCodexNotification(
      {
        method: 'item/started',
        params: {
          item: {
            id: 'cmd-codex-delta',
            type: 'commandExecution',
            command: 'pnpm test',
          },
        },
      },
      ctx,
    );

    expect(
      normalizeCodexNotification(
        {
          method: 'item/commandExecution/outputDelta',
          params: { itemId: 'cmd-codex-delta', delta: 'one\n' },
        },
        ctx,
      ),
    ).toEqual([
      {
        type: 'entry-update',
        entry: expect.objectContaining({
          id: 'cmd-codex-delta',
          result: { content: 'one\n', isError: false },
        }),
      },
    ]);

    expect(
      normalizeCodexNotification(
        {
          method: 'item/commandExecution/outputDelta',
          params: { itemId: 'cmd-codex-delta', delta: 'two\n' },
        },
        ctx,
      ),
    ).toEqual([
      {
        type: 'entry-update',
        entry: expect.objectContaining({
          id: 'cmd-codex-delta',
          result: { content: 'one\ntwo\n', isError: false },
        }),
      },
    ]);

    expect(
      normalizeCodexNotification(
        {
          method: 'item/completed',
          params: {
            item: {
              id: 'cmd-codex-delta',
              type: 'commandExecution',
              exitCode: 0,
            },
          },
        },
        ctx,
      ),
    ).toEqual([
      {
        type: 'entry-update',
        entry: expect.objectContaining({
          id: 'cmd-codex-delta',
          result: { content: 'one\ntwo\n', isError: false },
        }),
      },
    ]);
  });

  it('emits an edit tool use for Codex fileChange items', () => {
    const ctx = createCodexNormalizationContext();
    const diff = '@@ -1 +1\n-old\n+new\n';

    expect(
      normalizeCodexNotification(
        {
          method: 'item/started',
          params: {
            item: {
              id: 'file-change-1',
              type: 'fileChange',
              changes: [
                {
                  path: '/repo/src/file.ts',
                  kind: { type: 'update' },
                  diff,
                },
              ],
            },
          },
        },
        ctx,
      ),
    ).toEqual([
      {
        type: 'entry',
        entry: expect.objectContaining({
          id: 'file-change-1',
          type: 'tool-use',
          toolId: 'file-change-1',
          name: 'edit',
          input: expect.objectContaining({
            filePath: '/repo/src/file.ts',
            oldString: '',
            newString: '',
            files: [
              expect.objectContaining({
                filePath: '/repo/src/file.ts',
                type: 'update',
                patch: diff,
              }),
            ],
          }),
        }),
      },
    ]);
  });

  it('marks Codex fileChange items completed', () => {
    const ctx = createCodexNormalizationContext();

    normalizeCodexNotification(
      {
        method: 'item/started',
        params: {
          item: {
            id: 'file-change-complete',
            type: 'fileChange',
            changes: [{ path: '/repo/src/file.ts', kind: { type: 'update' } }],
          },
        },
      },
      ctx,
    );

    expect(
      normalizeCodexNotification(
        {
          method: 'item/completed',
          params: {
            item: {
              id: 'file-change-complete',
              type: 'fileChange',
              changes: [
                { path: '/repo/src/file.ts', kind: { type: 'update' } },
              ],
              status: 'completed',
            },
          },
        },
        ctx,
      ),
    ).toEqual([
      {
        type: 'entry-update',
        entry: expect.objectContaining({
          id: 'file-change-complete',
          name: 'edit',
          result: { changes: [] },
        }),
      },
    ]);
  });

  it('emits completion when Codex thread becomes idle', () => {
    const ctx = createCodexNormalizationContext();

    expect(
      normalizeCodexNotification(
        {
          method: 'thread/status/changed',
          params: { status: { type: 'idle' } },
        },
        ctx,
      ),
    ).toEqual([{ type: 'complete', result: { isError: false } }]);
  });

  it('does not map empty Codex reasoning items as tools', () => {
    const ctx = createCodexNormalizationContext();

    expect(
      normalizeCodexNotification(
        {
          method: 'item/started',
          params: { item: { id: 'reasoning-1', type: 'reasoning' } },
        },
        ctx,
      ),
    ).toEqual([]);
  });

  it('drops item lifecycle notifications without a stable item id', () => {
    const ctx = createCodexNormalizationContext();

    expect(
      normalizeCodexNotification(
        { method: 'item/started', params: { item: { type: 'agentMessage' } } },
        ctx,
      ),
    ).toEqual([]);
    expect(
      normalizeCodexNotification(
        {
          method: 'item/completed',
          params: { item: { type: 'message', role: 'user', text: 'Hi' } },
        },
        ctx,
      ),
    ).toEqual([]);
  });

  it('emits a completed tool entry even without a started item', () => {
    const ctx = createCodexNormalizationContext();

    expect(
      normalizeCodexNotification(
        {
          method: 'item/completed',
          params: {
            item: {
              id: 'cmd-2',
              type: 'command',
              command: 'pnpm lint',
              output: 'ok',
            },
          },
        },
        ctx,
      ),
    ).toEqual([
      {
        type: 'entry',
        entry: expect.objectContaining({
          id: 'cmd-2',
          type: 'tool-use',
          toolId: 'cmd-2',
          name: 'bash',
          input: { command: 'pnpm lint' },
          result: { content: 'ok', isError: false },
        }),
      },
    ]);
  });

  it('uses a safe generic fallback for unknown tool item types', () => {
    const ctx = createCodexNormalizationContext();

    expect(
      normalizeCodexNotification(
        {
          method: 'item/started',
          params: {
            item: { id: 'tool-1', type: 'write', path: 'file.txt' },
          },
        },
        ctx,
      ),
    ).toEqual([
      {
        type: 'entry',
        entry: expect.objectContaining({
          id: 'tool-1',
          type: 'tool-use',
          toolId: 'tool-1',
          name: 'codex-tool',
          input: expect.objectContaining({ originalType: 'write' }),
        }),
      },
    ]);
  });

  it('does not emit bash tool use for empty commands', () => {
    const ctx = createCodexNormalizationContext();

    expect(
      normalizeCodexNotification(
        {
          method: 'item/started',
          params: { item: { id: 'cmd-empty', type: 'command' } },
        },
        ctx,
      ),
    ).toEqual([]);
  });

  it('emits completion with usage and duration when available', () => {
    const ctx = createCodexNormalizationContext();
    ctx.model = 'gpt-5.3-codex';

    expect(
      normalizeCodexNotification(
        {
          method: 'turn/completed',
          params: {
            durationMs: 1234,
            usage: { inputTokens: 10, outputTokens: 20 },
          },
        },
        ctx,
      ),
    ).toEqual([
      {
        type: 'complete',
        result: {
          isError: false,
          model: 'gpt-5.3-codex',
          durationMs: 1234,
          usage: { inputTokens: 10, outputTokens: 20 },
        },
      },
    ]);
  });

  it('prefers turn completion model over configured Codex model', () => {
    const ctx = createCodexNormalizationContext();
    ctx.model = 'gpt-5-codex';

    expect(
      normalizeCodexNotification(
        {
          method: 'turn/completed',
          params: {
            model: 'gpt-5.4-codex',
            usage: { inputTokens: 10, outputTokens: 20 },
          },
        },
        ctx,
      ),
    ).toEqual([
      {
        type: 'complete',
        result: {
          isError: false,
          model: 'gpt-5.4-codex',
          usage: { inputTokens: 10, outputTokens: 20 },
        },
      },
    ]);
  });

  it('treats string and object errors as failed turn completion', () => {
    const ctx = createCodexNormalizationContext();

    expect(
      normalizeCodexNotification(
        { method: 'turn/completed', params: { error: 'failed' } },
        ctx,
      ),
    ).toEqual([{ type: 'complete', result: { isError: true } }]);
    expect(
      normalizeCodexNotification(
        { method: 'turn/completed', params: { error: { message: 'failed' } } },
        ctx,
      ),
    ).toEqual([{ type: 'complete', result: { isError: true } }]);
  });

  it('treats string and object errors as failed tool completion', () => {
    const ctx = createCodexNormalizationContext();

    normalizeCodexNotification(
      {
        method: 'item/started',
        params: { item: { id: 'cmd-err', type: 'command', command: 'false' } },
      },
      ctx,
    );

    expect(
      normalizeCodexNotification(
        {
          method: 'item/completed',
          params: { item: { id: 'cmd-err', type: 'command', error: 'failed' } },
        },
        ctx,
      ),
    ).toEqual([
      {
        type: 'entry-update',
        entry: expect.objectContaining({
          id: 'cmd-err',
          result: { content: 'failed', isError: true },
        }),
      },
    ]);
  });

  it('treats object errors as failed tool completion', () => {
    const ctx = createCodexNormalizationContext();

    normalizeCodexNotification(
      {
        method: 'item/started',
        params: {
          item: { id: 'cmd-object-err', type: 'command', command: 'false' },
        },
      },
      ctx,
    );

    expect(
      normalizeCodexNotification(
        {
          method: 'item/completed',
          params: {
            item: {
              id: 'cmd-object-err',
              type: 'command',
              error: { message: 'failed' },
            },
          },
        },
        ctx,
      ),
    ).toEqual([
      {
        type: 'entry-update',
        entry: expect.objectContaining({
          id: 'cmd-object-err',
          result: { content: 'failed', isError: true },
        }),
      },
    ]);
  });

  it('marks a started bash command completed with no output as successful', () => {
    const ctx = createCodexNormalizationContext();

    normalizeCodexNotification(
      {
        method: 'item/started',
        params: {
          item: { id: 'cmd-success', type: 'command', command: 'true' },
        },
      },
      ctx,
    );

    expect(
      normalizeCodexNotification(
        {
          method: 'item/completed',
          params: { item: { id: 'cmd-success', type: 'command' } },
        },
        ctx,
      ),
    ).toEqual([
      {
        type: 'entry-update',
        entry: expect.objectContaining({
          id: 'cmd-success',
          result: { content: '', isError: false },
        }),
      },
    ]);
  });

  it('marks an unstarted completed bash command with no output as successful', () => {
    const ctx = createCodexNormalizationContext();

    expect(
      normalizeCodexNotification(
        {
          method: 'item/completed',
          params: {
            item: {
              id: 'cmd-unstarted-success',
              type: 'command',
              command: 'true',
            },
          },
        },
        ctx,
      ),
    ).toEqual([
      {
        type: 'entry',
        entry: expect.objectContaining({
          id: 'cmd-unstarted-success',
          type: 'tool-use',
          toolId: 'cmd-unstarted-success',
          name: 'bash',
          result: { content: '', isError: false },
        }),
      },
    ]);
  });

  it('does not emit a no-op fallback tool update when no result can be attached', () => {
    const ctx = createCodexNormalizationContext();

    normalizeCodexNotification(
      {
        method: 'item/started',
        params: {
          item: { id: 'tool-no-result', type: 'write', path: 'file.txt' },
        },
      },
      ctx,
    );

    expect(
      normalizeCodexNotification(
        {
          method: 'item/completed',
          params: { item: { id: 'tool-no-result', type: 'write' } },
        },
        ctx,
      ),
    ).toEqual([]);
  });

  it('ignores unknown notification methods', () => {
    const ctx = createCodexNormalizationContext();

    expect(
      normalizeCodexNotification({ method: 'future/event', params: {} }, ctx),
    ).toEqual([]);
  });
});
