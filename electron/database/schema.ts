import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import type {
  ProviderType,
  ProjectType,
  TaskStatus,
} from '../../shared/types';

// Re-export shared types for convenience
export type {
  Provider,
  NewProvider,
  UpdateProvider,
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
  providers: ProviderTable;
  projects: ProjectTable;
  tasks: TaskTable;
  agent_messages: AgentMessageTable;
}

export interface ProviderTable {
  id: Generated<string>;
  type: ProviderType;
  label: string;
  baseUrl: string;
  token: string;
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
  createdAt: Generated<string>;
  updatedAt: string;
}

export interface TaskTable {
  id: Generated<string>;
  projectId: string;
  name: string;
  prompt: string;
  status: TaskStatus;
  sessionId: string | null;
  worktreePath: string | null;
  startCommitHash: string | null;
  readAt: string | null;
  lastReadIndex: number;
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
