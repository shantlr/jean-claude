import type {
  AgentMessage,
  AgentMessageEvent,
  AgentStatusEvent,
  AgentPermissionEvent,
  AgentQuestionEvent,
  AgentNameUpdatedEvent,
  AgentQueueUpdateEvent,
  PermissionResponse,
  QuestionResponse,
} from '../../shared/agent-types';
import type {
  AzureDevOpsPullRequest,
  AzureDevOpsPullRequestDetails,
  AzureDevOpsCommit,
  AzureDevOpsFileChange,
  AzureDevOpsCommentThread,
} from '../../shared/azure-devops-types';
import type {
  GlobalPrompt,
  GlobalPromptResponse,
} from '../../shared/global-prompt-types';
import type {
  ProjectCommand,
  NewProjectCommand,
  UpdateProjectCommand,
  RunStatus,
  PortsInUseErrorData,
  PackageScriptsResult,
} from '../../shared/run-command-types';
import type { Skill } from '../../shared/skill-types';
import type {
  Project,
  NewProject,
  UpdateProject,
  Task,
  NewTask,
  UpdateTask,
  Provider,
  NewProvider,
  UpdateProvider,
  Token,
  NewToken,
  UpdateToken,
  InteractionMode,
  AppSettings,
} from '../../shared/types';
import type { UsageResult } from '../../shared/usage-types';

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
}

export interface AzureDevOpsOrganization {
  id: string;
  name: string;
  url: string;
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
  };
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

export interface TaskWithProject {
  id: string;
  projectId: string;
  projectName: string;
  projectColor: string;
  name: string | null;
  prompt: string;
  status: string;
  sessionId: string | null;
  worktreePath: string | null;
  startCommitHash: string | null;
  branchName: string | null;
  readAt: string | null;
  lastReadIndex: number;
  interactionMode: string;
  userCompleted: boolean;
  sessionAllowedTools: string[];
  workItemId: string | null;
  workItemUrl: string | null;
  pullRequestId: string | null;
  pullRequestUrl: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
}

export type AgentEventCallback<T> = (event: T) => void;
export type UnsubscribeFn = () => void;

export interface Api {
  platform: typeof process.platform;
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
  };
  tasks: {
    findAll: () => Promise<Task[]>;
    findByProjectId: (projectId: string) => Promise<Task[]>;
    findAllActive: () => Promise<TaskWithProject[]>;
    findById: (id: string) => Promise<Task | undefined>;
    create: (data: NewTask) => Promise<Task>;
    createWithWorktree: (
      data: NewTask & { useWorktree: boolean; sourceBranch?: string | null },
    ) => Promise<Task>;
    update: (id: string, data: UpdateTask) => Promise<Task>;
    delete: (id: string) => Promise<void>;
    markAsRead: (id: string) => Promise<Task>;
    updateLastReadIndex: (id: string, lastReadIndex: number) => Promise<Task>;
    setMode: (id: string, mode: InteractionMode) => Promise<Task>;
    toggleUserCompleted: (id: string) => Promise<Task>;
    clearUserCompleted: (id: string) => Promise<Task>;
    addSessionAllowedTool: (
      id: string,
      toolName: string,
      input: Record<string, unknown>,
    ) => Promise<Task>;
    removeSessionAllowedTool: (id: string, toolName: string) => Promise<Task>;
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
    getSkills: (taskId: string) => Promise<Skill[]>;
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
      merge: (
        taskId: string,
        params: {
          targetBranch: string;
          squash?: boolean;
          commitMessage?: string;
        },
      ) => Promise<MergeWorktreeResult>;
      getBranches: (taskId: string) => Promise<string[]>;
      pushBranch: (taskId: string) => Promise<void>;
    };
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
    queryWorkItems: (params: {
      providerId: string;
      projectId: string;
      projectName: string;
      filters: { states?: string[]; workItemTypes?: string[]; searchText?: string };
    }) => Promise<AzureDevOpsWorkItem[]>;
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
    start: (taskId: string) => Promise<void>;
    stop: (taskId: string) => Promise<void>;
    respond: (
      taskId: string,
      requestId: string,
      response: PermissionResponse | QuestionResponse,
    ) => Promise<void>;
    sendMessage: (taskId: string, message: string) => Promise<void>;
    queuePrompt: (
      taskId: string,
      prompt: string,
    ) => Promise<{ promptId: string }>;
    cancelQueuedPrompt: (taskId: string, promptId: string) => Promise<void>;
    getMessages: (taskId: string) => Promise<AgentMessage[]>;
    getMessageCount: (taskId: string) => Promise<number>;
    getPendingRequest: (taskId: string) => Promise<
      | {
          type: 'permission';
          data: AgentPermissionEvent;
        }
      | {
          type: 'question';
          data: AgentQuestionEvent;
        }
      | null
    >;
    onMessage: (
      callback: AgentEventCallback<AgentMessageEvent>,
    ) => UnsubscribeFn;
    onStatus: (callback: AgentEventCallback<AgentStatusEvent>) => UnsubscribeFn;
    onPermission: (
      callback: AgentEventCallback<AgentPermissionEvent>,
    ) => UnsubscribeFn;
    onQuestion: (
      callback: AgentEventCallback<AgentQuestionEvent>,
    ) => UnsubscribeFn;
    onNameUpdated: (
      callback: AgentEventCallback<AgentNameUpdatedEvent>,
    ) => UnsubscribeFn;
    onQueueUpdate: (
      callback: AgentEventCallback<AgentQueueUpdateEvent>,
    ) => UnsubscribeFn;
  };
  debug: {
    getTableNames: () => Promise<string[]>;
    queryTable: (params: QueryTableParams) => Promise<QueryTableResult>;
  };
  usage: {
    get: () => Promise<UsageResult>;
  };
  projectCommands: {
    findByProjectId: (projectId: string) => Promise<ProjectCommand[]>;
    create: (data: NewProjectCommand) => Promise<ProjectCommand>;
    update: (id: string, data: UpdateProjectCommand) => Promise<ProjectCommand>;
    delete: (id: string) => Promise<void>;
  };
  runCommands: {
    start: (projectId: string, workingDir: string) => Promise<RunStatus | PortsInUseErrorData>;
    stop: (projectId: string) => Promise<void>;
    getStatus: (projectId: string) => Promise<RunStatus>;
    killPortsForCommand: (projectId: string, commandId: string) => Promise<void>;
    getPackageScripts: (projectPath: string) => Promise<PackageScriptsResult>;
    onStatusChange: (callback: (projectId: string, status: RunStatus) => void) => () => void;
  };
  globalPrompt: {
    onShow: (callback: (prompt: GlobalPrompt) => void) => () => void;
    respond: (response: GlobalPromptResponse) => Promise<void>;
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
      },
      tasks: {
        findAll: async () => [],
        findByProjectId: async () => [],
        findAllActive: async () => [],
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
        markAsRead: async () => {
          throw new Error('API not available');
        },
        updateLastReadIndex: async () => {
          throw new Error('API not available');
        },
        setMode: async () => {
          throw new Error('API not available');
        },
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
        getSkills: async () => [],
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
          merge: async () =>
            ({
              success: false,
              error: 'API not available',
            }) as MergeWorktreeResult,
          getBranches: async () => [],
          pushBranch: async () => {},
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
        queryWorkItems: async () => [],
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
      },
      dialog: {
        openDirectory: async () => null,
        openApplication: async () => null,
      },
      fs: {
        readPackageJson: async () => null,
        readFile: async () => null,
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
        getMessages: async () => [],
        getMessageCount: async () => 0,
        getPendingRequest: async () => null,
        onMessage: () => () => {},
        onStatus: () => () => {},
        onPermission: () => () => {},
        onQuestion: () => () => {},
        onNameUpdated: () => () => {},
        onQueueUpdate: () => () => {},
      },
      debug: {
        getTableNames: async () => [],
        queryTable: async () => ({ columns: [], rows: [], total: 0 }),
      },
      usage: {
        get: async () => ({
          data: null,
          error: { type: 'api_error', message: 'API not available' },
        }),
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
        start: async () => ({
          isRunning: false,
          commands: [],
        }),
        stop: async () => {},
        getStatus: async () => ({
          isRunning: false,
          commands: [],
        }),
        killPortsForCommand: async () => {},
        getPackageScripts: async () => ({ scripts: [], packageManager: null }),
        onStatusChange: () => () => {},
      },
      globalPrompt: {
        onShow: () => () => {},
        respond: async () => {},
      },
    } as Api);
