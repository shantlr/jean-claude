import type { Part } from '@opencode-ai/sdk/v2';
import { describe, expect, it, vi } from 'vitest';

import type { AgentEvent } from '@shared/agent-backend-types';

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
    normalizationCtx: {
      emittedEntryIds: new Set(),
      rawMessages: new Map(),
      rawParts: new Map(),
      sessionStartTime: Date.now(),
      totalCost: 0,
    },
    messageIndex: 0,
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
