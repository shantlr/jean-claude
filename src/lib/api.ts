import type { AgentBackendType, PromptPart } from '@shared/agent-backend-types';
import type {
  AgentMigrationExecuteResult,
  AgentMigrationPreviewResult,
  ManagedAgent,
} from '@shared/agent-management-types';
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
  AzureDevOpsIdentity,
  AzureDevOpsCommentThread,
  AzureDevOpsComment,
  AzureDevOpsPolicyEvaluation,
} from '@shared/azure-devops-types';
import type { UpcomingMeeting } from '@shared/calendar-types';
import type { DebugLogEntry } from '@shared/debug-log-types';
import type { FeedItem, FeedNote, ProjectPriority } from '@shared/feed-types';
import type { FoldRange } from '@shared/fold-types';
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
  AppNotification,
  TaskNotificationTarget,
} from '@shared/notification-types';
import type {
  TrackedPipeline,
  AzureBuildRun,
  AzureRelease,
  AzureBuildDetail,
  AzureBuildTimeline,
  AzureReleaseDetail,
  AzureGitRef,
  AzureBuildDefinitionDetail,
  YamlPipelineParameter,
  GetYamlParametersIpcParams,
  QueueBuildIpcParams,
} from '@shared/pipeline-types';
import type {
  ProjectCommand,
  ProjectCommandGroup,
  RunCommandConfigItem,
  NewProjectCommand,
  NewProjectCommandGroup,
  UpdateProjectCommand,
  UpdateProjectCommandGroup,
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
  AddGitHubSourceParams,
  InstallSourceItemsParams,
  SourceView,
  UpdateSourceInstallParams,
} from '@shared/source-management-types';
import type {
  Project,
  ProjectFeatureMap,
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
  BranchInfo,
  InteractionMode,
  ThinkingEffort,
  AppSettings,
  ProjectTodo,
  DetectedProjectLogo,
  ProjectLogoHistoryItem,
} from '@shared/types';
import type { UsageProviderMap, UsageSnapshot } from '@shared/usage-types';
import type { CreateWorkItemVerificationNoteParams } from '@shared/work-item-verification-note-types';

export type {
  AzureDevOpsPullRequest,
  AzureDevOpsPullRequestDetails,
  AzureDevOpsCommit,
  AzureDevOpsFileChange,
  AzureDevOpsCommentThread,
  AzureDevOpsComment,
  AzureDevOpsPolicyEvaluation,
};

export interface PackageJson {
  name?: string;
}

export interface WorktreeDiffFile {
  path: string;
  status: 'added' | 'modified' | 'deleted';
  additions: number;
  deletions: number;
}

export interface WorktreeDiffResult {
  files: WorktreeDiffFile[];
  worktreeDeleted?: boolean;
}

export interface WorktreeCommit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
}

export interface WorktreeFileContent {
  oldContent: string | null;
  newContent: string | null;
  isBinary: boolean;
  oldImageDataUrl?: string | null;
  newImageDataUrl?: string | null;
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
  identityId?: string;
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

export interface TestStep {
  action: string;
  expectedResult: string;
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
    changedDate?: string;
  };
  testSteps?: TestStep[];
  parentId?: number;
  linkedPrs?: Array<{ prId: number; projectId: string; repoId: string }>;
  relatedTestCaseIds?: number[];
}

export interface WorkItemComment {
  id: number;
  workItemId: number;
  text: string;
  createdBy: string;
  createdDate: string;
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
  hasUnpushedCommits: boolean;
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
  reclaimableBytes: number;
  tables: { name: string; bytes: number }[];
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
  projectPriority: ProjectPriority;
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

export type DesktopNotificationStatus = {
  supported: boolean;
  permission: 'default' | 'denied' | 'granted' | 'unknown';
  canOpenSettings: boolean;
};

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
    uploadLogo: (projectId: string, sourcePath: string) => Promise<Project>;
    generateLogo: (
      projectId: string,
      customPrompt?: string,
    ) => Promise<Project>;
    listGeneratedLogos: (
      projectId: string,
    ) => Promise<ProjectLogoHistoryItem[]>;
    selectGeneratedLogo: (
      projectId: string,
      logoId: string,
    ) => Promise<Project>;
    deleteGeneratedLogo: (projectId: string, logoId: string) => Promise<void>;
    regenerateSummary: (projectId: string) => Promise<Project>;
    getFeatureMap: (projectId: string) => Promise<ProjectFeatureMap | null>;
    createFeatureMapTask: (projectId: string) => Promise<Task>;
    saveFeatureMapFromTask: (stepId: string) => Promise<ProjectFeatureMap>;
    removeLogo: (projectId: string) => Promise<Project>;
    delete: (id: string) => Promise<void>;
    deleteWorktreesFolder: (projectId: string) => Promise<void>;
    reorder: (orderedIds: string[]) => Promise<Project[]>;
    getBranches: (projectId: string) => Promise<BranchInfo[]>;
    getCurrentBranch: (projectId: string) => Promise<string>;
    isGitRepository: (projectId: string) => Promise<boolean>;
    getCommitIgnore: (projectId: string) => Promise<string>;
    updateCommitIgnore: (projectId: string, content: string) => Promise<void>;
    getDetected: () => Promise<DetectedProject[]>;
    detectLogos: (projectPath: string) => Promise<DetectedProjectLogo[]>;
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
        thinkingEffort?: ThinkingEffort | null;
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
        thinkingEffort?: ThinkingEffort | null;
        agentBackend?: AgentBackendType | null;
      },
    ) => Promise<Task>;
    update: (id: string, data: UpdateTask) => Promise<Task>;
    updatePendingMessage: (
      id: string,
      pendingMessage: string | null,
    ) => Promise<Task>;
    delete: (
      id: string,
      options?: { deleteWorktree?: boolean },
    ) => Promise<void>;
    toggleUserCompleted: (id: string) => Promise<Task>;
    complete: (
      id: string,
      options: { cleanupWorktree?: boolean },
    ) => Promise<{
      task: Task;
      worktreeCleanup?: {
        worktreePath: string;
        branchName: string;
      };
    }>;
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
    allowGlobally: (
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
      getCommits: (taskId: string) => Promise<WorktreeCommit[]>;
      getCommitDiff: (
        taskId: string,
        commitHash: string,
      ) => Promise<WorktreeDiffFile[]>;
      getCommitFileContent: (
        taskId: string,
        commitHash: string,
        filePath: string,
        status: 'added' | 'modified' | 'deleted',
      ) => Promise<WorktreeFileContent>;
      getFileContent: (
        taskId: string,
        filePath: string,
        status: 'added' | 'modified' | 'deleted',
      ) => Promise<WorktreeFileContent>;
      getStatus: (taskId: string) => Promise<WorktreeStatus>;
      commit: (
        taskId: string,
        params: { message?: string; stageAll: boolean },
      ) => Promise<void>;
      generateCommitMessage: (
        taskId: string,
        params: { stageAll: boolean },
      ) => Promise<string | undefined>;
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
      getBranches: (taskId: string) => Promise<BranchInfo[]>;
      pushBranch: (
        taskId: string,
        params?: { commitUnstaged?: boolean },
      ) => Promise<void>;
      delete: (
        taskId: string,
        options?: { keepBranch?: boolean },
      ) => Promise<{ editorCloseWarning?: string }>;
      cleanupAfterCompletion: (
        taskId: string,
        params: {
          worktreePath: string;
          branchName: string;
        },
      ) => Promise<{ editorCloseWarning?: string }>;
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
      commitUnstaged?: boolean;
    }) => Promise<{ id: number; url: string; editorCloseWarning?: string }>;
    createPrReview: (params: {
      projectId: string;
      pullRequestId: number;
      agentBackend?: AgentBackendType | null;
      modelPreference?: string | null;
      thinkingEffort?: ThinkingEffort | null;
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
    getWorkItemById: (params: {
      providerId: string;
      workItemId: number;
    }) => Promise<AzureDevOpsWorkItem | null>;
    updateWorkItemState: (params: {
      providerId: string;
      workItemId: number;
      state: string;
    }) => Promise<void>;
    getRelatedTestCases: (params: {
      providerId: string;
      projectName: string;
      workItemId: number;
    }) => Promise<AzureDevOpsWorkItem[]>;
    getWorkItemComments: (params: {
      providerId: string;
      projectName: string;
      workItemId: number;
    }) => Promise<WorkItemComment[]>;
    addWorkItemComment: (params: {
      providerId: string;
      projectName: string;
      workItemId: number;
      text: string;
    }) => Promise<WorkItemComment>;
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
    updatePullRequestTitle: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
      title: string;
    }) => Promise<AzureDevOpsPullRequestDetails>;
    updatePullRequestDescription: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
      description: string;
    }) => Promise<AzureDevOpsPullRequestDetails>;
    uploadPullRequestAttachment: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
      fileName: string;
      mimeType: string;
      dataBase64: string;
    }) => Promise<{ url: string }>;
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
    getPullRequestWorkItems: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
    }) => Promise<AzureDevOpsWorkItem[]>;
    linkWorkItemToPr: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
      workItemId: number;
    }) => Promise<void>;
    unlinkWorkItemFromPr: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
      workItemId: number;
    }) => Promise<void>;
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
    addThreadReply: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
      threadId: number;
      content: string;
    }) => Promise<AzureDevOpsComment>;
    updateThreadComment: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
      threadId: number;
      commentId: number;
      content: string;
    }) => Promise<AzureDevOpsComment>;
    updateThreadStatus: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
      threadId: number;
      status: string;
    }) => Promise<void>;
    searchIdentities: (params: {
      providerId: string;
      query: string;
    }) => Promise<AzureDevOpsIdentity[]>;
    fetchImageAsBase64: (params: {
      providerId: string;
      imageUrl: string;
    }) => Promise<{ data: string; mimeType: string } | null>;
    getPullRequestPolicyEvaluations: (params: {
      providerId: string;
      projectId: string;
      pullRequestId: number;
    }) => Promise<AzureDevOpsPolicyEvaluation[]>;
    requeuePolicyEvaluation: (params: {
      providerId: string;
      projectId: string;
      evaluationId: string;
    }) => Promise<void>;
    votePullRequest: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
      reviewerId: string;
      vote: number;
    }) => Promise<void>;
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
      };
    }) => Promise<AzureDevOpsPullRequestDetails>;
    publishPullRequest: (params: {
      providerId: string;
      projectId: string;
      repoId: string;
      pullRequestId: number;
    }) => Promise<void>;
  };
  dialog: {
    openDirectory: () => Promise<string | null>;
    openImageFile: () => Promise<string | null>;
    openApplication: () => Promise<{ path: string; name: string } | null>;
  };
  fs: {
    readPackageJson: (dirPath: string) => Promise<PackageJson | null>;
    readFile: (
      filePath: string,
    ) => Promise<{ content: string; language: string } | null>;
    readImageAsDataUrl: (filePath: string) => Promise<string | null>;
    listDirectory: (
      dirPath: string,
      projectRoot: string,
    ) => Promise<{ name: string; path: string; isDirectory: boolean }[] | null>;
    listProjectFiles: (projectRoot: string) => Promise<string[]>;
    writeAttachmentFile: (
      projectPath: string,
      filename: string,
      content: string,
      encoding?: 'utf-8' | 'base64',
    ) => Promise<string>;
    copyAttachmentFile: (
      projectPath: string,
      sourcePath: string,
    ) => Promise<{ filePath: string; filename: string }>;
    getPathForFile: (file: File) => string | null;
  };
  settings: {
    get: <K extends keyof AppSettings>(key: K) => Promise<AppSettings[K]>;
    set: <K extends keyof AppSettings>(
      key: K,
      value: AppSettings[K],
    ) => Promise<void>;
  };
  backendConfig: {
    getUserConfig: (
      backend: import('@shared/agent-backend-types').AgentBackendType,
    ) => Promise<
      import('@shared/backend-config-settings-types').BackendUserConfig
    >;
    setUserConfig: (
      backend: import('@shared/agent-backend-types').AgentBackendType,
      content: string,
    ) => Promise<
      import('@shared/backend-config-settings-types').BackendUserConfig
    >;
  };
  projectPromptPreface: {
    get: (
      projectPath: string,
    ) => Promise<
      import('@shared/prompt-preface-types').ProjectPromptPrefaceSetting
    >;
    set: (
      projectPath: string,
      value: import('@shared/prompt-preface-types').ProjectPromptPrefaceSetting,
    ) => Promise<void>;
  };
  globalPermissions: {
    get: () => Promise<import('@shared/permission-types').PermissionScope>;
    set: (
      permissions: import('@shared/permission-types').PermissionScope,
    ) => Promise<void>;
    addRule: (
      toolName: string,
      input: Record<string, unknown>,
      action?: import('@shared/permission-types').PermissionAction,
    ) => Promise<import('@shared/permission-types').PermissionScope>;
    removeRule: (
      tool: string,
      pattern?: string,
    ) => Promise<import('@shared/permission-types').PermissionScope>;
    editRule: (
      tool: string,
      oldPattern: string | undefined,
      newPattern: string | undefined,
      action: import('@shared/permission-types').PermissionAction,
    ) => Promise<import('@shared/permission-types').PermissionScope>;
  };
  projectPermissions: {
    get: (
      projectPath: string,
    ) => Promise<import('@shared/permission-types').PermissionScope>;
    addRule: (
      projectPath: string,
      toolName: string,
      input: Record<string, unknown>,
      action?: import('@shared/permission-types').PermissionAction,
    ) => Promise<import('@shared/permission-types').PermissionScope>;
    removeRule: (
      projectPath: string,
      tool: string,
      pattern?: string,
    ) => Promise<import('@shared/permission-types').PermissionScope>;
    editRule: (
      projectPath: string,
      tool: string,
      oldPattern: string | undefined,
      newPattern: string | undefined,
      action: import('@shared/permission-types').PermissionAction,
    ) => Promise<import('@shared/permission-types').PermissionScope>;
  };
  worktreeConfig: {
    getCopyEntries: (
      projectPath: string,
    ) => Promise<import('@shared/permission-types').WorktreeFileCopyEntry[]>;
    setCopyEntries: (
      projectPath: string,
      entries: import('@shared/permission-types').WorktreeFileCopyEntry[],
    ) => Promise<import('@shared/permission-types').WorktreeFileCopyEntry[]>;
  };
  shell: {
    openInEditor: (dirPath: string, folderContext?: string) => Promise<void>;
    getAvailableEditors: () => Promise<{ id: string; available: boolean }[]>;
    setupGlobalGitignore: () => Promise<{ success: boolean; path: string }>;
  };
  calendar: {
    listUpcomingMeetings: () => Promise<UpcomingMeeting[]>;
    listTodayMeetings: () => Promise<UpcomingMeeting[]>;
    revealMeeting: (meeting: UpcomingMeeting) => Promise<void>;
    setIgnoredMeetingIds: (ids: string[]) => Promise<void>;
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
    updateQueuedPrompt: (
      stepId: string,
      promptId: string,
      content: string,
    ) => Promise<void>;
    cancelQueuedPrompt: (stepId: string, promptId: string) => Promise<void>;
    getBackendModels: (backend: string) => Promise<
      {
        id: string;
        label: string;
        supportsThinking?: boolean;
        thinkingEfforts?: ThinkingEffort[];
      }[]
    >;
    getMessages: (stepId: string) => Promise<NormalizedEntry[]>;
    getMessageCount: (stepId: string) => Promise<number>;
    getMessagesWithRawData: (
      taskId: string,
      stepId: string,
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
    getHistory: (params: {
      provider: string;
      limitKey: string;
      since: string;
      until?: string;
    }) => Promise<UsageSnapshot[]>;
  };
  projectCommands: {
    findByProjectId: (projectId: string) => Promise<ProjectCommand[]>;
    create: (data: NewProjectCommand) => Promise<ProjectCommand>;
    update: (id: string, data: UpdateProjectCommand) => Promise<ProjectCommand>;
    delete: (id: string) => Promise<void>;
    reorder: (projectId: string, commandIds: string[]) => Promise<void>;
  };
  projectCommandGroups: {
    findByProjectId: (projectId: string) => Promise<ProjectCommandGroup[]>;
    create: (data: NewProjectCommandGroup) => Promise<ProjectCommandGroup>;
    update: (
      id: string,
      data: UpdateProjectCommandGroup,
    ) => Promise<ProjectCommandGroup>;
    delete: (id: string) => Promise<void>;
    reorder: (projectId: string, groupIds: string[]) => Promise<void>;
  };
  projectRunConfig: {
    reorder: (
      projectId: string,
      items: RunCommandConfigItem[],
    ) => Promise<void>;
  };
  runCommands: {
    startCommand: (params: {
      taskId: string;
      projectId: string;
      workingDir: string;
      runCommandId: string;
    }) => Promise<RunStatus | PortsInUseErrorData>;
    startGroup: (params: {
      taskId: string;
      projectId: string;
      workingDir: string;
      runCommandIds: string[];
    }) => Promise<RunStatus | PortsInUseErrorData>;
    stopCommand: (params: {
      taskId: string;
      runCommandId: string;
    }) => Promise<void>;
    sendInput: (params: {
      taskId: string;
      runCommandId: string;
      input: string;
    }) => Promise<void>;
    sendSignal: (params: {
      taskId: string;
      runCommandId: string;
      signal: 'SIGINT' | 'SIGTERM';
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
  aiGeneration: {
    saveSettings: (params: {
      openAiApiKey: string;
      openAiImageGenerationEnabled: boolean;
      openAiImageModel: string;
      openAiLogoPromptContext: string;
    }) => Promise<void>;
    saveBaseImage: (params: {
      sourcePath: string;
    }) => Promise<AppSettings['aiGeneration']>;
    listBaseImages: () => Promise<{
      mode: 'builtin' | 'custom';
      builtinId: string;
      custom: { name: string; dataUrl: string | null } | null;
      builtin: { id: string; name: string; dataUrl: string }[];
    }>;
    setBaseImageSelection: (params: {
      mode: 'builtin' | 'custom';
      builtinId?: string;
    }) => Promise<AppSettings['aiGeneration']>;
    removeBaseImage: () => Promise<AppSettings['aiGeneration']>;
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
  agentManagement: {
    getAll: () => Promise<ManagedAgent[]>;
    getContent: (
      agentPath: string,
    ) => Promise<{ name: string; description: string; content: string }>;
    create: (params: {
      enabledBackends: AgentBackendType[];
      name: string;
      description: string;
      content: string;
    }) => Promise<ManagedAgent>;
    update: (params: {
      agentPath: string;
      content: string;
    }) => Promise<ManagedAgent>;
    delete: (agentPath: string) => Promise<void>;
    disable: (
      agentPath: string,
      backendType: AgentBackendType,
    ) => Promise<void>;
    enable: (agentPath: string, backendType: AgentBackendType) => Promise<void>;
    migrationPreview: () => Promise<AgentMigrationPreviewResult>;
    migrationExecute: (params: {
      itemIds: string[];
    }) => Promise<AgentMigrationExecuteResult>;
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
    createWithAgent: (params: {
      prompt: string;
      enabledBackends: AgentBackendType[];
      mode: 'create' | 'improve';
      sourceSkillPath?: string;
      interactionMode?: InteractionMode | null;
      modelPreference?: string | null;
      agentBackend?: AgentBackendType | null;
    }) => Promise<Task>;
    publishFromWorkspace: (params: {
      stepId: string;
      workspacePath: string;
      enabledBackends: AgentBackendType[];
      mode: 'create' | 'improve';
      sourceSkillPath?: string;
    }) => Promise<ManagedSkill[]>;
  };
  sourceManagement: {
    list: () => Promise<SourceView[]>;
    addGithub: (params: AddGitHubSourceParams) => Promise<SourceView>;
    refresh: (sourceId: string) => Promise<SourceView>;
    installItems: (params: InstallSourceItemsParams) => Promise<SourceView[]>;
    updateInstall: (params: UpdateSourceInstallParams) => Promise<SourceView[]>;
    remove: (sourceId: string) => Promise<void>;
  };
  prSnapshots: {
    record: (params: {
      projectId: string;
      pullRequestId: number;
      providerId: string;
      repoProjectId: string;
      repoId: string;
    }) => Promise<void>;
  };
  notifications: {
    list: () => Promise<AppNotification[]>;
    getDesktopStatus: () => Promise<DesktopNotificationStatus>;
    openSystemSettings: () => Promise<boolean>;
    markRead: (id: string | 'all') => Promise<void>;
    delete: (id: string) => Promise<void>;
    onNew: (callback: (notification: AppNotification) => void) => () => void;
    onOpenTask: (
      callback: (target: TaskNotificationTarget) => void,
    ) => () => void;
  };
  trackedPipelines: {
    list: (projectId: string) => Promise<TrackedPipeline[]>;
    listAll: () => Promise<TrackedPipeline[]>;
    toggle: (id: string, enabled: boolean) => Promise<void>;
    toggleVisible: (id: string, visible: boolean) => Promise<void>;
    reorder: (projectId: string, orderedIds: string[]) => Promise<void>;
    discover: (projectId: string) => Promise<TrackedPipeline[]>;
  };
  pipelines: {
    listRuns: (params: {
      providerId: string;
      azureProjectId: string;
      definitionId: number;
      kind: 'build' | 'release';
    }) => Promise<AzureBuildRun[] | AzureRelease[]>;
    getBuild: (params: {
      providerId: string;
      azureProjectId: string;
      buildId: number;
    }) => Promise<AzureBuildDetail>;
    getBuildTimeline: (params: {
      providerId: string;
      azureProjectId: string;
      buildId: number;
    }) => Promise<AzureBuildTimeline>;
    getBuildLog: (params: {
      providerId: string;
      azureProjectId: string;
      buildId: number;
      logId: number;
    }) => Promise<string>;
    getRelease: (params: {
      providerId: string;
      azureProjectId: string;
      releaseId: number;
    }) => Promise<AzureReleaseDetail>;
    listBranches: (params: {
      providerId: string;
      azureProjectId: string;
      repoId: string;
    }) => Promise<AzureGitRef[]>;
    getDefinitionParams: (params: {
      providerId: string;
      azureProjectId: string;
      definitionId: number;
    }) => Promise<AzureBuildDefinitionDetail>;
    getYamlParameters: (
      params: GetYamlParametersIpcParams,
    ) => Promise<YamlPipelineParameter[]>;
    queueBuild: (params: QueueBuildIpcParams) => Promise<AzureBuildRun>;
    createRelease: (params: {
      providerId: string;
      azureProjectId: string;
      definitionId: number;
      description?: string;
    }) => Promise<AzureRelease>;
    cancelBuild: (params: {
      providerId: string;
      azureProjectId: string;
      buildId: number;
    }) => Promise<void>;
  };
  feed: {
    getItems: () => Promise<FeedItem[]>;
    getTaskItems: () => Promise<FeedItem[]>;
    getPullRequestItems: () => Promise<FeedItem[]>;
    getNoteItems: () => Promise<FeedItem[]>;
    getWorkItemItems: () => Promise<FeedItem[]>;
    createNote: (params: { content: string }) => Promise<FeedNote>;
    createWorkItemVerificationNote: (
      params: CreateWorkItemVerificationNoteParams,
    ) => Promise<FeedNote>;
    updateNote: (params: {
      id: string;
      content?: string;
      completedAt?: string | null;
    }) => Promise<FeedNote>;
    deleteNote: (params: { id: string }) => Promise<void>;
  };
  app: {
    isDevMode: boolean;
    getIsPreviewMode: () => Promise<boolean>;
    getReloadUpdateInfo: (params: {
      builtCommitHash: string;
    }) => Promise<ReloadUpdateInfo>;
    reloadPreview: () => Promise<void>;
    onReloadPreviewProgress: (
      callback: (progress: ReloadPreviewProgress) => void,
    ) => () => void;
  };
  system: {
    getMemoryUsage: () => Promise<{
      totalRssBytes: number;
      mainProcess: {
        heapUsedBytes: number;
        rssBytes: number;
        cpuPercent: number;
      };
      rendererProcess: {
        rssBytes: number;
        privateBytes: number;
        cpuPercent: number;
      };
    }>;
  };
  debugLogs: {
    onBatch: (callback: (entries: DebugLogEntry[]) => void) => () => void;
  };
  codeFolding: {
    getFoldRanges: (content: string, language: string) => Promise<FoldRange[]>;
  };
}

export type ReloadPreviewProgress = {
  step:
    | 'starting'
    | 'stopping-commands'
    | 'pulling'
    | 'building'
    | 'launching'
    | 'restarting';
  label: string;
  detail?: string;
};

export type ReloadUpdateInfo = {
  commitCount: number;
  latestCommitHash: string | null;
};

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
        uploadLogo: async () => {
          throw new Error('API not available');
        },
        generateLogo: async () => {
          throw new Error('API not available');
        },
        listGeneratedLogos: async () => [],
        selectGeneratedLogo: async () => {
          throw new Error('API not available');
        },
        deleteGeneratedLogo: async () => {
          throw new Error('API not available');
        },
        regenerateSummary: async () => {
          throw new Error('API not available');
        },
        getFeatureMap: async () => null,
        createFeatureMapTask: async () => {
          throw new Error('API not available');
        },
        saveFeatureMapFromTask: async () => {
          throw new Error('API not available');
        },
        removeLogo: async () => {
          throw new Error('API not available');
        },
        delete: async () => {},
        deleteWorktreesFolder: async () => {},
        reorder: async () => [],
        getBranches: async () => [],
        getCurrentBranch: async () => '',
        isGitRepository: async () => false,
        getCommitIgnore: async () => '',
        updateCommitIgnore: async () => {},
        getDetected: async () => [],
        detectLogos: async () => [],
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
        updatePendingMessage: async () => {
          throw new Error('API not available');
        },
        delete: async () => {},
        toggleUserCompleted: async () => {
          throw new Error('API not available');
        },
        complete: async () => {
          throw new Error('API not available') as never;
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
        allowGlobally: async () => {
          throw new Error('API not available');
        },
        reorder: async () => [],
        worktree: {
          getDiff: async () => ({ files: [] }),
          getCommits: async () => [],
          getCommitDiff: async () => [],
          getCommitFileContent: async () => ({
            oldContent: null,
            newContent: null,
            isBinary: false,
          }),
          getFileContent: async () => ({
            oldContent: null,
            newContent: null,
            isBinary: false,
          }),
          getStatus: async () => ({
            hasUncommittedChanges: false,
            hasStagedChanges: false,
            hasUnstagedChanges: false,
            hasUnpushedCommits: false,
          }),
          commit: async () => {},
          generateCommitMessage: async () => undefined,
          checkMergeConflicts: async () => ({ hasConflicts: false }),
          merge: async () =>
            ({
              success: false,
              error: 'API not available',
            }) as MergeWorktreeResult,
          getBranches: async () => [],
          pushBranch: async () => {},
          delete: async () => ({}),
          cleanupAfterCompletion: async () => ({}),
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
        getWorkItemById: async () => null,
        updateWorkItemState: async () => {
          throw new Error('API not available');
        },
        getRelatedTestCases: async () => [],
        getWorkItemComments: async () => [],
        addWorkItemComment: async () => {
          throw new Error('API not available');
        },
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
        updatePullRequestTitle: async () => {
          throw new Error('API not available');
        },
        updatePullRequestDescription: async () => {
          throw new Error('API not available');
        },
        uploadPullRequestAttachment: async () => {
          throw new Error('API not available');
        },
        getPullRequestCommits: async () => [],
        getPullRequestChanges: async () => [],
        getPullRequestFileContent: async () => '',
        getPullRequestThreads: async () => [],
        getPullRequestWorkItems: async () => [],
        linkWorkItemToPr: async () => {},
        unlinkWorkItemFromPr: async () => {},
        addPullRequestComment: async () => {
          throw new Error('API not available');
        },
        addPullRequestFileComment: async () => {
          throw new Error('API not available');
        },
        addThreadReply: async () => {
          throw new Error('API not available');
        },
        updateThreadComment: async () => {
          throw new Error('API not available');
        },
        updateThreadStatus: async () => {
          throw new Error('API not available');
        },
        searchIdentities: async () => [],
        fetchImageAsBase64: async () => null,
        getPullRequestPolicyEvaluations: async () => [],
        requeuePolicyEvaluation: async () => {},
        votePullRequest: async () => {
          throw new Error('API not available');
        },
        setPullRequestAutoComplete: async () => {
          throw new Error('API not available');
        },
        publishPullRequest: async () => {
          throw new Error('API not available');
        },
      },
      dialog: {
        openDirectory: async () => null,
        openImageFile: async () => null,
        openApplication: async () => null,
      },
      fs: {
        readPackageJson: async () => null,
        readFile: async () => null,
        readImageAsDataUrl: async () => null,
        listDirectory: async () => null,
        listProjectFiles: async () => [],
        writeAttachmentFile: async () => '',
        copyAttachmentFile: async () => ({ filePath: '', filename: '' }),
        getPathForFile: () => null,
      },
      settings: {
        get: async () => {
          throw new Error('API not available');
        },
        set: async () => {
          throw new Error('API not available');
        },
      },
      backendConfig: {
        getUserConfig: async () => {
          throw new Error('API not available');
        },
        setUserConfig: async () => {
          throw new Error('API not available');
        },
      },
      projectPromptPreface: {
        get: async () => {
          throw new Error('API not available');
        },
        set: async () => {
          throw new Error('API not available');
        },
      },
      globalPermissions: {
        get: async () => ({}),
        set: async () => {},
        addRule: async () => ({}),
        removeRule: async () => ({}),
        editRule: async () => ({}),
      },
      projectPermissions: {
        get: async () => ({}),
        addRule: async () => ({}),
        removeRule: async () => ({}),
        editRule: async () => ({}),
      },
      worktreeConfig: {
        getCopyEntries: async () => [],
        setCopyEntries: async () => [],
      },
      shell: {
        openInEditor: async () => {},
        getAvailableEditors: async () => [],
        setupGlobalGitignore: async () => ({ success: true, path: '' }),
      },
      calendar: {
        listUpcomingMeetings: async () => [],
        listTodayMeetings: async () => [],
        revealMeeting: async () => {},
        setIgnoredMeetingIds: async () => {},
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
        updateQueuedPrompt: async () => {
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
        getDatabaseSize: async () => ({
          bytes: 0,
          reclaimableBytes: 0,
          tables: [],
        }),
        countOldCompletedTasks: async () => ({ count: 0 }),
        deleteOldCompletedTasks: async () => ({ deletedCount: 0 }),
        queryTable: async () => ({ columns: [], rows: [], total: 0 }),
      },
      usage: {
        getAll: async () => ({}),
        getHistory: async () => [],
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
        reorder: async () => {},
      },
      projectCommandGroups: {
        findByProjectId: async () => [],
        create: async () => {
          throw new Error('API not available');
        },
        update: async () => {
          throw new Error('API not available');
        },
        delete: async () => {},
        reorder: async () => {},
      },
      projectRunConfig: {
        reorder: async () => {},
      },
      runCommands: {
        startCommand: async () => ({
          isRunning: false,
          commands: [],
        }),
        startGroup: async () => ({
          isRunning: false,
          commands: [],
        }),
        stopCommand: async () => {},
        sendInput: async () => {},
        sendSignal: async () => {},
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
      aiGeneration: {
        saveSettings: async () => {},
        saveBaseImage: async () => ({
          openAiApiKey: '',
          openAiImageGenerationEnabled: false,
          openAiImageModel: 'gpt-image-2',
          openAiLogoPromptContext: '',
          openAiBaseImageMode: 'builtin',
          openAiBaseImageBuiltin: 'geometric-adventurers',
          openAiBaseImagePath: null,
          openAiBaseImageName: null,
        }),
        listBaseImages: async () => ({
          mode: 'builtin',
          builtinId: 'geometric-adventurers',
          custom: null,
          builtin: [],
        }),
        setBaseImageSelection: async () => ({
          openAiApiKey: '',
          openAiImageGenerationEnabled: false,
          openAiImageModel: 'gpt-image-2',
          openAiLogoPromptContext: '',
          openAiBaseImageMode: 'builtin',
          openAiBaseImageBuiltin: 'geometric-adventurers',
          openAiBaseImagePath: null,
          openAiBaseImageName: null,
        }),
        removeBaseImage: async () => ({
          openAiApiKey: '',
          openAiImageGenerationEnabled: false,
          openAiImageModel: 'gpt-image-2',
          openAiLogoPromptContext: '',
          openAiBaseImageMode: 'builtin',
          openAiBaseImageBuiltin: 'geometric-adventurers',
          openAiBaseImagePath: null,
          openAiBaseImageName: null,
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
      agentManagement: {
        getAll: async () => [],
        getContent: async () => ({ name: '', description: '', content: '' }),
        create: async () => ({
          name: '',
          description: '',
          agentPath: '',
          managed: true,
          enabledBackends: { 'claude-code': true },
          editable: true,
        }),
        update: async () => ({
          name: '',
          description: '',
          agentPath: '',
          managed: true,
          enabledBackends: { 'claude-code': true },
          editable: true,
        }),
        delete: async () => {},
        disable: async () => {},
        enable: async () => {},
        migrationPreview: async () => ({ items: [] }),
        migrationExecute: async () => ({ results: [] }),
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
        createWithAgent: async () => {
          throw new Error('API not available');
        },
        publishFromWorkspace: async () => [],
      },
      sourceManagement: {
        list: async () => [],
        addGithub: async () => {
          throw new Error('API not available');
        },
        refresh: async () => {
          throw new Error('API not available');
        },
        installItems: async () => {
          throw new Error('API not available');
        },
        updateInstall: async () => {
          throw new Error('API not available');
        },
        remove: async () => {
          throw new Error('API not available');
        },
      },
      prSnapshots: {
        record: async () => {},
      },
      notifications: {
        list: async () => [],
        getDesktopStatus: async () => ({
          supported: true,
          permission: 'granted',
          canOpenSettings: true,
        }),
        openSystemSettings: async () => true,
        markRead: async () => {},
        delete: async () => {},
        onNew: () => () => {},
        onOpenTask: () => () => {},
      },
      trackedPipelines: {
        list: async () => [],
        listAll: async () => [],
        toggle: async () => {},
        toggleVisible: async () => {},
        reorder: async () => {},
        discover: async () => [],
      },
      pipelines: {
        listRuns: async () => [],
        getBuild: async () => ({}) as AzureBuildDetail,
        getBuildTimeline: async () => ({}) as AzureBuildTimeline,
        getBuildLog: async () => '',
        getRelease: async () => ({}) as AzureReleaseDetail,
        listBranches: async () => [],
        getDefinitionParams: async () => ({}) as AzureBuildDefinitionDetail,
        getYamlParameters: async () => [],
        queueBuild: async () => ({}) as AzureBuildRun,
        createRelease: async () => ({}) as AzureRelease,
        cancelBuild: async () => {},
      },
      feed: {
        getItems: async () => [],
        getTaskItems: async () => [],
        getPullRequestItems: async () => [],
        getNoteItems: async () => [],
        getWorkItemItems: async () => [],
        createNote: async () => ({
          id: '',
          content: '',
          completedAt: null,
          sortOrder: 0,
          createdAt: '',
          updatedAt: '',
        }),
        createWorkItemVerificationNote: async () => ({
          id: '',
          content: '',
          completedAt: null,
          sortOrder: 0,
          createdAt: '',
          updatedAt: '',
        }),
        updateNote: async () => ({
          id: '',
          content: '',
          completedAt: null,
          sortOrder: 0,
          createdAt: '',
          updatedAt: '',
        }),
        deleteNote: async () => {},
      },
      app: {
        isDevMode: false,
        getIsPreviewMode: async () => false,
        getReloadUpdateInfo: async () => ({
          commitCount: 0,
          latestCommitHash: null,
        }),
        reloadPreview: async () => {},
        onReloadPreviewProgress: () => () => {},
      },
      system: {
        getMemoryUsage: async () => ({
          totalRssBytes: 0,
          mainProcess: {
            heapUsedBytes: 0,
            rssBytes: 0,
            cpuPercent: 0,
          },
          rendererProcess: {
            rssBytes: 0,
            privateBytes: 0,
            cpuPercent: 0,
          },
        }),
      },
      debugLogs: {
        onBatch: () => () => {},
      },
      codeFolding: {
        getFoldRanges: async () => [],
      },
    } as Api);
