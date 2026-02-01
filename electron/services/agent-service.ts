import { PermissionResult, query } from '@anthropic-ai/claude-agent-sdk';
import { BrowserWindow } from 'electron';
import { nanoid } from 'nanoid';

import {
  AGENT_CHANNELS,
  AgentMessage,
  PermissionResponse,
  QuestionResponse,
  AgentQuestion,
  SessionAllowButton,
  QueuedPrompt,
  AgentPermissionEvent,
  AgentQuestionEvent,
} from '../../shared/agent-types';
import type { InteractionMode } from '../../shared/types';
import {
  TaskRepository,
  ProjectRepository,
  AgentMessageRepository,
} from '../database/repositories';
import { dbg } from '../lib/debug';
import { pathExists } from '../lib/fs';

import { notificationService } from './notification-service';
import {
  buildPermissionString,
  isToolAllowedByPermissions,
} from './permission-settings-service';

const SDK_PERMISSION_MODES = {
  ask: 'default',
  auto: 'bypassPermissions',
  plan: 'plan',
} as const;

const TASK_NAME_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
  },
  required: ['name'],
} as const;

interface PendingRequest {
  requestId: string;
  type: 'permission' | 'question';
  toolName: string;
  input: Record<string, unknown>;
  resolve: (response: PermissionResponse | QuestionResponse) => void;
}

interface ActiveSession {
  taskId: string;
  sessionId: string | null;
  abortController: AbortController;
  pendingRequests: PendingRequest[];
  messageGenerator: AsyncGenerator<unknown> | null;
  messageIndex: number;
  queryInstance: ReturnType<typeof query> | null;
  queuedPrompts: QueuedPrompt[];
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

  private async emitMessage(taskId: string, message: AgentMessage) {
    // Persist to database
    const session = this.sessions.get(taskId);
    if (session) {
      try {
        dbg.agentMessage(
          'Persisting message %d for task %s, type: %s',
          session.messageIndex,
          taskId,
          message.type,
        );
        await AgentMessageRepository.create(
          taskId,
          session.messageIndex,
          message,
        );
        session.messageIndex++;
      } catch (error) {
        dbg.agent('Failed to persist message: %O', error);
      }
    } else {
      dbg.agent('No session found for task %s, message not persisted', taskId);
    }

    dbg.agentMessage(
      'Emitting message for task %s, type: %s',
      taskId,
      message.type,
    );
    this.emit(AGENT_CHANNELS.MESSAGE, { taskId, message });
  }

  private getSessionAllowButton(
    toolName: string,
    input: Record<string, unknown>,
  ): SessionAllowButton | undefined {
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

  private async emitPermissionRequest(
    taskId: string,
    requestId: string,
    toolName: string,
    input: Record<string, unknown>,
  ) {
    const sessionAllowButton = this.getSessionAllowButton(toolName, input);
    this.emit(AGENT_CHANNELS.PERMISSION, {
      taskId,
      requestId,
      toolName,
      input,
      sessionAllowButton,
    });

    // Send desktop notification if window not focused
    if (this.mainWindow && !this.mainWindow.isFocused()) {
      const task = await TaskRepository.findById(taskId);
      notificationService.notify(
        'Permission Required',
        `Task "${task?.name || 'Unknown'}" needs approval for ${toolName}`,
        () => {
          this.mainWindow?.focus();
        },
      );
    }
  }

  private async emitQuestionRequest(
    taskId: string,
    requestId: string,
    questions: AgentQuestion[],
  ) {
    this.emit(AGENT_CHANNELS.QUESTION, { taskId, requestId, questions });

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

  private async generateTaskName(
    taskId: string,
    prompt: string,
  ): Promise<void> {
    try {
      const generator = query({
        prompt: `Generate a short task name (max 40 characters) that summarizes this task. Output only the name, nothing else.\n\nTask: ${prompt}`,
        options: {
          allowedTools: [],
          permissionMode: 'bypassPermissions',
          model: 'haiku',
          outputFormat: {
            type: 'json_schema',
            schema: TASK_NAME_SCHEMA,
          },
        },
      });

      for await (const message of generator) {
        const msg = message as {
          type: string;
          structured_output?: { name: string };
        };
        if (msg.type === 'result' && msg.structured_output?.name) {
          const name = msg.structured_output.name.slice(0, 40);
          await TaskRepository.update(taskId, { name });
          this.emitTaskNameUpdated(taskId, name);
          dbg.agent('Generated task name for %s: %s', taskId, name);
          break;
        }
      }
    } catch (error) {
      dbg.agent('Failed to generate task name for %s: %O', taskId, error);
      // Non-fatal - task keeps its original name
    }
  }

  /**
   * Create a new session for a task.
   */
  private async createSession(taskId: string): Promise<ActiveSession> {
    const existingMessageCount =
      await AgentMessageRepository.getMessageCount(taskId);
    const task = await TaskRepository.findById(taskId);

    const session: ActiveSession = {
      taskId,
      sessionId: task?.sessionId ?? null,
      abortController: new AbortController(),
      pendingRequests: [],
      messageGenerator: null,
      messageIndex: existingMessageCount,
      queryInstance: null,
      queuedPrompts: [],
    };

    this.sessions.set(taskId, session);
    dbg.agentSession(
      'Created session for task %s (resuming: %s, messageIndex: %d)',
      taskId,
      session.sessionId ? 'yes' : 'no',
      existingMessageCount,
    );
    return session;
  }

  /**
   * Run a query with the given prompt.
   * Handles message streaming, session ID capture, result handling, and queued prompts.
   */
  private async runQuery(
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

    const sdkPermissionMode =
      SDK_PERMISSION_MODES[(task.interactionMode ?? 'ask') as InteractionMode];
    const workingDir = task.worktreePath ?? project.path;

    dbg.agentSession(
      'runQuery for task %s: mode=%s, cwd=%s, resuming=%s',
      taskId,
      sdkPermissionMode,
      workingDir,
      session.sessionId ? 'yes' : 'no',
    );

    if (task.status !== 'running') {
      await TaskRepository.update(taskId, { status: 'running' });
      this.emitStatus(taskId, 'running');
    }

    // Create new abort controller for this query iteration
    session.abortController = new AbortController();

    const queryOptions: NonNullable<Parameters<typeof query>[0]['options']> = {
      cwd: workingDir,
      allowedTools: [],
      canUseTool: async (
        toolName: string,
        input: Record<string, unknown>,
      ): Promise<PermissionResult> => {
        return this.handleToolRequest(taskId, toolName, input);
      },
      permissionMode: sdkPermissionMode,
      settingSources: ['user', 'project', 'local'],
    };

    if (session.sessionId) {
      queryOptions.resume = session.sessionId;
    }

    if (options?.generateNameOnInit && task.name === null) {
      // NOTE: fire-and-forget
      void this.generateTaskName(taskId, options.initialPrompt ?? prompt).catch(
        (err) => {
          dbg.agent('Error generating task name: %O', err);
        },
      );
    }

    // Emit user message before starting query
    await this.emitMessage(taskId, {
      type: 'user',
      message: {
        role: 'user',
        content: prompt,
      },
    });

    dbg.agentSession('Starting SDK query for task %s', taskId);
    const generator = query({ prompt, options: queryOptions });
    session.queryInstance = generator;
    session.messageGenerator = generator;
    let hasUpdatedSessionId = false;

    for await (const rawMessage of generator) {
      if (session.abortController.signal.aborted) {
        dbg.agentSession('Task %s aborted, breaking message loop', taskId);
        break;
      }

      const message = rawMessage as AgentMessage;

      if (!hasUpdatedSessionId && !session.sessionId && message.session_id) {
        session.sessionId = message.session_id;
        await TaskRepository.update(taskId, { sessionId: message.session_id });
        hasUpdatedSessionId = true;
        dbg.agentSession(
          'Captured session ID for task %s: %s',
          taskId,
          message.session_id,
        );
      }

      await this.emitMessage(taskId, message);

      // Handle result message
      if (message.type === 'result') {
        dbg.agentSession(
          'Task %s received result (is_error: %s, queued: %d)',
          taskId,
          message.is_error,
          session.queuedPrompts.length,
        );

        // Check for queued prompts
        const nextPrompt = session.queuedPrompts.shift();
        if (nextPrompt && !message.is_error) {
          dbg.agentSession('Task %s processing next queued prompt', taskId);
          this.emitPromptQueueUpdate(taskId, session.queuedPrompts);
          // Recursively process next queued prompt
          // Don't clean up session, recursion will handles it
          return await this.runQuery(taskId, nextPrompt.content, session);
        }

        // No more queued prompts - finalize
        const status = message.is_error ? 'errored' : 'completed';
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
      }
    }
  }

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
      await this.runQuery(taskId, task.prompt, session, {
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

  private async handleToolRequest(
    taskId: string,
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<PermissionResult> {
    dbg.agentPermission('Tool request for task %s: %s', taskId, toolName);
    const session = this.sessions.get(taskId);
    if (!session) {
      dbg.agentPermission('No session found for task %s', taskId);
      return { behavior: 'deny', message: 'Session not found' };
    }

    // Check if tool is in session-allowed list
    const task = await TaskRepository.findById(taskId);
    const allowedTools = task?.sessionAllowedTools ?? [];

    // Determine working directory: worktree path if present, otherwise project path
    let workingDir: string | undefined;
    if (task?.worktreePath) {
      workingDir = task.worktreePath;
    } else if (task?.projectId) {
      const project = await ProjectRepository.findById(task.projectId);
      workingDir = project?.path;
    }

    if (
      isToolAllowedByPermissions(toolName, input, allowedTools, { workingDir })
    ) {
      dbg.agentPermission(
        'Tool %s is session-allowed for task %s',
        toolName,
        taskId,
      );
      return { behavior: 'allow', updatedInput: input };
    }

    const requestId = nanoid();

    // Handle AskUserQuestion specially
    if (toolName === 'AskUserQuestion') {
      const questions = input.questions as AgentQuestion[];
      await this.emitQuestionRequest(taskId, requestId, questions);
      await TaskRepository.update(taskId, { status: 'waiting' });
      this.emitStatus(taskId, 'waiting');

      // Wait for response
      const response = await new Promise<PermissionResponse | QuestionResponse>(
        (resolve) => {
          session.pendingRequests.push({
            requestId,
            type: 'question',
            toolName,
            input,
            resolve,
          });
        },
      );

      await TaskRepository.update(taskId, { status: 'running' });
      this.emitStatus(taskId, 'running');

      // Return formatted response for AskUserQuestion
      const questionResponse = response as QuestionResponse;
      return {
        behavior: 'allow',
        updatedInput: {
          questions: input.questions,
          answers: questionResponse.answers,
        },
      };
    }

    // Regular permission request
    await this.emitPermissionRequest(taskId, requestId, toolName, input);
    await TaskRepository.update(taskId, { status: 'waiting' });
    this.emitStatus(taskId, 'waiting');

    // Wait for response
    const response = await new Promise<PermissionResult>((resolve) => {
      session.pendingRequests.push({
        requestId,
        type: 'permission',
        toolName,
        input,
        resolve,
      });
    });

    await TaskRepository.update(taskId, { status: 'running' });
    this.emitStatus(taskId, 'running');

    return response;
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

    // Emit a custom interruption message
    await this.emitMessage(taskId, {
      type: 'result',
      result: 'Task interrupted by user',
      is_error: true,
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

    const requestIndex = session.pendingRequests.findIndex(
      (r) => r.requestId === requestId,
    );
    if (requestIndex === -1) {
      throw new Error(`No pending request with ID ${requestId}`);
    }

    const [request] = session.pendingRequests.splice(requestIndex, 1);
    dbg.agentPermission(
      'Resolved %s request for tool %s (remaining pending: %d)',
      request.type,
      request.toolName,
      session.pendingRequests.length,
    );
    request.resolve(response);

    // If there are more pending requests, emit the next one
    if (session.pendingRequests.length > 0) {
      const next = session.pendingRequests[0];
      if (next.type === 'question') {
        await this.emitQuestionRequest(
          taskId,
          next.requestId,
          next.input.questions as AgentQuestion[],
        );
      } else {
        await this.emitPermissionRequest(
          taskId,
          next.requestId,
          next.toolName,
          next.input,
        );
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
      await this.runQuery(taskId, message, session);
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
    if (request.type === 'question') {
      return {
        type: 'question',
        data: {
          taskId,
          requestId: request.requestId,
          questions: request.input.questions as AgentQuestion[],
        },
      };
    }

    // Permission request
    const sessionAllowButton = this.getSessionAllowButton(
      request.toolName,
      request.input,
    );
    return {
      type: 'permission',
      data: {
        taskId,
        requestId: request.requestId,
        toolName: request.toolName,
        input: request.input,
        sessionAllowButton,
      },
    };
  }

  async setMode(taskId: string, mode: InteractionMode): Promise<void> {
    dbg.agentSession('Setting mode for task %s to %s', taskId, mode);
    const session = this.sessions.get(taskId);
    if (session?.queryInstance) {
      await session.queryInstance.setPermissionMode(SDK_PERMISSION_MODES[mode]);
      dbg.agentSession('Updated SDK permission mode for active session');
    }
    await TaskRepository.update(taskId, { interactionMode: mode });
  }

  isRunning(taskId: string): boolean {
    return this.sessions.has(taskId);
  }

  async getMessages(taskId: string): Promise<AgentMessage[]> {
    const messages = await AgentMessageRepository.findByTaskId(taskId);
    dbg.agentMessage(
      'getMessages for task %s: found %d messages',
      taskId,
      messages.length,
    );
    return messages;
  }

  async getMessageCount(taskId: string): Promise<number> {
    return AgentMessageRepository.getMessageCount(taskId);
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
