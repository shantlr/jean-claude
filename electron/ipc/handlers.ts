import { exec, spawn } from 'child_process';
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
import type { NewProjectCommand, UpdateProjectCommand } from '../../shared/run-command-types';
import {
  PRESET_EDITORS,
  type InteractionMode,
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
} from '../database/repositories';
import { ProjectCommandRepository } from '../database/repositories/project-commands';
import {
  NewProject,
  NewTask,
  NewProvider,
  UpdateProject,
  UpdateTask,
  UpdateProvider,
} from '../database/schema';
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
} from '../services/azure-devops-service';
import { generateTaskName } from '../services/name-generation-service';
import {
  addAllowPermission,
  buildPermissionString,
  getSettingsLocalPath,
  getWorktreeSettingsPath,
} from '../services/permission-settings-service';
import { runCommandService } from '../services/run-command-service';
import {
  createWorktree,
  getWorktreeDiff,
  getWorktreeFileContent,
  getProjectBranches,
  getCurrentBranch,
  getWorktreeStatus,
  commitWorktreeChanges,
  mergeWorktree,
  pushBranch,
} from '../services/worktree-service';

export function registerIpcHandlers() {
  // Projects
  ipcMain.handle('projects:findAll', () => ProjectRepository.findAll());
  ipcMain.handle('projects:findById', (_, id: string) =>
    ProjectRepository.findById(id),
  );
  ipcMain.handle('projects:create', (_, data: NewProject) =>
    ProjectRepository.create(data),
  );
  ipcMain.handle('projects:update', (_, id: string, data: UpdateProject) =>
    ProjectRepository.update(id, data),
  );
  ipcMain.handle('projects:delete', (_, id: string) =>
    ProjectRepository.delete(id),
  );
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

  // Tasks
  ipcMain.handle('tasks:findAll', () => TaskRepository.findAll());
  ipcMain.handle('tasks:findByProjectId', (_, projectId: string) =>
    TaskRepository.findByProjectId(projectId),
  );
  ipcMain.handle('tasks:findById', (_, id: string) =>
    TaskRepository.findById(id),
  );
  ipcMain.handle('tasks:create', (_, data: NewTask) =>
    TaskRepository.create(data),
  );
  ipcMain.handle(
    'tasks:createWithWorktree',
    async (
      _,
      data: NewTask & { useWorktree: boolean; sourceBranch?: string | null },
    ) => {
      const { useWorktree, sourceBranch, ...taskData } = data;

      if (!useWorktree) {
        // No worktree requested, just create the task normally
        return TaskRepository.create(taskData);
      }

      // Get the project to access its path and name
      const project = await ProjectRepository.findById(taskData.projectId);
      if (!project) {
        throw new Error(`Project ${taskData.projectId} not found`);
      }

      // Generate task name first (if not already provided)
      // This allows the worktree directory to use the same name
      let taskName = taskData.name;
      if (!taskName) {
        taskName = await generateTaskName(taskData.prompt);
        // taskName may still be null if generation fails - that's ok
      }

      // Create the worktree using the generated task name
      // Use provided sourceBranch, fall back to project defaultBranch, or undefined for current HEAD
      const effectiveSourceBranch = sourceBranch ?? project.defaultBranch;
      const { worktreePath, startCommitHash, branchName } =
        await createWorktree(
          project.path,
          project.id,
          project.name,
          taskData.prompt,
          taskName ?? undefined,
          effectiveSourceBranch ?? undefined,
        );

      // Create the task with worktree info and generated name
      return TaskRepository.create({
        ...taskData,
        name: taskName,
        worktreePath,
        startCommitHash,
        branchName,
      });
    },
  );
  ipcMain.handle('tasks:update', (_, id: string, data: UpdateTask) =>
    TaskRepository.update(id, data),
  );
  ipcMain.handle('tasks:delete', (_, id: string) => TaskRepository.delete(id));
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
    return getWorktreeDiff(task.worktreePath, task.startCommitHash);
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
  ipcMain.handle(
    'azureDevOps:queryWorkItems',
    (
      _,
      params: {
        providerId: string;
        projectId: string;
        projectName: string;
        filters: { states?: string[]; workItemTypes?: string[] };
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
    'tasks:worktree:pushBranch',
    async (_, taskId: string) => {
      const task = await TaskRepository.findById(taskId);
      if (!task?.worktreePath || !task?.branchName) {
        throw new Error(
          `Task ${taskId} does not have a worktree with a branch`,
        );
      }
      return pushBranch({
        worktreePath: task.worktreePath,
        branchName: task.branchName,
      });
    },
  );

  // Dialog
  ipcMain.handle('dialog:openDirectory', async (event) => {
    console.log('dialog:openDirectory called');
    const window = BrowserWindow.fromWebContents(event.sender);
    console.log('window:', window);
    const result = await dialog.showOpenDialog(window!, {
      properties: ['openDirectory'],
    });
    console.log('dialog result:', result);
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
      console.error('Error reading ~/.claude.json (ignored):', error);
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
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
      agentService.setMainWindow(window);
    }
    return agentService.start(taskId);
  });

  ipcMain.handle(AGENT_CHANNELS.STOP, (_, taskId: string) => {
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
      return agentService.respond(taskId, requestId, response);
    },
  );

  ipcMain.handle(
    AGENT_CHANNELS.SEND_MESSAGE,
    (_, taskId: string, message: string) => {
      return agentService.sendMessage(taskId, message);
    },
  );

  ipcMain.handle(
    AGENT_CHANNELS.QUEUE_PROMPT,
    (_, taskId: string, prompt: string) => {
      return agentService.queuePrompt(taskId, prompt);
    },
  );

  ipcMain.handle(
    AGENT_CHANNELS.CANCEL_QUEUED_PROMPT,
    (_, taskId: string, promptId: string) => {
      return agentService.cancelQueuedPrompt(taskId, promptId);
    },
  );

  ipcMain.handle(AGENT_CHANNELS.GET_MESSAGES, (_, taskId: string) => {
    return agentService.getMessages(taskId);
  });

  ipcMain.handle(AGENT_CHANNELS.GET_MESSAGE_COUNT, (_, taskId: string) => {
    return agentService.getMessageCount(taskId);
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
    ProjectCommandRepository.findByProjectId(projectId)
  );
  ipcMain.handle('project:commands:create', (_, data: NewProjectCommand) =>
    ProjectCommandRepository.create(data)
  );
  ipcMain.handle(
    'project:commands:update',
    (_, { id, data }: { id: string; data: UpdateProjectCommand }) =>
      ProjectCommandRepository.update(id, data)
  );
  ipcMain.handle('project:commands:delete', (_, id: string) =>
    ProjectCommandRepository.delete(id)
  );

  // Run Commands
  ipcMain.handle(
    'project:commands:run:start',
    (_, { projectId, workingDir }: { projectId: string; workingDir: string }) =>
      runCommandService.startCommands(projectId, workingDir)
  );
  ipcMain.handle('project:commands:run:stop', (_, projectId: string) =>
    runCommandService.stopCommands(projectId)
  );
  ipcMain.handle('project:commands:run:getStatus', (_, projectId: string) =>
    runCommandService.getRunStatus(projectId)
  );
  ipcMain.handle(
    'project:commands:run:killPortsForCommand',
    (_, { projectId, commandId }: { projectId: string; commandId: string }) =>
      runCommandService.killPortsForCommand(projectId, commandId)
  );
  ipcMain.handle('project:commands:run:getPackageScripts', (_, projectPath: string) =>
    runCommandService.getPackageScripts(projectPath)
  );

  // Subscribe to run command status changes and forward to renderer
  runCommandService.onStatusChange((projectId, status) => {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('project:commands:run:statusChange', projectId, status);
    });
  });
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
