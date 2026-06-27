import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getOrCreateServerMock,
  getOrCreateCodexAppServerMock,
  queryMock,
  rateLimitResolveBackendMock,
  recordUsageSafeMock,
} = vi.hoisted(() => ({
  getOrCreateServerMock: vi.fn(),
  getOrCreateCodexAppServerMock: vi.fn(),
  queryMock: vi.fn(),
  rateLimitResolveBackendMock: vi.fn(),
  recordUsageSafeMock: vi.fn(),
}));

vi.mock('./agent-backends/opencode/opencode-backend', () => ({
  getOrCreateServer: getOrCreateServerMock,
}));

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: queryMock,
}));

vi.mock('./agent-backends/codex/codex-app-server', () => ({
  getOrCreateCodexAppServer: getOrCreateCodexAppServerMock,
}));

vi.mock('./rate-limit-swap-service', () => ({
  rateLimitSwapService: {
    resolveBackend: rateLimitResolveBackendMock,
  },
}));

vi.mock('./ai-usage-tracking-service', () => ({
  aiUsageTrackingService: {
    recordUsageSafe: recordUsageSafeMock,
  },
}));

import { generateText } from './ai-generation-service';

function createMockClient(response: unknown) {
  return {
    session: {
      create: vi.fn().mockResolvedValue({ data: { id: 'session-1' } }),
      prompt: vi.fn().mockResolvedValue(response),
      delete: vi.fn().mockResolvedValue(undefined),
      abort: vi.fn().mockResolvedValue(undefined),
    },
  };
}

async function* createClaudeQueryResponse(message: unknown) {
  yield message;
}

function createMockCodexClient() {
  const listeners = new Set<
    (message: { method: string; params?: unknown }) => void
  >();
  const errorListeners = new Set<(error: Error) => void>();

  return {
    request: vi.fn(async (method: string) => {
      if (method === 'thread/start') return { thread: { id: 'thread-1' } };
      if (method === 'turn/start') return { turn: { id: 'turn-1' } };
      if (method === 'turn/interrupt') return {};
      return {};
    }),
    onNotification: vi.fn(
      (listener: (message: { method: string; params?: unknown }) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    ),
    onError: vi.fn((listener: (error: Error) => void) => {
      errorListeners.add(listener);
      return () => errorListeners.delete(listener);
    }),
    emit(notification: { method: string; params?: unknown }) {
      for (const listener of listeners) listener(notification);
    },
    emitError(error: Error) {
      for (const listener of errorListeners) listener(error);
    },
    listenerCount() {
      return listeners.size + errorListeners.size;
    },
  };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('generateText claude-code structured output', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitResolveBackendMock.mockImplementation(async (backend: string) => ({
      backend,
      swapped: false,
    }));
  });

  it('dispatches structured generation through Claude query and records usage', async () => {
    const schema = {
      type: 'object',
      properties: {
        title: { type: 'string' },
      },
    };
    const structured = { title: 'fix: provider generation' };
    queryMock.mockReturnValue(
      createClaudeQueryResponse({
        type: 'result',
        structured_output: structured,
        result: 'ignored text fallback',
        modelUsage: { 'claude-sonnet-4': {} },
        usage: {
          input_tokens: 12,
          output_tokens: 7,
          cache_read_input_tokens: 3,
          cache_creation_input_tokens: 2,
        },
      }),
    );

    const result = await generateText({
      backend: 'claude-code',
      model: 'claude-sonnet-4',
      prompt: 'Generate a title',
      thinkingEffort: 'high',
      outputSchema: schema,
      cwd: '/repo/project',
      allowedTools: ['Read', 'Grep'],
      usageContext: {
        feature: 'task-name',
        projectId: 'project-1',
        taskId: 'task-1',
        stepId: null,
      },
    });

    expect(result).toEqual(structured);
    expect(queryMock).toHaveBeenCalledWith({
      prompt: 'Generate a title',
      options: expect.objectContaining({
        allowedTools: ['Read', 'Grep'],
        model: 'claude-sonnet-4',
        effort: 'high',
        cwd: '/repo/project',
        outputFormat: {
          type: 'json_schema',
          schema,
        },
        persistSession: false,
        abortController: expect.any(AbortController),
      }),
    });
    expect(recordUsageSafeMock).toHaveBeenCalledWith({
      context: {
        feature: 'task-name',
        projectId: 'project-1',
        taskId: 'task-1',
        stepId: null,
      },
      backend: 'claude-code',
      model: 'claude-sonnet-4',
      usage: {
        inputTokens: 12,
        outputTokens: 7,
        cacheReadTokens: 3,
        cacheCreationTokens: 2,
      },
      allowEmptyUsage: true,
    });
  });

  it('returns falsy structured output from Claude instead of text fallback', async () => {
    const schema = {
      type: 'boolean',
    };
    queryMock.mockReturnValue(
      createClaudeQueryResponse({
        type: 'result',
        structured_output: false,
        result: 'incorrect text fallback',
      }),
    );

    const result = await generateText({
      backend: 'claude-code',
      model: 'default',
      prompt: 'Return false',
      outputSchema: schema,
    });

    expect(result).toBe(false);
  });

  it('passes Claude Code allowed tool patterns as scoped tool permissions', async () => {
    queryMock.mockReturnValue(
      createClaudeQueryResponse({ type: 'result', result: 'done' }),
    );

    await generateText({
      backend: 'claude-code',
      model: 'default',
      prompt: 'Update memory',
      allowedTools: ['Read', 'Write', 'Edit'],
      allowedToolPatterns: {
        Read: ['.jean-claude/memory/**'],
        Write: ['.jean-claude/memory/**'],
        Edit: ['.jean-claude/memory/**'],
      },
    });

    expect(queryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          allowedTools: [
            'Read(.jean-claude/memory/**)',
            'Write(.jean-claude/memory/**)',
            'Edit(.jean-claude/memory/**)',
          ],
        }),
      }),
    );
  });
});

describe('generateText opencode structured output', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitResolveBackendMock.mockImplementation(async (backend: string) => ({
      backend,
      swapped: false,
    }));
  });

  it('returns native structured output when OpenCode provides it', async () => {
    const structured = {
      title: 'fix: generate squash merge messages',
      body: '',
    };
    const client = createMockClient({
      data: {
        info: { structured },
        parts: [{ type: 'text', text: 'ignored text fallback' }],
      },
    });
    getOrCreateServerMock.mockResolvedValue({ client });

    const schema = {
      type: 'object',
      properties: {
        title: { type: 'string' },
        body: { type: 'string' },
      },
    };

    const result = await generateText({
      backend: 'opencode',
      model: 'default',
      prompt: 'Generate message',
      outputSchema: schema,
    });

    expect(result).toEqual(structured);
    expect(client.session.prompt).toHaveBeenCalledWith(
      expect.objectContaining({
        format: {
          type: 'json_schema',
          schema,
          retryCount: 1,
        },
      }),
    );
  });

  it('falls back to parsing text JSON when structured output is absent', async () => {
    const client = createMockClient({
      data: {
        info: {},
        parts: [
          {
            type: 'text',
            text: '{"title":"fix: recover opencode output","body":"- Use text fallback"}',
          },
        ],
      },
    });
    getOrCreateServerMock.mockResolvedValue({ client });

    const result = await generateText({
      backend: 'opencode',
      model: 'default',
      prompt: 'Generate message',
      outputSchema: { type: 'object' },
    });

    expect(result).toEqual({
      title: 'fix: recover opencode output',
      body: '- Use text fallback',
    });
    expect(client.session.prompt).toHaveBeenCalledWith(
      expect.objectContaining({
        parts: [
          expect.objectContaining({
            text: expect.stringContaining(
              'Respond with ONLY a valid JSON object matching this schema',
            ),
          }),
        ],
      }),
    );
  });

  it('records one-off OpenCode requests even when token usage is absent', async () => {
    const client = createMockClient({
      data: {
        info: {},
        parts: [{ type: 'text', text: '{"name":"fix task tracking"}' }],
      },
    });
    getOrCreateServerMock.mockResolvedValue({ client });

    await generateText({
      backend: 'opencode',
      model: 'default',
      prompt: 'Generate task name',
      outputSchema: { type: 'object' },
      usageContext: {
        feature: 'task-name',
        projectId: 'project-1',
        taskId: null,
        stepId: null,
      },
    });

    expect(recordUsageSafeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        backend: 'opencode',
        model: 'default',
        allowEmptyUsage: true,
        context: expect.objectContaining({ feature: 'task-name' }),
        usage: {
          inputTokens: undefined,
          outputTokens: undefined,
          cacheReadTokens: undefined,
          cacheCreationTokens: undefined,
        },
      }),
    );
  });

  it('passes restrictive OpenCode permissions for allowed tools and skill', async () => {
    const client = createMockClient({
      data: {
        info: {},
        parts: [{ type: 'text', text: 'done' }],
      },
    });
    getOrCreateServerMock.mockResolvedValue({ client });

    await generateText({
      backend: 'opencode',
      model: 'default',
      prompt: 'Update memory',
      skillName: 'user-preference-memory',
      allowedTools: ['Read', 'Write', 'Edit'],
      allowedToolPatterns: {
        Read: ['.jean-claude/memory/**'],
        Write: ['.jean-claude/memory/**'],
        Edit: ['.jean-claude/memory/**'],
      },
    });

    expect(client.session.create).toHaveBeenCalledWith({
      directory: expect.any(String),
      body: {
        permission: [
          { permission: '*', pattern: '*', action: 'deny' },
          {
            permission: 'read',
            pattern: '.jean-claude/memory/**',
            action: 'allow',
          },
          {
            permission: 'write',
            pattern: '.jean-claude/memory/**',
            action: 'allow',
          },
          {
            permission: 'edit',
            pattern: '.jean-claude/memory/**',
            action: 'allow',
          },
          {
            permission: 'skill',
            pattern: 'user-preference-memory',
            action: 'allow',
          },
        ],
      },
    });
  });

  it('does not pass OpenCode permissions when allowed tools are unset', async () => {
    const client = createMockClient({
      data: {
        info: {},
        parts: [{ type: 'text', text: 'done' }],
      },
    });
    getOrCreateServerMock.mockResolvedValue({ client });

    await generateText({
      backend: 'opencode',
      model: 'default',
      prompt: 'Generate text',
    });

    expect(client.session.create).toHaveBeenCalledWith({
      directory: expect.any(String),
    });
  });
});

describe('generateText codex structured output', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitResolveBackendMock.mockImplementation(async (backend: string) => ({
      backend,
      swapped: false,
    }));
  });

  it('returns parsed JSON text from Codex assistant output', async () => {
    const client = createMockCodexClient();
    getOrCreateCodexAppServerMock.mockResolvedValue({ client });

    const promise = generateText({
      backend: 'codex',
      model: 'default',
      prompt: 'Generate task name',
      outputSchema: {
        type: 'object',
        properties: { name: { type: 'string' } },
      },
    });

    await vi.waitFor(() => {
      expect(client.request).toHaveBeenCalledWith(
        'turn/start',
        expect.objectContaining({ threadId: 'thread-1' }),
      );
    });

    client.emit({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        itemId: 'msg-1',
        delta: '{"name":"add codex ai gen"}',
      },
    });
    client.emit({
      method: 'turn/completed',
      params: { threadId: 'thread-1', turnId: 'turn-1' },
    });

    await expect(promise).resolves.toEqual({ name: 'add codex ai gen' });
  });

  it('returns parsed JSON text from completed Codex assistant item', async () => {
    const client = createMockCodexClient();
    getOrCreateCodexAppServerMock.mockResolvedValue({ client });

    const promise = generateText({
      backend: 'codex',
      model: 'default',
      prompt: 'Generate task name',
      outputSchema: { type: 'object' },
    });

    await vi.waitFor(() => {
      expect(client.request).toHaveBeenCalledWith(
        'turn/start',
        expect.objectContaining({ threadId: 'thread-1' }),
      );
    });

    client.emit({
      method: 'item/completed',
      params: {
        thread: { id: 'thread-1' },
        turn: { id: 'turn-1' },
        item: {
          id: 'msg-1',
          type: 'agentMessage',
          text: '{"name":"completed item wins"}',
        },
      },
    });
    client.emit({
      method: 'turn/completed',
      params: { thread: { id: 'thread-1' }, turn: { id: 'turn-1' } },
    });

    await expect(promise).resolves.toEqual({ name: 'completed item wins' });
    expect(client.listenerCount()).toBe(0);
  });

  it('reads completed Codex assistant content arrays', async () => {
    const client = createMockCodexClient();
    getOrCreateCodexAppServerMock.mockResolvedValue({ client });

    const promise = generateText({
      backend: 'codex',
      model: 'default',
      prompt: 'Generate task name',
      outputSchema: { type: 'object' },
    });

    await vi.waitFor(() => {
      expect(client.request).toHaveBeenCalledWith(
        'turn/start',
        expect.objectContaining({ threadId: 'thread-1' }),
      );
    });

    client.emit({
      method: 'item/completed',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        item: {
          id: 'msg-1',
          type: 'agentMessage',
          content: [{ text: '{"name":"array ' }, { text: 'content"}' }],
        },
      },
    });
    client.emit({
      method: 'turn/completed',
      params: { threadId: 'thread-1', turnId: 'turn-1' },
    });

    await expect(promise).resolves.toEqual({ name: 'array content' });
    expect(client.listenerCount()).toBe(0);
  });

  it('returns plain Codex assistant text and starts turn with selected model', async () => {
    const client = createMockCodexClient();
    getOrCreateCodexAppServerMock.mockResolvedValue({ client });

    const promise = generateText({
      backend: 'codex',
      model: 'gpt-5.1-codex',
      prompt: 'Generate plain text',
    });

    await vi.waitFor(() => {
      expect(client.request).toHaveBeenCalledWith(
        'turn/start',
        expect.objectContaining({
          threadId: 'thread-1',
          model: 'gpt-5.1-codex',
        }),
      );
    });

    client.emit({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        itemId: 'msg-1',
        delta: 'Codex plain answer',
      },
    });
    client.emit({
      method: 'turn/completed',
      params: { threadId: 'thread-1', turnId: 'turn-1' },
    });

    await expect(promise).resolves.toBe('Codex plain answer');
    expect(client.listenerCount()).toBe(0);
  });

  it('passes non-default thinking effort to Codex thread config', async () => {
    const client = createMockCodexClient();
    getOrCreateCodexAppServerMock.mockResolvedValue({ client });

    const promise = generateText({
      backend: 'codex',
      model: 'default',
      prompt: 'Generate plain text',
      thinkingEffort: 'minimal',
    });

    await vi.waitFor(() => {
      expect(client.request).toHaveBeenCalledWith(
        'thread/start',
        expect.objectContaining({
          config: { model_reasoning_effort: 'minimal' },
        }),
      );
    });
    await vi.waitFor(() => {
      expect(client.request).toHaveBeenCalledWith(
        'turn/start',
        expect.objectContaining({ threadId: 'thread-1' }),
      );
    });

    client.emit({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        itemId: 'msg-1',
        delta: 'Codex minimal answer',
      },
    });
    client.emit({
      method: 'turn/completed',
      params: { threadId: 'thread-1', turnId: 'turn-1' },
    });

    await expect(promise).resolves.toBe('Codex minimal answer');
    expect(client.listenerCount()).toBe(0);
  });

  it('records one-off Codex usage from turn completion params', async () => {
    const client = createMockCodexClient();
    getOrCreateCodexAppServerMock.mockResolvedValue({ client });

    const promise = generateText({
      backend: 'codex',
      model: 'configured-codex-model',
      prompt: 'Generate task name',
      usageContext: {
        feature: 'task-name',
        projectId: 'project-1',
        taskId: null,
        stepId: null,
      },
    });

    await vi.waitFor(() => {
      expect(client.request).toHaveBeenCalledWith(
        'turn/start',
        expect.objectContaining({ threadId: 'thread-1' }),
      );
    });

    client.emit({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        itemId: 'msg-1',
        delta: 'usage tracked answer',
      },
    });
    client.emit({
      method: 'turn/completed',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        model: 'actual-codex-model',
        usage: {
          input_tokens: 10,
          outputTokens: 20,
          cache_read_input_tokens: 30,
          cacheCreationTokens: 40,
        },
      },
    });

    await expect(promise).resolves.toBe('usage tracked answer');
    expect(recordUsageSafeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        backend: 'codex',
        model: 'actual-codex-model',
        allowEmptyUsage: true,
        context: expect.objectContaining({ feature: 'task-name' }),
        usage: {
          inputTokens: 10,
          outputTokens: 20,
          cacheReadTokens: 30,
          cacheCreationTokens: 40,
        },
      }),
    );
  });

  it('accepts snake_case scoped Codex notifications', async () => {
    const client = createMockCodexClient();
    getOrCreateCodexAppServerMock.mockResolvedValue({ client });

    const promise = generateText({
      backend: 'codex',
      model: 'default',
      prompt: 'Generate task name',
    });

    await vi.waitFor(() => {
      expect(client.request).toHaveBeenCalledWith(
        'turn/start',
        expect.objectContaining({ threadId: 'thread-1' }),
      );
    });

    client.emit({
      method: 'item/agentMessage/delta',
      params: {
        thread_id: 'thread-1',
        turn_id: 'turn-1',
        delta: 'snake case answer',
      },
    });
    client.emit({
      method: 'turn/completed',
      params: { thread_id: 'thread-1', turn_id: 'turn-1' },
    });

    await expect(promise).resolves.toBe('snake case answer');
    expect(client.listenerCount()).toBe(0);
  });

  it('fails Codex generation promptly when the app-server client errors', async () => {
    const client = createMockCodexClient();
    getOrCreateCodexAppServerMock.mockResolvedValue({ client });

    const promise = generateText({
      backend: 'codex',
      model: 'default',
      prompt: 'Generate task name',
      throwOnError: true,
      timeoutMs: 10_000,
    });

    await vi.waitFor(() => {
      expect(client.request).toHaveBeenCalledWith(
        'turn/start',
        expect.objectContaining({ threadId: 'thread-1' }),
      );
    });

    client.emitError(new Error('codex process exited'));

    await expect(promise).rejects.toThrow(
      'AI generation failed: Codex generation failed',
    );
    expect(client.listenerCount()).toBe(0);
  });

  it('does not leave a notification listener when Codex turn start fails', async () => {
    const client = createMockCodexClient();
    client.request.mockImplementation(async (method: string) => {
      if (method === 'thread/start') return { thread: { id: 'thread-1' } };
      if (method === 'turn/start') throw new Error('turn start failed');
      if (method === 'turn/interrupt') return {};
      return {};
    });
    getOrCreateCodexAppServerMock.mockResolvedValue({ client });

    await expect(
      generateText({
        backend: 'codex',
        model: 'default',
        prompt: 'Generate task name',
        outputSchema: { type: 'object' },
      }),
    ).resolves.toBeNull();

    expect(client.listenerCount()).toBe(0);
  });

  it('captures Codex output emitted before turn start returns', async () => {
    const client = createMockCodexClient();
    client.request.mockImplementation(async (method: string) => {
      if (method === 'thread/start') return { thread: { id: 'thread-1' } };
      if (method === 'turn/start') {
        client.emit({
          method: 'item/agentMessage/delta',
          params: {
            threadId: 'thread-1',
            turnId: 'turn-1',
            itemId: 'msg-1',
            delta: '{"name":"early codex output"}',
          },
        });
        client.emit({
          method: 'turn/completed',
          params: { threadId: 'thread-1', turnId: 'turn-1' },
        });
        return { turn: { id: 'turn-1' } };
      }
      if (method === 'turn/interrupt') return {};
      return {};
    });
    getOrCreateCodexAppServerMock.mockResolvedValue({ client });

    await expect(
      generateText({
        backend: 'codex',
        model: 'default',
        prompt: 'Generate task name',
        outputSchema: { type: 'object' },
      }),
    ).resolves.toEqual({ name: 'early codex output' });
    expect(client.listenerCount()).toBe(0);
  });

  it('completes Codex generation when thread status becomes idle', async () => {
    const client = createMockCodexClient();
    getOrCreateCodexAppServerMock.mockResolvedValue({ client });

    const promise = generateText({
      backend: 'codex',
      model: 'default',
      prompt: 'Generate task name',
      outputSchema: { type: 'object' },
    });

    await vi.waitFor(() => {
      expect(client.request).toHaveBeenCalledWith(
        'turn/start',
        expect.objectContaining({ threadId: 'thread-1' }),
      );
    });

    client.emit({
      method: 'item/completed',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        item: {
          id: 'msg-1',
          type: 'agentMessage',
          text: '{"name":"idle complete"}',
        },
      },
    });
    client.emit({
      method: 'thread/status/changed',
      params: { threadId: 'thread-1', status: { type: 'idle' } },
    });

    await expect(promise).resolves.toEqual({ name: 'idle complete' });
    expect(client.listenerCount()).toBe(0);
  });

  it('throws a timeout error and interrupts Codex when throwOnError is true', async () => {
    vi.useFakeTimers();
    const client = createMockCodexClient();
    getOrCreateCodexAppServerMock.mockResolvedValue({ client });

    try {
      const promise = generateText({
        backend: 'codex',
        model: 'default',
        prompt: 'Generate task name',
        timeoutMs: 10,
        throwOnError: true,
      });
      const caught = promise.catch((error: unknown) => error);

      await vi.waitFor(() => {
        expect(client.request).toHaveBeenCalledWith(
          'turn/start',
          expect.objectContaining({ threadId: 'thread-1' }),
        );
      });
      await vi.advanceTimersByTimeAsync(11);

      const error = await caught;
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain(
        'AI generation timed out after 10ms',
      );
      expect(client.request).toHaveBeenCalledWith('turn/interrupt', {
        threadId: 'thread-1',
        turnId: 'turn-1',
      });
      expect(client.listenerCount()).toBe(0);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('interrupts Codex when turn start resolves after timeout', async () => {
    vi.useFakeTimers();
    const client = createMockCodexClient();
    let resolveTurnStart: (value: { turn: { id: string } }) => void = () => {};
    client.request.mockImplementation((method: string) => {
      if (method === 'thread/start') {
        return Promise.resolve({ thread: { id: 'thread-1' } });
      }
      if (method === 'turn/start') {
        return new Promise<{ turn: { id: string } }>((resolve) => {
          resolveTurnStart = resolve;
        });
      }
      if (method === 'turn/interrupt') return Promise.resolve({});
      return Promise.resolve({});
    });
    getOrCreateCodexAppServerMock.mockResolvedValue({ client });

    try {
      const promise = generateText({
        backend: 'codex',
        model: 'default',
        prompt: 'Generate task name',
        timeoutMs: 10,
        throwOnError: true,
      });
      const caught = promise.catch((error: unknown) => error);

      await flushPromises();
      await vi.advanceTimersByTimeAsync(11);
      await caught;

      resolveTurnStart({ turn: { id: 'turn-1' } });
      await flushPromises();

      expect(client.request).toHaveBeenCalledWith('turn/interrupt', {
        threadId: 'thread-1',
        turnId: 'turn-1',
      });
      expect(client.listenerCount()).toBe(0);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('throws a timeout error when Codex turn start never resolves', async () => {
    vi.useFakeTimers();
    const client = createMockCodexClient();
    client.request.mockImplementation((method: string) => {
      if (method === 'thread/start') {
        return Promise.resolve({ thread: { id: 'thread-1' } });
      }
      if (method === 'turn/start') {
        return new Promise(() => {});
      }
      if (method === 'turn/interrupt') return Promise.resolve({});
      return Promise.resolve({});
    });
    getOrCreateCodexAppServerMock.mockResolvedValue({ client });

    try {
      const promise = generateText({
        backend: 'codex',
        model: 'default',
        prompt: 'Generate task name',
        timeoutMs: 10,
        throwOnError: true,
      });
      const caught = promise.catch((error: unknown) => error);

      await vi.waitFor(() => {
        expect(client.request).toHaveBeenCalledWith(
          'turn/start',
          expect.objectContaining({ threadId: 'thread-1' }),
        );
      });
      await vi.advanceTimersByTimeAsync(11);

      const error = await caught;
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain(
        'AI generation timed out after 10ms',
      );
      expect(client.request).not.toHaveBeenCalledWith(
        'turn/interrupt',
        expect.anything(),
      );
      expect(client.listenerCount()).toBe(0);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('throws when Codex reports turn completion failure', async () => {
    const client = createMockCodexClient();
    getOrCreateCodexAppServerMock.mockResolvedValue({ client });

    const promise = generateText({
      backend: 'codex',
      model: 'default',
      prompt: 'Generate task name',
      throwOnError: true,
    });

    await vi.waitFor(() => {
      expect(client.request).toHaveBeenCalledWith(
        'turn/start',
        expect.objectContaining({ threadId: 'thread-1' }),
      );
    });

    client.emit({
      method: 'turn/completed',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        error: { message: 'failed' },
      },
    });

    await expect(promise).rejects.toThrow(
      'AI generation failed: Codex generation failed',
    );
    expect(client.listenerCount()).toBe(0);
  });
});
