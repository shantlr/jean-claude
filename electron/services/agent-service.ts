import { PermissionResult, query } from '@anthropic-ai/claude-agent-sdk';
import { BrowserWindow } from 'electron';
import { v4 as uuidv4 } from 'uuid';

import {
  AGENT_CHANNELS,
  AgentMessage,
  PermissionResponse,
  QuestionResponse,
  AgentQuestion,
  SessionAllowButton,
} from '../../shared/agent-types';
import type { InteractionMode } from '../../shared/types';
import {
  TaskRepository,
  ProjectRepository,
  AgentMessageRepository,
} from '../database/repositories';

import { notificationService } from './notification-service';

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
    error?: string
  ) {
    this.emit(AGENT_CHANNELS.STATUS, { taskId, status, error });
  }

  private async emitMessage(taskId: string, message: AgentMessage) {
    // Persist to database
    const session = this.sessions.get(taskId);
    if (session) {
      try {
        console.log(`[AgentService] Persisting message ${session.messageIndex} for task ${taskId}, type: ${message.type}`);
        await AgentMessageRepository.create(taskId, session.messageIndex, message);
        session.messageIndex++;
      } catch (error) {
        console.error('Failed to persist message:', error);
      }
    } else {
      console.warn(`[AgentService] No session found for task ${taskId}, message not persisted`);
    }

    this.emit(AGENT_CHANNELS.MESSAGE, { taskId, message });
  }

  private getSessionAllowButton(toolName: string): SessionAllowButton | undefined {
    switch (toolName) {
      case 'ExitPlanMode':
        return { label: 'Allow and Auto-Edit', toolsToAllow: ['Edit', 'Write'] };
      case 'Edit':
        return { label: 'Allow Edit for Session', toolsToAllow: ['Edit'] };
      case 'Write':
        return { label: 'Allow Write for Session', toolsToAllow: ['Write'] };
      default:
        return undefined;
    }
  }

  private async emitPermissionRequest(
    taskId: string,
    requestId: string,
    toolName: string,
    input: Record<string, unknown>
  ) {
    const sessionAllowButton = this.getSessionAllowButton(toolName);
    this.emit(AGENT_CHANNELS.PERMISSION, { taskId, requestId, toolName, input, sessionAllowButton });

    // Send desktop notification if window not focused
    if (this.mainWindow && !this.mainWindow.isFocused()) {
      const task = await TaskRepository.findById(taskId);
      notificationService.notify(
        'Permission Required',
        `Task "${task?.name || 'Unknown'}" needs approval for ${toolName}`,
        () => {
          this.mainWindow?.focus();
        }
      );
    }
  }

  private async emitQuestionRequest(
    taskId: string,
    requestId: string,
    questions: AgentQuestion[]
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
        }
      );
    }
  }

  private emitNameUpdated(taskId: string, name: string) {
    this.emit(AGENT_CHANNELS.NAME_UPDATED, { taskId, name });
  }

  private async generateTaskName(taskId: string, prompt: string): Promise<void> {
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
        const msg = message as { type: string; structured_output?: { name: string } };
        if (msg.type === 'result' && msg.structured_output?.name) {
          const name = msg.structured_output.name.slice(0, 40);
          await TaskRepository.update(taskId, { name });
          this.emitNameUpdated(taskId, name);
          console.log(`[AgentService] Generated task name for ${taskId}: ${name}`);
          break;
        }
      }
    } catch (error) {
      console.error(`[AgentService] Failed to generate task name for ${taskId}:`, error);
      // Non-fatal - task keeps its original name
    }
  }

  async start(taskId: string): Promise<void> {
    // Check if already running
    if (this.sessions.has(taskId)) {
      throw new Error(`Agent already running for task ${taskId}`);
    }

    // Get task and project info
    const task = await TaskRepository.findById(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const project = await ProjectRepository.findById(task.projectId);
    if (!project) {
      throw new Error(`Project ${task.projectId} not found`);
    }

    // Get existing message count to continue indexing
    const existingMessageCount = await AgentMessageRepository.getMessageCount(taskId);

    // Create session
    const abortController = new AbortController();
    const session: ActiveSession = {
      taskId,
      sessionId: task.sessionId,
      abortController,
      pendingRequests: [],
      messageGenerator: null,
      messageIndex: existingMessageCount,
      queryInstance: null,
    };
    this.sessions.set(taskId, session);

    // Update task status
    await TaskRepository.update(taskId, { status: 'running' });
    this.emitStatus(taskId, 'running');

    try {
      // Spawn agent
      const sdkPermissionMode = SDK_PERMISSION_MODES[(task.interactionMode ?? 'ask') as InteractionMode];
      console.log(`[AgentService] Starting agent for task ${taskId}, interactionMode: ${task.interactionMode}, sdkPermissionMode: ${sdkPermissionMode}`);

      // Use worktree path if available, otherwise use project path
      const workingDir = task.worktreePath ?? project.path;

      const options: NonNullable<Parameters<typeof query>[0]['options']> = {
        cwd: workingDir,
        allowedTools: [
          // 'Read',
          // 'Write',
          // 'Edit',
          // 'Bash',
          // 'Glob',
          // 'Grep',
          // 'WebSearch',
          // 'WebFetch',
          // 'AskUserQuestion',
        ],
        canUseTool: async (
          toolName: string,
          input: Record<string, unknown>
        ): Promise<PermissionResult> => {
          console.log(`[AgentService] canUseTool callback invoked for tool: ${toolName}`);
          return this.handleToolRequest(taskId, toolName, input);
        },
        permissionMode: SDK_PERMISSION_MODES[(task.interactionMode ?? 'plan') as InteractionMode],
        settingSources: ['user', 'project', 'local']
      };

      // Resume if we have a session ID
      if (session.sessionId) {
        options.resume = session.sessionId;
      }

      console.log('[AgentService] Calling query with options:', options);

      // Emit user message with the initial prompt before starting agent
      await this.emitMessage(taskId, {
        type: 'user',
        message: {
          role: 'user',
          content: task.prompt,
        },
      });

      const generator = query({
        prompt: task.prompt,
        options,
      });
      if (!options.resume) {
        console.log(`[AgentService] New session started for task ${taskId}:`);
      }

      session.queryInstance = generator;
      session.messageGenerator = generator;

      // Stream messages
      for await (const rawMessage of generator) {
        if (abortController.signal.aborted) {
          break;
        }

        const message = rawMessage as AgentMessage;

        // Capture session ID from init message
        if (message.type === 'system' && message.subtype === 'init' && message.session_id) {
          session.sessionId = message.session_id;
          await TaskRepository.update(taskId, { sessionId: message.session_id });

          // Generate task name if not set
          if (task.name === null) {
            // Fire and forget - don't block the main agent work
            this.generateTaskName(taskId, task.prompt);
          }
        }

        // Emit message to renderer and persist
        await this.emitMessage(taskId, message);

        // Handle result message
        if (message.type === 'result') {
          const status = message.is_error ? 'errored' : 'completed';
          await TaskRepository.update(taskId, { status });
          this.emitStatus(taskId, status);

          // Notify on completion
          if (this.mainWindow && !this.mainWindow.isFocused()) {
            const task = await TaskRepository.findById(taskId);
            notificationService.notify(
              status === 'completed' ? 'Task Completed' : 'Task Failed',
              `Task "${task?.name || 'Unknown'}" ${status === 'completed' ? 'finished successfully' : 'encountered an error'}`,
              () => {
                this.mainWindow?.focus();
              }
            );
          }
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await TaskRepository.update(taskId, { status: 'errored' });
      this.emitStatus(taskId, 'errored', errorMessage);
    } finally {
      this.sessions.delete(taskId);
    }
  }

  private async handleToolRequest(
    taskId: string,
    toolName: string,
    input: Record<string, unknown>
  ): Promise<PermissionResult> {
    console.log(`[AgentService] handleToolRequest called for task ${taskId}, tool: ${toolName}`);
    const session = this.sessions.get(taskId);
    if (!session) {
      console.log(`[AgentService] No session found for task ${taskId}`);
      return { behavior: 'deny', message: 'Session not found' };
    }

    // Check if tool is in session-allowed list
    const task = await TaskRepository.findById(taskId);
    const allowedTools = task?.sessionAllowedTools ?? [];
    if (allowedTools.includes(toolName)) {
      console.log(`[AgentService] Tool ${toolName} is session-allowed for task ${taskId}`);
      return { behavior: 'allow', updatedInput: input };
    }

    const requestId = uuidv4();

    // Handle AskUserQuestion specially
    if (toolName === 'AskUserQuestion') {
      const questions = input.questions as AgentQuestion[];
      await this.emitQuestionRequest(taskId, requestId, questions);
      await TaskRepository.update(taskId, { status: 'waiting' });
      this.emitStatus(taskId, 'waiting');

      // Wait for response
      const response = await new Promise<PermissionResponse | QuestionResponse>((resolve) => {
        session.pendingRequests.push({
          requestId,
          type: 'question',
          toolName,
          input,
          resolve,
        });
      });

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
    const response = await new Promise<PermissionResponse>((resolve) => {
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
    const session = this.sessions.get(taskId);
    if (!session) {
      return;
    }

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
  }

  async respond(
    taskId: string,
    requestId: string,
    response: PermissionResponse | QuestionResponse
  ): Promise<void> {
    const session = this.sessions.get(taskId);
    if (!session) {
      throw new Error(`No active session for task ${taskId}`);
    }

    const requestIndex = session.pendingRequests.findIndex((r) => r.requestId === requestId);
    if (requestIndex === -1) {
      throw new Error(`No pending request with ID ${requestId}`);
    }

    const [request] = session.pendingRequests.splice(requestIndex, 1);
    request.resolve(response);

    // If there are more pending requests, emit the next one
    if (session.pendingRequests.length > 0) {
      const next = session.pendingRequests[0];
      if (next.type === 'question') {
        await this.emitQuestionRequest(taskId, next.requestId, next.input.questions as AgentQuestion[]);
      } else {
        await this.emitPermissionRequest(taskId, next.requestId, next.toolName, next.input);
      }
    }
  }

  async sendMessage(taskId: string, message: string): Promise<void> {
    const session = this.sessions.get(taskId);

    // If session exists and has a sessionId, we need to start a new query with resume
    if (session?.sessionId) {
      // Stop current session and start new one with the message
      await this.stop(taskId);
    }

    // Get task and update prompt, then start
    const task = await TaskRepository.findById(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    // For follow-up messages, we just start a new agent call with resume
    const project = await ProjectRepository.findById(task.projectId);
    if (!project) {
      throw new Error(`Project ${task.projectId} not found`);
    }

    // Get existing message count to continue indexing
    const existingMessageCount = await AgentMessageRepository.getMessageCount(taskId);

    // Create new session that resumes from previous
    const abortController = new AbortController();
    const newSession: ActiveSession = {
      taskId,
      sessionId: task.sessionId,
      abortController,
      pendingRequests: [],
      messageGenerator: null,
      messageIndex: existingMessageCount,
      queryInstance: null,
    };
    this.sessions.set(taskId, newSession);

    await TaskRepository.update(taskId, { status: 'running' });
    this.emitStatus(taskId, 'running');

    try {
      const sdkPermissionMode = SDK_PERMISSION_MODES[(task.interactionMode ?? 'ask') as InteractionMode];
      console.log(`[AgentService] Resuming/sending message for task ${taskId}, interactionMode: ${task.interactionMode}, sdkPermissionMode: ${sdkPermissionMode}`);

      // Use worktree path if available, otherwise use project path
      const workingDir = task.worktreePath ?? project.path;

      const options: Record<string, unknown> = {
        cwd: workingDir,
        allowedTools: [
          'Read',
          'Write',
          'Edit',
          'Bash',
          'Glob',
          'Grep',
          'WebSearch',
          'WebFetch',
          'AskUserQuestion',
        ],
        canUseTool: async (
          toolName: string,
          input: Record<string, unknown>
        ): Promise<PermissionResponse> => {
          console.log(`[AgentService] canUseTool callback invoked for tool: ${toolName} (sendMessage)`);
          return this.handleToolRequest(taskId, toolName, input);
        },
        permissionMode: sdkPermissionMode,
      };

      if (newSession.sessionId) {
        options.resume = newSession.sessionId;
      }

      // Emit user message with the follow-up message before resuming agent
      await this.emitMessage(taskId, {
        type: 'user',
        message: {
          role: 'user',
          content: message,
        },
      });

      const generator = query({
        prompt: message,
        options,
      });

      newSession.queryInstance = generator;
      newSession.messageGenerator = generator;

      for await (const rawMessage of generator) {
        if (abortController.signal.aborted) {
          break;
        }


        const agentMessage = rawMessage as AgentMessage;

        if (agentMessage.type === 'system' && agentMessage.subtype === 'init' && agentMessage.session_id) {
          newSession.sessionId = agentMessage.session_id;
          await TaskRepository.update(taskId, { sessionId: agentMessage.session_id });
        }

        await this.emitMessage(taskId, agentMessage);

        if (agentMessage.type === 'result') {
          const status = agentMessage.is_error ? 'errored' : 'completed';
          await TaskRepository.update(taskId, { status });
          this.emitStatus(taskId, status);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await TaskRepository.update(taskId, { status: 'errored' });
      this.emitStatus(taskId, 'errored', errorMessage);
    } finally {
      this.sessions.delete(taskId);
    }
  }

  async setMode(taskId: string, mode: InteractionMode): Promise<void> {
    const session = this.sessions.get(taskId);
    if (session?.queryInstance) {
      await session.queryInstance.setPermissionMode(SDK_PERMISSION_MODES[mode]);
    }
    await TaskRepository.update(taskId, { interactionMode: mode });
  }

  isRunning(taskId: string): boolean {
    return this.sessions.has(taskId);
  }

  async getMessages(taskId: string): Promise<AgentMessage[]> {
    const messages = await AgentMessageRepository.findByTaskId(taskId);
    console.log(`[AgentService] getMessages for task ${taskId}: found ${messages.length} messages`);
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
    const staleTasks = await TaskRepository.findByStatuses(['running', 'waiting']);

    for (const task of staleTasks) {
      await TaskRepository.update(task.id, { status: 'interrupted' });
      // Note: No need to emit status here since no UI is connected yet at startup
    }

    if (staleTasks.length > 0) {
      console.log(`[AgentService] Recovered ${staleTasks.length} stale task(s) on startup`);
    }
  }
}

export const agentService = new AgentService();
