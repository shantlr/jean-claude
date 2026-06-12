import { describe, expect, it, vi, beforeEach } from 'vitest';

import type {
  AgentBackendConfig,
  AgentTaskContext,
} from '@shared/agent-backend-types';

const mocks = vi.hoisted(() => ({
  getOrCreateCodexAppServer: vi.fn(),
}));

vi.mock('./codex-app-server', () => ({
  getOrCreateCodexAppServer: mocks.getOrCreateCodexAppServer,
}));

import { CodexBackend } from './codex-backend';

describe('CodexBackend', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('starts a new thread when config.sessionId is missing', async () => {
    const { backend, client } = createBackend();

    await backend.start(createConfig(), [
      { type: 'text', text: 'Hello Codex' },
    ]);

    expect(client.request).toHaveBeenCalledWith('thread/start', {
      cwd: '/tmp/project',
      model: undefined,
      approvalPolicy: 'on-request',
      sandbox: 'workspace-write',
      serviceName: 'jean_claude',
    });
  });

  it('resumes existing thread when config.sessionId is present', async () => {
    const { backend, client } = createBackend();

    await backend.start(createConfig({ sessionId: 'thread-existing' }), [
      { type: 'text', text: 'Continue' },
    ]);

    expect(client.request).toHaveBeenCalledWith('thread/resume', {
      threadId: 'thread-existing',
    });
    expect(client.request).not.toHaveBeenCalledWith(
      'thread/start',
      expect.anything(),
    );
  });

  it('starts a turn with prompt input', async () => {
    const { backend, client } = createBackend();

    await backend.start(createConfig({ model: 'gpt-5' }), [
      { type: 'text', text: 'Read this' },
      { type: 'image', data: 'base64-data', mimeType: 'image/png' },
      { type: 'file', filePath: '/tmp/file.txt', filename: 'file.txt' },
    ]);

    expect(client.request).toHaveBeenCalledWith('turn/start', {
      threadId: 'thread-1',
      input: [
        { type: 'text', text: 'Read this' },
        { type: 'image', data: 'base64-data', mimeType: 'image/png' },
        { type: 'text', text: 'Attached file: /tmp/file.txt' },
      ],
      model: 'gpt-5',
    });
  });

  it('yields entry events with persisted raw row ids', async () => {
    const { backend, emitNotification, persistRaw } = createBackend();
    const session = await backend.start(createConfig(), [
      { type: 'text', text: 'Hello' },
    ]);
    const iterator = session.events[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toMatchObject({
      value: { type: 'session-id', sessionId: 'thread-1' },
    });
    const next = iterator.next();

    emitNotification({
      method: 'item/completed',
      params: {
        threadId: 'thread-1',
        item: { id: 'item-1', type: 'message', role: 'user', text: 'Hello' },
      },
    });

    await expect(next).resolves.toEqual({
      done: false,
      value: {
        type: 'entry',
        entry: expect.objectContaining({
          id: 'item-1',
          type: 'user-prompt',
          value: 'Hello',
        }),
        rawMessageId: 'raw-1',
      },
    });
    expect(persistRaw).toHaveBeenCalledWith({
      messageIndex: 7,
      backendSessionId: 'thread-1',
      rawData: {
        method: 'item/completed',
        params: {
          threadId: 'thread-1',
          item: { id: 'item-1', type: 'message', role: 'user', text: 'Hello' },
        },
      },
    });
  });

  it('merges repeated Codex delta raw rows by item', async () => {
    const updateRaw = vi.fn<NonNullable<AgentTaskContext['updateRaw']>>(
      async () => undefined,
    );
    const { backend, emitNotification, persistRaw } = createBackend({
      updateRaw,
    });
    const session = await backend.start(createConfig(), [
      { type: 'text', text: 'Hello' },
    ]);
    const iterator = session.events[Symbol.asyncIterator]();
    await iterator.next();

    emitNotification({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        itemId: 'msg-1',
        delta: 'Hel',
      },
    });
    emitNotification({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        itemId: 'msg-1',
        delta: 'lo',
      },
    });

    await expect(iterator.next()).resolves.toMatchObject({
      value: { type: 'entry', entry: { id: 'msg-1', value: 'Hel' } },
    });
    await expect(iterator.next()).resolves.toMatchObject({
      value: { type: 'entry-update', entry: { id: 'msg-1', value: 'Hello' } },
    });
    expect(persistRaw).toHaveBeenCalledTimes(1);
    expect(updateRaw).toHaveBeenCalledWith({
      rowId: 'raw-1',
      rawData: {
        method: 'item/agentMessage/delta',
        params: {
          threadId: 'thread-1',
          turnId: 'turn-1',
          itemId: 'msg-1',
          delta: 'Hello',
        },
      },
    });
  });

  it('ignores notifications for a different thread', async () => {
    const { backend, emitNotification } = createBackend();
    const session = await backend.start(createConfig(), [
      { type: 'text', text: 'Hello' },
    ]);
    const iterator = session.events[Symbol.asyncIterator]();
    await iterator.next();
    const next = iterator.next();

    emitNotification({
      method: 'item/completed',
      params: {
        threadId: 'thread-other',
        item: { id: 'wrong', type: 'message', role: 'user', text: 'Wrong' },
      },
    });
    emitNotification({
      method: 'item/completed',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-other',
        item: {
          id: 'wrong-turn',
          type: 'message',
          role: 'user',
          text: 'Wrong',
        },
      },
    });
    await Promise.resolve();

    emitNotification({
      method: 'item/completed',
      params: {
        threadId: 'thread-1',
        item: { id: 'right', type: 'message', role: 'user', text: 'Right' },
      },
    });

    expect(await next).toMatchObject({
      done: false,
      value: { type: 'entry', entry: { id: 'right' } },
    });
  });

  it('ignores other-thread started notifications using top-level params id', async () => {
    const { backend, emitNotification, persistRaw } = createBackend();
    const session = await backend.start(createConfig(), [
      { type: 'text', text: 'Hello' },
    ]);
    const iterator = session.events[Symbol.asyncIterator]();
    await iterator.next();
    const next = iterator.next();

    emitNotification({
      method: 'thread/started',
      params: { id: 'thread-other' },
    });
    await Promise.resolve();
    emitNotification({
      method: 'item/completed',
      params: {
        threadId: 'thread-1',
        item: { id: 'item-1', type: 'message', role: 'user', text: 'Accepted' },
      },
    });

    await expect(next).resolves.toMatchObject({
      value: { type: 'entry', entry: { id: 'item-1' } },
    });
    expect(persistRaw).toHaveBeenCalledTimes(1);
  });

  it('processes notifications in order when first persistRaw resolves later', async () => {
    let resolveFirst!: (value: string) => void;
    const firstPersist = new Promise<string>((resolve) => {
      resolveFirst = resolve;
    });
    const { backend, emitNotification } = createBackend({
      persistRaw: vi
        .fn<AgentTaskContext['persistRaw']>()
        .mockReturnValueOnce(firstPersist)
        .mockResolvedValueOnce('raw-2'),
    });
    const session = await backend.start(createConfig(), [
      { type: 'text', text: 'Hello' },
    ]);
    const iterator = session.events[Symbol.asyncIterator]();
    await iterator.next();
    const first = iterator.next();

    emitNotification({
      method: 'item/completed',
      params: {
        threadId: 'thread-1',
        item: { id: 'item-1', type: 'message', role: 'user', text: 'First' },
      },
    });
    emitNotification({
      method: 'item/completed',
      params: {
        threadId: 'thread-1',
        item: { id: 'item-2', type: 'message', role: 'user', text: 'Second' },
      },
    });
    await Promise.resolve();

    resolveFirst('raw-1');

    await expect(first).resolves.toMatchObject({
      value: { type: 'entry', entry: { id: 'item-1' }, rawMessageId: 'raw-1' },
    });
    const second = iterator.next();
    await expect(second).resolves.toMatchObject({
      value: { type: 'entry', entry: { id: 'item-2' }, rawMessageId: 'raw-2' },
    });
  });

  it('emits entry before closing for queued turn completion', async () => {
    const { backend, emitNotification } = createBackend();
    const session = await backend.start(createConfig(), [
      { type: 'text', text: 'Hello' },
    ]);
    const iterator = session.events[Symbol.asyncIterator]();
    await iterator.next();

    emitNotification({
      method: 'item/completed',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        item: { id: 'item-1', type: 'message', role: 'user', text: 'First' },
      },
    });
    emitNotification({
      method: 'turn/completed',
      params: { threadId: 'thread-1', turnId: 'turn-1' },
    });

    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: { type: 'entry', entry: { id: 'item-1' } },
    });
    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: { type: 'complete' },
    });
    await expect(iterator.next()).resolves.toEqual({
      done: true,
      value: undefined,
    });
  });

  it('ignores unscoped notifications', async () => {
    const { backend, emitNotification, persistRaw } = createBackend();
    const session = await backend.start(createConfig(), [
      { type: 'text', text: 'Hello' },
    ]);
    const iterator = session.events[Symbol.asyncIterator]();
    await iterator.next();
    const next = iterator.next();

    emitNotification({
      method: 'item/completed',
      params: {
        item: { id: 'item-1', type: 'message', role: 'user', text: 'Ignored' },
      },
    });
    await Promise.resolve();
    emitNotification({
      method: 'item/completed',
      params: {
        threadId: 'thread-1',
        item: { id: 'item-2', type: 'message', role: 'user', text: 'Accepted' },
      },
    });

    await expect(next).resolves.toMatchObject({
      value: { type: 'entry', entry: { id: 'item-2' } },
    });
    expect(persistRaw).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes after natural completion', async () => {
    const { backend, emitNotification, unsubscribe } = createBackend();
    const session = await backend.start(
      createConfig({ model: 'gpt-5.3-codex' }),
      [{ type: 'text', text: 'Hello' }],
    );
    const iterator = session.events[Symbol.asyncIterator]();
    await iterator.next();

    emitNotification({
      method: 'turn/completed',
      params: { threadId: 'thread-1', turnId: 'turn-1' },
    });

    await expect(iterator.next()).resolves.toMatchObject({
      value: {
        type: 'complete',
        result: { model: 'gpt-5.3-codex' },
      },
    });
    await expect(iterator.next()).resolves.toMatchObject({ done: true });
    expect(unsubscribe).toHaveBeenCalledOnce();
    await expect(backend.stop(session.sessionId)).resolves.toBeUndefined();
  });

  it('completes when Codex reports the thread idle', async () => {
    const { backend, emitNotification, unsubscribe } = createBackend();
    const session = await backend.start(createConfig(), [
      { type: 'text', text: 'Hello' },
    ]);
    const iterator = session.events[Symbol.asyncIterator]();
    await iterator.next();

    emitNotification({
      method: 'thread/status/changed',
      params: { threadId: 'thread-1', status: { type: 'idle' } },
    });

    await expect(iterator.next()).resolves.toMatchObject({
      value: { type: 'complete', result: { isError: false } },
    });
    await expect(iterator.next()).resolves.toMatchObject({ done: true });
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('ignores unscoped thread idle notifications', async () => {
    const { backend, emitNotification } = createBackend();
    const session = await backend.start(createConfig(), [
      { type: 'text', text: 'Hello' },
    ]);
    const iterator = session.events[Symbol.asyncIterator]();
    await iterator.next();

    emitNotification({
      method: 'thread/status/changed',
      params: { status: { type: 'idle' } },
    });
    await Promise.resolve();

    await backend.stop(session.sessionId);
    await expect(iterator.next()).resolves.toMatchObject({ done: true });
  });

  it('completes after idle timeout when all Codex items completed', async () => {
    vi.useFakeTimers();
    const { backend, emitNotification, unsubscribe } = createBackend();
    const session = await backend.start(createConfig(), [
      { type: 'text', text: 'Hello' },
    ]);
    const iterator = session.events[Symbol.asyncIterator]();
    await iterator.next();

    emitNotification({
      method: 'item/started',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        item: { id: 'cmd-1', type: 'commandExecution', command: 'true' },
      },
    });
    await iterator.next();
    emitNotification({
      method: 'item/completed',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        item: { id: 'cmd-1', type: 'commandExecution', command: 'true' },
      },
    });
    await iterator.next();

    const complete = iterator.next();
    await vi.advanceTimersByTimeAsync(60_000);

    await expect(complete).resolves.toMatchObject({
      value: { type: 'complete', result: { isError: false } },
    });
    await expect(iterator.next()).resolves.toMatchObject({ done: true });
    expect(unsubscribe).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('emits error when raw persistence fails', async () => {
    const { backend, emitNotification, unsubscribe } = createBackend({
      persistRaw: vi.fn<AgentTaskContext['persistRaw']>(async () => {
        throw new Error('database unavailable');
      }),
    });
    const session = await backend.start(createConfig(), [
      { type: 'text', text: 'Hello' },
    ]);
    const iterator = session.events[Symbol.asyncIterator]();
    await iterator.next();
    const next = iterator.next();

    emitNotification({
      method: 'item/completed',
      params: {
        threadId: 'thread-1',
        item: { id: 'item-1', type: 'message', role: 'user', text: 'Hello' },
      },
    });

    await expect(next).resolves.toEqual({
      done: false,
      value: {
        type: 'error',
        error: 'Failed to persist Codex raw notification: database unavailable',
      },
    });
    await expect(iterator.next()).resolves.toEqual({
      done: true,
      value: undefined,
    });
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('emits session id from thread start response', async () => {
    const { backend } = createBackend();
    const session = await backend.start(createConfig(), [
      { type: 'text', text: 'Hello' },
    ]);

    await expect(
      session.events[Symbol.asyncIterator]().next(),
    ).resolves.toEqual({
      done: false,
      value: { type: 'session-id', sessionId: 'thread-1' },
    });
  });

  it('emits resumed config session id when resume response lacks id', async () => {
    const { backend } = createBackend({ threadResult: {} });
    const session = await backend.start(
      createConfig({ sessionId: 'thread-existing' }),
      [{ type: 'text', text: 'Continue' }],
    );

    await expect(
      session.events[Symbol.asyncIterator]().next(),
    ).resolves.toEqual({
      done: false,
      value: { type: 'session-id', sessionId: 'thread-existing' },
    });
  });

  it('fails startup and cleans up when turn start response lacks id', async () => {
    const { backend, unsubscribe } = createBackend({ turnResult: {} });

    await expect(
      backend.start(createConfig(), [{ type: 'text', text: 'Hello' }]),
    ).rejects.toThrow('Codex turn/start did not return a turn id');
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('interrupts the active turn on stop', async () => {
    const { backend, client } = createBackend();
    const session = await backend.start(createConfig(), [
      { type: 'text', text: 'Stop later' },
    ]);

    await backend.stop(session.sessionId);

    expect(client.request).toHaveBeenCalledWith('turn/interrupt', {
      threadId: 'thread-1',
      turnId: 'turn-1',
    });
  });

  it('interrupts active turns on dispose without disposing shared process', async () => {
    const { backend, unsubscribe, serverDispose, client } = createBackend();
    await backend.start(createConfig(), [{ type: 'text', text: 'Hello' }]);

    await backend.dispose();

    expect(client.request).toHaveBeenCalledWith('turn/interrupt', {
      threadId: 'thread-1',
      turnId: 'turn-1',
    });
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(serverDispose).not.toHaveBeenCalled();
  });
});

function createBackend(
  options: {
    persistRaw?: AgentTaskContext['persistRaw'];
    threadResult?: unknown;
    turnResult?: unknown;
    updateRaw?: AgentTaskContext['updateRaw'];
  } = {},
) {
  let notificationListener:
    | ((message: { method: string; params?: unknown }) => void)
    | null = null;
  const unsubscribe = vi.fn();
  const request = vi.fn(async (method: string) => {
    if (method === 'thread/start' || method === 'thread/resume') {
      return (
        options.threadResult ?? { thread: { id: 'thread-1' }, id: 'thread-1' }
      );
    }
    if (method === 'turn/start') {
      return options.turnResult ?? { turn: { id: 'turn-1' }, id: 'turn-1' };
    }
    return {};
  });
  const client = {
    request,
    onNotification: vi.fn((listener) => {
      notificationListener = listener;
      return unsubscribe;
    }),
  };
  const serverDispose = vi.fn(async () => undefined);
  mocks.getOrCreateCodexAppServer.mockResolvedValue({
    client,
    dispose: serverDispose,
  });
  const persistRaw =
    options.persistRaw ??
    vi.fn<AgentTaskContext['persistRaw']>(async ({ messageIndex }) =>
      messageIndex === 7 ? 'raw-1' : `raw-${messageIndex - 6}`,
    );
  const backend = new CodexBackend({
    taskId: 'task-1',
    sessionStartIndex: 7,
    persistRaw,
    updateRaw: options.updateRaw,
  });

  return {
    backend,
    client,
    emitNotification: (message: { method: string; params?: unknown }) => {
      notificationListener?.(message);
    },
    persistRaw,
    serverDispose,
    unsubscribe,
  };
}

function createConfig(
  overrides: Partial<AgentBackendConfig> = {},
): AgentBackendConfig {
  return {
    type: 'codex',
    cwd: '/tmp/project',
    interactionMode: 'ask',
    model: 'default',
    ...overrides,
  };
}
