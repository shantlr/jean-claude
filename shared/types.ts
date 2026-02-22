// Shared types used by both renderer and main process
// These are plain TypeScript types without database-specific dependencies

import type { AgentBackendType } from './agent-backend-types';
import type { UsageProviderType } from './usage-types';

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

export interface BackendInteractionModeOption {
  value: InteractionMode;
  label: string;
  description: string;
}

const CLAUDE_CODE_INTERACTION_MODE_OPTIONS = [
  {
    value: 'ask',
    label: 'Ask',
    description: 'All tools require approval',
  },
  {
    value: 'auto',
    label: 'Auto',
    description: 'All tools auto-approved',
  },
  {
    value: 'plan',
    label: 'Plan',
    description: 'Planning only, no execution',
  },
] as const satisfies readonly BackendInteractionModeOption[];

const OPENCODE_INTERACTION_MODE_OPTIONS = [
  {
    value: 'auto',
    label: 'Build',
    description: 'Default coding agent with full tools',
  },
  {
    value: 'plan',
    label: 'Plan',
    description: 'Planning agent with restricted edits/bash',
  },
] as const satisfies readonly BackendInteractionModeOption[];

export const BACKEND_INTERACTION_MODE_OPTIONS: Record<
  AgentBackendType,
  readonly BackendInteractionModeOption[]
> = {
  'claude-code': CLAUDE_CODE_INTERACTION_MODE_OPTIONS,
  opencode: OPENCODE_INTERACTION_MODE_OPTIONS,
};

export function getInteractionModeOptions({
  backend,
}: {
  backend: AgentBackendType;
}): readonly BackendInteractionModeOption[] {
  return BACKEND_INTERACTION_MODE_OPTIONS[backend];
}

export function isInteractionModeSupportedByBackend({
  backend,
  mode,
}: {
  backend: AgentBackendType;
  mode: InteractionMode;
}): boolean {
  return getInteractionModeOptions({ backend }).some(
    (option) => option.value === mode,
  );
}

export function getDefaultInteractionModeForBackend({
  backend,
}: {
  backend: AgentBackendType;
}): InteractionMode {
  return getInteractionModeOptions({ backend })[0]?.value ?? 'ask';
}

export function normalizeInteractionModeForBackend({
  backend,
  mode,
}: {
  backend: AgentBackendType;
  mode: InteractionMode;
}): InteractionMode {
  if (isInteractionModeSupportedByBackend({ backend, mode })) {
    return mode;
  }

  return getDefaultInteractionModeForBackend({ backend });
}

// 'default' means use the backend's default model.
// Other values are backend-specific model identifiers (e.g. 'sonnet', 'openai/gpt-5.1-codex').
export type ModelPreference = 'default' | (string & {});

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
  defaultAgentBackend: AgentBackendType | null; // null = use global default
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
  defaultAgentBackend?: AgentBackendType | null;
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
  defaultAgentBackend?: AgentBackendType | null;
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
  hasUnread: boolean;
  interactionMode: InteractionMode;
  modelPreference: ModelPreference;
  userCompleted: boolean;
  sessionAllowedTools: string[];
  workItemIds: string[] | null;
  workItemUrls: string[] | null;
  pullRequestId: string | null;
  pullRequestUrl: string | null;
  pendingMessage: string | null;
  agentBackend: AgentBackendType;
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
  hasUnread?: boolean;
  interactionMode?: InteractionMode;
  modelPreference?: ModelPreference;
  userCompleted?: boolean;
  sessionAllowedTools?: string[];
  workItemIds?: string[] | null;
  workItemUrls?: string[] | null;
  pullRequestId?: string | null;
  pullRequestUrl?: string | null;
  pendingMessage?: string | null;
  agentBackend?: AgentBackendType;
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
  hasUnread?: boolean;
  interactionMode?: InteractionMode;
  modelPreference?: ModelPreference;
  userCompleted?: boolean;
  sessionAllowedTools?: string[];
  workItemIds?: string[] | null;
  workItemUrls?: string[] | null;
  pullRequestId?: string | null;
  pullRequestUrl?: string | null;
  pendingMessage?: string | null;
  agentBackend?: AgentBackendType;
  updatedAt?: string;
}

export interface ProjectTodo {
  id: string;
  projectId: string;
  content: string;
  sortOrder: number;
  createdAt: string;
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

// Backend settings
export interface BackendsSetting {
  enabledBackends: AgentBackendType[];
  defaultBackend: AgentBackendType;
}

// Completion settings (Mistral FIM autocomplete)
export interface CompletionSetting {
  enabled: boolean;
  apiKey: string; // Stored encrypted
  model: string;
  serverUrl: string; // Mistral server URL override (default: codestral.mistral.ai)
}

export interface UsageDisplaySetting {
  enabledProviders: UsageProviderType[];
}

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

const VALID_BACKENDS: AgentBackendType[] = ['claude-code', 'opencode'];

function isCompletionSetting(v: unknown): v is CompletionSetting {
  if (!v || typeof v !== 'object') return false;
  const obj = v as Record<string, unknown>;
  if (typeof obj.enabled !== 'boolean') return false;
  if (typeof obj.apiKey !== 'string') return false;
  if (typeof obj.model !== 'string') return false;
  if (typeof obj.serverUrl !== 'string') return false;
  return true;
}

function isBackendsSetting(v: unknown): v is BackendsSetting {
  if (!v || typeof v !== 'object') return false;
  const obj = v as Record<string, unknown>;
  if (!Array.isArray(obj.enabledBackends)) return false;
  if (
    !obj.enabledBackends.every((b: unknown) =>
      VALID_BACKENDS.includes(b as AgentBackendType),
    )
  )
    return false;
  if (obj.enabledBackends.length === 0) return false;
  if (typeof obj.defaultBackend !== 'string') return false;
  if (!VALID_BACKENDS.includes(obj.defaultBackend as AgentBackendType))
    return false;
  return true;
}

const VALID_USAGE_PROVIDERS: UsageProviderType[] = ['claude-code', 'codex'];

function isUsageDisplaySetting(v: unknown): v is UsageDisplaySetting {
  if (!v || typeof v !== 'object') return false;
  const obj = v as Record<string, unknown>;
  if (!Array.isArray(obj.enabledProviders)) return false;
  if (
    !obj.enabledProviders.every((b: unknown) =>
      VALID_USAGE_PROVIDERS.includes(b as UsageProviderType),
    )
  )
    return false;
  return true;
}

export const SETTINGS_DEFINITIONS = {
  editor: {
    defaultValue: { type: 'preset', id: 'vscode' } as EditorSetting,
    validate: isEditorSetting,
  },
  backends: {
    defaultValue: {
      enabledBackends: ['claude-code'],
      defaultBackend: 'claude-code',
    } as BackendsSetting,
    validate: isBackendsSetting,
  },
  completion: {
    defaultValue: {
      enabled: false,
      apiKey: '',
      model: 'codestral-latest',
      serverUrl: '',
    } as CompletionSetting,
    validate: isCompletionSetting,
  },
  usageDisplay: {
    defaultValue: {
      enabledProviders: [],
    } as UsageDisplaySetting,
    validate: isUsageDisplaySetting,
  },
} satisfies Record<string, SettingDefinition<unknown>>;

export type AppSettings = {
  [K in keyof typeof SETTINGS_DEFINITIONS]: (typeof SETTINGS_DEFINITIONS)[K]['defaultValue'];
};
