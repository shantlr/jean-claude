// OpenCode SDK adapter.
// Wraps the @opencode-ai/sdk client into the common AgentBackend interface.
//
// Architecture:
// - Uses createOpencode() to spawn a server + client on first use
// - Server is shared across all sessions (one per app instance)
// - Events received via SSE subscription, filtered by session ID
// - Permissions handled via client.postSessionIdPermissionsPermissionId()
// - Sessions created via client.session.create() + client.session.prompt()

import {
  createOpencode,
  type OpencodeClient,
  type Session as OcSession,
  type Event as OcEvent,
  type Part as OcPart,
  type Message as OcMessage,
  type AssistantMessage as OcAssistantMessage,
  type UserMessage as OcUserMessage,
  type Permission as OcPermission,
} from '@opencode-ai/sdk';

import type {
  AgentBackend,
  AgentBackendConfig,
  AgentEvent,
  AgentSession,
  NormalizedPermissionResponse,
} from '@shared/agent-backend-types';
import type { InteractionMode } from '@shared/types';

import { dbg } from '../../../lib/debug';

import {
  normalizeOpencodeMessage,
  synthesizeResultMessage,
} from './normalize-opencode-message';

// --- Server lifecycle (singleton) ---

interface ServerHandle {
  client: OpencodeClient;
  server: { url: string; close(): void };
}

let serverInstance: ServerHandle | null = null;
let serverInitPromise: Promise<ServerHandle> | null = null;

/**
 * Get or create the shared OpenCode server + client.
 * Singleton — only one server per app instance.
 */
async function getOrCreateServer(): Promise<ServerHandle> {
  if (serverInstance) return serverInstance;

  if (serverInitPromise) {
    const result = await serverInitPromise;
    if (result) return result;
  }

  serverInitPromise = (async () => {
    dbg.agent('Starting OpenCode server...');
    try {
      const instance = await createOpencode({
        timeout: 30_000,
      });
      dbg.agent('OpenCode server started at %s', instance.server.url);
      serverInstance = instance;
      return instance;
    } catch (error) {
      dbg.agent('Failed to start OpenCode server: %O', error);
      serverInitPromise = null;
      throw error;
    }
  })();

  return (await serverInitPromise)!;
}

// --- Session tracking ---

interface OpenCodeSessionState {
  /** The OpenCode session object */
  session: OcSession;
  /** Working directory for this session */
  cwd: string;
  /** Abort controller for stopping the event stream */
  abortController: AbortController;
  /** Accumulated messages for this session */
  messages: Map<string, { info: OcMessage; parts: OcPart[] }>;
  /** Pending permission requests waiting for user response */
  pendingPermissions: Map<
    string,
    {
      permission: OcPermission;
      resolve: () => void;
    }
  >;
  /** Start time for duration tracking */
  startTime: number;
  /** Accumulated cost */
  totalCost: number;
}

export class OpenCodeBackend implements AgentBackend {
  private sessions = new Map<string, OpenCodeSessionState>();

  async start(
    config: AgentBackendConfig,
    prompt: string,
  ): Promise<AgentSession> {
    const { client } = await getOrCreateServer();

    // Create or resume an OpenCode session
    let session: OcSession;

    if (config.sessionId) {
      // Try to resume existing session
      try {
        const existing = await client.session.get({
          path: { id: config.sessionId },
          query: { directory: config.cwd },
        });
        if (existing.data) {
          session = existing.data;
          dbg.agent('Resuming OpenCode session %s', session.id);
        } else {
          // Session not found, create new
          session = await this.createSession(client, config);
        }
      } catch {
        // Session not found, create new
        session = await this.createSession(client, config);
      }
    } else {
      session = await this.createSession(client, config);
    }

    const state: OpenCodeSessionState = {
      session,
      cwd: config.cwd,
      abortController: new AbortController(),
      messages: new Map(),
      pendingPermissions: new Map(),
      startTime: Date.now(),
      totalCost: 0,
    };

    this.sessions.set(session.id, state);

    // Build the event stream
    const events = this.createEventStream(client, state, prompt, config);

    return {
      sessionId: session.id,
      events,
    };
  }

  async stop(sessionId: string): Promise<void> {
    const state = this.sessions.get(sessionId);
    if (!state) return;

    state.abortController.abort();

    try {
      const { client } = await getOrCreateServer();
      await client.session.abort({
        path: { id: sessionId },
        query: { directory: state.cwd },
      });
    } catch (error) {
      dbg.agent('Error aborting OpenCode session %s: %O', sessionId, error);
    }

    // Resolve any pending permissions with rejection
    for (const [, pending] of state.pendingPermissions) {
      pending.resolve();
    }
    state.pendingPermissions.clear();

    this.sessions.delete(sessionId);
  }

  async respondToPermission(
    sessionId: string,
    requestId: string,
    response: NormalizedPermissionResponse,
  ): Promise<void> {
    const state = this.sessions.get(sessionId);
    if (!state) {
      throw new Error(`No OpenCode session: ${sessionId}`);
    }

    const { client } = await getOrCreateServer();

    // Map our normalized response to OpenCode's permission response
    let ocResponse: 'once' | 'always' | 'reject';
    if (response.behavior === 'deny') {
      ocResponse = 'reject';
    } else if (response.allowMode === 'session') {
      ocResponse = 'always';
    } else {
      ocResponse = 'once';
    }

    try {
      await client.postSessionIdPermissionsPermissionId({
        path: { id: sessionId, permissionID: requestId },
        query: { directory: state.cwd },
        body: { response: ocResponse },
      });
    } catch (error) {
      dbg.agent(
        'Error responding to OpenCode permission %s: %O',
        requestId,
        error,
      );
    }

    // Resolve the pending permission promise
    const pending = state.pendingPermissions.get(requestId);
    if (pending) {
      pending.resolve();
      state.pendingPermissions.delete(requestId);
    }
  }

  async respondToQuestion(
    sessionId: string,
    _requestId: string,
    _answer: Record<string, string>,
  ): Promise<void> {
    // OpenCode doesn't have a separate question mechanism like Claude's AskUserQuestion.
    // Questions in OpenCode are handled as permissions or prompts.
    dbg.agent(
      'OpenCodeBackend.respondToQuestion called for %s — not directly supported',
      sessionId,
    );
  }

  async setMode(_sessionId: string, _mode: InteractionMode): Promise<void> {
    // OpenCode manages interaction modes through its permission config,
    // not through a runtime API. This is a no-op for now.
    dbg.agent('OpenCodeBackend.setMode — not directly supported');
  }

  async dispose(): Promise<void> {
    // Stop all sessions
    for (const [sessionId] of this.sessions) {
      await this.stop(sessionId);
    }

    // Shut down the server
    if (serverInstance) {
      dbg.agent('Shutting down OpenCode server');
      serverInstance.server.close();
      serverInstance = null;
      serverInitPromise = null;
    }
  }

  // --- Private helpers ---

  private async createSession(
    client: OpencodeClient,
    config: AgentBackendConfig,
  ): Promise<OcSession> {
    const result = await client.session.create({
      query: { directory: config.cwd },
      body: {},
    });

    if (!result.data) {
      throw new Error('Failed to create OpenCode session');
    }

    dbg.agent('Created OpenCode session %s', result.data.id);
    return result.data;
  }

  /**
   * Parse a model preference string like 'anthropic/claude-opus-4-1' into
   * the { providerID, modelID } shape that OpenCode expects.
   */
  private parseModel(
    model?: string,
  ): { providerID: string; modelID: string } | undefined {
    if (!model || model === 'default') return undefined;

    // If model contains '/', split into provider/model
    if (model.includes('/')) {
      const [providerID, ...rest] = model.split('/');
      return { providerID, modelID: rest.join('/') };
    }

    // Otherwise, treat the whole string as a model ID (user's configured default provider)
    return undefined;
  }

  /**
   * Create the async event stream by subscribing to OpenCode's SSE events
   * and sending the initial prompt.
   */
  private async *createEventStream(
    client: OpencodeClient,
    state: OpenCodeSessionState,
    prompt: string,
    config: AgentBackendConfig,
  ): AsyncGenerator<AgentEvent> {
    const sessionId = state.session.id;

    // Emit session ID
    yield { type: 'session-id', sessionId };

    // Subscribe to event stream
    const subscription = await client.event.subscribe({
      query: { directory: state.cwd },
    });

    // Track whether we've received the prompt response
    let promptComplete = false;
    let sessionIdle = false;

    // Send the initial prompt (fire and forget — events arrive via SSE)
    const model = this.parseModel(config.model);
    const promptPromise = client.session
      .prompt({
        path: { id: sessionId },
        query: { directory: state.cwd },
        body: {
          parts: [{ type: 'text', text: prompt }],
          ...(model ? { model } : {}),
        },
      })
      .then((result) => {
        promptComplete = true;

        // Emit the final assistant message from prompt response
        if (result.data) {
          const normalized = normalizeOpencodeMessage(
            result.data.info,
            result.data.parts,
          );

          // Track cost
          if (result.data.info.role === 'assistant') {
            state.totalCost +=
              (result.data.info as OcAssistantMessage).cost ?? 0;
          }

          return {
            type: 'message' as const,
            message: normalized,
            _raw: { info: result.data.info, parts: result.data.parts },
          };
        }
        return null;
      })
      .catch((error) => {
        promptComplete = true;
        dbg.agent('OpenCode prompt error: %O', error);
        return {
          type: 'error' as const,
          error: error instanceof Error ? error.message : String(error),
        };
      });

    try {
      // Process SSE events
      for await (const event of subscription.stream) {
        if (state.abortController.signal.aborted) {
          break;
        }

        const ocEvent = event as OcEvent;

        // Only process events for our session
        const sessionIdFromEvent = this.getSessionIdFromEvent(ocEvent);
        if (sessionIdFromEvent && sessionIdFromEvent !== sessionId) {
          continue;
        }

        const agentEvents = this.mapEvent(ocEvent, state);
        for (const agentEvent of agentEvents) {
          yield agentEvent;
        }

        // Check if session went idle (completion)
        if (
          ocEvent.type === 'session.idle' &&
          'properties' in ocEvent &&
          (ocEvent.properties as { sessionID: string }).sessionID === sessionId
        ) {
          sessionIdle = true;
          break;
        }

        // Check for session errors
        if (ocEvent.type === 'session.error' && 'properties' in ocEvent) {
          const props = ocEvent.properties as {
            sessionID?: string;
            error?: { name: string; data: { message: string } };
          };
          if (props.sessionID === sessionId || !props.sessionID) {
            yield {
              type: 'error',
              error: props.error?.data?.message ?? 'Unknown OpenCode error',
            };
            break;
          }
        }
      }
    } catch (error) {
      if (!state.abortController.signal.aborted) {
        dbg.agent('OpenCode event stream error: %O', error);
      }
    }

    // Wait for the prompt response to complete
    const promptResult = await promptPromise;
    if (promptResult) {
      if (promptResult.type === 'message') {
        yield promptResult as AgentEvent & { _raw: unknown };
      } else if (promptResult.type === 'error') {
        yield promptResult;
      }
    }

    // Emit completion
    const durationMs = Date.now() - state.startTime;
    const hasError =
      !promptComplete || (!sessionIdle && state.abortController.signal.aborted);

    yield {
      type: 'complete',
      result: {
        isError: hasError,
        text: hasError ? 'Session ended' : undefined,
        durationMs,
        cost: state.totalCost > 0 ? { costUsd: state.totalCost } : undefined,
      },
    };

    // Clean up
    this.sessions.delete(sessionId);
  }

  /**
   * Extract session ID from an OpenCode event (if applicable).
   */
  private getSessionIdFromEvent(event: OcEvent): string | undefined {
    if ('properties' in event && event.properties) {
      const props = event.properties as Record<string, unknown>;

      // Direct sessionID field
      if (typeof props.sessionID === 'string') return props.sessionID;

      // Nested in info
      if (
        props.info &&
        typeof props.info === 'object' &&
        'sessionID' in (props.info as Record<string, unknown>)
      ) {
        return (props.info as { sessionID: string }).sessionID;
      }

      // Part events have sessionID on the part
      if (
        props.part &&
        typeof props.part === 'object' &&
        'sessionID' in (props.part as Record<string, unknown>)
      ) {
        return (props.part as { sessionID: string }).sessionID;
      }
    }
    return undefined;
  }

  /**
   * Map an OpenCode SSE event to zero or more AgentEvents.
   */
  private mapEvent(event: OcEvent, state: OpenCodeSessionState): AgentEvent[] {
    const events: AgentEvent[] = [];

    switch (event.type) {
      case 'message.updated': {
        const props = event.properties as { info: OcMessage };
        const msg = props.info;

        // Fetch existing parts for this message
        const existing = state.messages.get(msg.id);
        const parts = existing?.parts ?? [];

        // Update the stored message
        state.messages.set(msg.id, { info: msg, parts });

        // Track cost from assistant messages
        if (msg.role === 'assistant') {
          const assistantMsg = msg as OcAssistantMessage;
          state.totalCost += assistantMsg.cost ?? 0;
        }

        const normalized = normalizeOpencodeMessage(
          msg as OcUserMessage | OcAssistantMessage,
          parts,
        );
        events.push({
          type: 'message',
          message: normalized,
          _raw: { info: msg, parts },
        } as AgentEvent & { _raw: unknown });
        break;
      }

      case 'message.part.updated': {
        const props = event.properties as { part: OcPart; delta?: string };
        const part = props.part;

        // Update the stored parts for this message
        const msgEntry = state.messages.get(part.messageID);
        if (msgEntry) {
          const partIndex = msgEntry.parts.findIndex((p) => p.id === part.id);
          if (partIndex >= 0) {
            msgEntry.parts[partIndex] = part;
          } else {
            msgEntry.parts.push(part);
          }

          // Re-emit the full message with updated parts
          const normalized = normalizeOpencodeMessage(
            msgEntry.info as OcUserMessage | OcAssistantMessage,
            msgEntry.parts,
          );
          events.push({
            type: 'message',
            message: normalized,
            _raw: { info: msgEntry.info, parts: msgEntry.parts },
          } as AgentEvent & { _raw: unknown });
        }

        // Emit tool state updates for tool parts
        if (part.type === 'tool') {
          const toolPart = part as OcPart & {
            callID: string;
            tool: string;
            state: { status: string };
          };
          events.push({
            type: 'tool-state-update',
            messageId: part.messageID,
            toolId: toolPart.callID,
            state: toolPart.state.status as
              | 'pending'
              | 'running'
              | 'completed'
              | 'error',
          });
        }
        break;
      }

      case 'message.removed': {
        const props = event.properties as {
          sessionID: string;
          messageID: string;
        };
        state.messages.delete(props.messageID);
        events.push({ type: 'message-removed', messageId: props.messageID });
        break;
      }

      case 'permission.updated': {
        const permission = event.properties as OcPermission;
        events.push({
          type: 'permission-request',
          request: {
            requestId: permission.id,
            toolName: permission.type,
            input: permission.metadata,
            description: permission.title,
          },
        });
        break;
      }

      case 'session.updated': {
        const props = event.properties as { info: OcSession };
        events.push({
          type: 'session-updated',
          title: props.info.title,
        });
        break;
      }

      case 'session.compacted': {
        // Emit a compaction message
        const compactMsg = synthesizeResultMessage({
          isError: false,
          text: 'Context compacted',
        });
        compactMsg.parts = [
          {
            type: 'compact',
            trigger: 'auto',
            preTokens: 0,
          },
        ];
        events.push({
          type: 'message',
          message: compactMsg,
        });
        break;
      }

      case 'session.status': {
        const props = event.properties as {
          sessionID: string;
          status: { type: string; attempt?: number; message?: string };
        };
        if (props.status.type === 'retry') {
          events.push({
            type: 'rate-limit',
            retryAfterMs: undefined,
          });
        }
        break;
      }

      case 'session.error': {
        const props = event.properties as {
          sessionID?: string;
          error?: { name: string; data: { message: string } };
        };
        events.push({
          type: 'error',
          error: props.error?.data?.message ?? 'Unknown error',
        });
        break;
      }

      default:
        // Other events (file.edited, todo.updated, vcs.branch.updated, etc.)
        // are not directly mapped to AgentEvents.
        break;
    }

    return events;
  }
}
