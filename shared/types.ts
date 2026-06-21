// Shared types used by both renderer and main process
// These are plain TypeScript types without database-specific dependencies

import type { AgentBackendType, PromptImagePart } from './agent-backend-types';
import {
  DEFAULT_OPENAI_LOGO_BASE_IMAGE_ID,
  isOpenAiLogoBaseImageId,
  type OpenAiBaseImageMode,
  type OpenAiLogoBaseImageId,
} from './openai-logo-bases';
import {
  DEFAULT_PROMPT_PREFACE_SETTING,
  isPromptPrefaceSetting,
} from './prompt-preface-types';
import type { PermissionScope } from './permission-types';
import type { ProjectPriority } from './feed-types';
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

export type ProjectType = 'local' | 'git-provider' | 'system';
export type TaskType = 'agent' | 'skill-creation' | 'feature-map';
export type TaskStatus =
  | 'running'
  | 'waiting'
  | 'completed'
  | 'errored'
  | 'interrupted';
export type InteractionMode = 'ask' | 'auto' | 'plan';

export interface TaskTodoItem {
  id: string;
  title: string;
  checked: boolean;
}

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
  codex: OPENCODE_INTERACTION_MODE_OPTIONS,
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
export type ThinkingEffort =
  | 'default'
  | 'minimal'
  | 'none'
  | 'low'
  | 'medium'
  | 'high'
  | 'max'
  | 'xhigh';

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

export interface BranchInfo {
  name: string;
  lastCommitDate: string;
}

export interface DetectedProjectLogo {
  path: string;
  label: string;
  source: 'web' | 'ios' | 'android' | 'asset';
}

export interface ProjectLogoHistoryItem {
  id: string;
  projectId: string;
  path: string;
  createdAt: string;
}

export interface ProjectFeatureMapItem {
  id: string;
  name: string;
  summary: string;
  key_files: string[];
  children: ProjectFeatureMapItem[];
}

export interface ProjectFeatureMap {
  features: ProjectFeatureMapItem[];
  generatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  type: ProjectType;
  providerId: string | null;
  remoteUrl: string | null;
  color: string;
  logoPath: string | null;
  logoSource: 'uploaded' | 'generated' | null;
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
  showWorkItemsInFeed: boolean;
  showPrsInFeed: boolean;
  autoPullSourceBranch: boolean;
  commitWithNoVerify: boolean;
  defaultAgentBackend: AgentBackendType | null; // null = use global default
  defaultAgentModelPreference: ModelPreference | null;
  completionContext: string | null;
  summary: string | null;
  aiSkillSlots: AiSkillSlotsSetting | null;
  protectedBranches: string[];
  favoriteBranches: string[];
  prPriority: ProjectPriority;
  workItemPriority: ProjectPriority;
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
  logoPath?: string | null;
  logoSource?: 'uploaded' | 'generated' | null;
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
  showWorkItemsInFeed?: boolean;
  showPrsInFeed?: boolean;
  autoPullSourceBranch?: boolean;
  commitWithNoVerify?: boolean;
  defaultAgentBackend?: AgentBackendType | null;
  defaultAgentModelPreference?: ModelPreference | null;
  completionContext?: string | null;
  summary?: string | null;
  aiSkillSlots?: AiSkillSlotsSetting | null;
  protectedBranches?: string[];
  favoriteBranches?: string[];
  prPriority?: ProjectPriority;
  workItemPriority?: ProjectPriority;
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
  logoPath?: string | null;
  logoSource?: 'uploaded' | 'generated' | null;
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
  showWorkItemsInFeed?: boolean;
  showPrsInFeed?: boolean;
  autoPullSourceBranch?: boolean;
  commitWithNoVerify?: boolean;
  defaultAgentBackend?: AgentBackendType | null;
  defaultAgentModelPreference?: ModelPreference | null;
  completionContext?: string | null;
  summary?: string | null;
  aiSkillSlots?: AiSkillSlotsSetting | null;
  protectedBranches?: string[];
  favoriteBranches?: string[];
  prPriority?: ProjectPriority;
  workItemPriority?: ProjectPriority;
  updatedAt?: string;
}

export interface Task {
  id: string;
  projectId: string;
  type: TaskType;
  name: string | null;
  prompt: string;
  status: TaskStatus;
  worktreePath: string | null;
  startCommitHash: string | null;
  sourceBranch: string | null;
  branchName: string | null;
  hasUnread: boolean;
  userCompleted: boolean;
  sessionRules: PermissionScope;
  workItemIds: string[] | null;
  workItemUrls: string[] | null;
  pullRequestId: string | null;
  pullRequestUrl: string | null;
  pendingMessage: string | null;
  todoItems: TaskTodoItem[];
  parentTaskId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewTask {
  id?: string;
  projectId: string;
  type?: TaskType;
  name?: string | null;
  prompt: string;
  /** Transient image attachments (not persisted in tasks table) */
  images?: PromptImagePart[];
  status?: TaskStatus;
  worktreePath?: string | null;
  startCommitHash?: string | null;
  sourceBranch?: string | null;
  branchName?: string | null;
  hasUnread?: boolean;
  userCompleted?: boolean;
  sessionRules?: PermissionScope;
  workItemIds?: string[] | null;
  workItemUrls?: string[] | null;
  updateWorkItemStatus?: boolean;
  pullRequestId?: string | null;
  pullRequestUrl?: string | null;
  pendingMessage?: string | null;
  todoItems?: TaskTodoItem[];
  parentTaskId?: string | null;
  createdAt?: string;
  updatedAt: string;
}

export interface UpdateTask {
  projectId?: string;
  name?: string | null;
  prompt?: string;
  status?: TaskStatus;
  worktreePath?: string | null;
  startCommitHash?: string | null;
  sourceBranch?: string | null;
  branchName?: string | null;
  hasUnread?: boolean;
  userCompleted?: boolean;
  sessionRules?: PermissionScope;
  workItemIds?: string[] | null;
  workItemUrls?: string[] | null;
  pullRequestId?: string | null;
  pullRequestUrl?: string | null;
  pendingMessage?: string | null;
  todoItems?: TaskTodoItem[];
  parentTaskId?: string | null;
  updatedAt?: string;
}

export type TaskStepStatus =
  | 'pending'
  | 'ready'
  | 'running'
  | 'completed'
  | 'errored'
  | 'interrupted';

export type TaskStepType =
  | 'agent'
  | 'create-pull-request'
  | 'fork'
  | 'pr-review'
  | 'review'
  | 'skill-creation'
  | 'feature-map';

/** Meta for `create-pull-request` steps — params + result after execution */
export interface CreatePullRequestStepMeta {
  title?: string;
  description?: string;
  targetBranch?: string;
  draft?: boolean;
  /** Set after the PR is created */
  pullRequestId?: string;
  pullRequestUrl?: string;
}

/** Meta for `fork` steps — tracks the origin of the fork */
export interface ForkStepMeta {
  forkedFromStepId: string;
  /** Snapshot of the session ID at the time of forking */
  forkedFromSessionId?: string;
}

/** Meta for `pr-review` steps — review comments parsed from agent output */
export interface PrReviewStepMeta {
  pullRequestId: number;
  projectId: string;
  comments: Array<{
    filePath: string;
    lineNumber: number;
    comment: string;
    enabled: boolean;
  }>;
  parseError?: string;
  submissionError?: string;
  submittedAt?: string;
  submittedCount?: number;
}

/** Config for a single reviewer in a review step */
export interface ReviewerConfig {
  id: string;
  label: string;
  focusPrompt: string;
  backend: AgentBackendType;
  model?: ModelPreference;
  thinkingEffort?: ThinkingEffort;
}

/** Meta for `review` steps — single agent session using MCP tools for parallel review */
export interface ReviewStepMeta {
  reviewers: ReviewerConfig[];
  /** Work item context injected into reviewer prompts (e.g. from PR-linked work items) */
  workItemContext?: string;
}

/** Meta for skill-creation steps — workspace and publish tracking */
export interface SkillCreationStepMeta {
  /** Whether this is a new skill or improving an existing one */
  mode: 'create' | 'improve';
  /** Absolute path to the task workspace dir */
  workspacePath: string;
  /** Absolute path to the original skill (for 'improve' mode) */
  sourceSkillPath?: string;
  /** Backends to enable when publishing */
  enabledBackends: AgentBackendType[];
  /** Whether the skill has been published from this workspace */
  published?: boolean;
}

export interface FeatureMapStepMeta {
  projectId: string;
  projectPath: string;
  tempDir: string;
  tempFilePath: string;
  savedFilePath: string;
  saved?: boolean;
}

export type TaskStepMeta =
  | CreatePullRequestStepMeta
  | ForkStepMeta
  | PrReviewStepMeta
  | ReviewStepMeta
  | SkillCreationStepMeta
  | FeatureMapStepMeta
  | Record<string, never>;

/** Type guard for SkillCreationStepMeta */
export function isSkillCreationStepMeta(
  meta: TaskStepMeta | null | undefined,
): meta is SkillCreationStepMeta {
  if (!meta) return false;
  const m = meta as SkillCreationStepMeta;
  return (
    typeof m.workspacePath === 'string' &&
    (m.mode === 'create' || m.mode === 'improve') &&
    Array.isArray(m.enabledBackends)
  );
}

export function isFeatureMapStepMeta(
  meta: TaskStepMeta | null | undefined,
): meta is FeatureMapStepMeta {
  if (!meta) return false;
  const m = meta as FeatureMapStepMeta;
  return (
    typeof m.projectId === 'string' &&
    typeof m.projectPath === 'string' &&
    typeof m.tempDir === 'string' &&
    typeof m.tempFilePath === 'string' &&
    typeof m.savedFilePath === 'string'
  );
}

export interface TaskStep {
  id: string;
  taskId: string;
  name: string;
  type: TaskStepType;
  dependsOn: string[];
  promptTemplate: string;
  resolvedPrompt: string | null;
  status: TaskStepStatus;
  sessionId: string | null;
  interactionMode: InteractionMode | null;
  modelPreference: ModelPreference | null;
  thinkingEffort: ThinkingEffort | null;
  agentBackend: AgentBackendType | null;
  output: string | null;
  images: PromptImagePart[] | null;
  meta: TaskStepMeta;
  autoStart: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface NewTaskStep {
  id?: string;
  taskId: string;
  name: string;
  type?: TaskStepType;
  dependsOn?: string[];
  promptTemplate: string;
  interactionMode?: InteractionMode | null;
  modelPreference?: ModelPreference | null;
  thinkingEffort?: ThinkingEffort | null;
  agentBackend?: AgentBackendType | null;
  images?: PromptImagePart[] | null;
  meta?: TaskStepMeta;
  autoStart?: boolean;
  sortOrder?: number;
}

export interface UpdateTaskStep {
  name?: string;
  type?: TaskStepType;
  dependsOn?: string[];
  promptTemplate?: string;
  resolvedPrompt?: string | null;
  status?: TaskStepStatus;
  sessionId?: string | null;
  interactionMode?: InteractionMode | null;
  modelPreference?: ModelPreference | null;
  thinkingEffort?: ThinkingEffort | null;
  agentBackend?: AgentBackendType | null;
  output?: string | null;
  images?: PromptImagePart[] | null;
  meta?: TaskStepMeta;
  autoStart?: boolean;
  sortOrder?: number;
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
  copilotToken?: string;
}

export interface AppearanceSetting {
  reduceMotion: boolean;
}

export interface SummaryModelsSetting {
  models: Record<AgentBackendType, ModelPreference>;
}

export interface BackendDefaultModelsSetting {
  models: Record<AgentBackendType, ModelPreference>;
}

export type OpenCodeProcessMode = 'standalone' | 'shared';

export interface OpenCodeProcessSetting {
  mode: OpenCodeProcessMode;
}

export interface RateLimitSwapEntry {
  backend: AgentBackendType;
  model?: ModelPreference;
  thinkingEffort?: ThinkingEffort;
  presetId?: string | null;
  threshold?: number; // 0-1, omit on last entry (absolute fallback)
}

export interface RateLimitSwapSetting {
  enabled: boolean;
  chain: RateLimitSwapEntry[];
}

export interface EditorAutomationSetting {
  closeWindowsOnTaskCompletion: boolean;
}

export interface RawMessageCleanupSetting {
  enabled: boolean;
  retentionHours: number;
}

export interface ThinkingSettingsSetting {
  efforts: Record<AgentBackendType, Record<string, ThinkingEffort>>;
  selectedModels?: Record<AgentBackendType, ModelPreference>;
}

export interface BackendModelPreset {
  id: string;
  name: string;
  backend: AgentBackendType;
  model: ModelPreference;
  thinkingEffort?: ThinkingEffort | null;
}

export type BackendModelPresetsSetting = BackendModelPreset[];

export type TaskNotificationEvent =
  | 'completed'
  | 'permission-required'
  | 'question'
  | 'errored';

export type TaskNotificationMode = 'disabled' | 'background' | 'always';

export interface TaskEventNotificationsSetting {
  modes: Record<TaskNotificationEvent, TaskNotificationMode>;
}

export const DEFAULT_TASK_NOTIFICATION_MODES: Record<
  TaskNotificationEvent,
  TaskNotificationMode
> = {
  completed: 'background',
  'permission-required': 'background',
  question: 'background',
  errored: 'background',
};

export interface CalendarNotificationsSetting {
  enabled: boolean;
  leadTimeMinutes: number;
  showStartWindow: boolean;
  meetingJoinTarget: import('./teams-url').TeamsMeetingJoinTarget;
}

export const DEFAULT_CALENDAR_NOTIFICATION_LEAD_TIME_MINUTES = 5;

export interface AiSkillSlotConfig {
  backend: AgentBackendType;
  model: string;
  thinkingEffort?: ThinkingEffort;
  skillName: string | null; // null = built-in default prompt
}

export const DEFAULT_PROJECT_FEATURE_MAP_SLOT: AiSkillSlotConfig = {
  backend: 'claude-code',
  model: 'haiku',
  thinkingEffort: 'default',
  skillName: 'project-feature-mapping',
};

export interface AiGenerationSetting {
  openAiApiKey: string; // Stored encrypted
  openAiImageGenerationEnabled?: boolean;
  openAiImageModel?: string;
  openAiLogoPromptContext?: string;
  openAiBaseImageMode?: OpenAiBaseImageMode;
  openAiBaseImageBuiltin?: OpenAiLogoBaseImageId;
  openAiBaseImagePath?: string | null;
  openAiBaseImageName?: string | null;
}

export function isOpenAiImageModel(model: string): boolean {
  return model.trim().startsWith('gpt-image');
}

export type AiSkillSlotKey =
  | 'merge-commit-message'
  | 'commit-message'
  | 'pr-description'
  | 'task-name'
  | 'verification-note'
  | 'project-summary'
  | 'project-feature-map'
  | 'logo-generation';
export type AiSkillSlotsSetting = Partial<
  Record<AiSkillSlotKey, AiSkillSlotConfig>
>;

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

const VALID_BACKENDS: AgentBackendType[] = ['claude-code', 'opencode', 'codex'];

function isCompletionSetting(v: unknown): v is CompletionSetting {
  if (!v || typeof v !== 'object') return false;
  const obj = v as Record<string, unknown>;
  if (typeof obj.enabled !== 'boolean') return false;
  if (typeof obj.apiKey !== 'string') return false;
  if (typeof obj.model !== 'string') return false;
  if (typeof obj.serverUrl !== 'string') return false;
  return true;
}

function isAiGenerationSetting(v: unknown): v is AiGenerationSetting {
  if (!v || typeof v !== 'object') return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj.openAiApiKey === 'string' &&
    (obj.openAiImageGenerationEnabled === undefined ||
      typeof obj.openAiImageGenerationEnabled === 'boolean') &&
    (obj.openAiImageModel === undefined ||
      (typeof obj.openAiImageModel === 'string' &&
        isOpenAiImageModel(obj.openAiImageModel))) &&
    (obj.openAiLogoPromptContext === undefined ||
      typeof obj.openAiLogoPromptContext === 'string') &&
    (obj.openAiBaseImageMode === undefined ||
      obj.openAiBaseImageMode === 'builtin' ||
      obj.openAiBaseImageMode === 'custom') &&
    (obj.openAiBaseImageBuiltin === undefined ||
      isOpenAiLogoBaseImageId(obj.openAiBaseImageBuiltin)) &&
    (obj.openAiBaseImagePath === undefined ||
      obj.openAiBaseImagePath === null ||
      typeof obj.openAiBaseImagePath === 'string') &&
    (obj.openAiBaseImageName === undefined ||
      obj.openAiBaseImageName === null ||
      typeof obj.openAiBaseImageName === 'string')
  );
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

const VALID_USAGE_PROVIDERS: UsageProviderType[] = [
  'claude-code',
  'codex',
  'gemini',
  'copilot',
];

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
  if (obj.copilotToken !== undefined && typeof obj.copilotToken !== 'string')
    return false;
  return true;
}

function isAppearanceSetting(v: unknown): v is AppearanceSetting {
  if (!v || typeof v !== 'object') return false;
  const obj = v as Record<string, unknown>;
  return typeof obj.reduceMotion === 'boolean';
}

function isSummaryModelsSetting(v: unknown): v is SummaryModelsSetting {
  if (!v || typeof v !== 'object') return false;
  const obj = v as Record<string, unknown>;
  if (!obj.models || typeof obj.models !== 'object') return false;
  const models = obj.models as Record<string, unknown>;
  return VALID_BACKENDS.every((backend) => typeof models[backend] === 'string');
}

function isBackendDefaultModelsSetting(
  v: unknown,
): v is BackendDefaultModelsSetting {
  if (!v || typeof v !== 'object') return false;
  const obj = v as Record<string, unknown>;
  if (!obj.models || typeof obj.models !== 'object') return false;
  const models = obj.models as Record<string, unknown>;
  return VALID_BACKENDS.every((backend) => typeof models[backend] === 'string');
}

function isOpenCodeProcessSetting(v: unknown): v is OpenCodeProcessSetting {
  if (!v || typeof v !== 'object') return false;
  const obj = v as Record<string, unknown>;
  return obj.mode === 'standalone' || obj.mode === 'shared';
}

function isRateLimitSwapSetting(value: unknown): value is RateLimitSwapSetting {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.enabled !== 'boolean' || !Array.isArray(v.chain)) return false;

  return v.chain.every((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const obj = entry as Record<string, unknown>;
    return (
      typeof obj.backend === 'string' &&
      VALID_BACKENDS.includes(obj.backend as AgentBackendType) &&
      (obj.model === undefined || typeof obj.model === 'string') &&
      (obj.thinkingEffort === undefined ||
        VALID_THINKING_EFFORTS.includes(
          obj.thinkingEffort as ThinkingEffort,
        )) &&
      (obj.presetId === undefined ||
        obj.presetId === null ||
        typeof obj.presetId === 'string') &&
      (obj.threshold === undefined ||
        (typeof obj.threshold === 'number' &&
          obj.threshold >= 0 &&
          obj.threshold <= 1))
    );
  });
}

function isEditorAutomationSetting(v: unknown): v is EditorAutomationSetting {
  if (!v || typeof v !== 'object') return false;
  const obj = v as Record<string, unknown>;
  return typeof obj.closeWindowsOnTaskCompletion === 'boolean';
}

function isRawMessageCleanupSetting(v: unknown): v is RawMessageCleanupSetting {
  if (!v || typeof v !== 'object') return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj.enabled === 'boolean' &&
    typeof obj.retentionHours === 'number' &&
    Number.isFinite(obj.retentionHours) &&
    obj.retentionHours >= 1
  );
}

const VALID_THINKING_EFFORTS: ThinkingEffort[] = [
  'default',
  'minimal',
  'none',
  'low',
  'medium',
  'high',
  'max',
  'xhigh',
];

function isThinkingSettingsSetting(v: unknown): v is ThinkingSettingsSetting {
  if (!v || typeof v !== 'object') return false;
  const obj = v as Record<string, unknown>;
  if (!obj.efforts || typeof obj.efforts !== 'object') return false;
  const efforts = obj.efforts as Record<string, unknown>;
  if (obj.selectedModels !== undefined) {
    if (!obj.selectedModels || typeof obj.selectedModels !== 'object') {
      return false;
    }
    const selectedModels = obj.selectedModels as Record<string, unknown>;
    if (
      !VALID_BACKENDS.every(
        (backend) => typeof selectedModels[backend] === 'string',
      )
    ) {
      return false;
    }
  }
  return VALID_BACKENDS.every((backend) => {
    const backendEfforts = efforts[backend];
    if (!backendEfforts || typeof backendEfforts !== 'object') return false;
    return Object.values(backendEfforts as Record<string, unknown>).every(
      (effort) => VALID_THINKING_EFFORTS.includes(effort as ThinkingEffort),
    );
  });
}

function isBackendModelPresetsSetting(
  v: unknown,
): v is BackendModelPresetsSetting {
  if (!Array.isArray(v)) return false;

  return v.every((preset) => {
    if (!preset || typeof preset !== 'object') return false;

    const obj = preset as Record<string, unknown>;

    return (
      typeof obj.id === 'string' &&
      typeof obj.name === 'string' &&
      typeof obj.model === 'string' &&
      typeof obj.backend === 'string' &&
      VALID_BACKENDS.includes(obj.backend as AgentBackendType) &&
      (obj.thinkingEffort === undefined ||
        obj.thinkingEffort === null ||
        VALID_THINKING_EFFORTS.includes(obj.thinkingEffort as ThinkingEffort))
    );
  });
}

const VALID_TASK_NOTIFICATION_EVENTS: TaskNotificationEvent[] = [
  'completed',
  'permission-required',
  'question',
  'errored',
];

const VALID_TASK_NOTIFICATION_MODES: TaskNotificationMode[] = [
  'disabled',
  'background',
  'always',
];

function isTaskEventNotificationsSetting(
  v: unknown,
): v is TaskEventNotificationsSetting {
  if (!v || typeof v !== 'object') return false;
  const obj = v as Record<string, unknown>;
  if (!obj.modes || typeof obj.modes !== 'object') return false;
  const modes = obj.modes as Record<string, unknown>;
  return VALID_TASK_NOTIFICATION_EVENTS.every((event) =>
    VALID_TASK_NOTIFICATION_MODES.includes(
      modes[event] as TaskNotificationMode,
    ),
  );
}

function isCalendarNotificationsSetting(
  v: unknown,
): v is CalendarNotificationsSetting {
  if (!v || typeof v !== 'object') return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj.enabled === 'boolean' &&
    typeof obj.showStartWindow === 'boolean' &&
    (obj.meetingJoinTarget === 'web' || obj.meetingJoinTarget === 'app') &&
    typeof obj.leadTimeMinutes === 'number' &&
    Number.isInteger(obj.leadTimeMinutes) &&
    obj.leadTimeMinutes >= 1 &&
    obj.leadTimeMinutes <= 60
  );
}

const VALID_SLOT_KEYS: AiSkillSlotKey[] = [
  'merge-commit-message',
  'commit-message',
  'pr-description',
  'task-name',
  'verification-note',
  'project-summary',
  'project-feature-map',
  'logo-generation',
];

/** Note: returns true for `{}` (empty object) — this is intentional as it represents "no slots configured". */
export function isAiSkillSlotsSetting(v: unknown): v is AiSkillSlotsSetting {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const obj = v as Record<string, unknown>;
  return Object.entries(obj).every(([key, slot]) => {
    if (!VALID_SLOT_KEYS.includes(key as AiSkillSlotKey)) return false;
    if (!slot || typeof slot !== 'object') return false;
    const s = slot as Record<string, unknown>;
    if (typeof s.backend !== 'string') return false;
    if (!VALID_BACKENDS.includes(s.backend as AgentBackendType)) return false;
    if (typeof s.model !== 'string') return false;
    if (
      s.thinkingEffort !== undefined &&
      !VALID_THINKING_EFFORTS.includes(s.thinkingEffort as ThinkingEffort)
    )
      return false;
    if (s.skillName !== null && typeof s.skillName !== 'string') return false;
    return true;
  });
}

// Prompt Snippets
export type PromptSnippetContext = {
  newTask: boolean;
  newTaskStep: boolean;
};

export type PromptSnippetAutocomplete = {
  enabled: boolean;
  slugs: string[];
};

export type PromptSnippet = {
  id: string;
  name: string;
  description: string;
  template: string;
  enabled: boolean;
  contexts: PromptSnippetContext;
  autocomplete: PromptSnippetAutocomplete;
};

export type PromptSnippetsSetting = PromptSnippet[];

export function migratePromptSnippet(
  raw: Record<string, unknown>,
): PromptSnippet {
  // If already has 'contexts' field, assume new format
  if (raw.contexts && typeof raw.contexts === 'object') {
    return raw as unknown as PromptSnippet;
  }
  // Migrate from old format
  return {
    id: (raw.id as string) ?? crypto.randomUUID(),
    name: (raw.name as string) ?? '',
    description: (raw.description as string) ?? '',
    template: (raw.template as string) ?? '',
    enabled: (raw.enabled as boolean) ?? true,
    contexts: { newTask: true, newTaskStep: true },
    autocomplete: {
      enabled: true,
      slugs: raw.trigger ? [raw.trigger as string] : [],
    },
  };
}

function isPromptSnippetsSetting(
  value: unknown,
): value is PromptSnippetsSetting {
  if (!Array.isArray(value)) return false;
  return value.every(
    (item) =>
      typeof item === 'object' &&
      item !== null &&
      typeof item.id === 'string' &&
      typeof item.name === 'string' &&
      typeof item.description === 'string' &&
      typeof item.template === 'string' &&
      typeof item.enabled === 'boolean' &&
      typeof item.contexts === 'object' &&
      item.contexts !== null &&
      typeof item.contexts.newTask === 'boolean' &&
      typeof item.contexts.newTaskStep === 'boolean' &&
      typeof item.autocomplete === 'object' &&
      item.autocomplete !== null &&
      typeof item.autocomplete.enabled === 'boolean' &&
      Array.isArray(item.autocomplete.slugs),
  );
}

export type WorkActivitySetting = { enabled: boolean };

function isWorkActivitySetting(value: unknown): value is WorkActivitySetting {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>).enabled === 'boolean'
  );
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
      copilotToken: '',
    } as UsageDisplaySetting,
    validate: isUsageDisplaySetting,
  },
  appearance: {
    defaultValue: {
      reduceMotion: true,
    } as AppearanceSetting,
    validate: isAppearanceSetting,
  },
  summaryModels: {
    defaultValue: {
      models: {
        'claude-code': 'haiku',
        opencode: 'default',
        codex: 'default',
      },
    } as SummaryModelsSetting,
    validate: isSummaryModelsSetting,
  },
  backendDefaultModels: {
    defaultValue: {
      models: {
        'claude-code': 'default',
        opencode: 'default',
        codex: 'default',
      },
    } as BackendDefaultModelsSetting,
    validate: isBackendDefaultModelsSetting,
  },
  opencodeProcess: {
    defaultValue: {
      mode: 'standalone',
    } as OpenCodeProcessSetting,
    validate: isOpenCodeProcessSetting,
  },
  rateLimitSwap: {
    defaultValue: {
      enabled: false,
      chain: [],
    } as RateLimitSwapSetting,
    validate: isRateLimitSwapSetting,
  },
  editorAutomation: {
    defaultValue: {
      closeWindowsOnTaskCompletion: false,
    } as EditorAutomationSetting,
    validate: isEditorAutomationSetting,
  },
  rawMessageCleanup: {
    defaultValue: {
      enabled: true,
      retentionHours: 24,
    } as RawMessageCleanupSetting,
    validate: isRawMessageCleanupSetting,
  },
  thinkingSettings: {
    defaultValue: {
      efforts: {
        'claude-code': { default: 'default' },
        opencode: { default: 'default' },
        codex: { default: 'default' },
      },
      selectedModels: {
        'claude-code': 'default',
        opencode: 'default',
        codex: 'default',
      },
    } as ThinkingSettingsSetting,
    validate: isThinkingSettingsSetting,
  },
  backendModelPresets: {
    defaultValue: [] as BackendModelPresetsSetting,
    validate: isBackendModelPresetsSetting,
  },
  taskEventNotifications: {
    defaultValue: {
      modes: DEFAULT_TASK_NOTIFICATION_MODES,
    } as TaskEventNotificationsSetting,
    validate: isTaskEventNotificationsSetting,
  },
  calendarNotifications: {
    defaultValue: {
      enabled: false,
      leadTimeMinutes: DEFAULT_CALENDAR_NOTIFICATION_LEAD_TIME_MINUTES,
      showStartWindow: false,
      meetingJoinTarget: 'web',
    } as CalendarNotificationsSetting,
    validate: isCalendarNotificationsSetting,
  },
  aiSkillSlots: {
    defaultValue: {
      'project-feature-map': DEFAULT_PROJECT_FEATURE_MAP_SLOT,
    } as AiSkillSlotsSetting,
    validate: isAiSkillSlotsSetting,
  },
  aiGeneration: {
    defaultValue: {
      openAiApiKey: '',
      openAiImageGenerationEnabled: false,
      openAiImageModel: 'gpt-image-2',
      openAiLogoPromptContext: '',
      openAiBaseImageMode: 'builtin',
      openAiBaseImageBuiltin: DEFAULT_OPENAI_LOGO_BASE_IMAGE_ID,
      openAiBaseImagePath: null,
      openAiBaseImageName: null,
    } as AiGenerationSetting,
    validate: isAiGenerationSetting,
  },
  promptSnippets: {
    defaultValue: [] as PromptSnippetsSetting,
    validate: isPromptSnippetsSetting,
  },
  promptPreface: {
    defaultValue: DEFAULT_PROMPT_PREFACE_SETTING,
    validate: isPromptPrefaceSetting,
  },
  workActivity: {
    defaultValue: { enabled: true } as WorkActivitySetting,
    validate: isWorkActivitySetting,
  },
} satisfies Record<string, SettingDefinition<unknown>>;

export type {
  PromptPrefaceSetting,
  ProjectPromptPrefaceSetting,
} from './prompt-preface-types';

export type AppSettings = {
  [K in keyof typeof SETTINGS_DEFINITIONS]: (typeof SETTINGS_DEFINITIONS)[K]['defaultValue'];
};
