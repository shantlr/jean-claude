import { contextBridge, ipcRenderer } from 'electron';

import { AGENT_CHANNELS } from '@shared/agent-types';
import type {
  GlobalPrompt,
  GlobalPromptResponse,
} from '@shared/global-prompt-types';
import type { AppNotification } from '@shared/notification-types';
import type {
  GetYamlParametersIpcParams,
  QueueBuildIpcParams,
} from '@shared/pipeline-types';

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
    deleteWorktreesFolder: (projectId: string) =>
      ipcRenderer.invoke('projects:deleteWorktreesFolder', projectId),
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
    focused: (taskId: string) => ipcRenderer.send('tasks:focused', taskId),
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
    toggleUserCompleted: (id: string) =>
      ipcRenderer.invoke('tasks:toggleUserCompleted', id),
    clearUserCompleted: (id: string) =>
      ipcRenderer.invoke('tasks:clearUserCompleted', id),
    addSessionAllowedTool: (
      id: string,
      toolName: string,
      input: Record<string, unknown>,
    ) => ipcRenderer.invoke('tasks:addSessionAllowedTool', id, toolName, input),
    removeSessionAllowedTool: (
      id: string,
      toolName: string,
      pattern?: string,
    ) =>
      ipcRenderer.invoke(
        'tasks:removeSessionAllowedTool',
        id,
        toolName,
        pattern,
      ),
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
    allowGlobally: (
      id: string,
      toolName: string,
      input: Record<string, unknown>,
    ) => ipcRenderer.invoke('tasks:allowGlobally', id, toolName, input),
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
      generateCommitMessage: (taskId: string, params: { stageAll: boolean }) =>
        ipcRenderer.invoke(
          'tasks:worktree:generateCommitMessage',
          taskId,
          params,
        ),
      checkMergeConflicts: (taskId: string, params: { targetBranch: string }) =>
        ipcRenderer.invoke(
          'tasks:worktree:checkMergeConflicts',
          taskId,
          params,
        ),
      merge: (
        taskId: string,
        params: {
          targetBranch: string;
          squash?: boolean;
          commitMessage?: string;
          commitAllUnstaged?: boolean;
        },
      ) => ipcRenderer.invoke('tasks:worktree:merge', taskId, params),
      getBranches: (taskId: string) =>
        ipcRenderer.invoke('tasks:worktree:getBranches', taskId),
      pushBranch: (taskId: string) =>
        ipcRenderer.invoke('tasks:worktree:pushBranch', taskId),
      delete: (taskId: string, options?: { keepBranch?: boolean }) =>
        ipcRenderer.invoke('tasks:worktree:delete', taskId, options),
    },
    summary: {
      get: (taskId: string) => ipcRenderer.invoke('tasks:summary:get', taskId),
      generate: (taskId: string) =>
        ipcRenderer.invoke('tasks:summary:generate', taskId),
    },
    createPullRequest: (params: {
      taskId: string;
      title: string;
      description: string;
      isDraft: boolean;
      deleteWorktree?: boolean;
    }) => ipcRenderer.invoke('tasks:createPullRequest', params),
    createPrReview: (params: { projectId: string; pullRequestId: number }) =>
      ipcRenderer.invoke('tasks:createPrReview', params),
  },
  steps: {
    findByTaskId: (taskId: string) =>
      ipcRenderer.invoke('steps:findByTaskId', taskId),
    findById: (stepId: string) => ipcRenderer.invoke('steps:findById', stepId),
    create: (data: unknown) => ipcRenderer.invoke('steps:create', data),
    update: (stepId: string, data: unknown) =>
      ipcRenderer.invoke('steps:update', stepId, data),
    resolvePrompt: (stepId: string) =>
      ipcRenderer.invoke('steps:resolvePrompt', stepId),
    setMode: (stepId: string, mode: string) =>
      ipcRenderer.invoke('steps:setMode', stepId, mode),
    submitPrReview: (stepId: string) =>
      ipcRenderer.invoke('steps:submitPrReview', stepId),
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
        iterationPath?: string;
      };
    }) => ipcRenderer.invoke('azureDevOps:queryWorkItems', params),
    getWorkItemById: (params: { providerId: string; workItemId: number }) =>
      ipcRenderer.invoke('azureDevOps:getWorkItemById', params),
    getIterations: (params: { providerId: string; projectName: string }) =>
      ipcRenderer.invoke('azureDevOps:getIterations', params),
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
    addThreadReply: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
      threadId: number;
      content: string;
    }) => ipcRenderer.invoke('azureDevOps:addThreadReply', params),
    updateThreadStatus: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
      threadId: number;
      status: string;
    }) => ipcRenderer.invoke('azureDevOps:updateThreadStatus', params),
    fetchImageAsBase64: (params: { providerId: string; imageUrl: string }) =>
      ipcRenderer.invoke('azureDevOps:fetchImageAsBase64', params),
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
  globalPermissions: {
    get: () => ipcRenderer.invoke('globalPermissions:get'),
    set: (permissions: import('@shared/permission-types').PermissionScope) =>
      ipcRenderer.invoke('globalPermissions:set', permissions),
    addRule: (
      toolName: string,
      input: Record<string, unknown>,
      action?: import('@shared/permission-types').PermissionAction,
    ) =>
      ipcRenderer.invoke('globalPermissions:addRule', toolName, input, action),
    removeRule: (tool: string, pattern?: string) =>
      ipcRenderer.invoke('globalPermissions:removeRule', tool, pattern),
    editRule: (
      tool: string,
      oldPattern: string | undefined,
      newPattern: string | undefined,
      action: import('@shared/permission-types').PermissionAction,
    ) =>
      ipcRenderer.invoke(
        'globalPermissions:editRule',
        tool,
        oldPattern,
        newPattern,
        action,
      ),
  },
  fs: {
    readPackageJson: (dirPath: string) =>
      ipcRenderer.invoke('fs:readPackageJson', dirPath),
    readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
    listDirectory: (dirPath: string, projectRoot: string) =>
      ipcRenderer.invoke('fs:listDirectory', dirPath, projectRoot),
    listProjectFiles: (projectRoot: string) =>
      ipcRenderer.invoke('fs:listProjectFiles', projectRoot),
  },
  shell: {
    openInEditor: (dirPath: string) =>
      ipcRenderer.invoke('shell:openInEditor', dirPath),
    getAvailableEditors: () => ipcRenderer.invoke('shell:getAvailableEditors'),
  },
  agent: {
    start: (stepId: string) => ipcRenderer.invoke(AGENT_CHANNELS.START, stepId),
    stop: (stepId: string) => ipcRenderer.invoke(AGENT_CHANNELS.STOP, stepId),
    respond: (stepId: string, requestId: string, response: unknown) =>
      ipcRenderer.invoke(AGENT_CHANNELS.RESPOND, stepId, requestId, response),
    sendMessage: (stepId: string, parts: unknown[]) =>
      ipcRenderer.invoke(AGENT_CHANNELS.SEND_MESSAGE, stepId, parts),
    queuePrompt: (stepId: string, parts: unknown[]) =>
      ipcRenderer.invoke(AGENT_CHANNELS.QUEUE_PROMPT, stepId, parts),
    cancelQueuedPrompt: (stepId: string, promptId: string) =>
      ipcRenderer.invoke(AGENT_CHANNELS.CANCEL_QUEUED_PROMPT, stepId, promptId),
    getBackendModels: (backend: string) =>
      ipcRenderer.invoke('agent:getBackendModels', backend),
    getMessages: (stepId: string) =>
      ipcRenderer.invoke(AGENT_CHANNELS.GET_MESSAGES, stepId),
    getMessageCount: (stepId: string) =>
      ipcRenderer.invoke(AGENT_CHANNELS.GET_MESSAGE_COUNT, stepId),
    getPendingRequest: (stepId: string) =>
      ipcRenderer.invoke(AGENT_CHANNELS.GET_PENDING_REQUEST, stepId),
    getMessagesWithRawData: (taskId: string, stepId: string) =>
      ipcRenderer.invoke(
        AGENT_CHANNELS.GET_MESSAGES_WITH_RAW_DATA,
        taskId,
        stepId,
      ),
    compactRawMessages: (taskId: string) =>
      ipcRenderer.invoke(AGENT_CHANNELS.COMPACT_RAW_MESSAGES, taskId),
    reprocessNormalization: (taskId: string) =>
      ipcRenderer.invoke(AGENT_CHANNELS.REPROCESS_NORMALIZATION, taskId),
    onEvent: (callback: (event: unknown) => void) => {
      const handler = (_: unknown, event: unknown) => callback(event);
      ipcRenderer.on(AGENT_CHANNELS.EVENT, handler);
      return () => ipcRenderer.removeListener(AGENT_CHANNELS.EVENT, handler);
    },
  },
  debug: {
    getTableNames: () => ipcRenderer.invoke('debug:getTableNames'),
    getDatabaseSize: () => ipcRenderer.invoke('debug:getDatabaseSize'),
    countOldCompletedTasks: () =>
      ipcRenderer.invoke('debug:countOldCompletedTasks'),
    deleteOldCompletedTasks: () =>
      ipcRenderer.invoke('debug:deleteOldCompletedTasks'),
    queryTable: (params: {
      table: string;
      search?: string;
      limit: number;
      offset: number;
    }) => ipcRenderer.invoke('debug:queryTable', params),
  },
  usage: {
    getAll: (backends: string[]) =>
      ipcRenderer.invoke('agent:usage:getAll', backends),
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
    startCommand: (params: {
      taskId: string;
      projectId: string;
      workingDir: string;
      runCommandId: string;
    }) =>
      ipcRenderer.invoke('project:commands:run:startCommand', {
        taskId: params.taskId,
        projectId: params.projectId,
        workingDir: params.workingDir,
        runCommandId: params.runCommandId,
      }),
    stopCommand: (params: { taskId: string; runCommandId: string }) =>
      ipcRenderer.invoke('project:commands:run:stopCommand', params),
    getStatus: (taskId: string) =>
      ipcRenderer.invoke('project:commands:run:getStatus', taskId),
    getTaskIdsWithRunningCommands: () =>
      ipcRenderer.invoke(
        'project:commands:run:getTaskIdsWithRunningCommands',
      ) as Promise<string[]>,
    killPortsForCommand: (projectId: string, commandId: string) =>
      ipcRenderer.invoke('project:commands:run:killPortsForCommand', {
        projectId,
        commandId,
      }),
    getPackageScripts: (projectPath: string) =>
      ipcRenderer.invoke('project:commands:run:getPackageScripts', projectPath),
    onStatusChange: (callback: (taskId: string, status: unknown) => void) => {
      const handler = (_: unknown, taskId: string, status: unknown) =>
        callback(taskId, status);
      ipcRenderer.on('project:commands:run:statusChange', handler);
      return () =>
        ipcRenderer.removeListener(
          'project:commands:run:statusChange',
          handler,
        );
    },
    onLog: (
      callback: (
        taskId: string,
        runCommandId: string,
        stream: 'stdout' | 'stderr',
        line: string,
      ) => void,
    ) => {
      const handler = (
        _: unknown,
        taskId: string,
        runCommandId: string,
        stream: 'stdout' | 'stderr',
        line: string,
      ) => callback(taskId, runCommandId, stream, line);
      ipcRenderer.on('project:commands:run:log', handler);
      return () =>
        ipcRenderer.removeListener('project:commands:run:log', handler);
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
  completion: {
    complete: (params: {
      prompt: string;
      suffix?: string;
      projectId?: string;
      contextBeforePrompt?: string;
    }) => ipcRenderer.invoke('completion:complete', params),
    test: () => ipcRenderer.invoke('completion:test'),
    saveSettings: (params: {
      enabled: boolean;
      apiKey: string;
      model: string;
      serverUrl: string;
    }) => ipcRenderer.invoke('completion:saveSettings', params),
    generateContext: (params: { projectId: string }) =>
      ipcRenderer.invoke('completion:generateContext', params),
    getDailyUsage: () => ipcRenderer.invoke('completion:getDailyUsage'),
  },
  projectTodos: {
    list: (projectId: string) =>
      ipcRenderer.invoke('project-todos:list', projectId),
    count: (projectId: string) =>
      ipcRenderer.invoke('project-todos:count', projectId),
    create: (data: unknown) => ipcRenderer.invoke('project-todos:create', data),
    update: (id: string, data: unknown) =>
      ipcRenderer.invoke('project-todos:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('project-todos:delete', id),
    reorder: (projectId: string, orderedIds: string[]) =>
      ipcRenderer.invoke('project-todos:reorder', projectId, orderedIds),
  },
  skillManagement: {
    getForStep: (params: { taskId: string; stepId?: string }) =>
      ipcRenderer.invoke('skills:getForStep', params),
    getAll: (backendType: string, projectPath?: string) =>
      ipcRenderer.invoke('skills:getAll', backendType, projectPath),
    getAllUnified: (projectPath?: string) =>
      ipcRenderer.invoke('skills:getAllUnified', projectPath),
    getContent: (skillPath: string) =>
      ipcRenderer.invoke('skills:getContent', skillPath),
    create: (params: {
      enabledBackends: string[];
      scope: string;
      projectPath?: string;
      name: string;
      description: string;
      content: string;
    }) => ipcRenderer.invoke('skills:create', params),
    update: (params: {
      skillPath: string;
      backendType: string;
      name?: string;
      description?: string;
      content?: string;
    }) => ipcRenderer.invoke('skills:update', params),
    delete: (skillPath: string, backendType: string) =>
      ipcRenderer.invoke('skills:delete', skillPath, backendType),
    disable: (skillPath: string, backendType: string) =>
      ipcRenderer.invoke('skills:disable', skillPath, backendType),
    enable: (skillPath: string, backendType: string) =>
      ipcRenderer.invoke('skills:enable', skillPath, backendType),
    migrationPreview: () => ipcRenderer.invoke('skills:migrationPreview'),
    migrationExecute: (params: { itemIds: string[] }) =>
      ipcRenderer.invoke('skills:migrationExecute', params),
    registrySearch: (query: string) =>
      ipcRenderer.invoke('skills:registrySearch', query),
    registryFetchContent: (source: string, skillId: string) =>
      ipcRenderer.invoke('skills:registryFetchContent', source, skillId),
    registryInstall: (params: {
      source: string;
      skillId: string;
      enabledBackends: string[];
    }) => ipcRenderer.invoke('skills:registryInstall', params),
    createWithAgent: (params: {
      prompt: string;
      enabledBackends: string[];
      mode: 'create' | 'improve';
      sourceSkillPath?: string;
      interactionMode?: string | null;
      modelPreference?: string | null;
      agentBackend?: string | null;
    }) => ipcRenderer.invoke('skills:createWithAgent', params),
    publishFromWorkspace: (params: {
      stepId: string;
      workspacePath: string;
      enabledBackends: string[];
      mode: 'create' | 'improve';
      sourceSkillPath?: string;
    }) => ipcRenderer.invoke('skills:publishFromWorkspace', params),
  },
  prSnapshots: {
    record: (params: {
      projectId: string;
      pullRequestId: number;
      providerId: string;
      repoProjectId: string;
      repoId: string;
    }) => ipcRenderer.invoke('pr-snapshots:record', params),
  },
  notifications: {
    list: () => ipcRenderer.invoke('notifications:list'),
    markRead: (id: string | 'all') =>
      ipcRenderer.invoke('notifications:markRead', id),
    delete: (id: string) => ipcRenderer.invoke('notifications:delete', id),
    onNew: (callback: (notification: AppNotification) => void) => {
      const handler = (_: unknown, notification: AppNotification) =>
        callback(notification);
      ipcRenderer.on('notifications:new', handler);
      return () => ipcRenderer.removeListener('notifications:new', handler);
    },
  },
  trackedPipelines: {
    list: (projectId: string) =>
      ipcRenderer.invoke('tracked-pipelines:list', projectId),
    listAll: () => ipcRenderer.invoke('tracked-pipelines:listAll'),
    toggle: (id: string, enabled: boolean) =>
      ipcRenderer.invoke('tracked-pipelines:toggle', id, enabled),
    toggleVisible: (id: string, visible: boolean) =>
      ipcRenderer.invoke('tracked-pipelines:toggleVisible', id, visible),
    discover: (projectId: string) =>
      ipcRenderer.invoke('tracked-pipelines:discover', projectId),
  },
  pipelines: {
    listRuns: (params: {
      providerId: string;
      azureProjectId: string;
      definitionId: number;
      kind: 'build' | 'release';
    }) => ipcRenderer.invoke('pipelines:listRuns', params),
    getBuild: (params: {
      providerId: string;
      azureProjectId: string;
      buildId: number;
    }) => ipcRenderer.invoke('pipelines:getBuild', params),
    getBuildTimeline: (params: {
      providerId: string;
      azureProjectId: string;
      buildId: number;
    }) => ipcRenderer.invoke('pipelines:getBuildTimeline', params),
    getBuildLog: (params: {
      providerId: string;
      azureProjectId: string;
      buildId: number;
      logId: number;
    }) => ipcRenderer.invoke('pipelines:getBuildLog', params),
    getRelease: (params: {
      providerId: string;
      azureProjectId: string;
      releaseId: number;
    }) => ipcRenderer.invoke('pipelines:getRelease', params),
    listBranches: (params: {
      providerId: string;
      azureProjectId: string;
      repoId: string;
    }) => ipcRenderer.invoke('pipelines:listBranches', params),
    getDefinitionParams: (params: {
      providerId: string;
      azureProjectId: string;
      definitionId: number;
    }) => ipcRenderer.invoke('pipelines:getDefinitionParams', params),
    getYamlParameters: (params: GetYamlParametersIpcParams) =>
      ipcRenderer.invoke('pipelines:getYamlParameters', params),
    queueBuild: (params: QueueBuildIpcParams) =>
      ipcRenderer.invoke('pipelines:queueBuild', params),
    createRelease: (params: {
      providerId: string;
      azureProjectId: string;
      definitionId: number;
      description?: string;
    }) => ipcRenderer.invoke('pipelines:createRelease', params),
    cancelBuild: (params: {
      providerId: string;
      azureProjectId: string;
      buildId: number;
    }) => ipcRenderer.invoke('pipelines:cancelBuild', params),
  },
  feed: {
    getItems: () => ipcRenderer.invoke('feed:getItems'),
    createNote: (params: { content: string }) =>
      ipcRenderer.invoke('feed:createNote', params),
    updateNote: (params: {
      id: string;
      content?: string;
      completedAt?: string | null;
    }) => ipcRenderer.invoke('feed:updateNote', params),
    deleteNote: (params: { id: string }) =>
      ipcRenderer.invoke('feed:deleteNote', params),
  },
  system: {
    getMemoryUsage: () => ipcRenderer.invoke('system:getMemoryUsage'),
  },
});
console.log('Preload script loaded');
