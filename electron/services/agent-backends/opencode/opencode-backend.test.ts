import type { AssistantMessage, Part } from '@opencode-ai/sdk/v2';
import { describe, expect, it, vi } from 'vitest';

import type { AgentEvent, AgentTaskContext } from '@shared/agent-backend-types';

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
    expect(state.normalizationCtx.totalUsage).toEqual(state.totalUsage);
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
    expect(state.normalizationCtx.totalUsage).toBeUndefined();
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
        properties: { sessionID: 'session-1' },
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
    normalizationCtx: {
      emittedEntryIds: new Set(),
      rawMessages: new Map(),
      rawParts: new Map(),
      sessionStartTime: Date.now(),
      totalCost: 0,
      totalApiCost: 0,
      totalUsage: undefined,
    },
    messageIndex: 0,
    rawDeltaRows: new Map(),
    emittedQuestionRequestIds: new Set(),
    permissionRules: [],
    serverHandle: {
      client,
      server: { url: 'http://127.0.0.1', close: vi.fn() },
    },
    ownsServerHandle: false,
    serverClosed: false,
  };
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
