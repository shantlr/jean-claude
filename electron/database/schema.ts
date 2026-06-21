import type { Buffer } from 'node:buffer';

import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import type {
  AiUsageFeature,
  AiUsagePricingStatus,
} from '@shared/ai-usage-types';
import type { ProjectType, ProviderType, TaskStatus } from '@shared/types';

// Re-export shared types for convenience
export type {
  Provider,
  NewProvider,
  UpdateProvider,
  Token,
  NewToken,
  UpdateToken,
  Project,
  NewProject,
  UpdateProject,
  Task,
  NewTask,
  UpdateTask,
  TaskStep,
  NewTaskStep,
  UpdateTaskStep,
  TaskStepStatus,
  ProviderType,
  ProjectType,
  TaskStatus,
} from '@shared/types';

// Database table types with Kysely's Generated for auto-generated columns
export interface Database {
  tokens: TokenTable;
  providers: ProviderTable;
  projects: ProjectTable;
  tasks: TaskTable;
  agent_messages: AgentMessageTable;
  raw_messages: RawMessageTable;
  task_steps: TaskStepTable;
  settings: SettingsTable;
  project_commands: ProjectCommandTable;
  project_command_groups: ProjectCommandGroupTable;
  mcp_templates: McpTemplateTable;
  project_mcp_overrides: ProjectMcpOverrideTable;
  task_summaries: TaskSummaryTable;
  project_todos: ProjectTodoTable;
  completion_usage: CompletionUsageTable;
  feed_notes: FeedNoteTable;
  pr_view_snapshots: PrViewSnapshotTable;
  notifications: NotificationTable;
  tracked_pipelines: TrackedPipelineTable;
  usage_snapshots: UsageSnapshotTable;
  ai_usage_events: AiUsageEventTable;
  ai_usage_task_totals: AiUsageTaskTotalTable;
  ai_usage_daily_totals: AiUsageDailyTotalTable;
  work_activity_events: WorkActivityEventTable;
}

export interface TokenTable {
  id: Generated<string>;
  label: string;
  tokenEncrypted: string;
  providerType: ProviderType;
  expiresAt: string | null;
  createdAt: Generated<string>;
  updatedAt: string;
}

export interface ProviderTable {
  id: Generated<string>;
  type: ProviderType;
  label: string;
  baseUrl: string;
  tokenId: string | null;
  createdAt: Generated<string>;
  updatedAt: string;
}

export interface ProjectTable {
  id: Generated<string>;
  name: string;
  path: string;
  type: ProjectType;
  providerId: string | null;
  remoteUrl: string | null;
  color: string;
  logoPath: string | null;
  logoSource: string | null;
  sortOrder: number;
  worktreesPath: string | null;
  defaultBranch: string | null;
  // Repo link (for PR creation)
  repoProviderId: string | null;
  repoProjectId: string | null;
  repoProjectName: string | null;
  repoId: string | null;
  repoName: string | null;
  // Work items link (for task creation from work items)
  workItemProviderId: string | null;
  workItemProjectId: string | null;
  workItemProjectName: string | null;
  // Agent backend (null = use global default)
  defaultAgentBackend: string | null;
  defaultAgentModelPreference: string | null;
  completionContext: string | null;
  summary: string | null;
  aiSkillSlots: string | null; // JSON text
  protectedBranches: string | null; // JSON array of branch names
  favoriteBranches: string | null; // JSON array of branch names
  prPriority: string;
  workItemPriority: string;
  showWorkItemsInFeed: number; // SQLite boolean: 1 = show (default), 0 = hide
  showPrsInFeed: number; // SQLite boolean: 1 = show (default), 0 = hide
  autoPullSourceBranch: number; // SQLite boolean: 1 = pull before creating worktree, 0 = skip
  commitWithNoVerify: number; // SQLite boolean: 1 = pass --no-verify to git commit, 0 = run hooks
  createdAt: Generated<string>;
  updatedAt: string;
}

export interface TaskTable {
  id: Generated<string>;
  projectId: string;
  type: Generated<string>; // TaskType: 'agent' (default) | 'skill-creation'
  name: string | null;
  prompt: string;
  status: TaskStatus;
  worktreePath: string | null;
  startCommitHash: string | null;
  sourceBranch: string | null;
  branchName: string | null;
  hasUnread: number; // SQLite boolean: 0 = read, 1 = unread
  userCompleted: number; // SQLite stores booleans as 0/1
  sessionRules: string | null; // JSON PermissionScope object (e.g. {"bash": {"git status": "allow"}, "read": "allow"})
  sortOrder: number;
  // Provider integration tracking (JSON arrays)
  workItemIds: string | null; // JSON array: ["123", "456"]
  workItemUrls: string | null; // JSON array: ["url1", "url2"]
  pullRequestId: string | null;
  pullRequestUrl: string | null;
  pendingMessage: string | null;
  todoItems: string | null; // JSON array of task todo items
  parentTaskId: string | null;
  createdAt: Generated<string>;
  updatedAt: string;
}

export interface AgentMessageTable {
  id: Generated<string>;
  taskId: string;
  stepId: string | null;
  messageIndex: number;
  type: string;
  toolId: string | null;
  parentToolId: string | null;
  data: string; // JSON stringified NormalizedEntry
  model: string | null;
  isSynthetic: number | null;
  date: string;
  normalizedVersion: number;
  rawMessageId: string | null;
  createdAt: Generated<string>;
}

export interface RawMessageTable {
  id: Generated<string>;
  taskId: string;
  stepId: string | null;
  messageIndex: number;
  backendSessionId: string | null; // SDK session ID for traceability
  rawData: string; // Legacy/plain SDK message JSON. Empty when compressed.
  rawDataBlob: Buffer | null; // Compressed SDK message JSON.
  rawDataEncoding: string | null; // Compression encoding for rawDataBlob.
  rawFormat: string; // Which SDK produced the raw data ('claude-code' | 'opencode')
  createdAt: Generated<string>;
}

export interface TaskStepTable {
  id: Generated<string>;
  taskId: string;
  name: string;
  type: string; // TaskStepType, default 'agent'
  dependsOn: string; // JSON array of step IDs
  promptTemplate: string;
  resolvedPrompt: string | null;
  status: string; // TaskStepStatus
  sessionId: string | null;
  interactionMode: string | null;
  modelPreference: string | null;
  thinkingEffort: string | null;
  agentBackend: string | null;
  output: string | null;
  images: string | null; // JSON stringified PromptImagePart[]
  meta: string | null; // JSON, shape depends on type
  autoStart: number; // 0 or 1 (boolean stored as integer)
  sortOrder: number;
  createdAt: Generated<string>;
  updatedAt: string;
}

export type TaskStepRow = Selectable<TaskStepTable>;
export type NewTaskStepRow = Insertable<TaskStepTable>;
export type UpdateTaskStepRow = Updateable<TaskStepTable>;

// Kysely-specific types for database operations
export type TokenRow = Selectable<TokenTable>;
export type NewTokenRow = Insertable<TokenTable>;
export type UpdateTokenRow = Updateable<TokenTable>;

export type ProviderRow = Selectable<ProviderTable>;
export type NewProviderRow = Insertable<ProviderTable>;
export type UpdateProviderRow = Updateable<ProviderTable>;

export type ProjectRow = Selectable<ProjectTable>;
export type NewProjectRow = Insertable<ProjectTable>;
export type UpdateProjectRow = Updateable<ProjectTable>;

export type TaskRow = Selectable<TaskTable>;
export type NewTaskRow = Insertable<TaskTable>;
export type UpdateTaskRow = Updateable<TaskTable>;

export type AgentMessageRow = Selectable<AgentMessageTable>;
export type NewAgentMessageRow = Insertable<AgentMessageTable>;

export type RawMessageRow = Selectable<RawMessageTable>;
export type NewRawMessageRow = Insertable<RawMessageTable>;

export interface SettingsTable {
  key: string;
  value: string;
  updatedAt: string;
}

export type SettingsRow = Selectable<SettingsTable>;
export type NewSettingsRow = Insertable<SettingsTable>;
export type UpdateSettingsRow = Updateable<SettingsTable>;

export interface ProjectCommandTable {
  id: Generated<string>;
  projectId: string;
  name: string | null;
  command: string;
  ports: string; // JSON array stored as text
  envVars: string; // JSON array stored as text
  confirmBeforeRun: Generated<number>; // 0 or 1
  confirmMessage: string | null;
  sortOrder: Generated<number>;
  createdAt: Generated<string>;
}

export type ProjectCommandRow = Selectable<ProjectCommandTable>;
export type NewProjectCommandRow = Insertable<ProjectCommandTable>;
export type UpdateProjectCommandRow = Updateable<ProjectCommandTable>;

export interface ProjectCommandGroupTable {
  id: Generated<string>;
  projectId: string;
  name: string;
  commandIds: string; // JSON array stored as text
  sortOrder: Generated<number>;
  createdAt: Generated<string>;
}

export type ProjectCommandGroupRow = Selectable<ProjectCommandGroupTable>;
export type NewProjectCommandGroupRow = Insertable<ProjectCommandGroupTable>;
export type UpdateProjectCommandGroupRow = Updateable<ProjectCommandGroupTable>;

export interface McpTemplateTable {
  id: Generated<string>;
  name: string;
  commandTemplate: string;
  variables: string; // JSON
  installOnCreateWorktree: number; // boolean as 0/1
  presetId: string | null;
  createdAt: Generated<string>;
  updatedAt: string;
}

export interface ProjectMcpOverrideTable {
  projectId: string;
  mcpTemplateId: string;
  enabled: number; // boolean as 0/1
}

export type McpTemplateRow = Selectable<McpTemplateTable>;
export type NewMcpTemplateRow = Insertable<McpTemplateTable>;
export type UpdateMcpTemplateRow = Updateable<McpTemplateTable>;

export type ProjectMcpOverrideRow = Selectable<ProjectMcpOverrideTable>;
export type NewProjectMcpOverrideRow = Insertable<ProjectMcpOverrideTable>;

export interface TaskSummaryTable {
  id: Generated<string>;
  taskId: string;
  commitHash: string;
  summary: string; // JSON containing "What I Did" and "Key Decisions"
  annotations: string; // JSON containing file/line annotations
  createdAt: Generated<string>;
}

export type TaskSummaryRow = Selectable<TaskSummaryTable>;
export type NewTaskSummaryRow = Insertable<TaskSummaryTable>;
export type UpdateTaskSummaryRow = Updateable<TaskSummaryTable>;

export interface ProjectTodoTable {
  id: Generated<string>;
  projectId: string;
  content: string;
  sortOrder: number;
  createdAt: Generated<string>;
}

export type ProjectTodoRow = Selectable<ProjectTodoTable>;
export type NewProjectTodoRow = Insertable<ProjectTodoTable>;
export type UpdateProjectTodoRow = Updateable<ProjectTodoTable>;

export interface CompletionUsageTable {
  date: string;
  promptTokens: number;
  completionTokens: number;
  requests: number;
}

export type CompletionUsageRow = Selectable<CompletionUsageTable>;

export interface FeedNoteTable {
  id: Generated<string>;
  content: string;
  completedAt: string | null;
  sortOrder: number;
  createdAt: Generated<string>;
  updatedAt: string;
}

export type FeedNoteRow = Selectable<FeedNoteTable>;
export type NewFeedNoteRow = Insertable<FeedNoteTable>;
export type UpdateFeedNoteRow = Updateable<FeedNoteTable>;

export interface PrViewSnapshotTable {
  id: Generated<string>;
  projectId: string;
  pullRequestId: string;
  lastViewedAt: string;
  lastCommitDate: string | null;
  lastThreadActivityDate: string | null;
  activeThreadCount: number;
}

export type PrViewSnapshotRow = Selectable<PrViewSnapshotTable>;

export interface NotificationTable {
  id: Generated<string>;
  projectId: string | null;
  type: string;
  title: string;
  body: string;
  sourceUrl: string | null;
  read: number;
  meta: string | null;
  createdAt: Generated<string>;
}

export type NotificationRow = Selectable<NotificationTable>;
export type NewNotificationRow = Insertable<NotificationTable>;
export type UpdateNotificationRow = Updateable<NotificationTable>;

export interface TrackedPipelineTable {
  id: Generated<string>;
  projectId: string;
  azurePipelineId: number;
  kind: string;
  name: string;
  sortOrder: number;
  enabled: number;
  visible: Generated<number>;
  lastCheckedRunId: number | null;
  createdAt: Generated<string>;
}

export type TrackedPipelineRow = Selectable<TrackedPipelineTable>;
export type NewTrackedPipelineRow = Insertable<TrackedPipelineTable>;
export type UpdateTrackedPipelineRow = Updateable<TrackedPipelineTable>;

export interface UsageSnapshotTable {
  id: Generated<string>;
  provider: string;
  limitKey: string;
  utilization: number;
  resetsAt: string;
  recordedAt: string;
}

export type UsageSnapshotRow = Selectable<UsageSnapshotTable>;
export type NewUsageSnapshotRow = Insertable<UsageSnapshotTable>;

export interface AiUsageEventTable {
  id: Generated<string>;
  createdAt: string;
  sourceId: string | null;
  feature: AiUsageFeature;
  projectId: string | null;
  taskId: string | null;
  stepId: string | null;
  taskName: string | null;
  projectName: string | null;
  backend: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  providerCostUsd: number | null;
  providerApiCostUsd: number | null;
  pricingStatus: AiUsagePricingStatus;
  pricingVersion: string;
}

export type AiUsageEventRow = Selectable<AiUsageEventTable>;
export type NewAiUsageEventRow = Insertable<AiUsageEventTable>;

export interface AiUsageTaskTotalTable {
  taskId: string;
  projectId: string;
  taskName: string | null;
  projectName: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  providerCostUsd: number;
  providerApiCostUsd: number;
  requests: number;
  updatedAt: string;
}

export type AiUsageTaskTotalRow = Selectable<AiUsageTaskTotalTable>;
export type NewAiUsageTaskTotalRow = Insertable<AiUsageTaskTotalTable>;

export interface AiUsageDailyTotalTable {
  date: string;
  feature: AiUsageFeature;
  backend: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  providerCostUsd: number;
  providerApiCostUsd: number;
  requests: number;
  updatedAt: string;
}

export type AiUsageDailyTotalRow = Selectable<AiUsageDailyTotalTable>;
export type NewAiUsageDailyTotalRow = Insertable<AiUsageDailyTotalTable>;

export interface WorkActivityEventTable {
  id: Generated<string>;
  occurredAt: string;
  type: string;
  projectId: string | null;
  projectName: string | null;
  providerId: string | null;
  azureOrgId: string | null;
  azureProjectId: string | null;
  repoId: string | null;
  taskId: string | null;
  taskTitle: string | null;
  stepId: string | null;
  promptSnippet: string | null;
  promptLength: number | null;
  workItemIdsJson: string;
  workItemsJson: string;
  pullRequestJson: string | null;
  metadataJson: string;
}

export type WorkActivityEventRow = Selectable<WorkActivityEventTable>;
export type NewWorkActivityEventRow = Insertable<WorkActivityEventTable>;
