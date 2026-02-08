import { contextBridge, ipcRenderer } from 'electron';

import { AGENT_CHANNELS } from '@shared/agent-types';
import type {
  GlobalPrompt,
  GlobalPromptResponse,
} from '@shared/global-prompt-types';

contextBridge.exposeInMainWorld('api', {
  platform: process.platform,
  windowState: {
    getIsFullscreen: () => ipcRenderer.invoke('windowState:getIsFullscreen'),
    onFullscreenChange: (callback: (isFullscreen: boolean) => void) => {
      const handler = (_: unknown, isFullscreen: boolean) =>
        callback(isFullscreen);
      ipcRenderer.on('windowState:fullscreen-changed', handler);
      return () =>
        ipcRenderer.removeListener('windowState:fullscreen-changed', handler);
    },
  },
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
    getCurrentBranch: (projectId: string) =>
      ipcRenderer.invoke('projects:getCurrentBranch', projectId),
    getDetected: () => ipcRenderer.invoke('projects:getDetected'),
    getSkills: (projectId: string) =>
      ipcRenderer.invoke('projects:getSkills', projectId),
  },
  tasks: {
    findAll: () => ipcRenderer.invoke('tasks:findAll'),
    findByProjectId: (projectId: string) =>
      ipcRenderer.invoke('tasks:findByProjectId', projectId),
    findAllActive: () => ipcRenderer.invoke('tasks:findAllActive'),
    findAllCompleted: (params: { limit: number; offset: number }) =>
      ipcRenderer.invoke('tasks:findAllCompleted', params),
    findById: (id: string) => ipcRenderer.invoke('tasks:findById', id),
    create: (data: unknown) => ipcRenderer.invoke('tasks:create', data),
    createWithWorktree: (data: unknown) =>
      ipcRenderer.invoke('tasks:createWithWorktree', data),
    update: (id: string, data: unknown) =>
      ipcRenderer.invoke('tasks:update', id, data),
    delete: (id: string, options?: { deleteWorktree?: boolean }) =>
      ipcRenderer.invoke('tasks:delete', id, options),
    markAsRead: (id: string) => ipcRenderer.invoke('tasks:markAsRead', id),
    updateLastReadIndex: (id: string, lastReadIndex: number) =>
      ipcRenderer.invoke('tasks:updateLastReadIndex', id, lastReadIndex),
    setMode: (id: string, mode: string) =>
      ipcRenderer.invoke('tasks:setMode', id, mode),
    setModelPreference: (id: string, modelPreference: string) =>
      ipcRenderer.invoke('tasks:setModelPreference', id, modelPreference),
    toggleUserCompleted: (id: string) =>
      ipcRenderer.invoke('tasks:toggleUserCompleted', id),
    clearUserCompleted: (id: string) =>
      ipcRenderer.invoke('tasks:clearUserCompleted', id),
    addSessionAllowedTool: (
      id: string,
      toolName: string,
      input: Record<string, unknown>,
    ) => ipcRenderer.invoke('tasks:addSessionAllowedTool', id, toolName, input),
    removeSessionAllowedTool: (id: string, toolName: string) =>
      ipcRenderer.invoke('tasks:removeSessionAllowedTool', id, toolName),
    allowForProject: (
      id: string,
      toolName: string,
      input: Record<string, unknown>,
    ) => ipcRenderer.invoke('tasks:allowForProject', id, toolName, input),
    allowForProjectWorktrees: (
      id: string,
      toolName: string,
      input: Record<string, unknown>,
    ) =>
      ipcRenderer.invoke('tasks:allowForProjectWorktrees', id, toolName, input),
    reorder: (projectId: string, activeIds: string[], completedIds: string[]) =>
      ipcRenderer.invoke('tasks:reorder', projectId, activeIds, completedIds),
    getSkills: (taskId: string) =>
      ipcRenderer.invoke('tasks:getSkills', taskId),
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
      pushBranch: (taskId: string) =>
        ipcRenderer.invoke('tasks:worktree:pushBranch', taskId),
    },
    summary: {
      get: (taskId: string) => ipcRenderer.invoke('tasks:summary:get', taskId),
      generate: (taskId: string) =>
        ipcRenderer.invoke('tasks:summary:generate', taskId),
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
    getCurrentUser: (providerId: string) =>
      ipcRenderer.invoke('azureDevOps:getCurrentUser', providerId),
    queryWorkItems: (params: {
      providerId: string;
      projectId: string;
      projectName: string;
      filters: {
        states?: string[];
        workItemTypes?: string[];
        excludeWorkItemTypes?: string[];
        searchText?: string;
      };
    }) => ipcRenderer.invoke('azureDevOps:queryWorkItems', params),
    createPullRequest: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      sourceBranch: string;
      targetBranch: string;
      title: string;
      description: string;
      isDraft: boolean;
    }) => ipcRenderer.invoke('azureDevOps:createPullRequest', params),
    cloneRepository: (params: {
      orgName: string;
      projectName: string;
      repoName: string;
      targetPath: string;
    }) => ipcRenderer.invoke('azureDevOps:cloneRepository', params),
    listPullRequests: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      status?: 'active' | 'completed' | 'abandoned' | 'all';
    }) => ipcRenderer.invoke('azureDevOps:listPullRequests', params),
    getPullRequest: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
    }) => ipcRenderer.invoke('azureDevOps:getPullRequest', params),
    getPullRequestCommits: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
    }) => ipcRenderer.invoke('azureDevOps:getPullRequestCommits', params),
    getPullRequestChanges: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
    }) => ipcRenderer.invoke('azureDevOps:getPullRequestChanges', params),
    getPullRequestFileContent: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
      filePath: string;
      version: 'base' | 'head';
    }) => ipcRenderer.invoke('azureDevOps:getPullRequestFileContent', params),
    getPullRequestThreads: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
    }) => ipcRenderer.invoke('azureDevOps:getPullRequestThreads', params),
    addPullRequestComment: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
      content: string;
    }) => ipcRenderer.invoke('azureDevOps:addPullRequestComment', params),
    addPullRequestFileComment: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
      filePath: string;
      line: number;
      lineEnd?: number;
      content: string;
    }) => ipcRenderer.invoke('azureDevOps:addPullRequestFileComment', params),
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
    getBackendModels: (backend: string) =>
      ipcRenderer.invoke('agent:getBackendModels', backend),
    getMessages: (taskId: string) =>
      ipcRenderer.invoke(AGENT_CHANNELS.GET_MESSAGES, taskId),
    getMessageCount: (taskId: string) =>
      ipcRenderer.invoke(AGENT_CHANNELS.GET_MESSAGE_COUNT, taskId),
    getPendingRequest: (taskId: string) =>
      ipcRenderer.invoke(AGENT_CHANNELS.GET_PENDING_REQUEST, taskId),
    getMessagesWithRawData: (taskId: string) =>
      ipcRenderer.invoke(AGENT_CHANNELS.GET_MESSAGES_WITH_RAW_DATA, taskId),
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
  projectCommands: {
    findByProjectId: (projectId: string) =>
      ipcRenderer.invoke('project:commands:findByProjectId', projectId),
    create: (data: unknown) =>
      ipcRenderer.invoke('project:commands:create', data),
    update: (id: string, data: unknown) =>
      ipcRenderer.invoke('project:commands:update', { id, data }),
    delete: (id: string) => ipcRenderer.invoke('project:commands:delete', id),
  },
  runCommands: {
    start: (projectId: string, workingDir: string) =>
      ipcRenderer.invoke('project:commands:run:start', {
        projectId,
        workingDir,
      }),
    stop: (projectId: string) =>
      ipcRenderer.invoke('project:commands:run:stop', projectId),
    getStatus: (projectId: string) =>
      ipcRenderer.invoke('project:commands:run:getStatus', projectId),
    killPortsForCommand: (projectId: string, commandId: string) =>
      ipcRenderer.invoke('project:commands:run:killPortsForCommand', {
        projectId,
        commandId,
      }),
    getPackageScripts: (projectPath: string) =>
      ipcRenderer.invoke('project:commands:run:getPackageScripts', projectPath),
    onStatusChange: (
      callback: (projectId: string, status: unknown) => void,
    ) => {
      const handler = (_: unknown, projectId: string, status: unknown) =>
        callback(projectId, status);
      ipcRenderer.on('project:commands:run:statusChange', handler);
      return () =>
        ipcRenderer.removeListener(
          'project:commands:run:statusChange',
          handler,
        );
    },
  },
  globalPrompt: {
    onShow: (callback: (prompt: GlobalPrompt) => void) => {
      const handler = (_: unknown, prompt: GlobalPrompt) => callback(prompt);
      ipcRenderer.on('globalPrompt:show', handler);
      return () => ipcRenderer.removeListener('globalPrompt:show', handler);
    },
    respond: (response: GlobalPromptResponse) =>
      ipcRenderer.invoke('globalPrompt:respond', response),
  },
  mcpTemplates: {
    findAll: () => ipcRenderer.invoke('mcpTemplates:findAll'),
    findById: (id: string) => ipcRenderer.invoke('mcpTemplates:findById', id),
    create: (data: unknown) => ipcRenderer.invoke('mcpTemplates:create', data),
    update: (id: string, data: unknown) =>
      ipcRenderer.invoke('mcpTemplates:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('mcpTemplates:delete', id),
    getPresets: () => ipcRenderer.invoke('mcpTemplates:getPresets'),
    getEnabledForProject: (projectId: string) =>
      ipcRenderer.invoke('mcpTemplates:getEnabledForProject', projectId),
  },
  projectMcpOverrides: {
    findByProjectId: (projectId: string) =>
      ipcRenderer.invoke('projectMcpOverrides:findByProjectId', projectId),
    upsert: (data: unknown) =>
      ipcRenderer.invoke('projectMcpOverrides:upsert', data),
    delete: (projectId: string, mcpTemplateId: string) =>
      ipcRenderer.invoke(
        'projectMcpOverrides:delete',
        projectId,
        mcpTemplateId,
      ),
  },
  unifiedMcp: {
    getServers: (projectId: string, projectPath: string) =>
      ipcRenderer.invoke('unifiedMcp:getServers', projectId, projectPath),
    activate: (projectPath: string, name: string, command: string) =>
      ipcRenderer.invoke('unifiedMcp:activate', projectPath, name, command),
    deactivate: (projectPath: string, name: string) =>
      ipcRenderer.invoke('unifiedMcp:deactivate', projectPath, name),
    substituteVariables: (
      commandTemplate: string,
      userVariables: Record<string, string>,
      context: {
        projectPath: string;
        projectName: string;
        branchName: string;
        mainRepoPath: string;
      },
    ) =>
      ipcRenderer.invoke(
        'unifiedMcp:substituteVariables',
        commandTemplate,
        userVariables,
        context,
      ),
  },
  claudeProjects: {
    findNonExistent: () => ipcRenderer.invoke('claudeProjects:findNonExistent'),
    cleanup: (params: { paths: string[]; contentHash: string }) =>
      ipcRenderer.invoke('claudeProjects:cleanup', params),
  },
});
console.log('Preload script loaded');
