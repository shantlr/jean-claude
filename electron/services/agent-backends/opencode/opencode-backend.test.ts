import { EventEmitter } from 'node:events';

import type { AssistantMessage, Part } from '@opencode-ai/sdk/v2';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AgentEvent, AgentTaskContext } from '@shared/agent-backend-types';

const createOpencodeClientMock = vi.hoisted(() => vi.fn());
const spawnMock = vi.hoisted(() => vi.fn());
const spawnSyncMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  spawn: spawnMock,
  spawnSync: spawnSyncMock,
}));

vi.mock('@opencode-ai/sdk/v2', () => ({
  createOpencodeClient: createOpencodeClientMock,
}));

vi.mock('../../../database/repositories', () => ({
  RawMessageRepository: {
    compactOpenCodeRawMessagesForTask: vi.fn(),
  },
}));

vi.mock('../../../lib/debug', () => ({
  dbg: {
    agent: vi.fn(),
    agentPermission: vi.fn(),
  },
}));

import { OpenCodeBackend } from './opencode-backend';
import { applyDeltaToMessageParts } from './opencode-message-delta';

afterEach(() => {
  createOpencodeClientMock.mockReset();
  spawnMock.mockReset();
  spawnSyncMock.mockReset();
  vi.restoreAllMocks();
});

function createMockProcess(pid = 1234) {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    pid: number;
    exitCode: number | null;
    signalCode: string | null;
    kill: ReturnType<typeof vi.fn>;
  };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.pid = pid;
  proc.exitCode = null;
  proc.signalCode = null;
  proc.kill = vi.fn(() => true);
  return proc;
}

function mockOpencodeServer(client: unknown, pid = 1234) {
  const proc = createMockProcess(pid);
  spawnMock.mockReturnValue(proc);
  createOpencodeClientMock.mockReturnValue(client);
  queueMicrotask(() => {
    proc.stdout.emit(
      'data',
      Buffer.from('opencode server listening on http://127.0.0.1:4321\n'),
    );
  });
  return proc;
}

describe('applyDeltaToMessageParts', () => {
  it('appends a text delta once for a matching part', () => {
    const parts = [
      {
        id: 'text-1',
        messageID: 'msg-1',
        sessionID: 'session-1',
        type: 'text',
        text: 'Hello',
      },
    ] as Part[];

    applyDeltaToMessageParts(parts, {
      partID: 'text-1',
      field: 'text',
      delta: ' world',
    });

    expect(parts[0]).toMatchObject({ text: 'Hello world' });
  });
});

describe('OpenCodeBackend event stream', () => {
  it('exposes dedicated server process PID on start', async () => {
    const processKill = vi.spyOn(process, 'kill').mockReturnValue(true);
    const client = {
      event: { subscribe: vi.fn() },
      permission: { reply: vi.fn() },
      question: { reply: vi.fn() },
      session: {
        abort: vi.fn(async () => ({ data: null })),
        create: vi.fn(async () => ({
          data: { id: 'session-1' },
        })),
      },
    };
    const proc = mockOpencodeServer(client, 1234);
    const backend = new OpenCodeBackend({
      taskId: 'task-1',
      sessionStartIndex: 0,
      persistRaw: vi.fn(async () => 'raw-1'),
    });

    const session = await backend.start(
      {
        type: 'opencode',
        cwd: '/tmp/project',
        interactionMode: 'auto',
      },
      [{ type: 'text', text: 'hi' }],
    );

    expect(session.rootPid).toBe(1234);
    expect(spawnMock).toHaveBeenCalledWith(
      'opencode',
      ['serve', '--hostname=127.0.0.1', '--port=0'],
      expect.objectContaining({
        detached: process.platform !== 'win32',
        env: expect.objectContaining({ OPENCODE_CONFIG_CONTENT: '{}' }),
      }),
    );
    expect(createOpencodeClientMock).toHaveBeenCalledWith({
      baseUrl: 'http://127.0.0.1:4321',
    });
    expect(proc.stdout.listenerCount('data')).toBeGreaterThan(0);
    expect(proc.stderr.listenerCount('data')).toBeGreaterThan(0);
    await backend.stop(session.sessionId);
    expect(proc.stdout.listenerCount('data')).toBe(0);
    expect(proc.stderr.listenerCount('data')).toBe(0);
    if (process.platform === 'win32') {
      expect(spawnSyncMock).toHaveBeenCalledWith(
        'taskkill',
        ['/pid', '1234', '/T', '/F'],
        { windowsHide: true },
      );
    } else {
      expect(processKill).toHaveBeenCalledWith(-1234, 'SIGTERM');
    }
    expect(proc.kill).not.toHaveBeenCalled();
  });

  it('closes dedicated server when session creation fails', async () => {
    const processKill = vi.spyOn(process, 'kill').mockReturnValue(true);
    const client = {
      session: {
        create: vi.fn(async () => {
          throw new Error('session create failed');
        }),
      },
    };
    mockOpencodeServer(client);
    const backend = new OpenCodeBackend({
      taskId: 'task-1',
      sessionStartIndex: 0,
      persistRaw: vi.fn(async () => 'raw-1'),
    });

    await expect(
      backend.start(
        {
          type: 'opencode',
          cwd: '/tmp/project',
          interactionMode: 'auto',
        },
        [{ type: 'text', text: 'hi' }],
      ),
    ).rejects.toThrow('session create failed');

    if (process.platform === 'win32') {
      expect(spawnSyncMock).toHaveBeenCalledOnce();
    } else {
      expect(processKill).toHaveBeenCalledWith(-1234, 'SIGTERM');
    }
  });

  it('rejects OpenCode runtime MCP env values instead of serializing them into OPENCODE_CONFIG_CONTENT', async () => {
    const backend = new OpenCodeBackend({
      taskId: 'task-1',
      sessionStartIndex: 0,
      persistRaw: vi.fn(async () => 'raw-1'),
    });

    await expect(
      backend.start(
        {
          type: 'opencode',
          cwd: '/tmp/project',
          interactionMode: 'auto',
          mcpServers: {
            secret: {
              command: 'node',
              args: ['server.js'],
              env: { TOKEN: 'secret-token' },
            },
          },
        },
        [{ type: 'text', text: 'hi' }],
      ),
    ).rejects.toThrow(
      'OpenCode runtime MCP server "secret" cannot include env values',
    );

    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('updates one raw row for repeated OpenCode text deltas', async () => {
    const rawIds = ['raw-1', 'raw-2'];
    const persistRaw = vi.fn<AgentTaskContext['persistRaw']>(
      async () => rawIds.shift() ?? 'raw-unexpected',
    );
    const updateRaw = vi.fn(async () => undefined);
    const backend = new OpenCodeBackend({
      taskId: 'task-1',
      sessionStartIndex: 0,
      persistRaw,
      updateRaw,
    });
    const state = createOpenCodeState({});

    const firstId = await persistRawForMessageForTest(backend, state, {
      type: 'message.part.delta',
      properties: {
        sessionID: 'session-1',
        messageID: 'msg-1',
        partID: 'part-1',
        field: 'text',
        delta: 'hello',
      },
    });
    const secondId = await persistRawForMessageForTest(backend, state, {
      type: 'message.part.delta',
      properties: {
        sessionID: 'session-1',
        messageID: 'msg-1',
        partID: 'part-1',
        field: 'text',
        delta: ' world',
      },
    });
    const statusId = await persistRawForMessageForTest(backend, state, {
      type: 'session.status',
      properties: { sessionID: 'session-1' },
    });

    expect(firstId).toBe('raw-1');
    expect(secondId).toBe('raw-1');
    expect(statusId).toBe('raw-2');
    expect(persistRaw).toHaveBeenCalledTimes(2);
    expect(updateRaw).toHaveBeenCalledWith({
      rowId: 'raw-1',
      rawData: {
        type: 'message.part.delta',
        properties: {
          sessionID: 'session-1',
          messageID: 'msg-1',
          partID: 'part-1',
          field: 'text',
          delta: 'hello world',
        },
      },
    });
    expect(updateRaw).toHaveBeenCalledOnce();
    expect(state.messageIndex).toBe(2);
  });

  it('aggregates OpenCode token usage without double-counting message updates', () => {
    const backend = new OpenCodeBackend({
      taskId: 'task-1',
      sessionStartIndex: 0,
      persistRaw: vi.fn(async () => 'raw-1'),
    });
    const state = createOpenCodeState({});
    const info = {
      id: 'msg-1',
      sessionID: 'session-1',
      role: 'assistant',
      providerID: 'openai',
      modelID: 'gpt-5.4',
      time: { created: Date.now(), completed: Date.now() },
      cost: 0.25,
      tokens: {
        input: 10,
        output: 5,
        reasoning: 0,
        cache: { read: 3, write: 2 },
      },
    } as AssistantMessage;

    mapEventForTest(backend, state, {
      type: 'message.updated',
      properties: { info },
    });
    mapEventForTest(backend, state, {
      type: 'message.updated',
      properties: { info },
    });

    expect(state.totalCost).toBe(0.25);
    expect(state.totalUsage).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      cacheReadTokens: 3,
      cacheCreationTokens: 2,
    });
    expect(state.contextUsage).toEqual(state.totalUsage);
    expect(state.normalizationCtx.totalUsage).toEqual(state.totalUsage);
    expect(state.normalizationCtx.contextUsage).toEqual(state.contextUsage);
  });

  it('uses API cost when OpenCode reports subscription cost as zero', () => {
    const backend = new OpenCodeBackend({
      taskId: 'task-1',
      sessionStartIndex: 0,
      persistRaw: vi.fn(async () => 'raw-1'),
    });
    const state = createOpenCodeState({});
    const info = {
      id: 'msg-1',
      sessionID: 'session-1',
      role: 'assistant',
      providerID: 'openai',
      modelID: 'gpt-5.4',
      time: { created: Date.now(), completed: Date.now() },
      cost: 0,
      tokens: {
        input: 10,
        output: 5,
        reasoning: 0,
        cache: { read: 3, write: 2 },
      },
    } as AssistantMessage;

    mapEventForTest(backend, state, {
      type: 'message.updated',
      properties: { info },
    });

    expect(state.totalCost).toBe(0);
    expect(state.totalApiCost).toBeCloseTo(0.00010075);
  });

  it('does not estimate API cost when OpenCode cost is missing', () => {
    const backend = new OpenCodeBackend({
      taskId: 'task-1',
      sessionStartIndex: 0,
      persistRaw: vi.fn(async () => 'raw-1'),
    });
    const state = createOpenCodeState({});
    const info = {
      id: 'msg-1',
      sessionID: 'session-1',
      role: 'assistant',
      providerID: 'openai',
      modelID: 'gpt-5.4',
      time: { created: Date.now(), completed: Date.now() },
      tokens: {
        input: 10,
        output: 5,
        reasoning: 0,
        cache: { read: 3, write: 2 },
      },
    } as AssistantMessage;

    mapEventForTest(backend, state, {
      type: 'message.updated',
      properties: { info },
    });

    expect(state.totalCost).toBe(0);
    expect(state.totalApiCost).toBe(0);
  });

  it('does not emit API cost when any message has actual cost', () => {
    const backend = new OpenCodeBackend({
      taskId: 'task-1',
      sessionStartIndex: 0,
      persistRaw: vi.fn(async () => 'raw-1'),
    });
    const state = createOpenCodeState({});
    const zeroCostInfo = {
      id: 'msg-1',
      sessionID: 'session-1',
      role: 'assistant',
      providerID: 'openai',
      modelID: 'gpt-5.4',
      time: { created: Date.now(), completed: Date.now() },
      cost: 0,
      tokens: {
        input: 10,
        output: 5,
        reasoning: 0,
        cache: { read: 3, write: 2 },
      },
    } as AssistantMessage;
    const paidInfo = {
      ...zeroCostInfo,
      id: 'msg-2',
      cost: 0.25,
    } as AssistantMessage;

    mapEventForTest(backend, state, {
      type: 'message.updated',
      properties: { info: zeroCostInfo },
    });
    mapEventForTest(backend, state, {
      type: 'message.updated',
      properties: { info: paidInfo },
    });

    expect(state.totalCost).toBe(0.25);
    expect(state.totalApiCost).toBe(0);
    expect(state.normalizationCtx.totalApiCost).toBe(0);
  });

  it('removes token usage when OpenCode removes an assistant message', () => {
    const backend = new OpenCodeBackend({
      taskId: 'task-1',
      sessionStartIndex: 0,
      persistRaw: vi.fn(async () => 'raw-1'),
    });
    const state = createOpenCodeState({});
    const info = {
      id: 'msg-1',
      sessionID: 'session-1',
      role: 'assistant',
      providerID: 'openai',
      modelID: 'gpt-5.4',
      time: { created: Date.now(), completed: Date.now() },
      cost: 0.25,
      tokens: {
        input: 10,
        output: 5,
        reasoning: 0,
        cache: { read: 3, write: 2 },
      },
    } as AssistantMessage;

    mapEventForTest(backend, state, {
      type: 'message.updated',
      properties: { info },
    });
    mapEventForTest(backend, state, {
      type: 'message.removed',
      properties: { messageID: 'msg-1' },
    });

    expect(state.totalCost).toBe(0);
    expect(state.totalApiCost).toBe(0);
    expect(state.totalUsage).toBeUndefined();
    expect(state.contextUsage).toBeUndefined();
    expect(state.normalizationCtx.totalUsage).toBeUndefined();
    expect(state.normalizationCtx.contextUsage).toBeUndefined();
  });

  it('emits latest assistant usage instead of cumulative usage', async () => {
    const olderInfo = {
      id: 'msg-1',
      sessionID: 'session-1',
      role: 'assistant',
      providerID: 'openai',
      modelID: 'gpt-5.4',
      time: { created: 1, completed: 1 },
      cost: 0.1,
      tokens: {
        input: 10,
        output: 5,
        reasoning: 2,
        cache: { read: 3, write: 2 },
        total: 22,
      },
    } as AssistantMessage;
    const latestInfo = {
      id: 'msg-2',
      sessionID: 'session-1',
      role: 'assistant',
      providerID: 'openai',
      modelID: 'gpt-5.4',
      time: { created: 2, completed: 2 },
      cost: 0.25,
      tokens: {
        input: 20,
        output: 7,
        reasoning: 4,
        cache: { read: 6, write: 1 },
        total: 38,
      },
    } as AssistantMessage;

    async function* olderMessageStream() {
      yield {
        type: 'message.updated',
        properties: { info: olderInfo },
      };
    }

    const client = {
      event: {
        subscribe: vi.fn(async () => ({ stream: olderMessageStream() })),
      },
      session: {
        prompt: vi.fn(async () => ({ data: { info: latestInfo, parts: [] } })),
      },
    };
    const backend = new OpenCodeBackend({
      taskId: 'task-1',
      sessionStartIndex: 0,
      persistRaw: vi.fn(async () => 'raw-1'),
    });
    const state = createOpenCodeState(client);

    const events = await collectEvents(
      createEventStreamForTest(backend, client, state),
    );

    expect(state.totalUsage).toEqual({
      inputTokens: 30,
      outputTokens: 12,
      cacheReadTokens: 9,
      cacheCreationTokens: 3,
      reasoningTokens: 6,
      totalTokens: 60,
    });
    expect(events.at(-1)).toMatchObject({
      type: 'complete',
      result: {
        cost: { costUsd: 0.35 },
        usage: {
          inputTokens: 30,
          outputTokens: 12,
          cacheReadTokens: 9,
          cacheCreationTokens: 3,
          reasoningTokens: 6,
          totalTokens: 60,
        },
        contextUsage: {
          inputTokens: 20,
          outputTokens: 7,
          cacheReadTokens: 6,
          cacheCreationTokens: 1,
          reasoningTokens: 4,
          totalTokens: 38,
        },
      },
    });
  });

  it('uses latest assistant usage for session idle results', () => {
    const backend = new OpenCodeBackend({
      taskId: 'task-1',
      sessionStartIndex: 0,
      persistRaw: vi.fn(async () => 'raw-1'),
    });
    const state = createOpenCodeState({});

    mapEventForTest(backend, state, {
      type: 'message.updated',
      properties: {
        info: {
          id: 'msg-1',
          sessionID: 'session-1',
          role: 'assistant',
          providerID: 'openai',
          modelID: 'gpt-5.4',
          time: { created: 1, completed: 1 },
          cost: 0.1,
          tokens: {
            input: 10,
            output: 5,
            reasoning: 0,
            cache: { read: 3, write: 2 },
          },
        } as AssistantMessage,
      },
    });
    mapEventForTest(backend, state, {
      type: 'message.updated',
      properties: {
        info: {
          id: 'msg-2',
          sessionID: 'session-1',
          role: 'assistant',
          providerID: 'openai',
          modelID: 'gpt-5.4',
          time: { created: 2, completed: 2 },
          cost: 0.2,
          tokens: {
            input: 20,
            output: 7,
            reasoning: 0,
            cache: { read: 6, write: 1 },
          },
        } as AssistantMessage,
      },
    });

    const events = mapEventForTest(backend, state, {
      type: 'session.idle',
      properties: { sessionID: 'session-1' },
    });

    expect(events).toMatchObject([
      {
        type: 'complete',
        result: {
          usage: {
            inputTokens: 30,
            outputTokens: 12,
            cacheReadTokens: 9,
            cacheCreationTokens: 3,
          },
          contextUsage: {
            inputTokens: 20,
            outputTokens: 7,
            cacheReadTokens: 6,
            cacheCreationTokens: 1,
          },
        },
      },
    ]);
  });

  it('does not use child assistant usage for parent context usage', async () => {
    const parentInfo = {
      id: 'msg-1',
      sessionID: 'session-1',
      role: 'assistant',
      providerID: 'openai',
      modelID: 'gpt-5.4',
      time: { created: 1, completed: 1 },
      cost: 0.1,
      tokens: {
        input: 10,
        output: 5,
        reasoning: 0,
        cache: { read: 3, write: 2 },
      },
    } as AssistantMessage;
    const childInfo = {
      id: 'child-msg-1',
      sessionID: 'child-session',
      role: 'assistant',
      providerID: 'openai',
      modelID: 'gpt-5.4',
      time: { created: 2, completed: 2 },
      cost: 0.2,
      tokens: {
        input: 100,
        output: 50,
        reasoning: 0,
        cache: { read: 30, write: 20 },
      },
    } as AssistantMessage;
    async function* childMessageStream() {
      yield {
        type: 'message.updated',
        properties: { info: childInfo },
      };
    }
    const client = {
      event: {
        subscribe: vi.fn(async () => ({ stream: childMessageStream() })),
      },
      session: {
        prompt: vi.fn(async () => ({ data: { info: parentInfo, parts: [] } })),
      },
    };
    const backend = new OpenCodeBackend({
      taskId: 'task-1',
      sessionStartIndex: 0,
      persistRaw: vi.fn(async () => 'raw-1'),
    });
    const state = createOpenCodeState(client);

    state.normalizationCtx.subtaskParentToolIdsBySessionId = new Map([
      ['child-session', 'subtask-1'],
    ]);

    const events = await collectEvents(
      createEventStreamForTest(backend, client, state),
    );

    expect(events.at(-1)).toMatchObject({
      type: 'complete',
      result: {
        usage: {
          inputTokens: 110,
          outputTokens: 55,
          cacheReadTokens: 33,
          cacheCreationTokens: 22,
        },
        contextUsage: {
          inputTokens: 10,
          outputTokens: 5,
          cacheReadTokens: 3,
          cacheCreationTokens: 2,
        },
      },
    });
  });

  it('emits token usage on completed OpenCode sessions', async () => {
    async function* emptyStream() {}

    const info = {
      id: 'msg-1',
      sessionID: 'session-1',
      role: 'assistant',
      providerID: 'openai',
      modelID: 'gpt-5.4',
      time: { created: Date.now(), completed: Date.now() },
      cost: 0.25,
      tokens: {
        input: 10,
        output: 5,
        reasoning: 0,
        cache: { read: 3, write: 2 },
      },
    } as AssistantMessage;
    const client = {
      event: {
        subscribe: vi.fn(async () => ({ stream: emptyStream() })),
      },
      session: {
        prompt: vi.fn(async () => ({ data: { info, parts: [] } })),
      },
    };
    const backend = new OpenCodeBackend({
      taskId: 'task-1',
      sessionStartIndex: 0,
      persistRaw: vi.fn(async () => 'raw-1'),
    });
    const state = createOpenCodeState(client);

    const events = await collectEvents(
      createEventStreamForTest(backend, client, state),
    );

    expect(events.at(-1)).toMatchObject({
      type: 'complete',
      result: {
        isError: false,
        cost: { costUsd: 0.25 },
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          cacheReadTokens: 3,
          cacheCreationTokens: 2,
        },
        contextUsage: {
          inputTokens: 10,
          outputTokens: 5,
          cacheReadTokens: 3,
          cacheCreationTokens: 2,
        },
      },
    });
  });

  it('emits API cost on completed zero-cost OpenCode sessions', async () => {
    async function* emptyStream() {}

    const info = {
      id: 'msg-1',
      sessionID: 'session-1',
      role: 'assistant',
      providerID: 'openai',
      modelID: 'gpt-5.4',
      time: { created: Date.now(), completed: Date.now() },
      cost: 0,
      tokens: {
        input: 10,
        output: 5,
        reasoning: 0,
        cache: { read: 3, write: 2 },
      },
    } as AssistantMessage;
    const client = {
      event: {
        subscribe: vi.fn(async () => ({ stream: emptyStream() })),
      },
      session: {
        prompt: vi.fn(async () => ({ data: { info, parts: [] } })),
      },
    };
    const backend = new OpenCodeBackend({
      taskId: 'task-1',
      sessionStartIndex: 0,
      persistRaw: vi.fn(async () => 'raw-1'),
    });
    const state = createOpenCodeState(client);

    const events = await collectEvents(
      createEventStreamForTest(backend, client, state),
    );

    expect(events.at(-1)).toMatchObject({
      type: 'complete',
      result: {
        isError: false,
        cost: { costUsd: 0, apiCostUsd: expect.any(Number) },
      },
    });
  });

  it('completes after idle timeout if session.prompt never resolves', async () => {
    vi.useFakeTimers();

    async function* idleStream() {
      yield {
        type: 'session.idle',
        properties: { info: { id: 'session-1' } },
      };
      await new Promise(() => {});
    }

    const client = {
      event: {
        subscribe: vi.fn(async () => ({ stream: idleStream() })),
      },
      session: {
        prompt: vi.fn(() => new Promise(() => {})),
      },
    };
    const backend = new OpenCodeBackend({
      taskId: 'task-1',
      sessionStartIndex: 0,
      persistRaw: vi.fn(async () => 'raw-1'),
    });
    const state = createOpenCodeState(client);

    const stream = createEventStreamForTest(backend, client, state);

    try {
      const eventsPromise = collectEvents(stream);
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(3 * 60 * 1000 + 250);
      const events = await eventsPromise;

      expect(events).toMatchObject([
        { type: 'session-id', sessionId: 'session-1' },
        { type: 'complete', result: { isError: false } },
      ]);
      expect(client.session.prompt).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not complete on session.idle while waiting for permission', async () => {
    async function* idleThenErrorStream() {
      yield {
        type: 'permission.asked',
        properties: {
          id: 'permission-1',
          sessionID: 'session-1',
          permission: 'bash',
          patterns: [],
          metadata: { command: 'pwd' },
          always: [],
        },
      };
      yield {
        type: 'session.idle',
        properties: { sessionID: 'session-1' },
      };
      yield {
        type: 'session.error',
        properties: { sessionID: 'session-1', error: 'after idle' },
      };
    }

    const client = {
      event: {
        subscribe: vi.fn(async () => ({ stream: idleThenErrorStream() })),
      },
      session: {
        prompt: vi.fn(async () => {
          throw new Error('prompt failed');
        }),
      },
      permission: {
        reply: vi.fn(),
      },
    };
    const backend = new OpenCodeBackend({
      taskId: 'task-1',
      sessionStartIndex: 0,
      persistRaw: vi.fn(async () => 'raw-1'),
    });
    const state = createOpenCodeState(client);

    const stream = createEventStreamForTest(backend, client, state);
    const events = await Promise.race([
      collectEvents(stream),
      new Promise<'timeout'>((resolve) => setTimeout(resolve, 1000, 'timeout')),
    ]);

    expect(events).not.toBe('timeout');
    expect(events).toMatchObject([
      { type: 'session-id', sessionId: 'session-1' },
      {
        type: 'permission-request',
        request: { requestId: 'permission-1' },
      },
      { type: 'error' },
      { type: 'complete', result: { isError: true } },
    ]);
  });

  it('cancels idle timeout when another session event arrives', async () => {
    vi.useFakeTimers();

    async function* idleThenErrorStream() {
      yield {
        type: 'session.idle',
        properties: { sessionID: 'session-1' },
      };
      await new Promise((resolve) => setTimeout(resolve, 2 * 60 * 1000));
      yield {
        type: 'session.error',
        properties: { sessionID: 'session-1', error: 'after idle' },
      };
    }

    const client = {
      event: {
        subscribe: vi.fn(async () => ({ stream: idleThenErrorStream() })),
      },
      session: {
        prompt: vi.fn(() => new Promise(() => {})),
      },
    };
    const backend = new OpenCodeBackend({
      taskId: 'task-1',
      sessionStartIndex: 0,
      persistRaw: vi.fn(async () => 'raw-1'),
    });
    const state = createOpenCodeState(client);
    const stream = createEventStreamForTest(backend, client, state);

    try {
      const eventsPromise = collectEvents(stream);
      await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
      const events = await eventsPromise;

      expect(events).toMatchObject([
        { type: 'session-id', sessionId: 'session-1' },
        { type: 'error' },
        { type: 'complete', result: { isError: true } },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('processes an event that arrives during idle timeout settle grace', async () => {
    vi.useFakeTimers();

    async function* idleThenGraceEventStream() {
      yield {
        type: 'session.idle',
        properties: { sessionID: 'session-1' },
      };
      await new Promise((resolve) => setTimeout(resolve, 3 * 60 * 1000 + 100));
      yield {
        type: 'session.error',
        properties: { sessionID: 'session-1', error: 'near timeout' },
      };
    }

    const client = {
      event: {
        subscribe: vi.fn(async () => ({ stream: idleThenGraceEventStream() })),
      },
      session: {
        prompt: vi.fn(() => new Promise(() => {})),
      },
    };
    const backend = new OpenCodeBackend({
      taskId: 'task-1',
      sessionStartIndex: 0,
      persistRaw: vi.fn(async () => 'raw-1'),
    });
    const state = createOpenCodeState(client);
    const stream = createEventStreamForTest(backend, client, state);

    try {
      const eventsPromise = collectEvents(stream);
      await vi.advanceTimersByTimeAsync(3 * 60 * 1000 + 100);
      const events = await eventsPromise;

      expect(events).toMatchObject([
        { type: 'session-id', sessionId: 'session-1' },
        { type: 'error' },
        { type: 'complete', result: { isError: true } },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores subtask child sessions that are not owned by the parent session', async () => {
    async function* foreignSubtaskStream() {
      yield {
        type: 'message.part.updated',
        properties: {
          part: {
            id: 'foreign-subtask',
            sessionID: 'foreign-child-session',
            messageID: 'foreign-parent-msg',
            type: 'subtask',
            prompt: 'Inspect code',
            description: 'Foreign subtask',
            agent: 'general',
          },
        },
      };
      yield {
        type: 'message.updated',
        properties: {
          info: createAssistantMessageForTest({
            id: 'foreign-child-msg',
            sessionID: 'foreign-child-session',
          }),
        },
      };
    }

    const client = {
      event: {
        subscribe: vi.fn(async () => ({ stream: foreignSubtaskStream() })),
      },
      session: {
        prompt: vi.fn(async () => ({ data: null })),
      },
    };
    const backend = new OpenCodeBackend({
      taskId: 'task-1',
      sessionStartIndex: 0,
      persistRaw: vi.fn(async () => 'raw-1'),
    });
    const state = createOpenCodeState(client);

    const events = await collectEvents(
      createEventStreamForTest(backend, client, state),
    );

    expect(state.normalizationCtx.subtaskParentToolIdsBySessionId.size).toBe(0);
    expect(events).toMatchObject([
      { type: 'session-id', sessionId: 'session-1' },
      { type: 'complete', result: { isError: false } },
    ]);
  });

  it('does not treat child session lifecycle events as parent lifecycle events', async () => {
    async function* childLifecycleStream() {
      yield {
        type: 'message.updated',
        properties: {
          info: createAssistantMessageForTest({
            id: 'parent-msg',
            sessionID: 'session-1',
          }),
        },
      };
      yield {
        type: 'message.part.updated',
        properties: {
          part: {
            id: 'subtask-1',
            sessionID: 'child-session',
            messageID: 'parent-msg',
            type: 'subtask',
            prompt: 'Inspect code',
            description: 'Child subtask',
            agent: 'general',
          },
        },
      };
      yield {
        type: 'session.error',
        properties: { sessionID: 'child-session', error: 'child failed' },
      };
      yield {
        type: 'session.updated',
        properties: {
          info: {
            id: 'child-session',
            title: 'Child title',
            time: { updated: Date.now() },
          },
        },
      };
    }

    const client = {
      event: {
        subscribe: vi.fn(async () => ({ stream: childLifecycleStream() })),
      },
      session: {
        prompt: vi.fn(async () => ({ data: null })),
      },
    };
    const backend = new OpenCodeBackend({
      taskId: 'task-1',
      sessionStartIndex: 0,
      persistRaw: vi.fn(async () => 'raw-1'),
    });
    const state = createOpenCodeState(client);

    const events = await collectEvents(
      createEventStreamForTest(backend, client, state),
    );

    expect(events).toMatchObject([
      { type: 'session-id', sessionId: 'session-1' },
      { type: 'entry', entry: { type: 'tool-use', toolId: 'subtask-1' } },
      { type: 'complete', result: { isError: false } },
    ]);
    expect(events.some((event) => event.type === 'error')).toBe(false);
    expect(events.some((event) => event.type === 'session-updated')).toBe(
      false,
    );
  });

  it('accepts nested subtask events from known child sessions', async () => {
    async function* nestedSubtaskStream() {
      yield {
        type: 'message.updated',
        properties: {
          info: createAssistantMessageForTest({
            id: 'parent-msg',
            sessionID: 'session-1',
          }),
        },
      };
      yield {
        type: 'message.part.updated',
        properties: {
          part: {
            id: 'subtask-1',
            sessionID: 'child-session',
            messageID: 'parent-msg',
            type: 'subtask',
            prompt: 'Inspect code',
            description: 'Child subtask',
            agent: 'general',
          },
        },
      };
      yield {
        type: 'message.updated',
        properties: {
          info: createAssistantMessageForTest({
            id: 'child-msg',
            sessionID: 'child-session',
          }),
        },
      };
      yield {
        type: 'message.part.updated',
        properties: {
          part: {
            id: 'subtask-2',
            sessionID: 'grandchild-session',
            messageID: 'child-msg',
            type: 'subtask',
            prompt: 'Inspect nested code',
            description: 'Grandchild subtask',
            agent: 'general',
          },
        },
      };
    }

    const client = {
      event: {
        subscribe: vi.fn(async () => ({ stream: nestedSubtaskStream() })),
      },
      session: {
        prompt: vi.fn(async () => ({ data: null })),
      },
    };
    const backend = new OpenCodeBackend({
      taskId: 'task-1',
      sessionStartIndex: 0,
      persistRaw: vi.fn(async () => 'raw-1'),
    });
    const state = createOpenCodeState(client);

    const events = await collectEvents(
      createEventStreamForTest(backend, client, state),
    );

    expect(events).toMatchObject([
      { type: 'session-id', sessionId: 'session-1' },
      { type: 'entry', entry: { type: 'tool-use', toolId: 'subtask-1' } },
      {
        type: 'entry',
        entry: {
          type: 'tool-use',
          toolId: 'subtask-2',
          parentToolId: 'subtask-1',
        },
      },
      { type: 'complete', result: { isError: false } },
    ]);
  });

  it('buffers subtask parts until parent message ownership is known', async () => {
    async function* outOfOrderSubtaskStream() {
      yield {
        type: 'message.part.updated',
        properties: {
          part: {
            id: 'subtask-1',
            sessionID: 'child-session',
            messageID: 'parent-msg',
            type: 'subtask',
            prompt: 'Inspect code',
            description: 'Child subtask',
            agent: 'general',
          },
        },
      };
      yield {
        type: 'message.updated',
        properties: {
          info: createAssistantMessageForTest({
            id: 'parent-msg',
            sessionID: 'session-1',
          }),
        },
      };
      yield {
        type: 'message.updated',
        properties: {
          info: createAssistantMessageForTest({
            id: 'child-msg',
            sessionID: 'child-session',
          }),
        },
      };
      yield {
        type: 'message.part.updated',
        properties: {
          part: {
            id: 'child-text',
            sessionID: 'child-session',
            messageID: 'child-msg',
            type: 'text',
            text: 'Child answer',
          },
        },
      };
    }

    const client = {
      event: {
        subscribe: vi.fn(async () => ({ stream: outOfOrderSubtaskStream() })),
      },
      session: {
        prompt: vi.fn(async () => ({ data: null })),
      },
    };
    const backend = new OpenCodeBackend({
      taskId: 'task-1',
      sessionStartIndex: 0,
      persistRaw: vi.fn(async () => 'raw-1'),
    });
    const state = createOpenCodeState(client);

    const events = await collectEvents(
      createEventStreamForTest(backend, client, state),
    );

    expect(events).toMatchObject([
      { type: 'session-id', sessionId: 'session-1' },
      { type: 'entry', entry: { type: 'tool-use', toolId: 'subtask-1' } },
      {
        type: 'entry',
        entry: {
          type: 'assistant-message',
          parentToolId: 'subtask-1',
          value: 'Child answer',
        },
      },
      { type: 'complete', result: { isError: false } },
    ]);
  });

  it('fetches completed task child session messages when SSE only has parent task output', async () => {
    async function* completedTaskStream() {
      yield {
        type: 'message.updated',
        properties: {
          info: createAssistantMessageForTest({
            id: 'parent-msg',
            sessionID: 'session-1',
          }),
        },
      };
      yield {
        type: 'message.part.updated',
        properties: {
          sessionID: 'session-1',
          part: {
            id: 'task-part-1',
            sessionID: 'session-1',
            messageID: 'parent-msg',
            type: 'tool',
            tool: 'task',
            callID: 'call-task-1',
            state: {
              status: 'completed',
              input: {
                description: 'child scan',
                subagent_type: 'explore',
                prompt: 'Inspect code',
              },
              output:
                'task_id: child-session\n\n<task_result>Final</task_result>',
              metadata: {
                parentSessionId: 'session-1',
                sessionId: 'child-session',
              },
            },
          },
        },
      };
    }

    const client = {
      event: {
        subscribe: vi.fn(async () => ({ stream: completedTaskStream() })),
      },
      session: {
        prompt: vi.fn(async () => ({ data: null })),
        messages: vi.fn(async () => ({
          data: [
            {
              info: {
                id: 'child-user-msg',
                sessionID: 'child-session',
                role: 'user',
                time: { created: 1_717_000_000_000 },
                agent: 'build',
                model: {
                  providerID: 'github-copilot',
                  modelID: 'gpt-5.4-mini',
                },
              },
              parts: [
                {
                  id: 'child-user-text',
                  sessionID: 'child-session',
                  messageID: 'child-user-msg',
                  type: 'text',
                  text: 'Inspect code',
                },
              ],
            },
            {
              info: createAssistantMessageForTest({
                id: 'child-assistant-msg',
                sessionID: 'child-session',
              }),
              parts: [
                {
                  id: 'child-assistant-text',
                  sessionID: 'child-session',
                  messageID: 'child-assistant-msg',
                  type: 'text',
                  text: 'Child detail',
                },
              ],
            },
          ],
        })),
      },
    };
    const persistRaw = vi.fn(async () => 'raw-child');
    const backend = new OpenCodeBackend({
      taskId: 'task-1',
      sessionStartIndex: 0,
      persistRaw,
    });
    const state = createOpenCodeState(client);

    const events = await collectEvents(
      createEventStreamForTest(backend, client, state),
    );

    expect(client.session.messages).toHaveBeenCalledWith({
      sessionID: 'child-session',
      directory: '/tmp/project',
    });
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'entry',
          entry: expect.objectContaining({
            parentToolId: 'call-task-1',
            type: 'user-prompt',
            value: 'Inspect code',
          }),
        }),
        expect.objectContaining({
          type: 'entry',
          entry: expect.objectContaining({
            parentToolId: 'call-task-1',
            type: 'assistant-message',
            value: 'Child detail',
          }),
        }),
      ]),
    );
  });

  it('fetches completed task child session messages from prompt result task output', async () => {
    async function* emptyStream() {}

    const parentInfo = createAssistantMessageForTest({
      id: 'parent-msg',
      sessionID: 'session-1',
    });
    const client = {
      event: {
        subscribe: vi.fn(async () => ({ stream: emptyStream() })),
      },
      session: {
        prompt: vi.fn(async () => ({
          data: {
            info: parentInfo,
            parts: [
              createCompletedTaskPart({
                id: 'task-part-1',
                messageID: 'parent-msg',
                sessionID: 'session-1',
                callID: 'call-task-1',
                childSessionID: 'child-session',
              }),
            ],
          },
        })),
        messages: vi.fn(async () => ({
          data: [
            {
              info: createAssistantMessageForTest({
                id: 'child-assistant-msg',
                sessionID: 'child-session',
              }),
              parts: [
                {
                  id: 'child-assistant-text',
                  sessionID: 'child-session',
                  messageID: 'child-assistant-msg',
                  type: 'text',
                  text: 'Child detail from prompt result',
                },
              ],
            },
          ],
        })),
      },
    };
    const backend = new OpenCodeBackend({
      taskId: 'task-1',
      sessionStartIndex: 0,
      persistRaw: vi.fn(async () => 'raw-child'),
    });
    const state = createOpenCodeState(client);

    const events = await collectEvents(
      createEventStreamForTest(backend, client, state),
    );

    expect(client.session.messages).toHaveBeenCalledWith({
      sessionID: 'child-session',
      directory: '/tmp/project',
    });
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'entry',
          entry: expect.objectContaining({
            parentToolId: 'call-task-1',
            type: 'assistant-message',
            value: 'Child detail from prompt result',
          }),
        }),
      ]),
    );
  });

  it('recursively fetches nested completed task child session messages', async () => {
    async function* completedTaskStream() {
      yield {
        type: 'message.updated',
        properties: {
          info: createAssistantMessageForTest({
            id: 'parent-msg',
            sessionID: 'session-1',
          }),
        },
      };
      yield {
        type: 'message.part.updated',
        properties: {
          sessionID: 'session-1',
          part: createCompletedTaskPart({
            id: 'task-part-1',
            messageID: 'parent-msg',
            sessionID: 'session-1',
            callID: 'call-task-1',
            childSessionID: 'child-session',
          }),
        },
      };
    }

    const client = {
      event: {
        subscribe: vi.fn(async () => ({ stream: completedTaskStream() })),
      },
      session: {
        prompt: vi.fn(async () => ({ data: null })),
        messages: vi.fn(async ({ sessionID }: { sessionID: string }) => {
          if (sessionID === 'child-session') {
            return {
              data: [
                {
                  info: createAssistantMessageForTest({
                    id: 'child-msg',
                    sessionID: 'child-session',
                  }),
                  parts: [
                    createCompletedTaskPart({
                      id: 'nested-task-part-1',
                      messageID: 'child-msg',
                      sessionID: 'child-session',
                      callID: 'call-nested-task-1',
                      childSessionID: 'grandchild-session',
                    }),
                  ],
                },
              ],
            };
          }
          return {
            data: [
              {
                info: createAssistantMessageForTest({
                  id: 'grandchild-msg',
                  sessionID: 'grandchild-session',
                }),
                parts: [
                  {
                    id: 'grandchild-text',
                    sessionID: 'grandchild-session',
                    messageID: 'grandchild-msg',
                    type: 'text',
                    text: 'Grandchild detail',
                  },
                ],
              },
            ],
          };
        }),
      },
    };
    const backend = new OpenCodeBackend({
      taskId: 'task-1',
      sessionStartIndex: 0,
      persistRaw: vi.fn(async () => 'raw-child'),
    });
    const state = createOpenCodeState(client);

    const events = await collectEvents(
      createEventStreamForTest(backend, client, state),
    );

    expect(client.session.messages).toHaveBeenCalledWith({
      sessionID: 'child-session',
      directory: '/tmp/project',
    });
    expect(client.session.messages).toHaveBeenCalledWith({
      sessionID: 'grandchild-session',
      directory: '/tmp/project',
    });
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'entry',
          entry: expect.objectContaining({
            parentToolId: 'call-nested-task-1',
            type: 'assistant-message',
            value: 'Grandchild detail',
          }),
        }),
      ]),
    );
  });

  it('does not duplicate child entries already streamed before history fetch', async () => {
    async function* liveChildThenCompletedTaskStream() {
      yield {
        type: 'message.updated',
        properties: {
          info: createAssistantMessageForTest({
            id: 'parent-msg',
            sessionID: 'session-1',
          }),
        },
      };
      yield {
        type: 'message.part.updated',
        properties: {
          sessionID: 'session-1',
          part: createRunningTaskPart({
            id: 'task-part-1',
            messageID: 'parent-msg',
            sessionID: 'session-1',
            callID: 'call-task-1',
            childSessionID: 'child-session',
          }),
        },
      };
      yield {
        type: 'message.updated',
        properties: {
          info: createAssistantMessageForTest({
            id: 'child-msg',
            sessionID: 'child-session',
          }),
        },
      };
      yield {
        type: 'message.part.updated',
        properties: {
          sessionID: 'child-session',
          part: {
            id: 'child-text',
            sessionID: 'child-session',
            messageID: 'child-msg',
            type: 'text',
            text: 'Live child partial',
          },
        },
      };
      yield {
        type: 'message.part.updated',
        properties: {
          sessionID: 'session-1',
          part: createCompletedTaskPart({
            id: 'task-part-1',
            messageID: 'parent-msg',
            sessionID: 'session-1',
            callID: 'call-task-1',
            childSessionID: 'child-session',
          }),
        },
      };
    }

    const client = {
      event: {
        subscribe: vi.fn(async () => ({
          stream: liveChildThenCompletedTaskStream(),
        })),
      },
      session: {
        prompt: vi.fn(async () => ({ data: null })),
        messages: vi.fn(async () => ({
          data: [
            {
              info: createAssistantMessageForTest({
                id: 'child-msg',
                sessionID: 'child-session',
              }),
              parts: [
                {
                  id: 'child-text',
                  sessionID: 'child-session',
                  messageID: 'child-msg',
                  type: 'text',
                  text: 'Live child final',
                },
              ],
            },
          ],
        })),
      },
    };
    const backend = new OpenCodeBackend({
      taskId: 'task-1',
      sessionStartIndex: 0,
      persistRaw: vi.fn(async () => 'raw-child'),
    });
    const state = createOpenCodeState(client);

    const events = await collectEvents(
      createEventStreamForTest(backend, client, state),
    );
    const childTextEvents = events.filter(
      (event) =>
        (event.type === 'entry' || event.type === 'entry-update') &&
        event.entry.id === 'child-msg:child-text',
    );
    const childTextEntryEvents = childTextEvents.filter(
      (event) => event.type === 'entry',
    );

    expect(client.session.messages).toHaveBeenCalledOnce();
    expect(childTextEvents).toHaveLength(2);
    expect(childTextEntryEvents).toHaveLength(1);
    expect(childTextEvents[0]).toMatchObject({
      type: 'entry',
      entry: {
        parentToolId: 'call-task-1',
        value: 'Live child partial',
      },
    });
    expect(childTextEvents[1]).toMatchObject({
      type: 'entry-update',
      entry: {
        parentToolId: 'call-task-1',
        value: 'Live child final',
      },
    });
  });
});

function createOpenCodeState(client: unknown) {
  return {
    session: { id: 'session-1' },
    cwd: '/tmp/project',
    abortController: new AbortController(),
    messages: new Map(),
    pendingPermissions: new Map(),
    pendingQuestions: new Set(),
    startTime: Date.now(),
    totalCost: 0,
    totalApiCost: 0,
    totalUsage: undefined,
    contextUsage: undefined,
    normalizationCtx: {
      emittedEntryIds: new Set(),
      rawMessages: new Map(),
      rawParts: new Map(),
      sessionStartTime: Date.now(),
      totalCost: 0,
      totalApiCost: 0,
      totalUsage: undefined,
      contextUsage: undefined,
      subtaskParentToolIdsBySessionId: new Map<string, string>(),
    },
    messageIndex: 0,
    pendingSubtaskPartsByMessageId: new Map(),
    fetchedChildSessionIds: new Set(),
    rawDeltaRows: new Map(),
    emittedQuestionRequestIds: new Set(),
    permissionRules: [],
    serverHandle: {
      client,
      server: { url: 'http://127.0.0.1', close: vi.fn() },
    },
    ownsServerHandle: true,
    serverClosed: false,
  };
}

function createAssistantMessageForTest({
  id,
  sessionID,
}: {
  id: string;
  sessionID: string;
}): AssistantMessage {
  return {
    id,
    sessionID,
    role: 'assistant',
    providerID: 'openai',
    modelID: 'gpt-5.4',
    time: { created: Date.now(), completed: Date.now() },
    cost: 0,
    tokens: {
      input: 0,
      output: 0,
      reasoning: 0,
      cache: { read: 0, write: 0 },
    },
  } as AssistantMessage;
}

function createCompletedTaskPart({
  id,
  messageID,
  sessionID,
  callID,
  childSessionID,
}: {
  id: string;
  messageID: string;
  sessionID: string;
  callID: string;
  childSessionID: string;
}): Part {
  return {
    id,
    sessionID,
    messageID,
    type: 'tool',
    tool: 'task',
    callID,
    state: {
      status: 'completed',
      title: 'task',
      input: {
        description: 'child scan',
        subagent_type: 'explore',
        prompt: 'Inspect code',
      },
      output: `task_id: ${childSessionID}\n\n<task_result>Final</task_result>`,
      time: { start: 1_717_000_000_000, end: 1_717_000_000_500 },
      metadata: {
        parentSessionId: sessionID,
        sessionId: childSessionID,
      },
    },
  } as Part;
}

function createRunningTaskPart({
  id,
  messageID,
  sessionID,
  callID,
  childSessionID,
}: {
  id: string;
  messageID: string;
  sessionID: string;
  callID: string;
  childSessionID: string;
}): Part {
  return {
    id,
    sessionID,
    messageID,
    type: 'tool',
    tool: 'task',
    callID,
    state: {
      status: 'running',
      title: 'task',
      input: {
        description: 'child scan',
        subagent_type: 'explore',
        prompt: 'Inspect code',
      },
      time: { start: 1_717_000_000_000 },
      metadata: {
        parentSessionId: sessionID,
        sessionId: childSessionID,
      },
    },
  } as Part;
}

function mapEventForTest(
  backend: OpenCodeBackend,
  state: unknown,
  event: unknown,
) {
  return (
    backend as unknown as {
      mapEvent: (
        event: unknown,
        state: unknown,
        rawMessageId: string | null,
      ) => AgentEvent[];
    }
  ).mapEvent(event, state, null);
}

function createEventStreamForTest(
  backend: OpenCodeBackend,
  client: unknown,
  state: unknown,
) {
  return (
    backend as unknown as {
      createEventStream: (
        client: unknown,
        state: unknown,
        parts: unknown[],
        config: unknown,
      ) => AsyncGenerator<AgentEvent>;
    }
  ).createEventStream(client, state, [{ type: 'text', text: 'hi' }], {
    model: undefined,
    interactionMode: 'auto',
  });
}

async function collectEvents(stream: AsyncGenerator<AgentEvent>) {
  const events: AgentEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

function persistRawForMessageForTest(
  backend: OpenCodeBackend,
  state: unknown,
  rawData: unknown,
) {
  return (
    backend as unknown as {
      persistRawForMessage: (
        state: unknown,
        rawData: unknown,
      ) => Promise<string | null>;
    }
  ).persistRawForMessage(state, rawData);
}
