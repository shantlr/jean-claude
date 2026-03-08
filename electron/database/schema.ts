import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import type { ProviderType, ProjectType, TaskStatus } from '@shared/types';

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
  mcp_templates: McpTemplateTable;
  project_mcp_overrides: ProjectMcpOverrideTable;
  task_summaries: TaskSummaryTable;
  project_todos: ProjectTodoTable;
  completion_usage: CompletionUsageTable;
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
  completionContext: string | null;
  createdAt: Generated<string>;
  updatedAt: string;
}

export interface TaskTable {
  id: Generated<string>;
  projectId: string;
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
  rawData: string; // Original SDK message JSON
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
  agentBackend: string | null;
  output: string | null;
  images: string | null; // JSON stringified PromptImagePart[]
  meta: string | null; // JSON, shape depends on type
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
  command: string;
  ports: string; // JSON array stored as text
  createdAt: Generated<string>;
}

export type ProjectCommandRow = Selectable<ProjectCommandTable>;
export type NewProjectCommandRow = Insertable<ProjectCommandTable>;
export type UpdateProjectCommandRow = Updateable<ProjectCommandTable>;

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
