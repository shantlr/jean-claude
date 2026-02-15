// Claude Code Agent SDK adapter.
// Wraps the @anthropic-ai/claude-agent-sdk `query()` function
// into the common AgentBackend interface.
//
// Architecture note: The SDK's `canUseTool` callback is invoked during the
// async generator iteration. When the callback is pending (waiting for user
// response), the SDK generator blocks — no new messages are yielded.
//
// We use an AsyncEventChannel to merge SDK messages with permission/question
// events. The channel allows `handleToolRequest` to push events that are
// immediately available to the consumer (agent-service), even while the SDK
// generator is blocked waiting for the canUseTool promise to resolve.

import { PermissionResult, query } from '@anthropic-ai/claude-agent-sdk';
import { nanoid } from 'nanoid';

import type {
  AgentBackend,
  AgentBackendConfig,
  AgentEvent,
  AgentSession,
  AgentTaskContext,
  NormalizedPermissionResponse,
  NormalizedPermissionRequest,
  NormalizedQuestionRequest,
  NormalizedQuestion,
} from '@shared/agent-backend-types';
import type { AgentMessage, AgentQuestion } from '@shared/agent-types';
import type { InteractionMode } from '@shared/types';

import { dbg } from '../../../lib/debug';
import {
  buildPermissionString,
  isToolAllowedByPermissions,
} from '../../permission-settings-service';

import { normalizeClaudeMessageV2 } from './normalize-claude-message-v2';
import type { NormalizationContext } from './normalize-claude-message-v2';

const SDK_PERMISSION_MODES = {
  ask: 'default',
  auto: 'bypassPermissions',
  plan: 'plan',
} as const;

// --- Async event channel ---
// Push-based async iterable: events pushed from any async context are
// immediately available to the consumer via `for await`.

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

interface PendingResolver {
  type: 'permission' | 'question';
  toolName: string;
  input: Record<string, unknown>;
  resolve: (result: PermissionResult) => void;
}

interface ClaudeSession {
  sessionId: string | null;
  abortController: AbortController;
  queryInstance: ReturnType<typeof query> | null;
  // Callbacks for pending permission/question requests
  pendingResolvers: Map<string, PendingResolver>;
  // Push-based event channel for merging SDK messages with permission/question events
  eventChannel: AsyncEventChannel<AgentEvent>;
  // Session-allowed tools (accumulated during this session)
  sessionAllowedTools: string[];
  // Working directory for permission checking
  workingDir?: string;
  // V2 normalization context (tracks session-id state)
  normalizationCtx: NormalizationContext;
  // Next raw message index for persistence ordering
  messageIndex: number;
}

export class ClaudeCodeBackend implements AgentBackend {
  private sessions = new Map<string, ClaudeSession>();
  private taskContext: AgentTaskContext;

  constructor(context: AgentTaskContext) {
    this.taskContext = context;
  }

  async start(
    config: AgentBackendConfig,
    prompt: string,
  ): Promise<AgentSession> {
    const sessionKey = nanoid();
    const abortController = new AbortController();

    const session: ClaudeSession = {
      sessionId: config.sessionId ?? null,
      abortController,
      queryInstance: null,
      pendingResolvers: new Map(),
      eventChannel: new AsyncEventChannel<AgentEvent>(),
      sessionAllowedTools: config.sessionAllowedTools ?? [],
      workingDir: config.cwd,
      normalizationCtx: {
        sessionIdEmitted: false,
        pendingToolUses: new Map(),
      },
      messageIndex: this.taskContext.sessionStartIndex,
    };
    this.sessions.set(sessionKey, session);

    // Start processing the SDK generator in the background.
    // Events are pushed to the channel and consumed by agent-service.
    this.runSdkGenerator(config, prompt, session, sessionKey);

    return {
      sessionId: sessionKey,
      events: session.eventChannel,
    };
  }

  async stop(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.abortController.abort();

    // Reject all pending resolvers
    for (const [, resolver] of session.pendingResolvers) {
      resolver.resolve({ behavior: 'deny', message: 'Session stopped' });
    }
    session.pendingResolvers.clear();

    // Close the channel so the consumer (agent-service) finishes iterating
    session.eventChannel.close();

    this.sessions.delete(sessionId);
  }

  async respondToPermission(
    sessionId: string,
    requestId: string,
    response: NormalizedPermissionResponse,
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`No Claude session: ${sessionId}`);
    }

    const resolver = session.pendingResolvers.get(requestId);
    if (!resolver) {
      throw new Error(`No pending request: ${requestId}`);
    }

    // Handle session-level tool allow
    if (response.toolsToAllow) {
      session.sessionAllowedTools.push(...response.toolsToAllow);
    }

    session.pendingResolvers.delete(requestId);

    if (response.behavior === 'allow') {
      resolver.resolve({
        behavior: 'allow',
        updatedInput: response.updatedInput,
      });
    } else {
      resolver.resolve({
        behavior: 'deny',
        message: response.message ?? 'Denied by user',
      });
    }
  }

  async respondToQuestion(
    sessionId: string,
    requestId: string,
    answer: Record<string, string>,
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`No Claude session: ${sessionId}`);
    }

    const resolver = session.pendingResolvers.get(requestId);
    if (!resolver) {
      throw new Error(`No pending request: ${requestId}`);
    }

    session.pendingResolvers.delete(requestId);
    // For questions, we return the answer as updatedInput with behavior: allow
    // This matches how the original agent-service handled AskUserQuestion
    resolver.resolve({
      behavior: 'allow',
      updatedInput: {
        questions: resolver.input.questions,
        answers: answer,
      },
    });
  }

  async setMode(sessionId: string, mode: InteractionMode): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session?.queryInstance) {
      await session.queryInstance.setPermissionMode(SDK_PERMISSION_MODES[mode]);
    }
  }

  /**
   * Get the accumulated session-allowed tools for a session.
   * Used by agent-service to persist back to the task.
   */
  getSessionAllowedTools(sessionId: string): string[] {
    const session = this.sessions.get(sessionId);
    return session?.sessionAllowedTools ?? [];
  }

  async dispose(): Promise<void> {
    for (const [sessionId] of this.sessions) {
      await this.stop(sessionId);
    }
  }

  // --- Private: SDK generator processing ---

  /**
   * Run the SDK generator in the background, pushing events to the channel.
   * Permission/question events from handleToolRequest are also pushed to the
   * same channel, so they're immediately available even when the SDK is blocked.
   */
  private async runSdkGenerator(
    config: AgentBackendConfig,
    prompt: string,
    session: ClaudeSession,
    sessionKey: string,
  ): Promise<void> {
    const sdkPermissionMode =
      SDK_PERMISSION_MODES[config.interactionMode ?? 'ask'];

    // Strip NODE_ENV from the environment passed to the agent session.
    // Jean-Claude runs as an Electron app which sets NODE_ENV (e.g. "production"),
    // but forwarding it to the agent breaks tools like vitest that require
    // NODE_ENV to be unset or "test".
    const { NODE_ENV: _nodeEnv, ...agentEnv } = process.env;

    const queryOptions: NonNullable<Parameters<typeof query>[0]['options']> = {
      cwd: config.cwd,
      env: agentEnv as Record<string, string>,
      allowedTools: [],
      canUseTool: async (
        toolName: string,
        input: Record<string, unknown>,
      ): Promise<PermissionResult> => {
        return this.handleToolRequest(session, toolName, input);
      },
      permissionMode: sdkPermissionMode,
      settingSources: ['user', 'project', 'local'],
      abortController: session.abortController,
    };

    if (config.model && config.model !== 'default') {
      queryOptions.model = config.model;
    }

    if (session.sessionId) {
      queryOptions.resume = session.sessionId;
    }

    const generator = query({ prompt, options: queryOptions });
    session.queryInstance = generator;

    try {
      for await (const rawMessage of generator) {
        if (session.abortController.signal.aborted) {
          break;
        }

        const message = rawMessage as AgentMessage;

        // 1. Persist raw message
        const rawMessageId = await this.taskContext.persistRaw({
          messageIndex: session.messageIndex++,
          backendSessionId: session.sessionId,
          rawData: message,
        });

        // 2. Normalize (stateful V2)
        const events = normalizeClaudeMessageV2(
          message,
          session.normalizationCtx,
        );

        // 3. Update normalization context
        for (const event of events) {
          if (event.type === 'session-id') {
            session.sessionId = event.sessionId;
            session.normalizationCtx.sessionIdEmitted = true;
          }
        }

        // 4. Convert normalization events to AgentEvents and push
        // Only 'entry' needs special handling (add rawMessageId);
        // all other variants are structurally compatible.
        for (const event of events) {
          if (event.type === 'entry') {
            session.eventChannel.push({ ...event, rawMessageId });
          } else {
            session.eventChannel.push(event as AgentEvent);
          }
        }
      }
    } catch (error) {
      // SDK threw an unexpected error — push it as an error event so
      // agent-service can surface it to the user instead of silently
      // dropping it (runSdkGenerator is called fire-and-forget).
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown SDK error';
      dbg.agent(
        'SDK generator error for session %s: %s',
        sessionKey,
        errorMessage,
      );
      session.eventChannel.push({
        type: 'error',
        error: errorMessage,
      });
    } finally {
      session.eventChannel.close();
      this.sessions.delete(sessionKey);
    }
  }

  /**
   * Build a session-allow button for a given tool request.
   * This determines what appears as the "Allow for session" button in the UI.
   */
  private getSessionAllowButton(
    toolName: string,
    input: Record<string, unknown>,
  ): NormalizedPermissionRequest['sessionAllowButton'] | undefined {
    if (toolName === 'ExitPlanMode') {
      return {
        label: 'Allow and Auto-Edit',
        toolsToAllow: ['Edit', 'Write'],
        setModeOnAllow: 'ask',
      };
    }

    const permission = buildPermissionString(toolName, input);
    if (!permission) return undefined;

    return {
      label: `Allow ${toolName} for Session`,
      toolsToAllow: [permission],
    };
  }

  /**
   * Handle a tool use request from the SDK's `canUseTool` callback.
   *
   * This runs inside the SDK's async iteration — the generator won't produce
   * the next message until this promise resolves. We push permission/question
   * events directly to the eventChannel so they're immediately available to
   * the consumer (agent-service), even while the SDK generator is blocked.
   */
  private handleToolRequest(
    session: ClaudeSession,
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<PermissionResult> {
    dbg.agentPermission('Tool request: %s', toolName);

    // Check if tool is in session-allowed list
    if (
      isToolAllowedByPermissions(toolName, input, session.sessionAllowedTools, {
        workingDir: session.workingDir,
      })
    ) {
      dbg.agentPermission('Tool %s is session-allowed', toolName);
      return Promise.resolve({ behavior: 'allow', updatedInput: input });
    }

    const requestId = nanoid();

    return new Promise<PermissionResult>((resolve) => {
      const isQuestion = toolName === 'AskUserQuestion';

      // Store the resolver so respondToPermission/respondToQuestion can complete it
      session.pendingResolvers.set(requestId, {
        type: isQuestion ? 'question' : 'permission',
        toolName,
        input,
        resolve,
      });

      // Push events directly to the channel — they're immediately available
      // to the consumer even though the SDK generator is blocked here.
      if (isQuestion) {
        const questions = (input.questions as AgentQuestion[]).map(
          (q): NormalizedQuestion => ({
            question: q.question,
            header: q.header,
            options: q.options.map((o) => ({
              label: o.label,
              description: o.description,
            })),
            multiSelect: q.multiSelect,
          }),
        );

        session.eventChannel.push({
          type: 'question',
          request: {
            requestId,
            questions,
          } satisfies NormalizedQuestionRequest,
        });
      } else {
        const sessionAllowButton = this.getSessionAllowButton(toolName, input);
        session.eventChannel.push({
          type: 'permission-request',
          request: {
            requestId,
            toolName,
            input,
            sessionAllowButton,
          } satisfies NormalizedPermissionRequest,
        });
      }
    });
  }
}
