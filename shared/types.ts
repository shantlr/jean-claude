// Shared types used by both renderer and main process
// These are plain TypeScript types without database-specific dependencies

export type ProviderType = 'azure-devops' | 'github' | 'gitlab';

// Token metadata - sensitive token value never exposed to renderer
export interface Token {
  id: string;
  label: string;
  providerType: ProviderType;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewToken {
  id?: string;
  label: string;
  token: string; // Plain token sent during creation, never returned
  providerType: ProviderType;
  expiresAt?: string | null;
  createdAt?: string;
  updatedAt: string;
}

export interface UpdateToken {
  label?: string;
  token?: string; // Optional: only when refreshing
  expiresAt?: string | null;
  updatedAt?: string;
}

export type ProjectType = 'local' | 'git-provider';
export type TaskStatus =
  | 'running'
  | 'waiting'
  | 'completed'
  | 'errored'
  | 'interrupted';
export type InteractionMode = 'ask' | 'auto' | 'plan';

export type ModelPreference = 'default' | 'sonnet' | 'opus' | 'haiku';

export interface Provider {
  id: string;
  type: ProviderType;
  label: string;
  baseUrl: string;
  tokenId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewProvider {
  id?: string;
  type: ProviderType;
  label: string;
  baseUrl: string;
  tokenId: string;
  createdAt?: string;
  updatedAt: string;
}

export interface UpdateProvider {
  type?: ProviderType;
  label?: string;
  baseUrl?: string;
  tokenId?: string | null;
  updatedAt?: string;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  type: ProjectType;
  providerId: string | null;
  remoteUrl: string | null;
  color: string;
  sortOrder: number;
  worktreesPath: string | null;
  defaultBranch: string | null;
  repoProviderId: string | null;
  repoProjectId: string | null;
  repoProjectName: string | null;
  repoId: string | null;
  repoName: string | null;
  workItemProviderId: string | null;
  workItemProjectId: string | null;
  workItemProjectName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewProject {
  id?: string;
  name: string;
  path: string;
  type: ProjectType;
  providerId?: string | null;
  remoteUrl?: string | null;
  color: string;
  sortOrder?: number;
  defaultBranch?: string | null;
  repoProviderId?: string | null;
  repoProjectId?: string | null;
  repoProjectName?: string | null;
  repoId?: string | null;
  repoName?: string | null;
  workItemProviderId?: string | null;
  workItemProjectId?: string | null;
  workItemProjectName?: string | null;
  createdAt?: string;
  updatedAt: string;
}

export interface UpdateProject {
  name?: string;
  path?: string;
  type?: ProjectType;
  providerId?: string | null;
  remoteUrl?: string | null;
  color?: string;
  sortOrder?: number;
  worktreesPath?: string | null;
  defaultBranch?: string | null;
  repoProviderId?: string | null;
  repoProjectId?: string | null;
  repoProjectName?: string | null;
  repoId?: string | null;
  repoName?: string | null;
  workItemProviderId?: string | null;
  workItemProjectId?: string | null;
  workItemProjectName?: string | null;
  updatedAt?: string;
}

export interface Task {
  id: string;
  projectId: string;
  name: string | null;
  prompt: string;
  status: TaskStatus;
  sessionId: string | null;
  worktreePath: string | null;
  startCommitHash: string | null;
  sourceBranch: string | null;
  branchName: string | null;
  readAt: string | null;
  lastReadIndex: number;
  interactionMode: InteractionMode;
  modelPreference: ModelPreference;
  userCompleted: boolean;
  sessionAllowedTools: string[];
  workItemIds: string[] | null;
  workItemUrls: string[] | null;
  pullRequestId: string | null;
  pullRequestUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewTask {
  id?: string;
  projectId: string;
  name?: string | null;
  prompt: string;
  status?: TaskStatus;
  sessionId?: string | null;
  worktreePath?: string | null;
  startCommitHash?: string | null;
  sourceBranch?: string | null;
  branchName?: string | null;
  readAt?: string | null;
  lastReadIndex?: number;
  interactionMode?: InteractionMode;
  modelPreference?: ModelPreference;
  userCompleted?: boolean;
  sessionAllowedTools?: string[];
  workItemIds?: string[] | null;
  workItemUrls?: string[] | null;
  pullRequestId?: string | null;
  pullRequestUrl?: string | null;
  createdAt?: string;
  updatedAt: string;
}

export interface UpdateTask {
  projectId?: string;
  name?: string | null;
  prompt?: string;
  status?: TaskStatus;
  sessionId?: string | null;
  worktreePath?: string | null;
  startCommitHash?: string | null;
  sourceBranch?: string | null;
  branchName?: string | null;
  readAt?: string | null;
  lastReadIndex?: number;
  interactionMode?: InteractionMode;
  modelPreference?: ModelPreference;
  userCompleted?: boolean;
  sessionAllowedTools?: string[];
  workItemIds?: string[] | null;
  workItemUrls?: string[] | null;
  pullRequestId?: string | null;
  pullRequestUrl?: string | null;
  updatedAt?: string;
}

// Editor settings
export interface PresetEditor {
  id: string;
  label: string;
  command: string;
  appName: string; // For macOS app detection
}

export const PRESET_EDITORS: PresetEditor[] = [
  {
    id: 'vscode',
    label: 'VS Code',
    command: 'code',
    appName: 'Visual Studio Code',
  },
  { id: 'cursor', label: 'Cursor', command: 'cursor', appName: 'Cursor' },
  { id: 'zed', label: 'Zed', command: 'zed', appName: 'Zed' },
  {
    id: 'webstorm',
    label: 'WebStorm',
    command: 'webstorm',
    appName: 'WebStorm',
  },
  {
    id: 'sublime',
    label: 'Sublime Text',
    command: 'subl',
    appName: 'Sublime Text',
  },
];

export type EditorSetting =
  | { type: 'preset'; id: string }
  | { type: 'command'; command: string }
  | { type: 'app'; path: string; name: string };

// Settings validation
export interface SettingDefinition<T> {
  defaultValue: T;
  validate: (value: unknown) => value is T;
}

function isEditorSetting(v: unknown): v is EditorSetting {
  if (!v || typeof v !== 'object') return false;
  const obj = v as Record<string, unknown>;
  if (obj.type === 'preset') return typeof obj.id === 'string';
  if (obj.type === 'command') return typeof obj.command === 'string';
  if (obj.type === 'app')
    return typeof obj.path === 'string' && typeof obj.name === 'string';
  return false;
}

export const SETTINGS_DEFINITIONS = {
  editor: {
    defaultValue: { type: 'preset', id: 'vscode' } as EditorSetting,
    validate: isEditorSetting,
  },
} satisfies Record<string, SettingDefinition<unknown>>;

export type AppSettings = {
  [K in keyof typeof SETTINGS_DEFINITIONS]: (typeof SETTINGS_DEFINITIONS)[K]['defaultValue'];
};
