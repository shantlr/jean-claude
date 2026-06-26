import { contextBridge, ipcRenderer, webUtils } from 'electron';

import type {
  AddGitHubSourceParams,
  InstallSourceItemsParams,
  UpdateSourceInstallParams,
} from '@shared/source-management-types';
import type {
  AppNotification,
  TaskNotificationTarget,
} from '@shared/notification-types';
import type { CacheEvent, CacheSubscriptionUpdate } from '@shared/cache-events';
import type {
  GetYamlParametersIpcParams,
  QueueBuildIpcParams,
} from '@shared/pipeline-types';
import type {
  GlobalPrompt,
  GlobalPromptResponse,
} from '@shared/global-prompt-types';
import type {
  NewWorkActivityEvent,
  WorkActivityWeekParams,
} from '@shared/work-activity-types';
import { AGENT_CHANNELS } from '@shared/agent-types';
import type { AiUsageDashboardParams } from '@shared/ai-usage-types';
import type { CreateWorkItemVerificationNoteParams } from '@shared/work-item-verification-note-types';
import type { DebugLogEntry } from '@shared/debug-log-types';



const devBadgeLabel = process.env.JC_DEV_BADGE_LABEL?.trim() || undefined;

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
  cache: {
    setSubscriptions: (update: CacheSubscriptionUpdate) =>
      ipcRenderer.invoke('cache:setSubscriptions', update),
    onEvent: (callback: (event: CacheEvent) => void) => {
      const handler = (_: unknown, event: CacheEvent) => callback(event);
      ipcRenderer.on('cache:event', handler);
      return () => ipcRenderer.removeListener('cache:event', handler);
    },
  },
  projects: {
    findAll: () => ipcRenderer.invoke('projects:findAll'),
    findById: (id: string) => ipcRenderer.invoke('projects:findById', id),
    create: (data: unknown) => ipcRenderer.invoke('projects:create', data),
    update: (id: string, data: unknown) =>
      ipcRenderer.invoke('projects:update', id, data),
    uploadLogo: (projectId: string, sourcePath: string) =>
      ipcRenderer.invoke('projects:uploadLogo', projectId, sourcePath),
    generateLogo: (projectId: string, customPrompt?: string) =>
      ipcRenderer.invoke('projects:generateLogo', projectId, customPrompt),
    listGeneratedLogos: (projectId: string) =>
      ipcRenderer.invoke('projects:listGeneratedLogos', projectId),
    selectGeneratedLogo: (projectId: string, logoId: string) =>
      ipcRenderer.invoke('projects:selectGeneratedLogo', projectId, logoId),
    deleteGeneratedLogo: (projectId: string, logoId: string) =>
      ipcRenderer.invoke('projects:deleteGeneratedLogo', projectId, logoId),
    regenerateSummary: (projectId: string) =>
      ipcRenderer.invoke('projects:regenerateSummary', projectId),
    getFeatureMap: (projectId: string) =>
      ipcRenderer.invoke('projects:getFeatureMap', projectId),
    createFeatureMapTask: (projectId: string) =>
      ipcRenderer.invoke('projects:createFeatureMapTask', projectId),
    getFeatureMapDraftDiff: (stepId: string) =>
      ipcRenderer.invoke('projects:getFeatureMapDraftDiff', stepId),
    saveFeatureMapFromTask: (stepId: string) =>
      ipcRenderer.invoke('projects:saveFeatureMapFromTask', stepId),
    removeLogo: (projectId: string) =>
      ipcRenderer.invoke('projects:removeLogo', projectId),
    delete: (id: string) => ipcRenderer.invoke('projects:delete', id),
    deleteWorktreesFolder: (projectId: string) =>
      ipcRenderer.invoke('projects:deleteWorktreesFolder', projectId),
    reorder: (orderedIds: string[]) =>
      ipcRenderer.invoke('projects:reorder', orderedIds),
    getBranches: (projectId: string) =>
      ipcRenderer.invoke('projects:getBranches', projectId),
    getCurrentBranch: (projectId: string) =>
      ipcRenderer.invoke('projects:getCurrentBranch', projectId),
    isGitRepository: (projectId: string) =>
      ipcRenderer.invoke('projects:isGitRepository', projectId),
    getCommitIgnore: (projectId: string) =>
      ipcRenderer.invoke('projects:getCommitIgnore', projectId),
    updateCommitIgnore: (projectId: string, content: string) =>
      ipcRenderer.invoke('projects:updateCommitIgnore', projectId, content),
    getDetected: () => ipcRenderer.invoke('projects:getDetected'),
    detectLogos: (projectPath: string) =>
      ipcRenderer.invoke('projects:detectLogos', projectPath),
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
    updatePendingMessage: (id: string, pendingMessage: string | null) =>
      ipcRenderer.invoke('tasks:updatePendingMessage', id, pendingMessage),
    delete: (id: string, options?: { deleteWorktree?: boolean }) =>
      ipcRenderer.invoke('tasks:delete', id, options),
    toggleUserCompleted: (id: string) =>
      ipcRenderer.invoke('tasks:toggleUserCompleted', id),
    complete: (id: string, options: { cleanupWorktree?: boolean }) =>
      ipcRenderer.invoke('tasks:complete', id, options),
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
      getCommits: (taskId: string) =>
        ipcRenderer.invoke('tasks:worktree:getCommits', taskId),
      getCommitDiff: (taskId: string, commitHash: string) =>
        ipcRenderer.invoke('tasks:worktree:getCommitDiff', taskId, commitHash),
      getCommitFileContent: (
        taskId: string,
        commitHash: string,
        filePath: string,
        status: 'added' | 'modified' | 'deleted',
      ) =>
        ipcRenderer.invoke(
          'tasks:worktree:getCommitFileContent',
          taskId,
          commitHash,
          filePath,
          status,
        ),
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
        params: { message?: string; stageAll: boolean },
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
      pushBranch: (taskId: string, params?: { commitUnstaged?: boolean }) =>
        ipcRenderer.invoke('tasks:worktree:pushBranch', taskId, params),
      delete: (taskId: string, options?: { keepBranch?: boolean }) =>
        ipcRenderer.invoke('tasks:worktree:delete', taskId, options),
      cleanupAfterCompletion: (
        taskId: string,
        params: {
          worktreePath: string;
          branchName: string;
        },
      ) =>
        ipcRenderer.invoke(
          'tasks:worktree:cleanupAfterCompletion',
          taskId,
          params,
        ),
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
    createPrReview: (params: {
      projectId: string;
      pullRequestId: number;
      agentBackend?: string | null;
      modelPreference?: string | null;
      thinkingEffort?: string | null;
    }) => ipcRenderer.invoke('tasks:createPrReview', params),
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
    getPullRequestStatuses: (params: {
      providerId: string;
      linkedPrs: Array<{ prId: number; projectId: string; repoId: string }>;
    }) => ipcRenderer.invoke('azureDevOps:getPullRequestStatuses', params),
    getWorkItemStates: (params: {
      providerId: string;
      projectName: string;
      workItemType: string;
    }) => ipcRenderer.invoke('azureDevOps:getWorkItemStates', params),
    updateWorkItemState: (params: {
      providerId: string;
      workItemId: number;
      state: string;
    }) => ipcRenderer.invoke('azureDevOps:updateWorkItemState', params),
    getRelatedTestCases: (params: {
      providerId: string;
      projectName: string;
      workItemId: number;
    }) => ipcRenderer.invoke('azureDevOps:getRelatedTestCases', params),
    getWorkItemComments: (params: {
      providerId: string;
      projectName: string;
      workItemId: number;
    }) => ipcRenderer.invoke('azureDevOps:getWorkItemComments', params),
    getWorkItemHistory: (params: {
      providerId: string;
      projectName: string;
      workItemId: number;
    }) => ipcRenderer.invoke('azureDevOps:getWorkItemHistory', params),
    addWorkItemComment: (params: {
      providerId: string;
      projectName: string;
      workItemId: number;
      text: string;
    }) => ipcRenderer.invoke('azureDevOps:addWorkItemComment', params),
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
    updatePullRequestTitle: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
      title: string;
    }) => ipcRenderer.invoke('azureDevOps:updatePullRequestTitle', params),
    updatePullRequestDescription: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
      description: string;
    }) =>
      ipcRenderer.invoke('azureDevOps:updatePullRequestDescription', params),
    uploadPullRequestAttachment: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
      fileName: string;
      mimeType: string;
      dataBase64: string;
    }) => ipcRenderer.invoke('azureDevOps:uploadPullRequestAttachment', params),
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
    getCommitChanges: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      commitId: string;
    }) => ipcRenderer.invoke('azureDevOps:getCommitChanges', params),
    getFileContentAtCommit: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      commitId: string;
      filePath: string;
      version: 'current' | 'parent';
    }) => ipcRenderer.invoke('azureDevOps:getFileContentAtCommit', params),
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
    getPullRequestWorkItems: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
    }) => ipcRenderer.invoke('azureDevOps:getPullRequestWorkItems', params),
    linkWorkItemToPr: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
      workItemId: number;
    }) => ipcRenderer.invoke('azureDevOps:linkWorkItemToPr', params),
    unlinkWorkItemFromPr: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
      workItemId: number;
    }) => ipcRenderer.invoke('azureDevOps:unlinkWorkItemFromPr', params),
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
    updateThreadComment: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
      threadId: number;
      commentId: number;
      content: string;
    }) => ipcRenderer.invoke('azureDevOps:updateThreadComment', params),
    deleteThreadComment: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
      threadId: number;
      commentId: number;
    }) => ipcRenderer.invoke('azureDevOps:deleteThreadComment', params),
    setThreadCommentLike: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
      threadId: number;
      commentId: number;
      liked: boolean;
    }) => ipcRenderer.invoke('azureDevOps:setThreadCommentLike', params),
    updateThreadStatus: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
      threadId: number;
      status: string;
    }) => ipcRenderer.invoke('azureDevOps:updateThreadStatus', params),
    searchIdentities: (params: { providerId: string; query: string }) =>
      ipcRenderer.invoke('azureDevOps:searchIdentities', params),
    fetchImageAsBase64: (params: { providerId: string; imageUrl: string }) =>
      ipcRenderer.invoke('azureDevOps:fetchImageAsBase64', params),
    getPullRequestPolicyEvaluations: (params: {
      providerId: string;
      projectId: string;
      pullRequestId: number;
    }) =>
      ipcRenderer.invoke('azureDevOps:getPullRequestPolicyEvaluations', params),
    requeuePolicyEvaluation: (params: {
      providerId: string;
      projectId: string;
      evaluationId: string;
    }) => ipcRenderer.invoke('azureDevOps:requeuePolicyEvaluation', params),
    votePullRequest: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
      reviewerId: string;
      vote: number;
    }) => ipcRenderer.invoke('azureDevOps:votePullRequest', params),
    setPullRequestAutoComplete: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
      enabled: boolean;
      autoCompleteSetById?: string;
      completionOptions?: {
        mergeStrategy: string;
        deleteSourceBranch: boolean;
        transitionWorkItems: boolean;
        mergeCommitMessage?: string;
        autoCompleteIgnoreConfigIds?: number[];
      };
    }) => ipcRenderer.invoke('azureDevOps:setPullRequestAutoComplete', params),
    publishPullRequest: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
    }) => ipcRenderer.invoke('azureDevOps:publishPullRequest', params),
  },
  dialog: {
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
    openImageFile: () => ipcRenderer.invoke('dialog:openImageFile'),
    openFiles: () => ipcRenderer.invoke('dialog:openFiles'),
    openApplication: () => ipcRenderer.invoke('dialog:openApplication'),
  },
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: unknown) =>
      ipcRenderer.invoke('settings:set', key, value),
  },
  backendConfig: {
    getUserConfig: (
      backend: import('@shared/agent-backend-types').AgentBackendType,
    ) => ipcRenderer.invoke('backendConfig:getUserConfig', backend),
    setUserConfig: (
      backend: import('@shared/agent-backend-types').AgentBackendType,
      content: string,
    ) => ipcRenderer.invoke('backendConfig:setUserConfig', backend, content),
  },
  projectPromptPreface: {
    get: (projectPath: string) =>
      ipcRenderer.invoke('projectPromptPreface:get', projectPath),
    set: (
      projectPath: string,
      value: import('@shared/prompt-preface-types').ProjectPromptPrefaceSetting,
    ) => ipcRenderer.invoke('projectPromptPreface:set', projectPath, value),
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
  projectPermissions: {
    get: (projectPath: string) =>
      ipcRenderer.invoke('projectPermissions:get', projectPath),
    addRule: (
      projectPath: string,
      toolName: string,
      input: Record<string, unknown>,
      action?: import('@shared/permission-types').PermissionAction,
    ) =>
      ipcRenderer.invoke(
        'projectPermissions:addRule',
        projectPath,
        toolName,
        input,
        action,
      ),
    removeRule: (projectPath: string, tool: string, pattern?: string) =>
      ipcRenderer.invoke(
        'projectPermissions:removeRule',
        projectPath,
        tool,
        pattern,
      ),
    editRule: (
      projectPath: string,
      tool: string,
      oldPattern: string | undefined,
      newPattern: string | undefined,
      action: import('@shared/permission-types').PermissionAction,
    ) =>
      ipcRenderer.invoke(
        'projectPermissions:editRule',
        projectPath,
        tool,
        oldPattern,
        newPattern,
        action,
      ),
  },
  worktreeConfig: {
    getCopyEntries: (projectPath: string) =>
      ipcRenderer.invoke('worktreeConfig:get', projectPath),
    setCopyEntries: (
      projectPath: string,
      entries: import('@shared/permission-types').WorktreeFileCopyEntry[],
    ) =>
      ipcRenderer.invoke('worktreeConfig:setCopyEntries', projectPath, entries),
  },
  fs: {
    readPackageJson: (dirPath: string) =>
      ipcRenderer.invoke('fs:readPackageJson', dirPath),
    readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
    getFileSize: (filePath: string) =>
      ipcRenderer.invoke('fs:getFileSize', filePath),
    readImageAsDataUrl: (filePath: string) =>
      ipcRenderer.invoke('fs:readImageAsDataUrl', filePath),
    getImageUrl: (filePath: string) =>
      ipcRenderer.invoke('fs:getImageUrl', filePath),
    listDirectory: (dirPath: string, projectRoot: string) =>
      ipcRenderer.invoke('fs:listDirectory', dirPath, projectRoot),
    listProjectFiles: (projectRoot: string) =>
      ipcRenderer.invoke('fs:listProjectFiles', projectRoot),
    writeAttachmentFile: (
      projectPath: string,
      filename: string,
      content: string,
      encoding?: 'utf-8' | 'base64',
    ) =>
      ipcRenderer.invoke(
        'fs:writeAttachmentFile',
        projectPath,
        filename,
        content,
        encoding,
      ),
    copyAttachmentFile: (projectPath: string, sourcePath: string) =>
      ipcRenderer.invoke('fs:copyAttachmentFile', projectPath, sourcePath),
    getPathForFile: (file: File) => webUtils.getPathForFile(file) || null,
  },
  shell: {
    openInEditor: (dirPath: string, folderContext?: string) =>
      ipcRenderer.invoke('shell:openInEditor', dirPath, folderContext),
    openTeamsJoinUrl: (url: string) =>
      ipcRenderer.invoke('shell:openTeamsJoinUrl', url),
    getAvailableEditors: () => ipcRenderer.invoke('shell:getAvailableEditors'),
    setupGlobalGitignore: () =>
      ipcRenderer.invoke('shell:setupGlobalGitignore') as Promise<{
        success: boolean;
        path: string;
      }>,
  },
  calendar: {
    listUpcomingMeetings: () =>
      ipcRenderer.invoke('calendar:listUpcomingMeetings') as Promise<
        import('@shared/calendar-types').UpcomingMeeting[]
      >,
    listTodayMeetings: () =>
      ipcRenderer.invoke('calendar:listTodayMeetings') as Promise<
        import('@shared/calendar-types').UpcomingMeeting[]
      >,
    revealMeeting: (
      meeting: import('@shared/calendar-types').UpcomingMeeting,
    ) => ipcRenderer.invoke('calendar:revealMeeting', meeting) as Promise<void>,
    suppressMeetingStartPopup: (
      meeting: import('@shared/calendar-types').UpcomingMeeting,
    ) =>
      ipcRenderer.invoke(
        'calendar:suppressMeetingStartPopup',
        meeting,
      ) as Promise<void>,
    setIgnoredMeetingIds: (ids: string[]) =>
      ipcRenderer.invoke('calendar:setIgnoredMeetingIds', ids) as Promise<void>,
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
    updateQueuedPrompt: (stepId: string, promptId: string, content: string) =>
      ipcRenderer.invoke(
        AGENT_CHANNELS.UPDATE_QUEUED_PROMPT,
        stepId,
        promptId,
        content,
      ),
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
    getResourceSnapshots: () =>
      ipcRenderer.invoke('agent:resources:getSnapshots'),
    getResourceHistory: () => ipcRenderer.invoke('agent:resources:getHistory'),
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
    getHistory: (params: {
      provider: string;
      limitKey: string;
      since: string;
      until?: string;
    }) => ipcRenderer.invoke('agent:usage:getHistory', params),
    getDashboard: (params: AiUsageDashboardParams) =>
      ipcRenderer.invoke('agent:usage:getDashboard', params),
    getTaskUsage: (taskId: string) =>
      ipcRenderer.invoke('agent:usage:getTaskUsage', taskId),
  },
  workActivity: {
    record: (event: NewWorkActivityEvent) =>
      ipcRenderer.invoke('workActivity:record', event),
    getRange: (params: WorkActivityWeekParams) =>
      ipcRenderer.invoke('workActivity:getRange', params),
    deleteBefore: (before: string) =>
      ipcRenderer.invoke('workActivity:deleteBefore', before),
    deleteAll: () => ipcRenderer.invoke('workActivity:deleteAll'),
  },
  rateLimitSwap: {
    getStatus: () =>
      ipcRenderer.invoke('rate-limit-swap:status') as Promise<{
        active: boolean;
        swaps: Array<{ from: string; to: string }>;
      }>,
    resolve: (
      backend: import('@shared/agent-backend-types').AgentBackendType,
    ) =>
      ipcRenderer.invoke('rate-limit-swap:resolve', backend) as Promise<{
        backend: import('@shared/agent-backend-types').AgentBackendType;
        model?: string;
        thinkingEffort?: import('@shared/types').ThinkingEffort;
        swapped: boolean;
      }>,
  },
  usageDisplay: {
    saveSettings: (value: import('@shared/types').UsageDisplaySetting) =>
      ipcRenderer.invoke('usageDisplay:saveSettings', value),
  },
  copilotAuth: {
    requestDeviceCode: () =>
      ipcRenderer.invoke('copilotAuth:requestDeviceCode'),
    completeDeviceLogin: (deviceCode: unknown) =>
      ipcRenderer.invoke('copilotAuth:completeDeviceLogin', deviceCode),
  },
  projectCommands: {
    findByProjectId: (projectId: string) =>
      ipcRenderer.invoke('project:commands:findByProjectId', projectId),
    create: (data: unknown) =>
      ipcRenderer.invoke('project:commands:create', data),
    update: (id: string, data: unknown) =>
      ipcRenderer.invoke('project:commands:update', { id, data }),
    delete: (id: string) => ipcRenderer.invoke('project:commands:delete', id),
    reorder: (projectId: string, commandIds: string[]) =>
      ipcRenderer.invoke('project:commands:reorder', { projectId, commandIds }),
  },
  projectCommandGroups: {
    findByProjectId: (projectId: string) =>
      ipcRenderer.invoke('project:commandGroups:findByProjectId', projectId),
    create: (data: unknown) =>
      ipcRenderer.invoke('project:commandGroups:create', data),
    update: (id: string, data: unknown) =>
      ipcRenderer.invoke('project:commandGroups:update', { id, data }),
    delete: (id: string) =>
      ipcRenderer.invoke('project:commandGroups:delete', id),
    reorder: (projectId: string, groupIds: string[]) =>
      ipcRenderer.invoke('project:commandGroups:reorder', {
        projectId,
        groupIds,
      }),
  },
  projectRunConfig: {
    reorder: (projectId: string, items: unknown[]) =>
      ipcRenderer.invoke('project:runConfig:reorder', { projectId, items }),
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
    startGroup: (params: {
      taskId: string;
      projectId: string;
      workingDir: string;
      runCommandIds: string[];
    }) =>
      ipcRenderer.invoke('project:commands:run:startGroup', {
        taskId: params.taskId,
        projectId: params.projectId,
        workingDir: params.workingDir,
        runCommandIds: params.runCommandIds,
      }),
    stopCommand: (params: { taskId: string; runCommandId: string }) =>
      ipcRenderer.invoke('project:commands:run:stopCommand', params),
    sendInput: (params: {
      taskId: string;
      runCommandId: string;
      input: string;
    }) => ipcRenderer.invoke('project:commands:run:sendInput', params),
    resetLogs: (params: {
      taskId: string;
      runCommandId: string;
      generation: number;
    }) => ipcRenderer.invoke('project:commands:run:resetLogs', params),
    sendSignal: (params: {
      taskId: string;
      runCommandId: string;
      signal: 'SIGINT' | 'SIGTERM';
    }) => ipcRenderer.invoke('project:commands:run:sendSignal', params),
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
        text: string,
        generation: number,
      ) => void,
    ) => {
      const handler = (
        _: unknown,
        taskId: string,
        runCommandId: string,
        stream: 'stdout' | 'stderr',
        text: string,
        generation: number,
      ) => callback(taskId, runCommandId, stream, text, generation);
      ipcRenderer.on('project:commands:run:log', handler);
      return () =>
        ipcRenderer.removeListener('project:commands:run:log', handler);
    },
    onLogsReset: (
      callback: (
        taskId: string,
        runCommandId: string,
        generation: number,
      ) => void,
    ) => {
      const handler = (
        _: unknown,
        taskId: string,
        runCommandId: string,
        generation: number,
      ) => callback(taskId, runCommandId, generation);
      ipcRenderer.on('project:commands:run:logsReset', handler);
      return () =>
        ipcRenderer.removeListener('project:commands:run:logsReset', handler);
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
  aiGeneration: {
    saveSettings: (params: {
      openAiApiKey: string;
      openAiImageGenerationEnabled: boolean;
      openAiImageModel: string;
      openAiLogoPromptContext: string;
    }) => ipcRenderer.invoke('aiGeneration:saveSettings', params),
    saveBaseImage: (params: { sourcePath: string }) =>
      ipcRenderer.invoke('aiGeneration:saveBaseImage', params),
    listBaseImages: () => ipcRenderer.invoke('aiGeneration:listBaseImages'),
    setBaseImageSelection: (params: {
      mode: 'builtin' | 'custom';
      builtinId?: string;
    }) => ipcRenderer.invoke('aiGeneration:setBaseImageSelection', params),
    removeBaseImage: () => ipcRenderer.invoke('aiGeneration:removeBaseImage'),
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
  agentManagement: {
    getAll: () => ipcRenderer.invoke('agents:getAll'),
    getContent: (agentPath: string) =>
      ipcRenderer.invoke('agents:getContent', agentPath),
    create: (params: {
      enabledBackends: string[];
      name: string;
      description: string;
      content: string;
    }) => ipcRenderer.invoke('agents:create', params),
    update: (params: { agentPath: string; content: string }) =>
      ipcRenderer.invoke('agents:update', params),
    delete: (agentPath: string) =>
      ipcRenderer.invoke('agents:delete', agentPath),
    disable: (agentPath: string, backendType: string) =>
      ipcRenderer.invoke('agents:disable', agentPath, backendType),
    enable: (agentPath: string, backendType: string) =>
      ipcRenderer.invoke('agents:enable', agentPath, backendType),
    migrationPreview: () => ipcRenderer.invoke('agents:migrationPreview'),
    migrationExecute: (params: { itemIds: string[] }) =>
      ipcRenderer.invoke('agents:migrationExecute', params),
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
  sourceManagement: {
    list: () => ipcRenderer.invoke('sources:list'),
    addGithub: (params: AddGitHubSourceParams) =>
      ipcRenderer.invoke('sources:addGithub', params),
    refresh: (sourceId: string) =>
      ipcRenderer.invoke('sources:refresh', sourceId),
    installItems: (params: InstallSourceItemsParams) =>
      ipcRenderer.invoke('sources:installItems', params),
    updateInstall: (params: UpdateSourceInstallParams) =>
      ipcRenderer.invoke('sources:updateInstall', params),
    remove: (sourceId: string) =>
      ipcRenderer.invoke('sources:remove', sourceId),
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
    getDesktopStatus: async () => ({
      ...(await ipcRenderer.invoke('notifications:getDesktopStatus')),
      permission:
        typeof Notification === 'undefined'
          ? 'unknown'
          : Notification.permission,
    }),
    openSystemSettings: () =>
      ipcRenderer.invoke('notifications:openSystemSettings'),
    markRead: (id: string | 'all') =>
      ipcRenderer.invoke('notifications:markRead', id),
    delete: (id: string) => ipcRenderer.invoke('notifications:delete', id),
    onNew: (callback: (notification: AppNotification) => void) => {
      const handler = (_: unknown, notification: AppNotification) =>
        callback(notification);
      ipcRenderer.on('notifications:new', handler);
      return () => ipcRenderer.removeListener('notifications:new', handler);
    },
    onOpenTask: (callback: (target: TaskNotificationTarget) => void) => {
      const handler = (_: unknown, target: TaskNotificationTarget) =>
        callback(target);
      ipcRenderer.on('notifications:open-task', handler);
      return () =>
        ipcRenderer.removeListener('notifications:open-task', handler);
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
    reorder: (projectId: string, orderedIds: string[]) =>
      ipcRenderer.invoke('tracked-pipelines:reorder', projectId, orderedIds),
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
    getTaskItems: () => ipcRenderer.invoke('feed:getTaskItems'),
    getPullRequestItems: () => ipcRenderer.invoke('feed:getPullRequestItems'),
    getNoteItems: () => ipcRenderer.invoke('feed:getNoteItems'),
    getWorkItemItems: () => ipcRenderer.invoke('feed:getWorkItemItems'),
    createNote: (params: { content: string }) =>
      ipcRenderer.invoke('feed:createNote', params),
    createWorkItemVerificationNote: (
      params: CreateWorkItemVerificationNoteParams,
    ) => ipcRenderer.invoke('feed:createWorkItemVerificationNote', params),
    updateNote: (params: {
      id: string;
      content?: string;
      completedAt?: string | null;
    }) => ipcRenderer.invoke('feed:updateNote', params),
    deleteNote: (params: { id: string }) =>
      ipcRenderer.invoke('feed:deleteNote', params),
  },
  app: {
    isDevMode: !!process.env.ELECTRON_RENDERER_URL,
    devBadgeLabel,
    getIsPreviewMode: () =>
      ipcRenderer.invoke('app:getIsPreviewMode') as Promise<boolean>,
    getReloadUpdateInfo: (params: { builtCommitHash: string }) =>
      ipcRenderer.invoke('app:getReloadUpdateInfo', params) as Promise<{
        commitCount: number;
        latestCommitHash: string | null;
      }>,
    reloadPreview: () =>
      ipcRenderer.invoke('app:reloadPreview') as Promise<void>,
    onReloadPreviewProgress: (
      callback: (progress: {
        step:
          | 'starting'
          | 'stopping-commands'
          | 'pulling'
          | 'building'
          | 'launching'
          | 'restarting';
        label: string;
        detail?: string;
      }) => void,
    ) => {
      const handler = (_: unknown, progress: Parameters<typeof callback>[0]) =>
        callback(progress);
      ipcRenderer.on('app:reloadPreviewProgress', handler);
      return () =>
        ipcRenderer.removeListener('app:reloadPreviewProgress', handler);
    },
  },
  system: {
    getMemoryUsage: () => ipcRenderer.invoke('system:getMemoryUsage'),
  },
  debugLogs: {
    onBatch: (callback: (entries: DebugLogEntry[]) => void) => {
      const handler = (_: unknown, entries: DebugLogEntry[]) =>
        callback(entries);
      ipcRenderer.on('debug:log-batch', handler);
      return () => ipcRenderer.removeListener('debug:log-batch', handler);
    },
  },
  codeFolding: {
    getFoldRanges: (content: string, language: string) =>
      ipcRenderer.invoke('codeFolding:getFoldRanges', content, language),
  },
  onRateLimitSwap: (callback: (data: { from: string; to: string }) => void) => {
    const handler = (_: unknown, data: { from: string; to: string }) =>
      callback(data);
    ipcRenderer.on('rate-limit-swap:triggered', handler);
    return () =>
      ipcRenderer.removeListener('rate-limit-swap:triggered', handler);
  },
});
console.log('Preload script loaded');
