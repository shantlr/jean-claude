// Agent Service — backend-agnostic orchestration layer.
// Manages agent sessions using the AgentBackend interface.
// Sessions are keyed by stepId — each step is an independent agent session.
// Handles session lifecycle, message persistence, IPC forwarding,
// prompt queueing, notifications, and session allow tools.

import { BrowserWindow } from 'electron';
import { nanoid } from 'nanoid';

import {
  AGENT_CHANNELS,
  type AgentQuestion,
  type PermissionResponse,
  type QuestionResponse,
  type QueuedPrompt,
} from '@shared/agent-types';
import type {
  AgentBackend,
  AgentBackendType,
  AgentEvent,
  AgentSession,
  NormalizedPermissionRequest,
  NormalizedQuestion,
  NormalizedQuestionRequest,
  PromptImagePart,
  PromptPart,
} from '@shared/agent-backend-types';
import {
  getDefaultInteractionModeForBackend,
  normalizeInteractionModeForBackend,
} from '@shared/types';
import {
  type InteractionMode,
  isSkillCreationStepMeta,
  type ReviewStepMeta,
  type TaskNotificationEvent,
  type TaskStepType,
  type ThinkingEffort,
} from '@shared/types';
import type { AgentUIEventPayload } from '@shared/agent-ui-events';
import type { AiUsageFeature } from '@shared/ai-usage-types';
import type { NormalizedEntry } from '@shared/normalized-message-v2';



import {
  AgentMessageRepository,
  ProjectRepository,
  RawMessageRepository,
  TaskRepository,
} from '../database/repositories';
import { dbg } from '../lib/debug';
import { normalizeThinkingEffortForModel } from '../../shared/thinking-settings';
import { pathExists } from '../lib/fs';
import type { PermissionScope } from '../../shared/permission-types';
import { SettingsRepository } from '../database/repositories/settings';
import { TaskStepRepository } from '../database/repositories/task-steps';



import {
  buildAgentPromptMarkdown,
  getPromptText,
  textPrompt,
} from './prompt-utils';
import {
  buildToolPermissionConfig,
  normalizeToolRequest,
  readSettings,
  resolveRules,
} from './permission-settings-service';
import { emitStepUpsert, emitTaskUpsert } from './cache-event-service';
import { AGENT_BACKEND_CLASSES } from './agent-backends';
import { agentResourceMonitorService } from './agent-resource-monitor-service';
import { aiUsageTrackingService } from './ai-usage-tracking-service';
import { applyConfiguredPromptPreface } from './prompt-preface-service';
import { assertValidWorkspacePath } from './system-project-service';
import { buildSessionIdStepUpdate } from './agent-session-update';
import { ClaudeCodeBackend } from './agent-backends/claude/claude-code-backend';
import { generateTaskName } from './name-generation-service';
import { getJcMcpServerPath } from './mcp-template-service';
import { notificationService } from './notification-service';
import { OpenCodeBackend } from './agent-backends/opencode/opencode-backend';
import { resolveGlobalRules } from './global-permissions-service';
import { StepService } from './step-service';



/** In-memory store for queued prompt parts, keyed by QueuedPrompt.id.
 *  Keeps full PromptPart[] (with image base64) out of the QueuedPrompt.content
 *  field which crosses IPC to the renderer for display. */
const queuedPromptParts = new Map<string, PromptPart[]>();

function appendPromptParts(
  existingParts: PromptPart[],
  incomingParts: PromptPart[],
): PromptPart[] {
  const combinedParts = [...existingParts];

  for (const part of incomingParts) {
    if (part.type !== 'text') {
      combinedParts.push(part);
      continue;
    }

    const lastPart = combinedParts[combinedParts.length - 1];
    if (!lastPart || lastPart.type !== 'text') {
      combinedParts.push(part);
      continue;
    }

    combinedParts[combinedParts.length - 1] = {
      type: 'text',
      text: [lastPart.text, part.text]
        .filter((text) => text.trim().length > 0)
        .join('\n\n'),
    };
  }

  return combinedParts;
}

function replacePromptText(parts: PromptPart[], content: string): PromptPart[] {
  const textPartIndex = parts.findIndex((part) => part.type === 'text');
  const nonTextParts = parts.filter((part) => part.type !== 'text');

  if (textPartIndex === -1) {
    return [{ type: 'text', text: content }, ...nonTextParts];
  }

  return [
    ...parts.slice(0, textPartIndex).filter((part) => part.type !== 'text'),
    { type: 'text' as const, text: content },
    ...parts.slice(textPartIndex + 1).filter((part) => part.type !== 'text'),
  ];
}

const TASK_NOTIFICATION_TITLE_PREFIX: Record<TaskNotificationEvent, string> = {
  completed: '✅',
  'permission-required': '🔐',
  question: '❓',
  errored: '❌',
};

/**
 * Build the runtime MCP servers config for the Jean-Claude Agent Tools server.
 * Returns a config object that can be passed directly to the agent backend.
 */
function buildJcMcpServersConfigForCwd(
  cwd: string,
): Record<
  string,
  { command: string; args: string[]; env?: Record<string, string> }
> {
  const serverPath = getJcMcpServerPath();
  return {
    'jean-claude-mcp': {
      command: 'node',
      args: [serverPath, '--workdir', cwd],
    },
  };
}

/**
 * Build a review prompt that instructs the agent to use `run_review` MCP
 * tools in parallel for each configured reviewer focus area.
 */
function buildReviewPrompt({
  basePrompt,
  meta,
  startCommitHash,
  workItemContext,
}: {
  basePrompt: string;
  meta: ReviewStepMeta | undefined;
  startCommitHash: string | null;
  workItemContext?: string;
}): string {
  const reviewers = meta?.reviewers ?? [];
  const reviewerList = reviewers
    .map(
      (r, i) =>
        `${i + 1}. **${r.label}** (backend: ${r.backend ?? 'claude-code'}${r.model && r.model !== 'default' ? `, model: ${r.model}` : ''}${r.thinkingEffort && r.thinkingEffort !== 'default' ? `, variant: ${r.thinkingEffort}` : ''}): ${r.focusPrompt}`,
    )
    .join('\n');

  const extra = basePrompt.trim()
    ? `\n\nAdditional instructions from the user:\n${basePrompt}`
    : '';

  const diffHint = startCommitHash
    ? `To see only the changes introduced by this task, each reviewer should run: git diff ${startCommitHash}\nThis covers all committed, staged, and unstaged changes since the task started. Do NOT diff against the source branch directly as that may include unrelated upstream changes.`
    : 'Each reviewer should use git diff HEAD to inspect recent changes, combined with git status for untracked files.';

  const workItemSection = workItemContext
    ? [
        '',
        '## Associated Work Items',
        '',
        'The following work items are linked to this PR. Include these in each reviewer prompt.',
        'The "Requirements Alignment" reviewer should specifically verify that the code changes fulfill these requirements.',
        '',
        workItemContext,
      ].join('\n')
    : '';

  return [
    'You are a code review coordinator.',
    '',
    'IMPORTANT: Do NOT investigate the code yourself. Do NOT run git diff, read files, or do any exploration.',
    'Your ONLY job is to:',
    '1. Immediately dispatch all reviewers in parallel using the `run_review` MCP tool.',
    '2. Wait for all reviews to complete.',
    '3. Synthesize the findings into a comprehensive summary organized by severity and category.',
    '',
    'When calling `run_review`, set the `backend` field to the backend listed for each reviewer. If a model is specified, set the `model` field accordingly. If a variant is specified, set the `thinkingEffort` field accordingly.',
    "Include the diff instructions below in each reviewer's prompt so they know how to find the changes.",
    '',
    '## Diff instructions (include in each reviewer prompt)',
    '',
    diffHint,
    '',
    '## Reviewers',
    '',
    reviewerList,
    '',
    'IMPORTANT: Do NOT implement any changes. Present your findings and recommendations, then wait for the user to decide on next steps.',
    workItemSection,
    extra,
  ].join('\n');
}

// --- Active session tracking ---

interface ActiveSession {
  stepId: string;
  taskId: string; // kept for worktree/project lookups
  projectId: string;
  backendSessionId: string | null; // The session ID from the backend
  backendStartPromise?: Promise<AgentSession>;
  sdkSessionId: string | null; // The persistent session ID for resumption
  backendType: AgentBackendType;
  usageFeature: AiUsageFeature;
  currentModel: string | null;
  requestedBackendType: AgentBackendType;
  swapModel?: string;
  swapThinkingEffort?: ThinkingEffort;
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
  hasTerminalError: boolean;
}

function getUsageFeatureForStep(type: TaskStepType): AiUsageFeature {
  switch (type) {
    case 'skill-creation':
      return 'skill';
    case 'feature-map':
      return 'feature-map';
    case 'review':
    case 'pr-review':
      return 'review';
    case 'create-pull-request':
      return 'pr';
    case 'agent':
    case 'fork':
      return 'agent';
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

class AgentService {
  private sessions: Map<string, ActiveSession> = new Map(); // key is stepId
  private startingSteps = new Set<string>();
  private mainWindow: BrowserWindow | null = null;
  private focusedTaskId: string | null = null;
  private pendingImageAttachments = new Map<string, PromptImagePart[]>();

  constructor() {
    agentResourceMonitorService.setSnapshotListener((snapshot) => {
      this.emitEvent(snapshot.taskId, snapshot.stepId, {
        type: 'resource-snapshot',
        snapshot,
      });
    });
  }

  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window;
  }

  setFocusedTask(taskId: string | null): void {
    this.focusedTaskId = taskId;
  }

  /**
   * Store images for a task that will be started shortly.
   * Images are consumed (deleted) when start() is called.
   */
  setPendingImages(taskId: string, images: PromptImagePart[]): void {
    this.pendingImageAttachments.set(taskId, images);
  }

  private getLiveWindows(): BrowserWindow[] {
    return BrowserWindow.getAllWindows().filter(
      (window) => !window.isDestroyed() && !window.webContents.isDestroyed(),
    );
  }

  private isMainWindowAlive(): boolean {
    return (
      this.mainWindow !== null &&
      !this.mainWindow.isDestroyed() &&
      !this.mainWindow.webContents.isDestroyed()
    );
  }

  private emitEvent(
    taskId: string,
    stepId: string,
    event: AgentUIEventPayload,
  ) {
    for (const window of this.getLiveWindows()) {
      window.webContents.send(AGENT_CHANNELS.EVENT, {
        taskId,
        stepId,
        ...event,
      });
    }
  }

  private async markTaskUnreadIfBackground(taskId: string): Promise<void> {
    const isFocused =
      this.isMainWindowAlive() &&
      this.mainWindow!.isFocused() &&
      this.focusedTaskId === taskId;

    if (!isFocused) {
      await TaskRepository.setHasUnread(taskId, true);
      const task = await TaskRepository.findById(taskId);
      if (task) {
        emitTaskUpsert(task);
      }
    }
  }

  /**
   * Persist and emit a synthetic normalized entry (not from a backend).
   * Used for user message echo, error messages, and interruption messages
   * generated by agent-service. These have no raw SDK backing, so rawMessageId is null.
   */
  private async persistAndEmitSyntheticEntry(
    taskId: string,
    session: ActiveSession,
    entry: NormalizedEntry,
  ) {
    try {
      await AgentMessageRepository.create({
        taskId,
        stepId: session.stepId,
        messageIndex: session.messageIndex++,
        entry,
        rawMessageId: null,
      });
    } catch (error) {
      dbg.agent('Failed to persist synthetic entry: %O', error);
    }
    this.emitEvent(taskId, session.stepId, { type: 'entry', entry });
  }

  /**
   * Resolve the task display name for notifications.
   * Uses task name, falling back to truncated prompt from the task or step.
   */
  private async resolveTaskDisplayName(
    taskId: string,
    stepId: string,
  ): Promise<string> {
    const task = await TaskRepository.findById(taskId);
    if (task?.name) {
      return task.name;
    }

    // Fall back to task prompt (truncated)
    if (task?.prompt) {
      const firstLine = task.prompt.split('\n')[0].trim();
      return firstLine.length > 60 ? firstLine.slice(0, 57) + '...' : firstLine;
    }

    // Fall back to step prompt (truncated)
    const step = await TaskStepRepository.findById(stepId);
    const prompt = step?.promptTemplate;
    if (prompt) {
      const firstLine = prompt.split('\n')[0].trim();
      return firstLine.length > 60 ? firstLine.slice(0, 57) + '...' : firstLine;
    }

    return 'Untitled task';
  }

  private async generateAndPersistTaskName(
    taskId: string,
    stepId: string,
    prompt: string,
  ): Promise<void> {
    try {
      const task = await TaskRepository.findById(taskId);
      const name = await generateTaskName(
        prompt,
        null,
        task
          ? {
              feature: 'task-name',
              projectId: task.projectId,
              taskId,
              stepId,
              taskName: task.name,
            }
          : undefined,
      );
      if (name) {
        const updatedTask = await TaskRepository.update(taskId, { name });
        emitTaskUpsert(updatedTask);
        this.emitEvent(taskId, stepId, { type: 'name-updated', name });
        dbg.agent('Generated task name for %s: %s', taskId, name);
      }
    } catch (error) {
      dbg.agent('Failed to generate task name for %s: %O', taskId, error);
    }
  }

  private async shouldNotifyTaskEvent(
    event: TaskNotificationEvent,
  ): Promise<boolean> {
    const settings = await SettingsRepository.get('taskEventNotifications');
    const mode = settings.modes[event];

    if (mode === 'disabled') {
      return false;
    }

    if (
      mode === 'background' &&
      this.isMainWindowAlive() &&
      this.mainWindow!.isFocused()
    ) {
      return false;
    }

    return true;
  }

  private async notifyTaskEvent({
    taskId,
    stepId,
    event,
    notificationId,
    title,
    body,
  }: {
    taskId: string;
    stepId: string;
    event: TaskNotificationEvent;
    notificationId: string;
    title: string;
    body: string;
  }): Promise<void> {
    if (!this.isMainWindowAlive()) {
      return;
    }

    if (!(await this.shouldNotifyTaskEvent(event))) {
      return;
    }

    const task = await TaskRepository.findById(taskId);
    const displayName = task?.name
      ? task.name
      : await this.resolveTaskDisplayName(taskId, stepId);
    notificationService.notify({
      id: notificationId,
      title: `${TASK_NOTIFICATION_TITLE_PREFIX[event]} ${title}`,
      body: body.replace('{taskName}', displayName),
      onClick: () => {
        if (!this.isMainWindowAlive()) {
          return;
        }

        const mainWindow = this.mainWindow!;
        if (mainWindow.isMinimized()) {
          mainWindow.restore();
        }
        mainWindow.focus();

        if (task) {
          mainWindow.webContents.send('notifications:open-task', {
            taskId,
            projectId: task.projectId,
          });
        }
      },
    });
  }

  private async handleAutoStartFailure(
    stepId: string,
    error: unknown,
  ): Promise<void> {
    try {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      dbg.agent(
        'Error auto-starting dependent step %s: %s',
        stepId,
        errorMessage,
      );

      const step = await TaskStepRepository.findById(stepId);
      if (!step) return;

      await StepService.errorStep(stepId);
      this.emitEvent(step.taskId, stepId, {
        type: 'status',
        status: 'errored',
        error: `Auto-start failed: ${errorMessage}`,
      });
      await this.notifyTaskEvent({
        taskId: step.taskId,
        stepId,
        event: 'errored',
        notificationId: `${step.taskId}:auto-start-error:${stepId}`,
        title: 'Task Failed',
        body: 'Task "{taskName}" encountered an error',
      });
    } catch (handlerError) {
      dbg.agent(
        'Failed to handle auto-start failure for step %s: %O',
        stepId,
        handlerError,
      );
    }
  }

  // --- Session management ---

  private async createSession(stepId: string): Promise<ActiveSession> {
    const step = await TaskStepRepository.findById(stepId);
    if (!step) throw new Error(`Step ${stepId} not found`);

    const task = await TaskRepository.findById(step.taskId);
    if (!task) throw new Error(`Task ${step.taskId} not found`);

    const existingMessageCount =
      await AgentMessageRepository.getMessageCountByStepId(stepId);

    const requestedBackend: AgentBackendType = (step.agentBackend ??
      'claude-code') as AgentBackendType;

    const backendType = requestedBackend;
    const swapModel: string | undefined = undefined;
    const swapThinkingEffort: ThinkingEffort | undefined = undefined;
    const BackendClass = AGENT_BACKEND_CLASSES[backendType];
    if (!BackendClass) {
      throw new Error(`Unknown agent backend: "${backendType}"`);
    }

    const backend = new BackendClass({
      taskId: step.taskId,
      sessionStartIndex: existingMessageCount,
      persistRaw: async (params) => {
        const row = await RawMessageRepository.create({
          taskId: step.taskId,
          stepId,
          messageIndex: params.messageIndex,
          backendSessionId: params.backendSessionId,
          rawData: params.rawData,
          rawFormat: backendType,
        });
        return row.id;
      },
      updateRaw: async (params) => {
        await RawMessageRepository.updateRawData(params.rowId, params.rawData);
      },
    });

    const session: ActiveSession = {
      stepId,
      taskId: step.taskId,
      projectId: task.projectId,
      backendSessionId: null,
      sdkSessionId: step.sessionId ?? null,
      backendType,
      usageFeature: getUsageFeatureForStep(step.type),
      currentModel: swapModel ?? step.modelPreference,
      requestedBackendType: requestedBackend,
      swapModel,
      swapThinkingEffort,
      backend,
      messageIndex: existingMessageCount,
      queuedPrompts: [],
      abortController: new AbortController(),
      pendingRequests: [],
      hasTerminalError: false,
    };

    this.sessions.set(stepId, session);
    dbg.agentSession(
      'Created session for step %s (task: %s, backend: %s, resuming: %s, messageIndex: %d)',
      stepId,
      step.taskId,
      backendType,
      session.sdkSessionId ? 'yes' : 'no',
      existingMessageCount,
    );
    return session;
  }

  // --- Main event loop ---

  /**
   * Run the agent backend for a step, processing events from the backend's
   * event stream. Handles message persistence, permission/question forwarding,
   * result handling, and queued prompts.
   */
  private async runBackend(
    stepId: string,
    parts: PromptPart[],
    session: ActiveSession,
    options?: {
      generateNameOnInit?: boolean;
      initialPrompt?: string;
      isInitialPrompt?: boolean;
    },
  ): Promise<void> {
    const { taskId } = session;
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

    let workingDir = task.worktreePath ?? project.path;

    // Get step for mode/model
    const step = await TaskStepRepository.findById(stepId);

    // For skill-creation steps, use the workspace path as CWD
    if (step?.type === 'skill-creation' && isSkillCreationStepMeta(step.meta)) {
      await assertValidWorkspacePath(step.meta.workspacePath);
      if (!(await pathExists(step.meta.workspacePath))) {
        throw new Error(
          `The skill workspace has been deleted or cleaned up. ` +
            `Create a new skill task to continue.`,
        );
      }
      workingDir = step.meta.workspacePath;
    }

    dbg.agentSession(
      'runBackend for step %s (task %s): backend=%s, cwd=%s, resuming=%s',
      stepId,
      taskId,
      session.backendType,
      workingDir,
      session.sdkSessionId ? 'yes' : 'no',
    );

    // Create new abort controller for this query iteration
    session.abortController = new AbortController();

    if (options?.generateNameOnInit && task.name === null) {
      // NOTE: fire-and-forget
      void this.generateAndPersistTaskName(
        taskId,
        stepId,
        options.initialPrompt ?? getPromptText(parts),
      ).catch((err) => {
        dbg.agent('Error generating task name: %O', err);
      });
    }

    // Load backend-agnostic permissions and compile for the target backend.
    const isWorktree = !!task.worktreePath;
    const globalRules = await resolveGlobalRules();
    const settings = await readSettings(project.path);
    const rules = resolveRules(settings, isWorktree, globalRules, workingDir);

    // For review steps, provide the Jean-Claude MCP server at runtime
    const mcpServers =
      step?.type === 'review'
        ? buildJcMcpServersConfigForCwd(workingDir)
        : undefined;

    const backendChanged = session.backendType !== session.requestedBackendType;
    const modelPreference =
      session.swapModel ?? (backendChanged ? undefined : step?.modelPreference);
    const thinkingEffort =
      session.swapThinkingEffort ??
      (backendChanged ? undefined : step?.thinkingEffort);
    const normalizedThinkingEffort = normalizeThinkingEffortForModel({
      backend: session.backendType,
      model: modelPreference ?? 'default',
      effort: thinkingEffort,
    });
    session.currentModel = modelPreference ?? null;

    // Start the backend
    dbg.agentSession('Starting backend for step %s', stepId);
    const effectiveParts =
      step?.type === 'feature-map'
        ? parts
        : await applyConfiguredPromptPreface({
            parts,
            projectPath: project.path,
            isInitialPrompt: options?.isInitialPrompt ?? false,
          });

    if (session.backendType === 'opencode') {
      const promptText = buildAgentPromptMarkdown(effectiveParts).trim();
      if (promptText) {
        await this.persistAndEmitSyntheticEntry(taskId, session, {
          id: nanoid(),
          date: new Date().toISOString(),
          isSynthetic: true,
          type: 'user-prompt',
          value: promptText,
          isSDKSynthetic: true,
        });
      }
    }

    session.backendStartPromise = session.backend.start(
      {
        type: session.backendType,
        cwd: workingDir,
        interactionMode: normalizeInteractionModeForBackend({
          backend: session.backendType,
          mode: (step?.interactionMode ??
            getDefaultInteractionModeForBackend({
              backend: session.backendType,
            })) as InteractionMode,
        }),
        model:
          modelPreference && modelPreference !== 'default'
            ? modelPreference
            : undefined,
        thinkingEffort:
          normalizedThinkingEffort !== 'default'
            ? normalizedThinkingEffort
            : undefined,
        sessionId: session.sdkSessionId ?? undefined,
        persistedSessionRules: task.sessionRules ?? {},
        permissionRules: rules,
        mcpServers,
      },
      effectiveParts,
    );
    const agentSession = await session.backendStartPromise;

    session.backendSessionId = agentSession.sessionId;
    session.backendStartPromise = undefined;

    // Process the event stream
    agentResourceMonitorService.start({
      taskId,
      stepId,
      backend: session.backendType,
      rootPid: agentSession.rootPid ?? null,
    });

    try {
      for await (const event of agentSession.events) {
        if (session.abortController.signal.aborted) {
          dbg.agentSession('Step %s aborted, breaking event loop', stepId);
          break;
        }

        await this.processEvent(stepId, session, event);
      }
    } finally {
      await agentResourceMonitorService.stop(stepId);
      await session.backend.stop(agentSession.sessionId);
    }
  }

  /**
   * Process a single event from the backend event stream.
   */
  private async processEvent(
    stepId: string,
    session: ActiveSession,
    event: AgentEvent,
  ): Promise<void> {
    const { taskId } = session;

    switch (event.type) {
      case 'session-id': {
        session.sdkSessionId = event.sessionId;
        // Only persist the first session ID — once set it is immutable.
        const existing = await TaskStepRepository.findById(stepId);
        if (!existing?.sessionId) {
          const updatedStep = await TaskStepRepository.update(
            stepId,
            buildSessionIdStepUpdate({
              sessionId: event.sessionId,
              backendType: session.backendType,
              requestedBackendType: session.requestedBackendType,
              swapModel: session.swapModel,
              swapThinkingEffort: session.swapThinkingEffort,
            }),
          );
          emitStepUpsert(updatedStep);
          dbg.agentSession(
            'Captured session ID for step %s: %s',
            stepId,
            event.sessionId,
          );
        } else {
          dbg.agentSession(
            'Session ID already set for step %s (%s), ignoring new value: %s',
            stepId,
            existing.sessionId,
            event.sessionId,
          );
        }
        break;
      }

      case 'entry': {
        try {
          await AgentMessageRepository.create({
            taskId,
            stepId,
            messageIndex: session.messageIndex++,
            entry: event.entry,
            rawMessageId: event.rawMessageId,
          });
        } catch (error) {
          dbg.agent('Failed to persist entry: %O', error);
        }
        this.emitEvent(taskId, stepId, { type: 'entry', entry: event.entry });
        break;
      }

      case 'entry-update': {
        try {
          await AgentMessageRepository.updateEntry({
            taskId,
            entry: event.entry,
          });
        } catch (error) {
          dbg.agent('Failed to update entry: %O', error);
        }
        this.emitEvent(taskId, stepId, {
          type: 'entry-update',
          entry: event.entry,
        });
        break;
      }

      case 'tool-result': {
        try {
          await AgentMessageRepository.updateToolResult({
            taskId,
            toolId: event.toolId,
            result: event.result,
            isError: event.isError,
            durationMs: event.durationMs,
          });
        } catch (error) {
          dbg.agent('Failed to update tool result: %O', error);
        }
        this.emitEvent(taskId, stepId, {
          type: 'tool-result',
          toolId: event.toolId,
          result: event.result,
          isError: event.isError,
          durationMs: event.durationMs,
        });
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

        // Step stays 'running' (agent session is active, just paused);
        // task-level status becomes 'waiting' for UI purposes.
        const task = await TaskRepository.update(taskId, { status: 'waiting' });
        emitTaskUpsert(task);
        this.emitEvent(taskId, stepId, { type: 'status', status: 'waiting' });
        this.emitEvent(taskId, stepId, {
          type: 'permission',
          ...request,
        });

        await this.notifyTaskEvent({
          taskId,
          stepId,
          event: 'permission-required',
          notificationId: `${taskId}:permission`,
          title: 'Permission Required',
          body: `Task "{taskName}" needs approval for ${request.toolName}`,
        });
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

        // Step stays 'running' (agent session is active, just paused);
        // task-level status becomes 'waiting' for UI purposes.
        const task = await TaskRepository.update(taskId, { status: 'waiting' });
        emitTaskUpsert(task);
        this.emitEvent(taskId, stepId, { type: 'status', status: 'waiting' });

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
        this.emitEvent(taskId, stepId, {
          type: 'question',
          requestId: request.requestId,
          questions,
        });

        await this.notifyTaskEvent({
          taskId,
          stepId,
          event: 'question',
          notificationId: `${taskId}:question`,
          title: 'Question from Agent',
          body: 'Task "{taskName}" has a question',
        });
        break;
      }

      case 'complete': {
        const result = event.result;
        dbg.agentSession(
          'Step %s received result (isError: %s, queued: %d)',
          stepId,
          result.isError,
          session.queuedPrompts.length,
        );

        if (result.isError && session.hasTerminalError) {
          dbg.agentSession(
            'Skipping duplicate errored completion for step %s after terminal error',
            stepId,
          );
          break;
        }

        const resultEntryId = nanoid();

        const resultModel = result.model ?? session.currentModel;

        if (result.usage || result.cost) {
          aiUsageTrackingService.recordUsageSafe({
            context: {
              feature: session.usageFeature,
              projectId: session.projectId,
              taskId,
              stepId,
            },
            backend: session.backendType,
            model: resultModel,
            usage: result.usage ?? {},
            allowEmptyUsage: !result.usage,
            cost: result.cost,
            sourceId: `agent-message:${resultEntryId}`,
          });
        }

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
            const existing: PermissionScope = {
              ...(currentTask?.sessionRules ?? {}),
            };
            // Convert accumulated string[] ("tool:matchValue" | "tool") → PermissionScope
            for (const entry of tools) {
              const colonIdx = entry.indexOf(':');
              if (colonIdx !== -1) {
                const tool = entry.slice(0, colonIdx);
                const matchValue = entry.slice(colonIdx + 1);
                existing[tool] = buildToolPermissionConfig({
                  existing: existing[tool],
                  matchValue,
                });
              } else {
                existing[entry] = 'allow';
              }
            }
            const updatedTask = await TaskRepository.update(taskId, {
              sessionRules: existing,
            });
            emitTaskUpsert(updatedTask);
          }
        }

        // Check for queued prompts
        const nextPrompt = session.queuedPrompts.shift();
        if (nextPrompt && !result.isError) {
          dbg.agentSession('Step %s processing next queued prompt', stepId);
          this.emitEvent(taskId, stepId, {
            type: 'queue-update',
            queuedPrompts: session.queuedPrompts,
          });
          // Recursively process next queued prompt
          const queuedParts =
            queuedPromptParts.get(nextPrompt.id) ??
            textPrompt(nextPrompt.content);
          queuedPromptParts.delete(nextPrompt.id);
          return await this.runBackend(stepId, queuedParts, session);
        }

        // No more queued prompts - finalize
        let autoStartStepIds: string[] = [];
        if (result.isError) {
          await StepService.errorStep(stepId);
        } else {
          autoStartStepIds = await StepService.completeStep(stepId);
        }

        await this.persistAndEmitSyntheticEntry(taskId, session, {
          id: resultEntryId,
          date: new Date().toISOString(),
          model: resultModel ?? undefined,
          isSynthetic: true,
          type: 'result',
          value: result.text,
          isError: result.isError,
          durationMs: result.durationMs,
          cost: result.cost?.costUsd,
          apiCost: result.cost?.apiCostUsd,
          usage: result.usage,
          contextUsage: result.contextUsage,
        });

        const status = result.isError ? 'errored' : 'completed';

        // Mark as unread BEFORE emitting the status event so the feed
        // re-fetch (triggered by the event) reads the updated value.
        await this.markTaskUnreadIfBackground(taskId);

        this.emitEvent(taskId, stepId, { type: 'status', status });

        // Auto-start dependent steps whose dependencies are now satisfied
        for (const autoStepId of autoStartStepIds) {
          dbg.agent(
            'Auto-starting dependent step %s (task %s)',
            autoStepId,
            taskId,
          );
          this.start(autoStepId).catch((err) => {
            void this.handleAutoStartFailure(autoStepId, err);
          });
        }

        await this.notifyTaskEvent({
          taskId,
          stepId,
          event: status === 'completed' ? 'completed' : 'errored',
          notificationId: `${taskId}:complete`,
          title: status === 'completed' ? 'Task Completed' : 'Task Failed',
          body:
            status === 'completed'
              ? 'Task "{taskName}" finished successfully'
              : 'Task "{taskName}" encountered an error',
        });
        break;
      }

      case 'error': {
        dbg.agent('Backend error for step %s: %s', stepId, event.error);
        session.hasTerminalError = true;

        // Emit a synthetic error entry so the user sees the error in the timeline
        await this.persistAndEmitSyntheticEntry(taskId, session, {
          id: nanoid(),
          date: new Date().toISOString(),
          isSynthetic: true,
          type: 'result',
          value: event.error,
          isError: true,
        });

        await StepService.errorStep(stepId);
        await this.markTaskUnreadIfBackground(taskId);
        this.emitEvent(taskId, stepId, {
          type: 'status',
          status: 'errored',
          error: event.error,
        });
        await this.notifyTaskEvent({
          taskId,
          stepId,
          event: 'errored',
          notificationId: `${taskId}:error`,
          title: 'Task Failed',
          body: 'Task "{taskName}" encountered an error',
        });
        break;
      }

      case 'rate-limit': {
        const message =
          event.message || 'Rate limit reached — retrying automatically';
        dbg.agent(
          'Rate limit for task %s: %s (retryAfterMs: %s)',
          taskId,
          message,
          event.retryAfterMs,
        );

        // Emit a non-terminal assistant entry so the user sees the retry state
        // without closing the current prompt group.
        await this.persistAndEmitSyntheticEntry(taskId, session, {
          id: nanoid(),
          date: new Date().toISOString(),
          isSynthetic: true,
          type: 'assistant-message',
          value: message,
        });
        break;
      }

      case 'mode-change': {
        const updatedStep = await TaskStepRepository.update(stepId, {
          interactionMode: event.mode,
        });
        emitStepUpsert(updatedStep);
        break;
      }

      default:
        // Other event types (session-updated, tool-state-update, etc.)
        // are logged but not actively handled yet
        dbg.agent('Unhandled event type for step %s: %s', stepId, event.type);
        break;
    }
  }

  // --- Public API ---

  async start(stepId: string): Promise<void> {
    // Check if already running
    if (this.sessions.has(stepId)) {
      dbg.agentSession('Ignoring duplicate start for running step %s', stepId);
      return;
    }

    // Prevent concurrent starts for the same step while start() is still
    // resolving prompt/dependencies and creating the in-memory session.
    if (this.startingSteps.has(stepId)) {
      dbg.agentSession('Ignoring duplicate start for pending step %s', stepId);
      return;
    }

    this.startingSteps.add(stepId);

    let session: ActiveSession | null = null;
    let runningStep: Awaited<ReturnType<typeof TaskStepRepository.findById>>;

    try {
      runningStep = await TaskStepRepository.findById(stepId);
      if (!runningStep) {
        throw new Error(`Step ${stepId} not found`);
      }

      // Surface work immediately while continue-summary synthesis runs.
      await StepService.update(stepId, { status: 'running' });
      await StepService.syncTaskStatus(runningStep.taskId);

      // Create session before prompt resolution so synthetic summary entries can
      // appear in timeline while {{summary(step.*)}} resolves.
      session = await this.createSession(stepId);
      this.emitEvent(session.taskId, stepId, {
        type: 'status',
        status: 'running',
      });

      // Resolve prompt and validate dependencies
      const promptResolutionStartedAt = Date.now();
      dbg.agentSession('Resolving startup prompt for step %s', stepId);
      const { resolvedPrompt, step } = await StepService.resolveAndValidate(
        stepId,
        {
          onSummaryLifecycle: {
            onStart: async (summaryStep, prompt) => {
              if (!session) return;
              await this.persistAndEmitSyntheticEntry(session.taskId, session, {
                id: nanoid(),
                date: new Date().toISOString(),
                isSynthetic: true,
                type: 'user-prompt',
                value: prompt,
                isSDKSynthetic: true,
              });
            },
            onResolved: async (summaryStep, summary) => {
              if (!session) return;
              await this.persistAndEmitSyntheticEntry(session.taskId, session, {
                id: nanoid(),
                date: new Date().toISOString(),
                isSynthetic: true,
                type: 'assistant-message',
                value: `Summary for "${summaryStep.name}":\n\n${summary}`,
              });
            },
          },
        },
      );
      dbg.agentSession(
        'Resolved startup prompt for step %s in %dms (length=%d)',
        stepId,
        Date.now() - promptResolutionStartedAt,
        resolvedPrompt.length,
      );

      // Build prompt parts from resolved prompt + any pending image attachments
      const pendingImages = this.pendingImageAttachments.get(session.taskId);
      this.pendingImageAttachments.delete(session.taskId);

      // For review steps, build the review prompt from reviewer configs
      let effectivePrompt = resolvedPrompt;
      if (step.type === 'review') {
        const task = await TaskRepository.findById(step.taskId);
        const meta = step.meta as ReviewStepMeta;
        effectivePrompt = buildReviewPrompt({
          basePrompt: resolvedPrompt,
          meta,
          startCommitHash: task?.startCommitHash ?? null,
          workItemContext: meta.workItemContext,
        });
      }

      const parts: PromptPart[] = textPrompt(effectivePrompt);
      // Include images persisted on the step
      if (step.images && step.images.length > 0) {
        parts.push(...step.images);
      }
      // Include transient pending images (from initial task creation)
      if (pendingImages && pendingImages.length > 0) {
        parts.push(...pendingImages);
      }

      // Only generate the task name on the first step (sortOrder 0).
      // Subsequent steps should not overwrite an already-generated name.
      const isFirstStep = step.sortOrder === 0;

      try {
        dbg.agentSession('Starting agent for step %s', stepId);
        await this.runBackend(stepId, parts, session, {
          generateNameOnInit: isFirstStep,
          initialPrompt: step.promptTemplate,
          isInitialPrompt: true,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        dbg.agent('Step %s start failed: %s', stepId, errorMessage);

        // Emit a synthetic error entry so the user sees the error in the timeline
        await this.persistAndEmitSyntheticEntry(session.taskId, session, {
          id: nanoid(),
          date: new Date().toISOString(),
          isSynthetic: true,
          type: 'result',
          value: errorMessage,
          isError: true,
        });

        await StepService.errorStep(stepId);
        this.emitEvent(session.taskId, stepId, {
          type: 'status',
          status: 'errored',
          error: errorMessage,
        });
        await this.notifyTaskEvent({
          taskId: session.taskId,
          stepId,
          event: 'errored',
          notificationId: `${session.taskId}:start-error:${stepId}`,
          title: 'Task Failed',
          body: 'Task "{taskName}" encountered an error',
        });
      } finally {
        this.sessions.delete(stepId);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      if (session) {
        await this.persistAndEmitSyntheticEntry(session.taskId, session, {
          id: nanoid(),
          date: new Date().toISOString(),
          isSynthetic: true,
          type: 'result',
          value: errorMessage,
          isError: true,
        });
        this.sessions.delete(stepId);
      }

      if (runningStep) {
        await StepService.errorStep(stepId);
        this.emitEvent(runningStep.taskId, stepId, {
          type: 'status',
          status: 'errored',
          error: errorMessage,
        });
      }

      throw error;
    } finally {
      this.startingSteps.delete(stepId);
    }
  }

  async stop(
    stepId: string,
    options: { reason?: 'user' | 'shutdown' } = {},
  ): Promise<void> {
    dbg.agentSession('Stopping step %s', stepId);

    const session = this.sessions.get(stepId);
    if (!session) {
      dbg.agentSession('No session found for step %s, nothing to stop', stepId);
      return;
    }

    const { taskId } = session;

    // Clear queued prompts and their stored parts
    for (const prompt of session.queuedPrompts) {
      queuedPromptParts.delete(prompt.id);
    }
    session.queuedPrompts = [];
    this.emitEvent(taskId, stepId, {
      type: 'queue-update',
      queuedPrompts: [],
    });

    // Close any pending permission/question notifications
    notificationService.close(`${taskId}:permission`);
    notificationService.close(`${taskId}:question`);

    // Clear pending requests
    session.pendingRequests = [];

    session.abortController.abort();

    // Stop the backend even if stop races with backend startup completing.
    const backendSessionId =
      session.backendSessionId ??
      (await session.backendStartPromise
        ?.then((agentSession) => agentSession.sessionId)
        .catch((error) => {
          dbg.agentSession(
            'Backend startup for step %s failed while stopping: %O',
            stepId,
            error,
          );
          return null;
        })) ??
      null;
    if (backendSessionId) {
      await session.backend.stop(backendSessionId);
    }
    await agentResourceMonitorService.stop(stepId);

    if (options.reason !== 'shutdown') {
      await this.persistAndEmitSyntheticEntry(taskId, session, {
        id: nanoid(),
        date: new Date().toISOString(),
        isSynthetic: true,
        type: 'result',
        value: 'Task interrupted by user',
        isError: true,
      });
    }

    await StepService.interruptStep(stepId);
    this.emitEvent(taskId, stepId, {
      type: 'status',
      status: 'interrupted',
      error:
        options.reason === 'shutdown'
          ? 'Stopped by app shutdown'
          : 'Stopped by user',
    });
    this.sessions.delete(stepId);
    dbg.agentSession('Step %s stopped and session cleaned up', stepId);
  }

  async stopAll(options: { reason?: 'user' | 'shutdown' } = {}): Promise<void> {
    const stepIds = [...this.sessions.keys()];
    dbg.agentSession('Stopping all active agent sessions (%d)', stepIds.length);
    const results = await Promise.allSettled(
      stepIds.map((stepId) => this.stop(stepId, options)),
    );
    const failures = results.filter((result) => result.status === 'rejected');
    if (failures.length > 0) {
      dbg.agentSession(
        'Failed to stop %d active agent sessions during stopAll',
        failures.length,
      );
      throw new Error(
        `Failed to stop ${failures.length} active agent sessions`,
      );
    }
    dbg.agentSession('All active agent sessions stopped');
  }

  async respond(
    stepId: string,
    requestId: string,
    response: PermissionResponse | QuestionResponse,
  ): Promise<void> {
    dbg.agentPermission(
      'Responding to request %s for step %s',
      requestId,
      stepId,
    );
    const session = this.sessions.get(stepId);
    if (!session) {
      dbg.agentSession(
        'No active session for step %s, marking as interrupted',
        stepId,
      );
      const step = await TaskStepRepository.findById(stepId);
      if (step) {
        await StepService.update(stepId, { status: 'interrupted' });
        await StepService.syncTaskStatus(step.taskId);
        this.emitEvent(step.taskId, stepId, {
          type: 'status',
          status: 'interrupted',
          error: 'Session is no longer active',
        });
      }
      return;
    }

    const { taskId } = session;

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

      // Compute toolsToAllow from the pending request's tool name and input
      // so backends can update their in-memory session state.
      // If the response includes an explicit toolsToAllow override (e.g., from
      // "Allow All" buttons), use that instead of deriving from the request.
      let toolsToAllow: string[] | undefined;
      if (permResponse.behavior === 'allow') {
        if (permResponse.toolsToAllow) {
          toolsToAllow = permResponse.toolsToAllow;
        } else if (request.permissionRequest) {
          const { toolName, input } = request.permissionRequest;
          const { tool, matchValue } = normalizeToolRequest(toolName, input);
          toolsToAllow = [matchValue ? `${tool}:${matchValue}` : tool];
        }
      }

      await session.backend.respondToPermission(
        session.backendSessionId!,
        requestId,
        {
          behavior: permResponse.behavior,
          updatedInput: permResponse.updatedInput,
          message: permResponse.message,
          allowMode: permResponse.allowMode,
          toolsToAllow,
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

    // Resume running status (step was already 'running', update task-level)
    const task = await TaskRepository.update(taskId, { status: 'running' });
    emitTaskUpsert(task);
    this.emitEvent(taskId, stepId, { type: 'status', status: 'running' });

    notificationService.close(`${stepId}:${request.type}`);

    // If there are more pending requests, emit the next one
    if (session.pendingRequests.length > 0) {
      const next = session.pendingRequests[0];
      if (next.type === 'question' && next.questionRequest) {
        const questions: AgentQuestion[] = next.questionRequest.questions.map(
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
        this.emitEvent(taskId, stepId, {
          type: 'question',
          requestId: next.requestId,
          questions,
        });
      } else if (next.type === 'permission' && next.permissionRequest) {
        this.emitEvent(taskId, stepId, {
          type: 'permission',
          ...next.permissionRequest,
        });
      }
    }
  }

  async sendMessage(stepId: string, parts: PromptPart[]): Promise<void> {
    // If session exists and running, stop it first
    if (this.sessions.has(stepId)) {
      await this.stop(stepId);
    }

    // Create new session (will pick up existing sessionId for resume)
    const session = await this.createSession(stepId);
    const { taskId } = session;

    // Update step status to running (stop() above sets it to 'interrupted')
    await StepService.update(stepId, { status: 'running' });
    await StepService.syncTaskStatus(taskId);
    this.emitEvent(taskId, stepId, { type: 'status', status: 'running' });

    try {
      dbg.agentSession('Sending follow-up message for step %s', stepId);
      await this.runBackend(stepId, parts, session);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      dbg.agent('Step %s sendMessage failed: %s', stepId, errorMessage);

      // Emit a synthetic error entry so the user sees the error in the timeline
      await this.persistAndEmitSyntheticEntry(taskId, session, {
        id: nanoid(),
        date: new Date().toISOString(),
        isSynthetic: true,
        type: 'result',
        value: errorMessage,
        isError: true,
      });

      await StepService.errorStep(stepId);
      this.emitEvent(taskId, stepId, {
        type: 'status',
        status: 'errored',
        error: errorMessage,
      });
      await this.notifyTaskEvent({
        taskId,
        stepId,
        event: 'errored',
        notificationId: `${taskId}:send-error:${stepId}`,
        title: 'Task Failed',
        body: 'Task "{taskName}" encountered an error',
      });
    } finally {
      this.sessions.delete(stepId);
    }
  }

  /**
   * Queue a prompt to be sent after the current agent work completes.
   */
  queuePrompt(stepId: string, parts: PromptPart[]): { promptId: string } {
    const session = this.sessions.get(stepId);
    if (!session) {
      throw new Error(`No active session for step ${stepId}`);
    }

    const existingPrompt = session.queuedPrompts[0];
    if (existingPrompt) {
      const existingParts =
        queuedPromptParts.get(existingPrompt.id) ??
        textPrompt(existingPrompt.content);
      const combinedParts = appendPromptParts(existingParts, parts);
      existingPrompt.content = getPromptText(combinedParts);
      queuedPromptParts.set(existingPrompt.id, combinedParts);

      this.emitEvent(session.taskId, stepId, {
        type: 'queue-update',
        queuedPrompts: session.queuedPrompts,
      });

      dbg.agent(
        'Coalesced queued prompt %s for step %s',
        existingPrompt.id,
        stepId,
      );
      return { promptId: existingPrompt.id };
    }

    const id = nanoid();
    queuedPromptParts.set(id, parts);

    const queuedPrompt: QueuedPrompt = {
      id,
      content: getPromptText(parts),
      createdAt: Date.now(),
    };

    session.queuedPrompts.push(queuedPrompt);
    this.emitEvent(session.taskId, stepId, {
      type: 'queue-update',
      queuedPrompts: session.queuedPrompts,
    });

    dbg.agent('Queued prompt %s for step %s', queuedPrompt.id, stepId);
    return { promptId: queuedPrompt.id };
  }

  /**
   * Update a queued prompt before it is sent.
   */
  updateQueuedPrompt(stepId: string, promptId: string, content: string): void {
    const session = this.sessions.get(stepId);
    if (!session) {
      throw new Error(`No active session for step ${stepId}`);
    }

    const queuedPrompt = session.queuedPrompts.find((p) => p.id === promptId);
    if (!queuedPrompt) {
      throw new Error(`Queued prompt ${promptId} not found`);
    }

    const existingParts =
      queuedPromptParts.get(promptId) ?? textPrompt(queuedPrompt.content);
    const updatedParts = replacePromptText(existingParts, content);

    queuedPrompt.content = content;
    queuedPromptParts.set(promptId, updatedParts);
    this.emitEvent(session.taskId, stepId, {
      type: 'queue-update',
      queuedPrompts: session.queuedPrompts,
    });

    dbg.agent('Updated queued prompt %s for step %s', promptId, stepId);
  }

  /**
   * Cancel a specific queued prompt.
   */
  cancelQueuedPrompt(stepId: string, promptId: string): void {
    const session = this.sessions.get(stepId);
    if (!session) {
      throw new Error(`No active session for step ${stepId}`);
    }

    const index = session.queuedPrompts.findIndex((p) => p.id === promptId);
    if (index === -1) {
      throw new Error(`Queued prompt ${promptId} not found`);
    }

    queuedPromptParts.delete(promptId);
    session.queuedPrompts.splice(index, 1);
    this.emitEvent(session.taskId, stepId, {
      type: 'queue-update',
      queuedPrompts: session.queuedPrompts,
    });

    dbg.agent('Cancelled queued prompt %s for step %s', promptId, stepId);
  }

  /**
   * Get current queued prompts for a step.
   */
  getQueuedPrompts(stepId: string): QueuedPrompt[] {
    const session = this.sessions.get(stepId);
    return session?.queuedPrompts ?? [];
  }

  /**
   * Get the current pending request for a step (permission or question).
   * Returns null if no pending request exists.
   */
  getPendingRequest(stepId: string):
    | {
        type: 'permission';
        data: NormalizedPermissionRequest & {
          taskId: string;
          stepId: string;
        };
      }
    | {
        type: 'question';
        data: {
          taskId: string;
          stepId: string;
          requestId: string;
          questions: AgentQuestion[];
        };
      }
    | null {
    const session = this.sessions.get(stepId);
    if (!session || session.pendingRequests.length === 0) {
      return null;
    }

    const { taskId } = session;
    const request = session.pendingRequests[0];
    if (request.type === 'question' && request.questionRequest) {
      return {
        type: 'question',
        data: {
          taskId,
          stepId,
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
          stepId,
          ...request.permissionRequest,
        },
      };
    }

    return null;
  }

  async setMode(stepId: string, mode: InteractionMode): Promise<void> {
    const session = this.sessions.get(stepId);
    const step = await TaskStepRepository.findById(stepId);
    if (!step) return;

    const backend = session?.backendType ?? step.agentBackend ?? 'claude-code';
    const normalizedMode = normalizeInteractionModeForBackend({
      backend,
      mode,
    });

    dbg.agentSession('Setting mode for step %s to %s', stepId, normalizedMode);

    if (session?.backendSessionId) {
      await session.backend.setMode(session.backendSessionId, normalizedMode);
      dbg.agentSession('Updated backend permission mode for active session');
    }
    const updatedStep = await TaskStepRepository.update(stepId, {
      interactionMode: normalizedMode,
    });
    emitStepUpsert(updatedStep);
  }

  isRunning(stepId: string): boolean {
    return this.sessions.has(stepId);
  }

  async getMessages(stepId: string): Promise<NormalizedEntry[]> {
    return AgentMessageRepository.findByStepId(stepId);
  }

  async getMessageCount(stepId: string): Promise<number> {
    return AgentMessageRepository.getMessageCountByStepId(stepId);
  }

  async compactRawMessages(taskId: string): Promise<void> {
    try {
      // Group steps by backend and run the appropriate compactor for each
      const steps = await TaskStepRepository.findByTaskId(taskId);
      const backends = new Set(
        steps.map((s) => s.agentBackend ?? 'claude-code'),
      );

      for (const backendType of backends) {
        if (backendType === 'opencode') {
          await OpenCodeBackend.compactRawMessagesForTask(taskId);
        } else {
          await ClaudeCodeBackend.compactRawMessagesForTask(taskId);
        }
      }
    } catch (error) {
      dbg.agent(
        'Failed compacting raw messages for task %s: %O',
        taskId,
        error,
      );
    }
  }

  async getMessagesWithRawData(taskId: string, stepId: string) {
    const rows = await AgentMessageRepository.findWithRawDataByTaskId({
      taskId,
      stepId,
    });
    return rows.map((row) => ({
      messageIndex: row.messageIndex,
      rawData: row.rawData ? JSON.parse(row.rawData) : null,
      rawFormat: row.rawFormat,
      backendSessionId: row.backendSessionId,
      normalizedData: row.normalizedData
        ? JSON.parse(row.normalizedData)
        : null,
      createdAt: row.createdAt,
    }));
  }

  /**
   * Re-process normalization for all raw messages of a task.
   * Deletes existing normalized messages and re-creates them from raw data.
   * Returns the count of newly created normalized messages.
   */
  async reprocessNormalization(taskId: string): Promise<number> {
    return AgentMessageRepository.reprocessNormalization(taskId);
  }

  /**
   * Recover tasks and steps that were left in 'running' or 'waiting' state
   * from a previous app session. These were interrupted by app shutdown/crash
   * and should be marked as 'interrupted'.
   * Should be called on app startup before the main window is shown.
   */
  async recoverStaleTasks(): Promise<void> {
    // Recover stale tasks — mark as interrupted (status sync happens via steps below)
    const staleTasks = await TaskRepository.findByStatuses([
      'running',
      'waiting',
    ]);

    for (const task of staleTasks) {
      try {
        const updatedTask = await TaskRepository.update(task.id, {
          status: 'interrupted',
        });
        emitTaskUpsert(updatedTask);
      } catch (error) {
        dbg.agent('Failed to recover stale task %s: %O', task.id, error);
      }
    }

    if (staleTasks.length > 0) {
      dbg.agent('Recovered %d stale task(s) on startup', staleTasks.length);
    }

    // Recover stale steps — find ALL steps with 'running' status across all tasks
    // (not just staleTasks) to handle orphaned running steps under non-running tasks.
    // Write a synthetic interrupted message scoped to each step so the timeline shows it.
    const allRunningSteps = await TaskStepRepository.findByStatus('running');
    let staleStepCount = 0;
    for (const step of allRunningSteps) {
      try {
        const messageCount =
          await AgentMessageRepository.getMessageCountByStepId(step.id);

        await AgentMessageRepository.create({
          taskId: step.taskId,
          stepId: step.id,
          messageIndex: messageCount,
          entry: {
            id: nanoid(),
            date: new Date().toISOString(),
            isSynthetic: true,
            type: 'result',
            value: 'Task interrupted',
            isError: true,
          },
          rawMessageId: null,
        });

        const updatedStep = await TaskStepRepository.update(step.id, {
          status: 'interrupted',
        });
        emitStepUpsert(updatedStep);
        await StepService.syncTaskStatus(step.taskId);
        staleStepCount++;
      } catch (error) {
        dbg.agent('Failed to recover stale step %s: %O', step.id, error);
        // Best-effort: still mark the step as interrupted
        try {
          const updatedStep = await TaskStepRepository.update(step.id, {
            status: 'interrupted',
          });
          emitStepUpsert(updatedStep);
          await StepService.syncTaskStatus(step.taskId);
        } catch {
          dbg.agent('Failed to update status for stale step %s', step.id);
        }
      }
    }

    if (staleStepCount > 0) {
      dbg.agent('Recovered %d stale step(s) on startup', staleStepCount);
    }
  }
}

export const agentService = new AgentService();
