import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import { BrowserWindow, ipcMain, dialog } from 'electron';

import {
  AGENT_CHANNELS,
  PermissionResponse,
  QuestionResponse,
} from '../../shared/agent-types';
import {
  PRESET_EDITORS,
  type InteractionMode,
  type EditorSetting,
  type AppSettings,
} from '../../shared/types';
import {
  ProjectRepository,
  TaskRepository,
  ProviderRepository,
  SettingsRepository,
  DebugRepository,
} from '../database/repositories';
import {
  NewProject,
  NewTask,
  NewProvider,
  UpdateProject,
  UpdateTask,
  UpdateProvider,
} from '../database/schema';
import { agentService } from '../services/agent-service';
import { createWorktree } from '../services/worktree-service';

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
    async (_, data: NewTask & { useWorktree: boolean }) => {
      const { useWorktree, ...taskData } = data;

      if (!useWorktree) {
        // No worktree requested, just create the task normally
        return TaskRepository.create(taskData);
      }

      // Get the project to access its path and name
      const project = await ProjectRepository.findById(taskData.projectId);
      if (!project) {
        throw new Error(`Project ${taskData.projectId} not found`);
      }

      // Create the worktree
      const { worktreePath, startCommitHash } = await createWorktree(
        project.path,
        project.id,
        project.name,
        taskData.prompt
      );

      // Create the task with worktree info
      return TaskRepository.create({
        ...taskData,
        worktreePath,
        startCommitHash,
      });
    }
  );
  ipcMain.handle('tasks:update', (_, id: string, data: UpdateTask) =>
    TaskRepository.update(id, data),
  );
  ipcMain.handle('tasks:delete', (_, id: string) => TaskRepository.delete(id));
  ipcMain.handle('tasks:markAsRead', (_, id: string) =>
    TaskRepository.markAsRead(id),
  );
  ipcMain.handle('tasks:updateLastReadIndex', (_, id: string, lastReadIndex: number) =>
    TaskRepository.updateLastReadIndex(id, lastReadIndex),
  );
  ipcMain.handle(
    'tasks:setMode',
    async (_, taskId: string, mode: InteractionMode) => {
      await agentService.setMode(taskId, mode);
      return TaskRepository.findById(taskId);
    }
  );
  ipcMain.handle('tasks:toggleUserCompleted', (_, id: string) =>
    TaskRepository.toggleUserCompleted(id)
  );
  ipcMain.handle('tasks:clearUserCompleted', (_, id: string) =>
    TaskRepository.clearUserCompleted(id)
  );
  // Tools that can be session-allowed (security validation)
  const SESSION_ALLOWABLE_TOOLS = ['Edit', 'Write'] as const;

  ipcMain.handle(
    'tasks:addSessionAllowedTool',
    async (_, taskId: string, toolName: string) => {
      // Validate that the tool is allowed to be session-allowed
      if (
        !SESSION_ALLOWABLE_TOOLS.includes(toolName as (typeof SESSION_ALLOWABLE_TOOLS)[number])
      ) {
        console.warn(`[IPC] Tool "${toolName}" is not allowed to be session-allowed`);
        return TaskRepository.findById(taskId);
      }

      const task = await TaskRepository.findById(taskId);
      const currentTools = task?.sessionAllowedTools ?? [];
      if (!currentTools.includes(toolName)) {
        await TaskRepository.update(taskId, {
          sessionAllowedTools: [...currentTools, toolName],
        });
      }
      return TaskRepository.findById(taskId);
    }
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
    }
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

  // Filesystem
  ipcMain.handle('fs:readPackageJson', (_, dirPath: string) => {
    try {
      const pkgPath = path.join(dirPath, 'package.json');
      const content = fs.readFileSync(pkgPath, 'utf-8');
      const pkg = JSON.parse(content);
      return { name: pkg.name };
    } catch {
      return null;
    }
  });

  ipcMain.handle('fs:readFile', (_, filePath: string) => {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
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
      response: PermissionResponse | QuestionResponse
    ) => {
      return agentService.respond(taskId, requestId, response);
    }
  );

  ipcMain.handle(
    AGENT_CHANNELS.SEND_MESSAGE,
    (_, taskId: string, message: string) => {
      return agentService.sendMessage(taskId, message);
    }
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
  ipcMain.handle('shell:getAvailableEditors', () => {
    return PRESET_EDITORS.map((editor) => ({
      id: editor.id,
      available: isEditorAvailable(editor),
    }));
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
      }
    ) => DebugRepository.queryTable(params)
  );
}

// Helper: check if an editor is available
function isEditorAvailable(editor: (typeof PRESET_EDITORS)[number]): boolean {
  try {
    execSync(`which ${editor.command}`, { stdio: 'ignore' });
    return true;
  } catch {
    // Fallback: check if app exists (macOS)
    const appPath = `/Applications/${editor.appName}.app`;
    return fs.existsSync(appPath);
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
