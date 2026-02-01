import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import type { ProviderType, ProjectType, TaskStatus } from '../../shared/types';

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
  ProviderType,
  ProjectType,
  TaskStatus,
} from '../../shared/types';

// Database table types with Kysely's Generated for auto-generated columns
export interface Database {
  tokens: TokenTable;
  providers: ProviderTable;
  projects: ProjectTable;
  tasks: TaskTable;
  agent_messages: AgentMessageTable;
  settings: SettingsTable;
  project_commands: ProjectCommandTable;
  mcp_templates: McpTemplateTable;
  project_mcp_overrides: ProjectMcpOverrideTable;
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
  createdAt: Generated<string>;
  updatedAt: string;
}

export interface TaskTable {
  id: Generated<string>;
  projectId: string;
  name: string | null;
  prompt: string;
  status: TaskStatus;
  sessionId: string | null;
  worktreePath: string | null;
  startCommitHash: string | null;
  branchName: string | null;
  readAt: string | null;
  lastReadIndex: number;
  interactionMode: string;
  userCompleted: number; // SQLite stores booleans as 0/1
  sessionAllowedTools: string | null; // JSON array of tool names
  sortOrder: number;
  // Provider integration tracking
  workItemId: string | null;
  workItemUrl: string | null;
  pullRequestId: string | null;
  pullRequestUrl: string | null;
  createdAt: Generated<string>;
  updatedAt: string;
}

export interface AgentMessageTable {
  id: Generated<string>;
  taskId: string;
  messageIndex: number;
  messageType: string;
  messageData: string; // JSON stringified AgentMessage
  createdAt: Generated<string>;
}

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
