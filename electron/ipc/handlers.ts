import { exec, spawn } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';

import { BrowserWindow, ipcMain, dialog } from 'electron';

const execAsync = promisify(exec);

import {
  AGENT_CHANNELS,
  PermissionResponse,
  QuestionResponse,
} from '../../shared/agent-types';
import type { GlobalPromptResponse } from '../../shared/global-prompt-types';
import type {
  NewMcpServerTemplate,
  UpdateMcpServerTemplate,
  NewProjectMcpOverride,
} from '../../shared/mcp-types';
import type {
  NewProjectCommand,
  UpdateProjectCommand,
} from '../../shared/run-command-types';
import {
  PRESET_EDITORS,
  type InteractionMode,
  type ModelPreference,
  type EditorSetting,
  type AppSettings,
  type NewToken,
  type UpdateToken,
} from '../../shared/types';
import {
  ProjectRepository,
  TaskRepository,
  ProviderRepository,
  TokenRepository,
  SettingsRepository,
  DebugRepository,
  TaskSummaryRepository,
} from '../database/repositories';
import { McpTemplateRepository } from '../database/repositories/mcp-templates';
import { ProjectCommandRepository } from '../database/repositories/project-commands';
import { ProjectMcpOverrideRepository } from '../database/repositories/project-mcp-overrides';
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
  updateWorkItemState,
  type CloneRepositoryParams,
} from '../services/azure-devops-service';
import { handlePromptResponse } from '../services/global-prompt-service';
import {
  MCP_PRESETS,
  getEnabledTemplatesForProject,
  getUnifiedMcpServers,
  activateMcpServer,
  deactivateMcpServer,
  substituteVariables,
} from '../services/mcp-template-service';
import { generateTaskName } from '../services/name-generation-service';
import {
  addAllowPermission,
  buildPermissionString,
  getSettingsLocalPath,
  getWorktreeSettingsPath,
} from '../services/permission-settings-service';
import { runCommandService } from '../services/run-command-service';
import { getAllSkills } from '../services/skill-service';
import { generateSummary } from '../services/summary-generation-service';
import {
  createWorktree,
  getWorktreeDiff,
  getWorktreeFileContent,
  getWorktreeUnifiedDiff,
  getProjectBranches,
  getCurrentBranch,
  getCurrentCommitHash,
  getWorktreeStatus,
  commitWorktreeChanges,
  cleanupWroktree,
  mergeWorktree,
  pushBranch,
} from '../services/worktree-service';

export function registerIpcHandlers() {
  dbg.ipc('Registering IPC handlers');

  ipcMain.handle('windowState:getIsFullscreen', (event) => {
    const currentWindow = BrowserWindow.fromWebContents(event.sender);
    return currentWindow?.isFullScreen() ?? false;
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
    return getAllSkills(project.path);
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
  ipcMain.handle('tasks:create', async (_, data: NewTask) => {
    const task = await TaskRepository.create(data);

    // Update associated work items to "Active" state (fire and forget, ignore failures)
    if (task?.workItemIds && task.workItemIds.length > 0) {
      const project = await ProjectRepository.findById(data.projectId);
      if (project?.workItemProviderId) {
        dbg.ipc(
          'Updating %d work items to Active state',
          task.workItemIds.length,
        );
        for (const workItemId of task.workItemIds) {
          updateWorkItemState({
            providerId: project.workItemProviderId,
            workItemId: parseInt(workItemId, 10),
            state: 'Active',
          }).catch((err) => {
            dbg.ipc(
              'Failed to update work item %s to Active: %O',
              workItemId,
              err,
            );
          });
        }
      }
    }

    return task;
  });
  ipcMain.handle(
    'tasks:createWithWorktree',
    async (
      event,
      data: NewTask & {
        useWorktree: boolean;
        sourceBranch?: string | null;
        autoStart?: boolean;
      },
    ) => {
      const { useWorktree, sourceBranch, autoStart, ...taskData } = data;
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

      // Update associated work items to "Active" state (fire and forget, ignore failures)
      if (task?.workItemIds && task.workItemIds.length > 0) {
        const projectForWorkItems = await ProjectRepository.findById(
          taskData.projectId,
        );
        if (projectForWorkItems?.workItemProviderId) {
          dbg.ipc(
            'Updating %d work items to Active state',
            task.workItemIds.length,
          );
          for (const workItemId of task.workItemIds) {
            updateWorkItemState({
              providerId: projectForWorkItems.workItemProviderId,
              workItemId: parseInt(workItemId, 10),
              state: 'Active',
            }).catch((err) => {
              dbg.ipc(
                'Failed to update work item %s to Active: %O',
                workItemId,
                err,
              );
            });
          }
        }
      }

      // Auto-start the agent if requested
      if (autoStart && task) {
        dbg.ipc('Auto-starting agent for task %s', task.id);
        const window = BrowserWindow.fromWebContents(event.sender);
        if (window) {
          agentService.setMainWindow(window);
        }
        // Start agent in background (don't await to return task immediately)
        agentService.start(task.id).catch((err) => {
          dbg.ipc('Error auto-starting agent for task %s: %O', task.id, err);
        });
      }

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
      const task = await TaskRepository.findById(id);

      if (task?.worktreePath) {
        const project = await ProjectRepository.findById(task.projectId);
        if (project) {
          await cleanupWroktree({
            worktreePath: task.worktreePath,
            projectPath: project.path,
            skipIfChanges: !options?.deleteWorktree,
            branchCleanup: 'delete',
            force: options?.deleteWorktree ?? false,
          });
        }
      }

      await TaskRepository.delete(id);
    },
  );
  ipcMain.handle('tasks:markAsRead', (_, id: string) =>
    TaskRepository.markAsRead(id),
  );
  ipcMain.handle(
    'tasks:updateLastReadIndex',
    (_, id: string, lastReadIndex: number) =>
      TaskRepository.updateLastReadIndex(id, lastReadIndex),
  );
  ipcMain.handle(
    'tasks:setMode',
    async (_, taskId: string, mode: InteractionMode) => {
      await agentService.setMode(taskId, mode);
      return TaskRepository.findById(taskId);
    },
  );
  ipcMain.handle(
    'tasks:setModelPreference',
    async (_, taskId: string, modelPreference: string) => {
      return TaskRepository.update(taskId, {
        modelPreference: modelPreference as ModelPreference,
      });
    },
  );
  ipcMain.handle('tasks:toggleUserCompleted', (_, id: string) =>
    TaskRepository.toggleUserCompleted(id),
  );
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
    'tasks:worktree:merge',
    async (
      _,
      taskId: string,
      params: {
        targetBranch: string;
        squash?: boolean;
        commitMessage?: string;
      },
    ) => {
      const task = await TaskRepository.findById(taskId);
      if (!task?.worktreePath) {
        throw new Error(`Task ${taskId} does not have a worktree`);
      }
      const project = await ProjectRepository.findById(task.projectId);
      if (!project) {
        throw new Error(`Project ${task.projectId} not found`);
      }
      return mergeWorktree({
        worktreePath: task.worktreePath,
        projectPath: project.path,
        targetBranch: params.targetBranch,
        squash: params.squash,
        commitMessage: params.commitMessage,
      });
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

  ipcMain.handle('tasks:getSkills', async (_, taskId: string) => {
    const task = await TaskRepository.findById(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    // Use worktree path if available, otherwise use project path
    const projectPath =
      task.worktreePath ??
      (await ProjectRepository.findById(task.projectId))?.path;
    if (!projectPath) {
      throw new Error(`Project ${task.projectId} not found`);
    }
    dbg.ipc('tasks:getSkills for task: %s, path: %s', taskId, projectPath);
    return getAllSkills(projectPath);
  });

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
        };
      },
    ) => queryWorkItems(params),
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

  // Projects: get detected projects from ~/.claude.json
  ipcMain.handle('projects:getDetected', async () => {
    try {
      const claudeJsonPath = path.join(os.homedir(), '.claude.json');
      const content = await fs.readFile(claudeJsonPath, 'utf-8');
      const claudeJson = JSON.parse(content) as {
        projects?: Record<string, unknown>;
      };

      if (!claudeJson.projects) {
        return [];
      }

      // Get existing project paths from database to filter them out
      const existingProjects = await ProjectRepository.findAll();
      const existingPaths = new Set(existingProjects.map((p) => p.path));

      // Extract project paths and filter
      const detectedProjects: Array<{ path: string; name: string }> = [];

      for (const projectPath of Object.keys(claudeJson.projects)) {
        // Skip if already in database
        if (existingPaths.has(projectPath)) {
          continue;
        }

        // Skip worktree paths (contain .worktrees or .idling/worktrees or .claude-worktrees)
        if (
          projectPath.includes('.worktrees') ||
          projectPath.includes('.idling/worktrees') ||
          projectPath.includes('.claude-worktrees')
        ) {
          continue;
        }

        // Skip paths inside ~/.jean-claude (internal app directory)
        const jeanClaudeDir = path.join(os.homedir(), '.jean-claude');
        if (projectPath.startsWith(jeanClaudeDir)) {
          continue;
        }

        // Check if path still exists
        const exists = await pathExists(projectPath);
        if (!exists) {
          continue;
        }

        // Extract name from path (last segment)
        const name = path.basename(projectPath);

        detectedProjects.push({ path: projectPath, name });
      }

      // Sort by name
      detectedProjects.sort((a, b) => a.name.localeCompare(b.name));

      return detectedProjects;
    } catch (error) {
      dbg.ipc('Error reading ~/.claude.json (ignored): %O', error);
      // If file doesn't exist or can't be parsed, return empty array
      return [];
    }
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

  // Agent
  ipcMain.handle(AGENT_CHANNELS.START, (event, taskId: string) => {
    dbg.ipc('agent:start %s', taskId);
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
      agentService.setMainWindow(window);
    }
    return agentService.start(taskId);
  });

  ipcMain.handle(AGENT_CHANNELS.STOP, (_, taskId: string) => {
    dbg.ipc('agent:stop %s', taskId);
    return agentService.stop(taskId);
  });

  ipcMain.handle(
    AGENT_CHANNELS.RESPOND,
    (
      _,
      taskId: string,
      requestId: string,
      response: PermissionResponse | QuestionResponse,
    ) => {
      dbg.ipc('agent:respond task=%s, request=%s', taskId, requestId);
      return agentService.respond(taskId, requestId, response);
    },
  );

  ipcMain.handle(
    AGENT_CHANNELS.SEND_MESSAGE,
    (_, taskId: string, message: string) => {
      dbg.ipc('agent:sendMessage %s (length: %d)', taskId, message.length);
      return agentService.sendMessage(taskId, message);
    },
  );

  ipcMain.handle(
    AGENT_CHANNELS.QUEUE_PROMPT,
    (_, taskId: string, prompt: string) => {
      dbg.ipc('agent:queuePrompt %s', taskId);
      return agentService.queuePrompt(taskId, prompt);
    },
  );

  ipcMain.handle(
    AGENT_CHANNELS.CANCEL_QUEUED_PROMPT,
    (_, taskId: string, promptId: string) => {
      dbg.ipc('agent:cancelQueuedPrompt task=%s, prompt=%s', taskId, promptId);
      return agentService.cancelQueuedPrompt(taskId, promptId);
    },
  );

  ipcMain.handle(AGENT_CHANNELS.GET_MESSAGES, (_, taskId: string) => {
    return agentService.getMessages(taskId);
  });

  ipcMain.handle(AGENT_CHANNELS.GET_MESSAGE_COUNT, (_, taskId: string) => {
    return agentService.getMessageCount(taskId);
  });

  ipcMain.handle(AGENT_CHANNELS.GET_PENDING_REQUEST, (_, taskId: string) => {
    return agentService.getPendingRequest(taskId);
  });

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
  ipcMain.handle('agent:usage:get', () => agentUsageService.getUsage());

  // Debug
  ipcMain.handle('debug:getTableNames', () => DebugRepository.getTableNames());
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
    'project:commands:run:start',
    (_, { projectId, workingDir }: { projectId: string; workingDir: string }) =>
      runCommandService.startCommands(projectId, workingDir),
  );
  ipcMain.handle('project:commands:run:stop', (_, projectId: string) =>
    runCommandService.stopCommands(projectId),
  );
  ipcMain.handle('project:commands:run:getStatus', (_, projectId: string) =>
    runCommandService.getRunStatus(projectId),
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

  // Subscribe to run command status changes and forward to renderer
  runCommandService.onStatusChange((projectId, status) => {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send(
        'project:commands:run:statusChange',
        projectId,
        status,
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
