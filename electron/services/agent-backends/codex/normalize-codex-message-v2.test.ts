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

  it('emits an edit tool use for Codex commandExecution file actions', () => {
    const ctx = createCodexNormalizationContext();
    const patch = '@@ -1 +1\n-old\n+new\n';

    expect(
      normalizeCodexNotification(
        {
          method: 'item/started',
          params: {
            item: {
              id: 'cmd-codex-edit',
              type: 'commandExecution',
              command: 'apply_patch',
              commandActions: [
                {
                  type: 'edit',
                  path: '/repo/src/file.ts',
                  patch,
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
          id: 'cmd-codex-edit',
          type: 'tool-use',
          toolId: 'cmd-codex-edit',
          name: 'edit',
          input: expect.objectContaining({
            filePath: '/repo/src/file.ts',
            oldString: '',
            newString: '',
            files: [
              expect.objectContaining({
                filePath: '/repo/src/file.ts',
                type: 'update',
                patch,
              }),
            ],
          }),
        }),
      },
    ]);
  });

  it('emits a read tool use for single Codex commandExecution read actions', () => {
    const ctx = createCodexNormalizationContext();

    expect(
      normalizeCodexNotification(
        {
          method: 'item/started',
          params: {
            item: {
              id: 'cmd-codex-read',
              type: 'commandExecution',
              command: "sed -n '1,120p' src/file.ts",
              commandActions: [
                {
                  type: 'read',
                  path: '/repo/src/file.ts',
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
          id: 'cmd-codex-read',
          type: 'tool-use',
          toolId: 'cmd-codex-read',
          name: 'read',
          input: { filePath: '/repo/src/file.ts' },
        }),
      },
    ]);
  });

  it('keeps multi-read Codex commandExecution actions as bash', () => {
    const ctx = createCodexNormalizationContext();

    expect(
      normalizeCodexNotification(
        {
          method: 'item/started',
          params: {
            item: {
              id: 'cmd-codex-multi-read',
              type: 'commandExecution',
              command: "sed -n '1,120p' src/a.ts && sed -n '1,120p' src/b.ts",
              commandActions: [
                { type: 'read', path: '/repo/src/a.ts' },
                { type: 'read', path: '/repo/src/b.ts' },
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
          id: 'cmd-codex-multi-read',
          name: 'bash',
          input: {
            command: "sed -n '1,120p' src/a.ts && sed -n '1,120p' src/b.ts",
          },
        }),
      },
    ]);
  });

  it('keeps mixed Codex commandExecution actions as bash', () => {
    const ctx = createCodexNormalizationContext();

    expect(
      normalizeCodexNotification(
        {
          method: 'item/started',
          params: {
            item: {
              id: 'cmd-codex-mixed-actions',
              type: 'commandExecution',
              command: "sed -n '1,120p' src/file.ts && rg test src",
              commandActions: [
                { type: 'read', path: '/repo/src/file.ts' },
                { type: 'search', query: 'test', path: '/repo/src' },
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
          id: 'cmd-codex-mixed-actions',
          name: 'bash',
          input: {
            command: "sed -n '1,120p' src/file.ts && rg test src",
          },
        }),
      },
    ]);
  });

  it('attaches aggregated output for Codex read action completion', () => {
    const ctx = createCodexNormalizationContext();

    normalizeCodexNotification(
      {
        method: 'item/started',
        params: {
          item: {
            id: 'cmd-codex-read-output',
            type: 'commandExecution',
            command: "sed -n '1,120p' src/file.ts",
            commandActions: [{ type: 'read', path: '/repo/src/file.ts' }],
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
              id: 'cmd-codex-read-output',
              type: 'commandExecution',
              aggregatedOutput: 'line 1\nline 2\n',
              exitCode: 0,
              commandActions: [{ type: 'read', path: '/repo/src/file.ts' }],
            },
          },
        },
        ctx,
      ),
    ).toEqual([
      {
        type: 'entry-update',
        entry: expect.objectContaining({
          id: 'cmd-codex-read-output',
          name: 'read',
          result: 'line 1\nline 2\n',
        }),
      },
    ]);
  });

  it('ignores speculative Codex agent commandExecution items', () => {
    const ctx = createCodexNormalizationContext();

    expect(
      normalizeCodexNotification(
        {
          method: 'item/started',
          params: {
            item: {
              id: 'cmd-speculative',
              type: 'commandExecution',
              command: 'pnpm install',
              processId: null,
              source: 'agent',
              status: 'inProgress',
            },
          },
        },
        ctx,
      ),
    ).toEqual([]);
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

  it('emits a sub-agent tool use for completed Codex spawnAgent calls', () => {
    const ctx = createCodexNormalizationContext();

    expect(
      normalizeCodexNotification(
        {
          method: 'item/completed',
          params: {
            item: {
              id: 'call-spawn',
              type: 'collabAgentToolCall',
              tool: 'spawnAgent',
              status: 'completed',
              receiverThreadIds: ['thread-child'],
              prompt: 'Review the diff carefully.\nReturn findings only.',
              model: 'gpt-5.5',
              reasoningEffort: 'medium',
            },
          },
        },
        ctx,
      ),
    ).toEqual([
      {
        type: 'entry',
        entry: expect.objectContaining({
          id: 'call-spawn',
          type: 'tool-use',
          toolId: 'call-spawn',
          name: 'sub-agent',
          input: {
            agentType: 'gpt-5.5',
            description: 'Review the diff carefully.',
            prompt: 'Review the diff carefully.\nReturn findings only.',
          },
        }),
      },
    ]);
  });

  it('uses Codex as the sub-agent type when Codex spawnAgent model is empty', () => {
    const ctx = createCodexNormalizationContext();

    expect(
      normalizeCodexNotification(
        {
          method: 'item/completed',
          params: {
            item: {
              id: 'call-spawn-empty-model',
              type: 'collabAgentToolCall',
              tool: 'spawnAgent',
              status: 'completed',
              receiverThreadIds: ['thread-empty-model'],
              prompt: 'Review the diff carefully.',
              model: '   ',
            },
          },
        },
        ctx,
      ),
    ).toEqual([
      {
        type: 'entry',
        entry: expect.objectContaining({
          id: 'call-spawn-empty-model',
          name: 'sub-agent',
          input: expect.objectContaining({ agentType: 'Codex' }),
        }),
      },
    ]);
  });

  it('updates the spawned Codex sub-agent with wait output', () => {
    const ctx = createCodexNormalizationContext();

    normalizeCodexNotification(
      {
        method: 'item/completed',
        params: {
          item: {
            id: 'call-spawn',
            type: 'collabAgentToolCall',
            tool: 'spawnAgent',
            status: 'completed',
            receiverThreadIds: ['thread-child'],
            prompt: 'Review diff',
            model: 'gpt-5.5',
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
              id: 'call-wait',
              type: 'collabAgentToolCall',
              tool: 'wait',
              status: 'completed',
              receiverThreadIds: ['thread-child'],
              agentsStates: {
                'thread-child': {
                  status: 'completed',
                  message: 'Important finding',
                },
              },
            },
          },
        },
        ctx,
      ),
    ).toEqual([
      {
        type: 'entry-update',
        entry: expect.objectContaining({
          id: 'call-spawn',
          name: 'sub-agent',
          result: { output: 'Important finding' },
        }),
      },
    ]);
  });

  it('updates all spawned Codex sub-agents referenced by wait output', () => {
    const ctx = createCodexNormalizationContext();

    normalizeCodexNotification(
      {
        method: 'item/completed',
        params: {
          item: {
            id: 'call-spawn-a',
            type: 'collabAgentToolCall',
            tool: 'spawnAgent',
            status: 'completed',
            receiverThreadIds: ['thread-child-a'],
            prompt: 'Review diff A',
            model: 'gpt-5.5',
          },
        },
      },
      ctx,
    );
    normalizeCodexNotification(
      {
        method: 'item/completed',
        params: {
          item: {
            id: 'call-spawn-b',
            type: 'collabAgentToolCall',
            tool: 'spawnAgent',
            status: 'completed',
            receiverThreadIds: ['thread-child-b'],
            prompt: 'Review diff B',
            model: 'gpt-5.5',
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
              id: 'call-wait-multi',
              type: 'collabAgentToolCall',
              tool: 'wait',
              status: 'completed',
              receiverThreadIds: ['thread-child-a', 'thread-child-b'],
              agentsStates: {
                'thread-child-a': {
                  status: 'completed',
                  message: 'Finding A',
                },
                'thread-child-b': {
                  status: 'completed',
                  message: 'Finding B',
                },
              },
            },
          },
        },
        ctx,
      ),
    ).toEqual([
      {
        type: 'entry-update',
        entry: expect.objectContaining({
          id: 'call-spawn-a',
          result: { output: 'Finding A' },
        }),
      },
      {
        type: 'entry-update',
        entry: expect.objectContaining({
          id: 'call-spawn-b',
          result: { output: 'Finding B' },
        }),
      },
    ]);
  });

  it('updates the spawned Codex sub-agent with closeAgent output', () => {
    const ctx = createCodexNormalizationContext();

    normalizeCodexNotification(
      {
        method: 'item/completed',
        params: {
          item: {
            id: 'call-spawn-close',
            type: 'collabAgentToolCall',
            tool: 'spawnAgent',
            status: 'completed',
            receiverThreadIds: ['thread-child-close'],
            prompt: 'Review diff',
            model: 'gpt-5.5',
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
              id: 'call-close',
              type: 'collabAgentToolCall',
              tool: 'closeAgent',
              status: 'completed',
              receiverThreadIds: ['thread-child-close'],
              agentsStates: {
                'thread-child-close': {
                  status: 'completed',
                  message: 'Closed with result',
                },
              },
            },
          },
        },
        ctx,
      ),
    ).toEqual([
      {
        type: 'entry-update',
        entry: expect.objectContaining({
          id: 'call-spawn-close',
          name: 'sub-agent',
          result: { output: 'Closed with result' },
        }),
      },
    ]);
  });

  it('links child Codex thread messages to parent sub-agent tool id', () => {
    const ctx = createCodexNormalizationContext();

    normalizeCodexNotification(
      {
        method: 'item/completed',
        params: {
          item: {
            id: 'call-spawn-parent',
            type: 'collabAgentToolCall',
            tool: 'spawnAgent',
            status: 'completed',
            receiverThreadIds: ['thread-child-parent'],
            prompt: 'Review diff',
            model: 'gpt-5.5',
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
            threadId: 'thread-child-parent',
            item: {
              id: 'child-message',
              type: 'agentMessage',
              text: 'Child analysis',
            },
          },
        },
        ctx,
      ),
    ).toEqual([
      {
        type: 'entry',
        entry: expect.objectContaining({
          id: 'child-message',
          type: 'assistant-message',
          value: 'Child analysis',
          parentToolId: 'call-spawn-parent',
        }),
      },
    ]);
  });

  it('links child Codex thread messages to parent sub-agent tool id from thread_id', () => {
    const ctx = createCodexNormalizationContext();

    normalizeCodexNotification(
      {
        method: 'item/completed',
        params: {
          item: {
            id: 'call-spawn-thread-id',
            type: 'collabAgentToolCall',
            tool: 'spawnAgent',
            status: 'completed',
            receiverThreadIds: ['thread-child-thread-id'],
            prompt: 'Review diff',
            model: 'gpt-5.5',
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
            thread_id: 'thread-child-thread-id',
            item: {
              id: 'child-message-thread-id',
              type: 'agentMessage',
              text: 'Child analysis',
            },
          },
        },
        ctx,
      ),
    ).toEqual([
      {
        type: 'entry',
        entry: expect.objectContaining({
          id: 'child-message-thread-id',
          parentToolId: 'call-spawn-thread-id',
        }),
      },
    ]);
  });

  it('normalizes Codex webSearch actions and ignores empty placeholders', () => {
    const ctx = createCodexNormalizationContext();

    expect(
      normalizeCodexNotification(
        {
          method: 'item/started',
          params: {
            item: {
              id: 'web-search-1',
              type: 'webSearch',
              action: { type: 'search' },
              query: 'vitest focused test command',
            },
          },
        },
        ctx,
      ),
    ).toEqual([
      {
        type: 'entry',
        entry: expect.objectContaining({
          id: 'web-search-1',
          type: 'tool-use',
          toolId: 'web-search-1',
          name: 'web-search',
          input: { query: 'vitest focused test command' },
        }),
      },
    ]);

    expect(
      normalizeCodexNotification(
        {
          method: 'item/completed',
          params: {
            item: {
              id: 'web-search-1',
              type: 'webSearch',
              action: { type: 'search' },
              query: 'vitest focused test command',
              output: 'Search result',
            },
          },
        },
        ctx,
      ),
    ).toEqual([
      {
        type: 'entry-update',
        entry: expect.objectContaining({
          id: 'web-search-1',
          name: 'web-search',
          result: { content: 'Search result' },
        }),
      },
    ]);

    expect(
      normalizeCodexNotification(
        {
          method: 'item/started',
          params: {
            item: {
              id: 'web-fetch-1',
              type: 'webSearch',
              action: {
                type: 'openPage',
                url: 'https://vitest.dev/guide/cli.html',
              },
            },
          },
        },
        ctx,
      ),
    ).toEqual([
      {
        type: 'entry',
        entry: expect.objectContaining({
          id: 'web-fetch-1',
          type: 'tool-use',
          toolId: 'web-fetch-1',
          name: 'web-fetch',
          input: { url: 'https://vitest.dev/guide/cli.html', prompt: '' },
        }),
      },
    ]);

    expect(
      normalizeCodexNotification(
        {
          method: 'item/started',
          params: {
            item: {
              id: 'web-fetch-query-prompt',
              type: 'webSearch',
              action: {
                type: 'openPage',
                url: 'https://vitest.dev/api/',
              },
              query: 'extract API docs',
            },
          },
        },
        ctx,
      ),
    ).toEqual([
      {
        type: 'entry',
        entry: expect.objectContaining({
          id: 'web-fetch-query-prompt',
          type: 'tool-use',
          toolId: 'web-fetch-query-prompt',
          name: 'web-fetch',
          input: {
            url: 'https://vitest.dev/api/',
            prompt: 'extract API docs',
          },
        }),
      },
    ]);

    expect(
      normalizeCodexNotification(
        {
          method: 'item/completed',
          params: {
            item: {
              id: 'web-fetch-1',
              type: 'webSearch',
              action: {
                type: 'openPage',
                url: 'https://vitest.dev/guide/cli.html',
              },
              text: 'Fetched page',
            },
          },
        },
        ctx,
      ),
    ).toEqual([
      {
        type: 'entry-update',
        entry: expect.objectContaining({
          id: 'web-fetch-1',
          name: 'web-fetch',
          result: { content: 'Fetched page' },
        }),
      },
    ]);

    expect(
      normalizeCodexNotification(
        {
          method: 'item/started',
          params: {
            item: {
              id: 'web-empty',
              type: 'webSearch',
              query: '',
              action: { type: 'other' },
            },
          },
        },
        ctx,
      ),
    ).toEqual([]);

    expect(
      normalizeCodexNotification(
        {
          method: 'item/started',
          params: {
            item: {
              id: 'web-unknown',
              type: 'webSearch',
              action: { type: 'unknownAction' },
              payload: { value: 'keep fallback' },
            },
          },
        },
        ctx,
      ),
    ).toEqual([
      {
        type: 'entry',
        entry: expect.objectContaining({
          id: 'web-unknown',
          type: 'tool-use',
          toolId: 'web-unknown',
          name: 'codex-tool',
          input: expect.objectContaining({ originalType: 'webSearch' }),
        }),
      },
    ]);
  });

  it('normalizes a compact Codex sub-agent and web-search sample', () => {
    const ctx = createCodexNormalizationContext();
    const receiverThreadId = '019ee9da-8c31-7d52-a368-1d2d530d4fdb';

    const spawn = normalizeCodexNotification(
      {
        method: 'item/completed',
        params: {
          item: {
            id: 'call_R0QmTpweUUCQwbzrauqog4LD',
            type: 'collabAgentToolCall',
            tool: 'spawnAgent',
            receiverThreadIds: [receiverThreadId],
            prompt: 'Audit tests\nFocus on regressions.',
            model: 'gpt-5.5',
            agentsStates: {
              [receiverThreadId]: {
                status: 'pendingInit',
                message: null,
              },
            },
          },
        },
      },
      ctx,
    );
    const child = normalizeCodexNotification(
      {
        method: 'item/completed',
        params: {
          threadId: receiverThreadId,
          item: {
            id: 'sample-child-message',
            type: 'agentMessage',
            text: '**Critical**\nNone.',
          },
        },
      },
      ctx,
    );
    const wait = normalizeCodexNotification(
      {
        method: 'item/completed',
        params: {
          item: {
            id: 'call_gOg8ufrFZNodWuLD4y1UnBJ3',
            type: 'collabAgentToolCall',
            tool: 'wait',
            receiverThreadIds: [receiverThreadId],
            agentsStates: {
              [receiverThreadId]: { message: '**Critical**\nNone.' },
            },
          },
        },
      },
      ctx,
    );
    const search = normalizeCodexNotification(
      {
        method: 'item/started',
        params: {
          item: {
            id: 'sample-search',
            type: 'webSearch',
            action: { type: 'search' },
            query: 'Codex message normalization',
          },
        },
      },
      ctx,
    );

    expect(spawn).toEqual([
      {
        type: 'entry',
        entry: expect.objectContaining({
          id: 'call_R0QmTpweUUCQwbzrauqog4LD',
          name: 'sub-agent',
          input: {
            agentType: 'gpt-5.5',
            description: 'Audit tests',
            prompt: 'Audit tests\nFocus on regressions.',
          },
        }),
      },
    ]);
    expect(child).toEqual([
      {
        type: 'entry',
        entry: expect.objectContaining({
          id: 'sample-child-message',
          parentToolId: 'call_R0QmTpweUUCQwbzrauqog4LD',
        }),
      },
    ]);
    expect(wait).toEqual([
      {
        type: 'entry-update',
        entry: expect.objectContaining({
          id: 'call_R0QmTpweUUCQwbzrauqog4LD',
          result: { output: '**Critical**\nNone.' },
        }),
      },
    ]);
    expect(search).toEqual([
      {
        type: 'entry',
        entry: expect.objectContaining({
          id: 'sample-search',
          name: 'web-search',
          input: { query: 'Codex message normalization' },
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
