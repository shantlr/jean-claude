import { contextBridge, ipcRenderer } from 'electron';

import { AGENT_CHANNELS } from '../shared/agent-types';

contextBridge.exposeInMainWorld('api', {
  platform: process.platform,
  projects: {
    findAll: () => ipcRenderer.invoke('projects:findAll'),
    findById: (id: string) => ipcRenderer.invoke('projects:findById', id),
    create: (data: unknown) => ipcRenderer.invoke('projects:create', data),
    update: (id: string, data: unknown) =>
      ipcRenderer.invoke('projects:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('projects:delete', id),
    reorder: (orderedIds: string[]) =>
      ipcRenderer.invoke('projects:reorder', orderedIds),
  },
  tasks: {
    findAll: () => ipcRenderer.invoke('tasks:findAll'),
    findByProjectId: (projectId: string) =>
      ipcRenderer.invoke('tasks:findByProjectId', projectId),
    findById: (id: string) => ipcRenderer.invoke('tasks:findById', id),
    create: (data: unknown) => ipcRenderer.invoke('tasks:create', data),
    createWithWorktree: (data: unknown) =>
      ipcRenderer.invoke('tasks:createWithWorktree', data),
    update: (id: string, data: unknown) =>
      ipcRenderer.invoke('tasks:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('tasks:delete', id),
    markAsRead: (id: string) => ipcRenderer.invoke('tasks:markAsRead', id),
    updateLastReadIndex: (id: string, lastReadIndex: number) =>
      ipcRenderer.invoke('tasks:updateLastReadIndex', id, lastReadIndex),
    setMode: (id: string, mode: string) =>
      ipcRenderer.invoke('tasks:setMode', id, mode),
    toggleUserCompleted: (id: string) =>
      ipcRenderer.invoke('tasks:toggleUserCompleted', id),
    clearUserCompleted: (id: string) =>
      ipcRenderer.invoke('tasks:clearUserCompleted', id),
    addSessionAllowedTool: (id: string, toolName: string) =>
      ipcRenderer.invoke('tasks:addSessionAllowedTool', id, toolName),
    removeSessionAllowedTool: (id: string, toolName: string) =>
      ipcRenderer.invoke('tasks:removeSessionAllowedTool', id, toolName),
    reorder: (projectId: string, activeIds: string[], completedIds: string[]) =>
      ipcRenderer.invoke('tasks:reorder', projectId, activeIds, completedIds),
  },
  worktree: {
    git: {
      getDiff: (worktreePath: string, startCommitHash: string) =>
        ipcRenderer.invoke('worktree:git:getDiff', worktreePath, startCommitHash),
      getFileContent: (
        worktreePath: string,
        startCommitHash: string,
        filePath: string,
        status: 'added' | 'modified' | 'deleted'
      ) =>
        ipcRenderer.invoke(
          'worktree:git:getFileContent',
          worktreePath,
          startCommitHash,
          filePath,
          status
        ),
    },
  },
  providers: {
    findAll: () => ipcRenderer.invoke('providers:findAll'),
    findById: (id: string) => ipcRenderer.invoke('providers:findById', id),
    create: (data: unknown) => ipcRenderer.invoke('providers:create', data),
    update: (id: string, data: unknown) =>
      ipcRenderer.invoke('providers:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('providers:delete', id),
  },
  dialog: {
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
    openApplication: () => ipcRenderer.invoke('dialog:openApplication'),
  },
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: unknown) =>
      ipcRenderer.invoke('settings:set', key, value),
  },
  fs: {
    readPackageJson: (dirPath: string) =>
      ipcRenderer.invoke('fs:readPackageJson', dirPath),
    readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
  },
  shell: {
    openInEditor: (dirPath: string) =>
      ipcRenderer.invoke('shell:openInEditor', dirPath),
    getAvailableEditors: () => ipcRenderer.invoke('shell:getAvailableEditors'),
  },
  agent: {
    start: (taskId: string) => ipcRenderer.invoke(AGENT_CHANNELS.START, taskId),
    stop: (taskId: string) => ipcRenderer.invoke(AGENT_CHANNELS.STOP, taskId),
    respond: (taskId: string, requestId: string, response: unknown) =>
      ipcRenderer.invoke(AGENT_CHANNELS.RESPOND, taskId, requestId, response),
    sendMessage: (taskId: string, message: string) =>
      ipcRenderer.invoke(AGENT_CHANNELS.SEND_MESSAGE, taskId, message),
    getMessages: (taskId: string) =>
      ipcRenderer.invoke(AGENT_CHANNELS.GET_MESSAGES, taskId),
    getMessageCount: (taskId: string) =>
      ipcRenderer.invoke(AGENT_CHANNELS.GET_MESSAGE_COUNT, taskId),
    onMessage: (callback: (event: unknown) => void) => {
      const handler = (_: unknown, event: unknown) => callback(event);
      ipcRenderer.on(AGENT_CHANNELS.MESSAGE, handler);
      return () => ipcRenderer.removeListener(AGENT_CHANNELS.MESSAGE, handler);
    },
    onStatus: (callback: (event: unknown) => void) => {
      const handler = (_: unknown, event: unknown) => callback(event);
      ipcRenderer.on(AGENT_CHANNELS.STATUS, handler);
      return () => ipcRenderer.removeListener(AGENT_CHANNELS.STATUS, handler);
    },
    onPermission: (callback: (event: unknown) => void) => {
      const handler = (_: unknown, event: unknown) => callback(event);
      ipcRenderer.on(AGENT_CHANNELS.PERMISSION, handler);
      return () => ipcRenderer.removeListener(AGENT_CHANNELS.PERMISSION, handler);
    },
    onQuestion: (callback: (event: unknown) => void) => {
      const handler = (_: unknown, event: unknown) => callback(event);
      ipcRenderer.on(AGENT_CHANNELS.QUESTION, handler);
      return () => ipcRenderer.removeListener(AGENT_CHANNELS.QUESTION, handler);
    },
    onNameUpdated: (callback: (event: unknown) => void) => {
      const handler = (_: unknown, event: unknown) => callback(event);
      ipcRenderer.on(AGENT_CHANNELS.NAME_UPDATED, handler);
      return () => ipcRenderer.removeListener(AGENT_CHANNELS.NAME_UPDATED, handler);
    },
  },
  debug: {
    getTableNames: () => ipcRenderer.invoke('debug:getTableNames'),
    queryTable: (params: {
      table: string;
      search?: string;
      limit: number;
      offset: number;
    }) => ipcRenderer.invoke('debug:queryTable', params),
  },
  usage: {
    get: () => ipcRenderer.invoke('agent:usage:get'),
  },
});
console.log('Preload script loaded');