// Claude Code Agent SDK adapter.
// Wraps the @anthropic-ai/claude-agent-sdk `query()` function
// into the common AgentBackend interface.
//
// Architecture note: The SDK's `canUseTool` callback is invoked synchronously
// within the async generator iteration. When the callback is pending (waiting
// for user response), the SDK generator blocks — no new messages are yielded.
// This means the backend's event stream naturally pauses during permission/question
// requests. We use a "side channel" queue to inject permission-request and question
// events into the stream between SDK messages.

import { PermissionResult, query } from '@anthropic-ai/claude-agent-sdk';
import { nanoid } from 'nanoid';

import type {
  AgentBackend,
  AgentBackendConfig,
  AgentEvent,
  AgentSession,
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

import { normalizeClaudeMessage } from './normalize-claude-message';

const SDK_PERMISSION_MODES = {
  ask: 'default',
  auto: 'bypassPermissions',
  plan: 'plan',
} as const;

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
  // Side-channel event queue: permission-request and question events
  // that the async generator should yield between SDK messages.
  sideChannelQueue: AgentEvent[];
  // Session-allowed tools (accumulated during this session)
  sessionAllowedTools: string[];
  // Working directory for permission checking
  workingDir?: string;
}

export class ClaudeCodeBackend implements AgentBackend {
  private sessions = new Map<string, ClaudeSession>();

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
      sideChannelQueue: [],
      sessionAllowedTools: config.sessionAllowedTools ?? [],
      workingDir: config.cwd,
    };
    this.sessions.set(sessionKey, session);

    const events = this.createEventStream(config, prompt, session, sessionKey);

    return {
      sessionId: sessionKey,
      events,
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

  // --- Private: event stream creation ---

  private async *createEventStream(
    config: AgentBackendConfig,
    prompt: string,
    session: ClaudeSession,
    sessionKey: string,
  ): AsyncGenerator<AgentEvent> {
    const sdkPermissionMode =
      SDK_PERMISSION_MODES[config.interactionMode ?? 'ask'];

    const queryOptions: NonNullable<Parameters<typeof query>[0]['options']> = {
      cwd: config.cwd,
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

    let hasEmittedSessionId = false;

    try {
      for await (const rawMessage of generator) {
        if (session.abortController.signal.aborted) {
          break;
        }

        // Drain side-channel queue first (permission/question events)
        // These were pushed while the SDK was processing the canUseTool callback
        while (session.sideChannelQueue.length > 0) {
          const event = session.sideChannelQueue.shift()!;
          yield event;
        }

        const message = rawMessage as AgentMessage;

        // Capture session ID from first message that has it
        if (!hasEmittedSessionId && message.session_id) {
          session.sessionId = message.session_id;
          hasEmittedSessionId = true;
          yield { type: 'session-id', sessionId: message.session_id };
        }

        // Emit raw message event (agent-service persists raw + normalized)
        yield {
          type: 'message',
          message: normalizeClaudeMessage(message)!,
          _raw: message, // Attach raw for persistence
        } as AgentEvent & { _raw: AgentMessage };

        // Handle result message — emit completion event
        if (message.type === 'result') {
          yield {
            type: 'complete',
            result: {
              text: message.result,
              isError: !!message.is_error,
              cost:
                message.total_cost_usd != null
                  ? { costUsd: message.total_cost_usd }
                  : undefined,
              durationMs: message.duration_ms,
              usage: message.usage
                ? {
                    inputTokens: message.usage.input_tokens ?? 0,
                    outputTokens: message.usage.output_tokens ?? 0,
                    cacheReadTokens: message.usage.cache_read_input_tokens,
                    cacheCreationTokens:
                      message.usage.cache_creation_input_tokens,
                  }
                : undefined,
            },
          };
        }
      }

      // Drain any remaining side-channel events
      while (session.sideChannelQueue.length > 0) {
        const event = session.sideChannelQueue.shift()!;
        yield event;
      }
    } finally {
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
   * the next message until this promise resolves. We push a permission-request
   * or question event into the side-channel queue so the agent-service can
   * emit IPC events to the renderer and wait for user input.
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

      // Push the appropriate event into the side-channel queue
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

        const event: AgentEvent = {
          type: 'question',
          request: {
            requestId,
            questions,
          } satisfies NormalizedQuestionRequest,
        };
        session.sideChannelQueue.push(event);
      } else {
        const sessionAllowButton = this.getSessionAllowButton(toolName, input);
        const event: AgentEvent = {
          type: 'permission-request',
          request: {
            requestId,
            toolName,
            input,
            sessionAllowButton,
          } satisfies NormalizedPermissionRequest,
        };
        session.sideChannelQueue.push(event);
      }

      // Note: the SDK generator blocks during canUseTool, so the side-channel
      // events will be drained when the next message is yielded after this
      // promise resolves.
    });
  }
}
