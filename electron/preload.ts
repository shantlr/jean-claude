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
    getBranches: (projectId: string) =>
      ipcRenderer.invoke('projects:getBranches', projectId),
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
    worktree: {
      getDiff: (taskId: string) =>
        ipcRenderer.invoke('tasks:worktree:getDiff', taskId),
      getFileContent: (
        taskId: string,
        filePath: string,
        status: 'added' | 'modified' | 'deleted',
      ) =>
        ipcRenderer.invoke(
          'tasks:worktree:getFileContent',
          taskId,
          filePath,
          status,
        ),
      getStatus: (taskId: string) =>
        ipcRenderer.invoke('tasks:worktree:getStatus', taskId),
      commit: (
        taskId: string,
        params: { message: string; stageAll: boolean },
      ) => ipcRenderer.invoke('tasks:worktree:commit', taskId, params),
      merge: (
        taskId: string,
        params: {
          targetBranch: string;
          squash?: boolean;
          commitMessage?: string;
        },
      ) => ipcRenderer.invoke('tasks:worktree:merge', taskId, params),
      getBranches: (taskId: string) =>
        ipcRenderer.invoke('tasks:worktree:getBranches', taskId),
    },
  },
  providers: {
    findAll: () => ipcRenderer.invoke('providers:findAll'),
    findById: (id: string) => ipcRenderer.invoke('providers:findById', id),
    create: (data: unknown) => ipcRenderer.invoke('providers:create', data),
    update: (id: string, data: unknown) =>
      ipcRenderer.invoke('providers:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('providers:delete', id),
    getDetails: (providerId: string) =>
      ipcRenderer.invoke('providers:getDetails', providerId),
  },
  tokens: {
    findAll: () => ipcRenderer.invoke('tokens:findAll'),
    findById: (id: string) => ipcRenderer.invoke('tokens:findById', id),
    findByProviderType: (providerType: string) =>
      ipcRenderer.invoke('tokens:findByProviderType', providerType),
    create: (data: unknown) => ipcRenderer.invoke('tokens:create', data),
    update: (id: string, data: unknown) =>
      ipcRenderer.invoke('tokens:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('tokens:delete', id),
  },
  azureDevOps: {
    getOrganizations: (tokenId: string) =>
      ipcRenderer.invoke('azureDevOps:getOrganizations', tokenId),
    validateToken: (token: string) =>
      ipcRenderer.invoke('azureDevOps:validateToken', token),
    getTokenExpiration: (tokenId: string) =>
      ipcRenderer.invoke('azureDevOps:getTokenExpiration', tokenId),
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
    queuePrompt: (taskId: string, prompt: string) =>
      ipcRenderer.invoke(AGENT_CHANNELS.QUEUE_PROMPT, taskId, prompt),
    cancelQueuedPrompt: (taskId: string, promptId: string) =>
      ipcRenderer.invoke(AGENT_CHANNELS.CANCEL_QUEUED_PROMPT, taskId, promptId),
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
      return () =>
        ipcRenderer.removeListener(AGENT_CHANNELS.PERMISSION, handler);
    },
    onQuestion: (callback: (event: unknown) => void) => {
      const handler = (_: unknown, event: unknown) => callback(event);
      ipcRenderer.on(AGENT_CHANNELS.QUESTION, handler);
      return () => ipcRenderer.removeListener(AGENT_CHANNELS.QUESTION, handler);
    },
    onNameUpdated: (callback: (event: unknown) => void) => {
      const handler = (_: unknown, event: unknown) => callback(event);
      ipcRenderer.on(AGENT_CHANNELS.NAME_UPDATED, handler);
      return () =>
        ipcRenderer.removeListener(AGENT_CHANNELS.NAME_UPDATED, handler);
    },
    onQueueUpdate: (callback: (event: unknown) => void) => {
      const handler = (_: unknown, event: unknown) => callback(event);
      ipcRenderer.on(AGENT_CHANNELS.QUEUE_UPDATE, handler);
      return () =>
        ipcRenderer.removeListener(AGENT_CHANNELS.QUEUE_UPDATE, handler);
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
