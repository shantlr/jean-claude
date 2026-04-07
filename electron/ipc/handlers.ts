import { exec, spawn } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';

import { BrowserWindow, app, ipcMain, dialog } from 'electron';

import type { AgentBackendType, PromptPart } from '@shared/agent-backend-types';
import {
  AGENT_CHANNELS,
  PermissionResponse,
  QuestionResponse,
} from '@shared/agent-types';
import type { GlobalPromptResponse } from '@shared/global-prompt-types';
import type {
  NewMcpServerTemplate,
  UpdateMcpServerTemplate,
  NewProjectMcpOverride,
} from '@shared/mcp-types';
import type {
  GetYamlParametersIpcParams,
  QueueBuildIpcParams,
} from '@shared/pipeline-types';
import type {
  NewProjectCommand,
  UpdateProjectCommand,
} from '@shared/run-command-types';
import {
  PRESET_EDITORS,
  type InteractionMode,
  type EditorSetting,
  type AppSettings,
  type NewToken,
  type UpdateToken,
  type NewTaskStep,
  type UpdateTaskStep,
  type SkillCreationStepMeta,
  isSkillCreationStepMeta,
  type ReviewerConfig,
  type ReviewStepMeta,
} from '@shared/types';
import type { UsageProviderType } from '@shared/usage-types';

import type { PermissionScope } from '../../shared/permission-types';
import {
  ProjectRepository,
  TaskRepository,
  ProviderRepository,
  TokenRepository,
  SettingsRepository,
  DebugRepository,
  TaskSummaryRepository,
  ProjectTodoRepository,
} from '../database/repositories';
import { McpTemplateRepository } from '../database/repositories/mcp-templates';
import { NotificationRepository } from '../database/repositories/notifications';
import { ProjectCommandRepository } from '../database/repositories/project-commands';
import { ProjectMcpOverrideRepository } from '../database/repositories/project-mcp-overrides';
import { TaskStepRepository } from '../database/repositories/task-steps';
import { TrackedPipelineRepository } from '../database/repositories/tracked-pipelines';
import {
  NewProject,
  NewTask,
  NewProvider,
  UpdateProject,
  UpdateTask,
  UpdateProvider,
} from '../database/schema';
import { dbg } from '../lib/debug';
import { pathExists } from '../lib/fs';
import { agentService } from '../services/agent-service';
import { agentUsageService } from '../services/agent-usage-service';
import {
  getOrganizationsByTokenId,
  validateTokenAndGetOrganizations,
  getTokenExpiration,
  getProviderDetails,
  queryWorkItems,
  getIterations,
  createPullRequest,
  cloneRepository,
  listPullRequests,
  getPullRequest,
  getPullRequestWorkItems,
  getPullRequestCommits,
  getPullRequestChanges,
  getPullRequestFileContent,
  getPullRequestThreads,
  addPullRequestComment,
  addPullRequestFileComment,
  addThreadReply,
  updateThreadStatus,
  getCurrentUser,
  activateWorkItem,
  listBuilds,
  listReleases,
  getBuild,
  getBuildTimeline,
  getBuildLog,
  getRelease,
  listBranches,
  getBuildDefinitionDetail,
  getYamlPipelineParameters,
  queueBuild,
  createRelease as createAzureRelease,
  cancelBuild,
  type CloneRepositoryParams,
} from '../services/azure-devops-service';
import { fetchImageAsBase64 } from '../services/azure-image-proxy-service';
import * as backendModelsService from '../services/backend-models-service';
import {
  generateCommitMessageForTask,
  generateMergeMessageForTask,
} from '../services/commit-message-generation-service';
import {
  complete as completeText,
  testCompletion,
  resetClient as resetCompletionClient,
  getDailyUsage as getCompletionDailyUsage,
} from '../services/completion-service';
import {
  createFeedNote,
  deleteFeedNote,
  getFeedItems,
  invalidatePrCache,
  invalidateWorkItemCache,
  updateFeedNote,
} from '../services/feed-service';
import {
  readGlobalPermissions,
  writeGlobalPermissions,
  validatePermissionScope,
  addGlobalPermission,
  removeGlobalPermission,
  editGlobalPermission,
} from '../services/global-permissions-service';
import {
  handlePromptResponse,
  sendGlobalPromptToWindow,
} from '../services/global-prompt-service';
import {
  MCP_PRESETS,
  getEnabledTemplatesForProject,
  getUnifiedMcpServers,
  activateMcpServer,
  deactivateMcpServer,
  substituteVariables,
} from '../services/mcp-template-service';
import { generateTaskName } from '../services/name-generation-service';
import { notificationService } from '../services/notification-service';
import {
  addProjectPermission,
  addWorktreePermission,
  buildToolPermissionConfig,
  normalizeToolRequest,
} from '../services/permission-settings-service';
import { pipelineTrackingService } from '../services/pipeline-tracking-service';
import { detectProjects } from '../services/project-detection-service';
import { projectFileIndexService } from '../services/project-file-index-service';
import { runCommandService } from '../services/run-command-service';
import {
  getAllManagedSkills,
  getAllManagedSkillsUnified,
  getSkillContent,
  createSkill,
  updateSkill,
  deleteSkill,
  disableSkill,
  enableSkill,
  previewLegacySkillMigration,
  executeLegacySkillMigration,
} from '../services/skill-management-service';
import {
  searchRegistry,
  fetchRegistrySkillContent,
  installFromRegistry,
} from '../services/skill-registry-service';
import { StepService } from '../services/step-service';
import { generateSummary } from '../services/summary-generation-service';
import {
  assertValidSourceSkillPath,
  assertValidWorkspacePath,
  cleanupSkillWorkspace,
  getOrCreateSystemProject,
  getSkillWorkspacePath,
} from '../services/system-project-service';
import {
  checkMergeConflicts,
  createWorktree,
  getWorktreeDiff,
  getWorktreeFileContent,
  getWorktreeUnifiedDiff,
  getProjectBranches,
  getCurrentBranch,
  getCurrentCommitHash,
  getWorktreeStatus,
  commitWorktreeChanges,
  cleanupWorktree,
  cleanupMissingWorktree,
  mergeWorktree,
  pushBranch,
  deleteProjectWorktreesFolder,
} from '../services/worktree-service';

const execAsync = promisify(exec);

const VALID_BACKENDS = new Set<string>(['claude-code', 'opencode']);

function assertValidSkillCreationInput(data: {
  mode: string;
  enabledBackends: string[];
  sourceSkillPath?: string;
}) {
  if (data.mode !== 'create' && data.mode !== 'improve') {
    throw new Error('mode must be "create" or "improve"');
  }
  if (
    !Array.isArray(data.enabledBackends) ||
    data.enabledBackends.length === 0
  ) {
    throw new Error('enabledBackends must be a non-empty array');
  }
  for (const b of data.enabledBackends) {
    if (!VALID_BACKENDS.has(b)) {
      throw new Error(`Invalid backend type: ${b}`);
    }
  }
  if (data.mode === 'improve' && !data.sourceSkillPath) {
    throw new Error('sourceSkillPath is required for improve mode');
  }
}

function buildSkillCreationPrompt({
  userPrompt,
  mode,
  workspacePath,
}: {
  userPrompt: string;
  mode: 'create' | 'improve';
  workspacePath: string;
}): string {
  if (mode === 'improve') {
    return [
      `Improve an existing skill based on the following request:`,
      ``,
      `<user-request>`,
      userPrompt,
      `</user-request>`,
      ``,
      `The current skill files have been copied to: ${workspacePath}`,
      `Edit the SKILL.md (and any companion files) in that directory.`,
      ``,
      `The SKILL.md must retain valid YAML frontmatter with \`name\` and \`description\` fields.`,
      `Use the skill-creator skill for best practices.`,
    ].join('\n');
  }

  return [
    `Create a new skill based on the following description:`,
    ``,
    `<user-request>`,
    userPrompt,
    `</user-request>`,
    ``,
    `Write the skill to: ${workspacePath}/<skill-name>/SKILL.md`,
    ``,
    `The SKILL.md must have YAML frontmatter:`,
    `---`,
    `name: <skill-name>`,
    `description: <one-line description>`,
    `---`,
    ``,
    `<markdown body with instructions>`,
    ``,
    `Use the skill-creator skill for best practices.`,
  ].join('\n');
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function activateAssociatedWorkItems(params: {
  projectId: string;
  workItemIds: string[] | null | undefined;
  updateWorkItemStatus?: boolean;
}) {
  if (params.updateWorkItemStatus === false || !params.workItemIds?.length) {
    return;
  }

  const project = await ProjectRepository.findById(params.projectId);
  if (!project?.workItemProviderId) {
    return;
  }

  dbg.ipc('Activating %d work items', params.workItemIds.length);
  for (const workItemId of params.workItemIds) {
    activateWorkItem({
      providerId: project.workItemProviderId,
      workItemId: parseInt(workItemId, 10),
    }).catch((err) => {
      dbg.ipc('Failed to activate work item %s: %O', workItemId, err);
    });
  }
}

export function registerIpcHandlers() {
  dbg.ipc('Registering IPC handlers');

  ipcMain.handle('windowState:getIsFullscreen', (event) => {
    const currentWindow = BrowserWindow.fromWebContents(event.sender);
    return currentWindow?.isFullScreen() ?? false;
  });

  // Task focus (fire-and-forget from renderer)
  ipcMain.on('tasks:focused', (_, taskId: string) => {
    notificationService.closeForTask(taskId);
    agentService.setFocusedTask(taskId);
    TaskRepository.setHasUnread(taskId, false).catch((err) => {
      dbg.ipc('Failed to clear hasUnread for task %s: %O', taskId, err);
    });
  });

  // Projects
  ipcMain.handle('projects:findAll', () => ProjectRepository.findAll());
  ipcMain.handle('projects:findById', (_, id: string) =>
    ProjectRepository.findById(id),
  );
  ipcMain.handle('projects:create', (_, data: NewProject) => {
    dbg.ipc('projects:create %o', { name: data.name, path: data.path });
    return ProjectRepository.create(data);
  });
  ipcMain.handle(
    'projects:update',
    async (_, id: string, data: UpdateProject) => {
      dbg.ipc('projects:update %s %o', id, data);
      const result = await ProjectRepository.update(id, data);
      if (data.showWorkItemsInFeed !== undefined) {
        invalidateWorkItemCache();
      }
      if (data.showPrsInFeed !== undefined) {
        invalidatePrCache();
      }
      return result;
    },
  );
  ipcMain.handle('projects:delete', (_, id: string) => {
    dbg.ipc('projects:delete %s', id);
    return ProjectRepository.delete(id);
  });
  ipcMain.handle('projects:deleteWorktreesFolder', (_, projectId: string) => {
    dbg.ipc('projects:deleteWorktreesFolder %s', projectId);
    return deleteProjectWorktreesFolder(projectId);
  });
  ipcMain.handle('projects:reorder', (_, orderedIds: string[]) =>
    ProjectRepository.reorder(orderedIds),
  );
  ipcMain.handle('projects:getBranches', async (_, projectId: string) => {
    const project = await ProjectRepository.findById(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }
    return getProjectBranches(project.path);
  });
  ipcMain.handle('projects:getCurrentBranch', async (_, projectId: string) => {
    const project = await ProjectRepository.findById(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }
    return getCurrentBranch(project.path);
  });
  ipcMain.handle('projects:getSkills', async (_, projectId: string) => {
    const project = await ProjectRepository.findById(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }
    dbg.ipc(
      'projects:getSkills for project: %s, path: %s',
      projectId,
      project.path,
    );
    const backendType =
      (project.defaultAgentBackend as AgentBackendType | null) ?? 'claude-code';
    const managed = await getAllManagedSkills({
      backendType,
      projectPath: project.path,
    });
    return managed
      .filter((s) => s.enabledBackends[backendType] === true)
      .map(({ name, description, source, pluginName, skillPath }) => ({
        name,
        description,
        source,
        pluginName,
        skillPath,
      }));
  });

  // Tasks
  ipcMain.handle('tasks:findAll', () => TaskRepository.findAll());
  ipcMain.handle('tasks:findByProjectId', (_, projectId: string) =>
    TaskRepository.findByProjectId(projectId),
  );
  ipcMain.handle('tasks:findAllActive', () => TaskRepository.findAllActive());
  ipcMain.handle(
    'tasks:findAllCompleted',
    (_, params: { limit: number; offset: number }) =>
      TaskRepository.findAllCompleted(params),
  );
  ipcMain.handle('tasks:findById', (_, id: string) =>
    TaskRepository.findById(id),
  );
  ipcMain.handle(
    'tasks:create',
    async (
      _,
      data: NewTask & {
        interactionMode?: InteractionMode | null;
        modelPreference?: string | null;
        agentBackend?: AgentBackendType | null;
      },
    ) => {
      const {
        interactionMode,
        modelPreference,
        agentBackend,
        images,
        updateWorkItemStatus,
        ...taskData
      } = data;
      const task = await TaskRepository.create(taskData);

      // Auto-create a single step for the task
      await StepService.create({
        taskId: task.id,
        name: 'Step 1',
        promptTemplate: data.prompt,
        interactionMode: interactionMode ?? null,
        modelPreference: modelPreference ?? null,
        agentBackend: agentBackend ?? null,
        images: images ?? null,
      });

      // Optionally activate associated work items in Azure DevOps.
      await activateAssociatedWorkItems({
        projectId: data.projectId,
        workItemIds: task.workItemIds,
        updateWorkItemStatus,
      });

      return task;
    },
  );
  ipcMain.handle(
    'tasks:createWithWorktree',
    async (
      event,
      data: NewTask & {
        useWorktree: boolean;
        sourceBranch?: string | null;
        autoStart?: boolean;
        interactionMode?: InteractionMode | null;
        modelPreference?: string | null;
        agentBackend?: AgentBackendType | null;
      },
    ) => {
      const {
        useWorktree,
        sourceBranch,
        autoStart,
        images,
        interactionMode,
        modelPreference,
        agentBackend,
        updateWorkItemStatus,
        ...taskData
      } = data;
      dbg.ipc(
        'tasks:createWithWorktree useWorktree=%s, sourceBranch=%s, autoStart=%s',
        useWorktree,
        sourceBranch,
        autoStart,
      );

      let task;

      if (!useWorktree) {
        // No worktree requested, just create the task normally
        dbg.ipc('Creating task without worktree');
        task = await TaskRepository.create(taskData);
      } else {
        // Get the project to access its path and name
        const project = await ProjectRepository.findById(taskData.projectId);
        if (!project) {
          throw new Error(`Project ${taskData.projectId} not found`);
        }

        // Generate task name first (if not already provided)
        // This allows the worktree directory to use the same name
        let taskName = taskData.name;
        if (!taskName) {
          dbg.ipc('Generating task name from prompt');
          taskName = await generateTaskName(taskData.prompt);
          dbg.ipc('Generated task name: %s', taskName);
          // taskName may still be null if generation fails - that's ok
        }

        // Create the worktree using the generated task name
        // Use provided sourceBranch, fall back to project defaultBranch, or undefined for current HEAD
        const effectiveSourceBranch = sourceBranch ?? project.defaultBranch;
        dbg.ipc(
          'Creating worktree from branch: %s',
          effectiveSourceBranch ?? 'HEAD',
        );
        const {
          worktreePath,
          startCommitHash,
          branchName,
          sourceBranch: actualSourceBranch,
        } = await createWorktree(
          project.path,
          project.id,
          project.name,
          taskData.prompt,
          taskName ?? undefined,
          effectiveSourceBranch ?? undefined,
        );

        dbg.ipc('Worktree created: %s, branch: %s', worktreePath, branchName);

        // Create the task with worktree info and generated name
        task = await TaskRepository.create({
          ...taskData,
          name: taskName,
          worktreePath,
          startCommitHash,
          branchName,
          sourceBranch: actualSourceBranch,
        });
      }

      // Auto-create a single step for the task
      const step = await StepService.create({
        taskId: task.id,
        name: 'Step 1',
        promptTemplate: data.prompt,
        interactionMode: interactionMode ?? null,
        modelPreference: modelPreference ?? null,
        agentBackend: agentBackend ?? null,
        images: images ?? null,
      });

      // Optionally activate associated work items in Azure DevOps.
      await activateAssociatedWorkItems({
        projectId: taskData.projectId,
        workItemIds: task.workItemIds,
        updateWorkItemStatus,
      });

      // Auto-start the agent if requested
      if (autoStart && task) {
        dbg.ipc('Auto-starting agent for step %s (task %s)', step.id, task.id);
        const window = BrowserWindow.fromWebContents(event.sender);
        if (window) {
          agentService.setMainWindow(window);
        }
        // Attach pending images so they're included in the first prompt
        if (images?.length) {
          agentService.setPendingImages(task.id, images);
        }
        // Start agent in background (don't await to return task immediately)
        agentService.start(step.id).catch((err) => {
          dbg.ipc('Error auto-starting agent for step %s: %O', step.id, err);
        });
      }

      return task;
    },
  );
  ipcMain.handle(
    'tasks:createPrReview',
    async (
      event,
      params: {
        projectId: string;
        pullRequestId: number;
      },
    ) => {
      const { projectId, pullRequestId } = params;
      dbg.ipc(
        'tasks:createPrReview projectId=%s prId=%d',
        projectId,
        pullRequestId,
      );

      // 1. Get project and PR details
      const project = await ProjectRepository.findById(projectId);
      if (!project) throw new Error(`Project ${projectId} not found`);
      if (
        !project.repoProviderId ||
        !project.repoProjectId ||
        !project.repoId
      ) {
        throw new Error('Project has no linked repository');
      }

      const pr = await getPullRequest({
        providerId: project.repoProviderId,
        projectId: project.repoProjectId,
        repoId: project.repoId,
        pullRequestId,
      });

      // 2. Extract branch names
      const sourceBranch = pr.sourceRefName.replace('refs/heads/', '');

      // 3. Generate task name
      const rawName = `Review: ${pr.title}`;
      const taskName =
        rawName.length > 40 ? rawName.slice(0, 37) + '...' : rawName;

      // 4. Create worktree on the PR source branch
      const remoteSourceBranch = `origin/${sourceBranch}`;

      try {
        await execAsync(`git fetch origin "${sourceBranch}"`, {
          cwd: project.path,
          encoding: 'utf-8',
        });
      } catch (fetchError) {
        dbg.ipc(
          'Failed to fetch origin/%s before review worktree creation: %O',
          sourceBranch,
          fetchError,
        );
      }

      let worktreeResult:
        | {
            worktreePath: string;
            startCommitHash: string;
            branchName: string;
          }
        | undefined;

      try {
        worktreeResult = await createWorktree(
          project.path,
          project.id,
          project.name,
          `Review PR #${pullRequestId}`,
          taskName,
          remoteSourceBranch,
        );
      } catch (remoteBranchError) {
        dbg.ipc(
          'Failed to create worktree from %s, retrying with local branch %s: %O',
          remoteSourceBranch,
          sourceBranch,
          remoteBranchError,
        );

        worktreeResult = await createWorktree(
          project.path,
          project.id,
          project.name,
          `Review PR #${pullRequestId}`,
          taskName,
          sourceBranch,
        );
      }

      const { worktreePath, startCommitHash, branchName } = worktreeResult;

      // 5. Create task linked to PR
      const task = await TaskRepository.create({
        projectId,
        prompt: `Review PR #${pullRequestId}: ${pr.title}`,
        name: taskName,
        worktreePath,
        startCommitHash,
        branchName,
        sourceBranch,
        pullRequestId: String(pullRequestId),
        pullRequestUrl: pr.url ?? null,
        updatedAt: new Date().toISOString(),
      });

      // 6. Fetch work items linked to the PR (best-effort)
      let workItemContext = '';
      try {
        const workItems = await getPullRequestWorkItems({
          providerId: project.repoProviderId,
          projectId: project.repoProjectId,
          repoId: project.repoId,
          pullRequestId,
        });

        if (workItems.length > 0) {
          workItemContext = workItems
            .map((wi) => {
              const desc = wi.fields.description
                ? stripHtml(wi.fields.description)
                : '';
              const repro = wi.fields.reproSteps
                ? `\nRepro Steps: ${stripHtml(wi.fields.reproSteps)}`
                : '';
              return `- **#${wi.id} [${wi.fields.workItemType}] ${wi.fields.title}** (${wi.fields.state})${desc ? `\n  ${desc}` : ''}${repro}`;
            })
            .join('\n');

          // Store work item IDs on the task
          await TaskRepository.update(task.id, {
            workItemIds: workItems.map((wi) => String(wi.id)),
            workItemUrls: workItems.map((wi) => wi.url),
          });
        }
      } catch (wiError) {
        dbg.ipc('Failed to fetch PR work items (non-fatal): %O', wiError);
      }

      // 7. Build reviewer configs
      const defaultBackend =
        (project.defaultAgentBackend as AgentBackendType | null) ??
        'claude-code';

      const reviewers: ReviewerConfig[] = [
        {
          id: crypto.randomUUID(),
          label: 'Bug Detection',
          focusPrompt:
            'Look for potential bugs, logic errors, race conditions, off-by-one errors, null/undefined issues, and unhandled edge cases in the changed code.',
          backend: defaultBackend,
        },
        {
          id: crypto.randomUUID(),
          label: 'Code Quality',
          focusPrompt:
            'Evaluate code quality: naming, readability, DRY violations, overly complex logic, missing error handling, and adherence to project conventions.',
          backend: defaultBackend,
        },
        {
          id: crypto.randomUUID(),
          label: 'Security & Performance',
          focusPrompt:
            'Check for security vulnerabilities (injection, XSS, auth issues, secrets exposure) and performance concerns (N+1 queries, unnecessary re-renders, memory leaks, large allocations).',
          backend: defaultBackend,
        },
      ];

      if (workItemContext) {
        reviewers.push({
          id: crypto.randomUUID(),
          label: 'Requirements Alignment',
          focusPrompt:
            'Verify that the code changes fulfill the requirements described in the associated work items. Check for missing acceptance criteria, incomplete implementations, and deviations from the specification.',
          backend: defaultBackend,
        });
      }

      // 8. Create Step 1: Review Changes (review type with multi-reviewer)
      const reviewMeta: ReviewStepMeta = {
        reviewers,
        ...(workItemContext ? { workItemContext } : {}),
      };

      const reviewStep = await StepService.create({
        taskId: task.id,
        name: 'Review Changes',
        type: 'review',
        promptTemplate: [
          `Reviewing PR #${pullRequestId}: ${pr.title}`,
          '',
          'At the end of your synthesized summary, output a JSON block fenced with ```json containing an array of review comments with this shape:',
          '`[{ "filePath": "path/to/file", "lineNumber": 42, "comment": "Your review comment" }]`',
          '',
          'Each comment should reference a specific file and line number from the changed files.',
          'Only include actionable comments that warrant posting on the PR.',
        ].join('\n'),
        interactionMode: 'auto',
        agentBackend: defaultBackend,
        meta: reviewMeta,
        sortOrder: 0,
      });

      // 9. Create Step 2: Submit Review (pr-review)
      await TaskStepRepository.create({
        taskId: task.id,
        name: 'Submit Review',
        type: 'pr-review',
        dependsOn: [reviewStep.id],
        promptTemplate: '',
        sortOrder: 1,
        meta: {
          pullRequestId,
          projectId,
          comments: [],
        } as import('@shared/types').PrReviewStepMeta,
      });

      // 10. Auto-start the review step
      const window = BrowserWindow.fromWebContents(event.sender);
      if (window) {
        agentService.setMainWindow(window);
      }
      agentService.start(reviewStep.id).catch((err) => {
        dbg.ipc(
          'Error auto-starting review agent for step %s: %O',
          reviewStep.id,
          err,
        );
      });

      return task;
    },
  );
  ipcMain.handle('tasks:update', (_, id: string, data: UpdateTask) =>
    TaskRepository.update(id, data),
  );
  ipcMain.handle(
    'tasks:delete',
    async (
      _,
      id: string,
      options?: {
        deleteWorktree?: boolean;
      },
    ) => {
      await runCommandService.stopCommandsForTask(id);
      dbg.ipc('Stopped commands for task %s', id);

      const task = await TaskRepository.findById(id);

      if (task?.worktreePath) {
        const project = await ProjectRepository.findById(task.projectId);
        if (project) {
          await cleanupWorktree({
            worktreePath: task.worktreePath,
            projectPath: project.path,
            skipIfChanges: !options?.deleteWorktree,
            branchCleanup: 'delete',
            force: options?.deleteWorktree ?? false,
          });
          dbg.ipc('Deleted worktree for task %s', id);
        }
      }

      // Clean up skill workspaces for skill-creation steps (in parallel)
      const steps = await TaskStepRepository.findByTaskId(id);
      await Promise.all(
        steps
          .filter(
            (step) =>
              step.type === 'skill-creation' &&
              isSkillCreationStepMeta(step.meta),
          )
          .map((step) => {
            const meta = step.meta as SkillCreationStepMeta;
            return cleanupSkillWorkspace(meta.workspacePath).catch((err) => {
              dbg.ipc(
                'Failed to cleanup skill workspace %s: %O',
                meta.workspacePath,
                err,
              );
            });
          }),
      );

      await TaskRepository.delete(id);
      dbg.ipc('Deleted task %s', id);
    },
  );
  ipcMain.handle(
    'steps:setMode',
    async (_, stepId: string, mode: InteractionMode) => {
      await agentService.setMode(stepId, mode);
      return TaskStepRepository.findById(stepId);
    },
  );
  ipcMain.handle('steps:submitPrReview', async (_, stepId: string) => {
    dbg.ipc('steps:submitPrReview stepId=%s', stepId);

    const step = await TaskStepRepository.findById(stepId);
    if (!step) throw new Error(`Step not found: ${stepId}`);
    if (step.type !== 'pr-review')
      throw new Error('Step is not a pr-review type');

    const meta = step.meta as import('@shared/types').PrReviewStepMeta;
    const enabledComments = meta.comments.filter((c) => c.enabled);

    if (enabledComments.length > 0) {
      const project = await ProjectRepository.findById(meta.projectId);
      if (
        !project?.repoProviderId ||
        !project?.repoProjectId ||
        !project?.repoId
      ) {
        throw new Error('Project has no linked repository');
      }

      const results = await Promise.allSettled(
        enabledComments.map((comment) =>
          addPullRequestFileComment({
            providerId: project.repoProviderId!,
            projectId: project.repoProjectId!,
            repoId: project.repoId!,
            pullRequestId: meta.pullRequestId,
            filePath: comment.filePath,
            line: comment.lineNumber,
            content: comment.comment,
          }),
        ),
      );

      const failedCommentSet = new Set<(typeof enabledComments)[number]>();
      for (const [index, result] of results.entries()) {
        if (result.status === 'rejected') {
          failedCommentSet.add(enabledComments[index]);
        }
      }

      const failed = failedCommentSet.size;
      if (failed > 0) {
        dbg.ipc(
          '%d of %d comments failed to post',
          failed,
          enabledComments.length,
        );

        const updatedMeta: import('@shared/types').PrReviewStepMeta = {
          ...meta,
          comments: meta.comments.map((comment) => ({
            ...comment,
            enabled: failedCommentSet.has(comment),
          })),
          submittedAt: new Date().toISOString(),
          submittedCount: enabledComments.length - failed,
          submissionError: `${failed} of ${enabledComments.length} comments failed to post. You can retry the remaining comments.`,
        };

        await TaskStepRepository.update(stepId, {
          status: 'ready',
          meta: updatedMeta,
        });

        await StepService.syncTaskStatus(step.taskId);
        return TaskStepRepository.findById(stepId);
      }

      const updatedMeta: import('@shared/types').PrReviewStepMeta = {
        ...meta,
        submittedAt: new Date().toISOString(),
        submittedCount: enabledComments.length - failed,
        submissionError: undefined,
      };
      await TaskStepRepository.update(stepId, {
        status: 'completed',
        meta: updatedMeta,
      });
    } else {
      const updatedMeta: import('@shared/types').PrReviewStepMeta = {
        ...meta,
        submittedAt: new Date().toISOString(),
        submittedCount: 0,
        submissionError: undefined,
      };
      await TaskStepRepository.update(stepId, {
        status: 'completed',
        meta: updatedMeta,
      });
    }

    await StepService.syncTaskStatus(step.taskId);
    return TaskStepRepository.findById(stepId);
  });
  ipcMain.handle('tasks:toggleUserCompleted', async (_, id: string) => {
    // Fetch task before toggling to know the current state
    const taskBefore = await TaskRepository.findById(id);
    const isCompleting = taskBefore && !taskBefore.userCompleted;

    if (isCompleting) {
      await runCommandService.stopCommandsForTask(id);
    }

    // Perform the toggle
    const updatedTask = await TaskRepository.toggleUserCompleted(id);

    if (isCompleting) {
      await agentService.compactRawMessages(id);
    }

    // Prompt to clean up worktree when completing a task that has one
    if (isCompleting && taskBefore.worktreePath && taskBefore.branchName) {
      const project = await ProjectRepository.findById(taskBefore.projectId);
      if (project) {
        const worktreeExists = await pathExists(taskBefore.worktreePath);
        let accepted = false;

        if (worktreeExists) {
          accepted = await sendGlobalPromptToWindow({
            title: 'Delete Worktree?',
            message:
              'This task has an associated worktree. Would you like to delete the worktree and its branch?',
            details: `Path: ${taskBefore.worktreePath}\nBranch: ${taskBefore.branchName}`,
            acceptLabel: 'Delete Worktree',
            rejectLabel: 'Keep',
          });

          if (accepted) {
            await cleanupWorktree({
              worktreePath: taskBefore.worktreePath,
              projectPath: project.path,
              branchName: taskBefore.branchName,
              force: true,
            });
          }
        } else {
          accepted = await sendGlobalPromptToWindow({
            title: 'Worktree Directory Missing',
            message:
              'The worktree directory for this task no longer exists on disk. Would you like to clean up the orphaned git branch and worktree references?',
            details: `Path: ${taskBefore.worktreePath}\nBranch: ${taskBefore.branchName}`,
            acceptLabel: 'Clean Up',
            rejectLabel: 'Skip',
          });

          if (accepted) {
            await cleanupMissingWorktree({
              projectPath: project.path,
              branchName: taskBefore.branchName,
            });
          }
        }

        if (accepted) {
          return TaskRepository.update(id, {
            worktreePath: null,
            branchName: null,
            startCommitHash: null,
            sourceBranch: null,
          });
        }
      }
    }

    return updatedTask;
  });
  ipcMain.handle('tasks:clearUserCompleted', (_, id: string) =>
    TaskRepository.clearUserCompleted(id),
  );
  ipcMain.handle(
    'tasks:reorder',
    (_, projectId: string, activeIds: string[], completedIds: string[]) =>
      TaskRepository.reorder(projectId, activeIds, completedIds),
  );
  ipcMain.handle(
    'tasks:addSessionAllowedTool',
    async (
      _,
      taskId: string,
      toolName: string,
      input: Record<string, unknown>,
    ) => {
      const { tool, matchValue } = normalizeToolRequest(toolName, input);

      const task = await TaskRepository.findById(taskId);
      const current: PermissionScope = task?.sessionRules ?? {};
      const updated: PermissionScope = { ...current };
      updated[tool] = buildToolPermissionConfig({
        existing: updated[tool],
        matchValue,
      });

      await TaskRepository.update(taskId, { sessionRules: updated });
      return TaskRepository.findById(taskId);
    },
  );
  ipcMain.handle(
    'tasks:removeSessionAllowedTool',
    async (_, taskId: string, toolName: string, pattern?: string) => {
      const task = await TaskRepository.findById(taskId);
      const current: PermissionScope = { ...(task?.sessionRules ?? {}) };

      if (pattern) {
        const existing = current[toolName];
        if (typeof existing === 'object' && existing !== null) {
          const updatedPatterns = {
            ...(existing as Record<string, 'allow'>),
          };
          delete updatedPatterns[pattern];
          if (Object.keys(updatedPatterns).length > 0) {
            current[toolName] = updatedPatterns;
          } else {
            delete current[toolName];
          }
        }
      } else {
        delete current[toolName];
      }

      await TaskRepository.update(taskId, { sessionRules: current });
      return TaskRepository.findById(taskId);
    },
  );

  ipcMain.handle(
    'tasks:allowForProject',
    async (
      _,
      taskId: string,
      toolName: string,
      input: Record<string, unknown>,
    ) => {
      const task = await TaskRepository.findById(taskId);
      if (!task) throw new Error(`Task ${taskId} not found`);
      const project = await ProjectRepository.findById(task.projectId);
      if (!project) throw new Error(`Project ${task.projectId} not found`);

      // Write to .jean-claude/settings.local.json (project scope)
      await addProjectPermission(project.path, toolName, input);

      // Also add to session rules
      const { tool, matchValue } = normalizeToolRequest(toolName, input);
      const current: PermissionScope = { ...(task.sessionRules ?? {}) };
      current[tool] = buildToolPermissionConfig({
        existing: current[tool],
        matchValue,
      });
      await TaskRepository.update(taskId, { sessionRules: current });

      return TaskRepository.findById(taskId);
    },
  );

  ipcMain.handle(
    'tasks:allowForProjectWorktrees',
    async (
      _,
      taskId: string,
      toolName: string,
      input: Record<string, unknown>,
    ) => {
      const task = await TaskRepository.findById(taskId);
      if (!task) throw new Error(`Task ${taskId} not found`);
      const project = await ProjectRepository.findById(task.projectId);
      if (!project) throw new Error(`Project ${task.projectId} not found`);

      // Write to .jean-claude/settings.local.json (worktrees scope)
      await addWorktreePermission(project.path, toolName, input);

      // Also add to session rules
      const { tool, matchValue } = normalizeToolRequest(toolName, input);
      const current: PermissionScope = { ...(task.sessionRules ?? {}) };
      current[tool] = buildToolPermissionConfig({
        existing: current[tool],
        matchValue,
      });
      await TaskRepository.update(taskId, { sessionRules: current });

      return TaskRepository.findById(taskId);
    },
  );

  // Global permissions
  ipcMain.handle('globalPermissions:get', async () => {
    return readGlobalPermissions();
  });

  ipcMain.handle(
    'globalPermissions:set',
    async (_, permissions: PermissionScope) => {
      // Validate at the IPC boundary (TypeScript types are erased at runtime)
      validatePermissionScope(permissions);
      await writeGlobalPermissions(permissions);
    },
  );

  ipcMain.handle(
    'globalPermissions:addRule',
    async (
      _,
      toolName: string,
      input: Record<string, unknown>,
      action?: import('@shared/permission-types').PermissionAction,
    ) => {
      if (typeof toolName !== 'string' || !toolName.trim()) {
        throw new Error('Invalid toolName: must be a non-empty string');
      }
      if (typeof input !== 'object' || input === null || Array.isArray(input)) {
        throw new Error('Invalid input: must be a plain object');
      }
      if (
        action !== undefined &&
        action !== 'allow' &&
        action !== 'ask' &&
        action !== 'deny'
      ) {
        throw new Error(
          'Invalid action: must be one of "allow", "ask", or "deny"',
        );
      }
      const added = await addGlobalPermission({ toolName, input, action });
      if (!added) {
        throw new Error(
          'Bare "bash" without a command pattern is not allowed globally',
        );
      }
      return readGlobalPermissions();
    },
  );

  ipcMain.handle(
    'globalPermissions:removeRule',
    async (_, tool: string, pattern?: string) => {
      if (typeof tool !== 'string' || !tool.trim()) {
        throw new Error('Invalid tool: must be a non-empty string');
      }
      if (pattern !== undefined && typeof pattern !== 'string') {
        throw new Error('Invalid pattern: must be a string if provided');
      }
      await removeGlobalPermission({ tool, pattern });
      return readGlobalPermissions();
    },
  );

  ipcMain.handle(
    'globalPermissions:editRule',
    async (
      _,
      tool: string,
      oldPattern: string | undefined,
      newPattern: string | undefined,
      action: import('@shared/permission-types').PermissionAction,
    ) => {
      if (typeof tool !== 'string' || !tool.trim()) {
        throw new Error('Invalid tool: must be a non-empty string');
      }
      if (action !== 'allow' && action !== 'ask' && action !== 'deny') {
        throw new Error(
          'Invalid action: must be one of "allow", "ask", or "deny"',
        );
      }
      await editGlobalPermission({ tool, oldPattern, newPattern, action });
      return readGlobalPermissions();
    },
  );

  ipcMain.handle(
    'tasks:allowGlobally',
    async (
      _,
      taskId: string,
      toolName: string,
      input: Record<string, unknown>,
    ) => {
      if (typeof taskId !== 'string' || !taskId.trim()) {
        throw new Error('Invalid taskId: must be a non-empty string');
      }
      if (typeof toolName !== 'string' || !toolName.trim()) {
        throw new Error('Invalid toolName: must be a non-empty string');
      }
      if (typeof input !== 'object' || input === null || Array.isArray(input)) {
        throw new Error('Invalid input: must be a plain object');
      }
      const added = await addGlobalPermission({ toolName, input });
      if (!added) {
        throw new Error(
          'Bare "bash" without a command pattern is not allowed globally',
        );
      }

      // Also add to session rules for immediate effect
      const task = await TaskRepository.findById(taskId);
      if (!task) throw new Error(`Task ${taskId} not found`);
      const { tool, matchValue } = normalizeToolRequest(toolName, input);
      const current: PermissionScope = { ...(task.sessionRules ?? {}) };
      current[tool] = buildToolPermissionConfig({
        existing: current[tool],
        matchValue,
      });
      await TaskRepository.update(taskId, { sessionRules: current });

      return TaskRepository.findById(taskId);
    },
  );

  // Task worktree operations - resolve paths internally from taskId
  ipcMain.handle('tasks:worktree:getDiff', async (_, taskId: string) => {
    const task = await TaskRepository.findById(taskId);
    if (!task?.worktreePath || !task?.startCommitHash) {
      throw new Error(`Task ${taskId} does not have a worktree`);
    }
    return getWorktreeDiff(
      task.worktreePath,
      task.startCommitHash,
      task.sourceBranch,
    );
  });

  ipcMain.handle(
    'tasks:worktree:getFileContent',
    async (
      _,
      taskId: string,
      filePath: string,
      status: 'added' | 'modified' | 'deleted',
    ) => {
      const task = await TaskRepository.findById(taskId);
      if (!task?.worktreePath || !task?.startCommitHash) {
        throw new Error(`Task ${taskId} does not have a worktree`);
      }
      return getWorktreeFileContent(
        task.worktreePath,
        task.startCommitHash,
        filePath,
        status,
        task.sourceBranch,
      );
    },
  );

  ipcMain.handle('tasks:worktree:getStatus', async (_, taskId: string) => {
    const task = await TaskRepository.findById(taskId);
    if (!task?.worktreePath) {
      throw new Error(`Task ${taskId} does not have a worktree`);
    }
    return getWorktreeStatus(task.worktreePath);
  });

  ipcMain.handle(
    'tasks:worktree:commit',
    async (
      _,
      taskId: string,
      params: { message?: string; stageAll: boolean },
    ) => {
      const task = await TaskRepository.findById(taskId);
      if (!task?.worktreePath) {
        throw new Error(`Task ${taskId} does not have a worktree`);
      }

      let { message } = params;

      // Auto-generate commit message if not provided
      if (!message) {
        const project = await ProjectRepository.findById(task.projectId);
        if (!project) {
          throw new Error(`Project ${task.projectId} not found`);
        }
        const generated = await generateCommitMessageForTask(
          task,
          project,
          params.stageAll,
        );
        if (!generated) {
          throw new Error(
            'Failed to generate commit message. Please commit manually.',
          );
        }
        message = generated;
      }

      return commitWorktreeChanges({
        worktreePath: task.worktreePath,
        message,
        stageAll: params.stageAll,
      });
    },
  );

  ipcMain.handle(
    'tasks:worktree:generateCommitMessage',
    async (_, taskId: string, params: { stageAll: boolean }) => {
      const task = await TaskRepository.findById(taskId);
      if (!task?.worktreePath) {
        throw new Error(`Task ${taskId} does not have a worktree`);
      }
      const project = await ProjectRepository.findById(task.projectId);
      if (!project) {
        throw new Error(`Project ${task.projectId} not found`);
      }
      return generateCommitMessageForTask(task, project, params.stageAll);
    },
  );

  ipcMain.handle(
    'tasks:worktree:checkMergeConflicts',
    async (_, taskId: string, params: { targetBranch: string }) => {
      const task = await TaskRepository.findById(taskId);
      if (!task?.worktreePath) {
        throw new Error(`Task ${taskId} does not have a worktree`);
      }
      const project = await ProjectRepository.findById(task.projectId);
      if (!project) {
        throw new Error(`Project ${task.projectId} not found`);
      }
      // Block conflict checks against protected branches
      if (
        project.protectedBranches?.some(
          (b) => b.toLowerCase() === params.targetBranch.toLowerCase(),
        )
      ) {
        return {
          hasConflicts: false,
          error: `Branch "${params.targetBranch}" is protected. Direct merges into this branch are not allowed.`,
        };
      }

      return checkMergeConflicts({
        worktreePath: task.worktreePath,
        projectPath: project.path,
        targetBranch: params.targetBranch,
      });
    },
  );

  ipcMain.handle(
    'tasks:worktree:merge',
    async (
      _,
      taskId: string,
      params: {
        targetBranch: string;
        squash?: boolean;
        commitMessage?: string;
        commitAllUnstaged?: boolean;
      },
    ) => {
      const task = await TaskRepository.findById(taskId);
      if (!task?.worktreePath) {
        throw new Error(`Task ${taskId} does not have a worktree`);
      }

      await runCommandService.stopCommandsForTask(taskId);

      if (params.commitAllUnstaged) {
        const status = await getWorktreeStatus(task.worktreePath);
        if (status.hasUnstagedChanges) {
          await commitWorktreeChanges({
            worktreePath: task.worktreePath,
            message: 'chore: commit unstaged changes before merge',
            stageAll: true,
          });
        }
      }
      const project = await ProjectRepository.findById(task.projectId);
      if (!project) {
        throw new Error(`Project ${task.projectId} not found`);
      }

      // Block merges into protected branches (case-insensitive for macOS HFS+)
      if (
        project.protectedBranches?.some(
          (b) => b.toLowerCase() === params.targetBranch.toLowerCase(),
        )
      ) {
        return {
          success: false,
          error: `Branch "${params.targetBranch}" is protected. Direct merges into this branch are not allowed.`,
        };
      }

      // Auto-generate commit message if squash merge with no user-provided message
      let commitMessage = params.commitMessage;
      if (params.squash && !commitMessage?.trim()) {
        commitMessage = await generateMergeMessageForTask(
          task,
          project,
          params.targetBranch,
        );
      }

      const result = await mergeWorktree({
        worktreePath: task.worktreePath,
        projectPath: project.path,
        targetBranch: params.targetBranch,
        squash: params.squash,
        commitMessage,
      });

      // On successful merge, clear worktree fields and mark the task as
      // completed atomically.  Doing this here (rather than from the
      // renderer) avoids a race where toggleUserCompleted sees stale
      // worktree fields, detects the directory as missing, and
      // incorrectly prompts the user for orphan cleanup.
      if (result.success) {
        await TaskRepository.update(taskId, {
          worktreePath: null,
          branchName: null,
          startCommitHash: null,
          sourceBranch: null,
        });
        await TaskRepository.toggleUserCompleted(taskId);
      }

      return result;
    },
  );

  ipcMain.handle('tasks:worktree:getBranches', async (_, taskId: string) => {
    const task = await TaskRepository.findById(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    const project = await ProjectRepository.findById(task.projectId);
    if (!project) {
      throw new Error(`Project ${task.projectId} not found`);
    }
    return getProjectBranches(project.path);
  });

  // Steps
  ipcMain.handle('steps:findByTaskId', (_, taskId: string) =>
    StepService.findByTaskId(taskId),
  );
  ipcMain.handle('steps:findById', (_, stepId: string) =>
    StepService.findById(stepId),
  );
  ipcMain.handle(
    'steps:create',
    async (event, data: NewTaskStep & { start?: boolean }) => {
      const { start, ...stepData } = data;

      // If auto-start is requested but step has dependencies, defer the start
      const hasDeps = (stepData.dependsOn?.length ?? 0) > 0;
      if (start && hasDeps) {
        stepData.autoStart = true;
      }

      const step = await StepService.create(stepData);

      const shouldStartNow = start && (!hasDeps || step.status === 'ready');
      if (shouldStartNow) {
        dbg.ipc('Auto-starting step %s (task %s)', step.id, step.taskId);
        const window = BrowserWindow.fromWebContents(event.sender);
        if (window) {
          agentService.setMainWindow(window);
        }
        if (step.images?.length) {
          agentService.setPendingImages(step.taskId, step.images);
        }
        agentService.start(step.id).catch((err) => {
          dbg.ipc('Error auto-starting step %s: %O', step.id, err);
          StepService.errorStep(step.id).catch((stepErr) => {
            dbg.ipc(
              'Error marking failed auto-start step %s: %O',
              step.id,
              stepErr,
            );
          });
        });
      }

      return step;
    },
  );
  ipcMain.handle('steps:update', (_, stepId: string, data: UpdateTaskStep) =>
    StepService.update(stepId, data),
  );

  ipcMain.handle('steps:resolvePrompt', (_, stepId: string) =>
    StepService.resolveAndValidate(stepId),
  );

  // Providers
  ipcMain.handle('providers:findAll', () => ProviderRepository.findAll());
  ipcMain.handle('providers:findById', (_, id: string) =>
    ProviderRepository.findById(id),
  );
  ipcMain.handle('providers:create', (_, data: NewProvider) =>
    ProviderRepository.create(data),
  );
  ipcMain.handle('providers:update', (_, id: string, data: UpdateProvider) =>
    ProviderRepository.update(id, data),
  );
  ipcMain.handle('providers:delete', (_, id: string) =>
    ProviderRepository.delete(id),
  );

  // Provider details (fetches projects/repos for a provider)
  ipcMain.handle('providers:getDetails', (_, providerId: string) =>
    getProviderDetails(providerId),
  );

  // Tokens
  ipcMain.handle('tokens:findAll', () => TokenRepository.findAll());
  ipcMain.handle('tokens:findById', (_, id: string) =>
    TokenRepository.findById(id),
  );
  ipcMain.handle('tokens:findByProviderType', (_, providerType: string) =>
    TokenRepository.findByProviderType(providerType),
  );
  ipcMain.handle('tokens:create', (_, data: NewToken) =>
    TokenRepository.create(data),
  );
  ipcMain.handle('tokens:update', (_, id: string, data: UpdateToken) =>
    TokenRepository.update(id, data),
  );
  ipcMain.handle('tokens:delete', (_, id: string) =>
    TokenRepository.delete(id),
  );

  // Azure DevOps
  ipcMain.handle('azureDevOps:getOrganizations', (_, tokenId: string) =>
    getOrganizationsByTokenId(tokenId),
  );
  ipcMain.handle('azureDevOps:validateToken', (_, token: string) =>
    validateTokenAndGetOrganizations(token),
  );
  ipcMain.handle('azureDevOps:getTokenExpiration', (_, tokenId: string) =>
    getTokenExpiration(tokenId),
  );
  ipcMain.handle('azureDevOps:getCurrentUser', (_, providerId: string) =>
    getCurrentUser(providerId),
  );
  ipcMain.handle(
    'azureDevOps:queryWorkItems',
    (
      _,
      params: {
        providerId: string;
        projectId: string;
        projectName: string;
        filters: {
          states?: string[];
          workItemTypes?: string[];
          excludeWorkItemTypes?: string[];
          searchText?: string;
          iterationPath?: string;
        };
      },
    ) => queryWorkItems(params),
  );

  ipcMain.handle(
    'azureDevOps:getWorkItemById',
    async (_event, params: { providerId: string; workItemId: number }) => {
      const { getWorkItemById } =
        await import('../services/azure-devops-service');
      return getWorkItemById(params);
    },
  );

  ipcMain.handle(
    'azureDevOps:getIterations',
    (
      _,
      params: {
        providerId: string;
        projectName: string;
      },
    ) => getIterations(params),
  );

  ipcMain.handle(
    'azureDevOps:createPullRequest',
    (
      _,
      params: {
        providerId: string;
        projectId: string;
        repoId: string;
        sourceBranch: string;
        targetBranch: string;
        title: string;
        description: string;
        isDraft: boolean;
      },
    ) => createPullRequest(params),
  );

  ipcMain.handle(
    'azureDevOps:cloneRepository',
    (_, params: CloneRepositoryParams) => cloneRepository(params),
  );

  // Azure DevOps Pull Requests
  ipcMain.handle(
    'azureDevOps:listPullRequests',
    (
      _,
      params: {
        providerId: string;
        projectId: string;
        repoId: string;
        status?: 'active' | 'completed' | 'abandoned' | 'all';
      },
    ) => listPullRequests(params),
  );

  ipcMain.handle(
    'azureDevOps:getPullRequest',
    (
      _,
      params: {
        providerId: string;
        projectId: string;
        repoId: string;
        pullRequestId: number;
      },
    ) => getPullRequest(params),
  );

  ipcMain.handle(
    'azureDevOps:getPullRequestCommits',
    (
      _,
      params: {
        providerId: string;
        projectId: string;
        repoId: string;
        pullRequestId: number;
      },
    ) => getPullRequestCommits(params),
  );

  ipcMain.handle(
    'azureDevOps:getPullRequestChanges',
    (
      _,
      params: {
        providerId: string;
        projectId: string;
        repoId: string;
        pullRequestId: number;
      },
    ) => getPullRequestChanges(params),
  );

  ipcMain.handle(
    'azureDevOps:getPullRequestFileContent',
    (
      _,
      params: {
        providerId: string;
        projectId: string;
        repoId: string;
        pullRequestId: number;
        filePath: string;
        version: 'base' | 'head';
      },
    ) => getPullRequestFileContent(params),
  );

  ipcMain.handle(
    'azureDevOps:getPullRequestThreads',
    (
      _,
      params: {
        providerId: string;
        projectId: string;
        repoId: string;
        pullRequestId: number;
      },
    ) => getPullRequestThreads(params),
  );

  ipcMain.handle(
    'azureDevOps:addPullRequestComment',
    (
      _,
      params: {
        providerId: string;
        projectId: string;
        repoId: string;
        pullRequestId: number;
        content: string;
      },
    ) => addPullRequestComment(params),
  );

  ipcMain.handle(
    'azureDevOps:addPullRequestFileComment',
    (
      _,
      params: {
        providerId: string;
        projectId: string;
        repoId: string;
        pullRequestId: number;
        filePath: string;
        line: number;
        lineEnd?: number;
        content: string;
      },
    ) => addPullRequestFileComment(params),
  );

  ipcMain.handle(
    'azureDevOps:addThreadReply',
    (
      _,
      params: {
        providerId: string;
        projectId: string;
        repoId: string;
        pullRequestId: number;
        threadId: number;
        content: string;
      },
    ) => addThreadReply(params),
  );

  ipcMain.handle(
    'azureDevOps:updateThreadStatus',
    (
      _,
      params: {
        providerId: string;
        projectId: string;
        repoId: string;
        pullRequestId: number;
        threadId: number;
        status: string;
      },
    ) => updateThreadStatus(params),
  );

  ipcMain.handle(
    'azureDevOps:fetchImageAsBase64',
    (
      _,
      params: {
        providerId: string;
        imageUrl: string;
      },
    ) => fetchImageAsBase64(params),
  );

  ipcMain.handle('tasks:worktree:pushBranch', async (_, taskId: string) => {
    const task = await TaskRepository.findById(taskId);
    if (!task?.worktreePath || !task?.branchName) {
      throw new Error(`Task ${taskId} does not have a worktree with a branch`);
    }
    return pushBranch({
      worktreePath: task.worktreePath,
      branchName: task.branchName,
    });
  });

  ipcMain.handle(
    'tasks:worktree:delete',
    async (_, taskId: string, options?: { keepBranch?: boolean }) => {
      const task = await TaskRepository.findById(taskId);
      if (!task?.worktreePath) return;

      const project = await ProjectRepository.findById(task.projectId);
      if (!project) return;

      const shouldKeepBranch = options?.keepBranch ?? false;
      const worktreeExists = await pathExists(task.worktreePath);

      if (worktreeExists) {
        await cleanupWorktree({
          worktreePath: task.worktreePath,
          projectPath: project.path,
          branchName: task.branchName,
          branchCleanup: shouldKeepBranch ? 'keep' : 'delete',
          force: true,
        });
      } else if (!shouldKeepBranch && task.branchName) {
        await cleanupMissingWorktree({
          projectPath: project.path,
          branchName: task.branchName,
        });
      }

      await TaskRepository.update(taskId, {
        worktreePath: null,
        branchName: null,
        startCommitHash: null,
        sourceBranch: null,
      });
    },
  );

  ipcMain.handle(
    'tasks:createPullRequest',
    async (
      _,
      params: {
        taskId: string;
        title: string;
        description: string;
        isDraft: boolean;
        deleteWorktree?: boolean;
      },
    ) => {
      const task = await TaskRepository.findById(params.taskId);
      if (!task?.worktreePath || !task?.branchName) {
        throw new Error(
          `Task ${params.taskId} does not have a worktree with a branch`,
        );
      }

      const project = await ProjectRepository.findById(task.projectId);
      if (
        !project?.repoProviderId ||
        !project?.repoProjectId ||
        !project?.repoId
      ) {
        throw new Error(
          `Project ${task.projectId} is not linked to a repository`,
        );
      }

      // Step 1: Check for uncommitted changes
      const status = await getWorktreeStatus(task.worktreePath);
      if (status.hasUncommittedChanges) {
        throw new Error(
          'You have uncommitted changes. Please commit your changes before creating a pull request.',
        );
      }

      // Step 2: Push branch to remote
      await pushBranch({
        worktreePath: task.worktreePath,
        branchName: task.branchName,
      });

      // Step 3: Create PR via Azure DevOps
      const targetBranch = task.sourceBranch ?? project.defaultBranch ?? 'main';
      const pr = await createPullRequest({
        providerId: project.repoProviderId,
        projectId: project.repoProjectId,
        repoId: project.repoId,
        sourceBranch: task.branchName,
        targetBranch,
        title: params.title,
        description: params.description,
        isDraft: params.isDraft,
        workItemIds: task.workItemIds ?? undefined,
      });

      // Step 4: Save PR info to task
      await TaskRepository.update(params.taskId, {
        pullRequestId: String(pr.id),
        pullRequestUrl: pr.url,
      });

      // Step 5: Optionally delete worktree (keep branch)
      if (params.deleteWorktree) {
        await cleanupWorktree({
          worktreePath: task.worktreePath,
          projectPath: project.path,
          branchCleanup: 'keep',
          force: true,
        });
        await TaskRepository.update(params.taskId, { worktreePath: null });
      }

      return { id: pr.id, url: pr.url };
    },
  );

  // Dialog
  ipcMain.handle('dialog:openDirectory', async (event) => {
    dbg.ipc('dialog:openDirectory called');
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(window!, {
      properties: ['openDirectory'],
    });
    dbg.ipc('dialog:openDirectory result: %o', result);
    return result.canceled ? null : result.filePaths[0];
  });

  // Projects: get detected projects from all known CLI sources
  ipcMain.handle('projects:getDetected', async () => {
    const existingProjects = await ProjectRepository.findAll();
    const existingPaths = new Set(existingProjects.map((p) => p.path));
    return detectProjects(existingPaths);
  });

  // Filesystem
  ipcMain.handle('fs:readPackageJson', async (_, dirPath: string) => {
    try {
      const pkgPath = path.join(dirPath, 'package.json');
      const content = await fs.readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(content);
      return { name: pkg.name };
    } catch {
      return null;
    }
  });

  ipcMain.handle('fs:readFile', async (_, filePath: string) => {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const ext = path.extname(filePath).slice(1);
      const languageMap: Record<string, string> = {
        ts: 'typescript',
        tsx: 'tsx',
        js: 'javascript',
        jsx: 'jsx',
        py: 'python',
        rb: 'ruby',
        go: 'go',
        rs: 'rust',
        java: 'java',
        kt: 'kotlin',
        swift: 'swift',
        c: 'c',
        cpp: 'cpp',
        h: 'c',
        hpp: 'cpp',
        cs: 'csharp',
        php: 'php',
        html: 'html',
        css: 'css',
        scss: 'scss',
        less: 'less',
        json: 'json',
        yaml: 'yaml',
        yml: 'yaml',
        xml: 'xml',
        md: 'markdown',
        sql: 'sql',
        sh: 'bash',
        bash: 'bash',
        zsh: 'bash',
        toml: 'toml',
        ini: 'ini',
        dockerfile: 'dockerfile',
      };
      return { content, language: languageMap[ext] || 'text' };
    } catch {
      return null;
    }
  });

  ipcMain.handle(
    'fs:listDirectory',
    async (_, dirPath: string, projectRoot: string) => {
      try {
        return await projectFileIndexService.listDirectory({
          projectRoot,
          dirPath,
        });
      } catch {
        return null;
      }
    },
  );

  ipcMain.handle('fs:listProjectFiles', async (_, projectRoot: string) => {
    try {
      return await projectFileIndexService.listProjectFiles({ projectRoot });
    } catch {
      return [];
    }
  });

  // Agent
  ipcMain.handle(AGENT_CHANNELS.START, (event, stepId: string) => {
    dbg.ipc('agent:start %s', stepId);
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
      agentService.setMainWindow(window);
    }
    return agentService.start(stepId);
  });

  ipcMain.handle(AGENT_CHANNELS.STOP, (_, stepId: string) => {
    dbg.ipc('agent:stop %s', stepId);
    return agentService.stop(stepId);
  });

  ipcMain.handle(
    AGENT_CHANNELS.RESPOND,
    (
      _,
      stepId: string,
      requestId: string,
      response: PermissionResponse | QuestionResponse,
    ) => {
      dbg.ipc('agent:respond step=%s, request=%s', stepId, requestId);
      return agentService.respond(stepId, requestId, response);
    },
  );

  ipcMain.handle(
    AGENT_CHANNELS.SEND_MESSAGE,
    (_, stepId: string, parts: PromptPart[]) => {
      dbg.ipc('agent:sendMessage %s (parts: %d)', stepId, parts.length);
      return agentService.sendMessage(stepId, parts);
    },
  );

  ipcMain.handle(
    AGENT_CHANNELS.QUEUE_PROMPT,
    (_, stepId: string, parts: PromptPart[]) => {
      dbg.ipc('agent:queuePrompt %s', stepId);
      return agentService.queuePrompt(stepId, parts);
    },
  );

  ipcMain.handle(
    AGENT_CHANNELS.CANCEL_QUEUED_PROMPT,
    (_, stepId: string, promptId: string) => {
      dbg.ipc('agent:cancelQueuedPrompt step=%s, prompt=%s', stepId, promptId);
      return agentService.cancelQueuedPrompt(stepId, promptId);
    },
  );

  ipcMain.handle(AGENT_CHANNELS.GET_MESSAGES, (_, stepId: string) => {
    return agentService.getMessages(stepId);
  });

  ipcMain.handle(AGENT_CHANNELS.GET_MESSAGE_COUNT, (_, stepId: string) => {
    return agentService.getMessageCount(stepId);
  });

  ipcMain.handle(AGENT_CHANNELS.GET_PENDING_REQUEST, (_, stepId: string) => {
    return agentService.getPendingRequest(stepId);
  });

  ipcMain.handle(
    AGENT_CHANNELS.GET_MESSAGES_WITH_RAW_DATA,
    async (_, taskId: string, stepId: string) => {
      return await agentService.getMessagesWithRawData(taskId, stepId);
    },
  );

  ipcMain.handle(
    AGENT_CHANNELS.COMPACT_RAW_MESSAGES,
    async (_, taskId: string) => {
      dbg.ipc('agent:compactRawMessages %s', taskId);
      await agentService.compactRawMessages(taskId);
      dbg.ipc('agent:compactRawMessages completed for %s', taskId);
    },
  );

  ipcMain.handle(
    AGENT_CHANNELS.REPROCESS_NORMALIZATION,
    async (_, taskId: string) => {
      dbg.ipc('agent:reprocessNormalization %s', taskId);
      await agentService.reprocessNormalization(taskId);
      dbg.ipc('agent:reprocessNormalization completed for %s', taskId);
    },
  );

  // Settings
  ipcMain.handle(
    'settings:get',
    <K extends keyof AppSettings>(_: unknown, key: K) =>
      SettingsRepository.get(key),
  );
  ipcMain.handle(
    'settings:set',
    <K extends keyof AppSettings>(_: unknown, key: K, value: AppSettings[K]) =>
      SettingsRepository.set(key, value),
  );

  // Shell
  ipcMain.handle('shell:getAvailableEditors', async () => {
    const results = await Promise.all(
      PRESET_EDITORS.map(async (editor) => ({
        id: editor.id,
        available: await isEditorAvailable(editor),
      })),
    );
    return results;
  });

  ipcMain.handle('shell:openInEditor', async (_, dirPath: string) => {
    if (!(await pathExists(dirPath))) {
      throw new Error(
        `Path does not exist: ${dirPath}. The worktree may have been deleted.`,
      );
    }
    const setting = await SettingsRepository.get('editor');
    openInEditor(dirPath, setting);
  });

  // Dialog: open application (macOS)
  ipcMain.handle('dialog:openApplication', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(window!, {
      properties: ['openFile'],
      filters: [{ name: 'Applications', extensions: ['app'] }],
      defaultPath: '/Applications',
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const appPath = result.filePaths[0];
    const appName = path.basename(appPath, '.app');
    return { path: appPath, name: appName };
  });

  // Usage
  ipcMain.handle('agent:usage:getAll', (_, providers: string[]) => {
    if (process.env.JC_DISABLE_USAGE_TRACKING) return {};
    return agentUsageService.getUsage(providers as UsageProviderType[]);
  });

  // Backend models
  ipcMain.handle('agent:getBackendModels', (_, backend: string) =>
    backendModelsService.getBackendModels(backend as AgentBackendType),
  );

  // Debug
  ipcMain.handle('debug:getTableNames', () => DebugRepository.getTableNames());
  ipcMain.handle('debug:getDatabaseSize', () =>
    DebugRepository.getDatabaseSize(),
  );
  ipcMain.handle('debug:countOldCompletedTasks', () =>
    DebugRepository.countOldCompletedTasks(),
  );
  ipcMain.handle('debug:deleteOldCompletedTasks', () =>
    DebugRepository.deleteOldCompletedTasks(),
  );
  ipcMain.handle(
    'debug:queryTable',
    (
      _,
      params: {
        table: string;
        search?: string;
        limit: number;
        offset: number;
      },
    ) => DebugRepository.queryTable(params),
  );

  // Project Commands
  ipcMain.handle('project:commands:findByProjectId', (_, projectId: string) =>
    ProjectCommandRepository.findByProjectId(projectId),
  );
  ipcMain.handle('project:commands:create', (_, data: NewProjectCommand) =>
    ProjectCommandRepository.create(data),
  );
  ipcMain.handle(
    'project:commands:update',
    (_, { id, data }: { id: string; data: UpdateProjectCommand }) =>
      ProjectCommandRepository.update(id, data),
  );
  ipcMain.handle('project:commands:delete', (_, id: string) =>
    ProjectCommandRepository.delete(id),
  );

  // Run Commands
  ipcMain.handle(
    'project:commands:run:startCommand',
    (
      _,
      params: {
        taskId: string;
        projectId: string;
        workingDir: string;
        runCommandId: string;
      },
    ) => runCommandService.startCommand(params),
  );
  ipcMain.handle(
    'project:commands:run:stopCommand',
    (_, params: { taskId: string; runCommandId: string }) =>
      runCommandService.stopCommand(params),
  );
  ipcMain.handle('project:commands:run:getStatus', (_, taskId: string) =>
    runCommandService.getRunStatus(taskId),
  );
  ipcMain.handle('project:commands:run:getTaskIdsWithRunningCommands', () =>
    runCommandService.getTaskIdsWithRunningCommands(),
  );
  ipcMain.handle(
    'project:commands:run:killPortsForCommand',
    (_, { projectId, commandId }: { projectId: string; commandId: string }) =>
      runCommandService.killPortsForCommand(projectId, commandId),
  );
  ipcMain.handle(
    'project:commands:run:getPackageScripts',
    (_, projectPath: string) =>
      runCommandService.getPackageScripts(projectPath),
  );

  const previousRunCommandStatuses = new Map<string, Map<string, string>>();

  // Subscribe to run command status changes and forward to renderer
  runCommandService.onStatusChange((taskId, status) => {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('project:commands:run:statusChange', taskId, status);
    });

    const previousByCommand =
      previousRunCommandStatuses.get(taskId) ?? new Map<string, string>();
    const nextByCommand = new Map<string, string>();

    for (const commandStatus of status.commands) {
      nextByCommand.set(commandStatus.id, commandStatus.status);

      const previousStatus = previousByCommand.get(commandStatus.id);
      const hasExited =
        previousStatus === 'running' &&
        (commandStatus.status === 'stopped' ||
          commandStatus.status === 'errored');

      if (!hasExited) {
        continue;
      }

      const isAnyWindowFocused = BrowserWindow.getAllWindows().some((win) =>
        win.isFocused(),
      );
      if (isAnyWindowFocused) {
        continue;
      }

      void TaskRepository.findById(taskId).then((task) => {
        const mainWindow = BrowserWindow.getAllWindows()[0] ?? null;
        notificationService.notify({
          id: `${taskId}:run-command:${commandStatus.id}`,
          title:
            commandStatus.status === 'stopped'
              ? 'Run Command Finished'
              : 'Run Command Failed',
          body: `Task "${task?.name || 'Unknown'}": ${commandStatus.command}`,
          onClick: () => {
            mainWindow?.focus();
          },
        });
      });
    }

    if (nextByCommand.size === 0) {
      previousRunCommandStatuses.delete(taskId);
    } else {
      previousRunCommandStatuses.set(taskId, nextByCommand);
    }
  });

  runCommandService.onLog((taskId, runCommandId, stream, line) => {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send(
        'project:commands:run:log',
        taskId,
        runCommandId,
        stream,
        line,
      );
    });
  });

  // Global Prompt
  ipcMain.handle('globalPrompt:respond', (_, response: GlobalPromptResponse) =>
    handlePromptResponse(response),
  );

  // Task Summaries
  ipcMain.handle('tasks:summary:get', async (_, taskId: string) => {
    dbg.ipc('tasks:summary:get %s', taskId);
    return TaskSummaryRepository.findByTaskId(taskId);
  });

  ipcMain.handle('tasks:summary:generate', async (_, taskId: string) => {
    dbg.ipc('tasks:summary:generate %s', taskId);

    // Get the task to access worktree info
    const task = await TaskRepository.findById(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    if (!task.worktreePath || !task.startCommitHash) {
      throw new Error(`Task ${taskId} does not have a worktree`);
    }

    // Get current commit hash in worktree
    const currentCommitHash = await getCurrentCommitHash(task.worktreePath);

    // Check if we already have a summary for this commit
    const existingSummary = await TaskSummaryRepository.findByTaskAndCommit(
      taskId,
      currentCommitHash,
    );
    if (existingSummary) {
      dbg.ipc('Found existing summary for commit %s', currentCommitHash);
      return existingSummary;
    }

    // Get the worktree diff (file list and status)
    const diff = await getWorktreeDiff(
      task.worktreePath,
      task.startCommitHash,
      task.sourceBranch,
    );
    dbg.ipc('Got diff with %d files', diff.files.length);

    // Get the unified diff content for AI analysis
    const unifiedDiff = await getWorktreeUnifiedDiff(
      task.worktreePath,
      task.startCommitHash,
      task.sourceBranch,
    );
    dbg.ipc('Got unified diff, length: %d', unifiedDiff.length);

    // Build file list with diff content for the summary generator
    const filesWithDiff = diff.files.map((f) => ({
      path: f.path,
      status: f.status,
      // Extract the relevant portion of the unified diff for this file
      // The unified diff format starts file sections with "diff --git a/path b/path"
      diff: extractFileDiff(unifiedDiff, f.path),
    }));

    // Generate the summary using Claude
    const generated = await generateSummary(filesWithDiff, task.prompt);
    dbg.ipc(
      'Generated summary with %d annotations',
      generated.annotations.length,
    );

    // Store and return the summary
    const summary = await TaskSummaryRepository.create({
      taskId,
      commitHash: currentCommitHash,
      summary: generated.summary,
      annotations: generated.annotations,
    });

    dbg.ipc('Created new summary for task %s', taskId);
    return summary;
  });

  // MCP Templates
  ipcMain.handle('mcpTemplates:findAll', () => McpTemplateRepository.findAll());
  ipcMain.handle('mcpTemplates:findById', (_, id: string) =>
    McpTemplateRepository.findById(id),
  );
  ipcMain.handle('mcpTemplates:create', (_, data: NewMcpServerTemplate) =>
    McpTemplateRepository.create(data),
  );
  ipcMain.handle(
    'mcpTemplates:update',
    (_, id: string, data: UpdateMcpServerTemplate) =>
      McpTemplateRepository.update(id, data),
  );
  ipcMain.handle('mcpTemplates:delete', (_, id: string) =>
    McpTemplateRepository.delete(id),
  );
  ipcMain.handle('mcpTemplates:getPresets', () => MCP_PRESETS);
  ipcMain.handle('mcpTemplates:getEnabledForProject', (_, projectId: string) =>
    getEnabledTemplatesForProject(projectId),
  );

  // Project MCP Overrides
  ipcMain.handle(
    'projectMcpOverrides:findByProjectId',
    (_, projectId: string) => {
      dbg.ipc('projectMcpOverrides:findByProjectId %s', projectId);
      return ProjectMcpOverrideRepository.findByProjectId(projectId);
    },
  );
  ipcMain.handle(
    'projectMcpOverrides:upsert',
    async (_, data: NewProjectMcpOverride) => {
      dbg.ipc('projectMcpOverrides:upsert %o', data);
      const result = await ProjectMcpOverrideRepository.upsert(data);
      dbg.ipc('projectMcpOverrides:upsert result %o', result);
      return result;
    },
  );
  ipcMain.handle(
    'projectMcpOverrides:delete',
    async (_, projectId: string, mcpTemplateId: string) => {
      dbg.ipc(
        'projectMcpOverrides:delete projectId=%s, mcpTemplateId=%s',
        projectId,
        mcpTemplateId,
      );
      await ProjectMcpOverrideRepository.delete(projectId, mcpTemplateId);
      dbg.ipc('projectMcpOverrides:delete completed');
    },
  );

  // Unified MCP servers
  ipcMain.handle(
    'unifiedMcp:getServers',
    async (_, projectId: string, projectPath: string) => {
      dbg.ipc(
        'unifiedMcp:getServers projectId=%s, projectPath=%s',
        projectId,
        projectPath,
      );
      const result = await getUnifiedMcpServers(projectId, projectPath);
      dbg.ipc('unifiedMcp:getServers result count=%d', result.length);
      return result;
    },
  );

  ipcMain.handle(
    'unifiedMcp:activate',
    async (_, projectPath: string, name: string, command: string) => {
      dbg.ipc('unifiedMcp:activate path=%s, name=%s', projectPath, name);
      await activateMcpServer(projectPath, name, command);
      dbg.ipc('unifiedMcp:activate completed');
    },
  );

  ipcMain.handle(
    'unifiedMcp:deactivate',
    async (_, projectPath: string, name: string) => {
      dbg.ipc('unifiedMcp:deactivate path=%s, name=%s', projectPath, name);
      await deactivateMcpServer(projectPath, name);
      dbg.ipc('unifiedMcp:deactivate completed');
    },
  );

  ipcMain.handle(
    'unifiedMcp:substituteVariables',
    async (
      _,
      commandTemplate: string,
      userVariables: Record<string, string>,
      context: {
        projectPath: string;
        projectName: string;
        branchName: string;
        mainRepoPath: string;
      },
    ) => {
      dbg.ipc('unifiedMcp:substituteVariables template=%s', commandTemplate);
      return substituteVariables(commandTemplate, userVariables, context);
    },
  );

  // Claude Projects Cleanup
  ipcMain.handle('claudeProjects:findNonExistent', async () => {
    dbg.ipc('claudeProjects:findNonExistent');
    const claudeJsonPath = path.join(os.homedir(), '.claude.json');
    const claudeProjectsDir = path.join(os.homedir(), '.claude', 'projects');

    const nonExistentProjects: Array<{
      path: string;
      folderName: string;
      source: 'json' | 'folder' | 'both';
    }> = [];

    // Track which paths we've seen
    const pathsFromJson = new Set<string>();
    const pathsFromFolders = new Set<string>();

    // 1. Read ~/.claude.json
    let claudeJsonContent = '';
    try {
      claudeJsonContent = await fs.readFile(claudeJsonPath, 'utf-8');
      const claudeJson = JSON.parse(claudeJsonContent) as {
        projects?: Record<string, unknown>;
      };

      if (claudeJson.projects) {
        for (const projectPath of Object.keys(claudeJson.projects)) {
          const exists = await pathExists(projectPath);
          if (!exists) {
            pathsFromJson.add(projectPath);
          }
        }
      }
    } catch (error) {
      dbg.ipc('Error reading ~/.claude.json: %O', error);
      // File doesn't exist or can't be parsed - that's ok
    }

    // 2. Read ~/.claude/projects/ folders
    try {
      const folders = await fs.readdir(claudeProjectsDir);
      for (const folderName of folders) {
        // Decode folder name back to path
        // Folder names are like: -Users-plin--idling
        // Which decodes to: /Users/plin/.idling
        const decodedPath = folderName
          .replace(/^-/, '/') // Leading - becomes /
          .replace(/--/g, '/.') // -- becomes /.
          .replace(/-/g, '/'); // Single - becomes /

        const exists = await pathExists(decodedPath);
        if (!exists) {
          pathsFromFolders.add(decodedPath);
        }
      }
    } catch (error) {
      dbg.ipc('Error reading ~/.claude/projects/: %O', error);
      // Directory doesn't exist - that's ok
    }

    // 3. Combine results
    const allPaths = new Set([...pathsFromJson, ...pathsFromFolders]);
    for (const projectPath of allPaths) {
      const inJson = pathsFromJson.has(projectPath);
      const inFolder = pathsFromFolders.has(projectPath);
      const source = inJson && inFolder ? 'both' : inJson ? 'json' : 'folder';

      // Encode path to folder name for deletion
      const folderName = projectPath
        .replace(/^\//g, '-') // Leading / becomes -
        .replace(/\/\./g, '--') // /. becomes --
        .replace(/\//g, '-'); // / becomes -

      nonExistentProjects.push({ path: projectPath, folderName, source });
    }

    // Sort by path for consistent display
    nonExistentProjects.sort((a, b) => a.path.localeCompare(b.path));

    // Compute content hash for safety check
    const contentHash = crypto
      .createHash('md5')
      .update(claudeJsonContent)
      .digest('hex');

    dbg.ipc(
      'claudeProjects:findNonExistent found %d projects',
      nonExistentProjects.length,
    );
    return { projects: nonExistentProjects, contentHash };
  });

  ipcMain.handle(
    'claudeProjects:cleanup',
    async (
      _,
      params: {
        paths: string[];
        contentHash: string;
      },
    ) => {
      dbg.ipc('claudeProjects:cleanup paths=%o', params.paths);
      const claudeJsonPath = path.join(os.homedir(), '.claude.json');
      const claudeProjectsDir = path.join(os.homedir(), '.claude', 'projects');

      let removedCount = 0;

      // 1. Re-read and verify ~/.claude.json hasn't changed
      let claudeJsonContent = '';
      let claudeJson: { projects?: Record<string, unknown> } = {};
      try {
        claudeJsonContent = await fs.readFile(claudeJsonPath, 'utf-8');
        const currentHash = crypto
          .createHash('md5')
          .update(claudeJsonContent)
          .digest('hex');

        if (currentHash !== params.contentHash) {
          return {
            success: false,
            removedCount: 0,
            error:
              'The claude.json file was modified since scanning. Please scan again.',
          };
        }

        claudeJson = JSON.parse(claudeJsonContent);
      } catch (error) {
        dbg.ipc('Error reading ~/.claude.json: %O', error);
        // If file doesn't exist, we can still clean up folders
      }

      // 2. Remove from ~/.claude.json
      if (claudeJson.projects) {
        for (const projectPath of params.paths) {
          if (projectPath in claudeJson.projects) {
            delete claudeJson.projects[projectPath];
            removedCount++;
          }
        }

        // Write back
        try {
          await fs.writeFile(
            claudeJsonPath,
            JSON.stringify(claudeJson, null, 2),
            'utf-8',
          );
        } catch (error) {
          dbg.ipc('Error writing ~/.claude.json: %O', error);
          return {
            success: false,
            removedCount,
            error: 'Failed to write claude.json',
          };
        }
      }

      // 3. Remove folders from ~/.claude/projects/
      for (const projectPath of params.paths) {
        const folderName = projectPath
          .replace(/^\//g, '-')
          .replace(/\/\./g, '--')
          .replace(/\//g, '-');

        const folderPath = path.join(claudeProjectsDir, folderName);
        try {
          await fs.rm(folderPath, { recursive: true, force: true });
          dbg.ipc('Removed folder: %s', folderPath);
        } catch (error) {
          dbg.ipc('Error removing folder %s: %O', folderPath, error);
          // Continue with other folders
        }
      }

      dbg.ipc('claudeProjects:cleanup removed %d projects', removedCount);
      return { success: true, removedCount };
    },
  );

  // Completion
  ipcMain.handle(
    'completion:complete',
    (
      _,
      params: {
        prompt: string;
        suffix?: string;
        projectId?: string;
        contextBeforePrompt?: string;
      },
    ) => {
      dbg.ipc('completion:complete (prompt length: %d)', params.prompt.length);
      return completeText(params);
    },
  );
  // Validates the current completion settings by making a real FIM request.
  // Called after saving settings to verify the API key and model work.
  // Returns { success, error? } with user-friendly messages for common HTTP errors (401, 403, 429).
  ipcMain.handle('completion:test', async () => {
    dbg.ipc('completion:test');
    const result = await testCompletion();
    dbg.ipc('completion:test result: %o', result);
    return result;
  });
  ipcMain.handle(
    'completion:saveSettings',
    async (
      _,
      params: {
        enabled: boolean;
        apiKey: string;
        model: string;
        serverUrl: string;
      },
    ) => {
      dbg.ipc(
        'completion:saveSettings enabled=%s model=%s serverUrl=%s hasNewApiKey=%s',
        params.enabled,
        params.model,
        params.serverUrl || '(default)',
        !!params.apiKey,
      );

      let encryptedApiKey: string;
      if (params.apiKey) {
        // New key provided — encrypt it
        const { encryptionService } =
          await import('../services/encryption-service');
        encryptedApiKey = encryptionService.encrypt(params.apiKey);
      } else {
        // No new key — preserve existing
        const existing = await SettingsRepository.get('completion');
        encryptedApiKey = existing.apiKey;
      }

      await SettingsRepository.set('completion', {
        enabled: params.enabled,
        apiKey: encryptedApiKey,
        model: params.model,
        serverUrl: params.serverUrl,
      });

      // Invalidate cached SDK client so next request uses new settings
      resetCompletionClient();
    },
  );
  ipcMain.handle(
    'completion:generateContext',
    async (_, params: { projectId: string }) => {
      dbg.ipc('completion:generateContext projectId=%s', params.projectId);
      const { generateCompletionContext } =
        await import('../services/completion-context-generation-service');
      return generateCompletionContext(params);
    },
  );

  ipcMain.handle('completion:getDailyUsage', async () => {
    if (process.env.JC_DISABLE_USAGE_TRACKING) {
      return {
        promptTokens: 0,
        completionTokens: 0,
        requests: 0,
        costUsd: 0,
        inputCostUsd: 0,
        outputCostUsd: 0,
      };
    }
    dbg.ipc('completion:getDailyUsage');
    return getCompletionDailyUsage();
  });

  // Project Todos
  ipcMain.handle('project-todos:list', (_, projectId: string) =>
    ProjectTodoRepository.findByProjectId(projectId),
  );

  ipcMain.handle('project-todos:count', (_, projectId: string) =>
    ProjectTodoRepository.countByProjectId(projectId),
  );

  ipcMain.handle(
    'project-todos:create',
    (_, data: { projectId: string; content: string }) => {
      dbg.ipc('project-todos:create %o', data);
      return ProjectTodoRepository.create(data);
    },
  );

  ipcMain.handle(
    'project-todos:update',
    (_, id: string, data: { content: string }) => {
      dbg.ipc('project-todos:update %s %o', id, data);
      return ProjectTodoRepository.update(id, data);
    },
  );

  ipcMain.handle('project-todos:delete', (_, id: string) => {
    dbg.ipc('project-todos:delete %s', id);
    return ProjectTodoRepository.delete(id);
  });

  ipcMain.handle(
    'project-todos:reorder',
    (_, projectId: string, orderedIds: string[]) => {
      dbg.ipc('project-todos:reorder %s %o', projectId, orderedIds);
      return ProjectTodoRepository.reorder(projectId, orderedIds);
    },
  );

  // Skill Management

  // Step-aware skill resolution: look up backend + project path from task/step
  ipcMain.handle(
    'skills:getForStep',
    async (_, params: { taskId: string; stepId?: string }) => {
      dbg.ipc('skills:getForStep %o', params);

      const { taskId, stepId } = params;

      const task = await TaskRepository.findById(taskId);
      if (!task) return [];

      const project = await ProjectRepository.findById(task.projectId);

      // Resolve backend from step, falling back to project default, then 'claude-code'.
      // Only trust step backend when the step belongs to this task.
      let stepBackend: AgentBackendType | undefined;
      if (stepId) {
        const step = await TaskStepRepository.findById(stepId);
        if (step?.taskId === taskId && step.agentBackend) {
          stepBackend = step.agentBackend;
        }
      }

      const backendType: AgentBackendType =
        stepBackend ??
        (project?.defaultAgentBackend as AgentBackendType | null) ??
        'claude-code';

      // Resolve project path (prefer worktree path, fall back to project path)
      const projectPath = task.worktreePath ?? project?.path;

      const allSkills = await getAllManagedSkills({ backendType, projectPath });
      return allSkills
        .filter((s) => s.enabledBackends[backendType] === true)
        .map(({ name, description, source, pluginName, skillPath }) => ({
          name,
          description,
          source,
          pluginName,
          skillPath,
        }));
    },
  );

  ipcMain.handle(
    'skills:getAll',
    async (_, backendType: AgentBackendType, projectPath?: string) => {
      dbg.ipc('skills:getAll backend=%s project=%s', backendType, projectPath);
      return getAllManagedSkills({ backendType, projectPath });
    },
  );

  ipcMain.handle('skills:getAllUnified', async (_, projectPath?: string) => {
    dbg.ipc('skills:getAllUnified project=%s', projectPath);
    return getAllManagedSkillsUnified({ projectPath });
  });

  ipcMain.handle('skills:getContent', async (_, skillPath: string) => {
    dbg.ipc('skills:getContent path=%s', skillPath);
    return getSkillContent({ skillPath });
  });

  ipcMain.handle(
    'skills:create',
    async (
      _,
      params: {
        enabledBackends: AgentBackendType[];
        scope: 'user' | 'project';
        projectPath?: string;
        name: string;
        description: string;
        content: string;
      },
    ) => {
      dbg.ipc('skills:create name=%s scope=%s', params.name, params.scope);
      return createSkill(params);
    },
  );

  ipcMain.handle(
    'skills:update',
    async (
      _,
      params: {
        skillPath: string;
        backendType: AgentBackendType;
        name?: string;
        description?: string;
        content?: string;
      },
    ) => {
      dbg.ipc(
        'skills:update path=%s backend=%s',
        params.skillPath,
        params.backendType,
      );
      return updateSkill(params);
    },
  );

  ipcMain.handle(
    'skills:delete',
    async (_, skillPath: string, backendType: AgentBackendType) => {
      dbg.ipc('skills:delete path=%s backend=%s', skillPath, backendType);
      return deleteSkill({ skillPath, backendType });
    },
  );

  ipcMain.handle(
    'skills:disable',
    async (_, skillPath: string, backendType: AgentBackendType) => {
      dbg.ipc('skills:disable path=%s backend=%s', skillPath, backendType);
      return disableSkill({ skillPath, backendType });
    },
  );

  ipcMain.handle(
    'skills:enable',
    async (_, skillPath: string, backendType: AgentBackendType) => {
      dbg.ipc('skills:enable path=%s backend=%s', skillPath, backendType);
      return enableSkill({ skillPath, backendType });
    },
  );

  ipcMain.handle('skills:migrationPreview', async () => {
    dbg.ipc('skills:migrationPreview');
    return previewLegacySkillMigration();
  });

  ipcMain.handle(
    'skills:migrationExecute',
    async (_, params: { itemIds: string[] }) => {
      dbg.ipc('skills:migrationExecute count=%d', params.itemIds.length);
      return executeLegacySkillMigration({ itemIds: params.itemIds });
    },
  );

  // --- Skills registry (skills.sh) ---

  ipcMain.handle('skills:registrySearch', async (_, query: string) => {
    dbg.ipc('skills:registrySearch query=%s', query);
    return searchRegistry({ query });
  });

  ipcMain.handle(
    'skills:registryFetchContent',
    async (_, source: string, skillId: string) => {
      dbg.ipc(
        'skills:registryFetchContent source=%s skillId=%s',
        source,
        skillId,
      );
      return fetchRegistrySkillContent({ source, skillId });
    },
  );

  ipcMain.handle(
    'skills:registryInstall',
    async (
      _,
      params: {
        source: string;
        skillId: string;
        enabledBackends: AgentBackendType[];
      },
    ) => {
      dbg.ipc(
        'skills:registryInstall source=%s skill=%s',
        params.source,
        params.skillId,
      );
      return installFromRegistry(params);
    },
  );

  ipcMain.handle(
    'skills:createWithAgent',
    async (
      _event,
      data: {
        prompt: string;
        enabledBackends: AgentBackendType[];
        mode: 'create' | 'improve';
        sourceSkillPath?: string;
        interactionMode?: InteractionMode | null;
        modelPreference?: string | null;
        agentBackend?: AgentBackendType | null;
      },
    ) => {
      // Runtime validation
      if (!data.prompt || typeof data.prompt !== 'string') {
        throw new Error('prompt is required');
      }
      assertValidSkillCreationInput(data);

      // Validate sourceSkillPath is under a known skill directory (symlink-safe)
      if (data.mode === 'improve' && data.sourceSkillPath) {
        await assertValidSourceSkillPath(data.sourceSkillPath);
      }

      const systemProject = await getOrCreateSystemProject();

      // Generate a task name
      const taskName = await generateTaskName(data.prompt);

      // Create task in system project
      const task = await TaskRepository.create({
        projectId: systemProject.id,
        type: 'skill-creation',
        name: taskName,
        prompt: data.prompt,
        updatedAt: new Date().toISOString(),
      });

      let workspacePath: string | undefined;

      try {
        // Create workspace
        workspacePath = await getSkillWorkspacePath(task.id);

        // For improve mode, copy existing skill into workspace
        if (data.mode === 'improve' && data.sourceSkillPath) {
          await fs.cp(data.sourceSkillPath, workspacePath, { recursive: true });
        }

        // Build the agent prompt
        const agentPrompt = buildSkillCreationPrompt({
          userPrompt: data.prompt,
          mode: data.mode,
          workspacePath,
        });

        // Create step with skill-creation meta
        const meta: SkillCreationStepMeta = {
          mode: data.mode,
          workspacePath,
          sourceSkillPath: data.sourceSkillPath,
          enabledBackends: data.enabledBackends,
        };

        const step = await StepService.create({
          taskId: task.id,
          name: 'Step 1',
          type: 'skill-creation',
          promptTemplate: agentPrompt,
          interactionMode: data.interactionMode ?? 'plan',
          modelPreference: data.modelPreference ?? null,
          agentBackend: data.agentBackend ?? 'claude-code',
          meta,
        });

        // Auto-start
        agentService.start(step.id).catch((err) => {
          dbg.ipc(
            'Error auto-starting skill creation agent for step %s: %O',
            step.id,
            err,
          );
        });

        return task;
      } catch (err) {
        // Clean up on partial failure
        if (workspacePath) {
          await cleanupSkillWorkspace(workspacePath).catch(() => {});
        }
        await TaskRepository.delete(task.id).catch(() => {});
        throw err;
      }
    },
  );

  ipcMain.handle(
    'skills:publishFromWorkspace',
    async (
      _event,
      data: {
        stepId: string;
        workspacePath: string;
        enabledBackends: AgentBackendType[];
        mode: 'create' | 'improve';
        sourceSkillPath?: string;
      },
    ) => {
      // Runtime validation
      if (!data.stepId || typeof data.stepId !== 'string') {
        throw new Error('stepId is required');
      }
      if (!data.workspacePath || typeof data.workspacePath !== 'string') {
        throw new Error('workspacePath is required');
      }
      assertValidSkillCreationInput(data);

      // Validate workspace path is under the expected directory (symlink-safe)
      await assertValidWorkspacePath(data.workspacePath);

      // Validate sourceSkillPath is under a known skill directory (symlink-safe)
      if (data.mode === 'improve' && data.sourceSkillPath) {
        await assertValidSourceSkillPath(data.sourceSkillPath);
      }

      // Verify step ownership: step must exist, be a skill-creation step,
      // and its stored workspacePath must match the provided one
      const step = await TaskStepRepository.findById(data.stepId);
      if (!step || step.type !== 'skill-creation') {
        throw new Error('Invalid stepId: must reference a skill-creation step');
      }
      if (!isSkillCreationStepMeta(step.meta)) {
        throw new Error(
          'Invalid step: missing or malformed skill-creation metadata',
        );
      }
      if (step.meta.workspacePath !== data.workspacePath) {
        throw new Error('workspacePath does not match the step metadata');
      }

      // Idempotency: if already published, return early
      if (step.meta.published) {
        dbg.ipc('Step %s already published, skipping', data.stepId);
        return [];
      }

      const entries = await fs.readdir(data.workspacePath, {
        withFileTypes: true,
      });

      // Collect skill directories: only subdirectories containing a SKILL.md
      const skillPaths: string[] = [];

      // Check if SKILL.md exists directly in workspace (improve mode)
      const hasDirectSkillMd = entries.some(
        (e) => e.name === 'SKILL.md' && !e.isDirectory(),
      );
      if (hasDirectSkillMd) {
        skillPaths.push(data.workspacePath);
      }

      // Check subdirectories for SKILL.md (in parallel)
      const subDirChecks = entries
        .filter(
          (entry) =>
            entry.isDirectory() &&
            !entry.name.startsWith('.') &&
            entry.name !== 'node_modules',
        )
        .map(async (entry) => {
          const subDir = path.join(data.workspacePath, entry.name);
          const hasSkillMd = await fs
            .access(path.join(subDir, 'SKILL.md'))
            .then(() => true)
            .catch(() => false);
          return hasSkillMd ? subDir : null;
        });
      const subDirResults = await Promise.all(subDirChecks);
      for (const subDir of subDirResults) {
        if (subDir) skillPaths.push(subDir);
      }

      if (skillPaths.length === 0) {
        throw new Error(
          'No skill found in workspace. The agent may not have created a SKILL.md file.',
        );
      }

      const results = [];

      try {
        for (const skillDir of skillPaths) {
          const content = await getSkillContent({ skillPath: skillDir });

          if (data.mode === 'improve' && data.sourceSkillPath) {
            // Update existing skill in-place (use first enabled backend for context)
            const updated = await updateSkill({
              skillPath: data.sourceSkillPath,
              backendType: data.enabledBackends[0],
              name: content.name,
              description: content.description,
              content: content.content,
            });
            results.push(updated);
          } else {
            // Create new skill
            const created = await createSkill({
              enabledBackends: data.enabledBackends,
              scope: 'user',
              name: content.name,
              description: content.description,
              content: content.content,
            });
            results.push(created);
          }
        }

        // Mark step as published and completed
        await TaskStepRepository.update(data.stepId, {
          status: 'completed',
          meta: {
            ...step.meta,
            published: true,
          },
        });

        // Mark the task as completed
        await TaskRepository.update(step.taskId, {
          status: 'completed',
          updatedAt: new Date().toISOString(),
        });
        // Cleanup workspace after successful publish
        await cleanupSkillWorkspace(data.workspacePath).catch((err) => {
          dbg.ipc(
            'Failed to cleanup skill workspace %s after publish: %O',
            data.workspacePath,
            err,
          );
        });
      } catch (err) {
        // On failure, preserve the workspace so the user can retry or recover
        dbg.ipc(
          'Publish failed for workspace %s, preserving for recovery: %O',
          data.workspacePath,
          err,
        );
        throw err;
      }

      return results;
    },
  );

  // Feed
  ipcMain.handle('feed:getItems', async () => {
    return getFeedItems();
  });

  ipcMain.handle(
    'feed:createNote',
    async (_event, params: { content: string }) => {
      const content = validateFeedNoteContent(params.content);
      return createFeedNote({ content });
    },
  );

  ipcMain.handle(
    'feed:updateNote',
    async (
      _event,
      params: { id: string; content?: string; completedAt?: string | null },
    ) => {
      const id = validateFeedNoteId(params.id);
      const content =
        params.content === undefined
          ? undefined
          : validateFeedNoteContent(params.content);
      const completedAt = validateFeedNoteCompletedAt(params.completedAt);
      return updateFeedNote({ id, content, completedAt });
    },
  );

  ipcMain.handle('feed:deleteNote', async (_event, params: { id: string }) => {
    const id = validateFeedNoteId(params.id);
    return deleteFeedNote({ id });
  });

  ipcMain.handle(
    'pr-snapshots:record',
    async (
      _event,
      params: {
        projectId: string;
        pullRequestId: number;
        providerId: string;
        repoProjectId: string;
        repoId: string;
      },
    ) => {
      const { getPullRequestActivityMetadata } =
        await import('../services/azure-devops-service');
      const { PrViewSnapshotRepository } =
        await import('../database/repositories/pr-view-snapshots');

      const metadata = await getPullRequestActivityMetadata({
        providerId: params.providerId,
        projectId: params.repoProjectId,
        repoId: params.repoId,
        pullRequestId: params.pullRequestId,
      });

      await PrViewSnapshotRepository.upsert({
        projectId: params.projectId,
        pullRequestId: String(params.pullRequestId),
        lastCommitDate: metadata.lastCommitDate,
        lastThreadActivityDate: metadata.lastThreadActivityDate,
        activeThreadCount: metadata.activeThreadCount,
      });
    },
  );

  // ─── Notifications ────────────────────────────────────────────────

  ipcMain.handle('notifications:list', async () => {
    const rows = await NotificationRepository.findAll();
    return rows.map((row) => ({
      ...row,
      read: row.read === 1,
      meta: safeJsonParse(row.meta),
    }));
  });

  ipcMain.handle('notifications:markRead', async (_, id: string | 'all') => {
    if (id === 'all') {
      await NotificationRepository.markAllAsRead();
    } else {
      await NotificationRepository.markAsRead(id);
    }
  });

  ipcMain.handle('notifications:delete', async (_, id: string) => {
    await NotificationRepository.deleteById(id);
  });

  // ─── Tracked Pipelines ────────────────────────────────────────────

  ipcMain.handle('tracked-pipelines:list', async (_, projectId: string) => {
    const rows = await TrackedPipelineRepository.findByProject(projectId);
    return rows.map((row) => ({
      ...row,
      enabled: row.enabled === 1,
      visible: row.visible === 1,
    }));
  });

  ipcMain.handle('tracked-pipelines:listAll', async () => {
    const rows = await TrackedPipelineRepository.findAll();
    return rows.map((row) => ({
      ...row,
      enabled: row.enabled === 1,
      visible: row.visible === 1,
    }));
  });

  ipcMain.handle(
    'tracked-pipelines:toggle',
    async (_, id: string, enabled: boolean) => {
      await TrackedPipelineRepository.toggleEnabled(id, enabled);
    },
  );

  ipcMain.handle(
    'tracked-pipelines:toggleVisible',
    async (_, id: string, visible: boolean) => {
      await TrackedPipelineRepository.toggleVisible(id, visible);
    },
  );

  ipcMain.handle('tracked-pipelines:discover', async (_, projectId: string) => {
    const rows = await pipelineTrackingService.discoverPipelines(projectId);
    return rows.map((row) => ({
      ...row,
      enabled: row.enabled === 1,
      visible: row.visible === 1,
    }));
  });

  // ─── System ───────────────────────────────────────────────────────

  ipcMain.handle('system:getMemoryUsage', async (event) => {
    const mainMem = process.memoryUsage();
    const rendererPid = event.sender.getOSProcessId();
    const rendererMetric = app
      .getAppMetrics()
      .find((metric) => metric.pid === rendererPid);
    const rendererRssBytes =
      (rendererMetric?.memory?.workingSetSize ?? 0) * 1024;
    const rendererPrivateBytes =
      (rendererMetric?.memory?.privateBytes ?? 0) * 1024;

    return {
      totalRssBytes: mainMem.rss + rendererRssBytes,
      mainProcess: {
        heapUsedBytes: mainMem.heapUsed,
        rssBytes: mainMem.rss,
      },
      rendererProcess: {
        rssBytes: rendererRssBytes,
        privateBytes: rendererPrivateBytes,
      },
    };
  });

  // --- Pipeline detail & trigger handlers ---

  /** Validate that a string param is a non-empty string safe for URL path interpolation. */
  function assertStringId(
    value: unknown,
    name: string,
  ): asserts value is string {
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`${name} must be a non-empty string`);
    }
    // Reject path traversal characters
    if (/[/\\]/.test(value)) {
      throw new Error(`${name} contains invalid characters`);
    }
  }

  /** Validate that a numeric param is a finite positive integer. */
  function assertPositiveInt(
    value: unknown,
    name: string,
  ): asserts value is number {
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < 0 ||
      !Number.isInteger(value)
    ) {
      throw new Error(`${name} must be a positive integer`);
    }
  }

  ipcMain.handle(
    'pipelines:listRuns',
    async (
      _,
      params: {
        providerId: string;
        azureProjectId: string;
        definitionId: number;
        kind: 'build' | 'release';
      },
    ) => {
      assertStringId(params.providerId, 'providerId');
      assertStringId(params.azureProjectId, 'azureProjectId');
      assertPositiveInt(params.definitionId, 'definitionId');
      if (params.kind === 'build') {
        return listBuilds({
          providerId: params.providerId,
          projectId: params.azureProjectId,
          definitionId: params.definitionId,
        });
      }
      return listReleases({
        providerId: params.providerId,
        projectId: params.azureProjectId,
        definitionId: params.definitionId,
      });
    },
  );

  ipcMain.handle(
    'pipelines:getBuild',
    async (
      _,
      params: {
        providerId: string;
        azureProjectId: string;
        buildId: number;
      },
    ) => {
      assertStringId(params.providerId, 'providerId');
      assertStringId(params.azureProjectId, 'azureProjectId');
      assertPositiveInt(params.buildId, 'buildId');
      return getBuild({
        providerId: params.providerId,
        projectId: params.azureProjectId,
        buildId: params.buildId,
      });
    },
  );

  ipcMain.handle(
    'pipelines:getBuildTimeline',
    async (
      _,
      params: {
        providerId: string;
        azureProjectId: string;
        buildId: number;
      },
    ) => {
      assertStringId(params.providerId, 'providerId');
      assertStringId(params.azureProjectId, 'azureProjectId');
      assertPositiveInt(params.buildId, 'buildId');
      return getBuildTimeline({
        providerId: params.providerId,
        projectId: params.azureProjectId,
        buildId: params.buildId,
      });
    },
  );

  ipcMain.handle(
    'pipelines:getBuildLog',
    async (
      _,
      params: {
        providerId: string;
        azureProjectId: string;
        buildId: number;
        logId: number;
      },
    ) => {
      assertStringId(params.providerId, 'providerId');
      assertStringId(params.azureProjectId, 'azureProjectId');
      assertPositiveInt(params.buildId, 'buildId');
      assertPositiveInt(params.logId, 'logId');
      return getBuildLog({
        providerId: params.providerId,
        projectId: params.azureProjectId,
        buildId: params.buildId,
        logId: params.logId,
      });
    },
  );

  ipcMain.handle(
    'pipelines:getRelease',
    async (
      _,
      params: {
        providerId: string;
        azureProjectId: string;
        releaseId: number;
      },
    ) => {
      assertStringId(params.providerId, 'providerId');
      assertStringId(params.azureProjectId, 'azureProjectId');
      assertPositiveInt(params.releaseId, 'releaseId');
      return getRelease({
        providerId: params.providerId,
        projectId: params.azureProjectId,
        releaseId: params.releaseId,
      });
    },
  );

  ipcMain.handle(
    'pipelines:listBranches',
    async (
      _,
      params: {
        providerId: string;
        azureProjectId: string;
        repoId: string;
      },
    ) => {
      assertStringId(params.providerId, 'providerId');
      assertStringId(params.azureProjectId, 'azureProjectId');
      assertStringId(params.repoId, 'repoId');
      return listBranches({
        providerId: params.providerId,
        projectId: params.azureProjectId,
        repoId: params.repoId,
      });
    },
  );

  ipcMain.handle(
    'pipelines:getDefinitionParams',
    async (
      _,
      params: {
        providerId: string;
        azureProjectId: string;
        definitionId: number;
      },
    ) => {
      assertStringId(params.providerId, 'providerId');
      assertStringId(params.azureProjectId, 'azureProjectId');
      assertPositiveInt(params.definitionId, 'definitionId');
      return getBuildDefinitionDetail({
        providerId: params.providerId,
        projectId: params.azureProjectId,
        definitionId: params.definitionId,
      });
    },
  );

  ipcMain.handle(
    'pipelines:getYamlParameters',
    async (_, params: GetYamlParametersIpcParams) => {
      const { providerId, azureProjectId, repoId, yamlFilename, branch } =
        params;
      for (const [key, val] of Object.entries({
        providerId,
        azureProjectId,
        repoId,
        yamlFilename,
        branch,
      })) {
        if (!val || typeof val !== 'string') {
          throw new Error(`pipelines:getYamlParameters: ${key} is required`);
        }
      }
      return getYamlPipelineParameters({
        providerId,
        projectId: azureProjectId,
        repoId,
        yamlFilename,
        branch,
      });
    },
  );

  ipcMain.handle(
    'pipelines:queueBuild',
    async (_, params: QueueBuildIpcParams) => {
      assertStringId(params.providerId, 'providerId');
      assertStringId(params.azureProjectId, 'azureProjectId');
      assertPositiveInt(params.definitionId, 'definitionId');
      if (
        typeof params.sourceBranch !== 'string' ||
        params.sourceBranch.length === 0
      ) {
        throw new Error('sourceBranch must be a non-empty string');
      }
      // Validate templateParameters keys/values to prevent injection
      if (params.templateParameters) {
        for (const [key, val] of Object.entries(params.templateParameters)) {
          if (typeof key !== 'string' || typeof val !== 'string') {
            throw new Error(
              'templateParameters must be Record<string, string>',
            );
          }
          if (!/^[\w\-.]+$/.test(key)) {
            throw new Error(
              `templateParameters key "${key}" contains invalid characters`,
            );
          }
        }
      }
      if (params.parameters) {
        for (const [key, val] of Object.entries(params.parameters)) {
          if (typeof key !== 'string' || typeof val !== 'string') {
            throw new Error('parameters must be Record<string, string>');
          }
        }
      }
      return queueBuild({
        providerId: params.providerId,
        projectId: params.azureProjectId,
        definitionId: params.definitionId,
        sourceBranch: params.sourceBranch,
        parameters: params.parameters,
        templateParameters: params.templateParameters,
      });
    },
  );

  ipcMain.handle(
    'pipelines:createRelease',
    async (
      _,
      params: {
        providerId: string;
        azureProjectId: string;
        definitionId: number;
        description?: string;
      },
    ) => {
      assertStringId(params.providerId, 'providerId');
      assertStringId(params.azureProjectId, 'azureProjectId');
      assertPositiveInt(params.definitionId, 'definitionId');
      return createAzureRelease({
        providerId: params.providerId,
        projectId: params.azureProjectId,
        definitionId: params.definitionId,
        description: params.description,
      });
    },
  );

  ipcMain.handle(
    'pipelines:cancelBuild',
    async (
      _,
      params: {
        providerId: string;
        azureProjectId: string;
        buildId: number;
      },
    ) => {
      assertStringId(params.providerId, 'providerId');
      assertStringId(params.azureProjectId, 'azureProjectId');
      assertPositiveInt(params.buildId, 'buildId');
      return cancelBuild({
        providerId: params.providerId,
        projectId: params.azureProjectId,
        buildId: params.buildId,
      });
    },
  );
}

function safeJsonParse(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function validateFeedNoteId(id: string): string {
  if (typeof id !== 'string') {
    throw new Error('Invalid note id');
  }

  const trimmed = id.trim();
  if (trimmed.length === 0 || trimmed.length > 128) {
    throw new Error('Invalid note id');
  }

  return trimmed;
}

function validateFeedNoteContent(content: string): string {
  if (typeof content !== 'string') {
    throw new Error('Invalid note content');
  }

  const trimmed = content.trim();
  if (trimmed.length === 0) {
    throw new Error('Note content cannot be empty');
  }

  if (trimmed.length > 4000) {
    throw new Error('Note content is too long');
  }

  return trimmed;
}

function validateFeedNoteCompletedAt(
  completedAt: string | null | undefined,
): string | null | undefined {
  if (completedAt === undefined || completedAt === null) {
    return completedAt;
  }

  if (typeof completedAt !== 'string') {
    throw new Error('Invalid completedAt value');
  }

  const parsed = Date.parse(completedAt);
  if (Number.isNaN(parsed)) {
    throw new Error('Invalid completedAt value');
  }

  return new Date(parsed).toISOString();
}

// Helper: check if an editor is available
async function isEditorAvailable(
  editor: (typeof PRESET_EDITORS)[number],
): Promise<boolean> {
  try {
    await execAsync(`which ${editor.command}`);
    return true;
  } catch {
    // Fallback: check if app exists (macOS)
    const appPath = `/Applications/${editor.appName}.app`;
    return pathExists(appPath);
  }
}

// Helper: open directory in editor
function openInEditor(dirPath: string, setting: EditorSetting): void {
  if (setting.type === 'preset') {
    const editor = PRESET_EDITORS.find((e) => e.id === setting.id);
    if (editor) {
      spawn(editor.command, [dirPath], {
        detached: true,
        stdio: 'ignore',
      }).unref();
    }
  } else if (setting.type === 'command') {
    spawn(setting.command, [dirPath], {
      detached: true,
      stdio: 'ignore',
    }).unref();
  } else if (setting.type === 'app') {
    // macOS: open -a "App.app" /path
    spawn('open', ['-a', setting.path, dirPath], {
      detached: true,
      stdio: 'ignore',
    }).unref();
  }
}

/**
 * Extracts the diff section for a specific file from a unified diff output.
 * Returns undefined if the file's diff section is not found.
 */
function extractFileDiff(
  unifiedDiff: string,
  filePath: string,
): string | undefined {
  // The unified diff format starts each file section with:
  // "diff --git a/path/to/file b/path/to/file"
  const fileMarker = `diff --git a/${filePath} b/${filePath}`;
  const startIndex = unifiedDiff.indexOf(fileMarker);

  if (startIndex === -1) {
    return undefined;
  }

  // Find the end of this file's diff section (start of next file or end of string)
  const nextFileIndex = unifiedDiff.indexOf('\ndiff --git ', startIndex + 1);
  const endIndex = nextFileIndex === -1 ? unifiedDiff.length : nextFileIndex;

  return unifiedDiff.slice(startIndex, endIndex).trim();
}
