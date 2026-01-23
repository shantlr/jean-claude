import * as fs from 'fs';
import * as path from 'path';

import { BrowserWindow, ipcMain, dialog } from 'electron';

import {
  AGENT_CHANNELS,
  PermissionResponse,
  QuestionResponse,
} from '../../shared/agent-types';
import type { InteractionMode } from '../../shared/types';
import {
  ProjectRepository,
  TaskRepository,
  ProviderRepository,
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
}
