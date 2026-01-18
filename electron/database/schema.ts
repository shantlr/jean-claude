import { Generated, Insertable, Selectable, Updateable } from 'kysely';

export interface Database {
  providers: ProviderTable;
  projects: ProjectTable;
  tasks: TaskTable;
}

export interface ProviderTable {
  id: Generated<string>;
  type: 'azure-devops' | 'github' | 'gitlab';
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
  type: 'local' | 'git-provider';
  providerId: string | null;
  remoteUrl: string | null;
  createdAt: Generated<string>;
  updatedAt: string;
}

export interface TaskTable {
  id: Generated<string>;
  projectId: string;
  name: string;
  prompt: string;
  status: 'running' | 'waiting' | 'completed' | 'errored';
  sessionId: string | null;
  worktreePath: string | null;
  startCommitHash: string | null;
  createdAt: Generated<string>;
  updatedAt: string;
}

export type Provider = Selectable<ProviderTable>;
export type NewProvider = Insertable<ProviderTable>;
export type UpdateProvider = Updateable<ProviderTable>;

export type Project = Selectable<ProjectTable>;
export type NewProject = Insertable<ProjectTable>;
export type UpdateProject = Updateable<ProjectTable>;

export type Task = Selectable<TaskTable>;
export type NewTask = Insertable<TaskTable>;
export type UpdateTask = Updateable<TaskTable>;
