// Agent Service — backend-agnostic orchestration layer.
// Manages agent sessions using the AgentBackend interface.
// Handles session lifecycle, message persistence, IPC forwarding,
// prompt queueing, notifications, and session allow tools.

import { BrowserWindow } from 'electron';
import { nanoid } from 'nanoid';

import type {
  AgentBackend,
  AgentBackendType,
  AgentEvent,
  NormalizedMessage,
  NormalizedPermissionRequest,
  NormalizedQuestion,
  NormalizedQuestionRequest,
} from '@shared/agent-backend-types';
import {
  AGENT_CHANNELS,
  type AgentQuestion,
  type PermissionResponse,
  type QuestionResponse,
  type QueuedPrompt,
  type AgentPermissionEvent,
  type AgentQuestionEvent,
  type SessionAllowButton,
} from '@shared/agent-types';
import type { InteractionMode } from '@shared/types';

import {
  TaskRepository,
  ProjectRepository,
  AgentMessageRepository,
  RawMessageRepository,
} from '../database/repositories';
import { dbg } from '../lib/debug';
import { pathExists } from '../lib/fs';

import { AGENT_BACKEND_CLASSES } from './agent-backends';
import { generateTaskName } from './name-generation-service';
import { notificationService } from './notification-service';

// --- Active session tracking ---

interface ActiveSession {
  taskId: string;
  backendSessionId: string | null; // The session ID from the backend
  sdkSessionId: string | null; // The persistent session ID for resumption
  backendType: AgentBackendType;
  backend: AgentBackend;
  messageIndex: number;
  queuedPrompts: QueuedPrompt[];
  abortController: AbortController;
  // Track pending requests for getPendingRequest()
  pendingRequests: Array<{
    requestId: string;
    type: 'permission' | 'question';
    permissionRequest?: NormalizedPermissionRequest;
    questionRequest?: NormalizedQuestionRequest;
  }>;
  // Track normalized message ids that have been persisted.
  // Maps normalizedMessage.id → raw_messages row id (or null for synthetic).
  // When a streaming update re-emits the same message id, we UPDATE instead of INSERT.
  persistedMessageIds: Map<string, string | null>;
}

class AgentService {
  private sessions: Map<string, ActiveSession> = new Map();
  private mainWindow: BrowserWindow | null = null;

  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window;
  }

  private emit(channel: string, payload: unknown) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, payload);
    }
  }

  private emitStatus(
    taskId: string,
    status: 'running' | 'waiting' | 'completed' | 'errored' | 'interrupted',
    error?: string,
  ) {
    dbg.agentSession(
      'Task %s status → %s%s',
      taskId,
      status,
      error ? ` (${error})` : '',
    );
    this.emit(AGENT_CHANNELS.STATUS, { taskId, status, error });
  }

  /**
   * Persist a raw SDK message to the raw_messages table.
   * Returns the created row ID so it can be linked from agent_messages.
   */
  private async persistRawMessage(
    taskId: string,
    session: ActiveSession,
    raw: unknown,
  ): Promise<string> {
    const row = await RawMessageRepository.create({
      taskId,
      messageIndex: session.messageIndex,
      backendSessionId: session.backendSessionId,
      rawData: raw,
      rawFormat: session.backendType,
    });
    return row.id;
  }

  /**
   * Persist and emit a normalized message linked to a raw message.
   * The raw message must be persisted first (via persistRawMessage).
   *
   * Handles streaming updates: if a message with the same normalized `id`
   * was already persisted in this session, UPDATE the existing rows instead
   * of inserting new ones (prevents duplicate rows from streaming deltas).
   */
  private async persistAndEmitMessage(
    taskId: string,
    session: ActiveSession,
    normalized: NormalizedMessage,
    rawMessageId: string | null,
  ) {
    try {
      const alreadyPersisted = session.persistedMessageIds.has(normalized.id);

      if (alreadyPersisted) {
        // Streaming update — update the existing row in-place
        // (normalizedData and rawMessageId are both updated to the latest values)
        dbg.agentMessage(
          'Updating existing message %s for task %s (streaming update)',
          normalized.id,
          taskId,
        );
        await AgentMessageRepository.updateNormalizedData({
          taskId,
          normalizedId: normalized.id,
          normalized,
          rawMessageId,
        });
      } else {
        // First time seeing this message id — insert new row
        dbg.agentMessage(
          'Persisting message %d for task %s, role: %s',
          session.messageIndex,
          taskId,
          normalized.role,
        );
        await AgentMessageRepository.create({
          taskId,
          messageIndex: session.messageIndex,
          normalized,
          rawMessageId,
        });
        session.messageIndex++;
      }

      // Track this message id (with latest raw row id)
      session.persistedMessageIds.set(normalized.id, rawMessageId);
    } catch (error) {
      dbg.agent('Failed to persist message: %O', error);
    }

    dbg.agentMessage(
      'Emitting message for task %s, role: %s',
      taskId,
      normalized.role,
    );
    this.emit(AGENT_CHANNELS.MESSAGE, { taskId, message: normalized });
  }

  /**
   * Persist and emit a synthetic normalized message (not from a backend).
   * Used for user message echo and interruption messages generated by agent-service.
   * These have no raw SDK backing, so rawMessageId is null.
   */
  private async persistAndEmitSyntheticMessage(
    taskId: string,
    session: ActiveSession,
    normalized: NormalizedMessage,
  ) {
    await this.persistAndEmitMessage(taskId, session, normalized, null);
  }

  private async emitPermissionRequest(
    taskId: string,
    request: NormalizedPermissionRequest,
  ) {
    const event: AgentPermissionEvent = {
      taskId,
      requestId: request.requestId,
      toolName: request.toolName,
      input: request.input as Record<string, unknown>,
      sessionAllowButton: request.sessionAllowButton as
        | SessionAllowButton
        | undefined,
    };
    this.emit(AGENT_CHANNELS.PERMISSION, event);

    // Send desktop notification if window not focused
    if (this.mainWindow && !this.mainWindow.isFocused()) {
      const task = await TaskRepository.findById(taskId);
      notificationService.notify(
        'Permission Required',
        `Task "${task?.name || 'Unknown'}" needs approval for ${request.toolName}`,
        () => {
          this.mainWindow?.focus();
        },
      );
    }
  }

  private async emitQuestionRequest(
    taskId: string,
    request: NormalizedQuestionRequest,
  ) {
    // Convert NormalizedQuestion[] to AgentQuestion[] for backward compat
    const questions: AgentQuestion[] = request.questions.map(
      (q: NormalizedQuestion) => ({
        question: q.question,
        header: q.header,
        options: q.options.map((o) => ({
          label: o.label,
          description: o.description,
        })),
        multiSelect: q.multiSelect,
      }),
    );

    const event: AgentQuestionEvent = {
      taskId,
      requestId: request.requestId,
      questions,
    };
    this.emit(AGENT_CHANNELS.QUESTION, event);

    // Send desktop notification if window not focused
    if (this.mainWindow && !this.mainWindow.isFocused()) {
      const task = await TaskRepository.findById(taskId);
      notificationService.notify(
        'Question from Agent',
        `Task "${task?.name || 'Unknown'}" has a question`,
        () => {
          this.mainWindow?.focus();
        },
      );
    }
  }

  private emitTaskNameUpdated(taskId: string, name: string) {
    this.emit(AGENT_CHANNELS.NAME_UPDATED, { taskId, name });
  }

  private emitPromptQueueUpdate(taskId: string, queuedPrompts: QueuedPrompt[]) {
    this.emit(AGENT_CHANNELS.QUEUE_UPDATE, { taskId, queuedPrompts });
  }

  private async generateAndPersistTaskName(
    taskId: string,
    prompt: string,
  ): Promise<void> {
    try {
      const name = await generateTaskName(prompt);
      if (name) {
        await TaskRepository.update(taskId, { name });
        this.emitTaskNameUpdated(taskId, name);
        dbg.agent('Generated task name for %s: %s', taskId, name);
      }
    } catch (error) {
      dbg.agent('Failed to generate task name for %s: %O', taskId, error);
    }
  }

  // --- Session management ---

  private async createSession(taskId: string): Promise<ActiveSession> {
    const existingMessageCount =
      await AgentMessageRepository.getMessageCount(taskId);
    const task = await TaskRepository.findById(taskId);

    const backendType: AgentBackendType = task!.agentBackend;
    const BackendClass = AGENT_BACKEND_CLASSES[backendType];
    if (!BackendClass) {
      throw new Error(`Unknown agent backend: "${backendType}"`);
    }
    const backend = new BackendClass();

    const session: ActiveSession = {
      taskId,
      backendSessionId: null,
      sdkSessionId: task?.sessionId ?? null,
      backendType,
      backend,
      messageIndex: existingMessageCount,
      queuedPrompts: [],
      abortController: new AbortController(),
      pendingRequests: [],
      persistedMessageIds: new Map(),
    };

    this.sessions.set(taskId, session);
    dbg.agentSession(
      'Created session for task %s (backend: %s, resuming: %s, messageIndex: %d)',
      taskId,
      backendType,
      session.sdkSessionId ? 'yes' : 'no',
      existingMessageCount,
    );
    return session;
  }

  // --- Main event loop ---

  /**
   * Run the agent backend for a task, processing events from the backend's
   * event stream. Handles message persistence, permission/question forwarding,
   * result handling, and queued prompts.
   */
  private async runBackend(
    taskId: string,
    prompt: string,
    session: ActiveSession,
    options?: { generateNameOnInit?: boolean; initialPrompt?: string },
  ): Promise<void> {
    const task = await TaskRepository.findById(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const project = await ProjectRepository.findById(task.projectId);
    if (!project) {
      throw new Error(`Project ${task.projectId} not found`);
    }

    // Validate worktree exists if this is a worktree task
    if (task.worktreePath && !(await pathExists(task.worktreePath))) {
      throw new Error(
        `The worktree for this task has been deleted. To continue working, ` +
          `create a new task or restore the worktree at: ${task.worktreePath}`,
      );
    }

    const workingDir = task.worktreePath ?? project.path;

    dbg.agentSession(
      'runBackend for task %s: backend=%s, cwd=%s, resuming=%s',
      taskId,
      session.backendType,
      workingDir,
      session.sdkSessionId ? 'yes' : 'no',
    );

    if (task.status !== 'running') {
      await TaskRepository.update(taskId, { status: 'running' });
      this.emitStatus(taskId, 'running');
    }

    // Create new abort controller for this query iteration
    session.abortController = new AbortController();

    if (options?.generateNameOnInit && task.name === null) {
      // NOTE: fire-and-forget
      void this.generateAndPersistTaskName(
        taskId,
        options.initialPrompt ?? prompt,
      ).catch((err) => {
        dbg.agent('Error generating task name: %O', err);
      });
    }

    // Emit user message before starting the backend
    await this.persistAndEmitSyntheticMessage(taskId, session, {
      id: nanoid(),
      role: 'user',
      parts: [{ type: 'text', text: prompt }],
      timestamp: new Date().toISOString(),
    });

    // Start the backend
    dbg.agentSession('Starting backend for task %s', taskId);
    const agentSession = await session.backend.start(
      {
        type: session.backendType,
        cwd: workingDir,
        interactionMode: (task.interactionMode ?? 'ask') as InteractionMode,
        model:
          task.modelPreference && task.modelPreference !== 'default'
            ? task.modelPreference
            : undefined,
        sessionId: session.sdkSessionId ?? undefined,
        sessionAllowedTools: task.sessionAllowedTools ?? [],
      },
      prompt,
    );

    session.backendSessionId = agentSession.sessionId;

    // Process the event stream
    for await (const event of agentSession.events) {
      if (session.abortController.signal.aborted) {
        dbg.agentSession('Task %s aborted, breaking event loop', taskId);
        break;
      }

      await this.processEvent(taskId, session, event);
    }
  }

  /**
   * Process a single event from the backend event stream.
   */
  private async processEvent(
    taskId: string,
    session: ActiveSession,
    event: AgentEvent,
  ): Promise<void> {
    switch (event.type) {
      case 'session-id': {
        session.sdkSessionId = event.sessionId;
        await TaskRepository.update(taskId, { sessionId: event.sessionId });
        dbg.agentSession(
          'Captured session ID for task %s: %s',
          taskId,
          event.sessionId,
        );
        break;
      }

      case 'message': {
        // Extract raw SDK data if the backend attached it
        const raw =
          (event as AgentEvent & { _raw?: unknown })._raw ?? event.message;

        // Check if this is a streaming update for a message we've already persisted
        const normalizedId = event.message?.id;
        const isStreamingUpdate =
          normalizedId !== undefined &&
          session.persistedMessageIds.has(normalizedId);

        let rawMessageId: string | null;

        if (isStreamingUpdate) {
          // Update the existing raw message row in-place
          const existingRawId =
            session.persistedMessageIds.get(normalizedId) ?? null;
          if (existingRawId) {
            await RawMessageRepository.updateRawData(existingRawId, raw);
          }
          rawMessageId = existingRawId;
        } else {
          // First time seeing this message — insert a new raw row
          rawMessageId = await this.persistRawMessage(taskId, session, raw);
        }

        // Persist + emit the normalized message, linked to the raw row
        if (event.message) {
          await this.persistAndEmitMessage(
            taskId,
            session,
            event.message,
            rawMessageId,
          );
        } else if (!isStreamingUpdate) {
          // Raw-only message (normalization skipped). Still bump the index
          // so raw_messages.messageIndex stays consistent.
          session.messageIndex++;
        }
        break;
      }

      case 'permission-request': {
        const request = event.request;
        // Track the pending request
        session.pendingRequests.push({
          requestId: request.requestId,
          type: 'permission',
          permissionRequest: request,
        });

        await TaskRepository.update(taskId, { status: 'waiting' });
        this.emitStatus(taskId, 'waiting');
        await this.emitPermissionRequest(taskId, request);
        break;
      }

      case 'question': {
        const request = event.request;
        // Track the pending request
        session.pendingRequests.push({
          requestId: request.requestId,
          type: 'question',
          questionRequest: request,
        });

        await TaskRepository.update(taskId, { status: 'waiting' });
        this.emitStatus(taskId, 'waiting');
        await this.emitQuestionRequest(taskId, request);
        break;
      }

      case 'complete': {
        const result = event.result;
        dbg.agentSession(
          'Task %s received result (isError: %s, queued: %d)',
          taskId,
          result.isError,
          session.queuedPrompts.length,
        );

        // Sync session-allowed tools back to the task
        if (
          session.backend.getSessionAllowedTools &&
          session.backendSessionId
        ) {
          const tools = session.backend.getSessionAllowedTools(
            session.backendSessionId,
          );
          if (tools.length > 0) {
            const currentTask = await TaskRepository.findById(taskId);
            const existingTools = currentTask?.sessionAllowedTools ?? [];
            const merged = [...new Set([...existingTools, ...tools])];
            if (merged.length !== existingTools.length) {
              await TaskRepository.update(taskId, {
                sessionAllowedTools: merged,
              });
            }
          }
        }

        // Check for queued prompts
        const nextPrompt = session.queuedPrompts.shift();
        if (nextPrompt && !result.isError) {
          dbg.agentSession('Task %s processing next queued prompt', taskId);
          this.emitPromptQueueUpdate(taskId, session.queuedPrompts);
          // Recursively process next queued prompt
          return await this.runBackend(taskId, nextPrompt.content, session);
        }

        // No more queued prompts - finalize
        const status = result.isError ? 'errored' : 'completed';
        await TaskRepository.update(taskId, { status });
        this.emitStatus(taskId, status);

        // Notify on completion
        if (this.mainWindow && !this.mainWindow.isFocused()) {
          const updatedTask = await TaskRepository.findById(taskId);
          notificationService.notify(
            status === 'completed' ? 'Task Completed' : 'Task Failed',
            `Task "${updatedTask?.name || 'Unknown'}" ${status === 'completed' ? 'finished successfully' : 'encountered an error'}`,
            () => {
              this.mainWindow?.focus();
            },
          );
        }
        break;
      }

      case 'error': {
        dbg.agent('Backend error for task %s: %s', taskId, event.error);
        await TaskRepository.update(taskId, { status: 'errored' });
        this.emitStatus(taskId, 'errored', event.error);
        break;
      }

      case 'mode-change': {
        await TaskRepository.update(taskId, { interactionMode: event.mode });
        break;
      }

      default:
        // Other event types (session-updated, tool-state-update, etc.)
        // are logged but not actively handled yet
        dbg.agent('Unhandled event type for task %s: %s', taskId, event.type);
        break;
    }
  }

  // --- Public API ---

  async start(taskId: string): Promise<void> {
    // Check if already running
    if (this.sessions.has(taskId)) {
      throw new Error(`Agent already running for task ${taskId}`);
    }

    // Get task info for prompt
    const task = await TaskRepository.findById(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    // Create session
    const session = await this.createSession(taskId);

    // Update task status
    await TaskRepository.update(taskId, { status: 'running' });
    this.emitStatus(taskId, 'running');

    try {
      dbg.agentSession('Starting agent for task %s', taskId);
      await this.runBackend(taskId, task.prompt, session, {
        generateNameOnInit: true,
        initialPrompt: task.prompt,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      await TaskRepository.update(taskId, { status: 'errored' });
      this.emitStatus(taskId, 'errored', errorMessage);
    } finally {
      this.sessions.delete(taskId);
    }
  }

  async stop(taskId: string): Promise<void> {
    dbg.agentSession('Stopping task %s', taskId);
    const session = this.sessions.get(taskId);
    if (!session) {
      dbg.agentSession('No session found for task %s, nothing to stop', taskId);
      return;
    }

    // Clear queued prompts
    session.queuedPrompts = [];
    this.emitPromptQueueUpdate(taskId, []);

    session.abortController.abort();

    // Stop the backend
    if (session.backendSessionId) {
      await session.backend.stop(session.backendSessionId);
    }

    // Emit a custom interruption message
    await this.persistAndEmitSyntheticMessage(taskId, session, {
      id: nanoid(),
      role: 'result',
      parts: [{ type: 'text', text: 'Task interrupted by user' }],
      timestamp: new Date().toISOString(),
      isError: true,
      result: 'Task interrupted by user',
    });

    await TaskRepository.update(taskId, { status: 'interrupted' });
    this.emitStatus(taskId, 'interrupted', 'Stopped by user');
    this.sessions.delete(taskId);
    dbg.agentSession('Task %s stopped and session cleaned up', taskId);
  }

  async respond(
    taskId: string,
    requestId: string,
    response: PermissionResponse | QuestionResponse,
  ): Promise<void> {
    dbg.agentPermission(
      'Responding to request %s for task %s',
      requestId,
      taskId,
    );
    const session = this.sessions.get(taskId);
    if (!session) {
      throw new Error(`No active session for task ${taskId}`);
    }

    // Find and remove the pending request
    const requestIndex = session.pendingRequests.findIndex(
      (r) => r.requestId === requestId,
    );
    if (requestIndex === -1) {
      throw new Error(`No pending request with ID ${requestId}`);
    }

    const [request] = session.pendingRequests.splice(requestIndex, 1);
    dbg.agentPermission(
      'Resolved %s request (remaining pending: %d)',
      request.type,
      session.pendingRequests.length,
    );

    // Forward to the backend
    if (request.type === 'permission') {
      const permResponse = response as PermissionResponse;
      await session.backend.respondToPermission(
        session.backendSessionId!,
        requestId,
        {
          behavior: permResponse.behavior,
          updatedInput: permResponse.updatedInput,
          message: permResponse.message,
        },
      );
    } else {
      const questionResponse = response as QuestionResponse;
      await session.backend.respondToQuestion(
        session.backendSessionId!,
        requestId,
        questionResponse.answers,
      );
    }

    // Resume running status
    await TaskRepository.update(taskId, { status: 'running' });
    this.emitStatus(taskId, 'running');

    // If there are more pending requests, emit the next one
    if (session.pendingRequests.length > 0) {
      const next = session.pendingRequests[0];
      if (next.type === 'question' && next.questionRequest) {
        await this.emitQuestionRequest(taskId, next.questionRequest);
      } else if (next.type === 'permission' && next.permissionRequest) {
        await this.emitPermissionRequest(taskId, next.permissionRequest);
      }
    }
  }

  async sendMessage(taskId: string, message: string): Promise<void> {
    // If session exists and running, stop it first
    if (this.sessions.has(taskId)) {
      await this.stop(taskId);
    }

    // Create new session (will pick up existing sessionId for resume)
    const session = await this.createSession(taskId);

    try {
      dbg.agentSession('Sending follow-up message for task %s', taskId);
      await this.runBackend(taskId, message, session);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      await TaskRepository.update(taskId, { status: 'errored' });
      this.emitStatus(taskId, 'errored', errorMessage);
    } finally {
      this.sessions.delete(taskId);
    }
  }

  /**
   * Queue a prompt to be sent after the current agent work completes.
   */
  queuePrompt(taskId: string, prompt: string): { promptId: string } {
    const session = this.sessions.get(taskId);
    if (!session) {
      throw new Error(`No active session for task ${taskId}`);
    }

    const queuedPrompt: QueuedPrompt = {
      id: nanoid(),
      content: prompt,
      createdAt: Date.now(),
    };

    session.queuedPrompts.push(queuedPrompt);
    this.emitPromptQueueUpdate(taskId, session.queuedPrompts);

    dbg.agent('Queued prompt %s for task %s', queuedPrompt.id, taskId);
    return { promptId: queuedPrompt.id };
  }

  /**
   * Cancel a specific queued prompt.
   */
  cancelQueuedPrompt(taskId: string, promptId: string): void {
    const session = this.sessions.get(taskId);
    if (!session) {
      throw new Error(`No active session for task ${taskId}`);
    }

    const index = session.queuedPrompts.findIndex((p) => p.id === promptId);
    if (index === -1) {
      throw new Error(`Queued prompt ${promptId} not found`);
    }

    session.queuedPrompts.splice(index, 1);
    this.emitPromptQueueUpdate(taskId, session.queuedPrompts);

    dbg.agent('Cancelled queued prompt %s for task %s', promptId, taskId);
  }

  /**
   * Get current queued prompts for a task.
   */
  getQueuedPrompts(taskId: string): QueuedPrompt[] {
    const session = this.sessions.get(taskId);
    return session?.queuedPrompts ?? [];
  }

  /**
   * Get the current pending request for a task (permission or question).
   * Returns null if no pending request exists.
   */
  getPendingRequest(taskId: string):
    | {
        type: 'permission';
        data: AgentPermissionEvent;
      }
    | {
        type: 'question';
        data: AgentQuestionEvent;
      }
    | null {
    const session = this.sessions.get(taskId);
    if (!session || session.pendingRequests.length === 0) {
      return null;
    }

    const request = session.pendingRequests[0];
    if (request.type === 'question' && request.questionRequest) {
      return {
        type: 'question',
        data: {
          taskId,
          requestId: request.requestId,
          questions: request.questionRequest.questions.map(
            (q: NormalizedQuestion) => ({
              question: q.question,
              header: q.header,
              options: q.options.map((o) => ({
                label: o.label,
                description: o.description,
              })),
              multiSelect: q.multiSelect,
            }),
          ),
        },
      };
    }

    if (request.type === 'permission' && request.permissionRequest) {
      return {
        type: 'permission',
        data: {
          taskId,
          requestId: request.requestId,
          toolName: request.permissionRequest.toolName,
          input: request.permissionRequest.input as Record<string, unknown>,
          sessionAllowButton: request.permissionRequest.sessionAllowButton as
            | SessionAllowButton
            | undefined,
        },
      };
    }

    return null;
  }

  async setMode(taskId: string, mode: InteractionMode): Promise<void> {
    dbg.agentSession('Setting mode for task %s to %s', taskId, mode);
    const session = this.sessions.get(taskId);
    if (session?.backendSessionId) {
      await session.backend.setMode(session.backendSessionId, mode);
      dbg.agentSession('Updated backend permission mode for active session');
    }
    await TaskRepository.update(taskId, { interactionMode: mode });
  }

  isRunning(taskId: string): boolean {
    return this.sessions.has(taskId);
  }

  async getMessages(taskId: string): Promise<NormalizedMessage[]> {
    return AgentMessageRepository.findByTaskId(taskId);
  }

  async getMessageCount(taskId: string): Promise<number> {
    return AgentMessageRepository.getMessageCount(taskId);
  }

  async getRawMessages(taskId: string) {
    const rows = await RawMessageRepository.findByTaskId(taskId);
    return rows.map((row) => ({
      id: row.id,
      taskId: row.taskId,
      messageIndex: row.messageIndex,
      backendSessionId: row.backendSessionId,
      rawFormat: row.rawFormat,
      rawData: JSON.parse(row.rawData),
      createdAt: row.createdAt,
    }));
  }

  /**
   * Recover tasks that were left in 'running' or 'waiting' state from a previous app session.
   * These tasks were interrupted by app shutdown/crash and should be marked as 'interrupted'.
   * Should be called on app startup before the main window is shown.
   */
  async recoverStaleTasks(): Promise<void> {
    const staleTasks = await TaskRepository.findByStatuses([
      'running',
      'waiting',
    ]);

    for (const task of staleTasks) {
      await TaskRepository.update(task.id, { status: 'interrupted' });
      // Note: No need to emit status here since no UI is connected yet at startup
    }

    if (staleTasks.length > 0) {
      dbg.agent('Recovered %d stale task(s) on startup', staleTasks.length);
    }
  }
}

export const agentService = new AgentService();
