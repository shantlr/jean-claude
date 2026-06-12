// OpenCode SDK adapter.
// Wraps the @opencode-ai/sdk client into the common AgentBackend interface.
//
// Architecture:
// - Uses createOpencode() to spawn a server + client on first use
// - Server is shared across all sessions (one per app instance)
// - Events received via SSE subscription, filtered by session ID
// - Permissions handled via client.permission.reply()
// - Sessions created via client.session.create() + client.session.prompt()

import {
  createOpencode,
  type OpencodeClient,
  type Session as OcSession,
  type Event as OcEvent,
  type Part as OcPart,
  type Message as OcMessage,
  type AssistantMessage as OcAssistantMessage,
  type PermissionRequest as OcPermission,
} from '@opencode-ai/sdk/v2';

import type {
  AgentBackend,
  AgentBackendConfig,
  AgentEvent,
  AgentSession,
  AgentTaskContext,
  NormalizedPermissionResponse,
  NormalizedQuestion,
  NormalizedQuestionRequest,
  PromptPart,
} from '@shared/agent-backend-types';
import type { TokenUsage } from '@shared/normalized-message-v2';
import type { InteractionMode } from '@shared/types';

import type { ResolvedPermissionRule } from '../../../../shared/permission-types';
import { RawMessageRepository } from '../../../database/repositories';
import { dbg } from '../../../lib/debug';
import { calculateTheoreticalOpenCodeCost } from '../../backend-models-service';
import {
  compileForOpenCode,
  evaluatePermissionWithMatch,
  normalizeToolRequest,
} from '../../permission-settings-service';

import {
  normalizeOpenCodeV2,
  type OpenCodeNormalizationContext,
  type OpenCodeRawInput,
} from './normalize-opencode-message-v2';
import { applyDeltaToMessageParts } from './opencode-message-delta';

// --- Server lifecycle (singleton) ---

interface ServerHandle {
  client: OpencodeClient;
  server: { url: string; close(): void };
}

type RuntimeMcpServers = NonNullable<AgentBackendConfig['mcpServers']>;
const RUNTIME_MCP_TIMEOUT_MS = 30 * 60 * 1000;

let serverInstance: ServerHandle | null = null;
let serverInitPromise: Promise<ServerHandle> | null = null;

/**
 * Get or create the shared OpenCode server + client.
 * Singleton — only one server per app instance.
 */
export async function getOrCreateServer(): Promise<ServerHandle> {
  if (serverInstance) return serverInstance;

  if (serverInitPromise) {
    const result = await serverInitPromise;
    if (result) return result;
  }

  serverInitPromise = (async () => {
    dbg.agent('Starting OpenCode server...');
    try {
      const instance = await createOpencode({
        hostname: '127.0.0.1',
        port: 0,
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

function hasRuntimeMcpServers(config: AgentBackendConfig): boolean {
  return !!config.mcpServers && Object.keys(config.mcpServers).length > 0;
}

function toOpenCodeMcpConfig(runtimeMcpServers: RuntimeMcpServers): {
  [key: string]: {
    type: 'local';
    command: string[];
    environment?: Record<string, string>;
    enabled: boolean;
    timeout: number;
  };
} {
  const mcp: {
    [key: string]: {
      type: 'local';
      command: string[];
      environment?: Record<string, string>;
      enabled: boolean;
      timeout: number;
    };
  } = {};

  for (const [name, server] of Object.entries(runtimeMcpServers)) {
    const command = [server.command, ...(server.args ?? [])];
    if (command.length === 0 || !command[0]) continue;
    mcp[name] = {
      type: 'local',
      command,
      ...(server.env ? { environment: server.env } : {}),
      enabled: true,
      timeout: RUNTIME_MCP_TIMEOUT_MS,
    };
  }

  return mcp;
}

async function createDedicatedServer(
  config: AgentBackendConfig,
): Promise<ServerHandle> {
  const runtimeMcpServers = config.mcpServers ?? {};
  const mcp = toOpenCodeMcpConfig(runtimeMcpServers);
  dbg.agent(
    'Starting dedicated OpenCode server with %d runtime MCP servers',
    Object.keys(mcp).length,
  );
  return createOpencode({
    hostname: '127.0.0.1',
    port: 0,
    timeout: 30_000,
    config: {
      mcp,
    },
  });
}

// --- Backend deps (injected by agent-service for raw persistence) ---

// --- Session tracking ---

interface OpenCodeSessionState {
  /** The OpenCode session object */
  session: OcSession;
  /** Working directory for this session */
  cwd: string;
  /** Abort controller for stopping the event stream */
  abortController: AbortController;
  /** Accumulated messages for this session (raw data for normalization context) */
  messages: Map<string, { info: OcMessage; parts: OcPart[] }>;
  /** Pending permission requests waiting for user response */
  pendingPermissions: Map<
    string,
    {
      permission: OcPermission;
      resolve: () => void;
    }
  >;
  /** Pending question requests waiting for user response */
  pendingQuestions: Set<string>;
  /** Start time for duration tracking */
  startTime: number;
  /** Accumulated cost */
  totalCost: number;
  /** Estimated direct API cost when actual cost is zero */
  totalApiCost: number;
  /** Accumulated token usage */
  totalUsage?: TokenUsage;
  /** Single model used by accumulated assistant usage, when known. */
  totalModel?: string;
  /** V2 normalization context */
  normalizationCtx: OpenCodeNormalizationContext;
  /** Current message index for raw persistence ordering */
  messageIndex: number;
  /** Subtask parts that arrived before their parent message proved ownership. */
  pendingSubtaskPartsByMessageId: Map<string, OcPart[]>;
  /** Child task sessions already fetched from OpenCode history. */
  fetchedChildSessionIds: Set<string>;
  /** First persisted row for each streaming text delta group */
  rawDeltaRows: Map<
    string,
    { rowId: string; rawData: OpenCodeDeltaEvent; dirty: boolean }
  >;
  /** Question request IDs already emitted as question AgentEvents (for dedup).
   *  Keyed by the QuestionRequest.id from `question.asked` SSE events. */
  emittedQuestionRequestIds: Set<string>;
  /** Resolved permission rules for runtime evaluation */
  permissionRules: ResolvedPermissionRule[];
  /** Server/client handle used by this session */
  serverHandle: ServerHandle;
  /** Whether this session owns a dedicated server instance */
  ownsServerHandle: boolean;
  /** Guards against double-close of dedicated servers */
  serverClosed: boolean;
}

type PromptResultEvent =
  | { type: 'entries'; events: AgentEvent[] }
  | { type: 'error'; error: string };

type SubscriptionReadResult =
  | { type: 'event'; result: IteratorResult<unknown> }
  | { type: 'idle-timeout' }
  | { type: 'prompt-result'; result: PromptResultEvent | null };

const IDLE_COMPLETION_TIMEOUT_MS = 3 * 60 * 1000;
const IDLE_TIMEOUT_SETTLE_GRACE_MS = 250;

export class OpenCodeBackend implements AgentBackend {
  private sessions = new Map<string, OpenCodeSessionState>();
  private taskContext: AgentTaskContext;

  static async compactRawMessagesForTask(taskId: string): Promise<void> {
    await RawMessageRepository.compactOpenCodeRawMessagesForTask(taskId);
  }

  constructor(context: AgentTaskContext) {
    this.taskContext = context;
  }

  async start(
    config: AgentBackendConfig,
    parts: PromptPart[],
  ): Promise<AgentSession> {
    dbg.agent(
      'OpenCodeBackend.start() — cwd: %s, sessionId: %s, model: %s, mode: %s, hasMcpServers: %s',
      config.cwd,
      config.sessionId ?? '(new)',
      config.model ?? '(default)',
      config.interactionMode,
      hasRuntimeMcpServers(config),
    );

    const ownsServerHandle = hasRuntimeMcpServers(config);
    const serverHandle = ownsServerHandle
      ? await createDedicatedServer(config)
      : await getOrCreateServer();
    const { client } = serverHandle;

    dbg.agent(
      'OpenCodeBackend.start() — server ready at %s',
      serverHandle.server.url,
    );

    // Create or resume an OpenCode session
    let session: OcSession;

    if (config.sessionId) {
      // Try to resume existing session — never fall back to creating a new one
      try {
        const existing = await client.session.get({
          sessionID: config.sessionId,
          directory: config.cwd,
        });
        if (existing.data) {
          session = existing.data;
          dbg.agent('Resuming OpenCode session %s', session.id);
        } else {
          throw new Error(
            `Failed to resume OpenCode session ${config.sessionId}: session not found`,
          );
        }
      } catch (error) {
        // Re-throw if it's already our error, otherwise wrap it
        if (
          error instanceof Error &&
          error.message.includes('Failed to resume')
        ) {
          throw error;
        }
        throw new Error(
          `Failed to resume OpenCode session ${config.sessionId}: ${error instanceof Error ? error.message : String(error)}`,
        );
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
        pendingToolPermissionDecisions: [],
        toolPermissionsByEntryId: new Map(),
        permissionRules: config.permissionRules ?? [],
      },
      messageIndex: this.taskContext.sessionStartIndex,
      pendingSubtaskPartsByMessageId: new Map(),
      fetchedChildSessionIds: new Set(),
      rawDeltaRows: new Map(),
      emittedQuestionRequestIds: new Set(),
      permissionRules: config.permissionRules ?? [],
      serverHandle,
      ownsServerHandle,
      serverClosed: false,
    };

    this.sessions.set(session.id, state);

    // Build the event stream
    const events = this.createEventStream(client, state, parts, config);

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
      await state.serverHandle.client.session.abort({
        sessionID: sessionId,
        directory: state.cwd,
      });
    } catch (error) {
      dbg.agent('Error aborting OpenCode session %s: %O', sessionId, error);
    }

    // Resolve any pending permissions with rejection
    for (const [, pending] of state.pendingPermissions) {
      pending.resolve();
    }
    state.pendingPermissions.clear();
    state.pendingQuestions.clear();

    this.sessions.delete(sessionId);
    this.closeDedicatedServer(state);
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
      await state.serverHandle.client.permission.reply({
        requestID: requestId,
        directory: state.cwd,
        reply: ocResponse,
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
    requestId: string,
    answer: Record<string, string>,
  ): Promise<void> {
    const state = this.sessions.get(sessionId);
    if (!state) {
      dbg.agent('OpenCodeBackend.respondToQuestion — no session %s', sessionId);
      return;
    }

    dbg.agent(
      'OpenCodeBackend.respondToQuestion sending reply for %s with answer %O',
      sessionId,
      answer,
    );

    // Map Record<string, string> answers to Array<QuestionAnswer>
    // QuestionAnswer = Array<string> — each answer is the selected option(s)
    const answers = Object.values(answer).map((value) => [value]);

    state.serverHandle.client.question
      .reply({
        requestID: requestId,
        directory: state.cwd,
        answers,
      })
      .catch((error) => {
        dbg.agent(
          'OpenCodeBackend.respondToQuestion reply error for %s: %O',
          sessionId,
          error,
        );
      });
    state.pendingQuestions.delete(requestId);
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
    // Compile permission rules to OpenCode's PermissionRuleset format
    const permission = config.permissionRules
      ? compileForOpenCode(config.permissionRules)
      : undefined;

    dbg.agent(
      'Creating OpenCode session in directory %s with %d permission rules',
      config.cwd,
      permission?.length ?? 0,
    );

    let result;
    try {
      result = await client.session.create({
        directory: config.cwd,
        ...(permission && permission.length > 0
          ? { body: { permission } }
          : {}),
      });
    } catch (error) {
      dbg.agent(
        'OpenCode session.create() threw: %O (directory: %s)',
        error,
        config.cwd,
      );
      throw new Error(
        `Failed to create OpenCode session: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (!result.data) {
      dbg.agent(
        'OpenCode session.create() returned no data. Full result: %O',
        result,
      );

      // Extract meaningful error details from the response
      const err = result.error as
        | { name?: string; data?: { path?: string; issues?: unknown[] } }
        | undefined;
      if (err?.name) {
        const detail = err.data?.path
          ? `${err.name}: ${err.data.path}`
          : err.name;
        const issues = err.data?.issues;
        const issueStr = Array.isArray(issues)
          ? ` — ${JSON.stringify(issues)}`
          : '';
        throw new Error(
          `Failed to create OpenCode session: ${detail}${issueStr}`,
        );
      }

      throw new Error(
        `Failed to create OpenCode session: result.data is ${String(result.data)}`,
      );
    }

    dbg.agent(
      'Created OpenCode session %s with %d permission rules',
      result.data.id,
      permission?.length ?? 0,
    );
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

  private getPrimaryAgentName(mode: InteractionMode): 'build' | 'plan' {
    return mode === 'plan' ? 'plan' : 'build';
  }

  /**
   * Create the async event stream by subscribing to OpenCode's SSE events
   * and sending the initial prompt.
   */
  private async *createEventStream(
    client: OpencodeClient,
    state: OpenCodeSessionState,
    parts: PromptPart[],
    config: AgentBackendConfig,
  ): AsyncGenerator<AgentEvent> {
    const sessionId = state.session.id;

    // Emit session ID
    yield { type: 'session-id', sessionId };

    // Subscribe to event stream
    const subscription = await client.event.subscribe({
      directory: state.cwd,
    });

    // Track whether we've received the prompt response
    let promptComplete = false;
    let sessionIdle = false;
    let idleDeadline: number | null = null;
    let idleTimedOut = false;
    let emittedError = false;
    let sessionErrored = false;
    let capturedPromptResult: PromptResultEvent | null = null;
    let hasCapturedPromptResult = false;

    // Send the initial prompt (fire and forget — events arrive via SSE)
    const model = this.parseModel(config.model);

    let promptSettled = false;

    const promptPromise: Promise<PromptResultEvent | null> = client.session
      .prompt({
        sessionID: sessionId,
        directory: state.cwd,
        parts: parts
          .filter((part) => part.type === 'text' || part.type === 'image')
          .map((part) => {
            if (part.type === 'text') {
              return { type: 'text' as const, text: part.text };
            }
            return {
              type: 'file' as const,
              mime: part.mimeType,
              url: `data:${part.mimeType};base64,${part.data}`,
              ...(part.filename ? { filename: part.filename } : {}),
            };
          }),
        ...(model ? { model } : {}),
        ...(config.thinkingEffort && config.thinkingEffort !== 'default'
          ? { variant: config.thinkingEffort }
          : {}),
        agent: this.getPrimaryAgentName(config.interactionMode),
      })
      .then(async (result): Promise<PromptResultEvent | null> => {
        promptComplete = true;
        promptSettled = true;

        // Emit the final assistant message from prompt response using V2 normalizer
        if (result.data) {
          const ctx = state.normalizationCtx;

          // Update context with prompt result data
          ctx.rawMessages.set(result.data.info.id, result.data.info);
          ctx.rawParts.set(result.data.info.id, result.data.parts);

          // Track cost/tokens from unique assistant messages.
          if (result.data.info.role === 'assistant') {
            this.updateUsageTotals(state);
          }

          // Persist raw prompt result
          const rawMessageId = await this.persistRawForMessage(
            state,
            result.data,
          );

          // Normalize via V2 prompt-result path
          const input: OpenCodeRawInput = {
            kind: 'prompt-result',
            info: result.data.info as OcAssistantMessage,
            parts: result.data.parts,
          };
          const normEvents = normalizeOpenCodeV2(input, ctx);

          // Update emittedEntryIds
          for (const ne of normEvents) {
            if (ne.type === 'entry') {
              ctx.emittedEntryIds.add(ne.entry.id);
            }
          }

          const promptEvents = normEvents.map((ne): AgentEvent => {
            if (ne.type === 'entry') {
              return {
                ...ne,
                rawMessageId,
              };
            }
            return ne as AgentEvent;
          });

          for (const childSession of this.getCompletedTaskChildSessions(
            result.data.parts,
          )) {
            promptEvents.push(
              ...(await this.fetchChildSessionEvents(state, childSession)),
            );
          }

          if (promptEvents.length > 0) {
            return {
              type: 'entries',
              events: promptEvents,
            };
          }
        }
        return null;
      })
      .catch((error): PromptResultEvent => {
        promptComplete = true;
        promptSettled = true;
        dbg.agent('OpenCode prompt error: %O', error);
        return {
          type: 'error',
          error: error instanceof Error ? error.message : String(error),
        };
      });

    try {
      // Process SSE events
      const iterator = subscription.stream[Symbol.asyncIterator]();
      while (true) {
        const read = await this.readSubscriptionEvent({
          iterator,
          idleDeadline,
          promptPromise,
          promptSettled,
        });

        if (read.type === 'idle-timeout') {
          idleTimedOut = true;
          this.closeSubscriptionIterator(iterator);
          break;
        }

        if (read.type === 'prompt-result') {
          capturedPromptResult = read.result;
          hasCapturedPromptResult = true;
          this.closeSubscriptionIterator(iterator);
          break;
        }

        const { value: event, done } = read.result;
        if (done) {
          break;
        }

        if (state.abortController.signal.aborted) {
          break;
        }

        const ocEvent = event as OcEvent;

        // Skip heartbeat events — they carry no useful data
        if ((ocEvent.type as string) === 'server.heartbeat') {
          continue;
        }

        // Only process events for parent session or known sub-agent child sessions.
        const sessionIdFromEvent = this.getSessionIdFromEvent(ocEvent);
        const isKnownChildSession = sessionIdFromEvent
          ? state.normalizationCtx.subtaskParentToolIdsBySessionId?.has(
              sessionIdFromEvent,
            )
          : false;
        const isOwnedSubtaskPartEvent = this.isOwnedSubtaskPartEvent(
          ocEvent,
          state,
          sessionId,
        );

        if (
          sessionIdFromEvent &&
          sessionIdFromEvent !== sessionId &&
          !isKnownChildSession &&
          !isOwnedSubtaskPartEvent
        ) {
          if (this.bufferUnownedSubtaskPart(ocEvent, state)) {
            await this.persistRawForMessage(state, ocEvent);
          }
          continue;
        }

        if (
          sessionIdFromEvent &&
          sessionIdFromEvent !== sessionId &&
          isKnownChildSession &&
          !this.shouldProcessChildSessionEvent(ocEvent)
        ) {
          continue;
        }

        const isIdleEvent =
          ocEvent.type === 'session.idle' && sessionIdFromEvent === sessionId;

        const rawMessageId = await this.persistRawForMessage(state, ocEvent);

        // Treat session.idle as a possible completion signal, not definitive.
        // Do not yield the normalizer's complete event here; the final complete
        // is emitted after the idle timeout/prompt-result handling below.
        if (isIdleEvent && this.hasPendingUserInput(state)) {
          continue;
        }

        if (isIdleEvent) {
          sessionIdle = true;
          idleDeadline = Date.now() + IDLE_COMPLETION_TIMEOUT_MS;
          if (promptSettled) {
            break;
          }
          continue;
        }

        if (
          ocEvent.type === 'session.idle' &&
          sessionIdFromEvent &&
          sessionIdFromEvent !== sessionId
        ) {
          continue;
        }

        if (sessionIdle) {
          sessionIdle = false;
          idleDeadline = null;
        }

        const agentEvents = this.mapEvent(ocEvent, state, rawMessageId);

        for (const agentEvent of agentEvents) {
          if (agentEvent.type === 'error') {
            emittedError = true;
          }

          // Auto-respond to permission requests that match our rules
          if (agentEvent.type === 'permission-request') {
            const req = agentEvent.request;
            const { tool, matchValue } = normalizeToolRequest(
              req.toolName,
              req.input,
            );
            const permissionDecision = evaluatePermissionWithMatch(
              state.permissionRules,
              tool,
              matchValue,
            );
            const action = permissionDecision.action;

            if (action === 'allow') {
              dbg.agentPermission(
                'Auto-allowing %s (pattern match)',
                req.toolName,
              );
              await state.serverHandle.client.permission.reply({
                requestID: req.requestId,
                directory: state.cwd,
                reply: 'once',
              });
              (state.normalizationCtx.pendingToolPermissionDecisions ??=
                []).push(
                permissionDecision.matchedRule
                  ? {
                      allowedBy: 'system',
                      tool,
                      matchValue,
                      rule: {
                        tool: permissionDecision.matchedRule.tool,
                        pattern: permissionDecision.matchedRule.pattern,
                      },
                    }
                  : { allowedBy: 'system', tool, matchValue },
              );
              continue; // Don't yield the permission-request event
            }

            if (action === 'deny') {
              dbg.agentPermission(
                'Auto-denying %s (pattern match)',
                req.toolName,
              );
              await state.serverHandle.client.permission.reply({
                requestID: req.requestId,
                directory: state.cwd,
                reply: 'reject',
              });
              continue; // Don't yield the permission-request event
            }

            state.pendingPermissions.set(req.requestId, {
              permission: {
                id: req.requestId,
                sessionID: sessionId,
                permission: req.toolName,
                patterns: [],
                metadata: req.input,
                always: [],
              } as OcPermission,
              resolve: () => {},
            });
          }

          if (agentEvent.type === 'question') {
            state.pendingQuestions.add(agentEvent.request.requestId);
          }

          yield agentEvent;
        }

        const childSession = this.getCompletedTaskChildSession(ocEvent);
        if (childSession) {
          for (const childEvent of await this.fetchChildSessionEvents(
            state,
            childSession,
          )) {
            yield childEvent;
          }
        }

        // Check for session errors
        if (ocEvent.type === 'session.error' && 'properties' in ocEvent) {
          const props = ocEvent.properties as {
            sessionID?: string;
          };
          if (props.sessionID === sessionId || !props.sessionID) {
            sessionErrored = true;
            break;
          }
        }
      }
    } catch (error) {
      if (!state.abortController.signal.aborted) {
        dbg.agent('[opencode] event stream error: %O', error);
      }
    }

    await this.flushRawDeltaRows(state);

    const promptResult = hasCapturedPromptResult
      ? capturedPromptResult
      : idleTimedOut || sessionErrored || state.abortController.signal.aborted
        ? null
        : await promptPromise;
    if (promptResult) {
      if (promptResult.type === 'entries') {
        for (const event of promptResult.events) {
          if (event.type === 'error') {
            emittedError = true;
          }
          yield event;
        }
      } else if (promptResult.type === 'error' && !emittedError) {
        emittedError = true;
        yield promptResult;
      }
    }

    // Emit completion
    const durationMs = Date.now() - state.startTime;
    const hasError =
      emittedError ||
      sessionErrored ||
      (!promptComplete && !sessionIdle) ||
      (!sessionIdle && state.abortController.signal.aborted);

    yield {
      type: 'complete',
      result: {
        isError: hasError,
        text: hasError ? 'Session ended' : undefined,
        durationMs,
        model: state.totalModel,
        cost:
          state.totalCost > 0 || state.totalApiCost > 0
            ? {
                costUsd: state.totalCost,
                ...(state.totalCost === 0 && state.totalApiCost > 0
                  ? { apiCostUsd: state.totalApiCost }
                  : {}),
              }
            : undefined,
        usage: state.totalUsage,
      },
    };

    // Clean up
    this.sessions.delete(sessionId);
    this.closeDedicatedServer(state);
  }

  private closeDedicatedServer(state: OpenCodeSessionState): void {
    if (!state.ownsServerHandle || state.serverClosed) {
      return;
    }
    state.serverHandle.server.close();
    state.serverClosed = true;
    dbg.agent(
      'Closed dedicated OpenCode server for session %s',
      state.session.id,
    );
  }

  private hasPendingUserInput(state: OpenCodeSessionState): boolean {
    return state.pendingPermissions.size > 0 || state.pendingQuestions.size > 0;
  }

  private closeSubscriptionIterator(iterator: AsyncIterator<unknown>): void {
    iterator.return?.().catch((error) => {
      dbg.agent('[opencode] error closing event stream: %O', error);
    });
  }

  private async readSubscriptionEvent({
    iterator,
    idleDeadline,
    promptPromise,
    promptSettled,
  }: {
    iterator: AsyncIterator<unknown>;
    idleDeadline: number | null;
    promptPromise: Promise<PromptResultEvent | null>;
    promptSettled: boolean;
  }): Promise<SubscriptionReadResult> {
    if (!idleDeadline) {
      return { type: 'event', result: await iterator.next() };
    }

    const remainingMs = idleDeadline - Date.now();
    if (remainingMs <= 0) {
      return { type: 'idle-timeout' };
    }

    let timeout: ReturnType<typeof setTimeout> | undefined;
    let settleTimeout: ReturnType<typeof setTimeout> | undefined;
    const eventPromise = iterator
      .next()
      .then((result): SubscriptionReadResult => ({ type: 'event', result }));
    const promptResultPromise = promptSettled
      ? null
      : promptPromise.then(
          (result): SubscriptionReadResult => ({
            type: 'prompt-result',
            result,
          }),
        );

    try {
      const result = await Promise.race([
        eventPromise,
        new Promise<SubscriptionReadResult>((resolve) => {
          timeout = setTimeout(
            () => resolve({ type: 'idle-timeout' }),
            remainingMs,
          );
        }),
        ...(promptResultPromise ? [promptResultPromise] : []),
      ]);

      if (result.type !== 'idle-timeout') {
        return result;
      }

      return await Promise.race([
        eventPromise,
        ...(promptResultPromise ? [promptResultPromise] : []),
        new Promise<SubscriptionReadResult>((resolve) => {
          settleTimeout = setTimeout(
            () => resolve({ type: 'idle-timeout' }),
            IDLE_TIMEOUT_SETTLE_GRACE_MS,
          );
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
      if (settleTimeout) clearTimeout(settleTimeout);
    }
  }

  private updateUsageTotals(state: OpenCodeSessionState): void {
    let totalCost = 0;
    let totalApiCost = 0;
    const models = new Set<string>();
    const totalUsage: TokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    };

    for (const message of state.normalizationCtx.rawMessages.values()) {
      if (message.role !== 'assistant') continue;

      const assistant = message as OcAssistantMessage;
      if (!assistant.tokens) {
        totalCost += assistant.cost ?? 0;
        continue;
      }

      models.add(`${assistant.providerID}/${assistant.modelID}`);

      if (assistant.cost && assistant.cost > 0) {
        totalCost += assistant.cost;
      } else if (assistant.cost === 0) {
        totalApiCost += calculateTheoreticalOpenCodeCost({
          providerID: assistant.providerID,
          modelID: assistant.modelID,
          inputTokens: assistant.tokens.input,
          outputTokens: assistant.tokens.output,
          cacheReadTokens: assistant.tokens.cache.read,
          cacheCreationTokens: assistant.tokens.cache.write,
        });
      }

      totalUsage.inputTokens += assistant.tokens.input;
      totalUsage.outputTokens += assistant.tokens.output;
      totalUsage.cacheReadTokens =
        (totalUsage.cacheReadTokens ?? 0) + assistant.tokens.cache.read;
      totalUsage.cacheCreationTokens =
        (totalUsage.cacheCreationTokens ?? 0) + assistant.tokens.cache.write;
    }

    const hasUsage =
      totalUsage.inputTokens > 0 ||
      totalUsage.outputTokens > 0 ||
      (totalUsage.cacheReadTokens ?? 0) > 0 ||
      (totalUsage.cacheCreationTokens ?? 0) > 0;

    state.totalCost = totalCost;
    state.totalApiCost = totalCost === 0 ? totalApiCost : 0;
    state.totalUsage = hasUsage ? totalUsage : undefined;
    state.totalModel = models.size === 1 ? [...models][0] : undefined;
    state.normalizationCtx.totalCost = totalCost;
    state.normalizationCtx.totalApiCost = state.totalApiCost;
    state.normalizationCtx.totalUsage = state.totalUsage;
    state.normalizationCtx.totalModel = state.totalModel;
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

      // Session lifecycle events carry the session object as `info` with `id`.
      if (
        typeof event.type === 'string' &&
        event.type.startsWith('session.') &&
        props.info &&
        typeof props.info === 'object' &&
        typeof (props.info as { id?: unknown }).id === 'string'
      ) {
        return (props.info as { id: string }).id;
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

  private isOwnedSubtaskPartEvent(
    event: OcEvent,
    state: OpenCodeSessionState,
    parentSessionId: string,
  ): boolean {
    if (event.type !== 'message.part.updated') return false;
    if (!('properties' in event) || !event.properties) return false;

    const props = event.properties as Record<string, unknown>;
    const part = props.part;
    if (!part || typeof part !== 'object') return false;

    const subtaskPart = part as {
      type?: unknown;
      messageID?: unknown;
    };
    if (subtaskPart.type !== 'subtask') return false;
    if (typeof subtaskPart.messageID !== 'string') return false;

    const parentMessage = state.normalizationCtx.rawMessages.get(
      subtaskPart.messageID,
    );
    if (!parentMessage) return false;

    return (
      parentMessage.sessionID === parentSessionId ||
      state.normalizationCtx.subtaskParentToolIdsBySessionId?.has(
        parentMessage.sessionID,
      ) === true
    );
  }

  private shouldProcessChildSessionEvent(event: OcEvent): boolean {
    switch (event.type) {
      case 'message.updated':
      case 'message.part.updated':
      case 'message.part.delta':
      case 'message.part.removed':
      case 'message.removed':
      case 'permission.asked':
      case 'question.asked':
        return true;
      default:
        return false;
    }
  }

  private getCompletedTaskChildSession(event: OcEvent):
    | {
        sessionId: string;
        parentToolId: string;
      }
    | undefined {
    if (event.type !== 'message.part.updated') return undefined;
    if (!('properties' in event) || !event.properties) return undefined;

    const props = event.properties as Record<string, unknown>;
    const part = props.part;
    if (!part || typeof part !== 'object') return undefined;

    return this.getCompletedTaskChildSessionFromPart(part);
  }

  private getCompletedTaskChildSessions(
    parts: OcPart[],
  ): Array<{ sessionId: string; parentToolId: string }> {
    return parts
      .map((part) => this.getCompletedTaskChildSessionFromPart(part))
      .filter((childSession) => childSession !== undefined);
  }

  private getCompletedTaskChildSessionFromPart(part: unknown):
    | {
        sessionId: string;
        parentToolId: string;
      }
    | undefined {
    if (!part || typeof part !== 'object') return undefined;

    const toolPart = part as {
      type?: unknown;
      tool?: unknown;
      callID?: unknown;
      state?: {
        status?: unknown;
        metadata?: { sessionId?: unknown };
      };
    };

    if (toolPart.type !== 'tool' || toolPart.tool !== 'task') return undefined;
    if (toolPart.state?.status !== 'completed') return undefined;
    if (typeof toolPart.callID !== 'string') return undefined;
    if (typeof toolPart.state.metadata?.sessionId !== 'string')
      return undefined;

    return {
      sessionId: toolPart.state.metadata.sessionId,
      parentToolId: toolPart.callID,
    };
  }

  private async fetchChildSessionEvents(
    state: OpenCodeSessionState,
    childSession: { sessionId: string; parentToolId: string },
  ): Promise<AgentEvent[]> {
    if (state.fetchedChildSessionIds.has(childSession.sessionId)) return [];
    state.fetchedChildSessionIds.add(childSession.sessionId);

    try {
      const result = await state.serverHandle.client.session.messages({
        sessionID: childSession.sessionId,
        directory: state.cwd,
      });
      const messages =
        (result.data as Array<{ info: OcMessage; parts: OcPart[] }> | null) ??
        [];
      const events: AgentEvent[] = [];
      const ctx: OpenCodeNormalizationContext = {
        emittedEntryIds: new Set(state.normalizationCtx.emittedEntryIds),
        rawMessages: new Map(),
        rawParts: new Map(),
        sessionStartTime: Date.now(),
        totalCost: 0,
        subtaskParentToolIdsBySessionId: new Map([
          [childSession.sessionId, childSession.parentToolId],
        ]),
        pendingToolPermissionDecisions: [],
        toolPermissionsByEntryId: new Map(),
        permissionRules: state.permissionRules,
      };

      for (const message of messages) {
        ctx.rawMessages.set(message.info.id, message.info);
        ctx.rawParts.set(message.info.id, message.parts);

        const normEvents = normalizeOpenCodeV2(
          {
            kind: 'event',
            event: {
              type: 'message.updated',
              properties: { info: message.info },
            } as OcEvent,
          },
          ctx,
        );

        for (const ne of normEvents) {
          if (ne.type === 'entry') {
            ctx.emittedEntryIds.add(ne.entry.id);
          }
        }

        const entryEvents = normEvents.filter((ne) => ne.type === 'entry');
        const entryUpdateEvents = normEvents.filter(
          (ne) => ne.type === 'entry-update',
        );
        if (entryEvents.length === 0 && entryUpdateEvents.length === 0) {
          continue;
        }

        const rawMessageId =
          entryEvents.length > 0
            ? await this.taskContext.persistRaw({
                messageIndex: state.messageIndex++,
                backendSessionId: state.session.id,
                rawData: {
                  type: 'child-session.message',
                  sessionID: childSession.sessionId,
                  message,
                },
              })
            : null;

        for (const ne of entryEvents) {
          state.normalizationCtx.emittedEntryIds.add(ne.entry.id);
          events.push({ ...ne, rawMessageId });
        }
        for (const ne of entryUpdateEvents) {
          events.push(ne);
        }

        for (const nestedChildSession of this.getCompletedTaskChildSessions(
          message.parts,
        )) {
          events.push(
            ...(await this.fetchChildSessionEvents(state, nestedChildSession)),
          );
        }
      }

      return events;
    } catch (error) {
      dbg.agent(
        'Failed to fetch OpenCode child session %s messages: %O',
        childSession.sessionId,
        error,
      );
      return [];
    }
  }

  private bufferUnownedSubtaskPart(
    event: OcEvent,
    state: OpenCodeSessionState,
  ): boolean {
    if (event.type !== 'message.part.updated') return false;
    if (!('properties' in event) || !event.properties) return false;

    const props = event.properties as Record<string, unknown>;
    const part = props.part;
    if (!part || typeof part !== 'object') return false;

    const subtaskPart = part as OcPart & {
      type?: unknown;
      messageID?: unknown;
    };
    if (subtaskPart.type !== 'subtask') return false;
    if (typeof subtaskPart.messageID !== 'string') return false;

    const pendingParts =
      state.pendingSubtaskPartsByMessageId.get(subtaskPart.messageID) ?? [];
    const existingIndex = pendingParts.findIndex(
      (p) => p.id === subtaskPart.id,
    );
    if (existingIndex >= 0) {
      pendingParts[existingIndex] = cloneOpenCodePart(subtaskPart);
    } else {
      pendingParts.push(cloneOpenCodePart(subtaskPart));
    }
    state.pendingSubtaskPartsByMessageId.set(
      subtaskPart.messageID,
      pendingParts,
    );
    return true;
  }

  /**
   * Map an OpenCode SSE event to zero or more AgentEvents.
   *
   * Updates the normalization context (rawMessages, rawParts, cost) BEFORE
   * calling the V2 normalizer, then converts NormalizationEvents → AgentEvents.
   */
  private mapEvent(
    event: OcEvent,
    state: OpenCodeSessionState,
    rawMessageId: string | null,
  ): AgentEvent[] {
    const ctx = state.normalizationCtx;

    // --- Pre-normalizer context updates ---
    // The V2 normalizer reads from ctx but never mutates it,
    // so we update rawMessages/rawParts here before calling it.

    switch (event.type) {
      case 'message.updated': {
        const props = event.properties as { info: OcMessage };
        const msg = props.info;

        // Update raw context
        ctx.rawMessages.set(msg.id, msg);
        const pendingSubtaskParts = state.pendingSubtaskPartsByMessageId.get(
          msg.id,
        );
        if (pendingSubtaskParts) {
          ctx.rawParts.set(msg.id, [
            ...(ctx.rawParts.get(msg.id) ?? []),
            ...pendingSubtaskParts.map(cloneOpenCodePart),
          ]);
          state.pendingSubtaskPartsByMessageId.delete(msg.id);
        }

        // Also update the legacy messages map (used for prompt-result later)
        const existing = state.messages.get(msg.id);
        state.messages.set(msg.id, {
          info: msg,
          parts: [
            ...(existing?.parts ?? []),
            ...(pendingSubtaskParts?.map(cloneOpenCodePart) ?? []),
          ],
        });

        // Track cost/tokens from assistant messages. Recompute from rawMessages
        // because OpenCode can emit the same message.updated more than once.
        if (msg.role === 'assistant') {
          this.updateUsageTotals(state);
        }
        break;
      }

      case 'message.part.updated': {
        const props = event.properties as { part: OcPart };
        const part = props.part;

        // Update rawParts in context
        const existingParts = ctx.rawParts.get(part.messageID) ?? [];
        const partIndex = existingParts.findIndex((p) => p.id === part.id);
        if (partIndex >= 0) {
          existingParts[partIndex] = part;
        } else {
          existingParts.push(part);
        }
        ctx.rawParts.set(part.messageID, existingParts);

        // Also update the legacy messages map
        const msgEntry = state.messages.get(part.messageID);
        if (msgEntry) {
          const legacyIdx = msgEntry.parts.findIndex((p) => p.id === part.id);
          if (legacyIdx >= 0) {
            msgEntry.parts[legacyIdx] = cloneOpenCodePart(part);
          } else {
            msgEntry.parts.push(cloneOpenCodePart(part));
          }
        }
        break;
      }

      case 'message.part.delta': {
        const props = event.properties as {
          messageID: string;
          partID: string;
          field: string;
          delta: unknown;
        };

        applyDeltaToMessageParts(ctx.rawParts.get(props.messageID), props);
        break;
      }

      case 'message.removed': {
        const props = event.properties as { messageID: string };
        // Clean up emittedEntryIds for entries belonging to this message
        // Entry IDs use the format `${messageId}:${partId}`
        const prefix = `${props.messageID}:`;
        for (const entryId of ctx.emittedEntryIds) {
          if (entryId.startsWith(prefix)) {
            ctx.emittedEntryIds.delete(entryId);
            ctx.toolPermissionsByEntryId?.delete(entryId);
          }
        }
        ctx.rawMessages.delete(props.messageID);
        ctx.rawParts.delete(props.messageID);
        state.messages.delete(props.messageID);
        this.updateUsageTotals(state);
        break;
      }

      case 'message.part.removed': {
        const props = event.properties as {
          messageID: string;
          partID: string;
        };
        const parts = ctx.rawParts.get(props.messageID);
        if (parts) {
          const idx = parts.findIndex((p) => p.id === props.partID);
          if (idx >= 0) parts.splice(idx, 1);
        }
        break;
      }

      default:
        break;
    }

    // --- Call V2 normalizer ---

    const input: OpenCodeRawInput = { kind: 'event', event };
    const normEvents = normalizeOpenCodeV2(input, ctx);

    // --- Post-normalizer: update emittedEntryIds for future isUpdate checks ---

    for (const ne of normEvents) {
      if (ne.type === 'entry') {
        ctx.emittedEntryIds.add(ne.entry.id);
      }
      if (ne.type === 'permission-request') {
        dbg.agentPermission(
          'Received permission request: %s %O',
          ne.request.toolName,
          ne.request.input,
        );
      }
    }

    // --- Convert NormalizationEvents → AgentEvents ---
    // Only 'entry' needs special handling (add rawMessageId);
    // all other variants are structurally compatible.
    const agentEvents: AgentEvent[] = normEvents.map((ne): AgentEvent => {
      if (ne.type === 'entry') {
        return {
          ...ne,
          rawMessageId,
        };
      }
      return ne as AgentEvent;
    });

    // --- Post-conversion: detect question.asked SSE events and emit question AgentEvent ---
    // OpenCode emits `question.asked` events with a QuestionRequest that carries
    // the correct server-side request ID. We use that ID (not the tool's callID)
    // so that `client.question.reply({ requestID })` resolves on the server.
    if (event.type === 'question.asked') {
      const qr = event.properties as {
        id: string;
        sessionID: string;
        questions: Array<{
          question: string;
          header: string;
          multiple?: boolean;
          options: Array<{ label: string; description: string }>;
        }>;
      };
      if (
        !state.emittedQuestionRequestIds.has(qr.id) &&
        qr.questions.length > 0
      ) {
        state.emittedQuestionRequestIds.add(qr.id);
        const questions: NormalizedQuestion[] = qr.questions.map((q) => ({
          question: q.question,
          header: q.header,
          multiSelect: q.multiple ?? false,
          options: q.options.map((o) => ({
            label: o.label,
            description: o.description,
          })),
        }));
        agentEvents.push({
          type: 'question',
          request: {
            requestId: qr.id,
            questions,
          } satisfies NormalizedQuestionRequest,
        });
      }
    }

    return agentEvents;
  }

  /**
   * Persist raw message data and return the rawMessageId.
   */
  private async persistRawForMessage(
    state: OpenCodeSessionState,
    rawData: unknown,
  ): Promise<string | null> {
    try {
      const mergedDeltaId = await this.persistMergedDelta(state, rawData);
      if (mergedDeltaId) {
        return mergedDeltaId;
      }

      await this.flushRawDeltaRows(state);

      const messageIndex = state.messageIndex++;
      return await this.taskContext.persistRaw({
        messageIndex,
        backendSessionId: state.session.id,
        rawData,
      });
    } catch (error) {
      dbg.agent('Failed to persist raw message: %O', error);
      return null;
    }
  }

  private async persistMergedDelta(
    state: OpenCodeSessionState,
    rawData: unknown,
  ): Promise<string | null> {
    if (!this.taskContext.updateRaw || !isOpenCodeDeltaEvent(rawData)) {
      return null;
    }

    const key = getDeltaPersistenceKey(rawData);
    const existing = state.rawDeltaRows.get(key);
    if (!existing) {
      const messageIndex = state.messageIndex++;
      const rowId = await this.taskContext.persistRaw({
        messageIndex,
        backendSessionId: state.session.id,
        rawData,
      });
      state.rawDeltaRows.set(key, {
        rowId,
        rawData: cloneDeltaEvent(rawData),
        dirty: false,
      });
      return rowId;
    }

    existing.rawData = {
      ...existing.rawData,
      properties: {
        ...existing.rawData.properties,
        delta: existing.rawData.properties.delta + rawData.properties.delta,
      },
    };
    existing.dirty = true;
    return existing.rowId;
  }

  private async flushRawDeltaRows(state: OpenCodeSessionState): Promise<void> {
    if (!this.taskContext.updateRaw) {
      return;
    }

    for (const deltaRow of state.rawDeltaRows.values()) {
      if (!deltaRow.dirty) {
        continue;
      }

      await this.taskContext.updateRaw({
        rowId: deltaRow.rowId,
        rawData: deltaRow.rawData,
      });
      deltaRow.dirty = false;
    }
  }
}

type OpenCodeDeltaEvent = {
  type: 'message.part.delta';
  properties: {
    sessionID: string;
    messageID: string;
    partID: string;
    field: string;
    delta: string;
  };
};

function isOpenCodeDeltaEvent(value: unknown): value is OpenCodeDeltaEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as {
    type?: unknown;
    properties?: Record<string, unknown>;
  };
  if (event.type !== 'message.part.delta') return false;
  const props = event.properties;
  if (!props || typeof props !== 'object') return false;
  return (
    typeof props.sessionID === 'string' &&
    typeof props.messageID === 'string' &&
    typeof props.partID === 'string' &&
    typeof props.field === 'string' &&
    typeof props.delta === 'string'
  );
}

function getDeltaPersistenceKey(event: OpenCodeDeltaEvent): string {
  const { sessionID, messageID, partID, field } = event.properties;
  return [sessionID, messageID, partID, field].join('::');
}

function cloneDeltaEvent(event: OpenCodeDeltaEvent): OpenCodeDeltaEvent {
  return {
    ...event,
    properties: { ...event.properties },
  };
}

function cloneOpenCodePart(part: OcPart): OcPart {
  return structuredClone(part) as OcPart;
}
