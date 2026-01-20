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
  },
  tasks: {
    findAll: () => ipcRenderer.invoke('tasks:findAll'),
    findByProjectId: (projectId: string) =>
      ipcRenderer.invoke('tasks:findByProjectId', projectId),
    findById: (id: string) => ipcRenderer.invoke('tasks:findById', id),
    create: (data: unknown) => ipcRenderer.invoke('tasks:create', data),
    update: (id: string, data: unknown) =>
      ipcRenderer.invoke('tasks:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('tasks:delete', id),
    markAsRead: (id: string) => ipcRenderer.invoke('tasks:markAsRead', id),
    updateLastReadIndex: (id: string, lastReadIndex: number) =>
      ipcRenderer.invoke('tasks:updateLastReadIndex', id, lastReadIndex),
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
  },
  fs: {
    readPackageJson: (dirPath: string) =>
      ipcRenderer.invoke('fs:readPackageJson', dirPath),
    readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
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
  },
});
