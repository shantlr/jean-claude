import { nanoid } from 'nanoid';

import type {
  AgentBackend,
  AgentBackendConfig,
  AgentEvent,
  AgentSession,
  AgentTaskContext,
  NormalizedPermissionResponse,
  PromptPart,
} from '@shared/agent-backend-types';
import type { InteractionMode } from '@shared/types';

import { getOrCreateCodexAppServer } from './codex-app-server';
import type { CodexJsonRpcNotification } from './codex-json-rpc-client';
import {
  createCodexNormalizationContext,
  normalizeCodexNotification,
  type CodexNormalizationContext,
} from './normalize-codex-message-v2';

const CODEX_IDLE_COMPLETION_TIMEOUT_MS = 60_000;

class AsyncEventChannel<T> {
  private queue: T[] = [];
  private waiter: ((value: IteratorResult<T>) => void) | null = null;
  private closed = false;

  push(item: T) {
    if (this.closed) return;
    if (this.waiter) {
      const resolve = this.waiter;
      this.waiter = null;
      resolve({ value: item, done: false });
    } else {
      this.queue.push(item);
    }
  }

  close() {
    this.closed = true;
    if (this.waiter) {
      const resolve = this.waiter;
      this.waiter = null;
      resolve({ value: undefined as unknown as T, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        if (this.queue.length > 0) {
          return Promise.resolve({
            value: this.queue.shift()!,
            done: false as const,
          });
        }
        if (this.closed) {
          return Promise.resolve({
            value: undefined as unknown as T,
            done: true as const,
          });
        }
        return new Promise<IteratorResult<T>>((resolve) => {
          this.waiter = resolve;
        });
      },
    };
  }
}

type CodexSessionState = {
  sessionId: string;
  threadId: string | null;
  turnId: string | null;
  eventChannel: AsyncEventChannel<AgentEvent>;
  normalizationCtx: CodexNormalizationContext;
  messageIndex: number;
  unsubscribe: (() => void) | null;
  processing: Promise<void>;
  closed: boolean;
  pendingItemIds: Set<string>;
  sawTurnActivity: boolean;
  idleCompletionTimer: ReturnType<typeof setTimeout> | null;
  rawDeltaRows: Map<
    string,
    {
      rowId: string;
      notification: CodexDeltaNotification;
    }
  >;
};

type CodexDeltaNotification = {
  method: 'item/agentMessage/delta' | 'item/commandExecution/outputDelta';
  params: {
    threadId?: string;
    turnId?: string;
    itemId: string;
    delta: string;
  };
};

export class CodexBackend implements AgentBackend {
  private readonly sessions = new Map<string, CodexSessionState>();

  constructor(private readonly taskContext: AgentTaskContext) {}

  async start(
    config: AgentBackendConfig,
    parts: PromptPart[],
  ): Promise<AgentSession> {
    const sessionKey = nanoid();
    const session: CodexSessionState = {
      sessionId: sessionKey,
      threadId: null,
      turnId: null,
      eventChannel: new AsyncEventChannel<AgentEvent>(),
      normalizationCtx: createCodexNormalizationContext(),
      messageIndex: this.taskContext.sessionStartIndex,
      unsubscribe: null,
      processing: Promise.resolve(),
      closed: false,
      pendingItemIds: new Set(),
      sawTurnActivity: false,
      idleCompletionTimer: null,
      rawDeltaRows: new Map(),
    };
    session.normalizationCtx.model =
      config.model === 'default' ? undefined : config.model;
    this.sessions.set(sessionKey, session);

    try {
      const { client } = await getOrCreateCodexAppServer();
      const threadResult = config.sessionId
        ? await client.request('thread/resume', { threadId: config.sessionId })
        : await client.request('thread/start', {
            cwd: config.cwd,
            model: config.model === 'default' ? undefined : config.model,
            approvalPolicy: toCodexApprovalPolicy(config.interactionMode),
            sandbox: toCodexSandbox(config.interactionMode),
            serviceName: 'jean_claude',
          });

      session.threadId =
        idFromResult(threadResult, 'thread') ?? config.sessionId ?? null;
      if (session.threadId === null) {
        throw new Error('Codex thread/start did not return a thread id');
      }
      session.normalizationCtx.emittedSessionIds.add(session.threadId);
      session.eventChannel.push({
        type: 'session-id',
        sessionId: session.threadId,
      });

      session.unsubscribe = client.onNotification((notification) => {
        this.enqueueNotification(session, notification);
      });

      const turnResult = await client.request('turn/start', {
        threadId: session.threadId,
        input: partsToCodexInput(parts),
        model: config.model === 'default' ? undefined : config.model,
      });
      session.turnId = idFromResult(turnResult, 'turn');
      if (session.turnId === null) {
        throw new Error('Codex turn/start did not return a turn id');
      }

      return {
        sessionId: sessionKey,
        events: session.eventChannel,
      };
    } catch (error) {
      this.cleanupSession(sessionKey, session);
      throw error;
    }
  }

  async stop(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    try {
      await this.interruptSession(session);
    } finally {
      this.cleanupSession(sessionId, session);
    }
  }

  async respondToPermission(
    _sessionId: string,
    _requestId: string,
    _response: NormalizedPermissionResponse,
  ): Promise<void> {}

  async respondToQuestion(
    _sessionId: string,
    _requestId: string,
    _answer: Record<string, string>,
  ): Promise<void> {}

  async setMode(_sessionId: string, _mode: InteractionMode): Promise<void> {}

  async dispose(): Promise<void> {
    await Promise.all(
      Array.from(this.sessions.keys()).map((sessionId) => this.stop(sessionId)),
    );
  }

  private async interruptSession(session: CodexSessionState): Promise<void> {
    if (session.threadId === null || session.turnId === null) {
      return;
    }

    const { client } = await getOrCreateCodexAppServer();
    await client.request('turn/interrupt', {
      threadId: session.threadId,
      turnId: session.turnId,
    });
  }

  private async handleNotification(
    session: CodexSessionState,
    notification: CodexJsonRpcNotification,
  ): Promise<void> {
    if (session.closed || !notificationMatchesSession(notification, session)) {
      return;
    }
    this.clearIdleCompletionTimer(session);

    let rawMessageId: string;
    try {
      rawMessageId = await this.persistRawNotification(session, notification);
    } catch (error) {
      if (!session.closed) {
        session.eventChannel.push({
          type: 'error',
          error: `Failed to persist Codex raw notification: ${errorMessage(error)}`,
        });
        this.cleanupSession(session.sessionId, session);
      }
      return;
    }

    if (session.closed) return;

    const normalized = normalizeCodexNotification(
      {
        method: notification.method,
        params: record(notification.params),
      },
      session.normalizationCtx,
    );
    updateItemTracking(session, notification);
    if (normalized.length === 0) {
      this.scheduleIdleCompletionIfNeeded(session);
      return;
    }

    for (const event of normalized) {
      if (session.closed) return;

      if (event.type === 'entry') {
        session.eventChannel.push({ ...event, rawMessageId });
      } else {
        session.eventChannel.push(event as AgentEvent);
      }

      if (event.type === 'complete') {
        session.turnId = null;
        this.cleanupSession(session.sessionId, session);
        return;
      }
    }

    this.scheduleIdleCompletionIfNeeded(session);
  }

  private enqueueNotification(
    session: CodexSessionState,
    notification: CodexJsonRpcNotification,
  ): void {
    if (session.closed) return;

    session.processing = session.processing
      .catch(() => undefined)
      .then(() => this.handleNotification(session, notification))
      .catch((error: unknown) => {
        if (!session.closed) {
          session.eventChannel.push({
            type: 'error',
            error: `Codex notification processing failed: ${errorMessage(error)}`,
          });
        }
      });
  }

  private async persistRawNotification(
    session: CodexSessionState,
    notification: CodexJsonRpcNotification,
  ): Promise<string> {
    const mergedDeltaId = await this.persistMergedDelta(session, notification);
    if (mergedDeltaId !== null) return mergedDeltaId;

    const messageIndex = session.messageIndex++;
    return this.taskContext.persistRaw({
      messageIndex,
      backendSessionId: session.threadId,
      rawData: notification,
    });
  }

  private async persistMergedDelta(
    session: CodexSessionState,
    notification: CodexJsonRpcNotification,
  ): Promise<string | null> {
    if (
      !this.taskContext.updateRaw ||
      !isCodexDeltaNotification(notification)
    ) {
      return null;
    }

    const key = getCodexDeltaPersistenceKey(notification);
    const existing = session.rawDeltaRows.get(key);
    if (!existing) {
      const messageIndex = session.messageIndex++;
      const rowId = await this.taskContext.persistRaw({
        messageIndex,
        backendSessionId: session.threadId,
        rawData: notification,
      });
      session.rawDeltaRows.set(key, {
        rowId,
        notification: cloneCodexDeltaNotification(notification),
      });
      return rowId;
    }

    existing.notification = {
      ...existing.notification,
      params: {
        ...existing.notification.params,
        delta: existing.notification.params.delta + notification.params.delta,
      },
    };
    await this.taskContext.updateRaw({
      rowId: existing.rowId,
      rawData: existing.notification,
    });
    return existing.rowId;
  }

  private cleanupSession(sessionId: string, session: CodexSessionState): void {
    if (session.closed) return;
    session.closed = true;
    this.clearIdleCompletionTimer(session);
    session.unsubscribe?.();
    session.unsubscribe = null;
    session.eventChannel.close();
    this.sessions.delete(sessionId);
  }

  private scheduleIdleCompletionIfNeeded(session: CodexSessionState): void {
    if (
      session.closed ||
      session.turnId === null ||
      !session.sawTurnActivity ||
      session.pendingItemIds.size > 0 ||
      session.idleCompletionTimer !== null
    ) {
      return;
    }

    session.idleCompletionTimer = setTimeout(() => {
      session.idleCompletionTimer = null;
      if (
        session.closed ||
        session.turnId === null ||
        session.pendingItemIds.size > 0
      ) {
        return;
      }

      session.turnId = null;
      session.eventChannel.push({
        type: 'complete',
        result: { isError: false, model: session.normalizationCtx.model },
      });
      this.cleanupSession(session.sessionId, session);
    }, CODEX_IDLE_COMPLETION_TIMEOUT_MS);
    session.idleCompletionTimer.unref?.();
  }

  private clearIdleCompletionTimer(session: CodexSessionState): void {
    if (session.idleCompletionTimer === null) return;
    clearTimeout(session.idleCompletionTimer);
    session.idleCompletionTimer = null;
  }
}

function partsToCodexInput(parts: PromptPart[]): unknown[] {
  return parts.flatMap<unknown>((part) => {
    if (part.type === 'text') return [{ type: 'text', text: part.text }];
    if (part.type === 'image') {
      return [{ type: 'image', data: part.data, mimeType: part.mimeType }];
    }
    return [{ type: 'text', text: `Attached file: ${part.filePath}` }];
  });
}

function toCodexApprovalPolicy(mode: InteractionMode): string {
  if (mode === 'auto') return 'never';
  return 'on-request';
}

function toCodexSandbox(mode: InteractionMode): string {
  if (mode === 'plan') return 'read-only';
  return 'workspace-write';
}

function idFromResult(result: unknown, key: string): string | null {
  const data = record(result);
  const nested = record(data?.[key]);
  return (
    stringOrNull(nested?.id) ??
    stringOrNull(data?.id) ??
    stringOrNull(data?.[`${key}Id`])
  );
}

function threadIdFromNotification(
  notification: CodexJsonRpcNotification,
): string | null {
  const params = record(notification.params);
  const thread = record(params?.thread);
  return (
    stringOrNull(params?.threadId) ??
    stringOrNull(thread?.id) ??
    (notification.method === 'thread/started' ? stringOrNull(params?.id) : null)
  );
}

function turnIdFromNotification(
  notification: CodexJsonRpcNotification,
): string | null {
  const params = record(notification.params);
  const turn = record(params?.turn);
  return stringOrNull(params?.turnId) ?? stringOrNull(turn?.id);
}

function notificationMatchesSession(
  notification: CodexJsonRpcNotification,
  session: CodexSessionState,
): boolean {
  const threadId = threadIdFromNotification(notification);
  const turnId = turnIdFromNotification(notification);
  let hasScope = false;

  if (threadId !== null) {
    if (session.threadId !== null && threadId !== session.threadId) {
      return false;
    }
    hasScope = true;
  }

  if (turnId !== null) {
    if (session.turnId === null && threadId === null) {
      return false;
    }
    if (session.turnId !== null && turnId !== session.turnId) {
      return false;
    }
    hasScope = true;
  }

  return hasScope || !requiresSessionScope(notification.method);
}

function requiresSessionScope(method: string): boolean {
  return (
    method.startsWith('item/') ||
    method === 'turn/completed' ||
    method === 'thread/status/changed'
  );
}

function updateItemTracking(
  session: CodexSessionState,
  notification: CodexJsonRpcNotification,
): void {
  if (
    notification.method !== 'item/started' &&
    notification.method !== 'item/completed'
  ) {
    return;
  }

  const params = record(notification.params);
  const item = record(params?.item);
  const itemId = stringOrNull(item?.id) ?? stringOrNull(params?.itemId);
  if (itemId === null) return;

  session.sawTurnActivity = true;
  if (notification.method === 'item/started') {
    session.pendingItemIds.add(itemId);
  } else {
    session.pendingItemIds.delete(itemId);
  }
}

function isCodexDeltaNotification(
  notification: CodexJsonRpcNotification,
): notification is CodexDeltaNotification {
  if (
    notification.method !== 'item/agentMessage/delta' &&
    notification.method !== 'item/commandExecution/outputDelta'
  ) {
    return false;
  }

  const params = record(notification.params);
  return typeof params?.itemId === 'string' && typeof params.delta === 'string';
}

function getCodexDeltaPersistenceKey(
  notification: CodexDeltaNotification,
): string {
  const { threadId, turnId, itemId } = notification.params;
  return [notification.method, threadId ?? '', turnId ?? '', itemId].join('::');
}

function cloneCodexDeltaNotification(
  notification: CodexDeltaNotification,
): CodexDeltaNotification {
  return {
    method: notification.method,
    params: { ...notification.params },
  };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
