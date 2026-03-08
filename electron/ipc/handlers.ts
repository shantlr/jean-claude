import { exec, spawn } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';

import { BrowserWindow, ipcMain, dialog } from 'electron';

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
} from '@shared/types';
import type { UsageProviderType } from '@shared/usage-types';

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
import { ProjectCommandRepository } from '../database/repositories/project-commands';
import { ProjectMcpOverrideRepository } from '../database/repositories/project-mcp-overrides';
import { TaskStepRepository } from '../database/repositories/task-steps';
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
  getPullRequestCommits,
  getPullRequestChanges,
  getPullRequestFileContent,
  getPullRequestThreads,
  addPullRequestComment,
  addPullRequestFileComment,
  getCurrentUser,
  activateWorkItem,
  type CloneRepositoryParams,
} from '../services/azure-devops-service';
import * as backendModelsService from '../services/backend-models-service';
import {
  complete as completeText,
  testCompletion,
  resetClient as resetCompletionClient,
  getDailyUsage as getCompletionDailyUsage,
} from '../services/completion-service';
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
  addAllowPermission,
  buildPermissionString,
  getSettingsLocalPath,
  getWorktreeSettingsPath,
} from '../services/permission-settings-service';
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
} from '../services/worktree-service';

const execAsync = promisify(exec);

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
  ipcMain.handle('projects:update', (_, id: string, data: UpdateProject) => {
    dbg.ipc('projects:update %s %o', id, data);
    return ProjectRepository.update(id, data);
  });
  ipcMain.handle('projects:delete', (_, id: string) => {
    dbg.ipc('projects:delete %s', id);
    return ProjectRepository.delete(id);
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

      // Activate associated work items and assign to current user if unassigned (fire and forget)
      if (task?.workItemIds && task.workItemIds.length > 0) {
        const project = await ProjectRepository.findById(data.projectId);
        if (project?.workItemProviderId) {
          dbg.ipc('Activating %d work items', task.workItemIds.length);
          for (const workItemId of task.workItemIds) {
            activateWorkItem({
              providerId: project.workItemProviderId,
              workItemId: parseInt(workItemId, 10),
            }).catch((err) => {
              dbg.ipc('Failed to activate work item %s: %O', workItemId, err);
            });
          }
        }
      }

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

      // Activate associated work items and assign to current user if unassigned (fire and forget)
      if (task?.workItemIds && task.workItemIds.length > 0) {
        const projectForWorkItems = await ProjectRepository.findById(
          taskData.projectId,
        );
        if (projectForWorkItems?.workItemProviderId) {
          dbg.ipc('Activating %d work items', task.workItemIds.length);
          for (const workItemId of task.workItemIds) {
            activateWorkItem({
              providerId: projectForWorkItems.workItemProviderId,
              workItemId: parseInt(workItemId, 10),
            }).catch((err) => {
              dbg.ipc('Failed to activate work item %s: %O', workItemId, err);
            });
          }
        }
      }

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
      const targetBranch = pr.targetRefName.replace('refs/heads/', '');

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

      // 6. Create Step 1: Review Changes (agent)
      const reviewStep = await StepService.create({
        taskId: task.id,
        name: 'Review Changes',
        promptTemplate: [
          'You are reviewing a pull request.',
          `Review the changes between \`origin/${targetBranch}\` and the current branch.`,
          'Analyze code quality, potential bugs, design issues, and suggest improvements.',
          '',
          'At the end of your review, output a JSON block fenced with ```json containing an array of review comments with this shape:',
          '`[{ "filePath": "path/to/file", "lineNumber": 42, "comment": "Your review comment" }]`',
          '',
          'Each comment should reference a specific file and line number from the changed files.',
        ].join('\n'),
        interactionMode: 'auto',
        agentBackend: project.defaultAgentBackend ?? 'claude-code',
        sortOrder: 0,
      });

      // 7. Create Step 2: Submit Review (pr-review)
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

      // 8. Auto-start the review step
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

    // Only check for missing worktree when completing (not uncompleting)
    if (isCompleting && taskBefore.worktreePath && taskBefore.branchName) {
      const worktreeExists = await pathExists(taskBefore.worktreePath);
      if (!worktreeExists) {
        const project = await ProjectRepository.findById(taskBefore.projectId);
        if (project) {
          const accepted = await sendGlobalPromptToWindow({
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

            // Clear worktree fields on the task
            return TaskRepository.update(id, {
              worktreePath: null,
              branchName: null,
              startCommitHash: null,
              sourceBranch: null,
            });
          }
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
      const permission = buildPermissionString(toolName, input);
      if (!permission) return TaskRepository.findById(taskId);

      const task = await TaskRepository.findById(taskId);
      const currentTools = task?.sessionAllowedTools ?? [];
      if (!currentTools.includes(permission)) {
        await TaskRepository.update(taskId, {
          sessionAllowedTools: [...currentTools, permission],
        });
      }
      return TaskRepository.findById(taskId);
    },
  );
  ipcMain.handle(
    'tasks:removeSessionAllowedTool',
    async (_, taskId: string, toolName: string) => {
      const task = await TaskRepository.findById(taskId);
      const currentTools = task?.sessionAllowedTools ?? [];
      await TaskRepository.update(taskId, {
        sessionAllowedTools: currentTools.filter((t) => t !== toolName),
      });
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
      const permission = buildPermissionString(toolName, input);
      if (!permission) return TaskRepository.findById(taskId);

      const task = await TaskRepository.findById(taskId);
      if (!task) throw new Error(`Task ${taskId} not found`);
      const project = await ProjectRepository.findById(task.projectId);
      if (!project) throw new Error(`Project ${task.projectId} not found`);

      // Update original repo settings.local.json
      await addAllowPermission(getSettingsLocalPath(project.path), permission);

      // If worktree task, also update worktree settings.local.json
      if (task.worktreePath) {
        await addAllowPermission(
          getSettingsLocalPath(task.worktreePath),
          permission,
        );
      }

      // Also add to session allowed tools
      const currentTools = task.sessionAllowedTools ?? [];
      if (!currentTools.includes(permission)) {
        await TaskRepository.update(taskId, {
          sessionAllowedTools: [...currentTools, permission],
        });
      }

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
      const permission = buildPermissionString(toolName, input);
      if (!permission) return TaskRepository.findById(taskId);

      const task = await TaskRepository.findById(taskId);
      if (!task) throw new Error(`Task ${taskId} not found`);
      const project = await ProjectRepository.findById(task.projectId);
      if (!project) throw new Error(`Project ${task.projectId} not found`);

      // Update original repo settings.local.worktrees.json
      await addAllowPermission(
        getWorktreeSettingsPath(project.path),
        permission,
      );

      // Update worktree settings.local.json (task must be worktree task)
      if (task.worktreePath) {
        await addAllowPermission(
          getSettingsLocalPath(task.worktreePath),
          permission,
        );
      }

      // Also add to session allowed tools
      const currentTools = task.sessionAllowedTools ?? [];
      if (!currentTools.includes(permission)) {
        await TaskRepository.update(taskId, {
          sessionAllowedTools: [...currentTools, permission],
        });
      }

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
      params: { message: string; stageAll: boolean },
    ) => {
      const task = await TaskRepository.findById(taskId);
      if (!task?.worktreePath) {
        throw new Error(`Task ${taskId} does not have a worktree`);
      }
      return commitWorktreeChanges({
        worktreePath: task.worktreePath,
        ...params,
      });
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
      const result = await mergeWorktree({
        worktreePath: task.worktreePath,
        projectPath: project.path,
        targetBranch: params.targetBranch,
        squash: params.squash,
        commitMessage: params.commitMessage,
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
      const step = await StepService.create(stepData);

      if (start) {
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

      // Step 1: Push branch to remote
      await pushBranch({
        worktreePath: task.worktreePath,
        branchName: task.branchName,
      });

      // Step 2: Create PR via Azure DevOps
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
      });

      // Step 3: Save PR info to task
      await TaskRepository.update(params.taskId, {
        pullRequestId: String(pr.id),
        pullRequestUrl: pr.url,
      });

      // Step 4: Optionally delete worktree (keep branch)
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
    (_, stepId: string, prompt: string) => {
      dbg.ipc('agent:queuePrompt %s', stepId);
      return agentService.queuePrompt(stepId, prompt);
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
    async (_, taskId: string) => {
      return await agentService.getMessagesWithRawData(taskId);
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
  ipcMain.handle('agent:usage:getAll', (_, providers: string[]) =>
    agentUsageService.getUsage(providers as UsageProviderType[]),
  );

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
