import type { AgentBackendType, PromptPart } from '@shared/agent-backend-types';
import type {
  AgentQuestion,
  PermissionResponse,
  QuestionResponse,
} from '@shared/agent-types';
import type { AgentUIEvent } from '@shared/agent-ui-events';
import type {
  AzureDevOpsPullRequest,
  AzureDevOpsPullRequestDetails,
  AzureDevOpsCommit,
  AzureDevOpsFileChange,
  AzureDevOpsCommentThread,
} from '@shared/azure-devops-types';
import type {
  GlobalPrompt,
  GlobalPromptResponse,
} from '@shared/global-prompt-types';
import type {
  McpServerTemplate,
  McpPreset,
  NewMcpServerTemplate,
  UpdateMcpServerTemplate,
  ProjectMcpOverride,
  NewProjectMcpOverride,
  UnifiedMcpServer,
} from '@shared/mcp-types';
import type {
  NormalizedEntry,
  NormalizedPermissionRequest,
} from '@shared/normalized-message-v2';
import type {
  ProjectCommand,
  NewProjectCommand,
  UpdateProjectCommand,
  RunStatus,
  PortsInUseErrorData,
  PackageScriptsResult,
} from '@shared/run-command-types';
import type {
  LegacySkillMigrationExecuteResult,
  LegacySkillMigrationPreviewResult,
  ManagedSkill,
  RegistrySearchResult,
  RegistrySkillContent,
  Skill,
  SkillScope,
} from '@shared/skill-types';
import type {
  Project,
  NewProject,
  UpdateProject,
  Task,
  NewTask,
  UpdateTask,
  TaskStep,
  NewTaskStep,
  UpdateTaskStep,
  Provider,
  NewProvider,
  UpdateProvider,
  Token,
  NewToken,
  UpdateToken,
  InteractionMode,
  AppSettings,
  ProjectTodo,
} from '@shared/types';
import type { UsageProviderMap } from '@shared/usage-types';

export type {
  AzureDevOpsPullRequest,
  AzureDevOpsPullRequestDetails,
  AzureDevOpsCommit,
  AzureDevOpsFileChange,
  AzureDevOpsCommentThread,
};

export interface PackageJson {
  name?: string;
}

export interface WorktreeDiffFile {
  path: string;
  status: 'added' | 'modified' | 'deleted';
}

export interface WorktreeDiffResult {
  files: WorktreeDiffFile[];
  worktreeDeleted?: boolean;
}

export interface WorktreeFileContent {
  oldContent: string | null;
  newContent: string | null;
  isBinary: boolean;
}

export interface DetectedProject {
  path: string;
  name: string;
  displayPath: string;
  sources: ('claude-code' | 'opencode' | 'codex')[];
}

// Task Summary types
export interface TaskSummaryContent {
  whatIDid: string;
  keyDecisions: string;
}

export interface FileAnnotation {
  filePath: string;
  lineNumber: number;
  explanation: string;
}

export interface TaskSummary {
  id: string;
  taskId: string;
  commitHash: string;
  summary: TaskSummaryContent;
  annotations: FileAnnotation[];
  createdAt: string;
}

export interface NonExistentClaudeProject {
  path: string;
  folderName: string;
  source: 'json' | 'folder' | 'both';
}

export interface ClaudeProjectsScanResult {
  projects: NonExistentClaudeProject[];
  contentHash: string;
}

export interface ClaudeProjectsCleanupResult {
  success: boolean;
  removedCount: number;
  error?: string;
}

export interface AzureDevOpsOrganization {
  id: string;
  name: string;
  url: string;
}

export interface AzureDevOpsUser {
  id: string;
  displayName: string;
  emailAddress: string;
}

export interface ProviderProject {
  id: string;
  name: string;
  url: string;
}

export interface ProviderRepo {
  id: string;
  name: string;
  url: string;
  projectId: string;
}

export interface ProviderDetails {
  projects: Array<{
    project: ProviderProject;
    repos: ProviderRepo[];
  }>;
}

export interface AzureDevOpsWorkItem {
  id: number;
  url: string;
  fields: {
    title: string;
    workItemType: string;
    state: string;
    assignedTo?: string;
    description?: string;
    reproSteps?: string;
  };
  parentId?: number;
}

export interface AzureDevOpsIteration {
  id: string;
  name: string;
  path: string;
  startDate: string | null;
  finishDate: string | null;
  isCurrent: boolean;
}

export interface CloneRepositoryParams {
  orgName: string;
  projectName: string;
  repoName: string;
  targetPath: string;
}

export interface CloneRepositoryResult {
  success: boolean;
  error?: string;
}

export interface WorktreeStatus {
  hasUncommittedChanges: boolean;
  hasStagedChanges: boolean;
  hasUnstagedChanges: boolean;
  worktreeDeleted?: boolean;
}

export interface MergeWorktreeResult {
  success: boolean;
  error?: string;
}

export interface QueryTableParams {
  table: string;
  search?: string;
  limit: number;
  offset: number;
}

export interface QueryTableResult {
  columns: string[];
  rows: Record<string, unknown>[];
  total: number;
}

export interface DebugDatabaseSizeResult {
  bytes: number;
}

export interface OldCompletedTasksCountResult {
  count: number;
}

export interface DeleteOldCompletedTasksResult {
  deletedCount: number;
}

export interface TaskWithProject {
  id: string;
  projectId: string;
  projectName: string;
  projectColor: string;
  name: string | null;
  prompt: string;
  status: string;
  worktreePath: string | null;
  startCommitHash: string | null;
  branchName: string | null;
  hasUnread: boolean;
  userCompleted: boolean;
  sessionRules: import('@shared/permission-types').PermissionScope;
  workItemId: string | null;
  workItemUrl: string | null;
  pullRequestId: string | null;
  pullRequestUrl: string | null;
  pendingMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompletedTasksResult {
  tasks: TaskWithProject[];
  total: number;
}

export interface DebugMessageWithRawData {
  messageIndex: number;
  rawData: unknown | null;
  rawFormat: string | null;
  backendSessionId: string | null;
  normalizedData: unknown | null;
  createdAt: string;
}

export type AgentEventCallback<T> = (event: T) => void;
export type UnsubscribeFn = () => void;

export interface Api {
  platform: typeof process.platform;
  windowState: {
    getIsFullscreen: () => Promise<boolean>;
    onFullscreenChange: (
      callback: AgentEventCallback<boolean>,
    ) => UnsubscribeFn;
  };
  projects: {
    findAll: () => Promise<Project[]>;
    findById: (id: string) => Promise<Project | undefined>;
    create: (data: NewProject) => Promise<Project>;
    update: (id: string, data: UpdateProject) => Promise<Project>;
    delete: (id: string) => Promise<void>;
    reorder: (orderedIds: string[]) => Promise<Project[]>;
    getBranches: (projectId: string) => Promise<string[]>;
    getCurrentBranch: (projectId: string) => Promise<string>;
    getDetected: () => Promise<DetectedProject[]>;
    getSkills: (projectId: string) => Promise<Skill[]>;
  };
  tasks: {
    focused: (taskId: string) => void;
    findAll: () => Promise<Task[]>;
    findByProjectId: (projectId: string) => Promise<Task[]>;
    findAllActive: () => Promise<TaskWithProject[]>;
    findAllCompleted: (params: {
      limit: number;
      offset: number;
    }) => Promise<CompletedTasksResult>;
    findById: (id: string) => Promise<Task | undefined>;
    create: (
      data: NewTask & {
        interactionMode?: InteractionMode | null;
        modelPreference?: string | null;
        agentBackend?: AgentBackendType | null;
      },
    ) => Promise<Task>;
    createWithWorktree: (
      data: NewTask & {
        useWorktree: boolean;
        sourceBranch?: string | null;
        autoStart?: boolean;
        interactionMode?: InteractionMode | null;
        modelPreference?: string | null;
        agentBackend?: AgentBackendType | null;
      },
    ) => Promise<Task>;
    update: (id: string, data: UpdateTask) => Promise<Task>;
    delete: (
      id: string,
      options?: { deleteWorktree?: boolean },
    ) => Promise<void>;
    toggleUserCompleted: (id: string) => Promise<Task>;
    clearUserCompleted: (id: string) => Promise<Task>;
    addSessionAllowedTool: (
      id: string,
      toolName: string,
      input: Record<string, unknown>,
    ) => Promise<Task>;
    removeSessionAllowedTool: (
      id: string,
      toolName: string,
      pattern?: string,
    ) => Promise<Task>;
    allowForProject: (
      id: string,
      toolName: string,
      input: Record<string, unknown>,
    ) => Promise<Task>;
    allowForProjectWorktrees: (
      id: string,
      toolName: string,
      input: Record<string, unknown>,
    ) => Promise<Task>;
    reorder: (
      projectId: string,
      activeIds: string[],
      completedIds: string[],
    ) => Promise<Task[]>;
    worktree: {
      getDiff: (taskId: string) => Promise<WorktreeDiffResult>;
      getFileContent: (
        taskId: string,
        filePath: string,
        status: 'added' | 'modified' | 'deleted',
      ) => Promise<WorktreeFileContent>;
      getStatus: (taskId: string) => Promise<WorktreeStatus>;
      commit: (
        taskId: string,
        params: { message: string; stageAll: boolean },
      ) => Promise<void>;
      checkMergeConflicts: (
        taskId: string,
        params: { targetBranch: string },
      ) => Promise<{ hasConflicts: boolean; error?: string }>;
      merge: (
        taskId: string,
        params: {
          targetBranch: string;
          squash?: boolean;
          commitMessage?: string;
          commitAllUnstaged?: boolean;
        },
      ) => Promise<MergeWorktreeResult>;
      getBranches: (taskId: string) => Promise<string[]>;
      pushBranch: (taskId: string) => Promise<void>;
      delete: (
        taskId: string,
        options?: { keepBranch?: boolean },
      ) => Promise<void>;
    };
    summary: {
      get: (taskId: string) => Promise<TaskSummary | undefined>;
      generate: (taskId: string) => Promise<TaskSummary>;
    };
    createPullRequest: (params: {
      taskId: string;
      title: string;
      description: string;
      isDraft: boolean;
      deleteWorktree?: boolean;
    }) => Promise<{ id: number; url: string }>;
    createPrReview: (params: {
      projectId: string;
      pullRequestId: number;
    }) => Promise<Task>;
  };
  steps: {
    findByTaskId: (taskId: string) => Promise<TaskStep[]>;
    findById: (stepId: string) => Promise<TaskStep | undefined>;
    create: (data: NewTaskStep & { start?: boolean }) => Promise<TaskStep>;
    update: (stepId: string, data: UpdateTaskStep) => Promise<TaskStep>;

    resolvePrompt: (stepId: string) => Promise<{
      resolvedPrompt: string;
      step: TaskStep;
      warnings: string[];
    }>;
    setMode: (stepId: string, mode: InteractionMode) => Promise<TaskStep>;
    submitPrReview: (stepId: string) => Promise<TaskStep>;
  };
  providers: {
    findAll: () => Promise<Provider[]>;
    findById: (id: string) => Promise<Provider | undefined>;
    create: (data: NewProvider) => Promise<Provider>;
    update: (id: string, data: UpdateProvider) => Promise<Provider>;
    delete: (id: string) => Promise<void>;
    getDetails: (providerId: string) => Promise<ProviderDetails>;
  };
  tokens: {
    findAll: () => Promise<Token[]>;
    findById: (id: string) => Promise<Token | undefined>;
    findByProviderType: (providerType: string) => Promise<Token[]>;
    create: (data: NewToken) => Promise<Token>;
    update: (id: string, data: UpdateToken) => Promise<Token>;
    delete: (id: string) => Promise<void>;
  };
  azureDevOps: {
    getOrganizations: (tokenId: string) => Promise<AzureDevOpsOrganization[]>;
    validateToken: (token: string) => Promise<AzureDevOpsOrganization[]>;
    getTokenExpiration: (tokenId: string) => Promise<string | null>;
    getCurrentUser: (providerId: string) => Promise<AzureDevOpsUser>;
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
    }) => Promise<AzureDevOpsWorkItem[]>;
    getIterations: (params: {
      providerId: string;
      projectName: string;
    }) => Promise<AzureDevOpsIteration[]>;
    createPullRequest: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      sourceBranch: string;
      targetBranch: string;
      title: string;
      description: string;
      isDraft: boolean;
    }) => Promise<{ id: number; url: string }>;
    cloneRepository: (
      params: CloneRepositoryParams,
    ) => Promise<CloneRepositoryResult>;
    listPullRequests: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      status?: 'active' | 'completed' | 'abandoned' | 'all';
    }) => Promise<AzureDevOpsPullRequest[]>;
    getPullRequest: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
    }) => Promise<AzureDevOpsPullRequestDetails>;
    getPullRequestCommits: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
    }) => Promise<AzureDevOpsCommit[]>;
    getPullRequestChanges: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
    }) => Promise<AzureDevOpsFileChange[]>;
    getPullRequestFileContent: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
      filePath: string;
      version: 'base' | 'head';
    }) => Promise<string>;
    getPullRequestThreads: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
    }) => Promise<AzureDevOpsCommentThread[]>;
    addPullRequestComment: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
      content: string;
    }) => Promise<AzureDevOpsCommentThread>;
    addPullRequestFileComment: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
      filePath: string;
      line: number;
      lineEnd?: number;
      content: string;
    }) => Promise<AzureDevOpsCommentThread>;
    fetchImageAsBase64: (params: {
      providerId: string;
      imageUrl: string;
    }) => Promise<{ data: string; mimeType: string } | null>;
  };
  dialog: {
    openDirectory: () => Promise<string | null>;
    openApplication: () => Promise<{ path: string; name: string } | null>;
  };
  fs: {
    readPackageJson: (dirPath: string) => Promise<PackageJson | null>;
    readFile: (
      filePath: string,
    ) => Promise<{ content: string; language: string } | null>;
    listDirectory: (
      dirPath: string,
      projectRoot: string,
    ) => Promise<{ name: string; path: string; isDirectory: boolean }[] | null>;
    listProjectFiles: (projectRoot: string) => Promise<string[]>;
  };
  settings: {
    get: <K extends keyof AppSettings>(key: K) => Promise<AppSettings[K]>;
    set: <K extends keyof AppSettings>(
      key: K,
      value: AppSettings[K],
    ) => Promise<void>;
  };
  shell: {
    openInEditor: (dirPath: string) => Promise<void>;
    getAvailableEditors: () => Promise<{ id: string; available: boolean }[]>;
  };
  agent: {
    start: (stepId: string) => Promise<void>;
    stop: (stepId: string) => Promise<void>;
    respond: (
      stepId: string,
      requestId: string,
      response: PermissionResponse | QuestionResponse,
    ) => Promise<void>;
    sendMessage: (stepId: string, parts: PromptPart[]) => Promise<void>;
    queuePrompt: (
      stepId: string,
      parts: PromptPart[],
    ) => Promise<{ promptId: string }>;
    cancelQueuedPrompt: (stepId: string, promptId: string) => Promise<void>;
    getBackendModels: (
      backend: string,
    ) => Promise<{ id: string; label: string }[]>;
    getMessages: (stepId: string) => Promise<NormalizedEntry[]>;
    getMessageCount: (stepId: string) => Promise<number>;
    getMessagesWithRawData: (
      taskId: string,
    ) => Promise<DebugMessageWithRawData[]>;
    compactRawMessages: (taskId: string) => Promise<void>;
    reprocessNormalization: (taskId: string) => Promise<number>;
    getPendingRequest: (stepId: string) => Promise<
      | {
          type: 'permission';
          data: NormalizedPermissionRequest & { taskId: string };
        }
      | {
          type: 'question';
          data: {
            taskId: string;
            requestId: string;
            questions: AgentQuestion[];
          };
        }
      | null
    >;
    onEvent: (callback: AgentEventCallback<AgentUIEvent>) => UnsubscribeFn;
  };
  debug: {
    getTableNames: () => Promise<string[]>;
    getDatabaseSize: () => Promise<DebugDatabaseSizeResult>;
    countOldCompletedTasks: () => Promise<OldCompletedTasksCountResult>;
    deleteOldCompletedTasks: () => Promise<DeleteOldCompletedTasksResult>;
    queryTable: (params: QueryTableParams) => Promise<QueryTableResult>;
  };
  usage: {
    getAll: (providers: string[]) => Promise<UsageProviderMap>;
  };
  projectCommands: {
    findByProjectId: (projectId: string) => Promise<ProjectCommand[]>;
    create: (data: NewProjectCommand) => Promise<ProjectCommand>;
    update: (id: string, data: UpdateProjectCommand) => Promise<ProjectCommand>;
    delete: (id: string) => Promise<void>;
  };
  runCommands: {
    startCommand: (params: {
      taskId: string;
      projectId: string;
      workingDir: string;
      runCommandId: string;
    }) => Promise<RunStatus | PortsInUseErrorData>;
    stopCommand: (params: {
      taskId: string;
      runCommandId: string;
    }) => Promise<void>;
    getStatus: (taskId: string) => Promise<RunStatus>;
    getTaskIdsWithRunningCommands: () => Promise<string[]>;
    killPortsForCommand: (
      projectId: string,
      commandId: string,
    ) => Promise<void>;
    getPackageScripts: (projectPath: string) => Promise<PackageScriptsResult>;
    onStatusChange: (
      callback: (taskId: string, status: RunStatus) => void,
    ) => () => void;
    onLog: (
      callback: (
        taskId: string,
        runCommandId: string,
        stream: 'stdout' | 'stderr',
        line: string,
      ) => void,
    ) => () => void;
  };
  globalPrompt: {
    onShow: (callback: (prompt: GlobalPrompt) => void) => () => void;
    respond: (response: GlobalPromptResponse) => Promise<void>;
  };
  mcpTemplates: {
    findAll: () => Promise<McpServerTemplate[]>;
    findById: (id: string) => Promise<McpServerTemplate | undefined>;
    create: (data: NewMcpServerTemplate) => Promise<McpServerTemplate>;
    update: (
      id: string,
      data: UpdateMcpServerTemplate,
    ) => Promise<McpServerTemplate>;
    delete: (id: string) => Promise<void>;
    getPresets: () => Promise<McpPreset[]>;
    getEnabledForProject: (projectId: string) => Promise<McpServerTemplate[]>;
  };
  projectMcpOverrides: {
    findByProjectId: (projectId: string) => Promise<ProjectMcpOverride[]>;
    upsert: (data: NewProjectMcpOverride) => Promise<ProjectMcpOverride>;
    delete: (projectId: string, mcpTemplateId: string) => Promise<void>;
  };
  unifiedMcp: {
    getServers: (
      projectId: string,
      projectPath: string,
    ) => Promise<UnifiedMcpServer[]>;
    activate: (
      projectPath: string,
      name: string,
      command: string,
    ) => Promise<void>;
    deactivate: (projectPath: string, name: string) => Promise<void>;
    substituteVariables: (
      commandTemplate: string,
      userVariables: Record<string, string>,
      context: {
        projectPath: string;
        projectName: string;
        branchName: string;
        mainRepoPath: string;
      },
    ) => Promise<string>;
  };
  claudeProjects: {
    findNonExistent: () => Promise<ClaudeProjectsScanResult>;
    cleanup: (params: {
      paths: string[];
      contentHash: string;
    }) => Promise<ClaudeProjectsCleanupResult>;
  };
  completion: {
    complete: (params: {
      prompt: string;
      suffix?: string;
      projectId?: string;
      contextBeforePrompt?: string;
    }) => Promise<string | null>;
    test: () => Promise<{ success: boolean; error?: string }>;
    saveSettings: (params: {
      enabled: boolean;
      apiKey: string;
      model: string;
      serverUrl: string;
    }) => Promise<void>;
    generateContext: (params: { projectId: string }) => Promise<string | null>;
    getDailyUsage: () => Promise<{
      date: string;
      promptTokens: number;
      completionTokens: number;
      requests: number;
      costUsd: number;
      inputCostUsd: number;
      outputCostUsd: number;
    }>;
  };
  projectTodos: {
    list: (projectId: string) => Promise<ProjectTodo[]>;
    count: (projectId: string) => Promise<{ count: number }>;
    create: (data: {
      projectId: string;
      content: string;
    }) => Promise<ProjectTodo>;
    update: (id: string, data: { content: string }) => Promise<ProjectTodo>;
    delete: (id: string) => Promise<void>;
    reorder: (projectId: string, orderedIds: string[]) => Promise<void>;
  };
  skillManagement: {
    getForStep: (params: {
      taskId: string;
      stepId?: string;
    }) => Promise<Skill[]>;
    getAll: (
      backendType: AgentBackendType,
      projectPath?: string,
    ) => Promise<ManagedSkill[]>;
    getAllUnified: (projectPath?: string) => Promise<ManagedSkill[]>;
    getContent: (
      skillPath: string,
    ) => Promise<{ name: string; description: string; content: string }>;
    create: (params: {
      enabledBackends: AgentBackendType[];
      scope: SkillScope;
      projectPath?: string;
      name: string;
      description: string;
      content: string;
    }) => Promise<ManagedSkill>;
    update: (params: {
      skillPath: string;
      backendType: AgentBackendType;
      name?: string;
      description?: string;
      content?: string;
    }) => Promise<ManagedSkill>;
    delete: (skillPath: string, backendType: AgentBackendType) => Promise<void>;
    disable: (
      skillPath: string,
      backendType: AgentBackendType,
    ) => Promise<void>;
    enable: (skillPath: string, backendType: AgentBackendType) => Promise<void>;
    migrationPreview: () => Promise<LegacySkillMigrationPreviewResult>;
    migrationExecute: (params: {
      itemIds: string[];
    }) => Promise<LegacySkillMigrationExecuteResult>;
    registrySearch: (query: string) => Promise<RegistrySearchResult>;
    registryFetchContent: (
      source: string,
      skillId: string,
    ) => Promise<RegistrySkillContent>;
    registryInstall: (params: {
      source: string;
      skillId: string;
      enabledBackends: AgentBackendType[];
    }) => Promise<ManagedSkill>;
  };
}

declare global {
  interface Window {
    api: Api;
  }
}

const hasWindowApi = typeof window !== 'undefined' && window.api;
console.log('window.api available:', hasWindowApi, window?.api);

export const api: Api = hasWindowApi
  ? window.api
  : ({
      platform: 'darwin',
      windowState: {
        getIsFullscreen: async () => false,
        onFullscreenChange: () => () => {},
      },
      projects: {
        findAll: async () => [],
        findById: async () => undefined,
        create: async () => {
          throw new Error('API not available');
        },
        update: async () => {
          throw new Error('API not available');
        },
        delete: async () => {},
        reorder: async () => [],
        getBranches: async () => [],
        getCurrentBranch: async () => '',
        getDetected: async () => [],
        getSkills: async () => [],
      },
      tasks: {
        focused: () => {},
        findAll: async () => [],
        findByProjectId: async () => [],
        findAllActive: async () => [],
        findAllCompleted: async () => ({ tasks: [], total: 0 }),
        findById: async () => undefined,
        create: async () => {
          throw new Error('API not available');
        },
        createWithWorktree: async () => {
          throw new Error('API not available');
        },
        update: async () => {
          throw new Error('API not available');
        },
        delete: async () => {},
        toggleUserCompleted: async () => {
          throw new Error('API not available');
        },
        clearUserCompleted: async () => {
          throw new Error('API not available');
        },
        addSessionAllowedTool: async () => {
          throw new Error('API not available');
        },
        removeSessionAllowedTool: async () => {
          throw new Error('API not available');
        },
        allowForProject: async () => {
          throw new Error('API not available');
        },
        allowForProjectWorktrees: async () => {
          throw new Error('API not available');
        },
        reorder: async () => [],
        worktree: {
          getDiff: async () => ({ files: [] }),
          getFileContent: async () => ({
            oldContent: null,
            newContent: null,
            isBinary: false,
          }),
          getStatus: async () => ({
            hasUncommittedChanges: false,
            hasStagedChanges: false,
            hasUnstagedChanges: false,
          }),
          commit: async () => {},
          checkMergeConflicts: async () => ({ hasConflicts: false }),
          merge: async () =>
            ({
              success: false,
              error: 'API not available',
            }) as MergeWorktreeResult,
          getBranches: async () => [],
          pushBranch: async () => {},
          delete: async () => {},
        },
        summary: {
          get: async () => undefined,
          generate: async () => {
            throw new Error('API not available');
          },
        },
        createPullRequest: async () => ({ id: 0, url: '' }),
        createPrReview: async () => {
          throw new Error('API not available');
        },
      },
      steps: {
        findByTaskId: async () => [],
        findById: async () => undefined,
        create: async () => {
          throw new Error('API not available');
        },
        update: async () => {
          throw new Error('API not available');
        },
        delete: async () => {},
        reorder: async () => [],
        resolvePrompt: async () => {
          throw new Error('API not available');
        },
        setMode: async () => {
          throw new Error('API not available');
        },
        submitPrReview: async () => {
          throw new Error('API not available');
        },
      },
      providers: {
        findAll: async () => [],
        findById: async () => undefined,
        create: async () => {
          throw new Error('API not available');
        },
        update: async () => {
          throw new Error('API not available');
        },
        delete: async () => {},
        getDetails: async () => {
          throw new Error('API not available');
        },
      },
      tokens: {
        findAll: async () => [],
        findById: async () => undefined,
        findByProviderType: async () => [],
        create: async () => {
          throw new Error('API not available');
        },
        update: async () => {
          throw new Error('API not available');
        },
        delete: async () => {},
      },
      azureDevOps: {
        getOrganizations: async () => {
          throw new Error('API not available');
        },
        validateToken: async () => {
          throw new Error('API not available');
        },
        getTokenExpiration: async () => null,
        getCurrentUser: async () => {
          throw new Error('API not available');
        },
        queryWorkItems: async () => [],
        getIterations: async () => [],
        createPullRequest: async () => {
          throw new Error('API not available');
        },
        cloneRepository: async () => {
          throw new Error('API not available');
        },
        listPullRequests: async () => [],
        getPullRequest: async () => {
          throw new Error('API not available');
        },
        getPullRequestCommits: async () => [],
        getPullRequestChanges: async () => [],
        getPullRequestFileContent: async () => '',
        getPullRequestThreads: async () => [],
        addPullRequestComment: async () => {
          throw new Error('API not available');
        },
        addPullRequestFileComment: async () => {
          throw new Error('API not available');
        },
        fetchImageAsBase64: async () => null,
      },
      dialog: {
        openDirectory: async () => null,
        openApplication: async () => null,
      },
      fs: {
        readPackageJson: async () => null,
        readFile: async () => null,
        listDirectory: async () => null,
        listProjectFiles: async () => [],
      },
      settings: {
        get: async () => {
          throw new Error('API not available');
        },
        set: async () => {
          throw new Error('API not available');
        },
      },
      shell: {
        openInEditor: async () => {},
        getAvailableEditors: async () => [],
      },
      agent: {
        start: async () => {
          throw new Error('API not available');
        },
        stop: async () => {
          throw new Error('API not available');
        },
        respond: async () => {
          throw new Error('API not available');
        },
        sendMessage: async () => {
          throw new Error('API not available');
        },
        queuePrompt: async () => {
          throw new Error('API not available');
        },
        cancelQueuedPrompt: async () => {
          throw new Error('API not available');
        },
        getBackendModels: async () => [],
        getMessages: async () => [],
        getMessageCount: async () => 0,
        getMessagesWithRawData: async () => [],
        compactRawMessages: async () => {},
        reprocessNormalization: async () => 0,
        getPendingRequest: async () => null,
        onEvent: () => () => {},
      },
      debug: {
        getTableNames: async () => [],
        getDatabaseSize: async () => ({ bytes: 0 }),
        countOldCompletedTasks: async () => ({ count: 0 }),
        deleteOldCompletedTasks: async () => ({ deletedCount: 0 }),
        queryTable: async () => ({ columns: [], rows: [], total: 0 }),
      },
      usage: {
        getAll: async () => ({}),
      },
      projectCommands: {
        findByProjectId: async () => [],
        create: async () => {
          throw new Error('API not available');
        },
        update: async () => {
          throw new Error('API not available');
        },
        delete: async () => {},
      },
      runCommands: {
        startCommand: async () => ({
          isRunning: false,
          commands: [],
        }),
        stopCommand: async () => {},
        getStatus: async () => ({
          isRunning: false,
          commands: [],
        }),
        getTaskIdsWithRunningCommands: async () => [],
        killPortsForCommand: async () => {},
        getPackageScripts: async () => ({
          scripts: [],
          packageManager: null,
          isWorkspace: false,
          workspacePackages: [],
        }),
        onStatusChange: () => () => {},
        onLog: () => () => {},
      },
      globalPrompt: {
        onShow: () => () => {},
        respond: async () => {},
      },
      mcpTemplates: {
        findAll: async () => [],
        findById: async () => undefined,
        create: async () => {
          throw new Error('API not available');
        },
        update: async () => {
          throw new Error('API not available');
        },
        delete: async () => {},
        getPresets: async () => [],
        getEnabledForProject: async () => [],
      },
      projectMcpOverrides: {
        findByProjectId: async () => [],
        upsert: async () => {
          throw new Error('API not available');
        },
        delete: async () => {},
      },
      unifiedMcp: {
        getServers: async () => [],
        activate: async () => {},
        deactivate: async () => {},
        substituteVariables: async (commandTemplate) => commandTemplate,
      },
      claudeProjects: {
        findNonExistent: async () => ({ projects: [], contentHash: '' }),
        cleanup: async () => ({
          success: false,
          removedCount: 0,
          error: 'API not available',
        }),
      },
      completion: {
        complete: async () => null,
        test: async () => ({ success: false, error: 'API not available' }),
        saveSettings: async () => {},
        generateContext: async () => null,
        getDailyUsage: async () => ({
          date: '',
          promptTokens: 0,
          completionTokens: 0,
          requests: 0,
          costUsd: 0,
          inputCostUsd: 0,
          outputCostUsd: 0,
        }),
      },
      projectTodos: {
        list: async () => [],
        count: async () => ({ count: 0 }),
        create: async () => {
          throw new Error('API not available');
        },
        update: async () => {
          throw new Error('API not available');
        },
        delete: async () => {},
        reorder: async () => {},
      },
      skillManagement: {
        getForStep: async () => [],
        getAll: async () => [],
        getAllUnified: async () => [],
        getContent: async () => ({ name: '', description: '', content: '' }),
        create: async () => ({
          name: '',
          description: '',
          source: 'user' as const,
          skillPath: '',
          enabledBackends: { 'claude-code': true },
          editable: true,
        }),
        update: async () => ({
          name: '',
          description: '',
          source: 'user' as const,
          skillPath: '',
          enabledBackends: { 'claude-code': true },
          editable: true,
        }),
        delete: async () => {},
        disable: async () => {},
        enable: async () => {},
        migrationPreview: async () => ({ items: [] }),
        migrationExecute: async () => ({ results: [] }),
        registrySearch: async () => ({ query: '', skills: [], count: 0 }),
        registryFetchContent: async () => ({
          name: '',
          description: '',
          content: '',
        }),
        registryInstall: async () => ({
          name: '',
          description: '',
          source: 'user' as const,
          skillPath: '',
          enabledBackends: { 'claude-code': true },
          editable: true,
        }),
      },
    } as Api);
